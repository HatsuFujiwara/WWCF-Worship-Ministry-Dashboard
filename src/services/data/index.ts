import { IDataRepository } from './types';
import { LocalStorageRepository } from './LocalStorageRepository';

/**
 * WWCF Santa Cruz Local-First Data Repository Provider.
 * Persists application state in browser LocalStorage.
 */
const localStorageRepo = new LocalStorageRepository();

export const dataRepository: IDataRepository = localStorageRepo;

export * from './types';
export * from './LocalStorageRepository';

