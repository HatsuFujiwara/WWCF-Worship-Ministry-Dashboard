import { useEffect, useRef } from 'react';
import { StorageService } from '../services/storage';
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  formatKeyComboFromEvent,
  getEffectiveShortcut,
  isKeyComboMatch
} from '../utils/keyboardShortcuts';

export interface ShortcutHandlers {
  onHelp?: () => void;
  onNavigateDashboard?: () => void;
  onNavigateScheduler?: () => void;
  onNavigateSongs?: () => void;
  onNavigateSchedules?: () => void;
  onNavigateMembers?: () => void;
  onNewLineup?: () => void;
  onSaveLineup?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function useKeyboardShortcuts(
  handlers: ShortcutHandlers,
  options: {
    isBlocked?: boolean;
    isGuideActive?: boolean;
  } = {}
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Cached in-memory custom shortcuts map (avoids hot-path localStorage reads on every keydown)
  const customShortcutsRef = useRef<Record<string, string>>(StorageService.getCustomKeyboardShortcuts());

  useEffect(() => {
    // Listen for custom shortcut updates from settings or storage
    const handleShortcutsChanged = (e: CustomEvent<Record<string, string>>) => {
      if (e.detail) {
        customShortcutsRef.current = e.detail;
      } else {
        customShortcutsRef.current = StorageService.getCustomKeyboardShortcuts();
      }
    };

    window.addEventListener('wwcf:shortcuts-changed', handleShortcutsChanged as EventListener);
    return () => {
      window.removeEventListener('wwcf:shortcuts-changed', handleShortcutsChanged as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Guard against blocking overlays or active interactive guide
      if (optionsRef.current.isBlocked || optionsRef.current.isGuideActive) {
        return;
      }

      // 2. Guard against active modal dialogs (suppress general commands, allow only Help)
      const activeModal = document.querySelector('[role="dialog"]');
      const hasOpenModal = Boolean(activeModal);

      // Check current combo
      const combo = formatKeyComboFromEvent(e);
      if (!combo) return;

      // 3. Guard against typing inside editable controls
      const target = e.target as HTMLElement | null;
      let isEditable = false;
      if (target) {
        const tagName = target.tagName?.toLowerCase();
        isEditable =
          tagName === 'input' ||
          tagName === 'textarea' ||
          tagName === 'select' ||
          target.isContentEditable ||
          target.getAttribute('role') === 'textbox';
      }

      const customShortcuts = customShortcutsRef.current;

      for (const def of DEFAULT_KEYBOARD_SHORTCUTS) {
        const effective = getEffectiveShortcut(def.id, customShortcuts);
        const matchesPrimary = isKeyComboMatch(combo, effective);
        // Redo alias support (Ctrl+Shift+Z / Cmd+Shift+Z)
        const isRedoAlias = def.id === 'redo' && (combo === 'Ctrl+Shift+Z' || combo === 'Meta+Shift+Z');

        if (matchesPrimary || isRedoAlias) {
          // If in an editable field:
          // ONLY allow save_lineup to be intercepted in the lineup editor (preventing browser "Save Page As").
          // Suppress all other shortcuts (nav, undo, redo, new lineup) so text editing and native undo remain intact!
          if (isEditable) {
            if (def.id === 'save_lineup' && handlersRef.current.onSaveLineup) {
              e.preventDefault();
              e.stopPropagation();
              handlersRef.current.onSaveLineup();
            }
            return;
          }

          // If a modal is open, suppress everything except Help (F1)
          if (hasOpenModal && def.id !== 'help') {
            return;
          }

          e.preventDefault();
          e.stopPropagation();

          switch (def.id) {
            case 'help':
              handlersRef.current.onHelp?.();
              break;
            case 'nav_dashboard':
              handlersRef.current.onNavigateDashboard?.();
              break;
            case 'nav_scheduler':
              handlersRef.current.onNavigateScheduler?.();
              break;
            case 'nav_songs':
              handlersRef.current.onNavigateSongs?.();
              break;
            case 'nav_schedules':
              handlersRef.current.onNavigateSchedules?.();
              break;
            case 'nav_members':
              handlersRef.current.onNavigateMembers?.();
              break;
            case 'new_lineup':
              handlersRef.current.onNewLineup?.();
              break;
            case 'save_lineup':
              handlersRef.current.onSaveLineup?.();
              break;
            case 'undo':
              handlersRef.current.onUndo?.();
              break;
            case 'redo':
              handlersRef.current.onRedo?.();
              break;
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);
}
