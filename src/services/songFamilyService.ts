import { SongFamily, Song, SongRelationshipType, SongVersionRef } from '../types';
import { SongService } from './songService';
import { getManilaNowISO } from '../utils/dateUtils';
import { getNormalizedBaseTitle } from '../utils/songFamilyUtils';

const SONG_FAMILIES_STORAGE_KEY = 'wwcf_song_families_v1';

export class SongFamilyService {
  /**
   * Synchronously retrieves all Song Families from storage.
   */
  static getSongFamiliesSync(): SongFamily[] {
    try {
      const data = localStorage.getItem(SONG_FAMILIES_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
      return [];
    } catch (e) {
      console.error('Error reading song families synchronously:', e);
      return [];
    }
  }

  /**
   * Retrieves all Song Families from storage.
   */
  static async getSongFamilies(): Promise<SongFamily[]> {
    try {
      const data = localStorage.getItem(SONG_FAMILIES_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
      return [];
    } catch (e) {
      console.error('Error fetching song families:', e);
      return [];
    }
  }

  /**
   * Saves the entire list of Song Families to storage.
   */
  static async saveSongFamilies(families: SongFamily[]): Promise<void> {
    try {
      localStorage.setItem(SONG_FAMILIES_STORAGE_KEY, JSON.stringify(families));
    } catch (e) {
      console.error('Error saving song families:', e);
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
   * Creates a new Song Family and links the specified songs.
   */
  static async createSongFamily(params: {
    name: string;
    songIds: string[];
    originalSongId?: string;
    notes?: string;
    versions?: { songId: string; relationshipType: SongRelationshipType }[];
  }): Promise<SongFamily> {
    const families = await this.getSongFamilies();
    const songs = await SongService.getSongs();

    const familyId = 'family_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = getManilaNowISO();

    const cleanSongIds = Array.from(new Set(params.songIds.filter(Boolean)));
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
    await this.saveSongFamilies(remainingFamilies);

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

    if (songsModified) {
      await SongService.saveSongsList(songs);
    }

    return newFamily;
  }

  /**
   * Updates an existing Song Family metadata and synchronizes member song references.
   */
  static async updateSongFamily(updatedFamily: SongFamily): Promise<SongFamily> {
    const families = await this.getSongFamilies();
    const songs = await SongService.getSongs();

    const index = families.findIndex((f) => f.id === updatedFamily.id);
    const now = getManilaNowISO();
    const cleanFamily: SongFamily = {
      ...updatedFamily,
      name: updatedFamily.name.trim(),
      versionIds: Array.from(new Set(updatedFamily.versionIds.filter(Boolean))),
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
    await this.saveSongFamilies(activeFamilies);

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

    if (songsModified) {
      await SongService.saveSongsList(songs);
    }

    return cleanFamily;
  }

  /**
   * Adds a song to an existing family.
   */
  static async addSongToFamily(
    familyId: string,
    songId: string,
    relationshipType: SongRelationshipType = 'VERSION'
  ): Promise<SongFamily | null> {
    const families = await this.getSongFamilies();
    const family = families.find((f) => f.id === familyId);
    if (!family) return null;

    if (!family.versionIds.includes(songId)) {
      family.versionIds.push(songId);
    }

    if (!family.versions) {
      family.versions = [];
    }

    const existingVer = family.versions.find((v) => v.songId === songId);
    if (existingVer) {
      existingVer.relationshipType = relationshipType;
    } else {
      family.versions.push({ songId, relationshipType, confidence: 'high' });
    }

    family.updatedAt = getManilaNowISO();
    await this.saveSongFamilies(families);

    // Update song record
    const songs = await SongService.getSongs();
    const song = songs.find((s) => s.id === songId);
    if (song) {
      song.songFamilyId = familyId;
      song.relationshipType = relationshipType;
      await SongService.saveSongsList(songs);
    }

    return family;
  }

  /**
   * Unlinks a single song from its current family without deleting the song.
   */
  static async unlinkSongFromFamily(songId: string): Promise<void> {
    if (!songId) return;
    const families = await this.getSongFamilies();
    const songs = await SongService.getSongs();

    let familiesModified = false;

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

    // Clean up empty families or save
    const remainingFamilies = families.filter((f) => f.versionIds.length > 0);

    if (familiesModified) {
      await this.saveSongFamilies(remainingFamilies);
    }

    const targetSong = songs.find((s) => s.id === songId);
    if (targetSong && (targetSong.songFamilyId || targetSong.relationshipType)) {
      targetSong.songFamilyId = undefined;
      targetSong.relationshipType = undefined;
      await SongService.saveSongsList(songs);
    }
  }

  /**
   * Deletes a Song Family completely and unlinks all its member songs.
   */
  static async deleteSongFamily(familyId: string): Promise<void> {
    if (!familyId) return;
    const families = await this.getSongFamilies();
    const songs = await SongService.getSongs();

    const filteredFamilies = families.filter((f) => f.id !== familyId);
    await this.saveSongFamilies(filteredFamilies);

    let songsModified = false;
    songs.forEach((song) => {
      if (song.songFamilyId === familyId) {
        song.songFamilyId = undefined;
        song.relationshipType = undefined;
        songsModified = true;
      }
    });

    if (songsModified) {
      await SongService.saveSongsList(songs);
    }
  }

  /**
   * Synchronizes song records and song families to guarantee bidirectional consistency.
   */
  static async syncSongFamiliesWithSongs(songs: Song[]): Promise<SongFamily[]> {
    const families = await this.getSongFamilies();
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

    if (familiesModified) {
      await this.saveSongFamilies(validFamilies);
    }

    if (songsModified) {
      await SongService.saveSongsList(songs);
    }

    return validFamilies;
  }

  /**
   * Helper to locate the SongFamily for a given song by ID, song title, or Song object.
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
      const matchByVersion = families.find(
        (f) => f.versionIds.includes(songOrIdOrTitle.id) || (f.versions && f.versions.some((v) => v.songId === songOrIdOrTitle.id))
      );
      if (matchByVersion) return matchByVersion;

      const titleLower = (songOrIdOrTitle.title || '').trim().toLowerCase();
      if (titleLower) {
        const matchByName = families.find((f) => f.name.trim().toLowerCase() === titleLower);
        if (matchByName) return matchByName;

        const songByTitle = songs.find((s) => s.title.trim().toLowerCase() === titleLower);
        if (songByTitle) {
          if (songByTitle.songFamilyId) {
            return families.find((f) => f.id === songByTitle.songFamilyId) || null;
          }
          return families.find((f) => f.versionIds.includes(songByTitle.id)) || null;
        }
      }
      return null;
    }

    // String input: can be song ID or song title
    const str = songOrIdOrTitle.trim();
    const strLower = str.toLowerCase();

    // 1. By direct song ID
    const byId = families.find(
      (f) => f.versionIds.includes(str) || (f.versions && f.versions.some((v) => v.songId === str))
    );
    if (byId) return byId;

    // 2. By Family Name (exact case-insensitive)
    const byFamilyName = families.find((f) => f.name.trim().toLowerCase() === strLower);
    if (byFamilyName) return byFamilyName;

    // 3. By matching song title or ID in songs list
    const foundSong = songs.find(
      (s) => s.id === str || s.title.trim().toLowerCase() === strLower
    );
    if (foundSong) {
      if (foundSong.songFamilyId) {
        return families.find((f) => f.id === foundSong.songFamilyId) || null;
      }
      return families.find((f) => f.versionIds.includes(foundSong.id)) || null;
    }

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
      for (const sch of schedules) {
        const inPraise = (sch.praiseSongs || []).some((s: string) => memberTitles.has(s.trim().toLowerCase())) ||
                         (sch.praiseSongIds || []).some((id: string) => memberIds.has(id));
        const inWorship = (sch.worshipSongs || []).some((s: string) => memberTitles.has(s.trim().toLowerCase())) ||
                          (sch.worshipSongIds || []).some((id: string) => memberIds.has(id));
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
