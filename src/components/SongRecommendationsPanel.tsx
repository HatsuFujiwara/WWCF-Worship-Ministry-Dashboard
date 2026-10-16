import React, { useState, useMemo } from 'react';
import { Song, Schedule } from '../types';
import { SongService } from '../services/songService';
import { CustomSelect } from './CustomSelect';
import { getSongTagClass } from '../utils/songTagStyles';
import {
  getSmartSongRecommendations,
  RecommendedSong,
  CategoryFilter,
  StatusFilter,
  COMMON_THEMES,
  MONTHLY_SEASONAL_THEMES
} from '../utils/recommendationUtils';
import {
  Sparkles,
  Filter,
  Music,
  Plus,
  Check,
  Tag,
  Calendar,
  ChevronDown,
  ChevronUp,
  Search,
  Zap,
  Heart,
  Clock,
  Flame,
  Info,
  GripVertical
} from 'lucide-react';

interface SongRecommendationsPanelProps {
  allSongs: Song[];
  schedules: Schedule[];
  currentPraiseSongs: string[];
  currentWorshipSongs: string[];
  serviceDate?: string;
  serviceType?: string;
  onAddSong: (category: 'praise' | 'worship', songTitle: string, defaultKey?: string) => void;
  onOpenNewSongModal?: () => void;
}

