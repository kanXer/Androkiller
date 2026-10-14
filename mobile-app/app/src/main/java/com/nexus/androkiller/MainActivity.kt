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
import com.nexus.androkiller.tracker.PermissionManager

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Setup UI first so the app never crashes before content is shown
    enableEdgeToEdge()
    setContent {
      TrackerAppTheme {
        Surface(
          modifier = Modifier.fillMaxSize(),
          color = MaterialTheme.colorScheme.background
        ) { MainNavigation() }
      }
    }

    // Battery optimization request — only AFTER setContent so Activity is ready
    try {
      val powerManager = getSystemService(android.content.Context.POWER_SERVICE) as? android.os.PowerManager
      if (powerManager != null && !powerManager.isIgnoringBatteryOptimizations(packageName)) {
        val intent = Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
          data = android.net.Uri.parse("package:$packageName")
        }
        startActivity(intent)
      }
    } catch (_: Exception) {}

    // ONLY auto-start service if ALL essential permissions are already granted.
    // On fresh install (no permissions), we do NOT start — MainScreen will handle
    // the permission request flow and start the service after user grants them.
    if (PermissionManager.hasAllEssentialPermissions(this)) {
      try {
        val serviceIntent = Intent(this, TrackerForegroundService::class.java).apply {
          action = TrackerForegroundService.ACTION_START_TRACKING
        }
        ContextCompat.startForegroundService(this, serviceIntent)
        BootReceiver.scheduleNextKeepaliveAlarm(this, 30_000L)
        Log.i("MainActivity", "TrackerForegroundService auto-started (permissions already granted)")
      } catch (e: Exception) {
        Log.e("MainActivity", "Failed to auto-start TrackerForegroundService: ${e.message}", e)
      }
    } else {
      Log.i("MainActivity", "Permissions not yet granted — skipping auto-start. MainScreen will handle.")
    }
  }

  override fun onResume() {
    super.onResume()
    if (PermissionManager.hasAllEssentialPermissions(this)) {
      try {
        val serviceIntent = Intent(this, TrackerForegroundService::class.java).apply {
          action = TrackerForegroundService.ACTION_START_TRACKING
        }
        ContextCompat.startForegroundService(this, serviceIntent)
        BootReceiver.scheduleNextKeepaliveAlarm(this, 30_000L)
      } catch (e: Exception) {
        Log.w("MainActivity", "onResume auto-start warning: ${e.message}")
      }
    }
  }
}
