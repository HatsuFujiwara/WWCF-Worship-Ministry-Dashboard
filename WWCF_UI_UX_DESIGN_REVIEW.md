# WWCF Worship Song Line-up Scheduler — UI/UX Design Review

**Date:** 2026-11-17  
**Application:** WWCF Worship Song Line-up Scheduler (`WWCF Santa Cruz`)  
**Scope:** Design system tokens, shared shell & compact sidebar, primary workflow screens, shared overlays, and rehearsal/projection stage surfaces.

---

## 1. Design Token & Surface Architecture (`src/index.css`)

- **Color Discipline & Brand Accent:** Anchored primary interactive actions, active navigation states, focus rings, and Worship category accents on **WWCF Blue (`#1b75bc`)** for light mode and **high-contrast sky blue (`#54b0e2`)** on dark surfaces. Praise category indicators retain **amber (`amber-500`)** for rapid stage/rehearsal scanning without colliding with Worship (`#1b75bc`) or destructive (`rose-600`) actions.
- **AMOLED Dark Mode (`#000000`) & Light Mode Parity:** Paired `@custom-variant dark (&:where(.dark, .dark *));` with semantic surface tokens (`--surface-0`: `#000000` in dark / `#f8fafc` in light, `--surface-1`: `#0b0e13` / `#ffffff`, `--surface-2`: `#11161e` / `#f1f5f9`) and consistent surface helpers (`.wwcf-glass-card`, `.wwcf-glass-modal`, `.wwcf-toolbar-sticky`).
- **Typography & Tabular Discipline:** Standardized `Plus Jakarta Sans` UI copy with `JetBrains Mono` / `tabular-nums` across BPM, durations, slide counters, transpose semitones, capo frets, and calendar/analytics metrics. Replaced overly heavy `font-black` UI badges/controls and uppercase micro-shouting with balanced `font-semibold`/`font-bold` weights and `[text-wrap:balance]` on prominent titles.
- **Iconography Discipline:** Removed remaining decorative emojis (such as the lock emoji in `MemberEditorView.tsx`) in favor of Lucide SVG icons (`<Lock />`, `<Youtube />`, `<Zap />`, `<Heart />`) with `aria-hidden="true"` where paired with explicit text labels.

---

## 2. Application Shell & Compact Sidebar (`Sidebar.tsx`, `Header.tsx`, `App.tsx`)

- **Shared Layout Tokens (`SIDEBAR_LAYOUT_TOKENS`, `getMainContentOffsetClass()`):** Synchronized sidebar widths and main content offsets across left/right desktop docks and horizontal navigation mode:
  - Desktop expanded rail: `240px` (`lg:w-[240px]`, `lg:pl-[240px]` / `lg:pr-[240px]`).
  - Desktop collapsed rail: `96px` (`lg:w-[96px]`, `lg:pl-[96px]` / `lg:pr-[96px]`).
  - Mobile drawer: `min(272px, 88vw)` with `overflow-x-hidden` to avoid edge clipping on narrow viewports.
- **Header & Brand Composition:** Left/start-anchored icon-only `76 × 76 px` square blue WWCF PNG `BrandLogo` (`<button>` navigating solely to Dashboard) paired with right/end-aligned desktop collapse/expand and mobile close controls.

---

## 3. Screen & Component Consistency Audit

