import { ServiceType, MinistryAssignment } from '../types';
import { StorageService } from './storage';

export interface SchedulerSnapshot {
  serviceType: ServiceType;
  serviceDate: string;
  praiseSongs: string[];
  worshipSongs: string[];
  praiseSongKeys: string[];
  worshipSongKeys: string[];
  ministryRows: MinistryAssignment[];
}

export interface AppHistoryAction {
  id: string;
  description: string;
  timestamp: number;
  undo: () => Promise<void> | void;
  redo: () => Promise<void> | void;
}

export type TimelineEntryType = 'app' | 'scheduler';

export interface TimelineEntry {
  id: string;
  description: string;
  timestamp: number;
  type: TimelineEntryType;
  contextKey?: string;
  // For app actions:
  appUndo?: () => Promise<void> | void;
  appRedo?: () => Promise<void> | void;
  // For scheduler actions:
  schedulerSnapBefore?: SchedulerSnapshot;
  schedulerSnapAfter?: SchedulerSnapshot;
}

const MAX_HISTORY_LENGTH = 50;

// Single authoritative chronological timeline across all app persistent data
const pastTimeline: TimelineEntry[] = [];
const futureTimeline: TimelineEntry[] = [];
const listeners = new Set<() => void>();
const snapshotProviders = new Map<string, () => SchedulerSnapshot>();

function cloneSnapshot(snapshot: SchedulerSnapshot): SchedulerSnapshot {
  return {
    serviceType: snapshot.serviceType,
    serviceDate: snapshot.serviceDate,
    praiseSongs: [...snapshot.praiseSongs],
    worshipSongs: [...snapshot.worshipSongs],
    praiseSongKeys: [...snapshot.praiseSongKeys],
    worshipSongKeys: [...snapshot.worshipSongKeys],
    ministryRows: JSON.parse(JSON.stringify(snapshot.ministryRows || []))
  };
}

function notifyChange(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('[LineupHistoryService] Error in history subscriber:', e);
    }
  });
}

/**
 * LineupHistoryService
 * Single, authoritative, chronological Undo/Redo Engine for all persistent mutations
 * across WWCF Santa Cruz: Scheduler setlists, Song Database, Member Roster, Saved Lineups,
 * Song Families, and Backup/Transfer imports.
 */
export class LineupHistoryService {
  // --- Snapshot Provider Registration (for live SchedulerView) ---

  static registerCurrentSnapshotProvider(key: string, provider: () => SchedulerSnapshot): () => void {
    snapshotProviders.set(key, provider);
    return () => {
      if (snapshotProviders.get(key) === provider) {
        snapshotProviders.delete(key);
      }
    };
  }

  // --- Scheduler In-Lineup Snapshot Management ---

  static pushSnapshot(key: string, snapshot: SchedulerSnapshot, customDescription?: string): void {
    if (!key || !snapshot) return;

    // If previous entry was a scheduler snapshot on the same contextKey without an afterSnap, seal it
    const last = pastTimeline.length > 0 ? pastTimeline[pastTimeline.length - 1] : null;
    if (last && last.type === 'scheduler' && last.contextKey === key && !last.schedulerSnapAfter) {
      last.schedulerSnapAfter = cloneSnapshot(snapshot);
    }

    const entry: TimelineEntry = {
      id: `sched_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      description: customDescription || 'Edited lineup in scheduler',
      timestamp: Date.now(),
      type: 'scheduler',
      contextKey: key,
      schedulerSnapBefore: cloneSnapshot(snapshot),
      schedulerSnapAfter: undefined
    };

    pastTimeline.push(entry);
    if (pastTimeline.length > MAX_HISTORY_LENGTH) {
      pastTimeline.shift();
    }

    // New mutation clears redo branch
    futureTimeline.length = 0;
    notifyChange();
  }

  // --- App-Wide Persistent Action Management ---

  static pushAppAction(action: Omit<AppHistoryAction, 'id' | 'timestamp'> & { id?: string }): void {
    // If previous entry was an unsealed scheduler snapshot, capture its current state before moving forward
    const last = pastTimeline.length > 0 ? pastTimeline[pastTimeline.length - 1] : null;
    if (last && last.type === 'scheduler' && last.contextKey && !last.schedulerSnapAfter) {
      const provider = snapshotProviders.get(last.contextKey);
      if (provider) {
        try {
          last.schedulerSnapAfter = cloneSnapshot(provider());
        } catch {}
      }
    }

    const entry: TimelineEntry = {
      id: action.id || `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      description: action.description,
      timestamp: Date.now(),
      type: 'app',
      appUndo: action.undo,
      appRedo: action.redo
    };

    pastTimeline.push(entry);
    if (pastTimeline.length > MAX_HISTORY_LENGTH) {
      pastTimeline.shift();
    }

    futureTimeline.length = 0;
    notifyChange();
  }

  // --- Unified Chronological Undo / Redo Execution ---

