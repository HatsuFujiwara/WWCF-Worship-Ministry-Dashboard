import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChartInstrumentType,
  InstrumentChartVariant,
  Schedule,
  Song,
  SongVideoMarker,
  getAssignmentMembers
} from '../types';
import { resolveScheduleSongTitles, resolveSlotSong } from '../utils/songResolveUtils';
import { resolveTransitionNote } from '../utils/songReferenceUtils';
import { formatDateDisplayManila } from '../utils/dateUtils';
import { parseLyricsSlides } from '../utils/lyricsParser';
import { buildYouTubeTimestampUrl, formatMarkerTimestamp } from '../utils/videoMarkerUtils';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import { ChordChartViewer } from './ChordChartViewer';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Music,
  Zap,
  Heart,
  Activity,
  Users,
  FileText,
  Clock,
  ArrowRight,
  Guitar,
  Youtube
} from 'lucide-react';

const PREFERRED_INSTRUMENT_STORAGE_KEY = 'wwcf_musician_preferred_instrument_v1';

type PrompterViewMode = 'vocal' | 'musician';

interface RehearsalPrompterModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: Schedule;
  allSongs: Song[];
}

interface PrompterItem {
  id: string;
  category: 'praise' | 'worship';
  categoryIndex: number;
  overallIndex: number;
  title: string;
  key?: string;
  originalKey?: string;
  bpm?: number;
  timeSignature?: string;
  duration?: string;
  capo?: number;
  tuning?: string;
  rehearsalNotes?: string;
  lyrics?: string;
  notes?: string;
  transitionNote?: string;
  instrumentCharts?: InstrumentChartVariant[];
  youtubeUrl?: string;
  youtubeId?: string;
  videoMarkers?: SongVideoMarker[];
}

