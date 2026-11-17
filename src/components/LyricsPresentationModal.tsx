import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Monitor,
  MonitorOff,
  Copy,
  Check,
  Eye,
  EyeOff,
  AlertTriangle,
  Music,
  Layers,
  ExternalLink,
  Maximize2,
  ListMusic,
  Zap,
  Heart,
  SlidersHorizontal
} from 'lucide-react';
import { Schedule, Song } from '../types';
import { resolveScheduleSongTitles, resolveSlotSong } from '../utils/songResolveUtils';
import { formatDateDisplayManila } from '../utils/dateUtils';
import {
  parseLyricsSlides,
  clampLinesPerSlide,
  DEFAULT_MAX_LINES_PER_SLIDE,
  MIN_LINES_PER_SLIDE,
  MAX_LINES_PER_SLIDE,
  ParsedLyricsDocument,
  ParsedLyricsSlide
} from '../utils/lyricsParser';
import {
  DEFAULT_LYRICS_DISPLAY_SETTINGS,
  LyricsDisplaySettings,
  LyricsFontScale,
  LyricsOutputSlidePayload,
  buildLyricsOutputUrl,
  createLyricsSessionId,
  openLyricsBroadcastChannel,
  sanitizeLyricsChannelMessage,
  validateLyricsSlidePayload
} from '../utils/lyricsPresentationChannel';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';

interface LyricsPresentationModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: Schedule;
  allSongs: Song[];
  showToast?: (msg: string, type?: 'success' | 'danger' | 'info') => void;
}

type OutputConnectionStatus =
  | 'idle'
  | 'opening'
  | 'connected'
  | 'disconnected'
  | 'popup-blocked';

interface PresentationSongItem {
  slotId: string;
  category: 'praise' | 'worship';
  songNumber: number;
  title: string;
  performedKey?: string;
  isStaleId: boolean;
  isAmbiguous: boolean;
  isUnmatched: boolean;
  doc: ParsedLyricsDocument;
}

const PREVIEW_FONT_SCALE: Record<LyricsFontScale, string> = {
  compact: 'text-base sm:text-xl',
  standard: 'text-lg sm:text-2xl',
  large: 'text-xl sm:text-3xl',
  stage: 'text-2xl sm:text-4xl'
};

const MIRROR_FONT_SCALE: Record<LyricsFontScale, string> = {
  compact: 'text-[clamp(1.35rem,3vw,2.5rem)]',
  standard: 'text-[clamp(1.75rem,4vw,3.35rem)]',
  large: 'text-[clamp(2.15rem,5vw,4.25rem)]',
  stage: 'text-[clamp(2.6rem,6vw,5.25rem)]'
};

