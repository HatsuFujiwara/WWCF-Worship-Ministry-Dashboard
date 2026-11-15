import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ChartInstrumentType, InstrumentChartVariant } from '../types';
import {
  CHART_INSTRUMENT_LABELS,
  clampCapo,
  computeGuitarShapeKey,
  computeKeyOffsetSemitones,
  isCapoSupportedInstrument,
  isChordOnlyLine,
  isPitchedChartInstrument,
  parseChartSections,
  parseKeySignature,
  transformChartText,
  transposeKeyName
} from '../utils/chordChartUtils';
import {
  Minus,
  Plus,
  RotateCcw,
  Hash,
  Guitar,
  Music2,
  Copy,
  Check,
  Play,
  Pause,
  Square,
  ArrowUpToLine,
  X
} from 'lucide-react';

export type ChartFontSize = 'sm' | 'md' | 'lg' | 'xl';
export type ChartAutoScrollSpeed = '0.5x' | '1x' | '1.5x' | '2x';
type AutoScrollState = 'stopped' | 'playing' | 'paused';

const AUTO_SCROLL_SPEED_STORAGE_KEY = 'wwcf_chart_autoscroll_speed_v1';

const AUTO_SCROLL_SPEED_OPTIONS: Array<{ key: ChartAutoScrollSpeed; label: string; pxPerSec: number }> = [
  { key: '0.5x', label: '0.5x', pxPerSec: 14 },
  { key: '1x', label: '1x', pxPerSec: 26 },
  { key: '1.5x', label: '1.5x', pxPerSec: 42 },
  { key: '2x', label: '2x', pxPerSec: 64 }
];

interface ChordChartViewerProps {
  songTitle?: string;
  charts: InstrumentChartVariant[];
  baseKey?: string;
  targetPerformedKey?: string;
  hasExplicitPerformedKeyContext?: boolean;
  initialCapo?: number;
  preferredInstrument?: ChartInstrumentType;
  onPreferredInstrumentChange?: (instrument: ChartInstrumentType) => void;
  variantMode?: 'standard' | 'stage';
  maxHeightClass?: string;
}

const FONT_SIZE_CLASSES: Record<ChartFontSize, string> = {
  sm: 'text-xs leading-relaxed',
  md: 'text-sm leading-relaxed',
  lg: 'text-base leading-relaxed',
  xl: 'text-lg leading-relaxed'
};

function resolvePreferredChartIndex(
  usableCharts: InstrumentChartVariant[],
  preferredInstrument?: ChartInstrumentType,
  currentIndex?: number
): number {
  if (usableCharts.length === 0) return 0;
  if (preferredInstrument) {
    // Keep current variant if it already matches preferred instrument (e.g. multiple guitar variants)
    if (
      typeof currentIndex === 'number' &&
      currentIndex >= 0 &&
      currentIndex < usableCharts.length &&
      usableCharts[currentIndex].instrument === preferredInstrument
    ) {
      return currentIndex;
    }
    const exactIdx = usableCharts.findIndex((c) => c.instrument === preferredInstrument);
    if (exactIdx >= 0) return exactIdx;
    const allIdx = usableCharts.findIndex((c) => c.instrument === 'all');
    if (allIdx >= 0) return allIdx;
    return 0;
  }
  if (typeof currentIndex === 'number' && currentIndex >= 0 && currentIndex < usableCharts.length) {
    return currentIndex;
  }
  return 0;
}

function isReducedMotionOrPerfActive(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  return (
    document.documentElement.classList.contains('reduced-motion') ||
    document.documentElement.classList.contains('performance-mode') ||
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );
}

