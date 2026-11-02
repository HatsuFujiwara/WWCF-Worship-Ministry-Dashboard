import { Schedule, CanonicalServiceType, CANONICAL_SERVICE_TYPES, normalizeServiceType, Song, Member, SongFamily } from '../types';
import { getManilaDateParts, addDaysToDateString, getManilaTodayString, formatDateDisplayManila, getDaysInMonth } from './dateUtils';
import { isScheduleEmpty } from './scheduleUtils';
import { StorageService } from '../services/storage';

export type AnalyticsFilterMode = 'follow_saved' | 'date_range' | 'specific_dates' | 'all' | 'custom';

export interface WeekGroup {
  weekKey: string;
  label: string;
  startDate: string;
  endDate: string;
  scheduleIds: string[];
}

export interface MonthGroup {
  monthKey: string; // YYYY-MM
  monthNumber: number; // 1-12
  monthName: string;
  weeks: WeekGroup[];
  scheduleIds: string[];
}

export interface YearGroup {
  year: number;
  months: MonthGroup[];
  scheduleIds: string[];
}

export interface CheckboxScopeState {
  mode: AnalyticsFilterMode;
  selectedYears: string[]; // ['2026', '2025']
  selectedMonths: string[]; // ['2026-10', '2026-09']
  selectedWeeks: string[]; // weekKeys ('YYYY-MM-DD_YYYY-MM-DD')
  selectedScheduleIds: string[];
  selectedServiceTypes: string[]; // ['Sunday Service', 'Midweek Prayer Service', ...]
  customStartDate?: string;
  customEndDate?: string;
}

export interface ReportSectionsSelection {
  summaryMetrics: boolean;
  mostPlayedRanking: boolean;
  songLeaderUsage: boolean;
  sameMonthRepeats: boolean;
  lineupRegister: boolean;
  assignedMembers: boolean;
  lessUsedSongs: boolean;
}

export const DEFAULT_REPORT_SECTIONS: ReportSectionsSelection = {
  summaryMetrics: true,
  mostPlayedRanking: true,
  songLeaderUsage: true,
  sameMonthRepeats: true,
  lineupRegister: true,
  assignedMembers: true,
  lessUsedSongs: true
};

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Given a YYYY-MM-DD date string, computes its Monday-to-Sunday inclusive calendar week boundaries.
 * Correctly handles cross-month and cross-year weeks.
 */
export function getMondayToSundayWeek(dateStr: string): {
  startDate: string;
  endDate: string;
  weekKey: string;
  label: string;
} {
  const parts = getManilaDateParts(dateStr);
  // dayOfWeek: 0 = Sun, 1 = Mon, ..., 6 = Sat
  // In Monday-Sunday week, Monday offset = -(dayOfWeek === 0 ? 6 : dayOfWeek - 1)
  const mondayOffset = -(parts.dayOfWeek === 0 ? 6 : parts.dayOfWeek - 1);
  const sundayOffset = mondayOffset + 6;

  const startDate = addDaysToDateString(dateStr, mondayOffset);
  const endDate = addDaysToDateString(dateStr, sundayOffset);
  const weekKey = `${startDate}_${endDate}`;

  const startParts = getManilaDateParts(startDate);
  const endParts = getManilaDateParts(endDate);

  const startMonthName = MONTH_NAMES[startParts.month - 1].substring(0, 3);
  const endMonthName = MONTH_NAMES[endParts.month - 1].substring(0, 3);

  let label: string;
  if (startParts.year === endParts.year) {
    if (startParts.month === endParts.month) {
      label = `${startMonthName} ${startParts.day} – ${endParts.day}, ${endParts.year}`;
    } else {
      label = `${startMonthName} ${startParts.day} – ${endMonthName} ${endParts.day}, ${endParts.year}`;
    }
  } else {
    label = `${startMonthName} ${startParts.day}, ${startParts.year} – ${endMonthName} ${endParts.day}, ${endParts.year}`;
  }

  return { startDate, endDate, weekKey, label };
}

/**
 * Builds a 3-level hierarchy (Years -> Months -> Weeks) from all saved lineups.
 */
