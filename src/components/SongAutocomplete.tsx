import React, { useState, useEffect, useRef } from 'react';
import { Song, Schedule } from '../types';
import { SongService } from '../services/songService';
import { SongFamilyService } from '../services/songFamilyService';
import { getManilaTodayString } from '../utils/dateUtils';
import { getSongTagClass } from '../utils/songTagStyles';
import { Music, Sparkles, Check, Plus, Search, HelpCircle, Flame, Clock, CalendarCheck } from 'lucide-react';

import { resolveSlotSong } from '../utils/songResolveUtils';

interface SongAutocompleteProps {
  value: string;
  onChange: (val: string, selectedSong?: Song) => void;
  category: 'praise' | 'worship';
  serviceDate: string;
  serviceType?: string;
  allSongs: Song[];
  schedules: Schedule[];
  currentLineupSongs?: string[];
  currentLineupSongIds?: (string | undefined)[];
  currentSongIndex?: number;
  excludeScheduleId?: string;
  onOpenLibrary?: () => void;
  placeholder?: string;
}

export const SongAutocomplete: React.FC<SongAutocompleteProps> = ({
  value,
  onChange,
  category,
  serviceDate,
  serviceType,
  allSongs,
  schedules,
  currentLineupSongs,
  currentLineupSongIds,
  currentSongIndex,
  excludeScheduleId,
  onOpenLibrary,
  placeholder = 'Type song title...'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Handle outside click to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const targetYM = serviceDate ? serviceDate.substring(0, 7) : getManilaTodayString().substring(0, 7);

  // Collect all excluded song IDs, family titles (for ID-matched/unambiguous entries), and unmatched raw titles
  const excludedLineupState = React.useMemo(() => {
    const excludedIds = new Set<string>();
    const excludedTitles = new Set<string>();
    if (!currentLineupSongs || currentLineupSongs.length === 0) {
      return { excludedIds, excludedTitles };
    }

    currentLineupSongs.forEach((songTitle, idx) => {
      // If currentSongIndex is passed, allow editing the current song slot without excluding itself
      if (currentSongIndex !== undefined && idx === currentSongIndex) {
        return;
      }
      const slotId = (currentLineupSongIds?.[idx] || '').trim();
      const clean = (songTitle || '').trim().toLowerCase();
      if (!slotId && !clean) return;

      if (slotId) {
        excludedIds.add(slotId);
        const famTitles = SongService.getFamilySongTitles(clean, allSongs, undefined, slotId);
        famTitles.forEach((t) => {
          const matchedFamSongs = allSongs.filter((s) => s.title.trim().toLowerCase() === t);
          if (matchedFamSongs.length === 1) {
            excludedIds.add(matchedFamSongs[0].id);
          }
        });
        return;
      }

      const resolved = resolveSlotSong(songTitle, undefined, allSongs);
      if (resolved.song) {
        excludedIds.add(resolved.song.id);
        const famTitles = SongService.getFamilySongTitles(resolved.song.title, allSongs, undefined, resolved.song.id);
        famTitles.forEach((t) => {
          const matchedFamSongs = allSongs.filter((s) => s.title.trim().toLowerCase() === t);
          if (matchedFamSongs.length === 1) {
            excludedIds.add(matchedFamSongs[0].id);
          }
        });
      } else if (resolved.isUnmatched && clean) {
        excludedTitles.add(clean);
      }
    });

    return { excludedIds, excludedTitles };
  }, [currentLineupSongs, currentLineupSongIds, currentSongIndex, allSongs]);

  // Filter songs for autocomplete dropdown
  const filteredSuggestions = React.useMemo(() => {
    return allSongs
      .filter((song) => {
        const titleLower = song.title.trim().toLowerCase();

        // Exclude if already in active lineup by authoritative ID or unmatched raw title
        if (excludedLineupState.excludedIds.has(song.id) || excludedLineupState.excludedTitles.has(titleLower)) {
          return false;
        }

        // Exclude if any member of this candidate song's family is in active lineup
        const candidateFamTitles = SongService.getFamilySongTitles(song.title, allSongs, undefined, song.id);
        if (
          candidateFamTitles.some((t) => {
            if (excludedLineupState.excludedTitles.has(t)) return true;
            const famMatch = allSongs.filter((s) => s.title.trim().toLowerCase() === t);
            return famMatch.length === 1 && excludedLineupState.excludedIds.has(famMatch[0].id);
          })
        ) {
          return false;
        }

        // Match category
        const catMatch = song.category === category || song.category === 'both';
        if (!catMatch) return false;

        const cleanQuery = query.trim().toLowerCase().replace(/\s+/g, ' ');
        if (!cleanQuery) return true; // Show top matches when blank

        const artistLower = song.artist.toLowerCase();
        const keyLower = (song.key || '').toLowerCase();
        const langLower = (song.language || '').toLowerCase();

        const terms = cleanQuery.split(' ');
        return terms.every(
          (term) =>
            titleLower.includes(term) ||
            artistLower.includes(term) ||
            keyLower.includes(term) ||
            langLower.includes(term)
        );
      })
      .slice(0, 10); // Top 10 suggestions
  }, [allSongs, excludedLineupState, category, query]);

  const handleSelectSong = (song: Song) => {
    onChange(song.title, song);
    setQuery(song.title);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    const clean = val.trim().toLowerCase();
    const exactMatches = clean ? allSongs.filter((s) => s.title.trim().toLowerCase() === clean) : [];
    const matchedSong = exactMatches.length === 1 ? exactMatches[0] : undefined;
    onChange(val, matchedSong);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || filteredSuggestions.length === 0) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredSuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredSuggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < filteredSuggestions.length) {
        e.preventDefault();
        handleSelectSong(filteredSuggestions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    }
  };

  // Helper to determine badges for a song
  const getSongBadges = (song: Song) => {
    const badges: { label: string; className: string; type: 'month' | 'new' | 'frequent' }[] = [];

    const usageCheck = SongService.checkMonthlyUsage(song.title, serviceDate, schedules, excludeScheduleId, serviceType, allSongs, undefined, song.id);
    if (usageCheck.timesUsedThisMonth > 0) {
      badges.push({
        label: `Used ${usageCheck.timesUsedThisMonth}x this month`,
        className: getSongTagClass('used_this_month', 'rounded-full text-[9px]'),
        type: 'month'
      });
    }

    const effectiveStats = SongFamilyService.getEffectiveUsageStats(song, allSongs);
    if (effectiveStats.timesUsed === 0) {
      badges.push({
        label: 'New',
        className: getSongTagClass('newly_added', 'rounded-full text-[9px]'),
        type: 'new'
      });
    } else if (effectiveStats.timesUsed >= 3) {
      badges.push({
        label: 'Frequently Used',
        className: getSongTagClass('recently_played', 'rounded-full text-[9px]'),
        type: 'frequent'
      });
    }

    return badges;
  };

  return (
    <div ref={wrapperRef} className="relative flex-1">
      <div className="relative flex items-center">
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          aria-autocomplete="list"
          aria-expanded={isOpen}
          placeholder={placeholder}
          className="w-full pl-3.5 pr-9 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
        />

        {onOpenLibrary && (
          <button
            type="button"
            onClick={onOpenLibrary}
            className="absolute right-2 p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
            title="Browse Song Library"
          >
            <Search className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Autocomplete Suggestions Dropdown */}
      {isOpen && filteredSuggestions.length > 0 && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto animate-in fade-in duration-150"
        >
          <div className="p-1.5 space-y-0.5">
            <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center justify-between">
              <span>Suggested {category === 'praise' ? 'Praise' : 'Worship'} Songs</span>
              {onOpenLibrary && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenLibrary();
                  }}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
                >
                  Browse All
                </button>
              )}
            </div>

            {filteredSuggestions.map((song, idx) => {
              const badges = getSongBadges(song);
              const isSelected = value.trim().toLowerCase() === song.title.toLowerCase();
              const isHighlighted = idx === highlightedIndex;

              return (
                <div
                  key={song.id}
                  role="option"
                  aria-selected={isSelected || isHighlighted}
                  onClick={() => handleSelectSong(song)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`p-2 rounded-lg cursor-pointer transition-colors flex items-center justify-between gap-2 ${
                    isHighlighted
                      ? 'bg-indigo-100/70 dark:bg-indigo-900/50 text-indigo-950 dark:text-indigo-100 font-semibold'
                      : isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-100 font-semibold'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold truncate">{song.title}</span>
                      {song.key && (
                        <span className="px-1.5 py-0.2 text-[10px] rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-medium shrink-0">
                          Key: {song.key}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                      {song.artist || 'Unknown Artist'} {song.language ? `• ${song.language}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {badges.map((b, idx) => (
                      <span
                        key={idx}
                        className={b.className}
                      >
                        {b.type === 'month' && <CalendarCheck className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />}
                        {b.type === 'new' && <Sparkles className="w-3 h-3 text-lime-600 dark:text-lime-400" />}
                        {b.type === 'frequent' && <Flame className="w-3 h-3 text-indigo-500" />}
                        <span>{b.label}</span>
                      </span>
                    ))}
                    {isSelected && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
