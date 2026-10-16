import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, Play, Square, RefreshCw, AlertCircle, ShieldAlert, Maximize2, Minimize2 } from 'lucide-react';
import { triggerStartScreenStream, triggerStopScreenStream } from '../services/trackerService';

/**
 * Live screen stream viewer using PeerJS.
 * Connects to the Android peer (android-screen) and displays the video stream.
 * Allows remote start/stop request dispatch to the companion app.
 * Supports Full Screen Mode with custom HUD overlay and cross-browser Fullscreen API.
 */
export default function LiveScreenStream({ deviceId }) {
  const [peerId, setPeerId] = useState('');
  const [status, setStatus] = useState('Initializing WebRTC signaling...');
  const [isCalling, setIsCalling] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const peerRef = useRef(null);
  const callRef = useRef(null);

  // Read peerId from query param or use unique device screen peerId
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetPeer = params.get('peerId') || (deviceId ? `screen_${deviceId}` : 'android-screen');
    setPeerId(targetPeer);
  }, [deviceId]);

  // Cross-browser Full Screen toggle (HTML5 Fullscreen API + Fallback CSS state)
  const toggleFullscreen = () => {
    const doc = document;
    const isCurrentlyFullscreen = Boolean(
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
    );

    const targetEl = containerRef.current;
    if (!targetEl) return;

    if (!isCurrentlyFullscreen && !isFullscreen) {
      if (targetEl.requestFullscreen) {
        targetEl.requestFullscreen().catch(() => setIsFullscreen(true));
      } else if (targetEl.webkitRequestFullscreen) {
        targetEl.webkitRequestFullscreen();
      } else if (targetEl.mozRequestFullScreen) {
        targetEl.mozRequestFullScreen();
      } else if (targetEl.msRequestFullscreen) {
        targetEl.msRequestFullscreen();
      } else {
        setIsFullscreen(true);
      }
    } else {
      if (doc.exitFullscreen) {
        doc.exitFullscreen().catch(() => {});
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      } else if (doc.mozCancelFullScreen) {
        doc.mozCancelFullScreen();
      } else if (doc.msExitFullscreen) {
        doc.msExitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  // Sync fullscreen change events & handle Escape / F shortcut keys
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = Boolean(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      setIsFullscreen(isFs);
    };

    const handleKeyDown = (e) => {
      if ((e.key === 'f' || e.key === 'F') && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        toggleFullscreen();
      } else if (e.key === 'Escape' && isFullscreen) {
        if (document.fullscreenElement) {
          try { document.exitFullscreen(); } catch (_) {}
        }
        setIsFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  const connectToPeer = () => {
    if (!peerId) return;

    if (typeof window.Peer !== 'function') {
      setStatus('PeerJS library is still loading. Please check internet connection.');
      return;
    }

    // Clean existing call or peer
    try {
      if (callRef.current) callRef.current.close();
      if (peerRef.current) peerRef.current.destroy();
    } catch (_) {}

    let peer;
    try {
      // Connect to free official PeerJS Cloud server with default configuration
      peer = new window.Peer();
      peerRef.current = peer;
    } catch (err) {
      setStatus(`PeerJS initialization error: ${err.message}`);
      return;
    }

    setStatus('Connecting to WebRTC signaling server...');

    peer.on('open', function(assignedId) {
      setStatus(`Connected to signaling server (My ID: ${assignedId}). Calling ${peerId}...`);
      makeCall(peer);
    });

    peer.on('error', function(err) {
      console.warn('PeerJS client error:', err);
      setIsCalling(false);
      const errType = err.type || '';
      const errMsg = err.message || '';

      if (errType === 'peer-unavailable') {
        setStatus(`Screen stream is not currently broadcasting on phone. Tap "Prompt Android Screen Stream" below (or open app on phone and tap "Start Stream"), then click Reconnect.`);
      } else if (errType === 'server-error' || errType === 'socket-error' || errType === 'socket-closed') {
        setStatus(`Signaling server connection lost: ${errMsg || errType}. Click Reconnect.`);
      } else {
        setStatus(`Peer status: ${errMsg || errType || 'Disconnected'}`);
      }
    });
  };

  const makeCall = (peerInstance) => {
    const peer = peerInstance || peerRef.current;
    if (!peer || !peerId) return;

    try {
      setIsCalling(true);
      let outgoingStream;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        outgoingStream = canvas.captureStream ? canvas.captureStream(1) : new MediaStream();
      } catch (_) {
        outgoingStream = new MediaStream();
      }
      const call = peer.call(peerId, outgoingStream);
      callRef.current = call;

      call.on('stream', function(remoteStream) {
        setIsCalling(false);
        if (videoRef.current) {
          videoRef.current.srcObject = remoteStream;
          videoRef.current.play().then(() => {
            setStatus('Live screen streaming');
          }).catch(() => {
            setStatus('Stream received - tap video to play');
            const fallPlay = () => {
              if (videoRef.current) {
                videoRef.current.play().then(() => setStatus('Live screen streaming')).catch(() => {});
                videoRef.current.removeEventListener('click', fallPlay);
              }
            };
            if (videoRef.current) {
              videoRef.current.addEventListener('click', fallPlay, { once: true });
            }
          });
        }
      });

      call.on('close', function() {
        setIsCalling(false);
        setStatus('Screen stream ended by Android phone');
      });

      call.on('error', function(err) {
        setIsCalling(false);
        setStatus(`Call error: ${err.message || err.type || err}`);
      });
    } catch (err) {
      setIsCalling(false);
      setStatus(`Call failed: ${err.message || err}`);
    }
  };

  useEffect(() => {
    connectToPeer();

    return () => {
      try {
        if (callRef.current) callRef.current.close();
        if (peerRef.current) peerRef.current.destroy();
      } catch (_) {}
    };
  }, [peerId]);

  const handleRequestBroadcast = async () => {
    if (!deviceId) return;
    try {
      setActionLoading(true);
      setActionMsg('Sending START_SCREEN_STREAM command to phone...');
      await triggerStartScreenStream(deviceId, peerId);
      setActionMsg('Command dispatched! Phone will prompt screen capture permission.');
      // Auto-retry connection after 3.5 seconds
      setTimeout(() => {
        connectToPeer();
        setActionLoading(false);
      }, 3500);
    } catch (err) {
      setActionLoading(false);
      setActionMsg(`Failed to send stream command: ${err.message}`);
    }
  };

  const handleStopBroadcast = async () => {
    if (!deviceId) return;
    try {
      setActionLoading(true);
      await triggerStopScreenStream(deviceId);
      setActionMsg('STOP command sent to phone.');
      if (callRef.current) callRef.current.close();
      setStatus('Broadcast stopped');
    } catch (err) {
      setActionMsg(`Stop failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const isLive = status === 'Live screen streaming';

  return (
    <div
      ref={containerRef}
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-black flex flex-col justify-between w-screen h-screen overflow-hidden'
          : 'bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4'
      }
    >
      {/* Top Header (Standard or Fullscreen HUD) */}
      <div
        className={
          isFullscreen
            ? 'p-4 sm:p-6 bg-gradient-to-b from-black/95 via-black/70 to-transparent flex items-center justify-between z-30'
            : 'flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-slate-800 gap-3'
        }
      >
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-cyan-950/60 border border-cyan-800/40 text-cyan-400">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-bold text-white">Live Screen Stream</h3>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  isLive
                    ? 'bg-emerald-950 border border-emerald-600/60 text-emerald-300 animate-pulse'
                    : 'bg-slate-800 border border-slate-700 text-slate-400'
                }`}
              >
                {isLive ? 'LIVE' : 'STANDBY'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Target Peer: <span className="font-mono text-cyan-300">{peerId}</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
          <button
            onClick={handleRequestBroadcast}
            disabled={actionLoading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-black transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
            title="Send command to Android device to start screen broadcast"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Start Broadcast</span>
          </button>

          <button
            onClick={handleStopBroadcast}
            disabled={actionLoading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/60 text-rose-300 hover:text-white transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
            title="Stop screen broadcast on phone"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Stop</span>
          </button>

          <button
            onClick={() => connectToPeer()}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            title="Reconnect to signaling and re-call peer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reconnect</span>
          </button>

          {/* Full Screen Toggle Button */}
          <button
            onClick={toggleFullscreen}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm active:scale-95 cursor-pointer ${
              isFullscreen
                ? 'bg-red-600/80 hover:bg-red-500 text-white'
                : 'bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 hover:text-white'
            }`}
            title={isFullscreen ? 'Exit Full Screen (Esc)' : 'Enter Full Screen View (F)'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{isFullscreen ? 'Exit Full Screen' : 'Full Screen'}</span>
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className={`p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-800/40 text-cyan-300 text-xs flex items-center justify-between ${isFullscreen ? 'mx-6' : ''}`}>
          <span>{actionMsg}</span>
          <button onClick={() => setActionMsg(null)} className="text-cyan-500 hover:text-white text-xs ml-2 cursor-pointer">✕</button>
        </div>
      )}

      {/* Video Container */}
      <div
        className={
          isFullscreen
            ? 'flex-1 relative flex flex-col items-center justify-center bg-black overflow-hidden w-full h-full'
            : 'relative flex flex-col items-center justify-center bg-black/80 rounded-2xl border border-slate-800 overflow-hidden min-h-[360px] sm:min-h-[460px]'
        }
      >
        {/* Floating Quick Fullscreen Corner Button */}
        {!isFullscreen && (
          <div className="absolute top-3 right-3 z-20">
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-cyan-400 hover:text-white backdrop-blur-md transition-all shadow-lg cursor-pointer active:scale-95"
              title="Full Screen View"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        )}

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onDoubleClick={toggleFullscreen}
          className={
            isFullscreen
              ? 'w-full h-full max-h-[85vh] object-contain cursor-pointer'
              : 'w-full max-w-3xl max-h-[70vh] object-contain cursor-pointer'
          }
          title="Double-click to toggle Full Screen"
        />

        {!isLive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/70 backdrop-blur-xs">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-400 mb-3">
              <Smartphone className="w-6 h-6 text-cyan-400" />
            </div>
            <h4 className="text-sm font-semibold text-white mb-1">
              {status.includes('NOT active') ? 'Broadcast Waiting' : 'Live Screen Stream Standby'}
            </h4>
            <p className="text-xs text-slate-400 max-w-md leading-relaxed mb-4">
              {status}
            </p>
            <button
              onClick={handleRequestBroadcast}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold rounded-xl transition-all shadow-lg shadow-cyan-500/20 active:scale-95 cursor-pointer flex items-center space-x-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Prompt Android Screen Stream</span>
            </button>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div
        className={
          isFullscreen
            ? 'p-3 sm:p-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent text-xs flex items-center justify-between z-30'
            : 'p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs flex items-center justify-between'
        }
      >
        <div className="flex items-center space-x-2 truncate">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
          <span className="text-slate-300 truncate">{status}</span>
        </div>
        <div className="flex items-center space-x-3 shrink-0 ml-2">
          {isFullscreen && (
            <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
              Double-click or press ESC to exit
            </span>
          )}
          <span className="text-[10px] font-mono text-slate-500">PeerJS WebRTC</span>
        </div>
      </div>
    </div>
  );
}
