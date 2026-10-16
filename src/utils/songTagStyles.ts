/**
 * Centralized Song Tag & Badge Design System
 * 
 * Provides distinct, accessible, and high-contrast color identities for all
 * song metadata tags across the Song Database, Schedule lineup, autocomplete,
 * and recommendations.
 */

export type SongTagCategory =
  | 'original'
  | 'cover'
  | 'praise'
  | 'worship'
  | 'english'
  | 'tagalog'
  | 'multilingual'
  | 'family'
  | 'used_this_month'
  | 'newly_added'
  | 'never_played'
  | 'recently_played'
  | 'repeated_warning'
  | 'key'
  | 'bpm'
  | 'theme'
  | 'neutral';

export interface TagStyleDefinition {
  bg: string;
  text: string;
  border: string;
  dot?: string;
  combined: string;
}

export const SONG_TAG_STYLES: Record<SongTagCategory, TagStyleDefinition> = {
  // ORIGINAL → Green family (distinct emerald)
  original: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/70',
    text: 'text-emerald-800 dark:text-emerald-300',
    border: 'border-emerald-300 dark:border-emerald-800',
    dot: 'bg-emerald-500',
    combined: 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
  },
  // COVER → Purple family (distinct rich purple)
  cover: {
    bg: 'bg-purple-50 dark:bg-purple-950/70',
    text: 'text-purple-800 dark:text-purple-300',
    border: 'border-purple-300 dark:border-purple-800',
    dot: 'bg-purple-500',
    combined: 'bg-purple-50 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800'
  },
  // PRAISE → Warm yellow/orange family (distinct amber)
  praise: {
    bg: 'bg-amber-50 dark:bg-amber-950/70',
    text: 'text-amber-800 dark:text-amber-300',
    border: 'border-amber-300 dark:border-amber-800',
    dot: 'bg-amber-500',
    combined: 'bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
  },
  // WORSHIP → Blue family (distinct sky blue)
  worship: {
    bg: 'bg-sky-50 dark:bg-sky-950/70',
    text: 'text-sky-800 dark:text-sky-300',
    border: 'border-sky-300 dark:border-sky-800',
    dot: 'bg-sky-500',
    combined: 'bg-sky-50 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-800'
  },
  // ENGLISH → Cyan/light blue family (distinct cyan)
  english: {
    bg: 'bg-cyan-50 dark:bg-cyan-950/70',
    text: 'text-cyan-800 dark:text-cyan-300',
    border: 'border-cyan-300 dark:border-cyan-800',
    dot: 'bg-cyan-500',
    combined: 'bg-cyan-50 dark:bg-cyan-950/70 text-cyan-800 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800'
  },
  // TAGALOG → Pink/rose family (distinct rose)
  tagalog: {
    bg: 'bg-rose-50 dark:bg-rose-950/70',
    text: 'text-rose-800 dark:text-rose-300',
    border: 'border-rose-300 dark:border-rose-800',
    dot: 'bg-rose-500',
    combined: 'bg-rose-50 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800'
  },
  // MULTI-LINGUAL → Violet family (distinct violet)
  multilingual: {
    bg: 'bg-violet-50 dark:bg-violet-950/70',
    text: 'text-violet-800 dark:text-violet-300',
    border: 'border-violet-300 dark:border-violet-800',
    dot: 'bg-violet-500',
    combined: 'bg-violet-50 dark:bg-violet-950/70 text-violet-800 dark:text-violet-300 border-violet-300 dark:border-violet-800'
  },
  // SONG FAMILY → Teal family (distinct deep teal)
  family: {
    bg: 'bg-teal-50 dark:bg-teal-950/70',
    text: 'text-teal-800 dark:text-teal-300',
    border: 'border-teal-300 dark:border-teal-800',
    dot: 'bg-teal-500',
    combined: 'bg-teal-50 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 border-teal-300 dark:border-teal-800'
  },
  // USED THIS MONTH → Gold/amber family (distinct gold/yellow)
  used_this_month: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/70',
    text: 'text-yellow-900 dark:text-yellow-300',
    border: 'border-yellow-400 dark:border-yellow-700',
    dot: 'bg-yellow-500',
    combined: 'bg-yellow-50 dark:bg-yellow-950/70 text-yellow-900 dark:text-yellow-300 border-yellow-400 dark:border-yellow-700'
  },
  // NEWLY ADDED → Lime / light green family (distinct lime)
  newly_added: {
    bg: 'bg-lime-50 dark:bg-lime-950/70',
    text: 'text-lime-800 dark:text-lime-300',
    border: 'border-lime-300 dark:border-lime-800',
    dot: 'bg-lime-500',
    combined: 'bg-lime-50 dark:bg-lime-950/70 text-lime-800 dark:text-lime-300 border-lime-300 dark:border-lime-800'
  },
  // NEVER PLAYED → Neutral gray with a distinct border (distinct slate/zinc)
  never_played: {
    bg: 'bg-slate-100 dark:bg-slate-800/80',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-300 dark:border-slate-600',
    dot: 'bg-slate-400',
    combined: 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600'
  },
  // RECENTLY PLAYED → Indigo family (distinct indigo/brand)
  recently_played: {
    bg: 'bg-indigo-50 dark:bg-indigo-950/70',
    text: 'text-indigo-800 dark:text-indigo-300',
    border: 'border-indigo-300 dark:border-indigo-800',
    dot: 'bg-indigo-500',
    combined: 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800'
  },
  // REPEATED SONG WARNING → Amber / Orange warning styling (distinct orange)
  repeated_warning: {
    bg: 'bg-orange-50 dark:bg-orange-950/80',
    text: 'text-orange-800 dark:text-orange-300',
    border: 'border-orange-400 dark:border-orange-700',
    dot: 'bg-orange-500',
    combined: 'bg-orange-50 dark:bg-orange-950/80 text-orange-800 dark:text-orange-300 border-orange-400 dark:border-orange-700'
  },
  // Key badge
  key: {
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-700',
    combined: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
  },
  // BPM badge
  bpm: {
    bg: 'bg-slate-50 dark:bg-slate-800/50',
    text: 'text-slate-600 dark:text-slate-400',
    border: 'border-slate-200 dark:border-slate-700',
    combined: 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
  },
  // Theme tag
  theme: {
    bg: 'bg-purple-50 dark:bg-purple-950/50',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800/60',
    combined: 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60'
  },
  // Neutral fallback tag
  neutral: {
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-700',
    combined: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
  }
};

/**
 * Standard badge pill class applied to all song tags
 */
export const BASE_SONG_TAG_CLASS =
  'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors select-none';

export function getSongTagClass(category: SongTagCategory, extraClasses = ''): string {
  const style = SONG_TAG_STYLES[category] || SONG_TAG_STYLES.never_played;
  return `${BASE_SONG_TAG_CLASS} ${style.combined} ${extraClasses}`.trim();
}

/**
 * Helper to resolve tag style by language string
 */
export function getLanguageTagCategory(language?: string): SongTagCategory {
  if (!language) return 'english';
  const l = language.trim().toLowerCase();
  if (l.includes('tagalog')) return 'tagalog';
  if (l.includes('multi') || l.includes('bilingual')) return 'multilingual';
  return 'english';
}
