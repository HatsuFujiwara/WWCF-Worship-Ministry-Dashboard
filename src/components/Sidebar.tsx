import React from 'react';
import { ActiveTab, SidebarPosition, SidebarVisibility, NavigationOrientation } from '../types';
import {
  LayoutDashboard,
  Sliders,
  CalendarDays,
  Users,
  Music,
  X,
  Settings,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Database,
  QrCode,
  BarChart3,
  Sun,
  Moon
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';

export interface NavigationItem {
  id: ActiveTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const SIDEBAR_LAYOUT_TOKENS = {
  mobileWidthClass: 'w-[min(272px,88vw)]',
  expandedDesktopWidthClass: 'lg:w-[240px]',
  collapsedDesktopWidthClass: 'lg:w-[96px]',
  mainContentOffsetClasses: {
    expanded: {
      left: 'lg:pl-[240px]',
      right: 'lg:pr-[240px]'
    },
    collapsed: {
      left: 'lg:pl-[96px]',
      right: 'lg:pr-[96px]'
    },
    hidden: ''
  }
} as const;

export function getMainContentOffsetClass(options: {
  navigationOrientation: NavigationOrientation;
  sidebarPosition: SidebarPosition;
  sidebarVisibility: SidebarVisibility;
}): string {
  if (options.navigationOrientation === 'horizontal' || options.sidebarVisibility === 'hidden') {
    return SIDEBAR_LAYOUT_TOKENS.mainContentOffsetClasses.hidden;
  }
  const mode = options.sidebarVisibility === 'collapsed' ? 'collapsed' : 'expanded';
  return SIDEBAR_LAYOUT_TOKENS.mainContentOffsetClasses[mode][options.sidebarPosition];
}

export const MAIN_NAVIGATION_ITEMS: NavigationItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'scheduler', label: 'Song Scheduler', icon: Sliders },
  { id: 'songs', label: 'Song Database', icon: Music },
  { id: 'schedules', label: 'Saved Lineups', icon: CalendarDays },
  { id: 'analytics', label: 'Report Builder', icon: BarChart3 },
  { id: 'members', label: 'Member Editor', icon: Users },
];

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onOpenBackupRestore: () => void;
  onOpenTransferData?: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  sidebarPosition?: SidebarPosition;
  sidebarVisibility?: SidebarVisibility;
  navigationOrientation?: NavigationOrientation;
  onToggleVisibility?: () => void;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isDarkMode,
  setIsDarkMode,
  isOpen,
  setIsOpen,
  onOpenBackupRestore,
  onOpenTransferData,
  onOpenSettings,
  onOpenHelp,
  sidebarPosition = 'left',
  sidebarVisibility = 'expanded',
  navigationOrientation = 'vertical',
  onToggleCollapse
}) => {
  const isHorizontal = navigationOrientation === 'horizontal';
  const isRight = sidebarPosition === 'right';
  const isHiddenOnDesktop = isHorizontal || sidebarVisibility === 'hidden';
  const isCollapsedOnDesktop = !isHorizontal && sidebarVisibility === 'collapsed';

  // Responsive mobile drawer: min(272px, 88vw); Desktop: 96px icon rail when collapsed (fits 76x76 logo), 240px when expanded
  const widthClass = isCollapsedOnDesktop
    ? `${SIDEBAR_LAYOUT_TOKENS.mobileWidthClass} ${SIDEBAR_LAYOUT_TOKENS.collapsedDesktopWidthClass}`
    : `${SIDEBAR_LAYOUT_TOKENS.mobileWidthClass} ${SIDEBAR_LAYOUT_TOKENS.expandedDesktopWidthClass}`;

  // Desktop transform:
  // If hidden on desktop, push off-screen. If collapsed or expanded, position flush (translate-x-0).
  const desktopTranslateClass = isHorizontal
    ? 'lg:hidden'
    : isHiddenOnDesktop
    ? isRight
      ? 'lg:translate-x-full'
      : 'lg:-translate-x-full'
    : 'lg:translate-x-0';

  // Mobile transform:
  // Visible off-canvas sheet when isOpen is true, otherwise translated off-screen.
  const mobileTranslateClass = isOpen
    ? 'translate-x-0'
    : isRight
    ? 'translate-x-full'
    : '-translate-x-full';

  const positionClass = isRight
    ? 'right-0 left-auto border-l border-slate-200/80 dark:border-white/10'
    : 'left-0 border-r border-slate-200/80 dark:border-white/10';

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs lg:hidden"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Main Navigation"
        data-sidebar-shell="true"
        className={`fixed top-0 bottom-0 z-50 ${widthClass} overflow-x-hidden wwcf-glass-sidebar text-slate-700 dark:text-slate-300 flex flex-col transition-[width,transform] duration-200 ease-out motion-reduce:transition-none ${positionClass} ${mobileTranslateClass} ${desktopTranslateClass} select-none`}
      >
        {/* ========================================================================= */}
        {/* TOP BAR: Brand Anchor & Collapse/Close Control                           */}
        {/* ========================================================================= */}
        <div
          className={`min-h-[92px] border-b border-slate-200/80 dark:border-white/10 shrink-0 flex items-center justify-between px-3.5 py-2.5 gap-2 ${
            isCollapsedOnDesktop
              ? 'lg:flex-col lg:justify-center lg:px-2 lg:py-3 lg:gap-2'
              : ''
          }`}
        >
          {/* Brand logo for expanded desktop and mobile drawer */}
          <div
            className={`items-center shrink-0 ${
              isCollapsedOnDesktop ? 'flex lg:hidden' : 'flex'
            }`}
          >
            <BrandLogo
              collapsed={false}
              size="xl"
              onClick={() => {
                setActiveTab('dashboard');
                if (window.innerWidth < 1024) setIsOpen(false);
              }}
            />
          </div>

          {/* Collapsed desktop icon logo */}
          {isCollapsedOnDesktop && (
            <div className="hidden lg:flex items-center justify-center shrink-0">
              <BrandLogo
                collapsed={true}
                size="xl"
                onClick={() => {
                  setActiveTab('dashboard');
                }}
              />
            </div>
          )}

          <div className="flex items-center gap-1 shrink-0">
            {/* Desktop Collapse / Expand toggle button */}
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                title={
                  isCollapsedOnDesktop
                    ? isRight
                      ? 'Expand navigation (right)'
                      : 'Expand navigation (left)'
                    : isRight
                    ? 'Collapse to icon rail (right)'
                    : 'Collapse to icon rail (left)'
                }
                aria-label={
                  isCollapsedOnDesktop
                    ? isRight
                      ? 'Expand navigation (right)'
                      : 'Expand navigation (left)'
                    : isRight
                    ? 'Collapse to icon rail (right)'
                    : 'Collapse to icon rail (left)'
                }
                className="hidden lg:flex items-center justify-center w-8 h-8 text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 rounded-xl border border-transparent hover:border-slate-200/80 dark:hover:border-white/10 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc]"
              >
                {isCollapsedOnDesktop ? (
                  isRight ? (
                    <PanelRightOpen className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
                  ) : (
                    <PanelLeftOpen className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
                  )
                ) : isRight ? (
                  <PanelRightClose className="w-4 h-4" />
                ) : (
                  <PanelLeftClose className="w-4 h-4" />
                )}
              </button>
            )}

            {/* Mobile Drawer Close action */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="lg:hidden flex items-center justify-center w-9 h-9 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 rounded-xl border border-slate-200/70 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc]"
              aria-label="Close navigation"
              title="Close navigation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* MAIN NAVIGATION LIST (Single Authoritative Source of Elements)            */}
        {/* ========================================================================= */}
        <nav
          aria-label="Primary Navigation"
          data-tour="sidebar-nav"
          className={`flex-1 py-3.5 overflow-y-auto space-y-1 ${
            isCollapsedOnDesktop ? 'px-3 lg:px-2 lg:flex lg:flex-col lg:items-center' : 'px-3'
          }`}
        >
          <p
            className={`px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${
              isCollapsedOnDesktop ? 'block lg:hidden' : 'block'
            }`}
          >
            Workspace
          </p>

          {MAIN_NAVIGATION_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                data-tour={`nav-${item.id}`}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsOpen(false);
                }}
                title={item.label}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`relative group transition-all duration-150 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc] ${
                  isCollapsedOnDesktop
                    ? 'w-full lg:w-11 lg:h-11 px-3 lg:px-0 min-h-[42px] lg:min-h-0 rounded-xl flex items-center justify-start lg:justify-center'
                    : 'w-full px-3 min-h-[42px] py-2 rounded-xl flex items-center justify-start'
                } ${
                  isActive
                    ? isCollapsedOnDesktop
                      ? 'bg-[#f0f7fc] dark:bg-[#1b75bc]/20 text-[#1b75bc] dark:text-[#54b0e2] font-semibold lg:ring-1 lg:ring-[#1b75bc]/30 dark:lg:ring-[#54b0e2]/35'
                      : 'bg-[#f0f7fc] dark:bg-[#1b75bc]/15 text-[#165d97] dark:text-[#7ac2eb] font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-white/[0.05] font-medium'
                }`}
              >
                {/* Single restrained active bar on expanded / mobile drawer */}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[#1b75bc] dark:bg-[#54b0e2] ${
                      isCollapsedOnDesktop ? 'block lg:hidden' : 'block'
                    }`}
                  />
                )}

                <div
                  className={`flex items-center min-w-0 ${
                    isCollapsedOnDesktop ? 'gap-3 lg:gap-0' : 'gap-3'
                  }`}
                >
                  <Icon
                    className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                      isActive
                        ? 'text-[#1b75bc] dark:text-[#54b0e2]'
                        : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300'
                    }`}
                  />

                  {/* Label: hidden on desktop when collapsed into rail */}
                  <span
                    className={`truncate text-[13.5px] leading-tight ${
                      isCollapsedOnDesktop ? 'block lg:hidden' : 'block'
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* ========================================================================= */}
        {/* FOOTER UTILITY ACTIONS                                                   */}
        {/* ========================================================================= */}
        <div
          className={`border-t border-slate-200/80 dark:border-white/10 shrink-0 space-y-0.5 ${
            isCollapsedOnDesktop
              ? 'p-3 lg:p-2 lg:flex lg:flex-col lg:items-center lg:gap-1'
              : 'p-3'
          }`}
        >
          {/* Help & Guide */}
          <button
            type="button"
            data-tour="sidebar-help-btn"
            onClick={() => {
              onOpenHelp();
              setIsOpen(false);
            }}
            title="Help & User Guide (F1)"
            aria-label="Help & User Guide (F1)"
            className={`transition-colors cursor-pointer group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc] rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-white/[0.05] ${
              isCollapsedOnDesktop
                ? 'w-full lg:w-11 lg:h-11 px-3 lg:px-0 min-h-[38px] lg:min-h-0 flex items-center justify-between lg:justify-center'
                : 'w-full px-3 min-h-[38px] py-1.5 flex items-center justify-between text-[13px] font-medium'
            }`}
          >
            <div
              className={`flex items-center min-w-0 ${
                isCollapsedOnDesktop ? 'gap-2.5 lg:gap-0' : 'gap-2.5'
              }`}
            >
              <HelpCircle className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:text-[#1b75bc] dark:group-hover:text-[#54b0e2] transition-colors shrink-0" />
              <span
                className={`truncate ${
                  isCollapsedOnDesktop ? 'block lg:hidden' : 'block'
                }`}
              >
                Help & Guide
              </span>
            </div>
            <kbd
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/10 text-slate-500 dark:text-slate-400 ${
                isCollapsedOnDesktop ? 'inline-block lg:hidden' : 'inline-block'
              }`}
            >
              F1
            </kbd>
          </button>

          {/* Settings */}
          <button
            type="button"
            data-tour="sidebar-settings-btn"
            onClick={() => {
              onOpenSettings();
              setIsOpen(false);
            }}
            title="Settings"
            aria-label="Settings"
            className={`transition-colors cursor-pointer group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc] rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-white/[0.05] ${
              isCollapsedOnDesktop
                ? 'w-full lg:w-11 lg:h-11 px-3 lg:px-0 min-h-[38px] lg:min-h-0 flex items-center justify-between lg:justify-center'
                : 'w-full px-3 min-h-[38px] py-1.5 flex items-center justify-between text-[13px] font-medium'
            }`}
          >
            <div
              className={`flex items-center min-w-0 ${
                isCollapsedOnDesktop ? 'gap-2.5 lg:gap-0' : 'gap-2.5'
              }`}
            >
              <Settings className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:text-[#1b75bc] dark:group-hover:text-[#54b0e2] transition-colors shrink-0" />
              <span
                className={`truncate ${
                  isCollapsedOnDesktop ? 'block lg:hidden' : 'block'
                }`}
              >
                Settings
              </span>
            </div>
          </button>

          {/* Backup & Restore */}
          <button
            type="button"
            data-tour="sidebar-backup-btn"
            onClick={() => {
              onOpenBackupRestore();
              setIsOpen(false);
            }}
            title="Backup & Restore Data"
            aria-label="Backup & Restore Data"
            className={`transition-colors cursor-pointer group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc] rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-white/[0.05] ${
              isCollapsedOnDesktop
                ? 'w-full lg:w-11 lg:h-11 px-3 lg:px-0 min-h-[38px] lg:min-h-0 flex items-center justify-between lg:justify-center'
                : 'w-full px-3 min-h-[38px] py-1.5 flex items-center justify-between text-[13px] font-medium'
            }`}
          >
            <div
              className={`flex items-center min-w-0 ${
                isCollapsedOnDesktop ? 'gap-2.5 lg:gap-0' : 'gap-2.5'
              }`}
            >
              <Database className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:text-[#1b75bc] dark:group-hover:text-[#54b0e2] transition-colors shrink-0" />
              <span
                className={`truncate ${
                  isCollapsedOnDesktop ? 'block lg:hidden' : 'block'
                }`}
              >
                Backup & Restore
              </span>
            </div>
          </button>

          {/* Transfer Data */}
          {onOpenTransferData && (
            <button
              type="button"
              data-tour="sidebar-transfer-btn"
              onClick={() => {
                onOpenTransferData();
                setIsOpen(false);
              }}
              title="Transfer Data (PC/Phone)"
              aria-label="Transfer Data (PC/Phone)"
              className={`transition-colors cursor-pointer group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc] rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-white/[0.05] ${
                isCollapsedOnDesktop
                  ? 'w-full lg:w-11 lg:h-11 px-3 lg:px-0 min-h-[38px] lg:min-h-0 flex items-center justify-between lg:justify-center'
                  : 'w-full px-3 min-h-[38px] py-1.5 flex items-center justify-between text-[13px] font-medium'
              }`}
            >
              <div
                className={`flex items-center min-w-0 ${
                  isCollapsedOnDesktop ? 'gap-2.5 lg:gap-0' : 'gap-2.5'
                }`}
              >
                <QrCode className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:text-[#1b75bc] dark:group-hover:text-[#54b0e2] transition-colors shrink-0" />
                <span
                  className={`truncate ${
                    isCollapsedOnDesktop ? 'block lg:hidden' : 'block'
                  }`}
                >
                  Transfer Data
                </span>
              </div>
            </button>
          )}

          {/* Collapsed Desktop Theme Toggle */}
          {isCollapsedOnDesktop && (
            <button
              type="button"
              onClick={() => setIsDarkMode(!isDarkMode)}
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="hidden lg:flex w-11 h-11 items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] hover:bg-slate-100/80 dark:hover:bg-white/[0.05] transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc]"
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          )}

          {/* Quiet Congregation Identity + Theme Quick-Toggle */}
          <div
            className={`pt-2.5 mt-1.5 border-t border-slate-200/60 dark:border-white/[0.07] px-2 flex items-center justify-between gap-2 ${
              isCollapsedOnDesktop ? 'flex lg:hidden' : 'flex'
            }`}
          >
            <div className="min-w-0 text-left">
              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 truncate">
                WWCF Santa Cruz
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                Worship Song Line-up Scheduler
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsDarkMode(!isDarkMode)}
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="w-8 h-8 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] flex items-center justify-center shrink-0 transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc]"
            >
              {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
