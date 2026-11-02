import { DEFAULT_LABELS } from '../data/seedData';
import { Member } from '../types';

/**
 * Returns the total count of unique assigned tags/labels a member possesses.
 */
export function getMemberTagCount(member: Member): number {
  if (!member || !member.labels || member.labels.length === 0) {
    return 0;
  }
  const uniqueLabels = new Set(
    member.labels
      .filter(Boolean)
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l.length > 0)
  );
  return uniqueLabels.size;
}

/**
 * Returns the count of predefined tags a member possesses according to the predefined hierarchy.
 */
export function getMemberPredefinedTagCount(
  member: Member,
  predefinedHierarchy: string[] = DEFAULT_LABELS
): number {
  if (!member || !member.labels || member.labels.length === 0) {
    return 0;
  }

  const hierarchyLowerSet = new Set<string>();
  predefinedHierarchy.forEach((tag) => {
    hierarchyLowerSet.add(tag.trim().toLowerCase());
  });

  let count = 0;
  member.labels.forEach((rawTag) => {
    if (hierarchyLowerSet.has(rawTag.trim().toLowerCase())) {
      count++;
    }
  });

  return count;
}

/**
 * Returns the highest-priority index (lowest numerical value) from a member's tags
 * based on the predefined hierarchy.
 * Returns Number.MAX_SAFE_INTEGER if the member has no predefined tags.
 */
export function getMemberHighestTagRank(
  member: Member,
  predefinedHierarchy: string[] = DEFAULT_LABELS
): number {
  if (!member || !member.labels || member.labels.length === 0) {
    return Number.MAX_SAFE_INTEGER;
  }

  const hierarchyLowerMap = new Map<string, number>();
  predefinedHierarchy.forEach((tag, idx) => {
    hierarchyLowerMap.set(tag.toLowerCase(), idx);
  });

  let highestRank = Number.MAX_SAFE_INTEGER;

  member.labels.forEach((rawTag) => {
    const trimmedLower = rawTag.trim().toLowerCase();
    if (hierarchyLowerMap.has(trimmedLower)) {
      const idx = hierarchyLowerMap.get(trimmedLower)!;
      if (idx < highestRank) {
        highestRank = idx;
      }
    }
  });

  return highestRank;
}

/**
 * Sorts an array of tag/label strings according to the predefined tag hierarchy:
 * 1. Predefined tags in DEFAULT_LABELS hierarchy order.
 * 2. Custom tags placed after predefined tags, sorted alphabetically.
 */
export function sortTags(tags: string[], predefinedHierarchy: string[] = DEFAULT_LABELS): string[] {
  if (!tags || tags.length === 0) return [];

  const predefinedLowerMap = new Map<string, number>();
  predefinedHierarchy.forEach((tag, idx) => {
    predefinedLowerMap.set(tag.toLowerCase(), idx);
  });

  const predefinedMatches: { tag: string; index: number }[] = [];
  const customTags: string[] = [];

  const seen = new Set<string>();

  tags.forEach((rawTag) => {
    const trimmed = rawTag.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);

    if (predefinedLowerMap.has(lower)) {
      const idx = predefinedLowerMap.get(lower)!;
      predefinedMatches.push({
        tag: predefinedHierarchy[idx],
        index: idx
      });
    } else {
      customTags.push(trimmed);
    }
  });

  // Sort predefined tags strictly by hierarchy index
  predefinedMatches.sort((a, b) => a.index - b.index);

  // Sort custom tags alphabetically
  customTags.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  return [
    ...predefinedMatches.map((m) => m.tag),
    ...customTags
  ];
}

/**
 * Returns consistent Tailwind badge color styles for member roles/tags:
 * - Pastor: purple
 * - Worship Leader: amber
 * - Song Leader: sky / primary
 * - Vocalist: emerald
 * - Guitarist: orange
 * - Keyboardist: teal
 * - Bassist: rose
 * - Drummer: red
 * - Audio/Live: slate
 * - Lyricist: indigo
 * - Custom / other: zinc
 */
export function getTagColorStyle(tagName: string): string {
  if (!tagName) return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  const lower = tagName.trim().toLowerCase();

  switch (lower) {
    case 'pastor':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border-purple-200 dark:border-purple-800/60';
    case 'worship leader':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800/60';
    case 'song leader':
      return 'bg-sky-100 text-[#1b75bc] dark:bg-sky-950/70 dark:text-sky-300 border-sky-200 dark:border-sky-800/60';
    case 'vocalist':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60';
    case 'guitarist':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-950/70 dark:text-orange-300 border-orange-200 dark:border-orange-800/60';
    case 'keyboardist':
      return 'bg-teal-100 text-teal-800 dark:bg-teal-950/70 dark:text-teal-300 border-teal-200 dark:border-teal-800/60';
    case 'bassist':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border-rose-200 dark:border-rose-800/60';
    case 'drummer':
      return 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300 border-red-200 dark:border-red-800/60';
    case 'audio/live':
    case 'audio':
    case 'audio engineer':
      return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    case 'lyricist':
    case 'lyrics':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60';
    default:
      return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700';
  }
}

