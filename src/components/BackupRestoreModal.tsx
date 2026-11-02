import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Member, Schedule, Song, SongFamily } from '../types';
import { StorageService } from '../services/storage';
import { SongService } from '../services/songService';
import { SongFamilyService } from '../services/songFamilyService';
import { LineupHistoryService } from '../services/lineupHistoryService';
import { BackupValidationService } from '../services/backupValidationService';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import { X, Download, Upload, ShieldCheck, Database, AlertCircle, RefreshCw, GitMerge, CheckCircle2 } from 'lucide-react';

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Member[];
  songs: Song[];
  schedules: Schedule[];
  labels: string[];
  onDataRestored: () => void;
  showToast: (text: string, type?: 'success' | 'danger' | 'info') => void;
}

const MAX_BACKUP_SIZE = 15 * 1024 * 1024; // 15MB file size limit

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  isOpen,
  onClose,
  members,
  songs,
  schedules,
  labels,
  onDataRestored,
  showToast
}) => {
  const [isConfirmingRestore, setIsConfirmingRestore] = useState(false);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');
  const [isRestoring, setIsRestoring] = useState(false);
  const [pendingRestoreData, setPendingRestoreData] = useState<{
    members?: Member[];
    songs?: Song[];
    schedules?: Schedule[];
    labels?: string[];
    songFamilies?: SongFamily[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'backup-restore-modal',
    isOpen,
    layer: OverlayLayer.NESTED_MODAL,
    onClose,
    closeOnEscape: true
  });

  const handleDownloadBackup = async () => {
    try {
      const songFamilies = await SongFamilyService.getSongFamilies();
      const backupObj = {
        app: 'WWCF Santa Cruz Worship Ministry',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        data: {
          members,
          songs,
          schedules,
          labels,
          songFamilies
        }
      };

      const jsonStr = JSON.stringify(backupObj, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const todayStr = new Date().toISOString().substring(0, 10);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wwcf_santa_cruz_backup_${todayStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Backup Data file downloaded successfully!', 'success');
    } catch (err) {
      console.error('Backup download error:', err);
      showToast('Failed to create backup file.', 'danger');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 15MB file size limit check
    if (file.size > MAX_BACKUP_SIZE) {
      showToast(`Selected file (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 15 MB limit.`, 'danger');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        // Validate envelope schema and sanitize records using central service
        const validation = BackupValidationService.validate(parsed);
        if (!validation.isValid || !validation.data) {
          showToast(`Invalid backup file: ${validation.errors.join('; ')}`, 'danger');
          return;
        }

        if (validation.warnings.length > 0) {
          console.warn('[BackupRestoreModal] Backup warnings:', validation.warnings);
        }

        const dataContent = validation.data;
        if (
          dataContent.members.length === 0 &&
          dataContent.songs.length === 0 &&
          dataContent.schedules.length === 0
        ) {
          showToast('No valid church members, songs, or lineups found in this backup file.', 'danger');
          return;
        }

        setPendingRestoreData({
          members: dataContent.members,
          songs: dataContent.songs,
          schedules: dataContent.schedules,
          labels: dataContent.labels,
          songFamilies: dataContent.songFamilies
        });
        setIsConfirmingRestore(true);
      } catch (err) {
        console.error('JSON parse error:', err);
        showToast('Error reading backup file. Make sure it is a valid, uncorrupted JSON backup.', 'danger');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const executeRestore = async () => {
    if (!pendingRestoreData) return;
    setIsRestoring(true);

    // Save snapshot of all current data for atomic rollback and undo
    const prevMembers = StorageService.getMembers();
    const prevLabels = StorageService.getLabels();
    const prevSchedules = StorageService.getSchedules();
    const prevSongs = await SongService.getSongs();
    const prevFamilies = await SongFamilyService.getSongFamilies();

    const rollback = async () => {
      StorageService.saveMembers(prevMembers);
      StorageService.saveLabels(prevLabels);
      StorageService.saveSchedules(prevSchedules);
      await SongService.saveSongsList(prevSongs);
      await SongFamilyService.saveSongFamilies(prevFamilies);
    };

    try {
      let finalMembers = pendingRestoreData.members || [];
      let finalSongs = pendingRestoreData.songs || [];
      let finalSchedules = pendingRestoreData.schedules || [];
      let finalLabels = pendingRestoreData.labels || [];
      let finalFamilies = pendingRestoreData.songFamilies || [];

      if (restoreMode === 'merge') {
        // Merge Members by id or lowercase name
        const memberKey = (m: Member) => (m.id || m.name.toLowerCase().trim());
        const existingMemberKeys = new Set(prevMembers.map(memberKey));
        const newMembers = (pendingRestoreData.members || []).filter(m => !existingMemberKeys.has(memberKey(m)));
        finalMembers = [...prevMembers, ...newMembers];

        // Merge Songs by id or lowercase title
        const songKey = (s: Song) => (s.id || s.title.toLowerCase().trim());
        const existingSongKeys = new Set(prevSongs.map(songKey));
        const newSongs = (pendingRestoreData.songs || []).filter(s => !existingSongKeys.has(songKey(s)));
        finalSongs = [...prevSongs, ...newSongs];

        // Merge Schedules by id or serviceType + serviceDate
        const schedKey = (sc: Schedule) => `${sc.serviceType}_${sc.serviceDate}`;
        const existingSchedKeys = new Set(prevSchedules.map(schedKey));
        const newSchedules = (pendingRestoreData.schedules || []).filter(sc => !existingSchedKeys.has(schedKey(sc)));
        finalSchedules = [...prevSchedules, ...newSchedules];

        // Merge Labels
        const labelSet = new Set([...prevLabels, ...(pendingRestoreData.labels || [])]);
        finalLabels = Array.from(labelSet);

        // Merge Families by name
        const existingFamNames = new Set(prevFamilies.map(f => f.name.toLowerCase().trim()));
        const newFamilies = (pendingRestoreData.songFamilies || []).filter(f => !existingFamNames.has(f.name.toLowerCase().trim()));
        finalFamilies = [...prevFamilies, ...newFamilies];
      }

      // Atomic commit
      StorageService.saveMembers(finalMembers);
      StorageService.saveLabels(finalLabels);
      StorageService.saveSchedules(finalSchedules);
      await SongService.saveSongsList(finalSongs);
      await SongFamilyService.saveSongFamilies(finalFamilies);

      onDataRestored();

      // Register undo action
      LineupHistoryService.pushAppAction({
        description: `Restore church data (${restoreMode === 'replace' ? 'Replace' : 'Merge'})`,
        undo: async () => {
          await rollback();
          onDataRestored();
        },
        redo: async () => {
          StorageService.saveMembers(finalMembers);
          StorageService.saveLabels(finalLabels);
          StorageService.saveSchedules(finalSchedules);
          await SongService.saveSongsList(finalSongs);
          await SongFamilyService.saveSongFamilies(finalFamilies);
          onDataRestored();
        }
      });

      showToast(`Data restored successfully (${restoreMode === 'replace' ? 'Replaced' : 'Merged'})!`, 'success');
      setIsConfirmingRestore(false);
      setPendingRestoreData(null);
      onClose();
    } catch (err) {
      console.error('Failed to restore data, rolling back:', err);
      try {
        await rollback();
      } catch (rbErr) {
        console.error('Rollback failed:', rbErr);
      }
      showToast('Error restoring backup data. Changes were safely rolled back.', 'danger');
    } finally {
      setIsRestoring(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      style={{ zIndex }}
      data-overlay-id="backup-restore-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200 transition-opacity ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div
        data-tour="backup-modal-container"
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[90vh] my-auto flex flex-col transform animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Database className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                Backup & Restore Data
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Word for the World - Santa Cruz
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Backup Section */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
            <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold text-sm">
              <Download className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Backup Data</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Export a full JSON backup file containing your roster ({members.length} members), song database ({songs.length} songs), saved line-ups ({schedules.length} records), and labels.
            </p>
            <button
              type="button"
              data-tour="download-backup-btn"
              onClick={handleDownloadBackup}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Backup File</span>
            </button>
          </div>

          {/* Restore Section */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
            <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold text-sm">
              <Upload className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Restore Data</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Restore or merge your application database from a previously exported JSON backup file (up to 15 MB).
            </p>
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              data-tour="restore-file-btn"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 px-4 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Select Backup File (Max 15MB)...</span>
            </button>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-[11px] leading-snug border border-amber-200/60 dark:border-amber-800/50">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              All church data is automatically saved locally. Creating regular backups guarantees you can restore your data anytime.
            </span>
          </div>
        </div>

        {/* Restore Confirmation Sub-Modal */}
        {isConfirmingRestore && pendingRestoreData && (
          <div className="absolute inset-0 z-10 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between animate-in fade-in duration-200">
            <div className="space-y-4 overflow-y-auto pr-1">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-base">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>Review Backup Contents</span>
              </div>

              {/* Item Count Preview */}
              <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Members:</span>{' '}
                  <strong className="text-slate-900 dark:text-slate-100">{pendingRestoreData.members?.length || 0}</strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Songs:</span>{' '}
                  <strong className="text-slate-900 dark:text-slate-100">{pendingRestoreData.songs?.length || 0}</strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Saved Line-ups:</span>{' '}
                  <strong className="text-slate-900 dark:text-slate-100">{pendingRestoreData.schedules?.length || 0}</strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Song Families:</span>{' '}
                  <strong className="text-slate-900 dark:text-slate-100">{pendingRestoreData.songFamilies?.length || 0}</strong>
                </div>
              </div>

              {/* Restore Mode Selection */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Select Restore Method:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRestoreMode('replace')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      restoreMode === 'replace'
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 ring-1 ring-indigo-500'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100 mb-1">
                      <RefreshCw className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>Replace All Data</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                      Replaces all existing records with the contents of this backup file.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRestoreMode('merge')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      restoreMode === 'merge'
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 ring-1 ring-indigo-500'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100 mb-1">
                      <GitMerge className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      <span>Merge With Current</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                      Keeps current records and adds unique items from the backup.
                    </p>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsConfirmingRestore(false);
                  setPendingRestoreData(null);
                }}
                disabled={isRestoring}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeRestore}
                disabled={isRestoring}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isRestoring ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Restoring...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{restoreMode === 'replace' ? 'Confirm & Replace' : 'Confirm & Merge'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
