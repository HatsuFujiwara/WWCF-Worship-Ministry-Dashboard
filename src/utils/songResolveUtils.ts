import { Song, Schedule } from '../types';
import { getManilaNowISO } from './dateUtils';

/**
 * Resolves a catalog song for a slot.
 * - Stored ID is authoritative: if provided and present in allSongs, returns the song.
 * - If stored ID is provided but NOT in allSongs (deleted/stale ID), returns undefined with isStaleId: true.
 *   CRITICAL: Never falls back to title matching when a non-empty stored ID exists.
 * - If no stored ID is provided:
 *   - Matches by exact normalized title ONLY if exactly ONE catalog song has that title.
 *   - If multiple songs share the title, returns undefined with isAmbiguous: true (never auto-assigns).
 *   - If zero matches, returns undefined.
 */
export function resolveSlotSong(
  rawTitle: string | undefined,
  songId: string | undefined,
  allSongs: Song[] = []
): {
  song?: Song;
  isStaleId: boolean;
  isAmbiguous: boolean;
  isUnmatched: boolean;
} {
  const cleanId = (songId || '').trim();
  const cleanTitle = (rawTitle || '').trim().toLowerCase();

  // 1. Stored ID is authoritative
  if (cleanId) {
    const song = allSongs.find((s) => s.id === cleanId);
    if (song) {
      return { song, isStaleId: false, isAmbiguous: false, isUnmatched: false };
    }
    // Stored ID exists but is absent from catalog -> preserve stale state, never fall through to title!
    return { song: undefined, isStaleId: true, isAmbiguous: false, isUnmatched: false };
  }

  // 2. No stored ID -> check title matching
  if (!cleanTitle) {
    return { song: undefined, isStaleId: false, isAmbiguous: false, isUnmatched: false };
  }

  const exactMatches = allSongs.filter(
    (s) => s.title.trim().toLowerCase() === cleanTitle
  );

  if (exactMatches.length === 1) {
    return { song: exactMatches[0], isStaleId: false, isAmbiguous: false, isUnmatched: false };
  }

  if (exactMatches.length > 1) {
    // Duplicate matches remain ambiguous until reviewed
    return { song: undefined, isStaleId: false, isAmbiguous: true, isUnmatched: false };
  }

  return { song: undefined, isStaleId: false, isAmbiguous: false, isUnmatched: true };
}

/**
 * Finds a song in the song database matching a given reference (Song ID or Title).
 * Ambiguity-safe: title fallback applies only when exactly ONE match exists.
 */
export function findSongByRefOrTitle(ref: string | undefined, allSongs: Song[] = []): Song | undefined {
  if (!ref || !ref.trim()) return undefined;
  const clean = ref.trim();
  const cleanLower = clean.toLowerCase();

  // 1. Direct match by exact Song ID
  const byId = allSongs.find((s) => s.id === clean);
  if (byId) return byId;

  // 2. Match by exact song title only if unique
  const byTitleMatches = allSongs.filter((s) => s.title.trim().toLowerCase() === cleanLower);
  if (byTitleMatches.length === 1) {
    return byTitleMatches[0];
  }

  return undefined;
}

/**
 * Resolves the authoritative current song title from the Song Database.
 * Prioritizes the stable Song ID over any cached/stored snapshot title.
 * 
 * - If songId is provided and exists in allSongs: returns the latest song.title.
 * - If songId is provided but no longer exists (deleted song): returns fallback title or "Song unavailable".
 *   Never falls through to a different catalog song that happens to share the title.
 * - If only raw title is provided: resolves only if exactly 1 song matches; otherwise returns raw title.
 */
