import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Member, Schedule, Song } from '../types';
import { StorageService } from '../services/storage';
import { SongService } from '../services/songService';
import { SongFamilyService } from '../services/songFamilyService';
import { LineupHistoryService } from '../services/lineupHistoryService';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import { X, Download, Upload, ShieldCheck, Database, AlertCircle } from 'lucide-react';

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
  const [pendingRestoreData, setPendingRestoreData] = useState<{
    members?: Member[];
    songs?: Song[];
    schedules?: Schedule[];
    labels?: string[];
    songFamilies?: any[];
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

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        const dataContent = parsed.data || parsed;
        if (!dataContent || (
          !Array.isArray(dataContent.members) &&
          !Array.isArray(dataContent.songs) &&
          !Array.isArray(dataContent.schedules)
        )) {
          showToast('Invalid backup file structure.', 'danger');
          return;
        }

        setPendingRestoreData(dataContent);
        setIsConfirmingRestore(true);
      } catch (err) {
        console.error('JSON parse error:', err);
        showToast('Error reading backup file. Make sure it is a valid JSON backup.', 'danger');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const executeRestore = async () => {
    if (!pendingRestoreData) return;

    try {
      const prevMembers = StorageService.getMembers();
      const prevLabels = StorageService.getLabels();
      const prevSchedules = StorageService.getSchedules();
      const prevSongs = await SongService.getSongs();
      const prevFamilies = await SongFamilyService.getSongFamilies();
      const restorePayload = { ...pendingRestoreData };

      const applyData = async (data: typeof restorePayload) => {
        if (Array.isArray(data.members)) {
          StorageService.saveMembers(data.members);
        }
        if (Array.isArray(data.labels)) {
          StorageService.saveLabels(data.labels);
        }
        if (Array.isArray(data.schedules)) {
          StorageService.saveSchedules(data.schedules);
        }
        if (Array.isArray(data.songs)) {
          await SongService.saveSongsList(data.songs);
        }
        if (Array.isArray(data.songFamilies)) {
          await SongFamilyService.saveSongFamilies(data.songFamilies);
        }
        onDataRestored();
      };

      await applyData(restorePayload);

      LineupHistoryService.pushAppAction({
        description: 'Backup data restore',
        undo: async () => {
          await applyData({
            members: prevMembers,
            labels: prevLabels,
            schedules: prevSchedules,
            songs: prevSongs,
            songFamilies: prevFamilies
          });
        },
        redo: async () => {
          await applyData(restorePayload);
        }
      });

      showToast('Data restored successfully!', 'success');
      setIsConfirmingRestore(false);
      setPendingRestoreData(null);
      onClose();
    } catch (err) {
      console.error('Failed to restore data:', err);
      showToast('Error restoring backup data.', 'danger');
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
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[90vh] my-auto flex flex-col transform animate-in zoom-in-95 duration-200"
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
              Export a full JSON backup file containing your roster, song database, saved line-ups, and labels.
            </p>
            <button
              type="button"
              data-tour="download-backup-btn"
              onClick={handleDownloadBackup}
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer flex items-center justify-center gap-2"
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
              Restore your application database from a previously exported JSON backup file.
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
              className="w-full py-2 px-4 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Select Backup File...</span>
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
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-base">
                <AlertCircle className="w-5 h-5" />
                <span>Confirm Restore Data</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Are you sure you want to restore data from this backup file? This will load:
              </p>
              <ul className="text-xs text-slate-700 dark:text-slate-200 space-y-1 pl-4 list-disc font-medium">
                {pendingRestoreData.members && <li>{pendingRestoreData.members.length} member records</li>}
                {pendingRestoreData.songs && <li>{pendingRestoreData.songs.length} songs</li>}
                {pendingRestoreData.schedules && <li>{pendingRestoreData.schedules.length} saved line-ups</li>}
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsConfirmingRestore(false);
                  setPendingRestoreData(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeRestore}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-2xs transition-colors cursor-pointer"
              >
                Restore Data
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
