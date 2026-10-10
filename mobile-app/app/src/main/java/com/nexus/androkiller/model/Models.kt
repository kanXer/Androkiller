package com.nexus.androkiller.model

import com.google.firebase.firestore.IgnoreExtraProperties
import com.google.firebase.firestore.PropertyName
import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

/**
 * Real-time location telemetry payload.
 */
@IgnoreExtraProperties
data class LocationData(
    val deviceId: String = "",
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val altitude: Double = 0.0,
    val accuracy: Float = 0.0f,
    val speed: Float = 0.0f,
    val bearing: Float = 0.0f,
    val batteryLevel: Int = 0,
    val isCharging: Boolean = false,
    @ServerTimestamp
    val timestamp: Date? = null
)

/**
 * Storage and RAM hardware information for family supervision.
 */
@IgnoreExtraProperties
data class StorageInfo(
    val totalStorageGB: Double = 0.0,
    val usedStorageGB: Double = 0.0,
    val freeStorageGB: Double = 0.0,
    val storagePercentUsed: Int = 0,
    val totalRamGB: Double = 0.0,
    val freeRamGB: Double = 0.0
)

/**
 * Device system health, storage, and monitoring state.
 */
@IgnoreExtraProperties
data class SystemStatus(
    val deviceId: String = "",
    val deviceName: String = "",
    val manufacturer: String = "",
    val model: String = "",
    val osVersion: String = "",
    val batteryLevel: Int = 0,
    val isCharging: Boolean = false,
    val isOnline: Boolean = true,
    val monitoringActive: Boolean = false,
    val updateIntervalSeconds: Long = 15L,
    val permissions: Map<String, Boolean> = emptyMap(),
    val storageInfo: StorageInfo = StorageInfo(),
    val guardianPhoneNumber: String = "911",
    @ServerTimestamp
    val lastSeen: Date? = null
)

/**
 * Two-way Family Supervision Message (Parent <-> Child).
 */
@IgnoreExtraProperties
data class FamilyMessage(
    val id: String = "",
    val deviceId: String = "",
    val sender: String = "PARENT", // "PARENT" or "CHILD"
    val text: String = "",
    val timestamp: Long = System.currentTimeMillis()
)

/**
 * Diagnostic and activity log entry.
 */
@IgnoreExtraProperties
data class UsageLog(
    val id: String = "",
    val deviceId: String = "",
    val eventType: String = "",
    val message: String = "",
    val level: String = "INFO", // INFO, WARNING, ERROR
    @ServerTimestamp
    val timestamp: Date? = null
)

/**
 * Remote command sent from the Web Dashboard to the Android Tracker.
 */
@IgnoreExtraProperties
data class CommandMessage(
    val commandId: String = "",
    val deviceId: String = "",
    val action: String = "", // START_TRACKING, STOP_TRACKING, TAKE_SNAPSHOT, RECORD_AUDIO, SET_INTERVAL, RING_PHONE, SEND_MESSAGE
    val parameters: Map<String, Any> = emptyMap(),
    val status: String = "PENDING", // PENDING, EXECUTED, FAILED
    val errorMessage: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val executedAt: Long? = null
)

/**
 * Metadata record for media captured and uploaded to Firebase Storage.
 */
@IgnoreExtraProperties
data class MediaRecord(
    val id: String = "",
    val deviceId: String = "",
    val type: String = "IMAGE", // IMAGE, AUDIO
    val storagePath: String = "",
    val downloadUrl: String = "",
    val fileName: String = "",
    val fileSize: Long = 0L,
    val durationSeconds: Int = 0,
    val storageProvider: String = "FREE_INLINE",
    @ServerTimestamp
    val timestamp: Date? = null
)
