/**
 * Central Version-Aware Backup Envelope Validator for WWCF Santa Cruz Worship Ministry Dashboard
 * 
 * Validates and migrates backup files, cloud sync payloads, and QR transfer data.
 * Guarantees structural integrity, schema compatibility, bounded limits, and identity safety.
 */

import {
  Member,
  Schedule,
  Song,
  SongFamily,
  SongCategory,
  SongVersionType,
  SongRelationshipType,
  ServiceType,
  ServiceUsageHistory,
  SongVersionRef,
  normalizeServiceType
} from '../types';

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
  'wwcf santa cruz worship ministry',
  'wwcf worship ministry dashboard',
  'wwcf santa cruz worship song line-up scheduler',
  'wwcf santa cruz - worship song line-up scheduler',
  'wwcf worship lineup scheduler'
];

const MAX_COLLECTION_ITEMS = 10000;
const MAX_NESTED_ITEMS = 1000;
const MAX_STRING_LENGTH = 5000;
const MAX_LYRICS_LENGTH = 20000;

const VALID_RELATIONSHIPS = new Set<SongRelationshipType>([
  'ORIGINAL',
  'COVER',
  'LIVE_VERSION',
  'ACOUSTIC_VERSION',
  'ALTERNATE_VERSION',
  'REMAKE',
  'VERSION',
  'UNKNOWN'
]);

