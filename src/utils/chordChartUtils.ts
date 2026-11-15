import { ChartInstrumentType, InstrumentChartVariant } from '../types';
import {
  LyricsSectionType,
  MAX_LYRICS_LENGTH,
  parseSectionHeaderLine,
  stripLrcTimestamps
} from './lyricsParser';

export const MAX_INSTRUMENT_CHARTS_PER_SONG = 10;
export const MAX_CHART_CONTENT_LENGTH = MAX_LYRICS_LENGTH;

export const VALID_CHART_INSTRUMENTS: ChartInstrumentType[] = [
  'all',
  'guitar',
  'piano',
  'bass',
  'drums',
  'vocals',
  'other'
];

export const CHART_INSTRUMENT_LABELS: Record<ChartInstrumentType, string> = {
  all: 'Full Band / Lead Sheet',
  guitar: 'Guitar',
  piano: 'Piano / Keys',
  bass: 'Bass',
  drums: 'Drums / Rhythm Map',
  vocals: 'Vocals',
  other: 'Other Instrument'
};

export const NON_PITCHED_CHART_INSTRUMENTS = new Set<ChartInstrumentType>(['drums']);

const CHROMATIC_SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHROMATIC_FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0,
  'B#': 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  'E#': 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11
};

const FLAT_SIGNATURE_KEYS = new Set([
  'F',
  'Bb',
  'Eb',
  'Ab',
  'Db',
  'Gb',
  'Cb',
  'Dm',
  'Gm',
  'Cm',
  'Fm',
  'Bbm',
  'Ebm',
  'Abm'
]);

const CHORD_QUALITY_PATTERN =
  '(?:(?:maj|min|m|dim|aug|sus|add|M)\\d{0,2}|\\d{1,2}|[#b+\\-]\\d{1,2})*';

const CHORD_TOKEN_REGEX = new RegExp(
  `^([A-G])(#|b)?(${CHORD_QUALITY_PATTERN})(?:\\/([A-G])(#|b)?)?$`
);

const INLINE_BRACKET_CHORD_REGEX = new RegExp(
  `\\[([A-G](?:#|b)?${CHORD_QUALITY_PATTERN}(?:\\/[A-G](?:#|b)?)?)\\]`,
  'g'
);

const CUE_PREFIX_REGEX =
  /^((?:intro|outro|verse|chorus|pre-?chorus|post-?chorus|bridge|tag|vamp|turnaround|interlude|instrumental|refrain|ending|coda)(?:\s*\d+[a-z]?)?\s*:\s*)(.*)$/i;

const RHYTHM_OR_BAR_TOKEN_REGEX =
  /^(?:\|+|\/+|\\+|-+|\.+|~+|\^|>|\*|,|N\.?C\.?|NC|\(?x\d+\)?|\(?\d+x\)?)$/i;

export interface ParsedChordParts {
  rootLetter: string;
  rootAccidental: string;
  rootNote: string;
  quality: string;
  bassNote?: string;
}

export interface ParsedKeySignature {
  tonic: string;
  semitone: number;
  isMinor: boolean;
  preferFlats: boolean;
  displayKey: string;
}

export interface ParsedChartSection {
  id: string;
  label: string;
  type: LyricsSectionType;
  startLine: number;
  lines: string[];
  text: string;
}

export interface ChartRenderOptions {
  semitones?: number;
  capo?: number;
  nashvilleMode?: boolean;
  keyContext?: string;
  instrument?: ChartInstrumentType;
}

export function isPitchedChartInstrument(instrument?: ChartInstrumentType): boolean {
  if (!instrument) return true;
  return !NON_PITCHED_CHART_INSTRUMENTS.has(instrument);
}

export function isCapoSupportedInstrument(instrument?: ChartInstrumentType): boolean {
  return instrument === 'guitar' || instrument === 'all' || instrument === 'other' || instrument === undefined;
}

