import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { StorageService } from '../services/storage';
import { Sparkles, Church, X, ArrowRight, Info, Settings } from 'lucide-react';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';

interface WelcomeGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartGuide: () => void;
  showToast?: (text: string, type?: 'success' | 'danger' | 'info') => void;
}

export const WelcomeGuideModal: React.FC<WelcomeGuideModalProps> = ({
  isOpen,
  onClose,
  onStartGuide,
  showToast
}) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'welcome-guide-modal',
    isOpen,
    layer: OverlayLayer.GUIDE,
    onClose,
    closeOnEscape: true
  });

  if (!isOpen) return null;

  const handleStart = () => {
    if (dontShowAgain) {
      StorageService.setGuideMode('never');
      if (showToast) {
        showToast('You can change this anytime in Settings → Interactive Guide.', 'info');
      }
    } else {
      StorageService.setHasVisitedBefore(true);
    }
    onClose();
    onStartGuide();
  };

  const handleMaybeLater = () => {
    if (dontShowAgain) {
      StorageService.setGuideMode('never');
      if (showToast) {
        showToast('You can change this anytime in Settings → Interactive Guide.', 'info');
      }
    } else {
      StorageService.setOnboardingSkippedSession(true);
    }
    onClose();
  };

  const modalContent = (
    <div
      style={{ zIndex }}
      data-overlay-id="welcome-guide-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200 transition-opacity ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] my-auto transform animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 text-white relative">
          <button
            type="button"
            onClick={handleMaybeLater}
            className="absolute top-4 right-4 p-1 text-white/70 hover:text-white rounded-lg transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mb-3 border border-white/20">
            <Sparkles className="w-6 h-6 text-indigo-200 animate-pulse" />
          </div>

          <h2 className="text-lg sm:text-xl font-bold tracking-tight">
            Welcome to WWCF Santa Cruz Song Scheduler!
          </h2>
          <p className="text-xs text-indigo-100 mt-1.5 leading-relaxed font-medium">
            Let us quickly show you how to create and manage a worship lineup.
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-600 dark:text-slate-300 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
              <Church className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Interactive Guide Highlights:</span>
            </div>
            <ul className="space-y-1.5 pl-5 list-disc text-slate-600 dark:text-slate-300">
              <li>9-step guided walkthrough from line-up setup to PDF/PNG export.</li>
              <li>Interactive action detection as you select songs and members.</li>
              <li>Tips for song categories, key transpositions & ministry roles.</li>
            </ul>
          </div>

          {/* Checkbox */}
          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 font-semibold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded border-slate-300 dark:border-slate-700 focus:ring-indigo-500 cursor-pointer"
              />
              <span>Do not show this guide again</span>
            </label>

            {dontShowAgain && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2 animate-in fade-in duration-150">
                <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="leading-snug">
                  You can change this anytime. Go to <strong>Settings → Interactive Guide</strong> to show the guide again or change how often it appears.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleMaybeLater}
            className="px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            Maybe Later
          </button>

          <button
            type="button"
            onClick={handleStart}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-2"
          >
            <span>Start Guide</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
