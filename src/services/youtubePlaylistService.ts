import { extractYouTubeId, SongService } from './songService';
import { Song } from '../types';
import { getManilaTodayString } from '../utils/dateUtils';
import { detectSongVersionType } from '../utils/versionDetectionUtils';

export interface PlaylistItem {
  videoId: string;
  youtubeUrl: string;
  title: string;
  artist: string;
  album?: string;
  duration?: string; // e.g. "4:15"
  thumbnailUrl: string;
  playlistPosition: number;
  category?: 'praise' | 'worship';
}

export interface YouTubePlaylistPreview {
  playlistId: string;
  playlistName: string;
  playlistDescription?: string;
  playlistThumbnail: string;
  playlistUrl: string;
  privacyStatus?: 'public' | 'unlisted' | 'private' | string;
  itemCount: number;
  items: PlaylistItem[];
  totalSongs: number;
  skippedUnavailable: number;
  estimatedTotalDuration: string; // e.g. "22 mins" or "1 hr 15 mins"
}

export interface ImportSummary {
  totalImported: number;
  newlyAdded: number;
  existingFound: number;
  skippedErrors: number;
  existingSongTitles: string[];
  newSongTitles: string[];
}

export type YouTubeApiErrorCode =
  | 'YOUTUBE_API_KEY_MISSING'
  | 'YOUTUBE_API_KEY_INVALID'
  | 'YOUTUBE_API_QUOTA_EXCEEDED'
  | 'YOUTUBE_API_FORBIDDEN'
  | 'YOUTUBE_API_NOT_ENABLED'
  | 'YOUTUBE_PLAYLIST_NOT_FOUND'
  | 'YOUTUBE_PLAYLIST_PRIVATE'
  | 'YOUTUBE_PLAYLIST_ITEMS_NOT_ACCESSIBLE'
  | 'YOUTUBE_PLAYLIST_EMPTY'
  | 'YOUTUBE_PLAYLIST_ITEMS_UNAVAILABLE'
  | 'YOUTUBE_NETWORK_ERROR'
  | 'YOUTUBE_INVALID_URL';

export class YouTubeApiException extends Error {
  errorCode: YouTubeApiErrorCode;
  constructor(errorCode: YouTubeApiErrorCode, message: string) {
    super(message);
    this.name = 'YouTubeApiException';
    this.errorCode = errorCode;
  }
}

export interface ServerYouTubePlaylistSuccess {
  success: true;
  playlist: YouTubePlaylistPreview;
}

export interface ServerYouTubePlaylistError {
  success: false;
  errorCode: YouTubeApiErrorCode;
  message: string;
}

export type ServerYouTubePlaylistResponse = ServerYouTubePlaylistSuccess | ServerYouTubePlaylistError;

/**
 * Helper to extract playlist ID from YouTube / YouTube Music URL
 */
