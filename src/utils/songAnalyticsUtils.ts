import { Member, Schedule, MinistryAssignment, getAssignmentMembers, Song, SongFamily } from '../types';
import { isPopulatedSchedule } from './scheduleUtils';
import { SongFamilyService } from '../services/songFamilyService';
import { resolveSlotSong } from './songResolveUtils';

/**
 * Checks if a member has the "Song Leader" tag.
 * Only members with this tag are included in Song Leader analytics.
 */
export function isSongLeaderMember(member: Member | undefined | null): boolean {
  if (!member || !member.labels || !Array.isArray(member.labels)) return false;
  return member.labels.some((l) => l.trim().toLowerCase() === 'song leader');
}

/**
 * Normalizes song title for casing-insensitive grouping while preserving clean display.
 */
export function normalizeSongTitle(title: string): string {
  return (title || '').trim();
}

export interface SongVersionCount {
  title: string;
  count: number;
}

export interface SongLeaderStatItem {
  songTitle: string;
  count: number;
  isFamily?: boolean;
  familyId?: string;
  versionBreakdown?: SongVersionCount[];
}

export interface MemberSongAnalytics {
  member: Member;
  totalSongsLed: number;
  // Favorite songs: led >= 2 times. If none >= 2, this is empty ([]).
  favoriteSongs: SongLeaderStatItem[];
  // Most played praise songs: highest personal praise count (>= 2x required for repeated analytics).
  mostPlayedPraise: SongLeaderStatItem[];
  // Most played worship songs: highest personal worship count (>= 2x required for repeated analytics).
  mostPlayedWorship: SongLeaderStatItem[];
  // All personal song count breakdown
  allSongCounts: Record<string, number>;
  praiseSongCounts: Record<string, number>;
  worshipSongCounts: Record<string, number>;
}

export interface MostUsedSongAnalytics {
  title: string;
  totalCount: number;
  isFamily?: boolean;
  familyId?: string;
  versionBreakdown?: SongVersionCount[];
  // Last song leader who led this song in the most recent saved lineup by actual service date
  lastSungBy: string;
  lastSungByMembers: Member[];
  lastSungDate?: string;
  // Song leader who has led this song the most times across saved lineups
  mostUsedBy: string;
  mostUsedByLeaders: { member: Member; count: number }[];
  mostUsedCount: number;
}

export interface SongAnalyticsResult {
  mostUsedSongs: MostUsedSongAnalytics[];
  memberAnalytics: MemberSongAnalytics[];
  songLeaderMembers: Member[];
  totalSavedLineups: number;
  totalUniqueSongs: number;
}

/**
 * Finds a member from the roster matching an assignment member ID or name who is a Song Leader.
 */
function resolveSongLeaderMember(
  memberId: string | undefined,
  memberName: string | undefined,
  members: Member[]
): Member | undefined {
  if (memberId) {
    const found = members.find((m) => m.id === memberId);
    if (found && isSongLeaderMember(found)) return found;
  }
  if (memberName && memberName !== 'Unassigned' && memberName !== '—') {
    const cleanName = memberName.trim().toLowerCase();
    const found = members.find(
      (m) => m.name.trim().toLowerCase() === cleanName && isSongLeaderMember(m)
    );
    if (found) return found;
  }
  return undefined;
}

/**
 * Determines which Song Leaders led Praise and Worship songs in a specific saved lineup.
 */
