import React from 'react';
import { ActiveTab, NavigationOrientation, SidebarPosition, SidebarVisibility } from '../types';
import { MAIN_NAVIGATION_ITEMS } from './Sidebar';
import {
  Menu,
  Plus,
  Check,
  HelpCircle,
  Settings,
  PanelLeftOpen,
  PanelRightOpen,
  Undo2,
  Redo2
} from 'lucide-react';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenMobileMenu: () => void;
  isDraftSaved: boolean;
  onNewSchedule: () => void;
  onOpenHelp?: () => void;
  onOpenSettings?: () => void;
  navigationOrientation?: NavigationOrientation;
  sidebarPosition?: SidebarPosition;
  sidebarVisibility?: SidebarVisibility;
  onToggleSidebarVisibility?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  undoTitle?: string;
  redoTitle?: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenMobileMenu,
  isDraftSaved,
  onNewSchedule,
  onOpenHelp,
  onOpenSettings,
  navigationOrientation = 'vertical',
  sidebarPosition = 'left',
  sidebarVisibility = 'expanded',
  onToggleSidebarVisibility,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  undoTitle,
  redoTitle
}) => {
  const isHorizontal = navigationOrientation === 'horizontal';
  const isSidebarHidden = sidebarVisibility === 'hidden';
  const isRightSidebar = sidebarPosition === 'right';

  const titles: Record<ActiveTab, { title: string; subtitle: string; section: string }> = {
    dashboard: {
      section: 'Overview',
      title: 'WWCF Worship Song Line-up Scheduler',
      subtitle: 'Current service readiness, lineups, and team activity'
    },
    scheduler: {
      section: 'Scheduler',
      title: 'Song Line-up Scheduler',
      subtitle: 'Build setlists, balance Praise & Worship, and assign team roles'
    },
    schedules: {
      section: 'Archive',
      title: 'Saved Worship Lineups',
      subtitle: 'Browse, review, edit, and export historical service records'
    },
    songs: {
      section: 'Library',
      title: 'Song Database & Catalog',
      subtitle: 'Manage lyrics, musical keys, tags, and song family groupings'
    },
    members: {
      section: 'Team',
      title: 'Member Editor & Roster',
      subtitle: 'Manage vocalists, musicians, technician assignments, and eligibility'
    },
    analytics: {
      section: 'Reports',
      title: 'Report Builder',
      subtitle: 'Compile worship lineups and song insights.'
    }
  };

  const current = titles[activeTab] || titles.dashboard;

  return (
    <header className="sticky top-0 z-30 wwcf-glass-header border-b border-slate-200/80 dark:border-white/10 px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 transition-colors">
      <div className="flex items-center justify-between gap-3 max-w-7xl mx-auto">
        {/* Left Section: Titles, Breadcrumb, or Horizontal Navigation (No logo) */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile hamburger menu (always accessible on mobile viewports) */}
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] rounded-xl cursor-pointer transition-colors shrink-0 lg:hidden border border-transparent hover:border-slate-200/70 dark:hover:border-white/10"
            aria-label="Open navigation menu"
            title="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Desktop navigation restore button when vertical sidebar is hidden */}
          {!isHorizontal && isSidebarHidden && onToggleSidebarVisibility && (
            <button
              type="button"
              onClick={onToggleSidebarVisibility}
              title={isRightSidebar ? 'Show navigation (right)' : 'Show navigation (left)'}
              aria-label={isRightSidebar ? 'Show navigation (right)' : 'Show navigation (left)'}
              className="hidden lg:inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-white/[0.05] dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200/80 dark:border-white/10 transition-colors cursor-pointer shrink-0 mr-1"
            >
              {isRightSidebar ? (
                <PanelRightOpen className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
              ) : (
                <PanelLeftOpen className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
              )}
              <span>Show Navigation</span>
            </button>
          )}

          {/* Horizontal Navigation Tabs (Desktop & Tablet) */}
          {isHorizontal ? (
            <nav aria-label="Primary Navigation" className="hidden lg:flex items-center gap-1 py-0.5">
              {MAIN_NAVIGATION_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-tour={`nav-${item.id}`}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setActiveTab(item.id)}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all cursor-pointer shrink-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc] ${
                      isActive
                        ? 'bg-[#f0f7fc] dark:bg-[#1b75bc]/20 text-[#1b75bc] dark:text-[#54b0e2] ring-1 ring-[#1b75bc]/25 dark:ring-[#54b0e2]/30'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-white/[0.05]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          ) : (
            /* Vertical Navigation: Section Path, Page Title & Subtitle */
            <div className="min-w-0 py-0.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 tracking-wide mb-0.5">
                <span>WWCF</span>
                <span aria-hidden="true">/</span>
                <span className="text-[#1b75bc] dark:text-[#54b0e2]">{current.section}</span>
              </div>
              <h2 className="text-sm sm:text-base md:text-lg font-bold text-slate-900 dark:text-white tracking-tight leading-snug truncate">
                {current.title}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-normal hidden md:block truncate mt-0.5">
                {current.subtitle}
              </p>
            </div>
          )}
        </div>

        {/* Right Section: Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Draft Saved Indicator in Scheduler - Conditionally mounted to prevent layout gap */}
          {activeTab === 'scheduler' && isDraftSaved && (
            <div
              role="status"
              aria-live="polite"
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800/70 rounded-xl animate-in fade-in duration-200"
            >
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Draft Saved</span>
            </div>
          )}

          {/* In Horizontal Navigation mode, render quick Help & Settings buttons in header */}
          {isHorizontal && (
            <>
              {onOpenHelp && (
                <button
                  type="button"
                  data-tour="header-help-btn"
                  onClick={onOpenHelp}
                  title="Help & User Guide (F1)"
                  aria-label="Help & User Guide"
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] hover:bg-slate-100/80 dark:hover:bg-white/[0.06] border border-slate-200/70 dark:border-white/10 transition-colors cursor-pointer"
                >
                  <HelpCircle className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
                  <span className="hidden md:inline">Help</span>
                </button>
              )}

              {onOpenSettings && (
                <button
                  type="button"
                  data-tour="header-settings-btn"
                  onClick={onOpenSettings}
                  title="Settings"
                  aria-label="Settings"
                  className="p-2 text-slate-600 dark:text-slate-300 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] hover:bg-slate-100/80 dark:hover:bg-white/[0.06] rounded-xl border border-slate-200/70 dark:border-white/10 transition-colors cursor-pointer"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
            </>
          )}

          {/* App-Wide Undo and Redo Controls */}
          {onUndo && onRedo && (
            <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-slate-100/90 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                data-tour="header-undo-btn"
                data-tts-label={undoTitle || (canUndo ? 'Undo last change' : 'Nothing to undo')}
                title={undoTitle || (canUndo ? 'Undo last change (Ctrl+Z)' : 'Nothing to undo')}
                aria-label={undoTitle || (canUndo ? 'Undo last change (Ctrl+Z)' : 'Nothing to undo')}
                className={`p-1.5 sm:p-2 rounded-lg text-xs font-semibold transition-all ${
                  canUndo
                    ? 'text-slate-700 dark:text-slate-100 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] hover:bg-white dark:hover:bg-white/10 active:scale-95 cursor-pointer shadow-xs'
                    : 'text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-55'
                }`}
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                data-tour="header-redo-btn"
                data-tts-label={redoTitle || (canRedo ? 'Redo change' : 'Nothing to redo')}
                title={redoTitle || (canRedo ? 'Redo change (Ctrl+Y / Ctrl+Shift+Z)' : 'Nothing to redo')}
                aria-label={redoTitle || (canRedo ? 'Redo change (Ctrl+Y / Ctrl+Shift+Z)' : 'Nothing to redo')}
                className={`p-1.5 sm:p-2 rounded-lg text-xs font-semibold transition-all ${
                  canRedo
                    ? 'text-slate-700 dark:text-slate-100 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] hover:bg-white dark:hover:bg-white/10 active:scale-95 cursor-pointer shadow-xs'
                    : 'text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-55'
                }`}
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* New Lineup primary CTA */}
          <button
            type="button"
            onClick={onNewSchedule}
            data-tour="header-new-lineup-btn"
            className="btn-tactile flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 min-h-[38px] sm:min-h-[40px] text-xs sm:text-sm font-semibold text-white bg-[#1b75bc] hover:bg-[#165d97] active:bg-[#144d7c] rounded-xl shadow-xs shadow-[#1b75bc]/20 transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc] shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">New Lineup</span>
            <span className="inline sm:hidden">New</span>
          </button>
        </div>
      </div>
    </header>
  );
};
