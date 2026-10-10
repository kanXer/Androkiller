package com.nexus.androkiller.tracker

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.Settings
import com.nexus.androkiller.model.StorageInfo
import com.nexus.androkiller.model.SystemStatus
import java.util.UUID

class DeviceStatusProvider(private val context: Context) {

    private val prefs = context.getSharedPreferences("tracker_prefs", Context.MODE_PRIVATE)

    fun getDeviceId(): String {
        var id = prefs.getString("device_id", null)
        if (id.isNullOrBlank()) {
            val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            id = if (!androidId.isNullOrBlank() && androidId != "9774d56d682e549c") {
                "dev_$androidId"
            } else {
                "dev_" + UUID.randomUUID().toString().substring(0, 8)
            }
            prefs.edit().putString("device_id", id).apply()
        }
        return id
    }

    fun setDeviceId(newId: String) {
        prefs.edit().putString("device_id", newId.trim()).apply()
    }

    fun getGuardianPhone(): String {
        return prefs.getString("guardian_phone", "+18005550199") ?: "+18005550199"
    }

    fun setGuardianPhone(phone: String) {
        prefs.edit().putString("guardian_phone", phone.trim()).apply()
    }

    fun getBatteryInfo(): Pair<Int, Boolean> {
        val batteryStatus: Intent? = IntentFilter(Intent.ACTION_BATTERY_CHANGED).let { filter ->
            context.registerReceiver(null, filter)
        }

        val level: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val batteryPct: Int = if (level >= 0 && scale > 0) ((level / scale.toFloat()) * 100).toInt() else 0

        val status: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val isCharging: Boolean = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL

        return Pair(batteryPct, isCharging)
    }

    fun getStorageInfo(): StorageInfo {
        return try {
            val path = Environment.getDataDirectory()
            val stat = StatFs(path.path)
            val blockSize = stat.blockSizeLong
            val totalBlocks = stat.blockCountLong
            val availableBlocks = stat.availableBlocksLong

            val totalBytes = totalBlocks * blockSize
            val freeBytes = availableBlocks * blockSize
            val usedBytes = (totalBytes - freeBytes).coerceAtLeast(0L)

            val bytesInGB = 1024.0 * 1024.0 * 1024.0
            val totalGB = totalBytes / bytesInGB
            val freeGB = freeBytes / bytesInGB
            val usedGB = usedBytes / bytesInGB
            val percentUsed = if (totalBytes > 0) ((usedBytes.toDouble() / totalBytes) * 100).toInt() else 0

            // RAM info
            val actManager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            val memInfo = ActivityManager.MemoryInfo()
            actManager?.getMemoryInfo(memInfo)
            val totalRamGB = memInfo.totalMem / bytesInGB
            val freeRamGB = memInfo.availMem / bytesInGB

            StorageInfo(
                totalStorageGB = String.format("%.1f", totalGB).toDoubleOrNull() ?: totalGB,
                usedStorageGB = String.format("%.1f", usedGB).toDoubleOrNull() ?: usedGB,
                freeStorageGB = String.format("%.1f", freeGB).toDoubleOrNull() ?: freeGB,
                storagePercentUsed = percentUsed,
                totalRamGB = String.format("%.1f", totalRamGB).toDoubleOrNull() ?: totalRamGB,
                freeRamGB = String.format("%.1f", freeRamGB).toDoubleOrNull() ?: freeRamGB
            )
        } catch (_: Exception) {
            StorageInfo(64.0, 32.0, 32.0, 50, 4.0, 2.0)
        }
    }

    fun isNetworkAvailable(): Boolean {
        val connectivityManager =
            context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val activeNetwork = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    fun getSystemStatus(monitoringActive: Boolean, intervalSeconds: Long): SystemStatus {
        val (battery, charging) = getBatteryInfo()
        return SystemStatus(
            deviceId = getDeviceId(),
            deviceName = "${Build.MANUFACTURER} ${Build.MODEL}",
            manufacturer = Build.MANUFACTURER,
            model = Build.MODEL,
            osVersion = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
            batteryLevel = battery,
            isCharging = charging,
            isOnline = isNetworkAvailable(),
            monitoringActive = monitoringActive,
            updateIntervalSeconds = intervalSeconds,
            permissions = PermissionManager.getAllPermissionsStatus(context),
            storageInfo = getStorageInfo(),
            guardianPhoneNumber = getGuardianPhone()
        )
    }
}
