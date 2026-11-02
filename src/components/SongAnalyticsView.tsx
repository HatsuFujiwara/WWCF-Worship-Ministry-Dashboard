import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Schedule, Member, Song, SongFamily, CANONICAL_SERVICE_TYPES, CanonicalServiceType, normalizeServiceType } from '../types';
import {
  buildScheduleDateHierarchy,
  filterSchedulesByScope,
  calculateSameMonthRepeats,
  getPresetDateRange,
  getCanonicalSongIdentity,
  CheckboxScopeState,
  ReportSectionsSelection,
  DEFAULT_REPORT_SECTIONS,
  YearGroup,
  MonthGroup,
  WeekGroup
} from '../utils/analyticsScopeUtils';
import { calculateSongAnalytics, getScheduleSongLeaders } from '../utils/songAnalyticsUtils';
import { getManilaTodayString, formatDateDisplayManila } from '../utils/dateUtils';
import { getTagColorStyle } from '../utils/tagUtils';
import {
  BarChart3,
  Calendar,
  Filter,
  Download,
  FileText,
  Image as ImageIcon,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  MinusSquare,
  Music,
  Users,
  Repeat,
  Sparkles,
  Search,
  CheckCircle2,
  Clock,
  Layers,
  RotateCcw,
  SlidersHorizontal,
  Loader2,
  CalendarRange,
  Check,
  AlertCircle,
  Eye,
  ArrowRight
} from 'lucide-react';

interface SongAnalyticsViewProps {
  schedules: Schedule[];
  songs: Song[];
  members: Member[];
  songFamilies: SongFamily[];
  showToast: (msg: string, type?: 'success' | 'danger' | 'info') => void;
}

// Accessible Tri-State Checkbox
const TriStateCheckbox: React.FC<{
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  ariaLabel?: string;
  className?: string;
  id?: string;
}> = ({ checked, indeterminate = false, onChange, ariaLabel, className = '', id }) => {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = !checked && indeterminate;
    }
  }, [checked, indeterminate]);

  return (
    <input
      type="checkbox"
      id={id}
      ref={ref}
      checked={checked}
      onChange={onChange}
      aria-label={ariaLabel}
      className={`rounded text-blue-600 focus:ring-blue-500 cursor-pointer ${className}`}
    />
  );
};

