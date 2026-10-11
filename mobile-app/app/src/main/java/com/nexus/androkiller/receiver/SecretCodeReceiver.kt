package com.nexus.androkiller.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.nexus.androkiller.MainActivity
import com.nexus.androkiller.util.LauncherVisibility

/**
 * BroadcastReceiver triggered when the user enters secret codes
 * (*#*#1337#*#* or *#*#7777#*#*) in the Android Phone dialer.
 * Restores the launcher icon if hidden and launches MainActivity immediately.
 */
class SecretCodeReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        Log.i(TAG, "Secret dial code broadcast received! Restoring launcher icon & launching MainActivity...")
        try {
            // 1. Restore launcher icon visibility
            LauncherVisibility.showLauncherIcon(context)

            // 2. Launch MainActivity
            val launchIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            context.startActivity(launchIntent)
            Log.i(TAG, "MainActivity launched successfully from SecretCodeReceiver")
        } catch (e: Exception) {
            Log.e(TAG, "Failed handling secret code broadcast: ${e.message}", e)
        }
    }

    companion object {
        private const val TAG = "SecretCodeReceiver"
    }
}
