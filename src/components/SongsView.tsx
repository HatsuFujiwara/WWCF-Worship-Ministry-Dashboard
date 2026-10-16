import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Song, Schedule, SongCategory, SongFamily, SongRelationshipType } from '../types';
import { SongService } from '../services/songService';
import { SongFamilyService } from '../services/songFamilyService';
import { LineupHistoryService } from '../services/lineupHistoryService';
import { StorageService } from '../services/storage';
import { detectPotentialSongFamilies, PotentialFamilySuggestion, getNormalizedBaseTitle } from '../utils/songFamilyUtils';
import { sanitizeSongLanguage } from '../utils/languageUtils';
import { resolveSongVersionType } from '../utils/versionDetectionUtils';
import { getSongTagClass, getLanguageTagCategory } from '../utils/songTagStyles';
import { getManilaTodayString } from '../utils/dateUtils';
import { useMultiSelect } from '../hooks/useMultiSelect';
import { SongFormModal } from './SongFormModal';
import { SmartSongImportModal } from './SmartSongImportModal';
import { SongFamilyModal } from './SongFamilyModal';
import { SongFamilySuggestionsModal } from './SongFamilySuggestionsModal';
import { SongFamiliesModal } from './SongFamiliesModal';
import { SameNameSongsModal } from './SameNameSongsModal';
import { GetMetadataModal } from './GetMetadataModal';
import { BulkMetadataReviewModal } from './BulkMetadataReviewModal';
import { Modal } from './Modal';
import {
  Music,
  Plus,
  Search,
  Filter,
  Youtube,
  Trash2,
  Edit2,
  Calendar,
  Sparkles,
  Flame,
  CalendarCheck,
  ExternalLink,
  Layers,
  Clock,
  Mic2,
  ChevronDown,
  ChevronUp,
  Tag,
  X,
  Network,
  Languages,
  ArrowUpDown,
  Folder,
  FolderOpen,
  LayoutGrid,
  FolderTree,
  Unlink,
  Check,
  GitCompare,
  RotateCcw
} from 'lucide-react';

export type SongSortOption =
  | 'name-asc'
  | 'name-desc'
  | 'most-played'
  | 'least-played'
  | 'played-recently'
  | 'played-longest-ago';

interface SongsViewProps {
  songs: Song[];
  schedules: Schedule[];
  onRefreshSongs: () => void;
  onUpdateSchedules: (updatedSchedules: Schedule[]) => void;
  showToast: (msg: string, type?: 'success' | 'danger' | 'info') => void;
}

