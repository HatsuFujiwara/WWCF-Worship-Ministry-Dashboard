# WWCF Santa Cruz Worship Ministry Dashboard — Deep Audit & Remediation Report

> **Product Identity Note:** Following this 2026-11-16 audit, the application was renamed to its canonical title **WWCF Worship Song Line-up Scheduler** (`wwcf-worship-song-line-up-scheduler`). Historical audit entries below retain the name current at the time of inspection.

**Audit Date:** 2026-11-16  
**Workspace Audited:** `/app/applet` (WWCF Santa Cruz Worship Ministry Dashboard, `package.json` `v2.5.0`, Feature Tracker `v2.8`)  
**Architecture Baseline:** React 19 + TypeScript + Vite 6 SPA, Tailwind CSS v4, Express 4 backend (`server.ts`), LocalStorage-first client persistence, Google Drive Option A (GIS client-side OAuth)

---

## 1. Executive Summary

A full repository, architecture, data-integrity, security, UI/accessibility, and cleanup audit was completed alongside the sidebar logo and collapsed-rail polish:

- **Sidebar & Rail Polish Verified in Source:** Widened collapsed desktop rail to `96px` (`lg:w-[96px]`, synced in `App.tsx` with `lg:pl-[96px]` / `lg:pr-[96px]`) so `/assets/wwcf-square-logo-blue.png` renders at `76 × 76 px` (`size="xl"`) across expanded desktop, mobile drawer, and collapsed rail states without header text or oversized button hit areas. Only the intrinsic logo `<button>` triggers Dashboard navigation.
- **Confirmed Defects Remediated:** Fixed P0–P3 gaps across metadata verification badge classification (`BulkMetadataReviewModal.tsx`), 8-store parity and conflict-modal safety across Google Drive & backup flows (`googleAuthService.ts`, `SettingsModal.tsx`, `DriveBackupModal.tsx`, `DriveConflictModal.tsx`, `BackupRestoreModal.tsx`), `DashboardView` + `MemberFavoriteSongsSection` song-family rollup parity, `SongAnalyticsView` same-date Heatmap keying & catalog-resolved Lineup Register, `Asia/Manila` timezone consistency (`MemberAvailabilityModal.tsx`, `recommendationUtils.ts`), corrupt LocalStorage quarantine (`LocalStorageRepository.ts`), non-global regex `.test()` safety (`songFamilyUtils.ts`), `SongPickerModal.tsx` key filter alignment, delete confirmation impact warnings (`SongsView.tsx`, `MemberEditorView.tsx`), and dead code cleanup (`exportService.ts`).
- **Repository Hygiene:** Verified `package.json` (`12` runtime + `9` dev dependencies) aligns cleanly with `bun.lock`. Removed provably unused legacy asset `public/assets/WWCF_Santa_Cruz_Logo_1b75bc.png` (zero references in `src/`, `index.html`, or docs outside changelog history). Preserved `.aistudio/`, `assets/.aistudio/`, and `metadata.json` (`MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` platform metadata only; zero Gemini runtime calls).
- **Honest Verification Boundary:** Build (`npm run build`), TypeScript (`npm run lint` -> `tsc --noEmit`), deterministic domain assertions (`npx tsx -e`), `dist/` bundle/asset inspection, and live HTTP smoke checks (`http://localhost:3000` dev and compiled `dist/server.cjs`) all passed. Live multi-viewport visual browser QA remains **Pending (`NO_BROWSER_BIN`)** because headless Chromium/Firefox/Playwright binaries are absent in this container.

---

## 2. Architecture & Data-Store Inventory

| Store / Persistence Key | Owner / Repository | Schema & Validation | Backup / Cloud / QR Parity |
| :--- | :--- | :--- | :--- |
| `wwcf_members_v1` (`members`) | `LocalStorageRepository` | Team roster, hierarchy tags, DA flag; corrupt JSON/array quarantined (`wwcf_quarantine_*`) | Full (Export/Import, Drive 8-store, QR transfer, Undo/Delete) |
| `wwcf_labels_v1` (`labels`) | `LocalStorageRepository` | Custom ministry role tags; `MAX_LABELS` bounded (`1,000` transfer / `10,000` backup) | Full |
| `wwcf_schedules_v1` (`schedules`) | `LocalStorageRepository` | Saved services, slot-aligned IDs/keys, `noService` 3-state semantics, checklists, transition notes | Full |
| `wwcf_songs_v1` (`songs`) | `SongService` / `LocalStorageRepository` | Catalog songs, `MAX_LYRICS_LENGTH = 20000`, `instrumentCharts` (<=10), `videoMarkers` (<=30) | Full |
| `wwcf_song_families_v1` (`songFamilies`) | `SongFamilyService` | Composition groupings & version relationships; ID-authoritative lookups | Full |
| `wwcf_lineup_templates_v1` (`templates`) | `TemplateService` | Reusable Praise/Worship service templates | Full (remediated across Drive counts/preview/conflict UI) |
| `wwcf_member_availability_v1` (`memberAvailability`) | `AvailabilityService` | Member/date/`serviceType`-scoped availability (`available`/`unavailable`/`maybe`) | Full (remediated across Drive counts/preview/conflict UI & empty-backup guard) |
| `wwcf_song_familiarity_v1` (`songFamiliarity`) | `FamiliarityService` | Member/song mastery (`confident`/`familiar`/`learning`/`unfamiliar` != `not_rated`) | Full (remediated across Drive counts/preview/conflict UI & empty-backup guard) |
| Scheduler Draft (`wwcf_scheduler_draft_v1`) | `StorageService` | In-progress schedule buffer synced with `sanitizeDraftSchedule` & `noServiceReason` rules | Counted/transferred when non-empty; cleared selectively |
| Auxiliary UI Prefs | `StorageService` / modals | Theme, accessibility modes, `wwcf_musician_preferred_instrument_v1`, `wwcf_chart_autoscroll_speed_v1` | Cleared cleanly in `deleteAllData()` without touching unrelated origin keys |

