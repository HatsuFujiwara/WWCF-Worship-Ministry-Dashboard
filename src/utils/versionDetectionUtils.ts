import { Song, SongRelationshipType, SongVersionType } from '../types';
import { areArtistsEquivalent } from './songFamilyUtils';

export interface VersionDetectionResult {
  versionType: SongVersionType;
  confidence: 'high' | 'medium' | 'low';
  indicator: 'Detected: Original' | 'Detected: Cover' | 'Needs Review';
  reason?: string;
}

const COVER_PATTERNS = [
  /\b(cover|covered\s+by|rendition|tribute|reinterpretation|bootleg\s+cover|acoustic\s+cover|fingerstyle\s+cover|guitar\s+cover|piano\s+cover|worship\s+cover)\b/i,
  /\b(originally\s+by|orig\s+by|song\s+by)\b/i,
  /\b(in\s+the\s+style\s+of|tribute\s+to)\b/i
];

const ORIGINAL_PATTERNS = [
  /\b(official\s+video|official\s+music\s+video|official\s+audio|official\s+lyric\s+video|official\s+release|official\s+track)\b/i,
  /\b(original\s+song|original\s+version|original\s+master|album\s+version)\b/i
];

/**
 * Heuristically detects whether a song recording is an Original or a Cover version.
 * Always allows manual override.
 */
export function detectSongVersionType(input: {
  title?: string;
  artist?: string;
  rawTitle?: string;
  originalArtist?: string;
  songwriters?: string;
  relationshipType?: SongRelationshipType;
  notes?: string;
  youtubeTitle?: string;
}): VersionDetectionResult {
  const title = (input.title || '').trim();
  const artist = (input.artist || '').trim();
  const rawTitle = (input.rawTitle || input.youtubeTitle || '').trim();
  const notes = (input.notes || '').trim();
  const originalArtist = (input.originalArtist || '').trim();

  // 1. Explicit Original Artist given and distinct from performer
  if (originalArtist && artist && !areArtistsEquivalent(originalArtist, artist)) {
    return {
      versionType: 'cover',
      confidence: 'high',
      indicator: 'Detected: Cover',
      reason: `Original artist is noted as "${originalArtist}" while performer is "${artist}".`
    };
  }

  // 2. Explicit relationship type
  if (input.relationshipType === 'COVER') {
    return {
      versionType: 'cover',
      confidence: 'high',
      indicator: 'Detected: Cover',
      reason: 'Classified as Cover version.'
    };
  }
  if (input.relationshipType === 'ORIGINAL') {
    return {
      versionType: 'original',
      confidence: 'high',
      indicator: 'Detected: Original',
      reason: 'Classified as Original version.'
    };
  }

  // 3. Check for Cover keywords in title, raw video title, or notes
  const combinedSearch = `${title} ${rawTitle} ${notes}`;
  for (const pattern of COVER_PATTERNS) {
    if (pattern.test(combinedSearch)) {
      return {
        versionType: 'cover',
        confidence: 'high',
        indicator: 'Detected: Cover',
        reason: 'Cover keyword detected in song or video title.'
      };
    }
  }

  // 4. Check for Original keywords
  for (const pattern of ORIGINAL_PATTERNS) {
    if (pattern.test(combinedSearch)) {
      return {
        versionType: 'original',
        confidence: 'high',
        indicator: 'Detected: Original',
        reason: 'Official release / original video tag detected.'
      };
    }
  }

  // 5. Default heuristic: If title and artist are present and clean, default to Original with medium confidence
  return {
    versionType: 'original',
    confidence: 'medium',
    indicator: 'Needs Review',
    reason: 'Standard recording detected. Please verify if this is an Original or a Cover.'
  };
}

/**
 * Returns the resolved permanent versionType for any song record ('original' | 'cover').
 * Ensures total backward compatibility for existing song items.
 */
export function resolveSongVersionType(song?: Partial<Song> | null): SongVersionType {
  if (!song) return 'original';
  if (song.versionType === 'cover' || song.versionType === 'original') {
    return song.versionType;
  }
  if (song.relationshipType === 'COVER') {
    return 'cover';
  }
  return 'original';
}
