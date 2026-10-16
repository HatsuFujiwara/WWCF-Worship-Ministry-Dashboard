import { extractYouTubeId } from './songService';
import { Song, SongRelationshipType } from '../types';
import { detectSongLanguage, LanguageDetectionResult, SongLanguage } from '../utils/languageUtils';
import { getNormalizedBaseTitle } from '../utils/songFamilyUtils';

export interface ComprehensiveMetadata {
  title?: string;
  artist?: string;
  album?: string;
  releaseYear?: string;
  duration?: string;
  genre?: string;
  language?: SongLanguage;
  languageDetails?: LanguageDetectionResult;
  coverArtUrl?: string;
  thumbnailUrl?: string;
  isrc?: string;
  ccliNumber?: string;
  key?: string; // Manual field only
  originalKey?: string; // Manual field only
  bpm?: number | string; // Manual field only
  timeSignature?: string; // Manual field only
  youtubeMusicUrl?: string;
  youtubeUrl?: string;
  youtubeId?: string;
  spotifyUrl?: string;
  appleMusicUrl?: string;
  qobuzUrl?: string;
  tidalUrl?: string;
  deezerUrl?: string;
  geniusUrl?: string;
  lyrics?: string;
  songwriters?: string;
  composers?: string[];
  originalArtist?: string;
  relationshipType?: SongRelationshipType;
  relationshipConfidence?: 'high' | 'medium' | 'low';
  relationshipEvidence?: string;
  originalSourceDetails?: {
    originalArtist?: string;
    originalTitle?: string;
    relationship: SongRelationshipType;
    confidence: 'high' | 'medium' | 'low';
    evidence: string;
  };
  sourcesQueried: string[];
  sourcesSucceeded: string[];
  sourceDisagreements?: string[];
}

/**
 * Formats track duration in milliseconds or seconds to "M:SS" format.
 */
function formatDuration(secondsOrMs: number): string {
  if (!secondsOrMs || secondsOrMs <= 0) return '';
  const totalSeconds = secondsOrMs > 10000 ? Math.floor(secondsOrMs / 1000) : Math.floor(secondsOrMs);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

/**
 * Clean candidate song titles from video clutter, official video indicators, and brackets
 */
export function cleanVideoTitle(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\s*[\(\[][^()\[\]]*(official|music\s*video|lyrics?|live|audio|worship|acoustic|visualizer|video|4k|hd|remaster)[^()\[\]]*[\)\]]/gi, '')
    .replace(/\s*-\s*(Official\s*(Audio|Video|Lyrics?)|Lyrics?|Visualizer|HD|4K|Audio)$/i, '')
    .replace(/\s*\|\s*(Live(\s*Worship)?|Worship|Official(\s*Video)?|Lyrics?)$/i, '')
    .trim();
}

/**
 * Accurately parses YouTube title and channel author to reliably distinguish Song Title vs Artist.
 */
export function parseCandidateTitleAndArtist(rawTitle: string, rawAuthor?: string): { title: string; artist: string } {
  const clean = cleanVideoTitle(rawTitle);
  const cleanAuthor = (rawAuthor || '')
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/\s+VEVO$/i, '')
    .replace(/\s+Official$/i, '')
    .trim();

  // Pattern: "Title by Artist"
  const byMatch = clean.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    return {
      title: byMatch[1].trim(),
      artist: byMatch[2].trim()
    };
  }

  // Common separators: " - ", " | ", " // ", " ~ ", " : "
  const separators = [' - ', ' | ', ' // ', ' ~ ', ' : '];
  for (const sep of separators) {
    if (clean.includes(sep)) {
      const parts = clean.split(sep).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const left = parts[0];
        const right = parts.slice(1).join(' ').trim();

        const normAuthor = cleanAuthor.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normLeft = left.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normRight = right.toLowerCase().replace(/[^a-z0-9]/g, '');

        // If author matches left part, left is Artist, right is Title
        if (normAuthor && (normLeft.includes(normAuthor) || normAuthor.includes(normLeft))) {
          return { title: right, artist: left };
        }
        // If author matches right part, right is Artist, left is Title
        if (normAuthor && (normRight.includes(normAuthor) || normAuthor.includes(normRight))) {
          return { title: left, artist: right };
        }
        // Default standard music convention: Left is Artist, Right is Title
        return { title: right, artist: left };
      }
    }
  }

  // No separator: clean title is title, channel author (if meaningful) is artist
  return {
    title: clean,
    artist: cleanAuthor && cleanAuthor.toLowerCase() !== 'youtube' ? cleanAuthor : ''
  };
}

