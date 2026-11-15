import { Song } from '../types';
import { resolveSlotSong } from './songResolveUtils';

/**
 * Strict duration parser for song durations.
 * Supports:
 * - Clock formats: 'M:SS', 'MM:SS', 'H:MM:SS' (seconds and minutes strictly < 60)
 * - Standalone text: '5m', '90m' (long minutes allowed), '45s', '1h'
 * - Compound text: '4m 32s', '1h 15m', '1h 15m 30s' (compound seconds < 60, compound minutes < 60)
 * - Raw positive integer seconds
 * Rejects negative, zero, malformed, or compound overflow (e.g. '4m90s', '1h90m').
 */
export function parseDurationToSeconds(durationStr?: string | null): number | null {
  if (!durationStr || typeof durationStr !== 'string') return null;
  const clean = durationStr.trim();
  if (!clean) return null;

  // 1. Clock format: H:MM:SS or M:SS
  const clockMatch = clean.match(/^(?:(?:(\d+):)?([0-5]?\d):([0-5]\d))$/);
  if (clockMatch) {
    const hours = clockMatch[1] ? parseInt(clockMatch[1], 10) : 0;
    const minutes = parseInt(clockMatch[2], 10);
    const seconds = parseInt(clockMatch[3], 10);
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null;
    const total = hours * 3600 + minutes * 60 + seconds;
    return total > 0 ? total : null;
  }

  // 2. Standalone minutes (e.g. "5m", "90m", "120 mins")
  const standaloneMinMatch = clean.match(/^(\d+)\s*(?:m|min|mins|minutes?)$/i);
  if (standaloneMinMatch) {
    const minutes = parseInt(standaloneMinMatch[1], 10);
    if (isNaN(minutes) || minutes <= 0) return null;
    const total = minutes * 60;
    return total < 86400 ? total : null;
  }

  // 3. Standalone hours (e.g. "1h", "2 hrs")
  const standaloneHrMatch = clean.match(/^(\d+)\s*(?:h|hr|hrs|hours?)$/i);
  if (standaloneHrMatch) {
    const hours = parseInt(standaloneHrMatch[1], 10);
    if (isNaN(hours) || hours <= 0) return null;
    const total = hours * 3600;
    return total < 86400 ? total : null;
  }

  // 4. Standalone seconds (e.g. "45s", "120 secs")
  const standaloneSecMatch = clean.match(/^(\d+)\s*(?:s|sec|secs|seconds?)$/i);
  if (standaloneSecMatch) {
    const seconds = parseInt(standaloneSecMatch[1], 10);
    if (isNaN(seconds) || seconds <= 0) return null;
    return seconds < 86400 ? seconds : null;
  }

  // 5. Compound text format: e.g. "1h 15m 30s", "4m 32s", "1h 30m"
  const compoundMatch = clean.match(/^(?:(\d+)\s*(?:h|hr|hours?))?\s*(?:(\d+)\s*(?:m|min|mins?))?\s*(?:(\d+)\s*(?:s|sec|secs?))?$/i);
  if (compoundMatch) {
    const hours = compoundMatch[1] ? parseInt(compoundMatch[1], 10) : 0;
    const minutes = compoundMatch[2] ? parseInt(compoundMatch[2], 10) : 0;
    const seconds = compoundMatch[3] ? parseInt(compoundMatch[3], 10) : 0;

    const hasHours = compoundMatch[1] !== undefined;
    const hasMinutes = compoundMatch[2] !== undefined;
    const hasSeconds = compoundMatch[3] !== undefined;

    // Enforce strict non-overflow for compound forms:
    // If minutes or hours were specified in a compound string, seconds must be < 60
    if ((hasHours || hasMinutes) && hasSeconds && seconds >= 60) {
      return null; // Reject compound overflow like "4m90s", "0m90s"
    }
    // If hours were specified, minutes must be < 60
    if (hasHours && hasMinutes && minutes >= 60) {
      return null; // Reject compound overflow like "1h90m", "0h90m"
    }

    const total = hours * 3600 + minutes * 60 + seconds;
    return total > 0 && total < 86400 ? total : null;
  }

  // 6. Raw seconds integer
  if (/^\d+$/.test(clean)) {
    const val = parseInt(clean, 10);
    return val > 0 && val < 86400 ? val : null;
  }

  return null;
}

/**
 * Formats total seconds into human-readable duration:
 * e.g., "24m 15s" or "1h 05m 20s"
 */
export function formatSecondsToDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return '0m 00s';
  const hours = Math.floor(totalSeconds / 3600);
  const remaining = totalSeconds % 3600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  const padSec = String(seconds).padStart(2, '0');

  if (hours > 0) {
    const padMin = String(minutes).padStart(2, '0');
    return `${hours}h ${padMin}m ${padSec}s`;
  }
  return `${minutes}m ${padSec}s`;
}

export interface LineupDurationSummary {
  totalSeconds: number;
  formattedDuration: string;
  totalSongs: number;
  knownCount: number;
  unknownCount: number;
  hasUnknowns: boolean;
  summaryLabel: string;
}

/**
 * Calculates total setlist duration across ordered praise and worship songs.
 * Uses strict ID-authoritative slot resolution (stale IDs remain unknown, duplicate no-ID titles remain ambiguous).
 * Never invents, averages, or estimates missing song durations.
 */
export function calculateLineupDuration(
  songTitles: string[],
  songIds: (string | undefined)[],
  allSongs: Song[]
): LineupDurationSummary {
  const cleanEntries: { title: string; id?: string }[] = [];
  songTitles.forEach((t, idx) => {
    const title = (t || '').trim();
    if (title) {
      cleanEntries.push({ title, id: songIds[idx] });
    }
  });

  let totalSeconds = 0;
  let knownCount = 0;
  let unknownCount = 0;

  cleanEntries.forEach((entry) => {
    const { song: matched } = resolveSlotSong(entry.title, entry.id, allSongs);

    const durationSec = parseDurationToSeconds(matched?.duration);
    if (durationSec !== null && durationSec > 0) {
      totalSeconds += durationSec;
      knownCount++;
    } else {
      unknownCount++;
    }
  });

  const totalSongs = cleanEntries.length;
  const formattedDuration = formatSecondsToDuration(totalSeconds);

  let summaryLabel = 'Duration unavailable';
  if (totalSongs === 0) {
    summaryLabel = 'No songs in lineup';
  } else if (knownCount === 0) {
    summaryLabel = `Duration unavailable (${totalSongs} song${totalSongs > 1 ? 's' : ''}, no timings recorded)`;
  } else if (unknownCount === 0) {
    summaryLabel = `${formattedDuration} (${totalSongs} song${totalSongs > 1 ? 's' : ''})`;
  } else {
    summaryLabel = `${formattedDuration} (${knownCount} of ${totalSongs} songs, ${unknownCount} unknown)`;
  }

  return {
    totalSeconds,
    formattedDuration,
    totalSongs,
    knownCount,
    unknownCount,
    hasUnknowns: unknownCount > 0,
    summaryLabel
  };
}
