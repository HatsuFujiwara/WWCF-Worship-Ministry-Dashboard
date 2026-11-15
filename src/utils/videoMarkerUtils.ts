import { SongVideoMarker } from '../types';
import { isSafeUrl } from './songReferenceUtils';

export const MAX_VIDEO_MARKERS_PER_SONG = 30;
export const MAX_VIDEO_MARKER_SECONDS = 86400;

/**
 * Parses a timestamp string ("1:32", "01:02:05", or "92") into integer seconds.
 * Rejects negative values, non-numeric text, and MM/SS >= 60 in clock notation.
 */
export function parseMarkerTimestamp(input: string): number | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const secs = parseInt(trimmed, 10);
    if (!Number.isFinite(secs) || secs < 0 || secs > MAX_VIDEO_MARKER_SECONDS) return null;
    return secs;
  }

  const parts = trimmed.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;

  const nums = parts.map((p) => parseInt(p, 10));
  if (parts.length === 2) {
    const [mins, secs] = nums;
    if (secs >= 60) return null;
    const total = mins * 60 + secs;
    return total <= MAX_VIDEO_MARKER_SECONDS ? total : null;
  }

  const [hrs, mins, secs] = nums;
  if (mins >= 60 || secs >= 60) return null;
  const total = hrs * 3600 + mins * 60 + secs;
  return total <= MAX_VIDEO_MARKER_SECONDS ? total : null;
}

export function formatMarkerTimestamp(timeSeconds: number): string {
  const safe = Math.max(0, Math.min(MAX_VIDEO_MARKER_SECONDS, Math.floor(timeSeconds || 0)));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function buildYouTubeTimestampUrl(
  youtubeUrl?: string,
  youtubeId?: string,
  timeSeconds = 0
): string | null {
  const cleanSec = Math.max(0, Math.min(MAX_VIDEO_MARKER_SECONDS, Math.floor(timeSeconds)));
  let candidate = '';

  if (youtubeUrl && isSafeUrl(youtubeUrl)) {
    candidate = youtubeUrl.trim();
  } else if (youtubeId && /^[a-zA-Z0-9_-]{11}$/.test(youtubeId.trim())) {
    candidate = `https://www.youtube.com/watch?v=${youtubeId.trim()}`;
  } else {
    return null;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (cleanSec > 0) {
      parsed.searchParams.set('t', `${cleanSec}s`);
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function sanitizeVideoMarker(raw: unknown, index = 0): SongVideoMarker | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const label = typeof r.label === 'string' ? r.label.trim().slice(0, 80) : '';
  if (!label) return null;

  let timeSeconds: number | null = null;
  if (typeof r.timeSeconds === 'number' && Number.isFinite(r.timeSeconds)) {
    const rounded = Math.round(r.timeSeconds);
    if (rounded >= 0 && rounded <= MAX_VIDEO_MARKER_SECONDS) {
      timeSeconds = rounded;
    }
  } else if (typeof r.timeSeconds === 'string') {
    timeSeconds = parseMarkerTimestamp(r.timeSeconds);
  }

  if (timeSeconds === null) return null;

  const id =
    typeof r.id === 'string' && r.id.trim()
      ? r.id.trim().slice(0, 100)
      : `marker_${index + 1}_${timeSeconds}`;

  return {
    id,
    label,
    timeSeconds
  };
}

export function sanitizeVideoMarkers(rawMarkers: unknown): SongVideoMarker[] | undefined {
  if (!Array.isArray(rawMarkers)) return undefined;
  const valid = rawMarkers
    .slice(0, MAX_VIDEO_MARKERS_PER_SONG)
    .map((m, i) => sanitizeVideoMarker(m, i))
    .filter((m): m is SongVideoMarker => m !== null)
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
  return valid.length > 0 ? valid : undefined;
}

export function validateVideoMarkers(
  rawMarkers: unknown,
  songTitle: string
): { valid: SongVideoMarker[] | undefined; error?: string } {
  if (rawMarkers === undefined || rawMarkers === null) {
    return { valid: undefined };
  }
  if (!Array.isArray(rawMarkers)) {
    return {
      valid: undefined,
      error: `Video markers for "${songTitle}" must be an array.`
    };
  }
  if (rawMarkers.length > MAX_VIDEO_MARKERS_PER_SONG) {
    return {
      valid: undefined,
      error: `Song "${songTitle}" has ${rawMarkers.length} video markers (limit: ${MAX_VIDEO_MARKERS_PER_SONG}).`
    };
  }

  const valid: SongVideoMarker[] = [];
  for (let i = 0; i < rawMarkers.length; i++) {
    const raw = rawMarkers[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {
        valid: undefined,
        error: `Video marker #${i + 1} for "${songTitle}" is malformed.`
      };
    }
    const r = raw as Record<string, unknown>;
    const label = typeof r.label === 'string' ? r.label.trim() : '';
    if (!label) {
      return {
        valid: undefined,
        error: `Video marker #${i + 1} for "${songTitle}" requires a section label.`
      };
    }
    if (label.length > 80) {
      return {
        valid: undefined,
        error: `Video marker #${i + 1} label for "${songTitle}" exceeds 80 characters.`
      };
    }
    const sec =
      typeof r.timeSeconds === 'number' && Number.isFinite(r.timeSeconds)
        ? Math.round(r.timeSeconds)
        : typeof r.timeSeconds === 'string'
        ? parseMarkerTimestamp(r.timeSeconds)
        : null;
    if (sec === null || sec < 0 || sec > MAX_VIDEO_MARKER_SECONDS) {
      return {
        valid: undefined,
        error: `Video marker "${label}" for "${songTitle}" has an invalid timestamp.`
      };
    }
    const sanitized = sanitizeVideoMarker({ ...r, label, timeSeconds: sec }, i);
    if (sanitized) valid.push(sanitized);
  }

  valid.sort((a, b) => a.timeSeconds - b.timeSeconds);
  return { valid: valid.length > 0 ? valid : undefined };
}