export function extractPlaylistId(urlStr: string): string | null {
  if (!urlStr) return null;
  const trimmed = urlStr.trim();

  try {
    const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const listParam = urlObj.searchParams.get('list');
    if (listParam && listParam.trim()) {
      return listParam.trim();
    }
  } catch (e) {
    // ignore URL parse error and fall back to regex
  }

  // Regex fallback for list= parameter
  const match = trimmed.match(/[?&]list=([^&#\s]+)/);
  if (match && match[1]) {
    return match[1].trim();
  }

  // If user pasted raw playlist ID (typically starting with PL, OLAK, RD, UU, FL, LL, TL)
  if (/^(PL|OLAK|RD|UU|FL|LL|TL)[a-zA-Z0-9_-]+$/.test(trimmed) || /^[a-zA-Z0-9_-]{12,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Formats seconds to "MM:SS" or "H:MM:SS"
 */
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '3:45';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Parses ISO 8601 duration string (e.g., "PT4M15S" or "PT1H2M3S") into "MM:SS" or "H:MM:SS"
 */
export function parseISO8601Duration(isoDuration?: string): string {
  if (!isoDuration) return '3:45';
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '3:45';
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  const secsFormatted = seconds < 10 ? `0${seconds}` : `${seconds}`;
  if (hours > 0) {
    return `${hours}:${minutes < 10 ? '0' : ''}${minutes}:${secsFormatted}`;
  }
  return `${minutes}:${secsFormatted}`;
}

/**
 * Calculates estimated total duration in human readable format
 */
export function calculateTotalDuration(items: PlaylistItem[]): string {
  let totalSec = 0;
  items.forEach((item) => {
    if (item.duration) {
      const parts = item.duration.split(':').map(Number);
      if (parts.length === 3) {
        totalSec += parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        totalSec += parts[0] * 60 + parts[1];
      }
    } else {
      totalSec += 225; // default estimate
    }
  });

  const mins = Math.round(totalSec / 60);
  if (mins < 60) {
    return `${mins} mins`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours} hr${hours > 1 ? 's' : ''} ${remMins} min${remMins !== 1 ? 's' : ''}`;
}

/**
 * Clean channel name
 */
export function channelNameFormatter(channelName?: string): string {
  if (!channelName) return 'Unknown Artist';
  const clean = channelName.replace(/\s*-\s*Topic$/i, '').trim();
  if (clean.toLowerCase() === 'various artists' || clean.toLowerCase() === 'youtube') {
    return 'Worship Team';
  }
  return clean;
}

/**
 * Clean YouTube Title into (Artist, Title)
 */
export function parseYouTubeTitle(rawTitle: string, channelName?: string): { title: string; artist: string } {
  const clean = rawTitle
    .replace(/\s*[\(\[](Official|Live|Lyrics|Video|Audio|HD|4K|Worship|Music Video|Visualizer|Lyric Video).*?[\)\]]/gi, '')
    .trim();

  let artist = channelName ? channelNameFormatter(channelName) : 'Unknown Artist';
  let title = clean;

  if (clean.includes(' - ')) {
    const parts = clean.split(' - ');
    artist = parts[0].trim();
    title = parts.slice(1).join(' - ').trim();
  } else if (clean.includes(' | ')) {
    const parts = clean.split(' | ');
    title = parts[0].trim();
    artist = parts[1].trim();
  }

  return { title, artist };
}

export class YouTubePlaylistService {
  /**
   * Resolve YouTube API key from client-accessible sources
   */
  static getClientApiKey(customKey?: string): string {
    if (customKey && customKey.trim()) {
      return customKey.trim();
    }
    const envKey =
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_YOUTUBE_API_KEY) ||
      (typeof process !== 'undefined' ? process.env?.VITE_YOUTUBE_API_KEY || process.env?.YOUTUBE_API_KEY : undefined);

    if (
      envKey &&
      typeof envKey === 'string' &&
      envKey.trim() &&
      envKey !== 'MY_YOUTUBE_API_KEY' &&
      envKey !== '""' &&
      envKey !== "''"
    ) {
      return envKey.trim();
    }

    if (typeof localStorage !== 'undefined') {
      const localKey = localStorage.getItem('YOUTUBE_API_KEY');
      if (localKey && typeof localKey === 'string' && localKey.trim()) {
        return localKey.trim();
      }
    }

    return '';
  }

  /**
   * Checks if server has an official YouTube API key configured
   */
  static async checkServerStatus(): Promise<{ configured: boolean; provider: string }> {
    try {
      const res = await fetch('/api/youtube/status');
      if (res.ok) {
        const json = await res.json();
        return {
          configured: Boolean(json.configured),
          provider: json.provider || 'youtube-data-api-v3'
        };
      }
    } catch {
      // ignore network errors
    }
    return { configured: false, provider: 'youtube-data-api-v3' };
  }

  /**
   * Fetches full playlist metadata and list of songs.
   * Priority:
   * 1. Express backend route /api/youtube/playlist (protects server keys, handles custom keys securely)
   * 2. Direct browser official YouTube API (fallback if server route unreachable)
   * 3. Fallback mirrors (only if no key configured anywhere and verified playable items returned)
   */
  static async fetchPlaylistPreview(urlOrId: string, customApiKey?: string): Promise<YouTubePlaylistPreview> {
    const playlistId = extractPlaylistId(urlOrId);
    if (!playlistId) {
      throw new YouTubeApiException(
        'YOUTUBE_INVALID_URL',
        'Invalid YouTube or YouTube Music playlist link. Please provide a valid URL containing the "list=" parameter (e.g. https://music.youtube.com/playlist?list=PL...)'
      );
    }

    const cleanPlaylistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;

    // 1. Try server-side proxy route FIRST
    try {
      const serverRes = await fetch('/api/youtube/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlistId,
          apiKey: customApiKey?.trim() || undefined
        })
      });

      if (serverRes.ok || serverRes.status === 400 || serverRes.status === 403 || serverRes.status === 404) {
        const data: ServerYouTubePlaylistResponse = await serverRes.json();
        if (data.success === true) {
          return data.playlist;
        } else {
          const errData = data as ServerYouTubePlaylistError;
          throw new YouTubeApiException(
            errData.errorCode || 'YOUTUBE_NETWORK_ERROR',
            errData.message || 'YouTube playlist error'
          );
        }
      }
    } catch (err: any) {
      if (err instanceof YouTubeApiException) {
        throw err;
      }
      // If server fetch failed with a network error, proceed to direct client attempt
      console.warn('[YouTubePlaylistService] Server proxy unavailable, attempting direct client fetch...');
    }

    // 2. Direct client-side official YouTube API attempt
    const resolvedClientKey = this.getClientApiKey(customApiKey);
    if (resolvedClientKey) {
      try {
        return await this.fetchViaOfficialYouTubeAPI(playlistId, cleanPlaylistUrl, resolvedClientKey);
      } catch (err: any) {
        if (err instanceof YouTubeApiException) {
          throw err;
        }
        throw new YouTubeApiException('YOUTUBE_NETWORK_ERROR', err.message || 'Unable to reach YouTube API.');
      }
    }

    // 3. No key configured on server and no user key provided
    // Attempt fallback mirror endpoints as last resort, strictly validating non-empty playable items
    try {
      return await this.fetchViaFallbackProxies(playlistId, cleanPlaylistUrl);
    } catch {
      throw new YouTubeApiException(
        'YOUTUBE_API_KEY_MISSING',
        'A YouTube Data API v3 key is required to import playlists. Click "Get / Manage YouTube API Key" to create or view your key in Google Cloud Credentials, then enter it below.'
      );
    }
  }

  /**
   * Fetches playlist directly via official YouTube Data API v3.
   * Can be executed on both client and server.
   */
  static async fetchViaOfficialYouTubeAPI(
    playlistId: string,
    cleanPlaylistUrl: string,
    apiKey: string
  ): Promise<YouTubePlaylistPreview> {
    if (!apiKey || !apiKey.trim()) {
      throw new YouTubeApiException(
        'YOUTUBE_API_KEY_MISSING',
        'A YouTube Data API v3 key is required to import playlists. Click "Get / Manage YouTube API Key" to configure your key.'
      );
    }

    const trimmedKey = apiKey.trim();

    // 1. Fetch Playlist Header Info via playlists.list (including snippet, contentDetails, status)
    const playlistMetaUrl = `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails,status&id=${encodeURIComponent(
      playlistId
    )}&key=${encodeURIComponent(trimmedKey)}`;

    let playlistMetaRes: Response;
    try {
      playlistMetaRes = await fetch(playlistMetaUrl);
    } catch (networkErr: any) {
      throw new YouTubeApiException(
        'YOUTUBE_NETWORK_ERROR',
        'Unable to reach YouTube. Please check your internet connection and try again.'
      );
    }

    if (!playlistMetaRes.ok) {
      const errJson = await playlistMetaRes.json().catch(() => ({}));
      const errorObj = errJson?.error;
      const reason = errorObj?.errors?.[0]?.reason || '';
      const status = playlistMetaRes.status;

      if (reason === 'keyInvalid' || (status === 400 && errorObj?.message?.toLowerCase().includes('key'))) {
        throw new YouTubeApiException(
          'YOUTUBE_API_KEY_INVALID',
          'YouTube rejected the API key (invalid key). Please check your key in Google Cloud Credentials.'
        );
      }
      if (reason === 'quotaExceeded' || (status === 403 && errorObj?.message?.toLowerCase().includes('quota'))) {
        throw new YouTubeApiException(
          'YOUTUBE_API_QUOTA_EXCEEDED',
          'YouTube API daily quota has been exceeded for this API key. Please try another key or try again later.'
        );
      }
      if (
        reason === 'accessNotConfigured' ||
        errorObj?.message?.includes('YouTube Data API v3 has not been used') ||
        errorObj?.message?.includes('is not enabled')
      ) {
        throw new YouTubeApiException(
          'YOUTUBE_API_NOT_ENABLED',
          'YouTube Data API v3 is not enabled in your Google Cloud project. Please enable it in the Google Cloud Console.'
        );
      }
      if (status === 403) {
        throw new YouTubeApiException(
          'YOUTUBE_API_FORBIDDEN',
          'Access to the YouTube Data API is restricted or forbidden for this API key. Please check key restrictions in Google Cloud Console.'
        );
      }
      if (status === 404) {
        throw new YouTubeApiException(
          'YOUTUBE_PLAYLIST_NOT_FOUND',
          'Playlist not found. Please verify the playlist link is correct and set to Public or Unlisted.'
        );
      }

      throw new YouTubeApiException(
        'YOUTUBE_NETWORK_ERROR',
        errorObj?.message || `YouTube API error (status ${status})`
      );
    }

    const playlistMetaJson = await playlistMetaRes.json();
    if (!playlistMetaJson.items || playlistMetaJson.items.length === 0) {
      throw new YouTubeApiException(
        'YOUTUBE_PLAYLIST_NOT_FOUND',
        'Playlist not found, deleted, or set to Private. (Note: Unlisted playlists accessible by URL can be imported, but Private playlists require account authorization).'
      );
    }

    const playlistItemMeta = playlistMetaJson.items[0];
    const playlistSnippet = playlistItemMeta.snippet || {};
    const playlistStatus = playlistItemMeta.status || {};
    const playlistContentDetails = playlistItemMeta.contentDetails || {};

    const privacyStatus = (playlistStatus.privacyStatus || 'public').toLowerCase();
    if (privacyStatus === 'private') {
      throw new YouTubeApiException(
        'YOUTUBE_PLAYLIST_PRIVATE',
        'This playlist is set to Private. Private playlists require account authorization and cannot be imported by URL. Please change the playlist to Public or Unlisted to import.'
      );
    }

    const playlistName = playlistSnippet.title || 'YouTube Worship Playlist';
    const playlistDescription = playlistSnippet.description || '';
    const playlistThumbnail =
      playlistSnippet.thumbnails?.maxres?.url ||
      playlistSnippet.thumbnails?.standard?.url ||
      playlistSnippet.thumbnails?.high?.url ||
      playlistSnippet.thumbnails?.medium?.url ||
      playlistSnippet.thumbnails?.default?.url ||
      '';

    const reportedItemCount =
      typeof playlistContentDetails.itemCount === 'number' ? playlistContentDetails.itemCount : 0;

    // 2. Fetch Playlist Items via playlistItems.list with pagination
    let pageToken = '';
    const rawItems: {
      videoId: string;
      title: string;
      artist: string;
      thumbnailUrl: string;
      position: number;
    }[] = [];
    let skippedUnavailable = 0;
    let pageCount = 0;
    const MAX_PAGES = 10; // Up to 500 items

    do {
      pageCount++;
      let itemsUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails,status&playlistId=${encodeURIComponent(
        playlistId
      )}&maxResults=50&key=${encodeURIComponent(trimmedKey)}`;
      if (pageToken) {
        itemsUrl += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      let itemsRes: Response;
      try {
        itemsRes = await fetch(itemsUrl);
      } catch (err: any) {
        throw new YouTubeApiException(
          'YOUTUBE_NETWORK_ERROR',
          'Network connection interrupted while retrieving playlist songs.'
        );
      }

      if (!itemsRes.ok) {
        const errJson = await itemsRes.json().catch(() => ({}));
        const errorObj = errJson?.error;
        const reason = errorObj?.errors?.[0]?.reason || '';

        if (itemsRes.status === 403 && reason === 'quotaExceeded') {
          throw new YouTubeApiException(
            'YOUTUBE_API_QUOTA_EXCEEDED',
            'YouTube API daily quota exceeded while retrieving playlist items.'
          );
        }
        if (reason === 'playlistItemsNotAccessible') {
          throw new YouTubeApiException(
            'YOUTUBE_PLAYLIST_ITEMS_NOT_ACCESSIBLE',
            'The items in this playlist are not accessible with the current credentials.'
          );
        }
        break;
      }

      const itemsJson = await itemsRes.json();
      const items = itemsJson?.items || [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const snippet = item.snippet;
        const status = item.status;
        const videoId = (item.contentDetails?.videoId || snippet?.resourceId?.videoId || '').trim();

        // Safe handling of unavailable / deleted / private videos
        const rawTitle = (snippet?.title || '').trim();
        const itemPrivacy = (status?.privacyStatus || '').toLowerCase();

        if (
          !videoId ||
          videoId.length !== 11 ||
          rawTitle === 'Private video' ||
          rawTitle === 'Deleted video' ||
          itemPrivacy === 'private'
        ) {
          skippedUnavailable++;
          continue;
        }

        const channelTitle = snippet?.videoOwnerChannelTitle || snippet?.channelTitle || '';
        const { title, artist } = parseYouTubeTitle(rawTitle, channelTitle);
        const thumbnail =
          snippet?.thumbnails?.maxres?.url ||
          snippet?.thumbnails?.standard?.url ||
          snippet?.thumbnails?.high?.url ||
          snippet?.thumbnails?.medium?.url ||
          snippet?.thumbnails?.default?.url ||
          `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

        const position = typeof snippet?.position === 'number' ? snippet.position + 1 : rawItems.length + 1;

        rawItems.push({
          videoId,
          title,
          artist,
          thumbnailUrl: thumbnail,
          position
        });
      }

      pageToken = itemsJson.nextPageToken || '';
    } while (pageToken && pageCount < MAX_PAGES);

    if (rawItems.length === 0) {
      if (skippedUnavailable > 0) {
        throw new YouTubeApiException(
          'YOUTUBE_PLAYLIST_ITEMS_UNAVAILABLE',
          `This playlist contains ${skippedUnavailable} entries, but all videos are deleted, private, or unavailable.`
        );
      }
      throw new YouTubeApiException(
        'YOUTUBE_PLAYLIST_EMPTY',
        'This playlist is accessible but contains no playable songs (empty playlist).'
      );
    }

    // 3. Fetch Video Durations & Channel Details via videos.list in chunks of 50
    const videoDetailsMap = new Map<string, { duration: string; artist?: string }>();
    const allVideoIds = rawItems.map((item) => item.videoId);

    for (let i = 0; i < allVideoIds.length; i += 50) {
      const chunk = allVideoIds.slice(i, i + 50);
      const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=${chunk.join(
        ','
      )}&key=${encodeURIComponent(trimmedKey)}`;

      try {
        const videosRes = await fetch(videosUrl);
        if (videosRes.ok) {
          const videosJson = await videosRes.json();
          const videoItems = videosJson?.items || [];

          for (const v of videoItems) {
            const vId = v.id;
            const isoDuration = v.contentDetails?.duration;
            const parsedDuration = parseISO8601Duration(isoDuration);
            const channelTitle = v.snippet?.channelTitle;

            videoDetailsMap.set(vId, {
              duration: parsedDuration,
              artist: channelTitle ? channelNameFormatter(channelTitle) : undefined
            });
          }
        }
      } catch (err) {
        console.warn('[YouTubePlaylistService] Failed to fetch video details chunk:', err);
      }
    }

    // Assemble final items list maintaining YouTube order
    const playlistItems: PlaylistItem[] = rawItems.map((item) => {
      const details = videoDetailsMap.get(item.videoId);
      return {
        videoId: item.videoId,
        youtubeUrl: `https://www.youtube.com/watch?v=${item.videoId}`,
        title: item.title,
        artist: details?.artist && item.artist === 'Unknown Artist' ? details.artist : item.artist,
        album: playlistName,
        duration: details?.duration || '3:45',
        thumbnailUrl: item.thumbnailUrl,
        playlistPosition: item.position
      };
    });

    const finalThumbnail = playlistThumbnail || playlistItems[0]?.thumbnailUrl || '';

    return {
      playlistId,
      playlistName,
      playlistDescription,
      playlistThumbnail: finalThumbnail,
      playlistUrl: cleanPlaylistUrl,
      privacyStatus,
      itemCount: reportedItemCount || playlistItems.length + skippedUnavailable,
      items: playlistItems,
      totalSongs: playlistItems.length,
      skippedUnavailable,
      estimatedTotalDuration: calculateTotalDuration(playlistItems)
    };
  }

  /**
   * Emergency fallback method using public endpoints only when no API key is configured.
   * Strictly validates that real, playable video items are returned.
   */
  private static async fetchViaFallbackProxies(
    playlistId: string,
    cleanPlaylistUrl: string
  ): Promise<YouTubePlaylistPreview> {
    const endpoints = [
      `https://pipedapi.kavin.rocks/playlists/${playlistId}`,
      `https://api.piped.private.coffee/playlists/${playlistId}`,
      `https://invidious.nerdvpn.de/api/v1/playlists/${playlistId}`,
      `https://vid.puffyan.us/api/v1/playlists/${playlistId}`
    ];

    let fetchedData: any = null;

    for (const ep of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(ep, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const json = await res.json();
          const candidateVideos = json?.relatedStreams || json?.videos || [];
          if (Array.isArray(candidateVideos) && candidateVideos.length > 0) {
            fetchedData = json;
            break;
          }
        }
      } catch (e: any) {
        console.warn(`[YouTubePlaylistService] Fallback endpoint ${ep} failed:`, e.message);
      }
    }

    if (fetchedData) {
      const playlistName = fetchedData.title || fetchedData.playlistName || 'Worship Playlist';
      const playlistThumbnail =
        fetchedData.thumbnailUrl ||
        fetchedData.bannerUrl ||
        (fetchedData.relatedStreams && fetchedData.relatedStreams[0]?.thumbnail) ||
        `https://img.youtube.com/vi/${fetchedData.relatedStreams?.[0]?.url?.split('v=')?.[1] || 'default'}/hqdefault.jpg`;

      const rawVideos = (fetchedData.relatedStreams || fetchedData.videos || []).filter(
        (v: any) => v && (v.title || v.videoId || v.url)
      );

      if (rawVideos.length === 0) {
        throw new YouTubeApiException(
          'YOUTUBE_PLAYLIST_EMPTY',
          'This playlist is accessible but contains no importable songs.'
        );
      }

      const items: PlaylistItem[] = [];
      let skippedUnavailable = 0;

      for (let index = 0; index < rawVideos.length; index++) {
        const v = rawVideos[index];
        let videoId = '';
        if (v.url) {
          const match = v.url.match(/v=([^&]+)/);
          if (match && match[1]?.length === 11) videoId = match[1];
        }
        if (!videoId && v.videoId && v.videoId.length === 11) {
          videoId = v.videoId;
        }

        if (!videoId) {
          skippedUnavailable++;
          continue; // Never create fake synthetic IDs
        }

        const { title, artist } = parseYouTubeTitle(v.title || 'Untitled Song', v.uploaderName || v.author);
        const durationSec = typeof v.duration === 'number' ? v.duration : parseInt(v.duration || '210', 10);
        const thumbnailUrl =
          v.thumbnail || v.videoThumbnails?.[0]?.url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

        items.push({
          videoId,
          youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
          title,
          artist,
          album: v.album || playlistName,
          duration: formatDuration(durationSec),
          thumbnailUrl,
          playlistPosition: items.length + 1
        });
      }

      if (items.length === 0) {
        throw new YouTubeApiException(
          'YOUTUBE_PLAYLIST_ITEMS_UNAVAILABLE',
          'No playable videos could be parsed from this playlist.'
        );
      }

      return {
        playlistId,
        playlistName,
        playlistThumbnail,
        playlistUrl: cleanPlaylistUrl,
        privacyStatus: 'public',
        itemCount: items.length + skippedUnavailable,
        items,
        totalSongs: items.length,
        skippedUnavailable,
        estimatedTotalDuration: calculateTotalDuration(items)
      };
    }

    throw new YouTubeApiException(
      'YOUTUBE_API_KEY_MISSING',
      `Unable to fetch playlist "${playlistId}". Please configure an official YouTube Data API v3 key.`
    );
  }

  /**
   * Save selected items into Song Database with duplicate detection,
   * preserving usage history and metadata as specified.
   */
  static async importPlaylistSongs(
    selectedItems: PlaylistItem[],
    playlistMeta: { playlistId: string; playlistName: string }
  ): Promise<{ summary: ImportSummary; importedSongs: Song[] }> {
    console.log(
      `[YouTubePlaylistService] Starting import of ${selectedItems.length} songs from playlist "${playlistMeta.playlistName}" (${playlistMeta.playlistId})`
    );

    const summary: ImportSummary = {
      totalImported: selectedItems.length,
      newlyAdded: 0,
      existingFound: 0,
      skippedErrors: 0,
      existingSongTitles: [],
      newSongTitles: []
    };

    const importedSongs: Song[] = [];
    const dateImported = getManilaTodayString();

    for (let idx = 0; idx < selectedItems.length; idx++) {
      const item = selectedItems[idx];
      // Category assignment rule:
      // 1. Honor the user-reviewed category stored on the item if present
      // 2. Fallback initialization rule:
      //    - Exactly 2 songs: Song 1 (idx 0) -> praise, Song 2 (idx 1) -> worship
      //    - 3 or more songs: Song 1 & 2 (idx < 2) -> praise, Song 3+ (idx >= 2) -> worship
      const fallbackCategory: 'praise' | 'worship' =
        selectedItems.length === 2
          ? (idx === 0 ? 'praise' : 'worship')
          : (idx < 2 ? 'praise' : 'worship');
      const assignedCategory: 'praise' | 'worship' = item.category || fallbackCategory;

      try {
        // Duplicate check against Song Database (checking Video ID, YouTube URL, Artist, and Title)
        const dupMatch = await SongService.detectSongConflict({
          title: item.title,
          artist: item.artist,
          youtubeId: item.videoId,
          youtubeUrl: item.youtubeUrl
        });

        if (dupMatch.hasConflict && dupMatch.existingSong && dupMatch.conflictType !== 'SAME_TITLE_DIFF_ARTIST') {
          // Exact or same-artist duplicate found! Update existing song record without losing existing metadata
          const existing = dupMatch.existingSong;
          console.log(
            `[YouTubePlaylistService] Same-artist duplicate detected for "${item.title}" (Match type: ${dupMatch.matchType}). Updating existing record ID: ${existing.id}`
          );

          const detectedVer = detectSongVersionType({
            title: item.title,
            artist: item.artist,
            rawTitle: item.title
          });

          const updatedSong = await SongService.saveSong({
            ...existing,
            versionType: existing.versionType || detectedVer.versionType,
            category: existing.category || assignedCategory,
            artist: existing.artist && existing.artist !== 'Unknown Artist' ? existing.artist : item.artist,
            key: existing.key || '',
            originalKey: existing.originalKey || '',
            thumbnailUrl: existing.thumbnailUrl || item.thumbnailUrl,
            youtubeUrl: existing.youtubeUrl || item.youtubeUrl,
            youtubeId: existing.youtubeId || item.videoId,
            duration: existing.duration || item.duration,
            album: existing.album || item.album || playlistMeta.playlistName,
            notes: existing.notes
              ? `${existing.notes}\nImported from Playlist "${playlistMeta.playlistName}" (Pos #${item.playlistPosition}) on ${dateImported}`
              : `Imported from Playlist "${playlistMeta.playlistName}" (Pos #${item.playlistPosition}) on ${dateImported}`
          });

          summary.existingFound++;
          summary.existingSongTitles.push(existing.title);
          importedSongs.push(updatedSong);
        } else {
          // Save new separate song into database
          console.log(
            `[YouTubePlaylistService] Creating new song record for "${item.title}" by ${item.artist} with category ${assignedCategory}`
          );
          const detectedVer = detectSongVersionType({
            title: item.title,
            artist: item.artist,
            rawTitle: item.title
          });

          const newSong = await SongService.saveSong({
            title: item.title,
            artist: item.artist,
            album: item.album || playlistMeta.playlistName,
            genre: 'Praise & Worship',
            key: '',
            originalKey: '',
            versionType: detectedVer.versionType,
            duration: item.duration || '3:45',
            youtubeUrl: item.youtubeUrl,
            youtubeId: item.videoId,
            thumbnailUrl: item.thumbnailUrl,
            notes: `Imported from YouTube Playlist "${playlistMeta.playlistName}" (ID: ${playlistMeta.playlistId}, Pos #${item.playlistPosition}) on ${dateImported}`,
            category: assignedCategory,
            labels: ['Playlist Import', playlistMeta.playlistName]
          });

          summary.newlyAdded++;
          summary.newSongTitles.push(newSong.title);
          importedSongs.push(newSong);
        }
      } catch (err) {
        console.error(`[YouTubePlaylistService] Error importing song "${item.title}":`, err);
        summary.skippedErrors++;
      }
    }

    console.log('[YouTubePlaylistService] Import completed. Summary:', summary);
    return { summary, importedSongs };
  }
}
