import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AccessibilitySettings } from '../types';
import { StorageService } from '../services/storage';
import { speechAssistant } from '../utils/speechAssistant';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import {
  Sparkles,
  Sliders,
  Eye,
  Type,
  Maximize2,
  Check,
  X,
  ArrowRight,
  ShieldCheck,
  ZapOff,
  Cpu,
  Volume2,
  VolumeX,
  Play
} from 'lucide-react';

interface AccessibilityOnboardingModalProps {
  isOpen: boolean;
  onComplete: () => void;
  onUpdateAccessibility: (settings: AccessibilitySettings) => void;
}

export const AccessibilityOnboardingModal: React.FC<AccessibilityOnboardingModalProps> = ({
  isOpen,
  onComplete,
  onUpdateAccessibility
}) => {
  const [settings, setSettings] = useState<AccessibilitySettings>(() =>
    StorageService.getAccessibilitySettings()
  );
  const [isTestingTts, setIsTestingTts] = useState(false);

  const handleSkip = () => {
    // Revert any temporary DOM preview changes back to the actual saved settings
    const saved = StorageService.getAccessibilitySettings();
    StorageService.applyAccessibilityToDOM(saved);
    if (!saved.ttsEnabled) {
      speechAssistant.stop();
      speechAssistant.detachGlobalListeners();
    }
    StorageService.setAccessibilityOnboarded(true);
    onComplete();
  };

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'accessibility-onboarding-modal',
    isOpen,
    layer: OverlayLayer.GUIDE,
    onClose: handleSkip,
    closeOnEscape: true
  });

  const handleToggle = (key: 'reducedMotion' | 'highContrast' | 'enhancedFocus' | 'largerTouchTargets' | 'performanceMode' | 'ttsEnabled') => {
    const nextValue = !settings[key];
    const updated = {
      ...settings,
      [key]: nextValue
    };
    setSettings(updated);
    StorageService.applyAccessibilityToDOM(updated);

    if (key === 'ttsEnabled') {
      if (nextValue) {
        speechAssistant.attachGlobalListeners();
        speechAssistant.speak(
          'Text-to-Speech is enabled. I can read important interface elements aloud when you hover, focus, or press and hold.',
          { priority: 'critical', force: true }
        );
      } else {
        speechAssistant.stop();
        speechAssistant.detachGlobalListeners();
      }
    }
  };

  const handleTestTts = () => {
    setIsTestingTts(true);
    speechAssistant.speak(
      'Text-to-Speech is enabled. The application can now read interface elements aloud.',
      {
        priority: 'critical',
        force: true,
        allowWhenDisabled: true,
        onEnd: () => setIsTestingTts(false)
      }
    );
  };

  const handleTextSizeChange = (size: 'default' | 'large' | 'extra-large') => {
    const updated: AccessibilitySettings = {
      ...settings,
      textSize: size
    };
    setSettings(updated);
    StorageService.applyAccessibilityToDOM(updated);
  };

  const handleSaveAndContinue = () => {
    StorageService.saveAccessibilitySettings(settings);
    StorageService.setAccessibilityOnboarded(true);
    onUpdateAccessibility(settings);
    onComplete();
  };

  const handleUseDefaults = () => {
    const defaultSettings = StorageService.getDefaultAccessibilitySettings();
    StorageService.saveAccessibilitySettings(defaultSettings);
    StorageService.setAccessibilityOnboarded(true);
    StorageService.applyAccessibilityToDOM(defaultSettings);
    onUpdateAccessibility(defaultSettings);
    speechAssistant.stop();
    speechAssistant.detachGlobalListeners();
    onComplete();
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="accessibility-welcome-title"
      style={{ zIndex }}
      data-overlay-id="accessibility-onboarding-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto transition-opacity ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        {/* Header with AMOLED styling */}
        <div className="flex items-start justify-between p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800 flex items-center justify-center shrink-0 shadow-2xs">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Step 1 of 2
                </span>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                  Accessibility Setup
                </span>
              </div>
              <h2
                id="accessibility-welcome-title"
                className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5"
              >
                Make the scheduler work for you
              </h2>
            </div>
          </div>

          <button
            onClick={handleSkip}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            aria-label="Skip accessibility setup"
            title="Skip and use defaults"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 text-sm text-slate-600 dark:text-slate-300">
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Customize your viewing, motion, and interaction preferences before exploring the app. You can always adjust these later anytime in <span className="font-semibold text-slate-700 dark:text-slate-300">Settings</span>.
          </p>

          <div className="space-y-3 pt-1">
            {/* 0. Text-to-Speech Assistant */}
            <div className="p-3.5 rounded-xl border-2 border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/50 dark:bg-indigo-950/30 space-y-2.5 transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 pr-2 flex-1">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                      Text-to-Speech Assistant
                    </span>
                    <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      Default: OFF
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Read important interface elements aloud using your device's speech system. Operates automatically when you hover, navigate by keyboard, or press and hold on mobile.
                  </p>
                </div>

                {/* ON / OFF Segmented Switch */}
                <div className="flex items-center rounded-lg p-0.5 bg-slate-200/80 dark:bg-slate-800 shrink-0 border border-slate-300/60 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      if (settings.ttsEnabled) handleToggle('ttsEnabled');
                    }}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                      !settings.ttsEnabled
                        ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    OFF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!settings.ttsEnabled) handleToggle('ttsEnabled');
                    }}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                      settings.ttsEnabled
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    ON
                  </button>
                </div>
              </div>

              {!speechAssistant.isSupported() ? (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  Note: Text-to-Speech is not supported by your current browser. The app remains fully usable without it.
                </p>
              ) : settings.ttsEnabled ? (
                <div className="pt-1 flex items-center justify-between gap-3 border-t border-indigo-100 dark:border-indigo-900/60">
                  <span className="text-[11px] text-slate-600 dark:text-slate-400">
                    Voice ready: hover or press &amp; hold elements to listen
                  </span>
                  <button
                    type="button"
                    onClick={handleTestTts}
                    disabled={isTestingTts}
                    aria-label="Test Text-to-Speech"
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-indigo-900/80 hover:bg-indigo-50 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>{isTestingTts ? 'Speaking...' : 'Test Speech'}</span>
                  </button>
                </div>
              ) : null}
            </div>

            {/* 1. Reduced Motion */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
              <div className="space-y-0.5 pr-4 flex-1">
                <div className="flex items-center gap-2">
                  <ZapOff className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                    Reduced Motion
                  </span>
                  <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    Default: OFF
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Smooth animations and transitions. Turn ON to minimize UI motion and eliminate sliding effects.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={settings.reducedMotion}
                aria-label="Toggle Reduced Motion"
                onClick={() => handleToggle('reducedMotion')}
                className={`w-12 h-6.5 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out shrink-0 ${
                  settings.reducedMotion ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <div
                  className={`bg-white w-4.5 h-4.5 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                    settings.reducedMotion ? 'translate-x-5.5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* 2. Text Size */}
            <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Type className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                    Text Size
                  </span>
                </div>
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 capitalize">
                  {settings.textSize.replace('-', ' ')}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                {(['default', 'large', 'extra-large'] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => handleTextSizeChange(size)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      settings.textSize === size
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {settings.textSize === size && <Check className="w-3 h-3" />}
                    <span className="capitalize">{size === 'extra-large' ? 'XL' : size}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. High Contrast */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
              <div className="space-y-0.5 pr-4 flex-1">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                    High Contrast
                  </span>
                  <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    Default: OFF
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Increases border definition and text contrast for easier legibility while preserving AMOLED dark.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={settings.highContrast}
                aria-label="Toggle High Contrast"
                onClick={() => handleToggle('highContrast')}
                className={`w-12 h-6.5 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out shrink-0 ${
                  settings.highContrast ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <div
                  className={`bg-white w-4.5 h-4.5 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                    settings.highContrast ? 'translate-x-5.5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* 4. Enhanced Focus Indicators */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
              <div className="space-y-0.5 pr-4 flex-1">
                <div className="flex items-center gap-2">
                  <Maximize2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                    Enhanced Focus Rings
                  </span>
                  <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    Default: OFF
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Adds bold outline indicators around buttons and inputs during keyboard navigation.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={settings.enhancedFocus}
                aria-label="Toggle Enhanced Focus Rings"
                onClick={() => handleToggle('enhancedFocus')}
                className={`w-12 h-6.5 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out shrink-0 ${
                  settings.enhancedFocus ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <div
                  className={`bg-white w-4.5 h-4.5 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                    settings.enhancedFocus ? 'translate-x-5.5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* 5. Larger Touch Targets */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
              <div className="space-y-0.5 pr-4 flex-1">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                    Larger Touch Targets
                  </span>
                  <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    Default: OFF
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Increases interactive button and control hit areas (44px minimum) for comfortable touch.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={settings.largerTouchTargets}
                aria-label="Toggle Larger Touch Targets"
                onClick={() => handleToggle('largerTouchTargets')}
                className={`w-12 h-6.5 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out shrink-0 ${
                  settings.largerTouchTargets ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <div
                  className={`bg-white w-4.5 h-4.5 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                    settings.largerTouchTargets ? 'translate-x-5.5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* 6. Low-End Device Mode */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
              <div className="space-y-0.5 pr-4 flex-1">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                    Low-End Device Mode
                  </span>
                  <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    Default: OFF
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Disables heavy backdrop blur filters and GPU animations to conserve battery and run smoothly on older devices.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={settings.performanceMode}
                aria-label="Toggle Low-End Device Mode"
                onClick={() => handleToggle('performanceMode')}
                className={`w-12 h-6.5 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out shrink-0 ${
                  settings.performanceMode ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <div
                  className={`bg-white w-4.5 h-4.5 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                    settings.performanceMode ? 'translate-x-5.5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={handleSkip}
            className="px-3.5 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            Skip for Now
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleUseDefaults}
              className="px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer shadow-2xs"
            >
              Use Defaults
            </button>

            <button
              type="button"
              onClick={handleSaveAndContinue}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors cursor-pointer shadow-sm active:scale-[0.98]"
            >
              <span>Continue to Guide</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