export function parseChordToken(token: string): ParsedChordParts | null {
  if (!token || typeof token !== 'string') return null;
  const trimmed = token.trim();
  const match = trimmed.match(CHORD_TOKEN_REGEX);
  if (!match) return null;

  const rootLetter = match[1];
  const rootAccidental = match[2] || '';
  const rootNote = `${rootLetter}${rootAccidental}`;
  if (NOTE_TO_SEMITONE[rootNote] === undefined) return null;

  const quality = match[3] || '';
  const bassLetter = match[4];
  const bassAccidental = match[5] || '';
  const bassNote = bassLetter ? `${bassLetter}${bassAccidental}` : undefined;
  if (bassNote && NOTE_TO_SEMITONE[bassNote] === undefined) return null;

  return {
    rootLetter,
    rootAccidental,
    rootNote,
    quality,
    bassNote
  };
}

export function parseKeySignature(keyStr?: string): ParsedKeySignature | null {
  if (!keyStr || typeof keyStr !== 'string') return null;
  const clean = keyStr.trim();
  if (!clean) return null;

  const match = clean.match(
    /^([A-Ga-g])([#b]?)(?:\s*(m(?:in(?:or)?)?|maj(?:or)?))?$/i
  );
  if (!match) return null;

  const letter = match[1].toUpperCase();
  const accidental = match[2] || '';
  const tonic = `${letter}${accidental}`;
  const semitone = NOTE_TO_SEMITONE[tonic];
  if (semitone === undefined) return null;

  const modeRaw = (match[3] || '').toLowerCase();
  const isMinor = modeRaw.startsWith('m') && !modeRaw.startsWith('maj');
  const displayKey = `${tonic}${isMinor ? 'm' : ''}`;
  const preferFlats = accidental === 'b' || FLAT_SIGNATURE_KEYS.has(displayKey);

  return {
    tonic,
    semitone,
    isMinor,
    preferFlats,
    displayKey
  };
}

export function formatSemitoneNote(semitone: number, preferFlats: boolean): string {
  const idx = ((semitone % 12) + 12) % 12;
  return preferFlats ? CHROMATIC_FLATS[idx] : CHROMATIC_SHARPS[idx];
}

export function transposeKeyName(keyStr: string | undefined, semitones: number): string {
  const parsed = parseKeySignature(keyStr);
  if (!parsed) return (keyStr || '').trim();
  const delta = Math.round(semitones);
  if (delta === 0) return parsed.displayKey;

  const targetSemitone = (((parsed.semitone + delta) % 12) + 12) % 12;
  // Choose natural flat/sharp spelling for the target key
  const sharpName = `${CHROMATIC_SHARPS[targetSemitone]}${parsed.isMinor ? 'm' : ''}`;
  const flatName = `${CHROMATIC_FLATS[targetSemitone]}${parsed.isMinor ? 'm' : ''}`;

  if (parsed.preferFlats && FLAT_SIGNATURE_KEYS.has(flatName)) {
    return flatName;
  }
  if (!parsed.preferFlats && !FLAT_SIGNATURE_KEYS.has(flatName)) {
    return sharpName;
  }
  return FLAT_SIGNATURE_KEYS.has(flatName) ? flatName : sharpName;
}

/**
 * Computes the shortest musical semitone delta (-5 to +6) from sourceKey to targetKey.
 * Returns 0 if either key cannot be parsed.
 */
export function computeKeyOffsetSemitones(sourceKey?: string, targetKey?: string): number {
  const src = parseKeySignature(sourceKey);
  const dst = parseKeySignature(targetKey);
  if (!src || !dst) return 0;
  let diff = (dst.semitone - src.semitone) % 12;
  if (diff < 0) diff += 12;
  if (diff > 6) diff -= 12;
  return diff;
}

export function computeGuitarShapeKey(soundingKey: string | undefined, capo: number): string {
  const cleanCapo = clampCapo(capo);
  if (!soundingKey || cleanCapo === 0) return (soundingKey || '').trim();
  return transposeKeyName(soundingKey, -cleanCapo);
}

export function computeSoundingKeyFromCapo(shapeKey: string | undefined, capo: number): string {
  const cleanCapo = clampCapo(capo);
  if (!shapeKey || cleanCapo === 0) return (shapeKey || '').trim();
  return transposeKeyName(shapeKey, cleanCapo);
}

export function clampCapo(capo?: number): number {
  if (typeof capo !== 'number' || !Number.isFinite(capo)) return 0;
  return Math.max(0, Math.min(24, Math.round(capo)));
}

export function transposeChordToken(
  chordToken: string,
  semitones: number,
  preferFlats = false
): string {
  const parsed = parseChordToken(chordToken);
  if (!parsed) return chordToken;

  const delta = Math.round(semitones);
  if (delta === 0) return chordToken;

  const rootSemi = NOTE_TO_SEMITONE[parsed.rootNote];
  const nextRoot = formatSemitoneNote(rootSemi + delta, preferFlats);

  if (parsed.bassNote) {
    const bassSemi = NOTE_TO_SEMITONE[parsed.bassNote];
    const nextBass = formatSemitoneNote(bassSemi + delta, preferFlats);
    return `${nextRoot}${parsed.quality}/${nextBass}`;
  }

  return `${nextRoot}${parsed.quality}`;
}

const MAJOR_SCALE_INTERVAL_LABELS: Record<number, string> = {
  0: '1',
  1: 'b2',
  2: '2',
  3: 'b3',
  4: '3',
  5: '4',
  6: '#4',
  7: '5',
  8: 'b6',
  9: '6',
  10: 'b7',
  11: '7'
};

const MINOR_SCALE_INTERVAL_LABELS: Record<number, string> = {
  0: '1',
  1: 'b2',
  2: '2',
  3: 'b3',
  4: '3',
  5: '4',
  6: '#4',
  7: '5',
  8: 'b6',
  9: '6',
  10: 'b7',
  11: '7'
};

export function chordToNashville(chordToken: string, keyContext?: string): string {
  const parsedChord = parseChordToken(chordToken);
  const parsedKey = parseKeySignature(keyContext);
  if (!parsedChord || !parsedKey) return chordToken;

  const map = parsedKey.isMinor ? MINOR_SCALE_INTERVAL_LABELS : MAJOR_SCALE_INTERVAL_LABELS;
  const rootInterval = ((NOTE_TO_SEMITONE[parsedChord.rootNote] - parsedKey.semitone) % 12 + 12) % 12;
  const degree = map[rootInterval] || '1';

  let result = `${degree}${parsedChord.quality}`;
  if (parsedChord.bassNote) {
    const bassInterval = ((NOTE_TO_SEMITONE[parsedChord.bassNote] - parsedKey.semitone) % 12 + 12) % 12;
    const bassDegree = map[bassInterval] || '1';
    result += `/${bassDegree}`;
  }
  return result;
}

function isUrlLine(line: string): boolean {
  return /https?:\/\//i.test(line);
}

function splitPreservingWhitespace(text: string): string[] {
  return text.split(/(\s+)/);
}

function transformChordLineContent(
  segment: string,
  transformer: (chord: string) => string
): { isChordLine: boolean; transformed: string } {
  if (!segment.trim() || isUrlLine(segment)) {
    return { isChordLine: false, transformed: segment };
  }

  // Handle cue prefixes like "Intro: G D/F# Em C"
  let prefix = '';
  let body = segment;
  const cueMatch = segment.match(CUE_PREFIX_REGEX);
  if (cueMatch) {
    prefix = cueMatch[1];
    body = cueMatch[2];
    if (!body.trim()) {
      return { isChordLine: false, transformed: segment };
    }
  }

  const parts = splitPreservingWhitespace(body);
  let chordCount = 0;

  const transformedParts = parts.map((part) => {
    if (!part || /^\s+$/.test(part)) return part;

    // Strip wrapping parens/bars cleanly while preserving them
    const wrapperMatch = part.match(/^([(|[\]]*)(.*?)([)|[\],;]*)$/);
    if (!wrapperMatch) return null;
    const lead = wrapperMatch[1];
    const core = wrapperMatch[2];
    const trail = wrapperMatch[3];

    if (!core) {
      if (RHYTHM_OR_BAR_TOKEN_REGEX.test(part)) return part;
      return null;
    }

    if (RHYTHM_OR_BAR_TOKEN_REGEX.test(core)) {
      return part;
    }

    // Handle hyphen-delimited progressions like G-D/F#-Em-C
    if (core.includes('-') && !/[-]\d/.test(core)) {
      const subTokens = core.split('-');
      if (subTokens.every((st) => st !== '' && parseChordToken(st) !== null)) {
        chordCount += subTokens.length;
        return `${lead}${subTokens.map(transformer).join('-')}${trail}`;
      }
    }

    if (parseChordToken(core) !== null) {
      chordCount += 1;
      return `${lead}${transformer(core)}${trail}`;
    }

    return null;
  });

  if (chordCount === 0 || transformedParts.some((p) => p === null)) {
    return { isChordLine: false, transformed: segment };
  }

  // Guard against ambiguous single-letter English article "A" on a non-bar line with no prefix
  if (!prefix && chordCount === 1) {
    const trimmedBody = body.trim();
    if (trimmedBody === 'A') {
      return { isChordLine: false, transformed: segment };
    }
  }

  return {
    isChordLine: true,
    transformed: `${prefix}${transformedParts.join('')}`
  };
}

export function isChordOnlyLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || parseSectionHeaderLine(trimmed)) return false;
  return transformChordLineContent(line, (c) => c).isChordLine;
}

