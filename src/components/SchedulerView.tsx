import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Member, Schedule, ServiceType, MinistryAssignment, AssignedMember, Song, getAssignmentMembers, isMemberUnderDisciplinary } from '../types';
import { SongService, MonthlyUsageCheckResult } from '../services/songService';
import { StorageService } from '../services/storage';
import { getNextAvailableServiceDate, getSmartInitialServiceDetails, isScheduleEmpty } from '../utils/scheduleUtils';
import { getManilaNowISO, getManilaTodayString, formatDateDisplayManila, getManilaDateParts, isValidServiceDateForType } from '../utils/dateUtils';
import { sortTags } from '../utils/tagUtils';
import { triggerHaptic } from '../utils/haptics';
import { resolveScheduleSongTitles } from '../utils/songResolveUtils';
import { ImportSummary } from '../services/youtubePlaylistService';
import { LineupHistoryService, SchedulerSnapshot } from '../services/lineupHistoryService';
import { SongAutocomplete } from './SongAutocomplete';
import { MonthlyUsageModal } from './MonthlyUsageModal';
import { SongPickerModal } from './SongPickerModal';
import { SongFormModal } from './SongFormModal';
import { SongRecommendationsPanel } from './SongRecommendationsPanel';
import { SmartSongImportModal } from './SmartSongImportModal';
import { Modal } from './Modal';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import { CustomSelect } from './CustomSelect';
import {
  Church,
  Music,
  Users,
  Plus,
  Trash2,
  Save,
  FileDown,
  Image,
  RotateCcw,
  Sparkles,
  Zap,
  Heart,
  Filter,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Youtube,
  ListMusic,
  FileText,
  Layers,
  X,
  AlertTriangle,
  Undo2,
  Redo2
} from 'lucide-react';

interface LineupConflictModalProps {
  isOpen: boolean;
  serviceType: string;
  serviceDate: string;
  onReplace: () => void;
  onMerge: () => void;
  onCancel: () => void;
}

const LineupConflictModal: React.FC<LineupConflictModalProps> = ({
  isOpen,
  serviceType,
  serviceDate,
  onReplace,
  onMerge,
  onCancel
}) => {
  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'lineup-conflict-modal',
    isOpen,
    layer: OverlayLayer.CRITICAL_DIALOG,
    onClose: onCancel,
    closeOnEscape: true
  });

  if (!isOpen) return null;

  const formattedDate = formatDateDisplayManila(serviceDate, {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const conflictContent = (
    <div
      style={{ zIndex }}
      data-overlay-id="lineup-conflict-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200 transition-opacity ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div
        className="w-full max-w-lg wwcf-glass-modal rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden transform animate-in zoom-in-95 duration-200 max-h-[90vh] my-auto flex flex-col text-slate-900 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/10 bg-amber-50/50 dark:bg-amber-950/20 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                Lineup Already Exists
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {serviceType} — {formattedDate}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto overscroll-contain flex-1">
          <p className="text-sm text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
            A lineup already exists for <strong className="text-[#1b75bc] dark:text-[#5aa7e8]">{serviceType} — {formattedDate}</strong>. Choose how you'd like to continue:
          </p>

          <div className="space-y-3">
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <strong className="block text-slate-900 dark:text-slate-100 font-semibold">Replace Songs</strong>
              <p>Replace all existing songs in the lineup with the newly imported songs. Keep service type, scheduled date, assigned members, and notes unchanged.</p>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <strong className="block text-slate-900 dark:text-slate-100 font-semibold">Merge Songs</strong>
              <p>Merge the imported songs into the existing lineup without duplicate titles, preserving current song order and appending new ones.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-white/10 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="w-full sm:w-auto px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer order-3 sm:order-1"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onMerge}
            className="w-full sm:w-auto px-4 py-2 text-xs sm:text-sm font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/70 hover:bg-purple-100 dark:hover:bg-purple-900/80 border border-purple-200 dark:border-purple-800 rounded-xl transition-colors cursor-pointer order-2"
          >
            Merge Songs
          </button>
          <button
            type="button"
            onClick={onReplace}
            className="w-full sm:w-auto px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#1b75bc] hover:bg-[#16629e] rounded-xl shadow-2xs transition-colors cursor-pointer order-1 sm:order-3"
          >
            Replace Songs
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(conflictContent, document.body);
  }
  return conflictContent;
};

interface DuplicateScheduleConflictModalProps {
  isOpen: boolean;
  duplicateConflictSchedule: Schedule | null;
  serviceType: string;
  serviceDate: string;
  onClose: () => void;
  onSelectSchedule?: (schedule: Schedule) => void;
}

const DuplicateScheduleConflictModal: React.FC<DuplicateScheduleConflictModalProps> = ({
  isOpen,
  duplicateConflictSchedule,
  serviceType,
  serviceDate,
  onClose,
  onSelectSchedule
}) => {
  const isEffectivelyOpen = Boolean(isOpen && duplicateConflictSchedule);

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'duplicate-schedule-conflict-modal',
    isOpen: isEffectivelyOpen,
    layer: OverlayLayer.CRITICAL_DIALOG,
    onClose,
    closeOnEscape: true
  });

  if (!isEffectivelyOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      style={{ zIndex }}
      data-overlay-id="duplicate-schedule-conflict-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200 transition-opacity ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform animate-in zoom-in-95 duration-200 max-h-[90vh] my-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-amber-50/50 dark:bg-amber-950/20 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                Lineup Already Exists
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {serviceType} — {formatDateDisplayManila(serviceDate, { month: 'long', day: 'numeric', year: 'numeric' })}
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

        <div className="p-6 space-y-4 overflow-y-auto overscroll-contain flex-1">
          <p className="text-sm text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
            A lineup already exists for <strong className="text-indigo-600 dark:text-indigo-400">{serviceType} on {formatDateDisplayManila(serviceDate, { month: 'long', day: 'numeric', year: 'numeric' })}</strong>.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
            Would you like to load the existing lineup into the editor to view or modify it, or cancel to pick another date?
          </p>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onSelectSchedule && duplicateConflictSchedule) {
                  onSelectSchedule(duplicateConflictSchedule);
                }
              }}
              className="flex-1 px-4 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              Load Existing Lineup
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

interface SchedulerViewProps {
  members: Member[];
  allSongs: Song[];
  schedules: Schedule[];
  editingSchedule: Schedule | null;
  onSaveSchedule: (scheduleData: Omit<Schedule, 'id' | 'updatedAt'>, id?: string) => void;
  onExportPDF: (schedule: Schedule) => void;
  onExportPNG: (schedule: Schedule) => void;
  onResetForm: () => void;
  onTriggerDraft: (draft: Partial<Schedule>) => void;
  onRefreshSongs: () => void;
  showToast: (msg: string, type?: 'success' | 'danger' | 'info') => void;
  onSelectSchedule?: (schedule: Schedule) => void;
  onViewSchedules?: () => void;
}

export const isBackupRole = (rName: string): boolean => {
  const lower = (rName || '').toLowerCase().trim();
  return (
    (lower.includes('backup') || lower.includes('vocal') || lower.includes('singer')) &&
    !lower.includes('song leader') &&
    !lower.includes('worship leader') &&
    !lower.includes('song lead')
  );
};

export const isMusicianRole = (rName: string): boolean => {
  const r = (rName || '').toLowerCase().trim();
  return (
    r.includes('guitar') ||
    r.includes('keyboard') ||
    (r.includes('bass') && !r.includes('brass')) ||
    r.includes('drum')
  );
};

const DEFAULT_ROLES: { role: string; targetLabel: string }[] = [
  { role: 'Song Leader (Praise/Worship)', targetLabel: 'Song Leader, Worship Leader' },
  { role: 'Backup Singer/s', targetLabel: 'Vocalist' },
  { role: 'Guitarist', targetLabel: 'Guitarist' },
  { role: 'Keyboardist', targetLabel: 'Keyboardist' },
  { role: 'Bassist', targetLabel: 'Bassist' },
  { role: 'Drummer', targetLabel: 'Drummer' },
  { role: 'Audio/Live Technician', targetLabel: 'Audio/Live Technician' },
  { role: 'Lyricist', targetLabel: 'Lyricist' }
];

const createDefaultMinistryRows = (): MinistryAssignment[] => {
  return DEFAULT_ROLES.map((r, idx) => ({
    id: `m-row-${idx}-${Date.now()}`,
    role: r.role,
    assignedMembers: [{ memberId: '', memberName: '' }],
    notes: ''
  }));
};

interface DraggedSongState {
  type: 'lineup' | 'recommendation';
  category: 'praise' | 'worship';
  index: number;
  songTitle: string;
  key?: string;
}

interface DropTargetState {
  category: 'praise' | 'worship';
  index: number;
  position: 'before' | 'after';
}