---

## 3. Sidebar Header & Collapsed Rail Verification (`BrandLogo.tsx`, `Sidebar.tsx`, `App.tsx`, `index.css`)

- **Asset Integrity:** `/assets/wwcf-square-logo-blue.png` and `/favicon.png` share exact 1000 × 1000 RGBA PNG bytes (`257,086` bytes, SHA-256 `662971c25d6be4643645e860abc49872a855f34395bbbdda4ed8069d1da026f1`).
- **Expanded Desktop (`260px`) & Mobile Drawer (`280px`):** `Sidebar.tsx` renders `<BrandLogo size="xl" />` (`76 × 76 px`) beside the collapse/close button inside `min-h-[92px] py-2`. Adjacent `WWCF Santa Cruz` / `Worship Ministry` text was removed cleanly (`U-09`/`U-02` footer ministry text remains separate).
- **Collapsed Desktop Rail (`96px`):** `Sidebar.tsx` widens collapsed width from `54px` to `lg:w-[96px]` with stacked column layout (`lg:flex-col lg:py-2.5 lg:gap-2`) rendering `<BrandLogo size="xl" />` (`76 × 76 px`) above the expand toggle; `App.tsx` offsets `<main>` via `lg:pl-[96px]` / `lg:pr-[96px]` depending on `sidebarPosition`.
- **Hit Target & Motion:** Clicking `<BrandLogo>` (`inline-flex w-fit`, `aria-label="Go to Dashboard"`) navigates to Dashboard (and closes mobile drawer `< 1024px`); empty header space does not navigate. `.reduced-motion` disables `.wwcf-glass-sidebar` and `.wwcf-main-content` transitions in `src/index.css`.

---

## 4. Feature Completeness Matrix

| Area | Feature Codes | Implementation State | Verification Level |
| :--- | :--- | :--- | :--- |
| Core Scheduler & Song Rules | `S-00`–`S-06`, `U-09` | Complete: Praise-before-Worship, max 2 Song Leaders, Vocalist backup gate, DA confirmation, ID-authoritative slots, Performed Key vs Original Key, strict duration parser, harmonic transitions, Service Brief, 6-flag readiness checklist. | Source-reviewed + Domain assertions + `tsc`/Build |
| Design, A11y & Perf System | `U-00`–`U-06` | Complete: AMOLED `#000000`, `#1b75bc` accent, light theme, solid surfaces, reduced-motion, performance mode, high-contrast/text-size classes, focus trap/restore. | Source-reviewed + `tsc`/Build (Visual QA pending `NO_BROWSER_BIN`) |
| Persistence, Cloud & Transfer | `U-07`, `U-08`, `L-08` | Complete: 8-store + draft validation, checked writers with rollback, Google Drive Option A (GIS memory-only token), QR/LAN transfer (`server.ts`). | Source-reviewed + Domain assertions + Live HTTP `/api/transfer/*` |
| Planning & Analytics Suite | `L-01`–`L-07` | Complete: Templates, service-scoped availability, familiarity matrix, tempo dynamics curve, deep archive search, song variants/families, A4 Rehearsal Sheet & PDF/PNG exports. | Source-reviewed + Domain assertions + `tsc`/Build |
| `No Service` & Lyrics Output | `NS-01`, `LY-01`, `HX-07`, `L-09` | Complete: 3-state `No Service`, `lyricsParser.ts`, authoring studio (`20k` limit, `.txt` <= `256 KB`), Rehearsal Prompter, fail-closed `BroadcastChannel` `?lyrics-output=` isolated audience window (`~6.9 KB` entry split). | Source-reviewed + Domain assertions + HTTP route check (Multi-window UI pending `NO_BROWSER_BIN`) |
| Musician Charts & Markers | `HX-01`–`HX-04`, `HX-08`, `HX-AUTO` | Complete: Up to 10 charts/song (`guitar`, `piano`, `bass`, `drums`, `vocals`, `other`, `all`), transpose (`-11..+11`), Capo shapes (`drums` non-transposing), Nashville, section quick-jump, video `&t=<sec>s` markers (<=30), auto-scroll, formatted Copy Chart + manual fallback. | Source-reviewed + Domain assertions + `tsc`/Build |
| Intentionally Excluded / Deferred | `HX-05`, `HX-06`, `HX-MIDI`, `HX-AUDIO`, `HX-FOLLOW`, Section 5.4 exclusions | Verified absent: No `@google/genai`, Firebase, Supabase, IndexedDB, PWA/SW, Vitest/Jest/Playwright, Calendar/Gmail/Messaging APIs, or fake audio stem sliders. | Confirmed via `package.json` & `src/` scan |

