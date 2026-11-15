export const MAX_LYRICS_LENGTH = 20000;
export const DEFAULT_MAX_LINES_PER_SLIDE = 4;
export const MIN_LINES_PER_SLIDE = 2;
export const MAX_LINES_PER_SLIDE = 6;

export type LyricsSectionType =
  | 'verse'
  | 'chorus'
  | 'pre-chorus'
  | 'post-chorus'
  | 'bridge'
  | 'intro'
  | 'outro'
  | 'tag'
  | 'vamp'
  | 'interlude'
  | 'instrumental'
  | 'refrain'
  | 'custom'
  | 'lyrics';

export interface ParsedLyricsSlide {
  id: string;
  group: string;
  groupType: LyricsSectionType;
  slideIndexInGroup: number;
  globalIndex: number;
  lines: string[];
  text: string;
}

export interface ParsedLyricsGroup {
  id: string;
  group: string;
  groupType: LyricsSectionType;
  slides: ParsedLyricsSlide[];
}

export interface ParsedLyricsDocument {
  hasLyrics: boolean;
  groups: ParsedLyricsGroup[];
  slides: ParsedLyricsSlide[];
  lineCount: number;
  groupCount: number;
  slideCount: number;
}

export interface ParseLyricsOptions {
  maxLinesPerSlide?: number;
  stripInlineChords?: boolean;
}

export function clampLinesPerSlide(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_MAX_LINES_PER_SLIDE;
  }
  return Math.min(MAX_LINES_PER_SLIDE, Math.max(MIN_LINES_PER_SLIDE, Math.round(value)));
}

/**
 * Removes LRC timestamps (e.g. [00:12.34], [01:02:03.45]) and LRC metadata lines
 * (e.g. [ar:...], [ti:...], [al:...]) at display/parse time without modifying stored raw text.
 */
export function stripLrcTimestamps(raw: string): string {
  if (!raw) return '';
  const LRC_META_LINE = /^\s*\[(?:ar|ti|al|au|by|length|offset|re|ve):[^\]]*\]\s*$/i;
  const LRC_TIMESTAMP_TOKEN = /\[(?:\d{1,3}:){1,2}\d{2}(?:[.:]\d{1,3})?\]\s*/g;

  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !LRC_META_LINE.test(line))
    .map((line) => line.replace(LRC_TIMESTAMP_TOKEN, ''))
    .join('\n');
}

