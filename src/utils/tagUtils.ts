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