export function getScheduleSongLeaders(
  schedule: Schedule,
  members: Member[]
): {
  praiseLeaders: Member[];
  worshipLeaders: Member[];
  allScheduleLeaders: Member[];
} {
  const isLeaderRole = (rName: string) => {
    const r = (rName || '').toLowerCase().trim();
    return (
      (r.includes('song leader') ||
        r.includes('worship leader') ||
        r.includes('praise leader') ||
        r.includes('song lead')) &&
      !r.includes('backup') &&
      !r.includes('vocalist')
    );
  };

  const leaderRows = (schedule.ministryAssignments || []).filter((a) => isLeaderRole(a.role));

  const praiseLeaderSet = new Map<string, Member>();
  const worshipLeaderSet = new Map<string, Member>();
  const combinedLeaderSet = new Map<string, Member>();

  leaderRows.forEach((row) => {
    const rLower = (row.role || '').toLowerCase();
    const isPraiseOnly = rLower.includes('praise') && !rLower.includes('worship');
    const isWorshipOnly = rLower.includes('worship') && !rLower.includes('praise');
    const isCombined = !isPraiseOnly && !isWorshipOnly;

    const assignedMembers = getAssignmentMembers(row);
    assignedMembers.forEach((am) => {
      const resolved = resolveSongLeaderMember(am.memberId, am.memberName, members);
      if (resolved) {
        if (isPraiseOnly) {
          praiseLeaderSet.set(resolved.id, resolved);
        } else if (isWorshipOnly) {
          worshipLeaderSet.set(resolved.id, resolved);
        } else {
          combinedLeaderSet.set(resolved.id, resolved);
        }
      }
    });
  });

  const distinctPraise = Array.from(praiseLeaderSet.values());
  const distinctWorship = Array.from(worshipLeaderSet.values());
  const distinctCombined = Array.from(combinedLeaderSet.values());

  const allDistinctLeadersMap = new Map<string, Member>();
  [...distinctPraise, ...distinctWorship, ...distinctCombined].forEach((m) => {
    allDistinctLeadersMap.set(m.id, m);
  });
  const allDistinctLeaders = Array.from(allDistinctLeadersMap.values());

  let finalPraiseLeaders: Member[] = [];
  let finalWorshipLeaders: Member[] = [];

  // Rule 6: When a lineup has only ONE Song Leader, that Song Leader leads both Praise and Worship songs.
  if (allDistinctLeaders.length === 1) {
    finalPraiseLeaders = [allDistinctLeaders[0]];
    finalWorshipLeaders = [allDistinctLeaders[0]];
  } else if (distinctPraise.length > 0 || distinctWorship.length > 0) {
    // Two Song Leader mode / specific assignments
    finalPraiseLeaders = [...distinctPraise, ...distinctCombined];
    finalWorshipLeaders = [...distinctWorship, ...distinctCombined];
  } else {
    // All leaders are in combined/generic rows
    finalPraiseLeaders = [...distinctCombined];
    finalWorshipLeaders = [...distinctCombined];
  }

  return {
    praiseLeaders: finalPraiseLeaders,
    worshipLeaders: finalWorshipLeaders,
    allScheduleLeaders: allDistinctLeaders
  };
}

/**
 * Resolves the Song Family or canonical identity for a raw song slot in a schedule.
 * Strictly ID-authoritative: stale IDs are isolated under `stale_${cleanId}` and
 * no-ID duplicate titles remain isolated under `ambiguous_${cleanLower}`.
 */
function resolveSongIdentity(
  rawTitle: string,
  songId: string | undefined,
  songs: Song[] = [],
  songFamilies: SongFamily[] = []
): {
  canonicalKey: string;
  displayTitle: string;
  isFamily: boolean;
  familyId?: string;
  actualTitle: string;
} {
  const cleanTitle = (rawTitle || '').trim();
  const cleanLower = cleanTitle.toLowerCase();
  const cleanId = (songId || '').trim();
  const resolved = resolveSlotSong(cleanTitle, cleanId, songs);

  if (resolved.isStaleId) {
    const label = cleanTitle || 'Song unavailable';
    return {
      canonicalKey: `stale_${cleanId}`,
      displayTitle: label,
      isFamily: false,
      actualTitle: label
    };
  }

  if (resolved.song) {
    const matched = resolved.song;
    const fam =
      (matched.songFamilyId
        ? songFamilies.find((f) => f.id === matched.songFamilyId)
        : undefined) ||
      songFamilies.find(
        (f) =>
          (f.versionIds && f.versionIds.includes(matched.id)) ||
          (f.versions && f.versions.some((v) => v.songId === matched.id))
      );

    if (fam) {
      return {
        canonicalKey: `family_${fam.id}`,
        displayTitle: fam.name,
        isFamily: true,
        familyId: fam.id,
        actualTitle: matched.title
      };
    }

    return {
      canonicalKey: `song_id_${matched.id}`,
      displayTitle: matched.title,
      isFamily: false,
      actualTitle: matched.title
    };
  }

  if (resolved.isAmbiguous) {
    return {
      canonicalKey: `ambiguous_${cleanLower}`,
      displayTitle: cleanTitle,
      isFamily: false,
      actualTitle: cleanTitle
    };
  }

  // Unlinked title (no ID, not matched to catalog): check unique Song Family name match
  if (cleanLower) {
    const directFams = songFamilies.filter(
      (f) => f.name.trim().toLowerCase() === cleanLower
    );
    if (directFams.length === 1) {
      const directFam = directFams[0];
      return {
        canonicalKey: `family_${directFam.id}`,
        displayTitle: directFam.name,
        isFamily: true,
        familyId: directFam.id,
        actualTitle: cleanTitle
      };
    }
  }

  // Standalone unlinked song
  return {
    canonicalKey: `song_title_${cleanLower}`,
    displayTitle: cleanTitle,
    isFamily: false,
    actualTitle: cleanTitle
  };
}

