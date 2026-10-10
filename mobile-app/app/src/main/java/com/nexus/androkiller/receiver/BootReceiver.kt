package com.nexus.androkiller.receiver

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.nexus.androkiller.service.TrackerForegroundService

/**
 * Ensures background tracking and remote command listener automatically restart
 * when the Android device boots, reboots, updates, or when watchdog keepalive triggers.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.i(TAG, "Watchdog/Boot event received: $action. Ensuring TrackerForegroundService is running.")

        // Acquire temporary wakelock to ensure CPU stays active during service launch
        var tempWakeLock: PowerManager.WakeLock? = null
        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            tempWakeLock = pm?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$TAG:TransientWakeLock")
            tempWakeLock?.acquire(15_000L) // 15 seconds safe ceiling
        } catch (_: Exception) {}

        try {
            val serviceIntent = Intent(context, TrackerForegroundService::class.java).apply {
                this.action = TrackerForegroundService.ACTION_START_TRACKING
            }
            ContextCompat.startForegroundService(context, serviceIntent)
            Log.i(TAG, "TrackerForegroundService successfully launched/resurrected from BootReceiver for action: $action")
        } catch (e: Exception) {
            Log.e(TAG, "Failed launching service from BootReceiver: ${e.message}", e)
        } finally {
            // Re-arm rolling watchdog alarm
            scheduleNextKeepaliveAlarm(context)
        }
    }

    companion object {
        private const val TAG = "BootReceiver"
        const val ACTION_KEEPALIVE_ALARM = "com.nexus.androkiller.ACTION_KEEPALIVE_ALARM"
        const val ACTION_RESURRECT = "com.nexus.androkiller.ACTION_RESURRECT"
        private const val KEEPALIVE_INTERVAL_MS = 60_000L // 60 seconds

        fun scheduleNextKeepaliveAlarm(context: Context, delayMs: Long = KEEPALIVE_INTERVAL_MS) {
            try {
                val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
                val intent = Intent(context, BootReceiver::class.java).apply {
                    action = ACTION_KEEPALIVE_ALARM
                }
                val pendingIntent = PendingIntent.getBroadcast(
                    context,
                    888,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )

                val triggerAt = System.currentTimeMillis() + delayMs
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
                } else {
                    alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Could not schedule keepalive alarm: ${e.message}")
            }
        }
    }
}