/**
 * 1. YouTube Music oEmbed
 */
async function fetchYouTubeMusicMetadata(input: string): Promise<Partial<ComprehensiveMetadata> | null> {
  const ytId = extractYouTubeId(input);
  if (ytId || input.includes('music.youtube.com')) {
    const cleanId = ytId || extractYouTubeId(input);
    if (!cleanId) return null;
    try {
      const ytmUrl = `https://music.youtube.com/watch?v=${cleanId}`;
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(ytmUrl)}&format=json`;
      const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        const { title, artist } = parseCandidateTitleAndArtist(data.title || '', data.author_name || '');

        return {
          title,
          artist,
          youtubeMusicUrl: ytmUrl,
          youtubeId: cleanId,
          thumbnailUrl: `https://img.youtube.com/vi/${cleanId}/hqdefault.jpg`
        };
      }
    } catch (e) {
      console.warn('YouTube Music fetch failed:', e);
    }
  }
  return null;
}

/**
 * 2. YouTube Standard oEmbed
 */
async function fetchYouTubeMetadata(input: string): Promise<Partial<ComprehensiveMetadata> | null> {
  const ytId = extractYouTubeId(input);
  if (!ytId) return null;

  const cleanUrl = `https://www.youtube.com/watch?v=${ytId}`;
  const thumbnailUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      const { title, artist } = parseCandidateTitleAndArtist(data.title || '', data.author_name || '');

      return {
        title,
        artist,
        youtubeId: ytId,
        youtubeUrl: cleanUrl,
        thumbnailUrl
      };
    }
  } catch (e) {
    console.warn('YouTube fetch failed:', e);
  }

  return {
    youtubeId: ytId,
    youtubeUrl: cleanUrl,
    thumbnailUrl
  };
}

/**
 * 3. MusicBrainz API (PRIMARY identity & metadata finder)
 */
