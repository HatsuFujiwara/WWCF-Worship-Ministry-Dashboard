import { MAX_LINES_PER_SLIDE, MAX_LYRICS_LENGTH } from './lyricsParser';

export const LYRICS_OUTPUT_SESSION_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;
export const LYRICS_OUTPUT_QUERY_PARAM = 'lyrics-output';
export const MAX_OUTPUT_SONG_TITLE_LENGTH = 160;
export const MAX_OUTPUT_SECTION_LABEL_LENGTH = 60;

export type LyricsFontScale = 'compact' | 'standard' | 'large' | 'stage';
export type LyricsTextAlign = 'center' | 'left';

export interface LyricsDisplaySettings {
  fontScale: LyricsFontScale;
  textAlign: LyricsTextAlign;
  showSectionLabel: boolean;
  showProgress: boolean;
}

export const DEFAULT_LYRICS_DISPLAY_SETTINGS: LyricsDisplaySettings = {
  fontScale: 'large',
  textAlign: 'center',
  showSectionLabel: true,
  showProgress: true
};

export interface LyricsOutputSlidePayload {
  songTitle: string;
  sectionLabel: string;
  lines: string[];
  slideNumber: number;
  totalSlidesInSong: number;
  songNumber: number;
  totalSongs: number;
}

export type LyricsChannelMessage =
  | {
      type: 'hello' | 'ready' | 'close';
      sessionId: string;
      sentAt: number;
    }
  | {
      type: 'clear';
      sessionId: string;
      sentAt: number;
      displaySettings: LyricsDisplaySettings;
    }
  | {
      type: 'slide_update';
      sessionId: string;
      sentAt: number;
      payload: LyricsOutputSlidePayload;
      displaySettings: LyricsDisplaySettings;
    };

export function isValidLyricsSessionId(value: unknown): value is string {
  return typeof value === 'string' && LYRICS_OUTPUT_SESSION_REGEX.test(value);
}

export function isWebCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function';
}

export function createLyricsSessionId(): string {
  if (!isWebCryptoAvailable()) {
    throw new Error('Cryptographically secure random generation (Web Crypto API) is unavailable in this browser.');
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const length = 18;
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function getLyricsOutputChannelName(sessionId: string): string {
  if (!isValidLyricsSessionId(sessionId)) {
    throw new Error('Invalid lyrics presentation session ID.');
  }
  return `wwcf_lyrics_output_${sessionId}`;
}

export function getLyricsOutputSessionFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const candidate = params.get(LYRICS_OUTPUT_QUERY_PARAM);
    return isValidLyricsSessionId(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function buildLyricsOutputUrl(sessionId: string): string {
  if (!isValidLyricsSessionId(sessionId)) {
    throw new Error('Invalid lyrics presentation session ID.');
  }
  if (typeof window === 'undefined') return `?${LYRICS_OUTPUT_QUERY_PARAM}=${encodeURIComponent(sessionId)}`;
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(LYRICS_OUTPUT_QUERY_PARAM, sessionId);
  return url.toString();
}

export function openLyricsBroadcastChannel(sessionId: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined' || !isValidLyricsSessionId(sessionId)) {
    return null;
  }
  try {
    return new BroadcastChannel(getLyricsOutputChannelName(sessionId));
  } catch {
    return null;
  }
}

function sanitizeDisplaySettings(raw: unknown): LyricsDisplaySettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_LYRICS_DISPLAY_SETTINGS };
  }
  const obj = raw as Record<string, unknown>;
  const fontScale: LyricsFontScale =
    obj.fontScale === 'compact' || obj.fontScale === 'standard' || obj.fontScale === 'large' || obj.fontScale === 'stage'
      ? obj.fontScale
      : DEFAULT_LYRICS_DISPLAY_SETTINGS.fontScale;
  const textAlign: LyricsTextAlign = obj.textAlign === 'left' ? 'left' : 'center';
  return {
    fontScale,
    textAlign,
    showSectionLabel: typeof obj.showSectionLabel === 'boolean' ? obj.showSectionLabel : true,
    showProgress: typeof obj.showProgress === 'boolean' ? obj.showProgress : true
  };
}

function clampNonNegativeInt(val: unknown, max = 1000): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return 0;
  return Math.min(max, Math.max(0, Math.round(val)));
}

export function validateLyricsSlidePayload(
  raw: unknown
): { valid: true; payload: LyricsOutputSlidePayload } | { valid: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Slide payload must be a valid object.' };
  }
  const p = raw as Record<string, unknown>;

  if (typeof p.songTitle !== 'string' || p.songTitle.length > MAX_OUTPUT_SONG_TITLE_LENGTH) {
    return { valid: false, error: `Song title must be at most ${MAX_OUTPUT_SONG_TITLE_LENGTH} characters.` };
  }
  if (typeof p.sectionLabel !== 'string' || p.sectionLabel.length > MAX_OUTPUT_SECTION_LABEL_LENGTH) {
    return { valid: false, error: `Section label must be at most ${MAX_OUTPUT_SECTION_LABEL_LENGTH} characters.` };
  }

  if (!Array.isArray(p.lines)) {
    return { valid: false, error: 'Slide lines must be an array.' };
  }
  if (p.lines.length > MAX_LINES_PER_SLIDE) {
    return { valid: false, error: `Slide exceeds the ${MAX_LINES_PER_SLIDE}-line maximum.` };
  }

  let totalChars = 0;
  const validatedLines: string[] = [];
  for (const item of p.lines) {
    if (typeof item !== 'string') {
      return { valid: false, error: 'All slide lines must be strings.' };
    }
    totalChars += item.length;
    validatedLines.push(item);
  }
  if (totalChars > MAX_LYRICS_LENGTH) {
    return { valid: false, error: `Slide text exceeds ${MAX_LYRICS_LENGTH.toLocaleString()} characters.` };
  }

  return {
    valid: true,
    payload: {
      songTitle: p.songTitle,
      sectionLabel: p.sectionLabel,
      lines: validatedLines,
      slideNumber: clampNonNegativeInt(p.slideNumber),
      totalSlidesInSong: clampNonNegativeInt(p.totalSlidesInSong),
      songNumber: clampNonNegativeInt(p.songNumber),
      totalSongs: clampNonNegativeInt(p.totalSongs)
    }
  };
}

export function sanitizeLyricsChannelMessage(
  raw: unknown,
  expectedSessionId: string
): LyricsChannelMessage | null {
  if (!raw || typeof raw !== 'object' || !isValidLyricsSessionId(expectedSessionId)) {
    return null;
  }
  const msg = raw as Record<string, unknown>;
  if (msg.sessionId !== expectedSessionId) {
    return null;
  }
  const sentAt = typeof msg.sentAt === 'number' && Number.isFinite(msg.sentAt) ? msg.sentAt : Date.now();

  if (msg.type === 'hello' || msg.type === 'ready' || msg.type === 'close') {
    return {
      type: msg.type,
      sessionId: expectedSessionId,
      sentAt
    };
  }

  if (msg.type === 'clear') {
    return {
      type: 'clear',
      sessionId: expectedSessionId,
      sentAt,
      displaySettings: sanitizeDisplaySettings(msg.displaySettings)
    };
  }

  if (msg.type === 'slide_update') {
    const check = validateLyricsSlidePayload(msg.payload);
    if (!check.valid) {
      return null;
    }

    return {
      type: 'slide_update',
      sessionId: expectedSessionId,
      sentAt,
      displaySettings: sanitizeDisplaySettings(msg.displaySettings),
      payload: check.payload
    };
  }

  return null;
}