---

## 5. Deep Audit Defects Identified & Remediated

1. **`BulkMetadataReviewModal.tsx` (P1 — Stale Metadata Source Matching):** Replaced stale checks for `'MusicBrainz (Primary)'` and `'Deezer (Secondary Fallback)'` with `MusicMetadataService`'s actual `sourcesSucceeded` strings (`'MusicBrainz (Fallback)'`, `'Deezer (Fallback)'`, `'Apple Music'`, `'Spotify'`, `'YouTube Music'`, `'YouTube'`), restoring accurate source badges and high/medium/low confidence grading.
2. **Google Drive & Backup 8-Store Parity (`googleAuthService.ts`, `SettingsModal.tsx`, `DriveBackupModal.tsx`, `DriveConflictModal.tsx`, `BackupRestoreModal.tsx`):** Added missing `templates`, `memberAvailability`/`availability`, and `songFamiliarity`/`familiarity` counts across local/remote previews, conflict comparison grids, and empty-backup detection (so backups with only `labels`, `memberAvailability`, or `songFamiliarity` are accepted cleanly).
3. **`DriveBackupModal.tsx` & `DriveConflictModal.tsx` (Modal State & Resolution Guards):** Reset stale `selectedCandidateId` when the Drive candidate list changes without matching the previous ID; prevented `Escape`/close dismissal and disabled radio/close controls in `DriveConflictModal` while `isResolving === true`.
4. **`DashboardView.tsx`, `MemberFavoriteSongsSection.tsx`, `App.tsx` (Analytics & Song Family Parity):** Passed `allSongs` and `songFamilies` into both consumers of `calculateSongAnalytics(...)` so Dashboard and Member analytics use the exact same ID resolution and song-family rollups as `SongAnalyticsView`.
5. **`SongAnalyticsView.tsx` (Same-Date Heatmap Collision & Catalog Resolution):** Keyed Heatmap `rotationTimelineData` `dateDetails` by `schedule.id` instead of `serviceDate` so two services on the same calendar date (e.g., Sunday Service + Worship Event) never overwrite each other; updated Section 5 `Lineup Register` to resolve slot titles via `resolveScheduleSongTitles(schedule, songs)`.
6. **`MemberAvailabilityModal.tsx` & `recommendationUtils.ts` (Timezone Consistency):** Replaced UTC `toISOString().slice(0, 10)` and local `Date` month/day math with canonical `Asia/Manila` helpers (`getManilaTodayString`, `getDaysInMonth`, `getManilaDateParts`).
7. **`LocalStorageRepository.ts` (Corrupt Storage Quarantine Parity):** Added `quarantineCorruptStorage(...)` in `getMembers()`, `getLabels()`, and `getSchedules()` on parse or schema-array failures to preserve forensic recovery parity with `getSongs()` and `getSongFamilies()`.
8. **`SongsView.tsx` & `MemberEditorView.tsx` (Delete Impact Warnings):** Upgraded song delete usage checks to authoritative ID + normalized-title matching and surfaced affected saved lineup counts inside both song and member delete confirmation dialogs.
9. **`SongPickerModal.tsx`, `songFamilyUtils.ts`, `exportService.ts` (Filter, Regex & Dead Code Fixes):** Aligned `SongPickerModal` key filter/search with `(s.originalKey || s.key || '')`; split non-global `VERSION_INDICATOR_TEST_REGEX` from `/gi` `VERSION_INDICATOR_REGEX` in `songFamilyUtils.ts` so `.test()` never advances `lastIndex`; removed unused `const ctx = canvas.getContext('2d')` in `exportService.ts`.

---

## 6. Security, Privacy & External Network Boundary Notes

