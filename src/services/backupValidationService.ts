/**
 * Central Version-Aware Backup Envelope Validator for WWCF Santa Cruz Worship Ministry Dashboard
 * 
 * Validates and migrates backup files, cloud sync payloads, and QR transfer data.
 * Guarantees structural integrity, schema compatibility, bounded limits, and identity safety.
 */

import { Member, Schedule, Song, SongFamily, ServiceType } from '../types';

export interface ValidatedBackupEnvelope {
  app: string;
  version: string;
  exportedAt: string;
  data: {
    members?: Member[];
    songs?: Song[];
    schedules?: Schedule[];
    labels?: string[];
    songFamilies?: SongFamily[];
    draftSchedule?: any;
  };
  hasMembers: boolean;
  hasSongs: boolean;
  hasSchedules: boolean;
  hasLabels: boolean;
  hasSongFamilies: boolean;
  hasDraftSchedule: boolean;
}

export interface BackupValidationResult {
  isValid: boolean;
  error?: string;
  errors?: string[];
  envelope?: ValidatedBackupEnvelope;
  data?: ValidatedBackupEnvelope['data'];
  warnings: string[];
}

const SUPPORTED_APPS = [
  'WWCF Santa Cruz Worship Ministry',
  'WWCF Worship Ministry Dashboard',
  'WWCF Santa Cruz Worship Song Line-up Scheduler'
];

const VALID_SERVICE_TYPES = new Set<string>([
  'Sunday Service',
  'Midweek Prayer Service',
  'Youth Fellowship',
  'Worship Event',
  // Legacy aliases supported for migration
  'Youth Service',
  'Special Worship Event'
]);

const MAX_COLLECTION_ITEMS = 10000;
const MAX_STRING_LENGTH = 5000;

export class BackupValidationService {
  /**
   * Validates and sanitizes a candidate backup envelope
   */
  static validate(rawPayload: unknown): BackupValidationResult {
    const warnings: string[] = [];

    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
      return {
        isValid: false,
        error: 'Invalid payload: backup must be a valid JSON object.',
        warnings
      };
    }

    const payload = rawPayload as Record<string, any>;

    // 1. App identity check (with legacy fallback)
    const appName = typeof payload.app === 'string' ? payload.app.trim() : '';
    if (appName && !SUPPORTED_APPS.some((app) => app.toLowerCase() === appName.toLowerCase())) {
      warnings.push(`Backup app identity "${appName}" differs from canonical WWCF format.`);
    }

    // 2. Data envelope extraction
    const rawData = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? payload.data
      : payload;

    const hasMembers = 'members' in rawData && rawData.members !== undefined;
    const hasSongs = 'songs' in rawData && rawData.songs !== undefined;
    const hasSchedules = 'schedules' in rawData && rawData.schedules !== undefined;
    const hasLabels = 'labels' in rawData && rawData.labels !== undefined;
    const hasSongFamilies = 'songFamilies' in rawData && rawData.songFamilies !== undefined;
    const hasDraftSchedule = 'draftSchedule' in rawData && rawData.draftSchedule !== undefined;

    // At least one core collection must be present to be a valid backup
    if (!hasMembers && !hasSongs && !hasSchedules && !hasSongFamilies) {
      return {
        isValid: false,
        error: 'Backup payload contains no recognized church data collections (members, songs, schedules, or families).',
        warnings
      };
    }

    // 3. Members Validation
    let validatedMembers: Member[] | undefined = undefined;
    if (hasMembers) {
      if (!Array.isArray(rawData.members)) {
        return {
          isValid: false,
          error: 'Corrupted backup: "members" property exists but is not an array.',
          warnings
        };
      }
      if (rawData.members.length > MAX_COLLECTION_ITEMS) {
        return {
          isValid: false,
          error: `Collection size exceeded: members collection has ${rawData.members.length} items (limit: ${MAX_COLLECTION_ITEMS}).`,
          warnings
        };
      }

      const seenIds = new Set<string>();
      validatedMembers = [];

      for (let i = 0; i < rawData.members.length; i++) {
        const m = rawData.members[i];
        if (!m || typeof m !== 'object') continue;
        const name = typeof m.name === 'string' ? m.name.trim().slice(0, 300) : '';
        if (!name) continue;

        let id = typeof m.id === 'string' && m.id.trim() ? m.id.trim().slice(0, 100) : `member_${Date.now()}_${i}`;
        if (seenIds.has(id)) {
          id = `${id}_dup_${i}`;
          warnings.push(`Duplicate member ID resolved for "${name}".`);
        }
        seenIds.add(id);

        const labels = Array.isArray(m.labels)
          ? m.labels.filter((l: any) => typeof l === 'string' && l.trim()).map((l: string) => l.trim().slice(0, 100))
          : [];

        validatedMembers.push({
          id,
          name,
          labels,
          ...(m.disciplinaryAction && typeof m.disciplinaryAction === 'object' ? { disciplinaryAction: m.disciplinaryAction } : {})
        });
      }
    }