export const SongRecommendationsPanel: React.FC<SongRecommendationsPanelProps> = ({
  allSongs,
  schedules,
  currentPraiseSongs,
  currentWorshipSongs,
  serviceDate,
  serviceType,
  onAddSong,
  onOpenNewSongModal
}) => {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedTheme, setSelectedTheme] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [showInfo, setShowInfo] = useState<boolean>(false);

  const currentMonthIdx = new Date().getMonth();
  const currentSeasonInfo = MONTHLY_SEASONAL_THEMES[currentMonthIdx];

  // Recalculate recommendations dynamically whenever songs, schedules, or filters change
  const recommendations = useMemo(() => {
    return getSmartSongRecommendations(allSongs, schedules, {
      categoryFilter,
      statusFilter,
      themeFilter: selectedTheme,
      searchQuery,
      referenceDate: serviceDate,
      targetServiceType: serviceType,
      excludeLineupSongs: [...currentPraiseSongs, ...currentWorshipSongs]
    });
  }, [
    allSongs,
    schedules,
    categoryFilter,
    statusFilter,
    selectedTheme,
    searchQuery,
    serviceDate,
    serviceType,
    currentPraiseSongs,
    currentWorshipSongs
  ]);

  // Sets of clean song titles currently in the active schedule draft
  const activePraiseTitles = useMemo(() => {
    return new Set(currentPraiseSongs.map((s) => s.trim().toLowerCase()).filter(Boolean));
  }, [currentPraiseSongs]);

  const activeWorshipTitles = useMemo(() => {
    return new Set(currentWorshipSongs.map((s) => s.trim().toLowerCase()).filter(Boolean));
  }, [currentWorshipSongs]);

  // Filter out any songs already in the active lineup (Praise or Worship) or from the same Song Family
  const displayRecommendations = useMemo(() => {
    return recommendations.filter((item) => {
      const cleanTitle = item.song.title.trim().toLowerCase();
      const familyTitles = SongService.getFamilySongTitles(item.song.title, allSongs);
      const inLineup =
        activePraiseTitles.has(cleanTitle) ||
        activeWorshipTitles.has(cleanTitle) ||
        familyTitles.some((t) => activePraiseTitles.has(t) || activeWorshipTitles.has(t));
      return !inLineup;
    });
  }, [recommendations, allSongs, activePraiseTitles, activeWorshipTitles]);

  // Extract all unique themes present in songs for the theme filter dropdown
  const availableThemes = useMemo(() => {
    const themeSet = new Set<string>();
    COMMON_THEMES.forEach((t) => themeSet.add(t));
    allSongs.forEach((s) => {
      (s.themes || s.labels || []).forEach((t) => {
        if (t.trim()) themeSet.add(t.trim());
      });
    });
    return Array.from(themeSet).sort();
  }, [allSongs]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-indigo-100 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden transition-all">
      {/* Header Bar */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 p-4 text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/20 text-amber-300 border border-indigo-400/30">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm tracking-wide text-white">
                Smart Song Recommendations
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/20">
                {displayRecommendations.length} Songs
              </span>
            </div>
            <p className="text-xs text-indigo-200/80">
              Discovers underused songs and encourages healthy rotation from database
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentSeasonInfo && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-200 border border-amber-400/30">
              <span>{currentSeasonInfo.icon}</span>
              <span>{currentSeasonInfo.seasonName} Season Boost</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowInfo(!showInfo)}
            title="How recommendations work"
            className="p-1.5 rounded-lg bg-indigo-800/60 hover:bg-indigo-700 text-indigo-200 hover:text-white transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg bg-indigo-800/60 hover:bg-indigo-700 text-indigo-200 hover:text-white transition-colors flex items-center gap-1 text-xs font-medium"
          >
            {isExpanded ? (
              <>
                <span>Collapse</span>
                <ChevronUp className="w-4 h-4" />
              </>
            ) : (
              <>
                <span>Expand</span>
                <ChevronDown className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Info Explanation Banner (Toggleable) */}
      {showInfo && (
        <div className="bg-indigo-50 dark:bg-indigo-950/40 p-3.5 border-b border-indigo-100 dark:border-indigo-900 text-xs text-indigo-900 dark:text-indigo-200 space-y-1.5">
          <p className="font-semibold flex items-center gap-1 text-indigo-800 dark:text-indigo-300">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Recommendation Ranking Criteria:</span>
          </p>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-1 list-disc list-inside text-slate-700 dark:text-indigo-200/90 pl-1">
            <li><strong>Priority 1 — Newly Added:</strong> Songs recently added that have never been used.</li>
            <li><strong>Priority 2 — Played Only Once:</strong> Songs used once and not used in later months.</li>
            <li><strong>Priority 3 — Least Played:</strong> Songs with lowest total usage counts.</li>
            <li><strong>Priority 4 — Least Recently Played:</strong> Songs not used for the longest period.</li>
            <li><strong>Seasonal Boost:</strong> Songs tagged with themes matching current season (e.g. Christmas in Dec, Easter in Spring).</li>
          </ul>
        </div>
      )}

      {/* Control Filters Bar */}
      {isExpanded && (
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
          {/* Top Row: Category Tabs & Search */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  categoryFilter === 'all'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All Songs
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('praise')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1 ${
                  categoryFilter === 'praise'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Zap className="w-3 h-3" />
                <span>Praise</span>
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('worship')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1 ${
                  categoryFilter === 'worship'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Heart className="w-3 h-3" />
                <span>Worship</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search recommendations..."
                className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Bottom Row: Status Filter & Theme Dropdown */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
            {/* Priority Status Filters */}
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3" />
                Filter:
              </span>
              
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 border-slate-800'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                All Priorities
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('new')}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                  statusFilter === 'new'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50'
                }`}
              >
                ✨ Newly Added
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('once')}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                  statusFilter === 'once'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50'
                }`}
              >
                🔄 Played Once
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('least_played')}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                  statusFilter === 'least_played'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50'
                }`}
              >
                🎵 Least Played
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('seasonal')}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                  statusFilter === 'seasonal'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-50'
                }`}
              >
                ⭐ Seasonal
              </button>
            </div>

            {/* Theme Filter Dropdown */}
            <div className="flex items-center gap-1.5 min-w-[170px]">
              <Tag className="w-3 h-3 text-slate-400 shrink-0" />
              <div className="flex-1">
                <CustomSelect
                  value={selectedTheme}
                  onChange={(val) => setSelectedTheme(val)}
                  size="sm"
                  aria-label="Theme Filter"
                  options={[
                    { value: 'all', label: 'All Themes / Tags' },
                    ...availableThemes.map((theme) => ({
                      value: theme,
                      label: `Theme: ${theme}`
                    }))
                  ]}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recommendation List Cards */}
      {isExpanded && (
        <div className="p-3 max-h-[420px] overflow-y-auto space-y-2.5 divide-y divide-slate-100 dark:divide-slate-800">
          {displayRecommendations.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400 space-y-2">
              <Music className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-medium">No recommended songs found matching current filters.</p>
              {onOpenNewSongModal && (
                <button
                  type="button"
                  onClick={onOpenNewSongModal}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add New Song to Database</span>
                </button>
              )}
            </div>
          ) : (
            displayRecommendations.slice(0, 15).map((item) => {
              const { song, badges, isSeasonal, timesUsed, lastPlayedFormatted, priorityGroup, isFamily, familyName } = item;
              const cleanTitle = song.title.trim().toLowerCase();
              const familyTitles = SongService.getFamilySongTitles(song.title, allSongs);
              const inPraise = activePraiseTitles.has(cleanTitle) || familyTitles.some((t) => activePraiseTitles.has(t));
              const inWorship = activeWorshipTitles.has(cleanTitle) || familyTitles.some((t) => activeWorshipTitles.has(t));

              return (
                <div
                  key={song.id}
                  data-song-title={song.title}
                  data-song-artist={song.artist}
                  data-song-category={song.category}
                  className={`pt-2.5 first:pt-0 group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 rounded-lg card-hover-polish transition-all ${
                    isSeasonal
                      ? 'bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/40'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  {/* Song Information & Badges */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Drag Handle to Drag Recommendation into Lineup */}
                      <div
                        draggable
                        onDragStart={(e) => {
                          const payload = {
                            type: 'recommendation',
                            category: song.category === 'worship' ? 'worship' : 'praise',
                            songTitle: song.title,
                            key: song.originalKey || song.key || ''
                          };
                          e.dataTransfer.effectAllowed = 'copyMove';
                          e.dataTransfer.setData('application/json', JSON.stringify(payload));
                          e.dataTransfer.setData('text/plain', JSON.stringify(payload));
                        }}
                        className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-indigo-500 p-0.5 rounded transition-colors shrink-0"
                        title="Drag to add into Praise or Worship lineup"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>

                      <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                        {song.title}
                      </h4>
                      <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        by {song.artist || 'Unknown Artist'}
                      </span>

                      {/* Song Family Indicator */}
                      {isFamily && familyName && (
                        <span className={getSongTagClass('family')}>
                          Family: {familyName}
                        </span>
                      )}

                      {/* Song Category */}
                      <span
                        className={
                          song.category === 'praise'
                            ? getSongTagClass('praise')
                            : song.category === 'worship'
                            ? getSongTagClass('worship')
                            : getSongTagClass('neutral')
                        }
                      >
                        {song.category.toUpperCase()}
                      </span>

                      {song.originalKey && (
                        <span className={getSongTagClass('key')}>
                          Key: {song.originalKey}
                        </span>
                      )}
                      {song.bpm && (
                        <span className={getSongTagClass('bpm')}>
                          {song.bpm} BPM
                        </span>
                      )}
                    </div>

                    {/* Informational Badges */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {badges.map((badge, idx) => {
                        let badgeClassName = getSongTagClass('neutral');

                        if (badge.includes('Newly Added') || badge.includes('Never Played')) {
                          badgeClassName = getSongTagClass('newly_added');
                        } else if (badge.includes('Played Once')) {
                          badgeClassName = getSongTagClass('recently_played');
                        } else if (badge.includes('Recommendation') || badge.includes('Seasonal')) {
                          badgeClassName = getSongTagClass('praise');
                        } else if (badge === 'Original') {
                          badgeClassName = getSongTagClass('original');
                        } else if (['Cover', 'Acoustic', 'Rearranged', 'Live'].includes(badge)) {
                          badgeClassName = getSongTagClass('cover');
                        } else if (badge.startsWith('🏷️')) {
                          badgeClassName = getSongTagClass('theme');
                        }

                        return (
                          <span
                            key={idx}
                            className={badgeClassName}
                          >
                            {badge}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Direct Add Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {(inPraise || inWorship) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                        <Check className="w-3.5 h-3.5" />
                        <span>In Lineup</span>
                      </span>
                    )}

                    {(song.category === 'praise' || song.category === 'both') && (
                      <button
                        type="button"
                        onClick={() => onAddSong('praise', song.title, song.originalKey || song.key)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                          inPraise
                            ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200'
                            : 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs'
                        }`}
                        title="Add to Praise Songs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Praise</span>
                      </button>
                    )}

                    {(song.category === 'worship' || song.category === 'both') && (
                      <button
                        type="button"
                        onClick={() => onAddSong('worship', song.title, song.originalKey || song.key)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                          inWorship
                            ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200'
                            : 'bg-purple-600 hover:bg-purple-700 text-white shadow-xs'
                        }`}
                        title="Add to Worship Songs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Worship</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
