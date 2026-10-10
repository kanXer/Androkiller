import React, { useState } from 'react';
import { AppWindow, Search, RefreshCw, Shield, CheckCircle2, Clock, Filter, AlertCircle, Smartphone } from 'lucide-react';
import { triggerSyncInstalledApps } from '../services/trackerService';

export default function InstalledAppsExplorer({ deviceId, installedAppsData }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL'); // ALL, USER, SYSTEM
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);

  const apps = installedAppsData?.apps || [];
  const totalCount = installedAppsData?.totalCount ?? apps.length;
  const userAppsCount = installedAppsData?.userAppsCount ?? apps.filter(a => !a.isSystemApp).length;
  const systemAppsCount = totalCount - userAppsCount;
  const lastSynced = installedAppsData?.lastSynced;

  const handleSync = async () => {
    if (!deviceId) return;
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      await triggerSyncInstalledApps(deviceId);
      setSyncStatus({ success: true, message: 'Sync command dispatched to device' });
      setTimeout(() => setSyncStatus(null), 4000);
    } catch (err) {
      setSyncStatus({ success: false, message: 'Failed to request apps sync' });
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredApps = apps.filter(app => {
    const matchesQuery = (app.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (app.packageName || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesQuery) return false;
    if (filterType === 'USER') return !app.isSystemApp;
    if (filterType === 'SYSTEM') return app.isSystemApp;
    return true;
  });

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Pre-installed';
    try {
      const date = typeof timestamp === 'number' ? new Date(timestamp) : (timestamp.toDate ? timestamp.toDate() : new Date(timestamp));
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (_) {
      return 'N/A';
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-5">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-600/40 text-cyan-400">
            <AppWindow className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base sm:text-lg font-bold text-white">Installed Applications</h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {apps.length} Found
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Live inventory of packages installed on child device
            </p>
          </div>
        </div>

        {/* Sync button & status */}
        <div className="flex items-center space-x-2">
          {syncStatus && (
            <span className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${
              syncStatus.success
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
            }`}>
              {syncStatus.message}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 text-black font-bold text-xs hover:bg-cyan-400 transition-all shadow-md disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Scanning...' : 'Sync Apps'}</span>
          </button>
        </div>
      </div>

      {/* Overview Stats Bar */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 font-medium">Total Apps</div>
            <div className="text-lg sm:text-xl font-bold text-white font-mono">{totalCount}</div>
          </div>
          <Smartphone className="w-5 h-5 text-slate-500" />
        </div>
        <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-xl p-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-emerald-400 font-medium">User Apps</div>
            <div className="text-lg sm:text-xl font-bold text-emerald-300 font-mono">{userAppsCount}</div>
          </div>
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
        </div>
        <div className="bg-purple-950/20 border border-purple-800/40 rounded-xl p-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-purple-400 font-medium">System Apps</div>
            <div className="text-lg sm:text-xl font-bold text-purple-300 font-mono">{systemAppsCount}</div>
          </div>
          <Shield className="w-5 h-5 text-purple-500" />
        </div>
      </div>

      {/* Filters & Search Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by app name or package (e.g. WhatsApp, chrome)..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
          {[
            { id: 'ALL', label: `All (${apps.length})` },
            { id: 'USER', label: `User Apps (${userAppsCount})` },
            { id: 'SYSTEM', label: `System (${systemAppsCount})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterType === tab.id
                  ? 'bg-cyan-500 text-black shadow-sm font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Apps Grid */}
      <div className="max-h-[500px] overflow-y-auto pr-1 space-y-2">
        {filteredApps.length === 0 ? (
          <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-slate-800/80">
            <AppWindow className="w-10 h-10 text-slate-600 mx-auto mb-2 opacity-50" />
            <p className="text-xs text-slate-400 font-medium">No installed applications found</p>
            <p className="text-[11px] text-slate-500 mt-1">Try syncing with the device or modifying your search filter.</p>
          </div>
        ) : (
          filteredApps.map((app, idx) => (
            <div
              key={app.packageName || idx}
              className="bg-slate-950/60 hover:bg-slate-950 border border-slate-800/80 hover:border-slate-700/80 rounded-xl p-3 transition-all flex items-center justify-between gap-3 group"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border ${
                  app.isSystemApp
                    ? 'bg-purple-950/40 text-purple-400 border-purple-800/40'
                    : 'bg-cyan-950/40 text-cyan-400 border-cyan-800/40'
                }`}>
                  {(app.name || 'A')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-cyan-300 transition-colors">
                      {app.name}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">v{app.versionName || '1.0'}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono truncate max-w-[280px] sm:max-w-md">
                    {app.packageName}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2.5 shrink-0">
                <div className="hidden sm:block text-right">
                  <div className="text-[10px] text-slate-500">Installed</div>
                  <div className="text-[11px] text-slate-300 font-mono">{formatDate(app.installTime)}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  app.isSystemApp
                    ? 'bg-purple-950/60 text-purple-300 border-purple-700/50'
                    : 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50'
                }`}>
                  {app.isSystemApp ? 'SYSTEM' : 'USER'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
