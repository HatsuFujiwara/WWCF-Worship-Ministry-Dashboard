/**
 * WWCF Santa Cruz Worship Song Line-up Scheduler
 * Central Accessible Description & Active Speech Assistant Engine
 * 
 * Supports:
 * - Desktop Mouse: Hover dwell (~380ms) to speak meaningful UI elements
 * - Mobile Touch: Long-press (~550ms) to speak, zero interference with tap or scroll
 * - Keyboard: Tab focusin speaks accessible description immediately
 * - Interactive Guide: First-class speech narration for steps, instructions, and highlighted targets
 * - Reading Mode: Sequential structured landmark navigation
 * - Speech Queue: Guide announcements take priority; stops previous speech cleanly
 */

import { triggerHaptic } from './haptics';
import { StorageService } from '../services/storage';

export type SpeechPriority = 'guide' | 'critical' | 'interactive';

interface ActiveUtteranceInfo {
  utterance: SpeechSynthesisUtterance;
  priority: SpeechPriority;
  text: string;
}

class SpeechAssistantEngine {
  private supported: boolean = false;
  private voices: SpeechSynthesisVoice[] = [];
  private currentUtterance: ActiveUtteranceInfo | null = null;
  private currentSpeechRate: number = 0.85;
  private currentVoiceName: string = '';
  private readingScope: 'all' | 'essential' | 'guide_only' = 'all';
  private isInitialized: boolean = false;
  private isReadingModeActive: boolean = false;
  private readingIndex: number = 0;
  private readingElements: HTMLElement[] = [];

