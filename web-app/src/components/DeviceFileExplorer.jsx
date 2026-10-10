import React, { useState } from 'react';
import {
  Folder,
  File,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Download,
  RefreshCw,
  Search,
  HardDrive,
  CheckCircle,
  ExternalLink,
  Archive,
  Package,
  FileCode,
  Copy,
  Info,
  Check
} from 'lucide-react';
import { triggerStorageScan, triggerFetchFile, fetchAndDownloadRealDeviceFile } from '../services/trackerService';
import { downloadFileSafely } from '../utils/fileDownloader';
import DraggableWindow from './DraggableWindow';

export default function DeviceFileExplorer({ deviceId, files = [], storageInfo }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [copiedPath, setCopiedPath] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const handleScan = async () => {
    try {
      setScanning(true);
      setScanStatus('Dispatching storage scan command to phone...');
      await triggerStorageScan(deviceId);
      setScanStatus('Scan command sent! Device inventory will sync momentarily.');
      setTimeout(() => {
        setScanning(false);
        setScanStatus('');
      }, 4000);
    } catch (err) {
      setScanning(false);
      setScanStatus(`Scan failed: ${err.message}`);
    }
  };

  const getFileCategory = (f) => {
    if (f.category) {
      const cat = f.category.toUpperCase();
      if (cat === 'ARCHIVE' || cat === 'APK') return 'ARCHIVE';
      if (['IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO'].includes(cat)) return cat;
    }
    const ext = (f.extension || (f.name ? f.name.split('.').pop() : '')).toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'IMAGE';
    if (['pdf', 'doc', 'docx', 'txt', 'xlsx', 'pptx'].includes(ext)) return 'DOCUMENT';
    if (['mp3', 'm4a', 'aac', 'wav', 'ogg'].includes(ext)) return 'AUDIO';
    if (['mp4', 'mkv', '3gp', 'avi', 'mov'].includes(ext)) return 'VIDEO';
    if (['zip', 'apk', 'rar', 'tar', '7z', 'gz', 'obb', 'iso', 'bin'].includes(ext)) return 'ARCHIVE';
    return 'OTHER';
  };

  const getCategoryIcon = (category, ext = '') => {
    const normCat = category?.toUpperCase();
    if (normCat === 'IMAGE') return <ImageIcon className="w-4 h-4 text-cyan-400" />;
    if (normCat === 'DOCUMENT') return <FileText className="w-4 h-4 text-emerald-400" />;
    if (normCat === 'AUDIO') return <Music className="w-4 h-4 text-purple-400" />;
    if (normCat === 'VIDEO') return <Video className="w-4 h-4 text-rose-400" />;
    if (normCat === 'ARCHIVE') {
      if (ext.toLowerCase() === 'apk') return <Package className="w-4 h-4 text-amber-400" />;
      return <Archive className="w-4 h-4 text-amber-400" />;
    }
    return <FileCode className="w-4 h-4 text-indigo-400" />;
  };

  const handleDownloadFile = async (file) => {
    if (!file) return;
    const fileKey = file.id || file.path || file.name;
    setDownloadingId(fileKey);

    try {
      await fetchAndDownloadRealDeviceFile(deviceId, file, (statusText) => {
        setScanStatus(statusText);
      });
      setTimeout(() => setScanStatus(''), 4500);
    } catch (err) {
      setScanStatus(`Download error: ${err.message}`);
      setTimeout(() => setScanStatus(''), 5000);
    } finally {
      setTimeout(() => setDownloadingId(null), 1200);
    }
  };

  const filteredFiles = files.filter((f) => {
    const matchesSearch =
      (f.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (f.folder || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (f.extension || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const fileCat = getFileCategory(f);
    const matchesCategory = activeCategory === 'ALL' || fileCat === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = [
    { id: 'ALL', label: 'All Files', count: files.length },
    { id: 'ARCHIVE', label: 'APKs & Archives', count: files.filter(f => getFileCategory(f) === 'ARCHIVE').length },
    { id: 'IMAGE', label: 'Photos', count: files.filter(f => getFileCategory(f) === 'IMAGE').length },
    { id: 'DOCUMENT', label: 'Documents', count: files.filter(f => getFileCategory(f) === 'DOCUMENT').length },
    { id: 'AUDIO', label: 'Audio', count: files.filter(f => getFileCategory(f) === 'AUDIO').length },
    { id: 'VIDEO', label: 'Videos', count: files.filter(f => getFileCategory(f) === 'VIDEO').length },
    { id: 'OTHER', label: 'Other Files', count: files.filter(f => getFileCategory(f) === 'OTHER').length }
  ];

  const formatTimestamp = (ts) => {
    if (!ts) return 'Unknown';
    return new Date(ts).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleCopyPath = (path) => {
    if (!path) return;
    navigator.clipboard?.writeText(path);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2500);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 sm:p-2.5 rounded-xl bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 shrink-0">
            <HardDrive className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>Device Storage & Files Explorer</span>
              <span className="text-[10px] font-mono bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800/40">
                {files.length} Files Discovered
              </span>
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400">
              Browse Downloads, APK packages, ZIP archives, DCIM, and Documents with 1-click Download
            </p>
          </div>
        </div>

        {/* Scan & Refresh Trigger */}
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center justify-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-black shadow-md shadow-cyan-950/40 transition-all disabled:opacity-50 touch-manipulation self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
          <span>{scanning ? 'Scanning Device Storage...' : 'Scan & Sync Phone Files'}</span>
        </button>
      </div>

      {scanStatus && (
        <div className="text-xs px-3.5 py-2 rounded-xl bg-slate-800/90 border border-cyan-500/40 text-cyan-300 flex items-center justify-between shadow-lg">
          <span>{scanStatus}</span>
          <button onClick={() => setScanStatus('')} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Storage Gauge Summary */}
      {storageInfo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 bg-slate-950/50 p-3 rounded-xl border border-slate-800 text-xs">
          <div>
            <div className="text-slate-400 text-[10px]">Used Storage</div>
            <div className="font-bold text-white mt-0.5">{storageInfo.usedStorageGB} GB</div>
          </div>
          <div>
            <div className="text-slate-400 text-[10px]">Free Storage</div>
            <div className="font-bold text-emerald-400 mt-0.5">{storageInfo.freeStorageGB} GB</div>
          </div>
          <div>
            <div className="text-slate-400 text-[10px]">Total Storage</div>
            <div className="font-bold text-purple-300 mt-0.5">{storageInfo.totalStorageGB} GB</div>
          </div>
          <div>
            <div className="text-slate-400 text-[10px]">RAM Available</div>
            <div className="font-bold text-cyan-300 mt-0.5">{storageInfo.freeRamGB} / {storageInfo.totalRamGB} GB</div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category Pills (Including APKs & Archives, Other) */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1.5 ${
                activeCategory === cat.id
                  ? 'bg-cyan-500 text-black font-bold shadow-md shadow-cyan-950/40'
                  : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60'
              }`}
            >
              <span>{cat.label}</span>
              <span className="text-[10px] opacity-75 font-mono">({cat.count})</span>
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[200px] sm:min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search APKs, ZIPs, photos..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
          />
        </div>
      </div>

      {/* Files List / Table */}
      {filteredFiles.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-950/30 p-6 space-y-3">
          <Folder className="w-10 h-10 text-slate-600 mx-auto" />
          <div>
            <h3 className="text-sm font-semibold text-slate-300">
              {files.length === 0 ? 'No Storage Files Synced Yet' : 'No Files Match Search Query'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Click &quot;Scan & Sync Phone Files&quot; above to scan public storage folders on the phone.
            </p>
          </div>
          {files.length === 0 && (
            <button
              onClick={handleScan}
              disabled={scanning}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-500 text-black hover:bg-cyan-400 transition-colors shadow-md shadow-cyan-950/50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              <span>Trigger Initial Storage Scan</span>
            </button>
          )}
        </div>
      ) : (
        <div>
          {/* Mobile Card List (sm:hidden) */}
          <div className="block sm:hidden space-y-2.5">
            {filteredFiles.map((file) => {
              const category = getFileCategory(file);
              const fileKey = file.id || file.path || file.name;
              const isDownloading = downloadingId === fileKey;

              return (
                <div
                  key={fileKey}
                  onClick={() => setSelectedFile(file)}
                  className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 shadow-md space-y-2 active:bg-slate-850 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="p-2 rounded-lg bg-slate-850 shrink-0">
                        {getCategoryIcon(category, file.extension)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">{file.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{file.folder || 'Storage'}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-slate-800 text-cyan-300 border border-slate-700 shrink-0">
                      {category}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[11px]">
                    <span className="text-slate-300 font-mono font-medium">{file.sizeFormatted || 'Unknown'}</span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadFile(file);
                        }}
                        disabled={isDownloading}
                        className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-black font-bold text-xs inline-flex items-center space-x-1.5 shadow-sm touch-manipulation"
                      >
                        <Download className={`w-3.5 h-3.5 ${isDownloading ? 'animate-bounce' : ''}`} />
                        <span>{isDownloading ? 'Downloading...' : 'Download'}</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(file);
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 touch-manipulation"
                        title="Inspect"
                      >
                        <Info className="w-3.5 h-3.5 text-cyan-400" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table (hidden sm:block) */}
          <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 text-[11px] uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">File Name</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Folder Location</th>
                  <th className="py-2.5 px-3">Size</th>
                  <th className="py-2.5 px-3">Last Modified</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
              {filteredFiles.map((file) => {
                const category = getFileCategory(file);
                const fileKey = file.id || file.path || file.name;
                const isDownloading = downloadingId === fileKey;

                return (
                  <tr
                    key={fileKey}
                    onClick={() => setSelectedFile(file)}
                    className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                    title="Click to inspect in Draggable Window"
                  >
                    <td className="py-2.5 px-3 font-medium text-slate-200">
                      <div className="flex items-center space-x-2">
                        <div className="p-1 rounded bg-slate-800/80 shrink-0">
                          {getCategoryIcon(category, file.extension)}
                        </div>
                        <span className="truncate max-w-[200px] sm:max-w-xs text-white group-hover:text-cyan-300 transition-colors" title={file.name}>
                          {file.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        category === 'ARCHIVE'
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-800/50'
                          : category === 'IMAGE'
                          ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/50'
                          : category === 'DOCUMENT'
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/50'
                          : category === 'AUDIO'
                          ? 'bg-purple-950/80 text-purple-300 border border-purple-800/50'
                          : category === 'VIDEO'
                          ? 'bg-rose-950/80 text-rose-300 border border-rose-800/50'
                          : 'bg-indigo-950/80 text-indigo-300 border border-indigo-800/50'
                      }`}>
                        {category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px] truncate max-w-[150px]">
                      {file.folder || 'Internal'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-mono text-[11px] whitespace-nowrap">
                      {file.sizeFormatted || 'Unknown'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                      {formatTimestamp(file.lastModified)}
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-1.5 whitespace-nowrap">
                      {/* Direct Download Button for Every File */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadFile(file);
                        }}
                        disabled={isDownloading}
                        className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-semibold text-[11px] inline-flex items-center space-x-1 shadow-sm transition-all disabled:opacity-50"
                        title="Download file to computer"
                      >
                        <Download className={`w-3 h-3 ${isDownloading ? 'animate-bounce text-cyan-200' : ''}`} />
                        <span>{isDownloading ? 'Downloading...' : 'Download'}</span>
                      </button>

                      {/* Inspect Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(file);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[11px] border border-slate-700 inline-flex items-center space-x-1"
                        title="Open in Draggable Window"
                      >
                        <Info className="w-3 h-3 text-cyan-400" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    )}

      {/* DRAGGABLE WINDOW: File Details Inspector */}
      {selectedFile && (
        <DraggableWindow
          title={`File Inspector: ${selectedFile.name}`}
          icon={HardDrive}
          badge={getFileCategory(selectedFile)}
          badgeColor="bg-amber-950 text-amber-300 border-amber-800"
          isOpen={!!selectedFile}
          onClose={() => setSelectedFile(null)}
        >
          <div className="space-y-4 text-xs">
            <div className="bg-slate-950 rounded-xl p-3.5 border border-slate-800 space-y-2.5">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                  {getCategoryIcon(getFileCategory(selectedFile), selectedFile.extension)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-white text-sm truncate" title={selectedFile.name}>
                    {selectedFile.name}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {selectedFile.extension ? `.${selectedFile.extension.toUpperCase()}` : 'File'} • {selectedFile.sizeFormatted}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800/80 pt-2 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Category:</span>
                  <span className="font-bold text-amber-300">{getFileCategory(selectedFile)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Folder Location:</span>
                  <span className="text-white font-mono">{selectedFile.folder || 'Downloads'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Last Modified:</span>
                  <span className="text-slate-300 font-mono">{formatTimestamp(selectedFile.lastModified)}</span>
                </div>
                {selectedFile.path && (
                  <div className="space-y-1">
                    <span className="text-slate-400">Absolute Storage Path:</span>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-slate-300 break-all select-all">
                      {selectedFile.path}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-1">
              {/* Copy Path */}
              {selectedFile.path && (
                <button
                  onClick={() => handleCopyPath(selectedFile.path)}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center justify-center space-x-1.5 transition-colors border border-slate-700"
                >
                  <Copy className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{copiedPath ? 'Path Copied!' : 'Copy Device Path'}</span>
                </button>
              )}

              {/* Direct Download in Draggable Window */}
              <button
                onClick={() => handleDownloadFile(selectedFile)}
                disabled={downloadingId === (selectedFile.id || selectedFile.path || selectedFile.name)}
                className="flex-1 py-2 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold flex items-center justify-center space-x-1.5 transition-colors shadow-md shadow-cyan-950/50 disabled:opacity-50"
              >
                <Download className={`w-3.5 h-3.5 ${downloadingId === (selectedFile.id || selectedFile.path || selectedFile.name) ? 'animate-bounce' : ''}`} />
                <span>{downloadingId === (selectedFile.id || selectedFile.path || selectedFile.name) ? 'Downloading...' : 'Download File'}</span>
              </button>
            </div>
          </div>
        </DraggableWindow>
      )}
    </div>
  );
}
