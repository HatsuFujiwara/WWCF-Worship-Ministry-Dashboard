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

## 4. Verification Checklist

1. **First-run prompt:** After dismissing or completing the accessibility tour, the Google Account connection offer modal appears. Dismissing it with "Continue offline" or "Not now" keeps the app 100% functional.
2. **Google Drive Sync:**
   - In **Settings > Google Account & Cloud Backup**, click **Connect Google Account**.
   - Grant the requested permissions (`drive.file` and `youtube.readonly`).
   - Click **Sync Now**.
   - Check Google Drive: A file named `WWCF_Santa_Cruz_Worship_Ministry_Backup.json` appears with current members, songs, schedules, and song families.
3. **Conflict Resolution:**
   - If the remote file in Drive is modified on another device, clicking Sync detects the revision timestamp difference and prompts with choices: "Keep Local", "Use Cloud Version", "Merge Both", or "Save Copy".
4. **YouTube Playlist Import Without API Key:**
   - Open **Song Database > Import YouTube Songs / Playlist** or Scheduler import.
   - Enter a YouTube or YouTube Music playlist link (public, unlisted, or private from the logged-in account).
   - Because Google is connected, the playlist is imported directly without asking for a YouTube API key.
5. **Disconnect:**
   - Clicking **Disconnect Account** clears in-memory tokens and resets state to disconnected, preserving all local schedules and songs.
6. **Separate Cloud Copy:**
   - If a conflict arises and you do not wish to overwrite either local or remote data, choose **Save as Separate Cloud Copy** in the conflict dialog to create a timestamped copy in Google Drive.
7. **Optional Standalone YouTube API Key:**
   - If a user prefers not to connect a Google Account, a personal YouTube Data API v3 key can be entered in **Settings > YouTube Data API v3 Key (Optional Fallback)** or inside the Smart Song Import modal. The key is validated, stored in memory, and optionally remembered on the device.

