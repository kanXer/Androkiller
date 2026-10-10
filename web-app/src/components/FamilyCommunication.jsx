import React, { useState } from 'react';
import { Bell, Send, MessageSquare, Check, Volume2, Smartphone, Trash2, RefreshCw } from 'lucide-react';
import { sendFamilyMessage, triggerPhoneRing, triggerChatOverlay, clearFamilyChat } from '../services/trackerService';

export default function FamilyCommunication({ currentDevice, messages = [] }) {
  const [inputText, setInputText] = useState('');
  const [ringing, setRinging] = useState(false);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const deviceId = currentDevice?.deviceId || currentDevice?.id || 'dev_preview_nexus';

  const handleSendMessage = async (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    try {
      await sendFamilyMessage(deviceId, text);
      setInputText('');
      setStatusMsg('Message dispatched to child phone!');
      setTimeout(() => setStatusMsg(''), 3000);
    } catch (err) {
      setStatusMsg(`Failed: ${err.message}`);
    }
  };

  const handleRingPhone = async () => {
    try {
      setRinging(true);
      await triggerPhoneRing(deviceId);
      setStatusMsg('🔊 Loud alarm triggered on child device!');
      setTimeout(() => {
        setRinging(false);
        setStatusMsg('');
      }, 5000);
    } catch (err) {
      setRinging(false);
      setStatusMsg(`Failed to ring: ${err.message}`);
    }
  };

  const handleLaunchChatOverlay = async () => {
    try {
      setOverlayLoading(true);
      await triggerChatOverlay(deviceId);
      setStatusMsg('📲 Chat overlay dialog launched on child phone screen!');
      setTimeout(() => {
        setOverlayLoading(false);
        setStatusMsg('');
      }, 5000);
    } catch (err) {
      setOverlayLoading(false);
      setStatusMsg(`Failed to launch overlay: ${err.message}`);
    }
  };

  const handleClearChatBoth = async () => {
    if (!window.confirm('⚠️ Are you sure you want to clear chat history for BOTH Parent and Child?\n\nAll messages will be permanently removed from this dashboard and the child phone screen.')) {
      return;
    }
    try {
      setClearingChat(true);
      await clearFamilyChat(deviceId);
      setStatusMsg('🧹 Chat history permanently cleared for both Parent and Child!');
      setTimeout(() => setStatusMsg(''), 4000);
    } catch (err) {
      setStatusMsg(`Failed to clear chat: ${err.message}`);
    } finally {
      setClearingChat(false);
    }
  };

  const quickPresets = [
    'Where are you right now?',
    'Please call back immediately',
    'Time to head home!',
    'Everything okay?',
    'Reached school safely?'
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 sm:pb-4 border-b border-slate-800 gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-purple-950/60 border border-purple-800/40 text-purple-400">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base sm:text-lg font-bold text-white">Live Family Chat & Messenger</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800/40">
                {messages.length} Messages
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400">
              Two-way high-priority parent-child messaging with live screen overlay
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Clear Chat for Both */}
          <button
            onClick={handleClearChatBoth}
            disabled={clearingChat || messages.length === 0}
            className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/50 text-rose-300 shadow-sm transition-all disabled:opacity-40 touch-manipulation"
            title="Permanently erase all chat messages on both Web UI and child mobile phone"
          >
            <Trash2 className={`w-3.5 h-3.5 ${clearingChat ? 'animate-spin' : ''}`} />
            <span>{clearingChat ? 'Clearing...' : 'Clear Chat (Both)'}</span>
          </button>

          {/* Pop-up Chat Screen Overlay on Mobile */}
          <button
            onClick={handleLaunchChatOverlay}
            disabled={overlayLoading}
            className="flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-950/40 transition-all touch-manipulation disabled:opacity-50"
            title="Pop-up live interactive chat screen over whatever the child is doing on their phone"
          >
            <Smartphone className="w-4 h-4" />
            <span>{overlayLoading ? 'Opening on Phone...' : 'Start Live Chat Overlay'}</span>
          </button>

          {/* Emergency Alarm Ring */}
          <button
            onClick={handleRingPhone}
            disabled={ringing}
            className={`flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all touch-manipulation ${
              ringing
                ? 'bg-amber-500 text-black animate-pulse font-bold'
                : 'bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-950/40'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>{ringing ? 'Ringing Phone...' : 'Ring Alarm'}</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="text-xs px-3.5 py-2.5 rounded-xl bg-slate-800/90 border border-purple-500/40 text-purple-200 flex items-center justify-between shadow-lg">
          <span className="font-medium">{statusMsg}</span>
          <button onClick={() => setStatusMsg('')} className="text-slate-400 hover:text-white p-1">✕</button>
        </div>
      )}

      {/* Messages Feed */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3 min-h-[300px] max-h-[460px] overflow-y-auto">
        {messages.length === 0 ? (
          <div className="text-center py-16 text-xs text-slate-500 italic space-y-2">
            <MessageSquare className="w-8 h-8 text-slate-700 mx-auto" />
            <p>No family messages exchanged yet.</p>
            <p className="text-[11px] text-slate-600">Send a check-in message below to start a live conversation.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isParent = msg.sender === 'PARENT';
            return (
              <div
                key={msg.id || msg.timestamp}
                className={`flex flex-col ${isParent ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[70%] px-4 py-2.5 rounded-2xl text-xs ${
                    isParent
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-br-none shadow-md shadow-purple-950/50'
                      : 'bg-slate-800 text-slate-100 border border-slate-700 rounded-bl-none shadow-md'
                  }`}
                >
                  <div className="text-[10px] opacity-80 font-bold mb-0.5 flex items-center justify-between gap-4">
                    <span>{isParent ? 'Parent / Guardian' : 'Child Device'}</span>
                    <span className="font-mono text-[9px] font-normal">
                      {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                    </span>
                  </div>
                  <div className="leading-relaxed text-[13px]">{msg.text}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Quick message presets */}
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
        {quickPresets.map((preset, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(preset)}
            className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-[11px] text-slate-300 hover:text-white whitespace-nowrap transition-colors touch-manipulation"
          >
            {preset}
          </button>
        ))}
      </div>

      {/* Message input bar */}
      <div className="flex items-center space-x-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Type message to send to child's phone..."
          className="flex-1 bg-transparent px-3 py-2 text-xs sm:text-sm text-white focus:outline-none placeholder-slate-500"
        />
        <button
          onClick={() => handleSendMessage()}
          disabled={!inputText.trim()}
          className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-purple-950/50 transition-all disabled:opacity-40 flex items-center space-x-1.5 touch-manipulation shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send</span>
        </button>
      </div>
    </div>
  );
}