export function resolveSongTitle(
  rawTitle: string | undefined,
  songId: string | undefined,
  allSongs: Song[] = []
): string {
  const cleanTitle = (rawTitle || '').trim();
  const cleanId = (songId || '').trim();

  // 1. If songId is provided, resolve from authoritative Song Database record
  if (cleanId) {
    const song = allSongs.find((s) => s.id === cleanId);
    if (song) {
      return song.title;
    }
    // If explicitly referenced a songId that does not exist in DB (deleted song)
    if (cleanTitle) {
      return cleanTitle;
    }
    return 'Song unavailable';
  }

  // 2. If no songId provided, check if rawTitle is a unique match
  if (cleanTitle) {
    const cleanLower = cleanTitle.toLowerCase();
    const exactMatches = allSongs.filter((s) => s.title.trim().toLowerCase() === cleanLower);
    if (exactMatches.length === 1) {
      return exactMatches[0].title;
    }
    return cleanTitle;
  }

  return '';
}

/**
 * Resolves all praise and worship song titles in a schedule using the authoritative Song Database.
 * Preserves stale IDs and prevents silent duplicate reassignment.
 */
export function resolveScheduleSongTitles(
  schedule: Schedule,
  allSongs: Song[] = []
): {
  praiseSongs: string[];
  worshipSongs: string[];
  praiseSongIds: string[];
  worshipSongIds: string[];
} {
  const praiseSongs = (schedule.praiseSongs || []).map((title, idx) => {
    const songId = schedule.praiseSongIds?.[idx];
    return resolveSongTitle(title, songId, allSongs);
  });

  const praiseSongIds = (schedule.praiseSongs || []).map((title, idx) => {
    const existingId = schedule.praiseSongIds?.[idx];
    if (existingId && existingId.trim()) {
      // Stored ID is authoritative; preserve it even if absent from catalog
      return existingId.trim();
    }
    // Only resolve by title if slot had no ID and exactly 1 match exists
    const cleanTitle = (title || '').trim().toLowerCase();
    if (!cleanTitle) return '';
    const matches = allSongs.filter((s) => s.title.trim().toLowerCase() === cleanTitle);
    return matches.length === 1 ? matches[0].id : '';
  });

  const worshipSongs = (schedule.worshipSongs || []).map((title, idx) => {
    const songId = schedule.worshipSongIds?.[idx];
    return resolveSongTitle(title, songId, allSongs);
  });

  const worshipSongIds = (schedule.worshipSongs || []).map((title, idx) => {
    const existingId = schedule.worshipSongIds?.[idx];
    if (existingId && existingId.trim()) {
      // Stored ID is authoritative; preserve it even if absent from catalog
      return existingId.trim();
    }
    const cleanTitle = (title || '').trim().toLowerCase();
    if (!cleanTitle) return '';
    const matches = allSongs.filter((s) => s.title.trim().toLowerCase() === cleanTitle);
    return matches.length === 1 ? matches[0].id : '';
  });

  return {
    praiseSongs,
    worshipSongs,
    praiseSongIds,
    worshipSongIds
  };
}

/**
 * Synchronizes all saved schedules when a song is renamed or updated in the Song Database.
 * Preserves the stable Song ID and immediately updates the stored snapshot titles.
 */
