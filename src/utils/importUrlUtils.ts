import { extractYouTubeId } from '../services/songService';
import { extractPlaylistId } from '../services/youtubePlaylistService';

export type DetectedImportType = 'song' | 'playlist' | 'invalid';

export interface URLDetectionResult {
  type: DetectedImportType;
  id?: string;
  secondaryId?: string; // e.g. single videoId when a watch URL also contains list=
  normalizedUrl: string;
  source: 'youtube' | 'youtube_music' | 'other';
}

/**
 * Automatically detects whether a YouTube or YouTube Music URL/ID is a single song or a playlist.
 * If a URL contains both a video and a playlist (e.g. watch?v=...&list=...), it deliberately
 * treats it as a playlist as required by WWCF Line-up Scheduler rules, while preserving the videoId in secondaryId.
 */
export function detectYouTubeImportType(rawUrl: string): URLDetectionResult {
  if (!rawUrl || !rawUrl.trim()) {
    return { type: 'invalid', normalizedUrl: '', source: 'other' };
  }

  const trimmed = rawUrl.trim();
  const isYtMusic = trimmed.includes('music.youtube.com');
  const isYt = trimmed.includes('youtube.com') || trimmed.includes('youtu.be') || isYtMusic;
  const source: 'youtube' | 'youtube_music' | 'other' = isYtMusic
    ? 'youtube_music'
    : isYt
    ? 'youtube'
    : 'other';

  // 1. Structured URL parsing
  try {
    const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const pathname = urlObj.pathname;
    const listParam = urlObj.searchParams.get('list');
    const vParam = urlObj.searchParams.get('v');

    // Explicit Playlist endpoint (e.g. /playlist?list=PL...)
    if (pathname.includes('/playlist') && listParam) {
      return {
        type: 'playlist',
        id: listParam,
        secondaryId: vParam && vParam.length === 11 ? vParam : undefined,
        normalizedUrl: isYtMusic
          ? `https://music.youtube.com/playlist?list=${listParam}`
          : `https://www.youtube.com/playlist?list=${listParam}`,
        source
      };
    }

    // If list parameter is present (even on watch?v=...&list=... or music.youtube.com/watch?v=...&list=...)
    // Treat as playlist if listParam is valid
    if (listParam && (
      listParam.startsWith('PL') ||
      listParam.startsWith('OLAK') ||
      listParam.startsWith('RD') ||
      listParam.startsWith('UU') ||
      listParam.startsWith('FL') ||
      listParam.startsWith('LL') ||
      listParam.startsWith('TL') ||
      listParam.length >= 10
    )) {
      return {
        type: 'playlist',
        id: listParam,
        secondaryId: vParam && vParam.length === 11 ? vParam : undefined,
        normalizedUrl: isYtMusic
          ? `https://music.youtube.com/playlist?list=${listParam}`
          : `https://www.youtube.com/playlist?list=${listParam}`,
        source
      };
    }

    // If watch?v= parameter is present without a valid playlist list parameter
    if (vParam && vParam.length === 11) {
      return {
        type: 'song',
        id: vParam,
        normalizedUrl: isYtMusic
          ? `https://music.youtube.com/watch?v=${vParam}`
          : `https://www.youtube.com/watch?v=${vParam}`,
        source
      };
    }

    // youtu.be/VIDEO_ID or shorts/VIDEO_ID
    if (pathname.includes('/shorts/')) {
      const shortsId = pathname.split('/shorts/')[1]?.split(/[?&#]/)[0];
      if (shortsId && shortsId.length === 11) {
        return {
          type: 'song',
          id: shortsId,
          normalizedUrl: `https://www.youtube.com/watch?v=${shortsId}`,
          source
        };
      }
    }

    if (urlObj.hostname === 'youtu.be') {
      const shortId = pathname.replace(/^\//, '').split(/[?&#]/)[0];
      if (shortId && shortId.length === 11) {
        return {
          type: 'song',
          id: shortId,
          normalizedUrl: `https://www.youtube.com/watch?v=${shortId}`,
          source
        };
      }
    }
  } catch {
    // Ignore URL parse error and fall through to regex tests
  }

  // 2. Regex fallback for playlist vs song
  const playlistId = extractPlaylistId(trimmed);
  const videoId = extractYouTubeId(trimmed);

  // If URL text explicitly points to playlist
  if (trimmed.includes('playlist?list=') && playlistId) {
    return {
      type: 'playlist',
      id: playlistId,
      normalizedUrl: isYtMusic
        ? `https://music.youtube.com/playlist?list=${playlistId}`
        : `https://www.youtube.com/playlist?list=${playlistId}`,
      source
    };
  }

  // Raw playlist ID pattern (e.g. starts with PL, OLAK, RD, UU, FL, LL, TL)
  if (/^(PL|OLAK|RD|UU|FL|LL|TL)[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return {
      type: 'playlist',
      id: trimmed,
      normalizedUrl: `https://www.youtube.com/playlist?list=${trimmed}`,
      source: 'youtube'
    };
  }

  // If video ID matched and not explicitly a playlist URL or list parameter
  if (videoId && !trimmed.includes('/playlist') && !trimmed.includes('list=')) {
    return {
      type: 'song',
      id: videoId,
      normalizedUrl: isYtMusic
        ? `https://music.youtube.com/watch?v=${videoId}`
        : `https://www.youtube.com/watch?v=${videoId}`,
      source
    };
  }

  // Fallback to playlistId if videoId was not matched
  if (playlistId) {
    return {
      type: 'playlist',
      id: playlistId,
      normalizedUrl: isYtMusic
        ? `https://music.youtube.com/playlist?list=${playlistId}`
        : `https://www.youtube.com/playlist?list=${playlistId}`,
      source
    };
  }

  // Fallback to videoId
  if (videoId) {
    return {
      type: 'song',
      id: videoId,
      normalizedUrl: isYtMusic
        ? `https://music.youtube.com/watch?v=${videoId}`
        : `https://www.youtube.com/watch?v=${videoId}`,
      source
    };
  }

  return {
    type: 'invalid',
    normalizedUrl: trimmed,
    source
  };
}