export function normalizeLyricsText(raw?: string): string {
  if (typeof raw !== 'string') return '';
  return stripLrcTimestamps(raw)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const CHORD_ONLY_TOKEN_REGEX =
  /^[A-G](?:#|b)?(?:maj|min|m|dim|aug|sus\d*|add\d*|\d+|M)*(?:\/[A-G](?:#|b)?)?$/;

const KNOWN_SECTION_ALIASES: Array<{
  pattern: RegExp;
  label: string;
  type: LyricsSectionType;
}> = [
  { pattern: /^pre[\s-]*chorus(?:\s*(\d+[a-z]?))?$/i, label: 'Pre-Chorus', type: 'pre-chorus' },
  { pattern: /^post[\s-]*chorus(?:\s*(\d+[a-z]?))?$/i, label: 'Post-Chorus', type: 'post-chorus' },
  { pattern: /^(?:verse|v)(?:\s*(\d+[a-z]?))?$/i, label: 'Verse', type: 'verse' },
  { pattern: /^(?:chorus|c)(?:\s*(\d+[a-z]?))?$/i, label: 'Chorus', type: 'chorus' },
  { pattern: /^(?:bridge|b)(?:\s*(\d+[a-z]?))?$/i, label: 'Bridge', type: 'bridge' },
  { pattern: /^intro(?:\s*(\d+[a-z]?))?$/i, label: 'Intro', type: 'intro' },
  { pattern: /^(?:outro|ending|coda)(?:\s*(\d+[a-z]?))?$/i, label: 'Outro', type: 'outro' },
  { pattern: /^tag(?:\s*(\d+[a-z]?))?$/i, label: 'Tag', type: 'tag' },
  { pattern: /^vamp(?:\s*(\d+[a-z]?))?$/i, label: 'Vamp', type: 'vamp' },
  { pattern: /^interlude(?:\s*(\d+[a-z]?))?$/i, label: 'Interlude', type: 'interlude' },
  { pattern: /^instrumental(?:\s*(\d+[a-z]?))?$/i, label: 'Instrumental', type: 'instrumental' },
  { pattern: /^refrain(?:\s*(\d+[a-z]?))?$/i, label: 'Refrain', type: 'refrain' }
];

export interface ParsedSectionHeader {
  baseLabel: string;
  explicitNumber: string | null;
  displayLabel: string;
  type: LyricsSectionType;
}

export function parseSectionHeaderLine(trimmedLine: string): ParsedSectionHeader | null {
  const match = trimmedLine.match(/^\[([^\[\]\n]{1,60})\]$/);
  if (!match) return null;

  const inner = match[1].trim();
  if (!inner) return null;

  // Reject numeric timestamps just in case
  if (/^\d{1,3}:\d{2}(?:[.:]\d{1,3})?$/.test(inner)) {
    return null;
  }

  // Check canonical section patterns first
  for (const alias of KNOWN_SECTION_ALIASES) {
    const m = inner.match(alias.pattern);
    if (m) {
      const explicitNumber = m[1] ? m[1].toUpperCase() : null;
      return {
        baseLabel: alias.label,
        explicitNumber,
        displayLabel: explicitNumber ? `${alias.label} ${explicitNumber}` : alias.label,
        type: alias.type
      };
    }
  }

  // Reject single standalone chord markers like [G], [F#m7], [D/F#]
  if (CHORD_ONLY_TOKEN_REGEX.test(inner)) {
    return null;
  }

  // Accept other explicit bracketed section headers like [Tagalog Chorus] or [Spoken Word]
  if (!/[a-zA-Z]/.test(inner)) {
    return null;
  }

  return {
    baseLabel: inner,
    explicitNumber: null,
    displayLabel: inner,
    type: 'custom'
  };
}

function stripInlineChordTokens(line: string): string {
  return line
    .replace(/\[([A-G](?:#|b)?(?:maj|min|m|dim|aug|sus\d*|add\d*|\d+|M)*(?:\/[A-G](?:#|b)?)?)\]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function toSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

export function hasUsableLyrics(raw?: string): boolean {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  return parseLyricsSlides(raw).hasLyrics;
}

export function parseLyricsSlides(
  rawLyrics?: string,
  options?: ParseLyricsOptions
): ParsedLyricsDocument {
  const maxLinesPerSlide = clampLinesPerSlide(options?.maxLinesPerSlide);
  const stripInlineChords = Boolean(options?.stripInlineChords);
  const normalized = normalizeLyricsText(rawLyrics);

  if (!normalized) {
    return {
      hasLyrics: false,
      groups: [],
      slides: [],
      lineCount: 0,
      groupCount: 0,
      slideCount: 0
    };
  }

  interface RawSectionBucket {
    header: ParsedSectionHeader | null;
    rawLines: string[];
  }

  const buckets: RawSectionBucket[] = [];
  let currentBucket: RawSectionBucket = { header: null, rawLines: [] };

  for (const rawLine of normalized.split('\n')) {
    const trimmed = rawLine.trim();
    const parsedHeader = trimmed ? parseSectionHeaderLine(trimmed) : null;

    if (parsedHeader) {
      if (currentBucket.header !== null || currentBucket.rawLines.some((l) => l.trim() !== '')) {
        buckets.push(currentBucket);
      }
      currentBucket = { header: parsedHeader, rawLines: [] };
    } else {
      const processed = stripInlineChords ? stripInlineChordTokens(rawLine) : rawLine;
      currentBucket.rawLines.push(processed);
    }
  }

  if (currentBucket.header !== null || currentBucket.rawLines.some((l) => l.trim() !== '')) {
    buckets.push(currentBucket);
  }

  // Count duplicate unnumbered section labels so e.g. [Verse] + [Verse] -> Verse 1, Verse 2
  const unnumberedCounts = new Map<string, number>();
  for (const bucket of buckets) {
    if (bucket.header && !bucket.header.explicitNumber) {
      const key = `${bucket.header.type}:${bucket.header.baseLabel.toLowerCase()}`;
      unnumberedCounts.set(key, (unnumberedCounts.get(key) || 0) + 1);
    }
  }

  const unnumberedSeen = new Map<string, number>();
  const groups: ParsedLyricsGroup[] = [];
  const allSlides: ParsedLyricsSlide[] = [];
  let totalLineCount = 0;

  buckets.forEach((bucket, bucketIdx) => {
    let groupLabel = 'Lyrics';
    let groupType: LyricsSectionType = 'lyrics';

    if (bucket.header) {
      groupType = bucket.header.type;
      if (bucket.header.explicitNumber) {
        groupLabel = bucket.header.displayLabel;
      } else {
        const key = `${bucket.header.type}:${bucket.header.baseLabel.toLowerCase()}`;
        const totalForBase = unnumberedCounts.get(key) || 1;
        const nextNum = (unnumberedSeen.get(key) || 0) + 1;
        unnumberedSeen.set(key, nextNum);
        groupLabel = totalForBase > 1 ? `${bucket.header.baseLabel} ${nextNum}` : bucket.header.displayLabel;
      }
    }

    // Split group lines into stanza blocks separated by blank lines
    const blocks: string[][] = [];
    let currentBlock: string[] = [];

    for (const line of bucket.rawLines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        if (currentBlock.length > 0) {
          blocks.push(currentBlock);
          currentBlock = [];
        }
      } else {
        currentBlock.push(trimmedLine);
      }
    }
    if (currentBlock.length > 0) {
      blocks.push(currentBlock);
    }

    const groupSlides: ParsedLyricsSlide[] = [];
    const groupSlug = toSlug(groupLabel);
    const groupId = `${groupSlug}-${bucketIdx}`;

    const CUE_ONLY_SECTION_TYPES = new Set<LyricsSectionType>(['instrumental', 'interlude']);

    if (blocks.length === 0 && bucket.header && CUE_ONLY_SECTION_TYPES.has(bucket.header.type)) {
      // Pure cue section such as [Instrumental] or [Interlude]
      const cueText = `(${groupLabel})`;
      const slide: ParsedLyricsSlide = {
        id: `${groupId}-0`,
        group: groupLabel,
        groupType,
        slideIndexInGroup: 0,
        globalIndex: allSlides.length,
        lines: [cueText],
        text: cueText
      };
      groupSlides.push(slide);
      allSlides.push(slide);
    } else if (blocks.length > 0) {
      blocks.forEach((block) => {
        for (let offset = 0; offset < block.length; offset += maxLinesPerSlide) {
          const chunk = block.slice(offset, offset + maxLinesPerSlide);
          totalLineCount += chunk.length;
          const slide: ParsedLyricsSlide = {
            id: `${groupId}-${groupSlides.length}`,
            group: groupLabel,
            groupType,
            slideIndexInGroup: groupSlides.length,
            globalIndex: allSlides.length,
            lines: chunk,
            text: chunk.join('\n')
          };
          groupSlides.push(slide);
          allSlides.push(slide);
        }
      });
    }

    if (groupSlides.length > 0) {
      groups.push({
        id: groupId,
        group: groupLabel,
        groupType,
        slides: groupSlides
      });
    }
  });

  return {
    hasLyrics: allSlides.length > 0,
    groups,
    slides: allSlides,
    lineCount: totalLineCount,
    groupCount: groups.length,
    slideCount: allSlides.length
  };
}