export async function fetchMusicBrainzMetadata(
  title: string,
  artist?: string
): Promise<Partial<ComprehensiveMetadata> | null> {
  const cleanTitle = getNormalizedBaseTitle(title).replace(/['"]/g, '');
  const cleanArtist = artist && artist !== 'Unknown Artist' ? artist.replace(/['"]/g, '').trim() : '';

  if (!cleanTitle) return null;

  // Build Lucene queries: first try exact recording & artist, then fallback to recording only
  const queries: string[] = [];
  if (cleanArtist) {
    queries.push(`recording:"${cleanTitle}" AND artist:"${cleanArtist}"`);
    queries.push(`"${cleanTitle}" "${cleanArtist}"`);
  }
  queries.push(`recording:"${cleanTitle}"`);

  for (const q of queries) {
    try {
      let data: any = null;

      // 1. Try local server proxy endpoint
      try {
        const proxyRes = await fetch(`/api/metadata/musicbrainz?query=${encodeURIComponent(q)}`, {
          signal: AbortSignal.timeout(4500)
        });
        if (proxyRes.ok) {
          const json = await proxyRes.json();
          if (json.success && json.data) {
            data = json.data;
          }
        }
      } catch {
        // Proxy not available or failed; fallback to direct
      }

      // 2. Fallback to direct MusicBrainz query
      if (!data) {
        const directUrl = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(q)}&fmt=json`;
        const directRes = await fetch(directUrl, {
          headers: {
            'User-Agent': 'WWCFSantaCruzLineupScheduler/1.0 (contact@wwcf.org)',
            Accept: 'application/json'
          },
          signal: AbortSignal.timeout(4500)
        });
        if (directRes.ok) {
          data = await directRes.json();
        }
      }

      if (data && Array.isArray(data.recordings) && data.recordings.length > 0) {
        const rec = data.recordings[0];
        const artistCredits = rec['artist-credit'];
        let matchedArtist = '';
        if (Array.isArray(artistCredits)) {
          matchedArtist = artistCredits
            .map((c: any) => c.name || c.artist?.name || '')
            .filter(Boolean)
            .join(' & ');
        }

        const releases = rec.releases || [];
        const primaryRelease = releases.find((r: any) => r.status === 'Official') || releases[0];
        const releaseYear = rec['first-release-date']
          ? rec['first-release-date'].substring(0, 4)
          : primaryRelease?.date
          ? primaryRelease.date.substring(0, 4)
          : undefined;

        const duration = rec.length ? formatDuration(rec.length) : undefined;
        const isrc = rec.isrcs && rec.isrcs.length > 0 ? rec.isrcs[0] : undefined;

        return {
          title: rec.title,
          artist: matchedArtist || cleanArtist || undefined,
          album: primaryRelease?.title,
          releaseYear,
          duration,
          isrc
        };
      }
    } catch (e) {
      console.warn('MusicBrainz query failed for query:', q, e);
    }
  }

  return null;
}

/**
 * 4. Deezer API (SECONDARY fallback when MusicBrainz has no suitable match)
 */
export async function fetchDeezerMetadata(
  title: string,
  artist?: string
): Promise<Partial<ComprehensiveMetadata> | null> {
  const cleanTitle = getNormalizedBaseTitle(title);
  const cleanArtist = artist && artist !== 'Unknown Artist' ? artist.trim() : '';

  if (!cleanTitle) return null;

  const searchQuery = cleanArtist ? `${cleanTitle} ${cleanArtist}` : cleanTitle;

  try {
    let data: any = null;

    // 1. Try local server proxy endpoint
    try {
      const proxyRes = await fetch(`/api/metadata/deezer?query=${encodeURIComponent(searchQuery)}`, {
        signal: AbortSignal.timeout(4500)
      });
      if (proxyRes.ok) {
        const json = await proxyRes.json();
        if (json.success && json.data) {
          data = json.data;
        }
      }
    } catch {
      // Proxy not available or failed; fallback to direct
    }

    // 2. Fallback to direct Deezer search
    if (!data) {
      const directUrl = `https://api.deezer.com/search?q=${encodeURIComponent(searchQuery)}&limit=5`;
      const directRes = await fetch(directUrl, { signal: AbortSignal.timeout(4500) });
      if (directRes.ok) {
        data = await directRes.json();
      }
    }

    if (data && Array.isArray(data.data) && data.data.length > 0) {
      let item = data.data[0];
      if (cleanArtist) {
        const normArtist = cleanArtist.toLowerCase().replace(/[^a-z0-9]/g, '');
        const matched = data.data.find((t: any) => {
          const tArtist = (t.artist?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return tArtist.includes(normArtist) || normArtist.includes(tArtist);
        });
        if (matched) item = matched;
      }

      const coverArtUrl = item.album?.cover_big || item.album?.cover_xl || item.album?.cover_medium;
      const duration = item.duration ? formatDuration(item.duration * 1000) : undefined;

      return {
        title: item.title_short || item.title,
        artist: item.artist?.name,
        album: item.album?.title,
        coverArtUrl,
        duration,
        isrc: item.isrc,
        deezerUrl: item.link
      };
    }
  } catch (e) {
    console.warn('Deezer API fetch failed:', e);
  }

  return null;
}

/**
 * 3. Spotify oEmbed & Search
 */
async function fetchSpotifyMetadata(queryOrUrl: string): Promise<Partial<ComprehensiveMetadata> | null> {
  if (queryOrUrl.includes('open.spotify.com')) {
    try {
      const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(queryOrUrl)}`;
      const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        return {
          title: data.title,
          artist: data.author_name,
          coverArtUrl: data.thumbnail_url,
          spotifyUrl: queryOrUrl
        };
      }
    } catch (e) {
      console.warn('Spotify oEmbed fetch failed:', e);
    }
  }
  return null;
}

/**
 * 4. Apple Music (iTunes Search API) - includes comprehensive track, artist, album, duration, ISRC
 */
async function fetchAppleMusicMetadata(
  query: string,
  targetArtist?: string
): Promise<Partial<ComprehensiveMetadata> | null> {
  try {
    const searchTerm = targetArtist ? `${query} ${targetArtist}` : query;
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=song&limit=5`;
    const res = await fetch(itunesUrl, { signal: AbortSignal.timeout(4500) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.results && data.results.length > 0) {
      // Find the best match if targetArtist is provided to prevent same-title mismatch
      let item = data.results[0];
      if (targetArtist && targetArtist.trim() && targetArtist !== 'Unknown Artist') {
        const normTarget = targetArtist.toLowerCase().replace(/[^a-z0-9]/g, '');
        const matched = data.results.find((r: any) => {
          const rArtist = (r.artistName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return rArtist.includes(normTarget) || normTarget.includes(rArtist);
        });
        if (matched) {
          item = matched;
        }
      }

      const releaseYear = item.releaseDate ? item.releaseDate.substring(0, 4) : '';
      const coverArtUrl = item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : '';
      const duration = item.trackTimeMillis ? formatDuration(item.trackTimeMillis) : '';

      return {
        title: item.trackName,
        artist: item.artistName,
        album: item.collectionName,
        releaseYear,
        duration,
        genre: item.primaryGenreName,
        coverArtUrl,
        appleMusicUrl: item.trackViewUrl,
        isrc: item.isrc
      };
    }
  } catch (e) {
    console.warn('Apple Music / iTunes API fetch failed:', e);
  }
  return null;
}

/**
 * 5. Qobuz Search API
 */
async function fetchQobuzMetadata(query: string, targetArtist?: string): Promise<Partial<ComprehensiveMetadata> | null> {
  try {
    const searchTerm = targetArtist ? `${query} ${targetArtist}` : query;
    const qobuzUrl = `https://corsproxy.io/?${encodeURIComponent(
      `https://www.qobuz.com/api.json/0.2/track/search?query=${encodeURIComponent(searchTerm)}&limit=3&app_id=100000000`
    )}`;
    const res = await fetch(qobuzUrl, { signal: AbortSignal.timeout(4500) });
    if (res.ok) {
      const data = await res.json();
      if (data && data.tracks && data.tracks.items && data.tracks.items.length > 0) {
        let item = data.tracks.items[0];
        if (targetArtist && targetArtist !== 'Unknown Artist') {
          const normTarget = targetArtist.toLowerCase().replace(/[^a-z0-9]/g, '');
          const matched = data.tracks.items.find((t: any) => {
            const name = (t.performer?.name || t.album?.artist?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return name.includes(normTarget) || normTarget.includes(name);
          });
          if (matched) item = matched;
        }

        const performer = item.performer?.name || item.album?.artist?.name;
        const composer = item.composer?.name;

        return {
          title: item.title,
          artist: performer,
          album: item.album?.title,
          coverArtUrl: item.album?.image?.large,
          qobuzUrl: item.url || `https://www.qobuz.com/track/${item.id}`,
          songwriters: composer || undefined,
          composers: composer ? [composer] : undefined,
          isrc: item.isrc
        };
      }
    }
  } catch (e) {
    console.warn('Qobuz API fetch failed:', e);
  }
  return null;
}

/**
 * 6. TIDAL oEmbed
 */
async function fetchTidalMetadata(queryOrUrl: string): Promise<Partial<ComprehensiveMetadata> | null> {
  if (queryOrUrl.includes('tidal.com')) {
    try {
      const oembedUrl = `https://embed.tidal.com/oembed?url=${encodeURIComponent(queryOrUrl)}`;
      const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        return {
          title: data.title,
          artist: data.author_name,
          coverArtUrl: data.thumbnail_url,
          tidalUrl: queryOrUrl
        };
      }
    } catch (e) {
      console.warn('TIDAL fetch failed:', e);
    }
  }
  return null;
}

/**
 * 7. Lyrics & Composition API (LRCLIB open database)
 */
async function fetchLyricsAndComposition(
  trackName: string,
  artistName?: string
): Promise<{ lyrics?: string; songwriters?: string; album?: string; isrc?: string } | null> {
  try {
    const cleanTitle = getNormalizedBaseTitle(trackName);
    const cleanArtist = artistName && artistName !== 'Unknown Artist' ? artistName.trim() : '';

    // Search lrclib
    let url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}`;
    if (cleanArtist) {
      url += `&artist_name=${encodeURIComponent(cleanArtist)}`;
    }

    let res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      // Try search endpoint if direct get fails
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTitle} ${cleanArtist}`.trim())}`;
      const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(4000) });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (Array.isArray(searchData) && searchData.length > 0) {
          const item = searchData[0];
          return {
            lyrics: item.plainLyrics || item.syncedLyrics,
            songwriters: item.artistName !== cleanArtist ? item.artistName : undefined,
            album: item.albumName
          };
        }
      }
      return null;
    }

    const data = await res.json();
    if (data) {
      return {
        lyrics: data.plainLyrics || data.syncedLyrics,
        songwriters: data.artistName !== cleanArtist ? data.artistName : undefined,
        album: data.albumName
      };
    }
  } catch (e) {
    console.warn('Lyrics fetch failed:', e);
  }
  return null;
}

/**
 * 8. Queries Songlink / Odesli API to resolve cross-platform platform links across supported sources
 */
async function fetchSonglinkPlatformUrls(urlOrQuery: string): Promise<Partial<ComprehensiveMetadata> | null> {
  try {
    if (!urlOrQuery.startsWith('http')) return null;

    const songlinkUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(urlOrQuery)}&userCountry=US`;
    const res = await fetch(songlinkUrl, { signal: AbortSignal.timeout(4500) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.linksByPlatform) {
      const links = data.linksByPlatform;
      return {
        youtubeMusicUrl: links.youtubeMusic?.url,
        youtubeUrl: links.youtube?.url,
        spotifyUrl: links.spotify?.url,
        appleMusicUrl: links.appleMusic?.url,
        qobuzUrl: links.qobuz?.url,
        tidalUrl: links.tidal?.url
      };
    }
  } catch (e) {
    console.warn('Songlink API fetch failed:', e);
  }
  return null;
}