export const SongsView: React.FC<SongsViewProps> = ({
  songs,
  schedules,
  onRefreshSongs,
  onUpdateSchedules,
  showToast
}) => {
  // Filter Memory: Load last-used search, category, language, status, and sort settings
  const savedFilters = useMemo(() => StorageService.getSongsFilterSettings(), []);

  const [searchQuery, setSearchQuery] = useState(savedFilters.searchQuery || '');
  const [categoryFilter, setCategoryFilter] = useState<string>(savedFilters.categoryFilter || 'all');
  const [languageFilter, setLanguageFilter] = useState<string>(savedFilters.languageFilter || 'all');
  const [versionTypeFilter, setVersionTypeFilter] = useState<'all' | 'original' | 'cover'>(
    (savedFilters.versionTypeFilter as 'all' | 'original' | 'cover') || 'all'
  );
  const [sortBy, setSortBy] = useState<SongSortOption>(
    (savedFilters.sortBy as SongSortOption) || 'name-asc'
  );
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  // Filter Memory: Persist settings whenever they change
  useEffect(() => {
    StorageService.saveSongsFilterSettings({
      searchQuery,
      categoryFilter,
      languageFilter,
      versionTypeFilter,
      sortBy
    });
  }, [searchQuery, categoryFilter, languageFilter, versionTypeFilter, sortBy]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    categoryFilter !== 'all' ||
    languageFilter !== 'all' ||
    versionTypeFilter !== 'all' ||
    sortBy !== 'name-asc';

  const handleResetFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setLanguageFilter('all');
    setVersionTypeFilter('all');
    setSortBy('name-asc');
  };

  // Form Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSmartImportOpen, setIsSmartImportOpen] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);

  // Song Family state
  const [songFamilies, setSongFamilies] = useState<SongFamily[]>([]);
  const [isFamilyModalOpen, setIsFamilyModalOpen] = useState(false);
  const [familyToEdit, setFamilyToEdit] = useState<SongFamily | null>(null);
  const [isSuggestionsModalOpen, setIsSuggestionsModalOpen] = useState(false);
  const [familySuggestions, setFamilySuggestions] = useState<PotentialFamilySuggestion[]>([]);
  const [isSongFamiliesModalOpen, setIsSongFamiliesModalOpen] = useState(false);
  const [targetExpandedFamilyId, setTargetExpandedFamilyId] = useState<string | null>(null);
  const songFamiliesBtnRef = useRef<HTMLButtonElement>(null);

  // Get Metadata state
  const [metadataSong, setMetadataSong] = useState<Song | null>(null);
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [isBulkMetadataModalOpen, setIsBulkMetadataModalOpen] = useState(false);
  const [bulkMetadataInitialIds, setBulkMetadataInitialIds] = useState<string[]>([]);

  // Same-Name Songs Modal state
  const [isSameNameModalOpen, setIsSameNameModalOpen] = useState(false);

  const handleOpenSameNameFinder = () => {
    // Fast O(N) scan to verify if any same-name groups exist
    const map = new Map<string, number>();
    for (const s of songs) {
      const k = getNormalizedBaseTitle(s.title).trim().toLowerCase();
      if (k) map.set(k, (map.get(k) || 0) + 1);
    }
    let hasSameName = false;
    for (const count of map.values()) {
      if (count >= 2) {
        hasSameName = true;
        break;
      }
    }

    if (!hasSameName) {
      showToast('No same-name songs found. All song titles in your repertoire are unique.', 'info');
      return;
    }

    setIsSameNameModalOpen(true);
  };

  const loadFamilies = async () => {
    try {
      const families = await SongFamilyService.getSongFamilies();
      setSongFamilies(families);
      const suggestions = detectPotentialSongFamilies(songs, families);
      setFamilySuggestions(suggestions);
    } catch (err) {
      console.error('Failed to load song families:', err);
    }
  };

  useEffect(() => {
    loadFamilies();
  }, [songs]);

  React.useEffect(() => {
    const handleCloseImportModal = () => {
      setIsSmartImportOpen(false);
    };
    window.addEventListener('close-import-playlist-modal', handleCloseImportModal);
    return () => {
      window.removeEventListener('close-import-playlist-modal', handleCloseImportModal);
    };
  }, []);

  // Bulk Delete Modal state
  const [bulkDeleteConfig, setBulkDeleteConfig] = useState<{
    isOpen: boolean;
    targets: Song[];
    affectedSchedulesCount: number;
    songsInUseCount: number;
  }>({
    isOpen: false,
    targets: [],
    affectedSchedulesCount: 0,
    songsInUseCount: 0
  });

  // Bulk Category Change Modal state
  const [bulkCategoryConfig, setBulkCategoryConfig] = useState<{
    isOpen: boolean;
    targets: Song[];
    targetCategory: SongCategory | null;
  }>({
    isOpen: false,
    targets: [],
    targetCategory: null
  });

  // Filter songs
  const filteredSongs = songs.filter((s) => {
    // Category
    if (categoryFilter !== 'all') {
      if (categoryFilter === 'praise' && s.category !== 'praise' && s.category !== 'both') return false;
      if (categoryFilter === 'worship' && s.category !== 'worship' && s.category !== 'both') return false;
    }

    // Language
    if (languageFilter !== 'all' && s.language !== languageFilter) {
      return false;
    }

    // Version Type (Original vs Cover)
    if (versionTypeFilter !== 'all') {
      const ver = resolveSongVersionType(s);
      if (ver !== versionTypeFilter) return false;
    }

    // Search query with robust multi-term matching
    if (searchQuery.trim()) {
      const cleanQ = searchQuery.trim().toLowerCase().replace(/\s+/g, ' ');
      const terms = cleanQ.split(' ');
      const titleLower = s.title.toLowerCase();
      const artistLower = s.artist.toLowerCase();
      const keyLower = (s.key || '').toLowerCase();
      const ccliLower = (s.ccliNumber || '').toLowerCase();
      const notesLower = (s.notes || '').toLowerCase();
      const themesLower = (s.themes || []).map((t) => t.toLowerCase());
      const labelsLower = (s.labels || []).map((l) => l.toLowerCase());

      return terms.every(
        (term) =>
          titleLower.includes(term) ||
          artistLower.includes(term) ||
          keyLower.includes(term) ||
          ccliLower.includes(term) ||
          notesLower.includes(term) ||
          themesLower.some((t) => t.includes(term)) ||
          labelsLower.some((l) => l.includes(term))
      );
    }

    return true;
  });

  // Memoized effective usage statistics map per song (computed once in O(N) rather than O(N^2 log N) inside sort comparator)
  const effectiveStatsMap = useMemo(() => {
    const map = new Map<string, { timesUsed: number; lastUsedDate: string | null }>();

    // Fast family lookup by member version ID
    const familyBySongId = new Map<string, typeof songFamilies[0]>();
    songFamilies.forEach((f) => {
      f.versionIds.forEach((vid) => familyBySongId.set(vid, f));
    });

    // Group songs by family ID
    const songsByFamilyId = new Map<string, Song[]>();
    songs.forEach((s) => {
      const family = s.songFamilyId
        ? songFamilies.find((f) => f.id === s.songFamilyId)
        : familyBySongId.get(s.id);

      if (family) {
        let group = songsByFamilyId.get(family.id);
        if (!group) {
          group = [];
          songsByFamilyId.set(family.id, group);
        }
        group.push(s);
      }
    });

    // Precompute aggregate stats for each family
    const familyStats = new Map<string, { timesUsed: number; lastUsedDate: string | null }>();
    songsByFamilyId.forEach((memberSongs, famId) => {
      const timesUsed = memberSongs.reduce((sum, m) => sum + (m.timesUsed || 0), 0);
      const dates = memberSongs
        .map((m) => m.lastUsedDate)
        .filter((d): d is string => Boolean(d && d.trim()));
      dates.sort().reverse();
      const lastUsedDate = dates.length > 0 ? dates[0] : null;
      familyStats.set(famId, { timesUsed, lastUsedDate });
    });

    // Assign stats to each song with O(1) map insertion
    songs.forEach((s) => {
      const family = s.songFamilyId
        ? songFamilies.find((f) => f.id === s.songFamilyId)
        : familyBySongId.get(s.id);

      if (family && familyStats.has(family.id)) {
        map.set(s.id, familyStats.get(family.id)!);
      } else {
        map.set(s.id, {
          timesUsed: s.timesUsed || 0,
          lastUsedDate: s.lastUsedDate && s.lastUsedDate.trim() ? s.lastUsedDate : null
        });
      }
    });

    return map;
  }, [songs, songFamilies]);

  // Helper to compute effective usage count and last-used date with Song Family aggregation
  const getSongEffectiveStats = (s: Song) => {
    return effectiveStatsMap.get(s.id) || {
      timesUsed: s.timesUsed || 0,
      lastUsedDate: s.lastUsedDate && s.lastUsedDate.trim() ? s.lastUsedDate : null
    };
  };

  // Sort filtered songs based on active sort option
  const sortedSongs = [...filteredSongs].sort((a, b) => {
    const titleA = a.title.toLowerCase();
    const titleB = b.title.toLowerCase();

    if (sortBy === 'name-asc') {
      return titleA.localeCompare(titleB);
    }

    if (sortBy === 'name-desc') {
      return titleB.localeCompare(titleA);
    }

    const statsA = getSongEffectiveStats(a);
    const statsB = getSongEffectiveStats(b);

    if (sortBy === 'most-played') {
      if (statsA.timesUsed !== statsB.timesUsed) {
        return statsB.timesUsed - statsA.timesUsed; // Highest count first
      }
      return titleA.localeCompare(titleB);
    }

    if (sortBy === 'least-played') {
      if (statsA.timesUsed !== statsB.timesUsed) {
        return statsA.timesUsed - statsB.timesUsed; // Lowest count first (0s first)
      }
      return titleA.localeCompare(titleB);
    }

    if (sortBy === 'played-recently') {
      const hasDateA = Boolean(statsA.lastUsedDate && statsA.timesUsed > 0);
      const hasDateB = Boolean(statsB.lastUsedDate && statsB.timesUsed > 0);

      // Never-played songs appear at the bottom
      if (hasDateA && !hasDateB) return -1;
      if (!hasDateA && hasDateB) return 1;
      if (!hasDateA && !hasDateB) return titleA.localeCompare(titleB);

      // Both have dates - most recent first (descending)
      const dateA = statsA.lastUsedDate!;
      const dateB = statsB.lastUsedDate!;
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
      return titleA.localeCompare(titleB);
    }

    if (sortBy === 'played-longest-ago') {
      const hasDateA = Boolean(statsA.lastUsedDate && statsA.timesUsed > 0);
      const hasDateB = Boolean(statsB.lastUsedDate && statsB.timesUsed > 0);

      // Never-played songs appear FIRST because they have no previous usage
      if (!hasDateA && hasDateB) return -1;
      if (hasDateA && !hasDateB) return 1;
      if (!hasDateA && !hasDateB) return titleA.localeCompare(titleB);

      // Both have dates - longest ago first (ascending)
      const dateA = statsA.lastUsedDate!;
      const dateB = statsB.lastUsedDate!;
      if (dateA !== dateB) {
        return dateA.localeCompare(dateB);
      }
      return titleA.localeCompare(titleB);
    }

    return titleA.localeCompare(titleB);
  });

  // Multi-select hook
  const {
    selectedIds,
    selectedCount,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    isSelected,
    isAllSelected,
    isSomeSelected
  } = useMultiSelect(sortedSongs);

  const handleRequestDelete = (targets: Song[]) => {
    if (targets.length === 0) return;

    const targetTitles = new Set(targets.map((s) => s.title.trim().toLowerCase()));

    const affectedSchedules = schedules.filter((sch) => {
      const schSongs = [...(sch.praiseSongs || []), ...(sch.worshipSongs || [])].map((s) => s.trim().toLowerCase());
      return Array.from(targetTitles).some((t) => schSongs.includes(t));
    });

    const songsInUse = targets.filter((s) => {
      const titleLower = s.title.trim().toLowerCase();
      return schedules.some((sch) => {
        const schSongs = [...(sch.praiseSongs || []), ...(sch.worshipSongs || [])].map((item) => item.trim().toLowerCase());
        return schSongs.includes(titleLower);
      });
    });

    setBulkDeleteConfig({
      isOpen: true,
      targets,
      affectedSchedulesCount: affectedSchedules.length,
      songsInUseCount: songsInUse.length
    });
  };

  const executeDelete = async () => {
    const { targets } = bulkDeleteConfig;
    if (targets.length === 0) return;

    try {
      const targetIds = targets.map((s) => s.id);
      const clonedTargets = [...targets];
      await SongService.deleteSongsBulk(targetIds);

      LineupHistoryService.pushAppAction({
        description:
          clonedTargets.length === 1
            ? `Deleted song "${clonedTargets[0].title}"`
            : `Deleted ${clonedTargets.length} songs`,
        undo: async () => {
          const current = await SongService.getSongs();
          const restored = [...current, ...clonedTargets];
          await SongService.saveSongsList(restored);
          onRefreshSongs();
        },
        redo: async () => {
          await SongService.deleteSongsBulk(targetIds);
          onRefreshSongs();
        }
      });

      showToast(
        targets.length === 1
          ? `Deleted "${targets[0].title}" from Song Database. Saved line-ups remain unchanged.`
          : `Deleted ${targets.length} selected songs from Song Database. Saved line-ups remain unchanged.`,
        'success'
      );

      clearSelection();
      setBulkDeleteConfig({ isOpen: false, targets: [], affectedSchedulesCount: 0, songsInUseCount: 0 });
      onRefreshSongs();
    } catch (err) {
      console.error('Failed to delete songs:', err);
      showToast('Failed to delete selected songs', 'danger');
    }
  };

  const handleRequestBulkCategoryChange = (targetCategory: SongCategory) => {
    const selectedSongs = songs.filter((s) => selectedIds.has(s.id));
    if (selectedSongs.length === 0) return;

    setBulkCategoryConfig({
      isOpen: true,
      targets: selectedSongs,
      targetCategory
    });
  };

  const executeBulkCategoryChange = async () => {
    const { targets, targetCategory } = bulkCategoryConfig;
    if (targets.length === 0 || !targetCategory) return;

    try {
      const targetIds = targets.map((s) => s.id);
      const prevCategories = new Map(targets.map((s) => [s.id, s.category]));
      await SongService.bulkUpdateCategory(targetIds, targetCategory);

      LineupHistoryService.pushAppAction({
        description: `Updated category to "${targetCategory}" for ${targets.length} song${targets.length > 1 ? 's' : ''}`,
        undo: async () => {
          const current = await SongService.getSongs();
          for (const s of current) {
            if (prevCategories.has(s.id)) {
              s.category = prevCategories.get(s.id)!;
            }
          }
          await SongService.saveSongsList(current);
          onRefreshSongs();
        },
        redo: async () => {
          await SongService.bulkUpdateCategory(targetIds, targetCategory);
          onRefreshSongs();
        }
      });

      showToast(
        `${targets.length} song${targets.length > 1 ? 's' : ''} were updated successfully.`,
        'success'
      );

      clearSelection();
      setBulkCategoryConfig({ isOpen: false, targets: [], targetCategory: null });
      onRefreshSongs();
    } catch (err) {
      console.error('Failed to update song categories:', err);
      showToast('Failed to update song categories', 'danger');
    }
  };

  const handleBulkLanguageChange = async (targetLanguage: 'English' | 'Tagalog' | 'Multi-lingual') => {
    const selectedSongs = songs.filter((s) => selectedIds.has(s.id));
    if (selectedSongs.length === 0) return;

    try {
      const targetIds = selectedSongs.map((s) => s.id);
      const prevLanguages = new Map(selectedSongs.map((s) => [s.id, s.language]));
      await SongService.bulkUpdateLanguage(targetIds, targetLanguage);

      LineupHistoryService.pushAppAction({
        description: `Updated language to "${targetLanguage}" for ${selectedSongs.length} song${selectedSongs.length > 1 ? 's' : ''}`,
        undo: async () => {
          const current = await SongService.getSongs();
          for (const s of current) {
            if (prevLanguages.has(s.id)) {
              s.language = prevLanguages.get(s.id)!;
            }
          }
          await SongService.saveSongsList(current);
          onRefreshSongs();
        },
        redo: async () => {
          await SongService.bulkUpdateLanguage(targetIds, targetLanguage);
          onRefreshSongs();
        }
      });

      showToast(
        selectedSongs.length === 1
          ? `Set "${selectedSongs[0].title}" language to ${targetLanguage}.`
          : `Set ${selectedSongs.length} selected songs to ${targetLanguage}.`,
        'success'
      );

      clearSelection();
      onRefreshSongs();
    } catch (err) {
      console.error('Failed to update song languages:', err);
      showToast('Failed to update song languages', 'danger');
    }
  };

  const handleBulkVersionTypeChange = async (targetVersionType: 'original' | 'cover') => {
    const selectedSongs = songs.filter((s) => selectedIds.has(s.id));
    if (selectedSongs.length === 0) return;

    try {
      const targetIds = selectedSongs.map((s) => s.id);
      const prevVersions = new Map(selectedSongs.map((s) => [s.id, s.versionType]));
      await SongService.bulkUpdateVersionType(targetIds, targetVersionType);

      LineupHistoryService.pushAppAction({
        description: `Updated status to "${targetVersionType.toUpperCase()}" for ${selectedSongs.length} song${selectedSongs.length > 1 ? 's' : ''}`,
        undo: async () => {
          const current = await SongService.getSongs();
          for (const s of current) {
            if (prevVersions.has(s.id)) {
              s.versionType = prevVersions.get(s.id)!;
            }
          }
          await SongService.saveSongsList(current);
          onRefreshSongs();
        },
        redo: async () => {
          await SongService.bulkUpdateVersionType(targetIds, targetVersionType);
          onRefreshSongs();
        }
      });

      showToast(
        selectedSongs.length === 1
          ? `Set "${selectedSongs[0].title}" to ${targetVersionType.toUpperCase()}.`
          : `Set ${selectedSongs.length} selected songs to ${targetVersionType.toUpperCase()}.`,
        'success'
      );

      clearSelection();
      onRefreshSongs();
    } catch (err) {
      console.error('Failed to update song version types:', err);
      showToast('Failed to update song status', 'danger');
    }
  };

  const currentYM = getManilaTodayString().substring(0, 7);

  // Stats
  const praiseCount = songs.filter((s) => s.category === 'praise' || s.category === 'both').length;
  const worshipCount = songs.filter((s) => s.category === 'worship' || s.category === 'both').length;

  return (
    <div data-tour="songs-view" className="space-y-6">
      
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl wwcf-surface-hero border border-slate-200/80 dark:border-white/10 shadow-xs">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Music className="w-6 h-6 text-[#1b75bc] dark:text-[#54b0e2]" />
            <span>Song Database & Worship Library</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage church repertoire, keys, CCLI numbers, YouTube recordings, and historical set usage
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            ref={songFamiliesBtnRef}
            data-tour="song-families-btn"
            onClick={() => {
              setTargetExpandedFamilyId(null);
              setIsSongFamiliesModalOpen(true);
            }}
            className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200/80 dark:border-white/10 rounded-xl transition-all cursor-pointer"
            title="Manage multi-version song relationships & families"
          >
            <Layers className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
            <span>Song Families ({songFamilies.length})</span>
          </button>

          <button
            type="button"
            data-tour="find-same-name-btn"
            data-tts-label="Find Same-Name Songs in database"
            onClick={handleOpenSameNameFinder}
            className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200/80 dark:border-white/10 rounded-xl transition-all cursor-pointer"
            title="Scan and review songs that share identical or normalized titles"
          >
            <GitCompare className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
            <span>Find Same-Name Songs</span>
          </button>

          <button
            type="button"
            data-tts-label="Review Song Metadata"
            onClick={() => {
              setBulkMetadataInitialIds([]);
              setIsBulkMetadataModalOpen(true);
            }}
            className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200/80 dark:border-white/10 rounded-xl transition-all cursor-pointer shadow-xs"
            title="Scan and correct songs with missing artist, combined title/artist, or video clutter using MusicBrainz & Deezer"
          >
            <Sparkles className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
            <span>Review Song Metadata</span>
          </button>

          <button
            onClick={() => setIsSmartImportOpen(true)}
            data-tour="import-playlist-btn"
            className="btn-tactile inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-red-600 to-[#1b75bc] hover:from-red-700 hover:to-[#165d97] rounded-xl transition-all shadow-xs cursor-pointer"
          >
            <Youtube className="w-4 h-4 text-white" />
            <span>Import Song / Playlist</span>
          </button>

          <button
            onClick={() => {
              setEditingSong(null);
              setIsModalOpen(true);
            }}
            data-tour="add-song-btn"
            className="btn-tactile inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-[#1b75bc] hover:bg-[#165d97] rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Song</span>
          </button>
        </div>
      </div>
      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Total Songs
          </p>
          <p className="text-lg font-black text-slate-900 dark:text-slate-100 mt-0.5">
            {songs.length}
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Praise Songs
          </p>
          <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
            {praiseCount}
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Worship Songs
          </p>
          <p className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
            {worshipCount}
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Used This Month
          </p>
          <p className="text-lg font-black text-amber-600 dark:text-amber-400 mt-0.5">
            {songs.filter((s) => SongService.getMonthlyUsageCount(s.title, schedules, undefined, songs) > 0).length}
          </p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
        
        {/* Search Bar */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            data-tour="song-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by song title, artist, key, CCLI..."
            className="w-full pl-9 pr-8 py-2.5 text-xs sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full cursor-pointer"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category Pills & Filters Group */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full md:w-auto">
          {/* Category Pills */}
          <div className="flex items-center gap-1 flex-1 sm:flex-initial">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`btn-tactile flex-1 sm:flex-initial px-3.5 py-2 text-xs font-bold rounded-xl cursor-pointer transition-all min-h-[38px] flex items-center justify-center ${
                categoryFilter === 'all'
                  ? 'bg-[#1b75bc] text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setCategoryFilter('praise')}
              className={`btn-tactile flex-1 sm:flex-initial px-3.5 py-2 text-xs font-bold rounded-xl cursor-pointer transition-all min-h-[38px] flex items-center justify-center ${
                categoryFilter === 'praise'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              Praise
            </button>
            <button
              onClick={() => setCategoryFilter('worship')}
              className={`btn-tactile flex-1 sm:flex-initial px-3.5 py-2 text-xs font-bold rounded-xl cursor-pointer transition-all min-h-[38px] flex items-center justify-center ${
                categoryFilter === 'worship'
                  ? 'bg-[#1b75bc] text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              Worship
            </button>
          </div>

          {/* Language Filter */}
          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none w-full sm:w-auto min-h-[38px] cursor-pointer"
          >
            <option value="all">All Languages</option>
            <option value="English">English</option>
            <option value="Tagalog">Tagalog</option>
            <option value="Multi-lingual">Multi-lingual</option>
          </select>

          {/* Status Filter (Original / Cover) */}
          <select
            value={versionTypeFilter}
            onChange={(e) => setVersionTypeFilter(e.target.value as 'all' | 'original' | 'cover')}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none w-full sm:w-auto min-h-[38px] cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="original">Original Only</option>
            <option value="cover">Cover Only</option>
          </select>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap pl-1 hidden xl:inline">
              Sort by:
            </span>
            <div className="relative w-full sm:w-auto">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SongSortOption)}
                aria-label="Sort songs"
                className="w-full sm:w-auto pl-8 pr-8 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none min-h-[38px] cursor-pointer appearance-none hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
              >
                <option value="name-asc">Name — A to Z</option>
                <option value="name-desc">Name — Z to A</option>
                <option value="most-played">Most Played</option>
                <option value="least-played">Least Played</option>
                <option value="played-recently">Played Recently</option>
                <option value="played-longest-ago">Played Longest Ago</option>
              </select>
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute left-2.5 top-3" />
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2.5 top-3" />
            </div>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              title="Reset all search, category, language, and status filters"
              aria-label="Clear all song filters"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/80 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 rounded-xl transition-all cursor-pointer min-h-[38px] shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Bulk Actions & Selection Bar */}
      <div
        data-tour="song-bulk-actions"
        className="sticky top-[73px] sm:top-[77px] z-20 flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-700 shadow-sm transition-all"
      >
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAllSelected}
              ref={(el) => {
                if (el) el.indeterminate = isSomeSelected;
              }}
              onChange={() => toggleSelectAll(sortedSongs)}
              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <span>Select All ({sortedSongs.length})</span>
          </label>

          {selectedCount > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              {selectedCount} selected
            </span>
          )}
        </div>

        {selectedCount > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {selectedCount === 1 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const singleSong = songs.find((s) => selectedIds.has(s.id));
                    if (singleSong) {
                      setEditingSong(singleSong);
                      setIsModalOpen(true);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg transition-colors cursor-pointer shadow-xs"
                  title="Edit Song"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const singleSong = songs.find((s) => selectedIds.has(s.id));
                    if (singleSong) {
                      setMetadataSong(singleSong);
                      setIsMetadataModalOpen(true);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 rounded-lg transition-colors cursor-pointer shadow-xs"
                  title="Get Metadata from YouTube, Spotify, Apple Music, LRCLIB"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Get Metadata</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setBulkMetadataInitialIds(Array.from(selectedIds));
                setIsBulkMetadataModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#1b75bc] dark:text-[#54b0e2] bg-[#1b75bc]/10 hover:bg-[#1b75bc]/20 border border-[#1b75bc]/30 rounded-lg transition-colors cursor-pointer shadow-xs"
              title="Detect & review metadata for selected songs using MusicBrainz & Deezer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#1b75bc] dark:text-[#54b0e2]" />
              <span>Review Metadata ({selectedCount})</span>
            </button>

            <button
              onClick={() => handleRequestBulkCategoryChange('praise')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/80 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              <Flame className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Set Selected to Praise</span>
            </button>

            <button
              onClick={() => handleRequestBulkCategoryChange('worship')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              <Tag className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Set Selected to Worship</span>
            </button>

            <button
              onClick={() => handleBulkLanguageChange('English')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/80 hover:bg-sky-100 dark:hover:bg-sky-900/60 border border-sky-200 dark:border-sky-800 rounded-lg transition-colors cursor-pointer shadow-xs"
              title="Set selected song(s) language to English"
            >
              <Languages className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>Set Selected to English</span>
            </button>

            <button
              onClick={() => handleBulkLanguageChange('Tagalog')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/80 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 rounded-lg transition-colors cursor-pointer shadow-xs"
              title="Set selected song(s) language to Tagalog"
            >
              <Languages className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Set Selected to Tagalog</span>
            </button>

            <button
              onClick={() => handleBulkLanguageChange('Multi-lingual')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/80 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 rounded-lg transition-colors cursor-pointer shadow-xs"
              title="Set selected song(s) language to Multi-lingual"
            >
              <Languages className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Set Selected to Multi-lingual</span>
            </button>

            <button
              onClick={() => handleBulkVersionTypeChange('original')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/80 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 rounded-lg transition-colors cursor-pointer shadow-xs"
              title="Set selected song(s) status to ORIGINAL"
            >
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Set Selected to Original</span>
            </button>

            <button
              onClick={() => handleBulkVersionTypeChange('cover')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/80 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 rounded-lg transition-colors cursor-pointer shadow-xs"
              title="Set selected song(s) status to COVER"
            >
              <Music className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Set Selected to Cover</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFamilyToEdit(null);
                setIsFamilyModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 rounded-lg transition-colors cursor-pointer shadow-xs"
              title="Create Song Family from selected songs"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Create Song Family</span>
            </button>

            <button
              onClick={() => {
                const selectedSongs = songs.filter((s) => selectedIds.has(s.id));
                handleRequestDelete(selectedSongs);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/80 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selectedCount})</span>
            </button>
          </div>
        )}
      </div>

      {/* Song Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {songs.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto text-2xl">
              🎵
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-2">
                <span>🎵</span> No songs found.
              </h3>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Your Song Database is currently empty.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click &ldquo;Add Song&rdquo; or import a YouTube/YouTube Music playlist to get started.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={() => {
                  setEditingSong(null);
                  setIsModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl cursor-pointer shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add Song</span>
              </button>
              <button
                onClick={() => setIsSmartImportOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-red-600 to-indigo-600 hover:from-red-700 hover:to-indigo-700 rounded-xl cursor-pointer shadow-xs transition-colors"
              >
                <Youtube className="w-4 h-4 text-white" />
                <span>Import Song / Playlist</span>
              </button>
            </div>
          </div>
        ) : sortedSongs.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
            <Music className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              No songs found matching your search.
            </p>
          </div>
        ) : (
          sortedSongs.map((song, idx) => {
            const timesUsedThisMonth = SongService.getMonthlyUsageCount(song.title, schedules, undefined, songs);
            const effectiveStats = SongFamilyService.getEffectiveUsageStats(song, songs);
            const isExpanded = expandedHistoryId === song.id;
            const selected = isSelected(song.id);

            return (
              <div
                key={song.id}
                className={`p-4 rounded-2xl bg-white dark:bg-slate-800 border transition-all flex flex-col justify-between space-y-3 card-hover-polish ${
                  selected
                    ? 'border-indigo-500 dark:border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/20 shadow-xs'
                    : 'border-slate-200/80 dark:border-slate-700/80 shadow-xs hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                {/* Top Row: Checkbox + Thumbnail + Details */}
                <div className="flex items-start gap-3">
                  {/* Select Checkbox */}
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => toggleSelect(song.id, idx, e)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0 mt-1"
                  />

                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {song.thumbnailUrl ? (
                      <div className="relative group shrink-0">
                        <img
                          src={song.thumbnailUrl}
                          alt={song.title}
                          className="w-20 h-14 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
                        />
                        {song.youtubeUrl && (
                          <a
                            href={song.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute inset-0 bg-slate-900/40 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Youtube className="w-6 h-6 text-white" />
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="w-20 h-14 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0 border border-indigo-100 dark:border-indigo-900">
                        {song.key || 'SONG'}
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 truncate">
                            {song.title}
                          </h3>
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {song.artist || 'Unknown Artist'}
                          </p>
                        </div>
                        
                        {/* Dedicated Compact YouTube Access Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (song.youtubeUrl && song.youtubeUrl.trim()) {
                              window.open(song.youtubeUrl.trim(), '_blank', 'noopener,noreferrer');
                            } else {
                              showToast('No YouTube link available for this song.', 'info');
                            }
                          }}
                          className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                            song.youtubeUrl && song.youtubeUrl.trim()
                              ? 'bg-red-50 dark:bg-red-950/40 border-red-200/80 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60 shadow-2xs hover:scale-105'
                              : 'bg-slate-100/80 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                          title={
                            song.youtubeUrl && song.youtubeUrl.trim()
                              ? 'Open on YouTube / YouTube Music'
                              : 'No YouTube link available for this song'
                          }
                        >
                          <Youtube className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Metadata Pill Tags with Distinct Color Families */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {/* 1. Version Tag: Original (Green) vs Cover (Purple) */}
                        {resolveSongVersionType(song) === 'cover' ? (
                          <span className={getSongTagClass('cover')}>
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                            <span>COVER</span>
                          </span>
                        ) : (
                          <span className={getSongTagClass('original')}>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>ORIGINAL</span>
                          </span>
                        )}

                        {/* 2. Category Tag: Praise (Warm Yellow/Orange) vs Worship (Blue) */}
                        {song.category === 'praise' ? (
                          <span className={getSongTagClass('praise')}>
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            <span>PRAISE</span>
                          </span>
                        ) : song.category === 'worship' ? (
                          <span className={getSongTagClass('worship')}>
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                            <span>WORSHIP</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <span className={getSongTagClass('praise')}>PRAISE</span>
                            <span className={getSongTagClass('worship')}>WORSHIP</span>
                          </span>
                        )}

                        {/* 3. Original Key */}
                        <span className={getSongTagClass('key')}>
                          Original Key: {song.originalKey || song.key || '—'}
                        </span>

                        {/* 4. BPM Tag */}
                        {song.bpm && (
                          <span className={getSongTagClass('bpm')}>
                            {song.bpm} BPM
                          </span>
                        )}

                        {/* 5. Language Tag: English (Cyan), Tagalog (Rose/Pink), Multi-lingual (Violet) */}
                        <span className={getSongTagClass(getLanguageTagCategory(song.language))}>
                          {song.language || 'English'}
                        </span>
                      </div>

                      {/* Theme Tags */}
                      {((song.themes && song.themes.length > 0) || (song.labels && song.labels.length > 0)) && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {(song.themes || song.labels || []).map((themeTag) => (
                            <span
                              key={themeTag}
                              className={getSongTagClass('theme')}
                            >
                              🏷️ {themeTag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Song Family Indicator (Teal Family) */}
                      {song.songFamilyId && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const fam = songFamilies.find((f) => f.id === song.songFamilyId);
                              if (fam) {
                                setTargetExpandedFamilyId(fam.id);
                                setIsSongFamiliesModalOpen(true);
                              }
                            }}
                            className={`${getSongTagClass('family')} hover:opacity-90 transition-opacity cursor-pointer`}
                            title="Click to view & manage Song Family in floating panel"
                          >
                            <Layers className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                            <span>Family: {songFamilies.find((f) => f.id === song.songFamilyId)?.name || 'Linked Family'}</span>
                            {song.relationshipType && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-teal-200/60 dark:bg-teal-900/60 font-semibold uppercase">
                                {song.relationshipType.replace('_', ' ')}
                              </span>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Stats & Service History Drawer */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    {timesUsedThisMonth > 0 ? (
                      <span className={getSongTagClass('used_this_month', 'rounded-full')}>
                        <CalendarCheck className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
                        <span>Used {timesUsedThisMonth}x this month</span>
                      </span>
                    ) : effectiveStats.timesUsed === 0 ? (
                      <span className={getSongTagClass('newly_added', 'rounded-full')}>
                        <Sparkles className="w-3 h-3 text-lime-600 dark:text-lime-400" />
                        <span>New (Unused)</span>
                      </span>
                    ) : (
                      <span className={getSongTagClass('recently_played', 'rounded-full')}>
                        <span>Last used: {effectiveStats.lastUsedDate || song.lastUsedDate}</span>
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => setExpandedHistoryId(isExpanded ? null : song.id)}
                    className="inline-flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    <span>Used {effectiveStats.timesUsed}x{effectiveStats.isFamilyMember ? ' (Family)' : ''}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Service History Expandable Drawer */}
                {isExpanded && (
                  <div className="mt-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1.5 animate-in fade-in duration-150">
                    <p className="font-bold text-slate-800 dark:text-slate-200">
                      Service Usage History
                    </p>
                    {song.serviceHistory && song.serviceHistory.length > 0 ? (
                      <ul className="space-y-1 text-slate-600 dark:text-slate-400 max-h-32 overflow-y-auto pr-1">
                        {song.serviceHistory.map((h, idx) => (
                          <li key={idx} className="flex items-center justify-between text-[11px] py-0.5 border-b border-slate-200/50 dark:border-slate-800/50 last:border-0">
                            <span>{h.serviceType}</span>
                            <span className="font-medium text-slate-500">{h.date}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-400 italic">No previous schedule history recorded.</p>
                    )}
                  </div>
                )}

              </div>
            );
          })
        )}
      </div>

      {/* Song Form Modal */}
      <SongFormModal
        isOpen={isModalOpen}
        songToEdit={editingSong}
        onClose={() => {
          setIsModalOpen(false);
          setEditingSong(null);
        }}
        onSave={() => {
          onRefreshSongs();
        }}
        onDeleteSong={(song) => {
          handleRequestDelete([song]);
        }}
        onViewExistingSong={(song) => {
          setEditingSong(song);
          setIsModalOpen(true);
        }}
        showToast={showToast}
      />

      {/* Bulk & Single Delete Confirmation Modal */}
      <Modal
        id="songs-bulk-delete-modal"
        isOpen={bulkDeleteConfig.isOpen}
        title={
          bulkDeleteConfig.targets.length === 1
            ? 'Delete this song from the Song Database?'
            : `Delete ${bulkDeleteConfig.targets.length} Selected Songs?`
        }
        message="Historical saved line-ups using this song will remain unchanged."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDanger={true}
        onConfirm={executeDelete}
        onClose={() =>
          setBulkDeleteConfig({ isOpen: false, targets: [], affectedSchedulesCount: 0, songsInUseCount: 0 })
        }
      />

      {/* Bulk Category Change Confirmation Modal */}
      {bulkCategoryConfig.isOpen && bulkCategoryConfig.targetCategory && (
        <Modal
          id="songs-bulk-category-modal"
          isOpen={bulkCategoryConfig.isOpen}
          title={
            bulkCategoryConfig.targets.length === 1
              ? `Change category of 1 song to ${bulkCategoryConfig.targetCategory === 'praise' ? 'Praise' : 'Worship'}?`
              : `Change category of ${bulkCategoryConfig.targets.length} selected songs to ${
                  bulkCategoryConfig.targetCategory === 'praise' ? 'Praise' : 'Worship'
                }?`
          }
          message={`Change the category of ${bulkCategoryConfig.targets.length} selected song${
            bulkCategoryConfig.targets.length > 1 ? 's' : ''
          } to ${bulkCategoryConfig.targetCategory === 'praise' ? 'Praise' : 'Worship'}?`}
          confirmLabel="Confirm"
          cancelLabel="Cancel"
          onConfirm={executeBulkCategoryChange}
          onClose={() => setBulkCategoryConfig({ isOpen: false, targets: [], targetCategory: null })}
        />
      )}

      {/* Unified Smart Song / Playlist Import Modal */}
      <SmartSongImportModal
        isOpen={isSmartImportOpen}
        onClose={() => setIsSmartImportOpen(false)}
        initialCategory="praise"
        onSongImportComplete={() => {
          onRefreshSongs();
          loadFamilies();
        }}
        onPlaylistImportComplete={() => {
          onRefreshSongs();
          loadFamilies();
        }}
        showToast={showToast}
      />

      {/* Song Family Manager Modal */}
      <SongFamilyModal
        isOpen={isFamilyModalOpen}
        familyToEdit={familyToEdit}
        initialSongs={familyToEdit ? undefined : songs.filter((s) => selectedIds.has(s.id))}
        allSongs={songs}
        allFamilies={songFamilies}
        onClose={() => {
          setIsFamilyModalOpen(false);
          setFamilyToEdit(null);
        }}
        onSaved={() => {
          loadFamilies();
          onRefreshSongs();
        }}
        showToast={showToast}
      />

      {/* Song Family Discovery Suggestions Modal */}
      <SongFamilySuggestionsModal
        isOpen={isSuggestionsModalOpen}
        suggestions={familySuggestions}
        onClose={() => setIsSuggestionsModalOpen(false)}
        onApplied={() => {
          loadFamilies();
          onRefreshSongs();
        }}
        showToast={showToast}
      />

      {/* Get Metadata Modal */}
      <GetMetadataModal
        isOpen={isMetadataModalOpen}
        song={metadataSong}
        onClose={() => {
          setIsMetadataModalOpen(false);
          setMetadataSong(null);
        }}
        onMetadataApplied={() => {
          onRefreshSongs();
          loadFamilies();
        }}
        showToast={showToast}
      />

      {/* Bulk Song Metadata Review & Correction Modal */}
      <BulkMetadataReviewModal
        isOpen={isBulkMetadataModalOpen}
        onClose={() => {
          setIsBulkMetadataModalOpen(false);
          setBulkMetadataInitialIds([]);
        }}
        songs={songs}
        onSongsUpdated={() => {
          onRefreshSongs();
          loadFamilies();
        }}
        showToast={showToast}
        initialSelectedSongIds={bulkMetadataInitialIds}
      />

      {/* Song Families Floating Modal Panel */}
      <SongFamiliesModal
        isOpen={isSongFamiliesModalOpen}
        onClose={() => {
          setIsSongFamiliesModalOpen(false);
          setTargetExpandedFamilyId(null);
        }}
        families={songFamilies}
        allSongs={songs}
        schedules={schedules}
        onCreateFamily={() => {
          setFamilyToEdit(null);
          setIsFamilyModalOpen(true);
        }}
        onEditFamily={(family) => {
          setFamilyToEdit(family);
          setIsFamilyModalOpen(true);
        }}
        onRefreshFamilies={loadFamilies}
        onRefreshSongs={onRefreshSongs}
        onEditSong={(song) => {
          setEditingSong(song);
          setIsModalOpen(true);
        }}
        onDetectFamilies={() => setIsSuggestionsModalOpen(true)}
        suggestionsCount={familySuggestions.length}
        showToast={showToast}
        initialExpandedFamilyId={targetExpandedFamilyId}
        triggerButtonRef={songFamiliesBtnRef}
      />

      {/* Same-Name Songs Floating Review Modal */}
      <SameNameSongsModal
        isOpen={isSameNameModalOpen}
        onClose={() => setIsSameNameModalOpen(false)}
        songs={songs}
        songFamilies={songFamilies}
        onSongsUpdated={() => {
          onRefreshSongs();
          loadFamilies();
        }}
        showToast={showToast}
      />

    </div>
  );
};

