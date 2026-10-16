import { Member, Schedule } from '../../types';
import { IDataRepository } from './types';

/**
 * Firebase Firestore Repository Adapter.
 * Enables seamless migration to Firebase without modifying UI components or application code.
 * 
 * To activate Firebase:
 * 1. Install firebase package (`npm install firebase`)
 * 2. Configure firebase config object in environment variables or config file
 * 3. Initialize Firebase app and Firestore instance
 * 4. Change `ACTIVE_PROVIDER` in `src/services/data/index.ts` to 'firebase'
 */
export class FirebaseRepositoryAdapter implements IDataRepository {
  private fallbackLocalRepository: IDataRepository;

  constructor(fallbackRepository: IDataRepository) {
    this.fallbackLocalRepository = fallbackRepository;
  }

  // Example Firestore initialization structure
  /*
  private db = getFirestore(firebaseApp);
  private membersCol = collection(this.db, 'members');
  private schedulesCol = collection(this.db, 'schedules');
  private configCol = collection(this.db, 'config');
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