/**
 * Calculates comprehensive Song Analytics:
 * 1. "Most Used Songs" with Song Family aggregation and recency-based "Last sung by" & "Most used by"
 * 2. "Member's Favorite Songs" for Song Leaders with Song Family aggregation and strict >= 2x usage threshold.
 */
export function calculateSongAnalytics(
  schedules: Schedule[],
  members: Member[],
  songs: Song[] = [],
  songFamilies: SongFamily[] = []
): SongAnalyticsResult {
  // 1. Filter populated saved lineups only (lineups with at least 1 song and NOT No Service)
  const savedSchedules = schedules.filter((s) => isPopulatedSchedule(s));

  // Sort saved schedules chronologically descending (latest service date first) for recency
  const sortedSchedulesDesc = [...savedSchedules].sort((a, b) => {
    const dateA = a.serviceDate || '';
    const dateB = b.serviceDate || '';
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    const updatedA = a.updatedAt || a.id || '';
    const updatedB = b.updatedAt || b.id || '';
    return updatedB.localeCompare(updatedA);
  });

  // Filter roster for Song Leader members only
  const songLeaderMembers = members
    .filter((m) => isSongLeaderMember(m))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  // Global song usage map (grouped by canonical key)
  interface CanonicalSongUsageRecord {
    canonicalKey: string;
    displayTitle: string;
    isFamily: boolean;
    familyId?: string;
    totalCount: number;
    versionCounts: Map<string, number>;
    occurrences: Array<{
      schedule: Schedule;
      actualTitle: string;
      category: 'praise' | 'worship';
      leaders: Member[];
    }>;
  }
  const songUsageMap = new Map<string, CanonicalSongUsageRecord>();

  // Personal maps per Song Leader
  interface PersonalSongGroup {
    displayTitle: string;
    isFamily: boolean;
    familyId?: string;
    versionCounts: Map<string, number>;
    count: number;
  }

  interface PersonalLeaderHistory {
    all: Map<string, PersonalSongGroup>;
    praise: Map<string, PersonalSongGroup>;
    worship: Map<string, PersonalSongGroup>;
  }

  const memberHistoryMap = new Map<string, PersonalLeaderHistory>();
  songLeaderMembers.forEach((m) => {
    memberHistoryMap.set(m.id, {
      all: new Map<string, PersonalSongGroup>(),
      praise: new Map<string, PersonalSongGroup>(),
      worship: new Map<string, PersonalSongGroup>()
    });
  });

  // Helper to record personal usage
  const recordPersonalUsage = (
    leaderId: string,
    targetMap: Map<string, PersonalSongGroup>,
    identity: ReturnType<typeof resolveSongIdentity>
  ) => {
    let group = targetMap.get(identity.canonicalKey);
    if (!group) {
      group = {
        displayTitle: identity.displayTitle,
        isFamily: identity.isFamily,
        familyId: identity.familyId,
        versionCounts: new Map<string, number>(),
        count: 0
      };
      targetMap.set(identity.canonicalKey, group);
    }
    group.count += 1;
    group.versionCounts.set(
      identity.actualTitle,
      (group.versionCounts.get(identity.actualTitle) || 0) + 1
    );
  };

  // Process all saved lineups
  sortedSchedulesDesc.forEach((schedule) => {
    const { praiseLeaders, worshipLeaders } = getScheduleSongLeaders(schedule, members);

    // Process Praise songs (preserving raw slot index alignment with praiseSongIds)
    (schedule.praiseSongs || []).forEach((slotTitle, idx) => {
      const rawTitle = (slotTitle || '').trim();
      const slotId = schedule.praiseSongIds?.[idx];
      if (!rawTitle && !(slotId && slotId.trim())) return;

      const identity = resolveSongIdentity(rawTitle, slotId, songs, songFamilies);
      let record = songUsageMap.get(identity.canonicalKey);
      if (!record) {
        record = {
          canonicalKey: identity.canonicalKey,
          displayTitle: identity.displayTitle,
          isFamily: identity.isFamily,
          familyId: identity.familyId,
          totalCount: 0,
          versionCounts: new Map<string, number>(),
          occurrences: []
        };
        songUsageMap.set(identity.canonicalKey, record);
      }
      record.totalCount += 1;
      record.versionCounts.set(
        identity.actualTitle,
        (record.versionCounts.get(identity.actualTitle) || 0) + 1
      );
      record.occurrences.push({
        schedule,
        actualTitle: identity.actualTitle,
        category: 'praise',
        leaders: praiseLeaders
      });

      // Update personal counts for each praise leader
      praiseLeaders.forEach((leader) => {
        const pHistory = memberHistoryMap.get(leader.id);
        if (pHistory) {
          recordPersonalUsage(leader.id, pHistory.all, identity);
          recordPersonalUsage(leader.id, pHistory.praise, identity);
        }
      });
    });

    // Process Worship songs (preserving raw slot index alignment with worshipSongIds)
    (schedule.worshipSongs || []).forEach((slotTitle, idx) => {
      const rawTitle = (slotTitle || '').trim();
      const slotId = schedule.worshipSongIds?.[idx];
      if (!rawTitle && !(slotId && slotId.trim())) return;

      const identity = resolveSongIdentity(rawTitle, slotId, songs, songFamilies);
      let record = songUsageMap.get(identity.canonicalKey);
      if (!record) {
        record = {
          canonicalKey: identity.canonicalKey,
          displayTitle: identity.displayTitle,
          isFamily: identity.isFamily,
          familyId: identity.familyId,
          totalCount: 0,
          versionCounts: new Map<string, number>(),
          occurrences: []
        };
        songUsageMap.set(identity.canonicalKey, record);
      }
      record.totalCount += 1;
      record.versionCounts.set(
        identity.actualTitle,
        (record.versionCounts.get(identity.actualTitle) || 0) + 1
      );
      record.occurrences.push({
        schedule,
        actualTitle: identity.actualTitle,
        category: 'worship',
        leaders: worshipLeaders
      });

      // Update personal counts for each worship leader
      worshipLeaders.forEach((leader) => {
        const pHistory = memberHistoryMap.get(leader.id);
        if (pHistory) {
          recordPersonalUsage(leader.id, pHistory.all, identity);
          recordPersonalUsage(leader.id, pHistory.worship, identity);
        }
      });
    });
  });

  // Calculate Most Used Songs
  const mostUsedSongs: MostUsedSongAnalytics[] = Array.from(songUsageMap.values())
    .map((record) => {
      // Version breakdown array
      const versionBreakdown: SongVersionCount[] = Array.from(record.versionCounts.entries())
        .map(([title, count]) => ({ title, count }))
        .sort((a, b) => b.count - a.count);

      // 1. Determine "Last sung by"
      let lastSungBy = 'N/A';
      let lastSungByMembers: Member[] = [];
      let lastSungDate: string | undefined = undefined;

      if (record.occurrences.length > 0) {
        lastSungDate = record.occurrences[0].schedule.serviceDate;

        for (const occ of record.occurrences) {
          if (occ.leaders.length > 0) {
            const latestDate = occ.schedule.serviceDate;
            lastSungDate = latestDate;
            const sameDateLeadersMap = new Map<string, Member>();
            record.occurrences
              .filter((o) => o.schedule.serviceDate === latestDate)
              .forEach((o) => {
                o.leaders.forEach((m) => sameDateLeadersMap.set(m.id, m));
              });

            lastSungByMembers = Array.from(sameDateLeadersMap.values());
            if (lastSungByMembers.length > 0) {
              lastSungBy = lastSungByMembers.map((m) => m.name).join(', ');
            }
            break;
          }
        }
      }

      // 2. Determine "Most used by" across the entire Song Family
      const leaderCountMap = new Map<string, { member: Member; count: number }>();
      record.occurrences.forEach((occ) => {
        occ.leaders.forEach((leader) => {
          const existing = leaderCountMap.get(leader.id) || { member: leader, count: 0 };
          existing.count += 1;
          leaderCountMap.set(leader.id, existing);
        });
      });

      const leaderCounts = Array.from(leaderCountMap.values());
      let mostUsedBy = 'N/A';
      let mostUsedByLeaders: { member: Member; count: number }[] = [];
      let maxCount = 0;

      if (leaderCounts.length > 0) {
        maxCount = Math.max(...leaderCounts.map((l) => l.count));
        mostUsedByLeaders = leaderCounts.filter((l) => l.count === maxCount);
        if (mostUsedByLeaders.length > 0) {
          const names = mostUsedByLeaders.map((l) => l.member.name).join(', ');
          mostUsedBy = `${names} (${maxCount}x)`;
        }
      }

      return {
        title: record.displayTitle,
        totalCount: record.totalCount,
        isFamily: record.isFamily,
        familyId: record.familyId,
        versionBreakdown,
        lastSungBy,
        lastSungByMembers,
        lastSungDate,
        mostUsedBy,
        mostUsedByLeaders,
        mostUsedCount: maxCount
      };
    })
    .sort((a, b) => {
      if (b.totalCount !== a.totalCount) {
        return b.totalCount - a.totalCount;
      }
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });

  // Calculate Member Analytics for each Song Leader
  const memberAnalytics: MemberSongAnalytics[] = songLeaderMembers.map((member) => {
    const history = memberHistoryMap.get(member.id) || {
      all: new Map<string, PersonalSongGroup>(),
      praise: new Map<string, PersonalSongGroup>(),
      worship: new Map<string, PersonalSongGroup>()
    };

    const allCountsObj: Record<string, number> = {};
    history.all.forEach((grp) => {
      allCountsObj[grp.displayTitle] = grp.count;
    });

    const praiseCountsObj: Record<string, number> = {};
    history.praise.forEach((grp) => {
      praiseCountsObj[grp.displayTitle] = grp.count;
    });

    const worshipCountsObj: Record<string, number> = {};
    history.worship.forEach((grp) => {
      worshipCountsObj[grp.displayTitle] = grp.count;
    });

    const formatStatItems = (items: PersonalSongGroup[]): SongLeaderStatItem[] => {
      return items.map((grp) => ({
        songTitle: grp.displayTitle,
        count: grp.count,
        isFamily: grp.isFamily,
        familyId: grp.familyId,
        versionBreakdown: Array.from(grp.versionCounts.entries()).map(([t, c]) => ({ title: t, count: c }))
      }));
    };

    // 1. FAVORITE SONGS RULE:
    // Only Song Families / songs led AT LEAST 2 TIMES (>= 2).
    // Songs with only 1 play MUST NOT BE DISPLAYED.
    // If none has >= 2, empty array ([]).
    const qualifyingFavorites = Array.from(history.all.values()).filter((grp) => grp.count >= 2);
    const favoriteSongs: SongLeaderStatItem[] = formatStatItems(qualifyingFavorites).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.songTitle.localeCompare(b.songTitle, undefined, { sensitivity: 'base' });
    });

    // 2. MOST PLAYED PRAISE SONG(S) RULE:
    // Highest personal praise count.
    // Minimum 2x required for repeated favorite analytics; if max count >= 2, show all tied max count songs.
    let mostPlayedPraise: SongLeaderStatItem[] = [];
    const praiseGroups = Array.from(history.praise.values()).filter((grp) => grp.count >= 2);
    if (praiseGroups.length > 0) {
      const maxPraise = Math.max(...praiseGroups.map((g) => g.count));
      mostPlayedPraise = formatStatItems(praiseGroups.filter((g) => g.count === maxPraise)).sort(
        (a, b) => a.songTitle.localeCompare(b.songTitle, undefined, { sensitivity: 'base' })
      );
    }

    // 3. MOST PLAYED WORSHIP SONG(S) RULE:
    // Highest personal worship count.
    // Minimum 2x required for repeated favorite analytics; if max count >= 2, show all tied max count songs.
    let mostPlayedWorship: SongLeaderStatItem[] = [];
    const worshipGroups = Array.from(history.worship.values()).filter((grp) => grp.count >= 2);
    if (worshipGroups.length > 0) {
      const maxWorship = Math.max(...worshipGroups.map((g) => g.count));
      mostPlayedWorship = formatStatItems(worshipGroups.filter((g) => g.count === maxWorship)).sort(
        (a, b) => a.songTitle.localeCompare(b.songTitle, undefined, { sensitivity: 'base' })
      );
    }

    const totalSongsLed = Array.from(history.all.values()).reduce((sum, g) => sum + g.count, 0);

    return {
      member,
      totalSongsLed,
      favoriteSongs,
      mostPlayedPraise,
      mostPlayedWorship,
      allSongCounts: allCountsObj,
      praiseSongCounts: praiseCountsObj,
      worshipSongCounts: worshipCountsObj
    };
  });

  return {
    mostUsedSongs,
    memberAnalytics,
    songLeaderMembers,
    totalSavedLineups: savedSchedules.length,
    totalUniqueSongs: songUsageMap.size
  };
}