  static async undo(key?: string, currentSnapshot?: SchedulerSnapshot): Promise<TimelineEntry | null> {
    if (pastTimeline.length === 0) return null;

    const entry = pastTimeline.pop()!;

    try {
      if (entry.type === 'app' && entry.appUndo) {
        await entry.appUndo();
        futureTimeline.push(entry);
        notifyChange();
        return entry;
      }

      if (entry.type === 'scheduler' && entry.schedulerSnapBefore) {
        // If afterSnap wasn't recorded, capture it from currentSnapshot or live provider
        if (!entry.schedulerSnapAfter) {
          if (currentSnapshot) {
            entry.schedulerSnapAfter = cloneSnapshot(currentSnapshot);
          } else if (entry.contextKey && snapshotProviders.has(entry.contextKey)) {
            try {
              entry.schedulerSnapAfter = cloneSnapshot(snapshotProviders.get(entry.contextKey)!());
            } catch {}
          }
        }

        const targetSnap = cloneSnapshot(entry.schedulerSnapBefore);
        this.restoreSchedulerSnapshot(entry.contextKey || 'new_schedule', targetSnap);

        futureTimeline.push(entry);
        notifyChange();
        return entry;
      }

      return null;
    } catch (err) {
      console.error(`[LineupHistoryService] Failed to undo action "${entry.description}":`, err);
      // Re-insert failed entry back to pastTimeline to preserve state integrity
      pastTimeline.push(entry);
      notifyChange();
      throw err;
    }
  }

  static async redo(key?: string, currentSnapshot?: SchedulerSnapshot): Promise<TimelineEntry | null> {
    if (futureTimeline.length === 0) return null;

    const entry = futureTimeline.pop()!;

    try {
      if (entry.type === 'app' && entry.appRedo) {
        await entry.appRedo();
        pastTimeline.push(entry);
        notifyChange();
        return entry;
      }

      if (entry.type === 'scheduler' && entry.schedulerSnapAfter) {
        const targetSnap = cloneSnapshot(entry.schedulerSnapAfter);
        this.restoreSchedulerSnapshot(entry.contextKey || 'new_schedule', targetSnap);

        pastTimeline.push(entry);
        notifyChange();
        return entry;
      }

      return null;
    } catch (err) {
      console.error(`[LineupHistoryService] Failed to redo action "${entry.description}":`, err);
      futureTimeline.push(entry);
      notifyChange();
      throw err;
    }
  }

  static restoreSchedulerSnapshot(key: string, snap: SchedulerSnapshot): void {
    // 1. Dispatch custom DOM event for active SchedulerView component
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('wwcf:restore-scheduler-snapshot', {
          detail: { key, snapshot: snap }
        })
      );
    }

    // 2. Persist to draft schedule storage so unmounted/next mount loads it
    try {
      StorageService.saveDraftSchedule({
        serviceType: snap.serviceType,
        serviceDate: snap.serviceDate,
        praiseSongs: [...snap.praiseSongs],
        worshipSongs: [...snap.worshipSongs],
        praiseSongKeys: [...snap.praiseSongKeys],
        worshipSongKeys: [...snap.worshipSongKeys],
        ministryAssignments: JSON.parse(JSON.stringify(snap.ministryRows || []))
      });
    } catch (e) {
      console.warn('[LineupHistoryService] Failed to update draft schedule during undo:', e);
    }
  }

  // --- Query Methods ---

  static canUndo(key?: string): boolean {
    return pastTimeline.length > 0;
  }

  static canRedo(key?: string): boolean {
    return futureTimeline.length > 0;
  }

  static canUndoApp(): boolean {
    return pastTimeline.length > 0;
  }

  static canRedoApp(): boolean {
    return futureTimeline.length > 0;
  }

  static async undoAppAction(): Promise<TimelineEntry | null> {
    const res = await this.undo();
    return res as TimelineEntry | null;
  }

  static async redoAppAction(): Promise<TimelineEntry | null> {
    const res = await this.redo();
    return res as TimelineEntry | null;
  }

  static peekUndoApp(): TimelineEntry | null {
    return pastTimeline.length > 0 ? pastTimeline[pastTimeline.length - 1] : null;
  }

  static peekRedoApp(): TimelineEntry | null {
    return futureTimeline.length > 0 ? futureTimeline[futureTimeline.length - 1] : null;
  }

  static peekUndoDescription(): string | null {
    const entry = this.peekUndoApp();
    return entry ? entry.description : null;
  }

  static peekRedoDescription(): string | null {
    const entry = this.peekRedoApp();
    return entry ? entry.description : null;
  }

  static clearHistory(key?: string): void {
    // Retain global past/future timeline; clean up snapshot providers for key
    if (key) {
      snapshotProviders.delete(key);
    }
    notifyChange();
  }

  static clearAll(): void {
    pastTimeline.length = 0;
    futureTimeline.length = 0;
    snapshotProviders.clear();
    notifyChange();
  }

  static clearAppHistory(): void {
    this.clearAll();
  }

  static subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
}
