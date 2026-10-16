import { Song, Schedule, SongFamily } from '../types';
import { formatDateDisplayManila, getManilaTodayString } from './dateUtils';
import { SongService } from '../services/songService';
import { SongFamilyService } from '../services/songFamilyService';

export interface RecommendedSong {
  song: Song;
  score: number;
  priorityGroup: 'new' | 'once' | 'least_played';
  badges: string[];
  reasons: string[];
  isSeasonal: boolean;
  seasonalSeason?: string;
  lastPlayedFormatted?: string;
  timesUsed: number;
  lastUsedDate?: string;
  isFamily?: boolean;
  familyName?: string;
}

export type CategoryFilter = 'all' | 'praise' | 'worship';
export type StatusFilter = 'all' | 'new' | 'once' | 'least_played' | 'seasonal';

/**
 * Determines whether a service type is considered a Special Event
 * (e.g. Youth Fellowship, Special Worship Event, etc.) vs a Regular Service (Sunday/Midweek).
 */
export function isSpecialEvent(serviceType?: string): boolean {
  if (!serviceType) return false;
  const clean = serviceType.trim();
  return clean !== 'Sunday Service' && clean !== 'Midweek Prayer Service';
}

/**
 * Returns true if the target date is in the first 7 calendar days of the month (Day 1..7).
 */
export function isFirstWeekOfMonth(dateStr: string): boolean {
  if (!dateStr || dateStr.length < 10) return false;
  const day = parseInt(dateStr.slice(8, 10), 10);
  return !isNaN(day) && day >= 1 && day <= 7;
}

/**
 * Calculates the start and end date strings (YYYY-MM-DD) for the final 7 calendar days of the previous month.
 */
export function getLastWeekOfPreviousMonthRange(dateStr: string): { startDate: string; endDate: string } {
  const [yStr, mStr] = dateStr.split('-');
  let year = parseInt(yStr, 10);
  let month = parseInt(mStr, 10);
  if (month === 1) {
    month = 12;
    year -= 1;
  } else {
    month -= 1;
  }
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const startDay = daysInPrevMonth - 6;
  const mPadded = String(month).padStart(2, '0');
  const startDayPadded = String(startDay).padStart(2, '0');
  const endDayPadded = String(daysInPrevMonth).padStart(2, '0');
  return {
    startDate: `${year}-${mPadded}-${startDayPadded}`,
    endDate: `${year}-${mPadded}-${endDayPadded}`
  };
}

/**
 * Checks if a song is prohibited from recommendations based on:
 * 1) Played in the current month (same calendar YYYY-MM).
 * 2) Played in the last 7 calendar days of the previous month (if current date is day 1..7 of new month).
 * Special events (e.g. Youth Fellowship) do NOT restrict recommendations for regular services (Sunday/Midweek).
 * Song Family aware: if any version in the song's family was played, the whole family is prohibited.
 */
