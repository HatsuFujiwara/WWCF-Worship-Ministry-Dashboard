# WWCF Worship Song Line-up Scheduler

A dedicated, local-first worship song line-up scheduling and coordination workspace built for **Word for the World Christian Fellowship (WWCF) Santa Cruz**.

---

## 1. Product Overview

The **WWCF Worship Song Line-up Scheduler** coordinates Sunday services and ministry gatherings for WWCF Santa Cruz. It provides church worship leaders, music directors, vocalists, and AV technicians with service-ready scheduling, cataloging, harmonic flow tracking, and rehearsal preparation.

### Core Architecture
- **Local-First Storage:** All ministry lineups, song catalogs, team rosters, and rehearsal notes are stored directly in local browser storage (LocalStorage as the sole local database) for zero-latency, reliable operation on stage and in rehearsal spaces.
- **Google Drive Integration (Option A):** One shared, public Google OAuth 2.0 Web Client ID configured by the site owner enables automated or on-demand JSON backups directly to authorized Google Drive storage without requiring separate church accounts or server-side databases.
- **Zero-Mock Policy:** All data displayed in the dashboard is authentic user ministry data. No synthetic mock schedules, fake members, or dummy statistics are injected.
- **Service-Ready Visual Design:** Two core themes (**Light** and layered **Dark**) with a Dark-only **AMOLED** mode (true `#000000` OLED canvas preserving WWCF `#1b75bc` accents, status colors, and depth), an optional **Glass Mode** effect (default OFF; selective frosted blur across Light, Dark, and Dark + AMOLED), opaque-by-default cards/toolbars/modals, and an app-level **Performance Mode** that disables blur, translucency, ambient gradients, animations, transitions, shadows, and filters.

---

## 2. Ministry Scheduling Rules & Guardrails

- **Section Hierarchy:** Praise songs are always scheduled before Worship songs in accordance with WWCF liturgy.
- **Song Leader Capacity:** Exactly one or two Song Leaders per service (Praise Leader, Worship Leader, or Co-Leaders). Adding a third is prevented with clear user feedback.
- **Vocalist Prerequisites:** Only members tagged with the `Vocalist` ministry tag are eligible to be assigned as Backup Singers.
- **Disciplinary Action (DA) Safeguards:** Members under active Disciplinary Action are clearly indicated with non-punitive warning badges. Assignment to an active service lineup requires explicit leader confirmation.
- **Monthly Usage Safety:** The dashboard scans recent service history and warns leaders if a song was already scheduled within the target month to maintain repertoire balance.

---

## 3. Small-Feature Phase 1 Capabilities (S-00 to S-06)

- **S-00: Order of Service & Service Notes**
  - Multi-line service instructions and order of service cues saved with each lineup.
  - Automatically preserved across auto-saves, drafts, history snapshots, and included in PDF exports, PNG cards, and plain-text Service Briefs.
- **S-01: Slot-Aligned Song Identity & Ambiguity Safety**
  - Slot identities are tracked by stable catalog song IDs.
  - Stored ID is authoritative. If a song ID exists but is not in the catalog, visible title is preserved without silently attaching a same-title duplicate.
  - Ambiguity-safe title fallback is restricted to cases where the slot has no ID and exactly one catalog song matches the title.
  - Performed keys automatically default to the catalog song key on slot selection, clear stale keys when unmatched text is entered, and preserve manual key edits when the song remains the same.
- **S-02: Multi-Platform External Reference Quick Links**
  - Audio and video reference links for YouTube, Spotify, Apple Music, Qobuz, Tidal, and Genius attached to catalog songs.
  - Strict HTTP/HTTPS URL validation filters out unsafe schemes (e.g., `javascript:`, `data:`).
  - Quick action links available directly in lineup song cards and search pickers.
- **S-03: Compact Song Information Strip & Duration Parser**
  - Slot information strip displays performed key, original key difference, BPM, time signature, and external references.
  - Strict duration parser handles clock formats (`M:SS`, `MM:SS`, `H:MM:SS`), standalone units (`5m`, `90m`, `45s`, `1h`), and compound units (`4m 32s`, `1h 15m`).
  - Compound overflow units (`4m90s`, `0m90s`, `1h90m`, `0h90m`) are strictly rejected.
  - Setlist duration summary accurately tallies known timings without averaging or inventing missing durations.
- **S-04: Key Transitions & Musical Flow Analysis**
  - Harmonic distance analysis between consecutive Praise songs, cross-section transition (Last Praise → First Worship), and Worship songs.
  - Displays modulation descriptions (e.g., *Modulate up 2 semitones*, *Relative major / minor*).
  - Transition cues use stable pair identifiers (`section::id:...->id:...` or `section::title->title`) with backward-compatible legacy index fallback.
