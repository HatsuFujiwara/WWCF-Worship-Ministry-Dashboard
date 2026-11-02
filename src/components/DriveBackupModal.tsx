import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import { DriveFileInfo, GoogleAuthService } from '../services/googleAuthService';
import { StorageService } from '../services/storage';
import { SongService } from '../services/songService';
import { SongFamilyService } from '../services/songFamilyService';
import { formatDateDisplayManila } from '../utils/dateUtils';
import {
  Cloud,
  DownloadCloud,
  UploadCloud,
  Copy,
  GitMerge,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  FileText,
  Calendar,
  X,
  Loader2,
  ShieldCheck,
  HardDrive
} from 'lucide-react';

export type DriveModalView =
  | 'first_backup_confirm'
  | 'candidates_select'
  | 'load_preview'
  | 'no_backups';

export interface DriveBackupModalProps {
  isOpen: boolean;
  view: DriveModalView;
  onClose: () => void;
  localCounts?: {
    songs: number;
    schedules: number;
    members: number;
    families: number;
    labels: number;
  };
  candidates?: DriveFileInfo[];
  candidateAction?: 'save' | 'load';
  previewData?: {
    file: DriveFileInfo;
    envelope: any;
    counts: {
      songs: number;
      schedules: number;
      members: number;
      families: number;
      labels: number;
      hasDraft: boolean;
    };
  } | null;
  onConfirmFirstBackup?: () => Promise<void>;
  onSelectCandidate?: (fileId: string) => Promise<void>;
  onSaveAsSeparateCopy?: () => Promise<void>;
  onConfirmRestore?: (mode: 'replace' | 'merge') => Promise<void>;
  onTriggerSaveToDrive?: () => void;
  showToast: (text: string, type?: 'success' | 'danger' | 'info') => void;
}