export const ChordChartViewer: React.FC<ChordChartViewerProps> = ({
  songTitle,
  charts,
  baseKey,
  targetPerformedKey,
  hasExplicitPerformedKeyContext = false,
  initialCapo = 0,
  preferredInstrument,
  onPreferredInstrumentChange,
  variantMode = 'standard',
  maxHeightClass = 'max-h-[55vh]'
}) => {
  const isStage = variantMode === 'stage';

  // Filter to usable non-empty charts so empty drafts never shadow a valid 'all' or fallback variant
  const usableCharts = useMemo(
    () => (charts || []).filter((c) => c && typeof c.content === 'string' && c.content.trim().length > 0),
    [charts]
  );

  const [selectedIndex, setSelectedIndex] = useState<number>(() =>
    resolvePreferredChartIndex(usableCharts, preferredInstrument)
  );

  useEffect(() => {
    setSelectedIndex((prev) => resolvePreferredChartIndex(usableCharts, preferredInstrument, prev));
  }, [usableCharts, preferredInstrument]);

  const activeChart = usableCharts[selectedIndex] || usableCharts[0];
  const chartBaseKey = activeChart?.key?.trim() || baseKey?.trim() || '';
  const pitched = isPitchedChartInstrument(activeChart?.instrument);
  const capoSupported = pitched && isCapoSupportedInstrument(activeChart?.instrument);

  const autoAlignedSemitones = useMemo(() => {
    if (!pitched || !targetPerformedKey || !chartBaseKey) return 0;
    return computeKeyOffsetSemitones(chartBaseKey, targetPerformedKey);
  }, [pitched, targetPerformedKey, chartBaseKey]);

  const [semitones, setSemitones] = useState<number>(autoAlignedSemitones);
  const [capo, setCapo] = useState<number>(() =>
    capoSupported ? clampCapo(activeChart?.capo ?? initialCapo) : 0
  );
  const [nashvilleMode, setNashvilleMode] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<ChartFontSize>('md');
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [copiedState, setCopiedState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [manualCopyText, setManualCopyText] = useState<string | null>(null);

  // Auto-Scroll State (Phase 2)
  const [autoScrollState, setAutoScrollState] = useState<AutoScrollState>('stopped');
  const [autoScrollSpeed, setAutoScrollSpeed] = useState<ChartAutoScrollSpeed>(() => {
    try {
      const saved = localStorage.getItem(AUTO_SCROLL_SPEED_STORAGE_KEY);
      if (saved === '0.5x' || saved === '1x' || saved === '1.5x' || saved === '2x') {
        return saved;
      }
    } catch {}
    return '1x';
  });
  const [isChartScrollable, setIsChartScrollable] = useState<boolean>(false);

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const manualCopyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticScrollUntilRef = useRef<number>(0);
  const fractionalPxRef = useRef<number>(0);

  // Cleanup copy feedback timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  // Re-align transpose, capo, scroll position, and stop auto-scroll when switching songs or charts
  useEffect(() => {
    setSemitones(autoAlignedSemitones);
    setCapo(capoSupported ? clampCapo(activeChart?.capo ?? initialCapo) : 0);
    setActiveSectionId(null);
    setAutoScrollState('stopped');
    setManualCopyText(null);
    setCopiedState('idle');
    fractionalPxRef.current = 0;
    if (scrollContainerRef.current) {
      programmaticScrollUntilRef.current = Date.now() + 80;
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeChart?.id, activeChart?.capo, autoAlignedSemitones, capoSupported, initialCapo, songTitle]);

  const soundedKey = useMemo(() => {
    if (!pitched) return '';
    if (!chartBaseKey) return targetPerformedKey?.trim() || '';
    return transposeKeyName(chartBaseKey, semitones);
  }, [pitched, chartBaseKey, targetPerformedKey, semitones]);

  const shapeKey = useMemo(() => {
    if (!capoSupported || capo <= 0 || !soundedKey) return '';
    return computeGuitarShapeKey(soundedKey, capo);
  }, [capoSupported, capo, soundedKey]);

  const effectiveKeyForNashville = soundedKey || targetPerformedKey?.trim() || chartBaseKey;
  const canUseNashville = pitched && Boolean(parseKeySignature(effectiveKeyForNashville));

  useEffect(() => {
    if (!canUseNashville && nashvilleMode) {
      setNashvilleMode(false);
    }
  }, [canUseNashville, nashvilleMode]);

  const transformedContent = useMemo(() => {
    if (!activeChart) return '';
    return transformChartText(activeChart.content, {
      semitones,
      capo: capoSupported ? capo : 0,
      nashvilleMode: canUseNashville && nashvilleMode,
      keyContext: chartBaseKey || targetPerformedKey || '',
      instrument: activeChart.instrument
    });
  }, [
    activeChart,
    semitones,
    capoSupported,
    capo,
    canUseNashville,
    nashvilleMode,
    chartBaseKey,
    targetPerformedKey
  ]);

  const sections = useMemo(() => parseChartSections(transformedContent), [transformedContent]);

  // Measure whether chart container overflows vertically (needs auto-scroll)
  const updateScrollableState = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) {
      setIsChartScrollable(false);
      return;
    }
    const scrollable = el.scrollHeight - el.clientHeight > 6;
    setIsChartScrollable(scrollable);
    if (!scrollable && autoScrollState !== 'stopped') {
      setAutoScrollState('stopped');
    }
  }, [autoScrollState]);

  useEffect(() => {
    const raf = requestAnimationFrame(updateScrollableState);
    const el = scrollContainerRef.current;
    let observer: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateScrollableState);
      observer.observe(el);
    }
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [transformedContent, fontSize, activeChart?.id, updateScrollableState]);

  // Auto-Scroll loop: rAF with sub-pixel accumulation, or gentle stepped ticks under reduced-motion/performance-mode
  useEffect(() => {
    if (autoScrollState !== 'playing') return;
    const el = scrollContainerRef.current;
    if (!el) {
      setAutoScrollState('stopped');
      return;
    }

    const speedSpec =
      AUTO_SCROLL_SPEED_OPTIONS.find((opt) => opt.key === autoScrollSpeed) || AUTO_SCROLL_SPEED_OPTIONS[1];
    const pxPerSec = speedSpec.pxPerSec;

    if (isReducedMotionOrPerfActive()) {
      const stepPx = Math.max(6, Math.round(pxPerSec * 0.5));
      const intervalId = setInterval(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const maxTop = container.scrollHeight - container.clientHeight;
        if (maxTop <= 2 || container.scrollTop >= maxTop - 2) {
          setAutoScrollState('stopped');
          return;
        }
        programmaticScrollUntilRef.current = Date.now() + 120;
        container.scrollTop = Math.min(maxTop, container.scrollTop + stepPx);
        if (container.scrollTop >= maxTop - 2) {
          setAutoScrollState('stopped');
        }
      }, 500);
      return () => clearInterval(intervalId);
    }

    let rafId = 0;
    let lastTimestamp: number | null = null;

    const tick = (now: number) => {
      const container = scrollContainerRef.current;
      if (!container) {
        setAutoScrollState('stopped');
        return;
      }

      if (lastTimestamp !== null) {
        const dtSec = Math.min(0.1, Math.max(0, (now - lastTimestamp) / 1000));
        const maxTop = container.scrollHeight - container.clientHeight;
        if (maxTop <= 2 || container.scrollTop >= maxTop - 2) {
          setAutoScrollState('stopped');
          return;
        }

        fractionalPxRef.current += pxPerSec * dtSec;
        const wholePx = Math.floor(fractionalPxRef.current);
        if (wholePx >= 1) {
          fractionalPxRef.current -= wholePx;
          programmaticScrollUntilRef.current = Date.now() + 120;
          container.scrollTop = Math.min(maxTop, container.scrollTop + wholePx);
          if (container.scrollTop >= maxTop - 2) {
            setAutoScrollState('stopped');
            return;
          }
        }
      }
      lastTimestamp = now;
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [autoScrollState, autoScrollSpeed]);

  // Pause auto-scroll automatically when musician manually scrolls or interacts with the chart viewport
  const pauseOnManualInteraction = useCallback(() => {
    if (autoScrollState === 'playing') {
      setAutoScrollState('paused');
    }
  }, [autoScrollState]);

  const handleContainerScroll = useCallback(() => {
    if (autoScrollState === 'playing' && Date.now() > programmaticScrollUntilRef.current) {
      setAutoScrollState('paused');
    }
  }, [autoScrollState]);

  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'PageUp' ||
        e.key === 'PageDown' ||
        e.key === 'Home' ||
        e.key === 'End'
      ) {
        pauseOnManualInteraction();
      }
    },
    [pauseOnManualInteraction]
  );

  const handleStartOrResumeAutoScroll = () => {
    const el = scrollContainerRef.current;
    if (!el || !isChartScrollable) return;
    const maxTop = el.scrollHeight - el.clientHeight;
    if (el.scrollTop >= maxTop - 2) {
      programmaticScrollUntilRef.current = Date.now() + 120;
      el.scrollTop = 0;
    }
    fractionalPxRef.current = 0;
    setAutoScrollState('playing');
  };

  const handlePauseAutoScroll = () => {
    setAutoScrollState('paused');
  };

  const handleStopAutoScroll = () => {
    fractionalPxRef.current = 0;
    setAutoScrollState('stopped');
  };

  const handleScrollToTop = () => {
    fractionalPxRef.current = 0;
    setAutoScrollState('stopped');
    const el = scrollContainerRef.current;
    if (el) {
      programmaticScrollUntilRef.current = Date.now() + 400;
      el.scrollTo({
        top: 0,
        behavior: isReducedMotionOrPerfActive() ? 'auto' : 'smooth'
      });
    }
    setActiveSectionId(null);
  };

  const handleChangeAutoScrollSpeed = (nextSpeed: ChartAutoScrollSpeed) => {
    setAutoScrollSpeed(nextSpeed);
    try {
      localStorage.setItem(AUTO_SCROLL_SPEED_STORAGE_KEY, nextSpeed);
    } catch {}
  };

  const handleJumpToSection = (sectionId: string) => {
    setActiveSectionId(sectionId);
    // Jumping manually to a section pauses auto-scroll cleanly
    setAutoScrollState((prev) => (prev === 'playing' ? 'paused' : prev));
    const el = sectionRefs.current[sectionId];
    if (el) {
      programmaticScrollUntilRef.current = Date.now() + 500;
      el.scrollIntoView({ behavior: isReducedMotionOrPerfActive() ? 'auto' : 'smooth', block: 'start' });
    }
  };

  const handleCopyChart = async () => {
    if (!activeChart || !transformedContent) return;
    const headerParts = [
      songTitle ? songTitle : undefined,
      `${CHART_INSTRUMENT_LABELS[activeChart.instrument]}${activeChart.label ? ` (${activeChart.label})` : ''}`,
      soundedKey ? `Key: ${soundedKey}${nashvilleMode ? ' (Nashville)' : ''}` : undefined,
      capoSupported && capo > 0 ? `Capo ${capo}${shapeKey ? ` (Play ${shapeKey} shapes)` : ''}` : undefined,
      activeChart.tuning ? `Tuning: ${activeChart.tuning}` : undefined
    ].filter(Boolean);

    const payload = `${headerParts.join(' · ')}\n${activeChart.notes ? `Notes: ${activeChart.notes}\n` : ''}\n${transformedContent}`;

    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }

    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setCopiedState('failed');
      setManualCopyText(payload);
      requestAnimationFrame(() => manualCopyTextareaRef.current?.select());
      return;
    }

    try {
      await navigator.clipboard.writeText(payload);
      setManualCopyText(null);
      setCopiedState('copied');
      copyTimerRef.current = setTimeout(() => setCopiedState('idle'), 2000);
    } catch {
      setCopiedState('failed');
      setManualCopyText(payload);
      requestAnimationFrame(() => manualCopyTextareaRef.current?.select());
    }
  };

  if (usableCharts.length === 0 || !activeChart) {
    return (
      <div
        className={`p-5 rounded-xl border text-center text-xs ${
          isStage
            ? 'bg-white/5 border-white/10 text-white/60'
            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
        }`}
      >
        No instrument chord or cue charts are attached to this song yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Instrument Variant Switcher */}
      {usableCharts.length > 0 && (
        <div
          className={`flex flex-wrap items-center gap-1.5 pb-2 border-b ${
            isStage ? 'border-white/10' : 'border-slate-200 dark:border-slate-800'
          }`}
          role="tablist"
          aria-label="Instrument chart variants"
        >
          {usableCharts.map((variant, idx) => {
            const isActive = idx === selectedIndex;
            const labelText = variant.label?.trim()
              ? `${CHART_INSTRUMENT_LABELS[variant.instrument]} (${variant.label.trim()})`
              : CHART_INSTRUMENT_LABELS[variant.instrument];

            return (
              <button
                key={variant.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setSelectedIndex(idx);
                  onPreferredInstrumentChange?.(variant.instrument);
                }}
                className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b75bc] ${
                  isActive
                    ? 'bg-[#1b75bc] text-white border-[#1b75bc]'
                    : isStage
                    ? 'bg-white/5 text-white/75 border-white/10 hover:bg-white/15 hover:text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {labelText}
              </button>
            );
          })}
        </div>
      )}

      {/* Musician Control Bar: Transpose / Capo / Nashville + Auto-Scroll + Text Scale / Copy */}
      <div
        className={`p-3 rounded-xl border space-y-2.5 ${
          isStage
            ? 'bg-white/5 border-white/10 text-white'
            : 'bg-slate-50 dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Transpose Controls */}
            {pitched ? (
              <div className="flex items-center gap-1.5">
                <span className={`text-[11px] font-semibold ${isStage ? 'text-white/60' : 'text-slate-500 dark:text-slate-400'}`}>
                  Transpose:
                </span>
                <div
                  className={`inline-flex items-center rounded-lg border ${
                    isStage
                      ? 'border-white/15 bg-black/50'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSemitones((s) => Math.max(-11, s - 1))}
                    aria-label="Transpose down one semitone"
                    className={`p-1.5 min-w-[34px] min-h-[34px] flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b75bc] rounded-l-lg ${
                      isStage ? 'hover:bg-white/10 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 text-xs font-bold tabular-nums min-w-[54px] text-center text-[#1b75bc] dark:text-[#54b0e2] whitespace-nowrap">
                    {soundedKey || (semitones === 0 ? 'Orig' : `${semitones > 0 ? '+' : ''}${semitones}`)}
                    {soundedKey && semitones !== 0 ? ` (${semitones > 0 ? '+' : ''}${semitones})` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSemitones((s) => Math.min(11, s + 1))}
                    aria-label="Transpose up one semitone"
                    className={`p-1.5 min-w-[34px] min-h-[34px] flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b75bc] rounded-r-lg ${
                      isStage ? 'hover:bg-white/10 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                {semitones !== autoAlignedSemitones && (
                  <button
                    type="button"
                    onClick={() => setSemitones(autoAlignedSemitones)}
                    title="Reset transpose to default key"
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] rounded-md text-[11px] font-medium cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b75bc] ${
                      isStage
                        ? 'bg-white/10 hover:bg-white/20 text-white/80'
                        : 'bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            ) : (
              <span className={`text-xs font-medium ${isStage ? 'text-white/70' : 'text-slate-600 dark:text-slate-300'}`}>
                Drums / Rhythm Map (non-pitched — cues remain unchanged)
              </span>
            )}

            {/* Capo Stepper */}
            {capoSupported && (
              <div className="flex items-center gap-1.5">
                <Guitar className={`w-3.5 h-3.5 ${isStage ? 'text-[#54b0e2]' : 'text-[#1b75bc] dark:text-[#54b0e2]'}`} />
                <span className={`text-[11px] font-semibold ${isStage ? 'text-white/60' : 'text-slate-500 dark:text-slate-400'}`}>
                  Capo:
                </span>
                <div
                  className={`inline-flex items-center rounded-lg border ${
                    isStage
                      ? 'border-white/15 bg-black/50'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setCapo((c) => Math.max(0, c - 1))}
                    disabled={capo === 0}
                    aria-label="Decrease capo fret"
                    className="p-1.5 min-w-[32px] min-h-[34px] flex items-center justify-center cursor-pointer disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b75bc] rounded-l-lg"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="px-2 text-xs font-bold tabular-nums min-w-[32px] text-center">
                    {capo}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCapo((c) => Math.min(12, c + 1))}
                    disabled={capo >= 12}
                    aria-label="Increase capo fret"
                    className="p-1.5 min-w-[32px] min-h-[34px] flex items-center justify-center cursor-pointer disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b75bc] rounded-r-lg"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                {shapeKey && (
                  <span className="text-[11px] font-semibold text-[#1b75bc] dark:text-[#54b0e2] whitespace-nowrap">
                    Play {shapeKey} shapes
                  </span>
                )}
              </div>
            )}

            {/* Nashville Mode Toggle */}
            {pitched && (
              <button
                type="button"
                disabled={!canUseNashville}
                aria-pressed={nashvilleMode}
                onClick={() => setNashvilleMode((v) => !v)}
                title={
                  canUseNashville
                    ? 'Toggle Nashville Number System (1-4-5) chart notation'
                    : 'Set an original, chart, or performed key to enable Nashville numbers'
                }
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b75bc] ${
                  nashvilleMode
                    ? 'bg-[#1b75bc] text-white border-[#1b75bc]'
                    : isStage
                    ? 'bg-white/5 text-white/80 border-white/15 hover:bg-white/15'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Hash className="w-3.5 h-3.5" />
                <span>Nashville</span>
              </button>
            )}
          </div>

          {/* Font Scale & Copy Chart Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1" role="group" aria-label="Chart text size">
              {(['sm', 'md', 'lg', 'xl'] as ChartFontSize[]).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  aria-pressed={fontSize === sz}
                  onClick={() => setFontSize(sz)}
                  className={`px-2 py-1 min-w-[32px] min-h-[34px] rounded-md text-[11px] font-bold uppercase cursor-pointer border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b75bc] ${
                    fontSize === sz
                      ? 'bg-[#1b75bc] text-white border-[#1b75bc]'
                      : isStage
                      ? 'bg-white/5 text-white/70 border-white/10 hover:bg-white/15'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleCopyChart}
              title="Copy formatted transposed chart to clipboard"
              className={`inline-flex items-center gap-1 px-2.5 py-1 min-h-[34px] rounded-md text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b75bc] ${
                copiedState === 'copied'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : copiedState === 'failed'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : isStage
                  ? 'bg-white/5 text-white/80 border-white/15 hover:bg-white/15'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {copiedState === 'copied' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>
                {copiedState === 'copied'
                  ? 'Copied'
                  : copiedState === 'failed'
                  ? 'Manual Copy Open'
                  : 'Copy Chart'}
              </span>
            </button>
          </div>
        </div>

        {/* Auto-Scroll Row (Phase 2) */}
        <div
          className={`pt-2 border-t flex flex-wrap items-center justify-between gap-2 ${
            isStage ? 'border-white/10' : 'border-slate-200/80 dark:border-slate-800'
          }`}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[11px] font-semibold mr-0.5 ${isStage ? 'text-white/60' : 'text-slate-500 dark:text-slate-400'}`}>
              Auto-Scroll:
            </span>

            {autoScrollState === 'playing' ? (
              <button
                type="button"
                onClick={handlePauseAutoScroll}
                className="inline-flex items-center gap-1 px-2.5 py-1 min-h-[32px] rounded-md text-[11px] font-semibold bg-amber-500 hover:bg-amber-600 text-black transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b75bc]"
              >
                <Pause className="w-3 h-3" />
                <span>Pause</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!isChartScrollable}
                onClick={handleStartOrResumeAutoScroll}
                title={
                  isChartScrollable
                    ? autoScrollState === 'paused'
                      ? 'Resume auto-scroll'
                      : 'Start chart auto-scroll'
                    : 'Chart fits within view — no scrolling needed'
                }
                className={`inline-flex items-center gap-1 px-2.5 py-1 min-h-[32px] rounded-md text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b75bc] ${
                  autoScrollState === 'paused'
                    ? 'bg-[#1b75bc] text-white border-[#1b75bc]'
                    : isStage
                    ? 'bg-white/10 hover:bg-white/20 text-white border-white/15'
                    : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                }`}
              >
                <Play className="w-3 h-3" />
                <span>{autoScrollState === 'paused' ? 'Resume' : 'Start'}</span>
              </button>
            )}

            {autoScrollState !== 'stopped' && (
              <button
                type="button"
                onClick={handleStopAutoScroll}
                className={`inline-flex items-center gap-1 px-2.5 py-1 min-h-[32px] rounded-md text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b75bc] ${
                  isStage
                    ? 'bg-white/5 hover:bg-white/15 text-white/80 border-white/15'
                    : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                <Square className="w-3 h-3" />
                <span>Stop</span>
              </button>
            )}

            <button
              type="button"
              disabled={!isChartScrollable}
              onClick={handleScrollToTop}
              title="Scroll back to top of chart"
              className={`inline-flex items-center gap-1 px-2.5 py-1 min-h-[32px] rounded-md text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b75bc] ${
                isStage
                  ? 'bg-white/5 hover:bg-white/15 text-white/80 border-white/15'
                  : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              <ArrowUpToLine className="w-3 h-3" />
              <span>Top</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Auto-scroll speed">
            <span className={`text-[11px] ${isStage ? 'text-white/50' : 'text-slate-500 dark:text-slate-400'}`}>
              Speed:
            </span>
            {AUTO_SCROLL_SPEED_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                aria-pressed={autoScrollSpeed === opt.key}
                onClick={() => handleChangeAutoScrollSpeed(opt.key)}
                className={`px-2 py-1 min-w-[34px] min-h-[30px] rounded-md text-[11px] font-semibold tabular-nums border transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b75bc] ${
                  autoScrollSpeed === opt.key
                    ? 'bg-[#1b75bc] text-white border-[#1b75bc]'
                    : isStage
                    ? 'bg-white/5 text-white/75 border-white/10 hover:bg-white/15'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
            {autoScrollState === 'paused' && (
              <span className="text-[11px] font-medium text-amber-500 ml-1">Paused</span>
            )}
          </div>
        </div>
      </div>

      {/* Selectable Manual-Copy Fallback Panel (when Clipboard API is blocked/unavailable) */}
      {manualCopyText !== null && (
        <div
          role="region"
          aria-label="Manual chart copy fallback"
          className={`p-3 rounded-xl border space-y-2 ${
            isStage
              ? 'bg-[#0a0a0a] border-amber-500/40 text-white'
              : 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-slate-900 dark:text-slate-100'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">
              Clipboard access is restricted in this browser context. Select and copy the chart manually:
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => manualCopyTextareaRef.current?.select()}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#1b75bc] text-white hover:bg-[#165d97] cursor-pointer whitespace-nowrap"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => {
                  setManualCopyText(null);
                  setCopiedState('idle');
                }}
                aria-label="Close manual copy box"
                className={`p-1 rounded-md cursor-pointer ${
                  isStage ? 'text-white/70 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                }`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <textarea
            ref={manualCopyTextareaRef}
            readOnly
            value={manualCopyText}
            rows={5}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Formatted chart text for manual copying"
            className={`w-full p-2.5 rounded-lg border font-mono text-xs outline-none ${
              isStage
                ? 'bg-black border-white/15 text-white'
                : 'bg-white dark:bg-black border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
            }`}
          />
        </div>
      )}

      {/* Explicit Context & Variant Spec Strip */}
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs px-1 ${
          isStage ? 'text-white/70' : 'text-slate-600 dark:text-slate-400'
        }`}
      >
        {hasExplicitPerformedKeyContext && (
          <span>
            Performed Key:{' '}
            <strong className={targetPerformedKey ? 'text-[#54b0e2]' : 'italic font-medium opacity-75'}>
              {targetPerformedKey || 'Performed key not set'}
            </strong>
          </span>
        )}
        {chartBaseKey && (
          <span>
            Chart / Original Key: <strong>{chartBaseKey}</strong>
          </span>
        )}
        {activeChart.tuning && (
          <span>
            Tuning: <strong>{activeChart.tuning}</strong>
          </span>
        )}
        {activeChart.notes && (
          <span className="inline-flex items-center gap-1">
            <Music2 className="w-3.5 h-3.5 text-[#1b75bc] dark:text-[#54b0e2]" />
            <span>{activeChart.notes}</span>
          </span>
        )}
      </div>

      {/* Section Quick-Jump Bar */}
      {sections.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" role="navigation" aria-label="Jump to chart section">
          {sections.map((sec) => {
            const isSelected = activeSectionId === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => handleJumpToSection(sec.id)}
                className={`px-2.5 py-1 min-h-[30px] rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b75bc] ${
                  isSelected
                    ? 'bg-[#1b75bc]/15 text-[#1b75bc] dark:text-[#54b0e2] border-[#1b75bc]/40'
                    : isStage
                    ? 'bg-white/5 text-white/75 border-white/10 hover:bg-white/15 hover:text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#1b75bc]/40'
                }`}
              >
                {sec.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Rendered Monospace Chord / Cue Chart */}
      <div
        ref={scrollContainerRef}
        tabIndex={0}
        aria-label="Chord and cue chart viewer"
        onScroll={handleContainerScroll}
        onWheel={pauseOnManualInteraction}
        onTouchStart={pauseOnManualInteraction}
        onPointerDown={pauseOnManualInteraction}
        onKeyDown={handleContainerKeyDown}
        className={`${maxHeightClass} overflow-y-auto rounded-xl border p-4 space-y-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b75bc] ${
          isStage
            ? 'bg-[#080808] border-white/10 text-white'
            : 'bg-white dark:bg-black border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100'
        }`}
      >
        {sections.map((sec) => (
          <div
            key={sec.id}
            ref={(el) => {
              sectionRefs.current[sec.id] = el;
            }}
            className="scroll-mt-3 space-y-1.5"
          >
            <div
              className={`text-xs font-bold tracking-wide pb-1 border-b ${
                isStage
                  ? 'text-[#54b0e2] border-white/10'
                  : 'text-[#1b75bc] dark:text-[#54b0e2] border-slate-100 dark:border-slate-800'
              }`}
            >
              {sec.label}
            </div>
            <div className={`font-mono whitespace-pre-wrap break-words ${FONT_SIZE_CLASSES[fontSize]}`}>
              {sec.lines.map((line, lineIdx) => {
                const isChordLine = !nashvilleMode ? isChordOnlyLine(line) : isChordLineWithNashvilleNumbers(line);
                if (!line.trim()) {
                  return <div key={lineIdx} className="h-2" aria-hidden="true" />;
                }
                return (
                  <div
                    key={lineIdx}
                    className={
                      isChordLine
                        ? isStage
                          ? 'text-[#54b0e2] font-bold'
                          : 'text-[#1b75bc] dark:text-[#54b0e2] font-bold'
                        : isStage
                        ? 'text-white/95'
                        : 'text-slate-800 dark:text-slate-200'
                    }
                  >
                    {line}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

function isChordLineWithNashvilleNumbers(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Detect lines consisting predominantly of Nashville numbers, bars, and chord qualities
  const tokens = trimmed.split(/\s+/);
  const nashvilleToken = /^([(|[\]]*)?(?:b|#)?[1-7](?:(?:maj|min|m|dim|aug|sus|add|M)\d{0,2}|\d{1,2})*(?:\/(?:b|#)?[1-7])?([)|[\],;]*)$|^\|+$/;
  let matched = 0;
  for (const t of tokens) {
    if (nashvilleToken.test(t) || /^[-/.~^>*]+$/.test(t)) {
      matched++;
    } else {
      return false;
    }
  }
  return matched > 0;
}
