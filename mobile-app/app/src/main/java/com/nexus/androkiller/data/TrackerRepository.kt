package com.nexus.androkiller.data

import android.content.Context
import android.net.Uri
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.SetOptions
import com.google.firebase.storage.FirebaseStorage
import com.google.firebase.firestore.Query
import com.nexus.androkiller.model.CommandMessage
import com.nexus.androkiller.model.FamilyMessage
import com.nexus.androkiller.model.LocationData
import com.nexus.androkiller.model.MediaRecord
import com.nexus.androkiller.model.SystemStatus
import com.nexus.androkiller.model.UsageLog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.io.File
import java.util.Date
import java.util.UUID

/**
 * Repository encapsulating local-to-cloud communication with Google Firebase.
 * Handles Firestore telemetry persistence, remote command listeners,
 * and Cloud Storage media streaming.
 */
class TrackerRepository(private val context: Context) {

    private val isFirebaseAvailable: Boolean
        get() = try {
            FirebaseApp.getApps(context).isNotEmpty()
        } catch (_: Exception) {
            false
        }

    val storageManager = FreeStorageManager(context)

    private val firestore: FirebaseFirestore?
        get() = if (isFirebaseAvailable) {
            try {
                FirebaseFirestore.getInstance()
            } catch (e: Exception) {
                Log.w(TAG, "Firestore initialization fallback: ${e.message}")
                null
            }
        } else null

    private val storage: FirebaseStorage?
        get() = if (isFirebaseAvailable) {
            try {
                FirebaseStorage.getInstance()
            } catch (e: Exception) {
                Log.w(TAG, "Firebase Storage initialization fallback: ${e.message}")
                null
            }
        } else null

    init {
        // Enable local offline persistence and cache
        if (isFirebaseAvailable) {
            try {
                val db = FirebaseFirestore.getInstance()
                val settings = com.google.firebase.firestore.FirebaseFirestoreSettings.Builder()
                    .setPersistenceEnabled(true)
                    .build()
                db.firestoreSettings = settings
            } catch (e: Exception) {
                Log.w(TAG, "Error configuring firestore persistence: ${e.message}")
            }

            // Listen to remote storage configuration (e.g. set from web dashboard)
            try {
                FirebaseFirestore.getInstance().collection("config").document("storage")
                    .addSnapshotListener { snapshot, e ->
                        if (e != null) {
                            Log.w(TAG, "Storage config listener error: ${e.message}")
                            return@addSnapshotListener
                        }
                        if (snapshot != null && snapshot.exists()) {
                            val providerStr = snapshot.getString("provider") ?: "INLINE"
                            val provider = try {
                                StorageProvider.valueOf(providerStr)
                            } catch (_: Exception) {
                                StorageProvider.INLINE
                            }
                            storageManager.updateConfig(
                                StorageConfig(
                                    provider = provider,
                                    cloudinaryCloudName = snapshot.getString("cloudinaryCloudName") ?: "",
                                    cloudinaryUploadPreset = snapshot.getString("cloudinaryUploadPreset") ?: "",
                                    supabaseUrl = snapshot.getString("supabaseUrl") ?: "",
                                    supabaseAnonKey = snapshot.getString("supabaseAnonKey") ?: "",
                                    supabaseBucket = snapshot.getString("supabaseBucket") ?: "media"
                                )
                            )
                        }
                    }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to register storage config listener: ${e.message}")
            }
        }
    }

