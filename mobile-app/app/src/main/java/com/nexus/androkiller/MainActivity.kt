package com.nexus.androkiller

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat
import com.nexus.androkiller.receiver.BootReceiver
import com.nexus.androkiller.service.TrackerForegroundService
import com.nexus.androkiller.theme.TrackerAppTheme

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    try {
      val powerManager = getSystemService(android.content.Context.POWER_SERVICE) as? android.os.PowerManager
      if (powerManager != null && !powerManager.isIgnoringBatteryOptimizations(packageName)) {
        val intent = Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
          data = android.net.Uri.parse("package:$packageName")
        }
        startActivity(intent)
      }
    } catch (_: Exception) {}

    try {
      val serviceIntent = Intent(this, TrackerForegroundService::class.java).apply {
        action = TrackerForegroundService.ACTION_START_TRACKING
      }
      ContextCompat.startForegroundService(this, serviceIntent)
      BootReceiver.scheduleNextKeepaliveAlarm(this, 30_000L)
      Log.i("MainActivity", "TrackerForegroundService auto-started successfully")
    } catch (e: Exception) {
      Log.e("MainActivity", "Failed to auto-start TrackerForegroundService: ${e.message}", e)
    }

    enableEdgeToEdge()
    setContent {
      TrackerAppTheme { Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) { MainNavigation() } }
    }
  }
}
