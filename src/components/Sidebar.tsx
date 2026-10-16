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
  QrCode
} from 'lucide-react';

export interface NavigationItem {
  id: ActiveTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const MAIN_NAVIGATION_ITEMS: NavigationItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'scheduler', label: 'Song Scheduler', icon: Sliders },
  { id: 'songs', label: 'Song Database', icon: Music },
  { id: 'schedules', label: 'Saved Lineups', icon: CalendarDays },
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

  // Desktop width: narrow 54px icon rail when collapsed, 260px workspace panel when expanded
  const widthClass = isCollapsedOnDesktop ? 'w-[280px] lg:w-[54px]' : 'w-[280px] lg:w-[260px]';

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
        className={`fixed top-0 bottom-0 z-50 ${widthClass} wwcf-glass-sidebar text-slate-700 dark:text-slate-300 flex flex-col transition-all duration-200 ease-in-out ${positionClass} ${mobileTranslateClass} ${desktopTranslateClass} select-none`}
      >
        {/* ========================================================================= */}
        {/* TOP BAR: Header / Toggle Actions                                         */}
        {/* ========================================================================= */}
        <div
          className={`h-14 border-b border-slate-200/70 dark:border-white/10 shrink-0 flex items-center ${
            isCollapsedOnDesktop ? 'px-4 lg:px-0 lg:justify-center justify-between' : 'px-4 justify-between'
          }`}
        >
          {/* Header text visible on expanded desktop and mobile drawer */}
          <div
            className={`items-center gap-2 min-w-0 ${
              isCollapsedOnDesktop ? 'flex lg:hidden' : 'flex'
            }`}
          >
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Navigation
            </span>
          </div>

          <div className="flex items-center gap-1">
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
                className="hidden lg:flex items-center justify-center w-8 h-8 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc]"
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
              className="lg:hidden p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
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
          className={`flex-1 py-3 overflow-y-auto space-y-1 ${
            isCollapsedOnDesktop ? 'px-3 lg:px-1.5 lg:flex lg:flex-col lg:items-center' : 'px-3'
          }`}
        >
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
                    ? 'w-full lg:w-10 lg:h-10 px-3 lg:px-0 py-2.5 lg:py-0 rounded-xl flex items-center justify-between lg:justify-center'
                    : 'w-full px-3 py-2.5 rounded-xl flex items-center justify-between'
                } ${
                  isActive
                    ? 'bg-[#1b75bc]/12 dark:bg-[#1b75bc]/20 text-[#1b75bc] dark:text-[#54b0e2] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-white/5 font-medium'
                }`}
              >
                <div
                  className={`flex items-center min-w-0 ${
                    isCollapsedOnDesktop ? 'gap-3 lg:gap-0' : 'gap-3'
                  }`}
                >
                  <div
                    className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                      isActive
                        ? 'bg-[#1b75bc] text-white shadow-xs'
                        : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                  </div>

                  {/* Label: hidden on desktop when collapsed into rail */}
                  <span
                    className={`truncate text-sm ${
                      isCollapsedOnDesktop ? 'block lg:hidden' : 'block'
                    }`}
                  >
                    {item.label}
                  </span>
                </div>

                {/* Active indicator dot / pill */}
                {isActive && (
                  <span
                    className={`shrink-0 rounded-full bg-[#1b75bc] dark:bg-[#54b0e2] ${
                      isCollapsedOnDesktop
                        ? 'w-1.5 h-4 lg:w-1 lg:h-3 block lg:absolute ' +
                          (isRight ? 'lg:-left-1 lg:top-1/2 lg:-translate-y-1/2' : 'lg:-right-1 lg:top-1/2 lg:-translate-y-1/2')
                        : 'w-1.5 h-4 block'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* ========================================================================= */}
        {/* FOOTER UTILITY ACTIONS                                                   */}
        {/* ========================================================================= */}
        <div
          className={`border-t border-slate-200/70 dark:border-white/10 shrink-0 space-y-1 ${
            isCollapsedOnDesktop
              ? 'p-3 lg:p-1.5 lg:flex lg:flex-col lg:items-center'
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
            className={`transition-colors cursor-pointer group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc] rounded-xl text-slate-600 dark:text-slate-400 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] hover:bg-slate-100/80 dark:hover:bg-white/5 ${
              isCollapsedOnDesktop
                ? 'w-full lg:w-10 lg:h-10 px-3 lg:px-0 py-2 lg:py-0 flex items-center justify-between lg:justify-center'
                : 'w-full px-3 py-2 flex items-center justify-between text-xs font-semibold'
            }`}
          >
            <div
              className={`flex items-center min-w-0 ${
                isCollapsedOnDesktop ? 'gap-2.5 lg:gap-0' : 'gap-2.5'
              }`}
            >
              <HelpCircle className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2] shrink-0" />
              <span
                className={`truncate ${
                  isCollapsedOnDesktop ? 'block lg:hidden' : 'block'
                }`}
              >
                Help & Guide
              </span>
            </div>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-200/60 dark:bg-white/10 text-slate-500 dark:text-slate-400 ${
                isCollapsedOnDesktop ? 'inline-block lg:hidden' : 'inline-block'
              }`}
            >
              F1
            </span>
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
            className={`transition-colors cursor-pointer group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc] rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-white/5 ${
              isCollapsedOnDesktop
                ? 'w-full lg:w-10 lg:h-10 px-3 lg:px-0 py-2 lg:py-0 flex items-center justify-between lg:justify-center'
                : 'w-full px-3 py-2 flex items-center justify-between text-xs font-semibold'
            }`}
          >
            <div
              className={`flex items-center min-w-0 ${
                isCollapsedOnDesktop ? 'gap-2.5 lg:gap-0' : 'gap-2.5'
              }`}
            >
              <Settings className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300 shrink-0" />
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
            className={`transition-colors cursor-pointer group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc] rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-white/5 ${
              isCollapsedOnDesktop
                ? 'w-full lg:w-10 lg:h-10 px-3 lg:px-0 py-2 lg:py-0 flex items-center justify-between lg:justify-center'
                : 'w-full px-3 py-2 flex items-center justify-between text-xs font-semibold'
            }`}
          >
            <div
              className={`flex items-center min-w-0 ${
                isCollapsedOnDesktop ? 'gap-2.5 lg:gap-0' : 'gap-2.5'
              }`}
            >
              <Database className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300 shrink-0" />
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
              className={`transition-colors cursor-pointer group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc] rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-white/5 ${
                isCollapsedOnDesktop
                  ? 'w-full lg:w-10 lg:h-10 px-3 lg:px-0 py-2 lg:py-0 flex items-center justify-between lg:justify-center'
                  : 'w-full px-3 py-2 flex items-center justify-between text-xs font-semibold'
              }`}
            >
              <div
                className={`flex items-center min-w-0 ${
                  isCollapsedOnDesktop ? 'gap-2.5 lg:gap-0' : 'gap-2.5'
                }`}
              >
                <QrCode className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300 shrink-0" />
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

          {/* Subtle Ministry indicator (plain text only, strictly no logo) */}
          <div
            className={`pt-2 px-1 text-left ${
              isCollapsedOnDesktop ? 'block lg:hidden' : 'block'
            }`}
          >
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
              WWCF Santa Cruz
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
              Worship Ministry Scheduler
            </p>
          </div>
        </div>
      </aside>
    </>
  );
};
