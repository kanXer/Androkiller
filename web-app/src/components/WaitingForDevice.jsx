import React, { useState } from 'react';
import {
  Smartphone,
  Radio,
  Wifi,
  Shield,
  Activity,
  MapPin,
  Camera,
  HardDrive,
  Database,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Play
} from 'lucide-react';
import { isFirebaseConfigured } from '../firebase/config';

export default function WaitingForDevice({
  onOpenSetupModal,
  onOpenStorageModal,
  onSimulateDevice
}) {
  const isConnectedToFirebase = isFirebaseConfigured();

  return (
    <div className="max-w-4xl mx-auto py-6 sm:py-12 px-3 sm:px-6 space-y-6 sm:space-y-8 animate-fade-in">
      {/* Central Cyber Radar Scanning Visual */}
      <div className="relative flex flex-col items-center justify-center text-center p-8 sm:p-14 rounded-3xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl shadow-2xl ring-1 ring-white/5 overflow-hidden">
        {/* Radar concentric wave rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-96 h-96 rounded-full border border-cyan-500/10 animate-ping opacity-30" style={{ animationDuration: '4s' }} />
          <div className="w-72 h-72 rounded-full border border-cyan-500/20 animate-pulse" />
          <div className="w-48 h-48 rounded-full border border-purple-500/20" />
          <div className="w-24 h-24 rounded-full bg-cyan-500/5 blur-xl" />
        </div>

        {/* Center Animated Smartphone Beacon */}
        <div className="relative mb-6">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-br from-cyan-500/20 via-slate-900 to-purple-600/20 border-2 border-cyan-400/50 flex items-center justify-center shadow-xl shadow-cyan-950/80 relative z-10 group">
            <Smartphone className="w-10 h-10 sm:w-12 sm:h-12 text-cyan-400 drop-shadow-[0_0_12px_rgba(0,229,255,0.8)] animate-pulse" />
            <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-400 border-2 border-slate-950 flex items-center justify-center shadow-md">
              <Radio className="w-3 h-3 text-slate-950 animate-spin" style={{ animationDuration: '3s' }} />
            </div>
          </div>
        </div>

        {/* Status Pill */}
        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-slate-800/90 border border-amber-500/30 text-amber-300 text-xs font-mono font-medium mb-4 shadow-inner">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span>STANDBY • LISTENING FOR ANDROID CONNECTION</span>
        </div>

        {/* Main Header Text */}
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-wide mb-3">
          Waiting for Android Device Connection
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto leading-relaxed mb-6 font-normal">
          No Android devices are currently connected. As soon as an Android phone connects via the <span className="text-cyan-400 font-semibold">Nexus AndroKiller</span> app, it will appear here automatically. When connection closes, it will disappear.
        </p>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center justify-center gap-3 relative z-10">
          <button
            onClick={onOpenSetupModal}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-all hover:scale-[1.02] shadow-sm"
          >
            <Database className="w-4 h-4 text-cyan-400" />
            <span>Firebase Configuration</span>
            <span className={`w-2 h-2 rounded-full ml-1 ${isConnectedToFirebase ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          </button>

          {onSimulateDevice && (
            <button
              onClick={onSimulateDevice}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-xs font-semibold text-white shadow-lg shadow-cyan-900/40 transition-all hover:scale-[1.02]"
              title="Test the dashboard with a simulated device connection"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Simulate Android Connection (Demo)</span>
            </button>
          )}
        </div>
      </div>

      {/* How to Connect 3-Step Guide */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 backdrop-blur-md space-y-2.5 hover:border-cyan-500/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="w-7 h-7 rounded-lg bg-cyan-950 border border-cyan-800/60 text-cyan-400 font-mono font-bold text-xs flex items-center justify-center">
              1
            </span>
            <Smartphone className="w-4 h-4 text-slate-500" />
          </div>
          <h3 className="font-bold text-sm text-white">Open AndroKiller App</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Install and open the <span className="text-slate-300 font-mono">AndroKiller-v1.0.1-release.apk</span> on the target Android device.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 backdrop-blur-md space-y-2.5 hover:border-cyan-500/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="w-7 h-7 rounded-lg bg-purple-950 border border-purple-800/60 text-purple-400 font-mono font-bold text-xs flex items-center justify-center">
              2
            </span>
            <Shield className="w-4 h-4 text-slate-500" />
          </div>
          <h3 className="font-bold text-sm text-white">Grant All Permissions</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Tap <span className="text-emerald-400 font-semibold">"Grant All Permissions"</span> in the app. Tracking service starts automatically.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 backdrop-blur-md space-y-2.5 hover:border-cyan-500/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="w-7 h-7 rounded-lg bg-emerald-950 border border-emerald-800/60 text-emerald-400 font-mono font-bold text-xs flex items-center justify-center">
              3
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <h3 className="font-bold text-sm text-white">Instant Auto-Discovery</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Your phone connects in real-time. Live GPS, calls, SMS, camera, and files will unlock here instantly.
          </p>
        </div>
      </div>
    </div>
  );
}
