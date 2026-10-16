import { Member, Schedule, MinistryAssignment } from '../../types';

export type StorageProviderType = 'localStorage' | 'firebase' | 'supabase';

/**
 * Common Data Repository Interface.
 * Standardizes storage actions so switching to Firebase, Supabase, or REST backends
 * requires zero changes to UI components or application business logic.
 */
export interface IDataRepository {
  /**
   * Fetch all ministry roster members
   */
  getMembers(): Promise<Member[]>;
  saveMembers(members: Member[]): Promise<void>;

  /**
   * Fetch custom ministry labels
   */
  getLabels(): Promise<string[]>;
  saveLabels(labels: string[]): Promise<void>;

  /**
   * Fetch all saved worship schedules
   */
  getSchedules(): Promise<Schedule[]>;
  saveSchedules(schedules: Schedule[]): Promise<void>;

  /**
   * Dark mode theme preference
   */
  getDarkMode(): Promise<boolean>;
  saveDarkMode(isDark: boolean): Promise<void>;

  /**
   * Unsaved scheduler draft state
   */
  getDraftSchedule(): Promise<Partial<Schedule> | null>;
  saveDraftSchedule(draft: Partial<Schedule> | null): Promise<void>;
}
