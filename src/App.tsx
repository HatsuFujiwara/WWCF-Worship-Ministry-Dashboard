import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ActiveTab,
  Member,
  Schedule,
  ToastMessage,
  Song,
  SongFamily,
  AccessibilitySettings,
  AppLayoutPreferences,
  NavigationOrientation,
  SidebarPosition,
  SidebarVisibility
} from './types';
import { StorageService } from './services/storage';
import { SongService } from './services/songService';
import { SongFamilyService } from './services/songFamilyService';
import { LineupHistoryService } from './services/lineupHistoryService';
import { GoogleAuthService, RemoteConflictPayload } from './services/googleAuthService';
import { Sidebar, getMainContentOffsetClass } from './components/Sidebar';
import { Header } from './components/Header';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { DashboardView } from './components/DashboardView';
import { ToastContainer } from './components/ToastContainer';
import { Modal } from './components/Modal';
import { TextToSpeechNavigator } from './components/TextToSpeechNavigator';
import { ErrorBoundary } from './components/ErrorBoundary';

// Lazy-loaded Views for code splitting
const SchedulerView = React.lazy(() => import('./components/SchedulerView').then((m) => ({ default: m.SchedulerView })));
const SongsView = React.lazy(() => import('./components/SongsView').then((m) => ({ default: m.SongsView })));
const SchedulesView = React.lazy(() => import('./components/SchedulesView').then((m) => ({ default: m.SchedulesView })));
const MemberEditorView = React.lazy(() => import('./components/MemberEditorView').then((m) => ({ default: m.MemberEditorView })));
const SongAnalyticsView = React.lazy(() => import('./components/SongAnalyticsView').then((m) => ({ default: m.SongAnalyticsView })));

// Lazy-loaded Modals
const BackupRestoreModal = React.lazy(() => import('./components/BackupRestoreModal').then((m) => ({ default: m.BackupRestoreModal })));
const SettingsModal = React.lazy(() => import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal })));
const HelpMenuModal = React.lazy(() => import('./components/HelpMenuModal').then((m) => ({ default: m.HelpMenuModal })));
const InteractiveTourOverlay = React.lazy(() => import('./components/InteractiveTourOverlay').then((m) => ({ default: m.InteractiveTourOverlay })));
const WelcomeGuideModal = React.lazy(() => import('./components/WelcomeGuideModal').then((m) => ({ default: m.WelcomeGuideModal })));
const AccessibilityOnboardingModal = React.lazy(() => import('./components/AccessibilityOnboardingModal').then((m) => ({ default: m.AccessibilityOnboardingModal })));
const GoogleConnectOfferModal = React.lazy(() => import('./components/GoogleConnectOfferModal').then((m) => ({ default: m.GoogleConnectOfferModal })));
const DriveConflictModal = React.lazy(() => import('./components/DriveConflictModal').then((m) => ({ default: m.DriveConflictModal })));
const TransferDataModal = React.lazy(() => import('./components/TransferDataModal').then((m) => ({ default: m.TransferDataModal })));
const DeleteAllDataModal = React.lazy(() => import('./components/DeleteAllDataModal').then((m) => ({ default: m.DeleteAllDataModal })));
const NewLineupModal = React.lazy(() => import('./components/NewLineupModal').then((m) => ({ default: m.NewLineupModal })));
import { sortTags } from './utils/tagUtils';
import { getManilaNowISO, getManilaTodayString } from './utils/dateUtils';
import { getNextAvailableServiceDate, getSmartInitialServiceDetails, ensureMonthlyPlaceholders, isScheduleEmpty, applyBulkNoServiceConversion } from './utils/scheduleUtils';
import { validateUniqueMemberRoles } from './utils/memberUtils';
import { soundEffects } from './utils/audioFeedback';
import { speechAssistant } from './utils/speechAssistant';

