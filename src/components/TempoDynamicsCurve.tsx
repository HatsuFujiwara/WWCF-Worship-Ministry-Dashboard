import React, { useMemo } from 'react';
import { Song } from '../types';
import { resolveSlotSong } from '../utils/songResolveUtils';
import { resolveTransitionNote } from '../utils/songReferenceUtils';
import { Activity, Zap, Heart, Info, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface TempoPoint {
  index: number;
  label: string;
  category: 'praise' | 'worship';
  title: string;
  songId?: string;
  performedKey?: string;
  originalKey?: string;
  bpm?: number;
  transitionNote?: string;
}

interface TempoDynamicsCurveProps {
  praiseSongs: string[];
  worshipSongs: string[];
  praiseSongKeys?: string[];
  worshipSongKeys?: string[];
  praiseSongIds?: (string | undefined)[];
  worshipSongIds?: (string | undefined)[];
  allSongs: Song[];
  transitionNotes?: Record<string, string>;
}

export const TempoDynamicsCurve: React.FC<TempoDynamicsCurveProps> = ({
  praiseSongs,
  worshipSongs,
  praiseSongKeys = [],
  worshipSongKeys = [],
  praiseSongIds = [],
  worshipSongIds = [],
  allSongs,
  transitionNotes = {}
}) => {
  // Build ordered sequence of songs using authoritative slot resolver
  const sequence = useMemo(() => {
    const points: TempoPoint[] = [];

    // 1. Praise Songs
    praiseSongs.forEach((title, idx) => {
      if (!title || !title.trim()) return;
      const cleanTitle = title.trim();
      const songId = praiseSongIds[idx];
      const { song } = resolveSlotSong(cleanTitle, songId, allSongs);

      const bpm = song?.bpm && song.bpm > 0 ? song.bpm : undefined;
      const performedKey = (praiseSongKeys[idx] || '').trim() || undefined;
      const originalKey = song?.originalKey || song?.key || undefined;

      const nextTitle = idx < praiseSongs.length - 1 ? praiseSongs[idx + 1] : undefined;
      const nextId = idx < praiseSongs.length - 1 ? praiseSongIds[idx + 1] : undefined;
      const transitionNote = resolveTransitionNote(
        transitionNotes,
        'praise',
        idx,
        idx + 1,
        cleanTitle,
        nextTitle,
        songId,
        nextId
      );

      points.push({
        index: points.length,
        label: `Praise ${idx + 1}`,
        category: 'praise',
        title: song?.title || cleanTitle,
        songId,
        performedKey,
        originalKey,
        bpm,
        transitionNote
      });
    });

    const praiseCount = points.length;

    // Cross-section transition note
    const crossTransitionNote = resolveTransitionNote(
      transitionNotes,
      'cross_section',
      praiseCount > 0 ? praiseCount - 1 : 0,
      0,
      praiseSongs[praiseSongs.length - 1],
      worshipSongs[0],
      praiseSongIds[praiseSongs.length - 1],
      worshipSongIds[0]
    );

    // 2. Worship Songs
    worshipSongs.forEach((title, idx) => {
      if (!title || !title.trim()) return;
      const cleanTitle = title.trim();
      const songId = worshipSongIds[idx];
      const { song } = resolveSlotSong(cleanTitle, songId, allSongs);

      const bpm = song?.bpm && song.bpm > 0 ? song.bpm : undefined;
      const performedKey = (worshipSongKeys[idx] || '').trim() || undefined;
      const originalKey = song?.originalKey || song?.key || undefined;

      const nextTitle = idx < worshipSongs.length - 1 ? worshipSongs[idx + 1] : undefined;
      const nextId = idx < worshipSongs.length - 1 ? worshipSongIds[idx + 1] : undefined;
      const transitionNote = resolveTransitionNote(
        transitionNotes,
        'worship',
        idx,
        idx + 1,
        cleanTitle,
        nextTitle,
        songId,
        nextId
      );

      points.push({
        index: points.length,
        label: `Worship ${idx + 1}`,
        category: 'worship',
        title: song?.title || cleanTitle,
        songId,
        performedKey,
        originalKey,
        bpm,
        transitionNote: idx === 0 && crossTransitionNote ? crossTransitionNote : transitionNote
      });
    });

    return points;
  }, [praiseSongs, worshipSongs, praiseSongKeys, worshipSongKeys, praiseSongIds, worshipSongIds, allSongs, transitionNotes]);

  // Calculate statistics from recorded BPM values only (no synthetic interpolation)
  const stats = useMemo(() => {
    const knownBpms = sequence.filter((p): p is TempoPoint & { bpm: number } => typeof p.bpm === 'number');
    if (knownBpms.length === 0) {
      return { min: 0, max: 0, avg: 0, knownCount: 0, totalCount: sequence.length };
    }
    const bpms = knownBpms.map((p) => p.bpm);
    const min = Math.min(...bpms);
    const max = Math.max(...bpms);
    const sum = bpms.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / bpms.length);
    return { min, max, avg, knownCount: knownBpms.length, totalCount: sequence.length };
  }, [sequence]);

  if (sequence.length === 0) {
    return null;
  }

  // SVG Chart Geometry Constants
  const svgWidth = 640;
  const svgHeight = 170;
  const paddingLeft = 45;
  const paddingRight = 40;
  const paddingTop = 26;
  const paddingBottom = 42;
  const plotWidth = svgWidth - paddingLeft - paddingRight;
  const plotHeight = svgHeight - paddingTop - paddingBottom;

  const effectiveMin = Math.max(40, stats.min > 0 ? stats.min - 15 : 60);
  const effectiveMax = Math.max(effectiveMin + 30, stats.max > 0 ? stats.max + 15 : 150);
  const bpmRange = effectiveMax - effectiveMin || 1;

  // Grid lines on Y-axis
  const gridBpmStep = bpmRange > 80 ? 30 : 20;
  const gridLines: number[] = [];
  const firstGrid = Math.ceil(effectiveMin / gridBpmStep) * gridBpmStep;
  for (let b = firstGrid; b <= effectiveMax; b += gridBpmStep) {
    gridLines.push(b);
  }

  // Calculate coordinates for each point
  const totalSlots = sequence.length;
  const xStep = totalSlots > 1 ? plotWidth / (totalSlots - 1) : plotWidth / 2;

  const pointsWithCoords = sequence.map((p, idx) => {
    const x = totalSlots === 1 ? paddingLeft + plotWidth / 2 : paddingLeft + idx * xStep;
    const y = typeof p.bpm === 'number'
      ? paddingTop + plotHeight - ((p.bpm - effectiveMin) / bpmRange) * plotHeight
      : svgHeight - paddingBottom + 12; // Plotted at baseline for unrecorded BPM
    return { ...p, x, y };
  });

  // Build SVG path segments (only connect consecutive points with RECORDED BPM)
  const pathSegments: string[] = [];
  let currentSegment: { x: number; y: number }[] = [];

  pointsWithCoords.forEach((pt) => {
    if (typeof pt.bpm === 'number') {
      currentSegment.push({ x: pt.x, y: pt.y });
    } else {
      if (currentSegment.length > 1) {
        const d = currentSegment.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
        pathSegments.push(d);
      }
      currentSegment = [];
    }
  });
  if (currentSegment.length > 1) {
    const d = currentSegment.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    pathSegments.push(d);
  }

  // Find index of first worship song for section divider
  const worshipStartIndex = sequence.findIndex((p) => p.category === 'worship');
  const dividerX = worshipStartIndex > 0
    ? (pointsWithCoords[worshipStartIndex - 1].x + pointsWithCoords[worshipStartIndex].x) / 2
    : null;

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2]">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Setlist Flow & Tempo Dynamics Curve
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Plotted BPM trajectory from Praise celebration to Worship reverence
            </p>
          </div>
        </div>

        {/* Stats summary */}
        {stats.knownCount > 0 && (
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              Avg: <strong>{stats.avg} BPM</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              Range: <strong>{stats.min} – {stats.max} BPM</strong>
            </span>
          </div>
        )}
      </div>

      {/* SVG Plotted Curve */}
      <div className="relative w-full overflow-x-auto rounded-xl bg-slate-50/70 dark:bg-black/40 border border-slate-200/80 dark:border-slate-800 p-2">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto min-w-[520px] select-none"
          role="img"
          aria-label={`Tempo dynamics curve showing progression across ${sequence.length} songs. Average tempo is ${stats.avg} BPM.`}
        >
          <title>Worship Lineup Tempo Dynamics Curve</title>
          <desc>
            Plotted trajectory of recorded BPM across praise and worship songs. Shows gaps where BPM is unrecorded.
          </desc>

          {/* Section backgrounds */}
          {dividerX !== null && (
            <>
              {/* Praise section tinted background */}
              <rect
                x={paddingLeft - 10}
                y={paddingTop - 10}
                width={dividerX - (paddingLeft - 10)}
                height={plotHeight + 20}
                fill="#f59e0b"
                fillOpacity="0.04"
                rx="6"
              />
              {/* Worship section tinted background */}
              <rect
                x={dividerX}
                y={paddingTop - 10}
                width={svgWidth - paddingRight + 10 - dividerX}
                height={plotHeight + 20}
                fill="#6366f1"
                fillOpacity="0.04"
                rx="6"
              />
            </>
          )}

          {/* Horizontal Grid lines and BPM axis labels */}
          {gridLines.map((bpm) => {
            const y = paddingTop + plotHeight - ((bpm - effectiveMin) / bpmRange) * plotHeight;
            return (
              <g key={`grid-${bpm}`}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={svgWidth - paddingRight}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                  strokeDasharray="2 3"
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 dark:fill-slate-500 font-mono text-[9px]"
                >
                  {bpm}
                </text>
              </g>
            );
          })}

          {/* Section Divider Line (Praise -> Worship) */}
          {dividerX !== null && (
            <g>
              <line
                x1={dividerX}
                y1={paddingTop - 4}
                x2={dividerX}
                y2={svgHeight - paddingBottom + 6}
                stroke="#1b75bc"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                strokeOpacity="0.6"
              />
              <text
                x={dividerX}
                y={paddingTop - 10}
                textAnchor="middle"
                className="fill-[#1b75bc] dark:fill-[#54b0e2] text-[9px] font-bold tracking-tight uppercase"
              >
                Praise ➔ Worship
              </text>
            </g>
          )}

          {/* Plotted Trajectory Curve Line Segments */}
          {pathSegments.map((d, sIdx) => (
            <path
              key={`segment-${sIdx}`}
              d={d}
              fill="none"
              stroke="#1b75bc"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="drop-shadow-xs"
            />
          ))}

          {/* Data Points and Delta markers */}
          {pointsWithCoords.map((pt, idx) => {
            const hasBpm = typeof pt.bpm === 'number';
            const prev = idx > 0 ? pointsWithCoords[idx - 1] : null;
            const delta = hasBpm && typeof prev?.bpm === 'number' ? pt.bpm - prev.bpm : null;

            return (
              <g key={`point-${pt.category}-${idx}`} className="transition-all">
                {/* Vertical indicator guide */}
                {hasBpm && (
                  <line
                    x1={pt.x}
                    y1={pt.y}
                    x2={pt.x}
                    y2={svgHeight - paddingBottom}
                    stroke="currentColor"
                    className="text-slate-200 dark:text-slate-800"
                    strokeWidth="1"
                  />
                )}

                {/* Point circle */}
                {hasBpm ? (
                  <>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="6"
                      fill={pt.category === 'praise' ? '#d97706' : '#6366f1'}
                      stroke="white"
                      className="dark:stroke-slate-900"
                      strokeWidth="2"
                    />
                    {/* BPM value label above circle */}
                    <text
                      x={pt.x}
                      y={pt.y - 10}
                      textAnchor="middle"
                      className="fill-slate-900 dark:fill-slate-100 font-black text-[10px]"
                    >
                      {pt.bpm}
                    </text>
                  </>
                ) : (
                  <>
                    {/* Missing BPM marker: open dashed ring at baseline */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="5"
                      fill="none"
                      stroke="currentColor"
                      className="text-slate-400 dark:text-slate-500"
                      strokeWidth="1.5"
                      strokeDasharray="2 2"
                    />
                    <text
                      x={pt.x}
                      y={pt.y - 8}
                      textAnchor="middle"
                      className="fill-slate-400 dark:fill-slate-500 italic text-[9px]"
                    >
                      No BPM
                    </text>
                  </>
                )}

                {/* Consecutive Delta marker between points */}
                {delta !== null && prev && (
                  <g>
                    <rect
                      x={(prev.x + pt.x) / 2 - 14}
                      y={(prev.y + pt.y) / 2 - 9}
                      width="28"
                      height="16"
                      rx="4"
                      fill={delta > 0 ? '#10b981' : delta < 0 ? '#3b82f6' : '#64748b'}
                      fillOpacity="0.15"
                    />
                    <text
                      x={(prev.x + pt.x) / 2}
                      y={(prev.y + pt.y) / 2 + 3}
                      textAnchor="middle"
                      className={`font-mono text-[9px] font-bold ${
                        delta > 0 ? 'fill-emerald-600 dark:fill-emerald-400' : delta < 0 ? 'fill-blue-600 dark:fill-blue-400' : 'fill-slate-500'
                      }`}
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </text>
                  </g>
                )}

                {/* X-axis slot label */}
                <text
                  x={pt.x}
                  y={svgHeight - paddingBottom + 16}
                  textAnchor="middle"
                  className={`text-[9px] font-bold uppercase tracking-tight ${
                    pt.category === 'praise' ? 'fill-amber-600 dark:fill-amber-400' : 'fill-indigo-600 dark:fill-indigo-400'
                  }`}
                >
                  {pt.label}
                </text>

                {/* X-axis song title snippet */}
                <text
                  x={pt.x}
                  y={svgHeight - paddingBottom + 27}
                  textAnchor="middle"
                  className="fill-slate-600 dark:fill-slate-300 font-semibold text-[9px]"
                >
                  {pt.title.length > 12 ? `${pt.title.slice(0, 11)}…` : pt.title}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Step-by-step tempo cards */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {sequence.map((point, idx) => {
            const prev = idx > 0 ? sequence[idx - 1] : null;
            const bpmDelta =
              typeof point.bpm === 'number' && typeof prev?.bpm === 'number'
                ? point.bpm - prev.bpm
                : null;

            return (
              <div
                key={`${point.category}-${point.index}`}
                className={`p-3 rounded-xl border transition-all ${
                  point.category === 'praise'
                    ? 'bg-amber-500/5 border-amber-500/20'
                    : 'bg-indigo-500/5 border-indigo-500/20'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                      point.category === 'praise'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                    }`}
                  >
                    {point.category === 'praise' ? <Zap className="w-2.5 h-2.5" /> : <Heart className="w-2.5 h-2.5" />}
                    <span>{point.label}</span>
                  </span>

                  {/* Performed Key vs Original Key */}
                  <div className="flex items-center gap-1">
                    {point.performedKey ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2] border border-[#1b75bc]/20">
                        Key {point.performedKey}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 italic">
                        Key not set
                      </span>
                    )}
                    {point.originalKey && point.originalKey !== point.performedKey && (
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono" title="Original catalog key">
                        (orig: {point.originalKey})
                      </span>
                    )}
                  </div>
                </div>

                <div className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate" title={point.title}>
                  {point.title}
                </div>

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/50 dark:border-slate-800 text-xs">
                  <div className="flex items-center gap-1">
                    {typeof point.bpm === 'number' ? (
                      <span className="font-black text-slate-800 dark:text-slate-200 tabular-nums">
                        {point.bpm} <span className="text-[10px] font-normal text-slate-500">BPM</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">No BPM recorded</span>
                    )}
                  </div>

                  {bpmDelta !== null && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                        bpmDelta > 0
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : bpmDelta < 0
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {bpmDelta > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : bpmDelta < 0 ? <TrendingDown className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
                      <span>{bpmDelta > 0 ? `+${bpmDelta}` : bpmDelta}</span>
                    </span>
                  )}
                </div>

                {point.transitionNote && (
                  <div className="mt-2 text-[10px] bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded text-slate-600 dark:text-slate-300 italic truncate" title={point.transitionNote}>
                    Cue: {point.transitionNote}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Missing BPM Advisory */}
        {stats.knownCount < stats.totalCount && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
            <Info className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              {stats.totalCount - stats.knownCount} song(s) in this setlist have no BPM recorded in the song catalog. The curve leaves explicit gaps rather than inventing unrecorded tempos.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