    /**
     * Push real-time LocationData upwards to Firestore.
     * Updates both the latest device snapshot and historical location trail.
     */
    suspend fun pushLocationData(locationData: LocationData): Result<Unit> = withContext(Dispatchers.IO) {
        val db = firestore ?: return@withContext Result.failure(IllegalStateException("Firebase is not configured"))
        try {
            val locationPayload = hashMapOf(
                "deviceId" to locationData.deviceId,
                "latitude" to locationData.latitude,
                "longitude" to locationData.longitude,
                "altitude" to locationData.altitude,
                "accuracy" to locationData.accuracy,
                "speed" to locationData.speed,
                "bearing" to locationData.bearing,
                "batteryLevel" to locationData.batteryLevel,
                "isCharging" to locationData.isCharging,
                "timestamp" to FieldValue.serverTimestamp()
            )

            // 1. Add to historical location trail
            db.collection("devices")
                .document(locationData.deviceId)
                .collection("locations")
                .add(locationPayload)
                .await()

            // 2. Update device summary document
            db.collection("devices")
                .document(locationData.deviceId)
                .set(
                    mapOf(
                        "deviceId" to locationData.deviceId,
                        "lastLocation" to locationPayload,
                        "lastSeen" to FieldValue.serverTimestamp()
                    ),
                    SetOptions.merge()
                )
                .await()

            Log.d(TAG, "Location pushed successfully for device ${locationData.deviceId}")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Error pushing location to Firestore: ${e.message}", e)
            Result.failure(e)
        }
    }

    /**
     * Update device system status and health markers.
     */
    suspend fun updateSystemStatus(status: SystemStatus): Result<Unit> = withContext(Dispatchers.IO) {
        val db = firestore ?: return@withContext Result.failure(IllegalStateException("Firebase is not configured"))
        try {
            val statusMap = hashMapOf(
                "deviceId" to status.deviceId,
                "deviceName" to status.deviceName,
                "manufacturer" to status.manufacturer,
                "model" to status.model,
                "osVersion" to status.osVersion,
                "batteryLevel" to status.batteryLevel,
                "isCharging" to status.isCharging,
                "isOnline" to status.isOnline,
                "monitoringActive" to status.monitoringActive,
                "updateIntervalSeconds" to status.updateIntervalSeconds,
                "permissions" to status.permissions,
                "storageInfo" to hashMapOf(
                    "totalStorageGB" to status.storageInfo.totalStorageGB,
                    "usedStorageGB" to status.storageInfo.usedStorageGB,
                    "freeStorageGB" to status.storageInfo.freeStorageGB,
                    "storagePercentUsed" to status.storageInfo.storagePercentUsed,
                    "totalRamGB" to status.storageInfo.totalRamGB,
                    "freeRamGB" to status.storageInfo.freeRamGB
                ),
                "guardianPhoneNumber" to status.guardianPhoneNumber,
                "lastSeen" to FieldValue.serverTimestamp()
            )

            db.collection("devices")
                .document(status.deviceId)
                .set(statusMap, SetOptions.merge())
                .await()

            Log.d(TAG, "System status updated for ${status.deviceId}")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Error updating system status: ${e.message}", e)
            Result.failure(e)
        }
    }

    /**
     * Push diagnostic / audit logs to Firestore.
     */
    suspend fun pushLog(log: UsageLog): Result<Unit> = withContext(Dispatchers.IO) {
        val db = firestore ?: return@withContext Result.failure(IllegalStateException("Firebase is not configured"))
        try {
            val logMap = hashMapOf(
                "deviceId" to log.deviceId,
                "eventType" to log.eventType,
                "message" to log.message,
                "level" to log.level,
                "timestamp" to FieldValue.serverTimestamp()
            )

            db.collection("devices")
                .document(log.deviceId)
                .collection("logs")
                .add(logMap)
                .await()

            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Error pushing log: ${e.message}", e)
            Result.failure(e)
        }
    }

