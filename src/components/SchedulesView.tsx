import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Schedule, formatAssignmentMemberNames, Song, normalizeServiceType } from '../types';
import {
  getScheduleRepeatedSongs,
  ensureMonthlyPlaceholders,
  getScheduleStatus,
  isNoServiceSchedule,
  partitionNoServiceConversionSelection,
  NO_SERVICE_REASON_MAX_LENGTH
} from '../utils/scheduleUtils';
import { formatDateDisplayManila, getManilaTodayString, getManilaDateParts } from '../utils/dateUtils';
import { resolveScheduleSongTitles } from '../utils/songResolveUtils';
import { StorageService } from '../services/storage';
import { useMultiSelect } from '../hooks/useMultiSelect';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import {
  CalendarDays,
  Search,
  Edit3,
  Copy,
  Trash2,
  FileDown,
  Image,
  UserCheck,
  AlertTriangle,
  X,
  Filter,
  ArrowUpDown,
  Calendar,
  ChevronDown,
  ChevronUp,
  Ban
} from 'lucide-react';

export const MONTH_OPTIONS = [
  { value: 'all', label: 'All Months' },
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' }
] as const;

/**
 * Extracts 4-digit year and 2-digit month (01-12) from a date string.
 * Supports "YYYY-MM-DD", "YYYY-MM", ISO date strings, and Date-parseable strings
 * within Asia/Manila (UTC+8) time context.
 */
export function extractYearAndMonth(dateStr?: string): { year: string; month: string } | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Direct regex match for "YYYY-MM" or "YYYY-MM-DD" at the beginning
  const directMatch = trimmed.match(/^(\d{4})-(\d{2})/);
  if (directMatch) {
    return { year: directMatch[1], month: directMatch[2] };
  }

  // Fallback to getManilaDateParts for ISO strings or timestamps
  try {
    const parts = getManilaDateParts(trimmed);
    if (parts && parts.year && parts.month) {
      return {
        year: String(parts.year),
        month: String(parts.month).padStart(2, '0')
      };
    }
  } catch {
    // Ignore parsing error and return null
  }

  return null;
}

export interface BulkNoServiceActionResult {
  success: boolean;
  convertedCount: number;
  skippedNoServiceCount: number;
  skippedPlaceholderCount: number;
}

interface SchedulesViewProps {
  schedules: Schedule[];
  allSongs?: Song[];
  onEditSchedule: (schedule: Schedule) => void;
  onDuplicateSchedule: (schedule: Schedule) => void;
  onDeleteSchedule: (id: string) => void;
  onBulkDeleteSchedules?: (ids: string[]) => void;
  onMarkNoService?: (ids: string[], reason?: string) => BulkNoServiceActionResult;
  onExportPDF: (schedule: Schedule) => void;
  onExportPNG: (schedule: Schedule) => void;
  onUpdateSchedules?: (schedules: Schedule[]) => void;
}

export type ScheduleSortOption =
  | 'date-desc'
  | 'date-asc';

/**
 * Renders a clean preview of songs contained in a lineup with bullet points,
 * one song per line, and an expandable "Show More" option for long lists.
 */