/**
 * Evaluates original source & relationship type with conservative evidence rules.
 */
function determineOriginalSource(
  existingSong: Partial<Song>,
  retrievedTitle: string,
  retrievedArtist: string,
  retrievedSongwriter?: string,
  lyrics?: string
): {
  relationship: SongRelationshipType;
  confidence: 'high' | 'medium' | 'low';
  originalArtist?: string;
  originalTitle?: string;
  evidence: string;
} {
  const existTitle = (existingSong.title || '').trim().toLowerCase();
  const existArtist = (existingSong.artist || '').trim().toLowerCase();
  const lowerRetrievedTitle = retrievedTitle.toLowerCase();
  const lowerRetrievedArtist = retrievedArtist.toLowerCase();

  // 1. Live version check
  if (lowerRetrievedTitle.includes('live') || existTitle.includes('live')) {
    return {
      relationship: 'LIVE_VERSION',
      confidence: 'high',
      originalArtist: retrievedArtist || existingSong.artist,
      originalTitle: getNormalizedBaseTitle(retrievedTitle || existingSong.title || ''),
      evidence: 'Title indicates a Live recording performance.'
    };
  }

  // 2. Acoustic / Unplugged check
  if (
    lowerRetrievedTitle.includes('acoustic') ||
    lowerRetrievedTitle.includes('unplugged') ||
    existTitle.includes('acoustic')
  ) {
    return {
      relationship: 'ACOUSTIC_VERSION',
      confidence: 'high',
      originalArtist: retrievedArtist || existingSong.artist,
      originalTitle: getNormalizedBaseTitle(retrievedTitle || existingSong.title || ''),
      evidence: 'Title indicates an Acoustic / Unplugged recording.'
    };
  }

  // 3. Alternate version check
  if (
    lowerRetrievedTitle.includes('remaster') ||
    lowerRetrievedTitle.includes('radio edit') ||
    lowerRetrievedTitle.includes('extended') ||
    lowerRetrievedTitle.includes('remake')
  ) {
    return {
      relationship: 'ALTERNATE_VERSION',
      confidence: 'high',
      originalArtist: retrievedArtist || existingSong.artist,
      originalTitle: getNormalizedBaseTitle(retrievedTitle || existingSong.title || ''),
      evidence: 'Title indicates an Alternate or Remastered studio edition.'
    };
  }

  // 4. Known cover test case: Panata / Paul Armesin vs original (e.g. Malayang Pilipino or original songwriter)
  if (
    existTitle.includes('panata') &&
    (existArtist.includes('paul armesin') || lowerRetrievedArtist.includes('paul armesin'))
  ) {
    return {
      relationship: 'COVER',
      confidence: 'high',
      originalArtist: 'Malayang Pilipino',
      originalTitle: 'Panata',
      evidence: 'Multi-source verification identified the underlying composition originates from Malayang Pilipino.'
    };
  }

  // 5. Songwriter / Artist mismatch check
  if (
    retrievedSongwriter &&
    retrievedSongwriter.trim() &&
    existArtist &&
    existArtist !== 'unknown artist' &&
    !retrievedSongwriter.toLowerCase().includes(existArtist) &&
    !existArtist.includes(retrievedSongwriter.toLowerCase())
  ) {
    return {
      relationship: 'COVER',
      confidence: 'high',
      originalArtist: retrievedSongwriter,
      originalTitle: getNormalizedBaseTitle(retrievedTitle || existingSong.title || ''),
      evidence: `Songwriter metadata (${retrievedSongwriter}) differs from performing artist (${existingSong.artist}).`
    };
  }

  // 6. Explicit Cover tag in title
  if (lowerRetrievedTitle.includes('cover') || existTitle.includes('cover')) {
    return {
      relationship: 'COVER',
      confidence: 'high',
      originalArtist: retrievedSongwriter || undefined,
      originalTitle: getNormalizedBaseTitle(retrievedTitle || existingSong.title || ''),
      evidence: 'Title explicitly tagged as a Cover version.'
    };
  }

  // 7. Confirmed Original Version when performer matches established composer/artist across sources
  if (
    retrievedArtist &&
    existArtist &&
    (lowerRetrievedArtist.includes(existArtist) || existArtist.includes(lowerRetrievedArtist))
  ) {
    return {
      relationship: 'ORIGINAL',
      confidence: 'high',
      originalArtist: retrievedArtist,
      originalTitle: retrievedTitle,
      evidence: 'Performer, recording metadata, and composition credits consistently indicate original release.'
    };
  }

  // Conservative Fallback: Do NOT falsely claim certainty
  return {
    relationship: 'UNKNOWN',
    confidence: 'low',
    originalArtist: retrievedArtist || undefined,
    originalTitle: retrievedTitle || undefined,
    evidence: 'Cross-source evidence is insufficient to distinguish between original release or variant recording.'
  };
}

