import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Maximize2, Minimize2, Monitor, AlertTriangle } from 'lucide-react';
import {
  DEFAULT_LYRICS_DISPLAY_SETTINGS,
  LyricsDisplaySettings,
  LyricsFontScale,
  LyricsOutputSlidePayload,
  openLyricsBroadcastChannel,
  sanitizeLyricsChannelMessage
} from '../utils/lyricsPresentationChannel';

interface LyricsAudienceOutputProps {
  sessionId: string;
}

type AudienceWindowState = 'waiting' | 'active' | 'blanked' | 'closed';

const FONT_SCALE_CLASS: Record<LyricsFontScale, string> = {
  compact: 'text-[clamp(1.35rem,3vw,2.5rem)]',
  standard: 'text-[clamp(1.75rem,4vw,3.35rem)]',
  large: 'text-[clamp(2.15rem,5vw,4.25rem)]',
  stage: 'text-[clamp(2.6rem,6vw,5.25rem)]'
};

export const LyricsAudienceOutput: React.FC<LyricsAudienceOutputProps> = ({ sessionId }) => {
  const [windowState, setWindowState] = useState<AudienceWindowState>('waiting');
  const [slidePayload, setSlidePayload] = useState<LyricsOutputSlidePayload | null>(null);
  const [displaySettings, setDisplaySettings] = useState<LyricsDisplaySettings>(
    DEFAULT_LYRICS_DISPLAY_SETTINGS
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [showToolbar, setShowToolbar] = useState(true);
  const [channelUnsupported, setChannelUnsupported] = useState(false);

  const channelRef = useRef<BroadcastChannel | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  const resetToolbarTimer = useCallback(() => {
    setShowToolbar(true);
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      setShowToolbar(false);
    }, 3500);
  }, []);

  useEffect(() => {
    document.title = 'WWCF Stage Lyrics Output';
    resetToolbarTimer();
    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, [resetToolbarTimer]);

  const handleToggleFullscreen = useCallback(async () => {
    setFullscreenError(null);
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      setFullscreenError(
        'Browser blocked automatic fullscreen. Drag this window onto your projector screen and press F11 (or Ctrl+Cmd+F on Mac).'
      );
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleToggleFullscreen();
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [handleToggleFullscreen]);

  useEffect(() => {
    const channel = openLyricsBroadcastChannel(sessionId);
    if (!channel) {
      setChannelUnsupported(true);
      return;
    }

    channelRef.current = channel;

    const sendHello = () => {
      try {
        channel.postMessage({
          type: 'hello',
          sessionId,
          sentAt: Date.now()
        });
      } catch {
        // Ignore transient channel post errors
      }
    };

    channel.onmessage = (event) => {
      const msg = sanitizeLyricsChannelMessage(event.data, sessionId);
      if (!msg) return;

      if (msg.type === 'slide_update') {
        setDisplaySettings(msg.displaySettings);
        setSlidePayload(msg.payload);
        setWindowState('active');
        try {
          channel.postMessage({
            type: 'ready',
            sessionId,
            sentAt: Date.now()
          });
        } catch {
          // Ignore ack errors
        }
      } else if (msg.type === 'clear') {
        setDisplaySettings(msg.displaySettings);
        setWindowState('blanked');
        try {
          channel.postMessage({
            type: 'ready',
            sessionId,
            sentAt: Date.now()
          });
        } catch {
          // Ignore ack errors
        }
      } else if (msg.type === 'close') {
        setWindowState('closed');
      }
    };

    sendHello();
    const heartbeatId = window.setInterval(sendHello, 2500);

    const notifyWindowClosing = () => {
      try {
        channel.postMessage({
          type: 'close',
          sessionId,
          sentAt: Date.now()
        });
      } catch {
        // Ignore closing post errors
      }
    };

    window.addEventListener('pagehide', notifyWindowClosing);
    window.addEventListener('beforeunload', notifyWindowClosing);

    return () => {
      window.clearInterval(heartbeatId);
      window.removeEventListener('pagehide', notifyWindowClosing);
      window.removeEventListener('beforeunload', notifyWindowClosing);
      notifyWindowClosing();
      channel.close();
      channelRef.current = null;
    };
  }, [sessionId]);

  const fontSizeClass = FONT_SCALE_CLASS[displaySettings.fontScale] || FONT_SCALE_CLASS.large;
  const alignClass =
    displaySettings.textAlign === 'left' ? 'text-left items-start' : 'text-center items-center';

  const liveStatusText = channelUnsupported
    ? 'BroadcastChannel is unavailable in this browser context.'
    : windowState === 'blanked'
    ? 'Screen blanked by operator.'
    : windowState === 'closed'
    ? 'Lyrics presentation ended.'
    : windowState === 'active' && slidePayload
    ? `${slidePayload.songTitle}${slidePayload.sectionLabel ? `, ${slidePayload.sectionLabel}` : ''}, Slide ${slidePayload.slideNumber} of ${slidePayload.totalSlidesInSong}`
    : 'Ready for projection. Waiting for operator console.';

  return (
    <div
      onMouseMove={resetToolbarTimer}
      onTouchStart={resetToolbarTimer}
      className="fixed inset-0 bg-black text-white flex flex-col justify-between overflow-hidden overflow-x-hidden select-none"
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveStatusText}
      </div>

      {/* Subtle Auto-Hiding Operator Hint & Fullscreen Bar */}
      <div
        className={`fixed top-0 inset-x-0 z-20 p-4 flex flex-wrap items-center justify-between gap-3 transition-opacity duration-200 ${
          showToolbar || windowState !== 'active' ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="px-3 py-2 rounded-lg bg-black/80 border border-white/15 text-xs text-white/85 flex items-center gap-2">
          <Monitor className="w-3.5 h-3.5 text-[#54b0e2] shrink-0" />
          <span>
            {windowState === 'active'
              ? 'Drag this window to your second screen or projector, then press Fullscreen (F).'
              : windowState === 'blanked'
              ? 'Display blanked by operator.'
              : windowState === 'closed'
              ? 'Presentation session ended.'
              : 'Waiting for operator console on this device & browser profile...'}
          </span>
        </div>

        <button
          type="button"
          onClick={handleToggleFullscreen}
          className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-lg bg-[#1b75bc] hover:bg-[#165d97] text-white text-xs font-bold transition-colors cursor-pointer"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          <span>{isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}</span>
        </button>
      </div>

      {fullscreenError && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 left-4 right-4 z-30 mx-auto max-w-xl p-3 rounded-xl bg-amber-950/90 border border-amber-700 text-amber-100 text-xs flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>{fullscreenError}</span>
        </div>
      )}

      {/* Main Stage Surface */}
      <main className="flex-1 w-full h-full flex items-center justify-center px-[7vw] py-[8vh]">
        {channelUnsupported ? (
          <div className="max-w-lg text-center space-y-2">
            <p className="text-lg font-bold text-white">BroadcastChannel Unavailable</p>
            <p className="text-sm text-white/75">
              This browser context does not support cross-window BroadcastChannel sync. Use the In-App Audience Mirror inside the operator console.
            </p>
          </div>
        ) : windowState === 'blanked' ? (
          <div aria-label="Screen blanked" className="w-full h-full" />
        ) : windowState === 'closed' ? (
          <div className="max-w-lg text-center space-y-2">
            <p className="text-xl font-bold text-white/90">Presentation Ended</p>
            <p className="text-sm text-white/70">
              The operator has ended this lyrics presentation session. You may close this window.
            </p>
          </div>
        ) : windowState === 'waiting' || !slidePayload ? (
          <div className="max-w-xl text-center space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-[#54b0e2]">
              WWCF Santa Cruz • Audience Lyrics Display
            </p>
            <p className="text-2xl font-bold text-white">Ready for Projection</p>
            <p className="text-sm text-white/75 leading-relaxed">
              Move this window onto your projector or second display and press Fullscreen. Keep this window open in the same browser profile on this device to receive slides automatically.
            </p>
          </div>
        ) : (
          <div className={`w-full max-w-[90vw] flex flex-col justify-center gap-6 ${alignClass}`}>
            {displaySettings.showSectionLabel && slidePayload.sectionLabel && (
              <div className="text-sm sm:text-base font-semibold tracking-wider uppercase text-[#54b0e2]">
                {slidePayload.sectionLabel}
              </div>
            )}

            <div className={`w-full font-bold text-white leading-[1.35] tracking-tight ${fontSizeClass} ${alignClass}`}>
              {slidePayload.lines.map((line, idx) => (
                <div key={idx} className="whitespace-pre-wrap [text-wrap:balance]">
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Optional Progress & Song Title Footer */}
      {windowState === 'active' && slidePayload && displaySettings.showProgress && (
        <footer className="px-[5vw] pb-5 flex items-center justify-between text-xs sm:text-sm text-white/65 font-medium tabular-nums">
          <span className="truncate max-w-[65vw]">{slidePayload.songTitle}</span>
          <span>
            Song {slidePayload.songNumber}/{slidePayload.totalSongs} · Slide {slidePayload.slideNumber}/{slidePayload.totalSlidesInSong}
          </span>
        </footer>
      )}
    </div>
  );
};
