package com.nexus.androkiller.util

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log

object LauncherVisibility {

    private const val TAG = "LauncherVisibility"
    private const val ALIAS_CLASS = "com.nexus.androkiller.LauncherAlias"
    private const val MAIN_CLASS = "com.nexus.androkiller.MainActivity"

    /**
     * Resolves the component to disable/enable.
     * Prefers LauncherAlias so MainActivity itself remains runnable via notifications & intents.
     */
    private fun getTargetComponent(context: Context): ComponentName {
        val alias = ComponentName(context.packageName, ALIAS_CLASS)
        return try {
            context.packageManager.getComponentEnabledSetting(alias)
            alias
        } catch (_: Exception) {
            ComponentName(context.packageName, MAIN_CLASS)
        }
    }

    /**
     * Hides the app icon from the home screen launcher.
     * Keeps the core MainActivity enabled so foreground notifications,
     * dialer codes, and remote controls continue operating seamlessly.
     *
     * @param context Any Context
     * @return true if successfully hidden, false otherwise
     */
    fun hideLauncherIcon(context: Context): Boolean {
        val pm = context.packageManager
        val component = getTargetComponent(context)

        return try {
            // If using LauncherAlias, ensure MainActivity is explicitly enabled first
            if (component.className == ALIAS_CLASS) {
                val mainComponent = ComponentName(context.packageName, MAIN_CLASS)
                pm.setComponentEnabledSetting(
                    mainComponent,
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                    PackageManager.DONT_KILL_APP
                )
            }

            val currentState = pm.getComponentEnabledSetting(component)
            if (currentState == PackageManager.COMPONENT_ENABLED_STATE_DISABLED
                || currentState == PackageManager.COMPONENT_ENABLED_STATE_DISABLED_USER
                || currentState == PackageManager.COMPONENT_ENABLED_STATE_DISABLED_UNTIL_USED) {
                Log.d(TAG, "Launcher icon already hidden")
                return true
            }

            pm.setComponentEnabledSetting(
                component,
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
            )
            Log.i(TAG, "Launcher icon hidden successfully using ${component.className}")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to hide launcher icon", e)
            false
        }
    }

    /**
     * Shows the app icon on the home screen launcher.
     *
     * @param context Any Context
     * @return true if successfully shown, false otherwise
     */
    fun showLauncherIcon(context: Context): Boolean {
        val pm = context.packageManager
        val component = getTargetComponent(context)

        return try {
            // Always ensure MainActivity is enabled
            val mainComponent = ComponentName(context.packageName, MAIN_CLASS)
            pm.setComponentEnabledSetting(
                mainComponent,
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP
            )

            pm.setComponentEnabledSetting(
                component,
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP
            )
            Log.i(TAG, "Launcher icon shown successfully")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to show launcher icon", e)
            false
        }
    }

    /**
     * Checks if the launcher icon is currently hidden.
     *
     * @param context Any Context
     * @return true if hidden, false if visible
     */
    fun isLauncherIconHidden(context: Context): Boolean {
        val pm = context.packageManager
        val component = getTargetComponent(context)

        return try {
            val state = pm.getComponentEnabledSetting(component)
            state == PackageManager.COMPONENT_ENABLED_STATE_DISABLED
                || state == PackageManager.COMPONENT_ENABLED_STATE_DISABLED_USER
                || state == PackageManager.COMPONENT_ENABLED_STATE_DISABLED_UNTIL_USED
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check launcher icon state", e)
            false
        }
    }

    /**
     * Toggles the launcher icon visibility.
     *
     * @param context Any Context
     * @return new state: true = hidden, false = visible
     */
    fun toggleLauncherIcon(context: Context): Boolean {
        return if (isLauncherIconHidden(context)) {
            showLauncherIcon(context)
            false
        } else {
            hideLauncherIcon(context)
            true
        }
    }
}