import { getManilaTodayString, addDaysToDateString, getDaysInMonth } from './utils/dateUtils';

export type CanonicalServiceType =
  | 'Sunday Service'
  | 'Midweek Prayer Service'
  | 'Youth Fellowship'
  | 'Worship Event';

export type LegacyServiceType =
  | 'Youth Service'
  | 'Special Worship Event';

export type ServiceType = CanonicalServiceType | LegacyServiceType | string;

export const CANONICAL_SERVICE_TYPES: CanonicalServiceType[] = [
  'Sunday Service',
  'Midweek Prayer Service',
  'Youth Fellowship',
  'Worship Event'
];

/**
 * Normalizes any legacy or alias service type to the canonical intended name,
 * while safely preserving valid custom service names.
 */
export function normalizeServiceType(type?: string): string {
  if (!type) return 'Sunday Service';
  const trimmed = type.trim();
  if (trimmed === 'Youth Service' || trimmed === 'Youth Fellowship') return 'Youth Fellowship';
  if (trimmed === 'Special Worship Event' || trimmed === 'Worship Event') return 'Worship Event';
  if (trimmed === 'Midweek Prayer Service') return 'Midweek Prayer Service';
  if (trimmed === 'Sunday Service') return 'Sunday Service';
  return trimmed;
}

export type DisciplinaryDurationType = 'days' | 'weeks' | 'months' | 'years';

export interface DisciplinaryAction {
  status: 'active' | 'cleared';
  startDate: string; // YYYY-MM-DD
  durationValue: number;
  durationType: DisciplinaryDurationType;
  endDate: string; // YYYY-MM-DD
  reason?: string;
  updatedAt?: string;
}

export interface Member {
  id: string;
  name: string;
  labels: string[];
  disciplinaryAction?: DisciplinaryAction;
}

export function calculateDisciplinaryEndDate(
  startDateStr: string,
  value: number,
  type: DisciplinaryDurationType
): string {
  if (!startDateStr || isNaN(value) || value <= 0) {
    return startDateStr || getManilaTodayString();
  }
  
  if (type === 'days') {
    return addDaysToDateString(startDateStr, value);
  } else if (type === 'weeks') {
    return addDaysToDateString(startDateStr, value * 7);
  }

  const parts = startDateStr.split('-');
  if (parts.length < 3) return startDateStr;
  let year = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10);
  let day = parseInt(parts[2], 10);

  if (type === 'months') {
    const totalMonths = year * 12 + (month - 1) + value;
    year = Math.floor(totalMonths / 12);
    month = (totalMonths % 12) + 1;
    const maxDays = getDaysInMonth(year, month);
    day = Math.min(day, maxDays);
  } else if (type === 'years') {
    year += value;
    const maxDays = getDaysInMonth(year, month);
    day = Math.min(day, maxDays);
  }

  const mStr = String(month).padStart(2, '0');
  const dStr = String(day).padStart(2, '0');
  return `${year}-${mStr}-${dStr}`;
}

export function isMemberUnderDisciplinary(member: Member, referenceDateStr?: string): boolean {
  if (!member.disciplinaryAction || member.disciplinaryAction.status !== 'active') {
    return false;
  }
  const dateToCheck = referenceDateStr || getManilaTodayString();
  const { startDate, endDate } = member.disciplinaryAction;

  if (startDate && dateToCheck < startDate) {
    return false;
  }
  if (endDate && dateToCheck > endDate) {
    return false;
  }
  return true;
}

export type PredefinedMinistryTag =
  | 'Pastor'
  | 'Worship Leader'
  | 'Song Leader'
  | 'Vocalist'
  | 'Guitarist'
  | 'Keyboardist'
  | 'Bassist'
  | 'Drummer'
  | 'Audio/Live Technician'
  | 'Lyricist';

export interface AssignedMember {
  memberId: string;
  memberName: string;
}

export interface MinistryAssignment {
  id: string;
  role: string;
  assignedMembers?: AssignedMember[];
  memberId?: string;
  memberName?: string;
  notes?: string;
}

export function getAssignmentMembers(a: MinistryAssignment): AssignedMember[] {
  if (a.assignedMembers && Array.isArray(a.assignedMembers)) {
    return a.assignedMembers;
  }
  if (a.memberId || a.memberName) {
    return [{ memberId: a.memberId || '', memberName: a.memberName || '' }];
  }
  return [];
}

export function formatAssignmentMemberNames(a: MinistryAssignment): string {
  const members = getAssignmentMembers(a);
  if (members.length === 0) return 'N/A';
  const names = members.map(m => m.memberName).filter(Boolean);
  const cleanNames = names.filter(n => n !== 'Unassigned' && n !== '—');
  return cleanNames.length > 0 ? cleanNames.join(', ') : 'N/A';
}