export const DriveBackupModal: React.FC<DriveBackupModalProps> = ({
  isOpen,
  view,
  onClose,
  localCounts,
  candidates = [],
  candidateAction = 'save',
  previewData,
  onConfirmFirstBackup,
  onSelectCandidate,
  onSaveAsSeparateCopy,
  onConfirmRestore,
  onTriggerSaveToDrive,
  showToast
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>(
    candidates[0]?.id || ''
  );

  // Update selected candidate ID when candidates change
  React.useEffect(() => {
    if (candidates && candidates.length > 0 && !selectedCandidateId) {
      setSelectedCandidateId(candidates[0].id);
    }
  }, [candidates, selectedCandidateId]);

  const { zIndex } = useOverlay({
    id: 'drive-backup-modal',
    isOpen,
    layer: OverlayLayer.CRITICAL_DIALOG,
    onClose: isProcessing ? () => {} : onClose,
    closeOnEscape: !isProcessing
  });

  if (!isOpen) return null;

  const handleFirstBackup = async () => {
    if (!onConfirmFirstBackup) return;
    setIsProcessing(true);
    try {
      await onConfirmFirstBackup();
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Failed to create initial cloud backup', 'danger');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCandidateSubmit = async () => {
    if (!selectedCandidateId || !onSelectCandidate) return;
    setIsProcessing(true);
    try {
      await onSelectCandidate(selectedCandidateId);
    } catch (err: any) {
      showToast(err?.message || 'Failed to process selected backup file', 'danger');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSeparateCopy = async () => {
    if (!onSaveAsSeparateCopy) return;
    setIsProcessing(true);
    try {
      await onSaveAsSeparateCopy();
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Failed to save separate copy', 'danger');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = async (mode: 'replace' | 'merge') => {
    if (!onConfirmRestore) return;
    setIsProcessing(true);
    try {
      await onConfirmRestore(mode);
      onClose();
    } catch (err: any) {
      showToast(err?.message || `Failed to ${mode} data from Google Drive`, 'danger');
    } finally {
      setIsProcessing(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-850/60">
          <div className="flex items-center gap-2.5">
            {view === 'load_preview' ? (
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <DownloadCloud className="w-4 h-4" />
              </div>
            ) : view === 'first_backup_confirm' ? (
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <UploadCloud className="w-4 h-4" />
              </div>
            ) : view === 'no_backups' ? (
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <AlertCircle className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <HardDrive className="w-4 h-4" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {view === 'first_backup_confirm' && 'Create Initial Google Drive Backup'}
                {view === 'candidates_select' && (candidateAction === 'save' ? 'Select Backup File to Update' : 'Select Backup to Load')}
                {view === 'load_preview' && 'Review & Restore Cloud Backup'}
                {view === 'no_backups' && 'No Cloud Backups Found'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                WWCF Santa Cruz Worship Ministry • Google Drive
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          {/* VIEW 1: FIRST BACKUP CONFIRMATION */}
          {view === 'first_backup_confirm' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                No previous backup was found in your Google Drive. Would you like to create your initial backup file (<code className="text-[11px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-blue-600 dark:text-blue-400">WWCF_Santa_Cruz_Worship_Ministry_Backup.json</code>) with the following records currently stored on this device?
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-center">
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-2xs">
                  <div className="text-base font-black text-blue-600 dark:text-blue-400">
                    {localCounts?.songs ?? 0}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Songs
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-2xs">
                  <div className="text-base font-black text-indigo-600 dark:text-indigo-400">
                    {localCounts?.schedules ?? 0}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Schedules
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-2xs">
                  <div className="text-base font-black text-emerald-600 dark:text-emerald-400">
                    {localCounts?.members ?? 0}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Members
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-2xs">
                  <div className="text-base font-black text-purple-600 dark:text-purple-400">
                    {localCounts?.families ?? 0}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Song Families
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-2xs">
                  <div className="text-base font-black text-amber-600 dark:text-amber-400">
                    {localCounts?.labels ?? 0}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Labels
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 bg-blue-50/60 dark:bg-blue-950/20 p-2.5 rounded-lg border border-blue-100 dark:border-blue-900/40">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  Saved securely to your personal Google Drive account under application-specific permissions.
                </span>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isProcessing}
                  className="flex-1 py-2 px-3 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleFirstBackup}
                  disabled={isProcessing}
                  className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50"
                >
                  {isProcessing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <UploadCloud className="w-3.5 h-3.5" />
                  )}
                  <span>{isProcessing ? 'Creating...' : 'Create First Backup'}</span>
                </button>
              </div>
            </div>
          )}

          {/* VIEW 2: MULTIPLE CANDIDATES SELECTION */}
          {view === 'candidates_select' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {candidateAction === 'save'
                  ? 'Multiple backup files were discovered in your Google Drive. Select which file you would like to update, or save your changes as a separate copy.'
                  : 'Multiple backup files were discovered in your Google Drive. Select which backup file you would like to inspect and load:'}
              </p>

              <div className="max-h-56 overflow-y-auto space-y-2 border border-slate-200 dark:border-slate-800 rounded-xl p-2 bg-slate-50/50 dark:bg-slate-850/40">
                {candidates.map((cand) => {
                  const isSelected = selectedCandidateId === cand.id;
                  return (
                    <div
                      key={cand.id}
                      onClick={() => setSelectedCandidateId(cand.id)}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-blue-50/80 dark:bg-blue-950/60 border-blue-400 dark:border-blue-700 shadow-2xs'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate max-w-[280px]">
                          {cand.name}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/60 px-1.5 py-0.5 rounded">
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                        <span>Modified: {cand.modifiedTime ? formatDateDisplayManila(cand.modifiedTime.slice(0, 10)) : 'Unknown'}</span>
                        {cand.size && (
                          <span>{(Number(cand.size) / 1024).toFixed(1)} KB</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isProcessing}
                  className="py-2 px-3 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                {candidateAction === 'save' && onSaveAsSeparateCopy && (
                  <button
                    type="button"
                    onClick={handleSeparateCopy}
                    disabled={isProcessing}
                    className="py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>Save as Separate Copy</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCandidateSubmit}
                  disabled={isProcessing || !selectedCandidateId}
                  className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50"
                >
                  {isProcessing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : candidateAction === 'save' ? (
                    <UploadCloud className="w-3.5 h-3.5" />
                  ) : (
                    <DownloadCloud className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isProcessing
                      ? 'Loading...'
                      : candidateAction === 'save'
                      ? 'Update Selected Backup'
                      : 'Inspect Selected Backup'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* VIEW 3: LOAD PREVIEW & CONFIRM RESTORE */}
          {view === 'load_preview' && previewData && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                    {previewData.file.name}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
                    Validated v{previewData.envelope?.version || '1.0'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Calendar className="w-3 h-3" />
                  <span>
                    Modified in Drive:{' '}
                    {previewData.file.modifiedTime
                      ? new Date(previewData.file.modifiedTime).toLocaleString()
                      : 'Unknown'}
                  </span>
                </div>
              </div>

              {/* Collection Counts Comparison */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
                <div className="grid grid-cols-3 bg-slate-100 dark:bg-slate-800 p-2 font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider">
                  <span>Collection</span>
                  <span className="text-center">In Cloud Backup</span>
                  <span className="text-right">On This Device</span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  <div className="grid grid-cols-3 p-2 bg-white dark:bg-slate-900">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Songs</span>
                    <span className="text-center font-bold text-blue-600 dark:text-blue-400">
                      {previewData.counts.songs}
                    </span>
                    <span className="text-right text-slate-500">
                      {localCounts?.songs ?? 0}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 p-2 bg-white dark:bg-slate-900">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Schedules</span>
                    <span className="text-center font-bold text-indigo-600 dark:text-indigo-400">
                      {previewData.counts.schedules}
                    </span>
                    <span className="text-right text-slate-500">
                      {localCounts?.schedules ?? 0}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 p-2 bg-white dark:bg-slate-900">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Team Members</span>
                    <span className="text-center font-bold text-emerald-600 dark:text-emerald-400">
                      {previewData.counts.members}
                    </span>
                    <span className="text-right text-slate-500">
                      {localCounts?.members ?? 0}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 p-2 bg-white dark:bg-slate-900">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Song Families</span>
                    <span className="text-center font-bold text-purple-600 dark:text-purple-400">
                      {previewData.counts.families}
                    </span>
                    <span className="text-right text-slate-500">
                      {localCounts?.families ?? 0}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 p-2 bg-white dark:bg-slate-900">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Role Labels</span>
                    <span className="text-center font-bold text-amber-600 dark:text-amber-400">
                      {previewData.counts.labels}
                    </span>
                    <span className="text-right text-slate-500">
                      {localCounts?.labels ?? 0}
                    </span>
                  </div>
                  {previewData.counts.hasDraft && (
                    <div className="grid grid-cols-3 p-2 bg-blue-50/30 dark:bg-blue-950/10">
                      <span className="font-semibold text-blue-700 dark:text-blue-300">Lineup Draft</span>
                      <span className="text-center font-bold text-blue-600">Included</span>
                      <span className="text-right text-slate-500">
                        {StorageService.hasUnsavedDraftSchedule() ? 'Present' : 'None'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Choice options */}
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Choose Restore Action:
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleRestore('merge')}
                    disabled={isProcessing}
                    className="p-3 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-100/60 dark:hover:bg-blue-900/40 text-left transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-blue-900 dark:text-blue-200">
                      <GitMerge className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform" />
                      <span>Merge with this device</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Combines cloud records into this device without deleting your existing local data.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRestore('replace')}
                    disabled={isProcessing}
                    className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 hover:bg-rose-100/60 dark:hover:bg-rose-900/40 text-left transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-rose-900 dark:text-rose-200">
                      <RotateCcw className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 group-hover:scale-110 transition-transform" />
                      <span>Replace this device's data</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Completely replaces this device's database with the cloud backup. A safe snapshot is taken for rollback.
                    </p>
                  </button>
                </div>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isProcessing}
                    className="py-1.5 px-4 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    Cancel (Keep current data unchanged)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 4: NO BACKUPS FOUND */}
          {view === 'no_backups' && (
            <div className="space-y-4 text-center py-2">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                No WWCF backup files (<code className="text-[11px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">WWCF_Santa_Cruz_Worship_Ministry_Backup.json</code>) were found in your connected Google Drive.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                You can save your current local songs, lineups, and members to Google Drive now to establish your first cloud backup.
              </p>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2 px-3 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>
                {onTriggerSaveToDrive && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onTriggerSaveToDrive();
                    }}
                    className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Save to Drive Now</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
