import { SongFamily, Song, SongRelationshipType, SongVersionRef } from '../types';
import { SongService } from './songService';
import { quarantineCorruptStorage } from './storage';
import { getManilaNowISO } from '../utils/dateUtils';
import { getNormalizedBaseTitle } from '../utils/songFamilyUtils';
import { isNoServiceSchedule } from '../utils/scheduleUtils';
import { resolveSlotSong } from '../utils/songResolveUtils';

const SONG_FAMILIES_STORAGE_KEY = 'wwcf_song_families_v1';
const SONGS_STORAGE_KEY = 'wwcf_songs_v1';

function sanitizeStoredFamily(raw: any): SongFamily | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : '';
  if (!id || !name) return null;
  return {
    ...raw,
    id,
    name,
    versionIds: Array.isArray(raw.versionIds) ? raw.versionIds.filter((v: any) => typeof v === 'string' && v.trim()) : [],
    versions: Array.isArray(raw.versions) ? raw.versions.filter((v: any) => v && typeof v === 'object' && typeof v.songId === 'string') : undefined
  };
}

export class SongFamilyService {
  /**
   * Synchronously retrieves all Song Families from storage.
   */
  static getSongFamiliesSync(): SongFamily[] {
    try {
      const data = localStorage.getItem(SONG_FAMILIES_STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) {
        quarantineCorruptStorage(SONG_FAMILIES_STORAGE_KEY, data, 'Stored song families data is corrupted (not an array).');
        return [];
      }
      const valid = parsed
        .map(sanitizeStoredFamily)
        .filter((item): item is SongFamily => item !== null);
      if (valid.length < parsed.length) {
        quarantineCorruptStorage(
          SONG_FAMILIES_STORAGE_KEY,
          data,
          `Skipped ${parsed.length - valid.length} malformed song family record(s) while preserving valid entries.`
        );
      }
      return valid;
    } catch (e) {
      try {
        const data = localStorage.getItem(SONG_FAMILIES_STORAGE_KEY);
        if (data) {
          quarantineCorruptStorage(SONG_FAMILIES_STORAGE_KEY, data, 'Stored song families JSON could not be parsed.');
        }
      } catch {}
      console.error('Error reading song families synchronously:', e);
      return [];
    }
  }

  /**
   * Retrieves all Song Families from storage.
   */
  static async getSongFamilies(): Promise<SongFamily[]> {
    return this.getSongFamiliesSync();
  }

