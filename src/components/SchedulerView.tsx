import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Member, Schedule, ServiceType, MinistryAssignment, AssignedMember, Song, RehearsalChecklist, LineupTemplate, getAssignmentMembers, isMemberUnderDisciplinary } from '../types';
import { SongService, MonthlyUsageCheckResult } from '../services/songService';
import { StorageService } from '../services/storage';
import { TemplateService } from '../services/templateService';
import { AvailabilityService } from '../services/availabilityService';
import { exportRehearsalSheetAsPDF } from '../services/exportService';
import {
  getNextAvailableServiceDate,
  getSmartInitialServiceDetails,
  isScheduleEmpty,
  isNoServiceSchedule,
  createDefaultRehearsalChecklist,
  NO_SERVICE_REASON_MAX_LENGTH,
  normalizeNoServiceReason
} from '../utils/scheduleUtils';
import { getManilaNowISO, getManilaTodayString, formatDateDisplayManila, getManilaDateParts, isValidServiceDateForType } from '../utils/dateUtils';
import { sortTags } from '../utils/tagUtils';
import { triggerHaptic } from '../utils/haptics';
import { resolveScheduleSongTitles, resolveSlotSong } from '../utils/songResolveUtils';
import { calculateLineupDuration } from '../utils/durationUtils';
import { getSongReferenceLinks, describeKeyTransition, generateServiceBrief, getTransitionPairId, resolveTransitionNote } from '../utils/songReferenceUtils';
import { hasUsableLyrics } from '../utils/lyricsParser';
import { CHART_INSTRUMENT_LABELS } from '../utils/chordChartUtils';
import { buildYouTubeTimestampUrl, formatMarkerTimestamp } from '../utils/videoMarkerUtils';
import { ImportSummary } from '../services/youtubePlaylistService';
import { LineupHistoryService, SchedulerSnapshot } from '../services/lineupHistoryService';
import { SongAutocomplete } from './SongAutocomplete';
import { MonthlyUsageModal } from './MonthlyUsageModal';
import { SongPickerModal } from './SongPickerModal';
import { SongFormModal } from './SongFormModal';
import { SongRecommendationsPanel } from './SongRecommendationsPanel';
import { SmartSongImportModal } from './SmartSongImportModal';
import { LineupTemplatesModal } from './LineupTemplatesModal';
import { MemberAvailabilityModal } from './MemberAvailabilityModal';
import { TempoDynamicsCurve } from './TempoDynamicsCurve';
import { RehearsalPrompterModal } from './RehearsalPrompterModal';
import { LyricsPresentationModal } from './LyricsPresentationModal';
import { ChordChartViewer } from './ChordChartViewer';
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
  Redo2,
  Clock,
  ExternalLink,
  Copy,
  Check,
  CheckSquare,
  Square,
  ArrowRight,
  Shuffle,
  LayoutTemplate,
  UserCheck,
  Activity,
  Tv,
  Monitor,
  Printer,
  Ban,
  BookOpen,
  Guitar,
  Edit2
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
  onSaveSchedule: (scheduleData: Omit<Schedule, 'id' | 'updatedAt'>, id?: string) => boolean | void;
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
  const [praiseSongIds, setPraiseSongIds] = useState<(string | undefined)[]>([undefined]);
  const [worshipSongIds, setWorshipSongIds] = useState<(string | undefined)[]>([undefined]);

  // Service Notes & Instructions State (S-00)
  const [serviceNotes, setServiceNotes] = useState<string>(() => editingSchedule?.notes || '');

  // Explicit No Service State (NS-01)
  const [noService, setNoService] = useState<boolean>(() => Boolean(editingSchedule?.noService === true));
  const [noServiceReason, setNoServiceReason] = useState<string>(() =>
    editingSchedule?.noService === true ? (editingSchedule?.noServiceReason || '') : ''
  );
  const [isConfirmNoServiceOpen, setIsConfirmNoServiceOpen] = useState<boolean>(false);

  // Consecutive Song Transitions State (S-04)
  const [transitionNotes, setTransitionNotes] = useState<Record<string, string>>(() => editingSchedule?.transitionNotes || {});
  const [isTransitionsOpen, setIsTransitionsOpen] = useState<boolean>(true);

  // Rehearsal Readiness Checklist State (S-06)
  const getDefaultRehearsalChecklist = useCallback(
    (): RehearsalChecklist => createDefaultRehearsalChecklist(),
    []
  );
  const [rehearsalChecklist, setRehearsalChecklist] = useState<RehearsalChecklist>(() =>
    editingSchedule?.rehearsalChecklist || createDefaultRehearsalChecklist()
  );
  const [isChecklistOpen, setIsChecklistOpen] = useState<boolean>(false);

  // Checklist invalidation helpers (S-06)
  const invalidateChecklist = useCallback((flags: Partial<Record<keyof Omit<RehearsalChecklist, 'updatedAt'>, boolean>>) => {
    setRehearsalChecklist((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [k, v] of Object.entries(flags)) {
        const key = k as keyof Omit<RehearsalChecklist, 'updatedAt'>;
        if (next[key] !== v) {
          next[key] = v as boolean;
          changed = true;
        }
      }
      if (changed) {
        next.updatedAt = getManilaNowISO();
        return next;
      }
      return prev;
    });
  }, []);

  const invalidateSongChanges = useCallback(() => {
    invalidateChecklist({
      songSelectionFinalized: false,
      performedKeysChecked: false,
      lyricsReviewed: false,
      referencesChecked: false,
      transitionsPrepared: false
    });
  }, [invalidateChecklist]);

  const invalidateKeyChanges = useCallback(() => {
    invalidateChecklist({
      performedKeysChecked: false,
      transitionsPrepared: false
    });
  }, [invalidateChecklist]);

  const invalidateTeamChanges = useCallback(() => {
    invalidateChecklist({
      teamAssignmentsFinalized: false
    });
  }, [invalidateChecklist]);

  const invalidateTransitionCueChanges = useCallback(() => {
    invalidateChecklist({
      transitionsPrepared: false
    });
  }, [invalidateChecklist]);

  // Listen for catalog song lyrics edits so live scheduler marks only lyricsReviewed as pending without losing unsaved edits
  useEffect(() => {
    const handleSongLyricsUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail as { songId?: string; title?: string } | undefined;
      if (!detail) return;
      const targetId = (detail.songId || '').trim();
      const targetTitle = (detail.title || '').trim().toLowerCase();
      const matchesLineup =
        (targetId && (praiseSongIds.includes(targetId) || worshipSongIds.includes(targetId))) ||
        (!targetId &&
          targetTitle &&
          (praiseSongs.some((t, idx) => !praiseSongIds[idx] && t.trim().toLowerCase() === targetTitle) ||
            worshipSongs.some((t, idx) => !worshipSongIds[idx] && t.trim().toLowerCase() === targetTitle)));
      if (matchesLineup) {
        invalidateChecklist({ lyricsReviewed: false });
      }
    };
    window.addEventListener('wwcf:song-lyrics-updated', handleSongLyricsUpdated);
    return () => {
      window.removeEventListener('wwcf:song-lyrics-updated', handleSongLyricsUpdated);
    };
  }, [praiseSongIds, worshipSongIds, praiseSongs, worshipSongs, invalidateChecklist]);

  // Service Brief modal/copy state (S-05)
  const [copiedBrief, setCopiedBrief] = useState<boolean>(false);
  const [briefModalText, setBriefModalText] = useState<string | null>(null);

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

  // Song Form Modal State (Add New Song / Quick Edit Catalog Lyrics) & Direct Lineup Chart Preview
  const [isSongFormOpen, setIsSongFormOpen] = useState(false);
  const [editingSongForLyrics, setEditingSongForLyrics] = useState<Song | null>(null);
  const [chartPreviewTarget, setChartPreviewTarget] = useState<{
    song: Song;
    performedKey?: string;
    sectionLabel: string;
  } | null>(null);

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

  // Roadmap Program Modals: L-01 (Templates), L-02 (Availability), L-07 (Rehearsal Sheet), L-09 (Prompter)
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState<boolean>(false);
  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState<boolean>(false);
  const [isPrompterOpen, setIsPrompterOpen] = useState<boolean>(false);
  const [isLyricsPresentationOpen, setIsLyricsPresentationOpen] = useState<boolean>(false);
  const [isExportingRehearsalSheet, setIsExportingRehearsalSheet] = useState<boolean>(false);

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
      praiseSongIds: [...praiseSongIds],
      worshipSongIds: [...worshipSongIds],
      ministryRows: JSON.parse(JSON.stringify(ministryRows)),
      notes: serviceNotes,
      noService,
      noServiceReason,
      transitionNotes: { ...transitionNotes },
      rehearsalChecklist: { ...rehearsalChecklist },
      editingScheduleId: editingSchedule?.id || null
    }));
    return unregister;
  }, [currentContextKey, serviceType, serviceDate, praiseSongs, worshipSongs, praiseSongKeys, worshipSongKeys, praiseSongIds, worshipSongIds, ministryRows, serviceNotes, noService, noServiceReason, transitionNotes, rehearsalChecklist, editingSchedule]);

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
      setPraiseSongIds(s.praiseSongIds ? [...s.praiseSongIds] : s.praiseSongs.map(() => undefined));
      setWorshipSongIds(s.worshipSongIds ? [...s.worshipSongIds] : s.worshipSongs.map(() => undefined));
      setMinistryRows(JSON.parse(JSON.stringify(s.ministryRows || [])));
      setServiceNotes(s.notes || '');
      setNoService(Boolean(s.noService === true));
      setNoServiceReason(s.noServiceReason || '');
      setTransitionNotes(s.transitionNotes || {});
      setRehearsalChecklist(s.rehearsalChecklist || getDefaultRehearsalChecklist());
      triggerHaptic('selection');
      setTimeout(() => {
        isRestoringHistoryRef.current = false;
      }, 60);
    };

    window.addEventListener('wwcf:restore-scheduler-snapshot', handleRestore);
    return () => {
      window.removeEventListener('wwcf:restore-scheduler-snapshot', handleRestore);
    };
  }, [getDefaultRehearsalChecklist]);

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
      praiseSongIds: [...praiseSongIds],
      worshipSongIds: [...worshipSongIds],
      ministryRows: JSON.parse(JSON.stringify(ministryRows)),
      notes: serviceNotes,
      noService,
      noServiceReason,
      transitionNotes: { ...transitionNotes },
      rehearsalChecklist: { ...rehearsalChecklist },
      editingScheduleId: editingSchedule?.id || null
    };
    LineupHistoryService.pushSnapshot(currentContextKey, snap);
  }, [currentContextKey, serviceType, serviceDate, praiseSongs, worshipSongs, praiseSongKeys, worshipSongKeys, praiseSongIds, worshipSongIds, ministryRows, serviceNotes, noService, noServiceReason, transitionNotes, rehearsalChecklist, editingSchedule]);

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
        praiseSongIds: [...praiseSongIds],
        worshipSongIds: [...worshipSongIds],
        ministryRows: JSON.parse(JSON.stringify(ministryRows)),
        notes: serviceNotes,
        noService,
        noServiceReason,
        transitionNotes: { ...transitionNotes },
        rehearsalChecklist: { ...rehearsalChecklist },
        editingScheduleId: editingSchedule?.id || null
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
  }, [currentContextKey, serviceType, serviceDate, praiseSongs, worshipSongs, praiseSongKeys, worshipSongKeys, praiseSongIds, worshipSongIds, ministryRows, serviceNotes, noService, noServiceReason, transitionNotes, rehearsalChecklist, editingSchedule, showToast]);

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
        praiseSongIds: [...praiseSongIds],
        worshipSongIds: [...worshipSongIds],
        ministryRows: JSON.parse(JSON.stringify(ministryRows)),
        notes: serviceNotes,
        noService,
        noServiceReason,
        transitionNotes: { ...transitionNotes },
        rehearsalChecklist: { ...rehearsalChecklist },
        editingScheduleId: editingSchedule?.id || null
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
  }, [currentContextKey, serviceType, serviceDate, praiseSongs, worshipSongs, praiseSongKeys, worshipSongKeys, praiseSongIds, worshipSongIds, ministryRows, serviceNotes, noService, noServiceReason, transitionNotes, rehearsalChecklist, editingSchedule, showToast]);

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
    setPraiseSongIds([undefined]);
    setWorshipSongIds([undefined]);
    setMinistryRows(createDefaultMinistryRows());
    setServiceNotes('');
    setNoService(false);
    setNoServiceReason('');
    setIsConfirmNoServiceOpen(false);
    setTransitionNotes({});
    setRehearsalChecklist(getDefaultRehearsalChecklist());
    setPendingDaAssignment(null);
    setSmartImportConfig({ isOpen: false });
    setPendingImportData(null);
    setDuplicateConflictSchedule(null);
    setMonthlyWarnings([]);
    LineupHistoryService.clearHistory(currentContextKey);
    setCanUndo(false);
    setCanRedo(false);
    try {
      StorageService.saveDraftScheduleChecked(null);
    } catch (e) {
      console.warn('[SchedulerView] Failed to clear draft on reset:', e);
    }
    setTimeout(() => {
      isResettingRef.current = false;
    }, 100);
  }, [schedules, currentContextKey, getDefaultRehearsalChecklist]);

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
          setPraiseSongIds(draft.praiseSongIds !== undefined ? draft.praiseSongIds : (editingSchedule.praiseSongIds || editingSchedule.praiseSongs?.map(() => undefined) || [undefined]));
          setWorshipSongIds(draft.worshipSongIds !== undefined ? draft.worshipSongIds : (editingSchedule.worshipSongIds || editingSchedule.worshipSongs?.map(() => undefined) || [undefined]));
          setServiceNotes(draft.notes !== undefined ? draft.notes : (editingSchedule.notes || ''));
          const draftNoSvc = draft.noService !== undefined ? Boolean(draft.noService === true) : Boolean(editingSchedule.noService === true);
          setNoService(draftNoSvc);
          setNoServiceReason(
            draftNoSvc
              ? (draft.noServiceReason !== undefined ? draft.noServiceReason : (editingSchedule.noServiceReason || ''))
              : ''
          );
          setTransitionNotes(draft.transitionNotes || editingSchedule.transitionNotes || {});
          setRehearsalChecklist(draft.rehearsalChecklist || editingSchedule.rehearsalChecklist || getDefaultRehearsalChecklist());
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

          const isNoSvc = Boolean(editingSchedule.noService === true);
          setNoService(isNoSvc);
          setNoServiceReason(isNoSvc ? (editingSchedule.noServiceReason || '') : '');

          const resolved = resolveScheduleSongTitles(editingSchedule, allSongs);
          setPraiseSongs(resolved.praiseSongs?.length ? resolved.praiseSongs : ['']);
          setWorshipSongs(resolved.worshipSongs?.length ? resolved.worshipSongs : ['']);

          const pKeys = (resolved.praiseSongs || []).map((_, idx) =>
            editingSchedule.praiseSongKeys?.[idx] !== undefined ? editingSchedule.praiseSongKeys[idx] : ''
          );
          setPraiseSongKeys(pKeys.length > 0 ? pKeys : ['']);

          const wKeys = (resolved.worshipSongs || []).map((_, idx) =>
            editingSchedule.worshipSongKeys?.[idx] !== undefined ? editingSchedule.worshipSongKeys[idx] : ''
          );
          setWorshipSongKeys(wKeys.length > 0 ? wKeys : ['']);

          const resolvedPraiseIds = (resolved.praiseSongIds || []).map((id) => (id ? id : undefined));
          setPraiseSongIds(resolvedPraiseIds.length > 0 ? resolvedPraiseIds : [undefined]);

          const resolvedWorshipIds = (resolved.worshipSongIds || []).map((id) => (id ? id : undefined));
          setWorshipSongIds(resolvedWorshipIds.length > 0 ? resolvedWorshipIds : [undefined]);

          setServiceNotes(editingSchedule.notes || '');
          setTransitionNotes(editingSchedule.transitionNotes || {});
          setRehearsalChecklist(editingSchedule.rehearsalChecklist || getDefaultRehearsalChecklist());

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
          setPraiseSongIds(draft.praiseSongIds?.length ? draft.praiseSongIds : (draft.praiseSongs?.map(() => undefined) || [undefined]));
          setWorshipSongIds(draft.worshipSongIds?.length ? draft.worshipSongIds : (draft.worshipSongs?.map(() => undefined) || [undefined]));
          setServiceNotes(draft.notes || '');
          const draftNoSvc = Boolean(draft.noService === true);
          setNoService(draftNoSvc);
          setNoServiceReason(draftNoSvc ? (draft.noServiceReason || '') : '');
          setTransitionNotes(draft.transitionNotes || {});
          setRehearsalChecklist(draft.rehearsalChecklist || getDefaultRehearsalChecklist());
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
          setPraiseSongIds([undefined]);
          setWorshipSongIds([undefined]);
          setServiceNotes('');
          setNoService(false);
          setNoServiceReason('');
          setTransitionNotes({});
          setRehearsalChecklist(getDefaultRehearsalChecklist());
          setMinistryRows(createDefaultMinistryRows());
        }
      }
    }
  }, [editingSchedule, getDefaultRehearsalChecklist]);

  // Autosave active draft schedule as changes occur
  useEffect(() => {
    if (isResettingRef.current) return;

    const hasSongs = praiseSongs.some((s) => s.trim() !== '') || worshipSongs.some((s) => s.trim() !== '');
    const hasAssignments = ministryRows.some((r) =>
      getAssignmentMembers(r).some((m) => Boolean(m.memberId) || Boolean(m.memberName?.trim()))
    );
    const hasNotes = serviceNotes.trim() !== '';
    const hasNoSvc = noService;

    if (hasSongs || hasAssignments || hasNotes || hasNoSvc || editingSchedule) {
      const timer = setTimeout(() => {
        try {
          StorageService.saveDraftScheduleChecked({
            editingScheduleId: editingSchedule?.id || null,
            serviceType,
            serviceDate,
            praiseSongs,
            worshipSongs,
            praiseSongKeys,
            worshipSongKeys,
            praiseSongIds,
            worshipSongIds,
            ministryAssignments: ministryRows.map((r) => ({
              id: r.id || `ma_${r.role}`,
              role: r.role,
              assignedMembers: r.assignedMembers,
              notes: r.notes
            })),
            notes: serviceNotes,
            noService,
            noServiceReason: noService ? (noServiceReason.trim() || undefined) : undefined,
            transitionNotes,
            rehearsalChecklist,
            savedAt: new Date().toISOString()
          });
        } catch (err) {
          console.error('[SchedulerView] Draft autosave failed:', err);
          showToast('Could not autosave lineup draft. Browser storage may be full.', 'danger');
        }
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
    praiseSongIds,
    worshipSongIds,
    ministryRows,
    serviceNotes,
    noService,
    noServiceReason,
    transitionNotes,
    rehearsalChecklist,
    editingSchedule
  ]);

  // Safe reload / refresh guard: prevent accidental loss of unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasUnsavedSongs = praiseSongs.some((s) => s.trim() !== '') || worshipSongs.some((s) => s.trim() !== '');
      const hasUnsavedAssignments = ministryRows.some((r) =>
        getAssignmentMembers(r).some((m) => Boolean(m.memberId) || Boolean(m.memberName?.trim()))
      );
      if (hasUnsavedSongs || hasUnsavedAssignments || noService) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [praiseSongs, worshipSongs, ministryRows, noService, noServiceReason]);

  // Helper to load a schedule object into editor state
  const loadScheduleDataIntoEditor = (sched: Schedule) => {
    // Clear history on loading a distinct schedule
    LineupHistoryService.clearHistory(sched ? `edit_${sched.id}` : 'new_schedule');
    setCanUndo(false);
    setCanRedo(false);

    const isNoSvc = Boolean(sched.noService === true);
    setNoService(isNoSvc);
    setNoServiceReason(isNoSvc ? (sched.noServiceReason || '') : '');
    setChartPreviewTarget(null);

    setServiceType(sched.serviceType);
    setServiceDate(sched.serviceDate);
    const resolved = resolveScheduleSongTitles(sched, allSongs);
    setPraiseSongs(resolved.praiseSongs?.length ? resolved.praiseSongs : ['']);
    setWorshipSongs(resolved.worshipSongs?.length ? resolved.worshipSongs : ['']);

    const pKeys = (resolved.praiseSongs || []).map((_, idx) =>
      sched.praiseSongKeys?.[idx] !== undefined ? sched.praiseSongKeys[idx] : ''
    );
    setPraiseSongKeys(pKeys.length > 0 ? pKeys : ['']);

    const wKeys = (resolved.worshipSongs || []).map((_, idx) =>
      sched.worshipSongKeys?.[idx] !== undefined ? sched.worshipSongKeys[idx] : ''
    );
    setWorshipSongKeys(wKeys.length > 0 ? wKeys : ['']);

    const resolvedPraiseIds = (resolved.praiseSongIds || []).map((id) => (id ? id : undefined));
    setPraiseSongIds(resolvedPraiseIds.length > 0 ? resolvedPraiseIds : [undefined]);

    const resolvedWorshipIds = (resolved.worshipSongIds || []).map((id) => (id ? id : undefined));
    setWorshipSongIds(resolvedWorshipIds.length > 0 ? resolvedWorshipIds : [undefined]);

    setServiceNotes(sched.notes || '');
    setTransitionNotes(sched.transitionNotes || {});
    setRehearsalChecklist(sched.rehearsalChecklist || getDefaultRehearsalChecklist());

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

  const hasExistingDraftContent = useCallback((): boolean => {
    const hasSongs =
      praiseSongs.some((s) => Boolean(s && s.trim())) ||
      worshipSongs.some((s) => Boolean(s && s.trim()));
    if (hasSongs) return true;

    const hasAssignments = ministryRows.some((r) =>
      getAssignmentMembers(r).some((m) => Boolean(m.memberId) || Boolean(m.memberName && m.memberName.trim()))
    );
    if (hasAssignments) return true;

    const hasTransitionNotes = Object.values(transitionNotes || {}).some((val) => Boolean(val && val.trim()));
    return hasTransitionNotes;
  }, [praiseSongs, worshipSongs, ministryRows, transitionNotes]);

  const applyNoServiceEnabled = useCallback(() => {
    takeSnapshot(true);
    setNoService(true);
    setPraiseSongs(['']);
    setWorshipSongs(['']);
    setPraiseSongKeys(['']);
    setWorshipSongKeys(['']);
    setPraiseSongIds([undefined]);
    setWorshipSongIds([undefined]);
    setMinistryRows(createDefaultMinistryRows());
    setTransitionNotes({});
    setRehearsalChecklist(getDefaultRehearsalChecklist());
    setChartPreviewTarget(null);
    setIsConfirmNoServiceOpen(false);
    triggerHaptic('selection');
  }, [takeSnapshot, getDefaultRehearsalChecklist]);

  const handleToggleNoService = useCallback((nextVal: boolean) => {
    if (nextVal === noService) return;
    if (nextVal) {
      if (hasExistingDraftContent()) {
        setIsConfirmNoServiceOpen(true);
      } else {
        applyNoServiceEnabled();
      }
    } else {
      takeSnapshot(true);
      setNoService(false);
      setNoServiceReason('');
      triggerHaptic('selection');
    }
  }, [noService, hasExistingDraftContent, applyNoServiceEnabled, takeSnapshot]);

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
      praiseSongIds,
      worshipSongIds,
      ministryAssignments: ministryRows,
      notes: serviceNotes,
      noService,
      noServiceReason: noService ? (noServiceReason.trim() || undefined) : undefined,
      transitionNotes,
      rehearsalChecklist
    };
    onTriggerDraft(draft);

    // Dispatch custom event so Interactive Guide can detect song additions/playlist imports
    window.dispatchEvent(
      new CustomEvent('lineup-songs-changed', {
        detail: { praiseSongs, worshipSongs }
      })
    );
  }, [serviceType, serviceDate, praiseSongs, worshipSongs, praiseSongKeys, worshipSongKeys, praiseSongIds, worshipSongIds, ministryRows, serviceNotes, noService, noServiceReason, transitionNotes, rehearsalChecklist, editingSchedule, onTriggerDraft]);

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
  const handlePraiseChange = (index: number, value: string, selectedSong?: Song) => {
    takeSnapshot(false);
    const updated = [...praiseSongs];
    updated[index] = value;
    setPraiseSongs(updated);

    const updatedKeys = [...praiseSongKeys];
    const updatedIds = [...praiseSongIds];

    if (selectedSong) {
      updatedIds[index] = selectedSong.id;
      updatedKeys[index] = selectedSong.originalKey || selectedSong.key || '';
    } else {
      const clean = value.trim().toLowerCase();
      if (!clean) {
        updatedIds[index] = undefined;
        updatedKeys[index] = '';
      } else {
        const matches = allSongs.filter(s => s.title.trim().toLowerCase() === clean);
        if (matches.length === 1) {
          updatedIds[index] = matches[0].id;
          if (!updatedKeys[index]) {
            updatedKeys[index] = matches[0].originalKey || matches[0].key || '';
          }
        } else {
          updatedIds[index] = undefined;
        }
      }
    }

    setPraiseSongKeys(updatedKeys);
    setPraiseSongIds(updatedIds);
    invalidateSongChanges();
  };

  const handlePraiseKeyChange = (index: number, keyVal: string) => {
    takeSnapshot(true);
    const updatedKeys = [...praiseSongKeys];
    updatedKeys[index] = keyVal;
    setPraiseSongKeys(updatedKeys);
    invalidateKeyChanges();
  };

  const addPraiseSong = () => {
    takeSnapshot(true);
    setPraiseSongs([...praiseSongs, '']);
    setPraiseSongKeys([...praiseSongKeys, '']);
    setPraiseSongIds([...praiseSongIds, undefined]);
    invalidateSongChanges();
  };

  const removePraiseSong = (index: number) => {
    takeSnapshot(true);
    setPraiseSongs(praiseSongs.filter((_, i) => i !== index));
    setPraiseSongKeys(praiseSongKeys.filter((_, i) => i !== index));
    setPraiseSongIds(praiseSongIds.filter((_, i) => i !== index));
    invalidateSongChanges();
  };

  const handleWorshipChange = (index: number, value: string, selectedSong?: Song) => {
    takeSnapshot(false);
    const updated = [...worshipSongs];
    updated[index] = value;
    setWorshipSongs(updated);

    const updatedKeys = [...worshipSongKeys];
    const updatedIds = [...worshipSongIds];

    if (selectedSong) {
      updatedIds[index] = selectedSong.id;
      updatedKeys[index] = selectedSong.originalKey || selectedSong.key || '';
    } else {
      const clean = value.trim().toLowerCase();
      if (!clean) {
        updatedIds[index] = undefined;
        updatedKeys[index] = '';
      } else {
        const matches = allSongs.filter(s => s.title.trim().toLowerCase() === clean);
        if (matches.length === 1) {
          updatedIds[index] = matches[0].id;
          if (!updatedKeys[index]) {
            updatedKeys[index] = matches[0].originalKey || matches[0].key || '';
          }
        } else {
          updatedIds[index] = undefined;
        }
      }
    }

    setWorshipSongKeys(updatedKeys);
    setWorshipSongIds(updatedIds);
    invalidateSongChanges();
  };

  const handleWorshipKeyChange = (index: number, keyVal: string) => {
    takeSnapshot(true);
    const updatedKeys = [...worshipSongKeys];
    updatedKeys[index] = keyVal;
    setWorshipSongKeys(updatedKeys);
    invalidateKeyChanges();
  };

  const addWorshipSong = () => {
    takeSnapshot(true);
    setWorshipSongs([...worshipSongs, '']);
    setWorshipSongKeys([...worshipSongKeys, '']);
    setWorshipSongIds([...worshipSongIds, undefined]);
    invalidateSongChanges();
  };

  const removeWorshipSong = (index: number) => {
    takeSnapshot(true);
    setWorshipSongs(worshipSongs.filter((_, i) => i !== index));
    setWorshipSongKeys(worshipSongKeys.filter((_, i) => i !== index));
    setWorshipSongIds(worshipSongIds.filter((_, i) => i !== index));
    invalidateSongChanges();
  };

  // Handler for adding recommended songs directly into current lineup
  const handleAddRecommendedSong = (category: 'praise' | 'worship', songTitle: string, defaultKey?: string) => {
    takeSnapshot(true);
    const matched = resolveSlotSong(songTitle, undefined, allSongs).song;
    const songId = matched?.id;
    if (category === 'praise') {
      if (praiseSongs.length === 1 && praiseSongs[0].trim() === '') {
        setPraiseSongs([songTitle]);
        setPraiseSongKeys([defaultKey || '']);
        setPraiseSongIds([songId]);
      } else {
        setPraiseSongs([...praiseSongs, songTitle]);
        setPraiseSongKeys([...praiseSongKeys, defaultKey || '']);
        setPraiseSongIds([...praiseSongIds, songId]);
      }
      showToast(`Added "${songTitle}" to Praise songs`, 'success');
    } else {
      if (worshipSongs.length === 1 && worshipSongs[0].trim() === '') {
        setWorshipSongs([songTitle]);
        setWorshipSongKeys([defaultKey || '']);
        setWorshipSongIds([songId]);
      } else {
        setWorshipSongs([...worshipSongs, songTitle]);
        setWorshipSongKeys([...worshipSongKeys, defaultKey || '']);
        setWorshipSongIds([...worshipSongIds, songId]);
      }
      showToast(`Added "${songTitle}" to Worship songs`, 'success');
    }
    invalidateSongChanges();
  };

  // Helper to sync category changes to database based on lineup position (ID-authoritative)
  const syncCategoriesForLineup = async (
    praiseList: string[],
    worshipList: string[],
    praiseIdsList?: (string | undefined)[],
    worshipIdsList?: (string | undefined)[]
  ) => {
    const hasPraise = praiseList.some((s) => Boolean(s && s.trim()));
    const hasWorship = worshipList.some((s) => Boolean(s && s.trim()));

    if (!hasPraise && !hasWorship) return;

    try {
      const songs = await SongService.getSongs();
      const praiseIdsSet = new Set<string>();
      const worshipIdsSet = new Set<string>();

      praiseList.forEach((title, idx) => {
        if (!title || !title.trim()) return;
        const resolved = resolveSlotSong(title, praiseIdsList?.[idx], songs);
        if (resolved.song?.id) {
          praiseIdsSet.add(resolved.song.id);
        }
      });

      worshipList.forEach((title, idx) => {
        if (!title || !title.trim()) return;
        const resolved = resolveSlotSong(title, worshipIdsList?.[idx], songs);
        if (resolved.song?.id && !praiseIdsSet.has(resolved.song.id)) {
          worshipIdsSet.add(resolved.song.id);
        }
      });

      if (praiseIdsSet.size > 0) {
        await SongService.bulkUpdateCategory(Array.from(praiseIdsSet), 'praise');
      }
      if (worshipIdsSet.size > 0) {
        await SongService.bulkUpdateCategory(Array.from(worshipIdsSet), 'worship');
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
    let nextPraiseIds = [...praiseSongIds];
    let nextWorship = [...worshipSongs];
    let nextWorshipKeys = [...worshipSongKeys];
    let nextWorshipIds = [...worshipSongIds];

    if (source.type === 'lineup') {
      const { category: srcCategory, index: srcIndex } = source;

      if (srcCategory === targetCategory) {
        // 1. REORDER WITHIN THE SAME CATEGORY LIST
        const list = targetCategory === 'praise' ? nextPraise : nextWorship;
        const keysList = targetCategory === 'praise' ? nextPraiseKeys : nextWorshipKeys;
        const idsList = targetCategory === 'praise' ? nextPraiseIds : nextWorshipIds;

        if (srcIndex >= 0 && srcIndex < list.length) {
          const [movedSong] = list.splice(srcIndex, 1);
          const [movedKey] = keysList.splice(srcIndex, 1);
          const [movedId] = idsList.splice(srcIndex, 1);

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
          idsList.splice(finalTargetIndex, 0, movedId);

          if (targetCategory === 'praise') {
            setPraiseSongs([...list]);
            setPraiseSongKeys([...keysList]);
            setPraiseSongIds([...idsList]);
          } else {
            setWorshipSongs([...list]);
            setWorshipSongKeys([...keysList]);
            setWorshipSongIds([...idsList]);
          }
        }
      } else {
        // 2. CROSS-CATEGORY MOVE (Praise -> Worship or Worship -> Praise)
        const srcList = srcCategory === 'praise' ? nextPraise : nextWorship;
        const srcKeys = srcCategory === 'praise' ? nextPraiseKeys : nextWorshipKeys;
        const srcIds = srcCategory === 'praise' ? nextPraiseIds : nextWorshipIds;
        const destList = targetCategory === 'praise' ? nextPraise : nextWorship;
        const destKeys = targetCategory === 'praise' ? nextPraiseKeys : nextWorshipKeys;
        const destIds = targetCategory === 'praise' ? nextPraiseIds : nextWorshipIds;

        if (srcIndex >= 0 && srcIndex < srcList.length) {
          const songToMove = srcList[srcIndex];
          const keyToMove = srcKeys[srcIndex] || '';
          const idToMove = srcIds[srcIndex];

          if (!songToMove || songToMove.trim() === '') {
            return;
          }

          // Remove from source list (can become cleanly empty)
          srcList.splice(srcIndex, 1);
          srcKeys.splice(srcIndex, 1);
          srcIds.splice(srcIndex, 1);

          // Destination list: If destination currently only has 1 song and it's blank '', replace it!
          if (destList.length === 1 && (!destList[0] || destList[0].trim() === '')) {
            destList[0] = songToMove;
            destKeys[0] = keyToMove;
            destIds[0] = idToMove;
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
            destIds.splice(finalTargetIndex, 0, idToMove);
          }

          if (srcCategory === 'praise') {
            setPraiseSongs([...srcList]);
            setPraiseSongKeys([...srcKeys]);
            setPraiseSongIds([...srcIds]);
            setWorshipSongs([...destList]);
            setWorshipSongKeys([...destKeys]);
            setWorshipSongIds([...destIds]);
          } else {
            setWorshipSongs([...srcList]);
            setWorshipSongKeys([...srcKeys]);
            setWorshipSongIds([...srcIds]);
            setPraiseSongs([...destList]);
            setPraiseSongKeys([...destKeys]);
            setPraiseSongIds([...destIds]);
          }

          const toName = targetCategory === 'praise' ? 'Praise (Fast)' : 'Worship (Slow)';
          showToast(`Moved "${songToMove}" to ${toName} songs`, 'success');
        }
      }
    } else if (source.type === 'recommendation') {
      // 3. DROP RECOMMENDATION INTO LINEUP
      const destList = targetCategory === 'praise' ? nextPraise : nextWorship;
      const destKeys = targetCategory === 'praise' ? nextPraiseKeys : nextWorshipKeys;
      const destIds = targetCategory === 'praise' ? nextPraiseIds : nextWorshipIds;
      const recSong = resolveSlotSong(source.songTitle, undefined, allSongs).song;
      const recId = recSong?.id;

      if (destList.length === 1 && (!destList[0] || destList[0].trim() === '')) {
        destList[0] = source.songTitle;
        destKeys[0] = source.key || '';
        destIds[0] = recId;
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
        destIds.splice(finalTargetIndex, 0, recId);
      }

      if (targetCategory === 'praise') {
        setPraiseSongs([...destList]);
        setPraiseSongKeys([...destKeys]);
        setPraiseSongIds([...destIds]);
      } else {
        setWorshipSongs([...destList]);
        setWorshipSongKeys([...destKeys]);
        setWorshipSongIds([...destIds]);
      }

      const toName = targetCategory === 'praise' ? 'Praise' : 'Worship';
      showToast(`Added "${source.songTitle}" to ${toName} songs`, 'success');
    }

    invalidateSongChanges();
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
    // Rule: 1st & 2nd song Praise, 3rd+ Worship (for 2 songs: both Praise)
    if (praiseImported.length === 0 && worshipImported.length === 0) {
      praiseImported = importedSongs.slice(0, 2);
      worshipImported = importedSongs.slice(2);
    }

    const praiseTitles = praiseImported.map((s) => s.title);
    const worshipTitles = worshipImported.map((s) => s.title);

    const praiseKeys = praiseImported.map((s) => s.originalKey || s.key || '');
    const worshipKeys = worshipImported.map((s) => s.originalKey || s.key || '');

    const newPraise = praiseTitles.length > 0 ? praiseTitles : [''];
    const newWorship = worshipTitles.length > 0 ? worshipTitles : [''];

    const praiseIds = praiseImported.map((s) => s.id);
    const worshipIds = worshipImported.map((s) => s.id);

    setPraiseSongs(newPraise);
    setWorshipSongs(newWorship);

    setPraiseSongKeys(praiseKeys.length > 0 ? praiseKeys : ['']);
    setWorshipSongKeys(worshipKeys.length > 0 ? worshipKeys : ['']);

    setPraiseSongIds(praiseIds.length > 0 ? praiseIds : [undefined]);
    setWorshipSongIds(worshipIds.length > 0 ? worshipIds : [undefined]);

    invalidateSongChanges();
    await syncCategoriesForLineup(newPraise, newWorship, praiseIds, worshipIds);
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
    const cleanPraiseIds = praiseSongIds.filter((_, idx) => Boolean(praiseSongs[idx]?.trim()));
    const cleanWorshipIds = worshipSongIds.filter((_, idx) => Boolean(worshipSongs[idx]?.trim()));

    const mergedPraiseIds = [
      ...cleanPraiseIds,
      ...newPraiseImported.map((s) => s.id)
    ];
    const mergedWorshipIds = [
      ...cleanWorshipIds,
      ...newWorshipImported.map((s) => s.id)
    ];

    const finalPraise = mergedPraiseTitles.length > 0 ? mergedPraiseTitles : [''];
    const finalWorship = mergedWorshipTitles.length > 0 ? mergedWorshipTitles : [''];

    setPraiseSongs(finalPraise);
    setPraiseSongKeys(mergedPraiseKeys.length > 0 ? mergedPraiseKeys : ['']);
    setPraiseSongIds(mergedPraiseIds.length > 0 ? mergedPraiseIds : [undefined]);

    setWorshipSongs(finalWorship);
    setWorshipSongKeys(mergedWorshipKeys.length > 0 ? mergedWorshipKeys : ['']);
    setWorshipSongIds(mergedWorshipIds.length > 0 ? mergedWorshipIds : [undefined]);

    invalidateSongChanges();
    await syncCategoriesForLineup(finalPraise, finalWorship, mergedPraiseIds, mergedWorshipIds);
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
    setPraiseSongKeys(['']);
    setWorshipSongKeys(['']);
    setPraiseSongIds([undefined]);
    setWorshipSongIds([undefined]);
    setSmartImportConfig({ isOpen: false });
    invalidateSongChanges();
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

    const praiseLeaderId = filledPraiseLeaders[0]?.memberId;
    const worshipLeaderId = filledWorshipLeaders[0]?.memberId;
    const praiseLeaderName = (filledPraiseLeaders[0]?.memberName || '').toLowerCase().trim();
    const worshipLeaderName = (filledWorshipLeaders[0]?.memberName || '').toLowerCase().trim();

    const isSamePersonInBoth = Boolean(
      (praiseLeaderId && worshipLeaderId && praiseLeaderId === worshipLeaderId) ||
      (!praiseLeaderId && !worshipLeaderId && praiseLeaderName && worshipLeaderName && praiseLeaderName === worshipLeaderName && praiseLeaderName !== 'unassigned' && praiseLeaderName !== '—')
    );

    // Two-leader mode strictly requires two distinct eligible people.
    // If the same member ID is assigned in both Praise and Worship leader rows, normalize to one-leader state.
    const hasTwoSeparateFilledLeaders =
      filledPraiseLeaders.length > 0 &&
      filledWorshipLeaders.length > 0 &&
      !isSamePersonInBoth;

    const distinctAssignedLeaderIds = Array.from(
      new Set(
        filledLeaderMembers
          .map((m) => m.memberId)
          .filter((id) => Boolean(id && id.trim()))
      )
    );

    const isTwoLeaders =
      !isSamePersonInBoth &&
      (distinctAssignedLeaderIds.length >= 2 || hasTwoSeparateFilledLeaders);

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
    invalidateTeamChanges();
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
    invalidateTeamChanges();
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

    invalidateTeamChanges();

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
    invalidateTeamChanges();
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
    invalidateTeamChanges();
  };

  const removeMinistryRow = (id: string) => {
    takeSnapshot(true);
    setMinistryRows((rows) => syncMinistryRowsForSongLeaders(rows.filter((r) => r.id !== id)));
    invalidateTeamChanges();
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
    const filteredPraise = noService ? [] : praiseSongs.map((s) => s.trim()).filter(Boolean);
    const filteredWorship = noService ? [] : worshipSongs.map((s) => s.trim()).filter(Boolean);

    const validAssignments = noService
      ? []
      : ministryRows
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

    const praiseSongIdsToSave = noService
      ? []
      : praiseSongs
          .map((s, idx) => {
            if (!s || !s.trim()) return undefined;
            if (praiseSongIds[idx]) return praiseSongIds[idx];
            const lower = s.trim().toLowerCase();
            const matches = allSongs.filter((x) => x.title.trim().toLowerCase() === lower);
            return matches.length === 1 ? matches[0].id : '';
          })
          .filter((_, idx) => Boolean(praiseSongs[idx]?.trim()))
          .map((id) => id || '');

    const worshipSongIdsToSave = noService
      ? []
      : worshipSongs
          .map((s, idx) => {
            if (!s || !s.trim()) return undefined;
            if (worshipSongIds[idx]) return worshipSongIds[idx];
            const lower = s.trim().toLowerCase();
            const matches = allSongs.filter((x) => x.title.trim().toLowerCase() === lower);
            return matches.length === 1 ? matches[0].id : '';
          })
          .filter((_, idx) => Boolean(worshipSongs[idx]?.trim()))
          .map((id) => id || '');

    const scheduleData: Omit<Schedule, 'id' | 'updatedAt'> = {
      serviceType,
      serviceDate,
      praiseSongs: filteredPraise,
      worshipSongs: filteredWorship,
      praiseSongKeys: noService ? [] : praiseSongs.map((s, i) => praiseSongKeys[i] || '').filter((_, i) => Boolean(praiseSongs[i]?.trim())),
      worshipSongKeys: noService ? [] : worshipSongs.map((s, i) => worshipSongKeys[i] || '').filter((_, i) => Boolean(worshipSongs[i]?.trim())),
      praiseSongIds: praiseSongIdsToSave,
      worshipSongIds: worshipSongIdsToSave,
      ministryAssignments: validAssignments,
      notes: serviceNotes.trim(),
      noService,
      noServiceReason: noService ? normalizeNoServiceReason(noServiceReason) : undefined,
      transitionNotes: noService ? {} : transitionNotes,
      rehearsalChecklist: noService ? getDefaultRehearsalChecklist() : rehearsalChecklist
    };

    // Check if a saved schedule already exists for this exact serviceType + serviceDate
    const conflictingSchedule = schedules.find((s) => {
      if (editingSchedule?.id && s.id === editingSchedule.id) return false;
      if (isScheduleEmpty(s) || s.id.startsWith('placeholder_')) return false;
      return s.serviceType === serviceType && s.serviceDate === serviceDate;
    });

    if (conflictingSchedule) {
      setDuplicateConflictSchedule(conflictingSchedule);
      setIsDuplicateModalOpen(true);
      return;
    }

    if (!noService) {
      // Check monthly usage for selected songs (preserving slot IDs to isolate duplicate-title songs)
      const selectedSlots: { title: string; id: string }[] = [];
      const seenSlots = new Set<string>();
      const pushSlot = (title: string, id: string) => {
        const dedupeKey = id ? `id:${id}` : `title:${title.trim().toLowerCase()}`;
        if (!seenSlots.has(dedupeKey)) {
          seenSlots.add(dedupeKey);
          selectedSlots.push({ title, id });
        }
      };
      filteredPraise.forEach((title, idx) => pushSlot(title, praiseSongIdsToSave[idx] || ''));
      filteredWorship.forEach((title, idx) => pushSlot(title, worshipSongIdsToSave[idx] || ''));

      let slotsToCheck = selectedSlots;
      const excludeScheduleId = editingSchedule?.id;

      if (editingSchedule && editingSchedule.id) {
        // When editing an existing line-up:
        // Exclude songs that were already part of the original line-up and remain unchanged.
        const originalIdsSet = new Set<string>();
        const originalUnIdTitlesSet = new Set<string>();
        (editingSchedule.praiseSongs || []).forEach((s, idx) => {
          const id = (editingSchedule.praiseSongIds?.[idx] || '').trim();
          if (id) originalIdsSet.add(id);
          else if (s?.trim()) originalUnIdTitlesSet.add(s.trim().toLowerCase());
        });
        (editingSchedule.worshipSongs || []).forEach((s, idx) => {
          const id = (editingSchedule.worshipSongIds?.[idx] || '').trim();
          if (id) originalIdsSet.add(id);
          else if (s?.trim()) originalUnIdTitlesSet.add(s.trim().toLowerCase());
        });

        slotsToCheck = selectedSlots.filter((slot) => {
          if (slot.id) return !originalIdsSet.has(slot.id);
          return !originalUnIdTitlesSet.has(slot.title.trim().toLowerCase());
        });
      }

      const warnings: MonthlyUsageCheckResult[] = [];

      slotsToCheck.forEach((slot) => {
        const check = SongService.checkMonthlyUsage(
          slot.title,
          serviceDate,
          schedules,
          excludeScheduleId,
          serviceType,
          allSongs,
          undefined,
          slot.id || undefined
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
    }

    executeFinalSave(scheduleData, editingSchedule?.id);
  };

  const executeFinalSave = (
    data: Omit<Schedule, 'id' | 'updatedAt'>,
    id?: string
  ) => {
    const savedOk = onSaveSchedule(data, id);
    if (savedOk === false) {
      return;
    }

    // Reset undo/redo history so this saved lineup starts clean
    LineupHistoryService.clearHistory(currentContextKey);
    setCanUndo(false);
    setCanRedo(false);

    try {
      StorageService.saveDraftScheduleChecked(null);
    } catch (e) {
      console.warn('[SchedulerView] Failed to clear draft after final save:', e);
    }
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

  const getTempSchedule = useCallback((): Schedule => {
    if (noService) {
      return {
        id: editingSchedule?.id || 'temp',
        serviceType,
        serviceDate,
        praiseSongs: [],
        worshipSongs: [],
        praiseSongKeys: [],
        worshipSongKeys: [],
        praiseSongIds: [],
        worshipSongIds: [],
        ministryAssignments: [],
        notes: serviceNotes.trim(),
        noService: true,
        noServiceReason: normalizeNoServiceReason(noServiceReason),
        transitionNotes: {},
        rehearsalChecklist: getDefaultRehearsalChecklist(),
        updatedAt: getManilaNowISO()
      };
    }

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
      praiseSongIds: praiseSongs
        .map((s, idx) => {
          if (!s || !s.trim()) return undefined;
          if (praiseSongIds[idx]) return praiseSongIds[idx];
          const lower = s.trim().toLowerCase();
          const matches = allSongs.filter((x) => x.title.trim().toLowerCase() === lower);
          return matches.length === 1 ? matches[0].id : '';
        })
        .filter((_, idx) => Boolean(praiseSongs[idx]?.trim()))
        .map((id) => id || ''),
      worshipSongIds: worshipSongs
        .map((s, idx) => {
          if (!s || !s.trim()) return undefined;
          if (worshipSongIds[idx]) return worshipSongIds[idx];
          const lower = s.trim().toLowerCase();
          const matches = allSongs.filter((x) => x.title.trim().toLowerCase() === lower);
          return matches.length === 1 ? matches[0].id : '';
        })
        .filter((_, idx) => Boolean(worshipSongs[idx]?.trim()))
        .map((id) => id || ''),
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
      notes: serviceNotes.trim(),
      noService: false,
      noServiceReason: undefined,
      transitionNotes,
      rehearsalChecklist,
      updatedAt: getManilaNowISO()
    };
  }, [editingSchedule, serviceType, serviceDate, praiseSongs, worshipSongs, praiseSongKeys, worshipSongKeys, praiseSongIds, worshipSongIds, allSongs, ministryRows, serviceNotes, noService, noServiceReason, transitionNotes, rehearsalChecklist, getDefaultRehearsalChecklist]);

  const handleCopyServiceBrief = useCallback(async () => {
    const temp = getTempSchedule();
    if (isScheduleEmpty(temp)) {
      showToast('Lineup is empty. Add songs before copying service brief.', 'danger');
      return;
    }
    const briefText = generateServiceBrief(temp, allSongs);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(briefText);
        setCopiedBrief(true);
        triggerHaptic('success');
        showToast('Service brief copied to clipboard for team chat!', 'success');
        setTimeout(() => setCopiedBrief(false), 3000);
      } else {
        setBriefModalText(briefText);
      }
    } catch {
      setBriefModalText(briefText);
    }
  }, [getTempSchedule, allSongs, showToast]);

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

  const handleExportRehearsalSheet = useCallback(async () => {
    const temp = getTempSchedule();
    if (isScheduleEmpty(temp)) {
      showToast('Lineup is empty. Add songs before exporting rehearsal sheet.', 'danger');
      return;
    }
    setIsExportingRehearsalSheet(true);
    try {
      await exportRehearsalSheetAsPDF(temp, allSongs);
      showToast('Print-ready Rehearsal Sheet PDF exported successfully!', 'success');
    } catch (err) {
      console.error('Export rehearsal sheet error:', err);
      showToast('Failed to export Rehearsal Sheet PDF.', 'danger');
    } finally {
      setIsExportingRehearsalSheet(false);
    }
  }, [getTempSchedule, allSongs, showToast]);

  const handleApplyTemplate = useCallback((template: LineupTemplate, options: { includeKeys: boolean; includeMembers: boolean }) => {
    // 0. Capture pre-template state for Undo BEFORE mutating state
    takeSnapshot(true);

    setNoService(false);
    setNoServiceReason('');

    // 1. Prepare song arrays (strictly preserving slot length alignment)
    const pSongs = template.praiseSongs.length > 0 ? [...template.praiseSongs] : [''];
    const wSongs = template.worshipSongs.length > 0 ? [...template.worshipSongs] : [''];
    const pKeys = pSongs.map((_, idx) => (options.includeKeys ? (template.praiseSongKeys?.[idx] || '') : ''));
    const wKeys = wSongs.map((_, idx) => (options.includeKeys ? (template.worshipSongKeys?.[idx] || '') : ''));
    const pIds = pSongs.map((_, idx) => template.praiseSongIds?.[idx] || undefined);
    const wIds = wSongs.map((_, idx) => template.worshipSongIds?.[idx] || undefined);

    setPraiseSongs(pSongs);
    setWorshipSongs(wSongs);
    setPraiseSongKeys(pKeys);
    setWorshipSongKeys(wKeys);
    setPraiseSongIds(pIds);
    setWorshipSongIds(wIds);

    // 2. Set service type if specified
    if (template.serviceType) {
      setServiceType(template.serviceType);
    }

    // 3. Ministry rows (synced to Song Leader layout rules)
    if (template.ministryAssignments && template.ministryAssignments.length > 0) {
      const rows = template.ministryAssignments.map((a, idx) => ({
        id: a.id || `m-row-tpl-${idx}-${Date.now()}`,
        role: a.role,
        assignedMembers:
          options.includeMembers && a.assignedMembers && a.assignedMembers.length > 0
            ? a.assignedMembers.map((m) => ({ ...m }))
            : [{ memberId: '', memberName: '' }],
        notes: a.notes || ''
      }));
      setMinistryRows(syncMinistryRowsForSongLeaders(rows));
    } else if (template.ministryRoles && template.ministryRoles.length > 0) {
      const rows = template.ministryRoles.map((roleName, idx) => ({
        id: `m-row-tpl-${idx}-${Date.now()}`,
        role: roleName,
        assignedMembers: [{ memberId: '', memberName: '' }],
        notes: ''
      }));
      setMinistryRows(syncMinistryRowsForSongLeaders(rows));
    }

    // 4. Reset notes & transitions unconditionally so stale prior-draft values never bleed through
    setServiceNotes(template.notes || '');
    setTransitionNotes(template.transitionNotes ? { ...template.transitionNotes } : {});

    // 5. Reset rehearsal checklist for the newly applied template
    setRehearsalChecklist(getDefaultRehearsalChecklist());

    showToast(`Template "${template.name}" applied as active draft!`, 'success');
  }, [getDefaultRehearsalChecklist, takeSnapshot, showToast]);

  const lineupDurationSummary = useMemo(() => {
    const cleanP = praiseSongs.map((s, idx) => ({ title: s.trim(), origIdx: idx })).filter((x) => Boolean(x.title));
    const cleanW = worshipSongs.map((s, idx) => ({ title: s.trim(), origIdx: idx })).filter((x) => Boolean(x.title));
    const allTitles = [...cleanP.map((p) => p.title), ...cleanW.map((w) => w.title)];
    const allIds = [
      ...cleanP.map((p) => resolveSlotSong(p.title, praiseSongIds[p.origIdx], allSongs).song?.id),
      ...cleanW.map((w) => resolveSlotSong(w.title, worshipSongIds[w.origIdx], allSongs).song?.id)
    ];
    return calculateLineupDuration(allTitles, allIds, allSongs);
  }, [praiseSongs, worshipSongs, praiseSongIds, worshipSongIds, allSongs]);

  interface LineupTransitionItem {
    id: string;
    section: 'praise' | 'worship' | 'cross_section';
    fromIdx: number;
    toIdx: number;
    sectionLabel: string;
    fromSong: string;
    toSong: string;
    fromSongId?: string;
    toSongId?: string;
    fromKey?: string;
    toKey?: string;
    fromBpm?: number;
    toBpm?: number;
    fromTimeSig?: string;
    toTimeSig?: string;
    keyTransitionDesc: string;
  }

  const lineupTransitions = useMemo((): LineupTransitionItem[] => {
    const transitions: LineupTransitionItem[] = [];

    const cleanPraise: { title: string; key: string; origIdx: number; songId?: string }[] = [];
    praiseSongs.forEach((s, idx) => {
      if (s && s.trim()) {
        const slotId = praiseSongIds[idx];
        cleanPraise.push({ title: s.trim(), key: (praiseSongKeys[idx] || '').trim(), origIdx: idx, songId: slotId });
      }
    });

    const cleanWorship: { title: string; key: string; origIdx: number; songId?: string }[] = [];
    worshipSongs.forEach((s, idx) => {
      if (s && s.trim()) {
        const slotId = worshipSongIds[idx];
        cleanWorship.push({ title: s.trim(), key: (worshipSongKeys[idx] || '').trim(), origIdx: idx, songId: slotId });
      }
    });

    const findSong = (title: string, slotId?: string) => resolveSlotSong(title, slotId, allSongs).song;

    // 1. Praise internal transitions
    for (let i = 0; i < cleanPraise.length - 1; i++) {
      const from = cleanPraise[i];
      const to = cleanPraise[i + 1];
      const mFrom = findSong(from.title, from.songId);
      const mTo = findSong(to.title, to.songId);
      const effectiveFromKey = from.key;
      const effectiveToKey = to.key;

      transitions.push({
        id: getTransitionPairId('praise', from.title, to.title, from.songId, to.songId),
        section: 'praise',
        fromIdx: i,
        toIdx: i + 1,
        sectionLabel: `Praise ${i + 1} → Praise ${i + 2}`,
        fromSong: from.title,
        toSong: to.title,
        fromSongId: from.songId,
        toSongId: to.songId,
        fromKey: effectiveFromKey,
        toKey: effectiveToKey,
        fromBpm: mFrom?.bpm,
        toBpm: mTo?.bpm,
        fromTimeSig: mFrom?.timeSignature,
        toTimeSig: mTo?.timeSignature,
        keyTransitionDesc: describeKeyTransition(effectiveFromKey, effectiveToKey)
      });
    }

    // 2. Cross-section transition: Last Praise -> First Worship
    if (cleanPraise.length > 0 && cleanWorship.length > 0) {
      const from = cleanPraise[cleanPraise.length - 1];
      const to = cleanWorship[0];
      const mFrom = findSong(from.title, from.songId);
      const mTo = findSong(to.title, to.songId);
      const effectiveFromKey = from.key;
      const effectiveToKey = to.key;

      transitions.push({
        id: 'cross_section',
        section: 'cross_section',
        fromIdx: cleanPraise.length - 1,
        toIdx: 0,
        sectionLabel: 'Praise Final → Worship Start (Prayer / Exhortation)',
        fromSong: from.title,
        toSong: to.title,
        fromSongId: from.songId,
        toSongId: to.songId,
        fromKey: effectiveFromKey,
        toKey: effectiveToKey,
        fromBpm: mFrom?.bpm,
        toBpm: mTo?.bpm,
        fromTimeSig: mFrom?.timeSignature,
        toTimeSig: mTo?.timeSignature,
        keyTransitionDesc: describeKeyTransition(effectiveFromKey, effectiveToKey)
      });
    }

    // 3. Worship internal transitions
    for (let i = 0; i < cleanWorship.length - 1; i++) {
      const from = cleanWorship[i];
      const to = cleanWorship[i + 1];
      const mFrom = findSong(from.title, from.songId);
      const mTo = findSong(to.title, to.songId);
      const effectiveFromKey = from.key;
      const effectiveToKey = to.key;

      transitions.push({
        id: getTransitionPairId('worship', from.title, to.title, from.songId, to.songId),
        section: 'worship',
        fromIdx: i,
        toIdx: i + 1,
        sectionLabel: `Worship ${i + 1} → Worship ${i + 2}`,
        fromSong: from.title,
        toSong: to.title,
        fromSongId: from.songId,
        toSongId: to.songId,
        fromKey: effectiveFromKey,
        toKey: effectiveToKey,
        fromBpm: mFrom?.bpm,
        toBpm: mTo?.bpm,
        fromTimeSig: mFrom?.timeSignature,
        toTimeSig: mTo?.timeSignature,
        keyTransitionDesc: describeKeyTransition(effectiveFromKey, effectiveToKey)
      });
    }

    return transitions;
  }, [praiseSongs, praiseSongKeys, praiseSongIds, worshipSongs, worshipSongKeys, worshipSongIds, allSongs]);

  return (
    <div data-tour="scheduler-view" className="space-y-6 max-w-5xl mx-auto pb-36 sm:pb-40 animate-in fade-in duration-300">
      {/* Title Header */}
      <div className="p-5 sm:p-6 rounded-2xl wwcf-glass-card shadow-xs flex flex-wrap items-center justify-between gap-4">
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
                A saved {isNoServiceSchedule(existingMatchingSched) ? 'No Service record' : 'lineup'} already exists for <strong>{existingMatchingSched.serviceType}</strong> on <strong>{existingMatchingSched.serviceDate}</strong>. Your active draft remains intact.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                loadScheduleDataIntoEditor(existingMatchingSched);
                showToast(`Loaded existing ${isNoServiceSchedule(existingMatchingSched) ? 'No Service record' : 'lineup'} for ${existingMatchingSched.serviceDate}`, 'info');
              }}
              className="px-3 py-1 font-semibold text-amber-900 dark:text-amber-100 bg-amber-200/80 dark:bg-amber-900/60 hover:bg-amber-300 dark:hover:bg-amber-800 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              Load Existing Schedule
            </button>
          </div>
        );
      })()}

      {/* 1. Service Details Section */}
      <div className="p-6 rounded-2xl wwcf-surface-hero border border-slate-200/80 dark:border-white/10 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/60 dark:border-white/10">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Church className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
            <span>Service Details & Context</span>
          </h3>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
              noService
                ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700'
                : 'bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2] border-[#1b75bc]/20'
            }`}
          >
            {noService && <Ban className="w-3 h-3 shrink-0" />}
            <span>
              {noService ? 'No Service • ' : ''}
              {serviceType} • {serviceDate ? formatDateDisplayManila(serviceDate, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date set'}
            </span>
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
                  { value: 'Youth Fellowship', label: 'Youth Fellowship' },
                  { value: 'Worship Event', label: 'Worship Event' }
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

        {/* Explicit No Service Toggle & Reason (NS-01) */}
        <div
          className={`p-4 rounded-xl border transition-colors ${
            noService
              ? 'bg-slate-100/90 dark:bg-slate-900/80 border-slate-300 dark:border-slate-700'
              : 'bg-white/50 dark:bg-black/20 border-slate-200/80 dark:border-white/10'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  noService
                    ? 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                <Ban className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  No Service Status
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  Mark this date as having no regular worship service (clears songs, assignments, and transitions while preserving Service Notes).
                </p>
              </div>
            </div>

            <label
              htmlFor="scheduler-no-service-checkbox"
              className={`inline-flex items-center justify-center gap-2.5 px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold border transition-colors cursor-pointer shrink-0 select-none focus-within:ring-2 focus-within:ring-[#1b75bc]/50 ${
                noService
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <input
                id="scheduler-no-service-checkbox"
                type="checkbox"
                checked={noService}
                onChange={(e) => handleToggleNoService(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-[#1b75bc] focus:ring-[#1b75bc] cursor-pointer accent-[#1b75bc]"
              />
              <span>No Service</span>
            </label>
          </div>

          {noService && (
            <div className="mt-3.5 pt-3.5 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
              <label
                htmlFor="no-service-reason-input"
                className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300"
              >
                <span>Reason / Announcement (Optional)</span>
                <span className="text-[11px] font-normal normal-case text-slate-400 dark:text-slate-500">
                  {noServiceReason.length}/{NO_SERVICE_REASON_MAX_LENGTH}
                </span>
              </label>
              <input
                id="no-service-reason-input"
                type="text"
                maxLength={NO_SERVICE_REASON_MAX_LENGTH}
                value={noServiceReason}
                onChange={(e) => {
                  takeSnapshot(false);
                  setNoServiceReason(e.target.value);
                }}
                placeholder="e.g., Church Anniversary Combined Service, Camp Retreat, Holiday Break..."
                className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-[#1b75bc]/40 focus:border-[#1b75bc] outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {noService ? (
        <div className="p-6 sm:p-8 rounded-2xl wwcf-glass-card border border-slate-200/80 dark:border-slate-800 shadow-xs text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300">
            <Ban className="w-6 h-6" />
          </div>
          <div className="space-y-1.5 max-w-lg mx-auto">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              No Service Scheduled for {formatDateDisplayManila(serviceDate, { month: 'long', day: 'numeric', year: 'numeric' })}
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              This <strong>{serviceType}</strong> date is marked as <strong>No Service</strong>. Song lineup slots, team assignments, transitions, and the rehearsal checklist are omitted and will not count toward song usage or analytics.
            </p>
            {noServiceReason.trim() && (
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/70 px-3 py-1.5 rounded-lg inline-block mt-1">
                Reason: {noServiceReason.trim()}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => handleToggleNoService(false)}
              className="btn-tactile inline-flex items-center gap-2 px-4 py-2 min-h-[40px] text-xs font-bold text-[#1b75bc] dark:text-[#54b0e2] bg-[#1b75bc]/10 hover:bg-[#1b75bc]/20 border border-[#1b75bc]/25 rounded-xl transition-colors cursor-pointer"
            >
              <Music className="w-3.5 h-3.5" />
              <span>Resume Lineup Planning</span>
            </button>
          </div>
        </div>
      ) : (
        <>
      {/* Smart Song Recommendations Panel */}
      <SongRecommendationsPanel
        allSongs={allSongs}
        schedules={schedules}
        currentPraiseSongs={praiseSongs}
        currentWorshipSongs={worshipSongs}
        currentPraiseSongIds={praiseSongIds}
        currentWorshipSongIds={worshipSongIds}
        serviceDate={serviceDate}
        serviceType={serviceType}
        onAddSong={handleAddRecommendedSong}
        onOpenNewSongModal={() => setIsSongFormOpen(true)}
      />

      {/* 2. Song List Section */}
      <div data-tour="add-songs-section" className="p-6 rounded-2xl wwcf-glass-card shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200/60 dark:border-white/5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Music className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
              <span>Worship & Praise Songs</span>
            </h3>

            {/* S-01 Estimated Duration Badge */}
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2] border border-[#1b75bc]/20 shadow-2xs"
              title="Estimated total setlist music duration based on known songs"
            >
              <Clock className="w-3.5 h-3.5 text-[#1b75bc] dark:text-[#54b0e2]" />
              <span>Est. Setlist: {lineupDurationSummary.summaryLabel}</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsTemplatesModalOpen(true)}
              className="px-3 py-1.5 bg-[#1b75bc]/10 hover:bg-[#1b75bc]/20 text-[#1b75bc] dark:text-[#54b0e2] border border-[#1b75bc]/25 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Browse, apply, or create reusable lineup presets"
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
              <span>Templates</span>
            </button>

            <button
              type="button"
              onClick={() => setIsPrompterOpen(true)}
              disabled={noService}
              className="px-3 py-1.5 bg-slate-900 hover:bg-black text-white dark:bg-white/10 dark:hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Launch stage-friendly live rehearsal prompter"
            >
              <Tv className="w-3.5 h-3.5 text-amber-400" />
              <span>Live Prompter</span>
            </button>

            <button
              type="button"
              onClick={() => setIsLyricsPresentationOpen(true)}
              disabled={noService}
              className="px-3 py-1.5 bg-[#1b75bc] hover:bg-[#155d97] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Open dual-window Lyrics Presenter & Audience Output console"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Present Lyrics</span>
            </button>

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
              className="btn-tactile px-3 py-1.5 bg-white dark:bg-[#11161e] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <Youtube className="w-4 h-4 text-rose-600 dark:text-rose-400" />
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
                  className="text-[#1b75bc] dark:text-[#54b0e2] text-xs font-bold hover:underline flex items-center gap-1 cursor-pointer"
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
                        if ((e.target as HTMLElement).closest('input, select, textarea, button, a, [role="button"]')) {
                          setActiveDragHandle(null);
                        }
                      }}
                      className={`group flex flex-col gap-2 p-2.5 sm:p-2.5 bg-white dark:bg-slate-900 rounded-xl border transition-all ${
                        isBeingDragged
                          ? 'opacity-40 border-dashed border-amber-400 dark:border-amber-500 scale-[0.99]'
                          : 'border-slate-200 dark:border-slate-800 shadow-2xs'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
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
                              onChange={(val, selectedSong) => handlePraiseChange(idx, val, selectedSong)}
                              category="praise"
                              serviceDate={serviceDate}
                              serviceType={serviceType}
                              allSongs={allSongs}
                              schedules={schedules}
                              currentLineupSongs={[...praiseSongs, ...worshipSongs]}
                              currentLineupSongIds={[...praiseSongIds, ...worshipSongIds]}
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
                              className="w-full px-2 py-1.5 text-xs font-bold text-[#1b75bc] dark:text-[#54b0e2] bg-[#f0f7fc] dark:bg-[#0f2b44] border border-[#1b75bc]/30 dark:border-[#54b0e2]/30 rounded-lg outline-none focus:ring-2 focus:ring-[#1b75bc]/25 text-center"
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
                              className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] bg-slate-50 dark:bg-slate-800/50 sm:bg-transparent rounded transition-colors cursor-pointer"
                              title="Move Up"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSongDown('praise', idx)}
                              className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] bg-slate-50 dark:bg-slate-800/50 sm:bg-transparent rounded transition-colors cursor-pointer"
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

                      {/* S-03 Compact Song Information Strip & S-02 External Quick Links */}
                      {(() => {
                        const slotId = praiseSongIds[idx];
                        const slotResolved = resolveSlotSong(song, slotId, allSongs);
                        const matched = slotResolved.song;
                        if (!matched && !song.trim()) return null;
                        const links = getSongReferenceLinks(matched);
                        const performedKey = (praiseSongKeys[idx] || '').trim();
                        const origKey = matched?.originalKey || matched?.key;
                        const lyricsReady = matched ? hasUsableLyrics(matched.lyrics) : false;
                        const usableCharts = matched
                          ? (matched.instrumentCharts || []).filter((c) => c && typeof c.content === 'string' && c.content.trim().length > 0)
                          : [];

                        return (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1.5 mt-0.5 border-t border-slate-100 dark:border-slate-800 text-[11px] w-full">
                            {performedKey ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2] border border-[#1b75bc]/20">
                                <span>Performed Key: {performedKey}</span>
                                {origKey && origKey.toLowerCase() !== performedKey.toLowerCase() && (
                                  <span className="text-[10px] font-normal opacity-75">(Orig: {origKey})</span>
                                )}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700">
                                <span>Performed key not set</span>
                                {origKey && (
                                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">(Orig: {origKey})</span>
                                )}
                              </span>
                            )}
                            {matched?.bpm ? (
                              <span className="px-2 py-0.5 rounded-md font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                {matched.bpm} BPM
                              </span>
                            ) : null}
                            {matched?.timeSignature ? (
                              <span className="px-2 py-0.5 rounded-md font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                {matched.timeSignature}
                              </span>
                            ) : null}
                            {matched?.duration ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                <Clock className="w-3 h-3 text-slate-400" />
                                <span>{matched.duration}</span>
                              </span>
                            ) : null}

                            {matched ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setEditingSongForLyrics(matched)}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[10px] border transition-colors cursor-pointer ${
                                    lyricsReady
                                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                                  }`}
                                  title={lyricsReady ? 'View or edit song lyrics' : 'Missing lyrics — click to add lyrics to catalog song'}
                                >
                                  <BookOpen className="w-3 h-3 shrink-0" />
                                  <span>{lyricsReady ? 'Lyrics Ready · Edit' : 'Missing Lyrics · Add'}</span>
                                </button>
                                {usableCharts.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setChartPreviewTarget({
                                        song: matched,
                                        performedKey: performedKey || undefined,
                                        sectionLabel: `Praise Song ${idx + 1}`
                                      })
                                    }
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[10px] border bg-[#1b75bc]/10 dark:bg-[#1b75bc]/20 text-[#1b75bc] dark:text-[#54b0e2] border-[#1b75bc]/25 hover:bg-[#1b75bc]/20 dark:hover:bg-[#1b75bc]/30 transition-colors cursor-pointer"
                                    title={`Open chord & cue charts (${usableCharts.map((c) => CHART_INSTRUMENT_LABELS[c.instrument]).join(', ')})`}
                                  >
                                    <Guitar className="w-3 h-3 shrink-0" />
                                    <span>Charts ({usableCharts.length})</span>
                                  </button>
                                )}
                              </>
                            ) : slotResolved.isAmbiguous ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>Ambiguous song match</span>
                              </span>
                            ) : slotResolved.isStaleId ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium text-[10px] bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>Catalog song not found</span>
                              </span>
                            ) : null}

                            {/* Reference Links */}
                            {links.map((link) => (
                              <a
                                key={link.service}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[10px] border transition-colors cursor-pointer ${link.colorClass}`}
                                title={`Open ${link.label}`}
                              >
                                <span>{link.label}</span>
                                <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                              </a>
                            ))}
                          </div>
                        );
                      })()}
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
                ? 'bg-[#f0f7fc]/80 dark:bg-[#0f2b44]/40 border-[#1b75bc]/60 dark:border-[#54b0e2]/50 ring-2 ring-[#1b75bc]/20 shadow-sm'
                : draggedItem && draggedItem.category !== 'worship'
                ? 'border-dashed border-[#1b75bc]/50 dark:border-[#54b0e2]/40 bg-slate-50/50 dark:bg-[#0b0e13]/60'
                : 'bg-slate-50/50 dark:bg-[#0b0e13]/60 border-slate-200 dark:border-white/10'
            }`}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Heart className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2] fill-[#1b75bc]/20" />
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
                  className="text-rose-600 dark:text-rose-400 text-xs font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  title="Import worship song or playlist from YouTube URL"
                >
                  <Youtube className="w-3.5 h-3.5" />
                  <span>Import</span>
                </button>
                <button
                  type="button"
                  onClick={addWorshipSong}
                  className="text-[#1b75bc] dark:text-[#54b0e2] text-xs font-bold hover:underline flex items-center gap-1 cursor-pointer"
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
                  className="py-6 px-4 rounded-xl border border-dashed border-[#1b75bc]/40 dark:border-[#54b0e2]/35 text-center flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400 bg-[#f0f7fc]/60 dark:bg-[#0f2b44]/30"
                >
                  <p className="text-xs font-medium">No worship songs currently added.</p>
                  <button
                    type="button"
                    onClick={addWorshipSong}
                    className="btn-tactile inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#1b75bc] dark:text-[#54b0e2] bg-[#1b75bc]/10 dark:bg-[#1b75bc]/20 hover:bg-[#1b75bc]/20 dark:hover:bg-[#1b75bc]/30 rounded-lg transition-colors cursor-pointer"
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
                        <div className="w-2 h-2 rounded-full bg-[#1b75bc] shrink-0" />
                        <div className="h-0.5 w-full bg-[#1b75bc] dark:bg-[#54b0e2] rounded-full" />
                      </div>
                    )}

                    <div
                      draggable={activeDragHandle?.category === 'worship' && activeDragHandle?.index === idx}
                      onDragStart={(e) => handleDragStart(e, 'worship', idx)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleItemDragOver(e, 'worship', idx)}
                      onDrop={(e) => handleItemDrop(e, 'worship', idx)}
                      onPointerDown={(e) => {
                        if ((e.target as HTMLElement).closest('input, select, textarea, button, a, [role="button"]')) {
                          setActiveDragHandle(null);
                        }
                      }}
                      className={`group flex flex-col gap-2 p-2.5 sm:p-2.5 bg-white dark:bg-[#11161e] rounded-xl border transition-all ${
                        isBeingDragged
                          ? 'opacity-40 border-dashed border-[#1b75bc] dark:border-[#54b0e2] scale-[0.99]'
                          : 'border-slate-200 dark:border-white/10 shadow-2xs'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        {/* Top Row on Mobile: Drag, Index, Autocomplete */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {/* Drag Handle */}
                          <div
                            onMouseDown={() => setActiveDragHandle({ category: 'worship', index: idx })}
                            onTouchStart={() => setActiveDragHandle({ category: 'worship', index: idx })}
                            className="cursor-grab active:cursor-grabbing text-slate-400 dark:text-slate-500 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] hover:bg-slate-100 dark:hover:bg-white/5 p-1.5 rounded transition-colors shrink-0 select-none"
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
                              onChange={(val, selectedSong) => handleWorshipChange(idx, val, selectedSong)}
                              category="worship"
                              serviceDate={serviceDate}
                              serviceType={serviceType}
                              allSongs={allSongs}
                              schedules={schedules}
                              currentLineupSongs={[...praiseSongs, ...worshipSongs]}
                              currentLineupSongIds={[...praiseSongIds, ...worshipSongIds]}
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
                              className="w-full px-2 py-1.5 text-xs font-bold text-[#1b75bc] dark:text-[#54b0e2] bg-[#f0f7fc] dark:bg-[#0f2b44] border border-[#1b75bc]/30 dark:border-[#54b0e2]/30 rounded-lg outline-none focus:ring-2 focus:ring-[#1b75bc]/25 text-center"
                            />
                          </div>

                          {/* Category Switcher */}
                          <select
                            value="worship"
                            onChange={(e) =>
                              changeSongCategory('worship', idx, e.target.value as 'praise' | 'worship')
                            }
                            className="text-[11px] font-semibold py-1.5 px-2 rounded-lg border border-[#1b75bc]/30 dark:border-[#54b0e2]/30 bg-[#f0f7fc] dark:bg-[#0f2b44] text-[#1b75bc] dark:text-[#54b0e2] outline-none cursor-pointer shrink-0"
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
                              className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] bg-slate-50 dark:bg-slate-800/50 sm:bg-transparent rounded transition-colors cursor-pointer"
                              title="Move Up"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSongDown('worship', idx)}
                              className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] bg-slate-50 dark:bg-slate-800/50 sm:bg-transparent rounded transition-colors cursor-pointer"
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

                      {/* S-03 Compact Song Information Strip & S-02 External Quick Links */}
                      {(() => {
                        const slotId = worshipSongIds[idx];
                        const slotResolved = resolveSlotSong(song, slotId, allSongs);
                        const matched = slotResolved.song;
                        if (!matched && !song.trim()) return null;
                        const links = getSongReferenceLinks(matched);
                        const performedKey = (worshipSongKeys[idx] || '').trim();
                        const origKey = matched?.originalKey || matched?.key;
                        const lyricsReady = matched ? hasUsableLyrics(matched.lyrics) : false;
                        const usableCharts = matched
                          ? (matched.instrumentCharts || []).filter((c) => c && typeof c.content === 'string' && c.content.trim().length > 0)
                          : [];

                        return (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1.5 mt-0.5 border-t border-slate-100 dark:border-slate-800 text-[11px] w-full">
                            {performedKey ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2] border border-[#1b75bc]/20">
                                <span>Performed Key: {performedKey}</span>
                                {origKey && origKey.toLowerCase() !== performedKey.toLowerCase() && (
                                  <span className="text-[10px] font-normal opacity-75">(Orig: {origKey})</span>
                                )}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700">
                                <span>Performed key not set</span>
                                {origKey && (
                                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">(Orig: {origKey})</span>
                                )}
                              </span>
                            )}
                            {matched?.bpm ? (
                              <span className="px-2 py-0.5 rounded-md font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                {matched.bpm} BPM
                              </span>
                            ) : null}
                            {matched?.timeSignature ? (
                              <span className="px-2 py-0.5 rounded-md font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                {matched.timeSignature}
                              </span>
                            ) : null}
                            {matched?.duration ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                <Clock className="w-3 h-3 text-slate-400" />
                                <span>{matched.duration}</span>
                              </span>
                            ) : null}

                            {matched ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setEditingSongForLyrics(matched)}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[10px] border transition-colors cursor-pointer ${
                                    lyricsReady
                                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                                  }`}
                                  title={lyricsReady ? 'View or edit song lyrics' : 'Missing lyrics — click to add lyrics to catalog song'}
                                >
                                  <BookOpen className="w-3 h-3 shrink-0" />
                                  <span>{lyricsReady ? 'Lyrics Ready · Edit' : 'Missing Lyrics · Add'}</span>
                                </button>
                                {usableCharts.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setChartPreviewTarget({
                                        song: matched,
                                        performedKey: performedKey || undefined,
                                        sectionLabel: `Worship Song ${idx + 1}`
                                      })
                                    }
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[10px] border bg-[#1b75bc]/10 dark:bg-[#1b75bc]/20 text-[#1b75bc] dark:text-[#54b0e2] border-[#1b75bc]/25 hover:bg-[#1b75bc]/20 dark:hover:bg-[#1b75bc]/30 transition-colors cursor-pointer"
                                    title={`Open chord & cue charts (${usableCharts.map((c) => CHART_INSTRUMENT_LABELS[c.instrument]).join(', ')})`}
                                  >
                                    <Guitar className="w-3 h-3 shrink-0" />
                                    <span>Charts ({usableCharts.length})</span>
                                  </button>
                                )}
                              </>
                            ) : slotResolved.isAmbiguous ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>Ambiguous song match</span>
                              </span>
                            ) : slotResolved.isStaleId ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium text-[10px] bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>Catalog song not found</span>
                              </span>
                            ) : null}

                            {/* Reference Links */}
                            {links.map((link) => (
                              <a
                                key={link.service}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[10px] border transition-colors cursor-pointer ${link.colorClass}`}
                                title={`Open ${link.label}`}
                              >
                                <span>{link.label}</span>
                                <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                              </a>
                            ))}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Insertion line indicator below item */}
                    {isDropTargetAfter && (
                      <div className="flex items-center gap-2 py-0.5 -my-1 pointer-events-none">
                        <div className="w-2 h-2 rounded-full bg-[#1b75bc] shrink-0" />
                        <div className="h-0.5 w-full bg-[#1b75bc] dark:bg-[#54b0e2] rounded-full" />
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
                      ? 'border-[#1b75bc] bg-[#f0f7fc]/80 dark:bg-[#0f2b44]/60 text-[#1b75bc] dark:text-[#54b0e2] font-bold'
                      : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-[#1b75bc]/60'
                  }`}
                >
                  <span>Drop here to add as last Worship song</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Setlist Flow & Tempo Dynamics Curve (L-04) */}
      <TempoDynamicsCurve
        praiseSongs={praiseSongs}
        worshipSongs={worshipSongs}
        praiseSongKeys={praiseSongKeys}
        worshipSongKeys={worshipSongKeys}
        praiseSongIds={praiseSongIds}
        worshipSongIds={worshipSongIds}
        allSongs={allSongs}
        transitionNotes={transitionNotes}
      />

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
            <button
              type="button"
              onClick={() => setIsAvailabilityModalOpen(true)}
              className="px-2.5 py-1 text-xs font-bold text-[#1b75bc] dark:text-[#54b0e2] bg-[#1b75bc]/10 hover:bg-[#1b75bc]/20 border border-[#1b75bc]/25 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="View and edit team roster availability for this service date"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Team Availability</span>
            </button>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isSmartFilter}
                onChange={(e) => setIsSmartFilter(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#1b75bc] focus:ring-[#1b75bc] accent-[#1b75bc] cursor-pointer"
              />
              <Filter className="w-3.5 h-3.5 text-[#1b75bc] dark:text-[#54b0e2]" />
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
                className="p-4 rounded-xl bg-slate-50/80 dark:bg-[#0b0e13]/70 border border-slate-200/80 dark:border-white/10 space-y-3 transition-all hover:border-slate-300 dark:hover:border-white/20"
              >
                {/* Top Row: Role Name, Delete */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={row.role}
                      onChange={(e) => handleMinistryRoleChange(row.id, e.target.value)}
                      placeholder="Ministry Role (e.g. Song Leader (Praise), Backup Singer/s)"
                      className="w-full px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#11161e] text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#1b75bc]/25 focus:border-[#1b75bc] outline-none"
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
                <div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-white/10">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                    <span>Assigned Member(s) ({currentAssigned.length})</span>
                    {!hideAddMemberButton && (
                      <button
                        type="button"
                        onClick={() => handleAddMemberToMinistry(row.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1b75bc] dark:text-[#54b0e2] hover:underline transition-colors cursor-pointer"
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

                        let selectableMembers = availableMembersForRole.filter((m) => {
                          if (assignedElsewhereIds.has(m.id)) return false;
                          // Exclude members under DA on this service date from new selection
                          if (m.id !== am.memberId && isMemberUnderDisciplinary(m, serviceDate)) {
                            return false;
                          }
                          return true;
                        });

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

                                      const avail = AvailabilityService.getAvailability(m.id, serviceDate, serviceType);
                                      const isUnavailable = avail?.status === 'unavailable';
                                      const isMaybe = avail?.status === 'maybe';
                                      const availBadge = isUnavailable
                                        ? `Unavailable${avail.note ? `: ${avail.note}` : ''}`
                                        : isMaybe
                                        ? `Maybe${avail.note ? `: ${avail.note}` : ''}`
                                        : undefined;

                                      const accessibleLabel = isDA
                                        ? `${m.name}. Disciplinary Action. ${endDate ? `Ends ${formatDateDisplayManila(endDate)}` : 'Active'}.`
                                        : isUnavailable
                                        ? `${m.name}. Marked Unavailable on ${serviceDate}.`
                                        : m.name;

                                      const descParts: string[] = [];
                                      if (daBadge) descParts.push(`⚠ ${daBadge}`);
                                      if (availBadge) descParts.push(`🗓 ${availBadge}`);
                                      const tagsStr = sortTags(m.labels).join(', ');
                                      if (tagsStr) descParts.push(tagsStr);

                                      return {
                                        value: m.id,
                                        label: m.name,
                                        isWarning: isDA || isUnavailable,
                                        warningBadge: daBadge || (isUnavailable ? availBadge : undefined),
                                        accessibleLabel,
                                        description: descParts.join(' • ')
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

                            {/* Warning Indicator for Unavailable Member in Lineup */}
                            {!isAssignedMemberDA && assignedMemberObj && (() => {
                              const assignedAvail = AvailabilityService.getAvailability(assignedMemberObj.id, serviceDate, serviceType);
                              if (assignedAvail?.status !== 'unavailable') return null;
                              return (
                                <div
                                  role="status"
                                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 text-xs font-semibold animate-in fade-in"
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
                                    <span className="truncate">
                                      <span className="font-bold">{assignedMemberObj.name}</span>
                                      <span className="mx-1 text-amber-400 dark:text-amber-600">•</span>
                                      <span className="font-normal text-amber-800 dark:text-amber-300">
                                        Marked Unavailable {assignedAvail.note ? `("${assignedAvail.note}")` : ''}
                                      </span>
                                    </span>
                                  </div>
                                  <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-amber-200/70 dark:bg-amber-900/70 text-amber-800 dark:text-amber-200 font-bold uppercase tracking-wider">
                                    Override
                                  </span>
                                </div>
                              );
                            })()}
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
            className="btn-tactile inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#1b75bc] dark:text-[#54b0e2] bg-[#f0f7fc] dark:bg-[#0f2b44] hover:bg-[#1b75bc]/15 dark:hover:bg-[#1b75bc]/25 border border-[#1b75bc]/20 dark:border-[#54b0e2]/25 rounded-xl transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Custom Ministry Role</span>
          </button>
        </div>
      </div>

      {/* 4. Song Transitions & Flow Section (S-04) */}
      <div className="p-6 rounded-2xl wwcf-glass-card shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-white/5">
          <div className="flex items-center gap-2">
            <Shuffle className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Song Transitions & Musical Flow ({lineupTransitions.length})
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setIsTransitionsOpen(!isTransitionsOpen)}
            className="text-xs font-semibold text-[#1b75bc] dark:text-[#54b0e2] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>{isTransitionsOpen ? 'Collapse' : 'Expand Flow'}</span>
            {isTransitionsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {isTransitionsOpen && (
          <div className="space-y-3">
            {lineupTransitions.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-3 text-center italic">
                Add at least two songs to review harmonic transitions, tempo shifts, and enter transition cues for the band.
              </p>
            ) : (
              lineupTransitions.map((trans) => (
                <div
                  key={trans.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      {trans.sectionLabel}
                    </span>
                    <span className="text-xs font-bold text-[#1b75bc] dark:text-[#54b0e2] bg-[#1b75bc]/10 px-2 py-0.5 rounded-md">
                      {trans.keyTransitionDesc}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-800 dark:text-slate-200">
                    <span className="font-bold truncate">{trans.fromSong}</span>
                    <span className="text-slate-400">
                      ({trans.fromKey || 'Performed key not set'}
                      {trans.fromBpm ? ` • ${trans.fromBpm} BPM` : ''}
                      {trans.fromTimeSig ? ` • ${trans.fromTimeSig}` : ''})
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0 mx-1" />
                    <span className="font-bold truncate">{trans.toSong}</span>
                    <span className="text-slate-400">
                      ({trans.toKey || 'Performed key not set'}
                      {trans.toBpm ? ` • ${trans.toBpm} BPM` : ''}
                      {trans.toTimeSig ? ` • ${trans.toTimeSig}` : ''})
                    </span>
                  </div>

                  <div>
                    <input
                      type="text"
                      value={resolveTransitionNote(
                        transitionNotes,
                        trans.section,
                        trans.fromIdx,
                        trans.toIdx,
                        trans.fromSong,
                        trans.toSong,
                        trans.fromSongId,
                        trans.toSongId
                      )}
                      onChange={(e) => {
                        takeSnapshot(false);
                        const updated = { ...transitionNotes, [trans.id]: e.target.value };
                        setTransitionNotes(updated);
                        invalidateTransitionCueChanges();
                      }}
                      placeholder="Transition cue (e.g., Acoustic strumming carries over, Prayer before first chorus, Key modulation +2 semitones)..."
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-[#1b75bc]"
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
        </>
      )}

      {/* 5. Service Notes & Instructions Section (S-00) */}
      <div className="p-6 rounded-2xl wwcf-glass-card shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-white/5">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Service Notes & Order of Service Instructions
            </h3>
          </div>
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
            {serviceNotes.length} characters • Included in PDF, PNG & Service Brief
          </span>
        </div>

        <div>
          <label htmlFor="service-notes-textarea" className="sr-only">
            Service Notes and Instructions
          </label>
          <textarea
            id="service-notes-textarea"
            rows={4}
            value={serviceNotes}
            onChange={(e) => {
              takeSnapshot(false);
              setServiceNotes(e.target.value);
              invalidateTransitionCueChanges();
            }}
            placeholder="Enter instructions for the worship team, order of service cues, arrival times (e.g. Call time 8:30 AM for soundcheck & prayer), pastoral notes, special prayer segments, or AV/tech reminders..."
            className="w-full p-3.5 text-xs sm:text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#1b75bc]/40 resize-y"
          />
        </div>
      </div>

      {/* 6. Rehearsal Readiness Checklist Section (S-06) */}
      {!noService && (
      <div className="p-6 rounded-2xl wwcf-glass-card shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-white/5">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Rehearsal Readiness Checklist
            </h3>
          </div>

          <div className="flex items-center gap-3">
            {(() => {
              const items = [
                rehearsalChecklist.songSelectionFinalized,
                rehearsalChecklist.performedKeysChecked,
                rehearsalChecklist.lyricsReviewed,
                rehearsalChecklist.referencesChecked,
                rehearsalChecklist.teamAssignmentsFinalized,
                rehearsalChecklist.transitionsPrepared
              ];
              const completedCount = items.filter((v) => v === true).length;
              const isAllReady = completedCount === 6;

              return (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    isAllReady
                      ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {isAllReady ? <Check className="w-3.5 h-3.5" /> : null}
                  <span>{completedCount} of 6 Ready{isAllReady ? ' — Ready for Rehearsal!' : ''}</span>
                </span>
              );
            })()}

            <button
              type="button"
              onClick={() => setIsChecklistOpen(!isChecklistOpen)}
              className="text-xs font-semibold text-[#1b75bc] dark:text-[#54b0e2] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>{isChecklistOpen ? 'Collapse' : 'Expand'}</span>
              {isChecklistOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {isChecklistOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {[
              {
                key: 'songSelectionFinalized' as const,
                label: 'Song selection finalized (Praise & Worship)',
                desc: 'Praise and worship songs selected, ordered, and ready for service.'
              },
              {
                key: 'performedKeysChecked' as const,
                label: 'Performed keys confirmed with vocalists & band',
                desc: 'Keys confirmed for song leader vocal range and band arrangement.'
              },
              {
                key: 'lyricsReviewed' as const,
                label: 'Lyrics & arrangement verified for projection',
                desc: 'Stanza order, choruses, and bridges confirmed for lyricist team.'
              },
              {
                key: 'referencesChecked' as const,
                label: 'Audio & video references attached',
                desc: 'Spotify, YouTube, or Apple Music reference links attached to songs.'
              },
              {
                key: 'teamAssignmentsFinalized' as const,
                label: 'Ministry team roster confirmed',
                desc: 'Song leaders, backup vocalists, musicians, technician, and lyricist confirmed.'
              },
              {
                key: 'transitionsPrepared' as const,
                label: 'Flow, transitions & service cues documented',
                desc: 'Musical flow, prayer transitions, and service notes clearly written.'
              }
            ].map((checkItem) => {
              const isChecked = rehearsalChecklist[checkItem.key] === true;
              return (
                <label
                  key={checkItem.key}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                    isChecked
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300/80 dark:border-emerald-800/60 text-slate-900 dark:text-slate-100'
                      : 'bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      takeSnapshot(true);
                      setRehearsalChecklist({
                        ...rehearsalChecklist,
                        [checkItem.key]: e.target.checked,
                        updatedAt: getManilaNowISO()
                      });
                    }}
                    className="w-4 h-4 mt-0.5 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold block">{checkItem.label}</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">{checkItem.desc}</span>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Form Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 sm:p-4 rounded-2xl wwcf-toolbar-sticky shadow-xl sticky bottom-3 sm:bottom-4 z-20">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
          <button
            type="button"
            data-tour="save-lineup-btn"
            onClick={handleSave}
            className="btn-tactile inline-flex items-center justify-center gap-2 px-6 py-2.5 min-h-[44px] text-sm font-bold text-white bg-[#1b75bc] hover:bg-[#165d97] active:bg-[#144d7c] rounded-xl shadow-md shadow-[#1b75bc]/25 transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc] w-full sm:w-auto"
          >
            <Save className="w-4 h-4 shrink-0" />
            <span>Save Schedule</span>
          </button>

          {/* S-05 Copy Service Brief Button */}
          <button
            type="button"
            onClick={handleCopyServiceBrief}
            className="btn-tactile inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 dark:bg-emerald-500/15 hover:bg-emerald-500/20 border border-emerald-500/25 rounded-xl transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
            title="Copy formatted plain-text service brief for team chat (WhatsApp, Messenger, SMS)"
          >
            {copiedBrief ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" /> : <Copy className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />}
            <span>{copiedBrief ? 'Brief Copied!' : 'Copy Brief'}</span>
          </button>

          {/* Export Action Buttons - Targeted by Interactive Guide Step 8 */}
          <div
            data-tour="export-buttons-pair"
            className="flex items-center gap-2 w-full sm:w-auto"
          >
            <button
              type="button"
              onClick={handleExportRehearsalSheet}
              disabled={isExportingRehearsalSheet}
              className="btn-tactile flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[44px] text-sm font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 dark:bg-amber-500/15 hover:bg-amber-500/20 border border-amber-500/25 rounded-xl transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50"
              title="Export print-ready A4 Rehearsal Sheet PDF with complete song keys, tempo, cues, and team roster"
            >
              <Printer className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>{isExportingRehearsalSheet ? 'Exporting...' : 'Rehearsal Sheet'}</span>
            </button>

            <button
              type="button"
              data-tour="export-pdf-btn"
              data-guide="export-pdf"
              onClick={handleExportPDF}
              className="btn-tactile flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-bold text-[#1b75bc] dark:text-[#54b0e2] bg-[#1b75bc]/10 dark:bg-[#1b75bc]/15 hover:bg-[#1b75bc]/20 border border-[#1b75bc]/25 rounded-xl transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc]"
            >
              <FileDown className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2] shrink-0" />
              <span>Export PDF</span>
            </button>

            <button
              type="button"
              data-tour="export-png-btn"
              data-guide="export-png"
              onClick={handleExportPNG}
              className="btn-tactile flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-bold text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200/80 dark:border-white/10 rounded-xl transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc]"
            >
              <Image className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
              <span>Export PNG</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onResetForm}
          className="btn-tactile inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50/80 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-500 w-full sm:w-auto"
        >
          <RotateCcw className="w-4 h-4 shrink-0" />
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
        onSelectSong={(selectedTitle, song) => {
          if (pickerConfig.category === 'praise') {
            handlePraiseChange(pickerConfig.songIndex, selectedTitle, song);
          } else {
            handleWorshipChange(pickerConfig.songIndex, selectedTitle, song);
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

      {/* Song Form Modal for adding new song or editing matched catalog song lyrics */}
      <SongFormModal
        isOpen={isSongFormOpen || Boolean(editingSongForLyrics)}
        songToEdit={editingSongForLyrics}
        onClose={() => {
          setIsSongFormOpen(false);
          setEditingSongForLyrics(null);
        }}
        onSave={() => {
          onRefreshSongs();
          setIsSongFormOpen(false);
          setEditingSongForLyrics(null);
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
            const updatedIds = [...praiseSongIds];

            if (targetIdx !== undefined && targetIdx >= 0 && targetIdx < updatedPraise.length) {
              updatedPraise[targetIdx] = savedSong.title;
              updatedKeys[targetIdx] = songKey;
              updatedIds[targetIdx] = savedSong.id;
            } else {
              const emptyIdx = updatedPraise.findIndex((s) => !s.trim());
              if (emptyIdx >= 0) {
                updatedPraise[emptyIdx] = savedSong.title;
                updatedKeys[emptyIdx] = songKey;
                updatedIds[emptyIdx] = savedSong.id;
              } else {
                updatedPraise.push(savedSong.title);
                updatedKeys.push(songKey);
                updatedIds.push(savedSong.id);
              }
            }
            setPraiseSongs(updatedPraise);
            setPraiseSongKeys(updatedKeys);
            setPraiseSongIds(updatedIds);
            invalidateSongChanges();
          } else {
            const updatedWorship = [...worshipSongs];
            const updatedKeys = [...worshipSongKeys];
            const updatedIds = [...worshipSongIds];

            if (targetIdx !== undefined && targetIdx >= 0 && targetIdx < updatedWorship.length) {
              updatedWorship[targetIdx] = savedSong.title;
              updatedKeys[targetIdx] = songKey;
              updatedIds[targetIdx] = savedSong.id;
            } else {
              const emptyIdx = updatedWorship.findIndex((s) => !s.trim());
              if (emptyIdx >= 0) {
                updatedWorship[emptyIdx] = savedSong.title;
                updatedKeys[emptyIdx] = songKey;
                updatedIds[emptyIdx] = savedSong.id;
              } else {
                updatedWorship.push(savedSong.title);
                updatedKeys.push(songKey);
                updatedIds.push(savedSong.id);
              }
            }
            setWorshipSongs(updatedWorship);
            setWorshipSongKeys(updatedKeys);
            setWorshipSongIds(updatedIds);
            invalidateSongChanges();
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
            const updatedIds = [...praiseSongIds];

            if (targetIdx !== undefined && targetIdx >= 0 && targetIdx < updatedPraise.length) {
              updatedPraise[targetIdx] = existingSong.title;
              updatedKeys[targetIdx] = songKey;
              updatedIds[targetIdx] = existingSong.id;
            } else {
              const emptyIdx = updatedPraise.findIndex((s) => !s.trim());
              if (emptyIdx >= 0) {
                updatedPraise[emptyIdx] = existingSong.title;
                updatedKeys[emptyIdx] = songKey;
                updatedIds[emptyIdx] = existingSong.id;
              } else {
                updatedPraise.push(existingSong.title);
                updatedKeys.push(songKey);
                updatedIds.push(existingSong.id);
              }
            }
            setPraiseSongs(updatedPraise);
            setPraiseSongKeys(updatedKeys);
            setPraiseSongIds(updatedIds);
            invalidateSongChanges();
          } else {
            const updatedWorship = [...worshipSongs];
            const updatedKeys = [...worshipSongKeys];
            const updatedIds = [...worshipSongIds];

            if (targetIdx !== undefined && targetIdx >= 0 && targetIdx < updatedWorship.length) {
              updatedWorship[targetIdx] = existingSong.title;
              updatedKeys[targetIdx] = songKey;
              updatedIds[targetIdx] = existingSong.id;
            } else {
              const emptyIdx = updatedWorship.findIndex((s) => !s.trim());
              if (emptyIdx >= 0) {
                updatedWorship[emptyIdx] = existingSong.title;
                updatedKeys[emptyIdx] = songKey;
                updatedIds[emptyIdx] = existingSong.id;
              } else {
                updatedWorship.push(existingSong.title);
                updatedKeys.push(songKey);
                updatedIds.push(existingSong.id);
              }
            }
            setWorshipSongs(updatedWorship);
            setWorshipSongKeys(updatedKeys);
            setWorshipSongIds(updatedIds);
            invalidateSongChanges();
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

      {/* Service Brief Clipboard Fallback Modal */}
      <Modal
        id="scheduler-brief-modal"
        isOpen={Boolean(briefModalText)}
        title="Worship Service Brief"
        confirmLabel="Done"
        onConfirm={() => setBriefModalText(null)}
        onClose={() => setBriefModalText(null)}
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Copy the service brief below to share with the worship team on Messenger, WhatsApp, Telegram, or SMS:
          </p>
          <textarea
            readOnly
            rows={12}
            value={briefModalText || ''}
            className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl select-all focus:outline-hidden"
            onFocus={(e) => e.target.select()}
          />
        </div>
      </Modal>

      {/* Reusable Lineup Templates Modal (L-01) */}
      <LineupTemplatesModal
        isOpen={isTemplatesModalOpen}
        onClose={() => setIsTemplatesModalOpen(false)}
        currentScheduleDraft={getTempSchedule()}
        members={members}
        allSongs={allSongs}
        onApplyTemplate={handleApplyTemplate}
        showToast={showToast}
      />

      {/* Team Member Availability Matrix Modal (L-02) */}
      <MemberAvailabilityModal
        isOpen={isAvailabilityModalOpen}
        onClose={() => setIsAvailabilityModalOpen(false)}
        members={members}
        initialDate={serviceDate}
        serviceType={serviceType}
        showToast={showToast}
      />

      {/* No Service Confirmation Dialog (NS-01) */}
      <Modal
        id="scheduler-no-service-confirm-modal"
        isOpen={isConfirmNoServiceOpen}
        title="Mark Date as No Service?"
        isDanger={true}
        cancelLabel="Cancel"
        confirmLabel="Mark as No Service"
        onConfirm={applyNoServiceEnabled}
        onClose={() => setIsConfirmNoServiceOpen(false)}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            Marking <strong>{serviceType}</strong> on <strong>{formatDateDisplayManila(serviceDate, { month: 'long', day: 'numeric', year: 'numeric' })}</strong> as <strong>No Service</strong> will clear all current songs, performed keys, team assignments, transition notes, and rehearsal checklist items.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
            Your Service Type, Service Date, and Service Notes will be preserved. You can press Undo (Ctrl+Z) if you need to restore the previous lineup.
          </p>
        </div>
      </Modal>

      {/* Live Rehearsal Prompter Modal (L-09) */}
      <RehearsalPrompterModal
        isOpen={isPrompterOpen && !noService}
        onClose={() => setIsPrompterOpen(false)}
        schedule={getTempSchedule()}
        allSongs={allSongs}
      />

      {/* Lyrics Presentation Console & Audience Output (LY-01) */}
      <LyricsPresentationModal
        isOpen={isLyricsPresentationOpen && !noService}
        onClose={() => setIsLyricsPresentationOpen(false)}
        schedule={getTempSchedule()}
        allSongs={allSongs}
        showToast={showToast}
      />

      {/* Direct Lineup Song Chord & Cue Chart Modal (HX-01 / HX-02 / HX-04) */}
      <Modal
        id="scheduler-song-chart-modal"
        isOpen={Boolean(chartPreviewTarget) && !noService}
        title={
          chartPreviewTarget
            ? `Chord & Cue Charts: ${allSongs.find((s) => s.id === chartPreviewTarget.song.id)?.title || chartPreviewTarget.song.title}`
            : 'Chord Charts'
        }
        maxWidth="max-w-3xl"
        onClose={() => setChartPreviewTarget(null)}
      >
        {chartPreviewTarget && (() => {
          const activeSong = allSongs.find((s) => s.id === chartPreviewTarget.song.id) || chartPreviewTarget.song;
          const origKey = activeSong.originalKey || activeSong.key;
          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-bold text-[#1b75bc] dark:text-[#54b0e2]">
                    {chartPreviewTarget.sectionLabel}
                  </span>
                  <span>·</span>
                  <span className={chartPreviewTarget.performedKey ? 'font-bold text-slate-900 dark:text-slate-100' : 'italic text-slate-500 dark:text-slate-400'}>
                    {chartPreviewTarget.performedKey
                      ? `Performed Key: ${chartPreviewTarget.performedKey}`
                      : 'Performed key not set'}
                  </span>
                  {origKey && <span>· Original Key: {origKey}</span>}
                  {activeSong.bpm ? <span>· {activeSong.bpm} BPM</span> : null}
                  {activeSong.timeSignature ? <span>· {activeSong.timeSignature}</span> : null}
                  {activeSong.tuning ? <span>· Tuning: {activeSong.tuning}</span> : null}
                </div>
              </div>

              <ChordChartViewer
                songTitle={activeSong.title}
                charts={activeSong.instrumentCharts || []}
                baseKey={origKey}
                targetPerformedKey={chartPreviewTarget.performedKey}
                hasExplicitPerformedKeyContext={true}
                initialCapo={activeSong.capo}
                maxHeightClass="max-h-[52vh]"
              />

              {activeSong.videoMarkers && activeSong.videoMarkers.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs pt-1">
                  <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 font-semibold mr-1">
                    <Youtube className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                    <span>Video Cues:</span>
                  </span>
                  {activeSong.videoMarkers.map((marker) => {
                    const jumpUrl = buildYouTubeTimestampUrl(
                      activeSong.youtubeUrl,
                      activeSong.youtubeId,
                      marker.timeSeconds
                    );
                    return jumpUrl ? (
                      <a
                        key={marker.id}
                        href={jumpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:border-[#1b75bc] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                      >
                        <span className="font-mono font-bold text-[#1b75bc] dark:text-[#54b0e2] tabular-nums">
                          {formatMarkerTimestamp(marker.timeSeconds)}
                        </span>
                        <span>{marker.label}</span>
                      </a>
                    ) : (
                      <span
                        key={marker.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                      >
                        <span className="font-mono font-bold text-[#1b75bc] dark:text-[#54b0e2] tabular-nums">
                          {formatMarkerTimestamp(marker.timeSeconds)}
                        </span>
                        <span>{marker.label}</span>
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setChartPreviewTarget(null);
                    setEditingSongForLyrics(activeSong);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-bold text-[#1b75bc] dark:text-[#54b0e2] bg-[#1b75bc]/10 hover:bg-[#1b75bc]/20 border border-[#1b75bc]/25 rounded-xl transition-colors cursor-pointer mr-auto"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit Song &amp; Charts</span>
                </button>
                <button
                  type="button"
                  onClick={() => setChartPreviewTarget(null)}
                  className="px-4 py-2 min-h-[40px] text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};