export function transformChartText(rawChart: string, options: ChartRenderOptions = {}): string {
  if (!rawChart || typeof rawChart !== 'string') return '';

  const instrument = options.instrument;
  const pitched = isPitchedChartInstrument(instrument);
  const semitones = pitched ? Math.round(options.semitones || 0) : 0;
  const effectiveCapo =
    pitched && isCapoSupportedInstrument(instrument) ? clampCapo(options.capo) : 0;
  const netSemitones = semitones - effectiveCapo;
  const nashvilleMode = pitched && Boolean(options.nashvilleMode);

  const baseKeyParsed = parseKeySignature(options.keyContext);
  const transposedKeyName = options.keyContext
    ? transposeKeyName(options.keyContext, netSemitones)
    : undefined;
  const transposedKeyParsed = parseKeySignature(transposedKeyName);
  const preferFlats = transposedKeyParsed?.preferFlats ?? baseKeyParsed?.preferFlats ?? false;

  const transformChord = (chord: string): string => {
    const transposed =
      netSemitones !== 0 ? transposeChordToken(chord, netSemitones, preferFlats) : chord;
    if (nashvilleMode && (transposedKeyName || options.keyContext)) {
      return chordToNashville(transposed, transposedKeyName || options.keyContext);
    }
    return transposed;
  };

  const cleaned = stripLrcTimestamps(rawChart.replace(/\r\n?/g, '\n'));
  const lines = cleaned.split('\n');

  return lines
    .map((line) => {
      const trimmed = line.trim();
      // 1. Preserve section headers untouched
      if (trimmed && parseSectionHeaderLine(trimmed)) {
        return line;
      }

      // 2. Transform chord-above-lyric / progression lines
      const chordLineResult = transformChordLineContent(line, transformChord);
      if (chordLineResult.isChordLine) {
        return chordLineResult.transformed;
      }

      // 3. Transform inline bracketed chords like [G]Amazing [D/F#]grace
      if (line.includes('[') && !isUrlLine(line)) {
        return line.replace(INLINE_BRACKET_CHORD_REGEX, (_full, innerChord) => {
          return `[${transformChord(innerChord)}]`;
        });
      }

      return line;
    })
    .join('\n');
}

