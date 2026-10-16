import { IDataRepository, StorageProviderType } from './types';
import { LocalStorageRepository } from './LocalStorageRepository';
import { FirebaseRepositoryAdapter } from './FirebaseRepositoryAdapter';
import { SupabaseRepositoryAdapter } from './SupabaseRepositoryAdapter';

/**
 * Repository Provider Configuration.
 * Currently uses LocalStorage by default, but is structured so developers
 * can easily switch to Firebase or Supabase by changing ACTIVE_PROVIDER
 * or setting the VITE_STORAGE_PROVIDER environment variable.
 */
const ACTIVE_PROVIDER: StorageProviderType = 
  ((import.meta as any).env?.VITE_STORAGE_PROVIDER as StorageProviderType) || 'localStorage';

const localStorageRepo = new LocalStorageRepository();

function createRepository(): IDataRepository {
  switch (ACTIVE_PROVIDER) {
    case 'firebase':
      console.log('[DataRepository] Storage Provider: Firebase (Unconfigured, falling back to Local Storage)');
      return new FirebaseRepositoryAdapter(localStorageRepo);

    case 'supabase':
      console.log('[DataRepository] Storage Provider: Supabase (Unconfigured, falling back to Local Storage)');
      return new SupabaseRepositoryAdapter(localStorageRepo);

    case 'localStorage':
    default:
      console.log('[DataRepository] Active Storage Provider: Local Storage');
      return localStorageRepo;
  }
}

export const dataRepository: IDataRepository = createRepository();

export * from './types';
export * from './LocalStorageRepository';
export * from './FirebaseRepositoryAdapter';
export * from './SupabaseRepositoryAdapter';
