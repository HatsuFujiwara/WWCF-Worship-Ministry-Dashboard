import { Member, Schedule } from '../../types';
import { DEFAULT_LABELS, DEFAULT_MEMBERS, DEFAULT_SCHEDULES } from '../../data/seedData';
import { IDataRepository } from './types';
import { sanitizeMembers, sanitizeLabels, sanitizeSchedules } from '../storage';

const STORAGE_KEYS = {
  MEMBERS: 'wwcf_members_v1',
  LABELS: 'wwcf_labels_v1',
  SCHEDULES: 'wwcf_schedules_v1',
  DARK_MODE: 'wwcf_dark_mode_v1',
  DRAFT_V2: 'wwcf_draft_schedule_v2',
  DRAFT_V1: 'wwcf_draft_schedule_v1'
};

export class LocalStorageRepository implements IDataRepository {
  async getMembers(): Promise<Member[]> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MEMBERS);
      const raw: Member[] = data ? JSON.parse(data) : DEFAULT_MEMBERS;
      return sanitizeMembers(raw);
    } catch {
      return sanitizeMembers(DEFAULT_MEMBERS);
    }
  }

  async saveMembers(members: Member[]): Promise<void> {
    try {
      const sanitized = sanitizeMembers(members);
      localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(sanitized));
    } catch (e) {
      console.error('[LocalStorageRepository] Failed to save members:', e);
    }
  }

  async getLabels(): Promise<string[]> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.LABELS);
      const raw: string[] = data ? JSON.parse(data) : DEFAULT_LABELS;
      return sanitizeLabels(raw);
    } catch {
      return sanitizeLabels(DEFAULT_LABELS);
    }
  }

  async saveLabels(labels: string[]): Promise<void> {
    try {
      const sanitized = sanitizeLabels(labels);
      localStorage.setItem(STORAGE_KEYS.LABELS, JSON.stringify(sanitized));
    } catch (e) {
      console.error('[LocalStorageRepository] Failed to save labels:', e);
    }
  }

  async getSchedules(): Promise<Schedule[]> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SCHEDULES);
      const raw: Schedule[] = data ? JSON.parse(data) : DEFAULT_SCHEDULES;
      return sanitizeSchedules(raw);
    } catch {
      return sanitizeSchedules(DEFAULT_SCHEDULES);
    }
  }

  async saveSchedules(schedules: Schedule[]): Promise<void> {
    try {
      const sanitized = sanitizeSchedules(schedules);
      localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(sanitized));
    } catch (e) {
      console.error('[LocalStorageRepository] Failed to save schedules:', e);
    }
  }

  async getDarkMode(): Promise<boolean> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.DARK_MODE);
      return data ? JSON.parse(data) : false;
    } catch {
      return false;
    }
  }

  async saveDarkMode(isDark: boolean): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEYS.DARK_MODE, JSON.stringify(isDark));
    } catch (e) {
      console.error('[LocalStorageRepository] Failed to save dark mode:', e);
    }
  }

  async getDraftSchedule(): Promise<Partial<Schedule> | null> {
    try {
      let data = localStorage.getItem(STORAGE_KEYS.DRAFT_V2);
      if (!data) {
        data = localStorage.getItem(STORAGE_KEYS.DRAFT_V1);
      }
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async saveDraftSchedule(draft: Partial<Schedule> | null): Promise<void> {
    try {
      if (!draft) {
        localStorage.removeItem(STORAGE_KEYS.DRAFT_V2);
        localStorage.removeItem(STORAGE_KEYS.DRAFT_V1);
      } else {
        localStorage.setItem(STORAGE_KEYS.DRAFT_V2, JSON.stringify(draft));
      }
    } catch (e) {
      console.error('[LocalStorageRepository] Failed to save draft:', e);
    }
  }
}
