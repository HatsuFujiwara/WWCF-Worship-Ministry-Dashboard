import { ActiveTab } from '../types';

export interface TourStep {
  id: number;
  sectionTitle: string;
  stepTitle: string;
  targetTab: ActiveTab;
  targetSelector: string;
  actionPrompt: string;
  actionType: 'click' | 'input' | 'none';
  description: string;
  bullets: string[];
  rule: string;
}

export const INTERACTIVE_GUIDE_STEPS: TourStep[] = [
  // =========================================================================
  // BASIC LINEUP GUIDE (Steps 1–8) — DO NOT MODIFY / REORDER
  // =========================================================================
  {
    id: 1,
    sectionTitle: 'Basic Guide',
    stepTitle: 'Open / Create Line-up',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="header-new-lineup-btn"]',
    actionPrompt: 'Click "+ New Lineup" to start.',
    actionType: 'click',
    description: 'Choose whether you want to load an existing Sunday/Midweek lineup or create a new lineup for another service.',
    bullets: [
      'Sunday Service and Midweek Prayer Service lineups are automatically created.',
      'Click "+ New Lineup" to open the selection menu and choose your action.'
    ],
    rule: 'Step 1: Click New Lineup to choose an action.'
  },
  {
    id: 110,
    sectionTitle: 'Basic Guide',
    stepTitle: 'Choose Action: Load or Create',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="new-lineup-options-container"]',
    actionPrompt: 'Choose "Load Existing Lineup" or "Create New Lineup".',
    actionType: 'click',
    description: 'Select whether to load an automatically created Sunday/Midweek lineup or create a new set for another service.',
    bullets: [
      'Load Existing Lineup: Open an automatically created Sunday or Midweek lineup.',
      'Create New Lineup: Create a lineup for Youth Fellowship, Worship Event, or custom service.'
    ],
    rule: 'Step 1B: Choose Load Existing Lineup or Create New Lineup.'
  },
  {
    id: 2,
    sectionTitle: 'Basic Guide',
    stepTitle: 'Select Service Type',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="load-service-type-select"]',
    actionPrompt: 'Select your service type to automatically advance.',
    actionType: 'none',
    description: 'Select the service you want to load or create.',
    bullets: [
      'For Load Existing: Choose Sunday Service or Midweek Prayer Service.',
      'For Create New: Choose Sunday Service, Midweek Prayer Service, Youth Fellowship, Worship Event, or Custom Service.'
    ],
    rule: 'Step 2: Select service type.'
  },
  {
    id: 3,
    sectionTitle: 'Basic Guide',
    stepTitle: 'Select Service Date / Lineup',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="load-schedule-date-select"]',
    actionPrompt: 'Choose the existing lineup date or enter a valid date to automatically advance.',
    actionType: 'none',
    description: 'Choose the existing lineup date to open or set the date for a new service.',
    bullets: [
      'For Load Existing: Select the existing lineup date to open.',
      'For Create New: Sunday Service allows Sundays only; Midweek Prayer Service allows Monday–Friday.'
    ],
    rule: 'Step 3: Select lineup date.'
  },
  {
    id: 35,
    sectionTitle: 'Basic Guide',
    stepTitle: 'Load or Create Lineup',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="load-lineup-submit-btn"]',
    actionPrompt: 'Click "Load Lineup" or "Continue" to proceed.',
    actionType: 'click',
    description: 'Confirm your lineup selection to open it in the scheduler editor.',
    bullets: [
      'Opens the selected or newly created lineup set in the editor.',
      'All songs, roles, and notes will be ready for management.'
    ],
    rule: 'Step 3B: Open selected lineup.'
  },
  {
    id: 4,
    sectionTitle: 'Basic Guide',
    stepTitle: 'Choose How to Create Your Line-up',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="add-songs-section"]',
    actionPrompt: 'How would you like to add songs?',
    actionType: 'none',
    description: 'Select your preferred method for adding songs to this line-up.',
    bullets: [
      'Option A: Create Blank Line-up — add songs manually.',
      'Option B: Import Song / Playlist — paste a YouTube or YouTube Music song or playlist URL.'
    ],
    rule: 'Step 4: Choose line-up creation method.'
  },
  {
    id: 41,
    sectionTitle: 'Basic Guide',
    stepTitle: 'Step 4A: Add Songs to Line-up',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="add-songs-section"]',
    actionPrompt: 'Add songs to your line-up.',
    actionType: 'none',
    description: 'Search songs from database or select songs from catalog.',
    bullets: [
      'Type in the song input box to search existing songs with smart auto-complete.',
      'Click + Add Song slot if you need more song rows.'
    ],
    rule: 'Step 4A: Manually add songs.'
  },
  {
    id: 42,
    sectionTitle: 'Basic Guide',
    stepTitle: 'Step 4B: Import Song / Playlist',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="import-playlist-btn"]',
    actionPrompt: 'Import songs from a YouTube or YouTube Music link.',
    actionType: 'none',
    description: 'Import a YouTube or YouTube Music song or playlist link to populate song titles.',
    bullets: [
      'Click "Import Song / Playlist" to open the importer modal.',
      'Paste your YouTube or YouTube Music song or playlist URL and click Import.'
    ],
    rule: 'Step 4B: Import song or playlist.'
  },
  {
    id: 5,
    sectionTitle: 'Basic Guide',
    stepTitle: 'Arrange Songs',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="rearrangeable-song-list"]',
    actionPrompt: 'Arrange your songs in the order you want.',
    actionType: 'none',
    description: 'Reorder songs or switch between Praise and Worship categories.',
    bullets: [
      'Drag and drop or use arrow buttons to reorder songs.',
      'Change category dropdown to move songs between Praise and Worship.'
    ],
    rule: 'Step 5: Arrange your songs.'
  },
  {
    id: 6,
    sectionTitle: 'Basic Guide',
    stepTitle: 'Assign Members',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="team-assignments-panel"]',
    actionPrompt: 'Assign members to their designated ministries.',
    actionType: 'none',
    description: 'Assign members to their designated ministries using the controls below. You can assign as many ministries as needed before continuing.',
    bullets: [
      'Assign Song Leader(s), Backup Singers, Guitarist, Keyboardist, Bassist, Drummer, Audio/Live Technician, Lyricist, and other ministries.',
      'Supports 1 or 2 Song Leaders with automatic Praise/Worship split.',
      'Filters eligible members by ministry tag automatically.'
    ],
    rule: 'Step 6: Assign members to designated worship team roles.'
  },
  {
    id: 7,
    sectionTitle: 'Basic Guide',
    stepTitle: 'Save Schedule',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="save-lineup-btn"]',
    actionPrompt: 'Save your lineup to continue.',
    actionType: 'click',
    description: 'Save the completed worship lineup to history.',
    bullets: [
      'Validates that at least one song is present.',
      'Checks for monthly duplicate song warnings before saving.'
    ],
    rule: 'Step 7: Save lineup to proceed to export.'
  },
  {
    id: 8,
    sectionTitle: 'Basic Guide',
    stepTitle: 'Export Your Line-up',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="export-buttons-pair"]',
    actionPrompt: 'Choose Export as PDF for a printable document or Export as PNG for a high-resolution image.',
    actionType: 'none',
    description: 'Choose Export as PDF for a printable document or Export as PNG for a high-resolution image.',
    bullets: [
      'Export PDF for printable worship team sheets.',
      'Export PNG for sharing on mobile messaging apps.',
      'Skip Export to complete the guide.'
    ],
    rule: 'Step 8: Export PDF / PNG or Skip Export.'
  },
  {
    id: 81,
    sectionTitle: 'Basic Guide',
    stepTitle: 'Export PDF',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="export-pdf-btn"]',
    actionPrompt: 'Click "Export as PDF" to generate a formatted printable sheet.',
    actionType: 'click',
    description: 'Generate a formatted PDF document for printing.',
    bullets: [
      'Generates a formatted PDF document for printing.',
      'Includes church header, song sequence, keys, and team roster assignments.',
      'Automatically downloads the printable PDF document.'
    ],
    rule: 'Step 8A: Export PDF printable sheet.'
  },
  {
    id: 82,
    sectionTitle: 'Basic Guide',
    stepTitle: 'Export PNG',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="export-png-btn"]',
    actionPrompt: 'Click "Export as PNG" to generate a high-resolution image.',
    actionType: 'click',
    description: 'Generate a high-resolution PNG image for sharing.',
    bullets: [
      'Generate a high-resolution PNG image for sharing.',
      'Rendered in crisp 2x pixel density for phones and messaging apps.',
      'Automatically downloads the high-resolution PNG image.'
    ],
    rule: 'Step 8B: Export PNG mobile image.'
  },

  // =========================================================================
  // LEGACY COMPATIBILITY HELP TOPICS (IDs 10–15)
  // =========================================================================
  {
    id: 10,
    sectionTitle: 'Help Topic — Saved Line-ups Archive',
    stepTitle: 'Saved Line-ups Archive & Search',
    targetTab: 'schedules',
    targetSelector: '[data-tour="schedules-view"]',
    actionPrompt: 'Explore saved line-ups, filters, and search.',
    actionType: 'none',
    description: 'View historical worship line-ups, filter by service type or date, search songs, and edit saved sets.',
    bullets: [
      'Filter by Sunday, Midweek, or all service types.',
      'Search by song title or worship team member name.',
      'Export PDF/PNG directly from saved history cards.'
    ],
    rule: 'Help Topic: Saved lineups archive.'
  },
  {
    id: 11,
    sectionTitle: 'Help Topic — Song Database',
    stepTitle: 'Song Database Repository',
    targetTab: 'songs',
    targetSelector: '[data-tour="songs-view"]',
    actionPrompt: 'Explore the central song database.',
    actionType: 'none',
    description: 'Manage master list of songs, original keys, perform counts, and category classifications.',
    bullets: [
      'Add new songs with key, artist, and Praise/Worship category.',
      'View play counts and last played date for every song.',
      'Get smart song recommendations based on recent usage.'
    ],
    rule: 'Help Topic: Song Database.'
  },
  {
    id: 12,
    sectionTitle: 'Help Topic — Member Roster',
    stepTitle: 'Volunteer Roster & Member Editor',
    targetTab: 'members',
    targetSelector: '[data-tour="members-view"]',
    actionPrompt: 'Manage worship team members and ministry tags.',
    actionType: 'none',
    description: 'Add members, assign ministry labels (Song Leader, Vocalist, Musician), and manage Disciplinary Action (DA) status.',
    bullets: [
      'Tag members with relevant roles for smart scheduler filtering.',
      'Set DA status to mark members with a scheduling confirmation safety guard.',
      'Manage custom tags and hierarchy.'
    ],
    rule: 'Help Topic: Member Roster.'
  },
  {
    id: 13,
    sectionTitle: 'Help Topic — Song Repetition Detection',
    stepTitle: 'First-Come Song Repetition Detection',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="rearrangeable-song-list"]',
    actionPrompt: 'Song repetition detection features.',
    actionType: 'none',
    description: 'Prevent overused songs with first-come, first-serve monthly usage warnings across schedules.',
    bullets: [
      'First lineup created in a month gets priority for requested songs.',
      'Highlights songs already scheduled earlier in the same month.',
      'Cross-month warnings help maintain song variety.'
    ],
    rule: 'Help Topic: Song Repetition.'
  },
  {
    id: 14,
    sectionTitle: 'Help Topic — Application Settings',
    stepTitle: 'Application Settings & Themes',
    targetTab: 'dashboard',
    targetSelector: '[data-tour="theme-toggle"]',
    actionPrompt: 'Customize themes and guide options.',
    actionType: 'none',
    description: 'Toggle Light, Dark, or AMOLED themes and configure guide preferences.',
    bullets: [
      'Choose visual theme options suited for sanctuary or stage lighting.',
      'Configure Interactive Guide behavior for new users.',
      'Customize default preferences and app behavior.'
    ],
    rule: 'Help Topic: Settings.'
  },
  {
    id: 15,
    sectionTitle: 'Help Topic — Backup & Restore',
    stepTitle: 'Backup & Restore Data',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="sidebar-settings-btn"]',
    actionPrompt: 'Backup and restore application data.',
    actionType: 'none',
    description: 'Export or restore complete JSON data backups safely.',
    bullets: [
      'Export complete JSON backup containing songs, members, and saved lineups.',
      'Restore backups anytime to recover or migrate data.'
    ],
    rule: 'Help Topic: Backup & Restore.'
  },

  // =========================================================================
  // ADVANCED GUIDE: PC → PHONE QR CODE DATA TRANSFER (Steps 200–207)
  // =========================================================================
  {
    id: 200,
    sectionTitle: 'Advanced Guide — PC → Phone QR Transfer',
    stepTitle: 'Step 1: Open Transfer Data',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="sidebar-settings-btn"]',
    actionPrompt: 'Click "Transfer Data" to begin device sync.',
    actionType: 'none',
    description: 'Transfer application data directly from a PC/computer to a phone or tablet using a secure temporary QR session.',
    bullets: [
      'Accessible anytime via the top header bar, left sidebar, or Settings menu.',
      'Allows instant synchronization without external account logins or manual JSON file handling.'
    ],
    rule: 'Step 1: Open Transfer Data dialog.'
  },
  {
    id: 201,
    sectionTitle: 'Advanced Guide — PC → Phone QR Transfer',
    stepTitle: 'Step 2: Choose PC / Computer Sender',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="transfer-pc-option"]',
    actionPrompt: 'Select "PC / Computer" to export and generate a QR transfer code.',
    actionType: 'none',
    description: 'Choose the PC sender role when you are sitting at your computer and want to send data to your mobile phone.',
    bullets: [
      'Prepares your members, song database, saved lineups, and active drafts for transfer.',
      'No data is uploaded to public servers permanently; uses a temporary secure session.'
    ],
    rule: 'Step 2: Select PC / Computer sender mode.'
  },
  {
    id: 202,
    sectionTitle: 'Advanced Guide — PC → Phone QR Transfer',
    stepTitle: 'Step 3: Generate Transfer QR Code',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="transfer-generate-btn"]',
    actionPrompt: 'Review options and click "Generate Transfer QR".',
    actionType: 'none',
    description: 'Create a temporary, encrypted 10-minute transfer session token.',
    bullets: [
      'Optionally check "Include current working draft" to transfer active unsaved schedule edits.',
      'Generates a unique QR code on screen for the phone camera to scan.'
    ],
    rule: 'Step 3: Generate transfer QR code.'
  },
  {
    id: 203,
    sectionTitle: 'Advanced Guide — PC → Phone QR Transfer',
    stepTitle: 'Step 4: PC Waiting for Phone Connection',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="transfer-qr-display"]',
    actionPrompt: 'Keep this QR code open on your computer screen.',
    actionType: 'none',
    description: 'Your PC displays the transfer QR code and live countdown timer while waiting for the phone to connect.',
    bullets: [
      'Live countdown displays remaining session time (10 minutes total).',
      'The status indicator turns green with "Device connected!" as soon as your phone connects.'
    ],
    rule: 'Step 4: PC awaits mobile connection.'
  },
  {
    id: 204,
    sectionTitle: 'Advanced Guide — PC → Phone QR Transfer',
    stepTitle: 'Step 5: Open Transfer on Phone',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="transfer-phone-option"]',
    actionPrompt: 'On your phone, open the app and tap "Transfer Data" → "Phone / Mobile".',
    actionType: 'none',
    description: 'Open the Transfer Data modal on your phone or mobile tablet to activate the receiver scanner.',
    bullets: [
      'Select Phone / Mobile to launch the built-in camera QR scanner.',
      'Requires standard camera permission on mobile browsers.'
    ],
    rule: 'Step 5: Open Phone scanner mode.'
  },
  {
    id: 205,
    sectionTitle: 'Advanced Guide — PC → Phone QR Transfer',
    stepTitle: 'Step 6: Scan PC Screen with Phone Camera',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="transfer-scanner-view"]',
    actionPrompt: 'Point your phone camera at the QR code displayed on the PC screen.',
    actionType: 'none',
    description: 'The in-app scanner detects the session credentials and securely connects the two devices.',
    bullets: [
      'Automatic instant QR detection with visual alignment frame.',
      'Direct peer-style data transfer over the temporary session bridge.'
    ],
    rule: 'Step 6: Scan QR code on PC screen.'
  },
  {
    id: 206,
    sectionTitle: 'Advanced Guide — PC → Phone QR Transfer',
    stepTitle: 'Step 7: Confirm & Select Import Strategy',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="transfer-confirm-panel"]',
    actionPrompt: 'Review incoming record counts and choose Merge or Replace.',
    actionType: 'none',
    description: 'Review transfer payload summary (members, songs, line-ups) and choose how to import data onto the phone.',
    bullets: [
      'Merge with Existing Phone Data (Safe): Appends new songs and schedules without deleting current phone data.',
      'Replace All Local Data: Replaces phone data completely to make an exact mirror of the PC.'
    ],
    rule: 'Step 7: Choose import strategy.'
  },
  {
    id: 207,
    sectionTitle: 'Advanced Guide — PC → Phone QR Transfer',
    stepTitle: 'Step 8: Complete Transfer & Auto Disconnect',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="transfer-import-btn"]',
    actionPrompt: 'Tap "Import Data" to finish the transfer.',
    actionType: 'none',
    description: 'Transfers the data into local storage on the phone and automatically closes the temporary session on both devices.',
    bullets: [
      'Both PC and phone display confirmation when data import completes.',
      'Temporary session token is immediately invalidated and destroyed.'
    ],
    rule: 'Step 8: Finalize transfer and disconnect.'
  },

  // =========================================================================
  // ADVANCED GUIDE: LINEUP EXPORT (PDF & PNG) (Steps 300–303)
  // =========================================================================
  {
    id: 300,
    sectionTitle: 'Advanced Guide — Exporting Lineups',
    stepTitle: 'Save & Export Controls Overview',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="save-lineup-btn"]',
    actionPrompt: 'Save or prepare your lineup before exporting.',
    actionType: 'none',
    description: 'Lineup export buttons allow you to generate formatted PDF sheets or high-resolution PNG images directly from the active scheduler or saved history.',
    bullets: [
      'Export as PDF: Generates a clean, printable document for stage folders and musicians.',
      'Export as PNG: Creates a high-definition image card ideal for Viber, WhatsApp, and Facebook groups.',
      'Exporting automatically embeds service date, service type, song titles, original keys, and assigned ministry members.'
    ],
    rule: 'Export Guide 1: Overview of export capabilities.'
  },
  {
    id: 301,
    sectionTitle: 'Advanced Guide — Exporting Lineups',
    stepTitle: 'Export as Printable PDF Document',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="export-pdf-btn"]',
    actionPrompt: 'Click "Export as PDF" to generate a formatted printable sheet.',
    actionType: 'click',
    description: 'Generates an organized PDF document layout complete with church header, song sequence, keys, team roster assignments, and notes.',
    bullets: [
      'Automatically downloads the PDF directly into your browser download folder.',
      'Formatted to fit standard Letter and A4 portrait print layouts cleanly.',
      'Includes designated ministry roles and song sequence in order.'
    ],
    rule: 'Export Guide 2: Export PDF printable sheet.'
  },
  {
    id: 302,
    sectionTitle: 'Advanced Guide — Exporting Lineups',
    stepTitle: 'Export as High-Resolution PNG Image',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="export-png-btn"]',
    actionPrompt: 'Click "Export as PNG" to generate an image card for mobile sharing.',
    actionType: 'click',
    description: 'Generates a beautiful, crisp PNG graphics image of the lineup set for instant sharing to mobile messaging groups and social channels.',
    bullets: [
      'Rendered in high-resolution 2x pixel density for crystal-clear readability on phones.',
      'Ideal for sharing in worship team group chats, Messenger, Viber, and WhatsApp.',
      'Includes Praise/Worship songs and assigned ministry team members.'
    ],
    rule: 'Export Guide 3: Export PNG mobile image.'
  },
  {
    id: 303,
    sectionTitle: 'Advanced Guide — Exporting Lineups',
    stepTitle: 'Export from Saved Lineups History',
    targetTab: 'schedules',
    targetSelector: '[data-tour="schedules-view"]',
    actionPrompt: 'Export PDF or PNG directly from any historical lineup card.',
    actionType: 'none',
    description: 'You do not need to reload an old schedule to export it. Historical lineup cards have direct PDF and PNG download buttons.',
    bullets: [
      'Navigate to the Schedules tab anytime to find previous lineups.',
      'Use the PDF (FileDown) or PNG (Image) button on any saved lineup card for instant 1-click export.',
      'Supports bulk PDF export of multiple selected schedules.'
    ],
    rule: 'Export Guide 4: Historical lineup card exports.'
  },

  // =========================================================================
  // ADVANCED GUIDE: SONG DATABASE & METADATA (Steps 310–313)
  // =========================================================================
  {
    id: 310,
    sectionTitle: 'Advanced Guide — Song Database',
    stepTitle: 'Worship Library Overview',
    targetTab: 'songs',
    targetSelector: '[data-tour="songs-view"]',
    actionPrompt: 'Explore the central song database repository.',
    actionType: 'none',
    description: 'The Song Database is your central repository of worship and praise songs, storing musical keys, artist info, YouTube links, and usage history.',
    bullets: [
      'Real-time stats display Total Songs, Praise Songs, Worship Songs, and songs Used This Month.',
      'Smart tracking records when each song was last scheduled and how many times it has been played.'
    ],
    rule: 'Song DB Guide 1: Repository overview.'
  },
  {
    id: 311,
    sectionTitle: 'Advanced Guide — Song Database',
    stepTitle: 'Search, Filter & Browse Library',
    targetTab: 'songs',
    targetSelector: '[data-tour="song-search-input"]',
    actionPrompt: 'Search by song title, artist, musical key, or CCLI number.',
    actionType: 'input',
    description: 'Use instant multi-field search and category pills (All, Praise, Worship) to filter and locate songs quickly.',
    bullets: [
      'Search matches song titles, original keys (e.g. "Key: G"), artists, and tags.',
      'Filter buttons allow instant isolation of Praise or Worship repertoire.'
    ],
    rule: 'Song DB Guide 2: Search and filtering.'
  },
  {
    id: 312,
    sectionTitle: 'Advanced Guide — Song Database',
    stepTitle: 'Add New Song & Key Specifications',
    targetTab: 'songs',
    targetSelector: '[data-tour="add-song-btn"]',
    actionPrompt: 'Click "Add New Song" to add a new song to your church catalog.',
    actionType: 'click',
    description: 'Add songs with their standard key, category, tempo, artist, and optional YouTube reference link.',
    bullets: [
      'Specify Original Key so the scheduler can automatically populate keys when adding to a lineup.',
      'Classify as Praise or Worship for automatic category placement.',
      'Attach YouTube links so worship leaders can reference song arrangements.'
    ],
    rule: 'Song DB Guide 3: Adding new songs.'
  },
  {
    id: 313,
    sectionTitle: 'Advanced Guide — Song Database',
    stepTitle: 'Usage Analytics & Smart Recommendations',
    targetTab: 'songs',
    targetSelector: '[data-tour="songs-view"]',
    actionPrompt: 'Review play counts, last played dates, and song recommendations.',
    actionType: 'none',
    description: 'Usage analytics help song leaders maintain variety and avoid over-scheduling recent songs.',
    bullets: [
      'View "Last Played" date and monthly count on every song card.',
      'Sort songs by Most Played, Least Played, or Recently Added.',
      'Helps balance fresh songs with congregation favorites.'
    ],
    rule: 'Song DB Guide 4: Usage tracking and variety.'
  },

  // =========================================================================
  // ADVANCED GUIDE: YOUTUBE & YT MUSIC PLAYLIST IMPORT (Steps 320–323)
  // =========================================================================
  {
    id: 320,
    sectionTitle: 'Advanced Guide — Song & Playlist Import',
    stepTitle: 'Open Song / Playlist Importer',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="import-playlist-btn"]',
    actionPrompt: 'Click "Import Song / Playlist" to open the importer.',
    actionType: 'click',
    description: 'The Importer lets you import individual songs or full playlists directly from YouTube and YouTube Music links into your line-up.',
    bullets: [
      'Automatically detects single song URLs and full playlist URLs.',
      'Extracts clean song titles, artist metadata, keys, and video links.'
    ],
    rule: 'Import Guide 1: Open smart importer.'
  },
  {
    id: 321,
    sectionTitle: 'Advanced Guide — YouTube Playlist Import',
    stepTitle: 'Paste Playlist URL',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="playlist-url-input"]',
    actionPrompt: 'Paste your YouTube or YouTube Music playlist URL.',
    actionType: 'input',
    description: 'Paste any standard YouTube or YouTube Music playlist link (e.g., https://youtube.com/playlist?list=...).',
    bullets: [
      'Works with standard playlists and YouTube Music share links.',
      'Click "Fetch Playlist" to retrieve song titles and video information.'
    ],
    rule: 'Playlist Guide 2: Paste playlist link.'
  },
  {
    id: 322,
    sectionTitle: 'Advanced Guide — YouTube Playlist Import',
    stepTitle: 'Preview & Select Songs',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="import-submit-btn"]',
    actionPrompt: 'Review fetched tracks, check/uncheck songs, and click Import.',
    actionType: 'click',
    description: 'Inspect the list of songs detected in the playlist and customize which songs to include in the line-up.',
    bullets: [
      'Select or unselect individual songs with checkboxes.',
      'Smart title cleaning strips out clutter like "(Official Video)" or "[Audio]".'
    ],
    rule: 'Playlist Guide 3: Preview and selection.'
  },
  {
    id: 323,
    sectionTitle: 'Advanced Guide — YouTube Playlist Import',
    stepTitle: 'Import Strategy (Merge vs Replace)',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="import-done-btn"]',
    actionPrompt: 'Choose Merge or Replace and click "Done & Edit Line-up".',
    actionType: 'click',
    description: 'Confirm how imported songs integrate with your current line-up.',
    bullets: [
      'Merge: Appends playlist tracks to your existing Praise and Worship slots.',
      'Replace: Replaces current draft songs with the imported playlist.',
      'Automatically matches and links to existing song entries in your database.'
    ],
    rule: 'Playlist Guide 4: Finalize and populate lineup.'
  },

  // =========================================================================
  // ADVANCED GUIDE: VOLUNTEER ROSTER & MEMBER EDITOR (Steps 330–334)
  // =========================================================================
  {
    id: 330,
    sectionTitle: 'Advanced Guide — Member Roster',
    stepTitle: 'Roster & Volunteer Directory',
    targetTab: 'members',
    targetSelector: '[data-tour="members-view"]',
    actionPrompt: 'Manage worship team members, tags, and ministry readiness.',
    actionType: 'none',
    description: 'The Member Roster manages all volunteers, vocalists, musicians, and technical personnel in your worship ministry.',
    bullets: [
      'Filter members by ministry tag, search by name, or sort alphabetically/by date.',
      'Provides smart candidate suggestions during lineup scheduling.'
    ],
    rule: 'Member Guide 1: Roster directory.'
  },
  {
    id: 331,
    sectionTitle: 'Advanced Guide — Member Roster',
    stepTitle: 'Add or Edit Team Member',
    targetTab: 'members',
    targetSelector: '[data-tour="member-name-input"]',
    actionPrompt: 'Enter the member\'s full name (e.g. Bro. John Reyes).',
    actionType: 'input',
    description: 'Type member name in the input box. The system automatically detects duplicate or similar names to prevent duplicate records.',
    bullets: [
      'Exact and fuzzy duplicate detection alerts you if a similar name exists.',
      'Supports honorifics and ministry titles.'
    ],
    rule: 'Member Guide 2: Member name input.'
  },
  {
    id: 332,
    sectionTitle: 'Advanced Guide — Member Roster',
    stepTitle: 'Assign Ministry Labels & Roles',
    targetTab: 'members',
    targetSelector: '[data-tour="member-tags-select"]',
    actionPrompt: 'Click ministry tags to assign (Song Leader, Vocalist, Guitarist, etc.).',
    actionType: 'click',
    description: 'Assign one or multiple ministry tags to each member. The scheduler uses these tags to filter eligible volunteers.',
    bullets: [
      'Assign tags: Song Leader, Vocalist / Backup, Acoustic Guitar, Electric Guitar, Bass, Keyboard, Drums, Audio Tech, Lyricist.',
      'Create custom ministry tags anytime for unique church roles.'
    ],
    rule: 'Member Guide 3: Ministry tags.'
  },
  {
    id: 333,
    sectionTitle: 'Advanced Guide — Member Roster',
    stepTitle: 'Disciplinary Action (DA) Guard',
    targetTab: 'members',
    targetSelector: '[data-tour="members-view"]',
    actionPrompt: 'Manage Disciplinary Action status and assignment eligibility.',
    actionType: 'none',
    description: 'When a member is placed under Disciplinary Action, they are safely marked with a scheduling confirmation guard.',
    bullets: [
      'DA members are visually marked with a badge and require explicit confirmation before scheduling.',
      'Set disciplinary duration (days, weeks, months) with automatic or manual clearance.'
    ],
    rule: 'Member Guide 4: DA status guard.'
  },
  {
    id: 334,
    sectionTitle: 'Advanced Guide — Member Roster',
    stepTitle: 'Multi-Select & Bulk Management',
    targetTab: 'members',
    targetSelector: '[data-tour="members-view"]',
    actionPrompt: 'Use multi-select checkboxes for bulk tag assignment or deletion.',
    actionType: 'none',
    description: 'Perform batch operations on multiple team members simultaneously.',
    bullets: [
      'Select multiple members using checkboxes for batch tagging or bulk removal.',
      'Export roster data or clean up inactive volunteer records easily.'
    ],
    rule: 'Member Guide 5: Multi-select management.'
  },

  // =========================================================================
  // ADVANCED GUIDE: WORSHIP TEAM MEMBER ASSIGNMENT (Steps 340–343)
  // =========================================================================
  {
    id: 340,
    sectionTitle: 'Advanced Guide — Member Assignment',
    stepTitle: 'Team Assignments Panel Overview',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="team-assignments-panel"]',
    actionPrompt: 'Assign worship team members to their designated ministry roles.',
    actionType: 'none',
    description: 'The Team Assignments panel lets you assign volunteers to every ministry role needed for Sunday or Midweek service.',
    bullets: [
      'Dropdowns filter volunteers automatically by matching ministry tags.',
      'Supports multiple volunteers per role (e.g. multiple Backup Singers or Guitarists).'
    ],
    rule: 'Assignment Guide 1: Overview.'
  },
  {
    id: 341,
    sectionTitle: 'Advanced Guide — Member Assignment',
    stepTitle: 'Song Leader(s) Assignment',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="team-assignments-panel"]',
    actionPrompt: 'Assign 1 Song Leader or split Praise and Worship leaders.',
    actionType: 'none',
    description: 'The system flexibly supports single Song Leader or dual Song Leaders for split Praise and Worship leadership.',
    bullets: [
      'Assign a single overall Song Leader for the entire service.',
      'Or assign separate Praise Song Leader and Worship Song Leader.',
      'Only members with the "Song Leader" tag are recommended.'
    ],
    rule: 'Assignment Guide 2: Song Leader split.'
  },
  {
    id: 342,
    sectionTitle: 'Advanced Guide — Member Assignment',
    stepTitle: 'Backup Singers & Vocalists',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="team-assignments-panel"]',
    actionPrompt: 'Assign backup vocalists for Praise and Worship sets.',
    actionType: 'none',
    description: 'Add multiple backup singers and specify vocal parts or notes.',
    bullets: [
      'Add as many backup singer slots as needed with "+ Add Singer".',
      'Supports dedicated notes per singer (e.g. Alto, Tenor, Soprano harmonies).'
    ],
    rule: 'Assignment Guide 3: Backup vocalists.'
  },
  {
    id: 343,
    sectionTitle: 'Advanced Guide — Member Assignment',
    stepTitle: 'Musicians & Technical Ministry Roles',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="team-assignments-panel"]',
    actionPrompt: 'Assign band musicians and technical operators.',
    actionType: 'none',
    description: 'Assign Guitarist, Keyboardist, Bassist, Drummer, Sound Engineer, and Presentation / Lyricist.',
    bullets: [
      'Smart filters ensure only qualified instrumentalists appear in candidate lists.',
      'Assign Sound Tech and Lyricist so technical teams are prepared before service.'
    ],
    rule: 'Assignment Guide 4: Musicians and technical ministry.'
  },

  // =========================================================================
  // ADVANCED GUIDE: SERVICE SCHEDULING & SERVICE TYPES (Steps 350–353)
  // =========================================================================
  {
    id: 350,
    sectionTitle: 'Advanced Guide — Scheduling & Service Types',
    stepTitle: 'New Lineup Action Center',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="header-new-lineup-btn"]',
    actionPrompt: 'Click "+ New Lineup" to choose between loading or creating.',
    actionType: 'click',
    description: 'Access the unified lineup creation hub for Sunday, Midweek, Youth, and Special Services.',
    bullets: [
      'Load Existing Lineup: Opens pre-generated placeholder sets for upcoming Sundays/Midweeks.',
      'Create New Lineup: Build custom event lineups for fellowships and special gatherings.'
    ],
    rule: 'Service Guide 1: Action center.'
  },
  {
    id: 351,
    sectionTitle: 'Advanced Guide — Scheduling & Service Types',
    stepTitle: 'Sunday vs Midweek Prayer Services',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="new-lineup-options-container"]',
    actionPrompt: 'Select Sunday Service or Midweek Prayer Service.',
    actionType: 'none',
    description: 'WWCF Santa Cruz schedules follow recurring Sunday and Midweek service cycles with automated date progression.',
    bullets: [
      'Sunday Service: Standard Sunday worship gathering.',
      'Midweek Prayer Service: Wednesday / midweek worship set.'
    ],
    rule: 'Service Guide 2: Service types.'
  },
  {
    id: 352,
    sectionTitle: 'Advanced Guide — Scheduling & Service Types',
    stepTitle: 'Youth Fellowship & Custom Events',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="load-service-type-select"]',
    actionPrompt: 'Create custom service events for fellowships and conferences.',
    actionType: 'none',
    description: 'Create tailored lineups for Youth Fellowship, Special Worship Nights, Camp Events, and Custom Gatherings.',
    bullets: [
      'Select "Youth Fellowship" or "Special Worship Event".',
      'Or choose "Custom Service..." to type any custom service name.'
    ],
    rule: 'Service Guide 3: Custom service events.'
  },
  {
    id: 353,
    sectionTitle: 'Advanced Guide — Scheduling & Service Types',
    stepTitle: 'Service Date Logic & Conflict Protection',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="load-schedule-date-select"]',
    actionPrompt: 'Select target service date with automatic collision protection.',
    actionType: 'none',
    description: 'Intelligent conflict protection prevents accidental overwriting of existing lineups on the same date.',
    bullets: [
      'If a lineup already exists for the chosen date, the app warns you and offers to load the existing set.',
      'All dates are synchronized to Manila Time (PHT / UTC+8).'
    ],
    rule: 'Service Guide 4: Date calculation and conflict guard.'
  },

  // =========================================================================
  // ADVANCED GUIDE: SONG REPETITION GUARD & 30-DAY VARIETY (Steps 360–362)
  // =========================================================================
  {
    id: 360,
    sectionTitle: 'Advanced Guide — Song Repetition Guard',
    stepTitle: 'First-Come Song Priority Overview',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="rearrangeable-song-list"]',
    actionPrompt: 'Learn how song repetition warnings protect variety.',
    actionType: 'none',
    description: 'First-come, first-serve song repetition detection alerts song leaders when a song was already scheduled earlier in the same month.',
    bullets: [
      'The first lineup created in a month claims priority for its songs.',
      'Subsequent lineups in the same month display a warning if they repeat those songs.',
      'Helps maintain fresh repertoire across all worship services.'
    ],
    rule: 'Repetition Guide 1: First-come priority.'
  },
  {
    id: 361,
    sectionTitle: 'Advanced Guide — Song Repetition Guard',
    stepTitle: 'Monthly 30-Day Warning Modal',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="rearrangeable-song-list"]',
    actionPrompt: 'Review the warning dialog when saving duplicate songs.',
    actionType: 'none',
    description: 'When saving a lineup with repeated songs, an informative confirmation modal appears.',
    bullets: [
      'Shows which songs are repeated and which earlier service scheduled them.',
      'Gives you options: "Choose Another Song" to replace, or "Use Anyway" if intentional.'
    ],
    rule: 'Repetition Guide 2: Warning modal.'
  },
  {
    id: 362,
    sectionTitle: 'Advanced Guide — Song Repetition Guard',
    stepTitle: 'Smart Song Replacements & History',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="rearrangeable-song-list"]',
    actionPrompt: 'Use the Song Picker to select fresh, unused alternatives.',
    actionType: 'none',
    description: 'The Song Picker highlights unused songs in the current month to help you pick great alternatives easily.',
    bullets: [
      'Green indicators mark songs that have not been played recently.',
      'Maintains congregation engagement and spiritual freshness.'
    ],
    rule: 'Repetition Guide 3: Smart replacements.'
  },

  // =========================================================================
  // ADVANCED GUIDE: SAVED LINE-UPS ARCHIVE & HISTORY (Steps 370–373)
  // =========================================================================
  {
    id: 370,
    sectionTitle: 'Advanced Guide — Saved Line-ups Archive',
    stepTitle: 'Saved Lineups Catalog',
    targetTab: 'schedules',
    targetSelector: '[data-tour="schedules-view"]',
    actionPrompt: 'Browse historical worship lineups in chronological order.',
    actionType: 'none',
    description: 'The Saved Line-ups Archive keeps permanent records of all past and planned worship lineups.',
    bullets: [
      'Organized in chronological order with date, service type, song count, and status badges.',
      'Displays quick song preview bullets with keys and expandable details.'
    ],
    rule: 'Archive Guide 1: History catalog.'
  },
  {
    id: 371,
    sectionTitle: 'Advanced Guide — Saved Line-ups Archive',
    stepTitle: 'Search by Song or Team Member & Filters',
    targetTab: 'schedules',
    targetSelector: '[data-tour="schedules-view"]',
    actionPrompt: 'Search lineups by song title, team member name, or filter by month.',
    actionType: 'none',
    description: 'Find past lineups instantly with comprehensive multi-criteria search and filters.',
    bullets: [
      'Search for any song to see all past dates when it was scheduled.',
      'Search a member name (e.g., "Bro. John") to find all lineups they led or played in.',
      'Filter by month or service type (Sunday vs Midweek).'
    ],
    rule: 'Archive Guide 2: Search and filtering.'
  },
  {
    id: 372,
    sectionTitle: 'Advanced Guide — Saved Line-ups Archive',
    stepTitle: 'Edit, Duplicate & Reload Lineup',
    targetTab: 'schedules',
    targetSelector: '[data-tour="schedules-view"]',
    actionPrompt: 'Edit saved lineups or duplicate sets for future services.',
    actionType: 'none',
    description: 'Manage individual lineup records with 1-click action buttons on every card.',
    bullets: [
      'Edit (Pencil): Loads the lineup back into the scheduler editor for modifications.',
      'Duplicate (Copy): Duplicates a successful lineup to a new upcoming date.',
      'Delete (Trash): Removes unwanted schedule records.'
    ],
    rule: 'Archive Guide 3: Edit and duplicate.'
  },
  {
    id: 373,
    sectionTitle: 'Advanced Guide — Saved Line-ups Archive',
    stepTitle: 'Batch Actions & Bulk Lineup Management',
    targetTab: 'schedules',
    targetSelector: '[data-tour="schedules-view"]',
    actionPrompt: 'Use row checkboxes for bulk PDF export or bulk deletion.',
    actionType: 'none',
    description: 'Select multiple lineup records using checkboxes to perform batch actions.',
    bullets: [
      'Bulk PDF Export: Generates printable PDFs for all selected lineups in one click.',
      'Bulk Delete: Safely remove multiple old test schedules.'
    ],
    rule: 'Archive Guide 4: Bulk actions.'
  },

  // =========================================================================
  // ADVANCED GUIDE: BACKUP & RESTORE DATA (Steps 380–382)
  // =========================================================================
  {
    id: 380,
    sectionTitle: 'Advanced Guide — Backup & Restore',
    stepTitle: 'Open Backup & Recovery Hub',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="sidebar-settings-btn"]',
    actionPrompt: 'Click "Settings" in the bottom-left sidebar to open Settings, Backup & Restore.',
    actionType: 'click',
    description: 'Safeguard your entire ministry database with offline JSON backup files.',
    bullets: [
      'Accessible via the bottom-left Settings menu.',
      'Contains complete database state: members, tags, song catalog, keys, and saved lineups.'
    ],
    rule: 'Backup Guide 1: Open backup hub.'
  },
  {
    id: 381,
    sectionTitle: 'Advanced Guide — Backup & Restore',
    stepTitle: 'Download Full JSON Database Backup',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="download-backup-btn"]',
    actionPrompt: 'Click "Download Backup File" to export a full JSON backup.',
    actionType: 'click',
    description: 'Downloads a standardized JSON backup file containing your complete church database.',
    bullets: [
      'File is automatically timestamped (e.g., wwcf_santa_cruz_backup_2026-08-13.json).',
      'Store backups on Google Drive, USB drives, or email them to ministry heads for safekeeping.'
    ],
    rule: 'Backup Guide 2: Download backup JSON.'
  },
  {
    id: 382,
    sectionTitle: 'Advanced Guide — Backup & Restore',
    stepTitle: 'Restore Database from JSON File',
    targetTab: 'scheduler',
    targetSelector: '[data-tour="restore-file-btn"]',
    actionPrompt: 'Click "Select Backup File..." to restore your data from JSON.',
    actionType: 'click',
    description: 'Restores all records from a backup file with confirmation safeguards.',
    bullets: [
      'Validates backup file structure before applying changes.',
      'Displays a preview summary of records to be restored before final confirmation.'
    ],
    rule: 'Backup Guide 3: Restore database.'
  },

  // =========================================================================
  // ADVANCED GUIDE: APPLICATION SETTINGS & THEMES (Steps 390–392)
  // =========================================================================
  {
    id: 390,
    sectionTitle: 'Advanced Guide — Settings & Themes',
    stepTitle: 'Open Settings & Preferences',
    targetTab: 'dashboard',
    targetSelector: '[data-tour="sidebar-settings-btn"]',
    actionPrompt: 'Click the Settings button in the bottom-left sidebar.',
    actionType: 'click',
    description: 'Customize application preferences, appearance themes, and guide auto-show behavior.',
    bullets: [
      'Accessible from bottom-left sidebar navigation.',
      'Central hub for visual display modes and guide preferences.'
    ],
    rule: 'Settings Guide 1: Open settings.'
  },
  {
    id: 391,
    sectionTitle: 'Advanced Guide — Settings & Themes',
    stepTitle: 'Interactive Guide Frequency',
    targetTab: 'dashboard',
    targetSelector: '[data-tour="guide-settings-panel"]',
    actionPrompt: 'Choose when the Interactive Guide appears automatically.',
    actionType: 'none',
    description: 'Control guide auto-launch behavior for new or experienced team members.',
    bullets: [
      'Show on first visit only (Default): Ideal for onboarding new song leaders.',
      'Show every time I use the site: Great for training sessions.',
      'Never show automatically: For experienced users who prefer launching manually.'
    ],
    rule: 'Settings Guide 2: Guide frequency.'
  },
  {
    id: 392,
    sectionTitle: 'Advanced Guide — Settings & Themes',
    stepTitle: 'Light Theme vs AMOLED Dark Mode',
    targetTab: 'dashboard',
    targetSelector: '[data-tour="theme-toggle"]',
    actionPrompt: 'Toggle between Light Theme and pure AMOLED Dark Mode.',
    actionType: 'click',
    description: 'Select the optimal display mode for your environment.',
    bullets: [
      'Light Theme: Clean, high-contrast daylight theme for office and planning.',
      'AMOLED Dark Mode: Pure #000000 background engineered for sanctuary stage lighting and battery saving.'
    ],
    rule: 'Settings Guide 3: Display themes.'
  }
];
