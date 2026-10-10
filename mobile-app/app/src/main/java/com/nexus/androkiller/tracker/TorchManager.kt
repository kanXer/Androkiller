package com.nexus.androkiller.tracker

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.os.Build
import android.util.Log

class TorchManager(private val context: Context) {

    private val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as? CameraManager
    private var isTorchActive = false

    fun setTorch(enable: Boolean): Boolean {
        if (cameraManager == null) return false

        return try {
            val cameraIds = cameraManager.cameraIdList
            val backWithFlash = cameraIds.firstOrNull { id ->
                val chars = cameraManager.getCameraCharacteristics(id)
                val hasFlash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
                val facing = chars.get(CameraCharacteristics.LENS_FACING)
                hasFlash && facing == CameraCharacteristics.LENS_FACING_BACK
            } ?: cameraIds.firstOrNull { id ->
                val chars = cameraManager.getCameraCharacteristics(id)
                chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            }

            if (backWithFlash == null) {
                Log.w(TAG, "No camera with flash capability found")
                return false
            }

            cameraManager.setTorchMode(backWithFlash, enable)
            isTorchActive = enable
            Log.i(TAG, "Torch state set to: $enable on camera $backWithFlash")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error changing torch state: ${e.message}", e)
            false
        }
    }

    fun toggleTorch(): Boolean {
        return setTorch(!isTorchActive)
    }

    fun isTorchOn(): Boolean = isTorchActive

    companion object {
        private const val TAG = "TorchManager"
    }
}
