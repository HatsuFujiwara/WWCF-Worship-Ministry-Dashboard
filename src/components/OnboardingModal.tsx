import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { StorageService } from '../services/storage';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import {
  Church,
  Music,
  Calendar,
  Users,
  FileText,
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Sparkles,
  Sliders,
  ListFilter,
  CheckSquare,
  AlertTriangle,
  Download,
  Settings,
  HelpCircle,
  Database,
  Tag,
  Repeat,
  Share2,
  Sun,
  Moon,
  Layers,
  Search,
  Maximize2,
  Plus,
  Shield,
  ShieldAlert
} from 'lucide-react';

export interface GuideStep {
  id: number;
  sectionNumber: number;
  sectionTitle: string;
  stepTitle: string;
  targetTab: 'dashboard' | 'scheduler' | 'schedules' | 'members' | 'songs';
  highlightLabel?: string;
  description: string;
  bullets: string[];
  example?: string;
  icon: React.ElementType;
}

export const GUIDE_STEPS: GuideStep[] = [
  // SECTION 1 — Getting Started
  {
    id: 1,
    sectionNumber: 1,
    sectionTitle: 'SECTION 1 — Getting Started',
    stepTitle: 'Welcome to WWCF Santa Cruz',
    targetTab: 'dashboard',
    highlightLabel: 'Main Application Overview',
    description: 'Welcome to the official worship ministry song line-up scheduler for Word for the World Christian Fellowship – Santa Cruz.',
    bullets: [
      'Organize worship songs, keys, BPM, and themes.',
      'Manage worship team members, instrument roles, and availability.',
      'Plan Sunday and Midweek Prayer Service line-ups with intelligent song recommendations.',
      'Import YouTube playlists and export clean service sheets in PDF & PNG formats.'
    ],
    example: 'Designed specifically for worship leaders and music directors at WWCF Santa Cruz.',
    icon: Church
  },
  {
    id: 2,
    sectionNumber: 1,
    sectionTitle: 'SECTION 1 — Getting Started',
    stepTitle: 'Sidebar & Main Navigation',
    targetTab: 'dashboard',
    highlightLabel: 'Navigation Bar / Sidebar',
    description: 'Navigate seamlessly between key modules using the sidebar or mobile menu.',
    bullets: [
      'Dashboard: Overview of saved line-ups, empty line-ups, and service counters.',
      'Song Scheduler: Create, edit, and assign worship team members to line-ups.',
      'Song Database: Your central library for songs, keys, and usage tracking.',
      'Saved Lineups: Searchable list of completed and historical service line-ups.',
      'Member Editor: Roster management for worship team members and ministry roles.',
      'Settings & Guide: Theme selection, preferences, and interactive user guide.'
    ],
    example: 'On mobile, tap the menu hamburger icon in the header to open navigation.',
    icon: Sliders
  },

  // SECTION 2 — Dashboard
  {
    id: 3,
    sectionNumber: 2,
    sectionTitle: 'SECTION 2 — Dashboard Overview',
    stepTitle: 'Dashboard Overview & Statistics',
    targetTab: 'dashboard',
    highlightLabel: 'Dashboard Summary Cards',
    description: 'The Dashboard displays live summary metrics for your church worship planning.',
    bullets: [
      'Saved Line-ups: Count of completed service line-ups with at least one song.',
      'Empty Line-ups: Count of scheduled service dates awaiting song selection.',
      'Sunday Services: Total scheduled Sunday worship services.',
      'Midweek Services: Total scheduled Wednesday Prayer Meeting line-ups.'
    ],
    example: 'Metrics automatically recalculate in real-time as line-ups are saved or updated.',
    icon: Church
  },
  {
    id: 4,
    sectionNumber: 2,
    sectionTitle: 'SECTION 2 — Dashboard Overview',
    stepTitle: 'Empty Line-ups (Automatic Placeholders)',
    targetTab: 'dashboard',
    highlightLabel: 'Empty Line-ups Card',
    description: 'The system automatically generates empty line-ups for upcoming service dates.',
    bullets: [
      'Empty line-ups serve as placeholders so future dates are never forgotten.',
      'An empty line-up contains 0 songs and is ready for completion.',
      'Clicking "Create Line-up" opens an existing empty line-up if one is available instead of creating a duplicate date.'
    ],
    example: 'Example: An empty Sunday placeholder for the upcoming weekend awaits song picks.',
    icon: Calendar
  },
  {
    id: 5,
    sectionNumber: 2,
    sectionTitle: 'SECTION 2 — Dashboard Overview',
    stepTitle: 'Saved Line-ups (Completed Services)',
    targetTab: 'dashboard',
    highlightLabel: 'Saved Line-ups Counter',
    description: 'A line-up becomes a "Saved Line-up" as soon as songs are added and saved.',
    bullets: [
      'Saved line-ups store assigned worship leaders, team members, and performed keys.',
      'Saved line-ups update the Dashboard statistics immediately upon saving.'
    ],
    example: 'Access all saved line-ups at any time under the "Saved Lineups" tab.',
    icon: FileText
  },

  // SECTION 3 — Member Roster & Editor
  {
    id: 6,
    sectionNumber: 3,
    sectionTitle: 'SECTION 3 — Member Management',
    stepTitle: 'Member Editor Overview',
    targetTab: 'members',
    highlightLabel: 'Member Editor & Roster',
    description: 'Manage your entire worship ministry team, instrument capabilities, and roles.',
    bullets: [
      'Add, edit, or remove worship team members.',
      'Assign primary ministry tags and custom tags.',
      'Set Disciplinary Action (DA) status with schedule safeguards.'
    ],
    icon: Users
  },
  {
    id: 7,
    sectionNumber: 3,
    sectionTitle: 'SECTION 3 — Member Management',
    stepTitle: 'Adding a Worship Member',
    targetTab: 'members',
    highlightLabel: 'Add Member Form',
    description: 'Fill out the member creation form to add new team members to the roster.',
    bullets: [
      'Enter Member Name (e.g. Kyle, Jhen, Jalmer).',
      'Select one or more standard ministry tags.',
      'Add custom tags if necessary.',
      'At least one tag or custom tag is required to save a member.'
    ],
    example: 'Requirement: Every member must have at least one tag so they can be assigned to line-up roles.',
    icon: Users
  },
  {
    id: 8,
    sectionNumber: 3,
    sectionTitle: 'SECTION 3 — Member Management',
    stepTitle: 'Member Tags & Tag Hierarchy',
    targetTab: 'members',
    highlightLabel: 'Tag Hierarchy Selection',
    description: 'Tags represent ministry roles in order of hierarchy:',
    bullets: [
      'Hierarchy: Pastor > Worship Leader > Song Leader > Vocalist > Guitarist > Keyboardist > Bassist > Drummer > Audio/Live Technician > Lyricist.',
      'Members with multiple matching tags receive higher priority when sorting by Tag Hierarchy.',
      'Example: Kyle has [Song Leader, Vocalist], while Jhen has [Song Leader]. Kyle receives higher hierarchy rank because he possesses additional applicable tags.'
    ],
    example: 'Multi-tagged members provide versatile coverage for worship team line-ups.',
    icon: Tag
  },
  {
    id: 9,
    sectionNumber: 3,
    sectionTitle: 'SECTION 3 — Member Management',
    stepTitle: 'Member Search, Sorting & Filtering',
    targetTab: 'members',
    highlightLabel: 'Roster Search & Filter Controls',
    description: 'Quickly locate team members using real-time search and filters.',
    bullets: [
      'Search by member name in real time.',
      'Sort alphabetically (A-Z, Z-A) or by Tag Hierarchy.',
      'Filter by specific roles (e.g. show only Song Leaders or Keyboardists).'
    ],
    icon: Search
  },
  {
    id: 10,
    sectionNumber: 3,
    sectionTitle: 'SECTION 3 — Member Management',
    stepTitle: 'Member Selection Rules (One Role Per Person)',
    targetTab: 'members',
    highlightLabel: 'Single Assignment Rule',
    description: 'A team member cannot occupy multiple ministry roles in the exact same line-up.',
    bullets: [
      'If Kyle is assigned as Song Leader for a line-up:',
      'Kyle is automatically hidden from selectable dropdowns for Vocalist, Guitarist, Keyboardist, Bassist, Drummer, etc.',
      'This prevents scheduling conflicts and duplicate role assignments.'
    ],
    example: 'Example: Selecting Kyle as Song Leader hides Kyle from Backup Vocalists & Instrumentalists.',
    icon: AlertTriangle
  },
  {
    id: 11,
    sectionNumber: 3,
    sectionTitle: 'SECTION 3 — Member Management',
    stepTitle: 'Duplicate Members & Merge Dialog',
    targetTab: 'members',
    highlightLabel: 'Duplicate Detection',
    description: 'Adding a member with a name similar to an existing member triggers a duplicate warning.',
    bullets: [
      'Example: Existing member "Jalmer Esguerra" vs new entry "Jalmer Elijah Esguerra".',
      'The system offers a decision dialog: "Merge Members" or "Add as New Member".',
      'Merging combines tags and preserves all schedule assignment history.'
    ],
    icon: Users
  },
  {
    id: 12,
    sectionNumber: 3,
    sectionTitle: 'SECTION 3 — Member Management',
    stepTitle: 'DA Status & Historical Preservation',
    targetTab: 'members',
    highlightLabel: 'Disciplinary Action Safeguards',
    description: 'Members marked as DA (Disciplinary Action) display prominent warnings when scheduling.',
    bullets: [
      'DA members cannot be assigned to new line-ups without explicit confirmation.',
      'Historical Rule: Setting a member to DA does NOT delete or erase them from saved historical line-ups.',
      'Past service records remain untouched as authentic historical records.'
    ],
    example: 'Historical accuracy is always preserved regardless of roster status updates.',
    icon: ShieldAlert
  },

  // SECTION 4 — Song Database
  {
    id: 13,
    sectionNumber: 4,
    sectionTitle: 'SECTION 4 — Song Database',
    stepTitle: 'Song Database Overview',
    targetTab: 'songs',
    highlightLabel: 'Song Database & Library',
    description: 'The Song Database is your church\'s central library of worship songs.',
    bullets: [
      'Songs must exist in the Song Database before they can be recommended or selected.',
      'Track Original Keys, BPM, Time Signatures, Themes, and Platform Links.',
      'Filter songs by Praise or Worship categories.'
    ],
    icon: Music
  },
  {
    id: 14,
    sectionNumber: 4,
    sectionTitle: 'SECTION 4 — Song Database',
    stepTitle: 'Adding a Song Manually',
    targetTab: 'songs',
    highlightLabel: 'Add Song Form',
    description: 'Add songs manually by filling out key signature and category information.',
    bullets: [
      'Enter Song Title and Artist.',
      'Set Original Key (e.g. G, C, E, Ab) and BPM.',
      'Choose Category: Praise or Worship.',
      'The application database is never randomly autofilled with unverified songs.'
    ],
    icon: Music
  },
  {
    id: 15,
    sectionNumber: 4,
    sectionTitle: 'SECTION 4 — Song Database',
    stepTitle: 'Song Metadata & Link Integrations',
    targetTab: 'songs',
    highlightLabel: 'Song Metadata Cards',
    description: 'Store streaming links for YouTube, YouTube Music, Spotify, Apple Music, Qobuz, and TIDAL.',
    bullets: [
      'Pasticing streaming URLs allows team members to listen to reference tracks directly.',
      'Note: Original Key, BPM, and Time Signatures are manually set by worship leaders to match your church\'s arrangement.'
    ],
    icon: Share2
  },
  {
    id: 16,
    sectionNumber: 4,
    sectionTitle: 'SECTION 4 — Song Database',
    stepTitle: 'Praise & Worship Categories',
    targetTab: 'songs',
    highlightLabel: 'Category Badges (Praise / Worship)',
    description: 'Every song in the database is categorized as either Praise (upbeat) or Worship (slow/reverent).',
    bullets: [
      'Praise: Fast tempo, celebratory worship songs.',
      'Worship: Slow/medium tempo, reflective and intimate worship songs.',
      'Categories drive automatic line-up sequence ordering.'
    ],
    icon: Tag
  },
  {
    id: 17,
    sectionNumber: 4,
    sectionTitle: 'SECTION 4 — Song Database',
    stepTitle: 'Bulk Selection & Batch Operations',
    targetTab: 'songs',
    highlightLabel: 'Bulk Selection Controls',
    description: 'Select multiple songs using checkboxes to perform batch updates.',
    bullets: [
      'Select single or multiple songs.',
      'Use "Set Selected to Praise" or "Set Selected to Worship" for instant batch updates.',
      'Batch category changes display a confirmation prompt prior to applying changes.'
    ],
    icon: CheckSquare
  },
  {
    id: 18,
    sectionNumber: 4,
    sectionTitle: 'SECTION 4 — Song Database',
    stepTitle: 'Song Usage Tracking (Used This Month)',
    targetTab: 'songs',
    highlightLabel: 'Usage Frequency Counters',
    description: 'Track how often each song is scheduled within the current month.',
    bullets: [
      'The "Used This Month" counter reads saved historical line-ups automatically.',
      'Helps worship leaders avoid overplaying specific songs in close succession.'
    ],
    icon: Repeat
  },
  {
    id: 19,
    sectionNumber: 4,
    sectionTitle: 'SECTION 4 — Song Database',
    stepTitle: 'Repeated Song Detection & First-Come Rule',
    targetTab: 'songs',
    highlightLabel: 'Repeated Song Warnings',
    description: 'The system enforces a first-come, first-serve rule for repeated song warnings:',
    bullets: [
      'Example: "Salamat Salamat" scheduled on Aug 5, Aug 9, and Aug 12 within the same month.',
      'Aug 5 is the Original Usage and receives NO warning.',
      'Aug 9 and Aug 12 trigger a "Repeated Song in Month" warning badge.',
      'The first usage is always recognized as the original performance.'
    ],
    example: 'First-come rule ensures the earliest service is never falsely marked as a repeat.',
    icon: AlertTriangle
  },

  // SECTION 5 — Song Recommendations
  {
    id: 20,
    sectionNumber: 5,
    sectionTitle: 'SECTION 5 — Song Recommendations',
    stepTitle: 'Intelligent Song Recommendations',
    targetTab: 'scheduler',
    highlightLabel: 'Recommendation Engine',
    description: 'The recommendation engine suggests songs directly from your Song Database.',
    bullets: [
      'Recommendation Priority:',
      '1. Newly added songs that have never been played.',
      '2. Songs played only once.',
      '3. Least played songs over the last 90 days.',
      '4. Songs not played for the longest period.',
      '5. Seasonal / Christmas themes (e.g. prioritized during December).'
    ],
    example: 'During December, Christmas-themed songs automatically receive higher priority.',
    icon: Sparkles
  },

  // SECTION 6 — Create a Line-up
  {
    id: 21,
    sectionNumber: 6,
    sectionTitle: 'SECTION 6 — Create a Line-up',
    stepTitle: 'Create Line-up Flow',
    targetTab: 'scheduler',
    highlightLabel: 'New Line-up Launcher',
    description: 'Clicking "New Lineup" opens the line-up creation workspace.',
    bullets: [
      'The system automatically checks for existing empty line-up placeholders.',
      'If an empty line-up exists for that target date, it opens that placeholder instead of creating a duplicate schedule.'
    ],
    icon: Plus
  },
  {
    id: 22,
    sectionNumber: 6,
    sectionTitle: 'SECTION 6 — Create a Line-up',
    stepTitle: 'Service Types & Asia/Manila Timezone',
    targetTab: 'scheduler',
    highlightLabel: 'Service Type Selector',
    description: 'Select your target service type for the line-up:',
    bullets: [
      'Sunday Worship Service',
      'Midweek Prayer Service',
      'Youth Fellowship / Special Worship Events',
      'All scheduling logic strictly calculates dates in Asia/Manila (UTC+8) time.'
    ],
    icon: Calendar
  },
  {
    id: 23,
    sectionNumber: 6,
    sectionTitle: 'SECTION 6 — Create a Line-up',
    stepTitle: 'Next Available Date Auto-Selection',
    targetTab: 'scheduler',
    highlightLabel: 'Date Auto-Picker',
    description: 'The scheduler automatically computes the next logical service date.',
    bullets: [
      'Selecting Sunday Worship automatically targets the upcoming Sunday.',
      'Selecting Midweek Prayer Service targets the upcoming Wednesday.',
      'Existing saved service dates are automatically skipped to avoid date collisions.'
    ],
    icon: Calendar
  },
  {
    id: 24,
    sectionNumber: 6,
    sectionTitle: 'SECTION 6 — Create a Line-up',
    stepTitle: 'Adding Songs to Line-up',
    targetTab: 'scheduler',
    highlightLabel: 'Song Selector in Scheduler',
    description: 'Search and pick songs from your Song Database.',
    bullets: [
      'Search songs by title or artist.',
      'Assign Praise or Worship sequence tags.',
      'Set Performed Keys (e.g. transpose from original Key C to Performed Key D to suit the lead vocalist).'
    ],
    icon: Music
  },

  // SECTION 7 — Song & Playlist Importer
  {
    id: 25,
    sectionNumber: 7,
    sectionTitle: 'SECTION 7 — Song & Playlist Import',
    stepTitle: 'Smart YouTube & YouTube Music Import',
    targetTab: 'scheduler',
    highlightLabel: 'Import Song / Playlist Button',
    description: 'Import single songs or full worship playlists from YouTube or YouTube Music with automatic URL detection.',
    bullets: [
      'Paste any public YouTube or YouTube Music song or playlist link into the single unified import button.',
      'The importer automatically detects whether the link is a single song or a playlist.',
      'Parses song titles, artist names, keys, and video metadata, adding new songs to your database.'
    ],
    icon: Download
  },
  {
    id: 26,
    sectionNumber: 7,
    sectionTitle: 'SECTION 7 — Playlist Import',
    stepTitle: 'Automatic Praise & Worship Assignment',
    targetTab: 'scheduler',
    highlightLabel: 'Playlist Order Rules',
    description: 'Imported songs are assigned Praise or Worship based on final position:',
    bullets: [
      '1st Song → Praise',
      '2nd Song → Praise',
      '3rd Song → Worship',
      '4th Song → Worship',
      'Default sequencing establishes a balanced 2-Praise / 2-Worship flow.'
    ],
    icon: Layers
  },
  {
    id: 27,
    sectionNumber: 7,
    sectionTitle: 'SECTION 7 — Playlist Import',
    stepTitle: 'Touch & Drag Reordering & Recalculation',
    targetTab: 'scheduler',
    highlightLabel: 'Drag & Move Controls',
    description: 'Reorder songs via desktop drag-and-drop or touch-friendly Move Up/Down buttons.',
    bullets: [
      'Example: Original playlist [Song A, Song B, Song C, Song D].',
      'Moving Song D to position 1 automatically recalculates sequence assignments:',
      'Position 1: Song D (Praise)',
      'Position 2: Song A (Praise)',
      'Position 3: Song B (Worship)',
      'Position 4: Song C (Worship)'
    ],
    example: 'Praise/Worship category tags dynamically recalculate based on final order.',
    icon: Sliders
  },

  // SECTION 8 — Ministry Assignments
  {
    id: 28,
    sectionNumber: 8,
    sectionTitle: 'SECTION 8 — Ministry Assignments',
    stepTitle: 'Worship Team Ministry Assignments',
    targetTab: 'scheduler',
    highlightLabel: 'Worship Team Assignment Panel',
    description: 'Assign worship team members to individual roles for the service:',
    bullets: [
      'Song Leader',
      'Backup Vocalists (multiple members allowed)',
      'Guitarists (multiple members allowed)',
      'Keyboardist / Pianist',
      'Bassist',
      'Drummer',
      'Lyricist / Media Operator'
    ],
    example: 'Multi-member selection is supported for Vocalists and Guitarists.',
    icon: Users
  },
  {
    id: 29,
    sectionNumber: 8,
    sectionTitle: 'SECTION 8 — Ministry Assignments',
    stepTitle: 'Single-Assignment Role Restrictions',
    targetTab: 'scheduler',
    highlightLabel: 'Role Exclusion Logic',
    description: 'Enforces the rule that one person cannot be assigned to multiple roles in the same service.',
    bullets: [
      'If Kyle is selected as Song Leader:',
      'Kyle is automatically excluded from Vocalist, Guitarist, Keyboardist, Bassist, etc.',
      'Ensures accurate team role distribution on printed service sheets.'
    ],
    icon: AlertTriangle
  },

  // SECTION 9 — Editing Line-ups
  {
    id: 30,
    sectionNumber: 9,
    sectionTitle: 'SECTION 9 — Editing Line-ups',
    stepTitle: 'Editing Saved Line-ups',
    targetTab: 'scheduler',
    highlightLabel: 'Edit Saved Line-up',
    description: 'Edit saved line-ups at any time to adjust song choices or team members.',
    bullets: [
      'Editing Safeguard: A saved line-up being edited does NOT trigger a false "repeated song" warning against itself.',
      'Saving updates the line-up in place while preserving historical integrity.'
    ],
    icon: FileText
  },
  {
    id: 31,
    sectionNumber: 9,
    sectionTitle: 'SECTION 9 — Editing Line-ups',
    stepTitle: 'Replace vs Merge Songs on Import',
    targetTab: 'scheduler',
    highlightLabel: 'Replace / Merge Dialog',
    description: 'Importing a playlist into an existing line-up presents three options:',
    bullets: [
      'Replace Songs: Overwrites all existing songs with the imported playlist.',
      'Merge Songs: Appends imported songs without creating duplicate entries.',
      'Cancel: Keeps the current line-up unchanged.'
    ],
    icon: Layers
  },

  // SECTION 10 — Saved Line-ups
  {
    id: 32,
    sectionNumber: 10,
    sectionTitle: 'SECTION 10 — Saved Line-ups',
    stepTitle: 'Saved Line-ups View',
    targetTab: 'schedules',
    highlightLabel: 'Saved Line-ups Page',
    description: 'Browse all completed and upcoming church line-ups.',
    bullets: [
      'View song list previews, service dates, and assigned team members.',
      'Distinguish between Saved Line-ups (with songs) and Empty Line-ups (placeholders).'
    ],
    icon: Calendar
  },
  {
    id: 33,
    sectionNumber: 10,
    sectionTitle: 'SECTION 10 — Saved Line-ups',
    stepTitle: 'Sorting & Date Filtering',
    targetTab: 'schedules',
    highlightLabel: 'Filter & Search Bar',
    description: 'Filter saved line-ups with precision:',
    bullets: [
      'Sort by Newest Date First or Oldest Date First.',
      'Filter by Sunday Services, Midweek Services, or Month.',
      'Search line-ups by song title, worship leader name, or service date.'
    ],
    icon: ListFilter
  },

  // SECTION 11 — Historical Data Safety
  {
    id: 34,
    sectionNumber: 11,
    sectionTitle: 'SECTION 11 — Historical Data Safety',
    stepTitle: 'Historical Line-up Preservation',
    targetTab: 'schedules',
    highlightLabel: 'Data Safety Guarantee',
    description: 'Saved line-ups are permanent historical records of church worship services.',
    bullets: [
      'If a song is deleted from the Song Database, historical saved line-ups retain that song in past records.',
      'If a team member is deleted or placed on DA status later, past saved line-ups maintain the original member assignment.',
      'Past service records are never altered retroactively.'
    ],
    icon: Shield
  },

  // SECTION 12 — Exporting Service Sheets
  {
    id: 35,
    sectionNumber: 12,
    sectionTitle: 'SECTION 12 — Exporting Service Sheets',
    stepTitle: 'Export PDF Service Sheets',
    targetTab: 'schedules',
    highlightLabel: 'PDF Export Button',
    description: 'Generate clean, printable PDF service sheets for Sunday and Midweek services.',
    bullets: [
      'Minimal, high-contrast formatting designed for church printing.',
      'Automatic page cropping eliminates unnecessary white space.',
      'Assigned worship team members are formatted clearly one per line.',
      'Filename auto-formatted e.g. Sunday_Service_Line-up_(MM/DD/YYYY).'
    ],
    icon: Download
  },
  {
    id: 36,
    sectionNumber: 12,
    sectionTitle: 'SECTION 12 — Exporting Service Sheets',
    stepTitle: 'Export PNG Image Cards',
    targetTab: 'schedules',
    highlightLabel: 'PNG Export Button',
    description: 'Export high-resolution PNG image cards for messaging apps and social media.',
    bullets: [
      'Optimized layout for mobile screen viewing and group chat sharing.',
      'Compact design with zero clipped text.'
    ],
    icon: Download
  },

  // SECTION 13 — Settings & Customization
  {
    id: 37,
    sectionNumber: 13,
    sectionTitle: 'SECTION 13 — Settings & Theme',
    stepTitle: 'Light Theme & AMOLED Dark Mode',
    targetTab: 'dashboard',
    highlightLabel: 'Theme Switcher',
    description: 'Switch between clean Light Theme and pure AMOLED Dark Mode.',
    bullets: [
      'AMOLED Dark Mode uses true black (#000000) for OLED screen power savings and eye comfort.',
      'Primary church accent color #1b75bc provides crisp contrast in both themes.'
    ],
    icon: Sun
  },
  {
    id: 38,
    sectionNumber: 13,
    sectionTitle: 'SECTION 13 — Settings & Theme',
    stepTitle: 'User Preferences & Guide Restart',
    targetTab: 'dashboard',
    highlightLabel: 'Preferences Modal',
    description: 'Access preferences at any time from the top header or sidebar.',
    bullets: [
      'Toggle automatic display of the Getting Started Guide.',
      'Click "Restart Getting Started Guide" to re-launch the interactive tour at any time.',
      'Access Backup & Restore tool directly from Settings.'
    ],
    icon: Settings
  },

  // SECTION 14 — Data Protection & Safety
  {
    id: 39,
    sectionNumber: 14,
    sectionTitle: 'SECTION 14 — Data Protection & Safety',
    stepTitle: 'Persistent Local Storage & Safety',
    targetTab: 'dashboard',
    highlightLabel: 'Data Protection Shield',
    description: 'Your church data is safely stored in persistent local storage.',
    bullets: [
      'Members, songs, and saved line-ups persist across browser refreshes and restarts.',
      'The application will never delete your data or reset your database automatically.',
      'Use the Backup & Restore tool to create JSON backups of your church database.'
    ],
    example: 'Dedicated worship scheduling application for Word for the World Christian Fellowship – Santa Cruz.',
    icon: Database
  }
];

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab?: (tab: 'dashboard' | 'scheduler' | 'schedules' | 'members' | 'songs') => void;
  initialStep?: number;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
  initialStep = 1
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(initialStep - 1);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isJumpMenuOpen, setIsJumpMenuOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const idx = Math.max(0, Math.min(initialStep - 1, GUIDE_STEPS.length - 1));
      setCurrentStepIndex(idx);
      if (onNavigateTab && GUIDE_STEPS[idx]) {
        onNavigateTab(GUIDE_STEPS[idx].targetTab);
      }
    }
  }, [isOpen, initialStep]);

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'onboarding-modal',
    isOpen,
    layer: OverlayLayer.GUIDE,
    onClose,
    closeOnEscape: true
  });

  const currentStep = GUIDE_STEPS[currentStepIndex] || GUIDE_STEPS[0];
  const StepIcon = currentStep.icon;
  const totalSteps = GUIDE_STEPS.length;

  const handleSkip = () => {
    StorageService.setOnboardingSkippedSession(true);
    if (dontShowAgain) {
      StorageService.setOnboardingDisabled(true);
    }
    onClose();
  };

  const goToStep = (idx: number) => {
    if (idx >= 0 && idx < totalSteps) {
      setCurrentStepIndex(idx);
      setIsJumpMenuOpen(false);
      if (onNavigateTab && GUIDE_STEPS[idx]) {
        onNavigateTab(GUIDE_STEPS[idx].targetTab);
      }
    }
  };

  const handleNext = () => {
    if (currentStepIndex < totalSteps - 1) {
      const nextIdx = currentStepIndex + 1;
      setCurrentStepIndex(nextIdx);
      if (onNavigateTab && GUIDE_STEPS[nextIdx]) {
        onNavigateTab(GUIDE_STEPS[nextIdx].targetTab);
      }
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1;
      setCurrentStepIndex(prevIdx);
      if (onNavigateTab && GUIDE_STEPS[prevIdx]) {
        onNavigateTab(GUIDE_STEPS[prevIdx].targetTab);
      }
    }
  };

  const handleFinish = () => {
    StorageService.setOnboardingSkippedSession(true);
    if (dontShowAgain) {
      StorageService.setOnboardingDisabled(true);
    } else {
      StorageService.setOnboardingDisabled(false);
    }
    onClose();
  };

  // Unique sections list for jump dropdown
  const sections = Array.from(new Set(GUIDE_STEPS.map((s) => s.sectionTitle)));

  if (!isOpen) return null;

  const modalContent = (
    <div
      style={{ zIndex }}
      data-overlay-id="onboarding-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200 transition-opacity ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh] transform animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                <span>WWCF Interactive Guide</span>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                  Step {currentStep.id} of {totalSteps}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium truncate max-w-[200px] sm:max-w-xs">
                {currentStep.sectionTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Jump Menu Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsJumpMenuOpen(!isJumpMenuOpen)}
                className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="Jump to specific section"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span className="hidden sm:inline">Jump Topic</span>
              </button>

              {/* Jump Menu Dropdown */}
              {isJumpMenuOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 p-2 max-h-80 overflow-y-auto space-y-2 animate-in fade-in duration-150">
                  <div className="px-2 py-1 text-[11px] font-bold uppercase text-slate-400 dark:text-slate-500">
                    Jump to Section
                  </div>
                  {sections.map((sec) => {
                    const firstStep = GUIDE_STEPS.find((s) => s.sectionTitle === sec);
                    if (!firstStep) return null;
                    const isCurrentSec = currentStep.sectionTitle === sec;
                    return (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => goToStep(firstStep.id - 1)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-between ${
                          isCurrentSec
                            ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 font-bold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate pr-2">{sec.replace('SECTION ', 'Sec ')}</span>
                        <span className="text-[10px] opacity-70 shrink-0">Step {firstStep.id}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleSkip}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close guide"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5">
          <div
            className="bg-indigo-600 dark:bg-indigo-500 h-1.5 transition-all duration-300"
            style={{ width: `${((currentStepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* Active Highlight Banner */}
          <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/60 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
              <span>Contextual Target:</span>
              <strong className="text-indigo-900 dark:text-indigo-200 font-bold">
                {currentStep.highlightLabel || currentStep.targetTab.toUpperCase()}
              </strong>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/80 font-bold uppercase tracking-wider">
              {currentStep.targetTab}
            </span>
          </div>

          {/* Title & Icon Header */}
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
              <StepIcon className="w-6 h-6 text-white" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-snug">
                {currentStep.stepTitle}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                {currentStep.description}
              </p>
            </div>
          </div>

          {/* Key Bullet Points */}
          <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Key Concepts & Features
            </h4>
            <div className="space-y-2">
              {currentStep.bullets.map((bullet, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-normal">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                  <span>{bullet}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Example / Rule Highlight Box (if any) */}
          {currentStep.example && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-700 dark:text-slate-300 font-medium space-y-1">
              <div className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Guidelines & Example:</span>
              </div>
              <p className="leading-relaxed text-slate-600 dark:text-slate-300">
                {currentStep.example}
              </p>
            </div>
          )}

          {/* Step 39 / Final step option: Don't show again */}
          {currentStepIndex === totalSteps - 1 && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 dark:border-slate-700 focus:ring-indigo-500 cursor-pointer"
                />
                <span>Don't show this guide automatically on future visits</span>
              </label>
            </div>
          )}
        </div>

        {/* Footer Navigation Controls */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
          <div>
            {currentStepIndex > 0 ? (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSkip}
                className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer px-2 py-1"
              >
                Skip Guide
              </button>
            )}
          </div>

          {/* Quick Jump indicator */}
          <div className="hidden sm:flex items-center gap-1">
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
              {currentStepIndex + 1} / {totalSteps}
            </span>
          </div>

          <div>
            {currentStepIndex < totalSteps - 1 ? (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                className="inline-flex items-center gap-1.5 px-6 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <span>Get Started</span>
                <Sparkles className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