export interface Schedule {
  id: string;
  serviceType: ServiceType;
  serviceDate: string;
  praiseSongs: string[];
  worshipSongs: string[];
  praiseSongKeys?: string[];
  worshipSongKeys?: string[];
  praiseSongIds?: string[];
  worshipSongIds?: string[];
  ministryAssignments: MinistryAssignment[];
  notes?: string;
  updatedAt: string;
}

export type ActiveTab = 'dashboard' | 'scheduler' | 'schedules' | 'members' | 'songs' | 'analytics';

export type SongCategory = 'praise' | 'worship' | 'both';

export type SongVersionType = 'original' | 'cover';

export type SongRelationshipType =
  | 'ORIGINAL'
  | 'COVER'
  | 'LIVE_VERSION'
  | 'ACOUSTIC_VERSION'
  | 'ALTERNATE_VERSION'
  | 'REMAKE'
  | 'VERSION'
  | 'UNKNOWN';

export interface SongVersionRef {
  songId: string;
  relationshipType: SongRelationshipType;
  notes?: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface SongFamily {
  id: string;
  name: string; // The canonical name for the song family (e.g., "Tribes", "Sukdulang Biyaya")
  versionIds: string[]; // List of member song IDs
  versions?: SongVersionRef[];
  originalSongId?: string; // ID of the confirmed original version
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ServiceUsageHistory {
  date: string;
  serviceType: string;
  scheduleId?: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  key?: string;
  originalKey?: string;
  bpm?: number;
  timeSignature?: string;
  duration?: string;
  releaseYear?: number | string;
  language: string;
  ccliNumber?: string;
  youtubeUrl?: string;
  youtubeId?: string;
  thumbnailUrl?: string;
  coverArtUrl?: string;
  isrc?: string;
  spotifyUrl?: string;
  appleMusicUrl?: string;
  qobuzUrl?: string;
  tidalUrl?: string;
  geniusUrl?: string;
  dateAdded: string;
  lastUsedDate?: string;
  timesUsed: number;
  serviceHistory: ServiceUsageHistory[];
  notes?: string;
  category: SongCategory;
  versionType?: SongVersionType;
  labels?: string[];
  themes?: string[];
  // Song Relationship / Song Family fields
  songFamilyId?: string;
  relationshipType?: SongRelationshipType;
  lyrics?: string;
  songwriters?: string;
  composers?: string[];
  originalArtist?: string;
}

export type SongConflictType =
  | 'SAME_TITLE_SAME_ARTIST'
  | 'SAME_TITLE_DIFF_ARTIST'
  | 'SAME_VIDEO_MATCH'
  | 'DIFF_TITLE_POSSIBLE_COMPOSITION'
  | 'NO_CONFLICT';

export interface SongConflictResult {
  hasConflict: boolean;
  conflictType: SongConflictType;
  matchType?: 'title' | 'artist_title' | 'youtubeId' | 'youtubeUrl' | 'composition';
  existingSong?: Song;
  evidence?: {
    confidence: 'high' | 'medium' | 'low';
    score: number;
    reasons: string[];
    suggestedRelationship: SongRelationshipType;
  };
  hasStrongEvidence?: boolean;
  suggestedRelationship?: SongRelationshipType;
  isDuplicate?: boolean; // Backward compatibility
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'danger' | 'info';
  text: string;
}

export type TextSizeOption = 'default' | 'large' | 'extra-large';
export type DisplayDensity = 'compact' | 'comfortable' | 'spacious';
export type ColorVisionMode = 'default' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'monochrome';

export interface AccessibilitySettings {
  reducedMotion: boolean;
  highContrast: boolean;
  textSize: TextSizeOption;
  enhancedFocus: boolean;
  largerTouchTargets: boolean;
  ttsEnabled?: boolean;
  ttsSpeechRate?: number;
  ttsVoice?: string;
  showTtsPanel?: boolean;
  ttsReadingScope?: 'all' | 'essential' | 'guide_only';
  readingMode?: boolean;
  hapticFeedback?: boolean;
  colorVision?: ColorVisionMode;
  displayDensity?: DisplayDensity;
  simplifiedInterface?: boolean;
  performanceMode?: boolean;
  audioFeedback?: boolean;
  visualToastAlerts?: boolean;
}

export type NavigationOrientation = 'vertical' | 'horizontal';
export type SidebarPosition = 'left' | 'right';
export type SidebarVisibility = 'expanded' | 'collapsed' | 'hidden';

export interface AppLayoutPreferences {
  navigationOrientation: NavigationOrientation;
  sidebarPosition: SidebarPosition;
  sidebarVisibility: SidebarVisibility;
}

export interface KeyboardShortcutDefinition {
  id: string;
  action: string;
  description: string;
  defaultKey: string; // e.g. "Alt+1", "F1", "Alt+N"
  customKey?: string; // user override
  category: 'navigation' | 'actions' | 'general';
}