export const LyricsPresentationModal: React.FC<LyricsPresentationModalProps> = ({
  isOpen,
  onClose,
  schedule,
  allSongs,
  showToast
}) => {
  const effectiveOpen = isOpen && !schedule.noService;

  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>(() => {
    try {
      return createLyricsSessionId();
    } catch {
      return '';
    }
  });
  const [linesPerSlide, setLinesPerSlide] = useState<number>(DEFAULT_MAX_LINES_PER_SLIDE);
  const [displaySettings, setDisplaySettings] = useState<LyricsDisplaySettings>(
    DEFAULT_LYRICS_DISPLAY_SETTINGS
  );
  const [selectedSongIdx, setSelectedSongIdx] = useState<number>(0);
  const [selectedSlideIdx, setSelectedSlideIdx] = useState<number>(0);
  const [isBlanked, setIsBlanked] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<OutputConnectionStatus>('idle');
  const [channelUnsupported, setChannelUnsupported] = useState<boolean>(false);
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [showMobileSetlist, setShowMobileSetlist] = useState<boolean>(false);
  const [showMirrorOverlay, setShowMirrorOverlay] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [manualCopyUrl, setManualCopyUrl] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>('');

  const channelRef = useRef<BroadcastChannel | null>(null);
  const outputWindowRef = useRef<Window | null>(null);
  const lastSentPayloadRef = useRef<LyricsOutputSlidePayload | null>(null);
  const isBlankedRef = useRef<boolean>(false);
  const displaySettingsRef = useRef<LyricsDisplaySettings>(DEFAULT_LYRICS_DISPLAY_SETTINGS);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const mirrorDialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const mirrorExitButtonRef = useRef<HTMLButtonElement | null>(null);
  const manualCopyInputRef = useRef<HTMLInputElement | null>(null);
  const previousFocusedRef = useRef<HTMLElement | null>(null);

  const cleanupSessionAndClose = useCallback(() => {
    const channel = channelRef.current;
    if (channel && sessionId) {
      try {
        channel.postMessage({
          type: 'close',
          sessionId,
          sentAt: Date.now()
        });
      } catch {
        // Ignore channel post errors on teardown
      }
      channel.close();
      channelRef.current = null;
    }
    try {
      if (outputWindowRef.current && !outputWindowRef.current.closed) {
        outputWindowRef.current.close();
      }
    } catch {
      // Ignore cross-origin/window close restrictions
    }
    outputWindowRef.current = null;
    setShowMirrorOverlay(false);
    setManualCopyUrl(null);
    onClose();
  }, [onClose, sessionId]);

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'lyrics-presentation-modal',
    isOpen,
    layer: OverlayLayer.CRITICAL_DIALOG,
    onClose: () => {
      if (showMirrorOverlay) {
        setShowMirrorOverlay(false);
        return;
      }
      cleanupSessionAndClose();
    },
    closeOnEscape: true
  });

  // Build Praise -> Worship ordered presentation lineup preserving slot alignment
  const songs = useMemo<PresentationSongItem[]>(() => {
    const resolved = resolveScheduleSongTitles(schedule, allSongs);
    const pTitles = resolved.praiseSongs || [];
    const wTitles = resolved.worshipSongs || [];
    const pIds = resolved.praiseSongIds || [];
    const wIds = resolved.worshipSongIds || [];
    const pKeys = schedule.praiseSongKeys || [];
    const wKeys = schedule.worshipSongKeys || [];

    const list: PresentationSongItem[] = [];

    pTitles.forEach((rawTitle, idx) => {
      if (!rawTitle || !rawTitle.trim()) return;
      const cleanTitle = rawTitle.trim();
      const slotRes = resolveSlotSong(cleanTitle, pIds[idx], allSongs);
      const doc = parseLyricsSlides(slotRes.song?.lyrics, { maxLinesPerSlide: linesPerSlide });
      list.push({
        slotId: `praise-${idx}`,
        category: 'praise',
        songNumber: list.length + 1,
        title: slotRes.song?.title || cleanTitle,
        performedKey: pKeys[idx]?.trim() || undefined,
        isStaleId: slotRes.isStaleId,
        isAmbiguous: slotRes.isAmbiguous,
        isUnmatched: slotRes.isUnmatched,
        doc
      });
    });

    wTitles.forEach((rawTitle, idx) => {
      if (!rawTitle || !rawTitle.trim()) return;
      const cleanTitle = rawTitle.trim();
      const slotRes = resolveSlotSong(cleanTitle, wIds[idx], allSongs);
      const doc = parseLyricsSlides(slotRes.song?.lyrics, { maxLinesPerSlide: linesPerSlide });
      list.push({
        slotId: `worship-${idx}`,
        category: 'worship',
        songNumber: list.length + 1,
        title: slotRes.song?.title || cleanTitle,
        performedKey: wKeys[idx]?.trim() || undefined,
        isStaleId: slotRes.isStaleId,
        isAmbiguous: slotRes.isAmbiguous,
        isUnmatched: slotRes.isUnmatched,
        doc
      });
    });

    return list;
  }, [schedule, allSongs, linesPerSlide]);

  // Reset session state whenever modal opens freshly
  useEffect(() => {
    if (effectiveOpen) {
      try {
        const nextSessionId = createLyricsSessionId();
        setSessionId(nextSessionId);
        setSessionError(null);
      } catch (err) {
        setSessionId('');
        setSessionError(
          err instanceof Error
            ? err.message
            : 'Cryptographically secure session ID generation is unavailable in this browser context.'
        );
      }
      setConnectionStatus('idle');
      setChannelUnsupported(false);
      setPayloadError(null);
      setManualCopyUrl(null);
      setCopiedUrl(false);
      setIsBlanked(false);
      setShowMirrorOverlay(false);
      setShowMobileSetlist(false);
      setSelectedSongIdx(0);
      setSelectedSlideIdx(0);
    }
  }, [effectiveOpen]);

  // Focus move on open & restore on close (for main dialog and Mirror overlay)
  useEffect(() => {
    if (isOpen) {
      if (!previousFocusedRef.current && typeof document !== 'undefined') {
        previousFocusedRef.current = document.activeElement as HTMLElement | null;
      }
      const raf = window.requestAnimationFrame(() => {
        if (showMirrorOverlay) {
          mirrorExitButtonRef.current?.focus();
          return;
        }
        if (closeButtonRef.current) {
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
  }, [isOpen, showMirrorOverlay, sessionError]);

  // Trap Tab / Shift+Tab keyboard focus inside the active dialog
  useEffect(() => {
    if (!isOpen || !isTopmost || isBlocked) return;
    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const container = showMirrorOverlay ? mirrorDialogRef.current : dialogRef.current;
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
  }, [isOpen, isTopmost, isBlocked, showMirrorOverlay]);

  // Clamp song and slide indices whenever lineup or linesPerSlide changes
  useEffect(() => {
    if (songs.length === 0) {
      setSelectedSongIdx(0);
      setSelectedSlideIdx(0);
      return;
    }
    const clampedSongIdx = Math.min(songs.length - 1, Math.max(0, selectedSongIdx));
    if (clampedSongIdx !== selectedSongIdx) {
      setSelectedSongIdx(clampedSongIdx);
    }
    const maxSlideIdx = Math.max(0, songs[clampedSongIdx].doc.slides.length - 1);
    if (selectedSlideIdx > maxSlideIdx) {
      setSelectedSlideIdx(maxSlideIdx);
    }
  }, [songs, selectedSongIdx, selectedSlideIdx]);

  const currentSong = songs[selectedSongIdx] || null;
  const currentSlides: ParsedLyricsSlide[] = currentSong?.doc.slides || [];
  const currentSlide: ParsedLyricsSlide | null = currentSlides[selectedSlideIdx] || null;

  // Compute next slide preview (either next slide in current song or first slide of next song with slides)
  const nextPreview = useMemo<{
    songTitle: string;
    slide: ParsedLyricsSlide;
  } | null>(() => {
    if (!currentSong) return null;
    if (selectedSlideIdx + 1 < currentSlides.length) {
      return {
        songTitle: currentSong.title,
        slide: currentSlides[selectedSlideIdx + 1]
      };
    }
    for (let i = selectedSongIdx + 1; i < songs.length; i++) {
      if (songs[i].doc.slides.length > 0) {
        return {
          songTitle: songs[i].title,
          slide: songs[i].doc.slides[0]
        };
      }
    }
    return null;
  }, [currentSong, currentSlides, selectedSlideIdx, selectedSongIdx, songs]);

  const currentPayload = useMemo<LyricsOutputSlidePayload | null>(() => {
    if (!currentSong || !currentSlide) return null;
    return {
      songTitle: currentSong.title,
      sectionLabel: currentSlide.group,
      lines: currentSlide.lines,
      slideNumber: selectedSlideIdx + 1,
      totalSlidesInSong: currentSlides.length,
      songNumber: currentSong.songNumber,
      totalSongs: songs.length
    };
  }, [currentSong, currentSlide, selectedSlideIdx, currentSlides.length, songs.length]);

  lastSentPayloadRef.current = currentPayload;
  isBlankedRef.current = isBlanked;
  displaySettingsRef.current = displaySettings;

  // Open BroadcastChannel for active presentation session
  useEffect(() => {
    if (!effectiveOpen || !sessionId || sessionError) return;

    const channel = openLyricsBroadcastChannel(sessionId);
    if (!channel) {
      setChannelUnsupported(true);
      channelRef.current = null;
      return;
    }

    setChannelUnsupported(false);
    channelRef.current = channel;

    const pushCurrentState = () => {
      try {
        if (isBlankedRef.current || !lastSentPayloadRef.current) {
          channel.postMessage({
            type: 'clear',
            sessionId,
            sentAt: Date.now(),
            displaySettings: displaySettingsRef.current
          });
        } else {
          const check = validateLyricsSlidePayload(lastSentPayloadRef.current);
          if (!check.valid) {
            setPayloadError('error' in check ? check.error : 'Invalid slide payload.');
            return;
          }
          setPayloadError(null);
          channel.postMessage({
            type: 'slide_update',
            sessionId,
            sentAt: Date.now(),
            payload: check.payload,
            displaySettings: displaySettingsRef.current
          });
        }
      } catch {
        // Ignore transient channel write errors
      }
    };

    channel.onmessage = (event) => {
      const msg = sanitizeLyricsChannelMessage(event.data, sessionId);
      if (!msg) return;
      if (msg.type === 'hello') {
        setConnectionStatus('connected');
        pushCurrentState();
      } else if (msg.type === 'ready') {
        setConnectionStatus('connected');
      } else if (msg.type === 'close') {
        setConnectionStatus('disconnected');
      }
    };

    return () => {
      try {
        channel.postMessage({
          type: 'close',
          sessionId,
          sentAt: Date.now()
        });
      } catch {
        // Ignore cleanup post errors
      }
      channel.close();
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
    };
  }, [effectiveOpen, sessionId, sessionError]);

  // Poll popup window closed state so operator sees accurate connection status
  useEffect(() => {
    if (!effectiveOpen || sessionError) return;
    const timer = window.setInterval(() => {
      if (outputWindowRef.current && outputWindowRef.current.closed) {
        outputWindowRef.current = null;
        setConnectionStatus((prev) =>
          prev === 'connected' || prev === 'opening' ? 'disconnected' : prev
        );
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [effectiveOpen, sessionError]);

  // Broadcast slide updates or clear state whenever selection/settings/blank change
  useEffect(() => {
    if (!effectiveOpen || !sessionId || sessionError) return;
    const channel = channelRef.current;
    if (!channel) return;

    try {
      if (isBlanked || !currentPayload) {
        setPayloadError(null);
        channel.postMessage({
          type: 'clear',
          sessionId,
          sentAt: Date.now(),
          displaySettings
        });
      } else {
        const check = validateLyricsSlidePayload(currentPayload);
        if (!check.valid) {
          setPayloadError('error' in check ? check.error : 'Invalid slide payload.');
          return;
        }
        setPayloadError(null);
        channel.postMessage({
          type: 'slide_update',
          sessionId,
          sentAt: Date.now(),
          payload: check.payload,
          displaySettings
        });
      }
    } catch {
      // Ignore broadcast write errors
    }
  }, [effectiveOpen, sessionId, sessionError, isBlanked, currentPayload, displaySettings]);

  const handleOpenAudienceOutput = useCallback(() => {
    // If window is already open, focus it and re-sync
    if (outputWindowRef.current && !outputWindowRef.current.closed) {
      try {
        outputWindowRef.current.focus();
        setConnectionStatus('connected');
        return;
      } catch {
        // Fall through to open new window
      }
    }

    if (!sessionId || sessionError) {
      showToast?.('Audience Output unavailable: secure session initialization failed.', 'danger');
      return;
    }

    const url = buildLyricsOutputUrl(sessionId);
    const win = window.open(
      url,
      'wwcf_lyrics_audience_output',
      'popup=yes,width=1280,height=720,noopener=no'
    );

    if (!win) {
      setConnectionStatus('popup-blocked');
      setLiveAnnouncement('Pop-up blocked by browser. Use Copy Output URL or Audience Mirror.');
      showToast?.(
        'Pop-up blocked by browser. Allow pop-ups or copy the Output URL to open on a second display.',
        'danger'
      );
      return;
    }

    outputWindowRef.current = win;
    setConnectionStatus('opening');
    setLiveAnnouncement('Opening Audience Output window on this device.');
    try {
      win.focus();
    } catch {
      // Ignore focus errors
    }
  }, [sessionId, sessionError, showToast]);

  const handleCopyOutputUrl = useCallback(async () => {
    if (!sessionId || sessionError) {
      showToast?.('Output URL unavailable until a secure session is created.', 'danger');
      return;
    }
    let url = '';
    try {
      url = buildLyricsOutputUrl(sessionId);
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      setManualCopyUrl(null);
      setLiveAnnouncement('Audience Output URL copied to clipboard.');
      window.setTimeout(() => setCopiedUrl(false), 2000);
      showToast?.('Audience Output URL copied for another window in this browser.', 'success');
    } catch {
      if (url) {
        setManualCopyUrl(url);
        setLiveAnnouncement('Clipboard unavailable. Select and copy the Audience Output URL manually.');
        window.requestAnimationFrame(() => {
          manualCopyInputRef.current?.focus();
          manualCopyInputRef.current?.select();
        });
      }
      showToast?.('Automatic clipboard copy failed. Copy the Output URL manually below.', 'danger');
    }
  }, [sessionId, sessionError, showToast]);

  // Announce blank/slide/connection updates cleanly for screen readers
  useEffect(() => {
    if (!effectiveOpen || sessionError) return;
    if (isBlanked) {
      setLiveAnnouncement('Audience output blanked.');
    } else if (currentSong && currentSlide) {
      setLiveAnnouncement(
        `${currentSong.title}, ${currentSlide.group}, Slide ${selectedSlideIdx + 1} of ${currentSlides.length}`
      );
    }
  }, [effectiveOpen, sessionError, isBlanked, currentSong, currentSlide, selectedSlideIdx, currentSlides.length]);

  const handleNextSlide = useCallback(() => {
    if (!currentSong) return;
    if (selectedSlideIdx + 1 < currentSlides.length) {
      setSelectedSlideIdx(selectedSlideIdx + 1);
      return;
    }
    for (let i = selectedSongIdx + 1; i < songs.length; i++) {
      if (songs[i].doc.slides.length > 0) {
        setSelectedSongIdx(i);
        setSelectedSlideIdx(0);
        return;
      }
    }
  }, [currentSong, currentSlides.length, selectedSlideIdx, selectedSongIdx, songs]);

  const handlePrevSlide = useCallback(() => {
    if (!currentSong) return;
    if (selectedSlideIdx > 0) {
      setSelectedSlideIdx(selectedSlideIdx - 1);
      return;
    }
    for (let i = selectedSongIdx - 1; i >= 0; i--) {
      if (songs[i].doc.slides.length > 0) {
        setSelectedSongIdx(i);
        setSelectedSlideIdx(songs[i].doc.slides.length - 1);
        return;
      }
    }
  }, [currentSong, selectedSlideIdx, selectedSongIdx, songs]);

  const handleSelectSong = useCallback((idx: number) => {
    setSelectedSongIdx(idx);
    setSelectedSlideIdx(0);
    setShowMobileSetlist(false);
  }, []);

  const handlePrevSong = useCallback(() => {
    if (selectedSongIdx > 0) {
      handleSelectSong(selectedSongIdx - 1);
    }
  }, [handleSelectSong, selectedSongIdx]);

  const handleNextSong = useCallback(() => {
    if (selectedSongIdx + 1 < songs.length) {
      handleSelectSong(selectedSongIdx + 1);
    }
  }, [handleSelectSong, selectedSongIdx, songs.length]);

  // Scoped operator keyboard shortcuts
  useEffect(() => {
    if (!effectiveOpen || !isTopmost || isBlocked || showMirrorOverlay) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }
      if (
        (e.code === 'Space' || e.key === ' ') &&
        (tag === 'button' || tag === 'a' || target?.getAttribute('role') === 'button')
      ) {
        return;
      }

      if (e.key === 'ArrowRight' || e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        handleNextSlide();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevSlide();
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        setIsBlanked((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [effectiveOpen, isTopmost, isBlocked, showMirrorOverlay, handleNextSlide, handlePrevSlide]);

  if (!isOpen) return null;

  // Hard guard for No Service schedules
  if (schedule.noService) {
    return createPortal(
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lyrics-no-service-title"
        style={{ zIndex }}
        data-overlay-id="lyrics-presentation-modal"
        data-overlay-topmost={isTopmost}
        className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center p-6"
      >
        <div className="max-w-md text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mx-auto text-amber-400">
            <Music className="w-6 h-6" />
          </div>
          <h2 id="lyrics-no-service-title" className="text-xl font-bold text-white">No Service Scheduled</h2>
          <p className="text-sm text-white/75">
            {schedule.noServiceReason
              ? `Service is marked as No Service: ${schedule.noServiceReason}`
              : 'This date is marked as No Service. Lyrics presentation is disabled.'}
          </p>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={cleanupSessionAndClose}
            className="px-5 py-2.5 min-h-[44px] rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold text-sm transition-colors cursor-pointer"
          >
            Close Presenter
          </button>
        </div>
      </div>,
      document.body
    );
  }

  // Fail-closed guard when Web Crypto secure session generation is unavailable
  if (sessionError || !sessionId) {
    return createPortal(
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lyrics-session-error-title"
        style={{ zIndex }}
        data-overlay-id="lyrics-presentation-modal"
        data-overlay-topmost={isTopmost}
        className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center p-6"
      >
        <div className="max-w-md text-center space-y-4 rounded-2xl border border-rose-500/40 bg-[#0A0A0A] p-6">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/15 flex items-center justify-center mx-auto text-rose-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 id="lyrics-session-error-title" className="text-xl font-bold text-white">
            Lyrics Output Session Unavailable
          </h2>
          <p className="text-sm text-white/75 leading-relaxed">
            {sessionError || 'Could not initialize a secure Lyrics Output session in this browser context.'}
          </p>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={cleanupSessionAndClose}
            className="px-5 py-2.5 min-h-[44px] rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold text-sm transition-colors cursor-pointer"
          >
            Close Presenter
          </button>
        </div>
      </div>,
      document.body
    );
  }

  const formattedDate = schedule.serviceDate
    ? formatDateDisplayManila(schedule.serviceDate, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : 'Unsaved Draft';

  const statusMeta: Record<
    OutputConnectionStatus,
    { label: string; badgeClass: string; icon: React.ReactNode }
  > = {
    idle: {
      label: 'Output Not Opened',
      badgeClass: 'bg-white/5 text-white/75 border-white/15',
      icon: <MonitorOff className="w-3.5 h-3.5 text-white/60 shrink-0" />
    },
    opening: {
      label: 'Connecting Output...',
      badgeClass: 'bg-[#1b75bc]/20 text-[#54b0e2] border-[#1b75bc]/40',
      icon: <Monitor className="w-3.5 h-3.5 text-[#54b0e2] shrink-0" />
    },
    connected: {
      label: 'Audience Output Live',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      icon: <Monitor className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
    },
    disconnected: {
      label: 'Output Disconnected',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      icon: <MonitorOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
    },
    'popup-blocked': {
      label: 'Pop-up Blocked',
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
    }
  };

  const activeStatus = statusMeta[connectionStatus];
  const previewAlignClass =
    displaySettings.textAlign === 'left' ? 'text-left items-start' : 'text-center items-center';

  const hasNextSlide = Boolean(nextPreview);
  const hasPrevSlide =
    selectedSlideIdx > 0 ||
    songs.slice(0, selectedSongIdx).some((s) => s.doc.slides.length > 0);

  const modalContent = (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lyrics-presenter-title"
      style={{ zIndex }}
      data-overlay-id="lyrics-presentation-modal"
      data-overlay-topmost={isTopmost}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
      className="fixed inset-0 bg-black text-white flex flex-col overflow-hidden overflow-x-hidden"
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      {/* Top Operator Bar */}
      <header className="px-3 sm:px-5 py-3 border-b border-white/10 bg-[#0A0A0A] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setShowMobileSetlist((prev) => !prev)}
            className="lg:hidden inline-flex items-center justify-center p-2 min-h-[44px] min-w-[44px] rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
            aria-label="Toggle service setlist"
            aria-expanded={showMobileSetlist}
            title="Toggle service setlist"
          >
            <ListMusic className="w-4 h-4" />
          </button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="lyrics-presenter-title" className="text-sm sm:text-base font-bold text-white truncate">
                Lyrics Presenter
              </h2>
              <span className="text-xs text-white/70 truncate">
                {schedule.serviceType} · {formattedDate}
              </span>
            </div>
          </div>

          <span
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${activeStatus.badgeClass}`}
          >
            {activeStatus.icon}
            <span>{activeStatus.label}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenAudienceOutput}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-[#1b75bc] hover:bg-[#155d97] text-white text-xs font-bold transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            <span>
              {connectionStatus === 'connected'
                ? 'Focus Output'
                : connectionStatus === 'disconnected'
                ? 'Reopen Output'
                : 'Open Audience Output'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleCopyOutputUrl}
            aria-label="Copy Audience Output URL for another window on this device"
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
            title="Copy Audience Output URL for another browser window on this device and browser profile"
          >
            {copiedUrl ? (
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <Copy className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="hidden sm:inline">{copiedUrl ? 'Copied' : 'Copy Output URL'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMirrorOverlay(true)}
            aria-label="Open in-app Audience Mirror"
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
            title="Open full-screen in-app Audience Mirror (useful for mobile or single-screen setups)"
          >
            <Maximize2 className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline">Audience Mirror</span>
          </button>

          <button
            type="button"
            onClick={() => setIsBlanked((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl border text-xs font-bold transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2] ${
              isBlanked
                ? 'bg-amber-500 text-black border-amber-400 hover:bg-amber-400'
                : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
            }`}
            title="Toggle Blank Screen (shortcut: B). You can pre-cue slides while output is blanked."
          >
            {isBlanked ? <Eye className="w-3.5 h-3.5 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 shrink-0" />}
            <span>{isBlanked ? 'Show Slide' : 'Blank Screen'}</span>
          </button>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={cleanupSessionAndClose}
            aria-label="End Presentation and close presenter"
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-rose-200 text-xs font-bold transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
            title="End presentation session and close presenter"
          >
            <X className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">End Presentation</span>
          </button>
        </div>
      </header>

      {/* Display Formatting & Lines-Per-Slide Controls */}
      <div className="px-3 sm:px-5 py-2.5 border-b border-white/10 bg-[#121212] flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#54b0e2]" />
            <span className="text-white/70 font-semibold">Lines/Slide:</span>
            <select
              aria-label="Lines per slide"
              value={linesPerSlide}
              onChange={(e) => setLinesPerSlide(clampLinesPerSlide(Number(e.target.value)))}
              className="px-2 py-1 min-h-[32px] rounded-lg bg-[#181818] border border-white/15 text-white text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-[#1b75bc]"
            >
              {Array.from(
                { length: MAX_LINES_PER_SLIDE - MIN_LINES_PER_SLIDE + 1 },
                (_, idx) => MIN_LINES_PER_SLIDE + idx
              ).map((val) => (
                <option key={val} value={val}>
                  {val} lines
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-white/70 font-semibold">Text Size:</span>
            <select
              aria-label="Audience text size"
              value={displaySettings.fontScale}
              onChange={(e) =>
                setDisplaySettings((prev) => ({
                  ...prev,
                  fontScale: e.target.value as LyricsFontScale
                }))
              }
              className="px-2 py-1 min-h-[32px] rounded-lg bg-[#181818] border border-white/15 text-white text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-[#1b75bc]"
            >
              <option value="compact">Compact</option>
              <option value="standard">Standard</option>
              <option value="large">Large</option>
              <option value="stage">Stage XL</option>
            </select>
          </div>

          <div className="flex items-center gap-1 bg-[#181818] border border-white/15 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setDisplaySettings((prev) => ({ ...prev, textAlign: 'center' }))}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2] ${
                displaySettings.textAlign === 'center'
                  ? 'bg-[#1b75bc] text-white'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Center
            </button>
            <button
              type="button"
              onClick={() => setDisplaySettings((prev) => ({ ...prev, textAlign: 'left' }))}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2] ${
                displaySettings.textAlign === 'left'
                  ? 'bg-[#1b75bc] text-white'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Left
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-1.5 cursor-pointer text-white/80">
            <input
              type="checkbox"
              checked={displaySettings.showSectionLabel}
              onChange={(e) =>
                setDisplaySettings((prev) => ({ ...prev, showSectionLabel: e.target.checked }))
              }
              className="rounded border-white/30 bg-[#181818] text-[#1b75bc]"
            />
            <span>Show Section Label</span>
          </label>

          <label className="inline-flex items-center gap-1.5 cursor-pointer text-white/80">
            <input
              type="checkbox"
              checked={displaySettings.showProgress}
              onChange={(e) =>
                setDisplaySettings((prev) => ({ ...prev, showProgress: e.target.checked }))
              }
              className="rounded border-white/30 bg-[#181818] text-[#1b75bc]"
            />
            <span>Show Slide Footer</span>
          </label>
        </div>
      </div>

      {/* Warning Banners (Popup Blocked / Unsupported BroadcastChannel / Payload Bounds) */}
      {(connectionStatus === 'popup-blocked' || channelUnsupported || payloadError) && (
        <div
          role="status"
          aria-live="polite"
          className="px-4 py-2 bg-amber-950/80 border-b border-amber-700/60 text-amber-100 text-xs flex flex-wrap items-center justify-between gap-2 shrink-0"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {payloadError
                ? `Slide exceeds output safety limits and was not broadcast: ${payloadError}`
                : channelUnsupported
                ? 'Cross-window BroadcastChannel is unavailable in this browser context. Use the In-App Audience Mirror instead.'
                : 'Your browser blocked the Audience Output pop-up window. Allow pop-ups for this site, copy the Output URL into another browser window on this same device & browser profile, or use Audience Mirror.'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyOutputUrl}
              className="px-3 py-1.5 min-h-[44px] rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 font-semibold cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
            >
              Copy Output URL
            </button>
            <button
              type="button"
              onClick={() => setShowMirrorOverlay(true)}
              className="px-3 py-1.5 min-h-[44px] rounded-lg bg-white/15 hover:bg-white/25 text-white font-semibold cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
            >
              Open Audience Mirror
            </button>
          </div>
        </div>
      )}

      {/* Manual URL Copy Fallback Panel (when Clipboard API is blocked/unavailable) */}
      {manualCopyUrl && (
        <div
          role="region"
          aria-label="Manual Audience Output URL copy"
          className="px-3 sm:px-5 py-2.5 bg-[#121212] border-b border-[#1b75bc]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs shrink-0"
        >
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-white/85 font-medium">
              Automatic clipboard copy is unavailable. Select and copy this URL to open in another browser window on this same device and browser profile:
            </p>
            <input
              ref={manualCopyInputRef}
              type="text"
              readOnly
              value={manualCopyUrl}
              aria-label="Audience Output URL for manual copy"
              onFocus={(e) => e.target.select()}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="w-full px-3 py-2 min-h-[44px] rounded-lg bg-black border border-white/20 text-white font-mono text-xs focus:outline-hidden focus:ring-2 focus:ring-[#1b75bc]"
            />
          </div>
          <button
            type="button"
            onClick={() => setManualCopyUrl(null)}
            className="px-3.5 py-2 min-h-[44px] rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold cursor-pointer shrink-0 self-end sm:self-center focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Operator Workspace */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left Sidebar: Setlist & Section Quick Jump */}
        <aside
          aria-label="Service Setlist and Section Jump"
          className={`${
            showMobileSetlist
              ? 'absolute inset-0 z-30 flex'
              : 'hidden lg:flex'
          } lg:static lg:w-80 xl:w-96 flex-col border-r border-white/10 bg-[#0A0A0A] overflow-y-auto shrink-0`}
        >
          <div className="p-3.5 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-white/75 flex items-center gap-1.5">
              <ListMusic className="w-4 h-4 text-[#54b0e2]" />
              <span>Service Setlist ({songs.length})</span>
            </span>
            {showMobileSetlist && (
              <button
                type="button"
                onClick={() => setShowMobileSetlist(false)}
                className="lg:hidden px-3 py-1.5 min-h-[44px] rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white cursor-pointer"
              >
                Done
              </button>
            )}
          </div>

          {songs.length === 0 ? (
            <div className="p-5 text-xs text-white/60 leading-relaxed">
              No songs have been added to this service schedule yet. Add Praise or Worship songs in the Scheduler first.
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {songs.map((song, idx) => {
                const isActive = idx === selectedSongIdx;
                return (
                  <button
                    key={song.slotId}
                    type="button"
                    onClick={() => handleSelectSong(idx)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2] ${
                      isActive
                        ? 'bg-[#1b75bc]/20 border-[#1b75bc] text-white'
                        : 'bg-[#121212] border-white/10 hover:border-white/25 text-white/85'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/60">
                          <span className="font-mono tabular-nums">
                            {String(song.songNumber).padStart(2, '0')}
                          </span>
                          {song.category === 'praise' ? (
                            <span className="inline-flex items-center gap-1 text-amber-400">
                              <Zap className="w-3 h-3" />
                              Praise
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[#54b0e2]">
                              <Heart className="w-3 h-3" />
                              Worship
                            </span>
                          )}
                          {song.performedKey && (
                            <span className="text-white/75">· Key: {song.performedKey}</span>
                          )}
                        </div>
                        <div className="text-sm font-bold text-white truncate mt-0.5">
                          {song.title}
                        </div>
                      </div>
                      <span className="text-[11px] font-mono tabular-nums px-2 py-0.5 rounded bg-white/10 text-white/80 shrink-0">
                        {song.doc.hasLyrics ? `${song.doc.slideCount} sl` : 'No lyrics'}
                      </span>
                    </div>

                    {(song.isAmbiguous || song.isStaleId || song.isUnmatched) && (
                      <div className="mt-1.5 text-[11px] text-amber-300 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>
                          {song.isAmbiguous
                            ? 'Ambiguous catalog match'
                            : song.isStaleId
                            ? 'Catalog link stale'
                            : 'Not linked in Song Catalog'}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Active Song Section Jump List */}
          {currentSong && currentSong.doc.groups.length > 0 && (
            <div className="p-3.5 border-t border-white/10 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/65 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#54b0e2]" />
                <span>Jump to Section</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {currentSong.doc.groups.map((group) => {
                  const firstSlideIndex = group.slides[0]?.globalIndex ?? 0;
                  const isSectionActive = currentSlide?.group === group.group;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => {
                        setSelectedSlideIdx(firstSlideIndex);
                        setShowMobileSetlist(false);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2] ${
                        isSectionActive
                          ? 'bg-[#1b75bc] border-[#1b75bc] text-white'
                          : 'bg-[#181818] border-white/10 hover:border-white/30 text-white/80'
                      }`}
                    >
                      {group.group}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        {/* Right Workspace: Live Output Preview + Next Slide + Slide Cue Grid */}
        <section className="flex-1 min-w-0 flex flex-col overflow-y-auto p-3 sm:p-5 gap-4 bg-[#000000]">
          {songs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-white/10 rounded-2xl bg-[#0A0A0A]">
              <Music className="w-10 h-10 text-white/35 mb-3" />
              <h3 className="text-lg font-bold text-white">No Songs in Schedule</h3>
              <p className="text-sm text-white/65 max-w-md mt-1">
                Add songs to this schedule before presenting lyrics.
              </p>
            </div>
          ) : (
            <>
              {/* Top Previews Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
                {/* Active Audience Preview (16:9 Stage Card) */}
                <div className="xl:col-span-8 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs text-white/75">
                    <span className="font-bold uppercase tracking-wider flex items-center gap-2">
                      <span>{isBlanked ? 'Cued Preview (Output Blanked)' : 'Live Audience Slide'}</span>
                      {currentSong && (
                        <span className="text-white/55 font-normal normal-case truncate max-w-[220px] sm:max-w-xs">
                          · {currentSong.title}
                        </span>
                      )}
                    </span>
                    {currentSlide && (
                      <span className="font-mono tabular-nums text-white/70">
                        Slide {selectedSlideIdx + 1} / {currentSlides.length}
                      </span>
                    )}
                  </div>

                  <div className="relative w-full aspect-video rounded-2xl border border-white/15 bg-black overflow-hidden flex flex-col justify-center px-6 sm:px-10 py-6">
                    {isBlanked && (
                      <div className="absolute top-3 inset-x-3 z-10 px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-400/50 text-amber-200 text-xs flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">
                          Audience screen is blanked — clicking slides updates your cue only.
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsBlanked(false)}
                          className="px-2.5 py-1 rounded-lg bg-amber-400 text-black font-bold hover:bg-amber-300 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
                        >
                          Show Slide
                        </button>
                      </div>
                    )}

                    {!currentSong?.doc.hasLyrics || !currentSlide ? (
                      <div className="text-center space-y-2 max-w-md mx-auto">
                        <p className="text-base font-bold text-white/90">
                          {currentSong?.isAmbiguous
                            ? 'Ambiguous Song Match'
                            : currentSong?.isStaleId
                            ? 'Song Catalog Link Stale'
                            : currentSong?.isUnmatched
                            ? 'Song Not Linked to Catalog'
                            : 'No Lyrics Entered for This Song'}
                        </p>
                        <p className="text-xs text-white/65 leading-relaxed">
                          Add lyrics in the Song Catalog or from the song slot card in Scheduler, then relaunch or switch songs.
                        </p>
                      </div>
                    ) : (
                      <div
                        className={`w-full flex flex-col justify-center gap-3 ${previewAlignClass} ${
                          isBlanked ? 'opacity-45' : 'opacity-100'
                        }`}
                      >
                        {displaySettings.showSectionLabel && currentSlide.group && (
                          <div className="text-xs font-bold uppercase tracking-wider text-[#54b0e2]">
                            {currentSlide.group}
                          </div>
                        )}
                        <div
                          className={`w-full font-bold text-white leading-snug ${
                            PREVIEW_FONT_SCALE[displaySettings.fontScale]
                          } ${previewAlignClass}`}
                        >
                          {currentSlide.lines.map((line, i) => (
                            <div key={i} className="whitespace-pre-wrap">
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {displaySettings.showProgress && currentSong && currentSlide && (
                      <div className="absolute bottom-3 inset-x-6 flex items-center justify-between text-[11px] text-white/50 font-mono tabular-nums">
                        <span className="truncate max-w-[60%]">{currentSong.title}</span>
                        <span>
                          Song {currentSong.songNumber}/{songs.length} · Slide {selectedSlideIdx + 1}/
                          {currentSlides.length}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Next Slide Preview Card */}
                <div className="xl:col-span-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs text-white/75">
                    <span className="font-bold uppercase tracking-wider">Next Slide Preview</span>
                    {nextPreview && (
                      <span className="text-white/55 truncate max-w-[160px]">
                        {nextPreview.slide.group}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-h-[160px] rounded-2xl border border-white/10 bg-[#0A0A0A] p-5 flex flex-col justify-between gap-3">
                    {nextPreview ? (
                      <>
                        <div className="space-y-2">
                          <div className="text-[11px] font-semibold text-[#54b0e2] flex items-center justify-between gap-2">
                            <span className="truncate">{nextPreview.songTitle}</span>
                            <span>{nextPreview.slide.group}</span>
                          </div>
                          <div className="text-sm sm:text-base font-semibold text-white/90 whitespace-pre-line leading-relaxed">
                            {nextPreview.slide.text}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleNextSlide}
                          className="w-full py-2 min-h-[40px] rounded-xl bg-[#1b75bc]/20 hover:bg-[#1b75bc]/30 border border-[#1b75bc]/40 text-[#54b0e2] text-xs font-bold cursor-pointer transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
                        >
                          Advance to Next Slide
                        </button>
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-center text-xs text-white/55">
                        End of displayable slides in this service lineup.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Grouped Slide Cue Grid for Active Song */}
              {currentSong && currentSong.doc.groups.length > 0 && (
                <div className="space-y-4 pb-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-white/75 flex items-center justify-between">
                    <span>
                      {currentSong.title} — All Slides ({currentSlides.length})
                    </span>
                    <span className="text-[11px] font-normal normal-case text-white/55">
                      Click any slide to cue or project immediately
                    </span>
                  </div>

                  <div className="space-y-4">
                    {currentSong.doc.groups.map((group) => (
                      <div key={group.id} className="space-y-2">
                        <div className="text-xs font-bold text-[#54b0e2]">{group.group}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                          {group.slides.map((slide) => {
                            const isSelected = slide.globalIndex === selectedSlideIdx;
                            return (
                              <button
                                key={slide.id}
                                type="button"
                                onClick={() => setSelectedSlideIdx(slide.globalIndex)}
                                className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer flex flex-col justify-between gap-2 min-h-[104px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2] ${
                                  isSelected
                                    ? 'bg-[#1b75bc]/25 border-[#54b0e2] text-white'
                                    : 'bg-[#121212] border-white/10 hover:border-white/30 text-white/85'
                                }`}
                              >
                                <div className="text-xs sm:text-sm font-medium whitespace-pre-line leading-relaxed">
                                  {slide.text}
                                </div>
                                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-white/55 pt-1 border-t border-white/5">
                                  <span>Slide {slide.globalIndex + 1}</span>
                                  {isSelected && (
                                    <span className="font-sans font-bold text-[#54b0e2]">
                                      {isBlanked ? 'Cued' : 'Live'}
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Bottom Transport Controls */}
      <footer className="px-3 sm:px-5 py-3 border-t border-white/10 bg-[#0A0A0A] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevSong}
            disabled={selectedSongIdx <= 0}
            aria-label="Previous song"
            className="inline-flex items-center gap-1 px-3 py-2 min-h-[44px] rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-35 disabled:cursor-not-allowed text-white text-xs font-semibold cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Prev Song</span>
          </button>

          <button
            type="button"
            onClick={handlePrevSlide}
            disabled={!hasPrevSlide}
            aria-label="Previous slide"
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-xl bg-white/15 hover:bg-white/25 disabled:opacity-35 disabled:cursor-not-allowed text-white text-xs font-bold cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev Slide</span>
          </button>
        </div>

        <div className="text-[11px] text-white/65 hidden md:flex items-center gap-2 font-mono tabular-nums">
          <span>
            Song {songs.length > 0 ? selectedSongIdx + 1 : 0}/{songs.length}
          </span>
          <span>·</span>
          <span>
            Slide {currentSlides.length > 0 ? selectedSlideIdx + 1 : 0}/{currentSlides.length}
          </span>
          <span>·</span>
          <span className="font-sans">
            Keys: ← / → or Space (Slide), B (Blank), Esc (Close)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleNextSlide}
            disabled={!hasNextSlide}
            aria-label="Next slide"
            className="inline-flex items-center gap-1.5 px-5 py-2 min-h-[44px] rounded-xl bg-[#1b75bc] hover:bg-[#155d97] disabled:opacity-35 disabled:cursor-not-allowed text-white text-xs font-bold cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
          >
            <span>Next Slide</span>
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleNextSong}
            disabled={selectedSongIdx >= songs.length - 1}
            aria-label="Next song"
            className="inline-flex items-center gap-1 px-3 py-2 min-h-[44px] rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-35 disabled:cursor-not-allowed text-white text-xs font-semibold cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
          >
            <span className="hidden sm:inline">Next Song</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </footer>

      {/* In-App Full-Screen Audience Mirror Overlay */}
      {showMirrorOverlay && (
        <div
          ref={mirrorDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="lyrics-mirror-title"
          className="fixed inset-0 z-50 bg-black text-white flex flex-col justify-between p-6 sm:p-10"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span id="lyrics-mirror-title" className="text-xs font-semibold text-white/70">
              In-App Audience Mirror {isBlanked ? '(Blanked)' : ''}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePrevSlide}
                disabled={!hasPrevSlide}
                className="px-3.5 py-2 min-h-[44px] rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-35 text-xs font-semibold cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={handleNextSlide}
                disabled={!hasNextSlide}
                className="px-3.5 py-2 min-h-[44px] rounded-lg bg-[#1b75bc] hover:bg-[#155d97] disabled:opacity-35 text-xs font-bold cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
              >
                Next
              </button>
              <button
                type="button"
                onClick={() => setIsBlanked((prev) => !prev)}
                className="px-3.5 py-2 min-h-[44px] rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
              >
                {isBlanked ? 'Show Slide' : 'Blank'}
              </button>
              <button
                ref={mirrorExitButtonRef}
                type="button"
                onClick={() => setShowMirrorOverlay(false)}
                className="px-3.5 py-2 min-h-[44px] rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#54b0e2]"
              >
                Exit Mirror
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center px-[5vw]">
            {isBlanked ? (
              <div aria-label="Mirror screen blanked" className="w-full h-full" />
            ) : currentSlide ? (
              <div className={`w-full max-w-[90vw] flex flex-col justify-center gap-6 ${previewAlignClass}`}>
                {displaySettings.showSectionLabel && currentSlide.group && (
                  <div className="text-sm sm:text-base font-semibold uppercase tracking-wider text-[#54b0e2]">
                    {currentSlide.group}
                  </div>
                )}
                <div
                  className={`w-full font-bold text-white leading-[1.35] ${
                    MIRROR_FONT_SCALE[displaySettings.fontScale]
                  } ${previewAlignClass}`}
                >
                  {currentSlide.lines.map((line, i) => (
                    <div key={i} className="whitespace-pre-wrap [text-wrap:balance]">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-white/70">No slide selected.</p>
            )}
          </div>

          {!isBlanked && displaySettings.showProgress && currentSong && currentSlide && (
            <div className="flex items-center justify-between text-xs text-white/65 font-mono tabular-nums">
              <span className="truncate max-w-[65vw]">{currentSong.title}</span>
              <span>
                Song {currentSong.songNumber}/{songs.length} · Slide {selectedSlideIdx + 1}/
                {currentSlides.length}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
