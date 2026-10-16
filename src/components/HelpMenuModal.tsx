import React from 'react';
import { createPortal } from 'react-dom';
import {
  HelpCircle,
  X,
  ChevronRight,
  Sparkles,
  Church,
  Users,
  Music,
  Sliders,
  Calendar,
  Settings,
  Shield,
  Download,
  Database,
  QrCode,
  FileDown
} from 'lucide-react';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';

interface HelpMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSection: (stepId: number) => void;
}

export const HelpMenuModal: React.FC<HelpMenuModalProps> = ({
  isOpen,
  onClose,
  onSelectSection
}) => {
  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'help-menu-modal',
    isOpen,
    layer: OverlayLayer.MODAL,
    onClose,
    closeOnEscape: true
  });

  // Primary Guides
  const basicGuide = {
    title: 'Create a Line-up (Basic Guide)',
    stepId: 1,
    icon: Sliders,
    badge: 'Basic Guide',
    desc: 'Complete 7-step walkthrough: create, schedule, select songs, assign members, and save lineups.'
  };

  const qrTransferGuide = {
    title: 'PC → Phone Data Transfer (QR Code)',
    stepId: 200,
    icon: QrCode,
    badge: 'Advanced Guide',
    desc: 'Transfer application data between PC and mobile devices seamlessly using encrypted QR sessions.'
  };

  const exportGuide = {
    title: 'Exporting Lineups (PDF & PNG)',
    stepId: 300,
    icon: FileDown,
    badge: 'Advanced Guide',
    desc: 'Learn how to generate printable PDF documents and high-resolution PNG image cards for worship teams.'
  };

  // Interactive Advanced Feature Guides & Reference Topics
  const helpTopics = [
    { title: 'Song Database & Catalog', stepId: 310, icon: Music, badge: 'Guide', desc: 'Master song catalog, add songs, original keys, play counts & Praise/Worship categories' },
    { title: 'Import Song / Playlist', stepId: 320, icon: Sparkles, badge: 'Guide', desc: 'Import YouTube and YouTube Music song or playlist links directly into your line-up' },
    { title: 'Volunteer Roster & Member Editor', stepId: 330, icon: Users, badge: 'Guide', desc: 'Volunteer directory, ministry tags, Disciplinary Action (DA) guard & roster management' },
    { title: 'Worship Team Member Assignment', stepId: 340, icon: Users, badge: 'Guide', desc: 'Assign Song Leaders, Backup Singers, Band Musicians, and Audio/Tech operators' },
    { title: 'Scheduling & Service Types', stepId: 350, icon: Church, badge: 'Guide', desc: 'Sunday vs Midweek services, Youth Fellowships, and collision protection' },
    { title: 'Song Repetition Guard & Variety', stepId: 360, icon: Shield, badge: 'Guide', desc: 'First-come, first-serve monthly song repetition warnings across schedules' },
    { title: 'Saved Line-ups Archive & History', stepId: 370, icon: Calendar, badge: 'Guide', desc: 'Historical archive, multi-field search, month filters & batch operations' },
    { title: 'Backup & Restore Data', stepId: 380, icon: Database, badge: 'Guide', desc: 'Export or restore complete JSON database backups securely' },
    { title: 'Application Settings & Themes', stepId: 390, icon: Settings, badge: 'Guide', desc: 'Theme options (Light, AMOLED Dark) & Interactive Guide auto-show preferences' }
  ];

  if (!isOpen) return null;

  const modalContent = (
    <div
      style={{ zIndex }}
      data-overlay-id="help-menu-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200 transition-opacity ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] my-auto transform animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400">
              <HelpCircle className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                Interactive Help & Guides
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Word for the World - Santa Cruz Worship Ministry
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Guides & Topics Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {/* PRIMARY GUIDES */}
          <div className="space-y-2.5">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
              Featured Interactive Walkthroughs
            </p>

            {/* Basic Guide Card */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onSelectSection(basicGuide.stepId);
              }}
              className="w-full p-3.5 rounded-xl border border-indigo-200/80 dark:border-indigo-800/80 bg-indigo-50/40 dark:bg-indigo-950/20 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer flex items-center justify-between text-left group shadow-2xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-600 text-white shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-indigo-950 dark:text-indigo-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
                      {basicGuide.title}
                    </h4>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-200/70 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300">
                      Standard
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium mt-0.5 leading-snug">
                    {basicGuide.desc}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-indigo-500 shrink-0 ml-2" />
            </button>

            {/* Advanced Guide: QR Transfer Card */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onSelectSection(qrTransferGuide.stepId);
              }}
              className="w-full p-3.5 rounded-xl border border-blue-200/80 dark:border-blue-800/80 bg-blue-50/40 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:border-blue-400 dark:hover:border-blue-600 transition-all cursor-pointer flex items-center justify-between text-left group shadow-2xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[#1b75bc] text-white shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-blue-950 dark:text-blue-200 group-hover:text-[#1b75bc] dark:group-hover:text-blue-300 transition-colors">
                      {qrTransferGuide.title}
                    </h4>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-200/70 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300">
                      Advanced
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium mt-0.5 leading-snug">
                    {qrTransferGuide.desc}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#1b75bc] shrink-0 ml-2" />
            </button>

            {/* Advanced Guide: Lineup Export Card */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onSelectSection(exportGuide.stepId);
              }}
              className="w-full p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-800/80 bg-emerald-50/40 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:border-emerald-400 dark:hover:border-emerald-600 transition-all cursor-pointer flex items-center justify-between text-left group shadow-2xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-600 text-white shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-emerald-950 dark:text-emerald-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors">
                      {exportGuide.title}
                    </h4>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-200/70 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                      Advanced
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium mt-0.5 leading-snug">
                    {exportGuide.desc}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
            </button>
          </div>

          {/* INTERACTIVE ADVANCED FEATURE GUIDES */}
          <div className="space-y-2.5 pt-1">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
              Interactive Feature Guides & Topics
            </p>
            <div className="space-y-2.5">
              {helpTopics.map((sec) => {
                const Icon = sec.icon;
                return (
                  <button
                    key={sec.title}
                    type="button"
                    onClick={() => {
                      onClose();
                      onSelectSection(sec.stepId);
                    }}
                    className="w-full p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/30 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all cursor-pointer flex items-center justify-between text-left group shadow-2xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-slate-700 dark:bg-slate-700 group-hover:bg-indigo-600 text-white shrink-0 shadow-xs group-hover:scale-105 transition-all">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
                            {sec.title}
                          </h4>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/60 group-hover:text-indigo-800 dark:group-hover:text-indigo-300 transition-colors">
                            {sec.badge || 'Guide'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium mt-0.5 leading-snug">
                          {sec.desc}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 shrink-0 ml-2 transition-colors" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={() => {
              onClose();
              onSelectSection(1);
            }}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Start Basic Guide</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