| Surface / Module | Key Design & UX Refinements | Status |
| :--- | :--- | :--- |
| **Shared Overlays (`Modal.tsx`, `CustomSelect.tsx`, `ToastContainer.tsx`, `ErrorBoundary.tsx`)** | Aligned to `wwcf-glass-modal`, `bg-slate-950/65` backdrops, `#1b75bc` focus rings, keyboard-accessible menus, and consistent toast/error framing. | Source-reviewed, built & type-checked |
| **Dashboard & Favorites (`DashboardView.tsx`, `MemberFavoriteSongsSection.tsx`)** | Unified card elevation (`wwcf-glass-card`), `No Service` visual treatment, and `tabular-nums` schedule/song counters. | Source-reviewed, built & type-checked |
| **Song Catalog & Authoring (`SongsView.tsx`, `SongFormModal.tsx`)** | Harmonized search/filter bar, lyrics/chart authoring tabs, dark `#0b0e13`/`#11161e` form inputs, and accessible feedback states. | Source-reviewed, built & type-checked |
| **Scheduler (`SchedulerView.tsx`)** | Demoted secondary `Import Song / Playlist` action, harmonized Praise/Worship slot controls and team filters, updated bottom action bar to `wwcf-toolbar-sticky`, and preserved exact slot ID/key/transition alignment and `No Service` guards. | Source-reviewed, built & type-checked |
| **Saved Lineups (`SchedulesView.tsx`)** | Styled multi-select toolbar (including `No Service` bulk conversion), Repeated Songs popover (`Open Line-up`), and confirmation modals consistently. | Source-reviewed, built & type-checked |
| **Members (`MemberEditorView.tsx`)** | Updated roster filters, sticky bulk toolbar (`wwcf-toolbar-sticky`), DA/duplicate confirmation dialogs (`wwcf-glass-modal`), and replaced lock emoji with `<Lock />`. | Source-reviewed, built & type-checked |
| **Analytics (`SongAnalyticsView.tsx`)** | Updated `TriStateCheckbox`, step cards, numbered badges (`tabular-nums`), and export buttons while preserving explicit `bg-white text-slate-900` inside `reportRef` for reliable `html2canvas` PDF/PNG capture. | Source-reviewed, built & type-checked |
| **Rehearsal & Charts (`ChordChartViewer.tsx`, `RehearsalPrompterModal.tsx`)** | Harmonized standard dark chart surfaces (`#0b0e13`/`#11161e`/`#000000`), preserved stage-mode `#54b0e2` vs. standard-mode `#1b75bc dark:text-[#54b0e2]` contrast, unified `RehearsalPrompterModal` Worship badge to `#1b75bc`, and added consistent `focus-visible` rings & `tabular-nums`. | Source-reviewed, built & type-checked |
| **Lyrics Presenter & Stage Output (`LyricsPresentationModal.tsx`, `LyricsAudienceOutput.tsx`)** | Added uniform `focus-visible:ring-2 focus-visible:ring-[#54b0e2]` across operator and mirror buttons while preserving pure `#000000` stage presentation, 44px touch targets, and strict `BroadcastChannel` allow-list isolation untouched. | Source-reviewed, built & type-checked |

---

## 4. Accessibility & Interaction Notes

- **WCAG AA Contrast:** Paired light-surface `#1b75bc` accents with dark-surface `#54b0e2` text/highlights (including `isStage` branches rendered over `#000000` even when the app shell is in light mode).
- **Keyboard & Focus Management:** Preserved modal focus traps, restore-focus targets, `Escape` handlers, and `focus-visible:outline-hidden focus-visible:ring-2` styling across interactive buttons, tabs, inputs, and chart quick-jump controls.
- **Reduced Motion & Performance:** Preserved `.reduced-motion` and `.performance-mode` overrides, compositor-friendly transitions, and stepped auto-scroll fallback inside `ChordChartViewer`.

---

## 5. Verification Status Summary

- **Source Review (`source-reviewed`):** Complete across shell, shared components, primary workflow screens, rehearsal tools, and projection views.
- **Type-Check (`type-checked`):** `npm run lint` (`tsc --noEmit`) passed with `0` errors.
- **Production Build (`build-passed`):** `npm run build` (`vite build` + `esbuild server.ts --bundle`) passed; verified `dist/assets/*.css` contains `--surface-0`, `.wwcf-glass-card`, `.wwcf-glass-modal`, and `.wwcf-toolbar-sticky`.
- **Server & Domain Runtime Checks (`passed`):** Restarted Express + Vite dev server on `:3000`; verified `GET /` (`200`), `GET /?lyrics-output=TestSession123456` (`200`), and `GET /api/health` (`200`, `{"status":"ok"}`); executed `npx tsx -e` domain assertions (`UI_UX_REDESIGN_VERIFICATION_PASSED`) covering `SIDEBAR_LAYOUT_TOKENS`, `getMainContentOffsetClass()`, `applyBulkNoServiceConversion()`, `resolveSlotSong()`, 8-store `BackupValidationService` (`version: '1.0'`), and `lyricsPresentationChannel` isolation.
- **Live Browser Visual & Multi-Viewport QA (`pending` — `NO_BROWSER_BIN`):** Automated headless browser checks were not run because `chromium`, `chromium-browser`, `google-chrome`, `firefox`, and `playwright` are not installed in this container. Interactive visual inspection across desktop (`1440px`, `1024px`), tablet (`768px`), mobile (`375px`), dark/light themes, modals, and cross-window projection should be confirmed in the AI Studio preview.
