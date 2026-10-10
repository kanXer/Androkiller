import React, { useState, useEffect } from 'react';
import { X, Check, Save, HardDrive, Zap, Cloud, Database, ExternalLink, ShieldCheck, Info } from 'lucide-react';
import { saveStorageConfig } from '../services/trackerService';

export default function StorageSettingsModal({ isOpen, onClose, currentConfig = {} }) {
  const [provider, setProvider] = useState(currentConfig.provider || 'INLINE');
  const [cloudinaryCloudName, setCloudinaryCloudName] = useState(currentConfig.cloudinaryCloudName || '');
  const [cloudinaryUploadPreset, setCloudinaryUploadPreset] = useState(currentConfig.cloudinaryUploadPreset || '');
  const [supabaseUrl, setSupabaseUrl] = useState(currentConfig.supabaseUrl || '');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(currentConfig.supabaseAnonKey || '');
  const [supabaseBucket, setSupabaseBucket] = useState(currentConfig.supabaseBucket || 'media');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setProvider(currentConfig.provider || 'INLINE');
      setCloudinaryCloudName(currentConfig.cloudinaryCloudName || '');
      setCloudinaryUploadPreset(currentConfig.cloudinaryUploadPreset || '');
      setSupabaseUrl(currentConfig.supabaseUrl || '');
      setSupabaseAnonKey(currentConfig.supabaseAnonKey || '');
      setSupabaseBucket(currentConfig.supabaseBucket || 'media');
      setSaveSuccess(false);
    }
  }, [isOpen, currentConfig]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    const configToSave = {
      provider,
      cloudinaryCloudName: cloudinaryCloudName.trim(),
      cloudinaryUploadPreset: cloudinaryUploadPreset.trim(),
      supabaseUrl: supabaseUrl.trim(),
      supabaseAnonKey: supabaseAnonKey.trim(),
      supabaseBucket: supabaseBucket.trim() || 'media'
    };

    const ok = await saveStorageConfig(configToSave);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1200);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="relative w-full max-w-2xl max-h-[92vh] bg-slate-900 border border-slate-700 rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-800">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div className="p-2 sm:p-2.5 rounded-xl bg-purple-950/60 border border-purple-800/40 text-purple-400 shrink-0">
              <HardDrive className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Free Media Storage Provider</span>
                <span className="text-[10px] font-mono bg-emerald-950/80 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800/50">
                  NO BLAZE PLAN REQUIRED
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Choose how snapshots & audio recordings are stored without paying for Firebase Cloud Storage
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSave} className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 text-xs sm:text-sm text-slate-300">
          {/* Storage Provider Options */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 1. Free Inline Data URI */}
            <div
              onClick={() => setProvider('INLINE')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                provider === 'INLINE'
                  ? 'bg-purple-950/40 border-purple-500 shadow-md shadow-purple-950/50'
                  : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center space-x-1.5 text-purple-400 font-bold text-xs">
                  <Zap className="w-4 h-4" />
                  <span>Free Spark Inline</span>
                </div>
                {provider === 'INLINE' && <Check className="w-3.5 h-3.5 text-purple-400" />}
              </div>
              <p className="text-[11px] text-slate-400">
                100% Free inside Firestore. Automatically compresses photos & audio into Base64 data URIs. Zero external setup.
              </p>
              <div className="mt-2 text-[10px] text-emerald-400 font-mono">
                ✓ Free Spark Plan • 0$ Cost
              </div>
            </div>

            {/* 2. Cloudinary */}
            <div
              onClick={() => setProvider('CLOUDINARY')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                provider === 'CLOUDINARY'
                  ? 'bg-cyan-950/40 border-cyan-500 shadow-md shadow-cyan-950/50'
                  : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center space-x-1.5 text-cyan-400 font-bold text-xs">
                  <Cloud className="w-4 h-4" />
                  <span>Cloudinary Free</span>
                </div>
                {provider === 'CLOUDINARY' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
              </div>
              <p className="text-[11px] text-slate-400">
                Generous 25 GB free storage/month. Direct CDN delivery for high-res images and audio. No credit card required.
              </p>
              <div className="mt-2 text-[10px] text-cyan-400 font-mono">
                ✓ 25GB Free Tier • Unsigned
              </div>
            </div>

            {/* 3. Supabase */}
            <div
              onClick={() => setProvider('SUPABASE')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                provider === 'SUPABASE'
                  ? 'bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-950/50'
                  : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center space-x-1.5 text-emerald-400 font-bold text-xs">
                  <Database className="w-4 h-4" />
                  <span>Supabase Storage</span>
                </div>
                {provider === 'SUPABASE' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
              </div>
              <p className="text-[11px] text-slate-400">
                1 GB free object storage. S3-compatible REST API. Free tier never requires credit card.
              </p>
              <div className="mt-2 text-[10px] text-emerald-400 font-mono">
                ✓ 1GB Free Bucket
              </div>
            </div>
          </div>

          {/* Configuration Form based on selected provider */}
          {provider === 'INLINE' && (
            <div className="p-3.5 sm:p-4 rounded-xl bg-purple-950/20 border border-purple-800/40 space-y-2">
              <div className="flex items-center space-x-2 text-purple-300 font-semibold text-xs">
                <ShieldCheck className="w-4 h-4" />
                <span>Zero-Config Free Mode Active</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Snapshots captured by the child device are automatically scaled to high quality (1024px, 70% JPEG quality, ~70 KB)
                and compressed audio (24kHz AAC, ~35 KB), then stored directly inside your free Firestore database as Data URIs.
              </p>
              <div className="flex items-center space-x-2 text-[11px] text-emerald-400 bg-emerald-950/50 p-2 rounded-lg border border-emerald-800/40">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>No API keys or third-party accounts required. Completely free under Firebase Spark plan.</span>
              </div>
            </div>
          )}

          {provider === 'CLOUDINARY' && (
            <div className="p-3.5 sm:p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-400">Cloudinary Free Tier Credentials</span>
                <a
                  href="https://cloudinary.com/users/register_free"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-cyan-400 hover:underline inline-flex items-center"
                >
                  Create Free Account (No CC) <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </div>
              <p className="text-[11px] text-slate-400">
                In Cloudinary: <b>Settings &gt; Upload &gt; Add upload preset</b>, set Signing Mode to <b>Unsigned</b>.
              </p>
              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Cloud Name</label>
                  <input
                    type="text"
                    value={cloudinaryCloudName}
                    onChange={(e) => setCloudinaryCloudName(e.target.value)}
                    placeholder="e.g. dxyz123ab"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Unsigned Upload Preset</label>
                  <input
                    type="text"
                    value={cloudinaryUploadPreset}
                    onChange={(e) => setCloudinaryUploadPreset(e.target.value)}
                    placeholder="e.g. andro_media_free"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {provider === 'SUPABASE' && (
            <div className="p-3.5 sm:p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400">Supabase Storage Configuration</span>
                <a
                  href="https://supabase.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-emerald-400 hover:underline inline-flex items-center"
                >
                  Supabase Console <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </div>
              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Project URL</label>
                  <input
                    type="text"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    placeholder="https://xyzabcdefg.supabase.co"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Public Anon Key</label>
                  <input
                    type="text"
                    value={supabaseAnonKey}
                    onChange={(e) => setSupabaseAnonKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Bucket Name (Public)</label>
                  <input
                    type="text"
                    value={supabaseBucket}
                    onChange={(e) => setSupabaseBucket(e.target.value)}
                    placeholder="media"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Fallback Guarantee Banner */}
          <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 flex items-start space-x-2 text-[11px] text-slate-400">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              <b>Automatic Fallback Guarantee:</b> Even if Cloudinary or Supabase is offline or misconfigured, the Android app
              automatically falls back to Free Inline mode. Media capture will never fail.
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-lg shadow-purple-950 transition-all disabled:opacity-50"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Syncing...' : 'Save & Sync Device'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
