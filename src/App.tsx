import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ActiveTab,
  Member,
  Schedule,
  ToastMessage,
  Song,
  AccessibilitySettings,
  AppLayoutPreferences,
  NavigationOrientation,
  SidebarPosition,
  SidebarVisibility
} from './types';
import { StorageService } from './services/storage';
import { SongService } from './services/songService';
import { LineupHistoryService } from './services/lineupHistoryService';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { DashboardView } from './components/DashboardView';
import { SchedulerView } from './components/SchedulerView';
import { SongsView } from './components/SongsView';
import { SchedulesView } from './components/SchedulesView';
import { MemberEditorView } from './components/MemberEditorView';
import { ToastContainer } from './components/ToastContainer';
import { Modal } from './components/Modal';
import { BackupRestoreModal } from './components/BackupRestoreModal';
import { OnboardingModal } from './components/OnboardingModal';
import { SettingsModal } from './components/SettingsModal';
import { HelpMenuModal } from './components/HelpMenuModal';
import { InteractiveTourOverlay } from './components/InteractiveTourOverlay';
import { WelcomeGuideModal } from './components/WelcomeGuideModal';
import { AccessibilityOnboardingModal } from './components/AccessibilityOnboardingModal';
import { TextToSpeechNavigator } from './components/TextToSpeechNavigator';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NewLineupModal } from './components/NewLineupModal';
import { TransferDataModal } from './components/TransferDataModal';
import { DeleteAllDataModal } from './components/DeleteAllDataModal';
import { speechAssistant } from './utils/speechAssistant';
import { exportLineupAsPDF, exportLineupAsPNG } from './services/exportService';
import { sortTags } from './utils/tagUtils';
import { getManilaNowISO, getManilaTodayString } from './utils/dateUtils';
import { getNextAvailableServiceDate, getSmartInitialServiceDetails, ensureMonthlyPlaceholders, isScheduleEmpty } from './utils/scheduleUtils';
import { validateUniqueMemberRoles } from './utils/memberUtils';

