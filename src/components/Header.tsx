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
      title: 'Worship Ministry Dashboard',
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
    }
  };

  const current = titles[activeTab] || titles.dashboard;

  return (
    <header className="sticky top-0 z-30 wwcf-glass-header border-b border-slate-200/80 dark:border-white/10 px-4 sm:px-6 lg:px-8 py-3 transition-colors">
      <div className="flex items-center justify-between gap-3 max-w-7xl mx-auto">
        {/* Left Section: Titles, Breadcrumb, or Horizontal Navigation (No logo) */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile hamburger menu (always accessible on mobile viewports) */}
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl cursor-pointer transition-colors shrink-0 lg:hidden"
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
              className="hidden lg:inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200/80 dark:border-white/10 transition-colors cursor-pointer shrink-0 mr-1"
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
            <nav className="hidden lg:flex items-center gap-1.5 py-0.5">
              {MAIN_NAVIGATION_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-tour={`nav-${item.id}`}
                    onClick={() => setActiveTab(item.id)}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shrink-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc] ${
                      isActive
                        ? 'bg-[#1b75bc] text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          ) : (
            /* Vertical Navigation: Section Path, Page Title & Subtitle */
            <div className="min-w-0 py-0.5">
              <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">
                <span>WWCF</span>
                <span>/</span>
                <span className="text-[#1b75bc] dark:text-[#54b0e2]">{current.section}</span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight leading-tight truncate">
                {current.title}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden md:block truncate mt-0.5">
                {current.subtitle}
              </p>
            </div>
          )}
        </div>

        {/* Right Section: Actions */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Draft Saved Indicator in Scheduler */}
          {activeTab === 'scheduler' && (
            <div
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-emerald-600 dark:text-emerald-400 transition-opacity duration-200 ${
                isDraftSaved ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
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
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] hover:bg-slate-100/80 dark:hover:bg-white/5 border border-slate-200/60 dark:border-white/5 transition-colors cursor-pointer"
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
                  className="p-2 text-slate-600 dark:text-slate-300 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] hover:bg-slate-100/80 dark:hover:bg-white/5 rounded-xl border border-slate-200/60 dark:border-white/5 transition-colors cursor-pointer"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
            </>
          )}

          {/* App-Wide Undo and Redo Controls */}
          {onUndo && onRedo && (
            <div className="flex items-center gap-0.5 sm:gap-1 p-0.5 rounded-xl bg-slate-100/70 dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
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
                    ? 'text-slate-700 dark:text-slate-200 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] hover:bg-white dark:hover:bg-white/10 active:scale-95 cursor-pointer shadow-2xs'
                    : 'text-slate-300 dark:text-white/20 cursor-not-allowed opacity-40'
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
                    ? 'text-slate-700 dark:text-slate-200 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] hover:bg-white dark:hover:bg-white/10 active:scale-95 cursor-pointer shadow-2xs'
                    : 'text-slate-300 dark:text-white/20 cursor-not-allowed opacity-40'
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
            className="btn-tactile flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold text-white bg-[#1b75bc] hover:bg-[#165d97] active:bg-[#164f7c] rounded-xl shadow-xs shadow-[#1b75bc]/25 transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc]"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>New Lineup</span>
          </button>
        </div>
      </div>
    </header>
  );
};
