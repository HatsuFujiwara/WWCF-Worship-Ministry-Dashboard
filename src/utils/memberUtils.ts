import { Member, isMemberUnderDisciplinary } from '../types';
import { getMemberHighestTagRank, getMemberPredefinedTagCount, getMemberTagCount } from './tagUtils';
import { getManilaTodayString } from './dateUtils';

export type MemberSortOption =
  | 'name-asc'
  | 'name-desc'
  | 'tags-desc'
  | 'tags-asc'
  | 'hierarchy-desc'
  | 'hierarchy-asc'
  | 'status-desc'
  | 'status-asc';

export type MemberStatusFilter = 'all' | 'active' | 'disciplinary';

/**
 * Normalizes name by trimming whitespace, removing dots/commas, and lowercasing
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns clean tokens for a name
 */
export function getNameTokens(name: string): string[] {
  return normalizeName(name).split(' ').filter(Boolean);
}

/**
 * Checks if two names are exact duplicates (case-insensitive & ignoring extra spaces)
 */
export function isExactDuplicateName(name1: string, name2: string): boolean {
  return normalizeName(name1) === normalizeName(name2);
}

/**
 * Checks if two names are similar (e.g. sharing surname and first name/initials, or subset tokens)
 */
export function isSimilarName(inputName: string, existingName: string): boolean {
  const norm1 = normalizeName(inputName);
  const norm2 = normalizeName(existingName);

  if (!norm1 || !norm2 || norm1 === norm2) return false;

  const tokens1 = getNameTokens(inputName);
  const tokens2 = getNameTokens(existingName);

  if (tokens1.length === 0 || tokens2.length === 0) return false;

  const first1 = tokens1[0];
  const last1 = tokens1[tokens1.length - 1];
  const first2 = tokens2[0];
  const last2 = tokens2[tokens2.length - 1];

  // 1. First token AND last token match
  // e.g. "Jalmer Esguerra" vs "Jalmer Elijah Esguerra"
  // e.g. "John Cruz" vs "John Dela Cruz"
  // e.g. "Peter Santos" vs "Peter J. Santos"
  // e.g. "Maria Reyes" vs "Maria Anne Reyes"
  if (first1 === first2 && last1 === last2) {
    return true;
  }

  // 2. Token subset match
  if (tokens1.length >= 2 || tokens2.length >= 2) {
    const isSubset1 = tokens1.every((t) => tokens2.includes(t));
    const isSubset2 = tokens2.every((t) => tokens1.includes(t));
    if (isSubset1 || isSubset2) {
      return true;
    }
  }

  // 3. Last name matches and first name is prefix/suffix or initial
  if (last1 === last2 && (first1.startsWith(first2) || first2.startsWith(first1))) {
    return true;
  }

  return false;
}

/**
 * Reusable helper function to filter and sort member list by name, label, and status criteria.
 */
