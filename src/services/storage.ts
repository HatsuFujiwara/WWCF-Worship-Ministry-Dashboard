import { Member, Schedule, AccessibilitySettings, TextSizeOption, AppLayoutPreferences } from '../types';
import { DEFAULT_LABELS, DEFAULT_MEMBERS, DEFAULT_SCHEDULES } from '../data/seedData';
import { dataRepository } from './data';
import { sortTags } from '../utils/tagUtils';
import { getManilaNowISO, getManilaDateParts } from '../utils/dateUtils';
import { syncSchedulesWithAuthoritativeSongs } from '../utils/songResolveUtils';

export type GuideAutoShowMode = 'first_visit' | 'every_time' | 'never';

export type DraftSchedule = Partial<Schedule> & {
  version?: number;
  editingScheduleId?: string | null;
  savedAt?: string;
};

export interface SongsFilterSettings {
  searchQuery?: string;
  categoryFilter?: string;
  languageFilter?: string;
  versionTypeFilter?: 'all' | 'original' | 'cover';
  sortBy?: string;
}

export interface SchedulesFilterSettings {
  searchQuery?: string;
  serviceFilter?: string;
  yearFilter?: string;
  monthFilter?: string;
  sortOption?: string;
}

export interface MembersFilterSettings {
  searchQuery?: string;
  filterLabels?: string[];
  statusFilter?: string;
  sortOption?: string;
}

export interface SongPickerFilterSettings {
  searchQuery?: string;
  selectedLanguage?: string;
  selectedKey?: string;
  selectedBadgeFilter?: string;
}

const STORAGE_KEYS = {
  MEMBERS: 'wwcf_members_v1',
  LABELS: 'wwcf_labels_v1',
  SCHEDULES: 'wwcf_schedules_v1',
  DARK_MODE: 'wwcf_dark_mode_v1',
  DRAFT_V2: 'wwcf_draft_schedule_v2',
  DRAFT_V1: 'wwcf_draft_schedule_v1',
  GUIDE_MODE: 'wwcf_guide_mode_v1',
  GUIDE_VISITED: 'wwcf_guide_has_visited_v1',
  ACCESSIBILITY: 'wwcf_accessibility_v1',
  ACCESSIBILITY_ONBOARDED: 'wwcf_accessibility_onboarded_v1',
  LAYOUT: 'wwcf_layout_preferences_v1',
  KEYBOARD_SHORTCUTS: 'wwcf_keyboard_shortcuts_v1',
  DISTINCT_SAME_NAME: 'wwcf_distinct_same_name_songs_v1',
  SONGS_FILTER: 'wwcf_songs_filter_v1',
  SCHEDULES_FILTER: 'wwcf_schedules_filter_v1',
  MEMBERS_FILTER: 'wwcf_members_filter_v1',
  SONG_PICKER_FILTER: 'wwcf_song_picker_filter_v1',
  SCHEDULER_SMART_FILTER: 'wwcf_scheduler_smart_filter_v1',
  DISTINCT_SONG_PAIRS: 'wwcf_distinct_song_pairs_v1'
};