    // 4. Songs Validation
    let validatedSongs: Song[] | undefined = undefined;
    if (hasSongs) {
      if (!Array.isArray(rawData.songs)) {
        return {
          isValid: false,
          error: 'Corrupted backup: "songs" property exists but is not an array.',
          errors: ['Corrupted backup: "songs" property exists but is not an array.'],
          warnings
        };
      }
      if (rawData.songs.length > MAX_COLLECTION_ITEMS) {
        return {
          isValid: false,
          error: `Collection size exceeded: songs collection has ${rawData.songs.length} items (limit: ${MAX_COLLECTION_ITEMS}).`,
          errors: [`Collection size exceeded: songs collection has ${rawData.songs.length} items (limit: ${MAX_COLLECTION_ITEMS}).`],
          warnings
        };
      }

      const seenIds = new Set<string>();
      validatedSongs = [];

      for (let i = 0; i < rawData.songs.length; i++) {
        const s = rawData.songs[i];
        if (!s || typeof s !== 'object') continue;
        const title = typeof s.title === 'string' ? s.title.trim().slice(0, 400) : '';
        if (!title) continue;

        let id = typeof s.id === 'string' && s.id.trim() ? s.id.trim().slice(0, 100) : `song_${Date.now()}_${i}`;
        if (seenIds.has(id)) {
          id = `${id}_dup_${i}`;
          warnings.push(`Duplicate song ID resolved for "${title}".`);
        }
        seenIds.add(id);

        const artist = typeof s.artist === 'string' ? s.artist.trim().slice(0, 300) : 'Unknown Artist';
        const rawCat = typeof s.category === 'string' ? s.category.toLowerCase().trim() : 'praise';
        const category = rawCat === 'worship' ? 'worship' : rawCat === 'both' ? 'both' : 'praise';

        validatedSongs.push({
          id,
          title,
          artist,
          category,
          key: typeof s.key === 'string' ? s.key.trim().slice(0, 20) : '',
          originalKey: typeof s.originalKey === 'string' ? s.originalKey.trim().slice(0, 20) : (typeof s.key === 'string' ? s.key.trim().slice(0, 20) : ''),
          language: typeof s.language === 'string' ? s.language.trim().slice(0, 50) : 'English',
          versionType: s.versionType === 'cover' ? 'cover' : 'original',
          ...(typeof s.songFamilyId === 'string' ? { songFamilyId: s.songFamilyId } : {}),
          ...(typeof s.album === 'string' ? { album: s.album.slice(0, 200) } : {}),
          ...(typeof s.releaseYear === 'string' || typeof s.releaseYear === 'number' ? { releaseYear: String(s.releaseYear).slice(0, 10) } : {}),
          ...(typeof s.duration === 'string' ? { duration: s.duration.slice(0, 20) } : {}),
          ...(typeof s.youtubeUrl === 'string' ? { youtubeUrl: s.youtubeUrl.slice(0, 1000) } : {}),
          ...(typeof s.youtubeId === 'string' ? { youtubeId: s.youtubeId.slice(0, 50) } : {}),
          ...(typeof s.thumbnailUrl === 'string' ? { thumbnailUrl: s.thumbnailUrl.slice(0, 1000) } : {}),
          ...(typeof s.lyrics === 'string' ? { lyrics: s.lyrics.slice(0, MAX_STRING_LENGTH * 4) } : {}),
          ...(typeof s.songwriters === 'string' ? { songwriters: s.songwriters.slice(0, 500) } : {}),
          ...(typeof s.ccliNumber === 'string' ? { ccliNumber: s.ccliNumber.slice(0, 50) } : {}),
          timesUsed: typeof s.timesUsed === 'number' && s.timesUsed >= 0 ? s.timesUsed : (typeof s.usageCount === 'number' && s.usageCount >= 0 ? s.usageCount : 0),
          dateAdded: typeof s.dateAdded === 'string' ? s.dateAdded : new Date().toISOString(),
          serviceHistory: Array.isArray(s.serviceHistory) ? s.serviceHistory : [],
          ...(typeof s.lastUsedDate === 'string' && s.lastUsedDate.trim() ? { lastUsedDate: s.lastUsedDate.slice(0, 30) } : {})
        });
      }
    }

