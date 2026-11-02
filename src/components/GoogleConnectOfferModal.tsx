import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import { GoogleAuthService } from '../services/googleAuthService';
import {
  Cloud,
  CheckCircle2,
  ShieldCheck,
  X,
  Youtube,
  Key,
  WifiOff,
  Sparkles,
  Loader2
} from 'lucide-react';

interface GoogleConnectOfferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  showToast: (msg: string, type?: 'success' | 'danger' | 'info') => void;
}

export const GoogleConnectOfferModal: React.FC<GoogleConnectOfferModalProps> = ({
  isOpen,
  onClose,
  onOpenSettings,
  showToast
}) => {
  const [isConnecting, setIsConnecting] = useState(false);

  const { zIndex, isTopmost } = useOverlay({
    id: 'google-connect-offer-modal',
    isOpen,
    layer: OverlayLayer.MODAL,
    onClose,
    closeOnEscape: true
  });

  if (!isOpen) return null;

  const markSeenAndClose = () => {
    try {
      localStorage.setItem('wwcf_google_offer_seen_v1', 'true');
    } catch {}
    onClose();
  };

  const handleConnectGoogle = async () => {
    setIsConnecting(true);
    try {
      await GoogleAuthService.requestToken('', 'drive');
      showToast('Google Account connected. Checking Google Drive for existing backups...', 'info');
      const recon = await GoogleAuthService.reconcileCloudBackup();
      if (recon.state === 'no_backup') {
        showToast('Connected to Google Account. No prior cloud backup found. You can back up anytime in Settings.', 'info');
      } else if (recon.state === 'conflict') {
        showToast('Existing backup found in Google Drive. Reviewing cloud versions...', 'info');
      } else if (recon.state === 'up_to_date') {
        showToast('Google Drive backup verified and up to date.', 'success');
      } else if (recon.state === 'multiple_candidates') {
        showToast('Multiple backups found in Google Drive. Please select one in the prompt.', 'info');
      }
      markSeenAndClose();
    } catch (err: any) {
      console.warn('Google connect prompt error:', err);
      // If client ID missing, offer to open settings
      if (err?.message?.includes('Client ID is not configured')) {
        showToast('Google Client ID not yet configured. Opening Settings...', 'info');
        markSeenAndClose();
        onOpenSettings();
      } else {
        showToast(err?.message || 'Could not connect Google account', 'danger');
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleUseApiKey = () => {
    markSeenAndClose();
    onOpenSettings();
    showToast('Opening Settings to configure your YouTube API key.', 'info');
  };

  const handleContinueOffline = () => {
    markSeenAndClose();
    showToast('Continuing offline. All your data remains safely stored locally.', 'info');
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-offer-title"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 p-6 text-white relative">
          <button
            onClick={markSeenAndClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors focus:outline-hidden focus:ring-2 focus:ring-white"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center mb-3">
            <Cloud className="w-7 h-7 text-white" />
          </div>
          <h2 id="google-offer-title" className="text-xl font-bold">
            Connect Google Account
          </h2>
          <p className="text-blue-100 text-sm mt-1">
            Optional cloud backup and seamless YouTube playlist imports for your WWCF worship ministry.
          </p>
        </div>

        {/* Benefits List */}
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Automated Google Drive Backup
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Keeps your rosters, songs, and worship lineups backed up to an isolated file (<code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[11px]">WWCF_Santa_Cruz_Worship_Ministry_Backup.json</code>) in your personal Google Drive.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 mt-0.5">
              <Youtube className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                API-Key-Free YouTube Playlist Import
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Import YouTube and YouTube Music playlists directly (including unlisted and private playlists you own) without entering or maintaining a developer API key.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Local-First & Privacy Preserving
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                LocalStorage remains your immediate working copy. Tokens stay strictly in memory and are never written to disk or sent to third-party trackers.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 space-y-2">
            <button
              onClick={handleConnectGoogle}
              disabled={isConnecting}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm shadow-sm transition-all focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 cursor-pointer"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting Google Account...
                </>
              ) : (
                <>
                  <Cloud className="w-4 h-4" />
                  Connect Google Account
                </>
              )}
            </button>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleUseApiKey}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Key className="w-3.5 h-3.5 text-amber-500" />
                Use YouTube API Key
              </button>

              <button
                onClick={handleContinueOffline}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <WifiOff className="w-3.5 h-3.5 text-slate-400" />
                Continue Offline
              </button>
            </div>

            <button
              onClick={markSeenAndClose}
              className="w-full text-center py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              Not now, ask me later
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
