import React, { useState } from 'react';
import { Smartphone, Wifi, WifiOff, Database, ChevronDown, HardDrive, Trash2 } from 'lucide-react';
import { isFirebaseConfigured } from '../firebase/config';

export default function Header({
  devices = [],
  selectedDeviceId,
  onSelectDevice,
  onOpenSetupModal,
  onOpenStorageModal,
  onRequestDeleteDevice,
  storageConfig = {}
}) {
  const currentDevice = devices.find(d => (d.deviceId || d.id) === selectedDeviceId) || devices[0];
  const isConnectedToFirebase = isFirebaseConfigured();

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-6 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Top bar on Mobile / Left brand on Desktop */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div className="relative flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-600/20 border border-cyan-500/40 shadow-lg shadow-cyan-950/50 shrink-0">
              <svg
                className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400 drop-shadow-[0_0_8px_rgba(0,229,255,0.7)]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base sm:text-lg font-black tracking-wider text-white">NEXUS ANDROKILLER</h1>
                <span className="hidden xs:inline-block text-[9px] sm:text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/40 uppercase">
                  v1.2.0
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 font-mono">Mobile Telemetry & Remote Control Hub</p>
            </div>
          </div>

          {/* Quick status pill on mobile header right */}
          <div className="flex items-center space-x-1.5 sm:hidden">
            <button
              onClick={onOpenStorageModal}
              className="p-2 rounded-xl bg-purple-950/60 border border-purple-700/60 text-purple-300 hover:text-white"
              title="Free Media Storage Provider"
            >
              <HardDrive className="w-4 h-4" />
            </button>
            <button
              onClick={onOpenSetupModal}
              className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-cyan-400 hover:text-white"
              title="Firebase Settings"
            >
              <Database className="w-4 h-4" />
            </button>
            <div className="flex items-center px-2 py-1 rounded-lg border text-[10px] font-semibold bg-slate-800/80 border-slate-700">
              <span className={`w-2 h-2 rounded-full mr-1.5 ${isConnectedToFirebase ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
              <span className={isConnectedToFirebase ? 'text-emerald-400' : 'text-amber-300'}>
                {isConnectedToFirebase ? 'Live' : 'Demo'}
              </span>
            </div>
          </div>
        </div>

        {/* Controls row: Full-width on mobile, right-aligned on desktop */}
        <div className="flex items-center space-x-2 sm:space-x-3 w-full sm:w-auto">
          {/* Device Selector */}
          <div className="flex-1 sm:flex-initial flex items-center space-x-2 bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 sm:py-1.5 text-xs">
            <Smartphone className="w-4 h-4 text-cyan-400 shrink-0" />
            <select
              value={selectedDeviceId || ''}
              onChange={(e) => onSelectDevice(e.target.value)}
              className="bg-transparent text-slate-200 font-mono focus:outline-none cursor-pointer w-full text-xs"
            >
              {devices.length === 0 ? (
                <option value="" className="bg-slate-900 text-amber-300">
                  Waiting for Connection (0 Devices)
                </option>
              ) : (
                devices.map((dev) => (
                  <option key={dev.deviceId || dev.id} value={dev.deviceId || dev.id} className="bg-slate-900 text-white">
                    {dev.deviceName || dev.deviceId} • Online 🟢
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Remove Device Button */}
          {currentDevice && onRequestDeleteDevice && (
            <button
              onClick={() => onRequestDeleteDevice(currentDevice)}
              className="flex items-center space-x-1 sm:space-x-1.5 px-2.5 py-2 sm:py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 hover:border-rose-700 text-rose-300 hover:text-white text-xs font-semibold transition-all shrink-0 active:scale-95 shadow-sm"
              title={`Remove ${currentDevice.deviceName || currentDevice.deviceId} from dashboard`}
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden sm:inline">Remove</span>
            </button>
          )}

          {/* Connection Status Badge (hidden on mobile, visible on sm+) */}
          <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold bg-slate-800/60 border-slate-700 shrink-0">
            {devices.length > 0 ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-emerald-400 font-mono">{devices.length} Online</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                <span className="text-amber-300 font-mono">Standby</span>
              </>
            )}
          </div>

          {/* Free Storage Modal Trigger (desktop) */}
          <button
            onClick={onOpenStorageModal}
            className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-purple-950/50 hover:bg-purple-900/60 border border-purple-700/60 text-xs font-medium text-purple-300 transition-colors shadow-sm shrink-0"
            title="Configure Free Storage (No Blaze Plan Required)"
          >
            <HardDrive className="w-3.5 h-3.5 text-purple-400" />
            <span>Storage: {storageConfig.provider === 'INLINE' ? 'Free Spark' : (storageConfig.provider || 'Free Spark')}</span>
          </button>

          {/* Firebase Setup Modal Trigger (desktop) */}
          <button
            onClick={onOpenSetupModal}
            className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition-colors shadow-sm shrink-0"
          >
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span>Firebase Setup</span>
          </button>
        </div>
      </div>
    </header>
  );
}
