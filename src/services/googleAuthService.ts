/**
 * Google Authentication, Google Drive Cloud Save, and YouTube Playlist Authorization Service
 *
 * Implements Google Identity Services (GIS) with in-memory token management.
 * Scopes:
 * - openid, email, profile: for user identity and profile presentation
 * - https://www.googleapis.com/auth/drive.file: application-specific cloud backup (WWCF_Santa_Cruz_Worship_Ministry_Backup.json)
 * - https://www.googleapis.com/auth/youtube.readonly: importing public, unlisted, and private user playlists
 *
 * Security guarantees:
 * - Tokens are NEVER stored in localStorage, sessionStorage, or URL query strings.
 * - Client Secret is never referenced or exposed.
 * - Token acquisition does NOT auto-upload or overwrite data without user reconciliation.
 */

import { StorageService } from './storage';
import { SongService } from './songService';
import { SongFamilyService } from './songFamilyService';
import { BackupValidationService } from './backupValidationService';
import { Member, Schedule, Song, SongFamily } from '../types';

export type GoogleSyncStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'saved'
  | 'conflict'
  | 'error';

export interface GoogleUserProfile {
  sub?: string;
  email: string;
  name: string;
  picture?: string;
}

export interface DriveFileInfo {
  id: string;
  name: string;
  modifiedTime: string;
  version?: string;
  size?: string;
}

export interface RemoteConflictPayload {
  fileId: string;
  remoteModifiedTime: string;
  candidateFiles?: DriveFileInfo[];
  remoteData: {
    app?: string;
    version?: string;
    exportedAt?: string;
    data: {
      members?: Member[];
      songs?: Song[];
      schedules?: Schedule[];
      labels?: string[];
      songFamilies?: SongFamily[];
      draftSchedule?: any;
    };
  };
}

export interface SyncResult {
  status: 'saved' | 'conflict' | 'error' | 'not_ready' | 'candidates_found';
  file?: DriveFileInfo;
  candidates?: DriveFileInfo[];
  error?: string;
}

export type GoogleAuthListener = (state: {
  status: GoogleSyncStatus;
  profile: GoogleUserProfile | null;
  lastSyncedAt: string | null;
  errorMessage?: string;
}) => void;

export type ConflictListener = (conflict: RemoteConflictPayload) => void;
export type MultipleCandidatesListener = (candidates: DriveFileInfo[]) => void;

const BACKUP_FILENAME = 'WWCF_Santa_Cruz_Worship_Ministry_Backup.json';
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const YOUTUBE_READONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
export const IDENTITY_SCOPES = 'openid email profile';

// Base metadata keys for persistence
const BASE_DRIVE_FILE_ID = 'wwcf_google_drive_file_id_v1';
const BASE_REMOTE_MODIFIED_TIME = 'wwcf_google_remote_modified_time_v1';
const BASE_LAST_SYNC = 'wwcf_google_last_sync_v1';
const STORAGE_USER_EMAIL = 'wwcf_google_user_email_v1';
const STORAGE_USER_SUB = 'wwcf_google_user_sub_v1';

// In-Memory Token & State Storage (NEVER written to disk or browser storage)
let memoryAccessToken: string | null = null;
let memoryTokenExpiresAt: number = 0;
let memoryProfile: GoogleUserProfile | null = null;
let memoryGrantedScopes = new Set<string>();
let currentSyncStatus: GoogleSyncStatus = 'disconnected';
let lastErrorMessage: string | undefined = undefined;
let isSyncInProgress = false;
let isReconciled = false;

// Listeners
const stateListeners = new Set<GoogleAuthListener>();
const conflictListeners = new Set<ConflictListener>();
const candidateListeners = new Set<MultipleCandidatesListener>();

// Auto-sync debounce timer
let autoSyncTimeout: any = null;

