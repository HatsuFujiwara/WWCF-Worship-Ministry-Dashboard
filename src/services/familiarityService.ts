import { SongFamiliarity, FamiliarityLevel } from '../types';

const STORAGE_KEY = 'wwcf_song_familiarity_v1';

export const VALID_FAMILIARITY_LEVELS: FamiliarityLevel[] = ['unfamiliar', 'learning', 'familiar', 'confident'];

export function validateSongFamiliarityRecord(
  raw: any,
  index = 0
): { valid: SongFamiliarity | null; error?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: null, error: `Song familiarity entry #${index + 1} is not a valid object.` };
  }
  const memberId = typeof raw.memberId === 'string' ? raw.memberId.trim().slice(0, 100) : '';
  const songId = typeof raw.songId === 'string' ? raw.songId.trim().slice(0, 100) : '';
  if (!memberId || !songId) {
    return { valid: null, error: `Song familiarity entry #${index + 1} is missing a valid memberId or songId.` };
  }

  if (typeof raw.level !== 'string' || !VALID_FAMILIARITY_LEVELS.includes(raw.level as FamiliarityLevel)) {
    return {
      valid: null,
      error: `Invalid song familiarity level "${String(raw.level ?? '')}" for member "${memberId}" and song "${songId}". Expected unfamiliar, learning, familiar, or confident.`
    };
  }
  const level = raw.level as FamiliarityLevel;

  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 150) : `${memberId}_${songId}`;
  const notes = typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim().slice(0, 500) : undefined;
  const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt.slice(0, 50) : new Date().toISOString();

  return {
    valid: {
      id,
      memberId,
      songId,
      level,
      notes,
      updatedAt
    }
  };
}

export function sanitizeSongFamiliarity(raw: any): SongFamiliarity | null {
  return validateSongFamiliarityRecord(raw).valid;
}

export class FamiliarityService {
  static getFamiliarityListSync(): SongFamiliarity[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        try {
          localStorage.setItem(`wwcf_quarantine_${STORAGE_KEY}`, raw);
        } catch {}
        return [];
      }
      const valid: SongFamiliarity[] = [];
      let rejectedCount = 0;
      for (let i = 0; i < parsed.length; i++) {
        const res = validateSongFamiliarityRecord(parsed[i], i);
        if (res.valid) {
          valid.push(res.valid);
        } else {
          rejectedCount++;
        }
      }
      if (rejectedCount > 0) {
        console.warn(`[FamiliarityService] Ignored ${rejectedCount} malformed familiarity record(s) without coercing level.`);
        try {
          localStorage.setItem(`wwcf_quarantine_${STORAGE_KEY}`, raw);
        } catch {}
      }
      return valid;
    } catch (e) {
      console.error('[FamiliarityService] Failed to load song familiarity:', e);
      return [];
    }
  }

  static saveFamiliarityListSync(list: SongFamiliarity[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const valid = list
        .map(sanitizeSongFamiliarity)
        .filter((item): item is SongFamiliarity => item !== null);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
    } catch (e) {
      console.error('[FamiliarityService] Failed to save song familiarity:', e);
      throw e;
    }
  }

  static getFamiliarity(memberId: string, songId: string): SongFamiliarity | undefined {
    const list = this.getFamiliarityListSync();
    return list.find((item) => item.memberId === memberId && item.songId === songId);
  }

  static getFamiliarityForSong(songId: string): SongFamiliarity[] {
    const list = this.getFamiliarityListSync();
    return list.filter((item) => item.songId === songId);
  }

  static getFamiliarityForMember(memberId: string): SongFamiliarity[] {
    const list = this.getFamiliarityListSync();
    return list.filter((item) => item.memberId === memberId);
  }

  static getMemberFamiliarityMap(memberId: string): Map<string, FamiliarityLevel> {
    const items = this.getFamiliarityForMember(memberId);
    const map = new Map<string, FamiliarityLevel>();
    items.forEach((item) => {
      map.set(item.songId, item.level);
    });
    return map;
  }

  static setFamiliarity(
    memberId: string,
    songId: string,
    level: FamiliarityLevel,
    notes?: string
  ): SongFamiliarity {
    if (!VALID_FAMILIARITY_LEVELS.includes(level)) {
      throw new Error(`Invalid familiarity level "${String(level)}". Expected unfamiliar, learning, familiar, or confident.`);
    }
    const list = this.getFamiliarityListSync();
    const existingIndex = list.findIndex(
      (item) => item.memberId === memberId && item.songId === songId
    );

    const record: SongFamiliarity = {
      id: `${memberId}_${songId}`,
      memberId,
      songId,
      level,
      notes: notes?.trim() || undefined,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      list[existingIndex] = record;
    } else {
      list.push(record);
    }

    this.saveFamiliarityListSync(list);
    return record;
  }

  static getSongFamiliaritySummary(songId: string): {
    total: number;
    confident: number;
    familiar: number;
    learning: number;
    unfamiliar: number;
  } {
    const records = this.getFamiliarityForSong(songId);
    let confident = 0;
    let familiar = 0;
    let learning = 0;
    let unfamiliar = 0;

    records.forEach((r) => {
      if (r.level === 'confident') confident++;
      else if (r.level === 'familiar') familiar++;
      else if (r.level === 'learning') learning++;
      else if (r.level === 'unfamiliar') unfamiliar++;
    });

    return {
      total: records.length,
      confident,
      familiar,
      learning,
      unfamiliar
    };
  }

  static removeFamiliarity(memberId: string, songId: string): void {
    const list = this.getFamiliarityListSync();
    const filtered = list.filter(
      (item) => !(item.memberId === memberId && item.songId === songId)
    );
    this.saveFamiliarityListSync(filtered);
  }
}
