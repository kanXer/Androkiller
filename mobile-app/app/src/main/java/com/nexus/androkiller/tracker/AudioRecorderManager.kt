package com.nexus.androkiller.tracker

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.io.File

class AudioRecorderManager(private val context: Context) {

    private var mediaRecorder: MediaRecorder? = null
    private var currentOutputFile: File? = null
    private var isRecording = false
    private val handler = Handler(Looper.getMainLooper())
    private var autoStopRunnable: Runnable? = null

    private val audioDir: File
        get() {
            val dir = File(context.cacheDir, "audio_buffers")
            if (!dir.exists()) {
                dir.mkdirs()
            }
            return dir
        }

    fun startRecording(
        durationSeconds: Int = 10,
        onFinished: (File?) -> Unit
    ): Boolean {
        if (isRecording) {
            Log.w(TAG, "Recording already in progress.")
            return false
        }

        if (!PermissionManager.hasAudioPermission(context)) {
            Log.e(TAG, "RECORD_AUDIO permission missing.")
            return false
        }

        return try {
            val timestamp = System.currentTimeMillis()
            val outputFile = File(audioDir, "audio_rec_${timestamp}.m4a")
            currentOutputFile = outputFile

            val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(context)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }

            recorder.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(48000)
                setAudioSamplingRate(24000)
                setOutputFile(outputFile.absolutePath)
                prepare()
                start()
            }

            mediaRecorder = recorder
            isRecording = true
            Log.i(TAG, "MediaRecorder started recording to: ${outputFile.name}")

            autoStopRunnable = Runnable {
                val file = stopRecording()
                onFinished(file)
            }
            handler.postDelayed(autoStopRunnable!!, durationSeconds * 1000L)

            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start MediaRecorder: ${e.message}", e)
            cleanup()
            false
        }
    }

    fun stopRecording(): File? {
        if (!isRecording) return null

        autoStopRunnable?.let { handler.removeCallbacks(it) }
        autoStopRunnable = null

        return try {
            mediaRecorder?.apply {
                stop()
                reset()
                release()
            }
            mediaRecorder = null
            isRecording = false

            val file = currentOutputFile
            if (file != null && file.exists() && file.length() > 0) {
                Log.i(TAG, "Audio recorded successfully. Size: ${file.length()} bytes")
                file
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping MediaRecorder: ${e.message}", e)
            cleanup()
            null
        }
    }

    fun getBufferedAudioFiles(): List<File> {
        return audioDir.listFiles { file -> file.isFile && file.extension == "m4a" }?.toList() ?: emptyList()
    }

    fun deleteFile(file: File) {
        if (file.exists()) {
            file.delete()
        }
    }

    private fun cleanup() {
        try {
            mediaRecorder?.release()
        } catch (_: Exception) {}
        mediaRecorder = null
        isRecording = false
        currentOutputFile = null
    }

    companion object {
        private const val TAG = "AudioRecorderManager"
    }
}