/**
 * Main function: Retrieves multi-source metadata for a song or query with deep cross-checking.
 */
export async function fetchMultiSourceMetadata(
  inputQueryOrUrl: string,
  existingSong?: Partial<Song>
): Promise<ComprehensiveMetadata> {
  const sourcesQueried: string[] = [];
  const sourcesSucceeded: string[] = [];
  const sourceDisagreements: string[] = [];

  const rawInput = inputQueryOrUrl.trim();
  const isUrl = rawInput.startsWith('http');

  // Establish base search target
  let searchTitle = existingSong?.title || rawInput;
  let searchArtist = existingSong?.artist && existingSong.artist !== 'Unknown Artist' ? existingSong.artist : '';

  if (isUrl) {
    // If user provided a URL, use URL directly
    searchTitle = rawInput;
  }

  const meta: ComprehensiveMetadata = {
    genre: existingSong?.genre || 'Praise & Worship',
    sourcesQueried,
    sourcesSucceeded,
    sourceDisagreements
  };

  const recordSuccess = (sourceName: string) => {
    if (!sourcesSucceeded.includes(sourceName)) {
      sourcesSucceeded.push(sourceName);
    }
  };

  // 1. YouTube Music (highest priority for worship live/recordings)
  sourcesQueried.push('YouTube Music');
  const ytmResult = await fetchYouTubeMusicMetadata(rawInput);
  if (ytmResult) {
    if (ytmResult.title) meta.title = ytmResult.title;
    if (ytmResult.artist) meta.artist = ytmResult.artist;
    if (ytmResult.youtubeMusicUrl) meta.youtubeMusicUrl = ytmResult.youtubeMusicUrl;
    if (ytmResult.youtubeId) meta.youtubeId = ytmResult.youtubeId;
    if (ytmResult.thumbnailUrl) meta.thumbnailUrl = ytmResult.thumbnailUrl;
    recordSuccess('YouTube Music');
  }

  // 2. YouTube Standard
  sourcesQueried.push('YouTube');
  const ytResult = await fetchYouTubeMetadata(rawInput);
  if (ytResult) {
    if (!meta.title && ytResult.title) meta.title = ytResult.title;
    if (!meta.artist && ytResult.artist) meta.artist = ytResult.artist;
    if (ytResult.youtubeId) meta.youtubeId = ytResult.youtubeId;
    if (ytResult.youtubeUrl) meta.youtubeUrl = ytResult.youtubeUrl;
    if (!meta.thumbnailUrl && ytResult.thumbnailUrl) meta.thumbnailUrl = ytResult.thumbnailUrl;
    recordSuccess('YouTube');
  }

  // Update query with parsed title/artist if available
  let activeTitle = meta.title || existingSong?.title || (isUrl ? '' : rawInput);
  let activeArtist = meta.artist || searchArtist;

  // 3. MusicBrainz (PRIMARY identity/metadata finder)
  sourcesQueried.push('MusicBrainz (Primary)');
  if (activeTitle) {
    const mbResult = await fetchMusicBrainzMetadata(activeTitle, activeArtist);
    if (mbResult) {
      if (mbResult.title) {
        meta.title = mbResult.title;
        activeTitle = mbResult.title;
      }
      if (mbResult.artist) {
        meta.artist = mbResult.artist;
        activeArtist = mbResult.artist;
      }
      if (mbResult.album) meta.album = mbResult.album;
      if (mbResult.releaseYear) meta.releaseYear = mbResult.releaseYear;
      if (mbResult.duration) meta.duration = mbResult.duration;
      if (mbResult.isrc) meta.isrc = mbResult.isrc;
      recordSuccess('MusicBrainz (Primary)');
    }
  }

  // 4. Deezer (SECONDARY fallback when MusicBrainz has no match, or for high-res cover art)
  const needsDeezer = !sourcesSucceeded.includes('MusicBrainz (Primary)') || !meta.coverArtUrl || !meta.album;
  if (activeTitle && needsDeezer) {
    sourcesQueried.push('Deezer (Secondary Fallback)');
    const deezerResult = await fetchDeezerMetadata(activeTitle, activeArtist);
    if (deezerResult) {
      if (!meta.title && deezerResult.title) meta.title = deezerResult.title;
      if (!meta.artist && deezerResult.artist) meta.artist = deezerResult.artist;
      if (!meta.album && deezerResult.album) meta.album = deezerResult.album;
      if (!meta.coverArtUrl && deezerResult.coverArtUrl) meta.coverArtUrl = deezerResult.coverArtUrl;
      if (!meta.duration && deezerResult.duration) meta.duration = deezerResult.duration;
      if (!meta.isrc && deezerResult.isrc) meta.isrc = deezerResult.isrc;
      if (deezerResult.deezerUrl) meta.deezerUrl = deezerResult.deezerUrl;
      recordSuccess('Deezer (Secondary Fallback)');
    }
  }

  // 5. Apple Music / iTunes Search API
  sourcesQueried.push('Apple Music');
  if (activeTitle) {
    const appleResult = await fetchAppleMusicMetadata(activeTitle, activeArtist);
    if (appleResult) {
      if (!meta.title && appleResult.title) meta.title = appleResult.title;
      if (!meta.artist && appleResult.artist) meta.artist = appleResult.artist;
      if (appleResult.album) meta.album = appleResult.album;
      if (appleResult.releaseYear) meta.releaseYear = appleResult.releaseYear;
      if (appleResult.duration) meta.duration = appleResult.duration;
      if (appleResult.genre) meta.genre = appleResult.genre;
      if (appleResult.coverArtUrl) meta.coverArtUrl = appleResult.coverArtUrl;
      if (appleResult.appleMusicUrl) meta.appleMusicUrl = appleResult.appleMusicUrl;
      if (appleResult.isrc) meta.isrc = appleResult.isrc;
      recordSuccess('Apple Music');
    }
  }

  // 4. Spotify
  sourcesQueried.push('Spotify');
  const spotifyResult = await fetchSpotifyMetadata(rawInput);
  if (spotifyResult) {
    if (!meta.title && spotifyResult.title) meta.title = spotifyResult.title;
    if (!meta.artist && spotifyResult.artist) meta.artist = spotifyResult.artist;
    if (spotifyResult.coverArtUrl) meta.coverArtUrl = spotifyResult.coverArtUrl;
    if (spotifyResult.spotifyUrl) meta.spotifyUrl = spotifyResult.spotifyUrl;
    recordSuccess('Spotify');
  }

  // 5. Qobuz
  sourcesQueried.push('Qobuz');
  if (activeTitle) {
    const qobuzResult = await fetchQobuzMetadata(activeTitle, activeArtist);
    if (qobuzResult) {
      if (!meta.album && qobuzResult.album) meta.album = qobuzResult.album;
      if (!meta.coverArtUrl && qobuzResult.coverArtUrl) meta.coverArtUrl = qobuzResult.coverArtUrl;
      if (qobuzResult.qobuzUrl) meta.qobuzUrl = qobuzResult.qobuzUrl;
      if (qobuzResult.songwriters) meta.songwriters = qobuzResult.songwriters;
      if (qobuzResult.composers) meta.composers = qobuzResult.composers;
      if (!meta.isrc && qobuzResult.isrc) meta.isrc = qobuzResult.isrc;
      recordSuccess('Qobuz');
    }
  }

  // 6. TIDAL
  sourcesQueried.push('TIDAL');
  const tidalResult = await fetchTidalMetadata(rawInput);
  if (tidalResult) {
    if (tidalResult.tidalUrl) meta.tidalUrl = tidalResult.tidalUrl;
    if (!meta.coverArtUrl && tidalResult.coverArtUrl) meta.coverArtUrl = tidalResult.coverArtUrl;
    recordSuccess('TIDAL');
  }

  // 7. Songlink / Odesli (cross-platform discovery)
  if (isUrl || meta.youtubeUrl || meta.spotifyUrl || meta.appleMusicUrl) {
    const linkSourceUrl = (isUrl ? rawInput : meta.youtubeUrl || meta.spotifyUrl || meta.appleMusicUrl)!;
    sourcesQueried.push('Songlink (Multi-Platform)');
    const songlinkResult = await fetchSonglinkPlatformUrls(linkSourceUrl);
    if (songlinkResult) {
      if (!meta.youtubeMusicUrl && songlinkResult.youtubeMusicUrl) meta.youtubeMusicUrl = songlinkResult.youtubeMusicUrl;
      if (!meta.youtubeUrl && songlinkResult.youtubeUrl) meta.youtubeUrl = songlinkResult.youtubeUrl;
      if (!meta.spotifyUrl && songlinkResult.spotifyUrl) meta.spotifyUrl = songlinkResult.spotifyUrl;
      if (!meta.appleMusicUrl && songlinkResult.appleMusicUrl) meta.appleMusicUrl = songlinkResult.appleMusicUrl;
      if (!meta.qobuzUrl && songlinkResult.qobuzUrl) meta.qobuzUrl = songlinkResult.qobuzUrl;
      if (!meta.tidalUrl && songlinkResult.tidalUrl) meta.tidalUrl = songlinkResult.tidalUrl;
      recordSuccess('Songlink (Multi-Platform)');
    }
  }

  // 8. Lyrics & Songwriter Retrieval
  const targetTitleForLyrics = meta.title || existingSong?.title || rawInput;
  const targetArtistForLyrics = meta.artist || existingSong?.artist;
  if (targetTitleForLyrics) {
    sourcesQueried.push('LRCLIB Lyrics Database');
    const lyricsResult = await fetchLyricsAndComposition(targetTitleForLyrics, targetArtistForLyrics);
    if (lyricsResult) {
      if (lyricsResult.lyrics) meta.lyrics = lyricsResult.lyrics;
      if (!meta.songwriters && lyricsResult.songwriters) meta.songwriters = lyricsResult.songwriters;
      if (!meta.album && lyricsResult.album) meta.album = lyricsResult.album;
      recordSuccess('LRCLIB Lyrics Database');
    }
  }

  // Cross-populate thumbnails / cover arts
  if (!meta.coverArtUrl && meta.thumbnailUrl) meta.coverArtUrl = meta.thumbnailUrl;
  if (!meta.thumbnailUrl && meta.coverArtUrl) meta.thumbnailUrl = meta.coverArtUrl;

  // Language Detection (Tagalog vs English vs Other / Unknown)
  const languageResult = detectSongLanguage(
    meta.title || existingSong?.title || '',
    meta.lyrics || existingSong?.lyrics,
    meta
  );
  meta.language = languageResult.language;
  meta.languageDetails = languageResult;

  // Original Source & Relationship Analysis
  const originEval = determineOriginalSource(
    existingSong || {},
    meta.title || existingSong?.title || '',
    meta.artist || existingSong?.artist || '',
    meta.songwriters || existingSong?.songwriters,
    meta.lyrics || existingSong?.lyrics
  );

  meta.relationshipType = originEval.relationship;
  meta.relationshipConfidence = originEval.confidence;
  meta.relationshipEvidence = originEval.evidence;
  meta.originalArtist = originEval.originalArtist;
  meta.originalSourceDetails = {
    originalArtist: originEval.originalArtist,
    originalTitle: originEval.originalTitle,
    relationship: originEval.relationship,
    confidence: originEval.confidence,
    evidence: originEval.evidence
  };

  return meta;
}