export function syncSchedulesOnSongRename(
  oldTitle: string | undefined,
  updatedSong: Song,
  schedules: Schedule[] = []
): { updatedSchedules: Schedule[]; hasChanges: boolean } {
  let hasChanges = false;
  const cleanOldTitle = (oldTitle || '').trim().toLowerCase();
  const targetId = updatedSong.id;
  const newTitle = updatedSong.title.trim();

  const updatedSchedules = schedules.map((sch) => {
    let schModified = false;

    // Synchronize Praise Songs
    const currentPraise = sch.praiseSongs ? [...sch.praiseSongs] : [];
    const currentPraiseIds = sch.praiseSongIds ? [...sch.praiseSongIds] : new Array(currentPraise.length).fill('');

    // Ensure array lengths match
    while (currentPraiseIds.length < currentPraise.length) {
      currentPraiseIds.push('');
    }

    currentPraise.forEach((title, idx) => {
      const songId = currentPraiseIds[idx];
      const titleLower = title.trim().toLowerCase();

      const matchesById = Boolean(songId && songId === targetId);
      // Strictly ID-authoritative: only allow title fallback for legacy slots that have no ID
      const matchesByOldTitle = Boolean(!songId && cleanOldTitle && titleLower === cleanOldTitle);
      const matchesByIdString = Boolean(!songId && title.trim() === targetId);

      if (matchesById || matchesByOldTitle || matchesByIdString) {
        if (currentPraise[idx] !== newTitle || currentPraiseIds[idx] !== targetId) {
          currentPraise[idx] = newTitle;
          currentPraiseIds[idx] = targetId;
          schModified = true;
        }
      }
    });

    // Synchronize Worship Songs
    const currentWorship = sch.worshipSongs ? [...sch.worshipSongs] : [];
    const currentWorshipIds = sch.worshipSongIds ? [...sch.worshipSongIds] : new Array(currentWorship.length).fill('');

    while (currentWorshipIds.length < currentWorship.length) {
      currentWorshipIds.push('');
    }

    currentWorship.forEach((title, idx) => {
      const songId = currentWorshipIds[idx];
      const titleLower = title.trim().toLowerCase();

      const matchesById = Boolean(songId && songId === targetId);
      // Strictly ID-authoritative: only allow title fallback for legacy slots that have no ID
      const matchesByOldTitle = Boolean(!songId && cleanOldTitle && titleLower === cleanOldTitle);
      const matchesByIdString = Boolean(!songId && title.trim() === targetId);

      if (matchesById || matchesByOldTitle || matchesByIdString) {
        if (currentWorship[idx] !== newTitle || currentWorshipIds[idx] !== targetId) {
          currentWorship[idx] = newTitle;
          currentWorshipIds[idx] = targetId;
          schModified = true;
        }
      }
    });

    if (schModified) {
      hasChanges = true;
      return {
        ...sch,
        praiseSongs: currentPraise,
        praiseSongIds: currentPraiseIds,
        worshipSongs: currentWorship,
        worshipSongIds: currentWorshipIds,
        updatedAt: getManilaNowISO()
      };
    }

    return sch;
  });

  return { updatedSchedules, hasChanges };
}

/**
 * Auto-backfills Song IDs and resolves latest titles across all schedules based on current song database.
 */
