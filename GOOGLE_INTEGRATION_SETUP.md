# WWCF Santa Cruz Worship Ministry Dashboard — Google Account & Cloud Integration Setup Guide

This guide explains how to configure Google Identity Services (GIS) for optional Google Account sign-in, automated Google Drive cloud backup, and authorized YouTube / YouTube Music playlist importing.

---

## 1. Overview & Architecture

The WWCF Santa Cruz Worship Ministry Dashboard follows a **local-first, privacy-respecting architecture**:

1. **Local Working Copy is Authoritative:** LocalStorage remains the instant primary data store and offline fallback. The app functions completely without a Google account.
2. **Opt-in Cloud Backup:** Connecting a Google account grants permission (`https://www.googleapis.com/auth/drive.file`) to read and write an application-specific file named `WWCF_Santa_Cruz_Worship_Ministry_Backup.json` in the user's personal Google Drive. The app cannot read or modify any other files in their Drive.
3. **Authorized YouTube Playlist Import:** Connecting a Google account grants read-only permission (`https://www.googleapis.com/auth/youtube.readonly`) to import public, unlisted, and user-owned private YouTube and YouTube Music playlists directly without needing a manual YouTube API key.
4. **Token Security:** OAuth access tokens are stored **in-memory only**. They are never persisted to `localStorage`, `sessionStorage`, cookies, or query strings.
5. **Zero Secrets in Browser:** Google OAuth 2.0 Web Client ID is public and provided via `VITE_GOOGLE_CLIENT_ID`. The application uses Google Identity Services token-client flow directly in the browser; no client secret is required or stored.

---

## 2. Google Cloud Console Setup (Step-by-Step)

### Step 2.1: Create or Select a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown at the top and select **New Project**.
3. Name your project (e.g., `wwcf-worship-dashboard`) and click **Create**.

### Step 2.2: Enable Required Google APIs
In your Google Cloud project, navigate to **APIs & Services > Library** and enable the following APIs:
1. **Google Drive API** (enables creating and syncing `WWCF_Santa_Cruz_Worship_Ministry_Backup.json`).
2. **YouTube Data API v3** (enables fetching playlist metadata and songs).
3. **Google Identity / People API** (optional, for profile name/avatar display).

### Step 2.3: Configure the OAuth Consent Screen
1. Navigate to **APIs & Services > OAuth consent screen**.
2. Choose **External** user type (or **Internal** if using Google Workspace for your church domain) and click **Create**.
3. Fill in the App Information:
   - **App name:** `WWCF Santa Cruz Worship Ministry`
   - **User support email:** Your ministry or admin email.
   - **Developer contact information:** Your admin email.
4. On the **Scopes** step, click **Add or Remove Scopes** and select:
   - `openid`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
   - `https://www.googleapis.com/auth/drive.file` (Per-file access: view and manage Google Drive files created by this app)
   - `https://www.googleapis.com/auth/youtube.readonly` (Read-only access to YouTube playlists and videos)
5. Under **Test users**, add the Google email addresses of worship team leaders or administrators who will test the application.
6. Click **Save and Continue**.

### Step 2.4: Create OAuth 2.0 Web Client Credentials
1. Navigate to **APIs & Services > Credentials**.
2. Click **+ Create Credentials** and select **OAuth client ID**.
3. Set **Application type** to **Web application**.
4. Name: `WWCF Worship Dashboard Web Client`.
5. Under **Authorized JavaScript origins**, add:
   - Your hosted AI Studio preview URL (e.g. `https://ais-dev-...run.app`)
   - `http://localhost:3000` (for local development)
6. Under **Authorized redirect URIs**, add your hosted origin URL.
7. Click **Create**.
8. Copy the generated **Client ID** (e.g., `123456789-abcdef.apps.googleusercontent.com`).

---

## 3. Environment Configuration

Add the Client ID to your environment configuration:

### In `.env` (or AI Studio Environment Configuration):
```env
# Client ID is safe to expose to client-side code
VITE_GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"
```

If testing in an environment where `.env` is not editable directly, you can also enter the Client ID in the dashboard's **Settings > Google Account & Cloud Backup > Advanced Configuration** field, which saves only the public Client ID locally for that browser session.

---

## 4. Verification Checklist & Operations

1. **Option A Shared Architecture:**
   - One shared public Google OAuth Web Client ID (`VITE_GOOGLE_CLIENT_ID`) is configured once by the site administrator.
   - Visitors authorize their own personal Google Account via the standard Google Identity Services (GIS) popup.
   - Each visitor's backup is stored in and loaded from their own personal Google Drive under `https://www.googleapis.com/auth/drive.file`.
   - No Google Drive API key is used or exposed (an API key cannot authorize personal user Drive storage).
2. **Two Independent Actions in Settings:**
   - **Save to Drive:** Validates local data schema, confirms initial backup if no file exists in Drive, checks remote baseline to prevent accidental overwrites, and saves current data to Google Drive.
   - **Load from Drive:** Inspects Drive backups, validates remote schema envelope, displays a preview comparison dialog showing collection counts (Songs, Schedules, Members, Families, Labels) against current device data, and offers three distinct actions:
     - **Merge with this device**
     - **Replace this device's data**
     - **Cancel**
   - Restoring data strictly does NOT trigger an automatic cloud upload.
3. **Automatic Cloud Backup Setting (Opt-In):**
   - Default is strictly OFF.
   - Users can toggle **Automatic Cloud Backup** in Settings to automatically sync local changes to Google Drive in the background.
   - Connecting a Google Account does not turn on auto-sync and does not auto-upload data upon connection.
4. **Separate Cloud Copy:**
   - Users can choose **Save as Separate Backup Copy** to create a timestamped file without altering the primary backup pointer or sync baseline.
5. **Conflict Resolution & Concurrency Protection:**
   - If a remote file in Drive was modified externally since the last known sync, a conflict dialog prompts the user with inspection details and clear choices before any write occurs.
6. **YouTube Playlist Import Without API Key:**
   - With Google Account connected, public, unlisted, and private playlists from the account can be imported directly via `https://www.googleapis.com/auth/youtube.readonly` without needing a manual YouTube API key.
7. **Disconnect & Isolation:**
   - Disconnecting clears in-memory tokens and isolates account-scoped metadata. Local records remain 100% intact.
8. **Optional Fallback YouTube API Key:**
   - Users who do not connect Google can still use an optional personal YouTube Data API v3 key for public and unlisted playlists.