export default function App() {
  // Navigation & UI state
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => StorageService.getDarkMode());
  const [accessibilitySettings, setAccessibilitySettings] = useState<AccessibilitySettings>(() =>
    StorageService.getAccessibilitySettings()
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
  const [members, setMembers] = useState<Member[]>(() => StorageService.getMembers());
  const [labels, setLabels] = useState<string[]>(() => StorageService.getLabels());
  const [schedules, setSchedules] = useState<Schedule[]>(() => {
    const loaded = StorageService.getSchedules();
    const currentYM = getManilaTodayString().substring(0, 7);
    const withPlaceholders = ensureMonthlyPlaceholders(currentYM, loaded);
    if (withPlaceholders.length !== loaded.length) {
      StorageService.saveSchedules(withPlaceholders);
    }
    return withPlaceholders;
  });
  const [songs, setSongs] = useState<Song[]>([]);

  // Refresh songs from SongService
  const loadSongs = async () => {
    try {
      const fetched = await SongService.getSongs();
      setSongs(fetched);
    } catch (e) {
      console.error('Failed to load songs:', e);
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

  // Listen for songs updated event from anywhere in the app
  useEffect(() => {
    const handleSongsUpdated = () => {
      loadSongs();
    };
    window.addEventListener('wwcf:songs-updated', handleSongsUpdated);
    return () => {
      window.removeEventListener('wwcf:songs-updated', handleSongsUpdated);
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

  // Auto-detect transfer session from URL parameters (e.g., when scanned via phone camera)
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const sid = urlParams.get('transferSessionId');
      const tok = urlParams.get('token');
      if (sid && tok) {
        setInitialTransferParams({ sessionId: sid, token: tok });
        setIsTransferModalOpen(true);
        // Clean URL search string without reloading
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

  // Dark Mode Sync
  useEffect(() => {
    StorageService.saveDarkMode(isDarkMode);
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

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

  // Schedule Operations
  const handleSaveSchedule = (
    scheduleData: Omit<Schedule, 'id' | 'updatedAt'>,
    id?: string
  ) => {
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
      showToast('Worship schedule saved successfully!', 'success');
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
      showToast('New worship schedule saved to history!', 'success');
    }

    const nextSchedules = [...updatedSchedules];
    LineupHistoryService.pushAppAction({
      description: existingIndex >= 0 && targetId
        ? `Saved changes to ${scheduleData.serviceDate} (${scheduleData.serviceType})`
        : `Created lineup for ${scheduleData.serviceDate} (${scheduleData.serviceType})`,
      undo: () => {
        setSchedules(prevSchedules);
        StorageService.saveSchedules(prevSchedules);
      },
      redo: () => {
        setSchedules(nextSchedules);
        StorageService.saveSchedules(nextSchedules);
      }
    });

    setSchedules(updatedSchedules);
    StorageService.saveSchedules(updatedSchedules);
    StorageService.saveDraftSchedule(null);
    setEditingSchedule(null);
    setActiveTab('schedules');
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
        setSchedules(filtered);
        StorageService.saveSchedules(filtered);
        showToast('Line-up deleted.', 'success');

        LineupHistoryService.pushAppAction({
          description: `Deleted lineup for ${target.serviceDate} (${target.serviceType})`,
          undo: () => {
            setSchedules(prevSchedules);
            StorageService.saveSchedules(prevSchedules);
          },
          redo: () => {
            const nextFiltered = prevSchedules.filter((s) => s.id !== id);
            setSchedules(nextFiltered);
            StorageService.saveSchedules(nextFiltered);
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
        setSchedules(filtered);
        StorageService.saveSchedules(filtered);
        showToast(`Successfully deleted ${ids.length} line-up${ids.length > 1 ? 's' : ''}.`, 'success');

        LineupHistoryService.pushAppAction({
          description: `Deleted ${ids.length} line-up${ids.length > 1 ? 's' : ''}`,
          undo: () => {
            setSchedules(prevSchedules);
            StorageService.saveSchedules(prevSchedules);
          },
          redo: () => {
            const nextFiltered = prevSchedules.filter((s) => !idSet.has(s.id));
            setSchedules(nextFiltered);
            StorageService.saveSchedules(nextFiltered);
          }
        });
      }
    });
  };

  const handleResetSchedulerForm = () => {
    setModalConfig({
      isOpen: true,
      title: 'Reset Scheduler Form',
      message: 'Are you sure you want to clear all current song inputs and assignments?',
      isDanger: true,
      onConfirm: () => {
        setEditingSchedule(null);
        StorageService.saveDraftSchedule(null);
        window.dispatchEvent(new CustomEvent('wwcf:reset-scheduler-form'));
        showToast('Scheduler form reset.', 'info');
      }
    });
  };

  const handleTriggerDraft = (draft: Partial<Schedule>) => {
    StorageService.saveDraftSchedule(draft);
    setIsDraftSaved(true);
    setTimeout(() => setIsDraftSaved(false), 2000);
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
    LineupHistoryService.pushAppAction({
      description: id ? `Updated member "${memberData.name}"` : `Added member "${memberData.name}"`,
      undo: () => {
        setMembers(prevMembers);
        StorageService.saveMembers(prevMembers);
      },
      redo: () => {
        setMembers(nextMembers);
        StorageService.saveMembers(nextMembers);
      }
    });

    setMembers(updatedMembers);
    StorageService.saveMembers(updatedMembers);
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
        setMembers(filtered);
        StorageService.saveMembers(filtered);
        showToast('Member removed from roster.', 'success');

        LineupHistoryService.pushAppAction({
          description: `Removed member "${memberObj?.name || 'team member'}"`,
          undo: () => {
            setMembers(prevMembers);
            StorageService.saveMembers(prevMembers);
          },
          redo: () => {
            const nextFiltered = prevMembers.filter((m) => m.id !== id);
            setMembers(nextFiltered);
            StorageService.saveMembers(nextFiltered);
          }
        });
      }
    });
  };

  const handleAddCustomLabel = (newLabel: string) => {
    if (!labels.includes(newLabel)) {
      const prevLabels = [...labels];
      const updated = sortTags([...labels, newLabel]);
      setLabels(updated);
      StorageService.saveLabels(updated);

      LineupHistoryService.pushAppAction({
        description: `Added ministry tag "${newLabel}"`,
        undo: () => {
          setLabels(prevLabels);
          StorageService.saveLabels(prevLabels);
        },
        redo: () => {
          setLabels(updated);
          StorageService.saveLabels(updated);
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
      await exportLineupAsPDF(schedule);
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
      await exportLineupAsPNG(schedule);
      showToast('Worship schedule exported as PNG image!', 'success');
    } catch (err) {
      console.error('Failed to export PNG:', err);
      showToast('Failed to export PNG. Please try again.', 'danger');
    }
  };

  const handleUpdateSchedules = (updatedSchedules: Schedule[]) => {
    setSchedules(updatedSchedules);
    StorageService.saveSchedules(updatedSchedules);
  };

  const handleSaveMembers = (updatedMembers: Member[]) => {
    const prevMembers = [...members];
    const nextMembers = [...updatedMembers];
    setMembers(updatedMembers);
    StorageService.saveMembers(updatedMembers);

    LineupHistoryService.pushAppAction({
      description: 'Updated roster members',
      undo: () => {
        setMembers(prevMembers);
        StorageService.saveMembers(prevMembers);
      },
      redo: () => {
        setMembers(nextMembers);
        StorageService.saveMembers(nextMembers);
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

    setEditingSchedule(newSchedule);
    StorageService.saveDraftSchedule(null);
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

  // Compute layout padding for desktop based on orientation, sidebar position, and sidebar visibility
  const contentPaddingClass = useMemo(() => {
    if (layoutPreferences.navigationOrientation === 'horizontal') {
      return '';
    }
    if (layoutPreferences.sidebarVisibility === 'hidden') {
      return '';
    }
    if (layoutPreferences.sidebarVisibility === 'collapsed') {
      return layoutPreferences.sidebarPosition === 'right' ? 'lg:pr-[54px]' : 'lg:pl-[54px]';
    }
    return layoutPreferences.sidebarPosition === 'right' ? 'lg:pr-[260px]' : 'lg:pl-[260px]';
  }, [
    layoutPreferences.navigationOrientation,
    layoutPreferences.sidebarVisibility,
    layoutPreferences.sidebarPosition
  ]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex transition-colors">
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
      <div className={`flex-1 ${contentPaddingClass} flex flex-col min-w-0 transition-all duration-300`}>
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

        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
          <ErrorBoundary
            key={activeTab}
            fallbackTitle="View Interrupted"
            onReset={() => setActiveTab('dashboard')}
          >
            <div className="page-transition">
              {activeTab === 'dashboard' && (
                <DashboardView
                  members={members}
                  schedules={schedules}
                  allSongs={songs}
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
                  onExportPDF={handleExportPDF}
                  onExportPNG={handleExportPNG}
                  onUpdateSchedules={handleUpdateSchedules}
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
            </div>
          </ErrorBoundary>
        </main>
      </div>

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
        onClose={() => setIsWelcomeModalOpen(false)}
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
        onClose={() => setIsOnboardingOpen(false)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        initialStep={guideInitialStep}
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

      {/* New Lineup Selection Modal */}
      <NewLineupModal
        isOpen={isNewLineupModalOpen}
        onClose={() => setIsNewLineupModalOpen(false)}
        schedules={schedules}
        onLoadExistingLineup={handleLoadExistingLineup}
        onCreateNewLineup={handleCreateNewLineup}
        showToast={showToast}
      />

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