export function filterAndSortMembers(
  members: Member[],
  searchQuery: string,
  filterLabels: string[],
  sortOption: MemberSortOption,
  statusFilter: MemberStatusFilter = 'all',
  referenceDateStr?: string
): Member[] {
  const query = searchQuery.trim().toLowerCase();
  const dateToCheck = referenceDateStr || getManilaTodayString();

  const filtered = members.filter((member) => {
    // 1. Search Query filter (matches Name, Labels, or Disciplinary Reason)
    const cleanQ = query.replace(/\s+/g, ' ');
    const terms = cleanQ.split(' ');
    const nameLower = member.name.toLowerCase();
    const labelsLower = (member.labels || []).map((l) => l.toLowerCase());
    const reasonLower = (member.disciplinaryAction?.reason || '').toLowerCase();

    const matchesSearch =
      !cleanQ ||
      terms.every(
        (term) =>
          nameLower.includes(term) ||
          labelsLower.some((l) => l.includes(term)) ||
          reasonLower.includes(term)
      );

    if (!matchesSearch) return false;

    // 2. Multi-label filter (matches if member has at least one selected label)
    if (filterLabels.length > 0) {
      const hasMatchingLabel = filterLabels.some((fl) =>
        member.labels.some((ml) => ml.toLowerCase() === fl.toLowerCase())
      );
      if (!hasMatchingLabel) return false;
    }

    // 3. Member Status Filter
    const isDisciplinary = isMemberUnderDisciplinary(member, dateToCheck);
    if (statusFilter === 'active' && isDisciplinary) return false;
    if (statusFilter === 'disciplinary' && !isDisciplinary) return false;

    return true;
  });

  // 4. Sorting by Status, Name, or Tag Hierarchy
  return [...filtered].sort((a, b) => {
    const nameA = a.name.trim();
    const nameB = b.name.trim();

    if (sortOption === 'status-desc') {
      const dispA = isMemberUnderDisciplinary(a, dateToCheck) ? 1 : 0;
      const dispB = isMemberUnderDisciplinary(b, dateToCheck) ? 1 : 0;
      if (dispA !== dispB) return dispB - dispA; // Disciplinary first
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    }

    if (sortOption === 'status-asc') {
      const dispA = isMemberUnderDisciplinary(a, dateToCheck) ? 1 : 0;
      const dispB = isMemberUnderDisciplinary(b, dateToCheck) ? 1 : 0;
      if (dispA !== dispB) return dispA - dispB; // Active first
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    }

    if (sortOption === 'name-desc') {
      return nameB.localeCompare(nameA, undefined, { numeric: true, sensitivity: 'base' });
    }

    if (sortOption === 'tags-desc') {
      // Primary: Most tags first
      const countA = getMemberTagCount(a);
      const countB = getMemberTagCount(b);
      if (countA !== countB) {
        return countB - countA;
      }
      // Secondary: Tag hierarchy priority (lower numerical index = higher rank)
      const rankA = getMemberHighestTagRank(a);
      const rankB = getMemberHighestTagRank(b);
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      // Tertiary: Name A → Z
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    }

    if (sortOption === 'tags-asc') {
      // Primary: Least tags first
      const countA = getMemberTagCount(a);
      const countB = getMemberTagCount(b);
      if (countA !== countB) {
        return countA - countB;
      }
      // Secondary: Tag hierarchy priority
      const rankA = getMemberHighestTagRank(a);
      const rankB = getMemberHighestTagRank(b);
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      // Tertiary: Name A → Z
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    }

    if (sortOption === 'hierarchy-desc') {
      const rankA = getMemberHighestTagRank(a);
      const rankB = getMemberHighestTagRank(b);

      // 1. Highest-priority predefined tag (lower numerical index = higher rank)
      if (rankA !== rankB) {
        return rankA - rankB;
      }

      // 2. Number of predefined tags (more tags first)
      const countA = getMemberPredefinedTagCount(a);
      const countB = getMemberPredefinedTagCount(b);
      if (countA !== countB) {
        return countB - countA;
      }

      // 3. Alphabetical by name (A → Z)
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    }

    if (sortOption === 'hierarchy-asc') {
      const rankA = getMemberHighestTagRank(a);
      const rankB = getMemberHighestTagRank(b);

      if (rankA !== rankB) {
        return rankB - rankA;
      }

      const countA = getMemberPredefinedTagCount(a);
      const countB = getMemberPredefinedTagCount(b);
      if (countA !== countB) {
        return countA - countB;
      }

      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    }

    // Default 'name-asc'
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
  });
}

/**
 * Unique hierarchy tags that may only be assigned to a single member across the entire roster.
 */
export const UNIQUE_HIERARCHY_TAGS = ['Pastor', 'Worship Leader'] as const;
export type UniqueHierarchyTag = typeof UNIQUE_HIERARCHY_TAGS[number];

/**
 * Checks if a given tag name is one of the unique hierarchy tags (Pastor or Worship Leader).
 */
export function isUniqueHierarchyTag(tag: string): boolean {
  if (!tag) return false;
  const lower = tag.trim().toLowerCase();
  return lower === 'pastor' || lower === 'worship leader';
}

/**
 * Normalizes unique tag display name ('Pastor' or 'Worship Leader').
 */
export function getNormalizedUniqueTagName(tag: string): string {
  const lower = tag.trim().toLowerCase();
  if (lower === 'pastor') return 'Pastor';
  if (lower === 'worship leader') return 'Worship Leader';
  return tag.trim();
}

/**
 * Finds the member who currently holds the specified unique tag (excluding an optional member ID, e.g. when editing).
 */
export function getExistingUniqueTagHolder(
  tag: string,
  members: Member[],
  excludeMemberId?: string | null
): Member | undefined {
  if (!tag || !isUniqueHierarchyTag(tag)) return undefined;
  const targetLower = tag.trim().toLowerCase();
  return members.find((m) => {
    if (excludeMemberId && m.id === excludeMemberId) return false;
    return (m.labels || []).some((l) => l.trim().toLowerCase() === targetLower);
  });
}

/**
 * Validates a member's labels against the single-holder constraint for Pastor and Worship Leader.
 * Returns an object with isValid and a descriptive errorMessage if a violation occurs.
 */
export function validateUniqueMemberRoles(
  labels: string[],
  members: Member[],
  excludeMemberId?: string | null
): { isValid: boolean; errorMessage?: string; conflictingTag?: string; holderName?: string } {
  if (!labels || labels.length === 0) return { isValid: true };

  for (const rawTag of labels) {
    if (!rawTag) continue;
    const tag = rawTag.trim();
    const holder = getExistingUniqueTagHolder(tag, members, excludeMemberId);
    if (holder) {
      const normalizedRole = getNormalizedUniqueTagName(tag);
      return {
        isValid: false,
        errorMessage: `Only one member in the roster may have the "${normalizedRole}" tag. It is currently assigned to ${holder.name}.`,
        conflictingTag: normalizedRole,
        holderName: holder.name
      };
    }
  }

  return { isValid: true };
}
