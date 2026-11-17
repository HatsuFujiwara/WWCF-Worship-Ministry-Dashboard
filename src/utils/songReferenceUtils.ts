import { Schedule, Song, getAssignmentMembers } from '../types';
import { formatDateDisplayManila } from './dateUtils';
import { resolveScheduleSongTitles, resolveSlotSong } from './songResolveUtils';
import { calculateLineupDuration } from './durationUtils';
import { isNoServiceSchedule } from './scheduleUtils';

/**
 * Validates external URL strictly to HTTP/HTTPS to prevent script injection.
 * Rejects javascript:, data:, mailto:, malformed URLs, and empty hostnames.
 */
export function isSafeUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim();
  if (!clean) return false;
  try {
    const parsed = new URL(clean);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export interface SongReferenceLink {
  service: 'youtube' | 'spotify' | 'apple' | 'qobuz' | 'tidal' | 'genius';
  label: string;
  url: string;
  colorClass: string;
}

/**
 * Returns safe external references attached to a song
 */
export function getSongReferenceLinks(song?: Song | null): SongReferenceLink[] {
  if (!song) return [];
  const links: SongReferenceLink[] = [];

  if (isSafeUrl(song.youtubeUrl)) {
    links.push({
      service: 'youtube',
      label: 'YouTube',
      url: song.youtubeUrl!.trim(),
      colorClass: 'text-red-500 hover:text-red-600 bg-red-500/10 border-red-500/20'
    });
  }
  if (isSafeUrl(song.spotifyUrl)) {
    links.push({
      service: 'spotify',
      label: 'Spotify',
      url: song.spotifyUrl!.trim(),
      colorClass: 'text-emerald-500 hover:text-emerald-600 bg-emerald-500/10 border-emerald-500/20'
    });
  }
  if (isSafeUrl(song.appleMusicUrl)) {
    links.push({
      service: 'apple',
      label: 'Apple Music',
      url: song.appleMusicUrl!.trim(),
      colorClass: 'text-pink-500 hover:text-pink-600 bg-pink-500/10 border-pink-500/20'
    });
  }
  if (isSafeUrl(song.qobuzUrl)) {
    links.push({
      service: 'qobuz',
      label: 'Qobuz',
      url: song.qobuzUrl!.trim(),
      colorClass: 'text-sky-500 hover:text-sky-600 bg-sky-500/10 border-sky-500/20'
    });
  }
  if (isSafeUrl(song.tidalUrl)) {
    links.push({
      service: 'tidal',
      label: 'Tidal',
      url: song.tidalUrl!.trim(),
      colorClass: 'text-cyan-500 hover:text-cyan-600 bg-cyan-500/10 border-cyan-500/20'
    });
  }
  if (isSafeUrl(song.geniusUrl)) {
    links.push({
      service: 'genius',
      label: 'Genius',
      url: song.geniusUrl!.trim(),
      colorClass: 'text-amber-500 hover:text-amber-600 bg-amber-500/10 border-amber-500/20'
    });
  }

  return links;
}

const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ENHARMONIC_MAP: Record<string, string> = {
  'Db': 'C#',
  'Eb': 'D#',
  'Gb': 'F#',
  'Ab': 'G#',
  'Bb': 'A#',
  'Cb': 'B',
  'B#': 'C',
  'Fb': 'E',
  'E#': 'F'
};

function normalizeKeyRoot(keyStr?: string): { root: string; isMinor: boolean } | null {
  if (!keyStr || typeof keyStr !== 'string') return null;
  const clean = keyStr.trim();
  if (!clean) return null;

  // Extract root note: [A-G][#b]? with flexible minor/major designators
  // e.g. "Am", "A minor", "A-minor", "A min", "C#m", "Db", "Eb minor"
  const match = clean.match(/^([A-Ga-g][#b]?)(?:[\s\-_]*)?(m(?:in(?:or)?)?|maj(?:or)?)?$/i);
  if (!match) {
    const prefixMatch = clean.match(/^([A-Ga-g][#b]?)(.*)$/i);
    if (!prefixMatch) return null;
    const rawNote = prefixMatch[1];
    const rest = prefixMatch[2].toLowerCase();
    const isMinor = rest.includes('min') || (rest.startsWith('m') && !rest.startsWith('maj'));
    let note = rawNote.charAt(0).toUpperCase() + rawNote.slice(1).toLowerCase();
    if (ENHARMONIC_MAP[note]) note = ENHARMONIC_MAP[note];
    return { root: note, isMinor };
  }

  const rawNote = match[1];
  const modeStr = (match[2] || '').toLowerCase();
  const isMinor = modeStr.startsWith('m') && !modeStr.startsWith('maj');

  let note = rawNote.charAt(0).toUpperCase() + rawNote.slice(1).toLowerCase();
  if (ENHARMONIC_MAP[note]) {
    note = ENHARMONIC_MAP[note];
  }
  return { root: note, isMinor };
}

/**
 * Calculates musical relationship between two performed keys with enharmonic equivalence
 * and neutral, non-evaluative interval descriptions.
 */
export function describeKeyTransition(fromKey?: string, toKey?: string): string {
  if (!fromKey || !toKey) return 'Key transition unconfirmed';
  const cleanFrom = fromKey.trim();
  const cleanTo = toKey.trim();
  if (!cleanFrom || !cleanTo) return 'Key transition unconfirmed';

  const parsedFrom = normalizeKeyRoot(cleanFrom);
  const parsedTo = normalizeKeyRoot(cleanTo);

  if (!parsedFrom || !parsedTo) {
    if (cleanFrom.toLowerCase() === cleanTo.toLowerCase()) {
      return 'Same Key (No modulation)';
    }
    return `${cleanFrom} → ${cleanTo}`;
  }

  const idxFrom = CHROMATIC_SCALE.indexOf(parsedFrom.root);
  const idxTo = CHROMATIC_SCALE.indexOf(parsedTo.root);

  if (idxFrom === -1 || idxTo === -1) {
    return `${cleanFrom} → ${cleanTo}`;
  }

  const diff = (idxTo - idxFrom + 12) % 12;

  if (parsedFrom.isMinor === parsedTo.isMinor) {
    if (diff === 0) return 'Same Key (No modulation)';
    if (diff === 1) return '+1 Semitone (Half-step modulation)';
    if (diff === 2) return '+1 Whole step (Whole-step modulation)';
    if (diff === 3) return '+3 Semitones (Minor 3rd modulation)';
    if (diff === 4) return '+4 Semitones (Major 3rd modulation)';
    if (diff === 5) return 'Ascending 4th / Descending 5th (Subdominant)';
    if (diff === 6) return 'Tritone transition (6 semitones)';
    if (diff === 7) return 'Ascending 5th / Descending 4th (Dominant)';
    if (diff === 8) return '-4 Semitones / +8 Semitones';
    if (diff === 9) return '-3 Semitones / +9 Semitones';
    if (diff === 10) return '-1 Whole step (-2 semitones)';
    if (diff === 11) return '-1 Semitone (-1 semitone)';
  } else {
    if (diff === 0) {
      return parsedFrom.isMinor ? 'Parallel Major modulation' : 'Parallel Minor modulation';
    }
    if (!parsedFrom.isMinor && parsedTo.isMinor && diff === 9) {
      return 'Relative Minor transition';
    }
    if (parsedFrom.isMinor && !parsedTo.isMinor && diff === 3) {
      return 'Relative Major transition';
    }
  }

  return `${cleanFrom} → ${cleanTo} (${diff} semitones)`;
}

/**
 * Generates a stable key for a transition between two adjacent songs.
 * Uses slot IDs if available, else song titles, with section prefix.
 * Example: praise::id:song1->id:song2 or praise::title1->title2
 */
export function getTransitionPairId(
  section: 'praise' | 'worship' | 'cross_section',
  fromTitle?: string,
  toTitle?: string,
  fromId?: string,
  toId?: string
): string {
  if (section === 'cross_section') {
    return 'cross_section';
  }
  const from = fromId && fromId.trim() ? `id:${fromId.trim()}` : (fromTitle || '').trim().toLowerCase();
  const to = toId && toId.trim() ? `id:${toId.trim()}` : (toTitle || '').trim().toLowerCase();
  return `${section}::${from}->${to}`;
}

/**
 * Resolves a transition note from transitionNotes dictionary.
 * Checks the stable pair ID first. Only falls back to legacy index key (e.g., praise_0_1)
 * when neither fromId nor toId is supplied, preventing reordered or duplicate-title songs
 * from inheriting stale positional or title-only cues.
 */
export function resolveTransitionNote(
  transitionNotes: Record<string, string> | undefined,
  section: 'praise' | 'worship' | 'cross_section',
  fromIndex: number,
  toIndex: number,
  fromTitle?: string,
  toTitle?: string,
  fromId?: string,
  toId?: string
): string {
  if (!transitionNotes || typeof transitionNotes !== 'object') return '';
  if (section === 'cross_section') {
    return transitionNotes['cross_section'] || '';
  }

  // 1. Stable pair ID (ID-based or title-based)
  const pairId = getTransitionPairId(section, fromTitle, toTitle, fromId, toId);
  if (transitionNotes[pairId] !== undefined) {
    return transitionNotes[pairId];
  }

  // 2. When non-empty slot IDs are supplied, NEVER fall back to title-pair or legacy index keys
  const hasFromId = Boolean(fromId && fromId.trim());
  const hasToId = Boolean(toId && toId.trim());
  if (hasFromId || hasToId) {
    return '';
  }

  // 3. Backward-compatible positional index key (only when slots have no IDs)
  const legacyIndexKey = `${section}_${fromIndex}_${toIndex}`;
  if (transitionNotes[legacyIndexKey] !== undefined) {
    return transitionNotes[legacyIndexKey];
  }

  return '';
}

/**
 * Generates an accessible, clean plain-text Service Brief formatted for team chat (WhatsApp, Messenger, SMS, Slack)
 */
export function generateServiceBrief(schedule: Schedule, allSongs: Song[] = []): string {
  const formattedDate = schedule.serviceDate
    ? formatDateDisplayManila(schedule.serviceDate, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
    : 'Date not set';

  if (isNoServiceSchedule(schedule)) {
    const lines: string[] = [];
    lines.push(`WWCF SANTA CRUZ — WORSHIP SERVICE NOTICE`);
    lines.push(`====================================`);
    lines.push(`Service: ${schedule.serviceType || 'Sunday Service'}`);
    lines.push(`Date: ${formattedDate}`);
    lines.push(`Status: NO SERVICE`);
    if (schedule.noServiceReason && schedule.noServiceReason.trim()) {
      lines.push(`Reason: ${schedule.noServiceReason.trim()}`);
    }
    lines.push('');
    if (schedule.notes && schedule.notes.trim()) {
      lines.push(`SERVICE NOTES & INSTRUCTIONS:`);
      lines.push(schedule.notes.trim());
      lines.push('');
    }
    lines.push(`Generated by WWCF Worship Song Line-up Scheduler`);
    return lines.join('\n');
  }

  const resolved = resolveScheduleSongTitles(schedule, allSongs);
  const rawPraise = resolved.praiseSongs || [];
  const rawWorship = resolved.worshipSongs || [];

  const praiseEntries = rawPraise
    .map((s, idx) => {
      const title = (s || '').trim();
      if (!title) return null;
      const songId = resolved.praiseSongIds?.[idx] || schedule.praiseSongIds?.[idx];
      const matched = resolveSlotSong(title, songId, allSongs).song;
      const perfKey = (schedule.praiseSongKeys?.[idx] || '').trim();
      return { title, songId: matched?.id || songId, matched, perfKey, originalIndex: idx };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  const worshipEntries = rawWorship
    .map((s, idx) => {
      const title = (s || '').trim();
      if (!title) return null;
      const songId = resolved.worshipSongIds?.[idx] || schedule.worshipSongIds?.[idx];
      const matched = resolveSlotSong(title, songId, allSongs).song;
      const perfKey = (schedule.worshipSongKeys?.[idx] || '').trim();
      return { title, songId: matched?.id || songId, matched, perfKey, originalIndex: idx };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  const allTitles = [...praiseEntries.map((e) => e.title), ...worshipEntries.map((e) => e.title)];
  const allIds = [...praiseEntries.map((e) => e.songId), ...worshipEntries.map((e) => e.songId)];
  const durationSummary = calculateLineupDuration(allTitles, allIds, allSongs);

  const lines: string[] = [];
  lines.push(`WWCF SANTA CRUZ — WORSHIP SERVICE BRIEF`);
  lines.push(`====================================`);
  lines.push(`Service: ${schedule.serviceType || 'Sunday Service'}`);
  lines.push(`Date: ${formattedDate}`);
  lines.push(`Setlist Duration: ${durationSummary.summaryLabel}`);
  lines.push('');

  // Praise songs
  if (praiseEntries.length > 0) {
    lines.push(`PRAISE SET:`);
    praiseEntries.forEach((entry, idx) => {
      const details: string[] = [];
      if (entry.perfKey) {
        details.push(`Key: ${entry.perfKey}`);
        const orig = entry.matched?.originalKey || entry.matched?.key;
        if (orig && orig.toLowerCase() !== entry.perfKey.toLowerCase()) {
          details.push(`Orig: ${orig}`);
        }
      } else {
        const orig = entry.matched?.originalKey || entry.matched?.key;
        if (orig) {
          details.push(`Performed key not set (Orig: ${orig})`);
        } else {
          details.push(`Performed key not set`);
        }
      }
      if (entry.matched?.bpm) details.push(`${entry.matched.bpm} BPM`);
      if (entry.matched?.timeSignature) details.push(entry.matched.timeSignature);
      if (entry.matched?.duration) details.push(entry.matched.duration);

      const detailStr = details.length > 0 ? ` (${details.join(' | ')})` : '';
      lines.push(`  ${idx + 1}. ${entry.title}${detailStr}`);

      // Transition note if available
      if (idx < praiseEntries.length - 1) {
        const nextEntry = praiseEntries[idx + 1];
        const transNote = resolveTransitionNote(
          schedule.transitionNotes,
          'praise',
          idx,
          idx + 1,
          entry.title,
          nextEntry.title,
          entry.songId,
          nextEntry.songId
        );
        if (transNote) {
          lines.push(`     ↳ Transition: ${transNote}`);
        }
      }
    });
    lines.push('');
  }

  // Cross-section transition note
  const crossTransNote = resolveTransitionNote(schedule.transitionNotes, 'cross_section', 0, 0);
  if (crossTransNote) {
    lines.push(`[ PRAISE → WORSHIP TRANSITION ]`);
    lines.push(`  Note: ${crossTransNote}`);
    lines.push('');
  }

  // Worship songs
  if (worshipEntries.length > 0) {
    lines.push(`WORSHIP SET:`);
    worshipEntries.forEach((entry, idx) => {
      const details: string[] = [];
      if (entry.perfKey) {
        details.push(`Key: ${entry.perfKey}`);
        const orig = entry.matched?.originalKey || entry.matched?.key;
        if (orig && orig.toLowerCase() !== entry.perfKey.toLowerCase()) {
          details.push(`Orig: ${orig}`);
        }
      } else {
        const orig = entry.matched?.originalKey || entry.matched?.key;
        if (orig) {
          details.push(`Performed key not set (Orig: ${orig})`);
        } else {
          details.push(`Performed key not set`);
        }
      }
      if (entry.matched?.bpm) details.push(`${entry.matched.bpm} BPM`);
      if (entry.matched?.timeSignature) details.push(entry.matched.timeSignature);
      if (entry.matched?.duration) details.push(entry.matched.duration);

      const detailStr = details.length > 0 ? ` (${details.join(' | ')})` : '';
      lines.push(`  ${idx + 1}. ${entry.title}${detailStr}`);

      // Transition note if available
      if (idx < worshipEntries.length - 1) {
        const nextEntry = worshipEntries[idx + 1];
        const transNote = resolveTransitionNote(
          schedule.transitionNotes,
          'worship',
          idx,
          idx + 1,
          entry.title,
          nextEntry.title,
          entry.songId,
          nextEntry.songId
        );
        if (transNote) {
          lines.push(`     ↳ Transition: ${transNote}`);
        }
      }
    });
    lines.push('');
  }

  // Ministry Team
  const assignments = schedule.ministryAssignments || [];
  if (assignments.length > 0) {
    lines.push(`MINISTRY TEAM ROSTER:`);
    assignments.forEach((assignment) => {
      const members = getAssignmentMembers(assignment);
      const cleanNames = members.map((m) => m.memberName).filter((n) => Boolean(n) && n !== 'Unassigned' && n !== '—');
      const nameStr = cleanNames.length > 0 ? cleanNames.join(', ') : 'Unassigned';
      lines.push(`  • ${assignment.role}: ${nameStr}`);
    });
    lines.push('');
  }

  // Service Notes
  if (schedule.notes && schedule.notes.trim()) {
    lines.push(`SERVICE NOTES & INSTRUCTIONS:`);
    lines.push(schedule.notes.trim());
    lines.push('');
  }

  // Rehearsal Checklist status
  if (schedule.rehearsalChecklist) {
    const rc = schedule.rehearsalChecklist;
    const checks = [
      rc.songSelectionFinalized ? '✓ Songs Finalized' : '○ Songs Pending',
      rc.performedKeysChecked ? '✓ Keys Confirmed' : '○ Keys Pending',
      rc.lyricsReviewed ? '✓ Lyrics Ready' : '○ Lyrics Pending',
      rc.referencesChecked ? '✓ Links Attached' : '○ Links Pending',
      rc.teamAssignmentsFinalized ? '✓ Roster Set' : '○ Roster Pending',
      rc.transitionsPrepared ? '✓ Transitions Planned' : '○ Transitions Pending'
    ];
    lines.push(`REHEARSAL READINESS:`);
    lines.push(`  ${checks.join(' | ')}`);
    lines.push('');
  }

  lines.push(`Generated by WWCF Worship Song Line-up Scheduler`);
  return lines.join('\n');
}
