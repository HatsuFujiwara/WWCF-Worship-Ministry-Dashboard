import { Song, Schedule, SongCategory, SongFamily, SongConflictResult, SongConflictType, SongRelationshipType, SongVersionType } from '../types';
import { DEFAULT_SONGS } from '../data/songSeedData';
import { getManilaTodayString, getManilaNowISO } from '../utils/dateUtils';
import { isFirstRegularServiceOfMonth, getLastRegularSchedulesOfPreviousMonth } from '../utils/scheduleUtils';
import { isSpecialEvent, isFirstWeekOfMonth, getLastWeekOfPreviousMonthRange } from '../utils/recommendationUtils';
import { sanitizeSongLanguage, detectSongLanguage } from '../utils/languageUtils';
import { getNormalizedBaseTitle, areArtistsEquivalent, verifySongIdentity, calculateLyricsSimilarity } from '../utils/songFamilyUtils';
import { StorageService } from './storage';
import { syncSchedulesOnSongRename } from '../utils/songResolveUtils';

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
 * Asynchronous SongService layer structured for easy migration to Firebase/Supabase
 */
export class SongService {
  /**
   * Synchronously retrieves all songs from storage for synchronous calculation utilities
   */
  static getSongsSync(): Song[] {
    try {
      const data = localStorage.getItem(SONGS_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Overwrites/Saves full songs list (used for restores or mass updates)
   */
  static async saveSongsList(songs: Song[]): Promise<void> {
    try {
      localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(songs));
    } catch (e) {
      console.error('Error saving songs list:', e);
    }
  }

  /**
   * Retrieves all songs from database (LocalStorage or Cloud backend)
   */
  static async getSongs(): Promise<Song[]> {
    try {
      const data = localStorage.getItem(SONGS_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          let hasMigrationUpdates = false;
          const sanitized = parsed.map((s: Song) => {
            const rawLang = s.language || '';
            if (rawLang.toLowerCase() === 'cebuano') {
              hasMigrationUpdates = true;
              const detected = detectSongLanguage(s.title, s.lyrics);
              return {
                ...s,
                language: detected.confidence === 'high' ? detected.language : 'Tagalog'
              };
            }
            return {
              ...s,
              language: sanitizeSongLanguage(s.language)
            };
          });

          if (hasMigrationUpdates) {
            localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(sanitized));
          }
          return sanitized;
        }
      }
      return [];
    } catch (e) {
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

    const sanitizedLang = sanitizeSongLanguage(songData.language || 'English');

    if (songData.id) {
      // Update existing
      const index = songs.findIndex((s) => s.id === songData.id);
      const existing = index >= 0 ? songs[index] : undefined;
      oldTitle = existing?.title;

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
        lyrics: songData.lyrics,
        dateAdded: songData.dateAdded || existing?.dateAdded || getManilaTodayString(),
        lastUsedDate: songData.lastUsedDate !== undefined ? songData.lastUsedDate : existing?.lastUsedDate,
        timesUsed: songData.timesUsed !== undefined ? songData.timesUsed : (existing?.timesUsed ?? 0),
        serviceHistory: songData.serviceHistory || existing?.serviceHistory || [],
        notes: songData.notes || '',
        category: songData.category || 'both',
        versionType: songData.versionType !== undefined ? songData.versionType : (existing?.versionType || (songData.relationshipType === 'COVER' ? 'cover' : 'original')),
        labels: songData.labels || [],
        themes: songData.themes || []
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
        lyrics: songData.lyrics,
        dateAdded: getManilaTodayString(),
        timesUsed: 0,
        serviceHistory: [],
        notes: songData.notes || '',
        category: songData.category || 'both',
        versionType: songData.versionType || (songData.relationshipType === 'COVER' ? 'cover' : 'original'),
        labels: songData.labels || [],
        themes: songData.themes || []
      };
      songs.unshift(savedSong);
    }

    localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(songs));

