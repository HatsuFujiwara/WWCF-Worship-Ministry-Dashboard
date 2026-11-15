import { Song, Schedule, SongCategory, SongFamily, SongConflictResult, SongConflictType, SongRelationshipType, SongVersionType } from '../types';
import { DEFAULT_SONGS } from '../data/songSeedData';
import { getManilaTodayString, getManilaNowISO } from '../utils/dateUtils';
import { isFirstRegularServiceOfMonth, getLastRegularSchedulesOfPreviousMonth, isNoServiceSchedule } from '../utils/scheduleUtils';
import { isSpecialEvent, isFirstWeekOfMonth, getLastWeekOfPreviousMonthRange } from '../utils/recommendationUtils';
import { sanitizeSongLanguage, detectSongLanguage } from '../utils/languageUtils';
import { getNormalizedBaseTitle, areArtistsEquivalent, verifySongIdentity, calculateLyricsSimilarity } from '../utils/songFamilyUtils';
import { StorageService, quarantineCorruptStorage } from './storage';
import { syncSchedulesOnSongRename, resolveSlotSong } from '../utils/songResolveUtils';
import { MAX_LYRICS_LENGTH } from '../utils/lyricsParser';
import { sanitizeInstrumentCharts, validateInstrumentCharts } from '../utils/chordChartUtils';
import { sanitizeVideoMarkers, validateVideoMarkers } from '../utils/videoMarkerUtils';

const SONGS_STORAGE_KEY = 'wwcf_songs_v1';

export type DuplicateMatch = SongConflictResult;

export interface YouTubeMetadataResult {
  youtubeId: string;
  youtubeUrl: string;
  thumbnailUrl: string;
  title?: string;
  artist?: string;
  duration?: string;
}

export interface AffectedScheduleRef {
  id: string;
  serviceDate: string;
  serviceType: string;
}

export interface MonthlyUsageCheckResult {
  songTitle: string;
  timesUsedThisMonth: number;
  lastDateUsed?: string;
  serviceTypes: string[];
  datesUsed: string[];
  affectedSchedules?: AffectedScheduleRef[];
}

/**
 * Extracts YouTube 11-character Video ID from various URL formats
 */