export function isSongProhibitedByDateRules(
  songTitle: string,
  referenceDateStr: string,
  schedules: Schedule[],
  targetServiceType?: string,
  allSongs?: Song[],
  allFamilies?: SongFamily[]
): boolean {
  const cleanTitle = songTitle.trim().toLowerCase();
  if (!cleanTitle || !referenceDateStr || schedules.length === 0) return false;

  const familyTitles = new Set(SongService.getFamilySongTitles(songTitle, allSongs, allFamilies));
  const familyIds = new Set<string>();

  if (allSongs && allSongs.length > 0) {
    allSongs.forEach((s) => {
      if (familyTitles.has(s.title.trim().toLowerCase())) {
        familyIds.add(s.id);
      }
    });
  }

  const refYM = referenceDateStr.slice(0, 7);
  const inFirstWeek = isFirstWeekOfMonth(referenceDateStr);
  const prevWeekRange = inFirstWeek ? getLastWeekOfPreviousMonthRange(referenceDateStr) : null;
  const isTargetRegular = !isSpecialEvent(targetServiceType);

  for (const sch of schedules) {
    if (!sch.serviceDate) continue;

    // Check if sch contains this song or any version of its family by title or song ID
    const inPraise = (sch.praiseSongs || []).some((s) => familyTitles.has(s.trim().toLowerCase())) ||
                     (sch.praiseSongIds || []).some((id) => familyIds.has(id));
    const inWorship = (sch.worshipSongs || []).some((s) => familyTitles.has(s.trim().toLowerCase())) ||
                      (sch.worshipSongIds || []).some((id) => familyIds.has(id));
    if (!inPraise && !inWorship) continue;

    // Special event exception: If recommending for regular service, ignore special events
    if (isTargetRegular && isSpecialEvent(sch.serviceType)) {
      continue;
    }

    // Rule 1: Current Month Rule (played during same calendar month)
    const schYM = sch.serviceDate.slice(0, 7);
    if (schYM === refYM) {
      return true;
    }

    // Rule 2: Month Boundary Rule (played during last 7 days of prev month when in first 7 days of new month)
    if (inFirstWeek && prevWeekRange) {
      if (sch.serviceDate >= prevWeekRange.startDate && sch.serviceDate <= prevWeekRange.endDate) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Determines whether a song (or any member of its Song Family) is effectively recently played.
 * If song has no Song Family: evaluates individual usage against date rules.
 * If song has a Song Family: evaluates whether ANY member of the family was recently used.
 */
export function isEffectivelyRecentlyPlayed(
  song: Song,
  referenceDateStr: string,
  schedules: Schedule[],
  targetServiceType?: string,
  allSongs?: Song[],
  allFamilies?: SongFamily[]
): boolean {
  if (!song || !referenceDateStr || !schedules || schedules.length === 0) return false;
  return isSongProhibitedByDateRules(
    song.title,
    referenceDateStr,
    schedules,
    targetServiceType,
    allSongs,
    allFamilies
  );
}

export const COMMON_THEMES = [
  'Christmas',
  'Easter',
  'Resurrection',
  'Cross',
  'Holy Spirit',
  'Thanksgiving',
  'Worship',
  'Praise',
  'Communion',
  'Salvation',
  'Faith',
  'Hope',
  'Love',
  'Revival',
  'Missions',
  'Grace',
  'Healing',
  'Advent',
  'Nativity',
  'Emmanuel',
  'Noel',
  'Victory',
  'Gratitude',
  'Pentecost',
  'Fire'
];

export const MONTHLY_SEASONAL_THEMES: Record<number, { seasonName: string; icon: string; themes: string[] }> = {
  11: {
    seasonName: 'Christmas',
    icon: '🎄',
    themes: ['christmas', 'advent', 'nativity', 'emmanuel', 'noel', 'birth of christ']
  },
  2: {
    seasonName: 'Easter',
    icon: '✝️',
    themes: ['resurrection', 'cross', 'victory', 'easter', 'calvary', 'blood', 'communion', 'thanksgiving']
  },
  3: {
    seasonName: 'Easter',
    icon: '✝️',
    themes: ['resurrection', 'cross', 'victory', 'easter', 'calvary', 'blood', 'communion', 'thanksgiving']
  },
  10: {
    seasonName: 'Thanksgiving',
    icon: '🦃',
    themes: ['thanksgiving', 'gratitude', 'praise']
  },
  4: {
    seasonName: 'Pentecost',
    icon: '🔥',
    themes: ['holy spirit', 'pentecost', 'fire', 'revival']
  },
  5: {
    seasonName: 'Pentecost',
    icon: '🔥',
    themes: ['holy spirit', 'pentecost', 'fire', 'revival']
  }
};

/**
 * Calculates song usage directly from saved schedules for max accuracy.
 */
function getSongUsageStats(song: Song, schedules: Schedule[]) {
  const cleanTitle = song.title.trim().toLowerCase();
  let count = 0;
  let lastDate = song.lastUsedDate || '';

  schedules.forEach((sch) => {
    const praise = (sch.praiseSongs || []).some((s) => s.trim().toLowerCase() === cleanTitle);
    const worship = (sch.worshipSongs || []).some((s) => s.trim().toLowerCase() === cleanTitle);
    if (praise || worship) {
      count++;
      if (!lastDate || sch.serviceDate > lastDate) {
        lastDate = sch.serviceDate;
      }
    }
  });

  return { timesUsed: count, lastUsedDate: lastDate };
}

/**
 * Generates smart song recommendations based on priority rules:
 * Priority 1 — Newly Added Songs (Never played)
 * Priority 2 — Played Only Once (Not played again in subsequent months)
 * Priority 3 — Least Played Songs
 * Priority 4 — Least Recently Played (Longest time since last played)
 * Seasonal Boost — Boosts songs matching the current month's themes (Christmas in Dec, Easter in Mar/Apr, etc.)
 *
 * Full Song Family Awareness:
 * - If ANY song inside a Song Family was recently used, all members of that family are prohibited.
 * - Family members inherit aggregate usage count and most recent used date for scoring and ranking.
 * - Prevents multiple versions of the same Song Family from cluttering recommendation lists.
 */
export function getSmartSongRecommendations(
  allSongs: Song[],
  schedules: Schedule[],
  options?: {
    categoryFilter?: CategoryFilter;
    statusFilter?: StatusFilter;
    themeFilter?: string;
    searchQuery?: string;
    referenceDate?: Date | string;
    targetServiceType?: string;
    allFamilies?: SongFamily[];
    excludeLineupSongs?: string[];
  }
): RecommendedSong[] {
  let refDateStr = getManilaTodayString();
  let refDate = new Date();

  if (options?.referenceDate) {
    if (typeof options.referenceDate === 'string') {
      refDateStr = options.referenceDate;
      if (/^\d{4}-\d{2}-\d{2}$/.test(refDateStr)) {
        const [y, m, d] = refDateStr.split('-').map(Number);
        refDate = new Date(y, m - 1, d);
      }
    } else {
      refDate = options.referenceDate;
      const y = refDate.getFullYear();
      const m = String(refDate.getMonth() + 1).padStart(2, '0');
      const d = String(refDate.getDate()).padStart(2, '0');
      refDateStr = `${y}-${m}-${d}`;
    }
  }

  const currentMonthIdx = refDate.getMonth(); // 0 - 11
  const seasonalConfig = MONTHLY_SEASONAL_THEMES[currentMonthIdx];

  // 1. Resolve Song Families
  const families: SongFamily[] = options?.allFamilies || SongFamilyService.getSongFamiliesSync();

  // 2. Build fast lookup maps
  const songByIdMap = new Map<string, Song>();
  const songByTitleMap = new Map<string, Song>();
  const songIdToFamilyMap = new Map<string, SongFamily>();
  const songTitleToFamilyMap = new Map<string, SongFamily>();

  for (const song of allSongs) {
    songByIdMap.set(song.id, song);
    songByTitleMap.set(song.title.trim().toLowerCase(), song);
  }

  for (const fam of families) {
    if (fam.versionIds) {
      for (const vId of fam.versionIds) {
        songIdToFamilyMap.set(vId, fam);
        const s = songByIdMap.get(vId);
        if (s) {
          songTitleToFamilyMap.set(s.title.trim().toLowerCase(), fam);
        }
      }
    }
    if (fam.versions) {
      for (const v of fam.versions) {
        songIdToFamilyMap.set(v.songId, fam);
        const s = songByIdMap.get(v.songId);
        if (s) {
          songTitleToFamilyMap.set(s.title.trim().toLowerCase(), fam);
        }
      }
    }
    if (fam.name) {
      songTitleToFamilyMap.set(fam.name.trim().toLowerCase(), fam);
    }
  }

  for (const song of allSongs) {
    if (song.songFamilyId) {
      const fam = families.find((f) => f.id === song.songFamilyId);
      if (fam) {
        songIdToFamilyMap.set(song.id, fam);
        songTitleToFamilyMap.set(song.title.trim().toLowerCase(), fam);
      }
    }
  }

  // 3. Determine recently used individual songs and recently used Song Families based on date rules
  const refYM = refDateStr.slice(0, 7);
  const inFirstWeek = isFirstWeekOfMonth(refDateStr);
  const prevWeekRange = inFirstWeek ? getLastWeekOfPreviousMonthRange(refDateStr) : null;
  const isTargetRegular = !isSpecialEvent(options?.targetServiceType);

  const prohibitedScheduleTitles = new Set<string>();
  const prohibitedSongIds = new Set<string>();
  const prohibitedFamilyIds = new Set<string>();

  for (const sch of schedules) {
    if (!sch.serviceDate) continue;
    if (isTargetRegular && isSpecialEvent(sch.serviceType)) {
      continue;
    }

    const schYM = sch.serviceDate.slice(0, 7);
    let isRecent = false;

    // Rule 1: Same calendar month
    if (schYM === refYM) {
      isRecent = true;
    }
    // Rule 2: Month boundary carry-over
    else if (
      inFirstWeek &&
      prevWeekRange &&
      sch.serviceDate >= prevWeekRange.startDate &&
      sch.serviceDate <= prevWeekRange.endDate
    ) {
      isRecent = true;
    }

    if (isRecent) {
      const titles = [...(sch.praiseSongs || []), ...(sch.worshipSongs || [])];
      const ids = [...(sch.praiseSongIds || []), ...(sch.worshipSongIds || [])];

      for (const t of titles) {
        const clean = t.trim().toLowerCase();
        if (clean) prohibitedScheduleTitles.add(clean);
      }
      for (const id of ids) {
        if (id && id.trim()) prohibitedSongIds.add(id.trim());
      }
    }
  }

  // Strictly prohibit all songs currently in the active schedule lineup (Praise & Worship)
  if (options?.excludeLineupSongs && options.excludeLineupSongs.length > 0) {
    for (const songTitle of options.excludeLineupSongs) {
      const clean = (songTitle || '').trim().toLowerCase();
      if (clean) {
        prohibitedScheduleTitles.add(clean);
        // Also match against allSongs to find their IDs
        const matched = allSongs.find((s) => s.title.trim().toLowerCase() === clean);
        if (matched) {
          prohibitedSongIds.add(matched.id);
          if (matched.songFamilyId) {
            prohibitedFamilyIds.add(matched.songFamilyId);
          }
        }
      }
    }
  }

  // Map recently used titles and IDs to Song Families
  for (const title of prohibitedScheduleTitles) {
    const fam = songTitleToFamilyMap.get(title);
    if (fam) {
      prohibitedFamilyIds.add(fam.id);
    }
  }
  for (const id of prohibitedSongIds) {
    const fam = songIdToFamilyMap.get(id);
    if (fam) {
      prohibitedFamilyIds.add(fam.id);
    }
  }

  // Expand prohibited families so ALL member songs are strictly prohibited
  for (const famId of prohibitedFamilyIds) {
    const fam = families.find((f) => f.id === famId);
    if (fam) {
      if (fam.versionIds) {
        fam.versionIds.forEach((vId) => prohibitedSongIds.add(vId));
      }
      if (fam.versions) {
        fam.versions.forEach((v) => prohibitedSongIds.add(v.songId));
      }
      for (const song of allSongs) {
        if (song.songFamilyId === famId || (fam.versionIds && fam.versionIds.includes(song.id))) {
          prohibitedSongIds.add(song.id);
          prohibitedScheduleTitles.add(song.title.trim().toLowerCase());
        }
      }
      if (fam.name) {
        prohibitedScheduleTitles.add(fam.name.trim().toLowerCase());
      }
    }
  }

  // 4. Filter candidate songs (No member of recently used families may pass)
  const eligibleCandidates: Song[] = [];

  for (const song of allSongs) {
    const cleanTitle = song.title.trim().toLowerCase();
    if (prohibitedSongIds.has(song.id)) continue;
    if (prohibitedScheduleTitles.has(cleanTitle)) continue;

    if (song.songFamilyId && prohibitedFamilyIds.has(song.songFamilyId)) continue;
    const fam = songIdToFamilyMap.get(song.id) || songTitleToFamilyMap.get(cleanTitle);
    if (fam && prohibitedFamilyIds.has(fam.id)) continue;

    // Defensive check with isSongProhibitedByDateRules
    if (isSongProhibitedByDateRules(song.title, refDateStr, schedules, options?.targetServiceType, allSongs, families)) {
      continue;
    }

    eligibleCandidates.push(song);
  }

  // 5. Avoid Duplicate Recommendations & Pick Single Best Representative per Song Family
  const standaloneCandidates: Song[] = [];
  const familyCandidateGroups = new Map<string, Song[]>();

  for (const song of eligibleCandidates) {
    const fam = songIdToFamilyMap.get(song.id) || songTitleToFamilyMap.get(song.title.trim().toLowerCase());
    if (fam) {
      const group = familyCandidateGroups.get(fam.id) || [];
      group.push(song);
      familyCandidateGroups.set(fam.id, group);
    } else {
      standaloneCandidates.push(song);
    }
  }

  const finalCandidates: { song: Song; family?: SongFamily }[] = [];

  for (const song of standaloneCandidates) {
    finalCandidates.push({ song });
  }

  for (const [famId, groupSongs] of familyCandidateGroups.entries()) {
    const fam = families.find((f) => f.id === famId)!;
    const bestRep = SongFamilyService.selectBestFamilyRepresentative(groupSongs, fam);
    finalCandidates.push({ song: bestRep, family: fam });
  }

  // 6. Apply Ranking & Scoring using Family Usage
  const results: RecommendedSong[] = [];

  for (const { song, family } of finalCandidates) {
    // Effective stats aggregates usage across the entire family
    const stats = SongFamilyService.getEffectiveUsageStats(song, allSongs, families, schedules);
    const timesUsed = stats.timesUsed;
    const lastUsedDate = stats.lastUsedDate;

    // Check themes
    const songThemes = (song.themes || song.labels || []).map((t) => t.trim().toLowerCase());

    // Check Seasonal Match
    let isSeasonal = false;
    let seasonalSeason = '';
    let seasonalIcon = '⭐';

    if (seasonalConfig) {
      const matchesSeasonalTheme = seasonalConfig.themes.some(
        (st) =>
          songThemes.some((t) => t.includes(st) || st.includes(t)) ||
          song.genre?.toLowerCase().includes(st) ||
          song.title.toLowerCase().includes(st)
      );

      if (matchesSeasonalTheme) {
        isSeasonal = true;
        seasonalSeason = seasonalConfig.seasonName;
        seasonalIcon = seasonalConfig.icon;
      }
    }

    // Determine priority group & base score
    let priorityGroup: 'new' | 'once' | 'least_played';
    let baseScore = 0;
    const badges: string[] = [];
    const reasons: string[] = [];

    // Calculate months since last played
    let monthsSinceLastPlayed = 999;
    let lastPlayedFormatted = '';
    if (lastUsedDate) {
      const lastDate = new Date(lastUsedDate);
      const yearDiff = refDate.getFullYear() - lastDate.getFullYear();
      const monthDiff = refDate.getMonth() - lastDate.getMonth();
      monthsSinceLastPlayed = Math.max(0, yearDiff * 12 + monthDiff);
      lastPlayedFormatted = formatDateDisplayManila(lastUsedDate, { month: 'short', year: 'numeric' });
    }

    if (timesUsed === 0) {
      priorityGroup = 'new';
      baseScore = 10000;
      badges.push('✨ Newly Added');
      badges.push('⭐ Never Played');
      reasons.push(
        family
          ? `Never played across any saved lineups (${stats.memberCount} family version${stats.memberCount > 1 ? 's' : ''})`
          : 'Newly added to database and never played in any saved lineup'
      );
    } else if (timesUsed === 1) {
      priorityGroup = 'once';
      baseScore = 5000 + Math.min(monthsSinceLastPlayed * 50, 2000);
      badges.push('🔄 Played Once');
      if (lastPlayedFormatted) {
        badges.push(`Last Played: ${lastPlayedFormatted}`);
      }
      reasons.push(
        family
          ? `Family played only once (${lastPlayedFormatted || 'past lineup'}) and not used since`
          : `Played only once (${lastPlayedFormatted || 'past lineup'}) and not used since`
      );
    } else {
      priorityGroup = 'least_played';
      baseScore = 2000 - timesUsed * 100 + Math.min(monthsSinceLastPlayed * 30, 1500);
      badges.push('🎵 Least Played');
      badges.push(`Played ${timesUsed}x`);
      if (lastPlayedFormatted) {
        badges.push(`Last Played: ${lastPlayedFormatted}`);
      }
      reasons.push(
        family
          ? `Song family used ${timesUsed} times across saved lineups`
          : `Used ${timesUsed} times across saved lineups`
      );
    }

    // Seasonal boost score (+8,000 points)
    let finalScore = baseScore;
    if (isSeasonal) {
      finalScore += 8000;
      badges.unshift(`${seasonalIcon} ${seasonalSeason} Recommendation`);
      reasons.unshift(`Matches current seasonal theme (${seasonalSeason})`);
    }

    // Song Family Badges and metadata notes
    if (family) {
      if (song.relationshipType === 'ORIGINAL') {
        badges.push('Original');
      } else if (song.relationshipType === 'COVER') {
        badges.push('Cover');
      } else if (song.relationshipType === 'ACOUSTIC_VERSION') {
        badges.push('Acoustic');
      } else if (song.relationshipType === 'LIVE_VERSION') {
        badges.push('Live');
      } else if (
        song.relationshipType === 'REMAKE' ||
        song.relationshipType === 'ALTERNATE_VERSION' ||
        song.relationshipType === 'VERSION'
      ) {
        badges.push('Alternate Version');
      }
    }

    // Include song's themes in badges if present
    if (song.themes && song.themes.length > 0) {
      song.themes.forEach((t) => {
        if (!badges.includes(`🏷️ ${t}`)) {
          badges.push(`🏷️ ${t}`);
        }
      });
    }

    results.push({
      song,
      score: finalScore,
      priorityGroup,
      badges,
      reasons,
      isSeasonal,
      seasonalSeason,
      lastPlayedFormatted,
      timesUsed,
      lastUsedDate,
      isFamily: !!family,
      familyName: family ? family.name : undefined,
    });
  }

  // 7. Filter recommendations
  let filtered = results;

  // Category filter
  if (options?.categoryFilter && options.categoryFilter !== 'all') {
    const targetCat = options.categoryFilter;
    filtered = filtered.filter(
      (r) => r.song.category === targetCat || r.song.category === 'both'
    );
  }

  // Status filter (respects family-level priorityGroup)
  if (options?.statusFilter && options.statusFilter !== 'all') {
    const status = options.statusFilter;
    if (status === 'new') {
      filtered = filtered.filter((r) => r.priorityGroup === 'new');
    } else if (status === 'once') {
      filtered = filtered.filter((r) => r.priorityGroup === 'once');
    } else if (status === 'least_played') {
      filtered = filtered.filter((r) => r.priorityGroup === 'least_played');
    } else if (status === 'seasonal') {
      filtered = filtered.filter((r) => r.isSeasonal);
    }
  }

  // Theme filter
  if (options?.themeFilter && options.themeFilter !== 'all') {
    const targetTheme = options.themeFilter.toLowerCase();
    filtered = filtered.filter((r) => {
      const themes = (r.song.themes || r.song.labels || []).map((t) => t.toLowerCase());
      return themes.some((t) => t.includes(targetTheme));
    });
  }

  // Search query filter
  if (options?.searchQuery) {
    const query = options.searchQuery.trim().toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.song.title.toLowerCase().includes(query) ||
        r.song.artist.toLowerCase().includes(query) ||
        (r.song.themes || []).some((t) => t.toLowerCase().includes(query)) ||
        (r.familyName && r.familyName.toLowerCase().includes(query))
    );
  }

  // Sort by finalScore descending, then dateAdded descending, then title ascending
  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const dateA = a.song.dateAdded || '';
    const dateB = b.song.dateAdded || '';
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return a.song.title.localeCompare(b.song.title);
  });

  return filtered;
}