    // 5. Schedules Validation
    let validatedSchedules: Schedule[] | undefined = undefined;
    if (hasSchedules) {
      if (!Array.isArray(rawData.schedules)) {
        return {
          isValid: false,
          error: 'Corrupted backup: "schedules" property exists but is not an array.',
          warnings
        };
      }
      if (rawData.schedules.length > MAX_COLLECTION_ITEMS) {
        return {
          isValid: false,
          error: `Collection size exceeded: schedules collection has ${rawData.schedules.length} items (limit: ${MAX_COLLECTION_ITEMS}).`,
          warnings
        };
      }

      const seenIds = new Set<string>();
      validatedSchedules = [];

      for (let i = 0; i < rawData.schedules.length; i++) {
        const sc = rawData.schedules[i];
        if (!sc || typeof sc !== 'object') continue;

        const serviceDate = typeof sc.serviceDate === 'string' ? sc.serviceDate.trim().slice(0, 20) : '';
        if (!serviceDate || !/^\d{4}-\d{2}-\d{2}/.test(serviceDate)) {
          warnings.push(`Schedule index ${i} skipped: invalid serviceDate.`);
          continue;
        }

        let id = typeof sc.id === 'string' && sc.id.trim() ? sc.id.trim().slice(0, 100) : `sched_${Date.now()}_${i}`;
        if (seenIds.has(id)) {
          id = `${id}_dup_${i}`;
          warnings.push(`Duplicate schedule ID resolved for date "${serviceDate}".`);
        }
        seenIds.add(id);

        let serviceType: ServiceType = 'Sunday Service';
        if (typeof sc.serviceType === 'string' && VALID_SERVICE_TYPES.has(sc.serviceType.trim())) {
          serviceType = sc.serviceType.trim() as ServiceType;
        }

        const praiseSongs = Array.isArray(sc.praiseSongs)
          ? sc.praiseSongs.filter((s: any) => typeof s === 'string').map((s: string) => s.slice(0, 400))
          : [];
        const worshipSongs = Array.isArray(sc.worshipSongs)
          ? sc.worshipSongs.filter((s: any) => typeof s === 'string').map((s: string) => s.slice(0, 400))
          : [];

        const ministryAssignments = Array.isArray(sc.ministryAssignments)
          ? sc.ministryAssignments.map((a: any, aIdx: number) => ({
              id: typeof a?.id === 'string' ? a.id.slice(0, 100) : `assign_${aIdx}`,
              role: typeof a?.role === 'string' ? a.role.slice(0, 100) : 'Ministry Role',
              assignedMembers: Array.isArray(a?.assignedMembers)
                ? a.assignedMembers.map((am: any) => ({
                    memberId: typeof am?.memberId === 'string' ? am.memberId.slice(0, 100) : '',
                    memberName: typeof am?.memberName === 'string' ? am.memberName.slice(0, 200) : ''
                  }))
                : (typeof a?.memberId === 'string' || typeof a?.memberName === 'string'
                    ? [{ memberId: a.memberId || '', memberName: a.memberName || '' }]
                    : []),
              notes: typeof a?.notes === 'string' ? a.notes.slice(0, 500) : ''
            }))
          : [];

        validatedSchedules.push({
          id,
          serviceType,
          serviceDate,
          praiseSongs,
          worshipSongs,
          praiseSongKeys: Array.isArray(sc.praiseSongKeys) ? sc.praiseSongKeys.map((k: any) => String(k || '').slice(0, 20)) : [],
          worshipSongKeys: Array.isArray(sc.worshipSongKeys) ? sc.worshipSongKeys.map((k: any) => String(k || '').slice(0, 20)) : [],
          ministryAssignments,
          notes: typeof sc.notes === 'string' ? sc.notes.slice(0, MAX_STRING_LENGTH) : '',
          updatedAt: typeof sc.updatedAt === 'string' ? sc.updatedAt : new Date().toISOString()
        });
      }
    }