- **S-05: Plain-Text Service Brief Generator**
  - Instant one-click copy of a clean, structured plain-text service brief optimized for team messaging (WhatsApp, Messenger, SMS, Slack).
  - Includes service date, praise set with performed keys and transition notes, cross-section prayer cue, worship set, complete ministry roster, service notes, and rehearsal readiness summary.
- **S-06: Rehearsal Readiness Checklist**
  - Six-point readiness checklist: Song selection finalized, performed keys confirmed, lyrics verified, references attached, ministry roster confirmed, and flow/cues documented.
  - Enforces strict boolean semantics (`=== true`) across drafts, backups, and UI.
  - Smart automatic invalidation: editing songs, keys, ministry members, or transition cues automatically unchecks corresponding readiness flags to prevent stale readiness claims.

---

## 4. Service Status, Planning & Live Lyrics Presentation (`NS-01`, `LY-01`, `L-01`–`L-09`)

- **Explicit `No Service` Status (`NS-01`, `NS-02`):** Dedicated `No Service` toggle in the Scheduler and bulk `No Service` action in the Saved Schedules toolbar (`NS-02`), each with confirmation dialog, optional announcement reason (`<= 300` chars), and atomic single-step Undo/Redo. Distinct from empty lineups and excluded from analytics, usage warnings, and rehearsal sheets.
- **Lyrics Studio & Slide Parser (`LY-01`):** Structured bracket-tag lyrics authoring (`[Verse]`, `[Chorus]`, `[Bridge]`, `[Instrumental]`, etc.) with `.txt` import (`<= 256 KB`), clipboard paste guard, LRC timestamp stripping, inline chord preservation, and configurable `2..6` lines-per-slide live preview.
- **Dual-Window Lyrics Presenter & Audience Output (`LY-01`):** Operator presenter console (`Present Lyrics`) with live slide cues, next-slide preview, pre-cueing while blanked (`Blank Screen`), in-app Audience Mirror fallback, and an isolated `#000000` projection output window synchronized on the same device and browser profile via ephemeral `BroadcastChannel` sessions (`?lyrics-output=<sessionId>`).
- **Ministry Planning Suite (`L-01`–`L-09`):** Reusable lineup templates, date- and service-type-scoped team availability matrix, 4-tier song familiarity & rotation heatmap, tempo dynamics curve, archive search, song variant comparison, print-ready A4 Rehearsal Sheet PDF, and full-screen Live Rehearsal Prompter.
- **Musician Charts, Auto-Scroll & Video Cues (`HX-01`–`HX-04`, `HX-08`):** Multi-variant instrument chord & rhythm charts (`Full Band`, `Guitar`, `Piano`, `Bass`, `Drums`, `Vocals`, `Other`) with live semitone transposition, guitar Capo shape calculation, Nashville Number System toggle, hands-free Chart Auto-Scroll (`0.5x`–`2x` with reduced-motion/performance stepped fallback and manual-scroll auto-pause), formatted clipboard export with selectable fallback, timestamped YouTube reference cues (`&t=<sec>s`), Musician Charts mode inside the Live Rehearsal Prompter, and direct `Charts (N)` preview modals from selected lineup songs in the Scheduler.

---

## 5. Development & Build

### Requirements
- Node.js 18+
- npm or bun

### Commands
```bash
# Install dependencies (npm or bun)
npm install

# Start local development server (port 3000)
npm run dev

# Run TypeScript type check (tsc --noEmit; not ESLint)
npm run lint

# Compile production bundle
npm run build

# Start compiled production server
npm run start
```

### Server & Proxy Operational Notes
- **Ephemeral QR Transfer Sessions:** `/api/transfer/*` stores active transfer sessions in process memory (`transferSessions`, capped at 200 concurrent sessions) and authenticates via `X-Transfer-Token` headers. Deployments must run as a single Node.js instance or with sticky sessions.
- **Metadata Proxy Protection:** `/api/metadata/musicbrainz` and `/api/metadata/deezer` enforce `<= 300`-character query bounds, normalize and cache responses in memory for 5 minutes (up to 200 entries), and apply per-IP rate limiting (30 requests/minute).
- **YouTube Credentials:** YouTube integration operates strictly client-direct via optional user-provided credentials or OAuth; no server `YOUTUBE_API_KEY` env var is used.

---

## 6. Technology Stack

- **Frontend:** React 19, TypeScript, Vite
- **Styling:** Tailwind CSS, custom AMOLED surface design system
- **Icons:** Lucide React
- **Document Generation:** html2canvas, jsPDF
- **Validation:** Custom version-aware backup envelope & draft sanitizer
- **Storage:** LocalStorage (sole local database) with optional Google Drive backup (Option A)

---

*Word for the World Christian Fellowship (WWCF) Santa Cruz Worship Ministry*