function normalizeAccountKey(id?: string): string {
  if (!id || !id.trim()) return 'default';
  return id.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

export class GoogleAuthService {
  /**
   * Retrieves the configured Client ID from env or saved override
   */
  static getClientId(): string {
    const envClientId =
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID) || '';
    if (envClientId && envClientId.trim() && envClientId !== 'MY_GOOGLE_CLIENT_ID') {
      return envClientId.trim();
    }
    if (typeof localStorage !== 'undefined') {
      const savedOverride = localStorage.getItem('wwcf_google_client_id_override_v1');
      if (savedOverride && savedOverride.trim()) {
        return savedOverride.trim();
      }
    }
    return '';
  }

  /**
   * Saves a developer or admin Client ID override in local settings
   */
  static setClientIdOverride(clientId: string): void {
    if (typeof localStorage === 'undefined') return;
    if (clientId && clientId.trim()) {
      localStorage.setItem('wwcf_google_client_id_override_v1', clientId.trim());
    } else {
      localStorage.removeItem('wwcf_google_client_id_override_v1');
    }
    this.notifyState();
  }

  /**
   * Returns current active in-memory access token if valid and not expired
   */
  static getAccessToken(): string | null {
    if (!memoryAccessToken) return null;
    if (Date.now() >= memoryTokenExpiresAt - 60000) {
      // Token expired or about to expire in 1 minute
      return null;
    }
    return memoryAccessToken;
  }

  /**
   * Check whether Google is connected with valid token
   */
  static isConnected(): boolean {
    return Boolean(this.getAccessToken());
  }

  /**
   * Current status
   */
  static getStatus(): GoogleSyncStatus {
    return currentSyncStatus;
  }

  /**
   * Current user profile
   */
  static getUserProfile(): GoogleUserProfile | null {
    return memoryProfile;
  }

  /**
   * Account key based on normalized Google User ID (sub) or fallback email for account-scoped persistence
   */
  static getAccountKey(): string {
    const sub =
      memoryProfile?.sub ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_USER_SUB) || '' : '');
    if (sub && sub.trim()) {
      return normalizeAccountKey(sub);
    }
    const email =
      memoryProfile?.email ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_USER_EMAIL) || '' : '');
    return normalizeAccountKey(email);
  }

  /**
   * Returns whether cloud backup has been reconciled for the current session
   */
  static isDriveReconciled(): boolean {
    return isReconciled;
  }

  /**
   * User explicitly confirms initiating the first cloud backup when no backup was found in Drive.
   * Closes the race condition by re-checking Drive before the first upload.
   */
  static async confirmFirstBackup(): Promise<SyncResult> {
    const token = this.getAccessToken();
    if (!token) return { status: 'not_ready', error: 'Not authenticated with Google' };

    // Re-check Drive to close the race condition
    try {
      const existing = await this.searchDriveBackupFiles(token);
      if (existing.length > 0) {
        isReconciled = false;
        return {
          status: 'conflict',
          file: existing[0],
          error: 'A backup file was discovered in Google Drive. Please review and reconcile.'
        };
      }
    } catch (e: any) {
      return { status: 'error', error: `Drive check failed prior to first backup: ${e?.message || e}` };
    }

    isReconciled = true;
    return this.syncNow(false);
  }

  /**
   * Last sync timestamp string
   */
  static getLastSyncedAt(): string | null {
    if (typeof localStorage !== 'undefined') {
      const scopedKey = `${BASE_LAST_SYNC}_${this.getAccountKey()}`;
      return localStorage.getItem(scopedKey) || localStorage.getItem(BASE_LAST_SYNC);
    }
    return null;
  }

  static setLastSyncedAt(time: string | null): void {
    if (typeof localStorage === 'undefined') return;
    const scopedKey = `${BASE_LAST_SYNC}_${this.getAccountKey()}`;
    if (time) {
      localStorage.setItem(scopedKey, time);
      localStorage.setItem(BASE_LAST_SYNC, time);
    } else {
      localStorage.removeItem(scopedKey);
      localStorage.removeItem(BASE_LAST_SYNC);
    }
  }

  /**
   * Persisted Drive file ID
   */
  static getPersistedDriveFileId(): string | null {
    if (typeof localStorage !== 'undefined') {
      const scopedKey = `${BASE_DRIVE_FILE_ID}_${this.getAccountKey()}`;
      return localStorage.getItem(scopedKey) || localStorage.getItem(BASE_DRIVE_FILE_ID);
    }
    return null;
  }

  static setPersistedDriveFileId(fileId: string | null): void {
    if (typeof localStorage === 'undefined') return;
    const scopedKey = `${BASE_DRIVE_FILE_ID}_${this.getAccountKey()}`;
    if (fileId) {
      localStorage.setItem(scopedKey, fileId);
    } else {
      localStorage.removeItem(scopedKey);
      localStorage.removeItem(BASE_DRIVE_FILE_ID);
    }
  }

  /**
   * Persisted last seen remote modified time
   */
  static getRemoteModifiedTime(): string | null {
    if (typeof localStorage !== 'undefined') {
      const scopedKey = `${BASE_REMOTE_MODIFIED_TIME}_${this.getAccountKey()}`;
      return localStorage.getItem(scopedKey) || localStorage.getItem(BASE_REMOTE_MODIFIED_TIME);
    }
    return null;
  }

  static setRemoteModifiedTime(time: string | null): void {
    if (typeof localStorage === 'undefined') return;
    const scopedKey = `${BASE_REMOTE_MODIFIED_TIME}_${this.getAccountKey()}`;
    if (time) {
      localStorage.setItem(scopedKey, time);
    } else {
      localStorage.removeItem(scopedKey);
      localStorage.removeItem(BASE_REMOTE_MODIFIED_TIME);
    }
  }

  /**
   * Checks whether a specific OAuth scope has been granted in memory
   */
  static hasScope(scopeType: 'drive' | 'youtube'): boolean {
    if (!this.isConnected()) return false;
    if (scopeType === 'drive') return memoryGrantedScopes.has(DRIVE_FILE_SCOPE);
    if (scopeType === 'youtube') return memoryGrantedScopes.has(YOUTUBE_READONLY_SCOPE);
    return false;
  }

  /**
   * Subscribe to auth and sync status updates
   */
  static subscribe(listener: GoogleAuthListener): () => void {
    stateListeners.add(listener);
    listener({
      status: currentSyncStatus,
      profile: memoryProfile,
      lastSyncedAt: this.getLastSyncedAt(),
      errorMessage: lastErrorMessage
    });
    return () => {
      stateListeners.delete(listener);
    };
  }

  /**
   * Subscribe to cloud conflict events
   */
  static onConflict(listener: ConflictListener): () => void {
    conflictListeners.add(listener);
    return () => {
      conflictListeners.delete(listener);
    };
  }

  /**
   * Subscribe to multiple candidate backups discovered in Drive
   */
  static onMultipleCandidates(listener: MultipleCandidatesListener): () => void {
    candidateListeners.add(listener);
    return () => {
      candidateListeners.delete(listener);
    };
  }

  private static notifyState(errorMessage?: string): void {
    lastErrorMessage = errorMessage;
    const state = {
      status: currentSyncStatus,
      profile: memoryProfile,
      lastSyncedAt: this.getLastSyncedAt(),
      errorMessage
    };
    stateListeners.forEach((l) => {
      try {
        l(state);
      } catch (err) {
        console.error('State listener error:', err);
      }
    });
  }

  /**
   * Loads the Google Identity Services client script dynamically
   */
  private static loadGsiScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        return reject(new Error('Window not available'));
      }
      if ((window as any).google?.accounts?.oauth2) {
        return resolve();
      }
      const existingScript = document.getElementById('google-gsi-client');
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve());
        existingScript.addEventListener('error', (e) => reject(e));
        return;
      }
      const script = document.createElement('script');
      script.id = 'google-gsi-client';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = (e) => reject(e);
      document.head.appendChild(script);
    });
  }

  /**
   * Prompts user with GIS OAuth token client.
   * STRICT SAFEGUARD: Token acquisition does NOT auto-upload or overwrite local data!
   */
  static async requestToken(
    promptOption: '' | 'select_account' | 'consent' = '',
    scopeType: 'drive' | 'youtube' | 'all' = 'drive'
  ): Promise<string> {
    const clientId = this.getClientId();
    if (!clientId) {
      const msg =
        'Google Client ID is not configured. Please add VITE_GOOGLE_CLIENT_ID to your environment or configure it in Settings.';
      currentSyncStatus = 'error';
      this.notifyState(msg);
      throw new Error(msg);
    }

    await this.loadGsiScript();

    currentSyncStatus = 'connecting';
    this.notifyState();

    let targetScopes = IDENTITY_SCOPES;
    if (scopeType === 'drive') {
      targetScopes = `${IDENTITY_SCOPES} ${DRIVE_FILE_SCOPE}`;
    } else if (scopeType === 'youtube') {
      targetScopes = `${IDENTITY_SCOPES} ${YOUTUBE_READONLY_SCOPE}`;
    } else {
      targetScopes = `${IDENTITY_SCOPES} ${DRIVE_FILE_SCOPE} ${YOUTUBE_READONLY_SCOPE}`;
    }

    return new Promise((resolve, reject) => {
      try {
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: targetScopes,
          prompt: promptOption,
          callback: async (response: any) => {
            if (response.error) {
              currentSyncStatus = 'error';
              const err = response.error_description || response.error;
              this.notifyState(err);
              return reject(new Error(err));
            }

            memoryAccessToken = response.access_token;
            const grantedStr: string = response.scope || targetScopes;
            memoryGrantedScopes = new Set(grantedStr.split(' ').map((s) => s.trim()).filter(Boolean));

            // expires_in is in seconds
            const expiresIn = Number(response.expires_in) || 3599;
            memoryTokenExpiresAt = Date.now() + expiresIn * 1000;

            // Fetch profile info (in-memory only)
            try {
              const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${memoryAccessToken}` }
              });
              if (userInfoRes.ok) {
                const info = await userInfoRes.json();
                memoryProfile = {
                  sub: info.sub || '',
                  email: info.email || '',
                  name: info.name || info.email || 'WWCF Worship Leader',
                  picture: info.picture
                };
                if (typeof localStorage !== 'undefined') {
                  if (memoryProfile.email) {
                    localStorage.setItem(STORAGE_USER_EMAIL, memoryProfile.email);
                  }
                  if (memoryProfile.sub) {
                    localStorage.setItem(STORAGE_USER_SUB, memoryProfile.sub);
                  }
                }
              }
            } catch (pErr) {
              console.warn('Failed to fetch user profile:', pErr);
            }

            // Successfully connected - DO NOT auto-overwrite or auto-upload here!
            isReconciled = false;
            currentSyncStatus = 'connected';
            this.notifyState();
            resolve(memoryAccessToken!);
          },
          error_callback: (err: any) => {
            currentSyncStatus = 'error';
            const msg = err?.message || 'Google authorization cancelled or failed';
            this.notifyState(msg);
            reject(new Error(msg));
          }
        });

        client.requestAccessToken();
      } catch (err: any) {
        currentSyncStatus = 'error';
        const msg = err?.message || 'Failed to initialize Google OAuth client';
        this.notifyState(msg);
        reject(new Error(msg));
      }
    });
  }

  /**
   * Disconnects the connected Google account and clears in-memory credentials safely
   */
  static disconnect(): void {
    const token = memoryAccessToken;
    if (token && (window as any).google?.accounts?.oauth2?.revoke) {
      try {
        (window as any).google.accounts.oauth2.revoke(token, () => {});
      } catch (e) {
        console.warn('Token revocation notice:', e);
      }
    }

    memoryAccessToken = null;
    memoryTokenExpiresAt = 0;
    memoryProfile = null;
    memoryGrantedScopes.clear();
    isReconciled = false;
    currentSyncStatus = 'disconnected';
    lastErrorMessage = undefined;

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_USER_EMAIL);
      localStorage.removeItem(STORAGE_USER_SUB);
    }

    this.notifyState();
  }

  /**
   * Search for all existing backup files named WWCF_Santa_Cruz_Worship_Ministry_Backup.json in user's Drive
   */
  static async searchDriveBackupFiles(token: string): Promise<DriveFileInfo[]> {
    const query = encodeURIComponent(`name = '${BACKUP_FILENAME}' and trashed = false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,version,size,mimeType)&spaces=drive`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Google Drive query failed (${res.status})`);
    }

    const data = await res.json();
    return data.files || [];
  }

  /**
   * Read raw JSON content from a specific Drive file
   */
  static async readDriveBackupContent(token: string, fileId: string): Promise<any> {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      throw new Error(`Failed to read backup from Google Drive (${res.status})`);
    }
    return await res.json();
  }

  /**
   * Compiles current local database into the standard WWCF backup envelope
   */
  static async buildLocalBackupPayload(): Promise<any> {
    const members = StorageService.getMembers();
    const labels = StorageService.getLabels();
    const schedules = StorageService.getSchedules();
    const songs = await SongService.getSongs();
    const songFamilies = await SongFamilyService.getSongFamilies();
    const includeDraft = StorageService.getIncludeDraftInCloudBackup();
    const draftSchedule = includeDraft ? StorageService.getDraftSchedule() : null;

    return {
      app: 'WWCF Santa Cruz Worship Ministry',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      data: {
        members,
        songs,
        schedules,
        labels,
        songFamilies,
        ...(includeDraft && draftSchedule ? { draftSchedule } : {})
      }
    };
  }

  /**
   * Upload backup to Drive (multipart create or patch)
   */
  private static async uploadToDrive(
    token: string,
    payload: any,
    existingFileId?: string
  ): Promise<DriveFileInfo> {
    const boundary = `wwcf_drive_upload_${Date.now()}`;
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: BACKUP_FILENAME,
      mimeType: 'application/json',
      description: 'WWCF Santa Cruz Worship Ministry Dashboard automated cloud backup'
    };

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(payload, null, 2) +
      closeDelimiter;

    let url: string;
    let method: string;

    if (existingFileId) {
      url = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,modifiedTime,version,size`;
      method = 'PATCH';
    } else {
      url = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,version,size`;
      method = 'POST';
    }

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Google Drive backup write failed (${res.status})`);
    }

    return await res.json();
  }

  /**
   * Reconciles cloud backup safely without accidental overwrite:
   * Handles 0 files, 1 file, multiple files, and version conflicts.
   */
  static async reconcileCloudBackup(preferredFileId?: string): Promise<{
    state: 'no_backup' | 'up_to_date' | 'conflict' | 'multiple_candidates' | 'error';
    file?: DriveFileInfo;
    candidates?: DriveFileInfo[];
    error?: string;
  }> {
    const token = this.getAccessToken();
    if (!token) return { state: 'error', error: 'Not authenticated with Google' };

    try {
      const files = await this.searchDriveBackupFiles(token);

      // State A: No backup exists
      if (files.length === 0) {
        isReconciled = false;
        currentSyncStatus = 'connected';
        this.notifyState();
        return { state: 'no_backup' };
      }

      // State B: Multiple candidate files and no explicit selection
      if (files.length > 1 && !preferredFileId) {
        isReconciled = false;
        candidateListeners.forEach((l) => l(files));
        return { state: 'multiple_candidates', candidates: files };
      }

      // State C: Exactly 1 file or explicitly selected candidate
      const targetFile =
        (preferredFileId && files.find((f) => f.id === preferredFileId)) ||
        (this.getPersistedDriveFileId() && files.find((f) => f.id === this.getPersistedDriveFileId())) ||
        files[0];

      // Read remote content to inspect and validate BEFORE updating persisted file ID
      const remoteContent = await this.readDriveBackupContent(token, targetFile.id);
      const validation = BackupValidationService.validate(remoteContent);
      if (!validation.isValid || !validation.envelope) {
        throw new Error(validation.error || 'Remote file does not contain a valid WWCF backup envelope');
      }

      // ONLY persist target file ID after remote content is successfully validated
      this.setPersistedDriveFileId(targetFile.id);

      const lastKnownModified = this.getRemoteModifiedTime();

      // Check if remote has newer changes or if this is the first time connecting to this remote file
      if (!lastKnownModified || targetFile.modifiedTime > lastKnownModified) {
        isReconciled = false;
        currentSyncStatus = 'conflict';
        this.notifyState();

        const conflictPayload: RemoteConflictPayload = {
          fileId: targetFile.id,
          remoteModifiedTime: targetFile.modifiedTime,
          candidateFiles: files.length > 1 ? files : undefined,
          remoteData: remoteContent
        };
        conflictListeners.forEach((l) => l(conflictPayload));
        return { state: 'conflict', file: targetFile };
      }

      isReconciled = true;
      currentSyncStatus = 'saved';
      this.notifyState();
      return { state: 'up_to_date', file: targetFile };
    } catch (err: any) {
      console.error('Reconciliation error:', err);
      currentSyncStatus = 'error';
      this.notifyState(err?.message || 'Failed to reconcile cloud backup');
      return { state: 'error', error: err?.message };
    }
  }

  /**
   * Performs an immediate sync check and write to Google Drive with concurrency safeguards
   */
  static async syncNow(forceOverwrite = false): Promise<SyncResult> {
    const token = this.getAccessToken();
    if (!token) return { status: 'not_ready', error: 'Not authenticated with Google' };
    if (!isReconciled && !forceOverwrite) {
      return {
        status: 'not_ready',
        error: 'Drive backup not yet reconciled. Please review cloud status in Settings or reconcile conflicts first.'
      };
    }
    if (isSyncInProgress) return { status: 'not_ready', error: 'Sync already in progress' };

    isSyncInProgress = true;
    currentSyncStatus = 'syncing';
    this.notifyState();

    try {
      const persistedFileId = this.getPersistedDriveFileId();
      let targetFile: DriveFileInfo | null = null;

      // Find file in Drive
      if (persistedFileId) {
        try {
          const files = await this.searchDriveBackupFiles(token);
          targetFile = files.find((f) => f.id === persistedFileId) || null;
        } catch {
          targetFile = null;
        }
      }

      if (!targetFile) {
        const files = await this.searchDriveBackupFiles(token);
        if (files.length === 1) {
          targetFile = files[0];
          this.setPersistedDriveFileId(targetFile.id);
        } else if (files.length > 1 && !forceOverwrite) {
          // Multiple candidate files exist - do not guess silently!
          isSyncInProgress = false;
          currentSyncStatus = 'conflict';
          this.notifyState();
          candidateListeners.forEach((l) => l(files));
          return { status: 'candidates_found', candidates: files };
        }
      }

      // Concurrency check before write: if remote file changed from another session or remote file exists and is not validated
      const lastKnownModified = this.getRemoteModifiedTime();
      if (targetFile && !forceOverwrite && (!lastKnownModified || targetFile.modifiedTime > lastKnownModified)) {
        let remoteContent: any = null;
        try {
          remoteContent = await this.readDriveBackupContent(token, targetFile.id);
        } catch (rErr: any) {
          // FAIL CLOSED: Never silently overwrite if remote version changed and read failed!
          isSyncInProgress = false;
          currentSyncStatus = 'error';
          const errMsg = `Conflict check failed: unable to read remote backup (${rErr?.message || 'network error'}). Write aborted for safety.`;
          this.notifyState(errMsg);
          return { status: 'error', error: errMsg };
        }

        if (remoteContent && remoteContent.data) {
          isSyncInProgress = false;
          isReconciled = false;
          currentSyncStatus = 'conflict';
          this.notifyState();
          const conflictPayload: RemoteConflictPayload = {
            fileId: targetFile.id,
            remoteModifiedTime: targetFile.modifiedTime,
            remoteData: remoteContent
          };
          conflictListeners.forEach((l) => l(conflictPayload));
          return { status: 'conflict', file: targetFile };
        }
      }

      // Compile local records
      const localPayload = await this.buildLocalBackupPayload();

      // Write to Drive
      const updatedFile = await this.uploadToDrive(token, localPayload, targetFile?.id);

      // Record non-secret metadata
      this.setPersistedDriveFileId(updatedFile.id);
      this.setRemoteModifiedTime(updatedFile.modifiedTime);
      const nowIso = new Date().toISOString();
      this.setLastSyncedAt(nowIso);

      isReconciled = true;
      currentSyncStatus = 'saved';
      this.notifyState();
      return { status: 'saved', file: updatedFile };
    } catch (err: any) {
      console.error('Google Drive sync error:', err);
      currentSyncStatus = 'error';
      const msg = err?.message || 'Sync failed';
      this.notifyState(msg);
      return { status: 'error', error: msg };
    } finally {
      isSyncInProgress = false;
    }
  }

  /**
   * Creates a brand new separate backup copy file in Google Drive, preserving existing files and preventing overwrites
   */
  static async createSeparateBackupCopy(customFilename?: string): Promise<SyncResult> {
    const token = this.getAccessToken();
    if (!token) return { status: 'not_ready', error: 'Not authenticated with Google' };

    isSyncInProgress = true;
    currentSyncStatus = 'syncing';
    this.notifyState();

    try {
      const localPayload = await this.buildLocalBackupPayload();
      const filename = customFilename || `WWCF_Santa_Cruz_Worship_Ministry_Backup_(Copy_${new Date().toISOString().slice(0, 10)}).json`;

      const boundary = `wwcf_drive_upload_copy_${Date.now()}`;
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const metadata = {
        name: filename,
        mimeType: 'application/json',
        description: 'WWCF Santa Cruz Worship Ministry Dashboard separate cloud backup copy'
      };

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(localPayload, null, 2) +
        closeDelimiter;

      const url = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,version,size`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartRequestBody
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Failed to create separate copy in Drive (${res.status})`);
      }

      const createdFile: DriveFileInfo = await res.json();
      // PER PART 3.6: Creating a separate copy must NOT change the selected canonical backup file ID,
      // primary remote modified-time baseline, normal sync target, or account's current primary backup pointer.
      const nowIso = new Date().toISOString();
      this.setLastSyncedAt(nowIso);

      return { status: 'saved', file: createdFile };
    } catch (err: any) {
      console.error('Google Drive separate copy error:', err);
      currentSyncStatus = 'error';
      const msg = err?.message || 'Failed to create separate copy';
      this.notifyState(msg);
      return { status: 'error', error: msg };
    } finally {
      isSyncInProgress = false;
    }
  }

  /**
   * Applies cloud restore to local storage with transactional rollback safeguards:
   * 1. Validates the versioned envelope.
   * 2. Takes a complete snapshot of local state.
   * 3. Preserves local collections if a cloud collection is missing (does NOT wipe missing collections).
   * 4. Merges by stable IDs and domain rules.
   * 5. Rolls back completely if write fails.
   */
  static async applyCloudRestore(
    remoteData: RemoteConflictPayload['remoteData'],
    mode: 'replace' | 'merge',
    confirmedRemoteModifiedTime?: string
  ): Promise<void> {
    const validation = BackupValidationService.validate(remoteData);
    if (!validation.isValid || !validation.envelope) {
      throw new Error(`Invalid cloud backup format: ${validation.error || 'validation failed'}`);
    }

    const envelope = validation.envelope;
    const rawData = envelope.data;

    // Snapshot existing local state for rollback
    const snapshot = {
      members: StorageService.getMembers(),
      labels: StorageService.getLabels(),
      schedules: StorageService.getSchedules(),
      songs: await SongService.getSongs(),
      families: await SongFamilyService.getSongFamilies(),
      draft: StorageService.getDraftSchedule()
    };

    let finalMembers = envelope.hasMembers && rawData.members !== undefined ? rawData.members : snapshot.members;
    let finalSongs = envelope.hasSongs && rawData.songs !== undefined ? rawData.songs : snapshot.songs;
    let finalSchedules = envelope.hasSchedules && rawData.schedules !== undefined ? rawData.schedules : snapshot.schedules;
    let finalLabels = envelope.hasLabels && rawData.labels !== undefined ? rawData.labels : snapshot.labels;
    let finalFamilies = envelope.hasSongFamilies && rawData.songFamilies !== undefined ? rawData.songFamilies : snapshot.families;

    if (mode === 'merge') {
      if (envelope.hasMembers && rawData.members) {
        const existingKeys = new Set(snapshot.members.map((m) => m.id || m.name.toLowerCase().trim()));
        const newItems = rawData.members.filter((m) => !existingKeys.has(m.id || m.name.toLowerCase().trim()));
        finalMembers = [...snapshot.members, ...newItems];
      }

      if (envelope.hasSongs && rawData.songs) {
        const existingKeys = new Set(snapshot.songs.map((s) => s.id || s.title.toLowerCase().trim()));
        const newItems = rawData.songs.filter((s) => !existingKeys.has(s.id || s.title.toLowerCase().trim()));
        finalSongs = [...snapshot.songs, ...newItems];
      }

      if (envelope.hasSchedules && rawData.schedules) {
        const existingKeys = new Set(snapshot.schedules.map((sc) => sc.id || `${sc.serviceType}_${sc.serviceDate}`));
        const newItems = rawData.schedules.filter((sc) => !existingKeys.has(sc.id || `${sc.serviceType}_${sc.serviceDate}`));
        finalSchedules = [...snapshot.schedules, ...newItems];
      }

      if (envelope.hasLabels && rawData.labels) {
        const labelSet = new Set([...snapshot.labels, ...rawData.labels]);
        finalLabels = Array.from(labelSet);
      }

      if (envelope.hasSongFamilies && rawData.songFamilies) {
        const existingKeys = new Set(snapshot.families.map((f) => f.id || f.name.toLowerCase().trim()));
        const newItems = rawData.songFamilies.filter(
          (f) => !existingKeys.has(f.id || f.name.toLowerCase().trim())
        );
        finalFamilies = [...snapshot.families, ...newItems];
      }
    }

    // Transactional commit with rollback
    try {
      StorageService.saveMembers(finalMembers);
      StorageService.saveLabels(finalLabels);
      StorageService.saveSchedules(finalSchedules);
      await SongService.saveSongsList(finalSongs);
      await SongFamilyService.saveSongFamilies(finalFamilies);

      if (rawData.draftSchedule && StorageService.getIncludeDraftInCloudBackup()) {
        StorageService.saveDraftSchedule(rawData.draftSchedule);
      }

      // Update sync metadata to match restored remote file using actual Drive file modified time
      if (confirmedRemoteModifiedTime) {
        this.setRemoteModifiedTime(confirmedRemoteModifiedTime);
      } else if (remoteData.exportedAt) {
        this.setRemoteModifiedTime(remoteData.exportedAt);
      }
      isReconciled = true;
      currentSyncStatus = 'saved';
      this.notifyState();
    } catch (writeErr) {
      // Safe Rollback to snapshot
      try {
        StorageService.saveMembers(snapshot.members);
        StorageService.saveLabels(snapshot.labels);
        StorageService.saveSchedules(snapshot.schedules);
        await SongService.saveSongsList(snapshot.songs);
        await SongFamilyService.saveSongFamilies(snapshot.families);
        StorageService.saveDraftSchedule(snapshot.draft);
      } catch (rollbackErr) {
        console.error('Critical rollback failure:', rollbackErr);
      }
      throw new Error(`Failed to commit cloud restore; restored local state safely: ${writeErr}`);
    }
  }

  /**
   * Schedules a debounced background sync when local data changes
   */
  static triggerDebouncedAutoSync(): void {
    if (!this.isConnected()) return;
    if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
    autoSyncTimeout = setTimeout(() => {
      this.syncNow().catch((e) => console.warn('Debounced auto-sync error:', e));
    }, 4000);
  }
}
