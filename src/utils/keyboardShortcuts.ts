import { KeyboardShortcutDefinition } from '../types';

export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcutDefinition[] = [
  {
    id: 'help',
    action: 'Help & User Guide',
    description: 'Open the user guide and documentation modal',
    defaultKey: 'F1',
    category: 'general'
  },
  {
    id: 'nav_dashboard',
    action: 'Dashboard',
    description: 'Navigate directly to Ministry Dashboard',
    defaultKey: 'Alt+1',
    category: 'navigation'
  },
  {
    id: 'nav_scheduler',
    action: 'Song Scheduler',
    description: 'Navigate to the Worship Setlist Line-up Scheduler',
    defaultKey: 'Alt+2',
    category: 'navigation'
  },
  {
    id: 'nav_songs',
    action: 'Song Database',
    description: 'Navigate to church song catalog and library',
    defaultKey: 'Alt+3',
    category: 'navigation'
  },
  {
    id: 'nav_schedules',
    action: 'Saved Lineups',
    description: 'Navigate to historical service lineups archive',
    defaultKey: 'Alt+4',
    category: 'navigation'
  },
  {
    id: 'nav_members',
    action: 'Member Editor',
    description: 'Navigate to worship team and roster management',
    defaultKey: 'Alt+5',
    category: 'navigation'
  },
  {
    id: 'new_lineup',
    action: 'New Lineup',
    description: 'Open the New Lineup creation / loader workflow',
    defaultKey: 'Alt+N',
    category: 'actions'
  },
  {
    id: 'save_lineup',
    action: 'Save Schedule',
    description: 'Save currently edited worship lineup to history',
    defaultKey: 'Ctrl+S',
    category: 'actions'
  },
  {
    id: 'undo',
    action: 'Undo Action',
    description: 'Undo the last persistent action or lineup editing step',
    defaultKey: 'Ctrl+Z',
    category: 'actions'
  },
  {
    id: 'redo',
    action: 'Redo Action',
    description: 'Redo the previously undone action or lineup editing step',
    defaultKey: 'Ctrl+Y',
    category: 'actions'
  }
];

/**
 * Normalizes keyboard event key combination into a standard string representation
 * Example: Alt+1, Ctrl+Shift+S, F1
 */
export function formatKeyComboFromEvent(e: KeyboardEvent): string | null {
  const parts: string[] = [];

  // Modifiers in canonical order
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');

  const rawKey = e.key;

  // Skip standalone modifier presses
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(rawKey)) {
    return null;
  }

  // Canonical key representation
  let keyName = rawKey;
  if (keyName === ' ') keyName = 'Space';
  else if (keyName.length === 1) keyName = keyName.toUpperCase();

  parts.push(keyName);
  return parts.join('+');
}

/**
 * Normalizes user-entered string or key combo for consistent matching
 */
export function normalizeKeyCombo(combo: string): string {
  if (!combo) return '';
  const parts = combo
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);

  const hasCtrl = parts.some((p) => p.toLowerCase() === 'ctrl' || p.toLowerCase() === 'control');
  const hasAlt = parts.some((p) => p.toLowerCase() === 'alt');
  const hasShift = parts.some((p) => p.toLowerCase() === 'shift');
  const hasMeta = parts.some((p) => p.toLowerCase() === 'meta' || p.toLowerCase() === 'cmd');

  const mainKeys = parts.filter(
    (p) => !['ctrl', 'control', 'alt', 'shift', 'meta', 'cmd'].includes(p.toLowerCase())
  );

  const normalizedParts: string[] = [];
  if (hasCtrl) normalizedParts.push('Ctrl');
  if (hasAlt) normalizedParts.push('Alt');
  if (hasShift) normalizedParts.push('Shift');
  if (hasMeta) normalizedParts.push('Meta');

  if (mainKeys.length > 0) {
    const k = mainKeys[0];
    if (k.length === 1) normalizedParts.push(k.toUpperCase());
    else normalizedParts.push(k);
  }

  return normalizedParts.join('+');
}

/**
 * Checks if a formatted key combination from an event matches a target combo,
 * treating Ctrl and Meta equivalently for cross-platform support (Mac Cmd vs Windows Ctrl).
 */
export function isKeyComboMatch(eventCombo: string | null, targetCombo: string): boolean {
  if (!eventCombo || !targetCombo) return false;
  if (eventCombo === targetCombo) return true;

  // Cross-platform Ctrl/Meta alias: Meta+S matches Ctrl+S, etc.
  const eventNormalized = eventCombo.replace(/^Meta\+/, 'Ctrl+');
  const targetNormalized = targetCombo.replace(/^Meta\+/, 'Ctrl+');

  return eventNormalized === targetNormalized;
}

/**
 * Resolves effective shortcut for a given action ID
 */
export function getEffectiveShortcut(
  actionId: string,
  customShortcuts: Record<string, string>
): string {
  if (customShortcuts[actionId] && customShortcuts[actionId].trim()) {
    return normalizeKeyCombo(customShortcuts[actionId]);
  }
  const found = DEFAULT_KEYBOARD_SHORTCUTS.find((s) => s.id === actionId);
  return found ? found.defaultKey : '';
}

/**
 * Checks for conflict when assigning a new combo to targetActionId.
 * Returns the conflicting action definition if another action currently uses this combo.
 */
export function findShortcutConflict(
  targetActionId: string,
  newCombo: string,
  customShortcuts: Record<string, string>
): KeyboardShortcutDefinition | null {
  const normalizedNew = normalizeKeyCombo(newCombo);
  if (!normalizedNew) return null;

  for (const def of DEFAULT_KEYBOARD_SHORTCUTS) {
    if (def.id === targetActionId) continue;
    const effective = getEffectiveShortcut(def.id, customShortcuts);
    if (effective === normalizedNew) {
      return def;
    }
  }

  return null;
}
