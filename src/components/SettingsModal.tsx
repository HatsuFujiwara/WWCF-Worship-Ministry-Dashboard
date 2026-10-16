import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { StorageService, GuideAutoShowMode } from '../services/storage';
import {
  AccessibilitySettings,
  TextSizeOption,
  ColorVisionMode,
  DisplayDensity,
  AppLayoutPreferences,
  NavigationOrientation,
  SidebarPosition,
  SidebarVisibility
} from '../types';
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  formatKeyComboFromEvent,
  getEffectiveShortcut,
  findShortcutConflict
} from '../utils/keyboardShortcuts';
import {
  X,
  Settings,
  Moon,
  Sun,
  Database,
  Info,
  Check,
  RotateCcw,
  Play,
  QrCode,
  AlertTriangle,
  Trash2,
  Eye,
  Type,
  Activity,
  Contrast,
  ZapOff,
  Bell,
  BookOpen,
  Volume2,
  VolumeX,
  Gauge,
  Keyboard,
  ChevronDown,
  ChevronRight,
  Vibrate,
  SlidersHorizontal,
  Smartphone,
  Layout,
  Compass,
  PanelLeft,
  PanelRight,
  Edit3,
  CornerDownLeft
} from 'lucide-react';
import { speechAssistant } from '../utils/speechAssistant';
import { cancelHaptic } from '../utils/haptics';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  accessibilitySettings?: AccessibilitySettings;
  onUpdateAccessibility?: (settings: AccessibilitySettings) => void;
  onOpenOnboarding: () => void;
  onOpenBackupRestore: () => void;
  onOpenTransferData?: () => void;
  onOpenDeleteAllData?: () => void;
  showToast?: (text: string, type?: 'success' | 'danger' | 'info') => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  isDarkMode,
  setIsDarkMode,
  accessibilitySettings: externalAccessibility,
  onUpdateAccessibility,
  onOpenOnboarding,
  onOpenBackupRestore,
  onOpenTransferData,
  onOpenDeleteAllData,
  showToast
}) => {
  const [guideMode, setGuideMode] = useState<GuideAutoShowMode>('first_visit');
  const [accessibility, setAccessibility] = useState<AccessibilitySettings>(() =>
    StorageService.getAccessibilitySettings()
  );
  const [openSection, setOpenSection] = useState<string | null>('vision');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Navigation & Layout State
  const [layoutPreferences, setLayoutPreferences] = useState<AppLayoutPreferences>(() =>
    StorageService.getLayoutPreferences()
  );

  // Keyboard Shortcuts State
  const [customShortcuts, setCustomShortcuts] = useState<Record<string, string>>(() =>
    StorageService.getCustomKeyboardShortcuts()
  );
  const [recordingActionId, setRecordingActionId] = useState<string | null>(null);
  const [shortcutConflict, setShortcutConflict] = useState<string | null>(null);
  const [shortcutMobileTab, setShortcutMobileTab] = useState<'default' | 'custom'>('default');

  useEffect(() => {
    if (isOpen) {
      setGuideMode(StorageService.getGuideMode());
      setAccessibility(StorageService.getAccessibilitySettings());
      setLayoutPreferences(StorageService.getLayoutPreferences());
      setCustomShortcuts(StorageService.getCustomKeyboardShortcuts());
      setRecordingActionId(null);
      setShortcutConflict(null);
    }
  }, [isOpen]);

  // Keyboard shortcut recorder listener
  useEffect(() => {
    if (!recordingActionId) return;

    const handleKeyDownCapture = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels recording
      if (e.key === 'Escape') {
        setRecordingActionId(null);
        setShortcutConflict(null);
        return;
      }

      const combo = formatKeyComboFromEvent(e);
      if (!combo) return; // Modifier key alone (Ctrl, Shift, Alt, etc.)

      // Conflict validation
      const conflict = findShortcutConflict(recordingActionId, combo, customShortcuts);
      if (conflict) {
        setShortcutConflict(`"${combo}" is already used by ${conflict.action}.`);
        return;
      }

      const updated = {
        ...customShortcuts,
        [recordingActionId]: combo
      };
      setCustomShortcuts(updated);
      StorageService.saveCustomKeyboardShortcuts(updated);
      setRecordingActionId(null);
      setShortcutConflict(null);
      if (showToast) {
        const actionDef = DEFAULT_KEYBOARD_SHORTCUTS.find((s) => s.id === recordingActionId);
        showToast(`Shortcut for "${actionDef?.action || recordingActionId}" set to ${combo}.`, 'success');
      }
    };

    window.addEventListener('keydown', handleKeyDownCapture, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDownCapture, true);
    };
  }, [recordingActionId, customShortcuts, showToast]);

  const handleUpdateLayout = (patch: Partial<AppLayoutPreferences>) => {
    const updated = StorageService.saveLayoutPreferences(patch);
    setLayoutPreferences(updated);
    if (showToast) {
      if (patch.navigationOrientation) {
        showToast(
          patch.navigationOrientation === 'horizontal'
            ? 'Navigation layout set to Horizontal Tabs (Top Bar).'
            : 'Navigation layout set to Vertical Sidebar.',
          'info'
        );
      } else if (patch.sidebarPosition) {
        showToast(
          patch.sidebarPosition === 'right'
            ? 'Sidebar position moved to Right Side.'
            : 'Sidebar position moved to Left Side.',
          'info'
        );
      } else if (patch.sidebarVisibility) {
        showToast(
          patch.sidebarVisibility === 'expanded'
            ? 'Sidebar set to Full Expanded mode.'
            : patch.sidebarVisibility === 'collapsed'
            ? 'Sidebar set to Narrow Icon Rail.'
            : 'Sidebar set to Hidden (accessible via header Show Navigation).',
          'info'
        );
      }
    }
  };

  const handleResetSingleShortcut = (actionId: string) => {
    const updated = { ...customShortcuts };
    delete updated[actionId];
    setCustomShortcuts(updated);
    StorageService.saveCustomKeyboardShortcuts(updated);
    if (showToast) {
      showToast('Shortcut reset to default.', 'info');
    }
  };

  const handleResetAllShortcuts = () => {
    StorageService.resetCustomKeyboardShortcuts();
    setCustomShortcuts({});
    setRecordingActionId(null);
    setShortcutConflict(null);
    if (showToast) {
      showToast('All custom shortcuts reset to defaults.', 'success');
    }
  };

  useEffect(() => {
    if (externalAccessibility) {
      setAccessibility(externalAccessibility);
    }
  }, [externalAccessibility]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const updateVoices = () => {
        setAvailableVoices(speechAssistant.getAvailableVoices());
      };
      updateVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = updateVoices;
      }
    }
  }, []);

  const modalRef = React.useRef<HTMLDivElement>(null);

  // Escape key & focus trapping
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements && focusableElements.length > 0) {
          focusableElements[0].focus();
        }
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Return focus to trigger button on close
  const previousOpenRef = React.useRef(isOpen);
  useEffect(() => {
    if (previousOpenRef.current && !isOpen) {
      const triggerBtn = document.querySelector('[data-tour="sidebar-settings-btn"]') as HTMLElement | null;
      if (triggerBtn) {
        triggerBtn.focus();
      }
    }
    previousOpenRef.current = isOpen;
  }, [isOpen]);

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'settings-modal',
    isOpen,
    layer: OverlayLayer.MODAL,
    onClose,
    closeOnEscape: true
  });

  const handleSelectGuideMode = (mode: GuideAutoShowMode) => {
    setGuideMode(mode);
    StorageService.setGuideMode(mode);
    if (showToast) {
      if (mode === 'never') {
        showToast('Auto-guide disabled. You can open it anytime in Settings.', 'info');
      } else if (mode === 'every_time') {
        showToast('Guide will open automatically on every visit.', 'info');
      } else {
        showToast('Guide set to first visit only.', 'info');
      }
    }
  };

  const handleResetGuidePreferences = () => {
    StorageService.resetGuidePreferences();
    setGuideMode('first_visit');
    if (showToast) {
      showToast('Guide preferences reset to first visit only.', 'success');
    }
  };

  const handleToggleAccessibility = (key: keyof AccessibilitySettings) => {
    let currentVal: boolean;
    if (key === 'visualToastAlerts') {
      currentVal = accessibility.visualToastAlerts !== false;
    } else if (key === 'audioFeedback') {
      currentVal = accessibility.audioFeedback !== false;
    } else if (key === 'showTtsPanel') {
      currentVal = accessibility.showTtsPanel !== false;
    } else {
      currentVal = Boolean(accessibility[key]);
    }
    const nextVal = !currentVal;
    const updated: AccessibilitySettings = {
      ...accessibility,
      [key]: nextVal
    };
    setAccessibility(updated);
    StorageService.saveAccessibilitySettings(updated);
    onUpdateAccessibility?.(updated);

    // Immediate runtime state synchronization
    if (key === 'ttsEnabled') {
      if (nextVal) {
        speechAssistant.setRate(updated.ttsSpeechRate || 0.85);
        speechAssistant.setVoice(updated.ttsVoice || '');
        speechAssistant.setReadingScope(updated.ttsReadingScope || 'all');
        speechAssistant.attachGlobalListeners();
      } else {
        speechAssistant.stop();
        speechAssistant.detachGlobalListeners();
      }
    } else if (key === 'hapticFeedback') {
      if (!nextVal) {
        cancelHaptic();
      }
    }

    if (showToast) {
      if (key === 'visualToastAlerts') {
        if (nextVal) {
          showToast('Visual Toast Alerts enabled.', 'info');
        }
      } else {
        const stateLabel = nextVal ? 'enabled' : 'disabled';
        const titles: Record<string, string> = {
          reducedMotion: 'Reduced Motion',
          highContrast: 'High Contrast',
          enhancedFocus: 'Enhanced Focus Indicators',
          largerTouchTargets: 'Larger Touch Targets',
          ttsEnabled: 'Text-to-Speech Assistant',
          showTtsPanel: 'Floating Speech Bar',
          hapticFeedback: 'Haptic Vibration Feedback',
          simplifiedInterface: 'Simplified Interface',
          performanceMode: 'Low-End Hardware Mode',
          audioFeedback: 'Audio Feedback Cues',
          visualToastAlerts: 'Visual Toast Alerts'
        };
        showToast(`${titles[key as string] || (key as string)} ${stateLabel}.`, 'info');
      }
    }
  };

  const handleTtsRateChange = (rate: number) => {
    const updated: AccessibilitySettings = {
      ...accessibility,
      ttsSpeechRate: rate
    };
    setAccessibility(updated);
    StorageService.saveAccessibilitySettings(updated);
    onUpdateAccessibility?.(updated);
    speechAssistant.setRate(rate);
  };

  const handleTtsVoiceChange = (voiceName: string) => {
    const updated: AccessibilitySettings = {
      ...accessibility,
      ttsVoice: voiceName
    };
    setAccessibility(updated);
    StorageService.saveAccessibilitySettings(updated);
    onUpdateAccessibility?.(updated);
    speechAssistant.setVoice(voiceName);
  };

  const handleTtsReadingModeChange = (mode: 'all' | 'essential' | 'guide_only') => {
    const updated: AccessibilitySettings = {
      ...accessibility,
      ttsReadingScope: mode
    };
    setAccessibility(updated);
    StorageService.saveAccessibilitySettings(updated);
    onUpdateAccessibility?.(updated);
    speechAssistant.setReadingScope(mode);
  };

  const handleTestTts = () => {
    speechAssistant.speak(
      "Text-to-speech assistant is active and ready.",
      { force: true, allowWhenDisabled: true }
    );
  };

  const handleColorVisionChange = (mode: ColorVisionMode) => {
    const updated: AccessibilitySettings = {
      ...accessibility,
      colorVision: mode
    };
    setAccessibility(updated);
    StorageService.saveAccessibilitySettings(updated);
    onUpdateAccessibility?.(updated);
    if (showToast) {
      showToast(
        mode === 'default'
          ? 'Color vision set to Standard.'
          : `Color vision adjusted for ${mode}.`,
        'info'
      );
    }
  };

  const handleDisplayDensityChange = (density: DisplayDensity) => {
    const updated: AccessibilitySettings = {
      ...accessibility,
      displayDensity: density
    };
    setAccessibility(updated);
    StorageService.saveAccessibilitySettings(updated);
    onUpdateAccessibility?.(updated);
    if (showToast) {
      showToast(`Display density set to ${density}.`, 'info');
    }
  };

  const handleTextSizeChange = (size: TextSizeOption) => {
    const updated: AccessibilitySettings = {
      ...accessibility,
      textSize: size
    };
    setAccessibility(updated);
    StorageService.saveAccessibilitySettings(updated);
    onUpdateAccessibility?.(updated);
    if (showToast) {
      showToast(
        `Text size set to ${size === 'default' ? 'Default' : size === 'large' ? 'Large' : 'Extra Large'}.`,
        'info'
      );
    }
  };

  // Compact Switch Component
  const Switch: React.FC<{
    checked: boolean;
    onChange: () => void;
    label: string;
  }> = ({ checked, onChange, label }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
        checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );

  // Compact Row Component
  const SettingRow: React.FC<{
    icon: React.ReactNode;
    label: string;
    tooltip?: string;
    children: React.ReactNode;
  }> = ({ icon, label, tooltip, children }) => (
    <div className="flex items-center justify-between gap-3 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200/70 dark:border-slate-750">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-700/80 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
          {label}
        </span>
        {tooltip && (
          <span
            title={tooltip}
            aria-label={tooltip}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-help inline-flex items-center"
          >
            <Info className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
      <div className="shrink-0 flex items-center">
        {children}
      </div>
    </div>
  );

  const toggleCategory = (cat: string) => {
    setOpenSection(openSection === cat ? null : cat);
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      style={{ zIndex }}
      data-overlay-id="settings-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto backdrop-enter-animation transition-opacity ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      onClick={isBlocked ? undefined : onClose}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div
        ref={modalRef}
        data-tour="settings-modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] my-auto transform modal-enter-animation"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400">
              <Settings className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <h3 id="settings-modal-title" className="font-bold text-slate-900 dark:text-slate-100 text-base">
                Settings
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Appearance, accessibility & storage
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Section: Appearance / Theme */}
          <div data-tour="theme-toggle" className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                {isDarkMode ? <Moon className="w-3.5 h-3.5 text-indigo-400" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
                Appearance
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsDarkMode(false)}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  !isDarkMode
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span>Light Theme</span>
                {!isDarkMode && <Check className="w-3 h-3 text-indigo-600 ml-auto" />}
              </button>

              <button
                type="button"
                onClick={() => setIsDarkMode(true)}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  isDarkMode
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                <span>AMOLED Dark</span>
                {isDarkMode && <Check className="w-3 h-3 text-indigo-400 ml-auto" />}
              </button>
            </div>
          </div>

          {/* Section: Navigation & Workspace Layout */}
          <div data-tour="navigation-layout-settings" className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Layout className="w-3.5 h-3.5 text-[#1b75bc] dark:text-[#54b0e2]" />
                Navigation & Layout
              </span>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                Workspace Shell
              </span>
            </div>

            {/* Visual Choice Selector: Horizontal vs Vertical Tabs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Choice 1: Horizontal tabs (Tabs at top) */}
              <button
                type="button"
                onClick={() => handleUpdateLayout({ navigationOrientation: 'horizontal' })}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative group flex flex-col justify-between ${
                  layoutPreferences.navigationOrientation === 'horizontal'
                    ? 'bg-[#1b75bc]/10 border-[#1b75bc] dark:bg-[#1b75bc]/20 dark:border-[#54b0e2] shadow-xs'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div>
                  {/* Miniature Visual Diagram: Top Bar with tabs */}
                  <div className="w-full h-11 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 p-1.5 mb-2.5 flex flex-col gap-1 overflow-hidden">
                    <div className="w-full h-3 rounded bg-[#1b75bc]/25 flex items-center gap-1 px-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1b75bc]" />
                      <span className="w-4 h-1 rounded bg-[#1b75bc]/50" />
                      <span className="w-4 h-1 rounded bg-slate-300 dark:bg-slate-600" />
                      <span className="w-4 h-1 rounded bg-slate-300 dark:bg-slate-600" />
                    </div>
                    <div className="w-full flex-1 rounded bg-slate-200/50 dark:bg-slate-800/50" />
                  </div>

                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Horizontal tabs
                    </h4>
                    {layoutPreferences.navigationOrientation === 'horizontal' && (
                      <span className="w-4 h-4 rounded-full bg-[#1b75bc] text-white flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Tabs at the top
                  </p>
                </div>
              </button>

              {/* Choice 2: Vertical tabs (Tabs on the side, in sidebar) */}
              <button
                type="button"
                onClick={() => handleUpdateLayout({ navigationOrientation: 'vertical' })}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative group flex flex-col justify-between ${
                  layoutPreferences.navigationOrientation === 'vertical'
                    ? 'bg-[#1b75bc]/10 border-[#1b75bc] dark:bg-[#1b75bc]/20 dark:border-[#54b0e2] shadow-xs'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div>
                  {/* Miniature Visual Diagram: Sidebar on side */}
                  <div className="w-full h-11 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 p-1.5 mb-2.5 flex gap-1.5 overflow-hidden">
                    <div className="w-6 h-full rounded bg-[#1b75bc]/25 flex flex-col gap-0.5 p-0.5">
                      <span className="w-full h-1 rounded bg-[#1b75bc]" />
                      <span className="w-full h-1 rounded bg-slate-300 dark:bg-slate-600" />
                      <span className="w-full h-1 rounded bg-slate-300 dark:bg-slate-600" />
                    </div>
                    <div className="flex-1 h-full rounded bg-slate-200/50 dark:bg-slate-800/50" />
                  </div>

                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Vertical tabs
                    </h4>
                    {layoutPreferences.navigationOrientation === 'vertical' && (
                      <span className="w-4 h-4 rounded-full bg-[#1b75bc] text-white flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Tabs on the side, in the sidebar
                  </p>
                </div>
              </button>
            </div>

            {/* Vertical Layout Sub-options (Position & Default Visibility) */}
            {layoutPreferences.navigationOrientation === 'vertical' && (
              <div className="pt-2 border-t border-slate-200/70 dark:border-white/5 space-y-2">
                {/* Sidebar Position: Left vs Right */}
                <div className="flex items-center justify-between gap-3 p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/70 dark:border-slate-750">
                  <div className="flex items-center gap-2">
                    <PanelLeft className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Sidebar Screen Position
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Dock sidebar to the left or right edge
                      </p>
                    </div>
                  </div>
                  <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-900 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => handleUpdateLayout({ sidebarPosition: 'left' })}
                      className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                        layoutPreferences.sidebarPosition === 'left'
                          ? 'bg-[#1b75bc] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      Left Side
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateLayout({ sidebarPosition: 'right' })}
                      className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                        layoutPreferences.sidebarPosition === 'right'
                          ? 'bg-[#1b75bc] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      Right Side
                    </button>
                  </div>
                </div>

                {/* Sidebar Default Visibility: Expanded vs Hidden */}
                <div className="flex items-center justify-between gap-3 p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/70 dark:border-slate-750">
                  <div className="flex items-center gap-2">
                    <PanelRight className="w-4 h-4 text-indigo-500" />
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Desktop Sidebar Mode
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Keep panel always visible or collapsed by default
                      </p>
                    </div>
                  </div>
                  <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-900 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => handleUpdateLayout({ sidebarVisibility: 'expanded' })}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        layoutPreferences.sidebarVisibility === 'expanded'
                          ? 'bg-[#1b75bc] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      Expanded
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateLayout({ sidebarVisibility: 'collapsed' })}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        layoutPreferences.sidebarVisibility === 'collapsed'
                          ? 'bg-[#1b75bc] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      Icon Rail
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateLayout({ sidebarVisibility: 'hidden' })}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        layoutPreferences.sidebarVisibility === 'hidden'
                          ? 'bg-[#1b75bc] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      Hidden
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section: Keyboard Shortcuts */}
          <div data-tour="keyboard-shortcuts-settings" className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Keyboard className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                Keyboard Shortcuts
              </span>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                Default & Custom Hotkeys
              </span>
            </div>

            {/* Mobile View Toggle */}
            <div className="sm:hidden flex items-center gap-1 p-0.5 rounded-lg bg-slate-200 dark:bg-slate-700/60 text-xs font-bold">
              <button
                type="button"
                onClick={() => setShortcutMobileTab('default')}
                className={`flex-1 py-1 text-center rounded-md transition-all ${
                  shortcutMobileTab === 'default'
                    ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Default (Read-only)
              </button>
              <button
                type="button"
                onClick={() => setShortcutMobileTab('custom')}
                className={`flex-1 py-1 text-center rounded-md transition-all ${
                  shortcutMobileTab === 'custom'
                    ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Custom Overrides
              </button>
            </div>

            {/* Conflict Alert Banner */}
            {shortcutConflict && (
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="truncate">{shortcutConflict}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShortcutConflict(null)}
                  className="text-amber-600 hover:text-amber-800 dark:hover:text-amber-100 text-[10px] font-bold shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Two-Column Shortcuts Table (Desktop/Tablet) or Segmented List (Mobile) */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-800 overflow-hidden shadow-2xs divide-y divide-slate-100 dark:divide-slate-750">
              {/* Header Row (Desktop/Tablet) */}
              <div className="hidden sm:grid grid-cols-2 px-3.5 py-2 bg-slate-50 dark:bg-slate-850/60 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <span>Default Shortcuts (Read-only)</span>
                <span className="pl-4">Custom Overrides (Editable)</span>
              </div>

              {/* Rows */}
              {DEFAULT_KEYBOARD_SHORTCUTS.map((shortcut) => {
                const customKey = customShortcuts[shortcut.id];
                const isRecording = recordingActionId === shortcut.id;

                return (
                  <div
                    key={shortcut.id}
                    className="p-2.5 sm:grid sm:grid-cols-2 sm:items-center sm:gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-750/30 transition-colors"
                  >
                    {/* Left Column: Action & Default Key (Read-only) */}
                    <div className={`${shortcutMobileTab === 'custom' ? 'hidden sm:flex' : 'flex'} items-center justify-between gap-2`}>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                          {shortcut.action}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {shortcut.description}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                        {shortcut.defaultKey}
                      </span>
                    </div>

                    {/* Right Column: Custom Key Override (Editable) */}
                    <div className={`${shortcutMobileTab === 'default' ? 'hidden sm:flex' : 'flex'} items-center justify-between sm:justify-end gap-2 mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-700/50 sm:pl-4`}>
                      {isRecording ? (
                        <div className="flex items-center gap-1.5 w-full sm:w-auto">
                          <span className="animate-pulse px-3 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-500 text-teal-700 dark:text-teal-300 text-xs font-bold text-center flex-1 sm:flex-initial">
                            Press keys combo...
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setRecordingActionId(null);
                              setShortcutConflict(null);
                            }}
                            className="px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : customKey ? (
                        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                          <span className="px-2.5 py-0.5 rounded-lg font-mono text-xs font-bold bg-[#1b75bc]/15 text-[#1b75bc] dark:text-[#54b0e2] border border-[#1b75bc]/30">
                            {customKey}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setShortcutConflict(null);
                                setRecordingActionId(shortcut.id);
                              }}
                              title="Re-record shortcut"
                              className="p-1 text-slate-400 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] rounded cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResetSingleShortcut(shortcut.id)}
                              title="Reset to default"
                              className="p-1 text-slate-400 hover:text-rose-500 rounded cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setShortcutConflict(null);
                            setRecordingActionId(shortcut.id);
                          }}
                          className="w-full sm:w-auto px-2.5 py-1 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 hover:border-[#1b75bc] dark:hover:border-[#54b0e2] text-slate-500 dark:text-slate-400 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] text-[11px] font-semibold transition-colors cursor-pointer text-center"
                        >
                          + Customize
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reset All Shortcuts Footer */}
            {Object.keys(customShortcuts).length > 0 && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleResetAllShortcuts}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3 text-slate-500" />
                  <span>Reset All to Defaults</span>
                </button>
              </div>
            )}
          </div>

          {/* Section: Accessibility (7 Compact Categories) */}
          <div data-tour="accessibility-panel" className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Accessibility
              </span>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                7 Sections
              </span>
            </div>

            <div className="space-y-2">
              {/* 1. VISION & DISPLAY */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-800 overflow-hidden shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleCategory('vision')}
                  className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors cursor-pointer"
                  aria-expanded={openSection === 'vision'}
                >
                  <div className="flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      1. Vision & Display
                    </span>
                  </div>
                  {openSection === 'vision' ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </button>

                {openSection === 'vision' && (
                  <div className="p-2.5 pt-0 space-y-1.5 border-t border-slate-100 dark:border-slate-750 bg-slate-50/50 dark:bg-slate-850/40">
                    <SettingRow icon={<Contrast className="w-3 h-3 text-emerald-600" />} label="High Contrast" tooltip="Increases border definition and text contrast while preserving AMOLED black">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400">{accessibility.highContrast ? 'ON' : 'OFF'}</span>
                        <Switch checked={accessibility.highContrast} onChange={() => handleToggleAccessibility('highContrast')} label="High Contrast" />
                      </div>
                    </SettingRow>

                    <SettingRow icon={<Type className="w-3 h-3 text-sky-600" />} label="Text Size" tooltip="Scales application text size">
                      <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-900 text-[11px] font-semibold">
                        {(['default', 'large', 'extra-large'] as TextSizeOption[]).map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => handleTextSizeChange(sz)}
                            className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                              accessibility.textSize === sz
                                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-bold shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {sz === 'default' ? 'Default' : sz === 'large' ? 'Large' : 'XL'}
                          </button>
                        ))}
                      </div>
                    </SettingRow>

                    <SettingRow icon={<SlidersHorizontal className="w-3 h-3 text-indigo-600" />} label="Color Vision Mode" tooltip="Optimizes palettes for various types of color blindness">
                      <select
                        value={accessibility.colorVision || 'default'}
                        onChange={(e) => handleColorVisionChange(e.target.value as ColorVisionMode)}
                        className="text-[11px] font-semibold py-1 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                      >
                        <option value="default">Standard</option>
                        <option value="protanopia">Protanopia (Red-Blind)</option>
                        <option value="deuteranopia">Deuteranopia (Green-Blind)</option>
                        <option value="tritanopia">Tritanopia (Blue-Blind)</option>
                        <option value="monochrome">Monochrome</option>
                      </select>
                    </SettingRow>

                    <SettingRow icon={<Activity className="w-3 h-3 text-amber-500" />} label="Enhanced Focus" tooltip="Highlights active buttons and inputs with high-visibility rings">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400">{accessibility.enhancedFocus ? 'ON' : 'OFF'}</span>
                        <Switch checked={accessibility.enhancedFocus} onChange={() => handleToggleAccessibility('enhancedFocus')} label="Enhanced Focus" />
                      </div>
                    </SettingRow>

                    <SettingRow icon={<Gauge className="w-3 h-3 text-purple-500" />} label="Display Density" tooltip="Adjusts spacing and padding density throughout screens">
                      <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-900 text-[11px] font-semibold">
                        {(['compact', 'comfortable', 'spacious'] as DisplayDensity[]).map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => handleDisplayDensityChange(d)}
                            className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                              (accessibility.displayDensity || 'comfortable') === d
                                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-bold shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {d.charAt(0).toUpperCase() + d.slice(1, 4)}
                          </button>
                        ))}
                      </div>
                    </SettingRow>
                  </div>
                )}
              </div>

              {/* 2. MOTION */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-800 overflow-hidden shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleCategory('motion')}
                  className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors cursor-pointer"
                  aria-expanded={openSection === 'motion'}
                >
                  <div className="flex items-center gap-2">
                    <ZapOff className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      2. Motion
                    </span>
                  </div>
                  {openSection === 'motion' ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </button>

                {openSection === 'motion' && (
                  <div className="p-2.5 pt-0 space-y-1.5 border-t border-slate-100 dark:border-slate-750 bg-slate-50/50 dark:bg-slate-850/40">
                    <SettingRow icon={<ZapOff className="w-3 h-3 text-indigo-600" />} label="Reduced Motion" tooltip="Suppresses non-essential motion, animations, and transitions">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400">{accessibility.reducedMotion ? 'ON' : 'OFF'}</span>
                        <Switch checked={accessibility.reducedMotion} onChange={() => handleToggleAccessibility('reducedMotion')} label="Reduced Motion" />
                      </div>
                    </SettingRow>
                  </div>
                )}
              </div>

              {/* 3. MOTOR & TOUCH */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-800 overflow-hidden shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleCategory('motor')}
                  className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors cursor-pointer"
                  aria-expanded={openSection === 'motor'}
                >
                  <div className="flex items-center gap-2">
                    <Vibrate className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      3. Motor & Touch
                    </span>
                  </div>
                  {openSection === 'motor' ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </button>

                {openSection === 'motor' && (
                  <div className="p-2.5 pt-0 space-y-1.5 border-t border-slate-100 dark:border-slate-750 bg-slate-50/50 dark:bg-slate-850/40">
                    <SettingRow icon={<Smartphone className="w-3 h-3 text-indigo-500" />} label="Larger Touch Targets" tooltip="Increases button and input target heights to 44px minimum for comfortable tapping">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400">{accessibility.largerTouchTargets ? 'ON' : 'OFF'}</span>
                        <Switch checked={accessibility.largerTouchTargets} onChange={() => handleToggleAccessibility('largerTouchTargets')} label="Larger Touch Targets" />
                      </div>
                    </SettingRow>

                    <SettingRow icon={<Vibrate className="w-3 h-3 text-amber-500" />} label="Haptic Feedback" tooltip="Provides subtle vibration cues on supported touchscreen devices">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400">{accessibility.hapticFeedback ? 'ON' : 'OFF'}</span>
                        <Switch checked={Boolean(accessibility.hapticFeedback)} onChange={() => handleToggleAccessibility('hapticFeedback')} label="Haptic Feedback" />
                      </div>
                    </SettingRow>
                  </div>
                )}
              </div>

              {/* 4. HEARING & NOTIFICATIONS */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-800 overflow-hidden shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleCategory('hearing')}
                  className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors cursor-pointer"
                  aria-expanded={openSection === 'hearing'}
                >
                  <div className="flex items-center gap-2">
                    <Bell className="w-3.5 h-3.5 text-rose-500" />
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      4. Hearing & Notifications
                    </span>
                  </div>
                  {openSection === 'hearing' ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </button>

                {openSection === 'hearing' && (
                  <div className="p-2.5 pt-0 space-y-1.5 border-t border-slate-100 dark:border-slate-750 bg-slate-50/50 dark:bg-slate-850/40">
                    <SettingRow icon={<Bell className="w-3 h-3 text-rose-500" />} label="Visual Toast Alerts" tooltip="Displays temporary notification banners for confirmations and alerts">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400">
                          {accessibility.visualToastAlerts !== false ? 'ON' : 'OFF'}
                        </span>
                        <Switch
                          checked={accessibility.visualToastAlerts !== false}
                          onChange={() => handleToggleAccessibility('visualToastAlerts')}
                          label="Visual Toast Alerts"
                        />
                      </div>
                    </SettingRow>

                    <SettingRow icon={accessibility.audioFeedback !== false ? <Volume2 className="w-3 h-3 text-emerald-500" /> : <VolumeX className="w-3 h-3 text-slate-400" />} label="Audio Feedback Cues" tooltip="Enables or disables sound cues">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400">{accessibility.audioFeedback !== false ? 'ON' : 'OFF'}</span>
                        <Switch checked={accessibility.audioFeedback !== false} onChange={() => handleToggleAccessibility('audioFeedback')} label="Audio Feedback Cues" />
                      </div>
                    </SettingRow>
                  </div>
                )}
              </div>

              {/* 5. READING & COGNITIVE */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-800 overflow-hidden shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleCategory('reading')}
                  className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors cursor-pointer"
                  aria-expanded={openSection === 'reading'}
                >
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      5. Reading & Cognitive
                    </span>
                  </div>
                  {openSection === 'reading' ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </button>

                {openSection === 'reading' && (
                  <div className="p-2.5 pt-0 space-y-1.5 border-t border-slate-100 dark:border-slate-750 bg-slate-50/50 dark:bg-slate-850/40">
                    <SettingRow icon={<BookOpen className="w-3 h-3 text-blue-500" />} label="Simplified Interface" tooltip="Removes decorative highlights and minimizes distractions">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400">{accessibility.simplifiedInterface ? 'ON' : 'OFF'}</span>
                        <Switch checked={Boolean(accessibility.simplifiedInterface)} onChange={() => handleToggleAccessibility('simplifiedInterface')} label="Simplified Interface" />
                      </div>
                    </SettingRow>

                    <SettingRow icon={<Info className="w-3 h-3 text-indigo-500" />} label="Reading Scope" tooltip="Controls what text is read by the speech navigator">
                      <select
                        value={accessibility.ttsReadingScope || 'all'}
                        onChange={(e) => handleTtsReadingModeChange(e.target.value as any)}
                        className="text-[11px] font-semibold py-1 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                      >
                        <option value="all">All Elements</option>
                        <option value="essential">Essential Controls</option>
                        <option value="guide_only">Guide Only</option>
                      </select>
                    </SettingRow>
                  </div>
                )}
              </div>

              {/* 6. KEYBOARD & ASSISTIVE TECHNOLOGY */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-800 overflow-hidden shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleCategory('keyboard')}
                  className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors cursor-pointer"
                  aria-expanded={openSection === 'keyboard'}
                >
                  <div className="flex items-center gap-2">
                    <Keyboard className="w-3.5 h-3.5 text-teal-600" />
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      6. Keyboard & Assistive Technology
                    </span>
                  </div>
                  {openSection === 'keyboard' ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </button>

                {openSection === 'keyboard' && (
                  <div className="p-2.5 pt-0 space-y-1.5 border-t border-slate-100 dark:border-slate-750 bg-slate-50/50 dark:bg-slate-850/40">
                    <SettingRow icon={<Volume2 className="w-3 h-3 text-teal-600" />} label="Text-to-Speech Assistant" tooltip="Speaks UI actions and guide steps out loud">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400">{accessibility.ttsEnabled ? 'ON' : 'OFF'}</span>
                        <Switch checked={Boolean(accessibility.ttsEnabled)} onChange={() => handleToggleAccessibility('ttsEnabled')} label="Text-to-Speech Assistant" />
                      </div>
                    </SettingRow>

                    <SettingRow icon={<Gauge className="w-3 h-3 text-teal-600" />} label="Speech Rate" tooltip="Adjust playback speed">
                      <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-900 text-[11px] font-semibold">
                        {[0.75, 0.85, 1.0, 1.25].map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => handleTtsRateChange(rate)}
                            className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                              Math.abs((accessibility.ttsSpeechRate || 0.85) - rate) < 0.04
                                ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 font-bold shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                    </SettingRow>

                    <SettingRow icon={<SlidersHorizontal className="w-3 h-3 text-teal-600" />} label="Floating Quick Bar" tooltip="Shows small floating audio control bar on screen">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400">{accessibility.showTtsPanel !== false ? 'ON' : 'OFF'}</span>
                        <Switch checked={accessibility.showTtsPanel !== false} onChange={() => handleToggleAccessibility('showTtsPanel')} label="Floating Quick Bar" />
                      </div>
                    </SettingRow>

                    {availableVoices.length > 0 && (
                      <SettingRow icon={<Keyboard className="w-3 h-3 text-teal-600" />} label="Speech Voice">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={accessibility.ttsVoice || ''}
                            onChange={(e) => handleTtsVoiceChange(e.target.value)}
                            className="text-[11px] font-medium py-1 px-1.5 max-w-[140px] truncate rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                          >
                            <option value="">Default Voice</option>
                            {availableVoices.map((v) => (
                              <option key={v.name} value={v.name}>
                                {v.name} ({v.lang})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={handleTestTts}
                            className="px-2 py-1 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 text-teal-700 dark:text-teal-300 rounded text-[10px] font-bold border border-teal-200 dark:border-teal-800 cursor-pointer"
                          >
                            Test
                          </button>
                        </div>
                      </SettingRow>
                    )}
                  </div>
                )}
              </div>

              {/* 7. PERFORMANCE */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-800 overflow-hidden shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleCategory('performance')}
                  className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors cursor-pointer"
                  aria-expanded={openSection === 'performance'}
                >
                  <div className="flex items-center gap-2">
                    <Gauge className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      7. Performance
                    </span>
                  </div>
                  {openSection === 'performance' ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </button>

                {openSection === 'performance' && (
                  <div className="p-2.5 pt-0 space-y-1.5 border-t border-slate-100 dark:border-slate-750 bg-slate-50/50 dark:bg-slate-850/40">
                    <SettingRow icon={<Gauge className="w-3 h-3 text-indigo-500" />} label="Low-End Hardware Mode" tooltip="Disables blur backdrops and heavy filters for older mobile phones and tablets">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400">{accessibility.performanceMode ? 'ON' : 'OFF'}</span>
                        <Switch checked={Boolean(accessibility.performanceMode)} onChange={() => handleToggleAccessibility('performanceMode')} label="Low-End Hardware Mode" />
                      </div>
                    </SettingRow>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section: Interactive Guide Preferences */}
          <div data-tour="guide-preferences" className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2.5">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Interactive Guide
            </span>

            <div className="space-y-1.5">
              {[
                { id: 'first_visit', title: 'First Visit Only (Default)' },
                { id: 'every_time', title: 'Every Visit' },
                { id: 'never', title: 'Never (Manual only)' }
              ].map((opt) => (
                <label
                  key={opt.id}
                  className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                    guideMode === opt.id
                      ? 'bg-indigo-50/70 border-indigo-400 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="guideMode"
                    value={opt.id}
                    checked={guideMode === opt.id}
                    onChange={() => handleSelectGuideMode(opt.id as GuideAutoShowMode)}
                    className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>{opt.title}</span>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenOnboarding();
                }}
                className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <Play className="w-3 h-3" />
                <span>Start Guide</span>
              </button>

              <button
                type="button"
                onClick={handleResetGuidePreferences}
                className="py-1.5 px-3 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <RotateCcw className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Section: Data Management Tools */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Data & Synchronization
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {onOpenTransferData && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenTransferData();
                  }}
                  className="py-2 px-3 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
                >
                  <QrCode className="w-3.5 h-3.5 text-[#1b75bc]" />
                  <span>Transfer Data (QR)</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBackupRestore();
                }}
                className="py-2 px-3 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
              >
                <Database className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Backup & Restore</span>
              </button>
            </div>

            {onOpenDeleteAllData && (
              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-750">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenDeleteAllData();
                  }}
                  className="w-full py-2 px-3 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Reset All Data (Danger Zone)</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors cursor-pointer shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