export function parseChartSections(rawChart?: string): ParsedChartSection[] {
  if (!rawChart || typeof rawChart !== 'string' || !rawChart.trim()) return [];
  const normalized = stripLrcTimestamps(rawChart.replace(/\r\n?/g, '\n'));
  const lines = normalized.split('\n');

  const sections: ParsedChartSection[] = [];
  let currentLabel = 'Overview';
  let currentType: LyricsSectionType = 'lyrics';
  let currentStart = 0;
  let currentLines: string[] = [];

  const flush = () => {
    const hasContent = currentLines.some((l) => l.trim() !== '') || currentLabel !== 'Overview';
    if (!hasContent) return;
    const slug =
      currentLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'section';
    sections.push({
      id: `${slug}-${sections.length}`,
      label: currentLabel,
      type: currentType,
      startLine: currentStart,
      lines: [...currentLines],
      text: currentLines.join('\n').trim()
    });
  };

  lines.forEach((line, idx) => {
    const header = parseSectionHeaderLine(line.trim());
    if (header) {
      flush();
      currentLabel = header.displayLabel;
      currentType = header.type;
      currentStart = idx;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  });
  flush();

  return sections;
}

export function sanitizeInstrumentChartVariant(
  raw: unknown,
  index = 0
): InstrumentChartVariant | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const instrument: ChartInstrumentType =
    typeof r.instrument === 'string' && VALID_CHART_INSTRUMENTS.includes(r.instrument as ChartInstrumentType)
      ? (r.instrument as ChartInstrumentType)
      : 'all';

  const content = typeof r.content === 'string' ? r.content.trim() : '';
  if (!content) return null;

  const boundedContent = content.slice(0, MAX_CHART_CONTENT_LENGTH);
  const id =
    typeof r.id === 'string' && r.id.trim()
      ? r.id.trim().slice(0, 100)
      : `chart_${instrument}_${index + 1}`;
  const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 80) : undefined;
  const key = typeof r.key === 'string' && r.key.trim() ? r.key.trim().slice(0, 20) : undefined;
  const capoNum =
    typeof r.capo === 'number' && Number.isFinite(r.capo)
      ? clampCapo(r.capo)
      : typeof r.capo === 'string' && r.capo.trim() && !isNaN(Number(r.capo))
      ? clampCapo(Number(r.capo))
      : undefined;
  const tuning = typeof r.tuning === 'string' && r.tuning.trim() ? r.tuning.trim().slice(0, 80) : undefined;
  const notes = typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim().slice(0, 1000) : undefined;
  const updatedAt = typeof r.updatedAt === 'string' && r.updatedAt.trim() ? r.updatedAt.trim().slice(0, 50) : undefined;

  return {
    id,
    instrument,
    ...(label ? { label } : {}),
    content: boundedContent,
    ...(key ? { key } : {}),
    ...(capoNum !== undefined && capoNum > 0 ? { capo: capoNum } : {}),
    ...(tuning ? { tuning } : {}),
    ...(notes ? { notes } : {}),
    ...(updatedAt ? { updatedAt } : {})
  };
}