    /**
     * Upload local media buffer (audio or camera snapshot) using the active free storage provider
     * (Inline Firestore Data URI, Cloudinary 25GB Free, or Supabase 1GB Free) and persist metadata to Firestore.
     */
    suspend fun uploadMediaFile(
        file: File,
        type: String, // "IMAGE" or "AUDIO"
        deviceId: String,
        durationSeconds: Int = 0
    ): Result<MediaRecord> = withContext(Dispatchers.IO) {
        val db = firestore ?: return@withContext Result.failure(IllegalStateException("Firestore is not configured"))

        try {
            var downloadUrl: String? = null
            val isScreenshot = type.equals("SCREENSHOT", ignoreCase = true)
            val isImage = type.equals("IMAGE", ignoreCase = true) || isScreenshot
            val folder = if (isScreenshot) "screenshots" else if (isImage) "camera" else "audio"
            var storagePath = "devices/$deviceId/$folder/${file.name}"
            var providerName = "FREE_INLINE"

            // 1. Try Firebase Storage only if user explicitly configured it
            if (storageManager.getConfig().provider == StorageProvider.FIREBASE && storage != null) {
                try {
                    val storageRef = storage!!.reference.child(storagePath)
                    val uri = Uri.fromFile(file)
                    storageRef.putFile(uri).await()
                    downloadUrl = storageRef.downloadUrl.await().toString()
                    providerName = "FIREBASE"
                } catch (e: Exception) {
                    Log.w(TAG, "Firebase Storage upload failed (requires Blaze plan?): ${e.message}. Using Free Storage fallback.")
                }
            }

            // 2. Default & Free: Use FreeStorageManager (Inline Firestore Data URI, Cloudinary, or Supabase)
            if (downloadUrl == null) {
                val uploadResult = storageManager.upload(file, type, deviceId)
                if (uploadResult.isFailure) {
                    return@withContext Result.failure(uploadResult.exceptionOrNull() ?: Exception("Upload failed"))
                }
                val res = uploadResult.getOrThrow()
                downloadUrl = res.downloadUrl
                storagePath = res.storagePath
                providerName = res.provider
            }

            val recordId = UUID.randomUUID().toString()
            val record = MediaRecord(
                id = recordId,
                deviceId = deviceId,
                type = type.uppercase(),
                storagePath = storagePath,
                downloadUrl = downloadUrl,
                fileName = file.name,
                fileSize = file.length(),
                durationSeconds = durationSeconds,
                storageProvider = providerName,
                timestamp = Date()
            )

            val recordMap = hashMapOf(
                "id" to record.id,
                "deviceId" to record.deviceId,
                "type" to record.type,
                "storagePath" to record.storagePath,
                "downloadUrl" to record.downloadUrl,
                "fileName" to record.fileName,
                "fileSize" to record.fileSize,
                "durationSeconds" to record.durationSeconds,
                "storageProvider" to record.storageProvider,
                "timestamp" to FieldValue.serverTimestamp()
            )

            // Save under device's media subcollection and global media collection
            db.collection("devices")
                .document(deviceId)
                .collection("media")
                .document(recordId)
                .set(recordMap)
                .await()

            db.collection("media")
                .document(recordId)
                .set(recordMap)
                .await()

            Log.i(TAG, "Media uploaded & saved ($providerName): $storagePath")

            // Clean up temporary buffer file only if stored in internal cache
            if (file.exists() && file.absolutePath.contains(context.cacheDir.absolutePath)) {
                file.delete()
            }

            Result.success(record)
        } catch (e: Exception) {
            Log.e(TAG, "Failed uploading media file: ${e.message}", e)
            Result.failure(e)
        }
    }

    /**
     * Subscribe to remote CommandMessage documents pushed from the Web Dashboard.
     * Uses real-time addSnapshotListener on client side.
     */
    fun subscribeToCommands(
        deviceId: String,
        onError: ((Exception) -> Unit)? = null,
        onCommandReceived: (CommandMessage) -> Unit
    ): ListenerRegistration? {
        val db = firestore ?: return null

        return try {
            db.collection("commands")
                .whereEqualTo("deviceId", deviceId)
                .whereEqualTo("status", "PENDING")
                .addSnapshotListener { snapshots, error ->
                    if (error != null) {
                        Log.e(TAG, "Error listening for commands: ${error.message}", error)
                        onError?.invoke(error)
                        return@addSnapshotListener
                    }

                    if (snapshots != null && !snapshots.isEmpty) {
                        for (doc in snapshots.documents) {
                            try {
                                val action = doc.getString("action") ?: ""
                                @Suppress("UNCHECKED_CAST")
                                val params = (doc.get("parameters") as? Map<String, Any>) ?: emptyMap()
                                val status = doc.getString("status") ?: "PENDING"
                                val createdAt = doc.getLong("createdAt") ?: System.currentTimeMillis()

                                val command = CommandMessage(
                                    commandId = doc.id,
                                    deviceId = deviceId,
                                    action = action,
                                    parameters = params,
                                    status = status,
                                    createdAt = createdAt
                                )

                                Log.i(TAG, "Received remote command: ${command.action} (ID: ${command.commandId})")
                                onCommandReceived(command)
                            } catch (e: Exception) {
                                Log.e(TAG, "Failed parsing command document ${doc.id}: ${e.message}", e)
                            }
                        }
                    }
                }
        } catch (e: Exception) {
            Log.e(TAG, "Exception creating command listener: ${e.message}", e)
            null
        }
    }