    // 6. Labels Validation
    let validatedLabels: string[] | undefined = undefined;
    if (hasLabels) {
      if (Array.isArray(rawData.labels)) {
        const labelSet = new Set<string>();
        rawData.labels.forEach((l: any) => {
          if (typeof l === 'string' && l.trim()) {
            labelSet.add(l.trim().slice(0, 100));
          }
        });
        validatedLabels = Array.from(labelSet);
      } else {
        warnings.push('Labels property was not an array; preserved existing labels.');
      }
    }

    // 7. Song Families Validation
    let validatedFamilies: SongFamily[] | undefined = undefined;
    if (hasSongFamilies) {
      if (Array.isArray(rawData.songFamilies)) {
        validatedFamilies = [];
        const seenFamIds = new Set<string>();
        for (let i = 0; i < rawData.songFamilies.length; i++) {
          const f = rawData.songFamilies[i];
          if (!f || typeof f !== 'object') continue;
          const name = typeof f.name === 'string' ? f.name.trim().slice(0, 300) : '';
          if (!name) continue;

          let id = typeof f.id === 'string' && f.id.trim() ? f.id.trim().slice(0, 100) : `fam_${Date.now()}_${i}`;
          if (seenFamIds.has(id)) {
            id = `${id}_dup_${i}`;
          }
          seenFamIds.add(id);

          const versionIds = Array.isArray(f.versionIds)
            ? f.versionIds.filter((s: any) => typeof s === 'string').map((s: string) => s.slice(0, 100))
            : Array.isArray(f.songIds)
            ? f.songIds.filter((s: any) => typeof s === 'string').map((s: string) => s.slice(0, 100))
            : [];

          validatedFamilies.push({
            id,
            name,
            versionIds,
            ...(typeof f.originalSongId === 'string' ? { originalSongId: f.originalSongId.slice(0, 100) } : typeof f.defaultOriginalSongId === 'string' ? { originalSongId: f.defaultOriginalSongId.slice(0, 100) } : {}),
            ...(Array.isArray(f.versions) ? { versions: f.versions } : {}),
            ...(typeof f.notes === 'string' ? { notes: f.notes.slice(0, MAX_STRING_LENGTH) } : {}),
            createdAt: typeof f.createdAt === 'string' ? f.createdAt : new Date().toISOString(),
            updatedAt: typeof f.updatedAt === 'string' ? f.updatedAt : new Date().toISOString()
          });
        }
      }
    }

    // 8. Draft Schedule (Optional)
    let validatedDraft: any = undefined;
    if (hasDraftSchedule && rawData.draftSchedule && typeof rawData.draftSchedule === 'object') {
      validatedDraft = rawData.draftSchedule;
    }

    const envelope: ValidatedBackupEnvelope = {
      app: 'WWCF Santa Cruz Worship Ministry',
      version: typeof payload.version === 'string' ? payload.version : '1.0',
      exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : new Date().toISOString(),
      data: {
        ...(hasMembers && validatedMembers !== undefined ? { members: validatedMembers } : {}),
        ...(hasSongs && validatedSongs !== undefined ? { songs: validatedSongs } : {}),
        ...(hasSchedules && validatedSchedules !== undefined ? { schedules: validatedSchedules } : {}),
        ...(hasLabels && validatedLabels !== undefined ? { labels: validatedLabels } : {}),
        ...(hasSongFamilies && validatedFamilies !== undefined ? { songFamilies: validatedFamilies } : {}),
        ...(hasDraftSchedule && validatedDraft !== undefined ? { draftSchedule: validatedDraft } : {})
      },
      hasMembers,
      hasSongs,
      hasSchedules,
      hasLabels,
      hasSongFamilies,
      hasDraftSchedule
    };

    return {
      isValid: true,
      envelope,
      data: envelope.data,
      warnings
    };
  }
}