export default function App() {
  // Navigation & UI state
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => StorageService.getDarkMode());
  const [isAmoledEnabled, setIsAmoledEnabled] = useState<boolean>(() => StorageService.getAmoledEnabled());
  const [isGlassModeEnabled, setIsGlassModeEnabled] = useState<boolean>(() => StorageService.getGlassMode());
  const [accessibilitySettings, setAccessibilitySettings] = useState<AccessibilitySettings>(() =>
    StorageService.getAccessibilitySettings()
  );

  const handleSetGlassModeEnabled = useCallback(
    (enabled: boolean) => {
      if (Boolean(accessibilitySettings.performanceMode)) {
        return;
      }
      setIsGlassModeEnabled(Boolean(enabled));
    },
    [accessibilitySettings.performanceMode]
  );

  // Layout Preferences State
  const [layoutPreferences, setLayoutPreferences] = useState<AppLayoutPreferences>(() =>
    StorageService.getLayoutPreferences()
  );

  useEffect(() => {
    const handleLayoutChange = (e: CustomEvent<AppLayoutPreferences>) => {
      if (e.detail) {
        setLayoutPreferences(e.detail);
      } else {
        setLayoutPreferences(StorageService.getLayoutPreferences());
      }
    };

    window.addEventListener('wwcf:layout-changed', handleLayoutChange as EventListener);
    return () => {
      window.removeEventListener('wwcf:layout-changed', handleLayoutChange as EventListener);
    };
  }, []);

  const handleToggleSidebarCollapse = () => {
    const nextVisibility: SidebarVisibility =
      layoutPreferences.sidebarVisibility === 'collapsed' ? 'expanded' : 'collapsed';
    const updated = StorageService.saveLayoutPreferences({
      sidebarVisibility: nextVisibility
    });
    setLayoutPreferences(updated);
  };

  const handleToggleSidebarVisibility = () => {
    const nextVisibility: SidebarVisibility =
      layoutPreferences.sidebarVisibility === 'hidden' ? 'expanded' : 'hidden';
    const updated = StorageService.saveLayoutPreferences({
      sidebarVisibility: nextVisibility
    });
    setLayoutPreferences(updated);
  };

  // Data State
  const startupStorageWarningRef = useRef<string | null>(null);
  const lastWarningShownRef = useRef<{ text: string; time: number } | null>(null);
  const [members, setMembers] = useState<Member[]>(() => StorageService.getMembers());
  const [labels, setLabels] = useState<string[]>(() => StorageService.getLabels());
  const [schedules, setSchedules] = useState<Schedule[]>(() => {
    const loaded = StorageService.getSchedules();
    const currentYM = getManilaTodayString().substring(0, 7);
    const withPlaceholders = ensureMonthlyPlaceholders(currentYM, loaded);
    if (withPlaceholders.length !== loaded.length) {
      try {
        StorageService.saveSchedulesChecked(withPlaceholders);
      } catch (e) {
        console.error('[App] Failed to persist initial monthly placeholders:', e);
        startupStorageWarningRef.current =
          'Could not persist monthly schedule placeholders because browser storage is unavailable or full.';
      }
    }
    return withPlaceholders;
  });
  const [songs, setSongs] = useState<Song[]>([]);
  const [songFamilies, setSongFamilies] = useState<SongFamily[]>([]);

  // Refresh songs & song families from services
  const loadSongs = async () => {
    try {
      const fetched = await SongService.getSongs();
      setSongs(fetched);
      const fams = await SongFamilyService.getSongFamilies();
      setSongFamilies(fams || []);
    } catch (e) {
      console.error('Failed to load songs or families:', e);
    }
  };

  useEffect(() => {
    // Return transient filters / view controls to their default presets upon full browser refresh
    StorageService.resetTransientFilterPresets();
    loadSongs();
  }, []);

  // Safe refresh / reload guard: warn user if unsaved schedule drafts or changes exist
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (StorageService.hasUnsavedDraftSchedule()) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Listen for storage and domain updated events from anywhere in the app
  useEffect(() => {
    const handleSongsUpdated = () => {
      loadSongs();
    };
    const handleSchedulesUpdated = () => {
      setSchedules(StorageService.getSchedules());
    };
    const handleMembersUpdated = () => {
      setMembers(StorageService.getMembers());
    };
    const handleLabelsUpdated = () => {
      setLabels(StorageService.getLabels());
    };
    const handleFamiliesUpdated = () => {
      SongFamilyService.getSongFamilies().then((fams) => setSongFamilies(fams || []));
    };

    window.addEventListener('wwcf:songs-updated', handleSongsUpdated);
    window.addEventListener('wwcf:schedules-updated', handleSchedulesUpdated);
    window.addEventListener('wwcf:members-updated', handleMembersUpdated);
    window.addEventListener('wwcf:labels-updated', handleLabelsUpdated);
    window.addEventListener('wwcf:families-updated', handleFamiliesUpdated);

    return () => {
      window.removeEventListener('wwcf:songs-updated', handleSongsUpdated);
      window.removeEventListener('wwcf:schedules-updated', handleSchedulesUpdated);
      window.removeEventListener('wwcf:members-updated', handleMembersUpdated);
      window.removeEventListener('wwcf:labels-updated', handleLabelsUpdated);
      window.removeEventListener('wwcf:families-updated', handleFamiliesUpdated);
    };
  }, []);

  // Subscribe to LineupHistoryService to keep undo/redo reactive
  const [, setHistoryVersion] = useState(0);
  useEffect(() => {
    const unsubscribe = LineupHistoryService.subscribe(() => {
      setHistoryVersion((v) => v + 1);
    });
    return unsubscribe;
  }, []);

  // Sync song usage statistics whenever schedules are updated
  useEffect(() => {
    SongService.syncSongUsageFromSchedules(schedules).then((hasChanges) => {
      if (hasChanges) {
        loadSongs();
      }
    });
  }, [schedules]);

  // Editing state
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  // Auto-save draft status
  const [isDraftSaved, setIsDraftSaved] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Modal State
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isDanger?: boolean;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Backup & Restore Modal state
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  // Transfer Data Modal state
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [initialTransferParams, setInitialTransferParams] = useState<{ sessionId: string; token: string } | null>(null);

  // Auto-detect transfer session from URL parameters (supports URL fragment hash and search parameters)
  useEffect(() => {
    try {
      let sid: string | null = null;
      let tok: string | null = null;

      if (window.location.hash) {
        const hashStr = window.location.hash.substring(1);
        const hashParams = new URLSearchParams(hashStr);
        sid = hashParams.get('transferSessionId') || hashParams.get('sessionId');
        tok = hashParams.get('token');
      }

      if (!sid || !tok) {
        const urlParams = new URLSearchParams(window.location.search);
        sid = urlParams.get('transferSessionId') || urlParams.get('sessionId');
        tok = urlParams.get('token');
      }

      if (sid && tok) {
        setInitialTransferParams({ sessionId: sid, token: tok });
        setIsTransferModalOpen(true);
        // Clean URL search and hash string without reloading
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch (e) {
      console.error('Error parsing transfer URL params:', e);
    }
  }, []);

  // New Lineup Flow Modal state
  const [isNewLineupModalOpen, setIsNewLineupModalOpen] = useState(false);

  // Settings, Welcome, Accessibility & Onboarding Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDeleteAllDataOpen, setIsDeleteAllDataOpen] = useState(false);
  const [isAccessibilityWelcomeOpen, setIsAccessibilityWelcomeOpen] = useState(false);
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
  const [guideInitialStep, setGuideInitialStep] = useState(1);

  // Google Account & Cloud Save Modals
  const [isGoogleOfferOpen, setIsGoogleOfferOpen] = useState(false);
  const [driveConflict, setDriveConflict] = useState<RemoteConflictPayload | null>(null);

  useEffect(() => {
    const unsubConflict = GoogleAuthService.onConflict((conflict) => {
      setDriveConflict(conflict);
    });
    const unsubCandidates = GoogleAuthService.onMultipleCandidates(async (candidates) => {
      if (!candidates || candidates.length === 0) return;
      const primary = candidates[0];
      const token = GoogleAuthService.getAccessToken();
      let remoteContent: any = null;
      if (token) {
        try {
          remoteContent = await GoogleAuthService.readDriveBackupContent(token, primary.id);
        } catch (e) {
          console.warn('Failed to pre-read candidate backup:', e);
        }
      }
      setDriveConflict({
        fileId: primary.id,
        remoteModifiedTime: primary.modifiedTime,
        candidateFiles: candidates,
        remoteData: remoteContent || {
          app: 'WWCF Worship Song Line-up Scheduler',
          version: '1.0',
          data: {}
        }
      });
    });

    const handleDataChanged = () => {
      GoogleAuthService.triggerDebouncedAutoSync();
    };
    window.addEventListener('wwcf:data-changed', handleDataChanged);

    return () => {
      unsubConflict();
      unsubCandidates();
      window.removeEventListener('wwcf:data-changed', handleDataChanged);
    };
  }, []);

  const checkAndShowGoogleOffer = useCallback(() => {
    try {
      // Do not prompt connect offer if app owner hasn't configured a Google Client ID
      if (!GoogleAuthService.getClientId()) {
        return;
      }
      const seen = localStorage.getItem('wwcf_google_offer_seen_v1');
      if (!seen && !GoogleAuthService.isConnected()) {
        setIsGoogleOfferOpen(true);
      }
    } catch {}
  }, []);

  // Trigger debounced cloud auto-sync when persisted local records change (NOT on transient editingSchedule state)
  // Strictly checks whether user opted into automatic cloud backup
  useEffect(() => {
    if (StorageService.getAutoCloudSync()) {
      GoogleAuthService.triggerDebouncedAutoSync();
    }
  }, [schedules, members, songs, labels, songFamilies]);

  useEffect(() => {
    const mode = StorageService.getGuideMode();
    const skippedSession = StorageService.getOnboardingSkippedSession();

    if (skippedSession || mode === 'never') {
      return;
    }

    const hasAccessibilityOnboarded = StorageService.hasAccessibilityOnboarded();
    const hasVisited = StorageService.hasVisitedBefore();

    // STEP 1: For a completely new user visiting the website for the first time:
    // Show Accessibility preferences BEFORE the Interactive Guide.
    if (!hasAccessibilityOnboarded && !hasVisited) {
      setIsAccessibilityWelcomeOpen(true);
      return;
    }

    // Returning user or user who completed accessibility:
    if (mode === 'every_time') {
      setIsWelcomeModalOpen(true);
    } else if (mode === 'first_visit' && !hasVisited) {
      setIsWelcomeModalOpen(true);
    }
  }, []);

  const handleAccessibilityOnboardingComplete = () => {
    setIsAccessibilityWelcomeOpen(false);
    // STEP 2: After accessibility preferences are completed, skipped, or closed:
    // Show the Interactive Guide / Basic Guide
    const mode = StorageService.getGuideMode();
    const skippedSession = StorageService.getOnboardingSkippedSession();
    if (!skippedSession && mode !== 'never') {
      setIsWelcomeModalOpen(true);
    } else {
      checkAndShowGoogleOffer();
    }
  };

  const handleReloadAllData = () => {
    setMembers(StorageService.getMembers());
    setLabels(StorageService.getLabels());
    setSchedules(StorageService.getSchedules());
    loadSongs();
  };

  const handleFreshStartReset = () => {
    setMembers([]);
    setLabels(StorageService.getLabelsSync());
    setSchedules([]);
    setSongs([]);
    setEditingSchedule(null);
    setIsDraftSaved(false);
    setActiveTab('dashboard');
  };

  // Theme, AMOLED & Glass Mode DOM Sync (respecting Performance Mode suspension)
  useEffect(() => {
    StorageService.saveDarkMode(isDarkMode);
    StorageService.saveAmoledEnabled(isAmoledEnabled);
    StorageService.saveGlassMode(isGlassModeEnabled);
    StorageService.applyAppearanceToDOM({
      isDarkMode,
      amoledEnabled: isAmoledEnabled,
      glassModeEnabled: isGlassModeEnabled,
      performanceMode: Boolean(accessibilitySettings.performanceMode)
    });
  }, [isDarkMode, isAmoledEnabled, isGlassModeEnabled, accessibilitySettings.performanceMode]);

  // Accessibility Settings DOM Sync & Speech Assistant Engine
  useEffect(() => {
    StorageService.applyAccessibilityToDOM(accessibilitySettings);

    if (accessibilitySettings.ttsEnabled) {
      speechAssistant.setRate(accessibilitySettings.ttsSpeechRate || 1);
      speechAssistant.setVoice(accessibilitySettings.ttsVoice || '');
      speechAssistant.setReadingScope(accessibilitySettings.ttsReadingScope || 'all');
      speechAssistant.attachGlobalListeners();
    } else {
      speechAssistant.stop();
      speechAssistant.detachGlobalListeners();
    }

    return () => {
      speechAssistant.stop();
      speechAssistant.detachGlobalListeners();
    };
  }, [accessibilitySettings]);

  // Toast Helper
  useEffect(() => {
    if (accessibilitySettings.visualToastAlerts === false) {
      setToasts([]);
    }
  }, [accessibilitySettings.visualToastAlerts]);

  const showToast = (text: string, type: 'success' | 'danger' | 'info' = 'info') => {
    if (type === 'success') {
      soundEffects.playSuccess();
    } else if (type === 'danger') {
      soundEffects.playWarning();
    } else {
      soundEffects.playTap();
    }

    if (accessibilitySettings.visualToastAlerts === false) {
      return;
    }
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: ToastMessage = { id, text, type };
    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Surface storage corruption/quota warnings emitted by services
  useEffect(() => {
    const emitWarningToast = (msg: string) => {
      if (!msg) return;
      const now = Date.now();
      if (
        lastWarningShownRef.current &&
        lastWarningShownRef.current.text === msg &&
        now - lastWarningShownRef.current.time < 5000
      ) {
        return;
      }
      lastWarningShownRef.current = { text: msg, time: now };
      showToast(msg, 'danger');
    };

    if (startupStorageWarningRef.current) {
      const pending = startupStorageWarningRef.current;
      startupStorageWarningRef.current = null;
      emitWarningToast(pending);
    }

    const handleStorageWarning = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      if (detail?.message) {
        emitWarningToast(detail.message);
      }
    };

    window.addEventListener('wwcf:storage-warning', handleStorageWarning);
    return () => {
      window.removeEventListener('wwcf:storage-warning', handleStorageWarning);
    };
  }, [accessibilitySettings.visualToastAlerts]);

  // Schedule Operations
  const handleSaveSchedule = (
    scheduleData: Omit<Schedule, 'id' | 'updatedAt'>,
    id?: string
  ): boolean => {
    const prevSchedules = [...schedules];
    let updatedSchedules: Schedule[];

    // Match existing schedule strictly by ID
    const targetId = id && !id.startsWith('placeholder_') ? id : null;
    const existingIndex = targetId ? schedules.findIndex((s) => s.id === targetId) : -1;

    if (existingIndex >= 0 && targetId) {
      // Update existing schedule record
      updatedSchedules = schedules.map((s) =>
        s.id === targetId
          ? { ...scheduleData, id: targetId, updatedAt: getManilaNowISO() }
          : s
      );
    } else {
      // Create brand new schedule with unique ID
      const newId = `sch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newSchedule: Schedule = {
        ...scheduleData,
        id: newId,
        updatedAt: getManilaNowISO()
      };

      // If replacing a placeholder, remove placeholder and insert new schedule
      if (id && id.startsWith('placeholder_')) {
        updatedSchedules = [newSchedule, ...schedules.filter((s) => s.id !== id)];
      } else {
        // Also check if an empty placeholder exists for this exact service and date
        const matchingPlaceholder = schedules.find(
          (s) => s.id.startsWith('placeholder_') && s.serviceType === scheduleData.serviceType && s.serviceDate === scheduleData.serviceDate
        );
        if (matchingPlaceholder) {
          updatedSchedules = [newSchedule, ...schedules.filter((s) => s.id !== matchingPlaceholder.id)];
        } else {
          updatedSchedules = [newSchedule, ...schedules];
        }
      }
    }

    const nextSchedules = [...updatedSchedules];
    try {
      StorageService.saveSchedulesChecked(updatedSchedules);
    } catch (err) {
      console.error('[App] Failed to persist schedule:', err);
      showToast('Could not save worship schedule. Browser storage may be full.', 'danger');
      return false;
    }

    LineupHistoryService.pushAppAction({
      description: existingIndex >= 0 && targetId
        ? `Saved changes to ${scheduleData.serviceDate} (${scheduleData.serviceType})`
        : `Created lineup for ${scheduleData.serviceDate} (${scheduleData.serviceType})`,
      undo: () => {
        StorageService.saveSchedulesChecked(prevSchedules);
        setSchedules(prevSchedules);
      },
      redo: () => {
        StorageService.saveSchedulesChecked(nextSchedules);
        setSchedules(nextSchedules);
      }
    });

    setSchedules(updatedSchedules);
    try {
      StorageService.saveDraftScheduleChecked(null);
    } catch (e) {
      console.warn('[App] Failed to clear draft after schedule save:', e);
    }
    setEditingSchedule(null);
    setActiveTab('schedules');
    showToast(
      existingIndex >= 0 && targetId
        ? 'Worship schedule saved successfully!'
        : 'New worship schedule saved to history!',
      'success'
    );
    return true;
  };

  const handleEditScheduleFromList = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setActiveTab('scheduler');
    showToast(`Loaded lineup for ${schedule.serviceDate} into editor.`, 'info');
  };

  const handleDuplicateSchedule = (schedule: Schedule) => {
    const nextDate = getNextAvailableServiceDate(schedule.serviceType, schedules);
    const duplicated: Schedule = {
      ...schedule,
      id: '',
      serviceDate: nextDate,
      rehearsalChecklist: {
        songSelectionFinalized: false,
        performedKeysChecked: false,
        lyricsReviewed: false,
        referencesChecked: false,
        teamAssignmentsFinalized: false,
        transitionsPrepared: false
      },
      updatedAt: getManilaNowISO()
    };
    setEditingSchedule(duplicated);
    setActiveTab('scheduler');
    showToast('Duplicated schedule ready to edit.', 'info');
  };

  const handleDeleteSchedule = (id: string) => {
    const target = schedules.find((s) => s.id === id);
    if (!target) return;

    setModalConfig({
      isOpen: true,
      title: 'Delete this line-up?',
      message: `Are you sure you want to delete the ${target.serviceType} lineup for ${target.serviceDate}? You can undo this action from the toolbar or with Ctrl+Z.`,
      isDanger: true,
      confirmLabel: 'Delete Lineup',
      onConfirm: () => {
        const prevSchedules = [...schedules];
        const filtered = schedules.filter((s) => s.id !== id);
        try {
          StorageService.saveSchedulesChecked(filtered);
        } catch (err) {
          console.error('[App] Failed to delete schedule:', err);
          showToast('Could not delete line-up. Browser storage may be full.', 'danger');
          return;
        }
        setSchedules(filtered);
        showToast('Line-up deleted.', 'success');

        LineupHistoryService.pushAppAction({
          description: `Deleted lineup for ${target.serviceDate} (${target.serviceType})`,
          undo: () => {
            StorageService.saveSchedulesChecked(prevSchedules);
            setSchedules(prevSchedules);
          },
          redo: () => {
            const nextFiltered = prevSchedules.filter((s) => s.id !== id);
            StorageService.saveSchedulesChecked(nextFiltered);
            setSchedules(nextFiltered);
          }
        });
      }
    });
  };

  const handleBulkDeleteSchedules = (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    setModalConfig({
      isOpen: true,
      title: `Delete ${ids.length} line-up${ids.length > 1 ? 's' : ''}?`,
      message: `Are you sure you want to delete ${ids.length} line-up${ids.length > 1 ? 's' : ''}? You can undo this action from the toolbar or with Ctrl+Z.`,
      isDanger: true,
      confirmLabel: 'Delete Lineups',
      onConfirm: () => {
        const prevSchedules = [...schedules];
        const idSet = new Set(ids);
        const filtered = schedules.filter((s) => !idSet.has(s.id));
        try {
          StorageService.saveSchedulesChecked(filtered);
        } catch (err) {
          console.error('[App] Failed to bulk delete schedules:', err);
          showToast('Could not delete selected line-ups. Browser storage error.', 'danger');
          return;
        }
        setSchedules(filtered);
        showToast(`Successfully deleted ${ids.length} line-up${ids.length > 1 ? 's' : ''}.`, 'success');

        LineupHistoryService.pushAppAction({
          description: `Deleted ${ids.length} line-up${ids.length > 1 ? 's' : ''}`,
          undo: () => {
            StorageService.saveSchedulesChecked(prevSchedules);
            setSchedules(prevSchedules);
          },
          redo: () => {
            const nextFiltered = prevSchedules.filter((s) => !idSet.has(s.id));
            StorageService.saveSchedulesChecked(nextFiltered);
            setSchedules(nextFiltered);
          }
        });
      }
    });
  };

  const handleBulkMarkNoService = useCallback((
    ids: string[],
    reason?: string
  ): {
    success: boolean;
    convertedCount: number;
    skippedNoServiceCount: number;
    skippedPlaceholderCount: number;
  } => {
    if (!ids || ids.length === 0) {
      return {
        success: false,
        convertedCount: 0,
        skippedNoServiceCount: 0,
        skippedPlaceholderCount: 0
      };
    }

    const prevSchedules = [...schedules];
    const conversion = applyBulkNoServiceConversion(ids, prevSchedules, reason);

    if (conversion.convertedCount === 0) {
      const skippedNotes: string[] = [];
      if (conversion.skippedNoServiceCount > 0) {
        skippedNotes.push(`${conversion.skippedNoServiceCount} already marked as No Service`);
      }
      if (conversion.skippedPlaceholderCount > 0) {
        skippedNotes.push(`${conversion.skippedPlaceholderCount} un-saved monthly placeholder${conversion.skippedPlaceholderCount === 1 ? '' : 's'}`);
      }
      showToast(
        skippedNotes.length > 0
          ? `No saved line-ups were converted (${skippedNotes.join(', ')}).`
          : 'No eligible saved line-ups were found to mark as No Service.',
        'info'
      );
      return {
        success: false,
        convertedCount: 0,
        skippedNoServiceCount: conversion.skippedNoServiceCount,
        skippedPlaceholderCount: conversion.skippedPlaceholderCount
      };
    }

    const nextSchedules = [...conversion.nextSchedules];
    try {
      StorageService.saveSchedulesChecked(nextSchedules);
    } catch (err) {
      console.error('[App] Failed to mark selected schedules as No Service:', err);
      showToast('Could not mark selected line-ups as No Service. Browser storage may be full.', 'danger');
      return {
        success: false,
        convertedCount: 0,
        skippedNoServiceCount: conversion.skippedNoServiceCount,
        skippedPlaceholderCount: conversion.skippedPlaceholderCount
      };
    }

    setSchedules(nextSchedules);

    const convertedMap = new Map(conversion.convertedSchedules.map((s) => [s.id, s]));
    setEditingSchedule((prev) => (prev && convertedMap.has(prev.id) ? convertedMap.get(prev.id)! : prev));

    const firstConverted = conversion.convertedSchedules[0];
    const historyDescription =
      conversion.convertedCount === 1
        ? `Marked ${firstConverted.serviceDate} (${firstConverted.serviceType}) as No Service`
        : `Marked ${conversion.convertedCount} line-ups as No Service`;

    LineupHistoryService.pushAppAction({
      description: historyDescription,
      undo: () => {
        StorageService.saveSchedulesChecked(prevSchedules);
        setSchedules(prevSchedules);
        setEditingSchedule((prev) => {
          if (!prev || !convertedMap.has(prev.id)) return prev;
          return prevSchedules.find((s) => s.id === prev.id) || prev;
        });
      },
      redo: () => {
        StorageService.saveSchedulesChecked(nextSchedules);
        setSchedules(nextSchedules);
        setEditingSchedule((prev) => (prev && convertedMap.has(prev.id) ? convertedMap.get(prev.id)! : prev));
      }
    });

    const skippedDetails: string[] = [];
    if (conversion.skippedNoServiceCount > 0) {
      skippedDetails.push(`${conversion.skippedNoServiceCount} already No Service`);
    }
    if (conversion.skippedPlaceholderCount > 0) {
      skippedDetails.push(`${conversion.skippedPlaceholderCount} placeholder${conversion.skippedPlaceholderCount === 1 ? '' : 's'}`);
    }

    const baseMessage =
      conversion.convertedCount === 1
        ? `Marked ${firstConverted.serviceDate} (${firstConverted.serviceType}) as No Service.`
        : `Marked ${conversion.convertedCount} line-ups as No Service.`;

    showToast(
      skippedDetails.length > 0
        ? `${baseMessage} Skipped ${skippedDetails.join(' and ')}.`
        : baseMessage,
      'success'
    );

    return {
      success: true,
      convertedCount: conversion.convertedCount,
      skippedNoServiceCount: conversion.skippedNoServiceCount,
      skippedPlaceholderCount: conversion.skippedPlaceholderCount
    };
  }, [schedules]);

  const handleResetSchedulerForm = () => {
    setModalConfig({
      isOpen: true,
      title: 'Reset Scheduler Form',
      message: 'Are you sure you want to clear all current song inputs and assignments?',
      isDanger: true,
      onConfirm: () => {
        try {
          StorageService.saveDraftScheduleChecked(null);
        } catch (err) {
          console.warn('[App] Failed to clear draft during form reset:', err);
        }
        setEditingSchedule(null);
        window.dispatchEvent(new CustomEvent('wwcf:reset-scheduler-form'));
        showToast('Scheduler form reset.', 'info');
      }
    });
  };

  const handleTriggerDraft = (draft: Partial<Schedule>) => {
    try {
      StorageService.saveDraftScheduleChecked(draft);
      setIsDraftSaved(true);
      setTimeout(() => setIsDraftSaved(false), 2000);
    } catch (err) {
      console.error('[App] Failed to save draft schedule:', err);
      showToast('Could not save draft. Browser storage may be full.', 'danger');
    }
  };

  // Member Operations
  const handleAddMember = (memberData: Omit<Member, 'id'>, id?: string) => {
    const uniqueCheck = validateUniqueMemberRoles(memberData.labels, members, id);
    if (!uniqueCheck.isValid) {
      showToast(uniqueCheck.errorMessage || 'Role conflict with existing roster member.', 'danger');
      return;
    }

    const prevMembers = [...members];
    let updatedMembers: Member[];
    if (id) {
      updatedMembers = members.map((m) => (m.id === id ? { ...memberData, id } : m));
    } else {
      const newMember: Member = {
        ...memberData,
        id: `m_${Date.now()}`
      };
      updatedMembers = [...members, newMember];
    }

    const nextMembers = [...updatedMembers];
    try {
      StorageService.saveMembersChecked(updatedMembers);
    } catch (err) {
      console.error('[App] Failed to save member:', err);
      showToast('Could not save team member. Browser storage may be full.', 'danger');
      return;
    }

    LineupHistoryService.pushAppAction({
      description: id ? `Updated member "${memberData.name}"` : `Added member "${memberData.name}"`,
      undo: () => {
        StorageService.saveMembersChecked(prevMembers);
        setMembers(prevMembers);
      },
      redo: () => {
        StorageService.saveMembersChecked(nextMembers);
        setMembers(nextMembers);
      }
    });

    setMembers(updatedMembers);
  };

  const handleDeleteMember = (id: string) => {
    const memberObj = members.find((m) => m.id === id);
    setModalConfig({
      isOpen: true,
      title: 'Delete Member',
      message: `Are you sure you want to remove ${memberObj?.name || 'this member'} from the roster? You can undo this action from the toolbar or with Ctrl+Z.`,
      isDanger: true,
      confirmLabel: 'Remove Member',
      onConfirm: () => {
        const prevMembers = [...members];
        const filtered = members.filter((m) => m.id !== id);
        try {
          StorageService.saveMembersChecked(filtered);
        } catch (err) {
          console.error('[App] Failed to delete member:', err);
          showToast('Could not remove member. Browser storage error.', 'danger');
          return;
        }
        setMembers(filtered);
        showToast('Member removed from roster.', 'success');

        LineupHistoryService.pushAppAction({
          description: `Removed member "${memberObj?.name || 'team member'}"`,
          undo: () => {
            StorageService.saveMembersChecked(prevMembers);
            setMembers(prevMembers);
          },
          redo: () => {
            const nextFiltered = prevMembers.filter((m) => m.id !== id);
            StorageService.saveMembersChecked(nextFiltered);
            setMembers(nextFiltered);
          }
        });
      }
    });
  };

  const handleAddCustomLabel = (newLabel: string) => {
    if (!labels.includes(newLabel)) {
      const prevLabels = [...labels];
      const updated = sortTags([...labels, newLabel]);
      try {
        StorageService.saveLabelsChecked(updated);
      } catch (err) {
        console.error('[App] Failed to save custom label:', err);
        showToast('Could not save custom ministry tag. Browser storage may be full.', 'danger');
        return;
      }
      setLabels(updated);

      LineupHistoryService.pushAppAction({
        description: `Added ministry tag "${newLabel}"`,
        undo: () => {
          StorageService.saveLabelsChecked(prevLabels);
          setLabels(prevLabels);
        },
        redo: () => {
          StorageService.saveLabelsChecked(updated);
          setLabels(updated);
        }
      });
    }
  };

  // Export PDF schedule
  const handleExportPDF = async (schedule: Schedule) => {
    if (isScheduleEmpty(schedule)) {
      showToast('This lineup does not contain any songs. Please add at least one song before using or exporting this lineup.', 'danger');
      return;
    }
    try {
      const { exportLineupAsPDF } = await import('./services/exportService');
      await exportLineupAsPDF(schedule, songs);
      showToast('Worship schedule exported as PDF!', 'success');
    } catch (err) {
      console.error('Failed to export PDF:', err);
      showToast('Failed to export PDF. Please try again.', 'danger');
    }
  };

  // Export PNG schedule
  const handleExportPNG = async (schedule: Schedule) => {
    if (isScheduleEmpty(schedule)) {
      showToast('This lineup does not contain any songs. Please add at least one song before using or exporting this lineup.', 'danger');
      return;
    }
    try {
      const { exportLineupAsPNG } = await import('./services/exportService');
      await exportLineupAsPNG(schedule, songs);
      showToast('Worship schedule exported as PNG image!', 'success');
    } catch (err) {
      console.error('Failed to export PNG:', err);
      showToast('Failed to export PNG. Please try again.', 'danger');
    }
  };

  const handleUpdateSchedules = (updatedSchedules: Schedule[]) => {
    try {
      StorageService.saveSchedulesChecked(updatedSchedules);
      setSchedules(updatedSchedules);
    } catch (err) {
      console.error('[App] Failed to update schedules:', err);
      showToast('Could not save schedule changes. Browser storage may be full.', 'danger');
    }
  };

  const handleSaveMembers = (updatedMembers: Member[]) => {
    const prevMembers = [...members];
    const nextMembers = [...updatedMembers];
    try {
      StorageService.saveMembersChecked(updatedMembers);
    } catch (err) {
      console.error('[App] Failed to save members:', err);
      showToast('Could not save roster updates. Browser storage may be full.', 'danger');
      return;
    }
    setMembers(updatedMembers);

    LineupHistoryService.pushAppAction({
      description: 'Updated roster members',
      undo: () => {
        StorageService.saveMembersChecked(prevMembers);
        setMembers(prevMembers);
      },
      redo: () => {
        StorageService.saveMembersChecked(nextMembers);
        setMembers(nextMembers);
      }
    });
  };

  const handleNewScheduleClick = () => {
    setIsNewLineupModalOpen(true);
  };

  const handleLoadExistingLineup = (schedule: Schedule) => {
    handleEditScheduleFromList(schedule);
  };

  const handleCreateNewLineup = (serviceType: string, serviceDate: string) => {
    const existing = schedules.find(
      (s) => s.serviceType === serviceType && s.serviceDate === serviceDate && !s.id.startsWith('placeholder_')
    );
    if (existing) {
      handleEditScheduleFromList(existing);
      return;
    }

    const newSchedule: Schedule = {
      id: `sch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      serviceType: serviceType as any,
      serviceDate: serviceDate,
      praiseSongs: [''],
      worshipSongs: [''],
      praiseSongKeys: [''],
      worshipSongKeys: [''],
      ministryAssignments: [],
      notes: '',
      updatedAt: getManilaNowISO()
    };

    try {
      StorageService.saveDraftScheduleChecked(null);
    } catch (err) {
      console.warn('[App] Failed to clear stale draft when creating lineup:', err);
    }
    setEditingSchedule(newSchedule);
    setActiveTab('scheduler');
    showToast(`Created new lineup for ${serviceType} on ${serviceDate}.`, 'success');
  };

  // App-Wide Undo/Redo Engine integration
  const currentSchedulerContextKey = useMemo(() => {
    return editingSchedule ? `edit_${editingSchedule.id}` : 'new_schedule';
  }, [editingSchedule]);

  const canAppUndo = useMemo(() => {
    if (activeTab === 'scheduler' && LineupHistoryService.canUndo(currentSchedulerContextKey)) {
      return true;
    }
    return LineupHistoryService.canUndoApp();
  }, [activeTab, currentSchedulerContextKey]);

  const canAppRedo = useMemo(() => {
    if (activeTab === 'scheduler' && LineupHistoryService.canRedo(currentSchedulerContextKey)) {
      return true;
    }
    return LineupHistoryService.canRedoApp();
  }, [activeTab, currentSchedulerContextKey]);

  const handleAppUndo = useCallback(async () => {
    // 1. If currently in the scheduler and an in-editor step is available, undo in editor
    if (activeTab === 'scheduler' && LineupHistoryService.canUndo(currentSchedulerContextKey)) {
      window.dispatchEvent(new CustomEvent('wwcf:trigger-undo-lineup'));
      return;
    }

    // 2. Otherwise trigger app-wide persistent undo
    if (LineupHistoryService.canUndoApp()) {
      try {
        const action = await LineupHistoryService.undoAppAction();
        if (action) {
          showToast(`Undone: ${action.description}`, 'info');
        }
      } catch (err) {
        console.error('Failed to undo action:', err);
        showToast('Failed to undo action.', 'danger');
      }
      return;
    }

    // 3. Fallback to in-editor trigger if on scheduler
    if (activeTab === 'scheduler') {
      window.dispatchEvent(new CustomEvent('wwcf:trigger-undo-lineup'));
    }
  }, [activeTab, currentSchedulerContextKey]);

  const handleAppRedo = useCallback(async () => {
    if (activeTab === 'scheduler' && LineupHistoryService.canRedo(currentSchedulerContextKey)) {
      window.dispatchEvent(new CustomEvent('wwcf:trigger-redo-lineup'));
      return;
    }

    if (LineupHistoryService.canRedoApp()) {
      try {
        const action = await LineupHistoryService.redoAppAction();
        if (action) {
          showToast(`Redone: ${action.description}`, 'info');
        }
      } catch (err) {
        console.error('Failed to redo action:', err);
        showToast('Failed to redo action.', 'danger');
      }
      return;
    }

    if (activeTab === 'scheduler') {
      window.dispatchEvent(new CustomEvent('wwcf:trigger-redo-lineup'));
    }
  }, [activeTab, currentSchedulerContextKey]);

  // Keyboard shortcuts integration (F1 for help, Alt+1..5 for tabs, Alt+N for new lineup, Ctrl+Z / Ctrl+Y for undo/redo)
  useKeyboardShortcuts(
    {
      onHelp: () => setIsHelpMenuOpen(true),
      onNavigateDashboard: () => setActiveTab('dashboard'),
      onNavigateScheduler: () => setActiveTab('scheduler'),
      onNavigateSongs: () => setActiveTab('songs'),
      onNavigateSchedules: () => setActiveTab('schedules'),
      onNavigateMembers: () => setActiveTab('members'),
      onNewLineup: () => handleNewScheduleClick(),
      onSaveLineup: () => {
        if (activeTab === 'scheduler') {
          window.dispatchEvent(new CustomEvent('wwcf:trigger-save-lineup'));
        }
      },
      onUndo: () => {
        handleAppUndo();
      },
      onRedo: () => {
        handleAppRedo();
      }
    },
    {
      isGuideActive: isWelcomeModalOpen || isOnboardingOpen
    }
  );

  // Compute layout padding for desktop from single source of truth shared with Sidebar
  const contentPaddingClass = useMemo(
    () =>
      getMainContentOffsetClass({
        navigationOrientation: layoutPreferences.navigationOrientation,
        sidebarPosition: layoutPreferences.sidebarPosition,
        sidebarVisibility: layoutPreferences.sidebarVisibility
      }),
    [
      layoutPreferences.navigationOrientation,
      layoutPreferences.sidebarVisibility,
      layoutPreferences.sidebarPosition
    ]
  );

  return (
    <div className="min-h-screen wwcf-app-shell bg-[#f4f7fb] dark:bg-black text-slate-900 dark:text-slate-100 flex transition-colors">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        isOpen={isMobileMenuOpen}
        setIsOpen={setIsMobileMenuOpen}
        onOpenBackupRestore={() => setIsBackupModalOpen(true)}
        onOpenTransferData={() => setIsTransferModalOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenHelp={() => setIsHelpMenuOpen(true)}
        sidebarPosition={layoutPreferences.sidebarPosition}
        sidebarVisibility={layoutPreferences.sidebarVisibility}
        navigationOrientation={layoutPreferences.navigationOrientation}
        onToggleVisibility={handleToggleSidebarVisibility}
        onToggleCollapse={handleToggleSidebarCollapse}
      />

      {/* Main Content Area */}
      <div className={`flex-1 ${contentPaddingClass} flex flex-col min-w-0 wwcf-main-content transition-[padding] duration-200 ease-out motion-reduce:transition-none`}>
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          isDraftSaved={isDraftSaved}
          onNewSchedule={handleNewScheduleClick}
          onOpenHelp={() => setIsHelpMenuOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          navigationOrientation={layoutPreferences.navigationOrientation}
          sidebarPosition={layoutPreferences.sidebarPosition}
          sidebarVisibility={layoutPreferences.sidebarVisibility}
          onToggleSidebarVisibility={handleToggleSidebarVisibility}
          canUndo={canAppUndo}
          canRedo={canAppRedo}
          onUndo={handleAppUndo}
          onRedo={handleAppRedo}
          undoTitle={
            activeTab === 'scheduler' && LineupHistoryService.canUndo(currentSchedulerContextKey)
              ? 'Undo last edit in lineup scheduler (Ctrl+Z)'
              : LineupHistoryService.peekUndoApp()
              ? `Undo: ${LineupHistoryService.peekUndoApp()?.description} (Ctrl+Z)`
              : canAppUndo
              ? 'Undo (Ctrl+Z)'
              : 'Nothing to undo'
          }
          redoTitle={
            activeTab === 'scheduler' && LineupHistoryService.canRedo(currentSchedulerContextKey)
              ? 'Redo last undone edit in lineup scheduler (Ctrl+Y / Ctrl+Shift+Z)'
              : LineupHistoryService.peekRedoApp()
              ? `Redo: ${LineupHistoryService.peekRedoApp()?.description} (Ctrl+Y / Ctrl+Shift+Z)`
              : canAppRedo
              ? 'Redo (Ctrl+Y / Ctrl+Shift+Z)'
              : 'Nothing to redo'
          }
        />

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-5 sm:py-6 max-w-7xl w-full mx-auto">
          <ErrorBoundary
            key={activeTab}
            fallbackTitle="View Interrupted"
            onReset={() => setActiveTab('dashboard')}
          >
            <div className="page-transition">
              <React.Suspense
                fallback={
                  <div className="flex items-center justify-center p-12 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Loading view...
                  </div>
                }
              >
                {activeTab === 'dashboard' && (
                  <DashboardView
                    members={members}
                    schedules={schedules}
                    allSongs={songs}
                    songFamilies={songFamilies}
                    setActiveTab={setActiveTab}
                    onEditSchedule={handleEditScheduleFromList}
                    onUpdateSchedules={handleUpdateSchedules}
                  />
                )}

                {activeTab === 'scheduler' && (
                  <SchedulerView
                    members={members}
                    allSongs={songs}
                    schedules={schedules}
                    editingSchedule={editingSchedule}
                    onSaveSchedule={handleSaveSchedule}
                    onExportPDF={handleExportPDF}
                    onExportPNG={handleExportPNG}
                    onResetForm={handleResetSchedulerForm}
                    onTriggerDraft={handleTriggerDraft}
                    onRefreshSongs={loadSongs}
                    showToast={showToast}
                    onSelectSchedule={handleEditScheduleFromList}
                    onViewSchedules={() => setActiveTab('schedules')}
                  />
                )}

                {activeTab === 'songs' && (
                  <SongsView
                    songs={songs}
                    schedules={schedules}
                    members={members}
                    onRefreshSongs={loadSongs}
                    onUpdateSchedules={handleUpdateSchedules}
                    showToast={showToast}
                  />
                )}

                {activeTab === 'schedules' && (
                  <SchedulesView
                    schedules={schedules}
                    allSongs={songs}
                    onEditSchedule={handleEditScheduleFromList}
                    onDuplicateSchedule={handleDuplicateSchedule}
                    onDeleteSchedule={handleDeleteSchedule}
                    onBulkDeleteSchedules={handleBulkDeleteSchedules}
                    onMarkNoService={handleBulkMarkNoService}
                    onExportPDF={handleExportPDF}
                    onExportPNG={handleExportPNG}
                    onUpdateSchedules={handleUpdateSchedules}
                  />
                )}

                {activeTab === 'analytics' && (
                  <SongAnalyticsView
                    schedules={schedules}
                    songs={songs}
                    members={members}
                    songFamilies={songFamilies}
                    showToast={showToast}
                  />
                )}

                {activeTab === 'members' && (
                  <MemberEditorView
                    members={members}
                    labels={labels}
                    schedules={schedules}
                    onAddMember={handleAddMember}
                    onDeleteMember={handleDeleteMember}
                    onSaveMembers={handleSaveMembers}
                    onUpdateSchedules={handleUpdateSchedules}
                    onAddCustomLabel={handleAddCustomLabel}
                    showToast={showToast}
                  />
                )}
              </React.Suspense>
            </div>
          </ErrorBoundary>
        </main>
      </div>

      {/* Lazy-loaded Modals wrapped in Suspense */}
      <React.Suspense fallback={null}>
        {/* Backup & Restore Modal */}
        <BackupRestoreModal
          isOpen={isBackupModalOpen}
          onClose={() => setIsBackupModalOpen(false)}
          members={members}
          songs={songs}
          schedules={schedules}
          labels={labels}
          onDataRestored={handleReloadAllData}
          showToast={showToast}
        />

        {/* Settings Modal */}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          isAmoledEnabled={isAmoledEnabled}
          setIsAmoledEnabled={setIsAmoledEnabled}
          isGlassModeEnabled={isGlassModeEnabled}
          setIsGlassModeEnabled={handleSetGlassModeEnabled}
          accessibilitySettings={accessibilitySettings}
          onUpdateAccessibility={setAccessibilitySettings}
          onOpenOnboarding={() => {
            setGuideInitialStep(1);
            setIsOnboardingOpen(true);
          }}
          onOpenBackupRestore={() => setIsBackupModalOpen(true)}
          onOpenTransferData={() => setIsTransferModalOpen(true)}
          onOpenDeleteAllData={() => setIsDeleteAllDataOpen(true)}
          showToast={showToast}
        />

        {/* Delete All Data / Fresh Start Modal */}
        <DeleteAllDataModal
          isOpen={isDeleteAllDataOpen}
          onClose={() => setIsDeleteAllDataOpen(false)}
          onDataDeleted={handleFreshStartReset}
          showToast={showToast}
        />

        {/* Transfer Data Modal (PC to Phone Data Transfer) */}
        <TransferDataModal
          isOpen={isTransferModalOpen}
          onClose={() => {
            setIsTransferModalOpen(false);
            setInitialTransferParams(null);
          }}
          members={members}
          songs={songs}
          schedules={schedules}
          labels={labels}
          draftSchedule={StorageService.getDraftSchedule()}
          onDataTransferred={() => {
            setMembers(StorageService.getMembersSync());
            setLabels(StorageService.getLabelsSync());
            setSchedules(StorageService.getSchedulesSync());
            loadSongs();
          }}
          showToast={showToast}
          initialSessionParams={initialTransferParams}
        />

        {/* Step 1: Accessibility Onboarding Preferences Modal */}
        <AccessibilityOnboardingModal
          isOpen={isAccessibilityWelcomeOpen}
          onComplete={handleAccessibilityOnboardingComplete}
          onUpdateAccessibility={setAccessibilitySettings}
        />

        {/* Step 2: Welcome Guide Greeting Modal */}
        <WelcomeGuideModal
          isOpen={isWelcomeModalOpen}
          onClose={() => {
            setIsWelcomeModalOpen(false);
            checkAndShowGoogleOffer();
          }}
          onStartGuide={() => {
            setGuideInitialStep(1);
            setIsOnboardingOpen(true);
          }}
          showToast={showToast}
        />

        {/* Help Menu Modal */}
        <HelpMenuModal
          isOpen={isHelpMenuOpen}
          onClose={() => setIsHelpMenuOpen(false)}
          onSelectSection={(stepId) => {
            setGuideInitialStep(stepId);
            setIsOnboardingOpen(true);
          }}
        />

        {/* Interactive Guided Tour Overlay */}
        <InteractiveTourOverlay
          isOpen={isOnboardingOpen}
          onClose={() => {
            setIsOnboardingOpen(false);
            checkAndShowGoogleOffer();
          }}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          initialStep={guideInitialStep}
        />

        {/* Google Account & Cloud Save Offer Modal (First run, post-accessibility) */}
        <GoogleConnectOfferModal
          isOpen={isGoogleOfferOpen}
          onClose={() => setIsGoogleOfferOpen(false)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          showToast={showToast}
        />

        {/* Google Drive Conflict Resolution Modal */}
        <DriveConflictModal
          conflict={driveConflict}
          onClose={() => setDriveConflict(null)}
          onResolved={handleReloadAllData}
          showToast={showToast}
        />

        {/* New Lineup Selection Modal */}
        <NewLineupModal
          isOpen={isNewLineupModalOpen}
          onClose={() => setIsNewLineupModalOpen(false)}
          schedules={schedules}
          onLoadExistingLineup={handleLoadExistingLineup}
          onCreateNewLineup={handleCreateNewLineup}
          showToast={showToast}
        />

        {/* Confirmation Modal */}
        <Modal
          id="app-confirmation-modal"
          isOpen={modalConfig.isOpen}
          title={modalConfig.title}
          message={modalConfig.message}
          confirmLabel={modalConfig.confirmLabel}
          cancelLabel={modalConfig.cancelLabel}
          isDanger={modalConfig.isDanger}
          onConfirm={modalConfig.onConfirm}
          onClose={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
        />
      </React.Suspense>

      {/* Floating Text-to-Speech Navigator (Optional control panel) */}
      <TextToSpeechNavigator
        isOpen={Boolean(accessibilitySettings.ttsEnabled && accessibilitySettings.showTtsPanel !== false)}
        onClose={() => {
          // Hiding the visual floating panel must NOT disable the active TTS assistant!
          const updated: AccessibilitySettings = {
            ...accessibilitySettings,
            showTtsPanel: false
          };
          setAccessibilitySettings(updated);
          StorageService.saveAccessibilitySettings(updated);
        }}
        onDisableTts={() => {
          // Explicitly turn off TTS completely
          const updated: AccessibilitySettings = {
            ...accessibilitySettings,
            ttsEnabled: false
          };
          setAccessibilitySettings(updated);
          StorageService.saveAccessibilitySettings(updated);
        }}
        activeTab={activeTab}
        schedule={editingSchedule || schedules[0] || null}
        songs={songs}
        members={members}
        schedules={schedules}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