export const SchedulerView: React.FC<SchedulerViewProps> = ({
  members,
  allSongs,
  schedules,
  editingSchedule,
  onSaveSchedule,
  onExportPDF,
  onExportPNG,
  onResetForm,
  onTriggerDraft,
  onRefreshSongs,
  showToast,
  onSelectSchedule,
  onViewSchedules
}) => {
  // Manual Date Override Flag
  const [isDateManuallyEdited, setIsDateManuallyEdited] = useState<boolean>(false);

  // Service Details State with Smart Auto-Selection
  const [serviceType, setServiceType] = useState<ServiceType>(() => {
    if (editingSchedule) return editingSchedule.serviceType;
    return getSmartInitialServiceDetails(schedules).serviceType;
  });
  const [serviceDate, setServiceDate] = useState<string>(() => {
    if (editingSchedule) return editingSchedule.serviceDate;
    return getSmartInitialServiceDetails(schedules).serviceDate;
  });

  // Song States
  const [praiseSongs, setPraiseSongs] = useState<string[]>(['']);
  const [worshipSongs, setWorshipSongs] = useState<string[]>(['']);
  const [praiseSongKeys, setPraiseSongKeys] = useState<string[]>(['']);
  const [worshipSongKeys, setWorshipSongKeys] = useState<string[]>(['']);

  // Modals state
  const [monthlyWarnings, setMonthlyWarnings] = useState<MonthlyUsageCheckResult[]>([]);
  const [isMonthlyModalOpen, setIsMonthlyModalOpen] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState<{
    data: Omit<Schedule, 'id' | 'updatedAt'>;
    id?: string;
  } | null>(null);

  // Unified Smart YouTube Import Modal State (Song or Playlist)
  const [smartImportConfig, setSmartImportConfig] = useState<{
    isOpen: boolean;
    initialCategory?: 'praise' | 'worship';
    targetLineupSlot?: { category: 'praise' | 'worship'; index: number };
  }>({ isOpen: false });

  // Drag and Drop State for Songs (Universal Cross-Category & Reordering)
  const [draggedItem, setDraggedItem] = useState<DraggedSongState | null>(null);
  const [dragOverSection, setDragOverSection] = useState<'praise' | 'worship' | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);
  const [activeDragHandle, setActiveDragHandle] = useState<{ category: 'praise' | 'worship'; index: number } | null>(null);

  // Picker Modal State
  const [pickerConfig, setPickerConfig] = useState<{
    isOpen: boolean;
    category: 'praise' | 'worship';
    songIndex: number;
  }>({ isOpen: false, category: 'praise', songIndex: 0 });

  // Song Form Modal State (Add New Song)
  const [isSongFormOpen, setIsSongFormOpen] = useState(false);

  // Ministry Rows State
  const [ministryRows, setMinistryRows] = useState<MinistryAssignment[]>(() => {
    return createDefaultMinistryRows();
  });

  // DA Member Lineup Assignment Confirmation Modal State
  const [pendingDaAssignment, setPendingDaAssignment] = useState<{
    rowId: string;
    memberIdx: number;
    memberId: string;
    member: Member;
  } | null>(null);

  // Track loaded schedule ID to avoid overwriting form state when allSongs/schedules change
  const loadedScheduleIdRef = useRef<string | null | undefined>(undefined);

  // Replace lineup confirmation modal state
  const [isConfirmReplaceOpen, setIsConfirmReplaceOpen] = useState<boolean>(false);
  const [pendingImportData, setPendingImportData] = useState<{
    importedSongs: Song[];
    summary: ImportSummary;
  } | null>(null);

  // Duplicate schedule conflict modal state
  const [duplicateConflictSchedule, setDuplicateConflictSchedule] = useState<Schedule | null>(null);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState<boolean>(false);

  // Smart Role Filter Toggle (Persisted across tab switches)
  const [isSmartFilter, setIsSmartFilter] = useState<boolean>(() =>
    StorageService.getSchedulerSmartFilter()
  );

  const handleToggleSmartFilter = (checked: boolean) => {
    setIsSmartFilter(checked);
    StorageService.saveSchedulerSmartFilter(checked);
  };

  // Undo / Redo History Engine backed by LineupHistoryService
  const currentContextKey = editingSchedule ? `edit_${editingSchedule.id}` : 'new_schedule';
  const [canUndo, setCanUndo] = useState<boolean>(() =>
    LineupHistoryService.canUndo()
  );
  const [canRedo, setCanRedo] = useState<boolean>(() =>
    LineupHistoryService.canRedo()
  );
  const isRestoringHistoryRef = useRef<boolean>(false);
  const isResettingRef = useRef<boolean>(false);
  const lastTypingTimeRef = useRef<number>(0);

  // Keep canUndo/canRedo synchronized with the authoritative global history
  useEffect(() => {
    const unsub = LineupHistoryService.subscribe(() => {
      setCanUndo(LineupHistoryService.canUndo());
      setCanRedo(LineupHistoryService.canRedo());
    });
    return unsub;
  }, []);

  // Register live snapshot provider so unsealed snapshots capture current state before app-wide actions
  useEffect(() => {
    const unregister = LineupHistoryService.registerCurrentSnapshotProvider(currentContextKey, () => ({
      serviceType,
      serviceDate,
      praiseSongs: [...praiseSongs],
      worshipSongs: [...worshipSongs],
      praiseSongKeys: [...praiseSongKeys],
      worshipSongKeys: [...worshipSongKeys],
      ministryRows: JSON.parse(JSON.stringify(ministryRows))
    }));
    return unregister;
  }, [currentContextKey, serviceType, serviceDate, praiseSongs, worshipSongs, praiseSongKeys, worshipSongKeys, ministryRows]);

  // Listen for restore-scheduler-snapshot custom events triggered by unified undo/redo
  useEffect(() => {
    const handleRestore = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || !detail.snapshot) return;
      const s = detail.snapshot as SchedulerSnapshot;
      isRestoringHistoryRef.current = true;
      setServiceType(s.serviceType);
      setServiceDate(s.serviceDate);
      setPraiseSongs([...s.praiseSongs]);
      setWorshipSongs([...s.worshipSongs]);
      setPraiseSongKeys([...s.praiseSongKeys]);
      setWorshipSongKeys([...s.worshipSongKeys]);
      setMinistryRows(JSON.parse(JSON.stringify(s.ministryRows || [])));
      triggerHaptic('selection');
      setTimeout(() => {
        isRestoringHistoryRef.current = false;
      }, 60);
    };

    window.addEventListener('wwcf:restore-scheduler-snapshot', handleRestore);
    return () => {
      window.removeEventListener('wwcf:restore-scheduler-snapshot', handleRestore);
    };
  }, []);

  const takeSnapshot = useCallback((isDiscrete = true) => {
    if (isRestoringHistoryRef.current || isResettingRef.current) return;
    const now = Date.now();
    if (!isDiscrete && now - lastTypingTimeRef.current < 800) {
      lastTypingTimeRef.current = now;
      return;
    }
    lastTypingTimeRef.current = now;

    const snap: SchedulerSnapshot = {
      serviceType,
      serviceDate,
      praiseSongs: [...praiseSongs],
      worshipSongs: [...worshipSongs],
      praiseSongKeys: [...praiseSongKeys],
      worshipSongKeys: [...worshipSongKeys],
      ministryRows: JSON.parse(JSON.stringify(ministryRows))
    };
    LineupHistoryService.pushSnapshot(currentContextKey, snap);
  }, [currentContextKey, serviceType, serviceDate, praiseSongs, worshipSongs, praiseSongKeys, worshipSongKeys, ministryRows]);

  const handleUndo = useCallback(async () => {
    if (!LineupHistoryService.canUndo()) return;
    try {
      const currentSnap: SchedulerSnapshot = {
        serviceType,
        serviceDate,
        praiseSongs: [...praiseSongs],
        worshipSongs: [...worshipSongs],
        praiseSongKeys: [...praiseSongKeys],
        worshipSongKeys: [...worshipSongKeys],
        ministryRows: JSON.parse(JSON.stringify(ministryRows))
      };
      const res = await LineupHistoryService.undo(currentContextKey, currentSnap);
      triggerHaptic('selection');
      if (res && (res as any).description) {
        showToast(`Undone: ${(res as any).description}`, 'info');
      } else {
        showToast('Undid last lineup change.', 'info');
      }
    } catch (err) {
      console.error('Failed to undo in scheduler:', err);
      showToast('Failed to undo last action.', 'danger');
    }
  }, [currentContextKey, serviceType, serviceDate, praiseSongs, worshipSongs, praiseSongKeys, worshipSongKeys, ministryRows, showToast]);

  const handleRedo = useCallback(async () => {
    if (!LineupHistoryService.canRedo()) return;
    try {
      const currentSnap: SchedulerSnapshot = {
        serviceType,
        serviceDate,
        praiseSongs: [...praiseSongs],
        worshipSongs: [...worshipSongs],
        praiseSongKeys: [...praiseSongKeys],
        worshipSongKeys: [...worshipSongKeys],
        ministryRows: JSON.parse(JSON.stringify(ministryRows))
      };
      const res = await LineupHistoryService.redo(currentContextKey, currentSnap);
      triggerHaptic('selection');
      if (res && (res as any).description) {
        showToast(`Redone: ${(res as any).description}`, 'info');
      } else {
        showToast('Redid lineup change.', 'info');
      }
    } catch (err) {
      console.error('Failed to redo in scheduler:', err);
      showToast('Failed to redo last action.', 'danger');
    }
  }, [currentContextKey, serviceType, serviceDate, praiseSongs, worshipSongs, praiseSongKeys, worshipSongKeys, ministryRows, showToast]);

  // Full reset handler for Reset Form action
  const handlePerformFullReset = useCallback(() => {
    isResettingRef.current = true;
    const initialDetails = getSmartInitialServiceDetails(schedules);
    setServiceType(initialDetails.serviceType);
    setServiceDate(initialDetails.serviceDate);
    setIsDateManuallyEdited(false);
    setPraiseSongs(['']);
    setWorshipSongs(['']);
    setPraiseSongKeys(['']);
    setWorshipSongKeys(['']);
    setMinistryRows(createDefaultMinistryRows());
    setPendingDaAssignment(null);
    setSmartImportConfig({ isOpen: false });
    setPendingImportData(null);
    setDuplicateConflictSchedule(null);
    setMonthlyWarnings([]);
    LineupHistoryService.clearHistory(currentContextKey);
    setCanUndo(false);
    setCanRedo(false);
    StorageService.saveDraftSchedule(null);
    setTimeout(() => {
      isResettingRef.current = false;
    }, 100);
  }, [schedules, currentContextKey]);

  useEffect(() => {
    const onResetEvent = () => {
      handlePerformFullReset();
    };
    window.addEventListener('wwcf:reset-scheduler-form', onResetEvent);
    return () => {
      window.removeEventListener('wwcf:reset-scheduler-form', onResetEvent);
    };
  }, [handlePerformFullReset]);

  // Load editing schedule or initialize from versioned draft / smart default
  useEffect(() => {
    const currentContextKey = editingSchedule ? `edit_${editingSchedule.id}` : 'new_schedule';
    if (loadedScheduleIdRef.current !== currentContextKey) {
      loadedScheduleIdRef.current = currentContextKey;

      // Restore isolated history states from LineupHistoryService for this schedule
      setCanUndo(LineupHistoryService.canUndo(currentContextKey));
      setCanRedo(LineupHistoryService.canRedo(currentContextKey));

      const draft = StorageService.getDraftScheduleSync();

      if (editingSchedule) {
        // User clicked Edit on an existing schedule
        if (draft && draft.editingScheduleId === editingSchedule.id) {
          // Restore draft for this existing schedule
          setServiceType(draft.serviceType || editingSchedule.serviceType);
          setServiceDate(draft.serviceDate || editingSchedule.serviceDate);
          setIsDateManuallyEdited(true);
          setPraiseSongs(draft.praiseSongs !== undefined ? draft.praiseSongs : (editingSchedule.praiseSongs || []));
          setWorshipSongs(draft.worshipSongs !== undefined ? draft.worshipSongs : (editingSchedule.worshipSongs || []));
          setPraiseSongKeys(draft.praiseSongKeys !== undefined ? draft.praiseSongKeys : (editingSchedule.praiseSongKeys || []));
          setWorshipSongKeys(draft.worshipSongKeys !== undefined ? draft.worshipSongKeys : (editingSchedule.worshipSongKeys || []));
          setMinistryRows(
            syncMinistryRowsForSongLeaders(
              draft.ministryAssignments?.length
                ? draft.ministryAssignments.map((a: any) => ({
                    ...a,
                    assignedMembers: getAssignmentMembers(a),
                    notes: a.notes || ''
                  }))
                : createDefaultMinistryRows()
            )
          );
        } else {
          // Fresh load of editingSchedule
          setServiceType(editingSchedule.serviceType);
          setServiceDate(editingSchedule.serviceDate);
          setIsDateManuallyEdited(true);

          const resolved = resolveScheduleSongTitles(editingSchedule, allSongs);
          setPraiseSongs(resolved.praiseSongs || []);
          setWorshipSongs(resolved.worshipSongs || []);

          const pKeys = (resolved.praiseSongs || []).map((s, idx) => {
            if (editingSchedule.praiseSongKeys?.[idx] !== undefined) return editingSchedule.praiseSongKeys[idx];
            const found = allSongs.find(x => x.title.toLowerCase() === s.trim().toLowerCase() || x.id === s.trim());
            return found?.originalKey || found?.key || '';
          });
          setPraiseSongKeys(pKeys);

          const wKeys = (resolved.worshipSongs || []).map((s, idx) => {
            if (editingSchedule.worshipSongKeys?.[idx] !== undefined) return editingSchedule.worshipSongKeys[idx];
            const found = allSongs.find(x => x.title.toLowerCase() === s.trim().toLowerCase() || x.id === s.trim());
            return found?.originalKey || found?.key || '';
          });
          setWorshipSongKeys(wKeys);

          setMinistryRows(
            syncMinistryRowsForSongLeaders(
              editingSchedule.ministryAssignments.length
                ? editingSchedule.ministryAssignments.map(a => ({
                    ...a,
                    assignedMembers: getAssignmentMembers(a),
                    notes: a.notes || ''
                  }))
                : createDefaultMinistryRows()
            )
          );
        }
      } else {
        // New Schedule mode
        if (draft && draft.editingScheduleId === null) {
          // Restore draft for new schedule
          setServiceType(draft.serviceType || 'Sunday Service');
          setServiceDate(draft.serviceDate || getManilaTodayString());
          setIsDateManuallyEdited(true);
          setPraiseSongs(draft.praiseSongs?.length ? draft.praiseSongs : ['']);
          setWorshipSongs(draft.worshipSongs?.length ? draft.worshipSongs : ['']);
          setPraiseSongKeys(draft.praiseSongKeys?.length ? draft.praiseSongKeys : ['']);
          setWorshipSongKeys(draft.worshipSongKeys?.length ? draft.worshipSongKeys : ['']);
          setMinistryRows(
            syncMinistryRowsForSongLeaders(
              draft.ministryAssignments?.length
                ? draft.ministryAssignments.map((a: any) => ({
                    ...a,
                    assignedMembers: getAssignmentMembers(a),
                    notes: a.notes || ''
                  }))
                : createDefaultMinistryRows()
            )
          );
        } else {
          // Initialize smart defaults
          const smartInit = getSmartInitialServiceDetails(schedules);
          setServiceType(smartInit.serviceType);
          setServiceDate(smartInit.serviceDate);
          setIsDateManuallyEdited(false);
          setPraiseSongs(['']);
          setWorshipSongs(['']);
          setPraiseSongKeys(['']);
          setWorshipSongKeys(['']);
          setMinistryRows(createDefaultMinistryRows());
        }
      }
    }
  }, [editingSchedule]);

  // Autosave active draft schedule as changes occur
  useEffect(() => {
    if (isResettingRef.current) return;

    const hasSongs = praiseSongs.some((s) => s.trim() !== '') || worshipSongs.some((s) => s.trim() !== '');
    const hasAssignments = ministryRows.some((r) => r.assignedMembers.length > 0);

    if (hasSongs || hasAssignments || editingSchedule) {
      const timer = setTimeout(() => {
        StorageService.saveDraftSchedule({
          editingScheduleId: editingSchedule?.id || null,
          serviceType,
          serviceDate,
          praiseSongs,
          worshipSongs,
          praiseSongKeys,
          worshipSongKeys,
          ministryAssignments: ministryRows.map((r) => ({
            id: r.id || `ma_${r.role}`,
            role: r.role,
            assignedMembers: r.assignedMembers,
            notes: r.notes
          })),
          savedAt: new Date().toISOString()
        });
      }, 400);

      return () => clearTimeout(timer);
    }
  }, [
    serviceType,
    serviceDate,
    praiseSongs,
    worshipSongs,
    praiseSongKeys,
    worshipSongKeys,
    ministryRows,
    editingSchedule
  ]);

  // Safe reload / refresh guard: prevent accidental loss of unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasUnsavedSongs = praiseSongs.some((s) => s.trim() !== '') || worshipSongs.some((s) => s.trim() !== '');
      const hasUnsavedAssignments = ministryRows.some((r) => r.assignedMembers.length > 0);
      if (hasUnsavedSongs || hasUnsavedAssignments) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [praiseSongs, worshipSongs, ministryRows]);

  // Helper to load a schedule object into editor state
  const loadScheduleDataIntoEditor = (sched: Schedule) => {
    // Clear history on loading a distinct schedule
    LineupHistoryService.clearHistory(sched ? `edit_${sched.id}` : 'new_schedule');
    setCanUndo(false);
    setCanRedo(false);

    setServiceType(sched.serviceType);
    setServiceDate(sched.serviceDate);
    const resolved = resolveScheduleSongTitles(sched, allSongs);
    setPraiseSongs(resolved.praiseSongs || []);
    setWorshipSongs(resolved.worshipSongs || []);

    const pKeys = (resolved.praiseSongs || []).map((s, idx) => {
      if (sched.praiseSongKeys?.[idx] !== undefined) return sched.praiseSongKeys[idx];
      const found = allSongs.find(x => x.title.toLowerCase() === s.trim().toLowerCase() || x.id === s.trim());
      return found?.originalKey || found?.key || '';
    });
    setPraiseSongKeys(pKeys);

    const wKeys = (resolved.worshipSongs || []).map((s, idx) => {
      if (sched.worshipSongKeys?.[idx] !== undefined) return sched.worshipSongKeys[idx];
      const found = allSongs.find(x => x.title.toLowerCase() === s.trim().toLowerCase() || x.id === s.trim());
      return found?.originalKey || found?.key || '';
    });
    setWorshipSongKeys(wKeys);

    setMinistryRows(
      syncMinistryRowsForSongLeaders(
        sched.ministryAssignments.length
          ? sched.ministryAssignments.map(a => ({
              ...a,
              assignedMembers: getAssignmentMembers(a),
              notes: a.notes || ''
            }))
          : createDefaultMinistryRows()
      )
    );
  };

  // Handlers for Service Type & Date with smart auto-calculation (NO SILENT OVERWRITES!)
  const handleServiceTypeChange = (newType: ServiceType) => {
    takeSnapshot(true);
    const prevType = serviceType;
    setServiceType(newType);

    let targetDate = serviceDate;

    if (newType === 'Sunday Service') {
      const validation = isValidServiceDateForType('Sunday Service', serviceDate);
      if (!validation.isValid || !isDateManuallyEdited) {
        targetDate = getNextAvailableServiceDate('Sunday Service', schedules);
        setIsDateManuallyEdited(false);
      }
    } else if (newType === 'Midweek Prayer Service') {
      const validation = isValidServiceDateForType('Midweek Prayer Service', serviceDate);
      if (!validation.isValid || !isDateManuallyEdited) {
        targetDate = getNextAvailableServiceDate('Midweek Prayer Service', schedules);
        setIsDateManuallyEdited(false);
      }
    } else {
      if (!isDateManuallyEdited) {
        targetDate = getNextAvailableServiceDate(newType, schedules);
      }
    }

    setServiceDate(targetDate);

    // Notify Interactive Guide that user selected a Service Type (Does not dispatch date selection)
    window.dispatchEvent(
      new CustomEvent('service-type-user-selected', {
        detail: {
          previousType: prevType,
          serviceType: newType,
          serviceDate: targetDate
        }
      })
    );
  };

  const handleServiceDateChange = (newDate: string) => {
    if (!newDate) return;
    const prevDate = serviceDate;

    const validation = isValidServiceDateForType(serviceType, newDate);
    if (!validation.isValid) {
      showToast(validation.errorMessage || 'Invalid date selected for this service type.', 'danger');
      return;
    }

    takeSnapshot(true);
    setServiceDate(newDate);
    setIsDateManuallyEdited(true);

    // Notify Interactive Guide that user selected/changed a Service Date
    window.dispatchEvent(
      new CustomEvent('service-date-user-selected', {
        detail: {
          previousDate: prevDate,
          serviceDate: newDate,
          serviceType: serviceType
        }
      })
    );
  };

  // Auto-save draft trigger on any changes to scheduler state
  useEffect(() => {
    if (isResettingRef.current) return;
    const draft: Partial<Schedule> & { version?: number; editingScheduleId?: string | null } = {
      version: 2,
      editingScheduleId: editingSchedule?.id || null,
      serviceType,
      serviceDate,
      praiseSongs,
      worshipSongs,
      praiseSongKeys,
      worshipSongKeys,
      ministryAssignments: ministryRows
    };
    onTriggerDraft(draft);

    // Dispatch custom event so Interactive Guide can detect song additions/playlist imports
    window.dispatchEvent(
      new CustomEvent('lineup-songs-changed', {
        detail: { praiseSongs, worshipSongs }
      })
    );
  }, [serviceType, serviceDate, praiseSongs, worshipSongs, praiseSongKeys, worshipSongKeys, ministryRows, editingSchedule]);

  // Listen for request-lineup-songs and request-service-details from Interactive Guide
  useEffect(() => {
    const handleRequestSongs = () => {
      window.dispatchEvent(
        new CustomEvent('lineup-songs-changed', {
          detail: { praiseSongs, worshipSongs }
        })
      );
    };

    const handleRequestDetails = () => {
      window.dispatchEvent(
        new CustomEvent('service-details-response', {
          detail: { serviceType, serviceDate }
        })
      );
    };

    const handleCloseImportModal = () => {
      setSmartImportConfig({ isOpen: false });
    };

    window.addEventListener('request-lineup-songs', handleRequestSongs);
    window.addEventListener('request-service-details', handleRequestDetails);
    window.addEventListener('close-import-playlist-modal', handleCloseImportModal);
    return () => {
      window.removeEventListener('request-lineup-songs', handleRequestSongs);
      window.removeEventListener('request-service-details', handleRequestDetails);
      window.removeEventListener('close-import-playlist-modal', handleCloseImportModal);
    };
  }, [praiseSongs, worshipSongs, serviceType, serviceDate]);

  // Song input handlers
  const handlePraiseChange = (index: number, value: string) => {
    takeSnapshot(false);
    const updated = [...praiseSongs];
    updated[index] = value;
    setPraiseSongs(updated);

    const matchedSong = allSongs.find(s => s.title.toLowerCase() === value.trim().toLowerCase());
    const updatedKeys = [...praiseSongKeys];
    if (matchedSong) {
      updatedKeys[index] = matchedSong.originalKey || matchedSong.key || '';
    }
    setPraiseSongKeys(updatedKeys);
  };

  const handlePraiseKeyChange = (index: number, keyVal: string) => {
    takeSnapshot(true);
    const updatedKeys = [...praiseSongKeys];
    updatedKeys[index] = keyVal;
    setPraiseSongKeys(updatedKeys);
  };

  const addPraiseSong = () => {
    takeSnapshot(true);
    setPraiseSongs([...praiseSongs, '']);
    setPraiseSongKeys([...praiseSongKeys, '']);
  };

  const removePraiseSong = (index: number) => {
    takeSnapshot(true);
    setPraiseSongs(praiseSongs.filter((_, i) => i !== index));
    setPraiseSongKeys(praiseSongKeys.filter((_, i) => i !== index));
  };

  const handleWorshipChange = (index: number, value: string) => {
    takeSnapshot(false);
    const updated = [...worshipSongs];
    updated[index] = value;
    setWorshipSongs(updated);

    const matchedSong = allSongs.find(s => s.title.toLowerCase() === value.trim().toLowerCase());
    const updatedKeys = [...worshipSongKeys];
    if (matchedSong) {
      updatedKeys[index] = matchedSong.originalKey || matchedSong.key || '';
    }
    setWorshipSongKeys(updatedKeys);
  };

  const handleWorshipKeyChange = (index: number, keyVal: string) => {
    takeSnapshot(true);
    const updatedKeys = [...worshipSongKeys];
    updatedKeys[index] = keyVal;
    setWorshipSongKeys(updatedKeys);
  };

  const addWorshipSong = () => {
    takeSnapshot(true);
    setWorshipSongs([...worshipSongs, '']);
    setWorshipSongKeys([...worshipSongKeys, '']);
  };

  const removeWorshipSong = (index: number) => {
    takeSnapshot(true);
    setWorshipSongs(worshipSongs.filter((_, i) => i !== index));
    setWorshipSongKeys(worshipSongKeys.filter((_, i) => i !== index));
  };

  // Handler for adding recommended songs directly into current lineup
  const handleAddRecommendedSong = (category: 'praise' | 'worship', songTitle: string, defaultKey?: string) => {
    takeSnapshot(true);
    if (category === 'praise') {
      if (praiseSongs.length === 1 && praiseSongs[0].trim() === '') {
        setPraiseSongs([songTitle]);
        setPraiseSongKeys([defaultKey || '']);
      } else {
        setPraiseSongs([...praiseSongs, songTitle]);
        setPraiseSongKeys([...praiseSongKeys, defaultKey || '']);
      }
      showToast(`Added "${songTitle}" to Praise songs`, 'success');
    } else {
      if (worshipSongs.length === 1 && worshipSongs[0].trim() === '') {
        setWorshipSongs([songTitle]);
        setWorshipSongKeys([defaultKey || '']);
      } else {
        setWorshipSongs([...worshipSongs, songTitle]);
        setWorshipSongKeys([...worshipSongKeys, defaultKey || '']);
      }
      showToast(`Added "${songTitle}" to Worship songs`, 'success');
    }
  };

  // Helper to sync category changes to database based on lineup position
  const syncCategoriesForLineup = async (praiseList: string[], worshipList: string[]) => {
    const praiseTitles = praiseList.map((s) => s.trim().toLowerCase()).filter(Boolean);
    const worshipTitles = worshipList.map((s) => s.trim().toLowerCase()).filter(Boolean);

    if (praiseTitles.length === 0 && worshipTitles.length === 0) return;

    try {
      const songs = await SongService.getSongs();
      const praiseIds: string[] = [];
      const worshipIds: string[] = [];

      songs.forEach((song) => {
        const titleLower = song.title.trim().toLowerCase();
        if (praiseTitles.includes(titleLower)) {
          praiseIds.push(song.id);
        } else if (worshipTitles.includes(titleLower)) {
          worshipIds.push(song.id);
        }
      });

      if (praiseIds.length > 0) {
        await SongService.bulkUpdateCategory(praiseIds, 'praise');
      }
      if (worshipIds.length > 0) {
        await SongService.bulkUpdateCategory(worshipIds, 'worship');
      }
    } catch (e) {
      console.warn('Failed to sync song categories:', e);
    }
  };

  // Unified Song Movement Engine (Handles Cross-Category Moves & Reordering)
  const executeSongMove = (
    source: DraggedSongState,
    targetCategory: 'praise' | 'worship',
    targetIndex?: number,
    targetPosition: 'before' | 'after' = 'after'
  ) => {
    takeSnapshot(true);
    let nextPraise = [...praiseSongs];
    let nextPraiseKeys = [...praiseSongKeys];
    let nextWorship = [...worshipSongs];
    let nextWorshipKeys = [...worshipSongKeys];

    if (source.type === 'lineup') {
      const { category: srcCategory, index: srcIndex } = source;

      if (srcCategory === targetCategory) {
        // 1. REORDER WITHIN THE SAME CATEGORY LIST
        const list = targetCategory === 'praise' ? nextPraise : nextWorship;
        const keysList = targetCategory === 'praise' ? nextPraiseKeys : nextWorshipKeys;

        if (srcIndex >= 0 && srcIndex < list.length) {
          const [movedSong] = list.splice(srcIndex, 1);
          const [movedKey] = keysList.splice(srcIndex, 1);

          let finalTargetIndex: number;
          if (targetIndex !== undefined) {
            let insertAt = targetPosition === 'after' ? targetIndex + 1 : targetIndex;
            if (srcIndex < insertAt) {
              insertAt = Math.max(0, insertAt - 1);
            }
            finalTargetIndex = Math.min(Math.max(0, insertAt), list.length);
          } else {
            finalTargetIndex = list.length;
          }

          list.splice(finalTargetIndex, 0, movedSong);
          keysList.splice(finalTargetIndex, 0, movedKey || '');

          if (targetCategory === 'praise') {
            setPraiseSongs([...list]);
            setPraiseSongKeys([...keysList]);
          } else {
            setWorshipSongs([...list]);
            setWorshipSongKeys([...keysList]);
          }
        }
      } else {
        // 2. CROSS-CATEGORY MOVE (Praise -> Worship or Worship -> Praise)
        const srcList = srcCategory === 'praise' ? nextPraise : nextWorship;
        const srcKeys = srcCategory === 'praise' ? nextPraiseKeys : nextWorshipKeys;
        const destList = targetCategory === 'praise' ? nextPraise : nextWorship;
        const destKeys = targetCategory === 'praise' ? nextPraiseKeys : nextWorshipKeys;

        if (srcIndex >= 0 && srcIndex < srcList.length) {
          const songToMove = srcList[srcIndex];
          const keyToMove = srcKeys[srcIndex] || '';

          if (!songToMove || songToMove.trim() === '') {
            return;
          }

          // Remove from source list (can become cleanly empty)
          srcList.splice(srcIndex, 1);
          srcKeys.splice(srcIndex, 1);

          // Destination list: If destination currently only has 1 song and it's blank '', replace it!
          if (destList.length === 1 && (!destList[0] || destList[0].trim() === '')) {
            destList[0] = songToMove;
            destKeys[0] = keyToMove;
          } else {
            let finalTargetIndex: number;
            if (targetIndex !== undefined) {
              const insertAt = targetPosition === 'after' ? targetIndex + 1 : targetIndex;
              finalTargetIndex = Math.min(Math.max(0, insertAt), destList.length);
            } else {
              finalTargetIndex = destList.length;
            }
            destList.splice(finalTargetIndex, 0, songToMove);
            destKeys.splice(finalTargetIndex, 0, keyToMove);
          }

          if (srcCategory === 'praise') {
            setPraiseSongs([...srcList]);
            setPraiseSongKeys([...srcKeys]);
            setWorshipSongs([...destList]);
            setWorshipSongKeys([...destKeys]);
          } else {
            setWorshipSongs([...srcList]);
            setWorshipSongKeys([...srcKeys]);
            setPraiseSongs([...destList]);
            setPraiseSongKeys([...destKeys]);
          }

          const toName = targetCategory === 'praise' ? 'Praise (Fast)' : 'Worship (Slow)';
          showToast(`Moved "${songToMove}" to ${toName} songs`, 'success');
        }
      }
    } else if (source.type === 'recommendation') {
      // 3. DROP RECOMMENDATION INTO LINEUP
      const destList = targetCategory === 'praise' ? nextPraise : nextWorship;
      const destKeys = targetCategory === 'praise' ? nextPraiseKeys : nextWorshipKeys;

      if (destList.length === 1 && (!destList[0] || destList[0].trim() === '')) {
        destList[0] = source.songTitle;
        destKeys[0] = source.key || '';
      } else {
        let finalTargetIndex: number;
        if (targetIndex !== undefined) {
          const insertAt = targetPosition === 'after' ? targetIndex + 1 : targetIndex;
          finalTargetIndex = Math.min(Math.max(0, insertAt), destList.length);
        } else {
          finalTargetIndex = destList.length;
        }
        destList.splice(finalTargetIndex, 0, source.songTitle);
        destKeys.splice(finalTargetIndex, 0, source.key || '');
      }

      if (targetCategory === 'praise') {
        setPraiseSongs([...destList]);
        setPraiseSongKeys([...destKeys]);
      } else {
        setWorshipSongs([...destList]);
        setWorshipSongKeys([...destKeys]);
      }

      const toName = targetCategory === 'praise' ? 'Praise' : 'Worship';
      showToast(`Added "${source.songTitle}" to ${toName} songs`, 'success');
    }
  };

  // Reordering & Category Swap button / select handlers
  const moveSongUp = (category: 'praise' | 'worship', index: number) => {
    if (index === 0) {
      if (category === 'worship') {
        const songToMove = worshipSongs[0];
        if (!songToMove || !songToMove.trim()) return;
        executeSongMove(
          {
            type: 'lineup',
            category: 'worship',
            index: 0,
            songTitle: songToMove,
            key: worshipSongKeys[0] || ''
          },
          'praise'
        );
      }
      return;
    }
    const songToMove = category === 'praise' ? praiseSongs[index] : worshipSongs[index];
    if (!songToMove || !songToMove.trim()) return;
    executeSongMove(
      {
        type: 'lineup',
        category,
        index,
        songTitle: songToMove,
        key: category === 'praise' ? praiseSongKeys[index] || '' : worshipSongKeys[index] || ''
      },
      category,
      index - 1,
      'before'
    );
  };

  const moveSongDown = (category: 'praise' | 'worship', index: number) => {
    const list = category === 'praise' ? praiseSongs : worshipSongs;
    if (index === list.length - 1) {
      if (category === 'praise') {
        const songToMove = praiseSongs[index];
        if (!songToMove || !songToMove.trim()) return;
        executeSongMove(
          {
            type: 'lineup',
            category: 'praise',
            index,
            songTitle: songToMove,
            key: praiseSongKeys[index] || ''
          },
          'worship',
          0,
          'before'
        );
      }
      return;
    }
    const songToMove = list[index];
    if (!songToMove || !songToMove.trim()) return;
    executeSongMove(
      {
        type: 'lineup',
        category,
        index,
        songTitle: songToMove,
        key: category === 'praise' ? praiseSongKeys[index] || '' : worshipSongKeys[index] || ''
      },
      category,
      index + 1,
      'after'
    );
  };

  const changeSongCategory = (fromCategory: 'praise' | 'worship', index: number, toCategory: 'praise' | 'worship') => {
    if (fromCategory === toCategory) return;
    const songToMove = fromCategory === 'praise' ? praiseSongs[index] : worshipSongs[index];
    if (!songToMove || !songToMove.trim()) return;
    executeSongMove(
      {
        type: 'lineup',
        category: fromCategory,
        index,
        songTitle: songToMove,
        key: fromCategory === 'praise' ? praiseSongKeys[index] || '' : worshipSongKeys[index] || ''
      },
      toCategory
    );
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, category: 'praise' | 'worship', index: number) => {
    const songTitle = category === 'praise' ? praiseSongs[index] : worshipSongs[index];
    const key = category === 'praise' ? praiseSongKeys[index] || '' : worshipSongKeys[index] || '';

    const dragData: DraggedSongState = {
      type: 'lineup',
      category,
      index,
      songTitle,
      key
    };

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
    setDraggedItem(dragData);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverSection(null);
    setDropTarget(null);
    setActiveDragHandle(null);
  };

  const handleSectionDragOver = (e: React.DragEvent, category: 'praise' | 'worship') => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverSection !== category) {
      setDragOverSection(category);
    }
  };

  const handleSectionDragLeave = (e: React.DragEvent, category: 'praise' | 'worship') => {
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      if (dragOverSection === category) {
        setDragOverSection(null);
      }
    }
  };

  const handleItemDragOver = (
    e: React.DragEvent,
    category: 'praise' | 'worship',
    index: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    setDragOverSection(category);

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position: 'before' | 'after' = e.clientY < midY ? 'before' : 'after';

    setDropTarget({
      category,
      index,
      position
    });
  };

  const parseDragSource = (e: React.DragEvent): DraggedSongState | null => {
    if (draggedItem) return draggedItem;
    try {
      const raw = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
      if (!raw) return null;
      return JSON.parse(raw) as DraggedSongState;
    } catch {
      return null;
    }
  };

  const handleItemDrop = (e: React.DragEvent, targetCategory: 'praise' | 'worship', targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    const source = parseDragSource(e);
    const position = dropTarget?.position || 'after';

    handleDragEnd();

    if (!source) return;
    executeSongMove(source, targetCategory, targetIndex, position);
  };

  const handleSectionDrop = (e: React.DragEvent, targetCategory: 'praise' | 'worship') => {
    e.preventDefault();
    e.stopPropagation();

    const source = parseDragSource(e);
    const targetIndex = dropTarget?.category === targetCategory ? dropTarget.index : undefined;
    const position = dropTarget?.position || 'after';

    handleDragEnd();

    if (!source) return;
    executeSongMove(source, targetCategory, targetIndex, position);
  };

  // Lineup creation & playlist import handlers
  const executePlaylistReplace = async (importedSongs: Song[], summary: ImportSummary) => {
    if (!importedSongs || importedSongs.length === 0) return;
    takeSnapshot(true);

    // Honor the user-reviewed category on each imported song
    let praiseImported = importedSongs.filter((s) => s.category === 'praise');
    let worshipImported = importedSongs.filter((s) => s.category === 'worship');

    // Fallback if neither song had an explicit category:
    if (praiseImported.length === 0 && worshipImported.length === 0) {
      if (importedSongs.length === 2) {
        // Explicit 2-item rule: item 1 is Praise and item 2 is Worship
        praiseImported = [importedSongs[0]];
        worshipImported = [importedSongs[1]];
      } else {
        praiseImported = importedSongs.slice(0, 2);
        worshipImported = importedSongs.slice(2);
      }
    }

    const praiseTitles = praiseImported.map((s) => s.title);
    const worshipTitles = worshipImported.map((s) => s.title);

    const praiseKeys = praiseImported.map((s) => s.originalKey || s.key || '');
    const worshipKeys = worshipImported.map((s) => s.originalKey || s.key || '');

    const newPraise = praiseTitles.length > 0 ? praiseTitles : [''];
    const newWorship = worshipTitles.length > 0 ? worshipTitles : [''];

    setPraiseSongs(newPraise);
    setWorshipSongs(newWorship);

    setPraiseSongKeys(praiseKeys.length > 0 ? praiseKeys : ['']);
    setWorshipSongKeys(worshipKeys.length > 0 ? worshipKeys : ['']);

    await syncCategoriesForLineup(newPraise, newWorship);
    onRefreshSongs();

    showToast(
      `Replaced songs in lineup with imported playlist. (${summary.newlyAdded} new song${summary.newlyAdded === 1 ? '' : 's'} added to database)`,
      'success'
    );

    window.dispatchEvent(
      new CustomEvent('playlist-import-success', {
        detail: { praiseSongs: newPraise, worshipSongs: newWorship, summary }
      })
    );
  };

  const executePlaylistMerge = async (importedSongs: Song[], summary: ImportSummary) => {
    if (!importedSongs || importedSongs.length === 0) return;

    const existingTitlesSet = new Set<string>();
    praiseSongs.forEach((title) => {
      if (title.trim()) existingTitlesSet.add(title.trim().toLowerCase());
    });
    worshipSongs.forEach((title) => {
      if (title.trim()) existingTitlesSet.add(title.trim().toLowerCase());
    });

    const nonDuplicates = importedSongs.filter(
      (s) => !existingTitlesSet.has(s.title.trim().toLowerCase())
    );

    if (nonDuplicates.length === 0) {
      showToast('All imported songs are already present in this lineup.', 'info');
      return;
    }

    takeSnapshot(true);

    let newPraiseImported = nonDuplicates.filter((s) => s.category === 'praise');
    let newWorshipImported = nonDuplicates.filter((s) => s.category === 'worship');

    if (newPraiseImported.length === 0 && newWorshipImported.length === 0) {
      if (nonDuplicates.length === 2) {
        newPraiseImported = [nonDuplicates[0]];
        newWorshipImported = [nonDuplicates[1]];
      } else {
        newPraiseImported = nonDuplicates.slice(0, Math.min(2, Math.ceil(nonDuplicates.length / 2)));
        newWorshipImported = nonDuplicates.slice(newPraiseImported.length);
      }
    }

    const cleanPraise = praiseSongs.filter((s) => Boolean(s.trim()));
    const cleanPraiseKeys = praiseSongKeys.filter((_, idx) => Boolean(praiseSongs[idx]?.trim()));

    const cleanWorship = worshipSongs.filter((s) => Boolean(s.trim()));
    const cleanWorshipKeys = worshipSongKeys.filter((_, idx) => Boolean(worshipSongs[idx]?.trim()));

    const mergedPraiseTitles = [
      ...cleanPraise,
      ...newPraiseImported.map((s) => s.title)
    ];
    const mergedPraiseKeys = [
      ...cleanPraiseKeys,
      ...newPraiseImported.map((s) => s.originalKey || s.key || '')
    ];

    const mergedWorshipTitles = [
      ...cleanWorship,
      ...newWorshipImported.map((s) => s.title)
    ];
    const mergedWorshipKeys = [
      ...cleanWorshipKeys,
      ...newWorshipImported.map((s) => s.originalKey || s.key || '')
    ];

    const finalPraise = mergedPraiseTitles.length > 0 ? mergedPraiseTitles : [''];
    const finalWorship = mergedWorshipTitles.length > 0 ? mergedWorshipTitles : [''];

    setPraiseSongs(finalPraise);
    setPraiseSongKeys(mergedPraiseKeys.length > 0 ? mergedPraiseKeys : ['']);

    setWorshipSongs(finalWorship);
    setWorshipSongKeys(mergedWorshipKeys.length > 0 ? mergedWorshipKeys : ['']);

    await syncCategoriesForLineup(finalPraise, finalWorship);
    onRefreshSongs();

    showToast(
      `Merged ${nonDuplicates.length} new song${nonDuplicates.length === 1 ? '' : 's'} into lineup!`,
      'success'
    );

    window.dispatchEvent(
      new CustomEvent('playlist-import-success', {
        detail: { praiseSongs: finalPraise, worshipSongs: finalWorship, summary }
      })
    );
  };

  const executePlaylistImport = async (importedSongs: Song[], summary: ImportSummary) => {
    executePlaylistReplace(importedSongs, summary);
  };

  const handlePlaylistImportComplete = (importedSongs: Song[], summary: ImportSummary) => {
    if (importedSongs.length === 0) return;

    const hasCurrentSongs =
      praiseSongs.some((s) => Boolean(s.trim())) ||
      worshipSongs.some((s) => Boolean(s.trim()));

    if (hasCurrentSongs) {
      setPendingImportData({ importedSongs, summary });
      setIsConfirmReplaceOpen(true);
    } else {
      executePlaylistImport(importedSongs, summary);
    }
  };

  const handleCreateBlankLineup = () => {
    takeSnapshot(true);
    setPraiseSongs(['']);
    setWorshipSongs(['']);
    setSmartImportConfig({ isOpen: false });
    showToast('Started blank service line-up.', 'info');
    window.dispatchEvent(
      new CustomEvent('blank-lineup-created', {
        detail: { praiseSongs: [''], worshipSongs: [''] }
      })
    );
  };

  // Ministry handlers & dynamic 1 vs 2 Song Leaders sync
  const syncMinistryRowsForSongLeaders = (rows: MinistryAssignment[]): MinistryAssignment[] => {
    const isLeader = (rName: string) => {
      const r = (rName || '').toLowerCase();
      return r.includes('song leader') || r.includes('worship leader') || r.includes('praise leader') || r.includes('song lead');
    };

    const isBackup = (rName: string) => {
      const r = (rName || '').toLowerCase();
      return r.includes('backup') || r.includes('vocalist');
    };

    const leaderRows = rows.filter((r) => isLeader(r.role));
    const backupRows = rows.filter((r) => isBackup(r.role));
    const otherRows = rows.filter((r) => !isLeader(r.role) && !isBackup(r.role));

    // Extract assigned song leaders
    let leaderMembers: AssignedMember[] = [];
    leaderRows.forEach((r) => {
      const members = getAssignmentMembers(r);
      members.forEach((m) => {
        leaderMembers.push(m);
      });
    });

    const filledLeaderMembers = leaderMembers.filter(
      (m) => Boolean(m.memberId) || (m.memberName && m.memberName !== 'Unassigned' && m.memberName !== '—' && m.memberName !== '')
    );

    const filledPraiseLeaders = leaderRows
      .filter((r) => {
        const rLower = (r.role || '').toLowerCase();
        return rLower.includes('praise') && !rLower.includes('worship');
      })
      .flatMap((r) => getAssignmentMembers(r))
      .filter((m) => Boolean(m.memberId) || (m.memberName && m.memberName !== 'Unassigned' && m.memberName !== '—' && m.memberName !== ''));

    const filledWorshipLeaders = leaderRows
      .filter((r) => {
        const rLower = (r.role || '').toLowerCase();
        return rLower.includes('worship') && !rLower.includes('praise');
      })
      .flatMap((r) => getAssignmentMembers(r))
      .filter((m) => Boolean(m.memberId) || (m.memberName && m.memberName !== 'Unassigned' && m.memberName !== '—' && m.memberName !== ''));

    const hasTwoSeparateFilledLeaders = filledPraiseLeaders.length > 0 && filledWorshipLeaders.length > 0;

    const distinctAssignedLeaderIds = Array.from(
      new Set(
        filledLeaderMembers
          .map((m) => m.memberId)
          .filter((id) => Boolean(id && id.trim()))
      )
    );

    const isTwoLeaders =
      distinctAssignedLeaderIds.length >= 2 ||
      hasTwoSeparateFilledLeaders;

    if (!isTwoLeaders) {
      // ONE SONG LEADER MODE
      const assignedLeaders = leaderMembers.filter((m) => Boolean(m.memberId));
      const unassignedLeaderSlots = leaderMembers.filter((m) => !m.memberId);
      const leaderSlots = assignedLeaders.length > 0
        ? [assignedLeaders[0], ...unassignedLeaderSlots.slice(0, 1)]
        : leaderMembers.length > 0 ? leaderMembers.slice(0, 2) : [{ memberId: '', memberName: '' }];

      const singleLeader = leaderSlots[0] || { memberId: '', memberName: '' };

      const existingPWLeaderRow = leaderRows.find((r) =>
        r.role.toLowerCase().includes('praise/worship') || r.role.toLowerCase().includes('praise & worship')
      );

      const newLeaderRow: MinistryAssignment = {
        id: existingPWLeaderRow?.id || leaderRows[0]?.id || `m-row-sl-pw-${Date.now()}`,
        role: 'Song Leader (Praise/Worship)',
        assignedMembers: leaderSlots,
        notes: existingPWLeaderRow?.notes || leaderRows[0]?.notes || ''
      };

      // Combine all backup members from any backup rows
      let combinedBackupsRaw: AssignedMember[] = [];
      backupRows.forEach((r) => {
        combinedBackupsRaw.push(...getAssignmentMembers(r));
      });

      // Exclude single leader if assigned
      if (singleLeader.memberId) {
        combinedBackupsRaw = combinedBackupsRaw.filter((m) => m.memberId !== singleLeader.memberId);
      }

      // Deduplicate filled members, but keep empty/unassigned slots so + Add Member works!
      const combinedBackups: AssignedMember[] = [];
      const seenIds = new Set<string>();
      combinedBackupsRaw.forEach((m) => {
        if (m.memberId) {
          if (!seenIds.has(m.memberId)) {
            seenIds.add(m.memberId);
            combinedBackups.push(m);
          }
        } else {
          combinedBackups.push(m);
        }
      });

      const finalBackups = combinedBackups.length > 0 ? combinedBackups : [{ memberId: '', memberName: '' }];

      const existingGenBackupRow = backupRows.find((r) =>
        !r.role.toLowerCase().includes('praise') && !r.role.toLowerCase().includes('worship')
      );

      const newBackupRow: MinistryAssignment = {
        id: existingGenBackupRow?.id || backupRows[0]?.id || `m-row-bu-gen-${Date.now()}`,
        role: 'Backup Singer/s',
        assignedMembers: finalBackups,
        notes: existingGenBackupRow?.notes || backupRows[0]?.notes || ''
      };

      return [newLeaderRow, newBackupRow, ...otherRows];
    } else {
      // TWO SONG LEADERS MODE: First added leader is Praise; second is Worship.
      const praiseLeader = (distinctAssignedLeaderIds[0]
        ? leaderMembers.find((m) => m.memberId === distinctAssignedLeaderIds[0])
        : null) || leaderMembers[0] || { memberId: '', memberName: '' };

      const worshipLeader = (distinctAssignedLeaderIds[1]
        ? leaderMembers.find((m) => m.memberId === distinctAssignedLeaderIds[1])
        : null) || leaderMembers[1] || { memberId: '', memberName: '' };

      const existingPraiseLeaderRow = leaderRows.find((r) =>
        r.role.toLowerCase().includes('praise') && !r.role.toLowerCase().includes('worship')
      );
      const existingWorshipLeaderRow = leaderRows.find((r) =>
        r.role.toLowerCase().includes('worship') && !r.role.toLowerCase().includes('praise')
      );

      const existingPraiseBackupRow = backupRows.find((r) =>
        r.role.toLowerCase().includes('praise') && !r.role.toLowerCase().includes('worship')
      );
      const existingWorshipBackupRow = backupRows.find((r) =>
        r.role.toLowerCase().includes('worship') && !r.role.toLowerCase().includes('praise')
      );
      const existingGenBackupRow = backupRows.find((r) =>
        !r.role.toLowerCase().includes('praise') && !r.role.toLowerCase().includes('worship')
      );

      // Praise Backups
      let pBackupList: AssignedMember[] = [];
      if (existingPraiseBackupRow) {
        pBackupList = getAssignmentMembers(existingPraiseBackupRow);
      } else if (existingGenBackupRow) {
        pBackupList = getAssignmentMembers(existingGenBackupRow);
      }
      if (praiseLeader.memberId) {
        pBackupList = pBackupList.filter((m) => m.memberId !== praiseLeader.memberId);
      }
      if (pBackupList.length === 0) {
        pBackupList = [{ memberId: '', memberName: '' }];
      }

      // Worship Backups
      let wBackupList: AssignedMember[] = [];
      if (existingWorshipBackupRow) {
        wBackupList = getAssignmentMembers(existingWorshipBackupRow);
      } else {
        wBackupList = [{ memberId: '', memberName: '' }];
      }
      if (worshipLeader.memberId) {
        wBackupList = wBackupList.filter((m) => m.memberId !== worshipLeader.memberId);
      }
      if (wBackupList.length === 0) {
        wBackupList = [{ memberId: '', memberName: '' }];
      }

      const praiseLeaderRow: MinistryAssignment = {
        id: existingPraiseLeaderRow?.id || leaderRows[0]?.id || `m-row-sl-praise-${Date.now()}`,
        role: 'Song Leader (Praise)',
        assignedMembers: [praiseLeader],
        notes: existingPraiseLeaderRow?.notes || leaderRows[0]?.notes || ''
      };

      const worshipLeaderRow: MinistryAssignment = {
        id: existingWorshipLeaderRow?.id || leaderRows[1]?.id || `m-row-sl-worship-${Date.now() + 1}`,
        role: 'Song Leader (Worship)',
        assignedMembers: [worshipLeader],
        notes: existingWorshipLeaderRow?.notes || leaderRows[1]?.notes || ''
      };

      const praiseBackupRow: MinistryAssignment = {
        id: existingPraiseBackupRow?.id || backupRows[0]?.id || `m-row-bu-praise-${Date.now() + 2}`,
        role: 'Backup Singer/s (Praise)',
        assignedMembers: pBackupList,
        notes: existingPraiseBackupRow?.notes || backupRows[0]?.notes || ''
      };

      const worshipBackupRow: MinistryAssignment = {
        id: existingWorshipBackupRow?.id || backupRows[1]?.id || `m-row-bu-worship-${Date.now() + 3}`,
        role: 'Backup Singer/s (Worship)',
        assignedMembers: wBackupList,
        notes: existingWorshipBackupRow?.notes || backupRows[1]?.notes || ''
      };

      // REQUIRED TWO-LEADER DISPLAY ORDER:
      // 1. Song Leader (Praise)
      // 2. Backup Singer/s (Praise)
      // 3. Song Leader (Worship)
      // 4. Backup Singer/s (Worship)
      return [praiseLeaderRow, praiseBackupRow, worshipLeaderRow, worshipBackupRow, ...otherRows];
    }
  };

  const handleMinistryRoleChange = (id: string, newRole: string) => {
    takeSnapshot(true);
    setMinistryRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, role: newRole } : row))
    );
  };

  const handleMinistryNotesChange = (id: string, notes: string) => {
    takeSnapshot(false);
    setMinistryRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, notes } : row))
    );
  };

  const handleAddMemberToMinistry = (rowId: string) => {
    takeSnapshot(true);
    setMinistryRows((rows) => {
      const updated = rows.map((row) => {
        if (row.id !== rowId) return row;
        const current = getAssignmentMembers(row);
        return {
          ...row,
          assignedMembers: [...current, { memberId: '', memberName: '' }]
        };
      });
      return syncMinistryRowsForSongLeaders(updated);
    });
  };

  const executeMemberAssignment = (rowId: string, memberIdx: number, memberId: string) => {
    takeSnapshot(true);
    const memberObj = members.find((m) => m.id === memberId);

    setMinistryRows((rows) => {
      const updated = rows.map((row) => {
        if (row.id === rowId) {
          const current = [...getAssignmentMembers(row)];
          current[memberIdx] = {
            memberId,
            memberName: memberObj ? memberObj.name : ''
          };
          return {
            ...row,
            assignedMembers: current
          };
        }
        return row;
      });
      return syncMinistryRowsForSongLeaders(updated);
    });

    if (memberId) {
      window.dispatchEvent(
        new CustomEvent('team-member-assigned', {
          detail: { rowId, memberId }
        })
      );
    }
  };

  const handleUpdateMinistryMember = (rowId: string, memberIdx: number, memberId: string) => {
    if (!memberId) {
      // User is clearing the assignment
      executeMemberAssignment(rowId, memberIdx, '');
      return;
    }

    const targetMember = members.find((m) => m.id === memberId);
    if (targetMember && isMemberUnderDisciplinary(targetMember, serviceDate)) {
      // Trigger DA Confirmation dialog before adding
      setPendingDaAssignment({
        rowId,
        memberIdx,
        memberId,
        member: targetMember
      });
      triggerHaptic('warning');
      return;
    }

    // Normal assignment
    executeMemberAssignment(rowId, memberIdx, memberId);
  };

  const handleConfirmDaAssignment = () => {
    if (!pendingDaAssignment) return;
    const { rowId, memberIdx, memberId, member } = pendingDaAssignment;
    executeMemberAssignment(rowId, memberIdx, memberId);
    setPendingDaAssignment(null);
    triggerHaptic('success');
    showToast(
      `${member.name} assigned to lineup as an exceptional assignment. DA status remains active.`,
      'info'
    );
  };

  const handleCancelDaAssignment = () => {
    setPendingDaAssignment(null);
    triggerHaptic('tap');
  };

  const handleRemoveMemberFromMinistry = (rowId: string, memberIdx: number) => {
    takeSnapshot(true);
    setMinistryRows((rows) => {
      const updated = rows.map((row) => {
        if (row.id !== rowId) return row;
        const current = getAssignmentMembers(row).filter((_, idx) => idx !== memberIdx);
        return {
          ...row,
          assignedMembers: current
        };
      });
      return syncMinistryRowsForSongLeaders(updated);
    });
  };

  const addMinistryRow = () => {
    takeSnapshot(true);
    const newRow: MinistryAssignment = {
      id: `m-row-custom-${Date.now()}`,
      role: '',
      assignedMembers: [{ memberId: '', memberName: '' }],
      notes: ''
    };
    setMinistryRows([...ministryRows, newRow]);
  };

  const removeMinistryRow = (id: string) => {
    takeSnapshot(true);
    setMinistryRows((rows) => syncMinistryRowsForSongLeaders(rows.filter((r) => r.id !== id)));
  };

  // Filter members dropdown helper based on smart role matching & date-aware DA check
  const getFilteredMembers = (roleName: string) => {
    // DA members are NOT excluded; they are displayed with a warning indicator and require confirmation
    const eligibleMembers = members;

    // NEW RULE 1: HARD ELIGIBILITY RULE FOR BACKUP SINGER
    // Only members with the "Vocalist" tag may appear in any Backup Singer selection.
    if (isBackupRole(roleName)) {
      return eligibleMembers.filter((m) =>
        m.labels && m.labels.some((lbl) => lbl.trim().toLowerCase() === 'vocalist')
      );
    }

    if (!isSmartFilter || !roleName) return eligibleMembers;

    const lowerRole = roleName.toLowerCase();
    let targetKeywords: string[] = [];

    if (lowerRole.includes('song') || lowerRole.includes('lead') || lowerRole.includes('worship')) {
      targetKeywords = ['song leader', 'worship leader', 'song lead'];
    } else if (lowerRole.includes('guitar')) {
      targetKeywords = ['guitarist'];
    } else if (lowerRole.includes('keyboard') || lowerRole.includes('key')) {
      targetKeywords = ['keyboardist'];
    } else if (lowerRole.includes('bass')) {
      targetKeywords = ['bassist'];
    } else if (lowerRole.includes('drum')) {
      targetKeywords = ['drummer'];
    } else if (lowerRole.includes('audio') || lowerRole.includes('tech') || lowerRole.includes('live') || lowerRole.includes('sound')) {
      targetKeywords = ['audio/live technician', 'technician', 'tech'];
    } else if (lowerRole.includes('lyric') || lowerRole.includes('slides') || lowerRole.includes('av')) {
      targetKeywords = ['lyricist'];
    }

    if (targetKeywords.length === 0) return eligibleMembers;

    return eligibleMembers.filter((m) =>
      m.labels && m.labels.some((lbl) => {
        const lowerLbl = lbl.trim().toLowerCase();
        return targetKeywords.some((kw) => lowerLbl.includes(kw));
      })
    );
  };

  const handleSave = () => {
    const filteredPraise = praiseSongs.map((s) => s.trim()).filter(Boolean);
    const filteredWorship = worshipSongs.map((s) => s.trim()).filter(Boolean);

    const validAssignments = ministryRows
      .filter((r) => r.role.trim() !== '')
      .map((r) => {
        const rawMembers = getAssignmentMembers(r);
        const validMembers = rawMembers.filter((m) => m.memberId || m.memberName);
        const joinedNames = validMembers.map(m => m.memberName).filter(Boolean).join(', ');

        return {
          id: r.id,
          role: r.role.trim(),
          assignedMembers: validMembers,
          memberId: validMembers[0]?.memberId || '',
          memberName: joinedNames,
          notes: r.notes || ''
        };
      });

    const praiseSongIds = filteredPraise.map((s) => {
      const found = allSongs.find((x) => x.title.trim().toLowerCase() === s.trim().toLowerCase() || x.id === s.trim());
      return found ? found.id : '';
    });

    const worshipSongIds = filteredWorship.map((s) => {
      const found = allSongs.find((x) => x.title.trim().toLowerCase() === s.trim().toLowerCase() || x.id === s.trim());
      return found ? found.id : '';
    });

    const scheduleData: Omit<Schedule, 'id' | 'updatedAt'> = {
      serviceType,
      serviceDate,
      praiseSongs: filteredPraise,
      worshipSongs: filteredWorship,
      praiseSongKeys: praiseSongs.map((s, i) => praiseSongKeys[i] || '').filter((_, i) => Boolean(praiseSongs[i]?.trim())),
      worshipSongKeys: worshipSongs.map((s, i) => worshipSongKeys[i] || '').filter((_, i) => Boolean(worshipSongs[i]?.trim())),
      praiseSongIds,
      worshipSongIds,
      ministryAssignments: validAssignments
    };

    // Check if a saved schedule already exists for this exact serviceType + serviceDate
    const conflictingSchedule = schedules.find((s) => {
      if (editingSchedule?.id && s.id === editingSchedule.id) return false;
      if (isScheduleEmpty(s)) return false;
      return s.serviceType === serviceType && s.serviceDate === serviceDate;
    });

    if (conflictingSchedule) {
      setDuplicateConflictSchedule(conflictingSchedule);
      setIsDuplicateModalOpen(true);
      return;
    }

    // Check monthly usage for selected songs
    const allSelectedSongs = Array.from(new Set([...filteredPraise, ...filteredWorship]));
    let songsToCheck = allSelectedSongs;
    const excludeScheduleId = editingSchedule?.id;

    if (editingSchedule && editingSchedule.id) {
      // When editing an existing line-up:
      // Exclude songs that were already part of the original line-up and remain unchanged.
      // Only perform duplicate checks on newly added or replaced songs.
      const originalSongsSet = new Set(
        [
          ...(editingSchedule.praiseSongs || []),
          ...(editingSchedule.worshipSongs || [])
        ]
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      );

      songsToCheck = allSelectedSongs.filter(
        (songTitle) => !originalSongsSet.has(songTitle.trim().toLowerCase())
      );
    }

    const warnings: MonthlyUsageCheckResult[] = [];

    songsToCheck.forEach((songTitle) => {
      const check = SongService.checkMonthlyUsage(
        songTitle,
        serviceDate,
        schedules,
        excludeScheduleId,
        serviceType,
        allSongs
      );
      if (check.timesUsedThisMonth > 0) {
        warnings.push(check);
      }
    });

    if (warnings.length > 0) {
      setMonthlyWarnings(warnings);
      setPendingSaveData({ data: scheduleData, id: editingSchedule?.id });
      setIsMonthlyModalOpen(true);
      return;
    }

    executeFinalSave(scheduleData, editingSchedule?.id);
  };

  const executeFinalSave = (
    data: Omit<Schedule, 'id' | 'updatedAt'>,
    id?: string
  ) => {
    // Reset undo/redo history so this saved lineup starts clean
    LineupHistoryService.clearHistory(currentContextKey);
    setCanUndo(false);
    setCanRedo(false);

    onSaveSchedule(data, id);
    StorageService.saveDraftSchedule(null);
    setIsMonthlyModalOpen(false);
    setMonthlyWarnings([]);
    setPendingSaveData(null);
    window.dispatchEvent(
      new CustomEvent('lineup-saved-success', {
        detail: { data, id }
      })
    );
    window.dispatchEvent(
      new CustomEvent('lineup-save-success', {
        detail: { data, id }
      })
    );
  };

  // Keyboard shortcut listeners for Save, Undo, and Redo dispatched by centralized useKeyboardShortcuts
  useEffect(() => {
    const handleTriggerSave = () => {
      handleSave();
    };
    const handleTriggerUndo = () => {
      handleUndo();
    };
    const handleTriggerRedo = () => {
      handleRedo();
    };

    window.addEventListener('wwcf:trigger-save-lineup', handleTriggerSave);
    window.addEventListener('wwcf:trigger-undo-lineup', handleTriggerUndo);
    window.addEventListener('wwcf:trigger-redo-lineup', handleTriggerRedo);

    return () => {
      window.removeEventListener('wwcf:trigger-save-lineup', handleTriggerSave);
      window.removeEventListener('wwcf:trigger-undo-lineup', handleTriggerUndo);
      window.removeEventListener('wwcf:trigger-redo-lineup', handleTriggerRedo);
    };
  }, [handleSave, handleUndo, handleRedo]);

  const getTempSchedule = (): Schedule => {
    const cleanP = praiseSongs.filter(Boolean);
    const cleanW = worshipSongs.filter(Boolean);
    return {
      id: editingSchedule?.id || 'temp',
      serviceType,
      serviceDate,
      praiseSongs: cleanP,
      worshipSongs: cleanW,
      praiseSongKeys: praiseSongKeys.filter((_, i) => Boolean(praiseSongs[i]?.trim())),
      worshipSongKeys: worshipSongKeys.filter((_, i) => Boolean(worshipSongs[i]?.trim())),
      praiseSongIds: cleanP.map((s) => allSongs.find((x) => x.title.trim().toLowerCase() === s.trim().toLowerCase() || x.id === s.trim())?.id || ''),
      worshipSongIds: cleanW.map((s) => allSongs.find((x) => x.title.trim().toLowerCase() === s.trim().toLowerCase() || x.id === s.trim())?.id || ''),
      ministryAssignments: ministryRows
        .filter((r) => r.role.trim() !== '')
        .map((r) => {
          const rawMembers = getAssignmentMembers(r);
          const validMembers = rawMembers.filter((m) => m.memberId || m.memberName);
          const joinedNames = validMembers.map(m => m.memberName).filter(Boolean).join(', ');

          return {
            id: r.id,
            role: r.role.trim(),
            assignedMembers: validMembers,
            memberId: validMembers[0]?.memberId || '',
            memberName: joinedNames,
            notes: r.notes || ''
          };
        }),
      updatedAt: getManilaNowISO()
    };
  };

  const handleExportPDF = () => {
    const temp = getTempSchedule();
    if (isScheduleEmpty(temp)) {
      showToast('This lineup does not contain any songs. Please add at least one song before using or exporting this lineup.', 'danger');
      return;
    }
    onExportPDF(temp);
    window.dispatchEvent(
      new CustomEvent('lineup-exported-success', {
        detail: { type: 'pdf' }
      })
    );
  };

  const handleExportPNG = () => {
    const temp = getTempSchedule();
    if (isScheduleEmpty(temp)) {
      showToast('This lineup does not contain any songs. Please add at least one song before using or exporting this lineup.', 'danger');
      return;
    }
    onExportPNG(temp);
    window.dispatchEvent(
      new CustomEvent('lineup-exported-success', {
        detail: { type: 'png' }
      })
    );
  };

  return (
    <div data-tour="scheduler-view" className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300">
      {/* Title Header */}
      <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[#1b75bc] dark:text-[#54b0e2] font-bold text-xs uppercase tracking-wider mb-1">
            <Church className="w-4 h-4" />
            <span>Word for the World Christian Fellowship • Santa Cruz</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            {editingSchedule ? 'Edit Worship Lineup' : 'Song Line-up Scheduler'}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {/* Header Undo / Redo Controls */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-white/10 shadow-2xs">
            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo}
              title={canUndo ? "Undo last edit (Ctrl+Z)" : "Nothing to undo"}
              aria-label="Undo last edit (Ctrl+Z)"
              className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                canUndo
                  ? 'text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 cursor-pointer shadow-2xs'
                  : 'text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-50'
              }`}
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={!canRedo}
              title={canRedo ? "Redo last edit (Ctrl+Y / Ctrl+Shift+Z)" : "Nothing to redo"}
              aria-label="Redo last edit (Ctrl+Y / Ctrl+Shift+Z)"
              className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                canRedo
                  ? 'text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 cursor-pointer shadow-2xs'
                  : 'text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-50'
              }`}
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {editingSchedule && (
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Editing: {editingSchedule.serviceDate}
            </span>
          )}
        </div>
      </div>

      {/* Existing Schedule Notice Banner */}
      {(() => {
        const existingMatchingSched = schedules.find(
          (s) =>
            s.serviceType === serviceType &&
            s.serviceDate === serviceDate &&
            s.id !== editingSchedule?.id &&
            !isScheduleEmpty(s) &&
            !s.id.startsWith('placeholder_')
        );
        if (!existingMatchingSched) return null;
        return (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                A saved lineup already exists for <strong>{existingMatchingSched.serviceType}</strong> on <strong>{existingMatchingSched.serviceDate}</strong>. Your active draft remains intact.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                loadScheduleDataIntoEditor(existingMatchingSched);
                showToast(`Loaded existing lineup for ${existingMatchingSched.serviceDate}`, 'info');
              }}
              className="px-3 py-1 font-semibold text-amber-900 dark:text-amber-100 bg-amber-200/80 dark:bg-amber-900/60 hover:bg-amber-300 dark:hover:bg-amber-800 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              Load Existing Lineup
            </button>
          </div>
        );
      })()}

      {/* 1. Service Details Section */}
      <div className="p-6 rounded-2xl wwcf-surface-hero border border-slate-200/80 dark:border-white/10 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/60 dark:border-white/10">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Church className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
            <span>Service Details & Context</span>
          </h3>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2] border border-[#1b75bc]/20">
            {serviceType} • {serviceDate ? formatDateDisplayManila(serviceDate, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date set'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Service Type <span className="text-rose-500">*</span>
            </label>
            <div data-tour="service-type-select">
              <CustomSelect<ServiceType>
                value={serviceType}
                onChange={(val) => handleServiceTypeChange(val)}
                options={[
                  { value: 'Sunday Service', label: 'Sunday Service' },
                  { value: 'Midweek Prayer Service', label: 'Midweek Prayer Service' },
                  { value: 'Youth Service', label: 'Youth Service' },
                  { value: 'Special Worship Event', label: 'Special Worship Event' }
                ]}
                aria-label="Service Type"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Service Date <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              data-tour="service-date-picker"
              value={serviceDate}
              onChange={(e) => handleServiceDateChange(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-black/40 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#1b75bc]/40 focus:border-[#1b75bc] outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* Smart Song Recommendations Panel */}
      <SongRecommendationsPanel
        allSongs={allSongs}
        schedules={schedules}
        currentPraiseSongs={praiseSongs}
        currentWorshipSongs={worshipSongs}
        serviceDate={serviceDate}
        serviceType={serviceType}
        onAddSong={handleAddRecommendedSong}
        onOpenNewSongModal={() => setIsSongFormOpen(true)}
      />

      {/* 2. Song List Section */}
      <div data-tour="add-songs-section" className="p-6 rounded-2xl wwcf-glass-card shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200/60 dark:border-white/5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Music className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
            <span>Worship & Praise Songs</span>
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-tour="blank-lineup-btn"
              onClick={handleCreateBlankLineup}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Blank Line-up</span>
            </button>

            <button
              type="button"
              data-tour="import-playlist-btn"
              onClick={() =>
                setSmartImportConfig({
                  isOpen: true,
                  initialCategory: 'praise'
                })
              }
              className="px-3.5 py-1.5 bg-gradient-to-r from-red-600 to-indigo-600 hover:from-red-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Youtube className="w-4 h-4 text-white" />
              <span>Import Song / Playlist</span>
            </button>
          </div>
        </div>

        <div data-tour="rearrangeable-song-list" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Praise Songs (Fast) */}
          <div
            onDragOver={(e) => handleSectionDragOver(e, 'praise')}
            onDragLeave={(e) => handleSectionDragLeave(e, 'praise')}
            onDrop={(e) => handleSectionDrop(e, 'praise')}
            className={`p-5 rounded-xl border transition-all duration-150 space-y-4 ${
              dragOverSection === 'praise'
                ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-500/60 dark:border-amber-500/40 ring-2 ring-amber-500/20 shadow-sm'
                : draggedItem && draggedItem.category !== 'praise'
                ? 'border-dashed border-amber-400/50 dark:border-amber-500/30 bg-slate-50/50 dark:bg-slate-950/40'
                : 'bg-slate-50/50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-500 fill-amber-500/20" />
                <span>Praise Songs (Fast)</span>
              </h4>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setSmartImportConfig({
                      isOpen: true,
                      initialCategory: 'praise',
                      targetLineupSlot: {
                        category: 'praise',
                        index: praiseSongs.length
                      }
                    });
                  }}
                  className="text-red-600 dark:text-red-400 text-xs font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  title="Import praise song or playlist from YouTube URL"
                >
                  <Youtube className="w-3.5 h-3.5" />
                  <span>Import</span>
                </button>
                <button
                  type="button"
                  onClick={addPraiseSong}
                  className="text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Song</span>
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {praiseSongs.length === 0 && (
                <div
                  onDragOver={(e) => handleSectionDragOver(e, 'praise')}
                  onDrop={(e) => handleSectionDrop(e, 'praise')}
                  className="py-6 px-4 rounded-xl border border-dashed border-amber-300/80 dark:border-amber-700/50 text-center flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400 bg-amber-50/20 dark:bg-amber-950/20"
                >
                  <p className="text-xs font-medium">No praise songs currently added.</p>
                  <button
                    type="button"
                    onClick={addPraiseSong}
                    className="btn-tactile inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 hover:bg-amber-200 dark:hover:bg-amber-800/80 rounded-lg transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Praise Song</span>
                  </button>
                </div>
              )}
              {praiseSongs.map((song, idx) => {
                const isDropTargetBefore =
                  dropTarget?.category === 'praise' &&
                  dropTarget.index === idx &&
                  dropTarget.position === 'before';
                const isDropTargetAfter =
                  dropTarget?.category === 'praise' &&
                  dropTarget.index === idx &&
                  dropTarget.position === 'after';
                const isBeingDragged =
                  draggedItem?.category === 'praise' && draggedItem.index === idx;

                return (
                  <React.Fragment key={`praise-${idx}`}>
                    {/* Insertion line indicator above item */}
                    {isDropTargetBefore && (
                      <div className="flex items-center gap-2 py-0.5 -my-1 pointer-events-none">
                        <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        <div className="h-0.5 w-full bg-amber-500 dark:bg-amber-400 rounded-full" />
                      </div>
                    )}

                    <div
                      draggable={activeDragHandle?.category === 'praise' && activeDragHandle?.index === idx}
                      onDragStart={(e) => handleDragStart(e, 'praise', idx)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleItemDragOver(e, 'praise', idx)}
                      onDrop={(e) => handleItemDrop(e, 'praise', idx)}
                      onPointerDown={(e) => {
                        if ((e.target as HTMLElement).closest('input, select, textarea, button, [role="button"]')) {
                          setActiveDragHandle(null);
                        }
                      }}
                      className={`group flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 sm:p-2 bg-white dark:bg-slate-900 rounded-xl border transition-all ${
                        isBeingDragged
                          ? 'opacity-40 border-dashed border-amber-400 dark:border-amber-500 scale-[0.99]'
                          : 'border-slate-200 dark:border-slate-800 shadow-2xs'
                      }`}
                    >
                      {/* Top Row on Mobile: Drag, Index, Autocomplete */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {/* Drag Handle */}
                        <div
                          onMouseDown={() => setActiveDragHandle({ category: 'praise', index: idx })}
                          onTouchStart={() => setActiveDragHandle({ category: 'praise', index: idx })}
                          className="cursor-grab active:cursor-grabbing text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 p-1.5 rounded transition-colors shrink-0 select-none"
                          title="Drag to reorder or move to Worship (Slow)"
                        >
                          <GripVertical className="w-4 h-4" />
                        </div>

                        <span className="text-xs font-bold text-slate-300 dark:text-slate-600 w-4 text-center shrink-0">
                          {String(idx + 1).padStart(2, '0')}
                        </span>

                        <div className="flex-1 min-w-[180px] sm:min-w-[240px]">
                          <SongAutocomplete
                            value={song}
                            onChange={(val) => handlePraiseChange(idx, val)}
                            category="praise"
                            serviceDate={serviceDate}
                            serviceType={serviceType}
                            allSongs={allSongs}
                            schedules={schedules}
                            currentLineupSongs={[...praiseSongs, ...worshipSongs]}
                            currentSongIndex={idx}
                            excludeScheduleId={editingSchedule?.id}
                            placeholder="Search or enter praise song..."
                            onOpenLibrary={() =>
                              setPickerConfig({ isOpen: true, category: 'praise', songIndex: idx })
                            }
                          />
                        </div>
                      </div>

                      {/* Bottom Row on Mobile / Inline on Desktop: Key, Category, Move, Remove */}
                      <div className="flex items-center justify-between sm:justify-start gap-2 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800/60 w-full sm:w-auto shrink-0 pl-6 sm:pl-0">
                        {/* Performed Key Field */}
                        <div className="w-20 shrink-0" title="Performed Key (defaults to Original Key)">
                          <input
                            type="text"
                            value={praiseSongKeys[idx] || ''}
                            onChange={(e) => handlePraiseKeyChange(idx, e.target.value)}
                            placeholder="Key"
                            className="w-full px-2 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50/70 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 text-center"
                          />
                        </div>

                        {/* Category Switcher */}
                        <select
                          value="praise"
                          onChange={(e) =>
                            changeSongCategory('praise', idx, e.target.value as 'praise' | 'worship')
                          }
                          className="text-[11px] font-semibold py-1.5 px-2 rounded-lg border border-amber-200 dark:border-amber-900/80 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 outline-none cursor-pointer shrink-0"
                          title="Change Category"
                        >
                          <option value="praise">Praise</option>
                          <option value="worship">Worship</option>
                        </select>

                        {/* Move Up/Down Controls */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => moveSongUp('praise', idx)}
                            className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-50 dark:bg-slate-800/50 sm:bg-transparent rounded transition-colors cursor-pointer"
                            title="Move Up"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSongDown('praise', idx)}
                            className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-50 dark:bg-slate-800/50 sm:bg-transparent rounded transition-colors cursor-pointer"
                            title="Move Down"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removePraiseSong(idx)}
                          className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 rounded transition-colors cursor-pointer shrink-0 ml-auto sm:ml-0"
                          aria-label="Remove song"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Insertion line indicator below item */}
                    {isDropTargetAfter && (
                      <div className="flex items-center gap-2 py-0.5 -my-1 pointer-events-none">
                        <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        <div className="h-0.5 w-full bg-amber-500 dark:bg-amber-400 rounded-full" />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Drop Target Zone at Bottom of Praise Section */}
              {draggedItem && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverSection('praise');
                    setDropTarget({
                      category: 'praise',
                      index: praiseSongs.length - 1,
                      position: 'after'
                    });
                  }}
                  onDrop={(e) => handleSectionDrop(e, 'praise')}
                  className={`py-2.5 px-3 rounded-lg border-2 border-dashed text-center text-xs transition-all ${
                    dropTarget?.category === 'praise' &&
                    dropTarget.position === 'after' &&
                    dropTarget.index === praiseSongs.length - 1
                      ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold'
                      : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-amber-400'
                  }`}
                >
                  <span>Drop here to add as last Praise song</span>
                </div>
              )}
            </div>
          </div>

          {/* Worship Songs (Slow) */}
          <div
            onDragOver={(e) => handleSectionDragOver(e, 'worship')}
            onDragLeave={(e) => handleSectionDragLeave(e, 'worship')}
            onDrop={(e) => handleSectionDrop(e, 'worship')}
            className={`p-5 rounded-xl border transition-all duration-150 space-y-4 ${
              dragOverSection === 'worship'
                ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-500/60 dark:border-indigo-500/40 ring-2 ring-indigo-500/20 shadow-sm'
                : draggedItem && draggedItem.category !== 'worship'
                ? 'border-dashed border-indigo-400/50 dark:border-indigo-500/30 bg-slate-50/50 dark:bg-slate-950/40'
                : 'bg-slate-50/50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Heart className="w-4 h-4 text-indigo-500 fill-indigo-500/20" />
                <span>Worship Songs (Slow)</span>
              </h4>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setSmartImportConfig({
                      isOpen: true,
                      initialCategory: 'worship',
                      targetLineupSlot: {
                        category: 'worship',
                        index: worshipSongs.length
                      }
                    });
                  }}
                  className="text-red-600 dark:text-red-400 text-xs font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  title="Import worship song or playlist from YouTube URL"
                >
                  <Youtube className="w-3.5 h-3.5" />
                  <span>Import</span>
                </button>
                <button
                  type="button"
                  onClick={addWorshipSong}
                  className="text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Song</span>
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {worshipSongs.length === 0 && (
                <div
                  onDragOver={(e) => handleSectionDragOver(e, 'worship')}
                  onDrop={(e) => handleSectionDrop(e, 'worship')}
                  className="py-6 px-4 rounded-xl border border-dashed border-indigo-300/80 dark:border-indigo-700/50 text-center flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400 bg-indigo-50/20 dark:bg-indigo-950/20"
                >
                  <p className="text-xs font-medium">No worship songs currently added.</p>
                  <button
                    type="button"
                    onClick={addWorshipSong}
                    className="btn-tactile inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/60 hover:bg-indigo-200 dark:hover:bg-indigo-800/80 rounded-lg transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Worship Song</span>
                  </button>
                </div>
              )}
              {worshipSongs.map((song, idx) => {
                const isDropTargetBefore =
                  dropTarget?.category === 'worship' &&
                  dropTarget.index === idx &&
                  dropTarget.position === 'before';
                const isDropTargetAfter =
                  dropTarget?.category === 'worship' &&
                  dropTarget.index === idx &&
                  dropTarget.position === 'after';
                const isBeingDragged =
                  draggedItem?.category === 'worship' && draggedItem.index === idx;

                return (
                  <React.Fragment key={`worship-${idx}`}>
                    {/* Insertion line indicator above item */}
                    {isDropTargetBefore && (
                      <div className="flex items-center gap-2 py-0.5 -my-1 pointer-events-none">
                        <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                        <div className="h-0.5 w-full bg-indigo-500 dark:bg-indigo-400 rounded-full" />
                      </div>
                    )}

                    <div
                      draggable={activeDragHandle?.category === 'worship' && activeDragHandle?.index === idx}
                      onDragStart={(e) => handleDragStart(e, 'worship', idx)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleItemDragOver(e, 'worship', idx)}
                      onDrop={(e) => handleItemDrop(e, 'worship', idx)}
                      onPointerDown={(e) => {
                        if ((e.target as HTMLElement).closest('input, select, textarea, button, [role="button"]')) {
                          setActiveDragHandle(null);
                        }
                      }}
                      className={`group flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 sm:p-2 bg-white dark:bg-slate-900 rounded-xl border transition-all ${
                        isBeingDragged
                          ? 'opacity-40 border-dashed border-indigo-400 dark:border-indigo-500 scale-[0.99]'
                          : 'border-slate-200 dark:border-slate-800 shadow-2xs'
                      }`}
                    >
                      {/* Top Row on Mobile: Drag, Index, Autocomplete */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {/* Drag Handle */}
                        <div
                          onMouseDown={() => setActiveDragHandle({ category: 'worship', index: idx })}
                          onTouchStart={() => setActiveDragHandle({ category: 'worship', index: idx })}
                          className="cursor-grab active:cursor-grabbing text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 p-1.5 rounded transition-colors shrink-0 select-none"
                          title="Drag to reorder or move to Praise (Fast)"
                        >
                          <GripVertical className="w-4 h-4" />
                        </div>

                        <span className="text-xs font-bold text-slate-300 dark:text-slate-600 w-4 text-center shrink-0">
                          {String(idx + 1).padStart(2, '0')}
                        </span>

                        <div className="flex-1 min-w-[180px] sm:min-w-[240px]">
                          <SongAutocomplete
                            value={song}
                            onChange={(val) => handleWorshipChange(idx, val)}
                            category="worship"
                            serviceDate={serviceDate}
                            serviceType={serviceType}
                            allSongs={allSongs}
                            schedules={schedules}
                            currentLineupSongs={[...praiseSongs, ...worshipSongs]}
                            currentSongIndex={praiseSongs.length + idx}
                            excludeScheduleId={editingSchedule?.id}
                            placeholder="Search or enter worship song..."
                            onOpenLibrary={() =>
                              setPickerConfig({ isOpen: true, category: 'worship', songIndex: idx })
                            }
                          />
                        </div>
                      </div>

                      {/* Bottom Row on Mobile / Inline on Desktop: Key, Category, Move, Remove */}
                      <div className="flex items-center justify-between sm:justify-start gap-2 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800/60 w-full sm:w-auto shrink-0 pl-6 sm:pl-0">
                        {/* Performed Key Field */}
                        <div className="w-20 shrink-0" title="Performed Key (defaults to Original Key)">
                          <input
                            type="text"
                            value={worshipSongKeys[idx] || ''}
                            onChange={(e) => handleWorshipKeyChange(idx, e.target.value)}
                            placeholder="Key"
                            className="w-full px-2 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50/70 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 text-center"
                          />
                        </div>

                        {/* Category Switcher */}
                        <select
                          value="worship"
                          onChange={(e) =>
                            changeSongCategory('worship', idx, e.target.value as 'praise' | 'worship')
                          }
                          className="text-[11px] font-semibold py-1.5 px-2 rounded-lg border border-indigo-200 dark:border-indigo-900/80 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 outline-none cursor-pointer shrink-0"
                          title="Change Category"
                        >
                          <option value="praise">Praise</option>
                          <option value="worship">Worship</option>
                        </select>

                        {/* Move Up/Down Controls */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => moveSongUp('worship', idx)}
                            className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-50 dark:bg-slate-800/50 sm:bg-transparent rounded transition-colors cursor-pointer"
                            title="Move Up"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSongDown('worship', idx)}
                            className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-50 dark:bg-slate-800/50 sm:bg-transparent rounded transition-colors cursor-pointer"
                            title="Move Down"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeWorshipSong(idx)}
                          className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 rounded transition-colors cursor-pointer shrink-0 ml-auto sm:ml-0"
                          aria-label="Remove song"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Insertion line indicator below item */}
                    {isDropTargetAfter && (
                      <div className="flex items-center gap-2 py-0.5 -my-1 pointer-events-none">
                        <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                        <div className="h-0.5 w-full bg-indigo-500 dark:bg-indigo-400 rounded-full" />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Drop Target Zone at Bottom of Worship Section */}
              {draggedItem && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverSection('worship');
                    setDropTarget({
                      category: 'worship',
                      index: worshipSongs.length - 1,
                      position: 'after'
                    });
                  }}
                  onDrop={(e) => handleSectionDrop(e, 'worship')}
                  className={`py-2.5 px-3 rounded-lg border-2 border-dashed text-center text-xs transition-all ${
                    dropTarget?.category === 'worship' &&
                    dropTarget.position === 'after' &&
                    dropTarget.index === worshipSongs.length - 1
                      ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold'
                      : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-400'
                  }`}
                >
                  <span>Drop here to add as last Worship song</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Ministry Assignment Section */}
      <div data-tour="team-assignments-panel" className="p-6 rounded-2xl wwcf-glass-card shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/60 dark:border-white/5">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
              <span>Ministry Assignments</span>
            </h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium">
              Assign members to worship team roles. System automatically manages Praise & Worship sections.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isSmartFilter}
                onChange={(e) => setIsSmartFilter(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <Filter className="w-3.5 h-3.5 text-indigo-500" />
              <span>Smart filter members</span>
            </label>
          </div>
        </div>

        <div className="space-y-4">
          {ministryRows.map((row) => {
            const availableMembersForRole = getFilteredMembers(row.role);
            const currentAssigned = getAssignmentMembers(row);

            const isLeaderRow = (row.role || '').toLowerCase().includes('leader');
            const isTwoLeadersActive =
              ministryRows.some((r) => (r.role || '').toLowerCase().includes('praise') && !(r.role || '').toLowerCase().includes('worship') && (r.role || '').toLowerCase().includes('leader')) &&
              ministryRows.some((r) => (r.role || '').toLowerCase().includes('worship') && !(r.role || '').toLowerCase().includes('praise') && (r.role || '').toLowerCase().includes('leader'));

            const hideAddMemberButton = isLeaderRow && (isTwoLeadersActive || currentAssigned.length >= 2);

            return (
              <div
                key={row.id}
                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 space-y-3 transition-all hover:border-slate-300 dark:hover:border-slate-600"
              >
                {/* Top Row: Role Name, Delete */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={row.role}
                      onChange={(e) => handleMinistryRoleChange(row.id, e.target.value)}
                      placeholder="Ministry Role (e.g. Song Leader (Praise), Backup Singer/s)"
                      className="w-full px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                    />
                  </div>

                  {/* Delete Ministry Row */}
                  <button
                    type="button"
                    onClick={() => removeMinistryRow(row.id)}
                    className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 rounded-lg transition-colors cursor-pointer shrink-0"
                    title="Delete Ministry Role"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Members List Section */}
                <div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                    <span>Assigned Member(s) ({currentAssigned.length})</span>
                    {!hideAddMemberButton && (
                      <button
                        type="button"
                        onClick={() => handleAddMemberToMinistry(row.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Member</span>
                      </button>
                    )}
                  </div>

                  {currentAssigned.length === 0 ? (
                    <div className="p-2 rounded-lg bg-white/60 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-700/80">
                      <span className="text-xs font-bold text-slate-400 dark:text-slate-500">N/A</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {currentAssigned.map((am, mIdx) => {
                        const targetRoleLower = (row.role || '').toLowerCase();
                        const isTargetPraiseLeader = targetRoleLower.includes('leader') && targetRoleLower.includes('praise') && !targetRoleLower.includes('worship');
                        const isTargetWorshipLeader = targetRoleLower.includes('leader') && targetRoleLower.includes('worship') && !targetRoleLower.includes('praise');
                        const isTargetGenericLeader = targetRoleLower.includes('leader') && !isTargetPraiseLeader && !isTargetWorshipLeader;

                        const isTargetBackup = isBackupRole(row.role);
                        const isTargetPraiseBackup = isTargetBackup && targetRoleLower.includes('praise') && !targetRoleLower.includes('worship');
                        const isTargetWorshipBackup = isTargetBackup && targetRoleLower.includes('worship') && !targetRoleLower.includes('praise');
                        const isTargetGenericBackup = isTargetBackup && !isTargetPraiseBackup && !isTargetWorshipBackup;

                        const isTargetMusician = isMusicianRole(row.role);

                        let praiseLeaderId = '';
                        let worshipLeaderId = '';
                        let genericLeaderId = '';

                        ministryRows.forEach((r) => {
                          const rLower = (r.role || '').toLowerCase();
                          const membersList = getAssignmentMembers(r);
                          const firstId = membersList[0]?.memberId;
                          if (!firstId) return;

                          if (rLower.includes('leader') && rLower.includes('praise') && !rLower.includes('worship')) {
                            praiseLeaderId = firstId;
                          } else if (rLower.includes('leader') && rLower.includes('worship') && !rLower.includes('praise')) {
                            worshipLeaderId = firstId;
                          } else if (rLower.includes('leader')) {
                            genericLeaderId = firstId;
                          }
                        });

                        const assignedElsewhereIds = new Set<string>();
                        const allAssignedElsewhereIds = new Set<string>();

                        ministryRows.forEach((r) => {
                          const rLower = (r.role || '').toLowerCase();
                          const rIsMusician = isMusicianRole(r.role);

                          const isRPraiseLeader = rLower.includes('leader') && rLower.includes('praise') && !rLower.includes('worship');
                          const isRWorshipLeader = rLower.includes('leader') && rLower.includes('worship') && !rLower.includes('praise');
                          const isRGenericLeader = rLower.includes('leader') && !isRPraiseLeader && !isRWorshipLeader;

                          const isRBackup = isBackupRole(r.role);
                          const isRPraiseBackup = isRBackup && rLower.includes('praise') && !rLower.includes('worship');
                          const isRWorshipBackup = isRBackup && rLower.includes('worship') && !rLower.includes('praise');
                          const isRGenericBackup = isRBackup && !isRPraiseBackup && !isRWorshipBackup;

                          const rMembers = getAssignmentMembers(r);
                          rMembers.forEach((m, idx) => {
                            if (!m.memberId) return;

                            // Skip exact same slot currently being edited
                            if (r.id === row.id && idx === mIdx) return;

                            // Same row, different slot -> cannot assign same member twice in same row
                            if (r.id === row.id && idx !== mIdx) {
                              assignedElsewhereIds.add(m.memberId);
                              return;
                            }

                            // Track members assigned in other rows
                            allAssignedElsewhereIds.add(m.memberId);

                            // 1. MUSICIAN ASSIGNMENT EXCLUSIVITY (NEW RULE 2):
                            // Member assigned to a musician role CANNOT be assigned to any other ministry.
                            if (rIsMusician) {
                              assignedElsewhereIds.add(m.memberId);
                              return;
                            }

                            // 2. SONG LEADER / BACKUP RESTRICTIONS:
                            if (isTargetPraiseLeader) {
                              if (m.memberId === worshipLeaderId || isRWorshipLeader || isRPraiseBackup) {
                                assignedElsewhereIds.add(m.memberId);
                              }
                              return;
                            }

                            if (isTargetWorshipLeader) {
                              if (m.memberId === praiseLeaderId || isRPraiseLeader || isRWorshipBackup) {
                                assignedElsewhereIds.add(m.memberId);
                              }
                              return;
                            }

                            if (isTargetGenericLeader) {
                              if (isRGenericBackup || isRPraiseBackup || isRWorshipBackup) {
                                assignedElsewhereIds.add(m.memberId);
                              }
                              return;
                            }

                            if (isTargetPraiseBackup) {
                              if (m.memberId === praiseLeaderId || isRPraiseLeader) {
                                assignedElsewhereIds.add(m.memberId);
                              }
                              return;
                            }

                            if (isTargetWorshipBackup) {
                              if (m.memberId === worshipLeaderId || isRWorshipLeader) {
                                assignedElsewhereIds.add(m.memberId);
                              }
                              return;
                            }

                            if (isTargetGenericBackup) {
                              if (m.memberId === genericLeaderId || m.memberId === praiseLeaderId || m.memberId === worshipLeaderId || isRGenericLeader || isRPraiseLeader || isRWorshipLeader) {
                                assignedElsewhereIds.add(m.memberId);
                              }
                              return;
                            }
                          });
                        });

                        // 3. TARGET IS MUSICIAN ROLE:
                        // If target row is a musician role, ANY member assigned anywhere else in the lineup cannot be assigned to this musician role.
                        if (isTargetMusician) {
                          allAssignedElsewhereIds.forEach((id) => assignedElsewhereIds.add(id));
                        }

                        let selectableMembers = availableMembersForRole.filter(
                          (m) => !assignedElsewhereIds.has(m.id)
                        );

                        if (am.memberId) {
                          const currentMemberObj = members.find((m) => m.id === am.memberId);
                          if (currentMemberObj && !assignedElsewhereIds.has(am.memberId) && !selectableMembers.some((m) => m.id === am.memberId)) {
                            selectableMembers = [currentMemberObj, ...selectableMembers];
                          }
                        }

                        const assignedMemberObj = am.memberId ? members.find((m) => m.id === am.memberId) : null;
                        const isAssignedMemberDA = assignedMemberObj ? isMemberUnderDisciplinary(assignedMemberObj, serviceDate) : false;

                        return (
                          <div key={mIdx} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <CustomSelect
                                  value={am.memberId}
                                  onChange={(val) => handleUpdateMinistryMember(row.id, mIdx, val)}
                                  size="sm"
                                  placeholder="-- Select Member --"
                                  aria-label={`Assign member to ${row.role || 'Ministry Role'}`}
                                  options={[
                                    { value: '', label: '-- Select Member --' },
                                    ...selectableMembers.map((m) => {
                                      const isDA = isMemberUnderDisciplinary(m, serviceDate);
                                      const endDate = m.disciplinaryAction?.endDate;
                                      const daBadge = isDA ? (endDate ? `DA — Ends ${endDate}` : 'DA Active') : undefined;
                                      const accessibleLabel = isDA
                                        ? `${m.name}. Disciplinary Action. ${endDate ? `Ends ${formatDateDisplayManila(endDate)}` : 'Active'}.`
                                        : m.name;

                                      return {
                                        value: m.id,
                                        label: m.name,
                                        isWarning: isDA,
                                        warningBadge: daBadge,
                                        accessibleLabel,
                                        description: isDA
                                          ? `⚠ ${daBadge} • ${sortTags(m.labels).join(', ')}`
                                          : sortTags(m.labels).join(', ')
                                      };
                                    })
                                  ]}
                                />
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveMemberFromMinistry(row.id, mIdx)}
                                className="p-1.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 rounded-lg transition-colors cursor-pointer shrink-0"
                                title="Remove Member"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Clear Warning Indicator for DA Member in Lineup */}
                            {isAssignedMemberDA && assignedMemberObj && (
                              <div
                                role="status"
                                aria-label={`${assignedMemberObj.name}. Disciplinary Action. ${assignedMemberObj.disciplinaryAction?.endDate ? `Ends ${formatDateDisplayManila(assignedMemberObj.disciplinaryAction.endDate)}` : 'Active'}.`}
                                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200 text-xs font-semibold animate-in fade-in"
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" aria-hidden="true" />
                                  <span className="truncate">
                                    <span className="font-bold">{assignedMemberObj.name}</span>
                                    <span className="mx-1 text-rose-400 dark:text-rose-600">•</span>
                                    <span className="font-normal text-rose-800 dark:text-rose-300">
                                      DA {assignedMemberObj.disciplinaryAction?.endDate ? `— Ends ${assignedMemberObj.disciplinaryAction.endDate}` : 'Active'}
                                    </span>
                                  </span>
                                </div>
                                <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-rose-200/70 dark:bg-rose-900/70 text-rose-800 dark:text-rose-200 font-bold uppercase tracking-wider">
                                  Exceptional
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Bottom Row: Assignment Note Input */}
                <div className="flex items-center gap-2 pt-1.5 border-t border-slate-200/50 dark:border-slate-800/50">
                  <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={row.notes || ''}
                    onChange={(e) => handleMinistryNotesChange(row.id, e.target.value)}
                    placeholder="Assignment note (e.g., Key of G, Capo 2, Mic 3, IEM Mix 1)"
                    className="w-full px-2 py-0.5 text-[11px] bg-transparent border-none text-slate-600 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={addMinistryRow}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Custom Ministry Role</span>
          </button>
        </div>
      </div>

      {/* Form Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl wwcf-glass-card shadow-lg border border-slate-200/80 dark:border-white/10 sticky bottom-4 z-20 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-tour="save-lineup-btn"
            onClick={handleSave}
            className="btn-tactile inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-[#1b75bc] hover:bg-[#165d97] active:bg-[#144d7c] rounded-xl shadow-md shadow-[#1b75bc]/25 transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc]"
          >
            <Save className="w-4 h-4" />
            <span>Save Schedule</span>
          </button>

          {/* Export Action Buttons - Targeted by Interactive Guide Step 8 */}
          <div
            data-tour="export-buttons-pair"
            className="inline-flex flex-wrap items-center gap-3"
          >
            <button
              type="button"
              data-tour="export-pdf-btn"
              data-guide="export-pdf"
              onClick={handleExportPDF}
              className="btn-tactile inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-[#1b75bc] dark:text-[#54b0e2] bg-[#1b75bc]/10 dark:bg-[#1b75bc]/15 hover:bg-[#1b75bc]/20 border border-[#1b75bc]/25 rounded-xl transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc]"
            >
              <FileDown className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
              <span>Export PDF</span>
            </button>

            <button
              type="button"
              data-tour="export-png-btn"
              data-guide="export-png"
              onClick={handleExportPNG}
              className="btn-tactile inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200/80 dark:border-white/10 rounded-xl transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc]"
            >
              <Image className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <span>Export PNG</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onResetForm}
          className="btn-tactile inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50/80 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset Form</span>
        </button>
      </div>

      {/* Monthly Usage Warning Modal */}
      <MonthlyUsageModal
        isOpen={isMonthlyModalOpen}
        warnings={monthlyWarnings}
        monthYearName={
          serviceDate
            ? formatDateDisplayManila(serviceDate, { month: 'long', year: 'numeric' })
            : 'current month'
        }
        onChooseAnother={() => {
          setIsMonthlyModalOpen(false);
          setMonthlyWarnings([]);
          setPendingSaveData(null);
        }}
        onUseAnyway={() => {
          if (pendingSaveData) {
            executeFinalSave(pendingSaveData.data, pendingSaveData.id);
          }
        }}
        onViewExistingLineup={(targetScheduleId) => {
          setIsMonthlyModalOpen(false);
          if (targetScheduleId) {
            const target = schedules.find((s) => s.id === targetScheduleId);
            if (target && onSelectSchedule) {
              onSelectSchedule(target);
              return;
            }
          }
          if (onViewSchedules) {
            onViewSchedules();
          }
        }}
      />

      {/* Song Picker Modal */}
      <SongPickerModal
        isOpen={pickerConfig.isOpen}
        category={pickerConfig.category}
        serviceDate={serviceDate}
        allSongs={allSongs}
        schedules={schedules}
        excludeScheduleId={editingSchedule?.id}
        onClose={() => setPickerConfig({ ...pickerConfig, isOpen: false })}
        onSelectSong={(selectedTitle) => {
          if (pickerConfig.category === 'praise') {
            handlePraiseChange(pickerConfig.songIndex, selectedTitle);
          } else {
            handleWorshipChange(pickerConfig.songIndex, selectedTitle);
          }
        }}
        onAddNewSong={() => {
          setIsSongFormOpen(true);
        }}
        onImportYouTubeSong={() => {
          setSmartImportConfig({
            isOpen: true,
            initialCategory: pickerConfig.category,
            targetLineupSlot: {
              category: pickerConfig.category,
              index: pickerConfig.songIndex
            }
          });
        }}
      />

      {/* Song Form Modal for adding new song to DB */}
      <SongFormModal
        isOpen={isSongFormOpen}
        onClose={() => setIsSongFormOpen(false)}
        onSave={() => {
          onRefreshSongs();
          setIsSongFormOpen(false);
        }}
        showToast={showToast}
      />

      {/* Lineup Conflict Modal for Replacing or Merging Playlist */}
      <LineupConflictModal
        isOpen={isConfirmReplaceOpen}
        serviceType={serviceType}
        serviceDate={serviceDate}
        onReplace={() => {
          if (pendingImportData) {
            executePlaylistReplace(pendingImportData.importedSongs, pendingImportData.summary);
            setPendingImportData(null);
          }
          setIsConfirmReplaceOpen(false);
        }}
        onMerge={() => {
          if (pendingImportData) {
            executePlaylistMerge(pendingImportData.importedSongs, pendingImportData.summary);
            setPendingImportData(null);
          }
          setIsConfirmReplaceOpen(false);
        }}
        onCancel={() => {
          setPendingImportData(null);
          setIsConfirmReplaceOpen(false);
        }}
      />

      {/* Duplicate Schedule Conflict Modal */}
      <DuplicateScheduleConflictModal
        isOpen={isDuplicateModalOpen}
        duplicateConflictSchedule={duplicateConflictSchedule}
        serviceType={serviceType}
        serviceDate={serviceDate}
        onClose={() => setIsDuplicateModalOpen(false)}
        onSelectSchedule={onSelectSchedule}
      />

      {/* Smart YouTube / YouTube Music Song or Playlist Import Modal */}
      <SmartSongImportModal
        isOpen={smartImportConfig.isOpen}
        isEditing={Boolean(editingSchedule)}
        initialCategory={smartImportConfig.initialCategory || 'praise'}
        targetLineupSlot={smartImportConfig.targetLineupSlot}
        onClose={() => setSmartImportConfig({ isOpen: false })}
        onSelectBlank={handleCreateBlankLineup}
        onPlaylistImportComplete={handlePlaylistImportComplete}
        showToast={showToast}
        onSongImportComplete={(savedSong) => {
          onRefreshSongs();

          const targetCategory =
            smartImportConfig.targetLineupSlot?.category ||
            (savedSong.category === 'worship' ? 'worship' : 'praise');
          const targetIdx = smartImportConfig.targetLineupSlot?.index;
          const songKey = savedSong.originalKey || savedSong.key || '';

          if (targetCategory === 'praise') {
            const updatedPraise = [...praiseSongs];
            const updatedKeys = [...praiseSongKeys];

            if (targetIdx !== undefined && targetIdx >= 0 && targetIdx < updatedPraise.length) {
              updatedPraise[targetIdx] = savedSong.title;
              updatedKeys[targetIdx] = songKey;
            } else {
              const emptyIdx = updatedPraise.findIndex((s) => !s.trim());
              if (emptyIdx >= 0) {
                updatedPraise[emptyIdx] = savedSong.title;
                updatedKeys[emptyIdx] = songKey;
              } else {
                updatedPraise.push(savedSong.title);
                updatedKeys.push(songKey);
              }
            }
            setPraiseSongs(updatedPraise);
            setPraiseSongKeys(updatedKeys);
          } else {
            const updatedWorship = [...worshipSongs];
            const updatedKeys = [...worshipSongKeys];

            if (targetIdx !== undefined && targetIdx >= 0 && targetIdx < updatedWorship.length) {
              updatedWorship[targetIdx] = savedSong.title;
              updatedKeys[targetIdx] = songKey;
            } else {
              const emptyIdx = updatedWorship.findIndex((s) => !s.trim());
              if (emptyIdx >= 0) {
                updatedWorship[emptyIdx] = savedSong.title;
                updatedKeys[emptyIdx] = songKey;
              } else {
                updatedWorship.push(savedSong.title);
                updatedKeys.push(songKey);
              }
            }
            setWorshipSongs(updatedWorship);
            setWorshipSongKeys(updatedKeys);
          }
        }}
        onSelectExistingForLineup={(existingSong, customKey) => {
          const targetCategory =
            smartImportConfig.targetLineupSlot?.category ||
            (existingSong.category === 'worship' ? 'worship' : 'praise');
          const targetIdx = smartImportConfig.targetLineupSlot?.index;
          const songKey = customKey || existingSong.originalKey || existingSong.key || '';

          if (targetCategory === 'praise') {
            const updatedPraise = [...praiseSongs];
            const updatedKeys = [...praiseSongKeys];

            if (targetIdx !== undefined && targetIdx >= 0 && targetIdx < updatedPraise.length) {
              updatedPraise[targetIdx] = existingSong.title;
              updatedKeys[targetIdx] = songKey;
            } else {
              const emptyIdx = updatedPraise.findIndex((s) => !s.trim());
              if (emptyIdx >= 0) {
                updatedPraise[emptyIdx] = existingSong.title;
                updatedKeys[emptyIdx] = songKey;
              } else {
                updatedPraise.push(existingSong.title);
                updatedKeys.push(songKey);
              }
            }
            setPraiseSongs(updatedPraise);
            setPraiseSongKeys(updatedKeys);
          } else {
            const updatedWorship = [...worshipSongs];
            const updatedKeys = [...worshipSongKeys];

            if (targetIdx !== undefined && targetIdx >= 0 && targetIdx < updatedWorship.length) {
              updatedWorship[targetIdx] = existingSong.title;
              updatedKeys[targetIdx] = songKey;
            } else {
              const emptyIdx = updatedWorship.findIndex((s) => !s.trim());
              if (emptyIdx >= 0) {
                updatedWorship[emptyIdx] = existingSong.title;
                updatedKeys[emptyIdx] = songKey;
              } else {
                updatedWorship.push(existingSong.title);
                updatedKeys.push(songKey);
              }
            }
            setWorshipSongs(updatedWorship);
            setWorshipSongKeys(updatedKeys);
          }
        }}
      />

      {/* DA Member Lineup Assignment Confirmation Dialog */}
      <Modal
        id="scheduler-da-modal"
        isOpen={Boolean(pendingDaAssignment)}
        title="DA Member Confirmation"
        isDanger={true}
        cancelLabel="Cancel"
        confirmLabel="Add Anyway"
        confirmButtonClassName="w-full sm:w-auto px-5 py-2.5 min-h-[44px] text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center"
        onConfirm={handleConfirmDaAssignment}
        onClose={handleCancelDaAssignment}
      >
        <div className="space-y-3.5">
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1 text-xs">
              <p className="font-bold text-sm text-amber-950 dark:text-amber-100">
                {pendingDaAssignment?.member.name} is marked as DA.
              </p>
              {pendingDaAssignment?.member.disciplinaryAction?.endDate && (
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  Disciplinary Period: Ends {formatDateDisplayManila(pendingDaAssignment.member.disciplinaryAction.endDate)}
                </p>
              )}
              {pendingDaAssignment?.member.disciplinaryAction?.reason && (
                <p className="italic text-amber-700/90 dark:text-amber-400/90">
                  Note: {pendingDaAssignment.member.disciplinaryAction.reason}
                </p>
              )}
            </div>
          </div>

          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed">
            {pendingDaAssignment?.member.name} is marked as DA, would you like to add them anyway?
          </p>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
            This will assign {pendingDaAssignment?.member.name} to this specific lineup as an exceptional assignment. Their DA status and disciplinary record will remain active and intact.
          </p>
        </div>
      </Modal>
    </div>
  );
};
