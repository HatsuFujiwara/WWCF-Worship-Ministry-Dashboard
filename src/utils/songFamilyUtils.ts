import { Song, SongFamily, SongRelationshipType, SongVersionRef } from '../types';

/**
 * Common regex to clean song titles for version discovery without losing original title.
 */
const VERSION_INDICATOR_REGEX = /\s*[\(\[](official\s*video|official\s*audio|official\s*live|live(\s*version)?|acoustic(\s*version)?|studio(\s*version)?|remaster(ed)?|radio\s*edit|extended(\s*mix)?|cover|lyric(\s*video)?|unplugged|feat\..*?|ft\..*?)[\)\]]/gi;

const TRAILING_VERSION_REGEX = /\s+-\s+(live|acoustic|studio|remastered|cover|instrumental)(\s+version)?$/i;

/**
 * Extracts a normalized base title for candidate grouping.
 * e.g., "Tribes (Live)" -> "Tribes"
 * "Forever - Live Version" -> "Forever"
 */
export function getNormalizedBaseTitle(title: string): string {
  if (!title) return '';
  let clean = title.trim();
  clean = clean.replace(VERSION_INDICATOR_REGEX, '').trim();
  clean = clean.replace(TRAILING_VERSION_REGEX, '').trim();
  // Remove trailing punctuation or whitespace
  clean = clean.replace(/[\s\-_]+$/, '').trim();
  return clean || title.trim();
}

/**
 * Infers relationship type from title, notes, and artist comparison.
 */
export function inferRelationshipType(
  candidateSong: Song,
  originalSong?: Song
): SongRelationshipType {
  const titleLower = (candidateSong?.title || '').toLowerCase();
  const notesLower = (candidateSong?.notes || '').toLowerCase();

  if (titleLower.includes('live') || notesLower.includes('live')) {
    return 'LIVE_VERSION';
  }
  if (titleLower.includes('acoustic') || notesLower.includes('acoustic') || titleLower.includes('unplugged')) {
    return 'ACOUSTIC_VERSION';
  }
  if (titleLower.includes('remake') || notesLower.includes('remake')) {
    return 'REMAKE';
  }
  if (
    originalSong &&
    originalSong.artist &&
    candidateSong.artist &&
    !areArtistsEquivalent(originalSong.artist, candidateSong.artist)
  ) {
    return 'COVER';
  }
  if (titleLower.includes('cover') || notesLower.includes('cover')) {
    return 'COVER';
  }
  if (
    titleLower.includes('remaster') ||
    titleLower.includes('radio edit') ||
    titleLower.includes('extended') ||
    titleLower.includes('alternate')
  ) {
    return 'ALTERNATE_VERSION';
  }

  return 'VERSION';
}

/**
 * Compares two artist strings accounting for feat., ft., with, and casing.
 */
export function areArtistsEquivalent(artistA: string, artistB: string): boolean {
  if (!artistA || !artistB) return false;
  const cleanA = cleanArtistString(artistA);
  const cleanB = cleanArtistString(artistB);
  if (cleanA === cleanB) return true;
  if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;
  return false;
}