  /**
   * Saves the entire list of Song Families to storage.
   */
  static async saveSongFamilies(families: SongFamily[]): Promise<void> {
    try {
      localStorage.setItem(SONG_FAMILIES_STORAGE_KEY, JSON.stringify(families));
      const verified = localStorage.getItem(SONG_FAMILIES_STORAGE_KEY);
      if (verified === null) throw new Error('Persistence verification failed for song families.');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wwcf:families-updated', { detail: families }));
        window.dispatchEvent(new CustomEvent('wwcf:data-changed', { detail: { type: 'families' } }));
      }
    } catch (e) {
      console.error('Error saving song families:', e);
      throw e;
    }
  }

  /**
   * Atomically commits updated song families and songs with full rollback on any failure.
   */
  private static async commitFamilyAndSongsTransaction(
    nextFamilies: SongFamily[],
    nextSongs: Song[],
    prevFamilies: SongFamily[],
    prevSongs: Song[],
    familiesModified: boolean,
    songsModified: boolean
  ): Promise<void> {
    const prevFamiliesRaw = localStorage.getItem(SONG_FAMILIES_STORAGE_KEY);
    const prevSongsRaw = localStorage.getItem(SONGS_STORAGE_KEY);

    try {
      if (familiesModified) {
        localStorage.setItem(SONG_FAMILIES_STORAGE_KEY, JSON.stringify(nextFamilies));
        if (localStorage.getItem(SONG_FAMILIES_STORAGE_KEY) === null) {
          throw new Error('Persistence verification failed for song families.');
        }
      }

      if (songsModified) {
        localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(nextSongs));
        if (localStorage.getItem(SONGS_STORAGE_KEY) === null) {
          throw new Error('Persistence verification failed for songs.');
        }
      }
    } catch (err) {
      // Roll back both stores to pre-transaction snapshot
      try {
        if (prevFamiliesRaw === null) {
          localStorage.removeItem(SONG_FAMILIES_STORAGE_KEY);
        } else {
          localStorage.setItem(SONG_FAMILIES_STORAGE_KEY, prevFamiliesRaw || JSON.stringify(prevFamilies));
        }
        if (prevSongsRaw === null) {
          localStorage.removeItem(SONGS_STORAGE_KEY);
        } else {
          localStorage.setItem(SONGS_STORAGE_KEY, prevSongsRaw || JSON.stringify(prevSongs));
        }
      } catch (rbErr) {
        console.error('[SongFamilyService] Critical rollback failure:', rbErr);
      }
      throw err;
    }

    if (typeof window !== 'undefined') {
      if (familiesModified) {
        window.dispatchEvent(new CustomEvent('wwcf:families-updated', { detail: nextFamilies }));
        window.dispatchEvent(new CustomEvent('wwcf:data-changed', { detail: { type: 'families' } }));
      }
      if (songsModified) {
        window.dispatchEvent(new CustomEvent('wwcf:songs-updated', { detail: nextSongs }));
        window.dispatchEvent(new CustomEvent('wwcf:data-changed', { detail: { type: 'songs' } }));
      }
    }
  }

  /**
   * Retrieves a single Song Family by its ID.
   */
  static async getSongFamilyById(id: string): Promise<SongFamily | null> {
    if (!id) return null;
    const families = await this.getSongFamilies();
    return families.find((f) => f.id === id) || null;
  }

  /**
   * Creates a new Song Family and links the specified songs atomically.
   */
  static async createSongFamily(params: {
    name: string;
    songIds: string[];
    originalSongId?: string;
    notes?: string;
    versions?: { songId: string; relationshipType: SongRelationshipType }[];
  }): Promise<SongFamily> {
    const prevFamilies = await this.getSongFamilies();
    const prevSongs = await SongService.getSongs();

    const cleanSongIds = Array.from(new Set((params.songIds || []).map((id) => (id || '').trim()).filter(Boolean)));
    const songIdSet = new Set(prevSongs.map((s) => s.id));
    const missingSongIds = cleanSongIds.filter((sid) => !songIdSet.has(sid));
    if (missingSongIds.length > 0) {
      throw new Error(`Cannot create song family: song ID(s) not found in catalog (${missingSongIds.join(', ')}).`);
    }

    const families: SongFamily[] = JSON.parse(JSON.stringify(prevFamilies));
    const songs: Song[] = JSON.parse(JSON.stringify(prevSongs));

    const familyId = 'family_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = getManilaNowISO();

    const versions: SongVersionRef[] = cleanSongIds.map((sid) => {
      const customVer = params.versions?.find((v) => v.songId === sid);
      const isOriginal = params.originalSongId === sid;
      return {
        songId: sid,
        relationshipType: customVer?.relationshipType || (isOriginal ? 'ORIGINAL' : 'VERSION'),
        confidence: 'high'
      };
    });

    const newFamily: SongFamily = {
      id: familyId,
      name: params.name.trim(),
      versionIds: cleanSongIds,
      versions,
      originalSongId: params.originalSongId || (cleanSongIds.length > 0 ? cleanSongIds[0] : undefined),
      notes: params.notes || '',
      createdAt: now,
      updatedAt: now
    };

    // If any song in cleanSongIds belonged to other families, unlink it from those families
    families.forEach((otherFam) => {
      const remainingVersionIds = otherFam.versionIds.filter((id) => !cleanSongIds.includes(id));
      if (remainingVersionIds.length !== otherFam.versionIds.length) {
        otherFam.versionIds = remainingVersionIds;
        if (otherFam.versions) {
          otherFam.versions = otherFam.versions.filter((v) => !cleanSongIds.includes(v.songId));
        }
        if (otherFam.originalSongId && cleanSongIds.includes(otherFam.originalSongId)) {
          otherFam.originalSongId = remainingVersionIds.length > 0 ? remainingVersionIds[0] : undefined;
        }
        otherFam.updatedAt = now;
      }
    });

    const remainingFamilies = families.filter((f) => f.versionIds.length > 0);
    remainingFamilies.push(newFamily);

    // Update songs with the new songFamilyId
    let songsModified = false;
    songs.forEach((song) => {
      if (cleanSongIds.includes(song.id)) {
        song.songFamilyId = familyId;
        const verRef = versions.find((v) => v.songId === song.id);
        if (verRef) {
          song.relationshipType = verRef.relationshipType;
        }
        songsModified = true;
      }
    });

    await this.commitFamilyAndSongsTransaction(
      remainingFamilies,
      songs,
      prevFamilies,
      prevSongs,
      true,
      songsModified
    );

    return newFamily;
  }

  /**
   * Updates an existing Song Family metadata and synchronizes member song references atomically.
   */
  static async updateSongFamily(updatedFamily: SongFamily): Promise<SongFamily> {
    const prevFamilies = await this.getSongFamilies();
    const prevSongs = await SongService.getSongs();

    const cleanVersionIds = Array.from(new Set((updatedFamily.versionIds || []).map((id) => (id || '').trim()).filter(Boolean)));
    const songIdSet = new Set(prevSongs.map((s) => s.id));
    const missingSongIds = cleanVersionIds.filter((sid) => !songIdSet.has(sid));
    if (missingSongIds.length > 0) {
      throw new Error(`Cannot update song family: song ID(s) not found in catalog (${missingSongIds.join(', ')}).`);
    }

    const families: SongFamily[] = JSON.parse(JSON.stringify(prevFamilies));
    const songs: Song[] = JSON.parse(JSON.stringify(prevSongs));

    const index = families.findIndex((f) => f.id === updatedFamily.id);
    const now = getManilaNowISO();
    const cleanFamily: SongFamily = {
      ...updatedFamily,
      name: updatedFamily.name.trim(),
      versionIds: cleanVersionIds,
      updatedAt: now
    };

    if (index >= 0) {
      families[index] = cleanFamily;
    } else {
      families.push(cleanFamily);
    }

    // Unlink these songs from any other families
    families.forEach((otherFam) => {
      if (otherFam.id !== cleanFamily.id) {
        const remainingVersionIds = otherFam.versionIds.filter((id) => !cleanFamily.versionIds.includes(id));
        if (remainingVersionIds.length !== otherFam.versionIds.length) {
          otherFam.versionIds = remainingVersionIds;
          if (otherFam.versions) {
            otherFam.versions = otherFam.versions.filter((v) => !cleanFamily.versionIds.includes(v.songId));
          }
          if (otherFam.originalSongId && cleanFamily.versionIds.includes(otherFam.originalSongId)) {
            otherFam.originalSongId = remainingVersionIds.length > 0 ? remainingVersionIds[0] : undefined;
          }
          otherFam.updatedAt = now;
        }
      }
    });

    const activeFamilies = families.filter((f) => f.id === cleanFamily.id || f.versionIds.length > 0);

    // Sync song references
    let songsModified = false;
    const targetSet = new Set(cleanFamily.versionIds);

    songs.forEach((song) => {
      if (song.songFamilyId === cleanFamily.id && !targetSet.has(song.id)) {
        // Song was removed from family
        song.songFamilyId = undefined;
        song.relationshipType = undefined;
        songsModified = true;
      } else if (targetSet.has(song.id)) {
        // Song is in family
        if (song.songFamilyId !== cleanFamily.id) {
          song.songFamilyId = cleanFamily.id;
          songsModified = true;
        }
        const verRef = cleanFamily.versions?.find((v) => v.songId === song.id);
        if (verRef && song.relationshipType !== verRef.relationshipType) {
          song.relationshipType = verRef.relationshipType;
          songsModified = true;
        }
      }
    });

    await this.commitFamilyAndSongsTransaction(
      activeFamilies,
      songs,
      prevFamilies,
      prevSongs,
      true,
      songsModified
    );

    return cleanFamily;
  }

  /**
   * Adds a song to an existing family atomically.
   */
  static async addSongToFamily(
    familyId: string,
    songId: string,
    relationshipType: SongRelationshipType = 'VERSION'
  ): Promise<SongFamily | null> {
    const cleanSongId = (songId || '').trim();
    if (!cleanSongId) throw new Error('A valid song ID is required to add to a song family.');

    const prevFamilies = await this.getSongFamilies();
    const prevSongs = await SongService.getSongs();

    const targetSongExists = prevSongs.some((s) => s.id === cleanSongId);
    if (!targetSongExists) {
      throw new Error(`Cannot add song to family: song ID "${cleanSongId}" was not found in catalog.`);
    }

    const families: SongFamily[] = JSON.parse(JSON.stringify(prevFamilies));
    const songs: Song[] = JSON.parse(JSON.stringify(prevSongs));
    const family = families.find((f) => f.id === familyId);
    if (!family) return null;

    if (!family.versionIds.includes(cleanSongId)) {
      family.versionIds.push(cleanSongId);
    }

    if (!family.versions) {
      family.versions = [];
    }

    const existingVer = family.versions.find((v) => v.songId === cleanSongId);
    if (existingVer) {
      existingVer.relationshipType = relationshipType;
    } else {
      family.versions.push({ songId: cleanSongId, relationshipType, confidence: 'high' });
    }

    family.updatedAt = getManilaNowISO();

    const song = songs.find((s) => s.id === cleanSongId);
    let songsModified = false;
    if (song) {
      song.songFamilyId = familyId;
      song.relationshipType = relationshipType;
      songsModified = true;
    }

    await this.commitFamilyAndSongsTransaction(
      families,
      songs,
      prevFamilies,
      prevSongs,
      true,
      songsModified
    );

    return family;
  }

  /**
   * Unlinks a single song from its current family without deleting the song atomically.
   */
  static async unlinkSongFromFamily(songId: string): Promise<void> {
    if (!songId) return;
    const prevFamilies = await this.getSongFamilies();
    const prevSongs = await SongService.getSongs();

    const families: SongFamily[] = JSON.parse(JSON.stringify(prevFamilies));
    const songs: Song[] = JSON.parse(JSON.stringify(prevSongs));

    let familiesModified = false;
    let songsModified = false;

    for (const family of families) {
      if (family.versionIds.includes(songId)) {
        family.versionIds = family.versionIds.filter((id) => id !== songId);
        if (family.versions) {
          family.versions = family.versions.filter((v) => v.songId !== songId);
        }
        if (family.originalSongId === songId) {
          family.originalSongId = family.versionIds.length > 0 ? family.versionIds[0] : undefined;
        }
        family.updatedAt = getManilaNowISO();
        familiesModified = true;
      }
    }

    const remainingFamilies = families.filter((f) => f.versionIds.length > 0);
    if (remainingFamilies.length !== families.length) {
      familiesModified = true;
    }

    const targetSong = songs.find((s) => s.id === songId);
    if (targetSong && (targetSong.songFamilyId || targetSong.relationshipType)) {
      targetSong.songFamilyId = undefined;
      targetSong.relationshipType = undefined;
      songsModified = true;
    }

    if (familiesModified || songsModified) {
      await this.commitFamilyAndSongsTransaction(
        remainingFamilies,
        songs,
        prevFamilies,
        prevSongs,
        familiesModified,
        songsModified
      );
    }
  }

  /**
   * Deletes a Song Family completely and unlinks all its member songs atomically.
   */
  static async deleteSongFamily(familyId: string): Promise<void> {
    if (!familyId) return;
    const prevFamilies = await this.getSongFamilies();
    const prevSongs = await SongService.getSongs();

    const songs: Song[] = JSON.parse(JSON.stringify(prevSongs));
    const filteredFamilies = prevFamilies.filter((f) => f.id !== familyId);
    const familiesModified = filteredFamilies.length !== prevFamilies.length;

    let songsModified = false;
    songs.forEach((song) => {
      if (song.songFamilyId === familyId) {
        song.songFamilyId = undefined;
        song.relationshipType = undefined;
        songsModified = true;
      }
    });

    if (familiesModified || songsModified) {
      await this.commitFamilyAndSongsTransaction(
        filteredFamilies,
        songs,
        prevFamilies,
        prevSongs,
        familiesModified,
        songsModified
      );
    }
  }

  /**
   * Synchronizes song records and song families to guarantee bidirectional consistency atomically.
   */
  static async syncSongFamiliesWithSongs(songsInput: Song[]): Promise<SongFamily[]> {
    const prevFamilies = await this.getSongFamilies();
    const prevSongs = songsInput;
    const families: SongFamily[] = JSON.parse(JSON.stringify(prevFamilies));
    const songs: Song[] = JSON.parse(JSON.stringify(prevSongs));

    const songIdMap = new Map<string, Song>();
    songs.forEach((s) => songIdMap.set(s.id, s));

    let familiesModified = false;
    let songsModified = false;

    // 1. Ensure all song IDs in families still exist
    const validFamilies: SongFamily[] = [];
    for (const fam of families) {
      const validVersionIds = fam.versionIds.filter((id) => songIdMap.has(id));
      if (validVersionIds.length === 0) {
        familiesModified = true;
        continue; // Drop family if no valid songs remain
      }
      if (validVersionIds.length !== fam.versionIds.length) {
        fam.versionIds = validVersionIds;
        if (fam.versions) {
          fam.versions = fam.versions.filter((v) => songIdMap.has(v.songId));
        }
        if (fam.originalSongId && !songIdMap.has(fam.originalSongId)) {
          fam.originalSongId = validVersionIds[0];
        }
        familiesModified = true;
      }
      validFamilies.push(fam);
    }

    // 2. Ensure each song with a songFamilyId is registered in that family
    const familyMap = new Map<string, SongFamily>();
    validFamilies.forEach((f) => familyMap.set(f.id, f));

    songs.forEach((song) => {
      if (song.songFamilyId) {
        const fam = familyMap.get(song.songFamilyId);
        if (fam) {
          if (!fam.versionIds.includes(song.id)) {
            fam.versionIds.push(song.id);
            if (!fam.versions) fam.versions = [];
            fam.versions.push({
              songId: song.id,
              relationshipType: song.relationshipType || 'VERSION',
              confidence: 'high'
            });
            familiesModified = true;
          }
        } else {
          // Pointed to non-existent family
          song.songFamilyId = undefined;
          song.relationshipType = undefined;
          songsModified = true;
        }
      }
    });

    if (familiesModified || songsModified) {
      await this.commitFamilyAndSongsTransaction(
        validFamilies,
        songs,
        prevFamilies,
        prevSongs,
        familiesModified,
        songsModified
      );
      if (songsModified) {
        // Reflect cleaned song links back into caller array if mutated in place historically
        songsInput.splice(0, songsInput.length, ...songs);
      }
    }

    return validFamilies;
  }

  /**
   * Helper to locate the SongFamily for a given song by ID, song title, or Song object.
   * Authoritative ID rule: when an object or string resolves to a song ID, never fall back
   * to another song sharing the same title. On ambiguous un-ID'd titles, return null.
   */
  static findFamilyForSong(
    songOrIdOrTitle: Song | string,
    families: SongFamily[],
    songs: Song[]
  ): SongFamily | null {
    if (!songOrIdOrTitle || !families || families.length === 0) return null;

    if (typeof songOrIdOrTitle === 'object') {
      if (songOrIdOrTitle.songFamilyId) {
        const match = families.find((f) => f.id === songOrIdOrTitle.songFamilyId);
        if (match) return match;
      }
      if (songOrIdOrTitle.id) {
        const matchByVersion = families.find(
          (f) => f.versionIds.includes(songOrIdOrTitle.id) || (f.versions && f.versions.some((v) => v.songId === songOrIdOrTitle.id))
        );
        return matchByVersion || null;
      }

      // No ID on object: allow fallback ONLY when exact catalog title is unambiguous
      const titleLower = (songOrIdOrTitle.title || '').trim().toLowerCase();
      if (titleLower) {
        const titleMatches = songs.filter((s) => s.title.trim().toLowerCase() === titleLower);
        if (titleMatches.length > 1) {
          return null;
        }
        if (titleMatches.length === 1) {
          const uniqueSong = titleMatches[0];
          if (uniqueSong.songFamilyId) {
            return families.find((f) => f.id === uniqueSong.songFamilyId) || null;
          }
          return (
            families.find(
              (f) => f.versionIds.includes(uniqueSong.id) || (f.versions && f.versions.some((v) => v.songId === uniqueSong.id))
            ) || null
          );
        }
        const matchByName = families.find((f) => f.name.trim().toLowerCase() === titleLower);
        if (matchByName) return matchByName;
      }
      return null;
    }

    // String input: can be song ID, unambiguous song title, or family name
    const str = songOrIdOrTitle.trim();
    if (!str) return null;
    const strLower = str.toLowerCase();

    // 1. Direct song ID match inside families
    const byId = families.find(
      (f) => f.versionIds.includes(str) || (f.versions && f.versions.some((v) => v.songId === str))
    );
    if (byId) return byId;

    // 2. Direct song ID match in catalog -> strictly follow that song's family link (or null)
    const foundById = songs.find((s) => s.id === str);
    if (foundById) {
      if (foundById.songFamilyId) {
        return families.find((f) => f.id === foundById.songFamilyId) || null;
      }
      return (
        families.find(
          (f) => f.versionIds.includes(foundById.id) || (f.versions && f.versions.some((v) => v.songId === foundById.id))
        ) || null
      );
    }

    // 3. Un-ID'd title lookup: disallow ambiguous duplicate titles
    const titleMatches = songs.filter((s) => s.title.trim().toLowerCase() === strLower);
    if (titleMatches.length > 1) {
      return null;
    }
    if (titleMatches.length === 1) {
      const uniqueSong = titleMatches[0];
      if (uniqueSong.songFamilyId) {
        return families.find((f) => f.id === uniqueSong.songFamilyId) || null;
      }
      return (
        families.find(
          (f) => f.versionIds.includes(uniqueSong.id) || (f.versions && f.versions.some((v) => v.songId === uniqueSong.id))
        ) || null
      );
    }

    // 4. Family Name match only when no catalog song title conflict exists
    const byFamilyName = families.find((f) => f.name.trim().toLowerCase() === strLower);
    if (byFamilyName) return byFamilyName;

    return null;
  }

  /**
   * Calculates effective usage statistics for a song.
   * If the song belongs to a Song Family, aggregates usage across ALL members of the family
   * without mutating or overwriting the individual song's database record.
   */
  static getEffectiveUsageStats(
    song: Song,
    allSongs?: Song[],
    allFamilies?: SongFamily[],
    schedules?: any[]
  ): {
    timesUsed: number;
    lastUsedDate?: string;
    isFamilyMember: boolean;
    familyTotalUsage: number;
    familyId?: string;
    familyName?: string;
    memberCount: number;
  } {
    if (!song) {
      return {
        timesUsed: 0,
        lastUsedDate: undefined,
        isFamilyMember: false,
        familyTotalUsage: 0,
        memberCount: 1
      };
    }

    const songs = allSongs || SongService.getSongsSync();
    const families = allFamilies || this.getSongFamiliesSync();
    const family = this.findFamilyForSong(song, families, songs);

    if (!family) {
      // Standalone song: individual usage only
      return {
        timesUsed: song.timesUsed || 0,
        lastUsedDate: song.lastUsedDate && song.lastUsedDate.trim() ? song.lastUsedDate : undefined,
        isFamilyMember: false,
        familyTotalUsage: song.timesUsed || 0,
        memberCount: 1
      };
    }

    // Member songs of this family
    const memberIds = new Set(family.versionIds || []);
    if (family.versions) {
      family.versions.forEach((v) => memberIds.add(v.songId));
    }
    const memberSongs = songs.filter(
      (m) => memberIds.has(m.id) || (m.songFamilyId && m.songFamilyId === family.id)
    );
    const memberTitles = new Set(memberSongs.map((m) => m.title.trim().toLowerCase()));
    if (family.name) {
      memberTitles.add(family.name.trim().toLowerCase());
    }

    let count = 0;
    let latestDate = '';

    if (schedules && schedules.length > 0) {
      const slotMatchesFamily = (titles: string[] = [], ids: string[] = []): boolean => {
        const len = Math.max(titles.length, ids.length);
        for (let idx = 0; idx < len; idx++) {
          const slotId = (ids[idx] || '').trim();
          const slotTitle = (titles[idx] || '').trim();
          if (slotId) {
            if (memberIds.has(slotId)) return true;
            continue;
          }
          if (!slotTitle) continue;
          const resolved = resolveSlotSong(slotTitle, undefined, songs);
          if (resolved.song && memberIds.has(resolved.song.id)) return true;
          if (!resolved.song && !resolved.isAmbiguous && !resolved.isStaleId && memberTitles.has(slotTitle.toLowerCase())) {
            return true;
          }
        }
        return false;
      };

      for (const sch of schedules) {
        if (isNoServiceSchedule(sch)) continue;
        const inPraise = slotMatchesFamily(sch.praiseSongs || [], sch.praiseSongIds || []);
        const inWorship = slotMatchesFamily(sch.worshipSongs || [], sch.worshipSongIds || []);
        if (inPraise || inWorship) {
          count++;
          if (sch.serviceDate && (!latestDate || sch.serviceDate > latestDate)) {
            latestDate = sch.serviceDate;
          }
        }
      }
    }

    // Compare with recorded stats across members as fallback
    const sumIndividualPlays = memberSongs.reduce((sum, m) => sum + (m.timesUsed || 0), 0);
    const effectiveTimesUsed = Math.max(count, sumIndividualPlays, song.timesUsed || 0);

    memberSongs.forEach((m) => {
      if (m.lastUsedDate && (!latestDate || m.lastUsedDate > latestDate)) {
        latestDate = m.lastUsedDate;
      }
    });
    if (song.lastUsedDate && (!latestDate || song.lastUsedDate > latestDate)) {
      latestDate = song.lastUsedDate;
    }

    return {
      timesUsed: effectiveTimesUsed,
      lastUsedDate: latestDate || undefined,
      isFamilyMember: true,
      familyTotalUsage: effectiveTimesUsed,
      familyId: family.id,
      familyName: family.name,
      memberCount: Math.max(memberSongs.length, 1)
    };
  }

  /**
   * Given multiple candidate songs belonging to the same Song Family, selects the single best
   * representative version to display in recommendations so duplicates are avoided.
   * Priority:
   * 1. Least individual usage
   * 2. Original version (if usage is equal)
   * 3. More complete metadata (keys, lyrics, YouTube URL, CCLI, BPM)
   * 4. Alphabetical tie-breaker
   */
  static selectBestFamilyRepresentative(
    candidates: Song[],
    family: SongFamily
  ): Song {
    if (candidates.length <= 1) return candidates[0];

    const sorted = [...candidates].sort((a, b) => {
      // 1. Least individual usage
      const usageA = a.timesUsed ?? 0;
      const usageB = b.timesUsed ?? 0;
      if (usageA !== usageB) {
        return usageA - usageB;
      }

      // 2. Original version
      const isOrigA = a.id === family.originalSongId || a.relationshipType === 'ORIGINAL';
      const isOrigB = b.id === family.originalSongId || b.relationshipType === 'ORIGINAL';
      if (isOrigA && !isOrigB) return -1;
      if (!isOrigA && isOrigB) return 1;

      // 3. More complete metadata
      const scoreMeta = (s: Song) => {
        let score = 0;
        if (s.originalKey || s.key) score += 2;
        if (s.lyrics) score += 3;
        if (s.youtubeUrl) score += 2;
        if (s.ccliNumber) score += 1;
        if (s.bpm) score += 1;
        if (s.artist) score += 1;
        return score;
      };
      const diffMeta = scoreMeta(b) - scoreMeta(a);
      if (diffMeta !== 0) return diffMeta;

      return a.title.localeCompare(b.title);
    });

    return sorted[0];
  }

  /**
   * Groups two songs into a Song Family with the specified relationship.
   * Preserves all individual metadata on both songs without overwriting or deleting either record.
   */
  static async linkSongPair(params: {
    existingSong: Song;
    newSong: Song;
    relationship: SongRelationshipType;
    isNewSongOriginal?: boolean;
  }): Promise<SongFamily> {
    const { existingSong, newSong, relationship, isNewSongOriginal } = params;
    const families = await this.getSongFamilies();

    // Check if existingSong already belongs to a family
    const existingFamily = existingSong.songFamilyId
      ? families.find((f) => f.id === existingSong.songFamilyId)
      : families.find((f) => f.versionIds.includes(existingSong.id));

    if (existingFamily) {
      // Add newSong to existing family
      if (!existingFamily.versionIds.includes(newSong.id)) {
        existingFamily.versionIds.push(newSong.id);
      }
      if (!existingFamily.versions) {
        existingFamily.versions = [];
      }
      const vIdx = existingFamily.versions.findIndex((v) => v.songId === newSong.id);
      if (vIdx >= 0) {
        existingFamily.versions[vIdx].relationshipType = relationship;
      } else {
        existingFamily.versions.push({
          songId: newSong.id,
          relationshipType: relationship,
          confidence: 'high'
        });
      }

      if (isNewSongOriginal || relationship === 'ORIGINAL') {
        existingFamily.originalSongId = newSong.id;
        const oldOrigVer = existingFamily.versions.find((v) => v.songId === existingSong.id);
        if (oldOrigVer && oldOrigVer.relationshipType === 'ORIGINAL') {
          oldOrigVer.relationshipType = 'VERSION';
        }
      }

      return await this.updateSongFamily(existingFamily);
    }

    // Neither had a family - create a new family named after canonical base title
    const canonicalName = getNormalizedBaseTitle(existingSong.title) || existingSong.title;
    const isNewOrig = isNewSongOriginal || relationship === 'ORIGINAL';

    return await this.createSongFamily({
      name: canonicalName,
      songIds: [existingSong.id, newSong.id],
      originalSongId: isNewOrig ? newSong.id : existingSong.id,
      versions: [
        {
          songId: isNewOrig ? newSong.id : existingSong.id,
          relationshipType: 'ORIGINAL'
        },
        {
          songId: isNewOrig ? existingSong.id : newSong.id,
          relationshipType: isNewOrig ? 'VERSION' : relationship
        }
      ]
    });
  }
}