export function syncSchedulesWithAuthoritativeSongs(
  schedules: Schedule[] = [],
  allSongs: Song[] = []
): { updatedSchedules: Schedule[]; hasChanges: boolean } {
  if (schedules.length === 0 || allSongs.length === 0) {
    return { updatedSchedules: schedules, hasChanges: false };
  }

  let hasChanges = false;

  const updatedSchedules = schedules.map((sch) => {
    let schModified = false;

    // Praise Songs
    const currentPraise = sch.praiseSongs ? [...sch.praiseSongs] : [];
    const currentPraiseIds = sch.praiseSongIds ? [...sch.praiseSongIds] : new Array(currentPraise.length).fill('');
    while (currentPraiseIds.length < currentPraise.length) {
      currentPraiseIds.push('');
    }

    const updatedPraise = currentPraise.map((title, idx) => {
      const existingId = currentPraiseIds[idx];
      if (existingId && existingId.trim()) {
        const found = allSongs.find((s) => s.id === existingId.trim());
        if (found) {
          if (title !== found.title) {
            schModified = true;
          }
          return found.title;
        }
        // Stored ID is absent from catalog (stale ID): preserve title and keep ID, never fall through!
        return title;
      }

      // Slot had no ID: match by title only if exactly 1 catalog song matches
      const cleanLower = (title || '').trim().toLowerCase();
      if (cleanLower) {
        const matches = allSongs.filter((s) => s.title.trim().toLowerCase() === cleanLower);
        if (matches.length === 1) {
          const matched = matches[0];
          if (currentPraiseIds[idx] !== matched.id || title !== matched.title) {
            currentPraiseIds[idx] = matched.id;
            schModified = true;
          }
          return matched.title;
        }
      }

      return title;
    });

    // Worship Songs
    const currentWorship = sch.worshipSongs ? [...sch.worshipSongs] : [];
    const currentWorshipIds = sch.worshipSongIds ? [...sch.worshipSongIds] : new Array(currentWorship.length).fill('');
    while (currentWorshipIds.length < currentWorship.length) {
      currentWorshipIds.push('');
    }

    const updatedWorship = currentWorship.map((title, idx) => {
      const existingId = currentWorshipIds[idx];
      if (existingId && existingId.trim()) {
        const found = allSongs.find((s) => s.id === existingId.trim());
        if (found) {
          if (title !== found.title) {
            schModified = true;
          }
          return found.title;
        }
        // Stored ID is absent from catalog (stale ID): preserve title and keep ID, never fall through!
        return title;
      }

      // Slot had no ID: match by title only if exactly 1 catalog song matches
      const cleanLower = (title || '').trim().toLowerCase();
      if (cleanLower) {
        const matches = allSongs.filter((s) => s.title.trim().toLowerCase() === cleanLower);
        if (matches.length === 1) {
          const matched = matches[0];
          if (currentWorshipIds[idx] !== matched.id || title !== matched.title) {
            currentWorshipIds[idx] = matched.id;
            schModified = true;
          }
          return matched.title;
        }
      }

      return title;
    });

    const prevPraiseIds = sch.praiseSongIds ? [...sch.praiseSongIds] : new Array(currentPraise.length).fill('');
    const prevWorshipIds = sch.worshipSongIds ? [...sch.worshipSongIds] : new Array(currentWorship.length).fill('');

    let updatedTransitionNotes = sch.transitionNotes ? { ...sch.transitionNotes } : undefined;
    const migrateSectionNotes = (
      section: 'praise' | 'worship',
      origTitles: string[],
      origIds: string[],
      nextTitles: string[],
      nextIds: string[]
    ) => {
      if (!updatedTransitionNotes) return;
      for (let i = 0; i < nextTitles.length - 1; i++) {
        const hadFromId = Boolean((origIds[i] || '').trim());
        const hadToId = Boolean((origIds[i + 1] || '').trim());
        if (hadFromId || hadToId) continue; // Already ID-keyed slot pair; never migrate across IDs

        const nowFromId = (nextIds[i] || '').trim();
        const nowToId = (nextIds[i + 1] || '').trim();
        if (!nowFromId && !nowToId) continue;

        const newFromPart = nowFromId ? `id:${nowFromId}` : (nextTitles[i] || '').trim().toLowerCase();
        const newToPart = nowToId ? `id:${nowToId}` : (nextTitles[i + 1] || '').trim().toLowerCase();
        const newKey = `${section}::${newFromPart}->${newToPart}`;
        if (updatedTransitionNotes[newKey] !== undefined) continue;

        const oldTitleKey = `${section}::${(origTitles[i] || '').trim().toLowerCase()}->${(origTitles[i + 1] || '').trim().toLowerCase()}`;
        const legacyIdxKey = `${section}_${i}_${i + 1}`;
        const legacyNote =
          updatedTransitionNotes[oldTitleKey] !== undefined
            ? updatedTransitionNotes[oldTitleKey]
            : updatedTransitionNotes[legacyIdxKey];

        if (legacyNote !== undefined) {
          updatedTransitionNotes[newKey] = legacyNote;
          schModified = true;
        }
      }
    };

    migrateSectionNotes('praise', currentPraise, prevPraiseIds, updatedPraise, currentPraiseIds);
    migrateSectionNotes('worship', currentWorship, prevWorshipIds, updatedWorship, currentWorshipIds);

    if (schModified) {
      hasChanges = true;
      return {
        ...sch,
        praiseSongs: updatedPraise,
        praiseSongIds: currentPraiseIds,
        worshipSongs: updatedWorship,
        worshipSongIds: currentWorshipIds,
        ...(updatedTransitionNotes ? { transitionNotes: updatedTransitionNotes } : {})
      };
    }

    return sch;
  });

  return { updatedSchedules, hasChanges };
}