export class BackupValidationService {
  /**
   * Validates and sanitizes a candidate backup envelope or raw church data object.
   */
  static validate(rawPayload: unknown): BackupValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
      return {
        isValid: false,
        error: 'Invalid payload: backup must be a valid JSON object.',
        errors: ['Invalid payload: backup must be a valid JSON object.'],
        warnings
      };
    }

    const payload = rawPayload as Record<string, any>;

    // 1. App identity check
    const rawAppName = typeof payload.app === 'string' ? payload.app.trim() : '';
    if (rawAppName) {
      const lowerApp = rawAppName.toLowerCase();
      const isKnown = SUPPORTED_APPS.some((app) => lowerApp === app || lowerApp.includes('wwcf'));
      if (!isKnown) {
        return {
          isValid: false,
          error: `Unsupported backup format: app identity "${rawAppName}" is not recognized.`,
          errors: [`Unsupported backup format: app identity "${rawAppName}" is not recognized.`],
          warnings
        };
      }
    } else {
      warnings.push('Backup app identity is missing; defaulting to canonical WWCF Santa Cruz format.');
    }

    // 2. Schema version check
    if (payload.version !== undefined && payload.version !== null) {
      const verStr = String(payload.version).trim();
      const major = parseInt(verStr.split('.')[0], 10);
      if (isNaN(major) || major !== 1) {
        return {
          isValid: false,
          error: `Unsupported backup schema version "${verStr}". Only version 1.x is currently supported.`,
          errors: [`Unsupported backup schema version "${verStr}". Only version 1.x is currently supported.`],
          warnings
        };
      }
    }

    // 3. Data envelope extraction
    const rawData =
      payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
        ? payload.data
        : payload;

    const hasMembers = 'members' in rawData && rawData.members !== undefined;
    const hasSongs = 'songs' in rawData && rawData.songs !== undefined;
    const hasSchedules = 'schedules' in rawData && rawData.schedules !== undefined;
    const hasLabels = 'labels' in rawData && rawData.labels !== undefined;
    const hasSongFamilies = 'songFamilies' in rawData && rawData.songFamilies !== undefined;
    const hasDraftSchedule =
      ('draftSchedule' in rawData && rawData.draftSchedule !== undefined) ||
      ('draft' in rawData && rawData.draft !== undefined);

    // At least one core collection must be present to be a valid backup
    if (!hasMembers && !hasSongs && !hasSchedules && !hasSongFamilies) {
      return {
        isValid: false,
        error: 'Backup payload contains no recognized church data collections (members, songs, schedules, or families).',
        errors: ['Backup payload contains no recognized church data collections.'],
        warnings
      };
    }

    // ID Remapping tables for duplicate resolution
    const memberIdRemap = new Map<string, string>();
    const songIdRemap = new Map<string, string>();

    // 4. Members Validation
    let validatedMembers: Member[] | undefined = undefined;
    if (hasMembers) {
      if (!Array.isArray(rawData.members)) {
        return {
          isValid: false,
          error: 'Corrupted backup: "members" property exists but is not an array.',
          errors: ['Corrupted backup: "members" property exists but is not an array.'],
          warnings
        };
      }
      if (rawData.members.length > MAX_COLLECTION_ITEMS) {
        return {
          isValid: false,
          error: `Collection size exceeded: members collection has ${rawData.members.length} items (limit: ${MAX_COLLECTION_ITEMS}).`,
          errors: [`Collection size exceeded: members collection has ${rawData.members.length} items (limit: ${MAX_COLLECTION_ITEMS}).`],
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

        const rawId = typeof m.id === 'string' && m.id.trim() ? m.id.trim().slice(0, 100) : `member_${Date.now()}_${i}`;
        let id = rawId;
        if (seenIds.has(id)) {
          id = `${rawId}_dup_${i}`;
          memberIdRemap.set(`${rawId}_index_${i}`, id);
          warnings.push(`Duplicate member ID "${rawId}" resolved to "${id}" for "${name}".`);
        }
        seenIds.add(id);

        const labels = Array.isArray(m.labels)
          ? m.labels
              .filter((l: any) => typeof l === 'string' && l.trim())
              .map((l: string) => l.trim().slice(0, 100))
          : [];

        // Disciplinary action validation
        let disciplinaryAction = undefined;
        if (m.disciplinaryAction && typeof m.disciplinaryAction === 'object') {
          const da = m.disciplinaryAction;
          disciplinaryAction = {
            status: da.status === 'cleared' ? ('cleared' as const) : ('active' as const),
            startDate: typeof da.startDate === 'string' ? da.startDate.slice(0, 30) : '',
            durationValue: typeof da.durationValue === 'number' && !isNaN(da.durationValue) ? da.durationValue : 0,
            durationType: ['days', 'weeks', 'months', 'years'].includes(da.durationType)
              ? da.durationType
              : 'months',
            endDate: typeof da.endDate === 'string' ? da.endDate.slice(0, 30) : '',
            ...(typeof da.reason === 'string' ? { reason: da.reason.slice(0, 500) } : {}),
            ...(typeof da.updatedAt === 'string' ? { updatedAt: da.updatedAt.slice(0, 50) } : {})
          };
        }

        validatedMembers.push({
          id,
          name,
          labels,
          ...(disciplinaryAction ? { disciplinaryAction } : {})
        });
      }
    }

    // 5. Songs Validation
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

        const rawId = typeof s.id === 'string' && s.id.trim() ? s.id.trim().slice(0, 100) : `song_${Date.now()}_${i}`;
        let id = rawId;
        if (seenIds.has(id)) {
          id = `${rawId}_dup_${i}`;
          songIdRemap.set(`${rawId}_index_${i}`, id);
          warnings.push(`Duplicate song ID "${rawId}" resolved to "${id}" for "${title}".`);
        }
        seenIds.add(id);

        const artist = typeof s.artist === 'string' && s.artist.trim() ? s.artist.trim().slice(0, 300) : 'Unknown Artist';
        const rawCat = typeof s.category === 'string' ? s.category.toLowerCase().trim() : 'praise';
        const category: SongCategory = rawCat === 'worship' ? 'worship' : rawCat === 'both' ? 'both' : 'praise';
        const versionType: SongVersionType = s.versionType === 'cover' ? 'cover' : 'original';

        // Relationship type
        let relationshipType: SongRelationshipType | undefined = undefined;
        if (typeof s.relationshipType === 'string' && VALID_RELATIONSHIPS.has(s.relationshipType as SongRelationshipType)) {
          relationshipType = s.relationshipType as SongRelationshipType;
        }

        // Service usage history
        const serviceHistory: ServiceUsageHistory[] = [];
        if (Array.isArray(s.serviceHistory)) {
          const sliceHist = s.serviceHistory.slice(0, MAX_NESTED_ITEMS);
          for (const sh of sliceHist) {
            if (sh && typeof sh === 'object' && typeof sh.date === 'string') {
              serviceHistory.push({
                date: sh.date.slice(0, 30),
                serviceType: normalizeServiceType(typeof sh.serviceType === 'string' ? sh.serviceType : 'Sunday Service'),
                ...(typeof sh.scheduleId === 'string' ? { scheduleId: sh.scheduleId.slice(0, 100) } : {})
              });
            }
          }
        }

        // Labels & themes
        const songLabels = Array.isArray(s.labels)
          ? s.labels.filter((l: any) => typeof l === 'string' && l.trim()).map((l: string) => l.trim().slice(0, 100))
          : undefined;
        const songThemes = Array.isArray(s.themes)
          ? s.themes.filter((t: any) => typeof t === 'string' && t.trim()).map((t: string) => t.trim().slice(0, 100))
          : undefined;
        const composers = Array.isArray(s.composers)
          ? s.composers.filter((c: any) => typeof c === 'string' && c.trim()).map((c: string) => c.trim().slice(0, 200))
          : undefined;

        // Bpm
        const bpm = typeof s.bpm === 'number' && !isNaN(s.bpm) && s.bpm > 0 && s.bpm < 400 ? Math.round(s.bpm) : undefined;

        validatedSongs.push({
          id,
          title,
          artist,
          category,
          versionType,
          language: typeof s.language === 'string' && s.language.trim() ? s.language.trim().slice(0, 50) : 'English',
          timesUsed: typeof s.timesUsed === 'number' && s.timesUsed >= 0 ? s.timesUsed : (typeof s.usageCount === 'number' && s.usageCount >= 0 ? s.usageCount : 0),
          dateAdded: typeof s.dateAdded === 'string' ? s.dateAdded.slice(0, 40) : new Date().toISOString(),
          serviceHistory,

          // Optional core fields
          ...(typeof s.key === 'string' && s.key.trim() ? { key: s.key.trim().slice(0, 20) } : {}),
          ...(typeof s.originalKey === 'string' && s.originalKey.trim() ? { originalKey: s.originalKey.trim().slice(0, 20) } : (typeof s.key === 'string' && s.key.trim() ? { originalKey: s.key.trim().slice(0, 20) } : {})),
          ...(bpm ? { bpm } : {}),
          ...(typeof s.timeSignature === 'string' && s.timeSignature.trim() ? { timeSignature: s.timeSignature.trim().slice(0, 20) } : {}),
          ...(typeof s.genre === 'string' && s.genre.trim() ? { genre: s.genre.trim().slice(0, 100) } : {}),
          ...(typeof s.album === 'string' && s.album.trim() ? { album: s.album.trim().slice(0, 200) } : {}),
          ...(typeof s.releaseYear === 'string' || typeof s.releaseYear === 'number' ? { releaseYear: String(s.releaseYear).trim().slice(0, 10) } : {}),
          ...(typeof s.duration === 'string' && s.duration.trim() ? { duration: s.duration.trim().slice(0, 20) } : {}),
          ...(typeof s.lastUsedDate === 'string' && s.lastUsedDate.trim() ? { lastUsedDate: s.lastUsedDate.trim().slice(0, 30) } : {}),

          // External URLs & identifiers
          ...(typeof s.youtubeUrl === 'string' && s.youtubeUrl.trim() ? { youtubeUrl: s.youtubeUrl.trim().slice(0, 1000) } : {}),
          ...(typeof s.youtubeId === 'string' && s.youtubeId.trim() ? { youtubeId: s.youtubeId.trim().slice(0, 50) } : {}),
          ...(typeof s.thumbnailUrl === 'string' && s.thumbnailUrl.trim() ? { thumbnailUrl: s.thumbnailUrl.trim().slice(0, 1000) } : {}),
          ...(typeof s.coverArtUrl === 'string' && s.coverArtUrl.trim() ? { coverArtUrl: s.coverArtUrl.trim().slice(0, 1000) } : {}),
          ...(typeof s.isrc === 'string' && s.isrc.trim() ? { isrc: s.isrc.trim().slice(0, 50) } : {}),
          ...(typeof s.spotifyUrl === 'string' && s.spotifyUrl.trim() ? { spotifyUrl: s.spotifyUrl.trim().slice(0, 1000) } : {}),
          ...(typeof s.appleMusicUrl === 'string' && s.appleMusicUrl.trim() ? { appleMusicUrl: s.appleMusicUrl.trim().slice(0, 1000) } : {}),
          ...(typeof s.qobuzUrl === 'string' && s.qobuzUrl.trim() ? { qobuzUrl: s.qobuzUrl.trim().slice(0, 1000) } : {}),
          ...(typeof s.tidalUrl === 'string' && s.tidalUrl.trim() ? { tidalUrl: s.tidalUrl.trim().slice(0, 1000) } : {}),
          ...(typeof s.geniusUrl === 'string' && s.geniusUrl.trim() ? { geniusUrl: s.geniusUrl.trim().slice(0, 1000) } : {}),

          // Lyrics & credits
          ...(typeof s.lyrics === 'string' && s.lyrics.trim() ? { lyrics: s.lyrics.trim().slice(0, MAX_LYRICS_LENGTH) } : {}),
          ...(typeof s.songwriters === 'string' && s.songwriters.trim() ? { songwriters: s.songwriters.trim().slice(0, 500) } : {}),
          ...(composers && composers.length > 0 ? { composers } : {}),
          ...(typeof s.originalArtist === 'string' && s.originalArtist.trim() ? { originalArtist: s.originalArtist.trim().slice(0, 300) } : {}),
          ...(typeof s.ccliNumber === 'string' && s.ccliNumber.trim() ? { ccliNumber: s.ccliNumber.trim().slice(0, 50) } : {}),
          ...(typeof s.notes === 'string' && s.notes.trim() ? { notes: s.notes.trim().slice(0, MAX_STRING_LENGTH) } : {}),

          // Family & relations
          ...(typeof s.songFamilyId === 'string' && s.songFamilyId.trim() ? { songFamilyId: s.songFamilyId.trim().slice(0, 100) } : {}),
          ...(relationshipType ? { relationshipType } : {}),
          ...(songLabels && songLabels.length > 0 ? { labels: songLabels } : {}),
          ...(songThemes && songThemes.length > 0 ? { themes: songThemes } : {})
        });
      }
    }

    // 6. Schedules Validation
    let validatedSchedules: Schedule[] | undefined = undefined;
    if (hasSchedules) {
      if (!Array.isArray(rawData.schedules)) {
        return {
          isValid: false,
          error: 'Corrupted backup: "schedules" property exists but is not an array.',
          errors: ['Corrupted backup: "schedules" property exists but is not an array.'],
          warnings
        };
      }
      if (rawData.schedules.length > MAX_COLLECTION_ITEMS) {
        return {
          isValid: false,
          error: `Collection size exceeded: schedules collection has ${rawData.schedules.length} items (limit: ${MAX_COLLECTION_ITEMS}).`,
          errors: [`Collection size exceeded: schedules collection has ${rawData.schedules.length} items (limit: ${MAX_COLLECTION_ITEMS}).`],
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

        // Normalize service type: converts legacy 'Youth Service' -> 'Youth Fellowship', 'Special Worship Event' -> 'Worship Event'
        const serviceType: ServiceType = normalizeServiceType(typeof sc.serviceType === 'string' ? sc.serviceType : 'Sunday Service');

        const praiseSongs = Array.isArray(sc.praiseSongs)
          ? sc.praiseSongs.filter((s: any) => typeof s === 'string').map((s: string) => s.slice(0, 400))
          : [];
        const worshipSongs = Array.isArray(sc.worshipSongs)
          ? sc.worshipSongs.filter((s: any) => typeof s === 'string').map((s: string) => s.slice(0, 400))
          : [];

        // Retain and sanitize praiseSongIds and worshipSongIds
        const praiseSongIds = Array.isArray(sc.praiseSongIds)
          ? sc.praiseSongIds.filter((s: any) => typeof s === 'string').map((s: string) => s.trim().slice(0, 100))
          : undefined;
        const worshipSongIds = Array.isArray(sc.worshipSongIds)
          ? sc.worshipSongIds.filter((s: any) => typeof s === 'string').map((s: string) => s.trim().slice(0, 100))
          : undefined;

        const ministryAssignments = Array.isArray(sc.ministryAssignments)
          ? sc.ministryAssignments.slice(0, MAX_NESTED_ITEMS).map((a: any, aIdx: number) => ({
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
          ...(praiseSongIds ? { praiseSongIds } : {}),
          ...(worshipSongIds ? { worshipSongIds } : {}),
          praiseSongKeys: Array.isArray(sc.praiseSongKeys) ? sc.praiseSongKeys.map((k: any) => String(k || '').slice(0, 20)) : [],
          worshipSongKeys: Array.isArray(sc.worshipSongKeys) ? sc.worshipSongKeys.map((k: any) => String(k || '').slice(0, 20)) : [],
          ministryAssignments,
          notes: typeof sc.notes === 'string' ? sc.notes.slice(0, MAX_STRING_LENGTH) : '',
          updatedAt: typeof sc.updatedAt === 'string' ? sc.updatedAt : new Date().toISOString()
        });
      }
    }

    // 7. Labels Validation
    let validatedLabels: string[] | undefined = undefined;
    if (hasLabels) {
      if (Array.isArray(rawData.labels)) {
        const labelSet = new Set<string>();
        rawData.labels.slice(0, MAX_COLLECTION_ITEMS).forEach((l: any) => {
          if (typeof l === 'string' && l.trim()) {
            labelSet.add(l.trim().slice(0, 100));
          }
        });
        validatedLabels = Array.from(labelSet);
      } else {
        warnings.push('Labels property was not an array; preserved existing labels.');
      }
    }

    // 8. Song Families Validation
    let validatedFamilies: SongFamily[] | undefined = undefined;
    if (hasSongFamilies) {
      if (Array.isArray(rawData.songFamilies)) {
        validatedFamilies = [];
        const seenFamIds = new Set<string>();
        const famList = rawData.songFamilies.slice(0, MAX_COLLECTION_ITEMS);

        for (let i = 0; i < famList.length; i++) {
          const f = famList[i];
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

          // Validate versions array
          const versions: SongVersionRef[] = [];
          if (Array.isArray(f.versions)) {
            for (const v of f.versions.slice(0, MAX_NESTED_ITEMS)) {
              if (v && typeof v === 'object' && typeof v.songId === 'string' && v.songId.trim()) {
                const rel: SongRelationshipType = VALID_RELATIONSHIPS.has(v.relationshipType)
                  ? v.relationshipType
                  : 'VERSION';
                versions.push({
                  songId: v.songId.trim().slice(0, 100),
                  relationshipType: rel,
                  ...(typeof v.notes === 'string' ? { notes: v.notes.slice(0, 500) } : {}),
                  ...(v.confidence === 'high' || v.confidence === 'medium' || v.confidence === 'low'
                    ? { confidence: v.confidence }
                    : {})
                });
              }
            }
          }

          validatedFamilies.push({
            id,
            name,
            versionIds,
            ...(typeof f.originalSongId === 'string'
              ? { originalSongId: f.originalSongId.slice(0, 100) }
              : typeof f.defaultOriginalSongId === 'string'
              ? { originalSongId: f.defaultOriginalSongId.slice(0, 100) }
              : {}),
            ...(versions.length > 0 ? { versions } : {}),
            ...(typeof f.notes === 'string' ? { notes: f.notes.slice(0, MAX_STRING_LENGTH) } : {}),
            createdAt: typeof f.createdAt === 'string' ? f.createdAt : new Date().toISOString(),
            updatedAt: typeof f.updatedAt === 'string' ? f.updatedAt : new Date().toISOString()
          });
        }
      }
    }

    // 9. Draft Schedule (Optional)
    let validatedDraft: any = undefined;
    const rawDraft = rawData.draftSchedule || rawData.draft;
    if (hasDraftSchedule && rawDraft && typeof rawDraft === 'object') {
      validatedDraft = rawDraft;
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

