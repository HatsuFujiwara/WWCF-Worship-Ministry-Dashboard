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
  LineupTemplate,
  MemberAvailability,
  SongFamiliarity,
  normalizeServiceType
} from '../types';
import { sanitizeLineupTemplate } from './templateService';
import { validateMemberAvailabilityRecord } from './availabilityService';
import { validateSongFamiliarityRecord } from './familiarityService';
import { validateInstrumentCharts } from '../utils/chordChartUtils';
import { validateVideoMarkers } from '../utils/videoMarkerUtils';

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
    templates?: LineupTemplate[];
    memberAvailability?: MemberAvailability[];
    songFamiliarity?: SongFamiliarity[];
  };
  hasMembers: boolean;
  hasSongs: boolean;
  hasSchedules: boolean;
  hasLabels: boolean;
  hasSongFamilies: boolean;
  hasDraftSchedule: boolean;
  hasTemplates?: boolean;
  hasMemberAvailability?: boolean;
  hasSongFamiliarity?: boolean;
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
const MAX_LABEL_LENGTH = 100;

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
    const hasTemplates = 'templates' in rawData && rawData.templates !== undefined;
    const hasMemberAvailability = 'memberAvailability' in rawData && rawData.memberAvailability !== undefined;
    const hasSongFamiliarity = 'songFamiliarity' in rawData && rawData.songFamiliarity !== undefined;

    // At least one core collection must be present to be a valid backup
    if (!hasMembers && !hasSongs && !hasSchedules && !hasSongFamilies && !hasTemplates) {
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
        if (typeof s.lyrics === 'string' && s.lyrics.trim().length > MAX_LYRICS_LENGTH) {
          return {
            isValid: false,
            error: `Lyrics for "${title}" exceed the ${MAX_LYRICS_LENGTH.toLocaleString()}-character maximum.`,
            errors: [`Lyrics for "${title}" exceed the ${MAX_LYRICS_LENGTH.toLocaleString()}-character maximum.`],
            warnings
          };
        }
        const chartCheck = validateInstrumentCharts(s.instrumentCharts, title);
        if (chartCheck.error) {
          return {
            isValid: false,
            error: chartCheck.error,
            errors: [chartCheck.error],
            warnings
          };
        }
        const markerCheck = validateVideoMarkers(s.videoMarkers, title);
        if (markerCheck.error) {
          return {
            isValid: false,
            error: markerCheck.error,
            errors: [markerCheck.error],
            warnings
          };
        }
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
          if (s.serviceHistory.length > MAX_NESTED_ITEMS) {
            return {
              isValid: false,
              error: `Service history for "${title}" has ${s.serviceHistory.length} entries (limit: ${MAX_NESTED_ITEMS}).`,
              errors: [`Service history for "${title}" exceeds limit of ${MAX_NESTED_ITEMS} items.`],
              warnings
            };
          }
          for (const sh of s.serviceHistory) {
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
          ...(typeof s.lyrics === 'string' && s.lyrics.trim() ? { lyrics: s.lyrics.trim() } : {}),
          ...(typeof s.songwriters === 'string' && s.songwriters.trim() ? { songwriters: s.songwriters.trim().slice(0, 500) } : {}),
          ...(composers && composers.length > 0 ? { composers } : {}),
          ...(typeof s.originalArtist === 'string' && s.originalArtist.trim() ? { originalArtist: s.originalArtist.trim().slice(0, 300) } : {}),
          ...(typeof s.ccliNumber === 'string' && s.ccliNumber.trim() ? { ccliNumber: s.ccliNumber.trim().slice(0, 50) } : {}),
          ...(typeof s.notes === 'string' && s.notes.trim() ? { notes: s.notes.trim().slice(0, MAX_STRING_LENGTH) } : {}),

          // Family & relations
          ...(typeof s.songFamilyId === 'string' && s.songFamilyId.trim() ? { songFamilyId: s.songFamilyId.trim().slice(0, 100) } : {}),
          ...(relationshipType ? { relationshipType } : {}),
          ...(songLabels && songLabels.length > 0 ? { labels: songLabels } : {}),
          ...(songThemes && songThemes.length > 0 ? { themes: songThemes } : {}),

          // Arrangement & Variant Tracking
          ...(typeof s.arrangementName === 'string' && s.arrangementName.trim() ? { arrangementName: s.arrangementName.trim().slice(0, 200) } : {}),
          ...(typeof s.capo === 'number' && !isNaN(s.capo) && s.capo >= 0 && s.capo <= 24 ? { capo: Math.round(s.capo) } : (typeof s.capo === 'string' && !isNaN(Number(s.capo)) && Number(s.capo) >= 0 && Number(s.capo) <= 24 ? { capo: Math.round(Number(s.capo)) } : {})),
          ...(typeof s.tuning === 'string' && s.tuning.trim() ? { tuning: s.tuning.trim().slice(0, 100) } : {}),
          ...(typeof s.rehearsalNotes === 'string' && s.rehearsalNotes.trim() ? { rehearsalNotes: s.rehearsalNotes.trim().slice(0, MAX_STRING_LENGTH) } : {}),
          ...(chartCheck.valid ? { instrumentCharts: chartCheck.valid } : {}),
          ...(markerCheck.valid ? { videoMarkers: markerCheck.valid } : {})
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

        if (Array.isArray(sc.ministryAssignments) && sc.ministryAssignments.length > MAX_NESTED_ITEMS) {
          return {
            isValid: false,
            error: `Ministry assignments for schedule "${serviceDate}" exceed the limit of ${MAX_NESTED_ITEMS} items.`,
            errors: [`Ministry assignments for schedule "${serviceDate}" exceed limit of ${MAX_NESTED_ITEMS}.`],
            warnings
          };
        }

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
          ...(praiseSongIds ? { praiseSongIds } : {}),
          ...(worshipSongIds ? { worshipSongIds } : {}),
          praiseSongKeys: Array.isArray(sc.praiseSongKeys) ? sc.praiseSongKeys.map((k: any) => String(k || '').slice(0, 20)) : [],
          worshipSongKeys: Array.isArray(sc.worshipSongKeys) ? sc.worshipSongKeys.map((k: any) => String(k || '').slice(0, 20)) : [],
          ministryAssignments,
          notes: typeof sc.notes === 'string' ? sc.notes.slice(0, MAX_STRING_LENGTH) : '',
          ...(sc.transitionNotes && typeof sc.transitionNotes === 'object' && !Array.isArray(sc.transitionNotes)
            ? {
                transitionNotes: Object.entries(sc.transitionNotes).reduce((acc: Record<string, string>, [k, v]) => {
                  if (typeof v === 'string') acc[String(k).slice(0, 100)] = v.slice(0, 1000);
                  return acc;
                }, {})
              }
            : {}),
          ...(sc.rehearsalChecklist && typeof sc.rehearsalChecklist === 'object'
            ? {
                rehearsalChecklist: {
                  songSelectionFinalized: sc.rehearsalChecklist.songSelectionFinalized === true,
                  performedKeysChecked: sc.rehearsalChecklist.performedKeysChecked === true,
                  lyricsReviewed: sc.rehearsalChecklist.lyricsReviewed === true,
                  referencesChecked: sc.rehearsalChecklist.referencesChecked === true,
                  teamAssignmentsFinalized: sc.rehearsalChecklist.teamAssignmentsFinalized === true,
                  transitionsPrepared: sc.rehearsalChecklist.transitionsPrepared === true,
                  updatedAt: typeof sc.rehearsalChecklist.updatedAt === 'string' ? sc.rehearsalChecklist.updatedAt : undefined
                }
              }
            : {}),
          ...(sc.noService === true ? { noService: true } : {}),
          ...(sc.noService === true && typeof sc.noServiceReason === 'string' && sc.noServiceReason.trim() ? { noServiceReason: sc.noServiceReason.trim().slice(0, 1000) } : {}),
          updatedAt: typeof sc.updatedAt === 'string' ? sc.updatedAt : new Date().toISOString()
        });
      }
    }

    // 7. Labels Validation
    let validatedLabels: string[] | undefined = undefined;
    if (hasLabels) {
      if (!Array.isArray(rawData.labels)) {
        return {
          isValid: false,
          error: 'Corrupted backup: "labels" property exists but is not an array.',
          errors: ['Corrupted backup: "labels" property exists but is not an array.'],
          warnings
        };
      }
      if (rawData.labels.length > MAX_COLLECTION_ITEMS) {
        return {
          isValid: false,
          error: `Collection size exceeded: labels collection has ${rawData.labels.length} items (limit: ${MAX_COLLECTION_ITEMS}).`,
          errors: [`Collection size exceeded: labels collection has ${rawData.labels.length} items (limit: ${MAX_COLLECTION_ITEMS}).`],
          warnings
        };
      }
      const labelSet = new Set<string>();
      for (let i = 0; i < rawData.labels.length; i++) {
        const l = rawData.labels[i];
        if (typeof l !== 'string') {
          return {
            isValid: false,
            error: `Invalid label at index ${i}: each label must be a string.`,
            errors: [`Invalid label at index ${i}: each label must be a string.`],
            warnings
          };
        }
        const trimmedLabel = l.trim();
        if (trimmedLabel.length > MAX_LABEL_LENGTH) {
          return {
            isValid: false,
            error: `Label "${trimmedLabel.slice(0, 32)}..." exceeds the ${MAX_LABEL_LENGTH}-character maximum (${trimmedLabel.length} characters).`,
            errors: [`Label exceeds the ${MAX_LABEL_LENGTH}-character maximum.`],
            warnings
          };
        }
        if (trimmedLabel) {
          labelSet.add(trimmedLabel);
        }
      }
      validatedLabels = Array.from(labelSet);
    }

    // 8. Song Families Validation
    let validatedFamilies: SongFamily[] | undefined = undefined;
    if (hasSongFamilies) {
      if (!Array.isArray(rawData.songFamilies)) {
        return {
          isValid: false,
          error: 'Corrupted backup: "songFamilies" property exists but is not an array.',
          errors: ['Corrupted backup: "songFamilies" property exists but is not an array.'],
          warnings
        };
      }
      if (rawData.songFamilies.length > MAX_COLLECTION_ITEMS) {
        return {
          isValid: false,
          error: `Collection size exceeded: songFamilies collection has ${rawData.songFamilies.length} items (limit: ${MAX_COLLECTION_ITEMS}).`,
          errors: [`Collection size exceeded: songFamilies collection has ${rawData.songFamilies.length} items (limit: ${MAX_COLLECTION_ITEMS}).`],
          warnings
        };
      }

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

        // Validate versions array without silent truncation
        const versions: SongVersionRef[] = [];
        if (Array.isArray(f.versions)) {
          if (f.versions.length > MAX_NESTED_ITEMS) {
            return {
              isValid: false,
              error: `Song family "${name}" versions exceed the limit of ${MAX_NESTED_ITEMS} items.`,
              errors: [`Song family "${name}" versions exceed limit of ${MAX_NESTED_ITEMS}.`],
              warnings
            };
          }
          for (const v of f.versions) {
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

    // 9. Draft Schedule (Optional)
    let validatedDraft: any = undefined;
    const rawDraft = rawData.draftSchedule !== undefined ? rawData.draftSchedule : rawData.draft;
    if (hasDraftSchedule && rawDraft !== null) {
      if (typeof rawDraft !== 'object' || Array.isArray(rawDraft)) {
        return {
          isValid: false,
          error: 'Corrupted backup: "draftSchedule" property exists but is not a valid object.',
          errors: ['Corrupted backup: "draftSchedule" property exists but is not a valid object.'],
          warnings
        };
      }
      validatedDraft = BackupValidationService.sanitizeDraftSchedule(rawDraft);
    }

    // 10. Templates (Optional - L-01)
    let validatedTemplates: LineupTemplate[] | undefined = undefined;
    if (hasTemplates) {
      if (!Array.isArray(rawData.templates)) {
        return {
          isValid: false,
          error: 'Corrupted backup: "templates" property exists but is not an array.',
          errors: ['Corrupted backup: "templates" property exists but is not an array.'],
          warnings
        };
      }
      if (rawData.templates.length > MAX_COLLECTION_ITEMS) {
        return {
          isValid: false,
          error: `Collection size exceeded: templates collection has ${rawData.templates.length} items (limit: ${MAX_COLLECTION_ITEMS}).`,
          errors: [`Collection size exceeded: templates collection has ${rawData.templates.length} items (limit: ${MAX_COLLECTION_ITEMS}).`],
          warnings
        };
      }
      validatedTemplates = rawData.templates
        .map((t: any, idx: number) => sanitizeLineupTemplate(t, idx))
        .filter((t): t is LineupTemplate => t !== null);
    }

    // 11. Member Availability (Optional - L-02)
    let validatedAvailability: MemberAvailability[] | undefined = undefined;
    if (hasMemberAvailability) {
      if (!Array.isArray(rawData.memberAvailability)) {
        return {
          isValid: false,
          error: 'Corrupted backup: "memberAvailability" property exists but is not an array.',
          errors: ['Corrupted backup: "memberAvailability" property exists but is not an array.'],
          warnings
        };
      }
      if (rawData.memberAvailability.length > MAX_COLLECTION_ITEMS) {
        return {
          isValid: false,
          error: `Collection size exceeded: memberAvailability collection has ${rawData.memberAvailability.length} items (limit: ${MAX_COLLECTION_ITEMS}).`,
          errors: [`Collection size exceeded: memberAvailability collection has ${rawData.memberAvailability.length} items (limit: ${MAX_COLLECTION_ITEMS}).`],
          warnings
        };
      }
      validatedAvailability = [];
      for (let i = 0; i < rawData.memberAvailability.length; i++) {
        const res = validateMemberAvailabilityRecord(rawData.memberAvailability[i], i);
        if (!res.valid) {
          return {
            isValid: false,
            error: res.error || `Invalid memberAvailability record at index ${i}.`,
            errors: [res.error || `Invalid memberAvailability record at index ${i}.`],
            warnings
          };
        }
        validatedAvailability.push(res.valid);
      }
    }

    // 12. Song Familiarity (Optional - L-03)
    let validatedFamiliarity: SongFamiliarity[] | undefined = undefined;
    if (hasSongFamiliarity) {
      if (!Array.isArray(rawData.songFamiliarity)) {
        return {
          isValid: false,
          error: 'Corrupted backup: "songFamiliarity" property exists but is not an array.',
          errors: ['Corrupted backup: "songFamiliarity" property exists but is not an array.'],
          warnings
        };
      }
      if (rawData.songFamiliarity.length > MAX_COLLECTION_ITEMS) {
        return {
          isValid: false,
          error: `Collection size exceeded: songFamiliarity collection has ${rawData.songFamiliarity.length} items (limit: ${MAX_COLLECTION_ITEMS}).`,
          errors: [`Collection size exceeded: songFamiliarity collection has ${rawData.songFamiliarity.length} items (limit: ${MAX_COLLECTION_ITEMS}).`],
          warnings
        };
      }
      validatedFamiliarity = [];
      for (let i = 0; i < rawData.songFamiliarity.length; i++) {
        const res = validateSongFamiliarityRecord(rawData.songFamiliarity[i], i);
        if (!res.valid) {
          return {
            isValid: false,
            error: res.error || `Invalid songFamiliarity record at index ${i}.`,
            errors: [res.error || `Invalid songFamiliarity record at index ${i}.`],
            warnings
          };
        }
        validatedFamiliarity.push(res.valid);
      }
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
        ...(hasDraftSchedule && validatedDraft !== undefined ? { draftSchedule: validatedDraft } : {}),
        ...(hasTemplates && validatedTemplates !== undefined ? { templates: validatedTemplates } : {}),
        ...(hasMemberAvailability && validatedAvailability !== undefined ? { memberAvailability: validatedAvailability } : {}),
        ...(hasSongFamiliarity && validatedFamiliarity !== undefined ? { songFamiliarity: validatedFamiliarity } : {})
      },
      hasMembers,
      hasSongs,
      hasSchedules,
      hasLabels,
      hasSongFamilies,
      hasDraftSchedule,
      hasTemplates: Boolean(hasTemplates && validatedTemplates !== undefined),
      hasMemberAvailability: Boolean(hasMemberAvailability && validatedAvailability !== undefined),
      hasSongFamiliarity: Boolean(hasSongFamiliarity && validatedFamiliarity !== undefined)
    };

    return {
      isValid: true,
      envelope,
      data: envelope.data,
      warnings
    };
  }

  static sanitizeDraftSchedule(rawDraft: any): any | null {
    if (!rawDraft || typeof rawDraft !== 'object') return null;

    const version = 2;
    const editingScheduleId =
      rawDraft.editingScheduleId !== undefined && rawDraft.editingScheduleId !== null
        ? (typeof rawDraft.editingScheduleId === 'string' && rawDraft.editingScheduleId.trim() ? rawDraft.editingScheduleId.trim().slice(0, 100) : null)
        : (typeof rawDraft.id === 'string' && rawDraft.id.trim() ? rawDraft.id.trim().slice(0, 100) : null);

    const savedAt = typeof rawDraft.savedAt === 'string' ? rawDraft.savedAt : new Date().toISOString();
    const serviceType: ServiceType = normalizeServiceType(typeof rawDraft.serviceType === 'string' ? rawDraft.serviceType : 'Sunday Service');
    const serviceDate = typeof rawDraft.serviceDate === 'string' ? rawDraft.serviceDate.trim().slice(0, 20) : '';

    const praiseSongs = Array.isArray(rawDraft.praiseSongs)
      ? rawDraft.praiseSongs.slice(0, MAX_NESTED_ITEMS).map((s: any) => (typeof s === 'string' ? s.slice(0, 400) : ''))
      : [''];
    const worshipSongs = Array.isArray(rawDraft.worshipSongs)
      ? rawDraft.worshipSongs.slice(0, MAX_NESTED_ITEMS).map((s: any) => (typeof s === 'string' ? s.slice(0, 400) : ''))
      : [''];

    const praiseSongKeys = Array.isArray(rawDraft.praiseSongKeys)
      ? rawDraft.praiseSongKeys.slice(0, MAX_NESTED_ITEMS).map((k: any) => String(k || '').slice(0, 20))
      : [];
    const worshipSongKeys = Array.isArray(rawDraft.worshipSongKeys)
      ? rawDraft.worshipSongKeys.slice(0, MAX_NESTED_ITEMS).map((k: any) => String(k || '').slice(0, 20))
      : [];

    const praiseSongIds = Array.isArray(rawDraft.praiseSongIds)
      ? rawDraft.praiseSongIds.slice(0, MAX_NESTED_ITEMS).map((id: any) => (typeof id === 'string' && id.trim() ? id.trim().slice(0, 100) : undefined))
      : undefined;
    const worshipSongIds = Array.isArray(rawDraft.worshipSongIds)
      ? rawDraft.worshipSongIds.slice(0, MAX_NESTED_ITEMS).map((id: any) => (typeof id === 'string' && id.trim() ? id.trim().slice(0, 100) : undefined))
      : undefined;

    const ministryAssignments = Array.isArray(rawDraft.ministryAssignments)
      ? rawDraft.ministryAssignments.slice(0, MAX_NESTED_ITEMS).map((a: any, aIdx: number) => {
          let role = typeof a?.role === 'string' ? a.role.slice(0, 100) : 'Ministry Role';
          if (role === 'Song Lead') role = 'Song Leader';
          if (role === 'Multimedia') role = 'Lyricist';
          return {
            id: typeof a?.id === 'string' ? a.id.slice(0, 100) : `assign_${aIdx}`,
            role,
            assignedMembers: Array.isArray(a?.assignedMembers)
              ? a.assignedMembers.map((am: any) => ({
                  memberId: typeof am?.memberId === 'string' ? am.memberId.slice(0, 100) : '',
                  memberName: typeof am?.memberName === 'string' ? am.memberName.slice(0, 200) : ''
                }))
              : (typeof a?.memberId === 'string' || typeof a?.memberName === 'string'
                  ? [{ memberId: a.memberId || '', memberName: a.memberName || '' }]
                  : []),
            notes: typeof a?.notes === 'string' ? a.notes.slice(0, 500) : ''
          };
        })
      : [];

    const notes = typeof rawDraft.notes === 'string' ? rawDraft.notes.slice(0, MAX_STRING_LENGTH) : '';

    const transitionNotes =
      rawDraft.transitionNotes && typeof rawDraft.transitionNotes === 'object' && !Array.isArray(rawDraft.transitionNotes)
        ? Object.entries(rawDraft.transitionNotes).reduce((acc: Record<string, string>, [k, v]) => {
            if (typeof v === 'string') acc[String(k).slice(0, 200)] = v.slice(0, 1000);
            return acc;
          }, {})
        : {};

    const rehearsalChecklist =
      rawDraft.rehearsalChecklist && typeof rawDraft.rehearsalChecklist === 'object'
        ? {
            songSelectionFinalized: rawDraft.rehearsalChecklist.songSelectionFinalized === true,
            performedKeysChecked: rawDraft.rehearsalChecklist.performedKeysChecked === true,
            lyricsReviewed: rawDraft.rehearsalChecklist.lyricsReviewed === true,
            referencesChecked: rawDraft.rehearsalChecklist.referencesChecked === true,
            teamAssignmentsFinalized: rawDraft.rehearsalChecklist.teamAssignmentsFinalized === true,
            transitionsPrepared: rawDraft.rehearsalChecklist.transitionsPrepared === true,
            updatedAt: typeof rawDraft.rehearsalChecklist.updatedAt === 'string' ? rawDraft.rehearsalChecklist.updatedAt : undefined
          }
        : undefined;

    return {
      version,
      editingScheduleId,
      savedAt,
      serviceType,
      serviceDate,
      praiseSongs: praiseSongs.length > 0 ? praiseSongs : [''],
      worshipSongs: worshipSongs.length > 0 ? worshipSongs : [''],
      praiseSongKeys,
      worshipSongKeys,
      ...(praiseSongIds ? { praiseSongIds } : {}),
      ...(worshipSongIds ? { worshipSongIds } : {}),
      ministryAssignments,
      notes,
      transitionNotes,
      ...(rawDraft.noService === true ? { noService: true } : {}),
      ...(rawDraft.noService === true && typeof rawDraft.noServiceReason === 'string' && rawDraft.noServiceReason.trim() ? { noServiceReason: rawDraft.noServiceReason.trim().slice(0, 1000) } : {}),
      ...(rehearsalChecklist ? { rehearsalChecklist } : {})
    };
  }
}