    // Propagate song title update across all schedules and draft
    if (songData.id) {
      try {
        const existingSchedules = StorageService.getSchedules();
        const { updatedSchedules, hasChanges } = syncSchedulesOnSongRename(oldTitle, savedSong, existingSchedules);

        if (hasChanges) {
          StorageService.saveSchedules(updatedSchedules);
        }

        // Also update active draft if present
        const draft = StorageService.getDraftSchedule();
        if (draft) {
          let draftModified = false;
          const draftPraise = (draft.praiseSongs || []).map((t, idx) => {
            const songId = (draft as any).praiseSongIds?.[idx];
            if (songId === savedSong.id || (oldTitle && t.trim().toLowerCase() === oldTitle.trim().toLowerCase())) {
              draftModified = true;
              return savedSong.title;
            }
            return t;
          });

          const draftWorship = (draft.worshipSongs || []).map((t, idx) => {
            const songId = (draft as any).worshipSongIds?.[idx];
            if (songId === savedSong.id || (oldTitle && t.trim().toLowerCase() === oldTitle.trim().toLowerCase())) {
              draftModified = true;
              return savedSong.title;
            }
            return t;
          });

          if (draftModified) {
            StorageService.saveDraftSchedule({
              ...draft,
              praiseSongs: draftPraise,
              worshipSongs: draftWorship
            });
          }
        }

        // Recalculate usage statistics
        await this.syncSongUsageFromSchedules(hasChanges ? updatedSchedules : existingSchedules);

        // Notify app components of rename synchronization
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('wwcf:song-renamed', {
            detail: { song: savedSong, oldTitle }
          }));
          window.dispatchEvent(new CustomEvent('wwcf:schedules-updated'));
          window.dispatchEvent(new CustomEvent('wwcf:songs-updated'));
        }
      } catch (err) {
        console.error('Error synchronizing song rename across schedules:', err);
      }
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

    // Clean up song family reference if exists
    try {
      const { SongFamilyService } = await import('./songFamilyService');
      const songToDelete = songs.find((s) => s.id === targetId || s.title.trim().toLowerCase() === targetTitle);
      if (songToDelete) {
        await SongFamilyService.unlinkSongFromFamily(songToDelete.id);
      }
    } catch {
      // Ignore cleanup error if service not loaded
    }

    const filtered = songs.filter(
      (s) => s.id !== targetId && s.title.trim().toLowerCase() !== targetTitle
    );
    localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(filtered));
  }

  /**
   * Bulk deletes multiple songs by array of IDs
   */
  static async deleteSongsBulk(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    const songs = await this.getSongs();
    const idSet = new Set(ids.map((id) => id.trim()));

    try {
      const { SongFamilyService } = await import('./songFamilyService');
      for (const id of ids) {
        await SongFamilyService.unlinkSongFromFamily(id.trim());
      }
    } catch {
      // Ignore
    }

    const filtered = songs.filter((s) => !idSet.has(s.id));
    localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(filtered));
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
    allFamilies?: SongFamily[]
  ): string[] {
    const cleanTitle = songTitle.trim().toLowerCase();
    if (!cleanTitle) return [];

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

    const matchedSong = (songs || []).find((s) => s.id === cleanTitle || s.title.trim().toLowerCase() === cleanTitle);
    let targetFamily: SongFamily | undefined = undefined;

    if (matchedSong && matchedSong.songFamilyId) {
      targetFamily = (families || []).find((f) => f.id === matchedSong.songFamilyId);
    }

    if (!targetFamily && matchedSong) {
      targetFamily = (families || []).find(
        (f) => f.versionIds.includes(matchedSong.id) || (f.versions && f.versions.some((v) => v.songId === matchedSong.id))
      );
    }

    if (!targetFamily) {
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

      if (!memberTitles.includes(cleanTitle)) {
        memberTitles.push(cleanTitle);
      }
      if (targetFamily.name && !memberTitles.includes(targetFamily.name.trim().toLowerCase())) {
        memberTitles.push(targetFamily.name.trim().toLowerCase());
      }
      return Array.from(new Set(memberTitles));
    }

    return [cleanTitle];
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
    allFamilies?: SongFamily[]
  ): number {
    const cleanTitle = songTitle.trim().toLowerCase();
    if (!cleanTitle || !schedules || schedules.length === 0) return 0;

    const familyTitles = new Set(this.getFamilySongTitles(songTitle, allSongs, allFamilies));
    const monthStr = targetMonthStr || getManilaTodayString().substring(0, 7);

    let count = 0;
    for (const sch of schedules) {
      if (!sch.serviceDate) continue;
      const schYM = sch.serviceDate.substring(0, 7);
      if (schYM !== monthStr) continue;

      if (sch.praiseSongs) {
        for (const p of sch.praiseSongs) {
          if (familyTitles.has(p.trim().toLowerCase())) {
            count++;
          }
        }
      }
      if (sch.worshipSongs) {
        for (const w of sch.worshipSongs) {
          if (familyTitles.has(w.trim().toLowerCase())) {
            count++;
          }
        }
      }
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
    allFamilies?: SongFamily[]
  ): MonthlyUsageCheckResult {
    const cleanTitle = songTitle.trim().toLowerCase();
    if (!cleanTitle || !targetDateStr) {
      return { songTitle, timesUsedThisMonth: 0, serviceTypes: [], datesUsed: [], affectedSchedules: [] };
    }

    const familyTitles = new Set(this.getFamilySongTitles(songTitle, allSongs, allFamilies));
    const targetYearMonth = targetDateStr.substring(0, 7);
    const isCandidateRegular = !isSpecialEvent(candidateServiceType);

    // Filter out the schedule being edited if excludeScheduleId is provided
    const otherSchedules = schedules.filter((s) => s.id !== excludeScheduleId);

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

    const containingSchedules = candidateSchedules.filter((sch) => {
      const hasPraise = (sch.praiseSongs || []).some((s) => familyTitles.has(s.trim().toLowerCase()));
      const hasWorship = (sch.worshipSongs || []).some((s) => familyTitles.has(s.trim().toLowerCase()));
      return hasPraise || hasWorship;
    });

    // Calculate total times used in existing schedules this month
    const totalUsesInOtherSchedules = containingSchedules.reduce((acc, sch) => {
      const praiseCount = (sch.praiseSongs || []).filter((s) => familyTitles.has(s.trim().toLowerCase())).length;
      const worshipCount = (sch.worshipSongs || []).filter((s) => familyTitles.has(s.trim().toLowerCase())).length;
      return acc + praiseCount + worshipCount;
    }, 0);

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

        // 1. Build inverted index by song ID and normalized title in a single schedule walk O(S)
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
          const entry: UsageEntry = {
            date: sch.serviceDate || '',
            serviceType: sch.serviceType || 'Sunday Service',
            scheduleId: sch.id
          };

          const seenInThisSchedule = new Set<string>();

          // Praise songs
          (sch.praiseSongIds || []).forEach((id) => {
            if (id && !seenInThisSchedule.has(`id:${id}`)) {
              seenInThisSchedule.add(`id:${id}`);
              recordUsage(usageBySongId, id, entry);
            }
          });
          (sch.praiseSongs || []).forEach((title) => {
            const clean = title?.trim().toLowerCase();
            if (clean && !seenInThisSchedule.has(`title:${clean}`)) {
              seenInThisSchedule.add(`title:${clean}`);
              recordUsage(usageByCleanTitle, clean, entry);
            }
          });

          // Worship songs
          (sch.worshipSongIds || []).forEach((id) => {
            if (id && !seenInThisSchedule.has(`id:${id}`)) {
              seenInThisSchedule.add(`id:${id}`);
              recordUsage(usageBySongId, id, entry);
            }
          });
          (sch.worshipSongs || []).forEach((title) => {
            const clean = title?.trim().toLowerCase();
            if (clean && !seenInThisSchedule.has(`title:${clean}`)) {
              seenInThisSchedule.add(`title:${clean}`);
              recordUsage(usageByCleanTitle, clean, entry);
            }
          });
        }

        // 2. Update each song in a single walk O(N)
        let modified = false;

        for (const song of songs) {
          const cleanTitle = song.title.trim().toLowerCase();
          const songId = song.id;

          const idMatches = usageBySongId.get(songId) || [];
          const titleMatches = usageByCleanTitle.get(cleanTitle) || [];

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