function cleanArtistString(artist: string): string {
  return artist
    .toLowerCase()
    .replace(/\s*(feat\.|ft\.|featuring|with|and|&)\s+.*$/i, '')
    .replace(/[^a-z0-9]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cleans and tokenizes lyrics text for comparison.
 */
function tokenizeLyrics(lyricsText: string): Set<string> {
  if (!lyricsText) return new Set();
  const tokens = lyricsText
    .toLowerCase()
    .replace(/\[.*?\]/g, ' ') // Remove section headers like [Chorus], [Verse 1]
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2); // Exclude very short stopwords
  return new Set(tokens);
}

/**
 * Calculates Jaccard word similarity between two lyric texts (0 to 1).
 */
export function calculateLyricsSimilarity(lyricsA?: string, lyricsB?: string): number {
  if (!lyricsA || !lyricsB) return 0;
  const setA = tokenizeLyrics(lyricsA);
  const setB = tokenizeLyrics(lyricsB);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersectionCount = 0;
  setA.forEach((token) => {
    if (setB.has(token)) {
      intersectionCount++;
    }
  });

  const unionSize = setA.size + setB.size - intersectionCount;
  if (unionSize === 0) return 0;
  return intersectionCount / unionSize;
}

export interface SongMatchEvidence {
  confidence: 'high' | 'medium' | 'low';
  score: number;
  reasons: string[];
  suggestedRelationship: SongRelationshipType;
}

/**
 * Performs multi-source verification between two songs to evaluate if they represent the same composition.
 */
export function verifySongIdentity(songA: Song, songB: Song): SongMatchEvidence {
  const reasons: string[] = [];
  let score = 0;

  const baseTitleA = getNormalizedBaseTitle(songA.title).toLowerCase();
  const baseTitleB = getNormalizedBaseTitle(songB.title).toLowerCase();
  const exactBaseTitle = baseTitleA === baseTitleB;

  if (!exactBaseTitle) {
    // If base titles don't match, check if one contains the other
    if (baseTitleA && baseTitleB && (baseTitleA.includes(baseTitleB) || baseTitleB.includes(baseTitleA))) {
      score += 20;
      reasons.push(`Base titles closely match ("${baseTitleA}" / "${baseTitleB}")`);
    } else {
      // Check if other metadata confirms same composition despite different titles
      const ccliMatch = songA.ccliNumber && songB.ccliNumber && songA.ccliNumber === songB.ccliNumber;
      const writersA = (songA.songwriters || (songA.composers ? songA.composers.join(', ') : '')).trim().toLowerCase();
      const writersB = (songB.songwriters || (songB.composers ? songB.composers.join(', ') : '')).trim().toLowerCase();
      const writersMatch = writersA && writersB && (writersA === writersB || writersA.includes(writersB) || writersB.includes(writersA));
      const lyricSim = songA.lyrics && songB.lyrics ? calculateLyricsSimilarity(songA.lyrics, songB.lyrics) : 0;

      if (ccliMatch) {
        score += 60;
        reasons.push(`Identical CCLI song registration number: #${songA.ccliNumber}`);
      }
      if (writersMatch) {
        score += 35;
        reasons.push(`Matching songwriter/composer credits: "${songA.songwriters || writersA}"`);
      }
      if (lyricSim >= 0.35) {
        score += Math.round(lyricSim * 50);
        reasons.push(`Matching lyrics content (${Math.round(lyricSim * 100)}% match)`);
      }

      if (score < 40) {
        return {
          confidence: 'low',
          score: 0,
          reasons: ['Titles and composition metadata do not match'],
          suggestedRelationship: 'UNKNOWN'
        };
      }
    }
  } else {
    score += 40;
    reasons.push(`Matching base title: "${getNormalizedBaseTitle(songA.title)}"`);
  }

  // Check Artist match
  const sameArtist = areArtistsEquivalent(songA.artist, songB.artist);
  if (sameArtist) {
    score += 35;
    reasons.push(`Matching primary artist: "${songA.artist}"`);
  }

  // Check Songwriters / Composers
  const writersA = (songA.songwriters || (songA.composers ? songA.composers.join(', ') : '')).trim().toLowerCase();
  const writersB = (songB.songwriters || (songB.composers ? songB.composers.join(', ') : '')).trim().toLowerCase();

  if (writersA && writersB) {
    if (writersA === writersB || writersA.includes(writersB) || writersB.includes(writersA)) {
      score += 40;
      reasons.push(`Confirmed matching songwriter/composer credits: "${songA.songwriters || writersA}"`);
    } else {
      // Conflicting distinct songwriters (e.g. Chris Tomlin vs Michael W. Smith)
      score -= 50;
      reasons.push(`Different songwriters detected ("${writersA}" vs "${writersB}")`);
    }
  }

  // Check Lyrics similarity if available
  if (songA.lyrics && songB.lyrics) {
    const lyricSim = calculateLyricsSimilarity(songA.lyrics, songB.lyrics);
    if (lyricSim >= 0.6) {
      score += 45;
      reasons.push(`High lyrics similarity (${Math.round(lyricSim * 100)}% match)`);
    } else if (lyricSim >= 0.35) {
      score += 25;
      reasons.push(`Moderate lyrics overlap (${Math.round(lyricSim * 100)}% match)`);
    } else if (lyricSim < 0.15 && songA.lyrics.length > 50 && songB.lyrics.length > 50) {
      // Significantly different lyrics
      score -= 40;
      reasons.push('Lyrics are completely different');
    }
  }

  // Check CCLI Number
  if (songA.ccliNumber && songB.ccliNumber && songA.ccliNumber === songB.ccliNumber) {
    score += 50;
    reasons.push(`Identical CCLI song registration number: #${songA.ccliNumber}`);
  }

  // Check Version indicators in title
  const titleA = songA?.title || '';
  const titleB = songB?.title || '';
  const hasVersionTagA = (titleA && (VERSION_INDICATOR_REGEX.test(titleA) || TRAILING_VERSION_REGEX.test(titleA))) || false;
  const hasVersionTagB = (titleB && (VERSION_INDICATOR_REGEX.test(titleB) || TRAILING_VERSION_REGEX.test(titleB))) || false;
  if (hasVersionTagA || hasVersionTagB) {
    score += 15;
    reasons.push('Explicit recording/version descriptor detected in title');
  }

  let confidence: 'high' | 'medium' | 'low';
  if (score >= 70) {
    confidence = 'high';
  } else if (score >= 40) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  const suggestedRelationship = inferRelationshipType(songB, songA);

  return {
    confidence,
    score,
    reasons,
    suggestedRelationship
  };
}

export interface PotentialFamilySuggestion {
  familyName: string;
  songs: Song[];
  evidence: SongMatchEvidence;
  suggestedOriginalId: string;
}

/**
 * Scans a list of songs and detects high/medium confidence groupings that can form Song Families.
 */
export function detectPotentialSongFamilies(
  allSongs: Song[],
  existingFamilies: SongFamily[]
): PotentialFamilySuggestion[] {
  const suggestions: PotentialFamilySuggestion[] = [];
  const existingFamilySongIds = new Set<string>();
  existingFamilies.forEach((f) => f.versionIds.forEach((id) => existingFamilySongIds.add(id)));

  // Group unlinked songs by normalized base title
  const groups = new Map<string, Song[]>();

  allSongs.forEach((song) => {
    // Only look at songs that aren't already grouped in a family
    if (!song.songFamilyId && !existingFamilySongIds.has(song.id)) {
      const baseKey = getNormalizedBaseTitle(song.title).toLowerCase();
      if (baseKey) {
        const list = groups.get(baseKey) || [];
        list.push(song);
        groups.set(baseKey, list);
      }
    }
  });

  groups.forEach((groupSongs, baseTitleLower) => {
    if (groupSongs.length < 2) return;

    // Check pair-wise identity
    const baseSong = groupSongs[0];
    let allMatch = true;
    const combinedReasons: string[] = [];
    let minConfidence: 'high' | 'medium' | 'low' = 'high';

    for (let i = 1; i < groupSongs.length; i++) {
      const evidence = verifySongIdentity(baseSong, groupSongs[i]);
      if (evidence.confidence === 'low') {
        allMatch = false;
        break;
      }
      if (evidence.confidence === 'medium' && minConfidence === 'high') {
        minConfidence = 'medium';
      }
      evidence.reasons.forEach((r) => {
        if (!combinedReasons.includes(r)) combinedReasons.push(r);
      });
    }

    if (allMatch) {
      // Pick best original (shortest title or explicitly not marked as live/acoustic)
      const sortedByOriginality = [...groupSongs].sort((a, b) => {
        const aHasLive = /live|acoustic|cover|remix/i.test(a.title);
        const bHasLive = /live|acoustic|cover|remix/i.test(b.title);
        if (aHasLive && !bHasLive) return 1;
        if (!aHasLive && bHasLive) return -1;
        return a.title.length - b.title.length;
      });

      const original = sortedByOriginality[0];
      const canonicalName = getNormalizedBaseTitle(original.title);

      suggestions.push({
        familyName: canonicalName,
        songs: groupSongs,
        evidence: {
          confidence: minConfidence,
          score: 80,
          reasons: combinedReasons,
          suggestedRelationship: 'VERSION'
        },
        suggestedOriginalId: original.id
      });
    }
  });

  return suggestions;
}
