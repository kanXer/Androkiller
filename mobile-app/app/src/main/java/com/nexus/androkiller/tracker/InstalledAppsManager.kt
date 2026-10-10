package com.nexus.androkiller.tracker

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

data class InstalledAppItem(
    val name: String = "",
    val packageName: String = "",
    val versionName: String = "",
    val isSystemApp: Boolean = false,
    val installTime: Long = 0L,
    val updateTime: Long = 0L
)

class InstalledAppsManager(private val context: Context) {

    private val firestore: FirebaseFirestore?
        get() = try {
            FirebaseFirestore.getInstance()
        } catch (_: Exception) {
            null
        }

    fun getInstalledApps(maxCount: Int = 120): List<InstalledAppItem> {
        val pm = context.packageManager
        val items = mutableListOf<InstalledAppItem>()

        try {
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                PackageManager.PackageInfoFlags.of(0L)
            } else {
                0
            }

            val packages: List<PackageInfo> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getInstalledPackages(flags as PackageManager.PackageInfoFlags)
            } else {
                @Suppress("DEPRECATION")
                pm.getInstalledPackages(flags as Int)
            }

            for (pkg in packages) {
                if (items.size >= maxCount) break
                val appInfo = pkg.applicationInfo ?: continue

                // Check if system app
                val isSystem = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                val label = pm.getApplicationLabel(appInfo).toString()
                val pkgName = pkg.packageName ?: ""
                val versionName = pkg.versionName ?: "1.0"
                val installTime = pkg.firstInstallTime
                val updateTime = pkg.lastUpdateTime

                items.add(
                    InstalledAppItem(
                        name = label.ifBlank { pkgName },
                        packageName = pkgName,
                        versionName = versionName,
                        isSystemApp = isSystem,
                        installTime = installTime,
                        updateTime = updateTime
                    )
                )
            }

            // Sort: non-system user apps first, then alphabetical
            items.sortWith(compareBy({ it.isSystemApp }, { it.name.lowercase() }))
        } catch (e: Exception) {
            Log.e(TAG, "Failed retrieving installed applications: ${e.message}", e)
        }

        return items
    }

    suspend fun syncInstalledAppsToFirestore(deviceId: String): Result<Int> = withContext(Dispatchers.IO) {
        val db = firestore ?: return@withContext Result.failure(IllegalStateException("Firestore not configured"))

        try {
            val apps = getInstalledApps()
            val appsMaps = apps.map {
                hashMapOf(
                    "name" to it.name,
                    "packageName" to it.packageName,
                    "versionName" to it.versionName,
                    "isSystemApp" to it.isSystemApp,
                    "installTime" to it.installTime,
                    "updateTime" to it.updateTime
                )
            }

            val userAppsCount = apps.count { !it.isSystemApp }
            val payload = hashMapOf(
                "deviceId" to deviceId,
                "totalCount" to apps.size,
                "userAppsCount" to userAppsCount,
                "lastSynced" to FieldValue.serverTimestamp(),
                "apps" to appsMaps
            )

            db.collection("devices")
                .document(deviceId)
                .collection("installed_apps")
                .document("inventory")
                .set(payload)
                .await()

            Log.i(TAG, "Synced ${apps.size} installed applications for $deviceId ($userAppsCount user apps)")
            Result.success(apps.size)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to sync installed apps: ${e.message}", e)
            Result.failure(e)
        }
    }

    companion object {
        private const val TAG = "InstalledAppsManager"
    }
}