export function buildScheduleDateHierarchy(schedules: Schedule[]): YearGroup[] {
  const nonEmptySchedules = (schedules || []).filter((s) => !isScheduleEmpty(s));
  const yearMap = new Map<number, Map<number, Map<string, { week: ReturnType<typeof getMondayToSundayWeek>; scheduleIds: string[] }>>>();

  nonEmptySchedules.forEach((s) => {
    if (!s.serviceDate) return;
    const { year, month } = getManilaDateParts(s.serviceDate);
    const week = getMondayToSundayWeek(s.serviceDate);

    if (!yearMap.has(year)) {
      yearMap.set(year, new Map());
    }
    const monthMap = yearMap.get(year)!;
    if (!monthMap.has(month)) {
      monthMap.set(month, new Map());
    }
    const weekMap = monthMap.get(month)!;
    if (!weekMap.has(week.weekKey)) {
      weekMap.set(week.weekKey, { week, scheduleIds: [] });
    }
    weekMap.get(week.weekKey)!.scheduleIds.push(s.id);
  });

  const sortedYears = Array.from(yearMap.keys()).sort((a, b) => b - a);

  return sortedYears.map((year) => {
    const monthMap = yearMap.get(year)!;
    const sortedMonths = Array.from(monthMap.keys()).sort((a, b) => b - a);

    const yearScheduleIds: string[] = [];

    const months: MonthGroup[] = sortedMonths.map((mNum) => {
      const monthKey = `${year}-${String(mNum).padStart(2, '0')}`;
      const weekMap = monthMap.get(mNum)!;
      const sortedWeeks = Array.from(weekMap.values()).sort((a, b) =>
        b.week.startDate.localeCompare(a.week.startDate)
      );

      const monthScheduleIds: string[] = [];

      const weeks: WeekGroup[] = sortedWeeks.map(({ week, scheduleIds }) => {
        monthScheduleIds.push(...scheduleIds);
        return {
          weekKey: week.weekKey,
          label: week.label,
          startDate: week.startDate,
          endDate: week.endDate,
          scheduleIds: Array.from(new Set(scheduleIds))
        };
      });

      yearScheduleIds.push(...monthScheduleIds);

      return {
        monthKey,
        monthNumber: mNum,
        monthName: MONTH_NAMES[mNum - 1],
        weeks,
        scheduleIds: Array.from(new Set(monthScheduleIds))
      };
    });

    return {
      year,
      months,
      scheduleIds: Array.from(new Set(yearScheduleIds))
    };
  });
}

/**
 * Computes preset start and end dates based on Manila today.
 */
export function getPresetDateRange(preset: 'this_month' | 'this_year'): { startDate: string; endDate: string } {
  const today = getManilaTodayString();
  const parts = getManilaDateParts(today);

  if (preset === 'this_month') {
    const mStr = String(parts.month).padStart(2, '0');
    const maxDays = getDaysInMonth(parts.year, parts.month);
    return {
      startDate: `${parts.year}-${mStr}-01`,
      endDate: `${parts.year}-${mStr}-${String(maxDays).padStart(2, '0')}`
    };
  }

  // this_year
  return {
    startDate: `${parts.year}-01-01`,
    endDate: `${parts.year}-12-31`
  };
}

/**
 * Filters schedules strictly according to active CheckboxScopeState.
 * Guarantees:
 * 1. Unchecking all services results in zero matching records (never all records).
 * 2. Clear selection results in zero matching records (never all history).
 * 3. Overlapping weeks/months never double-count lineups.
 * 4. Upcoming schedules are separated from past schedules and never inflate past rankings.
 */
