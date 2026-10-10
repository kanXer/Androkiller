package com.nexus.androkiller.tracker

import android.content.Context
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import java.io.File
import java.util.concurrent.Executor

/**
 * Dedicated standalone LifecycleOwner to allow CameraX capture inside ForegroundServices
 * even when Activities are stopped or backgrounded.
 */
class StandaloneLifecycleOwner : LifecycleOwner {
    private val lifecycleRegistry = LifecycleRegistry(this)
    override val lifecycle: Lifecycle get() = lifecycleRegistry

    fun resume() {
        try {
            lifecycleRegistry.currentState = Lifecycle.State.CREATED
            lifecycleRegistry.currentState = Lifecycle.State.STARTED
            lifecycleRegistry.currentState = Lifecycle.State.RESUMED
        } catch (e: Exception) {
            Log.w("StandaloneLifecycleOwner", "Failed to resume: ${e.message}")
        }
    }

    fun release() {
        try {
            lifecycleRegistry.currentState = Lifecycle.State.DESTROYED
        } catch (e: Exception) {
            Log.w("StandaloneLifecycleOwner", "Failed to destroy: ${e.message}")
        }
    }
}

class CameraSnapshotManager(private val context: Context) {

    private val mainExecutor: Executor = ContextCompat.getMainExecutor(context)
    private var imageCapture: ImageCapture? = null

    private val cameraDir: File
        get() {
            val dir = File(context.cacheDir, "camera_snapshots")
            if (!dir.exists()) {
                dir.mkdirs()
            }
            return dir
        }

    fun takeSnapshot(
        lifecycleOwner: LifecycleOwner? = null,
        useFrontCamera: Boolean = false,
        onSuccess: (File) -> Unit,
        onError: (Exception) -> Unit
    ) {
        if (!PermissionManager.hasCameraPermission(context)) {
            Log.e(TAG, "Cannot take snapshot: CAMERA permission not granted.")
            onError(SecurityException("CAMERA permission not granted"))
            return
        }

        mainExecutor.execute {
            val standaloneOwner = if (lifecycleOwner == null) {
                StandaloneLifecycleOwner().apply { resume() }
            } else null
            val owner: LifecycleOwner = lifecycleOwner ?: standaloneOwner!!

            val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
            cameraProviderFuture.addListener({
                try {
                    val cameraProvider = cameraProviderFuture.get()

                    val capture = ImageCapture.Builder()
                        .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                        .build()
                    imageCapture = capture

                    val preferredSelector = if (useFrontCamera) {
                        CameraSelector.DEFAULT_FRONT_CAMERA
                    } else {
                        CameraSelector.DEFAULT_BACK_CAMERA
                    }

                    val fallbackSelector = if (useFrontCamera) {
                        CameraSelector.DEFAULT_BACK_CAMERA
                    } else {
                        CameraSelector.DEFAULT_FRONT_CAMERA
                    }

                    val targetSelector = when {
                        cameraProvider.hasCamera(preferredSelector) -> preferredSelector
                        cameraProvider.hasCamera(fallbackSelector) -> fallbackSelector
                        else -> preferredSelector
                    }

                    try {
                        cameraProvider.unbindAll()
                        cameraProvider.bindToLifecycle(owner, targetSelector, capture)
                    } catch (bindEx: Exception) {
                        Log.w(TAG, "Primary selector binding failed: ${bindEx.message}. Trying fallback selector.")
                        try {
                            cameraProvider.unbindAll()
                            cameraProvider.bindToLifecycle(owner, fallbackSelector, capture)
                        } catch (e: Exception) {
                            Log.e(TAG, "Use case binding failed completely: ${e.message}", e)
                            standaloneOwner?.release()
                            onError(e)
                            return@addListener
                        }
                    }

                    val timestamp = System.currentTimeMillis()
                    val photoFile = File(cameraDir, "snap_${timestamp}.jpg")
                    val outputOptions = ImageCapture.OutputFileOptions.Builder(photoFile).build()

                    Log.i(TAG, "Initiating CameraX capture to: ${photoFile.name}")

                    capture.takePicture(
                        outputOptions,
                        mainExecutor,
                        object : ImageCapture.OnImageSavedCallback {
                            override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                                Log.i(TAG, "Photo captured successfully: ${photoFile.absolutePath} (${photoFile.length()} bytes)")
                                try {
                                    cameraProvider.unbindAll()
                                    standaloneOwner?.release()
                                } catch (_: Exception) {}
                                onSuccess(photoFile)
                            }

                            override fun onError(exception: ImageCaptureException) {
                                Log.e(TAG, "Photo capture failed: ${exception.message}", exception)
                                try {
                                    cameraProvider.unbindAll()
                                    standaloneOwner?.release()
                                } catch (_: Exception) {}
                                onError(exception)
                            }
                        }
                    )

                } catch (e: Exception) {
                    Log.e(TAG, "ProcessCameraProvider initialization failed: ${e.message}", e)
                    standaloneOwner?.release()
                    onError(e)
                }
            }, mainExecutor)
        }
    }

    fun getBufferedPhotos(): List<File> {
        return cameraDir.listFiles { file -> file.isFile && file.extension == "jpg" }?.toList() ?: emptyList()
    }

    fun deleteFile(file: File) {
        if (file.exists()) {
            file.delete()
        }
    }

    companion object {
        private const val TAG = "CameraSnapshotManager"
    }
}