const LineupSongsPreview: React.FC<{ schedule: Schedule; songsList?: Song[] }> = ({ schedule, songsList = [] }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (isNoServiceSchedule(schedule)) {
    const reason = schedule.noServiceReason?.trim();
    return (
      <div className="py-1 space-y-1">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
          <Ban className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>No Service Scheduled</span>
        </div>
        {reason && (
          <p className="text-xs text-slate-600 dark:text-slate-300 break-words">
            Reason: {reason}
          </p>
        )}
      </div>
    );
  }

  const resolved = resolveScheduleSongTitles(schedule, songsList);

  const praiseList = resolved.praiseSongs
    .map((title, i) => ({
      title: title.trim(),
      key: schedule.praiseSongKeys?.[i]?.trim(),
      type: 'Praise'
    }))
    .filter((item) => Boolean(item.title));

  const worshipList = resolved.worshipSongs
    .map((title, i) => ({
      title: title.trim(),
      key: schedule.worshipSongKeys?.[i]?.trim(),
      type: 'Worship'
    }))
    .filter((item) => Boolean(item.title));

  const previewSongs = [...praiseList, ...worshipList];

  if (previewSongs.length === 0) {
    return (
      <div className="text-slate-400 dark:text-slate-500 italic text-xs py-1">
        No songs added yet
      </div>
    );
  }

  const limit = 4;
  const visibleSongs = isExpanded ? previewSongs : previewSongs.slice(0, limit);
  const hiddenCount = previewSongs.length - limit;

  return (
    <div className="space-y-1.5 py-1">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
        <span>Songs ({previewSongs.length})</span>
      </div>
      <ul className="space-y-1 text-xs text-slate-800 dark:text-slate-200 font-medium">
        {visibleSongs.map((song, idx) => (
          <li key={idx} className="flex items-center gap-1.5 truncate">
            <span className="text-[#1b75bc] dark:text-[#54b0e2] font-black">•</span>
            <span className="truncate font-medium">{song.title}</span>
            {song.key && (
              <span className="text-xs px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/80 text-[#1b75bc] dark:text-[#54b0e2] border border-blue-200/60 dark:border-blue-800/60 font-bold shrink-0">
                Key: {song.key}
              </span>
            )}
          </li>
        ))}
      </ul>
      {previewSongs.length > limit && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs font-bold text-[#1b75bc] dark:text-[#54b0e2] hover:underline cursor-pointer pt-0.5 inline-flex items-center gap-1 min-h-[30px]"
        >
          <span>{isExpanded ? 'Show Less' : `+${hiddenCount} More Songs (Show More)`}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
};

export const SchedulesView: React.FC<SchedulesViewProps> = ({
  schedules,
  allSongs = [],
  onEditSchedule,
  onDuplicateSchedule,
  onDeleteSchedule,
  onBulkDeleteSchedules,
  onMarkNoService,
  onExportPDF,
  onExportPNG,
  onUpdateSchedules
}) => {
  const todayManila = useMemo(() => getManilaTodayString(), []);
  const defaultYear = todayManila.substring(0, 4);
  const defaultMonth = todayManila.substring(5, 7);

  // Filter Memory: Load last-used search, service, year, month, and sort settings
  const savedFilters = useMemo(() => StorageService.getSchedulesFilterSettings(), []);

  const [searchQuery, setSearchQuery] = useState(savedFilters.searchQuery || '');
  const [serviceFilter, setServiceFilter] = useState<string>(savedFilters.serviceFilter || 'all');
  const [yearFilter, setYearFilter] = useState<string>(() => savedFilters.yearFilter || defaultYear);
  const [monthFilter, setMonthFilter] = useState<string>(() => savedFilters.monthFilter || defaultMonth);
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');
  const [showDateRange, setShowDateRange] = useState<boolean>(false);
  const [sortOption, setSortOption] = useState<ScheduleSortOption>(() => {
    if (savedFilters.sortOption) return savedFilters.sortOption as ScheduleSortOption;
    try {
      const legacy = localStorage.getItem('schedules_sort_option');
      if (legacy) return legacy as ScheduleSortOption;
    } catch {}
    return 'date-desc';
  });
  const [openRepeatedPopoverId, setOpenRepeatedPopoverId] = useState<string | null>(null);
  const lastEnsuredYMRef = React.useRef<string>('');

  // Filter Memory: Persist settings whenever they change
  useEffect(() => {
    StorageService.saveSchedulesFilterSettings({
      searchQuery,
      serviceFilter,
      yearFilter,
      monthFilter,
      sortOption
    });
  }, [searchQuery, serviceFilter, yearFilter, monthFilter, sortOption]);

  // Ensure monthly placeholders when a specific month and year are selected
  useEffect(() => {
    if (yearFilter !== 'all' && monthFilter !== 'all' && onUpdateSchedules) {
      const targetYM = `${yearFilter}-${monthFilter}`;
      if (lastEnsuredYMRef.current !== targetYM) {
        lastEnsuredYMRef.current = targetYM;
        const updated = ensureMonthlyPlaceholders(targetYM, schedules);
        if (updated.length !== schedules.length) {
          onUpdateSchedules(updated);
        }
      }
    }
  }, [yearFilter, monthFilter, schedules, onUpdateSchedules]);

  const handleSortChange = (opt: ScheduleSortOption) => {
    setSortOption(opt);
  };

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenRepeatedPopoverId(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // Compute available service types
  const availableServices = useMemo(() => {
    const defaultTypes = [
      'Sunday Service',
      'Midweek Prayer Service',
      'Youth Fellowship',
      'Worship Event'
    ];
    const set = new Set<string>(defaultTypes);
    schedules.forEach((s) => {
      if (s.serviceType) {
        set.add(normalizeServiceType(s.serviceType));
      }
    });
    return Array.from(set);
  }, [schedules]);

  // Compute available years in schedules + current year (sorted newest first)
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    const currentYear = getManilaTodayString().substring(0, 4);
    yearsSet.add(currentYear);

    schedules.forEach((s) => {
      const ym = extractYearAndMonth(s.serviceDate);
      if (ym && ym.year) {
        yearsSet.add(ym.year);
      }
    });

    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [schedules]);

  // Filter & Sort Schedules
  const filteredSchedules = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    const filtered = schedules.filter((s) => {
      // Service filter (matches canonical and legacy aliases seamlessly)
      if (serviceFilter !== 'all') {
        const normFilter = normalizeServiceType(serviceFilter);
        const normService = normalizeServiceType(s.serviceType);
        if (normFilter !== normService && s.serviceType !== serviceFilter) {
          return false;
        }
      }

      const ym = extractYearAndMonth(s.serviceDate);

      // Year filter
      if (yearFilter !== 'all') {
        if (!ym || ym.year !== yearFilter) {
          return false;
        }
      }

      // Month filter
      if (monthFilter !== 'all') {
        if (!ym || ym.month !== monthFilter) {
          return false;
        }
      }

      // Date range filter
      if (startDateFilter && s.serviceDate && s.serviceDate < startDateFilter) {
        return false;
      }
      if (endDateFilter && s.serviceDate && s.serviceDate > endDateFilter) {
        return false;
      }

      // Search query
      if (query) {
        const cleanQ = query.replace(/\s+/g, ' ');
        const terms = cleanQ.split(' ');
        const serviceLower = s.serviceType.toLowerCase();
        const dateLower = (s.serviceDate || '').toLowerCase();
        const notesLower = (s.notes || '').toLowerCase();
        const noServiceLower = isNoServiceSchedule(s)
          ? `no service ${(s.noServiceReason || '').toLowerCase()}`
          : '';
        const transitionCuesLower = Object.values(s.transitionNotes || {}).map((c) => c.toLowerCase());
        const resolved = resolveScheduleSongTitles(s, allSongs);
        const praiseLower = (resolved.praiseSongs || []).map((p) => p.toLowerCase());
        const worshipLower = (resolved.worshipSongs || []).map((w) => w.toLowerCase());
        const keysLower = (s.praiseSongKeys || [])
          .concat(s.worshipSongKeys || [])
          .map((k) => (k || '').toLowerCase());
        const membersLower = (s.ministryAssignments || []).map(
          (m) => (formatAssignmentMemberNames(m) + ' ' + m.role + ' ' + (m.notes || '')).toLowerCase()
        );

        return terms.every(
          (term) =>
            serviceLower.includes(term) ||
            dateLower.includes(term) ||
            notesLower.includes(term) ||
            noServiceLower.includes(term) ||
            transitionCuesLower.some((c) => c.includes(term)) ||
            praiseLower.some((p) => p.includes(term)) ||
            worshipLower.some((w) => w.includes(term)) ||
            keysLower.some((k) => k.includes(term)) ||
            membersLower.some((m) => m.includes(term))
        );
      }

      return true;
    });

    // Sorting
    return [...filtered].sort((a, b) => {
      if (sortOption === 'date-asc') {
        const comp = (a.serviceDate || '').localeCompare(b.serviceDate || '');
        if (comp !== 0) return comp;
        return (a.id || '').localeCompare(b.id || '');
      }
      // Default: date-desc (Newest Date -> Oldest Date)
      const comp = (b.serviceDate || '').localeCompare(a.serviceDate || '');
      if (comp !== 0) return comp;
      return (b.id || '').localeCompare(a.id || '');
    });
  }, [schedules, searchQuery, serviceFilter, yearFilter, monthFilter, startDateFilter, endDateFilter, sortOption, allSongs]);

  // Context-aware empty state messaging
  const getEmptyMessage = () => {
    if (searchQuery.trim()) {
      return `No line-ups matching "${searchQuery.trim()}".`;
    }

    if (startDateFilter || endDateFilter) {
      return 'No saved line-ups found in the selected date range.';
    }

    const selectedMonthObj = MONTH_OPTIONS.find((m) => m.value === monthFilter);
    const monthLabel = selectedMonthObj && selectedMonthObj.value !== 'all' ? selectedMonthObj.label : '';

    if (yearFilter !== 'all' && monthFilter !== 'all') {
      return `No saved line-ups for ${monthLabel} ${yearFilter}.`;
    }
    if (yearFilter !== 'all' && monthFilter === 'all') {
      return `No saved line-ups for ${yearFilter}.`;
    }
    if (yearFilter === 'all' && monthFilter !== 'all') {
      return `No saved line-ups for ${monthLabel}.`;
    }
    if (serviceFilter !== 'all') {
      return `No saved line-ups for ${serviceFilter}.`;
    }
    return 'No saved line-ups found.';
  };

  const hasActiveFilter =
    searchQuery.trim() !== '' ||
    serviceFilter !== 'all' ||
    yearFilter !== 'all' ||
    monthFilter !== 'all' ||
    startDateFilter !== '' ||
    endDateFilter !== '' ||
    sortOption !== 'date-desc';

  const handleResetFilters = () => {
    setSearchQuery('');
    setServiceFilter('all');
    setYearFilter('all');
    setMonthFilter('all');
    setStartDateFilter('');
    setEndDateFilter('');
    setSortOption('date-desc');
  };

  // Multi-select hook (Matching Member Editor pattern)
  const {
    selectedIds,
    selectedCount,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    isSelected,
    isAllSelected,
    isSomeSelected
  } = useMultiSelect(filteredSchedules);

  // Top Toolbar Action Handlers
  const handleEditSelected = () => {
    if (selectedCount !== 1) return;
    const selectedSchedule = filteredSchedules.find((s) => selectedIds.has(s.id));
    if (selectedSchedule) {
      onEditSchedule(selectedSchedule);
    }
  };

  const handleDuplicateSelected = () => {
    if (selectedCount !== 1) return;
    const selectedSchedule = filteredSchedules.find((s) => selectedIds.has(s.id));
    if (selectedSchedule) {
      onDuplicateSchedule(selectedSchedule);
    }
  };

  const handleExportPDFSelected = () => {
    if (selectedCount === 0) return;
    const selectedList = schedules.filter((s) => selectedIds.has(s.id));
    selectedList.forEach((sch) => onExportPDF(sch));
  };

  const handleExportPNGSelected = () => {
    if (selectedCount === 0) return;
    const selectedList = schedules.filter((s) => selectedIds.has(s.id));
    selectedList.forEach((sch) => onExportPNG(sch));
  };

  // Bulk "No Service" dialog & focus-management state (NS-02)
  const [isConfirmNoServiceOpen, setIsConfirmNoServiceOpen] = useState<boolean>(false);
  const [noServiceTargetIds, setNoServiceTargetIds] = useState<string[]>([]);
  const [noServiceReasonInput, setNoServiceReasonInput] = useState<string>('');
  const [isSubmittingNoService, setIsSubmittingNoService] = useState<boolean>(false);
  const noServiceSubmittingRef = useRef<boolean>(false);
  const noServiceDialogRef = useRef<HTMLDivElement | null>(null);
  const noServiceReasonRef = useRef<HTMLTextAreaElement | null>(null);
  const noServiceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const previousNoServiceFocusedRef = useRef<HTMLElement | null>(null);

  const toolbarNoServicePartition = useMemo(
    () => partitionNoServiceConversionSelection(selectedIds, schedules),
    [selectedIds, schedules]
  );

  const dialogNoServicePartition = useMemo(
    () => partitionNoServiceConversionSelection(noServiceTargetIds, schedules),
    [noServiceTargetIds, schedules]
  );

  const sortedDialogEligible = useMemo(
    () =>
      [...dialogNoServicePartition.eligible].sort((a, b) =>
        (a.serviceDate || '').localeCompare(b.serviceDate || '')
      ),
    [dialogNoServicePartition.eligible]
  );

  const handleCloseNoServiceModal = useCallback(() => {
    if (noServiceSubmittingRef.current || isSubmittingNoService) return;
    setIsConfirmNoServiceOpen(false);
    setNoServiceTargetIds([]);
    setNoServiceReasonInput('');
  }, [isSubmittingNoService]);

  const { zIndex: noServiceZIndex, isTopmost: isNoServiceTopmost, isBlocked: isNoServiceBlocked } = useOverlay({
    id: 'schedules-bulk-no-service-modal',
    isOpen: isConfirmNoServiceOpen,
    layer: OverlayLayer.CRITICAL_DIALOG,
    onClose: handleCloseNoServiceModal,
    closeOnEscape: !isSubmittingNoService
  });

  useEffect(() => {
    if (isConfirmNoServiceOpen) {
      if (!previousNoServiceFocusedRef.current && typeof document !== 'undefined') {
        previousNoServiceFocusedRef.current =
          (document.activeElement as HTMLElement | null) || noServiceTriggerRef.current;
      }
      const raf = window.requestAnimationFrame(() => {
        if (noServiceReasonRef.current) {
          noServiceReasonRef.current.focus();
        } else if (noServiceDialogRef.current) {
          const first = noServiceDialogRef.current.querySelector<HTMLElement>(
            'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          first?.focus();
        }
      });
      return () => window.cancelAnimationFrame(raf);
    } else if (previousNoServiceFocusedRef.current) {
      const targetToRestore = previousNoServiceFocusedRef.current;
      previousNoServiceFocusedRef.current = null;
      window.requestAnimationFrame(() => {
        try {
          if (targetToRestore && typeof targetToRestore.focus === 'function' && targetToRestore.isConnected) {
            targetToRestore.focus();
          }
        } catch {
          // Ignore focus restore errors
        }
      });
    }
  }, [isConfirmNoServiceOpen]);

  useEffect(() => {
    if (!isConfirmNoServiceOpen || !isNoServiceTopmost || isNoServiceBlocked) return;
    const handleTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const container = noServiceDialogRef.current;
      if (!container) return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !container.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last || !container.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleTrap);
    return () => window.removeEventListener('keydown', handleTrap);
  }, [isConfirmNoServiceOpen, isNoServiceTopmost, isNoServiceBlocked]);

  const handleOpenNoServiceModal = () => {
    if (!onMarkNoService || toolbarNoServicePartition.eligible.length === 0) return;
    setNoServiceTargetIds(Array.from(selectedIds));
    setNoServiceReasonInput('');
    setIsConfirmNoServiceOpen(true);
  };

  const handleConfirmNoService = () => {
    if (!onMarkNoService || noServiceSubmittingRef.current || isSubmittingNoService) return;
    const eligibleIds = dialogNoServicePartition.eligible.map((s) => s.id);
    if (eligibleIds.length === 0) {
      handleCloseNoServiceModal();
      return;
    }

    noServiceSubmittingRef.current = true;
    setIsSubmittingNoService(true);
    try {
      const result = onMarkNoService(noServiceTargetIds, noServiceReasonInput);
      if (result && result.success) {
        setIsConfirmNoServiceOpen(false);
        setNoServiceTargetIds([]);
        setNoServiceReasonInput('');
        clearSelection();
      }
    } finally {
      noServiceSubmittingRef.current = false;
      setIsSubmittingNoService(false);
    }
  };

  const handleDeleteSelected = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (ids.length === 1) {
      onDeleteSchedule(ids[0]);
    } else if (onBulkDeleteSchedules) {
      onBulkDeleteSchedules(ids);
    } else {
      ids.forEach((id) => onDeleteSchedule(id));
    }
    clearSelection();
  };

  return (
    <div data-tour="schedules-view" className="space-y-6 animate-in fade-in duration-300">
      {/* Main Container Card: Header, Filters, Search & Top Action Toolbar */}
      <div className="p-6 rounded-2xl wwcf-glass-card shadow-xs space-y-4">
        {/* Header & Search */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-[#1b75bc] dark:text-[#54b0e2]" />
              <span>Saved Worship Schedules ({filteredSchedules.length})</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
              Manage saved worship line-ups, filter by month and service type, or export/edit selected schedules.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search date, song, or member..."
              className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#11161e] text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#1b75bc]/30 focus:border-[#1b75bc] outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls Row: Year -> Month -> Service Type -> Sort By */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100 dark:border-white/10">
          {/* Year Selector */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2] shrink-0" />
            <div className="flex-1">
              <label htmlFor="year-filter-select" className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Year Filter
              </label>
              <select
                id="year-filter-select"
                value={yearFilter}
                data-tour="schedules-year-select"
                onChange={(e) => setYearFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#11161e] text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#1b75bc]/30 focus:border-[#1b75bc] outline-none cursor-pointer min-h-[40px] btn-press-feedback"
              >
                <option value="all">All Years</option>
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Month Selector */}
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2] shrink-0" />
            <div className="flex-1">
              <label htmlFor="month-filter-select" className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Month Filter
              </label>
              <select
                id="month-filter-select"
                value={monthFilter}
                data-tour="schedules-month-select"
                onChange={(e) => setMonthFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#11161e] text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#1b75bc]/30 focus:border-[#1b75bc] outline-none cursor-pointer min-h-[40px] btn-press-feedback"
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Service Type Selector */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2] shrink-0" />
            <div className="flex-1">
              <label htmlFor="service-filter-select" className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Service Type Filter
              </label>
              <select
                id="service-filter-select"
                value={serviceFilter}
                data-tour="schedules-filter-select"
                onChange={(e) => setServiceFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#11161e] text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#1b75bc]/30 focus:border-[#1b75bc] outline-none cursor-pointer min-h-[40px] btn-press-feedback"
              >
                <option value="all">All Services</option>
                {availableServices.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2] shrink-0" />
            <div className="flex-1">
              <label htmlFor="sort-filter-select" className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Sort By
              </label>
              <select
                id="sort-filter-select"
                value={sortOption}
                onChange={(e) => handleSortChange(e.target.value as ScheduleSortOption)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#11161e] text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#1b75bc]/30 focus:border-[#1b75bc] outline-none cursor-pointer min-h-[40px] btn-press-feedback"
              >
                <option value="date-desc">Newest Date First</option>
                <option value="date-asc">Oldest Date First</option>
              </select>
            </div>
          </div>
        </div>

        {/* Date Range Filter Options */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-white/5 text-xs">
          <button
            type="button"
            onClick={() => setShowDateRange((prev) => !prev)}
            className="text-xs font-semibold text-[#1b75bc] dark:text-[#54b0e2] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{showDateRange ? 'Hide Custom Date Range' : 'Filter by Exact Date Range'}</span>
          </button>

          {showDateRange && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">From:</span>
                <input
                  type="date"
                  value={startDateFilter}
                  onChange={(e) => setStartDateFilter(e.target.value)}
                  className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black text-slate-900 dark:text-slate-100 outline-none"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">To:</span>
                <input
                  type="date"
                  value={endDateFilter}
                  onChange={(e) => setEndDateFilter(e.target.value)}
                  className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black text-slate-900 dark:text-slate-100 outline-none"
                />
              </div>
              {(startDateFilter || endDateFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDateFilter('');
                    setEndDateFilter('');
                  }}
                  className="text-[11px] text-rose-500 hover:underline cursor-pointer"
                >
                  Clear Range
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 🌟 Universal Action Buttons Toolbar */}
      <div
        data-tour="schedules-bulk-actions"
        className="sticky top-[73px] sm:top-[77px] z-20 flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl wwcf-toolbar-sticky shadow-sm transition-all"
      >
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAllSelected}
              ref={(el) => {
                if (el) el.indeterminate = isSomeSelected;
              }}
              onChange={() => toggleSelectAll(filteredSchedules)}
              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-[#1b75bc] focus:ring-[#1b75bc] cursor-pointer"
            />
            <span>Select All ({filteredSchedules.length})</span>
          </label>

          {selectedCount > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#f0f7fc] dark:bg-[#0f2b44] text-[#1b75bc] dark:text-[#54b0e2] border border-[#1b75bc]/25">
              {selectedCount} selected
            </span>
          )}
        </div>

        {selectedCount > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {selectedCount === 1 && (
              <>
                {/* Edit Line-up Button */}
                <button
                  type="button"
                  onClick={handleEditSelected}
                  className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border bg-[#1b75bc] hover:bg-[#16629e] text-white border-[#1b75bc] shadow-xs transition-all cursor-pointer select-none"
                  title="Edit selected line-up"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Line-up</span>
                </button>

                {/* Duplicate Line-up Button */}
                <button
                  type="button"
                  onClick={handleDuplicateSelected}
                  className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-xs transition-all cursor-pointer select-none"
                  title="Duplicate selected line-up"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Duplicate Line-up</span>
                </button>
              </>
            )}

            {/* Export PDF Button */}
            <button
              type="button"
              onClick={handleExportPDFSelected}
              className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2] border-[#1b75bc]/30 hover:bg-[#1b75bc]/20 shadow-xs transition-all cursor-pointer select-none"
              title={
                selectedCount === 1
                  ? 'Export selected line-up as PDF'
                  : `Export ${selectedCount} selected line-ups as PDF`
              }
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Export PDF{selectedCount > 1 ? ` (${selectedCount})` : ''}</span>
            </button>

            {/* Export PNG Button */}
            <button
              type="button"
              onClick={handleExportPNGSelected}
              className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2] border-[#1b75bc]/30 hover:bg-[#1b75bc]/20 shadow-xs transition-all cursor-pointer select-none min-h-[40px]"
              title={
                selectedCount === 1
                  ? 'Export selected line-up as PNG image'
                  : `Export ${selectedCount} selected line-ups as PNG`
              }
            >
              <Image className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export PNG{selectedCount > 1 ? ` (${selectedCount})` : ''}</span>
            </button>

            {/* No Service Button (NS-02) */}
            {onMarkNoService && (
              <button
                ref={noServiceTriggerRef}
                type="button"
                onClick={handleOpenNoServiceModal}
                disabled={toolbarNoServicePartition.eligible.length === 0 || isSubmittingNoService}
                aria-label={
                  toolbarNoServicePartition.eligible.length === 0
                    ? 'No Service unavailable: selected line-ups are already marked as No Service or are un-saved monthly placeholders'
                    : toolbarNoServicePartition.eligible.length === 1
                    ? 'Mark selected saved line-up as No Service'
                    : `Mark ${toolbarNoServicePartition.eligible.length} selected saved line-ups as No Service`
                }
                title={
                  toolbarNoServicePartition.eligible.length === 0
                    ? toolbarNoServicePartition.alreadyNoService.length > 0 && toolbarNoServicePartition.placeholders.length === 0
                      ? 'All selected line-ups are already marked as No Service'
                      : 'Only saved normal line-ups can be converted to No Service (monthly placeholders cannot be converted here)'
                    : toolbarNoServicePartition.eligible.length === 1
                    ? 'Mark selected saved line-up as No Service'
                    : `Mark ${toolbarNoServicePartition.eligible.length} selected saved line-ups as No Service`
                }
                className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 border-amber-400/60 dark:border-amber-600/60 shadow-xs transition-all cursor-pointer select-none min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Ban className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>
                  No Service
                  {toolbarNoServicePartition.eligible.length > 1
                    ? ` (${toolbarNoServicePartition.eligible.length})`
                    : ''}
                </span>
              </button>
            )}

            {/* Delete Line-up Button */}
            <button
              type="button"
              onClick={handleDeleteSelected}
              className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border bg-rose-600 hover:bg-rose-700 text-white border-rose-600 shadow-xs transition-all cursor-pointer select-none min-h-[40px]"
              title={
                selectedCount === 1
                  ? 'Delete selected line-up'
                  : `Delete ${selectedCount} selected line-ups`
              }
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Delete Line-up{selectedCount > 1 ? `s (${selectedCount})` : ''}</span>
            </button>

            {/* Clear Selection */}
            <button
              type="button"
              onClick={clearSelection}
              className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline cursor-pointer ml-1"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Schedules List / Table */}
      <div className="p-6 rounded-2xl wwcf-glass-card shadow-xs overflow-hidden">
        {filteredSchedules.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/5 text-slate-400 mx-auto flex items-center justify-center">
              <CalendarDays className="w-6 h-6" />
            </div>
            <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm">
              {getEmptyMessage()}
            </p>
            {hasActiveFilter ? (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-xs font-semibold text-[#1b75bc] dark:text-[#54b0e2] hover:underline cursor-pointer"
                >
                  View all line-ups (clear filters)
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Monthly Sunday Service and Midweek Prayer Service placeholders will appear automatically.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/10 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50/80 dark:bg-black/60">
                  <th className="py-3.5 px-3 w-10 text-center" aria-label="Row selection"></th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Service</th>
                  <th className="py-3.5 px-4 min-w-[240px]">Songs</th>
                  <th className="py-3.5 px-4">Key Roles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredSchedules.map((schedule, idx) => {
                  const selected = isSelected(schedule.id);
                  const leaderAssignments = (schedule.ministryAssignments || []).filter(
                    (m) => (m.role || '').toLowerCase().includes('leader')
                  );
                  const leaderDisplay = leaderAssignments
                    .map((m) => formatAssignmentMemberNames(m))
                    .filter((n) => Boolean(n) && n !== 'Unassigned' && n !== '—')
                    .join(', ');
                  const status = getScheduleStatus(schedule);
                  const repeatedSongs = status === 'populated' ? getScheduleRepeatedSongs(schedule, schedules, allSongs) : [];
                  const isEmpty = status === 'empty';
                  const isNoService = status === 'no_service';

                  return (
                    <tr
                      key={schedule.id}
                      className={`transition-colors ${
                        selected
                          ? 'bg-[#1b75bc]/10 dark:bg-[#1b75bc]/20'
                          : 'hover:bg-slate-50/60 dark:hover:bg-white/5'
                      }`}
                    >
                      <td className="py-4 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={selected}
                          aria-label={`Select ${schedule.serviceType} lineup on ${schedule.serviceDate}`}
                          onChange={(e) => toggleSelect(schedule.id, idx, e)}
                          className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-[#1b75bc] focus:ring-[#1b75bc] cursor-pointer"
                        />
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                          {formatDateDisplayManila(schedule.serviceDate)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono font-medium">
                          {schedule.serviceDate}
                        </div>
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="flex flex-col items-start gap-1.5">
                          <span className="px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide rounded-md bg-blue-50 dark:bg-blue-950/80 text-[#1b75bc] dark:text-[#54b0e2] border border-blue-200/60 dark:border-blue-800/60">
                            {schedule.serviceType}
                          </span>

                          {isNoService && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded-md bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                              <Ban className="w-3 h-3 shrink-0" aria-hidden="true" />
                              <span>No Service</span>
                            </span>
                          )}

                          {isEmpty && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded-md bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              <span>Empty • Needs Planning</span>
                            </span>
                          )}

                          {repeatedSongs.length > 0 && (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenRepeatedPopoverId(
                                    openRepeatedPopoverId === schedule.id ? null : schedule.id
                                  );
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-md bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 cursor-pointer transition-colors shadow-2xs"
                                title="Click to view repeated songs details"
                              >
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                <span>
                                  {repeatedSongs.length === 1
                                    ? '1 Repeated Song'
                                    : `${repeatedSongs.length} Repeated Songs`}
                                </span>
                              </button>

                              {openRepeatedPopoverId === schedule.id && (
                                <div
                                  className="absolute left-0 top-full mt-1.5 w-80 p-3.5 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-xl shadow-xl z-40 text-left text-xs space-y-2.5 animate-in fade-in zoom-in-95 duration-150"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                    <span className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 text-xs">
                                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                                      <span>Repeated Songs Detection</span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setOpenRepeatedPopoverId(null)}
                                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer rounded-md"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                                    {repeatedSongs.map((detail, dIdx) => (
                                      <div
                                        key={dIdx}
                                        className="space-y-1.5 p-2.5 rounded-lg bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/50"
                                      >
                                        <div className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                                          • {detail.songTitle}
                                        </div>
                                        <div className="text-[11px] text-amber-700 dark:text-amber-400 font-bold">
                                          Used {detail.usageCount} {detail.usageCount === 1 ? 'time' : 'times'} in regular services
                                        </div>
                                        <div className="space-y-1 pt-0.5">
                                          {detail.otherOccurrences.map((occ, oIdx) => {
                                            const affectedSch = schedules.find((s) => s.id === occ.scheduleId);
                                            return (
                                              <div
                                                key={oIdx}
                                                className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 p-1.5 rounded border border-slate-200/80 dark:border-slate-700/80"
                                              >
                                                <div>
                                                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                                                    {occ.serviceDate}
                                                  </span>
                                                  <span className="text-slate-400 mx-1">-</span>
                                                  <span>{occ.serviceType}</span>
                                                </div>
                                                {affectedSch && (
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setOpenRepeatedPopoverId(null);
                                                      onEditSchedule(affectedSch);
                                                    }}
                                                    className="px-2 py-0.5 text-[10px] font-bold text-[#1b75bc] dark:text-[#54b0e2] hover:bg-[#f0f7fc] dark:hover:bg-[#0f2b44] rounded transition-colors cursor-pointer"
                                                  >
                                                    Open Line-up
                                                  </button>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top">
                        <LineupSongsPreview schedule={schedule} songsList={allSongs} />
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">
                        {isNoService ? (
                          <span className="text-slate-400 dark:text-slate-500 italic">No Service</span>
                        ) : leaderDisplay ? (
                          <div className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="font-semibold">{leaderDisplay}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">N/A</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Dialog for Marking Selected Saved Schedules as No Service (NS-02) */}
      {isConfirmNoServiceOpen &&
        createPortal(
          <div
            className="fixed inset-0 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
            style={{ zIndex: noServiceZIndex }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                handleCloseNoServiceModal();
              }
            }}
          >
            <div
              ref={noServiceDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="bulk-no-service-title"
              aria-describedby="bulk-no-service-desc"
              className="w-full max-w-lg rounded-2xl wwcf-glass-modal shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-black/40">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 shrink-0">
                    <Ban className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <h3
                    id="bulk-no-service-title"
                    className="text-base font-bold text-slate-900 dark:text-slate-100 truncate"
                  >
                    {sortedDialogEligible.length === 1
                      ? 'Mark 1 Line-up as No Service?'
                      : `Mark ${sortedDialogEligible.length} Line-ups as No Service?`}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleCloseNoServiceModal}
                  disabled={isSubmittingNoService}
                  aria-label="Close confirmation dialog"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                <div id="bulk-no-service-desc" className="space-y-3">
                  <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                    {sortedDialogEligible.length === 1
                      ? 'This will convert the selected saved line-up into a No Service record:'
                      : `This will convert ${sortedDialogEligible.length} selected saved line-ups into No Service records:`}
                  </p>

                  {/* Bounded list of affected dates & service types */}
                  {sortedDialogEligible.length > 0 && (
                    <ul className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/50 divide-y divide-slate-200/70 dark:divide-white/10 text-xs">
                      {sortedDialogEligible.slice(0, 5).map((item) => (
                        <li
                          key={item.id}
                          className="px-3.5 py-2 flex items-center justify-between gap-2 text-slate-800 dark:text-slate-200"
                        >
                          <span className="font-semibold">
                            {formatDateDisplayManila(item.serviceDate, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/70 text-[#1b75bc] dark:text-[#54b0e2] font-semibold">
                            {item.serviceType}
                          </span>
                        </li>
                      ))}
                      {sortedDialogEligible.length > 5 && (
                        <li className="px-3.5 py-2 text-slate-500 dark:text-slate-400 font-medium">
                          ...and {sortedDialogEligible.length - 5} more saved line-up
                          {sortedDialogEligible.length - 5 === 1 ? '' : 's'}
                        </li>
                      )}
                    </ul>
                  )}

                  {/* Notice if any selected records will be skipped */}
                  {(dialogNoServicePartition.alreadyNoService.length > 0 ||
                    dialogNoServicePartition.placeholders.length > 0) && (
                    <div className="px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                      <strong>Unchanged skipped items:</strong>{' '}
                      {[
                        dialogNoServicePartition.alreadyNoService.length > 0
                          ? `${dialogNoServicePartition.alreadyNoService.length} already marked No Service`
                          : null,
                        dialogNoServicePartition.placeholders.length > 0
                          ? `${dialogNoServicePartition.placeholders.length} un-saved monthly placeholder${
                              dialogNoServicePartition.placeholders.length === 1 ? '' : 's'
                            }`
                          : null
                      ]
                        .filter(Boolean)
                        .join(' and ')}
                      .
                    </div>
                  )}

                  {/* Explicit notice of cleared vs preserved data */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/[0.03] text-xs space-y-1.5 text-slate-600 dark:text-slate-300 leading-relaxed">
                    <div>
                      <strong className="text-rose-700 dark:text-rose-300">Cleared:</strong>{' '}
                      Praise &amp; Worship songs, performed keys, team assignments, transition notes, and rehearsal readiness checklist.
                    </div>
                    <div>
                      <strong className="text-emerald-700 dark:text-emerald-300">Preserved:</strong>{' '}
                      Service type, service date, record ID, and existing service notes. Press{' '}
                      <span className="font-semibold">Undo (Ctrl+Z)</span> to restore all converted records at once.
                    </div>
                  </div>
                </div>

                {/* Optional Reason / Announcement field */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="bulk-no-service-reason-input"
                    className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200"
                  >
                    <span>Reason / Announcement (Optional)</span>
                    <span className="text-[11px] font-mono font-normal text-slate-500 dark:text-slate-400">
                      {noServiceReasonInput.length}/{NO_SERVICE_REASON_MAX_LENGTH}
                    </span>
                  </label>
                  <textarea
                    ref={noServiceReasonRef}
                    id="bulk-no-service-reason-input"
                    rows={2}
                    maxLength={NO_SERVICE_REASON_MAX_LENGTH}
                    value={noServiceReasonInput}
                    disabled={isSubmittingNoService}
                    onChange={(e) => setNoServiceReasonInput(e.target.value)}
                    placeholder="e.g., Church Anniversary Combined Service, Camp Retreat, Holiday Break..."
                    className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-black text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-[#1b75bc]/40 focus:border-[#1b75bc] outline-none resize-none disabled:opacity-60"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {sortedDialogEligible.length > 1
                      ? 'If entered, this reason applies to all converted line-ups. Leave blank to omit.'
                      : 'Leave blank to save without a reason notice.'}
                  </p>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-100 dark:border-white/10 flex flex-wrap items-center justify-end gap-2.5 bg-slate-50/70 dark:bg-black/60">
                <button
                  type="button"
                  onClick={handleCloseNoServiceModal}
                  disabled={isSubmittingNoService}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-white/5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer min-h-[40px] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmNoService}
                  disabled={isSubmittingNoService || sortedDialogEligible.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Ban className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{isSubmittingNoService ? 'Saving...' : 'Mark as No Service'}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