export const RehearsalPrompterModal: React.FC<RehearsalPrompterModalProps> = ({
  isOpen,
  onClose,
  schedule,
  allSongs
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [prompterMode, setPrompterMode] = useState<PrompterViewMode>('vocal');
  const [showRoster, setShowRoster] = useState(false);
  const [showLyrics, setShowLyrics] = useState(true);
  const [preferredInstrument, setPreferredInstrument] = useState<ChartInstrumentType>(() => {
    try {
      const saved = localStorage.getItem(PREFERRED_INSTRUMENT_STORAGE_KEY);
      if (saved) return saved as ChartInstrumentType;
    } catch {}
    return 'all';
  });

  const handlePreferredInstrumentChange = useCallback((inst: ChartInstrumentType) => {
    setPreferredInstrument(inst);
    try {
      localStorage.setItem(PREFERRED_INSTRUMENT_STORAGE_KEY, inst);
    } catch {}
  }, []);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const emptyCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusedRef = useRef<HTMLElement | null>(null);

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'rehearsal-prompter-modal',
    isOpen,
    layer: OverlayLayer.CRITICAL_DIALOG,
    onClose,
    closeOnEscape: true
  });

  // Build sequential list of items
  const items = useMemo<PrompterItem[]>(() => {
    const resolved = resolveScheduleSongTitles(schedule, allSongs);
    const result: PrompterItem[] = [];

    const pSongs = resolved.praiseSongs || [];
    const wSongs = resolved.worshipSongs || [];
    const pKeys = schedule.praiseSongKeys || [];
    const wKeys = schedule.worshipSongKeys || [];
    const pIds = resolved.praiseSongIds || [];
    const wIds = resolved.worshipSongIds || [];
    const transitions = schedule.transitionNotes || {};

    // 1. Praise Songs - loop by slot index to preserve array alignment
    pSongs.forEach((title, idx) => {
      if (!title || !title.trim()) return;
      const cleanTitle = title.trim();
      const songId = pIds[idx];
      const { song } = resolveSlotSong(cleanTitle, songId, allSongs);

      const nextTitle = idx < pSongs.length - 1 ? pSongs[idx + 1] : undefined;
      const nextId = idx < pSongs.length - 1 ? pIds[idx + 1] : undefined;
      const transitionNote = resolveTransitionNote(
        transitions,
        'praise',
        idx,
        idx + 1,
        cleanTitle,
        nextTitle,
        songId,
        nextId
      );

      result.push({
        id: `praise-${idx}`,
        category: 'praise',
        categoryIndex: result.length + 1,
        overallIndex: result.length + 1,
        title: song?.title || cleanTitle,
        key: pKeys[idx]?.trim() || undefined,
        originalKey: song?.originalKey || song?.key || undefined,
        bpm: song?.bpm,
        timeSignature: song?.timeSignature,
        duration: song?.duration,
        capo: song?.capo,
        tuning: song?.tuning,
        rehearsalNotes: song?.rehearsalNotes,
        lyrics: song?.lyrics,
        notes: song?.notes,
        transitionNote,
        instrumentCharts: song?.instrumentCharts,
        youtubeUrl: song?.youtubeUrl,
        youtubeId: song?.youtubeId,
        videoMarkers: song?.videoMarkers
      });
    });

    const praiseCount = result.length;

    // Cross-section transition note
    const crossTransitionNote = resolveTransitionNote(
      transitions,
      'cross_section',
      praiseCount > 0 ? praiseCount - 1 : 0,
      0,
      pSongs[pSongs.length - 1],
      wSongs[0],
      pIds[pSongs.length - 1],
      wIds[0]
    );

    // 2. Worship Songs - loop by slot index to preserve array alignment
    wSongs.forEach((title, idx) => {
      if (!title || !title.trim()) return;
      const cleanTitle = title.trim();
      const songId = wIds[idx];
      const { song } = resolveSlotSong(cleanTitle, songId, allSongs);

      const nextTitle = idx < wSongs.length - 1 ? wSongs[idx + 1] : undefined;
      const nextId = idx < wSongs.length - 1 ? wIds[idx + 1] : undefined;
      const transitionNote = resolveTransitionNote(
        transitions,
        'worship',
        idx,
        idx + 1,
        cleanTitle,
        nextTitle,
        songId,
        nextId
      );

      result.push({
        id: `worship-${idx}`,
        category: 'worship',
        categoryIndex: result.length - praiseCount + 1,
        overallIndex: result.length + 1,
        title: song?.title || cleanTitle,
        key: wKeys[idx]?.trim() || undefined,
        originalKey: song?.originalKey || song?.key || undefined,
        bpm: song?.bpm,
        timeSignature: song?.timeSignature,
        duration: song?.duration,
        capo: song?.capo,
        tuning: song?.tuning,
        rehearsalNotes: song?.rehearsalNotes,
        lyrics: song?.lyrics,
        notes: song?.notes,
        transitionNote: idx === 0 && crossTransitionNote ? crossTransitionNote : transitionNote,
        instrumentCharts: song?.instrumentCharts,
        youtubeUrl: song?.youtubeUrl,
        youtubeId: song?.youtubeId,
        videoMarkers: song?.videoMarkers
      });
    });

    return result;
  }, [schedule, allSongs]);

  // Reset index on open
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
    }
  }, [isOpen]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(items.length - 1, prev + 1));
  }, [items.length]);

  // Keyboard navigation (avoids hijacking inputs, selects, or focused buttons on Space)
  useEffect(() => {
    if (!isOpen || !isTopmost || isBlocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const activeTag = (target?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select' || target?.isContentEditable) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if ((e.code === 'Space' || e.key === ' ') && activeTag !== 'button' && activeTag !== 'a' && target?.getAttribute('role') !== 'tab') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isTopmost, isBlocked, handleNext, handlePrev]);

  // Focus move on open & restore on close
  useEffect(() => {
    if (isOpen) {
      if (!previousFocusedRef.current && typeof document !== 'undefined') {
        previousFocusedRef.current = document.activeElement as HTMLElement | null;
      }
      const raf = window.requestAnimationFrame(() => {
        if (emptyCloseButtonRef.current) {
          emptyCloseButtonRef.current.focus();
        } else if (closeButtonRef.current) {
          closeButtonRef.current.focus();
        } else if (dialogRef.current) {
          const first = dialogRef.current.querySelector<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          first?.focus();
        }
      });
      return () => window.cancelAnimationFrame(raf);
    } else if (previousFocusedRef.current) {
      const targetToRestore = previousFocusedRef.current;
      previousFocusedRef.current = null;
      window.requestAnimationFrame(() => {
        try {
          if (targetToRestore && typeof targetToRestore.focus === 'function' && targetToRestore.isConnected) {
            targetToRestore.focus();
          }
        } catch {
          // Ignore focus restore errors
        }
      });
    }
  }, [isOpen, items.length, schedule.noService]);

  // Trap Tab / Shift+Tab keyboard focus inside the active dialog
  useEffect(() => {
    if (!isOpen || !isTopmost || isBlocked) return;
    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const container = dialogRef.current;
      if (!container) return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (!active || !container.contains(active) || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (!active || !container.contains(active) || active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleFocusTrap);
    return () => window.removeEventListener('keydown', handleFocusTrap);
  }, [isOpen, isTopmost, isBlocked]);

  if (!isOpen) return null;

  // Empty / No Service deliberate AMOLED screen
  if (items.length === 0 || schedule.noService) {
    if (typeof document === 'undefined') return null;
    return createPortal(
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rehearsal-prompter-empty-title"
        aria-hidden={isBlocked ? true : undefined}
        inert={isBlocked ? true : undefined}
        style={{ zIndex }}
        data-overlay-id="rehearsal-prompter-modal"
        data-overlay-topmost={isTopmost}
        className={`fixed inset-0 bg-black text-white flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-200 ${
          isBlocked ? 'pointer-events-none opacity-40' : ''
        }`}
      >
        <div className="max-w-md text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mx-auto text-amber-400">
            <Music className="w-6 h-6" />
          </div>
          <h2 id="rehearsal-prompter-empty-title" className="text-xl font-bold text-white">
            {schedule.noService ? 'No Service Scheduled' : 'No Songs in this Lineup'}
          </h2>
          <p className="text-sm text-white/60">
            {schedule.noService
              ? (schedule.noServiceReason ? `Service is canceled: ${schedule.noServiceReason}` : 'This date is marked as No Service.')
              : 'Add songs to this schedule in the Scheduler before starting the Live Prompter.'}
          </p>
          <div className="pt-2">
            <button
              ref={emptyCloseButtonRef}
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 min-h-[44px] rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold text-sm transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
            >
              Close Prompter
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  const currentItem = items[currentIndex];
  const nextItem = currentIndex < items.length - 1 ? items[currentIndex + 1] : null;
  const parsedCurrentLyrics = parseLyricsSlides(currentItem?.lyrics);
  const currentCharts = currentItem?.instrumentCharts || [];

  const modalContent = (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rehearsal-prompter-dialog-title"
      aria-hidden={isBlocked ? true : undefined}
      inert={isBlocked ? true : undefined}
      style={{ zIndex }}
      data-overlay-id="rehearsal-prompter-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 bg-black text-white flex flex-col justify-between overflow-hidden select-none animate-in fade-in duration-200 ${
        isBlocked ? 'pointer-events-none opacity-40' : ''
      }`}
    >
      {/* Top Bar */}
      <header className="px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-black/90 shrink-0">
        <div className="flex items-center gap-3">
          <div className="px-2.5 py-1 rounded-lg bg-[#1b75bc] text-white font-bold text-xs uppercase tracking-wider">
            WWCF Live Prompter
          </div>
          <div>
            <h2 id="rehearsal-prompter-dialog-title" className="text-sm font-bold text-white tracking-tight">
              {schedule.serviceType}
            </h2>
            <p className="text-[11px] text-white/50">
              {formatDateDisplayManila(schedule.serviceDate, { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Center Mode & Song Progress */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg p-0.5 bg-white/10 border border-white/15" role="tablist" aria-label="Prompter mode">
            <button
              type="button"
              role="tab"
              aria-selected={prompterMode === 'vocal'}
              onClick={() => setPrompterMode('vocal')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2] ${
                prompterMode === 'vocal'
                  ? 'bg-[#1b75bc] text-white'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Vocal / Stage
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={prompterMode === 'musician'}
              onClick={() => setPrompterMode('musician')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2] ${
                prompterMode === 'musician'
                  ? 'bg-[#1b75bc] text-white'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <Guitar className="w-3.5 h-3.5" />
              <span>Musician Charts</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 text-xs font-semibold tabular-nums">
            <span className="text-white/60">Song</span>
            <span className="font-bold text-[#54b0e2]">{currentIndex + 1}</span>
            <span className="text-white/40">of</span>
            <span className="font-bold text-white">{items.length}</span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRoster((prev) => !prev)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2] ${
              showRoster ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Team Roster</span>
          </button>

          {prompterMode === 'vocal' && currentItem?.lyrics && (
            <button
              type="button"
              onClick={() => setShowLyrics((prev) => !prev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2] ${
                showLyrics ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Lyrics</span>
            </button>
          )}

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
            title="Exit Prompter (Esc)"
            aria-label="Exit Prompter"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Stage Display Area */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {prompterMode === 'musician' ? (
          /* Musician Live Mode (HX-03) */
          <div className="flex-1 p-4 sm:p-6 md:p-8 flex flex-col overflow-y-auto space-y-4">
            {/* Compact Musician Header Strip */}
            <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-white/10">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`px-2.5 py-0.5 rounded-md font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                      currentItem.category === 'praise'
                        ? 'bg-amber-500 text-black'
                        : 'bg-[#1b75bc] text-white'
                    }`}
                  >
                    {currentItem.category === 'praise' ? <Zap className="w-3 h-3" /> : <Heart className="w-3 h-3" />}
                    <span>{currentItem.category === 'praise' ? 'Praise' : 'Worship'} {currentItem.categoryIndex}</span>
                  </span>
                  {currentItem.bpm && (
                    <span className="text-white/80 font-semibold tabular-nums">
                      {currentItem.bpm} BPM
                    </span>
                  )}
                  {currentItem.timeSignature && (
                    <span className="text-white/70 font-semibold tabular-nums">
                      · {currentItem.timeSignature}
                    </span>
                  )}
                  {currentItem.duration && (
                    <span className="text-white/60 tabular-nums">
                      · {currentItem.duration}
                    </span>
                  )}
                  {currentItem.tuning && (
                    <span className="text-white/70">
                      · Tuning: {currentItem.tuning}
                    </span>
                  )}
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight [text-wrap:balance]">
                  {currentItem.title}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15">
                  <div className="text-[10px] uppercase font-bold text-white/50">Performed Key</div>
                  <div className={`text-base font-bold tabular-nums ${currentItem.key ? 'text-[#54b0e2]' : 'text-white/50 italic text-xs'}`}>
                    {currentItem.key || 'Performed key not set'}
                  </div>
                </div>
                {currentItem.originalKey && (
                  <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                    <div className="text-[10px] uppercase font-bold text-white/40">Original Key</div>
                    <div className="text-base font-bold tabular-nums text-white/80">{currentItem.originalKey}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Band Rehearsal Cues & Transition Alert */}
            {(currentItem.rehearsalNotes || currentItem.notes || currentItem.transitionNote) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                {(currentItem.rehearsalNotes || currentItem.notes) && (
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white/90 space-y-0.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                      Band Rehearsal Cues
                    </div>
                    <div className="leading-relaxed">
                      {currentItem.rehearsalNotes || currentItem.notes}
                    </div>
                  </div>
                )}
                {currentItem.transitionNote && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-0.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                      <ArrowRight className="w-3 h-3" />
                      <span>Transition Cue</span>
                    </div>
                    <div className="leading-relaxed font-medium">{currentItem.transitionNote}</div>
                  </div>
                )}
              </div>
            )}

            {/* Reference Video Markers (HX-04) */}
            {currentItem.videoMarkers && currentItem.videoMarkers.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="inline-flex items-center gap-1 text-white/60 font-semibold mr-1">
                  <Youtube className="w-3.5 h-3.5 text-red-400" />
                  <span>Video Cues:</span>
                </span>
                {currentItem.videoMarkers.map((marker) => {
                  const jumpUrl = buildYouTubeTimestampUrl(
                    currentItem.youtubeUrl,
                    currentItem.youtubeId,
                    marker.timeSeconds
                  );
                  return jumpUrl ? (
                    <a
                      key={marker.id}
                      href={jumpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/15 border border-white/15 text-white/90 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
                    >
                      <span className="font-mono font-bold text-[#54b0e2] tabular-nums">
                        {formatMarkerTimestamp(marker.timeSeconds)}
                      </span>
                      <span>{marker.label}</span>
                    </a>
                  ) : (
                    <span
                      key={marker.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-white/75"
                    >
                      <span className="font-mono font-bold text-[#54b0e2] tabular-nums">
                        {formatMarkerTimestamp(marker.timeSeconds)}
                      </span>
                      <span>{marker.label}</span>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Chart Viewer or Helpful Empty Chart Notice */}
            {currentCharts.length > 0 ? (
              <ChordChartViewer
                charts={currentCharts}
                baseKey={currentItem.originalKey}
                targetPerformedKey={currentItem.key}
                hasExplicitPerformedKeyContext={true}
                initialCapo={currentItem.capo}
                preferredInstrument={preferredInstrument}
                onPreferredInstrumentChange={handlePreferredInstrumentChange}
                variantMode="stage"
                maxHeightClass="max-h-[48vh]"
              />
            ) : (
              <div className="p-6 rounded-xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Guitar className="w-4 h-4 text-[#54b0e2]" />
                  <span>No instrument chord charts attached to &ldquo;{currentItem.title}&rdquo; yet</span>
                </div>
                <p className="text-xs text-white/60">
                  Add Guitar, Piano, Bass, or Drums charts in the Song Database editor to view live transposed charts and capo shapes here.
                </p>
                {parsedCurrentLyrics.hasLyrics && (
                  <div className="pt-2 border-t border-white/10 space-y-2 max-h-60 overflow-y-auto">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-white/50">
                      Lyrics Fallback
                    </div>
                    {parsedCurrentLyrics.groups.map((group) => (
                      <div key={group.id} className="space-y-1">
                        <div className="text-xs font-bold text-[#54b0e2]">{group.group}</div>
                        {group.slides.map((slide) => (
                          <div key={slide.id} className="text-xs text-white/90 whitespace-pre-line font-mono">
                            {slide.text}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {nextItem && (
              <div className="mt-auto p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                    Up Next ({nextItem.category === 'praise' ? 'Praise' : 'Worship'})
                  </div>
                  <div className="text-sm font-bold text-white truncate max-w-md">{nextItem.title}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  <span className={`font-semibold ${nextItem.key ? 'text-[#54b0e2]' : 'text-white/50 italic'}`}>
                    {nextItem.key ? `Key ${nextItem.key}` : 'Performed key not set'}
                  </span>
                  {nextItem.bpm && <span className="text-white/70 tabular-nums">· {nextItem.bpm} BPM</span>}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Vocal / Stage Core View */
          <div className="flex-1 p-6 md:p-12 flex flex-col justify-between overflow-y-auto space-y-6">
            <div className="space-y-4">
              {/* Category and Index Badge */}
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                    currentItem.category === 'praise'
                      ? 'bg-amber-500 text-black'
                      : 'bg-[#1b75bc] text-white'
                  }`}
                >
                  {currentItem.category === 'praise' ? <Zap className="w-3.5 h-3.5" /> : <Heart className="w-3.5 h-3.5" />}
                  <span>{currentItem.category === 'praise' ? 'Praise Song' : 'Worship Song'} {currentItem.categoryIndex}</span>
                </span>

                {currentItem.bpm && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold tabular-nums bg-white/10 text-white border border-white/20 flex items-center gap-1">
                    <Activity className="w-3 h-3 text-[#54b0e2]" />
                    <span>{currentItem.bpm} BPM</span>
                  </span>
                )}

                {currentItem.duration && (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold tabular-nums bg-white/10 text-white/80 border border-white/20 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{currentItem.duration}</span>
                  </span>
                )}
              </div>

              {/* Giant Title */}
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight leading-tight [text-wrap:balance]">
                {currentItem.title}
              </h1>

              {/* Key Information Badges */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {currentItem.key ? (
                  <div className="px-4 py-2 rounded-xl bg-white/10 border border-white/20">
                    <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Performed Key</div>
                    <div className="text-2xl font-bold tabular-nums text-[#54b0e2]">{currentItem.key}</div>
                  </div>
                ) : (
                  <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-[10px] uppercase font-bold text-white/40 tracking-wider">Performed Key</div>
                    <div className="text-sm font-semibold text-white/50 italic">Performed key not set</div>
                  </div>
                )}

                {currentItem.originalKey && (
                  <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-[10px] uppercase font-bold text-white/40 tracking-wider">Original Key</div>
                    <div className="text-xl font-bold tabular-nums text-white/80">{currentItem.originalKey}</div>
                  </div>
                )}
              </div>

              {/* Transition Note to Next Song */}
              {currentItem.transitionNote && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3" />
                    <span>Transition Cue</span>
                  </div>
                  <div className="text-base font-semibold leading-relaxed">
                    {currentItem.transitionNote}
                  </div>
                </div>
              )}

              {/* General Song Notes */}
              {(currentItem.rehearsalNotes || currentItem.notes) && (
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-white/90">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1">
                    Rehearsal Note
                  </div>
                  <div className="text-sm leading-relaxed">{currentItem.rehearsalNotes || currentItem.notes}</div>
                </div>
              )}
            </div>

            {/* Up Next Preview Card at Bottom */}
            {nextItem && (
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-0.5">
                    Up Next ({nextItem.category === 'praise' ? 'Praise' : 'Worship'})
                  </div>
                  <div className="text-base font-bold text-white truncate max-w-md">
                    {nextItem.title}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {nextItem.key ? (
                    <span className="px-2 py-0.5 rounded bg-white/10 text-xs font-bold text-[#54b0e2]">
                      Key {nextItem.key}
                    </span>
                  ) : (
                    <span className="text-xs italic text-white/50">Performed key not set</span>
                  )}
                  {nextItem.bpm && (
                    <span className="px-2 py-0.5 rounded bg-white/10 text-xs font-bold text-white/80">
                      {nextItem.bpm} BPM
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Optional Right Drawer: Lyrics (in vocal mode) or Team Roster */}
        {((prompterMode === 'vocal' && showLyrics && currentItem.lyrics) || showRoster) && (
          <aside className="w-full md:w-96 border-t md:border-t-0 md:border-l border-white/10 bg-black/60 p-6 overflow-y-auto space-y-4 shrink-0">
            {showRoster ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white/80 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-[#54b0e2]" />
                    <span>Ministry Assignments</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowRoster(false)}
                    className="text-xs text-white/50 hover:text-white cursor-pointer rounded px-1.5 py-0.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
                  >
                    Hide
                  </button>
                </div>
                <div className="space-y-2 text-xs">
                  {schedule.ministryAssignments.map((a) => {
                    const membersList = getAssignmentMembers(a);
                    const names = membersList
                      .map((m) => m.memberName)
                      .filter(Boolean)
                      .join(', ');
                    if (!names || names === 'Unassigned') return null;

                    return (
                      <div key={a.id} className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                        <div className="font-bold text-[#54b0e2] text-[11px]">{a.role}</div>
                        <div className="text-white font-medium mt-0.5">{names}</div>
                        {a.notes && <div className="text-white/50 text-[10px] mt-0.5 italic">{a.notes}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : prompterMode === 'vocal' && showLyrics && currentItem.lyrics ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white/80 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-[#54b0e2]" />
                    <span>Song Lyrics Reference</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowLyrics(false)}
                    className="text-xs text-white/50 hover:text-white cursor-pointer rounded px-1.5 py-0.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
                  >
                    Hide
                  </button>
                </div>
                {parsedCurrentLyrics.hasLyrics ? (
                  <div className="space-y-3">
                    {parsedCurrentLyrics.groups.map((group) => (
                      <div key={group.id} className="space-y-1.5">
                        <div className="text-[11px] font-bold text-[#54b0e2] tracking-wide">
                          {group.group}
                        </div>
                        <div className="space-y-1.5">
                          {group.slides.map((slide) => (
                            <div
                              key={slide.id}
                              className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/90 whitespace-pre-line leading-relaxed"
                            >
                              {slide.text}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-white/50 italic">
                    No displayable lyrics lines found for this song.
                  </div>
                )}
              </div>
            ) : null}
          </aside>
        )}
      </main>

      {/* Bottom Stage Controls */}
      <footer className="px-6 py-4 border-t border-white/10 bg-black/90 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className={`px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2] ${
            currentIndex === 0
              ? 'bg-white/5 text-white/20 cursor-not-allowed'
              : 'bg-white/10 hover:bg-white/20 text-white active:scale-95'
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous Song</span>
        </button>

        <div className="text-center text-[11px] text-white/40 hidden sm:block">
          Use <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono">←</kbd> and <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono">→</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono">Space</kbd> to navigate
        </div>

        <button
          type="button"
          onClick={handleNext}
          disabled={currentIndex === items.length - 1}
          className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2] ${
            currentIndex === items.length - 1
              ? 'bg-white/5 text-white/20 cursor-not-allowed'
              : 'bg-[#1b75bc] hover:bg-[#155d97] text-white active:scale-95 shadow-md'
          }`}
        >
          <span>Next Song</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </footer>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