    /**
     * Mark command as EXECUTED or FAILED in Firestore.
     */
    suspend fun markCommandExecuted(
        commandId: String,
        status: String = "EXECUTED",
        errorMessage: String? = null
    ): Result<Unit> = withContext(Dispatchers.IO) {
        val db = firestore ?: return@withContext Result.failure(IllegalStateException("Firestore is not configured"))
        try {
            val updates = hashMapOf<String, Any>(
                "status" to status,
                "executedAt" to System.currentTimeMillis()
            )
            if (errorMessage != null) {
                updates["errorMessage"] = errorMessage
            }

            db.collection("commands")
                .document(commandId)
                .update(updates)
                .await()

            Log.d(TAG, "Command $commandId status updated to $status")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Error updating command $commandId: ${e.message}", e)
            Result.failure(e)
        }
    }

    /**
     * Local <-> Cloud batch abstraction for buffered data.
     * fetchLocalData() -> updateRemoteData(data)
     */
    suspend fun syncLocalBuffers(
        audioFiles: List<File>,
        imageFiles: List<File>,
        deviceId: String
    ) = withContext(Dispatchers.IO) {
        Log.i(TAG, "Syncing local buffers: ${audioFiles.size} audio files, ${imageFiles.size} images")
        for (file in audioFiles) {
            uploadMediaFile(file, "AUDIO", deviceId, durationSeconds = 10)
        }
        for (file in imageFiles) {
            uploadMediaFile(file, "IMAGE", deviceId)
        }
    }

    /**
     * Send in-app message from child or parent.
     */
     suspend fun sendFamilyMessage(message: FamilyMessage): Result<Unit> = withContext(Dispatchers.IO) {
        val db = firestore ?: return@withContext Result.failure(IllegalStateException("Firestore not ready"))
        try {
            val msgMap = hashMapOf(
                "id" to message.id,
                "deviceId" to message.deviceId,
                "sender" to message.sender,
                "text" to message.text,
                "timestamp" to message.timestamp
            )
            db.collection("devices")
                .document(message.deviceId)
                .collection("messages")
                .document(message.id)
                .set(msgMap)
                .await()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Subscribe to family messages.
     */
    fun subscribeToMessages(deviceId: String, onMessagesChanged: (List<FamilyMessage>) -> Unit): ListenerRegistration? {
        val db = firestore ?: return null
        return try {
            db.collection("devices")
                .document(deviceId)
                .collection("messages")
                .orderBy("timestamp", Query.Direction.ASCENDING)
                .limit(50)
                .addSnapshotListener { snapshot, err ->
                    if (err != null || snapshot == null) return@addSnapshotListener
                    val list = snapshot.documents.mapNotNull { d ->
                        val text = d.getString("text") ?: return@mapNotNull null
                        FamilyMessage(
                            id = d.id,
                            deviceId = deviceId,
                            sender = d.getString("sender") ?: "PARENT",
                            text = text,
                            timestamp = d.getLong("timestamp") ?: System.currentTimeMillis()
                        )
                    }
                    onMessagesChanged(list)
                }
        } catch (e: Exception) {
            null
        }
    }

    companion object {
        private const val TAG = "TrackerRepository"
    }
}