- **Trust Boundaries (`server.ts` & client):** Transfer endpoints enforce `5,000`-record limits across all 7 array collections and `1,000`-label (`<=100` char) limits cleanly, header-only `X-Transfer-Token` auth (`403` on wrong token or URL query `?token=`), single-use `410` completion/cancellation replay protection, and strict `X-Content-Type-Options: nosniff` / `X-Frame-Options: SAMEORIGIN` / `Cache-Control: no-store` headers.
- **Public Metadata Fallback Note (`src/services/musicMetadataService.ts`):** Qobuz public search fallback uses `https://corsproxy.io/?...` fail-open when direct client CORS is blocked, sending only public song title/artist search text (never OAuth tokens, schedules, roster data, or keys). Documented as an intentional external metadata lookup boundary; all external quick-links validate `http:`/`https:` via `new URL()`.
- **Audience Projection Privacy (`LY-01`):** `LyricsPresentationModal` + `lyricsPresentationChannel.ts` broadcast strictly allow-listed plain-text lyric slides (`MAX_LYRICS_LENGTH = 20000`, <=6 lines/slide) bound to a Web Crypto `sessionId`, keeping roster, performed keys, service notes, rehearsal cues, chord charts, and Drive tokens completely isolated from `?lyrics-output=`.

---

## 7. Accessibility, Responsive Layout & Browser QA Checklist

- **Source-Verified:** Semantic `<button type="button">` / native `<input type="checkbox">` controls, focus rings (`focus-visible:ring-2 focus-visible:ring-[#1b75bc]`), `role="dialog"` / `aria-modal="true"` focus traps (`Modal`, `LyricsPresentationModal`, `RehearsalPrompterModal`, `DriveConflictModal`), scoped keyboard shortcuts ignoring form inputs, `prefers-reduced-motion` + `.reduced-motion` + `.performance-mode`, and light/AMOLED-dark contrast tokens.
- **Pending Live Interactive Browser QA (`NO_BROWSER_BIN` in container):**
  - [ ] Desktop expanded (`260px`) & collapsed (`96px`) sidebar + right-positioned sidebar + horizontal nav bar in both AMOLED Dark and Light themes (`1440px`, `768px`, `375px`).
  - [ ] Expanded/collapsed logo click -> Dashboard navigation vs empty header click non-navigation.
  - [ ] Keyboard-only Tab/Shift+Tab/Escape focus trap and return on `RehearsalPrompterModal`, `LyricsPresentationModal`, `DriveConflictModal`, and Scheduler `"Charts (N)"` preview.
  - [ ] Live dual-window `window.open` + `BroadcastChannel` projection to `?lyrics-output=<sessionId>` and hands-free auto-scroll visual smoothness.

---

## 8. Dependency & Repository Hygiene Summary

- `package.json`: `12` runtime dependencies (`@tailwindcss/vite`, `@vitejs/plugin-react`, `express`, `html2canvas`, `html5-qrcode`, `jspdf`, `lucide-react`, `motion`, `qrcode`, `react`, `react-dom`, `vite`) and `9` devDependencies (`@types/*`, `esbuild`, `tailwindcss`, `tsx`, `typescript`), in sync with `bun.lock`.
- Unused asset removed: `public/assets/WWCF_Santa_Cruz_Logo_1b75bc.png`.
- Documentation updated: `GOOGLE_INTEGRATION_SETUP.md` (8-store Load Preview list), `WWCF_Worship_Team_Feature_Tracker.md` (`v2.8`, fixed `DashboardHome.tsx` -> `DashboardView.tsx`, logged `2026-11-16` deep audit run), and this report (`WWCF_DEEP_AUDIT_REPORT.md`).

---

## 9. Verification Ledger

| Check | Outcome | Notes |
| :--- | :--- | :--- |
| Production Build (`compile_applet` / `npm run build`) | **Passed** | `vite build` + `esbuild server.ts --bundle` -> `dist/server.cjs`; verified `dist/assets/*.css` rail classes and `wwcf-square-logo-blue.png` hash match. |
| TypeScript Check (`lint_applet` / `npm run lint`) | **Passed** | Zero `tsc --noEmit` errors (`npm run lint` runs `tsc --noEmit`, not ESLint). |
| Domain & Regression Assertions (`npx tsx -e`) | **Passed** | `ALL_DOMAIN_ASSERTIONS_PASSED` and `ANALYTICS_AND_8STORE_PASSED`. |
| Live HTTP Smoke Suite (Dev `:3000` & Prod `dist/server.cjs`) | **Passed** | Verified `/api/health`, `/`, `/?lyrics-output=...`, `/favicon.png`, `/assets/wwcf-square-logo-blue.png`, and `/api/transfer/*` lifecycle + `403`/`410` checks. |
| Live Headless Browser UI Inspection | **Pending** | Container lacks `chromium`/`firefox`/`playwright` (`NO_BROWSER_BIN`). |
