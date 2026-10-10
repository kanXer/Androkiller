import React from 'react';
import { X, Trash2, AlertTriangle, Smartphone, Battery, HardDrive, RefreshCw } from 'lucide-react';

export default function DeleteDeviceModal({
  isOpen,
  onClose,
  device,
  onConfirm,
  isDeleting = false
}) {
  if (!isOpen || !device) return null;

  const deviceId = device.deviceId || device.id;
  const deviceName = device.deviceName || deviceId;
  const model = device.model || device.manufacturer ? `${device.manufacturer || ''} ${device.model || ''}`.trim() : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col ring-1 ring-white/10 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-rose-950/20">
          <div className="flex items-center space-x-3">
            <div className="p-2 sm:p-2.5 rounded-xl bg-rose-950/80 border border-rose-700/50 text-rose-400 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Remove Device</h2>
              <p className="text-[11px] text-rose-300/80 font-mono">Device Unregister & Data Cleanup</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-4 sm:p-6 space-y-4 text-xs sm:text-sm text-slate-300">
          {/* Danger Warning Box */}
          <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-900/50 flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-200">
              <p className="font-semibold mb-0.5">Are you sure you want to remove this device?</p>
              <p className="text-rose-300/80 text-[11px] leading-relaxed">
                This will remove the device record from the web dashboard. All associated telemetry feeds (GPS locations, logs, photos, screenshots, and records) will be unlinked.
              </p>
            </div>
          </div>

          {/* Selected Device Preview Card */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 truncate">
                <Smartphone className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="font-bold text-white truncate">{deviceName}</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900 text-cyan-300 border border-cyan-800/40">
                {device.isOnline ? '🟢 Online' : '⚪ Offline'}
              </span>
            </div>

            <div className="text-[11px] font-mono text-slate-400 space-y-1 pt-1 border-t border-slate-800/60">
              <div className="flex items-center justify-between">
                <span>Device ID:</span>
                <span className="text-slate-200 truncate max-w-[180px]">{deviceId}</span>
              </div>
              {model && (
                <div className="flex items-center justify-between">
                  <span>Hardware Model:</span>
                  <span className="text-slate-200">{model}</span>
                </div>
              )}
              {device.batteryLevel != null && (
                <div className="flex items-center justify-between">
                  <span>Battery Level:</span>
                  <span className="text-slate-200">{device.batteryLevel}% {device.isCharging ? '⚡ (Charging)' : ''}</span>
                </div>
              )}
            </div>
          </div>

          <p className="text-[11px] text-slate-400 italic">
            Tip: You can re-connect this device anytime simply by launching the companion app on the phone.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end space-x-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => onConfirm(device)}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 active:bg-rose-700 transition-all flex items-center space-x-1.5 shadow-lg shadow-rose-950/50 disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Removing Device...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Yes, Remove Device</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