  // Interaction tracking state
  private hoverTimer: any = null;
  private hoveredElement: HTMLElement | null = null;
  private longPressTimer: any = null;
  private touchStartPos: { x: number; y: number } | null = null;
  private touchTarget: HTMLElement | null = null;
  private lastSpokenText: string = '';
  private lastSpokenTime: number = 0;
  private listenersAttached: boolean = false;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
      this.supported = true;
      this.initVoices();
    }
  }

  private initVoices(): void {
    if (!this.supported || typeof window === 'undefined') return;
    const synth = window.speechSynthesis;

    const loadVoices = () => {
      try {
        const v = synth.getVoices();
        if (v && v.length > 0) {
          this.voices = v;
        }
      } catch (e) {
        console.warn('SpeechSynthesis getVoices error:', e);
      }
    };

    loadVoices();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = loadVoices;
    }
  }

  public isSupported(): boolean {
    return this.supported;
  }

  public getAvailableVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  public setRate(rate: number): void {
    this.currentSpeechRate = Math.max(0.5, Math.min(2, rate));
  }

  public getRate(): number {
    return this.currentSpeechRate;
  }

  public setVoice(voiceName: string): void {
    this.currentVoiceName = voiceName;
  }

  public getVoice(): string {
    return this.currentVoiceName;
  }

  public setReadingScope(scope: 'all' | 'essential' | 'guide_only'): void {
    this.readingScope = scope;
  }

  public setReadingMode(mode: 'all' | 'essential' | 'guide_only'): void {
    this.readingScope = mode;
  }

  public getReadingScope(): 'all' | 'essential' | 'guide_only' {
    return this.readingScope;
  }

  public isSpeaking(): boolean {
    if (!this.supported || typeof window === 'undefined') return false;
    return window.speechSynthesis.speaking;
  }

  public isPaused(): boolean {
    if (!this.supported || typeof window === 'undefined') return false;
    return window.speechSynthesis.paused;
  }

  public pause(): void {
    if (!this.supported || typeof window === 'undefined') return;
    try {
      window.speechSynthesis.pause();
    } catch {}
  }

  public resume(): void {
    if (!this.supported || typeof window === 'undefined') return;
    try {
      window.speechSynthesis.resume();
    } catch {}
  }

  public stop(): void {
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    this.hoveredElement = null;
    this.touchTarget = null;
    this.currentUtterance = null;
    this.isReadingModeActive = false;

    if (!this.supported || typeof window === 'undefined') return;
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }

  /**
   * Speak text with priority queueing
   * - 'guide': Highest priority. Guide steps speak fully and aren't interrupted by incidental hovers.
   * - 'critical': High priority (e.g. test button, explicit click).
   * - 'interactive': Normal priority (hover, touch long-press, keyboard focus).
   */
  public speak(
    text: string,
    options: {
      priority?: SpeechPriority;
      rate?: number;
      voice?: string;
      onStart?: () => void;
      onEnd?: () => void;
      force?: boolean;
      allowWhenDisabled?: boolean;
    } = {}
  ): boolean {
    if (!this.supported || typeof window === 'undefined') return false;

    // Strict Accessibility Setting Guard: Never speak when TTS is disabled unless explicitly permitted (e.g. testing voice)
    const settings = StorageService.getAccessibilitySettings();
    if (!settings.ttsEnabled && !options.allowWhenDisabled) {
      return false;
    }

    const synth = window.speechSynthesis;

    // Clean text and insert natural speech pauses around punctuation
    const trimmed = text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\s*•\s*/g, ', ')
      .replace(/\s*\|\s*/g, ', ')
      .replace(/\s*:\s*/g, ': ')
      .replace(/\s*;\s*/g, ', ');

    if (!trimmed) return false;

    const priority = options.priority || 'interactive';

    // Prevent incidental hover/focus from interrupting active guide narration
    if (
      this.currentUtterance &&
      this.currentUtterance.priority === 'guide' &&
      priority === 'interactive' &&
      synth.speaking
    ) {
      return false;
    }

    // Deduplicate same phrase spoken within 800ms unless forced
    const now = Date.now();
    if (!options.force && trimmed === this.lastSpokenText && now - this.lastSpokenTime < 800) {
      return false;
    }

    try {
      // Cancel previous utterance
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(trimmed);
      const effectiveRate = options.rate || this.currentSpeechRate || 0.85;
      utterance.rate = effectiveRate;

      // Select voice
      const voiceToUse = options.voice || this.currentVoiceName;
      if (voiceToUse && this.voices.length > 0) {
        const foundVoice = this.voices.find((v) => v.name === voiceToUse);
        if (foundVoice) {
          utterance.voice = foundVoice;
        }
      } else if (this.voices.length > 0) {
        // Preferred English voice fallback
        const enVoice =
          this.voices.find((v) => v.lang.startsWith('en') && v.default) ||
          this.voices.find((v) => v.lang.startsWith('en')) ||
          this.voices[0];
        if (enVoice) {
          utterance.voice = enVoice;
        }
      }

      this.currentUtterance = {
        utterance,
        priority,
        text: trimmed
      };

      utterance.onstart = () => {
        this.lastSpokenText = trimmed;
        this.lastSpokenTime = Date.now();
        if (options.onStart) options.onStart();
      };

      utterance.onend = () => {
        if (this.currentUtterance?.utterance === utterance) {
          this.currentUtterance = null;
        }
        if (options.onEnd) options.onEnd();
      };

      utterance.onerror = (e) => {
        if (e.error !== 'canceled' && e.error !== 'interrupted') {
          console.warn('Speech synthesis error:', e);
        }
        if (this.currentUtterance?.utterance === utterance) {
          this.currentUtterance = null;
        }
      };

      synth.speak(utterance);
      return true;
    } catch (err) {
      console.error('Speech synthesis speak exception:', err);
      return false;
    }
  }

  // ========================================================
  // SEMANTIC DESCRIPTION GENERATOR
  // ========================================================

  /**
   * Finds the nearest meaningful interactive or informational element from any event target.
   * STRICT LEAF TARGETING: If the cursor/touch is on a button, badge, chip, input, or link inside a card,
   * it returns ONLY that specific inner control, NOT the surrounding song card or parent row!
   */
  public getMeaningfulTarget(node: Node | null): HTMLElement | null {
    if (!node || !(node instanceof HTMLElement)) return null;

    // Ignore elements hidden from accessibility tree
    if (
      node.closest('[aria-hidden="true"]') ||
      node.closest('[data-tts-ignore]') ||
      node.classList.contains('tts-ignore')
    ) {
      return null;
    }

    // Scope filtering: if guide_only or essential
    if (this.readingScope === 'guide_only') {
      const guideMatch = node.closest<HTMLElement>(
        '[data-tour], [data-speech-guide], .tour-overlay, [aria-label*="Guide"], [aria-label*="Tour"]'
      );
      return guideMatch;
    }

    if (this.readingScope === 'essential') {
      const essentialMatch = node.closest<HTMLElement>(
        'button, a[href], input, select, [role="button"], [role="tab"], [role="switch"], [role="option"], [data-tour]'
      );
      return essentialMatch;
    }

    // 1. Direct interactive controls (Buttons, inputs, selects, options, tabs, switches, links)
    const directControl = node.closest<HTMLElement>(
      'button, a[href], input, select, textarea, [role="button"], [role="switch"], [role="tab"], [role="checkbox"], [role="option"], [role="menuitem"], [role="link"], [data-speech-label], [data-tour]'
    );
    if (directControl) return directControl;

    // 2. Specific badges, chips, or tag pills
    const badgeMatch = node.closest<HTMLElement>(
      '.badge, .tag, [data-tag], [data-badge], span[class*="rounded-full"], span[class*="rounded-md"]'
    );
    if (badgeMatch && badgeMatch.textContent?.trim()) {
      return badgeMatch;
    }

    // 3. Headings or titles
    const headingMatch = node.closest<HTMLElement>('h1, h2, h3, h4, h5, h6, [role="heading"]');
    if (headingMatch) return headingMatch;

    // 4. Standalone elements with explicit accessibility attributes
    if (node.getAttribute('aria-label') || node.getAttribute('title')) {
      return node;
    }

    // 5. Entity cards (Only if not hovering an inner interactive element or heading)
    const entityCard = node.closest<HTMLElement>(
      '[data-song-title], [data-song-id], [data-member-id], [data-member-name], [data-schedule-id], [data-family-id], [data-schedule-date]'
    );
    if (entityCard) return entityCard;

    return null;
  }

  /**
   * Generates a rich, human-like accessible spoken description for an element
   */
  public getSpeechDescription(element: HTMLElement): string | null {
    if (!element || typeof document === 'undefined') return null;

    // Explicit custom override label (data-tts-label / data-tts-description)
    const explicitTtsLabel = element.getAttribute('data-tts-label') || element.getAttribute('data-speech-label');
    const explicitTtsDesc = element.getAttribute('data-tts-description') || element.getAttribute('data-speech-description');
    if (explicitTtsLabel) {
      return explicitTtsDesc ? `${explicitTtsLabel.trim()}. ${explicitTtsDesc.trim()}` : explicitTtsLabel.trim();
    }
    if (explicitTtsDesc) {
      return explicitTtsDesc.trim();
    }

    // Check if element is a guide target
    const tourTag = element.getAttribute('data-tour');
    const guideTourDescription = this.describeGuideTarget(element, tourTag);
    if (guideTourDescription) {
      return guideTourDescription;
    }

    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute('role')?.toLowerCase() || tagName;
    const ariaLabel = element.getAttribute('aria-label')?.trim();
    const title = element.getAttribute('title')?.trim();

    // 1. Interactive controls take absolute priority over parent entity cards
    // Buttons
    if (tagName === 'button' || role === 'button') {
      const rawText = ariaLabel || title || this.cleanVisibleText(element);
      const isDis = element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
      const disabledInfo = isDis ? ', disabled' : '';
      return `${rawText || 'Action'}, button${disabledInfo}`;
    }

    // Checkboxes and Switches
    if (element instanceof HTMLInputElement && element.type === 'checkbox') {
      const label = ariaLabel || title || this.findAssociatedLabel(element) || element.name || 'Checkbox';
      const state = element.checked ? 'checked' : 'unchecked';
      return `${label}, checkbox, ${state}`;
    }

    if (role === 'switch') {
      const label = ariaLabel || title || element.textContent?.trim() || 'Switch';
      const isChecked = element.getAttribute('aria-checked') === 'true' || element.classList.contains('active');
      const state = isChecked ? 'currently on' : 'currently off';
      return `${label}, toggle switch, ${state}`;
    }

    // Options in custom select / listbox
    if (role === 'option') {
      const label = ariaLabel || title || this.cleanVisibleText(element);
      const isSelected = element.getAttribute('aria-selected') === 'true';
      return `${label}, option${isSelected ? ', currently selected' : ''}`;
    }

    // Dropdown / Select
    if (element instanceof HTMLSelectElement) {
      const label = ariaLabel || title || this.findAssociatedLabel(element) || 'Dropdown';
      const selectedOption = element.options[element.selectedIndex]?.text || element.value || 'None';
      return `${label}, dropdown menu, current selection: ${selectedOption}`;
    }

    // Text inputs and Date pickers
    if (element instanceof HTMLInputElement) {
      const label = ariaLabel || title || this.findAssociatedLabel(element) || element.placeholder || 'Input field';
      if (element.type === 'date') {
        const val = element.value ? `value: ${element.value}` : 'no date set';
        return `${label}, date picker, ${val}`;
      }
      if (element.type === 'search') {
        const val = element.value ? `current query: ${element.value}` : 'empty';
        return `${label}, search field, ${val}`;
      }
      const val = element.value ? `current value: ${element.value}` : 'empty';
      return `${label}, text input, ${val}`;
    }

    // Navigation tabs
    if (role === 'tab' || element.closest('nav')) {
      const label = ariaLabel || title || this.cleanVisibleText(element);
      const isSelected =
        element.getAttribute('aria-selected') === 'true' ||
        element.classList.contains('active') ||
        element.getAttribute('data-active') === 'true';
      const status = isSelected ? ', currently selected' : '';
      return `${label}, navigation tab${status}`;
    }

    // Links
    if (tagName === 'a' || role === 'link') {
      const label = ariaLabel || title || this.cleanVisibleText(element);
      return `${label}, link`;
    }

    // Headings
    if (/^h[1-6]$/.test(tagName) || role === 'heading') {
      const label = this.cleanVisibleText(element);
      return `${label}, heading`;
    }

    // Badges / Tags
    if (element.classList.contains('badge') || element.classList.contains('tag') || element.getAttribute('data-tag')) {
      const label = ariaLabel || title || this.cleanVisibleText(element);
      return `${label}, tag`;
    }

    // Status or Alert
    if (role === 'alert' || role === 'status' || element.classList.contains('toast')) {
      const text = this.cleanVisibleText(element);
      return `Alert notification: ${text}`;
    }

    // 2. Only if NOT a specific leaf control, describe compound entity cards
    const songCardDesc = this.describeSongCard(element);
    if (songCardDesc) return songCardDesc;

    const memberDesc = this.describeMemberCard(element);
    if (memberDesc) return memberDesc;

    const lineupDesc = this.describeLineupCard(element);
    if (lineupDesc) return lineupDesc;

    const familyDesc = this.describeSongFamilyCard(element);
    if (familyDesc) return familyDesc;

    // Fallback: aria-label, title, or visible text
    const fallbackText = ariaLabel || title || this.cleanVisibleText(element);
    if (fallbackText && fallbackText.length > 1 && fallbackText.length < 200) {
      return fallbackText;
    }

    return null;
  }

  private cleanVisibleText(el: HTMLElement): string {
    const clone = el.cloneNode(true) as HTMLElement;
    // Remove SVG and hidden elements from text extraction
    clone.querySelectorAll('svg, [aria-hidden="true"]').forEach((n) => n.remove());
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  }

  private findAssociatedLabel(el: HTMLElement): string {
    if (el.id) {
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl && lbl.textContent) return lbl.textContent.trim();
    }
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.textContent) {
      return parentLabel.textContent.trim();
    }
    return '';
  }

  /**
   * Specialized descriptions for songs in database or lineup
   */
  private describeSongCard(el: HTMLElement): string | null {
    const songCard = el.closest<HTMLElement>(
      '[data-song-title], [data-song-id], .song-card, .song-row, tr[data-song]'
    );
    if (!songCard) return null;

    const title =
      songCard.getAttribute('data-song-title') ||
      songCard.querySelector('.song-title, h4, h3, font-bold')?.textContent?.trim();

    if (!title) return null;

    const artist =
      songCard.getAttribute('data-song-artist') ||
      songCard.querySelector('.song-artist, .text-slate-500, .text-slate-400')?.textContent?.trim() ||
      '';

    const category =
      songCard.getAttribute('data-song-category') ||
      (songCard.textContent?.includes('Praise') ? 'Praise' : songCard.textContent?.includes('Worship') ? 'Worship' : '');

    const key =
      songCard.getAttribute('data-song-key') ||
      (songCard.textContent?.match(/Key\s+([A-G][b#]?m?)/i)?.[0] || '');

    const relBadge =
      songCard.querySelector('.badge-original, [data-relationship="ORIGINAL"]') ? 'Original version' :
      songCard.querySelector('.badge-cover, [data-relationship="COVER"]') ? 'Cover version' :
      songCard.querySelector('.badge-acoustic, [data-relationship="ACOUSTIC_VERSION"]') ? 'Acoustic arrangement' : '';

    const plays = songCard.getAttribute('data-song-plays') || '';
    const lastPlayed = songCard.getAttribute('data-song-last-played') || '';

    const parts: string[] = [`Song: ${title}`];
    if (artist && !artist.includes(title)) parts.push(`by ${artist}`);
    if (category) parts.push(`Category: ${category}`);
    if (key) parts.push(key);
    if (relBadge) parts.push(relBadge);
    if (plays) parts.push(`Used ${plays} times`);
    if (lastPlayed) parts.push(`Last played: ${lastPlayed}`);

    return parts.join('. ') + '.';
  }

  /**
   * Specialized description for team members
   */
  private describeMemberCard(el: HTMLElement): string | null {
    const memberCard = el.closest<HTMLElement>('[data-member-name], [data-member-id], .member-row');
    if (!memberCard) return null;

    const name =
      memberCard.getAttribute('data-member-name') ||
      memberCard.querySelector('h4, h3, .member-name')?.textContent?.trim();

    if (!name) return null;

    const labels =
      memberCard.getAttribute('data-member-labels') ||
      Array.from(memberCard.querySelectorAll('.badge, .tag, [data-tag]'))
        .map((t) => t.textContent?.trim())
        .filter(Boolean)
        .join(', ');

    return `Team Member: ${name}${labels ? `. Roles: ${labels}` : ''}.`;
  }

  /**
   * Specialized description for saved lineups
   */
  private describeLineupCard(el: HTMLElement): string | null {
    const lineupCard = el.closest<HTMLElement>('[data-schedule-date], [data-schedule-id], .lineup-card');
    if (!lineupCard) return null;

    const date =
      lineupCard.getAttribute('data-schedule-date') ||
      lineupCard.querySelector('.service-date, font-bold')?.textContent?.trim();

    const type =
      lineupCard.getAttribute('data-schedule-type') ||
      (lineupCard.textContent?.includes('Sunday Service') ? 'Sunday Service' : 'Worship Lineup');

    const leader = lineupCard.getAttribute('data-schedule-leader') || '';
    const songCount = lineupCard.getAttribute('data-schedule-song-count') || '';

    const parts = [`Saved Lineup: ${type}`];
    if (date) parts.push(`Date: ${date}`);
    if (leader) parts.push(`Leader: ${leader}`);
    if (songCount) parts.push(`${songCount} songs`);
    return parts.join('. ') + '.';
  }

  /**
   * Specialized description for song families
   */
  private describeSongFamilyCard(el: HTMLElement): string | null {
    const famCard = el.closest<HTMLElement>('[data-family-id], [data-family-name], .family-card');
    if (!famCard) return null;

    const name =
      famCard.getAttribute('data-family-name') ||
      famCard.querySelector('h3, h4, font-bold')?.textContent?.trim();

    if (!name) return null;

    const count = famCard.getAttribute('data-family-count') || '';
    return `Song Family: ${name}${count ? `, contains ${count} song arrangements` : ''}.`;
  }

  /**
   * Specialized descriptions for tour targets
   */
  private describeGuideTarget(el: HTMLElement, tourTag: string | null): string | null {
    if (!tourTag) return null;

    const tourDescriptions: Record<string, string> = {
      'new-lineup-btn': 'Highlighted control: New Lineup button. Activates the new lineup workflow.',
      'sidebar-scheduler-btn': 'Highlighted control: Line-up Scheduler navigation tab.',
      'sidebar-songs-btn': 'Highlighted control: Song Database navigation tab.',
      'sidebar-schedules-btn': 'Highlighted control: Saved Line-ups archive tab.',
      'sidebar-members-btn': 'Highlighted control: Team Members roster tab.',
      'sidebar-settings-btn': 'Highlighted control: Application Settings button.',
      'service-type-select': 'Highlighted control: Service Type selector. Choose between Sunday Service or Midweek.',
      'service-date-picker': 'Highlighted control: Service Date picker. Choose the service date for this lineup.',
      'load-schedule-date-select': 'Highlighted control: Existing lineup date selector.',
      'add-song-btn': 'Highlighted control: Add Song button. Search catalog or enter custom songs.',
      'import-playlist-btn': 'Highlighted control: Import Song or Playlist button. Paste a YouTube or YouTube Music playlist link.',
      'save-lineup-btn': 'Highlighted control: Save Line-up button. Validates and saves your worship schedule.',
      'export-pdf-btn': 'Highlighted control: Export PDF button. Generates a printable worship bulletin.',
      'export-png-btn': 'Highlighted control: Export PNG button. Generates a high-resolution image for phones.'
    };

    if (tourDescriptions[tourTag]) {
      return tourDescriptions[tourTag];
    }

    return null;
  }

  // ========================================================
  // GLOBAL LISTENERS: HOVER (DESKTOP), LONG-PRESS (TOUCH), FOCUS (KEYBOARD)
  // ========================================================

  public attachGlobalListeners(): void {
    if (typeof window === 'undefined') return;

    const settings = StorageService.getAccessibilitySettings();
    if (!settings.ttsEnabled) {
      this.detachGlobalListeners();
      return;
    }

    if (this.listenersAttached) return;

    // 1. Desktop Mouse Hover (~380ms dwell delay)
    window.addEventListener('pointerover', this.handlePointerOver, true);
    window.addEventListener('pointerout', this.handlePointerOut, true);

    // 2. Mobile Touch Long-Press (~550ms press-and-hold, zero interference with tap or scroll)
    window.addEventListener('pointerdown', this.handlePointerDown, true);
    window.addEventListener('pointermove', this.handlePointerMove, true);
    window.addEventListener('pointerup', this.handlePointerUp, true);
    window.addEventListener('pointercancel', this.handlePointerCancel, true);

    // 3. Keyboard Accessibility (Tab Focus)
    window.addEventListener('focusin', this.handleFocusIn, true);

    this.listenersAttached = true;
  }

  public detachGlobalListeners(): void {
    if (!this.listenersAttached || typeof window === 'undefined') return;

    window.removeEventListener('pointerover', this.handlePointerOver, true);
    window.removeEventListener('pointerout', this.handlePointerOut, true);
    window.removeEventListener('pointerdown', this.handlePointerDown, true);
    window.removeEventListener('pointermove', this.handlePointerMove, true);
    window.removeEventListener('pointerup', this.handlePointerUp, true);
    window.removeEventListener('pointercancel', this.handlePointerCancel, true);
    window.removeEventListener('focusin', this.handleFocusIn, true);

    this.listenersAttached = false;
  }

  private handlePointerOver = (e: PointerEvent): void => {
    // Only trigger hover on actual mouse or stylus, NEVER on touch
    if (e.pointerType === 'touch') return;

    const settings = StorageService.getAccessibilitySettings();
    if (!settings.ttsEnabled) return;

    const target = this.getMeaningfulTarget(e.target as Node);
    if (!target) {
      if (this.hoverTimer) clearTimeout(this.hoverTimer);
      this.hoveredElement = null;
      return;
    }

    if (target === this.hoveredElement) return;

    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    this.hoveredElement = target;

    // Intentional dwell delay (380ms) prevents speech spam on rapid mouse sweeping
    this.hoverTimer = setTimeout(() => {
      if (this.hoveredElement === target && document.contains(target)) {
        const desc = this.getSpeechDescription(target);
        if (desc) {
          this.speak(desc, { priority: 'interactive' });
        }
      }
    }, 380);
  };

  private handlePointerOut = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;

    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    this.hoveredElement = null;
  };

  private handlePointerDown = (e: PointerEvent): void => {
    // Only handle touch devices for long-press
    if (e.pointerType !== 'touch') return;

    const settings = StorageService.getAccessibilitySettings();
    if (!settings.ttsEnabled) return;

    const target = this.getMeaningfulTarget(e.target as Node);
    if (!target) {
      this.cancelLongPress();
      return;
    }

    this.touchStartPos = { x: e.clientX, y: e.clientY };
    this.touchTarget = target;

    // 550ms press and hold threshold
    this.longPressTimer = setTimeout(() => {
      if (this.touchTarget && document.contains(this.touchTarget)) {
        // Long-press confirmed: subtle haptic feedback and speech
        triggerHaptic('selection');
        const desc = this.getSpeechDescription(this.touchTarget);
        if (desc) {
          this.speak(desc, { priority: 'interactive' });
        }
      }
      this.cancelLongPress();
    }, 550);
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch' || !this.touchStartPos) return;

    // If user moves finger > 12px, they are scrolling: cancel long press immediately!
    const dx = Math.abs(e.clientX - this.touchStartPos.x);
    const dy = Math.abs(e.clientY - this.touchStartPos.y);
    if (dx > 12 || dy > 12) {
      this.cancelLongPress();
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    // Early release before 550ms: normal tap happens naturally, cancel long-press
    this.cancelLongPress();
  };

  private handlePointerCancel = (): void => {
    this.cancelLongPress();
  };

  private cancelLongPress(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.touchStartPos = null;
    this.touchTarget = null;
  }

  private handleFocusIn = (e: FocusEvent): void => {
    const settings = StorageService.getAccessibilitySettings();
    if (!settings.ttsEnabled) return;

    const target = this.getMeaningfulTarget(e.target as Node);
    if (!target) return;

    const desc = this.getSpeechDescription(target);
    if (desc) {
      this.speak(desc, { priority: 'interactive' });
    }
  };

  // ========================================================
  // READING MODE (SEQUENTIAL LANDMARK NAVIGATION)
  // ========================================================

  public startReadingMode(): void {
    if (typeof document === 'undefined') return;

    const settings = StorageService.getAccessibilitySettings();
    if (!settings.ttsEnabled) return;

    this.isReadingModeActive = true;

    // Find main interactive and landmark elements in DOM order
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(
        'main h1, main h2, main h3, [role="tab"], [data-song-title], [data-member-name], [data-schedule-date], [data-family-id], main button:not([disabled]), main input, main select'
      )
    ).filter((el) => {
      const style = window.getComputedStyle(el);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        !el.closest('[aria-hidden="true"]')
      );
    });

    this.readingElements = elements;
    this.readingIndex = 0;
    this.readCurrentReadingItem();
  }

  public nextReadingItem(): void {
    if (!this.isReadingModeActive || this.readingElements.length === 0) return;
    this.readingIndex = Math.min(this.readingElements.length - 1, this.readingIndex + 1);
    this.readCurrentReadingItem();
  }

  public prevReadingItem(): void {
    if (!this.isReadingModeActive || this.readingElements.length === 0) return;
    this.readingIndex = Math.max(0, this.readingIndex - 1);
    this.readCurrentReadingItem();
  }

  private readCurrentReadingItem(): void {
    const el = this.readingElements[this.readingIndex];
    if (!el) return;

    const settings = StorageService.getAccessibilitySettings();
    const scrollBehavior: ScrollBehavior = (settings.reducedMotion || settings.performanceMode) ? 'auto' : 'smooth';
    el.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
    el.focus({ preventScroll: true });

    const desc = this.getSpeechDescription(el) || el.textContent?.trim();
    if (desc) {
      this.speak(`Item ${this.readingIndex + 1} of ${this.readingElements.length}: ${desc}`, {
        priority: 'interactive'
      });
    }
  }

  public isReadingMode(): boolean {
    return this.isReadingModeActive;
  }
}

export const speechAssistant = new SpeechAssistantEngine();