export const SongAnalyticsView: React.FC<SongAnalyticsViewProps> = ({
  schedules,
  songs,
  members,
  songFamilies,
  showToast
}) => {
  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [rankingSearch, setRankingSearch] = useState('');
  const [selectedLeaderId, setSelectedLeaderId] = useState<string>('all');

  // Progressive Disclosure Panel Toggles
  const [isDateTreeExpanded, setIsDateTreeExpanded] = useState(false);
  const [isCrossYearMonthsExpanded, setIsCrossYearMonthsExpanded] = useState(false);
  const [isServicesPanelExpanded, setIsServicesPanelExpanded] = useState(false);
  const [sectionsMode, setSectionsMode] = useState<'standard' | 'custom'>('standard');
  const [previewTab, setPreviewTab] = useState<
    'all' | 'summary' | 'most_played' | 'song_leaders' | 'same_month' | 'lineup_register' | 'team_personnel' | 'unrotated'
  >('all');

  // Expanded tree states for Date Hierarchy Tree
  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({});
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  // Checkbox Scope State
  const [scope, setScope] = useState<CheckboxScopeState>(() => {
    return {
      mode: 'follow_saved',
      selectedYears: [],
      selectedMonths: [],
      selectedWeeks: [],
      selectedScheduleIds: [],
      selectedServiceTypes: [...CANONICAL_SERVICE_TYPES]
    };
  });

  // Report Sections Checkbox State
  const [sections, setSections] = useState<ReportSectionsSelection>(DEFAULT_REPORT_SECTIONS);

  // Date hierarchy tree from all saved schedules
  const dateHierarchy = useMemo(() => buildScheduleDateHierarchy(schedules), [schedules]);

  // Inline Date Range Validation: Start date must not be after end date
  const isDateRangeInvalid = useMemo(() => {
    return (
      scope.mode === 'date_range' &&
      Boolean(scope.customStartDate) &&
      Boolean(scope.customEndDate) &&
      scope.customStartDate! > scope.customEndDate!
    );
  }, [scope.mode, scope.customStartDate, scope.customEndDate]);

  // Filtered schedules according to active scope
  const { filteredSchedules, pastSchedules, upcomingSchedules } = useMemo(
    () => filterSchedulesByScope(schedules, scope),
    [schedules, scope]
  );

  // Detailed Song Analytics calculated ONLY from past-dated recorded usage to avoid inflation
  const analyticsData = useMemo(
    () => calculateSongAnalytics(pastSchedules, members, songs, songFamilies),
    [pastSchedules, members, songs, songFamilies]
  );

  // Same-calendar-month repeat calculations (month + year specific)
  const sameMonthRepeats = useMemo(
    () => calculateSameMonthRepeats(pastSchedules, songs, songFamilies),
    [pastSchedules, songs, songFamilies]
  );

  // Role & member assignment distribution in this period
  const memberServiceDistribution = useMemo(() => {
    const memberCounts = new Map<string, { member: Member; roles: Map<string, number>; totalServices: number }>();

    pastSchedules.forEach((s) => {
      (s.ministryAssignments || []).forEach((a) => {
        const assigned = a.assignedMembers || (a.memberId ? [{ memberId: a.memberId, memberName: a.memberName || '' }] : []);
        assigned.forEach((am) => {
          if (!am.memberId && (!am.memberName || am.memberName === 'Unassigned')) return;
          const key = am.memberId || am.memberName;
          const realMember = members.find((m) => m.id === am.memberId || m.name.toLowerCase() === am.memberName.toLowerCase());
          const displayMember: Member = realMember || {
            id: key,
            name: am.memberName || 'Member',
            labels: []
          };

          let entry = memberCounts.get(key);
          if (!entry) {
            entry = {
              member: displayMember,
              roles: new Map(),
              totalServices: 0
            };
            memberCounts.set(key, entry);
          }
          entry.totalServices += 1;
          const roleName = a.role || 'Volunteer';
          entry.roles.set(roleName, (entry.roles.get(roleName) || 0) + 1);
        });
      });
    });

    return Array.from(memberCounts.values()).sort((a, b) => b.totalServices - a.totalServices);
  }, [pastSchedules, members]);

  // Catalog songs not used during this period (rotation candidates, Song Family aware)
  const unrotatedSongs = useMemo(() => {
    const usedCanonicalKeys = new Set<string>();
    pastSchedules.forEach((s) => {
      [...(s.praiseSongs || []), ...(s.worshipSongs || [])].forEach((title) => {
        if (!title || !title.trim()) return;
        const identity = getCanonicalSongIdentity(title, songs, songFamilies);
        usedCanonicalKeys.add(identity.canonicalKey);
      });
    });

    return (songs || [])
      .filter((s) => {
        const identity = getCanonicalSongIdentity(s.title, songs, songFamilies);
        return !usedCanonicalKeys.has(identity.canonicalKey);
      })
      .sort((a, b) => {
        const dateA = a.lastUsedDate || '1970-01-01';
        const dateB = b.lastUsedDate || '1970-01-01';
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return a.title.localeCompare(b.title);
      });
  }, [pastSchedules, songs, songFamilies]);

  // Filtered ranking list
  const filteredRankings = useMemo(() => {
    if (!rankingSearch.trim()) return analyticsData.mostUsedSongs;
    const q = rankingSearch.toLowerCase().trim();
    return analyticsData.mostUsedSongs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.lastSungBy.toLowerCase().includes(q) ||
        s.mostUsedBy.toLowerCase().includes(q)
    );
  }, [analyticsData, rankingSearch]);

  // Selected Song Leader profile
  const songLeadersList = analyticsData.songLeaderMembers;

  // Active section count
  const activeSectionsCount = useMemo(() => {
    return Object.values(sections).filter(Boolean).length;
  }, [sections]);

  // Is export disabled
  const isExportDisabled = useMemo(() => {
    return (
      isExporting ||
      filteredSchedules.length === 0 ||
      activeSectionsCount === 0 ||
      isDateRangeInvalid
    );
  }, [isExporting, filteredSchedules.length, activeSectionsCount, isDateRangeInvalid]);

  // Scope recap description
  const scopeSummaryText = useMemo(() => {
    if (scope.mode === 'all') return 'All saved history';
    if (scope.mode === 'follow_saved') return 'Matching Saved Lineups filters';
    if (scope.mode === 'date_range') {
      if (scope.customStartDate && scope.customEndDate) {
        if (scope.customStartDate > scope.customEndDate) return 'Invalid date range';
        return `${formatDateDisplayManila(scope.customStartDate, { month: 'short', day: 'numeric', year: 'numeric' })} – ${formatDateDisplayManila(scope.customEndDate, { month: 'short', day: 'numeric', year: 'numeric' })}`;
      }
      if (scope.customStartDate) return `From ${formatDateDisplayManila(scope.customStartDate)}`;
      if (scope.customEndDate) return `Up to ${formatDateDisplayManila(scope.customEndDate)}`;
      return 'Custom date range';
    }
    if (scope.mode === 'specific_dates' || scope.mode === 'custom') {
      const parts: string[] = [];
      if (scope.selectedYears.length > 0) parts.push(`${scope.selectedYears.length} yr`);
      if (scope.selectedMonths.length > 0) parts.push(`${scope.selectedMonths.length} mo`);
      if (scope.selectedWeeks.length > 0) parts.push(`${scope.selectedWeeks.length} wk`);
      if (parts.length > 0) return `Selected: ${parts.join(', ')}`;
      return 'Specific date selection';
    }
    return 'Custom selection';
  }, [scope]);

  // Check if every month across all years is selected for a given month number (1-12)
  const isEveryMonthSelected = (monthNum: number) => {
    const matching = dateHierarchy.flatMap((y) => y.months).filter((m) => m.monthNumber === monthNum);
    return matching.length > 0 && matching.every((m) => scope.selectedMonths.includes(m.monthKey));
  };

  // Smooth jump helpers
  const jumpTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Scope Preset Handlers
  const handleSelectThisMonth = () => {
    const range = getPresetDateRange('this_month');
    setScope({
      ...scope,
      mode: 'date_range',
      customStartDate: range.startDate,
      customEndDate: range.endDate
    });
  };

  const handleSelectThisYear = () => {
    const range = getPresetDateRange('this_year');
    setScope({
      ...scope,
      mode: 'date_range',
      customStartDate: range.startDate,
      customEndDate: range.endDate
    });
  };

  const handleSelectAllHistory = () => {
    setScope({
      ...scope,
      mode: 'all',
      customStartDate: '',
      customEndDate: ''
    });
  };

  const handleClearSelection = () => {
    setScope({
      ...scope,
      mode: 'custom',
      selectedYears: [],
      selectedMonths: [],
      selectedWeeks: [],
      selectedScheduleIds: [],
      customStartDate: '',
      customEndDate: ''
    });
  };

  const handleSelectAllServices = () => {
    setScope({
      ...scope,
      selectedServiceTypes: [...CANONICAL_SERVICE_TYPES]
    });
  };

  const toggleServiceType = (st: CanonicalServiceType) => {
    const exists = scope.selectedServiceTypes.includes(st);
    const next = exists
      ? scope.selectedServiceTypes.filter((t) => t !== st)
      : [...scope.selectedServiceTypes, st];
    setScope({
      ...scope,
      selectedServiceTypes: next
    });
  };

  // Tri-state helpers for Date Hierarchy Tree
  const toggleYearSelection = (yearGroup: YearGroup) => {
    const yearStr = String(yearGroup.year);
    const isYearSelected = scope.selectedYears.includes(yearStr);

    let nextYears: string[];
    let nextMonths = [...scope.selectedMonths];
    let nextScheduleIds = [...scope.selectedScheduleIds];

    if (isYearSelected) {
      nextYears = scope.selectedYears.filter((y) => y !== yearStr);
      const yearMonthKeys = new Set(yearGroup.months.map((m) => m.monthKey));
      nextMonths = nextMonths.filter((m) => !yearMonthKeys.has(m));
      const yearSchedSet = new Set(yearGroup.scheduleIds);
      nextScheduleIds = nextScheduleIds.filter((id) => !yearSchedSet.has(id));
    } else {
      nextYears = [...scope.selectedYears, yearStr];
      const yearMonthKeys = yearGroup.months.map((m) => m.monthKey);
      nextMonths = Array.from(new Set([...nextMonths, ...yearMonthKeys]));
      nextScheduleIds = Array.from(new Set([...nextScheduleIds, ...yearGroup.scheduleIds]));
    }

    setScope({
      ...scope,
      mode: 'specific_dates',
      selectedYears: nextYears,
      selectedMonths: nextMonths,
      selectedScheduleIds: nextScheduleIds
    });
  };

  const toggleMonthSelection = (monthGroup: MonthGroup, yearGroup: YearGroup) => {
    const isMonthSelected = scope.selectedMonths.includes(monthGroup.monthKey);
    let nextMonths: string[];
    let nextScheduleIds = [...scope.selectedScheduleIds];

    if (isMonthSelected) {
      nextMonths = scope.selectedMonths.filter((m) => m !== monthGroup.monthKey);
      const monthSchedSet = new Set(monthGroup.scheduleIds);
      nextScheduleIds = nextScheduleIds.filter((id) => !monthSchedSet.has(id));
    } else {
      nextMonths = [...scope.selectedMonths, monthGroup.monthKey];
      nextScheduleIds = Array.from(new Set([...nextScheduleIds, ...monthGroup.scheduleIds]));
    }

    const allMonthsOfYr = yearGroup.months.map((m) => m.monthKey);
    const allSelected = allMonthsOfYr.every((mKey) => nextMonths.includes(mKey));
    const yearStr = String(yearGroup.year);
    let nextYears = [...scope.selectedYears];
    if (allSelected && !nextYears.includes(yearStr)) {
      nextYears.push(yearStr);
    } else if (!allSelected) {
      nextYears = nextYears.filter((y) => y !== yearStr);
    }

    setScope({
      ...scope,
      mode: 'specific_dates',
      selectedYears: nextYears,
      selectedMonths: nextMonths,
      selectedScheduleIds: nextScheduleIds
    });
  };

  const toggleWeekSelection = (weekGroup: WeekGroup, monthGroup: MonthGroup, yearGroup: YearGroup) => {
    const allWeekSchedsSelected = weekGroup.scheduleIds.every((id) => scope.selectedScheduleIds.includes(id));
    let nextScheduleIds = [...scope.selectedScheduleIds];
    let nextWeeks = [...scope.selectedWeeks];

    if (allWeekSchedsSelected) {
      const weekSchedSet = new Set(weekGroup.scheduleIds);
      nextScheduleIds = nextScheduleIds.filter((id) => !weekSchedSet.has(id));
      nextWeeks = nextWeeks.filter((w) => w !== weekGroup.weekKey);
    } else {
      nextScheduleIds = Array.from(new Set([...nextScheduleIds, ...weekGroup.scheduleIds]));
      if (!nextWeeks.includes(weekGroup.weekKey)) {
        nextWeeks.push(weekGroup.weekKey);
      }
    }

    const allMonthSchedsSelected = monthGroup.scheduleIds.every((id) => nextScheduleIds.includes(id));
    let nextMonths = [...scope.selectedMonths];
    if (allMonthSchedsSelected && !nextMonths.includes(monthGroup.monthKey)) {
      nextMonths.push(monthGroup.monthKey);
    } else if (!allMonthSchedsSelected) {
      nextMonths = nextMonths.filter((m) => m !== monthGroup.monthKey);
    }

    const allYearSchedsSelected = yearGroup.scheduleIds.every((id) => nextScheduleIds.includes(id));
    const yearStr = String(yearGroup.year);
    let nextYears = [...scope.selectedYears];
    if (allYearSchedsSelected && !nextYears.includes(yearStr)) {
      nextYears.push(yearStr);
    } else if (!allYearSchedsSelected) {
      nextYears = nextYears.filter((y) => y !== yearStr);
    }

    setScope({
      ...scope,
      mode: 'specific_dates',
      selectedYears: nextYears,
      selectedMonths: nextMonths,
      selectedWeeks: nextWeeks,
      selectedScheduleIds: nextScheduleIds
    });
  };

  const toggleEveryMonthAcrossYears = (monthNumber: number) => {
    const matchingMonths: MonthGroup[] = [];
    dateHierarchy.forEach((y) => {
      y.months.forEach((m) => {
        if (m.monthNumber === monthNumber) matchingMonths.push(m);
      });
    });

    const allCurrentlySelected =
      matchingMonths.length > 0 && matchingMonths.every((m) => scope.selectedMonths.includes(m.monthKey));
    let nextMonths = [...scope.selectedMonths];
    let nextSchedIds = [...scope.selectedScheduleIds];

    if (allCurrentlySelected) {
      const unselectKeys = new Set(matchingMonths.map((m) => m.monthKey));
      nextMonths = nextMonths.filter((mKey) => !unselectKeys.has(mKey));
      const unselectScheds = new Set(matchingMonths.flatMap((m) => m.scheduleIds));
      nextSchedIds = nextSchedIds.filter((id) => !unselectScheds.has(id));
    } else {
      const addKeys = matchingMonths.map((m) => m.monthKey);
      nextMonths = Array.from(new Set([...nextMonths, ...addKeys]));
      const addScheds = matchingMonths.flatMap((m) => m.scheduleIds);
      nextSchedIds = Array.from(new Set([...nextSchedIds, ...addScheds]));
    }

    setScope({
      ...scope,
      mode: 'specific_dates',
      selectedMonths: nextMonths,
      selectedScheduleIds: nextSchedIds
    });
  };

  // Section Toggles
  const handleSelectStandardSections = () => {
    setSectionsMode('standard');
    setSections(DEFAULT_REPORT_SECTIONS);
  };

  const handleSelectAllSections = () => {
    setSectionsMode('custom');
    setSections({
      summaryMetrics: true,
      mostPlayedRanking: true,
      songLeaderUsage: true,
      sameMonthRepeats: true,
      lineupRegister: true,
      assignedMembers: true,
      lessUsedSongs: true
    });
  };

  const handleDeselectAllSections = () => {
    setSectionsMode('custom');
    setSections({
      summaryMetrics: false,
      mostPlayedRanking: false,
      songLeaderUsage: false,
      sameMonthRepeats: false,
      lineupRegister: false,
      assignedMembers: false,
      lessUsedSongs: false
    });
  };

  const toggleSection = (key: keyof ReportSectionsSelection) => {
    setSectionsMode('custom');
    setSections((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // PDF & PNG Exporters with dynamic lazy-loading and bounded canvas scale
  const handleExportPDF = async () => {
    if (!reportRef.current || isExportDisabled) return;
    setIsExporting(true);
    try {
      showToast('Loading export engine and generating official PDF report...', 'info');

      // Lazy-load export dependencies dynamically
      const [html2canvasModule, jsPdfModule] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);
      const html2canvas = (html2canvasModule as any).default || html2canvasModule;
      const { jsPDF } = jsPdfModule;

      const canvas = await html2canvas(reportRef.current, {
        scale: Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2, 2),
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth - 20; // 10mm margins
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 10;

      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight - 20;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight - 20;
      }

      const todayStr = getManilaTodayString();
      pdf.save(`WWCF_Worship_Ministry_Report_${todayStr}.pdf`);
      showToast('PDF report downloaded successfully!', 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      showToast('Failed to export PDF report.', 'danger');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPNG = async () => {
    if (!reportRef.current || isExportDisabled) return;
    setIsExporting(true);
    try {
      showToast('Loading export engine and rendering high-resolution PNG...', 'info');

      // Lazy-load html2canvas dynamically
      const html2canvasModule = await import('html2canvas');
      const html2canvas = (html2canvasModule as any).default || html2canvasModule;

      const canvas = await html2canvas(reportRef.current, {
        scale: Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2, 2),
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const todayStr = getManilaTodayString();
      link.download = `WWCF_Worship_Ministry_Report_${todayStr}.png`;
      link.href = imgData;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('PNG image downloaded successfully!', 'success');
    } catch (err) {
      console.error('PNG export error:', err);
      showToast('Failed to export PNG image.', 'danger');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 pb-24 max-w-7xl mx-auto">
      {/* ─────────────────────────────────────────────────────────────
          COMPACT TOP BAR: Live Status & Jump Action
      ───────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Report Builder
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              {isDateRangeInvalid
                ? 'Invalid date range'
                : filteredSchedules.length === 0
                ? '0 lineups match'
                : `${pastSchedules.length} recorded${upcomingSchedules.length > 0 ? ` · ${upcomingSchedules.length} upcoming` : ''} · ${scopeSummaryText}`}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Compile worship lineups and song insights.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => jumpTo(previewRef)}
            className="py-2 px-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Eye className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Jump to Preview</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          STEP 1: CHOOSE LINEUPS
      ───────────────────────────────────────────────────────────── */}
      <section
        ref={step1Ref}
        aria-labelledby="step-1-heading"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
      >
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-850/40">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-xl bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-2xs">
              1
            </span>
            <div>
              <h2
                id="step-1-heading"
                className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"
              >
                <span>Choose Lineups</span>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  ({filteredSchedules.length} selected)
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select the time period and service types to include in this report
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsServicesPanelExpanded(!isServicesPanelExpanded)}
            className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Music className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>
              Services ({scope.selectedServiceTypes.length}/{CANONICAL_SERVICE_TYPES.length})
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${isServicesPanelExpanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5">
          {/* 4 Clean Mode Buttons */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              Selection Mode:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* Option A: Follow Saved Lineups */}
              <button
                type="button"
                onClick={() => setScope({ ...scope, mode: 'follow_saved' })}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  scope.mode === 'follow_saved'
                    ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 shadow-2xs ring-1 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="text-xs font-bold">Follow Saved Lineups filters</span>
                  {scope.mode === 'follow_saved' && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Default: reads active search and filters from Saved Lineups without modifying them
                </span>
              </button>

              {/* Option B: Date Range */}
              <button
                type="button"
                onClick={() => setScope({ ...scope, mode: 'date_range' })}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  scope.mode === 'date_range'
                    ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 shadow-2xs ring-1 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="text-xs font-bold">Choose a date range</span>
                  {scope.mode === 'date_range' && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Select start and end dates or choose presets like This Month or This Year
                </span>
              </button>

              {/* Option C: Specific Dates Tree */}
              <button
                type="button"
                onClick={() => {
                  setScope({ ...scope, mode: 'specific_dates' });
                  setIsDateTreeExpanded(true);
                }}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  scope.mode === 'specific_dates' || scope.mode === 'custom'
                    ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 shadow-2xs ring-1 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="text-xs font-bold">Choose specific dates</span>
                  {(scope.mode === 'specific_dates' || scope.mode === 'custom') && (
                    <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  )}
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Check individual years, months, or Monday–Sunday calendar weeks
                </span>
              </button>

              {/* Option D: All History */}
              <button
                type="button"
                onClick={handleSelectAllHistory}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  scope.mode === 'all'
                    ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 shadow-2xs ring-1 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="text-xs font-bold">All history</span>
                  {scope.mode === 'all' && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Explicitly selects all eligible saved lineup records across all years
                </span>
              </button>
            </div>
          </div>

          {/* Date Range Inputs & Presets (Disclosed only when mode is date_range) */}
          {scope.mode === 'date_range' && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-slate-700 dark:text-slate-300 mr-1">Presets:</span>
                  <button
                    type="button"
                    onClick={handleSelectThisMonth}
                    className="py-1 px-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-750 cursor-pointer text-slate-700 dark:text-slate-200 shadow-2xs"
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectThisYear}
                    className="py-1 px-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-750 cursor-pointer text-slate-700 dark:text-slate-200 shadow-2xs"
                  >
                    This Year
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectAllHistory}
                    className="py-1 px-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-750 cursor-pointer text-slate-700 dark:text-slate-200 shadow-2xs"
                  >
                    All History
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="py-1 px-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer text-rose-600 dark:text-rose-400 shadow-2xs"
                  >
                    Clear Selection
                  </button>
                </div>

                {/* Date Pickers */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-500 font-medium">Custom Range:</span>
                  <input
                    type="date"
                    value={scope.customStartDate || ''}
                    onChange={(e) =>
                      setScope({
                        ...scope,
                        mode: 'date_range',
                        customStartDate: e.target.value
                      })
                    }
                    className={`px-2.5 py-1 rounded-lg border bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs outline-none focus:ring-1 focus:ring-blue-500 ${
                      isDateRangeInvalid ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-200 dark:border-slate-700'
                    }`}
                    aria-label="Start date"
                  />
                  <span className="text-slate-400">to</span>
                  <input
                    type="date"
                    value={scope.customEndDate || ''}
                    onChange={(e) =>
                      setScope({
                        ...scope,
                        mode: 'date_range',
                        customEndDate: e.target.value
                      })
                    }
                    className={`px-2.5 py-1 rounded-lg border bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs outline-none focus:ring-1 focus:ring-blue-500 ${
                      isDateRangeInvalid ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-200 dark:border-slate-700'
                    }`}
                    aria-label="End date"
                  />
                </div>
              </div>

              {/* Inline Date Range Validation Error */}
              {isDateRangeInvalid && (
                <div
                  role="alert"
                  className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    <strong>Invalid Date Range:</strong> Start date ({scope.customStartDate}) cannot be after End date ({scope.customEndDate}). Please adjust the range before exporting.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Collapsible Specific Dates Tree Disclosure */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setIsDateTreeExpanded(!isDateTreeExpanded)}
              className="w-full p-3 bg-slate-50/70 dark:bg-slate-850/50 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>Choose specific months or weeks (Hierarchical Tree)</span>
                {scope.selectedScheduleIds.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                    {scope.selectedScheduleIds.length} checked
                  </span>
                )}
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isDateTreeExpanded ? 'rotate-180' : ''}`}
              />
            </button>

            {isDateTreeExpanded && (
              <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Selecting a year or month selects all lineups beneath it. Calendar weeks follow complete Monday–Sunday intervals without cross-month splitting.
                </p>

                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-750 p-2 space-y-2 text-xs">
                  {dateHierarchy.length === 0 ? (
                    <p className="text-slate-400 py-3 text-center">No saved lineup dates found.</p>
                  ) : (
                    dateHierarchy.map((yearGroup) => {
                      const yrStr = String(yearGroup.year);
                      const isYrSelected = scope.selectedYears.includes(yrStr);
                      const someYrSchedsSelected = yearGroup.scheduleIds.some((id) =>
                        scope.selectedScheduleIds.includes(id)
                      );
                      const isYrExpanded = expandedYears[yearGroup.year] !== false;

                      return (
                        <div
                          key={yearGroup.year}
                          className="border border-slate-100 dark:border-slate-800 rounded-lg p-2 bg-slate-50/50 dark:bg-slate-850/30"
                        >
                          {/* Year Row */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedYears((prev) => ({
                                    ...prev,
                                    [yearGroup.year]: !isYrExpanded
                                  }))
                                }
                                className="p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                                aria-label={`Toggle Year ${yearGroup.year}`}
                              >
                                <ChevronRight
                                  className={`w-3.5 h-3.5 transition-transform ${isYrExpanded ? 'rotate-90' : ''}`}
                                />
                              </button>

                              <div className="flex items-center gap-2">
                                <TriStateCheckbox
                                  checked={isYrSelected}
                                  indeterminate={!isYrSelected && someYrSchedsSelected}
                                  onChange={() => toggleYearSelection(yearGroup)}
                                  ariaLabel={`Select Year ${yearGroup.year}`}
                                />
                                <span
                                  onClick={() => toggleYearSelection(yearGroup)}
                                  className="cursor-pointer font-bold text-slate-900 dark:text-slate-100"
                                >
                                  Year {yearGroup.year}
                                </span>
                              </div>
                            </div>

                            <span className="text-[11px] text-slate-400">
                              {yearGroup.scheduleIds.length} lineups
                            </span>
                          </div>

                          {/* Months under Year */}
                          {isYrExpanded && (
                            <div className="pl-6 pt-2 space-y-1.5">
                              {yearGroup.months.map((monthGroup) => {
                                const isMSelected = scope.selectedMonths.includes(monthGroup.monthKey);
                                const someMSchedsSelected = monthGroup.scheduleIds.some((id) =>
                                  scope.selectedScheduleIds.includes(id)
                                );
                                const isMExpanded = Boolean(expandedMonths[monthGroup.monthKey]);

                                return (
                                  <div key={monthGroup.monthKey} className="space-y-1">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setExpandedMonths((prev) => ({
                                              ...prev,
                                              [monthGroup.monthKey]: !isMExpanded
                                            }))
                                          }
                                          className="p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                                          aria-label={`Toggle Month ${monthGroup.monthName}`}
                                        >
                                          <ChevronRight
                                            className={`w-3 h-3 transition-transform ${isMExpanded ? 'rotate-90' : ''}`}
                                          />
                                        </button>

                                        <div className="flex items-center gap-1.5">
                                          <TriStateCheckbox
                                            checked={isMSelected}
                                            indeterminate={!isMSelected && someMSchedsSelected}
                                            onChange={() => toggleMonthSelection(monthGroup, yearGroup)}
                                            ariaLabel={`Select Month ${monthGroup.monthName} ${yearGroup.year}`}
                                          />
                                          <span
                                            onClick={() => toggleMonthSelection(monthGroup, yearGroup)}
                                            className="cursor-pointer font-semibold text-slate-800 dark:text-slate-200"
                                          >
                                            {monthGroup.monthName}
                                          </span>
                                        </div>
                                      </div>

                                      <span className="text-[10px] text-slate-400">
                                        {monthGroup.scheduleIds.length} lineups
                                      </span>
                                    </div>

                                    {/* Weeks under Month */}
                                    {isMExpanded && (
                                      <div className="pl-6 space-y-1 pt-1 border-l border-slate-200 dark:border-slate-800 ml-2">
                                        {monthGroup.weeks.map((weekGroup) => {
                                          const allWkSelected = weekGroup.scheduleIds.every((id) =>
                                            scope.selectedScheduleIds.includes(id)
                                          );

                                          return (
                                            <div
                                              key={weekGroup.weekKey}
                                              className="w-full flex items-center justify-between text-left py-0.5 px-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                                            >
                                              <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                                                <TriStateCheckbox
                                                  checked={allWkSelected}
                                                  onChange={() =>
                                                    toggleWeekSelection(weekGroup, monthGroup, yearGroup)
                                                  }
                                                  ariaLabel={`Select week ${weekGroup.label}`}
                                                />
                                                <span
                                                  onClick={() =>
                                                    toggleWeekSelection(weekGroup, monthGroup, yearGroup)
                                                  }
                                                  className="cursor-pointer"
                                                >
                                                  {weekGroup.label}
                                                </span>
                                              </div>
                                              <span className="text-[10px] text-slate-400">
                                                {weekGroup.scheduleIds.length}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Secondary "Same month across years" disclosure */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setIsCrossYearMonthsExpanded(!isCrossYearMonthsExpanded)}
              className="w-full p-2.5 bg-slate-50/70 dark:bg-slate-850/50 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                <CalendarRange className="w-3.5 h-3.5 text-slate-500" />
                <span>Same month across all years (e.g. toggle all Octobers)</span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isCrossYearMonthsExpanded ? 'rotate-180' : ''}`}
              />
            </button>

            {isCrossYearMonthsExpanded && (
              <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(
                  (mLabel, idx) => {
                    const isSelected = isEveryMonthSelected(idx + 1);
                    return (
                      <button
                        key={mLabel}
                        type="button"
                        onClick={() => toggleEveryMonthAcrossYears(idx + 1)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer shadow-2xs ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 font-bold'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950 dark:hover:text-blue-300 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        All {mLabel}
                      </button>
                    );
                  }
                )}
              </div>
            )}
          </div>

          {/* Collapsible Canonical Services Panel */}
          {isServicesPanelExpanded && (
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5 text-blue-600" />
                  Canonical Service Types
                </span>
                <button
                  type="button"
                  onClick={handleSelectAllServices}
                  className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Select All Services
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {CANONICAL_SERVICE_TYPES.map((st) => {
                  const isChecked = scope.selectedServiceTypes.includes(st);
                  return (
                    <label
                      key={st}
                      className={`flex items-center gap-2 cursor-pointer p-2 rounded-lg border transition-colors ${
                        isChecked
                          ? 'bg-blue-50/60 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 font-medium'
                          : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-750 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleServiceType(st)}
                        className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span>{st}</span>
                    </label>
                  );
                })}
              </div>

              {scope.selectedServiceTypes.length === 0 && (
                <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>No service types selected. This produces 0 matching lineups.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          STEP 2: CHOOSE WHAT TO INCLUDE
      ───────────────────────────────────────────────────────────── */}
      <section
        ref={step2Ref}
        aria-labelledby="step-2-heading"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
      >
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-850/40">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-xl bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-2xs">
              2
            </span>
            <div>
              <h2
                id="step-2-heading"
                className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"
              >
                <span>Choose What to Include</span>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  ({activeSectionsCount} of 7 sections selected)
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pick standard ministry analytics or customize specific report tables
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSelectStandardSections}
              className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                sectionsMode === 'standard' && activeSectionsCount === 7
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-750 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              Standard (All 7)
            </button>
            <button
              type="button"
              onClick={() => setSectionsMode('custom')}
              className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                sectionsMode === 'custom' || activeSectionsCount < 7
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-750 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              Customize
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          {sectionsMode === 'standard' ? (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    Standard Ministry Report Selected (All 7 Sections)
                  </span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[11px] pl-6">
                  Includes Summary KPI Metrics, Most-Played Songs, Song Leader Favorites, Same-Month Repeats, Lineup Register, Team Personnel, and Unrotated Suggestions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSectionsMode('custom')}
                className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 font-semibold text-xs cursor-pointer shadow-2xs shrink-0 self-start sm:self-auto"
              >
                Customize Sections
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  Sections to be rendered on screen and included in PDF/PNG export:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllSections}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <button
                    type="button"
                    onClick={handleDeselectAllSections}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:underline cursor-pointer font-medium"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
            {/* Section 1 */}
            <label
              className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-colors ${
                sections.summaryMetrics
                  ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/60'
                  : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-750 opacity-70'
              }`}
            >
              <input
                type="checkbox"
                checked={sections.summaryMetrics}
                onChange={() => toggleSection('summaryMetrics')}
                className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer mt-0.5"
              />
              <div>
                <span className="font-bold text-slate-900 dark:text-slate-100 block">
                  1. Summary KPI Metrics
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight block mt-0.5">
                  Lineup count, total placements, unique songs, repeats, upcoming setlists
                </span>
              </div>
            </label>

            {/* Section 2 */}
            <label
              className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-colors ${
                sections.mostPlayedRanking
                  ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/60'
                  : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-750 opacity-70'
              }`}
            >
              <input
                type="checkbox"
                checked={sections.mostPlayedRanking}
                onChange={() => toggleSection('mostPlayedRanking')}
                className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer mt-0.5"
              />
              <div>
                <span className="font-bold text-slate-900 dark:text-slate-100 block">
                  2. Most-Played Songs
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight block mt-0.5">
                  Frequency ranking, song family breakdowns, last sung date & leaders
                </span>
              </div>
            </label>

            {/* Section 3 */}
            <label
              className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-colors ${
                sections.songLeaderUsage
                  ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/60'
                  : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-750 opacity-70'
              }`}
            >
              <input
                type="checkbox"
                checked={sections.songLeaderUsage}
                onChange={() => toggleSection('songLeaderUsage')}
                className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer mt-0.5"
              />
              <div>
                <span className="font-bold text-slate-900 dark:text-slate-100 block">
                  3. Song Leader Favorites
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight block mt-0.5">
                  Personal leader favorite songs (using standard ≥2 plays threshold)
                </span>
              </div>
            </label>

            {/* Section 4 */}
            <label
              className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-colors ${
                sections.sameMonthRepeats
                  ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/60'
                  : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-750 opacity-70'
              }`}
            >
              <input
                type="checkbox"
                checked={sections.sameMonthRepeats}
                onChange={() => toggleSection('sameMonthRepeats')}
                className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer mt-0.5"
              />
              <div>
                <span className="font-bold text-slate-900 dark:text-slate-100 block">
                  4. Same-Month Repeats
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight block mt-0.5">
                  Flags songs sung multiple times within the exact same calendar month and year
                </span>
              </div>
            </label>

            {/* Section 5 */}
            <label
              className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-colors ${
                sections.lineupRegister
                  ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/60'
                  : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-750 opacity-70'
              }`}
            >
              <input
                type="checkbox"
                checked={sections.lineupRegister}
                onChange={() => toggleSection('lineupRegister')}
                className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer mt-0.5"
              />
              <div>
                <span className="font-bold text-slate-900 dark:text-slate-100 block">
                  5. Lineup Register
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight block mt-0.5">
                  Chronological log of service setlists with Played vs Upcoming status tags
                </span>
              </div>
            </label>

            {/* Section 6 */}
            <label
              className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-colors ${
                sections.assignedMembers
                  ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/60'
                  : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-750 opacity-70'
              }`}
            >
              <input
                type="checkbox"
                checked={sections.assignedMembers}
                onChange={() => toggleSection('assignedMembers')}
                className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer mt-0.5"
              />
              <div>
                <span className="font-bold text-slate-900 dark:text-slate-100 block">
                  6. Assigned Team Roles
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight block mt-0.5">
                  Roster members who served and their service frequency by role
                </span>
              </div>
            </label>

            {/* Section 7 */}
            <label
              className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-colors md:col-span-2 lg:col-span-3 ${
                sections.lessUsedSongs
                  ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/60'
                  : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-750 opacity-70'
              }`}
            >
              <input
                type="checkbox"
                checked={sections.lessUsedSongs}
                onChange={() => toggleSection('lessUsedSongs')}
                className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer mt-0.5"
              />
              <div>
                <span className="font-bold text-slate-900 dark:text-slate-100 block">
                  7. Unrotated Songs (Rotation Suggestions)
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight block mt-0.5">
                  Catalog songs never sung in this period, useful for planning fresh upcoming lineups
                </span>
              </div>
            </label>
          </div>
            </>
          )}

          {activeSectionsCount === 0 && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>All report sections are deselected. Select at least one section to view or export.</span>
              </div>
              <button
                type="button"
                onClick={handleSelectStandardSections}
                className="py-1 px-2.5 rounded-lg bg-amber-600 text-white font-semibold cursor-pointer shrink-0 text-[11px]"
              >
                Restore Standard
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          STEP 3: REVIEW / REPORT PREVIEW
      ───────────────────────────────────────────────────────────── */}
      <section ref={previewRef} aria-labelledby="step-3-heading" className="space-y-4">
        {/* Scope Recap & Action Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-xl bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-2xs">
              3
            </span>
            <div>
              <h2
                id="step-3-heading"
                className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"
              >
                <span>Review Generated Report</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Scope: <span className="font-semibold text-slate-800 dark:text-slate-200">{scopeSummaryText}</span> ·{' '}
                {filteredSchedules.length} lineups ({pastSchedules.length} past, {upcomingSchedules.length} upcoming) ·{' '}
                {activeSectionsCount} sections included
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => jumpTo(step1Ref)}
              className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors cursor-pointer shadow-2xs"
            >
              Edit Scope
            </button>
            <button
              type="button"
              onClick={() => jumpTo(step2Ref)}
              className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors cursor-pointer shadow-2xs"
            >
              Edit Contents
            </button>
          </div>
        </div>

        {/* Section Navigation Tab Bar (Quick Filter in Preview) */}
        {!isDateRangeInvalid && filteredSchedules.length > 0 && activeSectionsCount > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              type="button"
              onClick={() => setPreviewTab('all')}
              className={`py-1.5 px-3 rounded-xl font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                previewTab === 'all'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              All Sections
            </button>
            {sections.summaryMetrics && (
              <button
                type="button"
                onClick={() => setPreviewTab('summary')}
                className={`py-1.5 px-3 rounded-xl font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  previewTab === 'summary'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                1. Summary
              </button>
            )}
            {sections.mostPlayedRanking && (
              <button
                type="button"
                onClick={() => setPreviewTab('most_played')}
                className={`py-1.5 px-3 rounded-xl font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  previewTab === 'most_played'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                2. Most-Played
              </button>
            )}
            {sections.songLeaderUsage && (
              <button
                type="button"
                onClick={() => setPreviewTab('song_leaders')}
                className={`py-1.5 px-3 rounded-xl font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  previewTab === 'song_leaders'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                3. Song Leaders
              </button>
            )}
            {sections.sameMonthRepeats && (
              <button
                type="button"
                onClick={() => setPreviewTab('same_month')}
                className={`py-1.5 px-3 rounded-xl font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  previewTab === 'same_month'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                4. Repeats
              </button>
            )}
            {sections.lineupRegister && (
              <button
                type="button"
                onClick={() => setPreviewTab('lineup_register')}
                className={`py-1.5 px-3 rounded-xl font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  previewTab === 'lineup_register'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                5. Lineup Register
              </button>
            )}
            {sections.assignedMembers && (
              <button
                type="button"
                onClick={() => setPreviewTab('team_personnel')}
                className={`py-1.5 px-3 rounded-xl font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  previewTab === 'team_personnel'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                6. Team Roles
              </button>
            )}
            {sections.lessUsedSongs && (
              <button
                type="button"
                onClick={() => setPreviewTab('unrotated')}
                className={`py-1.5 px-3 rounded-xl font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  previewTab === 'unrotated'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                7. Unrotated Songs
              </button>
            )}
          </div>
        )}

        {/* USEFUL EMPTY STATE / INVALID DATE STATE */}
        {isDateRangeInvalid ? (
          <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-2xl p-8 sm:p-12 text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                Invalid Date Range Selected
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                Start date (<strong>{scope.customStartDate}</strong>) is after End date (<strong>{scope.customEndDate}</strong>). Please adjust your range using the buttons below.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleSelectThisMonth}
                className="py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-2xs"
              >
                Set to This Month
              </button>
              <button
                type="button"
                onClick={handleSelectThisYear}
                className="py-2 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer shadow-2xs"
              >
                Set to This Year
              </button>
              <button
                type="button"
                onClick={handleClearSelection}
                className="py-2 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-rose-600 dark:text-rose-400 font-semibold text-xs transition-colors cursor-pointer shadow-2xs"
              >
                Clear Dates
              </button>
            </div>
          </div>
        ) : filteredSchedules.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 sm:p-12 text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
              <CalendarRange className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                No lineups match your current selection
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Active scope is set to <span className="font-semibold text-slate-700 dark:text-slate-300">{scopeSummaryText}</span> with{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {scope.selectedServiceTypes.length} of {CANONICAL_SERVICE_TYPES.length}
                </span>{' '}
                services selected.
              </p>
            </div>

            {/* Quick Recovery Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleSelectAllHistory}
                className="py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-2xs"
              >
                View All History
              </button>
              <button
                type="button"
                onClick={handleSelectThisYear}
                className="py-2 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer shadow-2xs"
              >
                Select This Year
              </button>
              <button
                type="button"
                onClick={handleSelectAllServices}
                className="py-2 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer shadow-2xs"
              >
                Select All Services
              </button>
              <button
                type="button"
                onClick={handleSelectThisMonth}
                className="py-2 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer shadow-2xs"
              >
                This Month
              </button>
            </div>
          </div>
        ) : activeSectionsCount === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 sm:p-12 text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 mx-auto flex items-center justify-center">
              <CheckSquare className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                All report sections are deselected
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Choose at least one report section in Step 2 to view insights and enable export.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSelectStandardSections}
              className="py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-2xs inline-flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Enable Standard (All 7 Sections)</span>
            </button>
          </div>
        ) : (
          /* THE OFFICIAL PRINTABLE REPORT CONTAINER */
          <div
            ref={reportRef}
            className="space-y-6 bg-white text-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs"
          >
            {/* Formal Report Header */}
            <div className="border-b-2 border-slate-800 pb-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-blue-700">
                    Word for the World Christian Fellowship — Santa Cruz
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-950 mt-1 tracking-tight">
                  WWCF Santa Cruz — Worship Ministry Report
                </h1>
                <p className="text-xs text-slate-600 mt-1">
                  Analyzed {pastSchedules.length} recorded service lineups
                  {upcomingSchedules.length > 0 ? ` (${upcomingSchedules.length} scheduled future lineups)` : ''} · Scope:{' '}
                  {scopeSummaryText} · Generated on {formatDateDisplayManila(getManilaTodayString())}
                </p>
              </div>

              <div className="text-right text-xs text-slate-600 font-medium hidden sm:block">
                <div className="font-bold text-slate-800">WWCF Worship Ministry</div>
                <div className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">
                  Confidential Ministry Record
                </div>
              </div>
            </div>

            {/* SECTION 1: Summary KPI Metrics */}
            {sections.summaryMetrics && (previewTab === 'all' || previewTab === 'summary') && (
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-blue-600" />
                  1. Summary Metrics & Placement Volume
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Past Lineups</span>
                    <p className="text-xl font-black text-slate-900 mt-1">{pastSchedules.length}</p>
                    <span className="text-[10px] text-slate-500">Historical services</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Placements</span>
                    <p className="text-xl font-black text-blue-600 mt-1">
                      {pastSchedules.reduce(
                        (sum, s) => sum + (s.praiseSongs || []).length + (s.worshipSongs || []).length,
                        0
                      )}
                    </p>
                    <span className="text-[10px] text-slate-500">Praise + Worship slots</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Unique Songs</span>
                    <p className="text-xl font-black text-indigo-600 mt-1">{analyticsData.totalUniqueSongs}</p>
                    <span className="text-[10px] text-slate-500">Distinct titles sung</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Same-Month Repeats</span>
                    <p className="text-xl font-black text-amber-600 mt-1">{sameMonthRepeats.length}</p>
                    <span className="text-[10px] text-slate-500">Songs sung 2+ in a month</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Upcoming Lineups</span>
                    <p className="text-xl font-black text-emerald-600 mt-1">{upcomingSchedules.length}</p>
                    <span className="text-[10px] text-slate-500">Scheduled future setlists</span>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 2: Most-Played Songs Ranking */}
            {sections.mostPlayedRanking && (previewTab === 'all' || previewTab === 'most_played') && (
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <Music className="w-4 h-4 text-blue-600" />
                      2. Most-Played Songs Ranking (Past Recorded Services)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Songs and Song Families ordered by recorded execution frequency
                    </p>
                  </div>

                  <div className="relative w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={rankingSearch}
                      onChange={(e) => setRankingSearch(e.target.value)}
                      placeholder="Filter song rankings..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-900 outline-none"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3 w-12 text-center">Rank</th>
                        <th className="py-2.5 px-4">Song Title / Family</th>
                        <th className="py-2.5 px-3 text-center">Total Plays</th>
                        <th className="py-2.5 px-4">Last Sung Date & Leader</th>
                        <th className="py-2.5 px-4">Most Frequent Leader</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRankings.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-400">
                            No songs match the current filter or recorded date range.
                          </td>
                        </tr>
                      ) : (
                        filteredRankings.slice(0, 30).map((item, idx) => (
                          <tr key={item.title} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-2.5 px-3 text-center font-bold text-slate-400">#{idx + 1}</td>
                            <td className="py-2.5 px-4 font-semibold text-slate-900">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span>{item.title}</span>
                                {item.isFamily && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    Song Family ({item.versionBreakdown?.length || 1} versions)
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-blue-600">{item.totalCount}x</td>
                            <td className="py-2.5 px-4 text-slate-600">
                              {item.lastSungDate ? (
                                <span>
                                  {formatDateDisplayManila(item.lastSungDate, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                  {item.lastSungBy && item.lastSungBy !== 'N/A' && ` · ${item.lastSungBy}`}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-slate-600">{item.mostUsedBy || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SECTION 3: Song Leader Usage & Favorites */}
            {sections.songLeaderUsage && (previewTab === 'all' || previewTab === 'song_leaders') && (
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-blue-600" />
                      3. Song Leader Rotation & Favorite Songs (≥2 Plays Threshold)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Only songs led at least 2 times are classified as personal favorites
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Filter Leader:</span>
                    <select
                      value={selectedLeaderId}
                      onChange={(e) => setSelectedLeaderId(e.target.value)}
                      className="py-1 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 outline-none"
                    >
                      <option value="all">All Song Leaders</option>
                      {songLeadersList.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {analyticsData.memberAnalytics
                    .filter((ma) => selectedLeaderId === 'all' || ma.member.id === selectedLeaderId)
                    .map((ma) => (
                      <div key={ma.member.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                              {ma.member.name.charAt(0)}
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-slate-900">{ma.member.name}</h4>
                              <span className="text-[10px] text-slate-500">
                                Led {ma.totalSongsLed} song placements in selected period
                              </span>
                            </div>
                          </div>

                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700">
                            {ma.favoriteSongs.length} Favorites (≥2x)
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                            Frequent Favorite Songs (≥2x):
                          </span>
                          {ma.favoriteSongs.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic">
                              No songs led 2 or more times in this period.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {ma.favoriteSongs.map((fav) => (
                                <span
                                  key={fav.songTitle}
                                  className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-xs font-medium text-slate-800 flex items-center gap-1 shadow-2xs"
                                >
                                  <span>{fav.songTitle}</span>
                                  <span className="font-bold text-blue-600">({fav.count}x)</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* SECTION 4: Same-Calendar-Month Repeat Markers */}
            {sections.sameMonthRepeats && (previewTab === 'all' || previewTab === 'same_month') && (
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <Repeat className="w-4 h-4 text-amber-500" />
                    4. Same-Calendar-Month Song Repeats
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tracks song rotation frequency within the same calendar month and year (e.g. repeated in October 2026)
                  </p>
                </div>

                {sameMonthRepeats.length === 0 ? (
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-center text-xs text-slate-500">
                    No songs were repeated within the same calendar month in this selected period.
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        <tr>
                          <th className="py-2 px-3">Song Title</th>
                          <th className="py-2 px-3">Calendar Month</th>
                          <th className="py-2 px-3 text-center">Frequency</th>
                          <th className="py-2 px-3">Specific Service Dates</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sameMonthRepeats.map((rpt) => (
                          <tr key={`${rpt.monthKey}_${rpt.songTitle}`} className="hover:bg-slate-50/60">
                            <td className="py-2 px-3 font-bold text-slate-900">{rpt.songTitle}</td>
                            <td className="py-2 px-3 text-slate-600">
                              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-semibold text-[11px] border border-amber-200">
                                {rpt.monthLabel}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center font-black text-amber-600">{rpt.count} uses</td>
                            <td className="py-2 px-3 text-slate-600 text-[11px]">
                              {rpt.dates
                                .map((d) => formatDateDisplayManila(d, { month: 'short', day: 'numeric' }))
                                .join(', ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* SECTION 5: Lineup Register (All Selected Lineups: Played & Upcoming) */}
            {sections.lineupRegister && (previewTab === 'all' || previewTab === 'lineup_register') && (
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    5. Selected Worship Lineup Register ({filteredSchedules.length} Lineups · {pastSchedules.length} Historical, {upcomingSchedules.length} Scheduled)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Chronological service records of setlists, song keys, and personnel with Played vs Upcoming status tags
                  </p>
                </div>

                <div className="space-y-3">
                  {filteredSchedules.map((schedule) => {
                    const { allScheduleLeaders } = getScheduleSongLeaders(schedule, members);
                    const leadersLabel =
                      allScheduleLeaders.length > 0
                        ? allScheduleLeaders.map((m) => m.name).join(', ')
                        : 'Unassigned';
                    const isUpcoming = schedule.serviceDate > getManilaTodayString();

                    return (
                      <div
                        key={schedule.id}
                        className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-sm">
                              {formatDateDisplayManila(schedule.serviceDate, {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800">
                              {normalizeServiceType(schedule.serviceType)}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isUpcoming
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {isUpcoming ? 'Upcoming / Scheduled' : 'Played / Historical'}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-600">
                            <span className="font-semibold text-slate-700">Song Leader(s): </span>
                            <span>{leadersLabel}</span>
                          </div>
                        </div>

                        {/* Songs Row */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block mb-1">
                              Praise Songs:
                            </span>
                            <div className="space-y-0.5">
                              {(schedule.praiseSongs || []).map((song, sIdx) => {
                                const keyTag = schedule.praiseSongKeys?.[sIdx];
                                return (
                                  <div key={sIdx} className="flex items-center gap-1.5 text-slate-800 font-medium">
                                    <span>
                                      {sIdx + 1}. {song}
                                    </span>
                                    {keyTag && (
                                      <span className="text-[10px] font-bold px-1.5 rounded bg-slate-200 text-slate-700">
                                        {keyTag}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block mb-1">
                              Worship Songs:
                            </span>
                            <div className="space-y-0.5">
                              {(schedule.worshipSongs || []).map((song, sIdx) => {
                                const keyTag = schedule.worshipSongKeys?.[sIdx];
                                return (
                                  <div key={sIdx} className="flex items-center gap-1.5 text-slate-800 font-medium">
                                    <span>
                                      {sIdx + 1}. {song}
                                    </span>
                                    {keyTag && (
                                      <span className="text-[10px] font-bold px-1.5 rounded bg-slate-200 text-slate-700">
                                        {keyTag}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Team Personnel Assignments */}
                        <div className="pt-2 border-t border-slate-200 flex flex-wrap gap-1.5">
                          {(schedule.ministryAssignments || []).map((a) => {
                            const assignedMems =
                              a.assignedMembers ||
                              (a.memberId ? [{ memberId: a.memberId, memberName: a.memberName || '' }] : []);
                            const names = assignedMems
                              .map((m) => m.memberName)
                              .filter((n) => n && n !== 'Unassigned')
                              .join(', ');
                            if (!names) return null;
                            const roleStyle = getTagColorStyle(a.role);
                            return (
                              <span
                                key={a.id}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium border flex items-center gap-1 ${roleStyle}`}
                              >
                                <span className="font-bold">{a.role}:</span>
                                <span>{names}</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SECTION 6: Assigned Members & Role Distribution */}
            {sections.assignedMembers && (previewTab === 'all' || previewTab === 'team_personnel') && (
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-emerald-600" />
                    6. Ministry Team Personnel & Role Service Frequency
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Roster members who served across the selected lineups and their specific roles
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-4">Member Name</th>
                        <th className="py-2.5 px-3 text-center">Services Served</th>
                        <th className="py-2.5 px-4">Roles Fulfilled</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {memberServiceDistribution.map((entry) => (
                        <tr key={entry.member.id} className="hover:bg-slate-50/60">
                          <td className="py-2 px-4 font-bold text-slate-900">{entry.member.name}</td>
                          <td className="py-2 px-3 text-center font-bold text-emerald-600">
                            {entry.totalServices}x
                          </td>
                          <td className="py-2 px-4 flex flex-wrap gap-1">
                            {Array.from(entry.roles.entries()).map(([roleName, count]) => {
                              const tagStyle = getTagColorStyle(roleName);
                              return (
                                <span
                                  key={roleName}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${tagStyle}`}
                                >
                                  {roleName} ({count}x)
                                </span>
                              );
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SECTION 7: Unrotated Song Rotation Candidates */}
            {sections.lessUsedSongs && (previewTab === 'all' || previewTab === 'unrotated') && (
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    7. Catalog Songs Not Sung in Selected Period (Rotation Suggestions)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Existing songs in your church database available for rotation into future lineups
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 overflow-x-auto max-h-60">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider sticky top-0">
                      <tr>
                        <th className="py-2 px-3">Title</th>
                        <th className="py-2 px-3">Artist</th>
                        <th className="py-2 px-3 text-center">Category</th>
                        <th className="py-2 px-3">Last Recorded Use</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {unrotatedSongs.slice(0, 20).map((song) => (
                        <tr key={song.id} className="hover:bg-slate-50/60">
                          <td className="py-1.5 px-3 font-semibold text-slate-800">{song.title}</td>
                          <td className="py-1.5 px-3 text-slate-600">{song.artist}</td>
                          <td className="py-1.5 px-3 text-center capitalize font-medium text-slate-500">
                            {song.category}
                          </td>
                          <td className="py-1.5 px-3 text-slate-500 text-[11px]">
                            {song.lastUsedDate ? formatDateDisplayManila(song.lastUsedDate) : 'Never in records'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────────
          STEP 4: GROUPED EXPORT ACTIONS
      ───────────────────────────────────────────────────────────── */}
      <section
        aria-labelledby="step-4-heading"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">
              4
            </span>
            <h3 id="step-4-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Export Ministry Report
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isDateRangeInvalid
              ? 'Start date is after End date. Please correct the date range to export.'
              : filteredSchedules.length > 0 && activeSectionsCount > 0
              ? `Ready to export ${filteredSchedules.length} lineups (${pastSchedules.length} historical, ${upcomingSchedules.length} scheduled) across ${activeSectionsCount} report sections.`
              : 'Select at least one lineup and one report section to export.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportPDF}
            disabled={isExportDisabled}
            className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={isDateRangeInvalid ? 'Start date cannot be after end date' : 'Export PDF'}
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            <span>Export Official PDF</span>
          </button>

          <button
            type="button"
            onClick={handleExportPNG}
            disabled={isExportDisabled}
            className="py-2.5 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold rounded-xl shadow-2xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={isDateRangeInvalid ? 'Start date cannot be after end date' : 'Export PNG'}
          >
            <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Export High-Res PNG</span>
          </button>
        </div>
      </section>
    </div>
  );
};
