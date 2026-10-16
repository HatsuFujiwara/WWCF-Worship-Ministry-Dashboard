import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Song, Schedule } from '../types';
import { SongService } from '../services/songService';
import { SongFamilyService } from '../services/songFamilyService';
import { StorageService } from '../services/storage';
import { sanitizeSongLanguage } from '../utils/languageUtils';
import { getSongTagClass } from '../utils/songTagStyles';
import { CustomSelect } from './CustomSelect';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import {
  Search,
  Music,
  Filter,
  Check,
  Plus,
  Sparkles,
  CalendarCheck,
  Flame,
  X,
  ExternalLink,
  Youtube
} from 'lucide-react';

interface SongPickerModalProps {
  isOpen: boolean;
  category: 'praise' | 'worship';
  serviceDate: string;
  serviceType?: string;
  allSongs: Song[];
  schedules: Schedule[];
  excludeScheduleId?: string;
  onSelectSong: (songTitle: string) => void;
  onClose: () => void;
  onAddNewSong: () => void;
  onImportYouTubeSong?: () => void;
}

export const SongPickerModal: React.FC<SongPickerModalProps> = ({
  isOpen,
  category,
  serviceDate,
  serviceType,
  allSongs,
  schedules,
  excludeScheduleId,
  onSelectSong,
  onClose,
  onAddNewSong,
  onImportYouTubeSong
}) => {
  // Filter Memory: Load last-used search and filter settings
  const savedFilters = useMemo(() => StorageService.getSongPickerFilterSettings(), []);

  const [searchQuery, setSearchQuery] = useState(savedFilters.searchQuery || '');
  const [selectedLanguage, setSelectedLanguage] = useState<string>(savedFilters.selectedLanguage || 'all');
  const [selectedKey, setSelectedKey] = useState<string>(savedFilters.selectedKey || 'all');
  const [selectedBadgeFilter, setSelectedBadgeFilter] = useState<string>(savedFilters.selectedBadgeFilter || 'all');

  // Filter Memory: Persist settings whenever they change
  useEffect(() => {
    StorageService.saveSongPickerFilterSettings({
      searchQuery,
      selectedLanguage,
      selectedKey,
      selectedBadgeFilter
    });
  }, [searchQuery, selectedLanguage, selectedKey, selectedBadgeFilter]);

  // Filter songs
  const filtered = allSongs.filter((s) => {
    // Category match
    if (s.category !== 'both' && s.category !== category) {
      return false;
    }

    // Language
    if (selectedLanguage !== 'all' && s.language !== selectedLanguage) {
      return false;
    }

    // Key
    if (selectedKey !== 'all' && s.key !== selectedKey) {
      return false;
    }

    // Badge filter
    const usageCheck = SongService.checkMonthlyUsage(s.title, serviceDate, schedules, excludeScheduleId, serviceType, allSongs);
    const effectiveStats = SongFamilyService.getEffectiveUsageStats(s, allSongs);
    if (selectedBadgeFilter === 'used_this_month' && usageCheck.timesUsedThisMonth === 0) {
      return false;
    }
    if (selectedBadgeFilter === 'not_used_this_month' && usageCheck.timesUsedThisMonth > 0) {
      return false;
    }
    if (selectedBadgeFilter === 'new' && effectiveStats.timesUsed > 0) {
      return false;
    }
    if (selectedBadgeFilter === 'frequent' && effectiveStats.timesUsed < 3) {
      return false;
    }

    // Text search with multi-term matching
    if (searchQuery.trim()) {
      const cleanQ = searchQuery.trim().toLowerCase().replace(/\s+/g, ' ');
      const terms = cleanQ.split(' ');
      const titleLower = s.title.toLowerCase();
      const artistLower = s.artist.toLowerCase();
      const keyLower = (s.key || '').toLowerCase();
      const langLower = (s.language || '').toLowerCase();

      return terms.every(
        (term) =>
          titleLower.includes(term) ||
          artistLower.includes(term) ||
          keyLower.includes(term) ||
          langLower.includes(term)
      );
    }

    return true;
  });

  // Extract keys and languages
  const availableLanguages = Array.from(
    new Set(allSongs.map((s) => sanitizeSongLanguage(s.language)).filter(Boolean))
  );
  const availableKeys = Array.from(new Set(allSongs.map((s) => s.key).filter(Boolean)));

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'song-picker-modal',
    isOpen,
    layer: OverlayLayer.MODAL,
    onClose,
    closeOnEscape: true
  });

  if (!isOpen) return null;

  const modalContent = (
    <div
      style={{ zIndex }}
      data-overlay-id="song-picker-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto backdrop-enter-animation transition-opacity ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div className="relative w-full max-w-2xl wwcf-glass-modal border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4 modal-enter-animation max-h-[85vh] my-auto flex flex-col text-slate-900 dark:text-slate-100">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#5aa7e8]">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Select {category === 'praise' ? 'Praise (Fast)' : 'Worship (Slow)'} Song
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                Choose from your church song library or add a new song
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters Bar */}
        <div className="space-y-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, artist, key..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/80 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#1b75bc]/30 focus:border-[#1b75bc] outline-none"
              />
            </div>

            {/* Language filter */}
            <div className="w-36">
              <CustomSelect
                value={selectedLanguage}
                onChange={(val) => setSelectedLanguage(val)}
                size="sm"
                aria-label="Filter by Language"
                options={[
                  { value: 'all', label: 'All Languages' },
                  ...availableLanguages.map((lang) => ({
                    value: lang,
                    label: lang
                  }))
                ]}
              />
            </div>

            {/* Key filter */}
            <div className="w-32">
              <CustomSelect
                value={selectedKey}
                onChange={(val) => setSelectedKey(val)}
                size="sm"
                aria-label="Filter by Key"
                options={[
                  { value: 'all', label: 'All Keys' },
                  ...availableKeys.map((k) => ({
                    value: k,
                    label: `Key: ${k}`
                  }))
                ]}
              />
            </div>
          </div>

          {/* Smart Badge Filter Pills */}
          <div className="flex flex-wrap gap-1.5 pt-1 text-[11px]">
            <button
              onClick={() => setSelectedBadgeFilter('all')}
              className={`px-3 py-1 rounded-full font-bold cursor-pointer transition-colors ${
                selectedBadgeFilter === 'all'
                  ? 'bg-[#1b75bc] text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              All Songs ({filtered.length})
            </button>
            <button
              onClick={() => setSelectedBadgeFilter('not_used_this_month')}
              className={`px-3 py-1 rounded-full font-bold cursor-pointer transition-colors ${
                selectedBadgeFilter === 'not_used_this_month'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              Not Used This Month
            </button>
            <button
              onClick={() => setSelectedBadgeFilter('used_this_month')}
              className={`px-3 py-1 rounded-full font-bold cursor-pointer transition-colors ${
                selectedBadgeFilter === 'used_this_month'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              Used This Month
            </button>
            <button
              onClick={() => setSelectedBadgeFilter('new')}
              className={`px-3 py-1 rounded-full font-bold cursor-pointer transition-colors ${
                selectedBadgeFilter === 'new'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              New Songs
            </button>
          </div>
        </div>

        {/* Songs List */}
        <div className="overflow-y-auto space-y-2 flex-1 pr-1 border border-slate-100 dark:border-slate-800 rounded-xl p-2 bg-slate-50/50 dark:bg-slate-800/30">
          {filtered.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-xs font-semibold text-slate-400">No matching songs found</p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onAddNewSong();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/80 rounded-lg cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add New Song to Library</span>
              </button>
            </div>
          ) : (
            filtered.map((song) => {
              const usageCheck = SongService.checkMonthlyUsage(song.title, serviceDate, schedules, excludeScheduleId, serviceType, allSongs);
              const effectiveStats = SongFamilyService.getEffectiveUsageStats(song, allSongs);
              const isFamily = effectiveStats.isFamilyMember;
              return (
                <div
                  key={song.id}
                  onClick={() => {
                    onSelectSong(song.title);
                    onClose();
                  }}
                  className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-xs transition-all flex items-center justify-between gap-3 cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {song.thumbnailUrl ? (
                      <img
                        src={song.thumbnailUrl}
                        alt={song.title}
                        className="w-12 h-9 object-cover rounded-md shrink-0 border border-slate-200 dark:border-slate-700"
                      />
                    ) : (
                      <div className="w-12 h-9 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                        {song.originalKey || song.key || 'SONG'}
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {song.title}
                        </h4>
                        {(song.originalKey || song.key) && (
                          <span className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            Original Key: {song.originalKey || song.key}
                          </span>
                        )}
                        {song.bpm && (
                          <span className="text-[10px] font-medium text-slate-400">
                            {song.bpm} BPM
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {song.artist || 'Unknown Artist'} {song.language ? `• ${song.language}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Usage Badge */}
                  <div className="flex items-center gap-2 shrink-0">
                    {usageCheck.timesUsedThisMonth > 0 ? (
                      <span className={getSongTagClass('used_this_month', 'rounded-full')}>
                        <CalendarCheck className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
                        <span>Used {usageCheck.timesUsedThisMonth}x this month</span>
                      </span>
                    ) : effectiveStats.timesUsed === 0 ? (
                      <span className={getSongTagClass('newly_added', 'rounded-full')}>
                        <Sparkles className="w-3 h-3 text-lime-600 dark:text-lime-400" />
                        <span>New</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-slate-400">
                        Used {effectiveStats.timesUsed}x {isFamily ? '(family)' : 'total'}
                      </span>
                    )}

                    <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Check className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 shrink-0 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            {onImportYouTubeSong && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onImportYouTubeSong();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/80 hover:bg-red-100 dark:hover:bg-red-900/80 border border-red-200/80 dark:border-red-800/80 rounded-xl transition-colors cursor-pointer shadow-2xs"
                title="Import song or playlist from YouTube URL"
              >
                <Youtube className="w-4 h-4 text-red-500" />
                <span>Import Song / Playlist</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onClose();
                onAddNewSong();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-[#1b75bc] dark:text-[#5aa7e8] bg-[#1b75bc]/10 hover:bg-[#1b75bc]/20 rounded-xl transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Song to Library</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
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
