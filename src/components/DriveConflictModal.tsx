import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import { RemoteConflictPayload, GoogleAuthService } from '../services/googleAuthService';
import {
  AlertTriangle,
  GitMerge,
  DownloadCloud,
  UploadCloud,
  Copy,
  X,
  Loader2,
  Calendar,
  CheckCircle2
} from 'lucide-react';
import { formatDateDisplayManila } from '../utils/dateUtils';

interface DriveConflictModalProps {
  conflict: RemoteConflictPayload | null;
  onClose: () => void;
  onResolved: () => void;
  showToast: (msg: string, type?: 'success' | 'danger' | 'info') => void;
}

export const DriveConflictModal: React.FC<DriveConflictModalProps> = ({
  conflict,
  onClose,
  onResolved,
  showToast
}) => {
  const [isResolving, setIsResolving] = useState(false);
  const [activeConflict, setActiveConflict] = useState<RemoteConflictPayload | null>(conflict);
  const [selectedFileId, setSelectedFileId] = useState<string>(conflict?.fileId || '');

  React.useEffect(() => {
    setActiveConflict(conflict);
    if (conflict?.fileId) {
      setSelectedFileId(conflict.fileId);
    }
  }, [conflict]);

  const { zIndex } = useOverlay({
    id: 'drive-conflict-modal',
    isOpen: Boolean(activeConflict),
    layer: OverlayLayer.CRITICAL_DIALOG,
    onClose,
    closeOnEscape: true
  });

  if (!activeConflict) return null;

  const currentConflict = activeConflict;
  const remoteData = currentConflict.remoteData?.data || {};
  const remoteSongCount = (remoteData.songs || []).length;
  const remoteScheduleCount = (remoteData.schedules || []).length;
  const remoteMemberCount = (remoteData.members || []).length;

  const handleSelectCandidate = async (fileId: string) => {
    setSelectedFileId(fileId);
    const token = GoogleAuthService.getAccessToken();
    if (token) {
      try {
        setIsResolving(true);
        const content = await GoogleAuthService.readDriveBackupContent(token, fileId);
        if (!content || typeof content !== 'object' || (!content.data && !content.members && !content.songs)) {
          throw new Error('Selected candidate does not contain a valid WWCF backup envelope');
        }
        // ONLY commit persisted pointer after content is read and validated
        GoogleAuthService.setPersistedDriveFileId(fileId);
        const cand = currentConflict.candidateFiles?.find((f) => f.id === fileId);
        setActiveConflict({
          fileId,
          remoteModifiedTime: cand?.modifiedTime || currentConflict.remoteModifiedTime,
          candidateFiles: currentConflict.candidateFiles,
          remoteData: content
        });
      } catch (e: any) {
        showToast(e?.message || 'Failed to read candidate file', 'danger');
      } finally {
        setIsResolving(false);
      }
    }
  };

  const handleMerge = async () => {
    setIsResolving(true);
    try {
      await GoogleAuthService.applyCloudRestore(currentConflict.remoteData, 'merge', currentConflict.remoteModifiedTime);
      showToast('Successfully merged local data with cloud backup!', 'success');
      onResolved();
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Failed to merge cloud data', 'danger');
    } finally {
      setIsResolving(false);
    }
  };

  const handleUseCloud = async () => {
    setIsResolving(true);
    try {
      await GoogleAuthService.applyCloudRestore(currentConflict.remoteData, 'replace', currentConflict.remoteModifiedTime);
      showToast('Local database replaced with cloud version!', 'success');
      onResolved();
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Failed to restore cloud version', 'danger');
    } finally {
      setIsResolving(false);
    }
  };

  const handleKeepLocal = async () => {
    setIsResolving(true);
    try {
      const res = await GoogleAuthService.syncNow(true);
      if (res.status === 'saved') {
        showToast('Cloud backup updated with your local version!', 'success');
        onResolved();
        onClose();
      } else {
        showToast(res.error || 'Failed to overwrite cloud backup', 'danger');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to overwrite cloud backup', 'danger');
    } finally {
      setIsResolving(false);
    }
  };

  const handleSaveSeparateCopy = async () => {
    setIsResolving(true);
    try {
      const res = await GoogleAuthService.createSeparateBackupCopy();
      if (res.status === 'saved') {
        showToast('Created separate backup copy in Google Drive!', 'success');
        onResolved();
        onClose();
      } else {
        showToast(res.error || 'Failed to create separate copy in Google Drive', 'danger');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to create separate copy', 'danger');
    } finally {
      setIsResolving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4"
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-dialog-title"
    >
      <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-amber-500 text-white p-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/20">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 id="conflict-dialog-title" className="text-lg font-bold">
                Cloud Backup Conflict Detected
              </h2>
              <p className="text-amber-100 text-xs mt-0.5">
                The backup in Google Drive has newer changes from another session.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Multiple Candidates Selector */}
          {currentConflict.candidateFiles && currentConflict.candidateFiles.length > 1 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/60 text-xs space-y-1.5">
              <span className="font-bold text-amber-900 dark:text-amber-200 block">
                Multiple backup files found in Drive. Select file to reconcile:
              </span>
              <div className="space-y-1">
                {currentConflict.candidateFiles.map((cand) => (
                  <label
                    key={cand.id}
                    className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer text-xs ${
                      selectedFileId === cand.id
                        ? 'border-blue-500 bg-white dark:bg-slate-800 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="candidateBackupFile"
                        checked={selectedFileId === cand.id}
                        onChange={() => handleSelectCandidate(cand.id)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span>Modified: {new Date(cand.modifiedTime).toLocaleString()}</span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400">ID: {cand.id.substring(0, 8)}...</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Cloud Version Details */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
            <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-500" />
              Cloud File Modified: {currentConflict.remoteModifiedTime ? new Date(currentConflict.remoteModifiedTime).toLocaleString() : 'Recent'}
            </div>
            <div className="text-slate-600 dark:text-slate-400 grid grid-cols-3 gap-2 pt-1 border-t border-slate-200 dark:border-slate-700">
              <div>Lineups: <span className="font-semibold text-slate-900 dark:text-slate-100">{remoteScheduleCount}</span></div>
              <div>Songs: <span className="font-semibold text-slate-900 dark:text-slate-100">{remoteSongCount}</span></div>
              <div>Members: <span className="font-semibold text-slate-900 dark:text-slate-100">{remoteMemberCount}</span></div>
            </div>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            Choose how you would like to reconcile differences between your local working copy and the cloud copy:
          </p>

          <div className="space-y-2.5">
            {/* Merge Both (Recommended) */}
            <button
              onClick={handleMerge}
              disabled={isResolving}
              className="w-full text-left p-3.5 rounded-xl border border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/30 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors flex items-start gap-3 cursor-pointer group"
            >
              <div className="p-2 rounded-lg bg-blue-600 text-white shrink-0 mt-0.5">
                <GitMerge className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                    Merge Both (Recommended)
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-200 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                    Safe
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Combines new lineups, songs, and members from both copies without deleting anything.
                </p>
              </div>
            </button>

            {/* Use Cloud Version */}
            <button
              onClick={handleUseCloud}
              disabled={isResolving}
              className="w-full text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-start gap-3 cursor-pointer group"
            >
              <div className="p-2 rounded-lg bg-emerald-600 text-white shrink-0 mt-0.5">
                <DownloadCloud className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Use Cloud Version
                </span>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Replaces your current local data with the newer version stored in Google Drive.
                </p>
              </div>
            </button>

            {/* Keep Local Version */}
            <button
              onClick={handleKeepLocal}
              disabled={isResolving}
              className="w-full text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-start gap-3 cursor-pointer group"
            >
              <div className="p-2 rounded-lg bg-amber-600 text-white shrink-0 mt-0.5">
                <UploadCloud className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Keep Local Version (Overwrite Cloud)
                </span>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Overwrites the Google Drive file with your current local records.
                </p>
              </div>
            </button>

            {/* Save as Separate Copy */}
            <button
              onClick={handleSaveSeparateCopy}
              disabled={isResolving}
              className="w-full text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-start gap-3 cursor-pointer group"
            >
              <div className="p-2 rounded-lg bg-indigo-600 text-white shrink-0 mt-0.5">
                <Copy className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Save as Separate Cloud Copy
                </span>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Creates a distinct timestamped copy in Google Drive without modifying the original cloud file.
                </p>
              </div>
            </button>
          </div>

          {isResolving && (
            <div className="flex items-center justify-center gap-2 py-2 text-xs text-blue-600 dark:text-blue-400 font-medium">
              <Loader2 className="w-4 h-4 animate-spin" />
              Applying selected resolution...
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