const DEMO_MEMBER_IDS = new Set(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8']);
const DEMO_MEMBER_NAMES = new Set([
  'pastor david santos',
  'sarah santos',
  'mark cruz',
  'john reyes',
  'gabriel flores',
  'daniel lim',
  'hannah gomez',
  'micah tan'
]);

export function sanitizeMembers(members: Member[]): Member[] {
  const nonDemoMembers = (members || []).filter(
    (m) => !DEMO_MEMBER_IDS.has(m.id) && !DEMO_MEMBER_NAMES.has((m.name || '').trim().toLowerCase())
  );

  return nonDemoMembers.map((m) => {
    const updatedLabels = (m.labels || [])
      .map((lbl) => {
        if (lbl === 'Multimedia') return 'Lyricist';
        if (lbl === 'Song Lead') return 'Song Leader';
        return lbl;
      })
      .filter((lbl) => lbl !== 'Youth' && lbl !== 'Adult');
    return {
      ...m,
      labels: sortTags(updatedLabels)
    };
  });
}

export function sanitizeLabels(labelsList: string[]): string[] {
  const mapped = (labelsList || [])
    .map((lbl) => {
      if (lbl === 'Multimedia') return 'Lyricist';
      if (lbl === 'Song Lead') return 'Song Leader';
      return lbl;
    })
    .filter((lbl) => lbl !== 'Youth' && lbl !== 'Adult');
  DEFAULT_LABELS.forEach((defLabel) => {
    if (!mapped.includes(defLabel)) {
      mapped.push(defLabel);
    }
  });
  return sortTags(mapped);
}

export function sanitizeSchedules(schedules: Schedule[]): Schedule[] {
  const nonDemoSchedules = (schedules || []).filter((sch) => sch.id !== 'sch_sample_1');

  return nonDemoSchedules.map((sch) => {
    const validId = sch.id && sch.id.trim() !== '' ? sch.id : `sch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const updatedAssignments = (sch.ministryAssignments || []).map((assignment) => {
      let role = assignment.role;
      if (role === 'Song Lead') role = 'Song Leader';
      if (role === 'Multimedia') role = 'Lyricist';

      const filteredAssigned = (assignment.assignedMembers || []).filter(
        (am) =>
          !DEMO_MEMBER_IDS.has(am.memberId) &&
          !DEMO_MEMBER_NAMES.has((am.memberName || '').trim().toLowerCase())
      );

      return {
        ...assignment,
        role,
        assignedMembers: filteredAssigned
      };
    });
    return {
      ...sch,
      id: validId,
      ministryAssignments: updatedAssignments
    };
  });
}

/**
 * StorageService Facade.
 * Bridges application requests to the active Data Repository (LocalStorage, Firebase, or Supabase).
 */
export class StorageService {
  // Sync fallback methods for immediate UI initializations
  static getMembersSync(): Member[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MEMBERS);
      const raw: Member[] = data ? JSON.parse(data) : DEFAULT_MEMBERS;
      const sanitized = sanitizeMembers(raw);
      if (JSON.stringify(raw) !== JSON.stringify(sanitized)) {
        try {
          localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(sanitized));
        } catch {}
      }
      return sanitized;
    } catch {
      return sanitizeMembers(DEFAULT_MEMBERS);
    }
  }

  static getMembers(): Member[] {
    return this.getMembersSync();
  }

  static async getMembersAsync(): Promise<Member[]> {
    const members = await dataRepository.getMembers();
    return sanitizeMembers(members);
  }

  static saveMembers(members: Member[]): void {
    try {
      const sanitized = sanitizeMembers(members);
      localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(sanitized));
      dataRepository.saveMembers(sanitized);
    } catch (e) {
      console.error('Failed to save members', e);
    }
  }

  static getLabelsSync(): string[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.LABELS);
      const raw: string[] = data ? JSON.parse(data) : DEFAULT_LABELS;
      const sanitized = sanitizeLabels(raw);
      if (JSON.stringify(raw) !== JSON.stringify(sanitized)) {
        try {
          localStorage.setItem(STORAGE_KEYS.LABELS, JSON.stringify(sanitized));
        } catch {}
      }
      return sanitized;
    } catch {
      return sanitizeLabels(DEFAULT_LABELS);
    }
  }

  static getLabels(): string[] {
    return this.getLabelsSync();
  }

  static async getLabelsAsync(): Promise<string[]> {
    const labels = await dataRepository.getLabels();
    return sanitizeLabels(labels);
  }

  static saveLabels(labels: string[]): void {
    try {
      const sanitized = sanitizeLabels(labels);
      localStorage.setItem(STORAGE_KEYS.LABELS, JSON.stringify(sanitized));
      dataRepository.saveLabels(sanitized);
    } catch (e) {
      console.error('Failed to save labels', e);
    }
  }

  static getSchedulesSync(): Schedule[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SCHEDULES);
      const raw: Schedule[] = data ? JSON.parse(data) : DEFAULT_SCHEDULES;
      let sanitized = sanitizeSchedules(raw);

      // Auto-sync with authoritative songs database
      try {
        const songData = localStorage.getItem('wwcf_songs_v1');
        if (songData) {
          const songs = JSON.parse(songData);
          if (Array.isArray(songs) && songs.length > 0) {
            const { updatedSchedules, hasChanges } = syncSchedulesWithAuthoritativeSongs(sanitized, songs);
            if (hasChanges) {
              sanitized = updatedSchedules;
              localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(sanitized));
            }
          }
        }
      } catch (e) {
        // Fallback gracefully
      }

      if (JSON.stringify(raw) !== JSON.stringify(sanitized)) {
        try {
          localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(sanitized));
        } catch {}
      }
      return sanitized;
    } catch {
      return sanitizeSchedules(DEFAULT_SCHEDULES);
    }
  }

  static getSchedules(): Schedule[] {
    return this.getSchedulesSync();
  }

  static async getSchedulesAsync(): Promise<Schedule[]> {
    const schedules = await dataRepository.getSchedules();
    return sanitizeSchedules(schedules);
  }

  static saveSchedules(schedules: Schedule[]): void {
    try {
      const sanitized = sanitizeSchedules(schedules);
      localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(sanitized));
      dataRepository.saveSchedules(sanitized);
    } catch (e) {
      console.error('Failed to save schedules', e);
    }
  }

  static getDarkModeSync(): boolean {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.DARK_MODE);
      return data ? JSON.parse(data) : false;
    } catch {
      return false;
    }
  }

  static getDarkMode(): boolean {
    return this.getDarkModeSync();
  }

  static saveDarkMode(isDark: boolean): void {
    try {
      localStorage.setItem(STORAGE_KEYS.DARK_MODE, JSON.stringify(isDark));
      dataRepository.saveDarkMode(isDark);
    } catch (e) {
      console.error('Failed to save dark mode setting', e);
    }
  }

  static getDraftScheduleSync(): DraftSchedule | null {
    try {
      let data = localStorage.getItem(STORAGE_KEYS.DRAFT_V2);
      if (!data) {
        data = localStorage.getItem(STORAGE_KEYS.DRAFT_V1);
      }
      if (!data) return null;
      const draft = JSON.parse(data);
      if (!draft) return null;

      if (draft.ministryAssignments) {
        draft.ministryAssignments = (draft.ministryAssignments || []).map((a: any) => {
          let role = a.role;
          if (role === 'Song Lead') role = 'Song Leader';
          if (role === 'Multimedia') role = 'Lyricist';
          return { ...a, role };
        });
      }
      return {
        version: 2,
        editingScheduleId: draft.editingScheduleId !== undefined ? draft.editingScheduleId : (draft.id || null),
        savedAt: draft.savedAt || getManilaNowISO(),
        serviceType: draft.serviceType,
        serviceDate: draft.serviceDate,
        praiseSongs: draft.praiseSongs || [''],
        worshipSongs: draft.worshipSongs || [''],
        praiseSongKeys: draft.praiseSongKeys || [],
        worshipSongKeys: draft.worshipSongKeys || [],
        ministryAssignments: draft.ministryAssignments || [],
        notes: draft.notes || ''
      };
    } catch {
      return null;
    }
  }

  static getDraftSchedule(): DraftSchedule | null {
    return this.getDraftScheduleSync();
  }

  static saveDraftSchedule(draft: DraftSchedule | null): void {
    try {
      if (!draft) {
        localStorage.removeItem(STORAGE_KEYS.DRAFT_V2);
        localStorage.removeItem(STORAGE_KEYS.DRAFT_V1);
      } else {
        const fullDraft = {
          version: 2,
          editingScheduleId: draft.editingScheduleId !== undefined ? draft.editingScheduleId : null,
          savedAt: getManilaNowISO(),
          ...draft
        };
        const serialized = JSON.stringify(fullDraft);
        localStorage.setItem(STORAGE_KEYS.DRAFT_V2, serialized);
      }
      dataRepository.saveDraftSchedule(draft);
    } catch (e) {
      console.error('Failed to save draft schedule', e);
    }
  }

  static getOnboardingDisabled(): boolean {
    return this.getGuideMode() === 'never';
  }

  static setOnboardingDisabled(disabled: boolean): void {
    this.setGuideMode(disabled ? 'never' : 'first_visit');
  }

  static getGuideMode(): GuideAutoShowMode {
    try {
      const mode = localStorage.getItem(STORAGE_KEYS.GUIDE_MODE);
      if (mode === 'first_visit' || mode === 'every_time' || mode === 'never') {
        return mode as GuideAutoShowMode;
      }
      const legacyDisabled = localStorage.getItem('wwcf_onboarding_disabled');
      if (legacyDisabled === 'true') {
        return 'never';
      }
      return 'first_visit';
    } catch {
      return 'first_visit';
    }
  }

  static setGuideMode(mode: GuideAutoShowMode): void {
    try {
      localStorage.setItem(STORAGE_KEYS.GUIDE_MODE, mode);
      if (mode === 'never') {
        localStorage.setItem('wwcf_onboarding_disabled', 'true');
      } else {
        localStorage.setItem('wwcf_onboarding_disabled', 'false');
      }
    } catch (e) {
      console.error('Failed to save guide mode setting', e);
    }
  }

  static hasVisitedBefore(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEYS.GUIDE_VISITED) === 'true';
    } catch {
      return false;
    }
  }

  static setHasVisitedBefore(visited: boolean): void {
    try {
      if (visited) {
        localStorage.setItem(STORAGE_KEYS.GUIDE_VISITED, 'true');
      } else {
        localStorage.removeItem(STORAGE_KEYS.GUIDE_VISITED);
      }
    } catch (e) {
      console.error(e);
    }
  }

  static resetGuidePreferences(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.GUIDE_MODE, 'first_visit');
      localStorage.setItem('wwcf_onboarding_disabled', 'false');
      localStorage.removeItem(STORAGE_KEYS.GUIDE_VISITED);
      localStorage.removeItem(STORAGE_KEYS.ACCESSIBILITY_ONBOARDED);
      sessionStorage.removeItem('wwcf_onboarding_skipped_session');
    } catch (e) {
      console.error(e);
    }
  }

  static hasAccessibilityOnboarded(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEYS.ACCESSIBILITY_ONBOARDED) === 'true';
    } catch {
      return false;
    }
  }

  static setAccessibilityOnboarded(onboarded: boolean): void {
    try {
      if (onboarded) {
        localStorage.setItem(STORAGE_KEYS.ACCESSIBILITY_ONBOARDED, 'true');
      } else {
        localStorage.removeItem(STORAGE_KEYS.ACCESSIBILITY_ONBOARDED);
      }
    } catch (e) {
      console.error(e);
    }
  }

  static getOnboardingSkippedSession(): boolean {
    try {
      return sessionStorage.getItem('wwcf_onboarding_skipped_session') === 'true';
    } catch {
      return false;
    }
  }

  static setOnboardingSkippedSession(skipped: boolean): void {
    try {
      sessionStorage.setItem('wwcf_onboarding_skipped_session', skipped ? 'true' : 'false');
    } catch (e) {
      console.error(e);
    }
  }

  static getDefaultAccessibilitySettings(): AccessibilitySettings {
    return {
      reducedMotion: false,
      highContrast: false,
      textSize: 'default',
      enhancedFocus: false,
      largerTouchTargets: false,
      ttsEnabled: false,
      ttsSpeechRate: 0.85,
      ttsVoice: '',
      showTtsPanel: true,
      ttsReadingScope: 'all',
      readingMode: false,
      hapticFeedback: false,
      colorVision: 'default',
      displayDensity: 'comfortable',
      simplifiedInterface: false,
      performanceMode: false,
      audioFeedback: true,
      visualToastAlerts: true
    };
  }

  static getAccessibilitySettings(): AccessibilitySettings {
    // REDUCED MOTION MUST BE OFF BY DEFAULT for new users:
    // No saved preference -> Reduced Motion OFF (false)
    // Saved preference = ON -> Keep ON (true)
    // Saved preference = OFF -> Keep OFF (false)
    const defaultSettings = this.getDefaultAccessibilitySettings();

    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACCESSIBILITY);
      if (!data) return defaultSettings;
      const parsed = JSON.parse(data);
      return {
        reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : false,
        highContrast: typeof parsed.highContrast === 'boolean' ? parsed.highContrast : false,
        textSize: ['default', 'large', 'extra-large'].includes(parsed.textSize) ? parsed.textSize : 'default',
        enhancedFocus: typeof parsed.enhancedFocus === 'boolean' ? parsed.enhancedFocus : false,
        largerTouchTargets: typeof parsed.largerTouchTargets === 'boolean' ? parsed.largerTouchTargets : false,
        ttsEnabled: typeof parsed.ttsEnabled === 'boolean' ? parsed.ttsEnabled : false,
        ttsSpeechRate: typeof parsed.ttsSpeechRate === 'number' ? parsed.ttsSpeechRate : 0.85,
        ttsVoice: typeof parsed.ttsVoice === 'string' ? parsed.ttsVoice : '',
        showTtsPanel: typeof parsed.showTtsPanel === 'boolean' ? parsed.showTtsPanel : true,
        ttsReadingScope: ['all', 'essential', 'guide_only'].includes(parsed.ttsReadingScope) ? parsed.ttsReadingScope : 'all',
        readingMode: typeof parsed.readingMode === 'boolean' ? parsed.readingMode : false,
        hapticFeedback: typeof parsed.hapticFeedback === 'boolean' ? parsed.hapticFeedback : false,
        colorVision: ['default', 'protanopia', 'deuteranopia', 'tritanopia', 'monochrome'].includes(parsed.colorVision)
          ? parsed.colorVision
          : 'default',
        displayDensity: ['compact', 'comfortable', 'spacious'].includes(parsed.displayDensity)
          ? parsed.displayDensity
          : 'comfortable',
        simplifiedInterface: typeof parsed.simplifiedInterface === 'boolean' ? parsed.simplifiedInterface : false,
        performanceMode: typeof parsed.performanceMode === 'boolean' ? parsed.performanceMode : false,
        audioFeedback: typeof parsed.audioFeedback === 'boolean' ? parsed.audioFeedback : true,
        visualToastAlerts: typeof parsed.visualToastAlerts === 'boolean' ? parsed.visualToastAlerts : true
      };
    } catch {
      return defaultSettings;
    }
  }

  static saveAccessibilitySettings(settings: AccessibilitySettings): void {
    try {
      localStorage.setItem(STORAGE_KEYS.ACCESSIBILITY, JSON.stringify(settings));
      this.applyAccessibilityToDOM(settings);
    } catch (e) {
      console.error('Failed to save accessibility settings:', e);
    }
  }

  static applyAccessibilityToDOM(settings: AccessibilitySettings): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    // 1. Reduced Motion
    const isReducedMotion = Boolean(settings.reducedMotion);
    root.classList.toggle('reduced-motion', isReducedMotion);
    root.setAttribute('data-reduced-motion', isReducedMotion ? 'true' : 'false');

    // 2. High Contrast
    const isHighContrast = Boolean(settings.highContrast);
    root.classList.toggle('high-contrast', isHighContrast);
    root.setAttribute('data-high-contrast', isHighContrast ? 'true' : 'false');

    // 3. Text Size
    root.classList.remove('text-size-large', 'text-size-xl');
    if (settings.textSize === 'large') {
      root.classList.add('text-size-large');
    } else if (settings.textSize === 'extra-large') {
      root.classList.add('text-size-xl');
    }
    root.setAttribute('data-text-size', settings.textSize || 'default');

    // 4. Enhanced Focus
    const isEnhancedFocus = Boolean(settings.enhancedFocus);
    root.classList.toggle('enhanced-focus', isEnhancedFocus);
    root.setAttribute('data-enhanced-focus', isEnhancedFocus ? 'true' : 'false');

    // 5. Larger Touch Targets
    const isLargerTouch = Boolean(settings.largerTouchTargets);
    root.classList.toggle('larger-touch-targets', isLargerTouch);
    root.setAttribute('data-touch-targets', isLargerTouch ? 'large' : 'normal');

    // 6. Color Vision Accessibility
    root.classList.remove(
      'color-vision-protanopia',
      'color-vision-deuteranopia',
      'color-vision-tritanopia',
      'color-vision-monochrome'
    );
    if (settings.colorVision && settings.colorVision !== 'default') {
      root.classList.add(`color-vision-${settings.colorVision}`);
    }
    root.setAttribute('data-color-vision', settings.colorVision || 'default');

    // 7. Display Density
    root.classList.remove('density-compact', 'density-spacious');
    if (settings.displayDensity === 'compact') {
      root.classList.add('density-compact');
    } else if (settings.displayDensity === 'spacious') {
      root.classList.add('density-spacious');
    }
    root.setAttribute('data-density', settings.displayDensity || 'comfortable');

    // 8. Simplified Interface
    const isSimplified = Boolean(settings.simplifiedInterface);
    root.classList.toggle('simplified-interface', isSimplified);
    root.setAttribute('data-simplified-interface', isSimplified ? 'true' : 'false');

    // 9. Performance / Low-End Device Mode
    const isPerfMode = Boolean(settings.performanceMode);
    root.classList.toggle('performance-mode', isPerfMode);
    root.setAttribute('data-performance-mode', isPerfMode ? 'true' : 'false');

    // 10. TTS Enabled State
    root.setAttribute('data-tts-enabled', settings.ttsEnabled ? 'true' : 'false');

    // 11. Haptic Feedback State
    root.setAttribute('data-haptic-feedback', settings.hapticFeedback ? 'true' : 'false');

    // 12. Audio Feedback State
    root.setAttribute('data-audio-feedback', settings.audioFeedback !== false ? 'true' : 'false');

    // 13. Visual Toast Alerts State
    root.setAttribute('data-visual-toasts', settings.visualToastAlerts !== false ? 'true' : 'false');
  }

  // =========================================================================
  // APPLICATION LAYOUT & NAVIGATION PREFERENCES
  // =========================================================================

  static getLayoutPreferences(): AppLayoutPreferences {
    const defaultLayout: AppLayoutPreferences = {
      navigationOrientation: 'vertical',
      sidebarPosition: 'left',
      sidebarVisibility: 'expanded'
    };

    if (typeof localStorage === 'undefined') return defaultLayout;

    try {
      const data = localStorage.getItem(STORAGE_KEYS.LAYOUT);
      if (!data) return defaultLayout;
      const parsed = JSON.parse(data);
      let sidebarVisibility: 'expanded' | 'collapsed' | 'hidden' = 'expanded';
      if (parsed.sidebarVisibility === 'collapsed') {
        sidebarVisibility = 'collapsed';
      } else if (parsed.sidebarVisibility === 'hidden') {
        sidebarVisibility = 'hidden';
      } else {
        sidebarVisibility = 'expanded';
      }

      return {
        navigationOrientation: parsed.navigationOrientation === 'horizontal' ? 'horizontal' : 'vertical',
        sidebarPosition: parsed.sidebarPosition === 'right' ? 'right' : 'left',
        sidebarVisibility
      };
    } catch {
      return defaultLayout;
    }
  }

  static saveLayoutPreferences(prefs: Partial<AppLayoutPreferences>): AppLayoutPreferences {
    const current = this.getLayoutPreferences();
    const updated: AppLayoutPreferences = {
      ...current,
      ...prefs
    };

    try {
      localStorage.setItem(STORAGE_KEYS.LAYOUT, JSON.stringify(updated));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wwcf:layout-changed', { detail: updated }));
      }
    } catch (e) {
      console.error('Failed to save layout preferences:', e);
    }

    return updated;
  }

  // =========================================================================
  // KEYBOARD SHORTCUTS PERSISTENCE
  // =========================================================================

  static getCustomKeyboardShortcuts(): Record<string, string> {
    if (typeof localStorage === 'undefined') return {};
    try {
      const data = localStorage.getItem(STORAGE_KEYS.KEYBOARD_SHORTCUTS);
      if (!data) return {};
      const parsed = JSON.parse(data);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  static saveCustomKeyboardShortcuts(shortcuts: Record<string, string>): void {
    try {
      localStorage.setItem(STORAGE_KEYS.KEYBOARD_SHORTCUTS, JSON.stringify(shortcuts));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wwcf:shortcuts-changed', { detail: shortcuts }));
      }
    } catch (e) {
      console.error('Failed to save custom keyboard shortcuts:', e);
    }
  }

  static resetCustomKeyboardShortcuts(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.KEYBOARD_SHORTCUTS);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wwcf:shortcuts-changed', { detail: {} }));
      }
    } catch (e) {
      console.error('Failed to reset custom keyboard shortcuts:', e);
    }
  }

  // =========================================================================
  // DISTINCT SAME-NAME SONGS PERSISTENCE
  // =========================================================================

  static getMarkedDistinctSameNameKeys(): string[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.DISTINCT_SAME_NAME);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  static markSameNameKeyAsDistinct(key: string, isDistinct: boolean = true): void {
    try {
      const list = this.getMarkedDistinctSameNameKeys();
      const set = new Set(list);
      if (isDistinct) {
        set.add(key);
      } else {
        set.delete(key);
      }
      localStorage.setItem(STORAGE_KEYS.DISTINCT_SAME_NAME, JSON.stringify(Array.from(set)));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wwcf:distinct-songs-changed', { detail: { key, isDistinct } }));
      }
    } catch (e) {
      console.error('Failed to save marked distinct songs:', e);
    }
  }

  static getMarkedDistinctSongPairs(): string[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.DISTINCT_SONG_PAIRS);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  static markSongPairAsDistinct(songIdA: string, songIdB: string, isDistinct: boolean = true): void {
    if (!songIdA || !songIdB || songIdA === songIdB) return;
    try {
      const sorted = [songIdA, songIdB].sort();
      const pairKey = `pair_${sorted[0]}_${sorted[1]}`;
      const list = this.getMarkedDistinctSongPairs();
      const set = new Set(list);
      if (isDistinct) {
        set.add(pairKey);
      } else {
        set.delete(pairKey);
      }
      localStorage.setItem(STORAGE_KEYS.DISTINCT_SONG_PAIRS, JSON.stringify(Array.from(set)));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wwcf:distinct-pairs-changed', { detail: { pairKey, isDistinct } }));
      }
    } catch (e) {
      console.error('Failed to save marked distinct song pair:', e);
    }
  }

  static isSongPairMarkedDistinct(songIdA: string, songIdB: string, normKey?: string): boolean {
    if (!songIdA || !songIdB) return false;
    // Check pair-level decision first
    const sorted = [songIdA, songIdB].sort();
    const pairKey = `pair_${sorted[0]}_${sorted[1]}`;
    const pairSet = new Set(this.getMarkedDistinctSongPairs());
    if (pairSet.has(pairKey)) return true;

    // Check legacy title-level decision for backwards-compatibility
    if (normKey) {
      const titleSet = new Set(this.getMarkedDistinctSameNameKeys());
      if (titleSet.has(normKey.trim().toLowerCase())) return true;
    }
    return false;
  }

  static getSchedulerSmartFilter(): boolean {
    if (typeof localStorage === 'undefined') return true;
    try {
      const val = localStorage.getItem(STORAGE_KEYS.SCHEDULER_SMART_FILTER);
      if (val === null) return true; // Default to true
      return val === 'true';
    } catch {
      return true;
    }
  }

  static saveSchedulerSmartFilter(enabled: boolean): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.SCHEDULER_SMART_FILTER, String(enabled));
    } catch (e) {
      console.error('Failed to save scheduler smart filter setting:', e);
    }
  }

  // =========================================================================
  // TAB & VIEW FILTER MEMORY PERSISTENCE
  // =========================================================================

  static getSongsFilterSettings(): SongsFilterSettings {
    if (typeof localStorage === 'undefined') return {};
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SONGS_FILTER);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  static saveSongsFilterSettings(settings: SongsFilterSettings): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.SONGS_FILTER, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save songs filter settings:', e);
    }
  }

  static getSchedulesFilterSettings(): SchedulesFilterSettings {
    if (typeof localStorage === 'undefined') return {};
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SCHEDULES_FILTER);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  static saveSchedulesFilterSettings(settings: SchedulesFilterSettings): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.SCHEDULES_FILTER, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save schedules filter settings:', e);
    }
  }

  static getMembersFilterSettings(): MembersFilterSettings {
    if (typeof localStorage === 'undefined') return {};
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MEMBERS_FILTER);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  static saveMembersFilterSettings(settings: MembersFilterSettings): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.MEMBERS_FILTER, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save members filter settings:', e);
    }
  }

  static getSongPickerFilterSettings(): SongPickerFilterSettings {
    if (typeof localStorage === 'undefined') return {};
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SONG_PICKER_FILTER);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  static saveSongPickerFilterSettings(settings: SongPickerFilterSettings): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.SONG_PICKER_FILTER, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save song picker filter settings:', e);
    }
  }

  /**
   * Resets transient filters and view controls to their default presets upon full browser refresh
   * (e.g. selected month reset to current Manila month, checked filters/search queries cleared),
   * while completely protecting and preserving all real application data and user settings.
   */
  static resetTransientFilterPresets(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const parts = getManilaDateParts();
      const defaultYear = String(parts.year);
      const defaultMonth = String(parts.month).padStart(2, '0');

      // 1. Reset Schedules View filter to current Manila month, all services, date-desc
      this.saveSchedulesFilterSettings({
        searchQuery: '',
        serviceFilter: 'all',
        yearFilter: defaultYear,
        monthFilter: defaultMonth,
        sortOption: 'date-desc'
      });

      // 2. Reset Songs View filter to defaults
      this.saveSongsFilterSettings({
        searchQuery: '',
        categoryFilter: 'all',
        languageFilter: 'all',
        versionTypeFilter: 'all',
        sortBy: 'name-asc'
      });

      // 3. Reset Members View filter to defaults
      this.saveMembersFilterSettings({
        searchQuery: '',
        filterLabels: [],
        statusFilter: 'all',
        sortOption: 'name-asc'
      });

      // 4. Reset Song Picker filter to defaults
      this.saveSongPickerFilterSettings({
        searchQuery: '',
        selectedLanguage: '',
        selectedKey: '',
        selectedBadgeFilter: ''
      });
    } catch (e) {
      console.error('Failed to reset transient filters on refresh:', e);
    }
  }

  /**
   * Checks if an active uncommitted draft schedule exists with unsaved content.
   */
  static hasUnsavedDraftSchedule(): boolean {
    try {
      const draft = this.getDraftScheduleSync();
      if (!draft) return false;
      const hasPraise = Array.isArray(draft.praiseSongs) && draft.praiseSongs.some((s) => typeof s === 'string' && s.trim() !== '');
      const hasWorship = Array.isArray(draft.worshipSongs) && draft.worshipSongs.some((s) => typeof s === 'string' && s.trim() !== '');
      const hasAssignments = Array.isArray(draft.ministryAssignments) && draft.ministryAssignments.some((a) => {
        const mems = a.assignedMembers;
        return (Array.isArray(mems) && mems.length > 0) || Boolean(a.memberId);
      });
      return hasPraise || hasWorship || hasAssignments;
    } catch {
      return false;
    }
  }

  /**
   * Securely purges all user-created application data and resets the database to a fresh state.
   */
  static async deleteAllData(): Promise<void> {
    try {
      // 1. Explicitly reset core datasets in localStorage
      localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.LABELS, JSON.stringify(DEFAULT_LABELS));
      localStorage.setItem('wwcf_songs_v1', JSON.stringify([]));
      localStorage.setItem('wwcf_song_families_v1', JSON.stringify([]));
      localStorage.removeItem(STORAGE_KEYS.DISTINCT_SAME_NAME);
      localStorage.removeItem(STORAGE_KEYS.SONGS_FILTER);
      localStorage.removeItem(STORAGE_KEYS.SCHEDULES_FILTER);
      localStorage.removeItem(STORAGE_KEYS.MEMBERS_FILTER);
      localStorage.removeItem(STORAGE_KEYS.SONG_PICKER_FILTER);

      // 2. Remove draft schedules & custom local sort/search preferences
      localStorage.removeItem(STORAGE_KEYS.DRAFT_V2);
      localStorage.removeItem(STORAGE_KEYS.DRAFT_V1);
      localStorage.removeItem('wwcf_member_sort_v1');
      localStorage.removeItem('schedules_sort_option');
      localStorage.removeItem('YOUTUBE_API_KEY');

      // 3. Propagate changes to dataRepository adapter
      await dataRepository.saveMembers([]);
      await dataRepository.saveSchedules([]);
      await dataRepository.saveLabels(DEFAULT_LABELS);
      await dataRepository.saveDraftSchedule(null);

      // 4. Reset guide preferences
      this.resetGuidePreferences();

      // 5. Clear temporary session caches
      sessionStorage.clear();
    } catch (e) {
      console.error('Failed to purge application data:', e);
      throw new Error('Failed to delete stored application data');
    }
  }
}
