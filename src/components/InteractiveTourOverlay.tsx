import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { INTERACTIVE_GUIDE_STEPS, TourStep } from './interactiveGuideSteps';
import { ActiveTab } from '../types';
import { StorageService } from '../services/storage';
import { speechAssistant } from '../utils/speechAssistant';
import { isValidServiceDateForType } from '../utils/dateUtils';
import { useOverlay, OverlayLayer, GuideSublayer } from '../hooks/useOverlay';
import {
  ChevronRight,
  ChevronLeft,
  X,
  Sparkles,
  MousePointer,
  Compass,
  CheckCircle2,
  ArrowRight,
  Download,
  FileDown,
  Image
} from 'lucide-react';

interface InteractiveTourOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  initialStep?: number;
}

export const InteractiveTourOverlay: React.FC<InteractiveTourOverlayProps> = ({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  initialStep = 1
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isTopicMenuOpen, setIsTopicMenuOpen] = useState(false);
  const [isSaveCompletedState, setIsSaveCompletedState] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const { zIndex, isTopmost } = useOverlay({
    id: 'interactive-tour-overlay',
    isOpen,
    layer: OverlayLayer.GUIDE,
    onClose,
    closeOnEscape: false // Guide handles its own Escape or skip
  });

  const popoverRef = useRef<HTMLDivElement>(null);
  const isAdvancingRef = useRef<boolean>(false);
  const isTransitioningRef = useRef<boolean>(false);
  const currentStepIndexRef = useRef<number>(0);
  const currentServiceTypeRef = useRef<string>('Sunday Service');
  const step4InitialSongsRef = useRef<Set<string> | null>(null);
  const step4InitializedRef = useRef<boolean>(false);
  const step4PendingModalCloseRef = useRef<boolean>(false);

  // Sync initialStep when guide opens or when initialStep changes
  useEffect(() => {
    if (isOpen) {
      setIsSaveCompletedState(false);
      setIsTransitioning(false);
      isAdvancingRef.current = false;
      isTransitioningRef.current = false;
      step4InitializedRef.current = false;
      step4InitialSongsRef.current = null;
      step4PendingModalCloseRef.current = false;

      const targetIdx = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === initialStep);
      if (targetIdx !== -1) {
        setCurrentStepIndex(targetIdx);
        currentStepIndexRef.current = targetIdx;
      } else if (initialStep >= 1 && initialStep <= INTERACTIVE_GUIDE_STEPS.length) {
        setCurrentStepIndex(initialStep - 1);
        currentStepIndexRef.current = initialStep - 1;
      }
    }
  }, [initialStep, isOpen]);

  const step = INTERACTIVE_GUIDE_STEPS[currentStepIndex] || INTERACTIVE_GUIDE_STEPS[0];

  // Helper function to scroll target element into safe visible area FIRST
  const scrollToTargetElement = (targetSelector: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof document === 'undefined') {
        resolve(false);
        return;
      }

      const el = document.querySelector(targetSelector) as HTMLElement | null;
      if (!el) {
        resolve(false);
        return;
      }

      const rect = el.getBoundingClientRect();
      const headerHeight = 70;
      const vh = window.innerHeight;

      // Check if element top and bottom are already comfortably in view
      const isInView = rect.top >= headerHeight + 10 && rect.bottom <= vh - 20;

      if (isInView) {
        resolve(true);
        return;
      }

      // Find appropriate scroll container (window or parent scroll container)
      let scrollContainer: Element | Window = window;
      let curr: Element | null = el.parentElement;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        const style = window.getComputedStyle(curr);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          scrollContainer = curr;
          break;
        }
        curr = curr.parentElement;
      }

      const settings = StorageService.getAccessibilitySettings();
      const scrollBehavior: ScrollBehavior = (settings.reducedMotion || settings.performanceMode) ? 'auto' : 'smooth';

      if (scrollContainer === window) {
        const elementAbsoluteTop = rect.top + window.scrollY;
        const targetScrollY = Math.max(0, elementAbsoluteTop - headerHeight - 20);
        window.scrollTo({ top: targetScrollY, behavior: scrollBehavior });
      } else {
        const containerRect = (scrollContainer as Element).getBoundingClientRect();
        const relativeTop = rect.top - containerRect.top;
        (scrollContainer as Element).scrollBy({
          top: relativeTop - headerHeight - 20,
          behavior: scrollBehavior
        });
      }

      setTimeout(() => {
        resolve(true);
      }, 250);
    });
  };

  // Dynamic selector resolver for multi-branch steps and modals
  const resolveTargetSelector = (s: TourStep | null): string => {
    if (!s) return '';

    if (s.id === 110) {
      if (document.querySelector('[data-tour="new-lineup-options-container"]')) {
        return '[data-tour="new-lineup-options-container"]';
      }
      if (document.querySelector('[data-tour="new-lineup-option-load"]')) {
        return '[data-tour="new-lineup-option-load"]';
      }
      if (document.querySelector('[data-tour="new-lineup-option-create"]')) {
        return '[data-tour="new-lineup-option-create"]';
      }
      if (document.querySelector('[data-tour="new-lineup-modal-container"]')) {
        return '[data-tour="new-lineup-modal-container"]';
      }
      return '[data-tour="header-new-lineup-btn"]';
    }

    if (s.id === 2) {
      if (document.querySelector('[data-tour="load-service-type-select"]')) {
        return '[data-tour="load-service-type-select"]';
      }
      if (document.querySelector('[data-tour="create-service-type-select"]')) {
        return '[data-tour="create-service-type-select"]';
      }
      if (document.querySelector('[data-tour="service-type-select"]')) {
        return '[data-tour="service-type-select"]';
      }
      return '[data-tour="load-service-type-select"]';
    }

    if (s.id === 3) {
      if (document.querySelector('[data-tour="load-schedule-date-select"]')) {
        return '[data-tour="load-schedule-date-select"]';
      }
      if (document.querySelector('[data-tour="create-service-date-input"]')) {
        return '[data-tour="create-service-date-input"]';
      }
      if (document.querySelector('[data-tour="service-date-picker"]')) {
        return '[data-tour="service-date-picker"]';
      }
      return '[data-tour="load-schedule-date-select"]';
    }

    if (s.id === 35) {
      if (document.querySelector('[data-tour="load-lineup-submit-btn"]')) {
        return '[data-tour="load-lineup-submit-btn"]';
      }
      if (document.querySelector('[data-tour="create-lineup-submit-btn"]')) {
        return '[data-tour="create-lineup-submit-btn"]';
      }
      if (document.querySelector('[data-tour="conflict-load-existing-btn"]')) {
        return '[data-tour="conflict-load-existing-btn"]';
      }
      return '[data-tour="load-lineup-submit-btn"]';
    }

    if (s.id === 42) {
      const doneBtn = document.querySelector('[data-tour="import-done-btn"]');
      const submitBtn = document.querySelector('[data-tour="import-submit-btn"]');
      const urlInput = document.querySelector('[data-tour="playlist-url-input"]');
      const modalContainer = document.querySelector('[data-tour="import-modal-container"]');
      const importPlaylistBtn = document.querySelector('[data-tour="import-playlist-btn"]');

      if (doneBtn) return '[data-tour="import-done-btn"]';
      if (submitBtn) return '[data-tour="import-submit-btn"]';
      if (urlInput) return '[data-tour="playlist-url-input"]';
      if (modalContainer) return '[data-tour="import-modal-container"]';
      if (importPlaylistBtn) return '[data-tour="import-playlist-btn"]';
    }

    // QR Code Transfer Steps (200–207)
    if (s.id >= 200 && s.id <= 207) {
      if (document.querySelector(s.targetSelector)) {
        return s.targetSelector;
      }
      if (document.querySelector('[data-tour="transfer-modal-container"]')) {
        return '[data-tour="transfer-modal-container"]';
      }
      if (document.querySelector('[data-tour="sidebar-settings-btn"]')) {
        return '[data-tour="sidebar-settings-btn"]';
      }
    }

    // Basic Guide Step 8 (Choice) vs 81 (PDF) vs 82 (PNG)
    if (s.id === 8) {
      if (document.querySelector('[data-tour="export-buttons-pair"]')) return '[data-tour="export-buttons-pair"]';
      if (document.querySelector('[data-guide="export-pdf"]')) return '[data-tour="export-buttons-pair"]';
      return '[data-tour="export-buttons-pair"]';
    }

    if (s.id === 81 || s.id === 301) {
      if (document.querySelector('[data-tour="export-pdf-btn"]')) return '[data-tour="export-pdf-btn"]';
      if (document.querySelector('[data-tour="export-pdf"]')) return '[data-tour="export-pdf"]';
      return '[data-tour="export-pdf-btn"]';
    }

    if (s.id === 82 || s.id === 302) {
      if (document.querySelector('[data-tour="export-png-btn"]')) return '[data-tour="export-png-btn"]';
      if (document.querySelector('[data-tour="export-png"]')) return '[data-tour="export-png"]';
      return '[data-tour="export-png-btn"]';
    }

    // Exporting Lineups Guide (300–303)
    if (s.id >= 300 && s.id <= 303) {
      if (document.querySelector(s.targetSelector)) return s.targetSelector;
      if (s.id === 300 && document.querySelector('[data-tour="save-lineup-btn"]')) return '[data-tour="save-lineup-btn"]';
      if (s.id === 301 && document.querySelector('[data-tour="export-pdf-btn"]')) return '[data-tour="export-pdf-btn"]';
      if (s.id === 302 && document.querySelector('[data-tour="export-png-btn"]')) return '[data-tour="export-png-btn"]';
      if (s.id === 303 && document.querySelector('[data-tour="schedules-view"]')) return '[data-tour="schedules-view"]';
    }

    // Song Database Guide (310–313)
    if (s.id >= 310 && s.id <= 313) {
      if (document.querySelector(s.targetSelector)) return s.targetSelector;
      if (document.querySelector('[data-tour="songs-view"]')) return '[data-tour="songs-view"]';
    }

    // YouTube Playlist Import Guide (320–323)
    if (s.id >= 320 && s.id <= 323) {
      if (document.querySelector(s.targetSelector)) return s.targetSelector;
      if (document.querySelector('[data-tour="import-modal-container"]')) return '[data-tour="import-modal-container"]';
      if (document.querySelector('[data-tour="import-playlist-btn"]')) return '[data-tour="import-playlist-btn"]';
    }

    // Volunteer Roster & Member Editor Guide (330–334)
    if (s.id >= 330 && s.id <= 334) {
      if (document.querySelector(s.targetSelector)) return s.targetSelector;
      if (document.querySelector('[data-tour="members-view"]')) return '[data-tour="members-view"]';
    }

    // Worship Team Member Assignment Guide (340–343)
    if (s.id >= 340 && s.id <= 343) {
      if (document.querySelector(s.targetSelector)) return s.targetSelector;
      if (document.querySelector('[data-tour="team-assignments-panel"]')) return '[data-tour="team-assignments-panel"]';
    }

    // Scheduling & Service Types Guide (350–353)
    if (s.id >= 350 && s.id <= 353) {
      if (document.querySelector(s.targetSelector)) return s.targetSelector;
      if (document.querySelector('[data-tour="new-lineup-modal-container"]')) return '[data-tour="new-lineup-modal-container"]';
      if (document.querySelector('[data-tour="header-new-lineup-btn"]')) return '[data-tour="header-new-lineup-btn"]';
    }

    // Song Repetition Guard Guide (360–362)
    if (s.id >= 360 && s.id <= 362) {
      if (document.querySelector(s.targetSelector)) return s.targetSelector;
      if (document.querySelector('[data-tour="rearrangeable-song-list"]')) return '[data-tour="rearrangeable-song-list"]';
    }

    // Saved Line-ups Archive Guide (370–373)
    if (s.id >= 370 && s.id <= 373) {
      if (document.querySelector(s.targetSelector)) return s.targetSelector;
      if (document.querySelector('[data-tour="schedules-view"]')) return '[data-tour="schedules-view"]';
    }

    // Backup & Restore Guide (380–382)
    if (s.id >= 380 && s.id <= 382) {
      if (document.querySelector(s.targetSelector)) return s.targetSelector;
      if (document.querySelector('[data-tour="backup-modal-container"]')) return '[data-tour="backup-modal-container"]';
      if (document.querySelector('[data-tour="sidebar-settings-btn"]')) return '[data-tour="sidebar-settings-btn"]';
    }

    // Settings & Themes Guide (390–392)
    if (s.id >= 390 && s.id <= 392) {
      if (document.querySelector(s.targetSelector)) return s.targetSelector;
      if (document.querySelector('[data-tour="settings-modal-container"]')) return '[data-tour="settings-modal-container"]';
      if (document.querySelector('[data-tour="sidebar-settings-btn"]')) return '[data-tour="sidebar-settings-btn"]';
    }

    return s.targetSelector;
  };

  // Recalculate spotlight target rect
  const updateTargetRect = () => {
    if (!isOpen || !step) {
      setTargetRect(null);
      return;
    }

    // Step 8: Spotlight tightly surrounds ONLY the two export buttons (PDF & PNG)
    if (step.id === 8) {
      const pdfBtn = document.querySelector('[data-guide="export-pdf"]') || document.querySelector('[data-tour="export-pdf-btn"]');
      const pngBtn = document.querySelector('[data-guide="export-png"]') || document.querySelector('[data-tour="export-png-btn"]');
      if (pdfBtn && pngBtn) {
        const r1 = pdfBtn.getBoundingClientRect();
        const r2 = pngBtn.getBoundingClientRect();
        if (r1.width > 0 && r2.width > 0) {
          const top = Math.min(r1.top, r2.top);
          const left = Math.min(r1.left, r2.left);
          const right = Math.max(r1.right, r2.right);
          const bottom = Math.max(r1.bottom, r2.bottom);
          setTargetRect(new DOMRect(left, top, right - left, bottom - top));
          return;
        }
      }
    }

    const targetSelector = resolveTargetSelector(step);
    const el = document.querySelector(targetSelector);
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setTargetRect(rect);
      } else {
        setTargetRect(null);
      }
    } else {
      setTargetRect(null);
    }
  };

  // Step transition effect: Switch tab & scroll target into view FIRST before revealing step
  useEffect(() => {
    if (!isOpen || !step) return;

    let isMounted = true;
    setIsTransitioning(true);

    const performStepNavigation = async () => {
      // 1. Ensure target tab is active
      if (activeTab !== step.targetTab) {
        setActiveTab(step.targetTab);
        await new Promise((resolve) => setTimeout(resolve, 80));
      }

      const selector = resolveTargetSelector(step);

      // 2. Scroll to target element FIRST
      await scrollToTargetElement(selector);

      if (isMounted) {
        updateTargetRect();
        setIsTransitioning(false);
      }
    };

    performStepNavigation();

    // Coalesce target rect updates with requestAnimationFrame
    let rAFId: number | null = null;
    const handleRecalculate = () => {
      if (rAFId !== null) return;
      rAFId = requestAnimationFrame(() => {
        rAFId = null;
        if (isMounted) {
          updateTargetRect();
        }
      });
    };

    window.addEventListener('resize', handleRecalculate, { passive: true });
    window.addEventListener('scroll', handleRecalculate, { passive: true, capture: true });

    // Observe body size changes for responsive layout shifts
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && document.body) {
      try {
        resizeObserver = new ResizeObserver(() => {
          handleRecalculate();
        });
        resizeObserver.observe(document.body);
      } catch {}
    }

    // Bounded step locator (max 4 checks within 1 second for dynamically mounted modals)
    let attempts = 0;
    const checkTimer = setInterval(() => {
      if (!isMounted) return;
      attempts++;
      handleRecalculate();
      if (attempts >= 4) {
        clearInterval(checkTimer);
      }
    }, 250);

    return () => {
      isMounted = false;
      if (rAFId !== null) cancelAnimationFrame(rAFId);
      window.removeEventListener('resize', handleRecalculate);
      window.removeEventListener('scroll', handleRecalculate, true);
      if (resizeObserver) resizeObserver.disconnect();
      clearInterval(checkTimer);
    };
  }, [isOpen, currentStepIndex, step?.id, step?.targetTab]);

  // Handle service-details-response and service updates
  useEffect(() => {
    if (!isOpen || !step) return;

    const handleServiceDetailsResponse = (e: Event) => {
      const customEvt = e as CustomEvent<{ serviceType: string; serviceDate: string }>;
      if (customEvt.detail?.serviceType) {
        currentServiceTypeRef.current = customEvt.detail.serviceType;
      }
    };

    const handleServiceTypeSelected = (e: Event) => {
      const customEvt = e as CustomEvent<{ previousType?: string; serviceType: string; serviceDate?: string }>;
      if (!customEvt.detail?.serviceType) return;
      currentServiceTypeRef.current = customEvt.detail.serviceType;

      if (step.id === 2) {
        if (isAdvancingRef.current) return;
        isAdvancingRef.current = true;
        const idx3 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 3);
        if (idx3 !== -1) {
          goToStep(idx3);
        }
      }
    };

    const handleServiceDateSelected = (e: Event) => {
      const customEvt = e as CustomEvent<{ previousDate?: string; serviceDate: string; serviceType?: string }>;
      if (!customEvt.detail?.serviceDate) return;
      const selectedDate = customEvt.detail.serviceDate;
      const sType = customEvt.detail.serviceType || currentServiceTypeRef.current || 'Sunday Service';

      if (!selectedDate || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) return;

      const validation = isValidServiceDateForType(sType, selectedDate);
      if (!validation.isValid) return;

      if (step.id === 3) {
        if (isAdvancingRef.current) return;
        isAdvancingRef.current = true;
        const hasModalSubmit = Boolean(
          document.querySelector('[data-tour="load-lineup-submit-btn"]') ||
          document.querySelector('[data-tour="create-lineup-submit-btn"]') ||
          document.querySelector('[data-tour="conflict-load-existing-btn"]')
        );
        if (hasModalSubmit) {
          const idx35 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 35);
          if (idx35 !== -1) {
            goToStep(idx35);
            return;
          }
        }
        const idx4 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 4);
        if (idx4 !== -1) {
          goToStep(idx4);
        }
      }
    };

    const handleNewLineupChoiceSelected = () => {
      if (step.id === 110) {
        if (isAdvancingRef.current) return;
        isAdvancingRef.current = true;
        const idx2 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 2);
        if (idx2 !== -1) {
          goToStep(idx2);
        }
      }
    };

    const handleLineupModalOpened = () => {
      if (step.id === 35 || step.id === 3) {
        if (isAdvancingRef.current) return;
        isAdvancingRef.current = true;
        const idx4 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 4);
        if (idx4 !== -1) {
          goToStep(idx4);
        }
      }
    };

    window.addEventListener('service-details-response', handleServiceDetailsResponse);
    window.addEventListener('service-type-user-selected', handleServiceTypeSelected);
    window.addEventListener('service-date-user-selected', handleServiceDateSelected);
    window.addEventListener('new-lineup-choice-selected', handleNewLineupChoiceSelected);
    window.addEventListener('lineup-loaded-from-modal', handleLineupModalOpened);
    window.addEventListener('lineup-created-from-modal', handleLineupModalOpened);

    window.dispatchEvent(new CustomEvent('request-service-details'));

    return () => {
      window.removeEventListener('service-details-response', handleServiceDetailsResponse);
      window.removeEventListener('service-type-user-selected', handleServiceTypeSelected);
      window.removeEventListener('service-date-user-selected', handleServiceDateSelected);
      window.removeEventListener('new-lineup-choice-selected', handleNewLineupChoiceSelected);
      window.removeEventListener('lineup-loaded-from-modal', handleLineupModalOpened);
      window.removeEventListener('lineup-created-from-modal', handleLineupModalOpened);
    };
  }, [isOpen, step, currentStepIndex]);

  // Specialized State Detector for Step 4, 4A, 4B (Add Songs / Import Playlist)
  useEffect(() => {
    if (!isOpen || !step) return;

    const advanceToStep5 = () => {
      if (isAdvancingRef.current) return;
      isAdvancingRef.current = true;

      setTimeout(() => {
        const arrangeSongsIndex = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 5);
        const nextIndex = arrangeSongsIndex !== -1 ? arrangeSongsIndex : currentStepIndexRef.current + 1;
        goToStep(nextIndex);
      }, 50);
    };

    const modalCheckInterval = setInterval(() => {
      if (step4PendingModalCloseRef.current) {
        const modalContainer = document.querySelector('[data-tour="import-modal-container"]');
        if (!modalContainer) {
          step4PendingModalCloseRef.current = false;
          advanceToStep5();
        }
      }
    }, 150);

    const handlePlaylistImportSuccess = (e: Event) => {
      if (step.id === 4 || step.id === 41 || step.id === 42) {
        const customEvt = e as CustomEvent<{ praiseSongs?: string[]; worshipSongs?: string[] }>;
        const pSongs = customEvt.detail?.praiseSongs || [];
        const wSongs = customEvt.detail?.worshipSongs || [];
        const totalSongs = [...pSongs, ...wSongs].filter((s) => s && s.trim().length > 0);
        if (totalSongs.length > 0) {
          const isModalOpen = Boolean(
            document.querySelector('[data-tour="import-done-btn"]') ||
            document.querySelector('[data-tour="import-modal-container"]')
          );
          if (isModalOpen) {
            step4PendingModalCloseRef.current = true;
          } else {
            advanceToStep5();
          }
        }
      }
    };

    const handleBlankLineupCreated = () => {
      // Advance from Step 4 (Choice) to Step 4A (Add Songs), not directly to Step 5
      if (step.id === 4) {
        const idx4a = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 41);
        if (idx4a !== -1) {
          goToStep(idx4a);
        }
      }
    };

    const evaluateStep4Songs = (praiseSongs: string[], worshipSongs: string[]) => {
      if (isAdvancingRef.current) return;
      // CRITICAL: Only evaluate dynamic song additions on Step 4A (id: 41), NEVER on Step 4 (Choice step)
      if (step.id !== 41) return;

      const currentNonEmpty = [...praiseSongs, ...worshipSongs]
        .map((s) => (s || '').trim().toLowerCase())
        .filter(Boolean);

      if (!step4InitializedRef.current || step4InitialSongsRef.current === null) {
        step4InitialSongsRef.current = new Set(currentNonEmpty);
        step4InitializedRef.current = true;
        return;
      }

      const initialSet = step4InitialSongsRef.current;
      const initialSize = initialSet.size;

      let isSuccess = false;

      if (initialSize === 0) {
        if (currentNonEmpty.length > 0) {
          isSuccess = true;
        }
      } else {
        if (currentNonEmpty.length > initialSize) {
          isSuccess = true;
        } else if (currentNonEmpty.some((song) => !initialSet.has(song))) {
          isSuccess = true;
        }
      }

      if (isSuccess) {
        advanceToStep5();
      }
    };

    const handleLineupSongsChanged = (e: Event) => {
      const customEvt = e as CustomEvent<{ praiseSongs: string[]; worshipSongs: string[] }>;
      if (customEvt.detail) {
        const { praiseSongs = [], worshipSongs = [] } = customEvt.detail;
        evaluateStep4Songs(praiseSongs, worshipSongs);
      }
    };

    window.addEventListener('playlist-import-success', handlePlaylistImportSuccess);
    window.addEventListener('blank-lineup-created', handleBlankLineupCreated);
    window.addEventListener('lineup-songs-changed', handleLineupSongsChanged);

    if (step.id === 41) {
      window.dispatchEvent(new CustomEvent('request-lineup-songs'));
    }

    return () => {
      clearInterval(modalCheckInterval);
      window.removeEventListener('playlist-import-success', handlePlaylistImportSuccess);
      window.removeEventListener('blank-lineup-created', handleBlankLineupCreated);
      window.removeEventListener('lineup-songs-changed', handleLineupSongsChanged);
    };
  }, [isOpen, step?.id, currentStepIndex]);

  // Listen for lineup-save-success or lineup-saved-success to advance Step 7 -> Step 8
  useEffect(() => {
    if (!isOpen || !step) return;

    const handleSaveSuccess = () => {
      if (step.id === 7) {
        const idx8 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 8);
        if (idx8 !== -1) {
          goToStep(idx8);
        }
      }
    };

    window.addEventListener('lineup-save-success', handleSaveSuccess);
    window.addEventListener('lineup-saved-success', handleSaveSuccess);
    return () => {
      window.removeEventListener('lineup-save-success', handleSaveSuccess);
      window.removeEventListener('lineup-saved-success', handleSaveSuccess);
    };
  }, [isOpen, step]);

  // Listen for lineup-exported-success to advance Step 81 / 82 / 301 / 302
  useEffect(() => {
    if (!isOpen || !step) return;

    const handleExportSuccess = (e: Event) => {
      const customEvt = e as CustomEvent<{ type?: 'pdf' | 'png' }>;
      const exportType = customEvt.detail?.type;

      if (step.id === 81 && exportType === 'pdf') {
        handleComplete();
      } else if (step.id === 82 && exportType === 'png') {
        handleComplete();
      } else if (step.id === 8) {
        handleComplete();
      } else if (step.id === 301 && exportType === 'pdf') {
        const idx302 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 302);
        if (idx302 !== -1) {
          goToStep(idx302);
        }
      } else if (step.id === 302 && exportType === 'png') {
        const idx303 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 303);
        if (idx303 !== -1) {
          goToStep(idx303);
        }
      }
    };

    window.addEventListener('lineup-exported-success', handleExportSuccess);
    return () => {
      window.removeEventListener('lineup-exported-success', handleExportSuccess);
    };
  }, [isOpen, step]);

  // Listen to user interaction on target element dynamically (non-blocking capture phase)
  useEffect(() => {
    if (!isOpen || !step || step.actionType === 'none') return;

    const handleGlobalInteraction = (e: Event) => {
      if (isAdvancingRef.current) return;

      const selector = resolveTargetSelector(step);
      const targetEl = selector ? document.querySelector(selector) : null;

      const eventTarget = e.target as Node | null;
      if (!eventTarget) return;

      let isTargetMatch = Boolean(targetEl && (targetEl === eventTarget || targetEl.contains(eventTarget)));

      if (step.id === 110) {
        const optionLoad = document.querySelector('[data-tour="new-lineup-option-load"]');
        const optionCreate = document.querySelector('[data-tour="new-lineup-option-create"]');
        if ((optionLoad && (optionLoad === eventTarget || optionLoad.contains(eventTarget))) ||
            (optionCreate && (optionCreate === eventTarget || optionCreate.contains(eventTarget)))) {
          isTargetMatch = true;
        }
      } else if (step.id === 35) {
        const loadBtn = document.querySelector('[data-tour="load-lineup-submit-btn"]');
        const createBtn = document.querySelector('[data-tour="create-lineup-submit-btn"]');
        const conflictBtn = document.querySelector('[data-tour="conflict-load-existing-btn"]');
        if ((loadBtn && (loadBtn === eventTarget || loadBtn.contains(eventTarget))) ||
            (createBtn && (createBtn === eventTarget || createBtn.contains(eventTarget))) ||
            (conflictBtn && (conflictBtn === eventTarget || conflictBtn.contains(eventTarget)))) {
          isTargetMatch = true;
        }
      } else if (step.id === 4) {
        const blankBtn = document.querySelector('[data-tour="blank-lineup-btn"]');
        const importBtn = document.querySelector('[data-tour="import-playlist-btn"]');
        if ((blankBtn && (blankBtn === eventTarget || blankBtn.contains(eventTarget))) ||
            (importBtn && (importBtn === eventTarget || importBtn.contains(eventTarget)))) {
          isTargetMatch = true;
        }
      } else if (step.id === 8) {
        const pdfBtn = document.querySelector('[data-tour="export-pdf-btn"]') || document.querySelector('[data-tour="export-pdf"]');
        const pngBtn = document.querySelector('[data-tour="export-png-btn"]') || document.querySelector('[data-tour="export-png"]');
        if ((pdfBtn && (pdfBtn === eventTarget || pdfBtn.contains(eventTarget))) ||
            (pngBtn && (pngBtn === eventTarget || pngBtn.contains(eventTarget)))) {
          isTargetMatch = true;
        }
      } else if (step.id === 81 || step.id === 301) {
        const pdfBtn = document.querySelector('[data-tour="export-pdf-btn"]') || document.querySelector('[data-tour="export-pdf"]');
        if (pdfBtn && (pdfBtn === eventTarget || pdfBtn.contains(eventTarget))) {
          isTargetMatch = true;
        }
      } else if (step.id === 82 || step.id === 302) {
        const pngBtn = document.querySelector('[data-tour="export-png-btn"]') || document.querySelector('[data-tour="export-png"]');
        if (pngBtn && (pngBtn === eventTarget || pngBtn.contains(eventTarget))) {
          isTargetMatch = true;
        }
      }

      if (!isTargetMatch) return;

      if (step.actionType === 'click') {
        if (e.type !== 'click') return;
      } else if (step.actionType === 'input') {
        if (e.type !== 'input' && e.type !== 'change' && e.type !== 'keyup') return;
        const inputEl = eventTarget as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        if (inputEl && inputEl.value !== undefined) {
          if (inputEl.type === 'checkbox' || inputEl.type === 'radio') {
            if (!(inputEl as HTMLInputElement).checked) return;
          } else {
            if (!inputEl.value || inputEl.value.trim().length === 0) return;
          }
        }
      }

      isAdvancingRef.current = true;

      setTimeout(() => {
        if (currentStepIndexRef.current < INTERACTIVE_GUIDE_STEPS.length - 1) {
          const currStep = INTERACTIVE_GUIDE_STEPS[currentStepIndexRef.current];
          if (currStep.id === 1) {
            const idx110 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 110);
            if (idx110 !== -1) {
              goToStep(idx110);
              return;
            }
          } else if (currStep.id === 110) {
            const idx2 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 2);
            if (idx2 !== -1) {
              goToStep(idx2);
              return;
            }
          } else if (currStep.id === 2) {
            const idx3 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 3);
            if (idx3 !== -1) {
              goToStep(idx3);
              return;
            }
          } else if (currStep.id === 3) {
            const idx35 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 35);
            if (idx35 !== -1) {
              goToStep(idx35);
              return;
            }
          } else if (currStep.id === 35) {
            const idx4 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 4);
            if (idx4 !== -1) {
              goToStep(idx4);
              return;
            }
          } else if (currStep.id === 4) {
            const importBtn = document.querySelector('[data-tour="import-playlist-btn"]');
            if (importBtn && (importBtn === eventTarget || importBtn.contains(eventTarget))) {
              const idx4b = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 42);
              if (idx4b !== -1) {
                goToStep(idx4b);
                return;
              }
            } else {
              const idx4a = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 41);
              if (idx4a !== -1) {
                goToStep(idx4a);
                return;
              }
            }
          } else if (currStep.id === 41 || currStep.id === 42) {
            const idx5 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 5);
            if (idx5 !== -1) {
              goToStep(idx5);
              return;
            }
          } else if (currStep.id === 7) {
            const idx8 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 8);
            if (idx8 !== -1) {
              goToStep(idx8);
              return;
            }
          } else if (currStep.id === 8 || currStep.id === 81 || currStep.id === 82) {
            handleComplete();
            return;
          } else if (currStep.id === 301) {
            const idx302 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 302);
            if (idx302 !== -1) {
              goToStep(idx302);
              return;
            }
          } else if (currStep.id === 302) {
            const idx303 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 303);
            if (idx303 !== -1) {
              goToStep(idx303);
              return;
            }
          }
          goToStep(currentStepIndexRef.current + 1);
        }
      }, 50);
    };

    window.addEventListener('click', handleGlobalInteraction, true);
    window.addEventListener('input', handleGlobalInteraction, true);
    window.addEventListener('change', handleGlobalInteraction, true);

    return () => {
      window.removeEventListener('click', handleGlobalInteraction, true);
      window.removeEventListener('input', handleGlobalInteraction, true);
      window.removeEventListener('change', handleGlobalInteraction, true);
    };
  }, [isOpen, currentStepIndex, step]);

  // Interactive Guide Interaction Lock: Restrict ALL pointer and keyboard interactions strictly to the current target control and guide UI while guide is active
  useEffect(() => {
    if (!isOpen) return;

    const isElementAllowed = (element: Node | null): boolean => {
      if (!element) return false;

      // 1. Always allow interactions with guide popover controls
      if (popoverRef.current && popoverRef.current.contains(element)) {
        return true;
      }

      // 2. Resolve target selector for current guide step
      const targetSelector = resolveTargetSelector(step);
      let targetEl: Element | null = null;
      if (targetSelector) {
        targetEl = document.querySelector(targetSelector);
        if (targetEl && targetEl.contains(element)) {
          return true;
        }
      }

      if (step?.id === 110) {
        const optionLoad = document.querySelector('[data-tour="new-lineup-option-load"]');
        const optionCreate = document.querySelector('[data-tour="new-lineup-option-create"]');
        if ((optionLoad && optionLoad.contains(element)) || (optionCreate && optionCreate.contains(element))) {
          return true;
        }
      }

      if (step?.id === 35) {
        const loadBtn = document.querySelector('[data-tour="load-lineup-submit-btn"]');
        const createBtn = document.querySelector('[data-tour="create-lineup-submit-btn"]');
        const conflictBtn = document.querySelector('[data-tour="conflict-load-existing-btn"]');
        if ((loadBtn && loadBtn.contains(element)) || (createBtn && createBtn.contains(element)) || (conflictBtn && conflictBtn.contains(element))) {
          return true;
        }
      }

      if (step?.id === 4) {
        const blankBtn = document.querySelector('[data-tour="blank-lineup-btn"]');
        const importBtn = document.querySelector('[data-tour="import-playlist-btn"]');
        if ((blankBtn && blankBtn.contains(element)) || (importBtn && importBtn.contains(element))) {
          return true;
        }
      }

      if (step?.id === 8) {
        const pdfBtn = document.querySelector('[data-tour="export-pdf-btn"]') || document.querySelector('[data-guide="export-pdf"]');
        const pngBtn = document.querySelector('[data-tour="export-png-btn"]') || document.querySelector('[data-guide="export-png"]');
        const exportPair = document.querySelector('[data-tour="export-buttons-pair"]');
        if ((pdfBtn && pdfBtn.contains(element)) || (pngBtn && pngBtn.contains(element)) || (exportPair && exportPair.contains(element))) {
          return true;
        }
      }

      if (step?.id === 81 || step?.id === 301) {
        const pdfBtn = document.querySelector('[data-tour="export-pdf-btn"]') || document.querySelector('[data-tour="export-pdf"]');
        if (pdfBtn && pdfBtn.contains(element)) {
          return true;
        }
      }

      if (step?.id === 82 || step?.id === 302) {
        const pngBtn = document.querySelector('[data-tour="export-png-btn"]') || document.querySelector('[data-tour="export-png"]');
        if (pngBtn && pngBtn.contains(element)) {
          return true;
        }
      }

      // 3. Allow interactions inside active modals (New Lineup, Import Playlist, Transfer Data, Backup/Restore, Settings, Dialogs)
      const newLineupModal = document.querySelector('[data-tour="new-lineup-modal-container"]');
      if (newLineupModal && newLineupModal.contains(element)) {
        return true;
      }

      const importModal = document.querySelector('[data-tour="import-modal-container"]');
      if (importModal && importModal.contains(element)) {
        return true;
      }

      const transferModal = document.querySelector('[data-tour="transfer-modal-container"]');
      if (transferModal && transferModal.contains(element)) {
        return true;
      }

      const backupModal = document.querySelector('[data-tour="backup-modal-container"]');
      if (backupModal && backupModal.contains(element)) {
        return true;
      }

      const settingsModal = document.querySelector('[data-tour="settings-modal-container"]');
      if (settingsModal && settingsModal.contains(element)) {
        return true;
      }

      const activeModal = document.querySelector('[role="dialog"]');
      if (activeModal && activeModal.contains(element)) {
        return true;
      }

      // 4. Allow dropdown / select / menu options and portal elements spawned by target
      if (element instanceof Element) {
        const closestPortal = element.closest(
          '[role="listbox"], [role="option"], [role="menu"], [role="menuitem"], [data-radix-portal], option'
        );
        if (closestPortal) {
          return true;
        }
      }

      // 5. Fallback for missing/unmounted target elements: do NOT lock out the entire app
      if (targetSelector && !targetEl) {
        return true;
      }

      return false;
    };

    const handlePointerAndClickCapture = (e: Event) => {
      const targetNode = e.target as Node | null;
      if (!isElementAllowed(targetNode)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    const handleFocusCapture = (e: FocusEvent) => {
      const targetNode = e.target as Node | null;
      if (!isElementAllowed(targetNode)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (popoverRef.current) {
          const focusable = popoverRef.current.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusable) {
            focusable.focus();
          }
        }
      }
    };

    const handleKeyCapture = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        const targetNode = e.target as Node | null;
        if (!isElementAllowed(targetNode)) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
      }
    };

    const pointerEvents = [
      'click',
      'pointerdown',
      'mousedown',
      'mouseup',
      'touchstart',
      'touchend',
      'dblclick',
      'contextmenu'
    ];

    pointerEvents.forEach((evt) => {
      window.addEventListener(evt, handlePointerAndClickCapture, true);
    });

    window.addEventListener('focusin', handleFocusCapture, true);
    window.addEventListener('keydown', handleKeyCapture, true);

    return () => {
      pointerEvents.forEach((evt) => {
        window.removeEventListener(evt, handlePointerAndClickCapture, true);
      });
      window.removeEventListener('focusin', handleFocusCapture, true);
      window.removeEventListener('keydown', handleKeyCapture, true);
    };
  }, [isOpen, step, currentStepIndex]);

  // Step helper to determine if step is first or last in its section
  const isFirstStepInTopic = (stepId: number) => {
    if (stepId === 1) return true;
    if (
      stepId === 200 ||
      stepId === 300 ||
      stepId === 310 ||
      stepId === 320 ||
      stepId === 330 ||
      stepId === 340 ||
      stepId === 350 ||
      stepId === 360 ||
      stepId === 370 ||
      stepId === 380 ||
      stepId === 390
    )
      return true;
    if (stepId >= 10 && stepId <= 15) return true;
    return false;
  };

  const isLastStepInTopic = (stepId: number) => {
    if (stepId === 8 || stepId === 81 || stepId === 82) return true;
    if (
      stepId === 207 ||
      stepId === 303 ||
      stepId === 313 ||
      stepId === 323 ||
      stepId === 334 ||
      stepId === 343 ||
      stepId === 353 ||
      stepId === 362 ||
      stepId === 373 ||
      stepId === 382 ||
      stepId === 392
    )
      return true;
    if (stepId >= 10 && stepId <= 15) return true;
    return false;
  };

  // Atomic Step Transition Helper: Clean up previous step UI & state before advancing/navigating
  const goToStep = (nextIndex: number) => {
    const nextStep = INTERACTIVE_GUIDE_STEPS[nextIndex];
    if (nextStep && nextStep.id !== 42 && nextStep.id !== 320 && nextStep.id !== 321 && nextStep.id !== 322 && nextStep.id !== 323) {
      window.dispatchEvent(new CustomEvent('close-import-playlist-modal'));
    }

    if (nextIndex >= 0 && nextIndex < INTERACTIVE_GUIDE_STEPS.length) {
      currentStepIndexRef.current = nextIndex;
      setCurrentStepIndex(nextIndex);
      // Reset step 4 baseline detection when step changes
      step4InitializedRef.current = false;
      step4InitialSongsRef.current = null;
      step4PendingModalCloseRef.current = false;
      // Allow further interactions after a brief debounce
      setTimeout(() => {
        isAdvancingRef.current = false;
      }, 250);
    }
  };

  // Helper to cleanly clean up all temporary guide state and close the overlay
  const cleanupAndCloseGuide = (action: () => void) => {
    speechAssistant.stop();
    window.dispatchEvent(new CustomEvent('close-import-playlist-modal'));

    setTargetRect(null);
    setIsTopicMenuOpen(false);
    setIsSaveCompletedState(false);
    setIsTransitioning(false);

    isAdvancingRef.current = false;
    step4InitializedRef.current = false;
    step4InitialSongsRef.current = null;
    step4PendingModalCloseRef.current = false;

    action();
  };

  const getNextButtonLabel = () => {
    if (step.id === 8 || step.id === 81 || step.id === 82) return 'Finish Guide';
    if (step.id === 207) return 'Finish Advanced Guide';
    if (isLastStepInTopic(step.id)) return 'Finish Topic';
    return 'Next Step';
  };

  const handleNext = () => {
    if (step.id === 1) {
      const idx110 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 110);
      if (idx110 !== -1) {
        goToStep(idx110);
        return;
      }
    } else if (step.id === 110) {
      const idx2 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 2);
      if (idx2 !== -1) {
        goToStep(idx2);
        return;
      }
    } else if (step.id === 2) {
      const idx3 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 3);
      if (idx3 !== -1) {
        goToStep(idx3);
        return;
      }
    } else if (step.id === 3) {
      const hasModalSubmit = Boolean(
        document.querySelector('[data-tour="load-lineup-submit-btn"]') ||
        document.querySelector('[data-tour="create-lineup-submit-btn"]') ||
        document.querySelector('[data-tour="conflict-load-existing-btn"]')
      );
      if (hasModalSubmit) {
        const idx35 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 35);
        if (idx35 !== -1) {
          goToStep(idx35);
          return;
        }
      } else {
        const idx4 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 4);
        if (idx4 !== -1) {
          goToStep(idx4);
          return;
        }
      }
    } else if (step.id === 35) {
      const idx4 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 4);
      if (idx4 !== -1) {
        goToStep(idx4);
        return;
      }
    } else if (step.id === 4) {
      const idx4a = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 41);
      if (idx4a !== -1) {
        goToStep(idx4a);
        return;
      }
    } else if (step.id === 41 || step.id === 42) {
      const idx5 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 5);
      if (idx5 !== -1) {
        goToStep(idx5);
        return;
      }
    } else if (step.id === 7) {
      const idx8 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 8);
      if (idx8 !== -1) {
        goToStep(idx8);
        return;
      }
    } else if (step.id === 8 || step.id === 81 || step.id === 82) {
      handleComplete();
      return;
    } else if (step.id === 301) {
      const idx302 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 302);
      if (idx302 !== -1) {
        goToStep(idx302);
        return;
      }
    } else if (step.id === 302) {
      const idx303 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 303);
      if (idx303 !== -1) {
        goToStep(idx303);
        return;
      }
    } else if (isLastStepInTopic(step.id)) {
      handleComplete();
      return;
    }

    const nextStepIdx = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === step.id + 1);
    if (nextStepIdx !== -1) {
      goToStep(nextStepIdx);
      return;
    }

    if (currentStepIndex < INTERACTIVE_GUIDE_STEPS.length - 1) {
      goToStep(currentStepIndex + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (isFirstStepInTopic(step.id)) {
      return;
    }

    if (step.id === 110) {
      const idx1 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 1);
      if (idx1 !== -1) {
        goToStep(idx1);
        return;
      }
    } else if (step.id === 2) {
      const idx110 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 110);
      if (idx110 !== -1) {
        goToStep(idx110);
        return;
      }
    } else if (step.id === 3) {
      const idx2 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 2);
      if (idx2 !== -1) {
        goToStep(idx2);
        return;
      }
    } else if (step.id === 35) {
      const idx3 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 3);
      if (idx3 !== -1) {
        goToStep(idx3);
        return;
      }
    } else if (step.id === 4) {
      const idx35 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 35);
      if (idx35 !== -1 && document.querySelector('[data-tour="new-lineup-modal-container"]')) {
        goToStep(idx35);
        return;
      }
      const idx3 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 3);
      if (idx3 !== -1 && document.querySelector('[data-tour="new-lineup-modal-container"]')) {
        goToStep(idx3);
        return;
      }
      const idx1 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 1);
      if (idx1 !== -1) {
        goToStep(idx1);
        return;
      }
    } else if (step.id === 41 || step.id === 42 || step.id === 5) {
      const idx4 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 4);
      if (idx4 !== -1) {
        goToStep(idx4);
        return;
      }
    } else if (step.id === 81 || step.id === 82) {
      const idx8 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 8);
      if (idx8 !== -1) {
        goToStep(idx8);
        return;
      }
    } else if (step.id === 8) {
      const idx7 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 7);
      if (idx7 !== -1) {
        goToStep(idx7);
        return;
      }
    } else if (step.id === 302) {
      const idx301 = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 301);
      if (idx301 !== -1) {
        goToStep(idx301);
        return;
      }
    }

    const prevStepIdx = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === step.id - 1);
    if (prevStepIdx !== -1) {
      goToStep(prevStepIdx);
      return;
    }

    if (currentStepIndex > 0) {
      goToStep(currentStepIndex - 1);
    }
  };

  const handleSkip = () => {
    cleanupAndCloseGuide(() => {
      StorageService.setOnboardingSkippedSession(true);
      onClose();
    });
  };

  const handleNeverShow = () => {
    cleanupAndCloseGuide(() => {
      StorageService.setOnboardingDisabled(true);
      onClose();
    });
  };

  const handleComplete = () => {
    cleanupAndCloseGuide(() => {
      StorageService.setOnboardingDisabled(true);
      const settings = StorageService.getAccessibilitySettings();
      if (settings.ttsEnabled) {
        speechAssistant.speak('Interactive guide completed.', { priority: 'guide', force: true });
      }
      onClose();
    });
  };

  const totalSteps = INTERACTIVE_GUIDE_STEPS.length;
  const isFirstStep = isFirstStepInTopic(step.id);
  const isLastStep = isLastStepInTopic(step.id);

  const getStepBadgeText = () => {
    if (step.id === 110) return 'Step 1B of 8';
    if (step.id === 35) return 'Step 3B of 8';
    if (step.id === 41) return 'Step 4A of 8';
    if (step.id === 42) return 'Step 4B of 8';
    if (step.id === 81) return 'Step 8A • Export PDF';
    if (step.id === 82) return 'Step 8B • Export PNG';
    if (step.id === 8) return 'Step 8 of 8';
    if (step.id <= 8) return `Step ${step.id} of 8`;
    if (step.id >= 200 && step.id <= 207) return `Advanced Guide • Step ${step.id - 199} of 8`;
    if (step.id >= 300 && step.id <= 303) return `Advanced Guide • Step ${step.id - 299} of 4`;
    if (step.id >= 310 && step.id <= 313) return `Advanced Guide • Step ${step.id - 309} of 4`;
    if (step.id >= 320 && step.id <= 323) return `Advanced Guide • Step ${step.id - 319} of 4`;
    if (step.id >= 330 && step.id <= 334) return `Advanced Guide • Step ${step.id - 329} of 5`;
    if (step.id >= 340 && step.id <= 343) return `Advanced Guide • Step ${step.id - 339} of 4`;
    if (step.id >= 350 && step.id <= 353) return `Advanced Guide • Step ${step.id - 349} of 4`;
    if (step.id >= 360 && step.id <= 362) return `Advanced Guide • Step ${step.id - 359} of 3`;
    if (step.id >= 370 && step.id <= 373) return `Advanced Guide • Step ${step.id - 369} of 4`;
    if (step.id >= 380 && step.id <= 382) return `Advanced Guide • Step ${step.id - 379} of 3`;
    if (step.id >= 390 && step.id <= 392) return `Advanced Guide • Step ${step.id - 389} of 3`;
    return 'Help Topic';
  };

  const getProgressPercent = () => {
    if (step.id === 1) return (1 / 8) * 100;
    if (step.id === 110) return (1.5 / 8) * 100;
    if (step.id === 2) return (2 / 8) * 100;
    if (step.id === 3) return (3 / 8) * 100;
    if (step.id === 35) return (3.5 / 8) * 100;
    if (step.id === 4 || step.id === 41 || step.id === 42) return (4 / 8) * 100;
    if (step.id === 5) return (5 / 8) * 100;
    if (step.id === 6) return (6 / 8) * 100;
    if (step.id === 7) return (7 / 8) * 100;
    if (step.id === 8 || step.id === 81 || step.id === 82) return 100;
    if (step.id >= 200 && step.id <= 207) return ((step.id - 199) / 8) * 100;
    if (step.id >= 300 && step.id <= 303) return ((step.id - 299) / 4) * 100;
    if (step.id >= 310 && step.id <= 313) return ((step.id - 309) / 4) * 100;
    if (step.id >= 320 && step.id <= 323) return ((step.id - 319) / 4) * 100;
    if (step.id >= 330 && step.id <= 334) return ((step.id - 329) / 5) * 100;
    if (step.id >= 340 && step.id <= 343) return ((step.id - 339) / 4) * 100;
    if (step.id >= 350 && step.id <= 353) return ((step.id - 349) / 4) * 100;
    if (step.id >= 360 && step.id <= 362) return ((step.id - 359) / 3) * 100;
    if (step.id >= 370 && step.id <= 373) return ((step.id - 369) / 4) * 100;
    if (step.id >= 380 && step.id <= 382) return ((step.id - 379) / 3) * 100;
    if (step.id >= 390 && step.id <= 392) return ((step.id - 389) / 3) * 100;
    return 100;
  };

  // Detect real-time modal state for Step 4B & general modal detection
  const modalEl = typeof document !== 'undefined' ? document.querySelector('[data-tour="import-modal-container"]') : null;
  const isImportModalOpen = Boolean(
    typeof document !== 'undefined' &&
    (document.querySelector('[data-tour="playlist-url-input"]') || modalEl)
  );

  const isImportModalLoading = Boolean(
    typeof document !== 'undefined' &&
    (modalEl?.textContent?.includes('Importing...') || modalEl?.querySelector('.animate-spin'))
  );

  const isImportModalPreviewTab = Boolean(
    typeof document !== 'undefined' &&
    document.querySelector('[data-tour="import-submit-btn"]')
  );

  const isImportModalDoneTab = Boolean(
    typeof document !== 'undefined' &&
    document.querySelector('[data-tour="import-done-btn"]')
  );

  let effectiveStepTitle = step.stepTitle;
  let effectiveActionPrompt = step.actionPrompt;
  let effectiveDescription = step.description;

  if (step.id === 42) {
    if (isImportModalOpen) {
      effectiveStepTitle = 'Step 4B: Import Your Playlist';
      if (isImportModalLoading) {
        effectiveActionPrompt = 'Importing playlist... Please wait.';
        effectiveDescription = 'Fetching playlist songs and populating your worship lineup.';
      } else if (isImportModalDoneTab) {
        effectiveActionPrompt = 'Your songs were imported. Click "Done & Edit Line-up" to continue.';
        effectiveDescription = 'Review your import summary and click Done & Edit Line-up to open the lineup editor.';
      } else if (isImportModalPreviewTab) {
        effectiveActionPrompt = 'Review your songs, then click "Import Selected Songs".';
        effectiveDescription = 'Select or deselect songs as needed, then click the Import button to populate your line-up.';
      } else {
        effectiveActionPrompt = 'Paste your YouTube or YouTube Music playlist link, then click Import.';
        effectiveDescription = 'Paste your playlist link into the field and click Import Playlist to fetch worship songs.';
      }
    } else {
      effectiveStepTitle = 'Step 4B: Import Song / Playlist';
      effectiveActionPrompt = 'Click "Import Song / Playlist" to open the importer.';
      effectiveDescription = 'Click the highlighted button on the page to open the smart song or playlist importer modal.';
    }
  }

  // TTS Narration for Interactive Guide Steps
  useEffect(() => {
    if (!isOpen || !step || isTransitioning || isSaveCompletedState) return;

    const settings = StorageService.getAccessibilitySettings();
    if (!settings.ttsEnabled) return;

    const timer = setTimeout(() => {
      const selector = resolveTargetSelector(step);
      const targetEl = selector ? (document.querySelector(selector) as HTMLElement | null) : null;
      let targetDesc = '';
      if (targetEl) {
        targetDesc = speechAssistant.getSpeechDescription(targetEl) || '';
      }

      const narration = [
        effectiveStepTitle,
        effectiveDescription,
        effectiveActionPrompt,
        targetDesc ? `The highlighted control is ${targetDesc}` : ''
      ].filter(Boolean).join('. ') + '.';

      speechAssistant.speak(narration, { priority: 'guide', force: true });
    }, 150);

    return () => clearTimeout(timer);
  }, [
    isOpen,
    currentStepIndex,
    step?.id,
    isTransitioning,
    isSaveCompletedState,
    effectiveStepTitle,
    effectiveDescription,
    effectiveActionPrompt
  ]);

  // TTS Announcement when lineup is saved successfully
  useEffect(() => {
    if (isSaveCompletedState && isOpen) {
      const settings = StorageService.getAccessibilitySettings();
      if (settings.ttsEnabled) {
        speechAssistant.speak(
          "You're all set! Your lineup creation is complete. Click Finish Guide to conclude.",
          { priority: 'guide', force: true }
        );
      }
    }
  }, [isSaveCompletedState, isOpen]);

  // Safe early exit after all hooks have been invoked, adhering strictly to React Rules of Hooks
  if (!isOpen) return null;

  // Calculate Popover Position to dynamically prevent clipping and overlapping target/modal
  const getPopoverStyle = (): React.CSSProperties => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const popoverWidth = popoverRef.current?.offsetWidth || 380;
    const popoverHeight = popoverRef.current?.offsetHeight || 280;

    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const headerHeight = 70;
    const sidebarWidth = vw >= 1024 ? 256 : 0;

    const baseStyle: React.CSSProperties = {
      position: 'fixed',
      transition: 'top 0.2s ease-out, left 0.2s ease-out, bottom 0.2s ease-out, right 0.2s ease-out, opacity 0.2s ease-out',
      opacity: isTransitioning ? 0 : 1
    };

    if (isMobile) {
      if (targetRect) {
        const targetCenterY = targetRect.top + targetRect.height / 2;
        if (targetCenterY > vh / 2) {
          return {
            ...baseStyle,
            top: `${headerHeight + 12}px`,
            left: '12px',
            right: '12px',
            maxHeight: `${Math.min(320, vh - headerHeight - 24)}px`
          };
        }
      }
      return {
        ...baseStyle,
        bottom: '12px',
        left: '12px',
        right: '12px',
        maxHeight: `${Math.min(320, vh - 24)}px`
      };
    }

    const isTransferModalOpen = Boolean(typeof document !== 'undefined' && document.querySelector('[data-tour="transfer-modal-container"]'));
    const isBackupModalOpen = Boolean(typeof document !== 'undefined' && document.querySelector('[data-tour="backup-modal-container"]'));
    const isSettingsModalOpen = Boolean(typeof document !== 'undefined' && document.querySelector('[data-tour="settings-modal-container"]'));

    if (isImportModalOpen || modalEl || isTransferModalOpen || isBackupModalOpen || isSettingsModalOpen || (step && step.id >= 200 && step.id <= 207)) {
      return {
        ...baseStyle,
        bottom: '24px',
        right: '24px',
        width: '380px'
      };
    }

    if (!targetRect) {
      return {
        ...baseStyle,
        bottom: '24px',
        right: '24px',
        width: '380px'
      };
    }

    const T = {
      left: targetRect.left - 8,
      top: targetRect.top - 8,
      right: targetRect.right + 8,
      bottom: targetRect.bottom + 8,
      width: targetRect.width + 16,
      height: targetRect.height + 16
    };

    const PW = Math.min(popoverWidth, vw - sidebarWidth - 32);
    const PH = popoverHeight;

    const overlaps = (pLeft: number, pTop: number, pW: number, pH: number) => {
      const pRight = pLeft + pW;
      const pBottom = pTop + pH;
      const margin = 8;
      return !(
        pRight + margin <= T.left ||
        pLeft >= T.right + margin ||
        pBottom + margin <= T.top ||
        pTop >= T.bottom + margin
      );
    };

    // Candidate 1: Below Target
    {
      const pTop = T.bottom + 16;
      let pLeft = T.left;
      if (pLeft + PW > vw - 16) pLeft = vw - PW - 16;
      if (pLeft < sidebarWidth + 16) pLeft = sidebarWidth + 16;

      if (pTop + PH <= vh - 16 && !overlaps(pLeft, pTop, PW, PH)) {
        return { ...baseStyle, top: `${pTop}px`, left: `${pLeft}px`, width: `${PW}px` };
      }
    }

    // Candidate 2: Above Target
    {
      const pTop = T.top - PH - 16;
      let pLeft = T.left;
      if (pLeft + PW > vw - 16) pLeft = vw - PW - 16;
      if (pLeft < sidebarWidth + 16) pLeft = sidebarWidth + 16;

      if (pTop >= headerHeight + 16 && !overlaps(pLeft, pTop, PW, PH)) {
        return { ...baseStyle, top: `${pTop}px`, left: `${pLeft}px`, width: `${PW}px` };
      }
    }

    // Candidate 3: Right of Target
    {
      const pLeft = T.right + 16;
      let pTop = T.top;
      if (pTop + PH > vh - 16) pTop = vh - PH - 16;
      if (pTop < headerHeight + 16) pTop = headerHeight + 16;

      if (pLeft + PW <= vw - 16 && !overlaps(pLeft, pTop, PW, PH)) {
        return { ...baseStyle, top: `${pTop}px`, left: `${pLeft}px`, width: `${PW}px` };
      }
    }

    // Candidate 4: Left of Target
    {
      const pLeft = T.left - PW - 16;
      let pTop = T.top;
      if (pTop + PH > vh - 16) pTop = vh - PH - 16;
      if (pTop < headerHeight + 16) pTop = headerHeight + 16;

      if (pLeft >= sidebarWidth + 16 && !overlaps(pLeft, pTop, PW, PH)) {
        return { ...baseStyle, top: `${pTop}px`, left: `${pLeft}px`, width: `${PW}px` };
      }
    }

    // Candidate 5: Corners
    const corners = [
      { pLeft: vw - PW - 16, pTop: vh - PH - 16 },
      { pLeft: sidebarWidth + 16, pTop: vh - PH - 16 },
      { pLeft: vw - PW - 16, pTop: headerHeight + 16 },
      { pLeft: sidebarWidth + 16, pTop: headerHeight + 16 }
    ];

    for (const corner of corners) {
      if (!overlaps(corner.pLeft, corner.pTop, PW, PH)) {
        return { ...baseStyle, top: `${corner.pTop}px`, left: `${corner.pLeft}px`, width: `${PW}px` };
      }
    }

    const pLeft = Math.max(sidebarWidth + 16, vw - PW - 16);
    const pTop = Math.max(headerHeight + 16, vh - PH - 16);

    return {
      ...baseStyle,
      top: `${pTop}px`,
      left: `${pLeft}px`,
      width: `${PW}px`
    };
  };

  const popoverStyle = getPopoverStyle();

  const overlayContent = (
    <div
      style={{ zIndex }}
      data-overlay-id="interactive-tour-overlay"
      data-overlay-topmost={isTopmost}
      className="fixed inset-0 overflow-hidden pointer-events-none select-none animate-in fade-in duration-200"
    >
      
      {/* Focus Mode Overlay: Background Blur & Semi-Transparent Dark Overlay around target */}
      {targetRect ? (() => {
        const pad = 6;
        const tTop = Math.max(0, targetRect.top - pad);
        const tLeft = Math.max(0, targetRect.left - pad);
        const tRight = Math.min(window.innerWidth, targetRect.left + targetRect.width + pad);
        const tBottom = Math.min(window.innerHeight, targetRect.top + targetRect.height + pad);

        return (
          <>
            {/* Top Backdrop Blur Region */}
            <div
              className="fixed pointer-events-none backdrop-blur-md bg-slate-950/45 dark:bg-slate-950/65 transition-all duration-150"
              style={{ top: 0, left: 0, right: 0, height: `${tTop}px`, zIndex: zIndex + GuideSublayer.BACKDROP }}
            />
            {/* Bottom Backdrop Blur Region */}
            <div
              className="fixed pointer-events-none backdrop-blur-md bg-slate-950/45 dark:bg-slate-950/65 transition-all duration-150"
              style={{ top: `${tBottom}px`, left: 0, right: 0, bottom: 0, zIndex: zIndex + GuideSublayer.BACKDROP }}
            />
            {/* Left Backdrop Blur Region */}
            <div
              className="fixed pointer-events-none backdrop-blur-md bg-slate-950/45 dark:bg-slate-950/65 transition-all duration-150"
              style={{
                top: `${tTop}px`,
                left: 0,
                width: `${tLeft}px`,
                height: `${Math.max(0, tBottom - tTop)}px`,
                zIndex: zIndex + GuideSublayer.BACKDROP
              }}
            />
            {/* Right Backdrop Blur Region */}
            <div
              className="fixed pointer-events-none backdrop-blur-md bg-slate-950/45 dark:bg-slate-950/65 transition-all duration-150"
              style={{
                top: `${tTop}px`,
                left: `${tRight}px`,
                right: 0,
                height: `${Math.max(0, tBottom - tTop)}px`,
                zIndex: zIndex + GuideSublayer.BACKDROP
              }}
            />
            {/* Sharp Accent Highlight Ring around cutout target */}
            <div
              className="fixed pointer-events-none rounded-xl border-2 border-indigo-500/90 dark:border-indigo-400/90 shadow-[0_0_20px_rgba(99,102,241,0.5)] animate-pulse transition-all duration-150"
              style={{
                top: `${tTop}px`,
                left: `${tLeft}px`,
                width: `${Math.max(0, tRight - tLeft)}px`,
                height: `${Math.max(0, tBottom - tTop)}px`,
                zIndex: zIndex + GuideSublayer.SPOTLIGHT
              }}
            />
          </>
        );
      })() : (
        <div
          className="fixed inset-0 pointer-events-none backdrop-blur-md bg-slate-950/45 dark:bg-slate-950/65 transition-all duration-150"
          style={{ zIndex: zIndex + GuideSublayer.BACKDROP }}
        />
      )}

      {/* Popover Guide Tooltip Card */}
      <div
        ref={popoverRef}
        style={{ ...popoverStyle, zIndex: zIndex + GuideSublayer.POPOVER }}
        className="pointer-events-auto w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col transform transition-all duration-300 animate-in zoom-in-95"
      >
        {/* Card Header & Progress */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                {getStepBadgeText()}
              </span>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
                {step.sectionTitle}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsTopicMenuOpen(!isTopicMenuOpen)}
                aria-label="Guide Topics, opens the directory of available help topics"
                data-speech-label="Guide Topics, opens the directory of available help topics"
                className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors cursor-pointer text-xs font-bold flex items-center gap-1"
                title="Jump to Topic"
              >
                <Compass className="w-4 h-4" />
                <span className="hidden sm:inline">Topics</span>
              </button>

              <button
                onClick={handleSkip}
                aria-label="Exit Guide, closes the interactive guide"
                data-speech-label="Exit Guide, closes the interactive guide"
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
                title="Exit Guide"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
              style={{ width: `${getProgressPercent()}%` }}
            />
          </div>
        </div>

        {/* Topic Selector Dropdown Overlay */}
        {isTopicMenuOpen && (
          <div className="p-3 bg-slate-900 text-white max-h-64 overflow-y-auto space-y-1 text-xs border-b border-slate-800 animate-in slide-in-from-top-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 pb-1">
              Select Guide / Help Topic
            </p>
            {[
              { label: 'Create a Line-up (Basic Guide)', id: 1 },
              { label: 'PC → Phone QR Data Transfer', id: 200 },
              { label: 'Exporting Lineups (PDF & PNG)', id: 300 },
              { label: 'Song Database & Catalog', id: 310 },
              { label: 'Import Song / Playlist', id: 320 },
              { label: 'Volunteer Roster & Member Editor', id: 330 },
              { label: 'Worship Team Member Assignment', id: 340 },
              { label: 'Scheduling & Service Types', id: 350 },
              { label: 'Song Repetition Guard & Variety', id: 360 },
              { label: 'Saved Line-ups Archive & History', id: 370 },
              { label: 'Backup & Restore Data', id: 380 },
              { label: 'Application Settings & Themes', id: 390 }
            ].map((topic) => (
              <button
                key={topic.id}
                onClick={() => {
                  const targetIdx = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === topic.id);
                  if (targetIdx !== -1) {
                    setIsTopicMenuOpen(false);
                    goToStep(targetIdx);
                  }
                }}
                className={`w-full text-left px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center justify-between ${
                  step.id === topic.id
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>{topic.label}</span>
                <ArrowRight className="w-3.5 h-3.5 opacity-60" />
              </button>
            ))}
          </div>
        )}

        {/* Card Body */}
        <div className="p-5 space-y-3.5 overflow-y-auto max-h-[50vh] sm:max-h-[380px]">
          {isSaveCompletedState ? (
            <div className="p-4 space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  You're all set!
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Your lineup creation is complete.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsSaveCompletedState(false);
                  handleComplete();
                }}
                aria-label="Finish Guide, completes this guide"
                data-speech-label="Finish Guide, completes this guide"
                className="w-full py-2.5 px-4 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                Finish Guide
              </button>
            </div>
          ) : step.id === 8 ? (
            <div className="space-y-3.5">
              <div>
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-xs mb-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Line-up Saved Successfully</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Export Your Line-up
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Choose Export as PDF for a printable document or Export as PNG for a high-resolution image.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const step81Index = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 81);
                    if (step81Index !== -1) {
                      goToStep(step81Index);
                    }
                  }}
                  className="p-3 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 border border-indigo-200 dark:border-indigo-800 rounded-xl text-left transition-all cursor-pointer group flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-xs group-hover:scale-105 transition-transform">
                      <FileDown className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-indigo-950 dark:text-indigo-100 flex items-center gap-1.5">
                        <span>Export PDF</span>
                        <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                        Generate formatted PDF document for printing.
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const step82Index = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 82);
                    if (step82Index !== -1) {
                      goToStep(step82Index);
                    }
                  }}
                  className="p-3 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-left transition-all cursor-pointer group flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-xs group-hover:scale-105 transition-transform">
                      <Image className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <span>Export PNG</span>
                        <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                        Generate high-resolution image for mobile sharing.
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleComplete();
                  }}
                  className="w-full py-2.5 px-3 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 rounded-xl transition-colors cursor-pointer text-center mt-0.5"
                >
                  Skip Export
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Step Title */}
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>{effectiveStepTitle}</span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  {effectiveDescription}
                </p>
              </div>

              {/* Action Prompt Banner */}
              <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200 flex items-center gap-2.5">
                <MousePointer className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 animate-bounce" />
                <span className="font-semibold">{effectiveActionPrompt}</span>
              </div>

              {/* Step 4 Decision Options */}
              {step.id === 4 && (
                <div className="grid grid-cols-1 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const step4aIndex = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 41);
                      if (step4aIndex !== -1) {
                        goToStep(step4aIndex);
                      }
                    }}
                    className="p-3 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 border border-indigo-200 dark:border-indigo-800 rounded-xl text-left transition-all cursor-pointer group flex items-start gap-3"
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-xs group-hover:scale-105 transition-transform">
                      A
                    </div>
                    <div>
                      <div className="text-xs font-bold text-indigo-950 dark:text-indigo-100 flex items-center gap-1.5">
                        <span>Create Blank Line-up</span>
                        <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                        Add songs manually from the song database or enter title & key.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const step4bIndex = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 42);
                      if (step4bIndex !== -1) {
                        goToStep(step4bIndex);
                      }
                    }}
                    className="p-3 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-left transition-all cursor-pointer group flex items-start gap-3"
                  >
                    <div className="w-8 h-8 rounded-lg bg-red-600 text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-xs group-hover:scale-105 transition-transform">
                      B
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <span>Import Song / Playlist</span>
                        <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-red-600 dark:text-red-400" />
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                        Paste a YouTube or YouTube Music song or playlist URL to import songs.
                      </div>
                    </div>
                  </button>
                </div>
              )}

              {/* Change Method link on Step 4A / 4B */}
              {(step.id === 41 || step.id === 42) && (
                <div className="pt-1 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      const step4Index = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 4);
                      if (step4Index !== -1) {
                        goToStep(step4Index);
                      }
                    }}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Change creation method (Back to Choice)</span>
                  </button>
                </div>
              )}

              {/* Change Export Format link on Step 81 / 82 */}
              {(step.id === 81 || step.id === 82) && (
                <div className="pt-1 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      const step8Index = INTERACTIVE_GUIDE_STEPS.findIndex((s) => s.id === 8);
                      if (step8Index !== -1) {
                        goToStep(step8Index);
                      }
                    }}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Change export format (Back to Choice)</span>
                  </button>
                </div>
              )}

              {/* Bullets */}
              {step.bullets && step.bullets.length > 0 && (
                <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 font-medium pt-1">
                  {step.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-indigo-500 dark:text-indigo-400 font-bold">•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Production Rule Note */}
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-[11px] text-slate-500 dark:text-slate-400 italic">
                💡 {step.rule}
              </div>
            </>
          )}
        </div>

        {/* Card Footer Navigation */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              disabled={isFirstStep}
              aria-label="Previous Step, returns to previous guide step"
              data-speech-label="Previous Step, returns to previous guide step"
              className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer flex items-center gap-1 ${
                isFirstStep
                  ? 'opacity-40 cursor-not-allowed text-slate-400 border-slate-200'
                  : 'text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <button
              onClick={handleNeverShow}
              aria-label="Never Show Again, prevents the guide from automatically opening on launch"
              data-speech-label="Never Show Again, prevents the guide from automatically opening on launch"
              className="text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer hidden sm:inline"
              title="Don't auto-open guide on launch"
            >
              Never show
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSkip}
              aria-label="Exit Guide, closes the interactive guide"
              data-speech-label="Exit Guide, closes the interactive guide"
              className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              Exit Guide
            </button>

            {!isSaveCompletedState && (
              <button
                type="button"
                onClick={handleNext}
                aria-label={getNextButtonLabel() === 'Finish Guide' ? 'Finish Guide, completes this guide' : 'Next Step, advances to next guide step'}
                data-speech-label={getNextButtonLabel() === 'Finish Guide' ? 'Finish Guide, completes this guide' : 'Next Step, advances to next guide step'}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>{getNextButtonLabel()}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(overlayContent, document.body);
};
