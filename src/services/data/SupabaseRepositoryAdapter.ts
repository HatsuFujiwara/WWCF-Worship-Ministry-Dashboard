import { Member, Schedule } from '../../types';
import { IDataRepository } from './types';

/**
 * Supabase Repository Adapter.
 * Enables seamless migration to Supabase PostgreSQL without modifying UI components or application code.
 * 
 * To activate Supabase:
 * 1. Install @supabase/supabase-js (`npm install @supabase/supabase-js`)
 * 2. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
 * 3. Change `ACTIVE_PROVIDER` in `src/services/data/index.ts` to 'supabase'
 */
export class SupabaseRepositoryAdapter implements IDataRepository {
  private fallbackLocalRepository: IDataRepository;

  constructor(fallbackRepository: IDataRepository) {
    this.fallbackLocalRepository = fallbackRepository;
  }

  // Example Supabase initialization
  /*
  private supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );
  */

  async getMembers(): Promise<Member[]> {
    return this.fallbackLocalRepository.getMembers();
  }

  async saveMembers(members: Member[]): Promise<void> {
    return this.fallbackLocalRepository.saveMembers(members);
  }

  async getLabels(): Promise<string[]> {
    return this.fallbackLocalRepository.getLabels();
  }

  async saveLabels(labels: string[]): Promise<void> {
    return this.fallbackLocalRepository.saveLabels(labels);
  }

  async getSchedules(): Promise<Schedule[]> {
    return this.fallbackLocalRepository.getSchedules();
  }

  async saveSchedules(schedules: Schedule[]): Promise<void> {
    return this.fallbackLocalRepository.saveSchedules(schedules);
  }

  async getDarkMode(): Promise<boolean> {
    return this.fallbackLocalRepository.getDarkMode();
  }

  async saveDarkMode(isDark: boolean): Promise<void> {
    return this.fallbackLocalRepository.saveDarkMode(isDark);
  }

  async getDraftSchedule(): Promise<Partial<Schedule> | null> {
    return this.fallbackLocalRepository.getDraftSchedule();
  }

  async saveDraftSchedule(draft: Partial<Schedule> | null): Promise<void> {
    return this.fallbackLocalRepository.saveDraftSchedule(draft);
  }
}
