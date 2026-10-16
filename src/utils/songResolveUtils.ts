import { Song, Schedule } from '../types';
import { getManilaNowISO } from './dateUtils';

/**
 * Finds a song in the song database matching a given reference (Song ID or Title).
 */
export function findSongByRefOrTitle(ref: string | undefined, allSongs: Song[] = []): Song | undefined {
  if (!ref || !ref.trim()) return undefined;
  const clean = ref.trim();
  const cleanLower = clean.toLowerCase();

  // 1. Direct match by exact Song ID
  const byId = allSongs.find((s) => s.id === clean);
  if (byId) return byId;

  // 2. Match by exact song title (case-insensitive)
  const byTitle = allSongs.find((s) => s.title.trim().toLowerCase() === cleanLower);
  if (byTitle) return byTitle;

  return undefined;
}

/**
 * Resolves the authoritative current song title from the Song Database.
 * Prioritizes the stable Song ID over any cached/stored snapshot title.
 * 
 * - If songId is provided and exists in allSongs: returns the latest song.title.
 * - If songId is provided but no longer exists (deleted song): returns fallback title or "Song unavailable".
 * - If only raw title is provided: checks if it matches a known song in allSongs; otherwise returns raw title.
 */
export function resolveSongTitle(
  rawTitle: string | undefined,
  songId: string | undefined,
  allSongs: Song[] = []
): string {
  const cleanTitle = (rawTitle || '').trim();

  // 1. If songId is provided, resolve from authoritative Song Database record
  if (songId && songId.trim()) {
    const cleanId = songId.trim();
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

  // 2. If no songId provided, check if rawTitle itself is a song ID
  if (cleanTitle) {
    const songById = allSongs.find((s) => s.id === cleanTitle);
    if (songById) {
      return songById.title;
    }

    // 3. Check if rawTitle matches an existing song title in the database
    const songByTitle = allSongs.find(
      (s) => s.title.trim().toLowerCase() === cleanTitle.toLowerCase()
    );
    if (songByTitle) {
      return songByTitle.title;
    }

    return cleanTitle;
  }

  return '';
}

/**
 * Resolves all praise and worship song titles in a schedule using the authoritative Song Database.
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
    if (existingId && allSongs.some((s) => s.id === existingId)) {
      return existingId;
    }
    const found = findSongByRefOrTitle(title, allSongs);
    return found ? found.id : (existingId || '');
  });

  const worshipSongs = (schedule.worshipSongs || []).map((title, idx) => {
    const songId = schedule.worshipSongIds?.[idx];
    return resolveSongTitle(title, songId, allSongs);
  });

  const worshipSongIds = (schedule.worshipSongs || []).map((title, idx) => {
    const existingId = schedule.worshipSongIds?.[idx];
    if (existingId && allSongs.some((s) => s.id === existingId)) {
      return existingId;
    }
    const found = findSongByRefOrTitle(title, allSongs);
    return found ? found.id : (existingId || '');
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
      const matchesByOldTitle = Boolean(cleanOldTitle && titleLower === cleanOldTitle);
      const matchesByIdString = title.trim() === targetId;

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
      const matchesByOldTitle = Boolean(cleanOldTitle && titleLower === cleanOldTitle);
      const matchesByIdString = title.trim() === targetId;

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
      if (existingId) {
        const found = allSongs.find((s) => s.id === existingId);
        if (found) {
          if (title !== found.title) {
            schModified = true;
          }
          return found.title;
        }
      }

      const matched = findSongByRefOrTitle(title, allSongs);
      if (matched) {
        if (currentPraiseIds[idx] !== matched.id || title !== matched.title) {
          currentPraiseIds[idx] = matched.id;
          schModified = true;
        }
        return matched.title;
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
      if (existingId) {
        const found = allSongs.find((s) => s.id === existingId);
        if (found) {
          if (title !== found.title) {
            schModified = true;
          }
          return found.title;
        }
      }

      const matched = findSongByRefOrTitle(title, allSongs);
      if (matched) {
        if (currentWorshipIds[idx] !== matched.id || title !== matched.title) {
          currentWorshipIds[idx] = matched.id;
          schModified = true;
        }
        return matched.title;
      }

      return title;
    });

    if (schModified) {
      hasChanges = true;
      return {
        ...sch,
        praiseSongs: updatedPraise,
        praiseSongIds: currentPraiseIds,
        worshipSongs: updatedWorship,
        worshipSongIds: currentWorshipIds
      };
    }

    return sch;
  });

  return { updatedSchedules, hasChanges };
}
