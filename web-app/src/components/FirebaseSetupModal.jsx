import React, { useState } from 'react';
import { X, Check, Copy, ExternalLink, Database, Smartphone, Globe } from 'lucide-react';

export default function FirebaseSetupModal({ isOpen, onClose }) {
  const [copiedKey, setCopiedKey] = useState(null);

  if (!isOpen) return null;

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const sampleEnv = `VITE_FIREBASE_API_KEY=AIzaSyYourActualApiKeyHere
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890`;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="relative w-full max-w-3xl max-h-[92vh] bg-slate-900 border border-slate-700 rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-800">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div className="p-2 sm:p-2.5 rounded-xl bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 shrink-0">
              <Database className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Firebase Integration Guide</h2>
              <p className="text-[11px] sm:text-xs text-slate-400">Connect both Android Mobile App and React Web Dashboard</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6 text-xs sm:text-sm text-slate-300">
          {/* Step 1 */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-2">
            <div className="flex items-center space-x-2 text-cyan-400 font-bold">
              <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-cyan-950 border border-cyan-700/60 flex items-center justify-center text-[10px] sm:text-xs shrink-0">1</span>
              <span>Create Firebase Project & Enable Services</span>
            </div>
            <p className="text-xs text-slate-400 pl-7 sm:pl-8">
              Open the{' '}
              <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="text-cyan-400 underline inline-flex items-center">
                Firebase Console <ExternalLink className="w-3 h-3 ml-1" />
              </a>{' '}
              and create a new project.
            </p>
            <ul className="text-xs space-y-1 pl-10 sm:pl-12 list-disc text-slate-300">
              <li><b>Firestore Database:</b> Create database in test mode or production mode (100% Free Spark Tier).</li>
              <li><b>Cloud Storage (Optional):</b> NOT required! The app now includes <b>Free Spark Inline</b> and <b>Cloudinary (25GB Free)</b> so you never need a paid Blaze plan or credit card.</li>
              <li><b>Authentication (Optional):</b> Enable Anonymous or Email/Password if needed.</li>
            </ul>
          </div>

          {/* Step 2: Android Setup */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="flex items-center space-x-2 text-emerald-400 font-bold">
                <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                <span>2. Android Mobile App Setup</span>
              </div>
              <span className="text-[10px] sm:text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40 self-start sm:self-auto">
                Package: com.nexus.androkiller
              </span>
            </div>
            <ol className="text-xs space-y-1.5 pl-4 list-decimal text-slate-300">
              <li>In Firebase Console, click <b>Add App &gt; Android</b>.</li>
              <li>Set Package name to: <code className="bg-slate-950 px-1.5 py-0.5 rounded text-cyan-300 font-mono text-[11px]">com.nexus.androkiller</code>.</li>
              <li>Download your <code className="bg-slate-950 px-1.5 py-0.5 rounded text-amber-300 font-mono text-[11px]">google-services.json</code>.</li>
              <li>Place it inside: <code className="bg-slate-950 px-1.5 py-0.5 rounded text-emerald-300 font-mono text-[11px] break-all">mobile-app/app/google-services.json</code>.</li>
            </ol>
          </div>

          {/* Step 3: Web App Setup */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-cyan-400 font-bold">
                <Globe className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                <span>3. Web Dashboard Setup</span>
              </div>
              <button
                onClick={() => copyToClipboard(sampleEnv, 'env')}
                className="flex items-center space-x-1 text-xs text-cyan-400 hover:text-cyan-300 touch-manipulation py-1 px-2"
              >
                {copiedKey === 'env' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'env' ? 'Copied' : 'Copy .env'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-400">
              In Firebase Console, click <b>Add App &gt; Web</b>. Copy keys into <code className="bg-slate-950 px-1.5 py-0.5 rounded text-cyan-300 font-mono text-[11px]">web-app/.env</code>:
            </p>
            <pre className="p-2.5 sm:p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[10px] sm:text-[11px] text-cyan-300 overflow-x-auto whitespace-pre">
              {sampleEnv}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition-colors shadow-lg shadow-cyan-950/40 touch-manipulation"
          >
            Got It!
          </button>
        </div>
      </div>
    </div>
  );
}