export function extractYouTubeId(urlStr: string): string | null {
  if (!urlStr) return null;
  const trimmed = urlStr.trim();
  // Regex supporting youtube.com, youtu.be, m.youtube.com, music.youtube.com, shorts, etc.
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = trimmed.match(regExp);
  if (match && match[2] && match[2].length === 11) {
    return match[2];
  }
  // If user pasted raw 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Asynchronous SongService layer for local-first catalog persistence.
 */
export class SongService {
  private static sanitizeStoredSong(raw: any): Song | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
    const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : '';
    if (!id || !title) return null;
    return {
      ...raw,
      id,
      title,
      artist: typeof raw.artist === 'string' && raw.artist.trim() ? raw.artist : 'Unknown Artist',
      language: typeof raw.language === 'string' ? raw.language : 'English',
      category: raw.category === 'praise' || raw.category === 'worship' || raw.category === 'both' ? raw.category : 'both',
      timesUsed: typeof raw.timesUsed === 'number' && !isNaN(raw.timesUsed) ? raw.timesUsed : 0,
      serviceHistory: Array.isArray(raw.serviceHistory) ? raw.serviceHistory : [],
      dateAdded: typeof raw.dateAdded === 'string' ? raw.dateAdded : '',
      ...(Array.isArray(raw.instrumentCharts)
        ? { instrumentCharts: sanitizeInstrumentCharts(raw.instrumentCharts) }
        : {}),
      ...(Array.isArray(raw.videoMarkers)
        ? { videoMarkers: sanitizeVideoMarkers(raw.videoMarkers) }
        : {})
    };
  }

  /**
   * Synchronously retrieves all songs from storage for synchronous calculation utilities
   */
  static getSongsSync(): Song[] {
    try {
      const data = localStorage.getItem(SONGS_STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) {
        quarantineCorruptStorage(SONGS_STORAGE_KEY, data, 'Stored song catalog is corrupted (not an array).');
        return [];
      }
      const valid = parsed
        .map((item) => this.sanitizeStoredSong(item))
        .filter((item): item is Song => item !== null);
      if (valid.length < parsed.length) {
        quarantineCorruptStorage(
          SONGS_STORAGE_KEY,
          data,
          `Skipped ${parsed.length - valid.length} malformed song record(s) while preserving valid catalog entries.`
        );
      }
      return valid;
    } catch (e) {
      try {
        const data = localStorage.getItem(SONGS_STORAGE_KEY);
        if (data) {
          quarantineCorruptStorage(SONGS_STORAGE_KEY, data, 'Stored song catalog JSON could not be parsed.');
        }
      } catch {}
      console.error('Error reading songs synchronously:', e);
      return [];
    }
  }

  /**
   * Overwrites/Saves full songs list (used for restores or mass updates)
   */
  static async saveSongsList(songs: Song[]): Promise<void> {
    try {
      localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(songs));
      const verified = localStorage.getItem(SONGS_STORAGE_KEY);
      if (verified === null) throw new Error('Persistence verification failed for songs catalog.');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wwcf:songs-updated', { detail: songs }));
        window.dispatchEvent(new CustomEvent('wwcf:data-changed', { detail: { type: 'songs' } }));
      }
    } catch (e) {
      console.error('Error saving songs list:', e);
      throw e;
    }
  }

  /**
   * Retrieves all songs from database (LocalStorage or Cloud backend)
   */
  static async getSongs(): Promise<Song[]> {
    try {
      const data = localStorage.getItem(SONGS_STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) {
        quarantineCorruptStorage(SONGS_STORAGE_KEY, data, 'Stored song catalog is corrupted (not an array).');
        return [];
      }

      let hasMigrationUpdates = false;
      let droppedCount = 0;
      const sanitized: Song[] = [];

      for (const rawItem of parsed) {
        const s = this.sanitizeStoredSong(rawItem);
        if (!s) {
          droppedCount++;
          continue;
        }
        const rawLang = s.language || '';
        if (rawLang.toLowerCase() === 'cebuano') {
          hasMigrationUpdates = true;
          const detected = detectSongLanguage(s.title, s.lyrics);
          sanitized.push({
            ...s,
            language: detected.confidence === 'high' ? detected.language : 'Tagalog'
          });
        } else {
          sanitized.push({
            ...s,
            language: sanitizeSongLanguage(s.language)
          });
        }
      }

      if (droppedCount > 0) {
        quarantineCorruptStorage(
          SONGS_STORAGE_KEY,
          data,
          `Skipped ${droppedCount} malformed song record(s) while preserving valid catalog entries.`
        );
      } else if (hasMigrationUpdates) {
        localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(sanitized));
      }

      return sanitized;
    } catch (e) {
      try {
        const data = localStorage.getItem(SONGS_STORAGE_KEY);
        if (data) {
          quarantineCorruptStorage(SONGS_STORAGE_KEY, data, 'Stored song catalog JSON could not be parsed.');
        }
      } catch {}
      console.error('Error fetching songs:', e);
      return [];
    }
  }

  /**
   * Bulk updates language for multiple songs by ID array without modifying other fields
   */
  static async bulkUpdateLanguage(ids: string[], language: string): Promise<void> {
    if (!ids || ids.length === 0) return;
    const songs = await this.getSongs();
    const idSet = new Set(ids.map((id) => id.trim()));
    let modified = false;

    for (const song of songs) {
      if (idSet.has(song.id)) {
        song.language = language;
        modified = true;
      }
    }

    if (modified) {
      localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(songs));
    }
  }

  /**
   * Saves or updates a song in the database
   */
  static async saveSong(songData: Partial<Song> & { title: string }): Promise<Song> {
    const songs = await this.getSongs();
    let savedSong: Song;
    let oldTitle: string | undefined = undefined;
    let oldLyrics: string | undefined = undefined;

    const sanitizedLang = sanitizeSongLanguage(songData.language || 'English');
    let boundedLyrics: string | undefined = undefined;
    if (typeof songData.lyrics === 'string') {
      const trimmedLyrics = songData.lyrics.trim();
      if (trimmedLyrics.length > MAX_LYRICS_LENGTH) {
        throw new Error(
          `Lyrics exceed the ${MAX_LYRICS_LENGTH.toLocaleString()}-character maximum (${trimmedLyrics.length.toLocaleString()} characters).`
        );
      }
      boundedLyrics = trimmedLyrics || undefined;
    }

    if (songData.id) {
      // Update existing
      const index = songs.findIndex((s) => s.id === songData.id);
      const existing = index >= 0 ? songs[index] : undefined;
      oldTitle = existing?.title;
      oldLyrics = existing?.lyrics;

      const chartValidation = validateInstrumentCharts(
        songData.instrumentCharts !== undefined ? songData.instrumentCharts : existing?.instrumentCharts,
        songData.title.trim()
      );
      if (chartValidation.error) {
        throw new Error(chartValidation.error);
      }

      const markerValidation = validateVideoMarkers(
        songData.videoMarkers !== undefined ? songData.videoMarkers : existing?.videoMarkers,
        songData.title.trim()
      );
      if (markerValidation.error) {
        throw new Error(markerValidation.error);
      }

      savedSong = {
        id: songData.id,
        title: songData.title.trim(),
        artist: (songData.artist || 'Unknown Artist').trim(),
        album: songData.album || '',
        genre: songData.genre || 'Praise & Worship',
        key: songData.key || '',
        originalKey: songData.originalKey || songData.key || '',
        bpm: songData.bpm ? Number(songData.bpm) : undefined,
        timeSignature: songData.timeSignature || '',
        duration: songData.duration || '',
        releaseYear: songData.releaseYear || '',
        language: sanitizedLang,
        ccliNumber: songData.ccliNumber || '',
        youtubeUrl: songData.youtubeUrl || '',
        youtubeId: songData.youtubeId || (songData.youtubeUrl ? extractYouTubeId(songData.youtubeUrl) || undefined : undefined),
        thumbnailUrl: songData.thumbnailUrl || (songData.youtubeId ? `https://img.youtube.com/vi/${songData.youtubeId}/hqdefault.jpg` : ''),
        coverArtUrl: songData.coverArtUrl || '',
        isrc: songData.isrc || '',
        spotifyUrl: songData.spotifyUrl || '',
        appleMusicUrl: songData.appleMusicUrl || '',
        qobuzUrl: songData.qobuzUrl || '',
        tidalUrl: songData.tidalUrl || '',
        geniusUrl: songData.geniusUrl || '',
        songFamilyId: songData.songFamilyId,
        relationshipType: songData.relationshipType,
        songwriters: songData.songwriters,
        composers: songData.composers,
        originalArtist: songData.originalArtist,
        lyrics: boundedLyrics,
        dateAdded: songData.dateAdded || existing?.dateAdded || getManilaTodayString(),
        lastUsedDate: songData.lastUsedDate !== undefined ? songData.lastUsedDate : existing?.lastUsedDate,
        timesUsed: songData.timesUsed !== undefined ? songData.timesUsed : (existing?.timesUsed ?? 0),
        serviceHistory: songData.serviceHistory || existing?.serviceHistory || [],
        notes: songData.notes || '',
        category: songData.category || 'both',
        versionType: songData.versionType !== undefined ? songData.versionType : (existing?.versionType || (songData.relationshipType === 'COVER' ? 'cover' : 'original')),
        labels: songData.labels || [],
        themes: songData.themes || [],
        arrangementName: songData.arrangementName?.trim() || undefined,
        capo: typeof songData.capo === 'number' && !isNaN(songData.capo) && songData.capo >= 0 && songData.capo <= 24 ? Math.round(songData.capo) : (songData.capo ? Number(songData.capo) : undefined),
        tuning: songData.tuning?.trim() || undefined,
        rehearsalNotes: songData.rehearsalNotes?.trim() || undefined,
        instrumentCharts: chartValidation.valid,
        videoMarkers: markerValidation.valid
      };

      if (index >= 0) {
        songs[index] = savedSong;
      } else {
        songs.push(savedSong);
      }
    } else {
      // Create new
      const newId = 'song_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      const ytId = songData.youtubeId || (songData.youtubeUrl ? extractYouTubeId(songData.youtubeUrl) || undefined : undefined);
      
      const chartValidation = validateInstrumentCharts(songData.instrumentCharts, songData.title.trim());
      if (chartValidation.error) {
        throw new Error(chartValidation.error);
      }

      const markerValidation = validateVideoMarkers(songData.videoMarkers, songData.title.trim());
      if (markerValidation.error) {
        throw new Error(markerValidation.error);
      }

      savedSong = {
        id: newId,
        title: songData.title.trim(),
        artist: (songData.artist || 'Unknown Artist').trim(),
        album: songData.album || '',
        genre: songData.genre || 'Praise & Worship',
        key: songData.key || '',
        originalKey: songData.originalKey || songData.key || '',
        bpm: songData.bpm ? Number(songData.bpm) : undefined,
        timeSignature: songData.timeSignature || '',
        duration: songData.duration || '',
        releaseYear: songData.releaseYear || '',
        language: sanitizedLang,
        ccliNumber: songData.ccliNumber || '',
        youtubeUrl: songData.youtubeUrl || (ytId ? `https://www.youtube.com/watch?v=${ytId}` : ''),
        youtubeId: ytId,
        thumbnailUrl: songData.thumbnailUrl || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : ''),
        coverArtUrl: songData.coverArtUrl || '',
        isrc: songData.isrc || '',
        spotifyUrl: songData.spotifyUrl || '',
        appleMusicUrl: songData.appleMusicUrl || '',
        qobuzUrl: songData.qobuzUrl || '',
        tidalUrl: songData.tidalUrl || '',
        geniusUrl: songData.geniusUrl || '',
        songFamilyId: songData.songFamilyId,
        relationshipType: songData.relationshipType,
        songwriters: songData.songwriters,
        composers: songData.composers,
        originalArtist: songData.originalArtist,
        lyrics: boundedLyrics,
        dateAdded: getManilaTodayString(),
        timesUsed: 0,
        serviceHistory: [],
        notes: songData.notes || '',
        category: songData.category || 'both',
        versionType: songData.versionType || (songData.relationshipType === 'COVER' ? 'cover' : 'original'),
        labels: songData.labels || [],
        themes: songData.themes || [],
        arrangementName: songData.arrangementName?.trim() || undefined,
        capo: typeof songData.capo === 'number' && !isNaN(songData.capo) && songData.capo >= 0 && songData.capo <= 24 ? Math.round(songData.capo) : (songData.capo ? Number(songData.capo) : undefined),
        tuning: songData.tuning?.trim() || undefined,
        rehearsalNotes: songData.rehearsalNotes?.trim() || undefined,
        instrumentCharts: chartValidation.valid,
        videoMarkers: markerValidation.valid
      };
      songs.unshift(savedSong);
    }

    const prevSongsSnapshot = localStorage.getItem(SONGS_STORAGE_KEY);
    const prevSchedulesSnapshot = StorageService.getSchedules();
    const prevDraftSnapshot = StorageService.getDraftSchedule();

    localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(songs));

    // Propagate song title update and selective lyrics-reviewed invalidation across schedules and draft
    if (songData.id) {
      try {
        const existingSchedules = prevSchedulesSnapshot;
        const { updatedSchedules: renamedSchedules, hasChanges: renameChanges } = syncSchedulesOnSongRename(oldTitle, savedSong, existingSchedules);
        let workingSchedules = renameChanges ? renamedSchedules : existingSchedules;
        let schedulesChanged = renameChanges;

        const lyricsChanged = (oldLyrics ?? '').trim() !== (savedSong.lyrics ?? '').trim();
        const normOldTitle = (oldTitle || '').trim().toLowerCase();
        const normNewTitle = savedSong.title.trim().toLowerCase();
        const uniqueTitleInCatalog = songs.filter((s) => s.title.trim().toLowerCase() === normNewTitle).length === 1;

        const slotMatchesSavedSong = (title: string, slotId?: string): boolean => {
          if (slotId && slotId.trim()) {
            return slotId.trim() === savedSong.id;
          }
          const cleanTitle = (title || '').trim().toLowerCase();
          if (!cleanTitle) return false;
          if (normOldTitle && cleanTitle === normOldTitle) return true;
          return uniqueTitleInCatalog && cleanTitle === normNewTitle;
        };

        if (lyricsChanged) {
          workingSchedules = workingSchedules.map((sch) => {
            if (!sch.rehearsalChecklist?.lyricsReviewed) return sch;
            const matchesPraise = (sch.praiseSongs || []).some((t, idx) =>
              slotMatchesSavedSong(t, sch.praiseSongIds?.[idx])
            );
            const matchesWorship = (sch.worshipSongs || []).some((t, idx) =>
              slotMatchesSavedSong(t, sch.worshipSongIds?.[idx])
            );
            if (!matchesPraise && !matchesWorship) return sch;

            schedulesChanged = true;
            const nowIso = getManilaNowISO();
            return {
              ...sch,
              rehearsalChecklist: {
                ...sch.rehearsalChecklist,
                lyricsReviewed: false,
                updatedAt: nowIso
              },
              updatedAt: nowIso
            };
          });
        }

        if (schedulesChanged) {
          StorageService.saveSchedulesChecked(workingSchedules);
        }

        // Also update active draft if present
        const draft = prevDraftSnapshot;
        if (draft) {
          let draftModified = false;
          const draftPraise = (draft.praiseSongs || []).map((t, idx) => {
            const songId = (draft as any).praiseSongIds?.[idx];
            // Strictly ID-authoritative: only allow title match if draft slot had no ID
            if (songId === savedSong.id || (!songId && oldTitle && t.trim().toLowerCase() === oldTitle.trim().toLowerCase())) {
              if (t !== savedSong.title) draftModified = true;
              return savedSong.title;
            }
            return t;
          });

          const draftWorship = (draft.worshipSongs || []).map((t, idx) => {
            const songId = (draft as any).worshipSongIds?.[idx];
            // Strictly ID-authoritative: only allow title match if draft slot had no ID
            if (songId === savedSong.id || (!songId && oldTitle && t.trim().toLowerCase() === oldTitle.trim().toLowerCase())) {
              if (t !== savedSong.title) draftModified = true;
              return savedSong.title;
            }
            return t;
          });

          let nextDraftChecklist = draft.rehearsalChecklist;
          if (lyricsChanged && draft.rehearsalChecklist?.lyricsReviewed) {
            const matchesDraftPraise = (draft.praiseSongs || []).some((t, idx) =>
              slotMatchesSavedSong(t, (draft as any).praiseSongIds?.[idx])
            );
            const matchesDraftWorship = (draft.worshipSongs || []).some((t, idx) =>
              slotMatchesSavedSong(t, (draft as any).worshipSongIds?.[idx])
            );
            if (matchesDraftPraise || matchesDraftWorship) {
              draftModified = true;
              nextDraftChecklist = {
                ...draft.rehearsalChecklist,
                lyricsReviewed: false,
                updatedAt: getManilaNowISO()
              };
            }
          }

          if (draftModified) {
            StorageService.saveDraftScheduleChecked({
              ...draft,
              praiseSongs: draftPraise,
              worshipSongs: draftWorship,
              rehearsalChecklist: nextDraftChecklist
            });
          }
        }

        // Recalculate usage statistics
        await this.syncSongUsageFromSchedules(schedulesChanged ? workingSchedules : existingSchedules);

        // Notify app components of rename / lyrics synchronization only after all stores committed
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('wwcf:song-renamed', {
            detail: { song: savedSong, oldTitle }
          }));
          if (lyricsChanged) {
            window.dispatchEvent(new CustomEvent('wwcf:song-lyrics-updated', {
              detail: { songId: savedSong.id, title: savedSong.title }
            }));
          }
          window.dispatchEvent(new CustomEvent('wwcf:schedules-updated'));
          window.dispatchEvent(new CustomEvent('wwcf:songs-updated'));
        }
      } catch (err) {
        console.error('Error synchronizing song update across schedules; rolling back:', err);
        try {
          if (prevSongsSnapshot === null) {
            localStorage.removeItem(SONGS_STORAGE_KEY);
          } else {
            localStorage.setItem(SONGS_STORAGE_KEY, prevSongsSnapshot);
          }
          StorageService.saveSchedulesChecked(prevSchedulesSnapshot);
          StorageService.saveDraftScheduleChecked(prevDraftSnapshot);
        } catch (rbErr) {
          console.error('Rollback failed during saveSong recovery:', rbErr);
        }
        throw err;
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wwcf:songs-updated', { detail: savedSong }));
      window.dispatchEvent(new CustomEvent('wwcf:data-changed', { detail: { type: 'songs' } }));
    }

    return savedSong;
  }

  /**
   * Bulk updates category for multiple songs by ID array
   */
  static async bulkUpdateCategory(ids: string[], category: SongCategory): Promise<void> {
    if (!ids || ids.length === 0) return;
    const songs = await this.getSongs();
    const idSet = new Set(ids.map((id) => id.trim()));
    let modified = false;

    for (const song of songs) {
      if (idSet.has(song.id)) {
        song.category = category;
        modified = true;
      }
    }

    if (modified) {
      localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(songs));
    }
  }

  /**
   * Bulk updates version type ('original' vs 'cover') for multiple songs by ID array
   */
  static async bulkUpdateVersionType(ids: string[], versionType: SongVersionType): Promise<void> {
    if (!ids || ids.length === 0) return;
    const songs = await this.getSongs();
    const idSet = new Set(ids.map((id) => id.trim()));
    let modified = false;

    for (const song of songs) {
      if (idSet.has(song.id)) {
        song.versionType = versionType;
        if (versionType === 'original' && song.relationshipType === 'COVER') {
          song.relationshipType = 'ORIGINAL';
        } else if (versionType === 'cover' && (!song.relationshipType || song.relationshipType === 'ORIGINAL')) {
          song.relationshipType = 'COVER';
        }
        modified = true;
      }
    }

    if (modified) {
      localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(songs));
    }
  }

  /**
   * Deletes a song by ID or title match
   */
  static async deleteSong(id: string): Promise<void> {
    if (!id) return;
    const songs = await this.getSongs();
    const targetId = id.trim();
    const targetTitle = targetId.toLowerCase();
    const { SongFamilyService } = await import('./songFamilyService');
    const prevFamilies = await SongFamilyService.getSongFamilies();
    const songToDelete = songs.find((s) => s.id === targetId || s.title.trim().toLowerCase() === targetTitle);
    const filtered = songs.filter(
      (s) => s.id !== targetId && s.title.trim().toLowerCase() !== targetTitle
    );

    try {
      if (songToDelete) {
        await SongFamilyService.unlinkSongFromFamily(songToDelete.id);
      }
      localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(filtered));
      const verified = localStorage.getItem(SONGS_STORAGE_KEY);
      if (verified === null) throw new Error('Persistence verification failed after deleting song.');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wwcf:songs-updated', { detail: filtered }));
        window.dispatchEvent(new CustomEvent('wwcf:data-changed', { detail: { type: 'songs' } }));
      }
    } catch (err) {
      try {
        await SongFamilyService.saveSongFamilies(prevFamilies);
        localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(songs));
      } catch {}
      throw err;
    }
  }

  /**
   * Bulk deletes multiple songs by array of IDs
   */
  static async deleteSongsBulk(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    const songs = await this.getSongs();
    const idSet = new Set(ids.map((id) => id.trim()));
    const { SongFamilyService } = await import('./songFamilyService');
    const prevFamilies = await SongFamilyService.getSongFamilies();

    try {
      for (const id of ids) {
        await SongFamilyService.unlinkSongFromFamily(id.trim());
      }
      const filtered = songs.filter((s) => !idSet.has(s.id));
      localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(filtered));
      const verified = localStorage.getItem(SONGS_STORAGE_KEY);
      if (verified === null) throw new Error('Persistence verification failed after bulk deleting songs.');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wwcf:songs-updated', { detail: filtered }));
        window.dispatchEvent(new CustomEvent('wwcf:data-changed', { detail: { type: 'songs' } }));
      }
    } catch (err) {
      try {
        await SongFamilyService.saveSongFamilies(prevFamilies);
        localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(songs));
      } catch {}
      throw err;
    }
  }

  /**
   * Evaluates title, artist, songwriter, lyrics, CCLI, and video references
   * to detect exact duplicates vs. same title with different artist conflict
   * vs. related cross-title composition match.
   */
  static async detectSongConflict(query: {
    title?: string;
    artist?: string;
    originalArtist?: string;
    songwriters?: string;
    album?: string;
    lyrics?: string;
    ccliNumber?: string;
    youtubeUrl?: string;
    youtubeId?: string;
    excludeId?: string;
  }): Promise<SongConflictResult> {
    try {
      const songs = await this.getSongs();
      const queryTitle = (query.title || '').trim();
      const queryTitleLower = queryTitle.toLowerCase();
      const queryBaseTitleLower = getNormalizedBaseTitle(queryTitle).toLowerCase();
      const queryArtist = (query.artist || '').trim();
      const cleanYtId = query.youtubeId || (query.youtubeUrl ? extractYouTubeId(query.youtubeUrl) : null);
      const cleanYtUrl = query.youtubeUrl ? query.youtubeUrl.trim().toLowerCase() : '';

      if (!queryTitle && !cleanYtId && !cleanYtUrl && !query.ccliNumber) {
        return { hasConflict: false, conflictType: 'NO_CONFLICT', isDuplicate: false };
      }

      const candidateMock: Song = {
        id: query.excludeId || 'temp_candidate',
        title: queryTitle || 'Untitled',
        artist: queryArtist || 'Unknown Artist',
        album: query.album,
        originalArtist: query.originalArtist,
        songwriters: query.songwriters,
        lyrics: query.lyrics,
        ccliNumber: query.ccliNumber,
        youtubeUrl: query.youtubeUrl,
        youtubeId: cleanYtId || undefined,
        language: 'English',
        category: 'praise',
        timesUsed: 0,
        serviceHistory: [],
        dateAdded: ''
      };

      // 1. First check matching YouTube video ID / URL
      for (const song of songs) {
        if (!song) continue;
        if (query.excludeId && song.id === query.excludeId) continue;

        const ytIdMatches = cleanYtId && song.youtubeId && song.youtubeId === cleanYtId;
        const ytUrlMatches = cleanYtUrl && song.youtubeUrl && (song.youtubeUrl || '').trim().toLowerCase() === cleanYtUrl;

        if (ytIdMatches || ytUrlMatches) {
          const isSameArtist = areArtistsEquivalent(song.artist || '', queryArtist);
          const evidence = verifySongIdentity(song, candidateMock);
          return {
            hasConflict: true,
            conflictType: isSameArtist ? 'SAME_TITLE_SAME_ARTIST' : 'SAME_VIDEO_MATCH',
            matchType: ytIdMatches ? 'youtubeId' : 'youtubeUrl',
            existingSong: song,
            isDuplicate: true,
            evidence,
            hasStrongEvidence: true,
            suggestedRelationship: isSameArtist ? 'VERSION' : 'COVER'
          };
        }
      }

      // 2. Check title matches (exact title or normalized base title match)
      for (const song of songs) {
        if (!song) continue;
        if (query.excludeId && song.id === query.excludeId) continue;
        if (!queryTitle) continue;

        const songTitleLower = (song.title || '').trim().toLowerCase();
        const songBaseTitleLower = getNormalizedBaseTitle(song.title || '').toLowerCase();

        const exactTitleMatch = queryTitleLower === songTitleLower;
        const baseTitleMatch = queryBaseTitleLower && (queryBaseTitleLower === songBaseTitleLower);

        if (exactTitleMatch || baseTitleMatch) {
          const isSameArtist = areArtistsEquivalent(song.artist || '', queryArtist);
          const evidence = verifySongIdentity(song, candidateMock);

          const hasMatchingCredits = !!(
            (song.songwriters && query.songwriters && (song.songwriters.toLowerCase().includes(query.songwriters.toLowerCase()) || query.songwriters.toLowerCase().includes(song.songwriters.toLowerCase()))) ||
            (song.originalArtist && queryArtist && areArtistsEquivalent(song.originalArtist, queryArtist)) ||
            (query.originalArtist && song.artist && areArtistsEquivalent(query.originalArtist, song.artist))
          );
          const lyricsSim = (song.lyrics && query.lyrics) ? calculateLyricsSimilarity(song.lyrics, query.lyrics) : 0;
          const hasStrongEvidence = evidence.confidence === 'high' || hasMatchingCredits || lyricsSim >= 0.35 || !!(song.ccliNumber && query.ccliNumber && song.ccliNumber === query.ccliNumber);

          if (isSameArtist) {
            return {
              hasConflict: true,
              conflictType: 'SAME_TITLE_SAME_ARTIST',
              matchType: 'artist_title',
              existingSong: song,
              isDuplicate: true,
              evidence,
              hasStrongEvidence,
              suggestedRelationship: evidence.suggestedRelationship || 'VERSION'
            };
          } else {
            // SAME TITLE, DIFFERENT ARTIST -> NEVER treat as automatic duplicate or overwrite!
            return {
              hasConflict: true,
              conflictType: 'SAME_TITLE_DIFF_ARTIST',
              matchType: 'title',
              existingSong: song,
              isDuplicate: true,
              evidence,
              hasStrongEvidence,
              suggestedRelationship: evidence.suggestedRelationship || 'COVER'
            };
          }
        }
      }

      // 3. Check composition match across DIFFERENT titles
      for (const song of songs) {
        if (!song) continue;
        if (query.excludeId && song.id === query.excludeId) continue;

        // CCLI match
        if (query.ccliNumber && song.ccliNumber && query.ccliNumber.trim() === (song.ccliNumber || '').trim()) {
          const evidence = verifySongIdentity(song, candidateMock);
          return {
            hasConflict: true,
            conflictType: 'DIFF_TITLE_POSSIBLE_COMPOSITION',
            matchType: 'composition',
            existingSong: song,
            isDuplicate: true,
            evidence,
            hasStrongEvidence: true,
            suggestedRelationship: evidence.suggestedRelationship || 'VERSION'
          };
        }

        // High lyrics match + matching songwriter/original artist
        if (song.lyrics && query.lyrics) {
          const sim = calculateLyricsSimilarity(song.lyrics, query.lyrics);
          if (sim >= 0.40) {
            const evidence = verifySongIdentity(song, candidateMock);
            return {
              hasConflict: true,
              conflictType: 'DIFF_TITLE_POSSIBLE_COMPOSITION',
              matchType: 'composition',
              existingSong: song,
              isDuplicate: true,
              evidence,
              hasStrongEvidence: true,
              suggestedRelationship: evidence.suggestedRelationship || 'VERSION'
            };
          }
        }
      }

      return {
        hasConflict: false,
        conflictType: 'NO_CONFLICT',
        isDuplicate: false
      };
    } catch (conflictErr) {
      console.warn('[SongService.detectSongConflict] Non-fatal error during conflict detection:', conflictErr);
      return {
        hasConflict: false,
        conflictType: 'NO_CONFLICT',
        isDuplicate: false
      };
    }
  }

  /**
   * Checks database for duplicate/conflicting song by Title, Artist, Lyrics, CCLI, or YouTube ID/URL
   */
  static async findDuplicate(query: {
    title?: string;
    artist?: string;
    originalArtist?: string;
    songwriters?: string;
    album?: string;
    lyrics?: string;
    ccliNumber?: string;
    youtubeUrl?: string;
    youtubeId?: string;
    excludeId?: string;
  }): Promise<DuplicateMatch> {
    return this.detectSongConflict(query);
  }

  /**
   * Fetches metadata for YouTube URL via oEmbed API
   */
  static async fetchYouTubeMetadata(urlOrId: string): Promise<YouTubeMetadataResult> {
    const ytId = extractYouTubeId(urlOrId);
    if (!ytId) {
      throw new Error('Could not parse a valid YouTube Video ID from the link provided.');
    }

    const cleanUrl = `https://www.youtube.com/watch?v=${ytId}`;
    const thumbnailUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;

    let title = '';
    let artist = '';

    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`;
      const res = await fetch(oembedUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.title) {
          let rawTitle = data.title as string;
          // Strip YouTube video tags like (Official Video), [Live], (Lyrics), etc.
          rawTitle = rawTitle
            .replace(/\s*[\(\[](Official|Live|Lyrics|Video|Audio|HD|4K|Worship|Music Video).*?[\)\]]/gi, '')
            .trim();

          if (rawTitle.includes(' - ')) {
            const parts = rawTitle.split(' - ');
            artist = parts[0].trim();
            title = parts.slice(1).join(' - ').trim();
          } else if (rawTitle.includes(' | ')) {
            const parts = rawTitle.split(' | ');
            title = parts[0].trim();
            artist = parts[1].trim();
          } else {
            title = rawTitle;
            artist = data.author_name ? data.author_name.replace(/\s*-\s*Topic$/i, '').trim() : '';
          }
        }
      }
    } catch (e) {
      console.warn('YouTube oEmbed API fetch failed, falling back to basic YouTube ID', e);
    }

    return {
      youtubeId: ytId,
      youtubeUrl: cleanUrl,
      thumbnailUrl,
      title,
      artist
    };
  }

  /**
   * Helper to retrieve all titles that share the same Song Family identity as a given song title.
   */
  static getFamilySongTitles(
    songTitle: string,
    allSongs?: Song[],
    allFamilies?: SongFamily[],
    songId?: string
  ): string[] {
    const cleanTitle = songTitle.trim().toLowerCase();
    const cleanId = (songId || '').trim();
    if (!cleanTitle && !cleanId) return [];

    let songs = allSongs;
    let families = allFamilies;

    if (!songs) {
      songs = this.getSongsSync();
    }

    if (!families) {
      try {
        const famData = localStorage.getItem('wwcf_song_families_v1');
        families = famData ? JSON.parse(famData) : [];
      } catch {
        families = [];
      }
    }

    let matchedSong: Song | undefined = undefined;
    if (cleanId) {
      matchedSong = (songs || []).find((s) => s.id === cleanId);
      // Stale ID: never fall through to another song or family by title
      if (!matchedSong) return [];
    } else if (cleanTitle) {
      const idDirect = (songs || []).find((s) => s.id === songTitle.trim());
      if (idDirect) {
        matchedSong = idDirect;
      } else {
        const titleMatches = (songs || []).filter((s) => s.title.trim().toLowerCase() === cleanTitle);
        if (titleMatches.length === 1) {
          matchedSong = titleMatches[0];
        } else if (titleMatches.length > 1) {
          // Ambiguous duplicate catalog titles without songId: do not guess a family
          return [];
        }
      }
    }

    let targetFamily: SongFamily | undefined = undefined;

    if (matchedSong && matchedSong.songFamilyId) {
      targetFamily = (families || []).find((f) => f.id === matchedSong!.songFamilyId);
    }

    if (!targetFamily && matchedSong) {
      targetFamily = (families || []).find(
        (f) => f.versionIds.includes(matchedSong!.id) || (f.versions && f.versions.some((v) => v.songId === matchedSong!.id))
      );
    }

    if (!targetFamily && !cleanId && cleanTitle) {
      targetFamily = (families || []).find((f) => f.name.trim().toLowerCase() === cleanTitle);
    }

    if (targetFamily && (targetFamily.versionIds.length > 0 || (targetFamily.versions && targetFamily.versions.length > 0))) {
      const familyVersionIdSet = new Set(targetFamily.versionIds || []);
      if (targetFamily.versions) {
        targetFamily.versions.forEach((v) => familyVersionIdSet.add(v.songId));
      }
      const memberTitles = (songs || [])
        .filter((s) => familyVersionIdSet.has(s.id) || (s.songFamilyId && s.songFamilyId === targetFamily!.id))
        .map((s) => s.title.trim().toLowerCase());

      if (matchedSong && !memberTitles.includes(matchedSong.title.trim().toLowerCase())) {
        memberTitles.push(matchedSong.title.trim().toLowerCase());
      } else if (!matchedSong && cleanTitle && !memberTitles.includes(cleanTitle)) {
        memberTitles.push(cleanTitle);
      }
      if (targetFamily.name && !memberTitles.includes(targetFamily.name.trim().toLowerCase())) {
        memberTitles.push(targetFamily.name.trim().toLowerCase());
      }
      return Array.from(new Set(memberTitles));
    }

    if (matchedSong) {
      return [matchedSong.title.trim().toLowerCase()];
    }
    return cleanTitle ? [cleanTitle] : [];
  }

  private static getFamilySongIdSet(
    songTitle: string,
    allSongs?: Song[],
    allFamilies?: SongFamily[],
    songId?: string
  ): {
    targetIds: Set<string>;
    familyTitles: Set<string>;
    isStaleTargetId: boolean;
    isAmbiguousTargetTitle: boolean;
  } {
    const cleanTitle = songTitle.trim().toLowerCase();
    const cleanId = (songId || '').trim();
    const songs = allSongs ?? this.getSongsSync();
    let families = allFamilies;
    if (!families) {
      try {
        const famData = localStorage.getItem('wwcf_song_families_v1');
        families = famData ? JSON.parse(famData) : [];
      } catch {
        families = [];
      }
    }

    const targetIds = new Set<string>();
    const familyTitles = new Set<string>();

    if (cleanId) {
      const matched = songs.find((s) => s.id === cleanId);
      if (!matched) {
        // Stale target ID: only match this exact ID in schedules, never bleed into same-title catalog songs
        targetIds.add(cleanId);
        return { targetIds, familyTitles, isStaleTargetId: true, isAmbiguousTargetTitle: false };
      }
      targetIds.add(matched.id);
      familyTitles.add(matched.title.trim().toLowerCase());

      const fam =
        (matched.songFamilyId ? families.find((f) => f.id === matched.songFamilyId) : undefined) ||
        families.find((f) => f.versionIds.includes(matched.id) || f.versions?.some((v) => v.songId === matched.id));

      if (fam) {
        (fam.versionIds || []).forEach((id) => targetIds.add(id));
        (fam.versions || []).forEach((v) => targetIds.add(v.songId));
        songs.forEach((s) => {
          if (targetIds.has(s.id) || s.songFamilyId === fam.id) {
            targetIds.add(s.id);
            familyTitles.add(s.title.trim().toLowerCase());
          }
        });
        if (fam.name) familyTitles.add(fam.name.trim().toLowerCase());
      }
      return { targetIds, familyTitles, isStaleTargetId: false, isAmbiguousTargetTitle: false };
    }

    // No target ID supplied
    if (!cleanTitle) {
      return { targetIds, familyTitles, isStaleTargetId: false, isAmbiguousTargetTitle: false };
    }

    const titleMatches = songs.filter((s) => s.title.trim().toLowerCase() === cleanTitle);
    if (titleMatches.length > 1) {
      return { targetIds, familyTitles, isStaleTargetId: false, isAmbiguousTargetTitle: true };
    }

    if (titleMatches.length === 1) {
      return this.getFamilySongIdSet(titleMatches[0].title, songs, families, titleMatches[0].id);
    }

    // Unmatched title string (e.g. legacy/unlinked or family name)
    const famByName = families.find((f) => f.name.trim().toLowerCase() === cleanTitle);
    if (famByName) {
      (famByName.versionIds || []).forEach((id) => targetIds.add(id));
      (famByName.versions || []).forEach((v) => targetIds.add(v.songId));
      songs.forEach((s) => {
        if (targetIds.has(s.id) || s.songFamilyId === famByName.id) {
          targetIds.add(s.id);
          familyTitles.add(s.title.trim().toLowerCase());
        }
      });
    }
    familyTitles.add(cleanTitle);
    return { targetIds, familyTitles, isStaleTargetId: false, isAmbiguousTargetTitle: false };
  }

  private static countSlotMatchesInSchedule(
    sch: Schedule,
    targetCleanTitle: string,
    targetIds: Set<string>,
    familyTitles: Set<string>,
    isStaleTargetId: boolean,
    isAmbiguousTargetTitle: boolean,
    songs: Song[]
  ): number {
    if (isAmbiguousTargetTitle) return 0;

    const countSection = (titles: string[] = [], ids: string[] = []): number => {
      let hits = 0;
      const len = Math.max(titles.length, ids.length);
      for (let idx = 0; idx < len; idx++) {
        const slotTitle = (titles[idx] || '').trim();
        const slotId = (ids[idx] || '').trim();
        if (!slotTitle && !slotId) continue;

        if (slotId) {
          if (targetIds.has(slotId)) {
            hits++;
          }
          // Slot has explicit ID: never fall back to title if it doesn't match targetIds
          continue;
        }

        // Slot has no ID: if target itself is a stale ID, un-ID'd slots cannot match it
        if (isStaleTargetId) continue;

        const resolved = resolveSlotSong(slotTitle, undefined, songs);
        if (resolved.isAmbiguous) continue;
        if (resolved.song) {
          if (targetIds.has(resolved.song.id)) {
            hits++;
          }
          continue;
        }
        // Both slot and target are unmatched in catalog -> compare normalized familyTitles
        if (targetIds.size === 0 && familyTitles.has(slotTitle.toLowerCase())) {
          hits++;
        } else if (targetIds.size === 0 && targetCleanTitle && slotTitle.toLowerCase() === targetCleanTitle) {
          hits++;
        }
      }
      return hits;
    };

    return (
      countSection(sch.praiseSongs || [], sch.praiseSongIds || []) +
      countSection(sch.worshipSongs || [], sch.worshipSongIds || [])
    );
  }

  /**
   * Calculates how many times a song (or any version in its Song Family) appears in saved worship line-ups
   * within a specific calendar month (Asia/Manila context).
   * Defaults to the current calendar month (e.g., "2026-08").
   */
  static getMonthlyUsageCount(
    songTitle: string,
    schedules: Schedule[],
    targetMonthStr?: string,
    allSongs?: Song[],
    allFamilies?: SongFamily[],
    songId?: string
  ): number {
    const cleanTitle = songTitle.trim().toLowerCase();
    const cleanId = (songId || '').trim();
    if ((!cleanTitle && !cleanId) || !schedules || schedules.length === 0) return 0;

    const songs = allSongs ?? this.getSongsSync();
    const { targetIds, familyTitles, isStaleTargetId, isAmbiguousTargetTitle } = this.getFamilySongIdSet(
      songTitle,
      songs,
      allFamilies,
      songId
    );
    const monthStr = targetMonthStr || getManilaTodayString().substring(0, 7);

    let count = 0;
    for (const sch of schedules) {
      if (isNoServiceSchedule(sch) || !sch.serviceDate) continue;
      const schYM = sch.serviceDate.substring(0, 7);
      if (schYM !== monthStr) continue;

      count += this.countSlotMatchesInSchedule(
        sch,
        cleanTitle,
        targetIds,
        familyTitles,
        isStaleTargetId,
        isAmbiguousTargetTitle,
        songs
      );
    }

    return count;
  }

  /**
   * Checks whether a song (or its Song Family) has been used during the target service month (e.g., "2026-08").
   * Applies the First-Come, First-Serve rule:
   * The first line-up that used the song in the calendar month (by service date,
   * then creation timestamp/id) is considered the original usage and MUST NOT be marked as repeated.
   * Only later line-ups receive a repeated-song warning.
   */
  static checkMonthlyUsage(
    songTitle: string,
    targetDateStr: string,
    schedules: Schedule[],
    excludeScheduleId?: string,
    candidateServiceType: string = 'Sunday Service',
    allSongs?: Song[],
    allFamilies?: SongFamily[],
    songId?: string
  ): MonthlyUsageCheckResult {
    const cleanTitle = songTitle.trim().toLowerCase();
    const cleanId = (songId || '').trim();
    if ((!cleanTitle && !cleanId) || !targetDateStr) {
      return { songTitle, timesUsedThisMonth: 0, serviceTypes: [], datesUsed: [], affectedSchedules: [] };
    }

    const songs = allSongs ?? this.getSongsSync();
    const { targetIds, familyTitles, isStaleTargetId, isAmbiguousTargetTitle } = this.getFamilySongIdSet(
      songTitle,
      songs,
      allFamilies,
      songId
    );
    const targetYearMonth = targetDateStr.substring(0, 7);
    const isCandidateRegular = !isSpecialEvent(candidateServiceType);

    // Filter out the schedule being edited if excludeScheduleId is provided, and skip No Service records
    const otherSchedules = schedules.filter((s) => s.id !== excludeScheduleId && !isNoServiceSchedule(s));

    // Find all saved schedules in target month containing this song (ignoring special events if candidate is regular)
    let candidateSchedules = otherSchedules.filter((sch) => {
      if (isCandidateRegular && isSpecialEvent(sch.serviceType)) {
        return false;
      }
      const schYM = sch.serviceDate ? sch.serviceDate.substring(0, 7) : '';
      return schYM === targetYearMonth;
    });

    // Cross-Month Carry-Over Check (First week of month -> check last week of prev month)
    if (isFirstWeekOfMonth(targetDateStr)) {
      const range = getLastWeekOfPreviousMonthRange(targetDateStr);
      const prevWeekSchedules = otherSchedules.filter((sch) => {
        if (isCandidateRegular && isSpecialEvent(sch.serviceType)) return false;
        return sch.serviceDate && sch.serviceDate >= range.startDate && sch.serviceDate <= range.endDate;
      });
      for (const pSch of prevWeekSchedules) {
        if (!candidateSchedules.some((s) => s.id === pSch.id)) {
          candidateSchedules.push(pSch);
        }
      }
    } else if (
      isFirstRegularServiceOfMonth(
        candidateServiceType,
        targetDateStr,
        schedules
      )
    ) {
      const prevRegulars = getLastRegularSchedulesOfPreviousMonth(
        targetYearMonth,
        schedules
      );
      for (const pSch of prevRegulars) {
        if (pSch.id !== excludeScheduleId && !candidateSchedules.some((s) => s.id === pSch.id)) {
          if (!isCandidateRegular || !isSpecialEvent(pSch.serviceType)) {
            candidateSchedules.push(pSch);
          }
        }
      }
    }

    let totalUsesInOtherSchedules = 0;
    const containingSchedules: Schedule[] = [];

    for (const sch of candidateSchedules) {
      const matches = this.countSlotMatchesInSchedule(
        sch,
        cleanTitle,
        targetIds,
        familyTitles,
        isStaleTargetId,
        isAmbiguousTargetTitle,
        songs
      );
      if (matches > 0) {
        containingSchedules.push(sch);
        totalUsesInOtherSchedules += matches;
      }
    }

    if (containingSchedules.length === 0) {
      return { songTitle, timesUsedThisMonth: 0, serviceTypes: [], datesUsed: [], affectedSchedules: [] };
    }

    const datesUsed: string[] = [];
    const serviceTypesSet = new Set<string>();
    const affectedSchedules: AffectedScheduleRef[] = [];

    containingSchedules.forEach((sch) => {
      datesUsed.push(sch.serviceDate);
      if (sch.serviceType) serviceTypesSet.add(sch.serviceType);
      affectedSchedules.push({
        id: sch.id,
        serviceDate: sch.serviceDate,
        serviceType: sch.serviceType
      });
    });

    datesUsed.sort().reverse();

    return {
      songTitle,
      timesUsedThisMonth: totalUsesInOtherSchedules,
      lastDateUsed: datesUsed.length > 0 ? datesUsed[0] : undefined,
      serviceTypes: Array.from(serviceTypesSet),
      datesUsed,
      affectedSchedules
    };
  }

  private static activeSyncPromise: Promise<boolean> | null = null;

  /**
   * Recalculates song usage statistics across all schedules and updates database.
   * Uses an inverted index O(S + N) walk instead of O(S * N) nested scans.
   * Returns true only if song usage data actually changed.
   */
  static async syncSongUsageFromSchedules(schedules: Schedule[]): Promise<boolean> {
    if (this.activeSyncPromise) {
      return this.activeSyncPromise;
    }

    this.activeSyncPromise = (async () => {
      try {
        const songs = await this.getSongs();
        if (!songs || songs.length === 0) return false;

        type UsageEntry = { date: string; serviceType: string; scheduleId?: string };

        const titleCounts = new Map<string, number>();
        for (const s of songs) {
          const clean = s.title.trim().toLowerCase();
          if (clean) titleCounts.set(clean, (titleCounts.get(clean) || 0) + 1);
        }

        // 1. Build inverted index by song ID and (only for un-ID'd slots) normalized title in O(S)
        const usageBySongId = new Map<string, UsageEntry[]>();
        const usageByCleanTitle = new Map<string, UsageEntry[]>();

        const recordUsage = (map: Map<string, UsageEntry[]>, key: string, entry: UsageEntry) => {
          if (!key) return;
          let list = map.get(key);
          if (!list) {
            list = [];
            map.set(key, list);
          }
          list.push(entry);
        };

        for (const sch of schedules) {
          if (isNoServiceSchedule(sch)) continue;
          const entry: UsageEntry = {
            date: sch.serviceDate || '',
            serviceType: sch.serviceType || 'Sunday Service',
            scheduleId: sch.id
          };

          const seenInThisSchedule = new Set<string>();

          const indexSection = (titles: string[] = [], ids: string[] = []) => {
            const len = Math.max(titles.length, ids.length);
            for (let idx = 0; idx < len; idx++) {
              const slotId = (ids[idx] || '').trim();
              const slotTitle = (titles[idx] || '').trim().toLowerCase();
              if (slotId) {
                if (!seenInThisSchedule.has(`id:${slotId}`)) {
                  seenInThisSchedule.add(`id:${slotId}`);
                  recordUsage(usageBySongId, slotId, entry);
                }
                continue;
              }
              if (slotTitle && !seenInThisSchedule.has(`title:${slotTitle}`)) {
                seenInThisSchedule.add(`title:${slotTitle}`);
                recordUsage(usageByCleanTitle, slotTitle, entry);
              }
            }
          };

          indexSection(sch.praiseSongs || [], sch.praiseSongIds || []);
          indexSection(sch.worshipSongs || [], sch.worshipSongIds || []);
        }

        // 2. Update each song in a single walk O(N)
        let modified = false;

        for (const song of songs) {
          const cleanTitle = song.title.trim().toLowerCase();
          const songId = song.id;

          const idMatches = usageBySongId.get(songId) || [];
          const titleMatches =
            titleCounts.get(cleanTitle) === 1 ? (usageByCleanTitle.get(cleanTitle) || []) : [];

          // Merge entries deduplicated by scheduleId/date/serviceType
          const mergedSet = new Set<string>();
          const history: UsageEntry[] = [];

          for (const item of [...idMatches, ...titleMatches]) {
            const dedupeKey = `${item.scheduleId || ''}_${item.date}_${item.serviceType}`;
            if (!mergedSet.has(dedupeKey)) {
              mergedSet.add(dedupeKey);
              history.push(item);
            }
          }

          history.sort((a, b) => (a.date < b.date ? 1 : -1)); // Sort descending

          const newTimesUsed = history.length;
          const newLastUsed = history.length > 0 ? history[0].date : undefined;

          const prevHistoryLen = song.serviceHistory?.length || 0;
          if (
            song.timesUsed !== newTimesUsed ||
            song.lastUsedDate !== newLastUsed ||
            prevHistoryLen !== history.length
          ) {
            song.timesUsed = newTimesUsed;
            song.lastUsedDate = newLastUsed;
            song.serviceHistory = history;
            modified = true;
          }
        }

        if (modified) {
          localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(songs));
        }

        return modified;
      } finally {
        this.activeSyncPromise = null;
      }
    })();

    return this.activeSyncPromise;
  }
}