export function filterSchedulesByScope(
  schedules: Schedule[],
  scope: CheckboxScopeState
): {
  filteredSchedules: Schedule[];
  pastSchedules: Schedule[];
  upcomingSchedules: Schedule[];
} {
  const todayStr = getManilaTodayString();
  const validSchedules = (schedules || []).filter((s) => !isScheduleEmpty(s));

  // 1. Service filter FIRST: if services array is empty, 0 schedules match!
  if (!scope.selectedServiceTypes || scope.selectedServiceTypes.length === 0) {
    return {
      filteredSchedules: [],
      pastSchedules: [],
      upcomingSchedules: []
    };
  }

  const allowedServices = new Set(scope.selectedServiceTypes.map((t) => normalizeServiceType(t)));
  const serviceFiltered = validSchedules.filter((s) =>
    allowedServices.has(normalizeServiceType(s.serviceType))
  );

  let candidateSchedules: Schedule[] = [];

  // 2. Filter by Mode
  if (scope.mode === 'all') {
    candidateSchedules = serviceFiltered;
  } else if (scope.mode === 'follow_saved') {
    const savedFilter = StorageService.getSchedulesFilterSettings();
    candidateSchedules = serviceFiltered.filter((s) => {
      // Saved service filter
      if (savedFilter.serviceFilter && savedFilter.serviceFilter !== 'all') {
        const normService = normalizeServiceType(s.serviceType);
        if (normService !== savedFilter.serviceFilter) return false;
      }
      // Saved year filter
      if (savedFilter.yearFilter && savedFilter.yearFilter !== 'all') {
        if (!s.serviceDate || !s.serviceDate.startsWith(savedFilter.yearFilter)) return false;
      }
      // Saved month filter
      if (savedFilter.monthFilter && savedFilter.monthFilter !== 'all') {
        if (!s.serviceDate) return false;
        const parts = s.serviceDate.split('-');
        if (parts.length < 2 || parts[1] !== savedFilter.monthFilter) return false;
      }
      // Saved search query
      if (savedFilter.searchQuery && savedFilter.searchQuery.trim()) {
        const q = savedFilter.searchQuery.toLowerCase();
        const songsMatch = [...(s.praiseSongs || []), ...(s.worshipSongs || [])].some((song) =>
          song.toLowerCase().includes(q)
        );
        const roleMatch = (s.ministryAssignments || []).some((a) =>
          (a.assignedMembers || []).some((m) => m.memberName.toLowerCase().includes(q))
        );
        if (!songsMatch && !roleMatch && !s.serviceType.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  } else if (scope.mode === 'date_range') {
    // If range inputs are completely empty or inverted (start > end), 0 match
    if (!scope.customStartDate && !scope.customEndDate) {
      candidateSchedules = [];
    } else if (scope.customStartDate && scope.customEndDate && scope.customStartDate > scope.customEndDate) {
      candidateSchedules = [];
    } else {
      candidateSchedules = serviceFiltered.filter((s) => {
        if (!s.serviceDate) return false;
        if (scope.customStartDate && s.serviceDate < scope.customStartDate) return false;
        if (scope.customEndDate && s.serviceDate > scope.customEndDate) return false;
        return true;
      });
    }
  } else if (scope.mode === 'specific_dates' || scope.mode === 'custom') {
    // Checkbox tree or week selection
    const selectedSchedIdSet = new Set(scope.selectedScheduleIds);

    // Also check selected weeks by date range (handles week spanning month boundaries)
    const weekDateRanges: Array<{ start: string; end: string }> = (scope.selectedWeeks || []).map((wKey) => {
      const [start, end] = wKey.split('_');
      return { start, end };
    });

    if (selectedSchedIdSet.size === 0 && weekDateRanges.length === 0 && !scope.customStartDate && !scope.customEndDate) {
      // Empty selection means 0 records, never all
      candidateSchedules = [];
    } else {
      candidateSchedules = serviceFiltered.filter((s) => {
        if (!s.serviceDate) return false;

        // Directly included schedule ID
        if (selectedSchedIdSet.has(s.id)) return true;

        // Included via week range
        const fallsInWeek = weekDateRanges.some((r) => s.serviceDate >= r.start && s.serviceDate <= r.end);
        if (fallsInWeek) return true;

        // Custom start/end date bounds if provided
        if (scope.customStartDate && s.serviceDate < scope.customStartDate) return false;
        if (scope.customEndDate && s.serviceDate > scope.customEndDate) return false;

        return selectedSchedIdSet.size === 0 && weekDateRanges.length === 0;
      });
    }
  }

  // Deduplicate by schedule ID to prevent double counting
  const dedupMap = new Map<string, Schedule>();
  candidateSchedules.forEach((s) => dedupMap.set(s.id, s));
  const deduplicated = Array.from(dedupMap.values());

  // Sort chronological descending (newest date first)
  const sorted = deduplicated.sort((a, b) => (b.serviceDate || '').localeCompare(a.serviceDate || ''));

  const pastSchedules = sorted.filter((s) => s.serviceDate <= todayStr);
  const upcomingSchedules = sorted.filter((s) => s.serviceDate > todayStr);

  return {
    filteredSchedules: sorted,
    pastSchedules,
    upcomingSchedules
  };
}

export interface SameMonthRepeatItem {
  songTitle: string;
  monthKey: string; // YYYY-MM
  monthLabel: string; // e.g. "October 2026"
  count: number;
  dates: string[];
  scheduleIds: string[];
}

/**
 * Resolves the Song Family or canonical identity for a raw song title.
 */
export function getCanonicalSongIdentity(
  rawTitle: string,
  songs: Song[] = [],
  songFamilies: SongFamily[] = []
): { canonicalKey: string; displayTitle: string } {
  const cleanTitle = (rawTitle || '').trim();
  const cleanLower = cleanTitle.toLowerCase();

  const matchingSong = songs.find((s) => s.title.trim().toLowerCase() === cleanLower);
  if (matchingSong && matchingSong.songFamilyId) {
    const fam = songFamilies.find((f) => f.id === matchingSong.songFamilyId);
    if (fam) {
      return { canonicalKey: `fam_${fam.id}`, displayTitle: fam.name };
    }
  }

  const directFam = songFamilies.find((f) => f.name.trim().toLowerCase() === cleanLower);
  if (directFam) {
    return { canonicalKey: `fam_${directFam.id}`, displayTitle: directFam.name };
  }

  return { canonicalKey: `song_${cleanLower}`, displayTitle: matchingSong ? matchingSong.title : cleanTitle };
}

/**
 * Calculates songs repeated 2+ times in the exact same calendar month and year
 * across the selected lineups. Fully Song Family aware.
 */
export function calculateSameMonthRepeats(
  schedules: Schedule[],
  songs: Song[] = [],
  songFamilies: SongFamily[] = []
): SameMonthRepeatItem[] {
  const monthSongMap = new Map<
    string,
    {
      songTitle: string;
      monthKey: string;
      monthLabel: string;
      count: number;
      dates: Set<string>;
      scheduleIds: Set<string>;
    }
  >();

  schedules.forEach((s) => {
    if (!s.serviceDate) return;
    const parts = getManilaDateParts(s.serviceDate);
    const monthKey = parts.yearMonth;
    const monthLabel = `${MONTH_NAMES[parts.month - 1]} ${parts.year}`;

    const allSongs = [...(s.praiseSongs || []), ...(s.worshipSongs || [])];
    allSongs.forEach((rawTitle) => {
      const cleanTitle = (rawTitle || '').trim();
      if (!cleanTitle) return;

      const identity = getCanonicalSongIdentity(cleanTitle, songs, songFamilies);
      const mapKey = `${monthKey}__${identity.canonicalKey}`;
      let item = monthSongMap.get(mapKey);
      if (!item) {
        item = {
          songTitle: identity.displayTitle,
          monthKey,
          monthLabel,
          count: 0,
          dates: new Set(),
          scheduleIds: new Set()
        };
        monthSongMap.set(mapKey, item);
      }
      item.count += 1;
      item.dates.add(s.serviceDate);
      item.scheduleIds.add(s.id);
    });
  });

  const repeatedItems: SameMonthRepeatItem[] = [];
  monthSongMap.forEach((val) => {
    if (val.count >= 2) {
      repeatedItems.push({
        songTitle: val.songTitle,
        monthKey: val.monthKey,
        monthLabel: val.monthLabel,
        count: val.count,
        dates: Array.from(val.dates).sort(),
        scheduleIds: Array.from(val.scheduleIds)
      });
    }
  });

  return repeatedItems.sort((a, b) => {
    if (b.monthKey !== a.monthKey) return b.monthKey.localeCompare(a.monthKey);
    if (b.count !== a.count) return b.count - a.count;
    return a.songTitle.localeCompare(b.songTitle);
  });
}