export function sanitizeInstrumentCharts(rawCharts: unknown): InstrumentChartVariant[] | undefined {
  if (!Array.isArray(rawCharts)) return undefined;
  const sanitized = rawCharts
    .slice(0, MAX_INSTRUMENT_CHARTS_PER_SONG)
    .map((c, idx) => sanitizeInstrumentChartVariant(c, idx))
    .filter((c): c is InstrumentChartVariant => c !== null);
  return sanitized.length > 0 ? sanitized : undefined;
}

export function validateInstrumentCharts(
  rawCharts: unknown,
  songTitle: string
): { valid: InstrumentChartVariant[] | undefined; error?: string } {
  if (rawCharts === undefined || rawCharts === null) {
    return { valid: undefined };
  }
  if (!Array.isArray(rawCharts)) {
    return {
      valid: undefined,
      error: `Instrument charts for "${songTitle}" must be an array.`
    };
  }
  if (rawCharts.length > MAX_INSTRUMENT_CHARTS_PER_SONG) {
    return {
      valid: undefined,
      error: `Song "${songTitle}" has ${rawCharts.length} instrument charts (limit: ${MAX_INSTRUMENT_CHARTS_PER_SONG}).`
    };
  }

  const valid: InstrumentChartVariant[] = [];
  for (let i = 0; i < rawCharts.length; i++) {
    const raw = rawCharts[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {
        valid: undefined,
        error: `Instrument chart #${i + 1} for "${songTitle}" is malformed.`
      };
    }
    const r = raw as Record<string, unknown>;
    if (
      typeof r.instrument !== 'string' ||
      !VALID_CHART_INSTRUMENTS.includes(r.instrument as ChartInstrumentType)
    ) {
      return {
        valid: undefined,
        error: `Instrument chart #${i + 1} for "${songTitle}" has invalid instrument "${String(r.instrument ?? '')}".`
      };
    }
    if (typeof r.content !== 'string' || !r.content.trim()) {
      continue;
    }
    if (r.content.trim().length > MAX_CHART_CONTENT_LENGTH) {
      return {
        valid: undefined,
        error: `Instrument chart #${i + 1} for "${songTitle}" exceeds the ${MAX_CHART_CONTENT_LENGTH.toLocaleString()}-character limit.`
      };
    }
    const sanitized = sanitizeInstrumentChartVariant(r, i);
    if (sanitized) valid.push(sanitized);
  }

  return { valid: valid.length > 0 ? valid : undefined };
}
