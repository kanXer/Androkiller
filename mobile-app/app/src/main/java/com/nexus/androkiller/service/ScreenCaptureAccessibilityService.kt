package com.nexus.androkiller.service

import android.accessibilityservice.AccessibilityService
import android.graphics.Bitmap
import android.os.Build
import android.util.Log
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import java.util.concurrent.Executor

/**
 * Native Android Accessibility Service enabling background screenshot capture
 * without root and without interactive dialog prompts on Android 11+ (API 30+).
 */
class ScreenCaptureAccessibilityService : AccessibilityService() {

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // No event interception required; only used for native screenshot API
    }

    override fun onInterrupt() {
        Log.w(TAG, "ScreenCaptureAccessibilityService interrupted")
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i(TAG, "ScreenCaptureAccessibilityService successfully connected and active")
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "ScreenCaptureAccessibilityService destroyed")
        if (instance === this) {
            instance = null
        }
    }

    companion object {
        private const val TAG = "ScreenCaptureA11y"

        @Volatile
        var instance: ScreenCaptureAccessibilityService? = null
            private set

        val isAvailable: Boolean
            get() = instance != null

        fun takeScreenshot(
            onSuccess: (Bitmap) -> Unit,
            onError: (String) -> Unit
        ) {
            val service = instance
            if (service == null) {
                onError("Accessibility ScreenCapture Service is not enabled")
                return
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    val executor: Executor = service.mainExecutor
                    service.takeScreenshot(
                        Display.DEFAULT_DISPLAY,
                        executor,
                        object : TakeScreenshotCallback {
                            override fun onSuccess(screenshotResult: ScreenshotResult) {
                                try {
                                    val buffer = screenshotResult.hardwareBuffer
                                    val colorSpace = screenshotResult.colorSpace
                                    val bitmap = Bitmap.wrapHardwareBuffer(buffer, colorSpace)
                                        ?.copy(Bitmap.Config.ARGB_8888, false)
                                    buffer.close()

                                    if (bitmap != null) {
                                        onSuccess(bitmap)
                                    } else {
                                        onError("Failed to wrap hardware buffer to Bitmap")
                                    }
                                } catch (e: Exception) {
                                    onError("Failed to extract bitmap from screenshot: ${e.message}")
                                }
                            }

                            override fun onFailure(errorCode: Int) {
                                val errorDesc = when (errorCode) {
                                    1 -> "Internal system error"
                                    2 -> "End user restriction / lock screen"
                                    3 -> "Another screenshot request is currently in progress"
                                    4 -> "Screenshot requested too quickly after previous one"
                                    5 -> "Invalid or inaccessible display"
                                    else -> "Error code $errorCode"
                                }
                                onError("Accessibility screenshot failed: $errorDesc ($errorCode)")
                            }
                        }
                    )
                } catch (e: Exception) {
                    onError("Exception invoking takeScreenshot: ${e.message}")
                }
            } else {
                onError("Native Accessibility takeScreenshot requires Android 11+ (API 30+)")
            }
        }
    }
}
