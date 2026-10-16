import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Song, SongFamily, SongRelationshipType } from '../types';
import { getNormalizedBaseTitle } from '../utils/songFamilyUtils';
import { SongFamilyService } from '../services/songFamilyService';
import { SongService } from '../services/songService';
import { LineupHistoryService } from '../services/lineupHistoryService';
import { StorageService } from '../services/storage';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import { triggerHaptic } from '../utils/haptics';
import {
  X,
  Search,
  Layers,
  Sparkles,
  Check,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  Music,
  ExternalLink,
  Tag,
  ShieldCheck,
  Undo2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface SameNameSongsModalProps {
  isOpen: boolean;
  onClose: () => void;
  songs: Song[];
  songFamilies: SongFamily[];
  onSongsUpdated: () => void;
  showToast: (msg: string, type?: 'success' | 'danger' | 'info') => void;
}

export interface SameNameCandidateGroup {
  normalizedKey: string;
  displayTitle: string;
  songs: Song[];
  isAlreadySameFamily: boolean;
  sharedFamily?: SongFamily;
  hasFamilyConflict: boolean;
  isMarkedDistinct: boolean;
}

export const SameNameSongsModal: React.FC<SameNameSongsModalProps> = ({
  isOpen,
  onClose,
  songs,
  songFamilies,
  onSongsUpdated,
  showToast
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'pending' | 'grouped' | 'distinct' | 'all'>('pending');
  const [markedDistinctKeys, setMarkedDistinctKeys] = useState<Set<string>>(() =>
    new Set(StorageService.getMarkedDistinctSameNameKeys())
  );

  // Group config drawer state: which group is currently expanding the "Group as Family" configuration
  const [activeGroupingKey, setActiveGroupingKey] = useState<string | null>(null);
  const [selectedOriginalId, setSelectedOriginalId] = useState<string>('');
  const [versionRelationships, setVersionRelationships] = useState<Record<string, SongRelationshipType>>({});
  const [familyNotes, setFamilyNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Sync marked distinct keys when modal opens
  useEffect(() => {
    if (isOpen) {
      setMarkedDistinctKeys(new Set(StorageService.getMarkedDistinctSameNameKeys()));
      setActiveGroupingKey(null);
      setSearchQuery('');
    }
  }, [isOpen]);

  // Global Overlay Architecture registration
  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'same-name-songs-modal',
    isOpen,
    layer: OverlayLayer.MODAL,
    onClose,
    closeOnEscape: true
  });

  // Build high-performance O(N) map of songs by normalized base title
  const candidateGroups = useMemo<SameNameCandidateGroup[]>(() => {
    if (!songs || songs.length === 0) return [];

    const map = new Map<string, { displayTitle: string; songs: Song[] }>();

    for (const song of songs) {
      const normKey = getNormalizedBaseTitle(song.title).trim().toLowerCase();
      if (!normKey) continue;

      const existing = map.get(normKey);
      if (existing) {
        existing.songs.push(song);
      } else {
        map.set(normKey, {
          displayTitle: getNormalizedBaseTitle(song.title).trim(),
          songs: [song]
        });
      }
    }

    // Map of song ID to its family
    const songIdToFamily = new Map<string, SongFamily>();
    for (const fam of songFamilies) {
      for (const id of fam.versionIds) {
        songIdToFamily.set(id, fam);
      }
    }

    const groups: SameNameCandidateGroup[] = [];

    map.forEach((item, normKey) => {
      // Keep only groups with 2 or more songs sharing the base title
      if (item.songs.length < 2) return;

      // Check family relationships
      const familyIds = new Set<string>();
      let sharedFamily: SongFamily | undefined;

      for (const s of item.songs) {
        const fam = songIdToFamily.get(s.id) || (s.songFamilyId ? songFamilies.find((f) => f.id === s.songFamilyId) : undefined);
        if (fam) {
          familyIds.add(fam.id);
          sharedFamily = fam;
        }
      }

      const isAlreadySameFamily = familyIds.size === 1 && item.songs.every((s) => {
        const fam = songIdToFamily.get(s.id);
        return fam && fam.id === sharedFamily?.id;
      });

      const hasFamilyConflict = familyIds.size > 1;
      const isMarkedDistinct = markedDistinctKeys.has(normKey);

      groups.push({
        normalizedKey: normKey,
        displayTitle: item.displayTitle,
        songs: item.songs,
        isAlreadySameFamily: Boolean(isAlreadySameFamily),
        sharedFamily: isAlreadySameFamily ? sharedFamily : undefined,
        hasFamilyConflict,
        isMarkedDistinct
      });
    });

    // Sort: pending first, then by title
    return groups.sort((a, b) => {
      const aResolved = a.isAlreadySameFamily || a.isMarkedDistinct;
      const bResolved = b.isAlreadySameFamily || b.isMarkedDistinct;
      if (!aResolved && bResolved) return -1;
      if (aResolved && !bResolved) return 1;
      return a.displayTitle.localeCompare(b.displayTitle);
    });
  }, [songs, songFamilies, markedDistinctKeys]);

  // Filtered groups based on search & active tab
  const filteredGroups = useMemo(() => {
    return candidateGroups.filter((g) => {
      // Tab filter
      if (filterTab === 'pending' && (g.isAlreadySameFamily || g.isMarkedDistinct)) return false;
      if (filterTab === 'grouped' && !g.isAlreadySameFamily) return false;
      if (filterTab === 'distinct' && !g.isMarkedDistinct) return false;

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = g.displayTitle.toLowerCase().includes(q);
        const matchesArtist = g.songs.some((s) => (s.artist || '').toLowerCase().includes(q));
        return matchesTitle || matchesArtist;
      }

      return true;
    });
  }, [candidateGroups, filterTab, searchQuery]);

  // Statistics counters
  const stats = useMemo(() => {
    let pending = 0;
    let grouped = 0;
    let distinct = 0;

    for (const g of candidateGroups) {
      if (g.isAlreadySameFamily) {
        grouped++;
      } else if (g.isMarkedDistinct) {
        distinct++;
      } else {
        pending++;
      }
    }

    return { total: candidateGroups.length, pending, grouped, distinct };
  }, [candidateGroups]);

  // Initialize grouping configuration for a specific group
  const handleOpenGroupConfig = (group: SameNameCandidateGroup) => {
    setActiveGroupingKey(group.normalizedKey);
    // Pick the most likely original song (default to first or shortest title / not live)
    const sorted = [...group.songs].sort((a, b) => {
      const aIsVariant = /live|acoustic|cover|remix/i.test(a.title);
      const bIsVariant = /live|acoustic|cover|remix/i.test(b.title);
      if (!aIsVariant && bIsVariant) return -1;
      if (aIsVariant && !bIsVariant) return 1;
      return a.title.length - b.title.length;
    });

    const origId = sorted[0].id;
    setSelectedOriginalId(origId);

    const rels: Record<string, SongRelationshipType> = {};
    for (const s of group.songs) {
      if (s.id === origId) {
        rels[s.id] = 'ORIGINAL';
      } else {
        // If different artists, default to COVER
        const origSong = group.songs.find((x) => x.id === origId);
        const diffArtist = origSong?.artist && s.artist && origSong.artist.toLowerCase() !== s.artist.toLowerCase();
        rels[s.id] = diffArtist ? 'COVER' : 'VERSION';
      }
    }
    setVersionRelationships(rels);
    setFamilyNotes(`Grouped from Same-Name Songs scan ("${group.displayTitle}")`);
  };

  // Save the newly formed Song Family
  const handleSaveSongFamily = async (group: SameNameCandidateGroup) => {
    if (!selectedOriginalId) {
      showToast('Please select the Original Song for this family.', 'danger');
      return;
    }

    setIsSubmitting(true);
    try {
      const prevFamilies = await SongFamilyService.getSongFamilies();
      const prevSongs = await SongService.getSongs();
      const prevDistinct = new Set(markedDistinctKeys);

      await SongFamilyService.createSongFamily({
        name: group.displayTitle,
        songIds: group.songs.map((s) => s.id),
        originalSongId: selectedOriginalId,
        notes: familyNotes,
        versions: group.songs.map((s) => ({
          songId: s.id,
          relationshipType: versionRelationships[s.id] || (s.id === selectedOriginalId ? 'ORIGINAL' : 'VERSION')
        }))
      });

      // If it was marked distinct previously, unmark it
      if (markedDistinctKeys.has(group.normalizedKey)) {
        StorageService.markSameNameKeyAsDistinct(group.normalizedKey, false);
        setMarkedDistinctKeys((prev) => {
          const next = new Set(prev);
          next.delete(group.normalizedKey);
          return next;
        });
      }

      const nextFamilies = await SongFamilyService.getSongFamilies();
      const nextSongs = await SongService.getSongs();

      LineupHistoryService.pushAppAction({
        description: `Formed Song Family "${group.displayTitle}" from same-name scan`,
        undo: async () => {
          await SongFamilyService.saveSongFamilies(prevFamilies);
          await SongService.saveSongsList(prevSongs);
          StorageService.markSameNameKeyAsDistinct(group.normalizedKey, prevDistinct.has(group.normalizedKey));
          setMarkedDistinctKeys(prevDistinct);
          onSongsUpdated();
        },
        redo: async () => {
          await SongFamilyService.saveSongFamilies(nextFamilies);
          await SongService.saveSongsList(nextSongs);
          StorageService.markSameNameKeyAsDistinct(group.normalizedKey, false);
          onSongsUpdated();
        }
      });

      triggerHaptic('success');
      showToast(`Grouped ${group.songs.length} versions under Song Family "${group.displayTitle}".`, 'success');
      setActiveGroupingKey(null);
      onSongsUpdated();
    } catch (err) {
      console.error('Failed to create song family from same-name songs:', err);
      showToast('Failed to create Song Family. Please try again.', 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Mark group as different songs (different artists / unrelated compositions)
  const handleMarkAsDistinct = (group: SameNameCandidateGroup) => {
    StorageService.markSameNameKeyAsDistinct(group.normalizedKey, true);
    setMarkedDistinctKeys((prev) => new Set(prev).add(group.normalizedKey));

    LineupHistoryService.pushAppAction({
      description: `Marked "${group.displayTitle}" songs as separate compositions`,
      undo: () => {
        StorageService.markSameNameKeyAsDistinct(group.normalizedKey, false);
        setMarkedDistinctKeys((prev) => {
          const next = new Set(prev);
          next.delete(group.normalizedKey);
          return next;
        });
      },
      redo: () => {
        StorageService.markSameNameKeyAsDistinct(group.normalizedKey, true);
        setMarkedDistinctKeys((prev) => new Set(prev).add(group.normalizedKey));
      }
    });

    triggerHaptic('tap');
    showToast(`Marked "${group.displayTitle}" songs as separate compositions (different artists).`, 'info');
    if (activeGroupingKey === group.normalizedKey) {
      setActiveGroupingKey(null);
    }
  };

  // Unmark a previously distinct group
  const handleUnmarkDistinct = (group: SameNameCandidateGroup) => {
    StorageService.markSameNameKeyAsDistinct(group.normalizedKey, false);
    setMarkedDistinctKeys((prev) => {
      const next = new Set(prev);
      next.delete(group.normalizedKey);
      return next;
    });

    LineupHistoryService.pushAppAction({
      description: `Returned "${group.displayTitle}" to Pending Review`,
      undo: () => {
        StorageService.markSameNameKeyAsDistinct(group.normalizedKey, true);
        setMarkedDistinctKeys((prev) => new Set(prev).add(group.normalizedKey));
      },
      redo: () => {
        StorageService.markSameNameKeyAsDistinct(group.normalizedKey, false);
        setMarkedDistinctKeys((prev) => {
          const next = new Set(prev);
          next.delete(group.normalizedKey);
          return next;
        });
      }
    });

    triggerHaptic('tap');
    showToast(`Returned "${group.displayTitle}" to Pending Review.`, 'info');
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      style={{ zIndex }}
      data-overlay-id="same-name-songs-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto backdrop-enter-animation transition-opacity ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      onClick={isBlocked ? undefined : onClose}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="same-name-modal-title"
        className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col max-h-[92vh] my-auto modal-enter-animation"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#1b75bc]/10 dark:bg-[#1b75bc]/20 text-[#1b75bc] dark:text-[#54b0e2]">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="same-name-modal-title" className="font-black text-slate-900 dark:text-slate-100 text-base sm:text-lg tracking-tight">
                  Find Same-Name Songs
                </h3>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#1b75bc]/15 text-[#1b75bc] dark:text-[#54b0e2]">
                  {stats.total} Groups Found
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Identify songs with matching titles and explicitly decide if they are the same composition or different songs
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close same name songs dialog"
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar: Search & Tab Filters */}
        <div className="p-4 border-b border-slate-200/60 dark:border-white/5 bg-slate-50/40 dark:bg-slate-900/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search same-name groups by title or artist..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#1b75bc]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Segmented Filter Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/60 dark:bg-white/5 border border-slate-300/40 dark:border-white/5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setFilterTab('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                filterTab === 'pending'
                  ? 'bg-white dark:bg-slate-800 text-[#1b75bc] dark:text-[#54b0e2] shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <span>Pending Review</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                filterTab === 'pending'
                  ? 'bg-[#1b75bc]/15 text-[#1b75bc] dark:text-[#54b0e2]'
                  : 'bg-slate-300/60 dark:bg-white/10 text-slate-600 dark:text-slate-400'
              }`}>
                {stats.pending}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFilterTab('grouped')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                filterTab === 'grouped'
                  ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <span>Grouped</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                {stats.grouped}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFilterTab('distinct')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                filterTab === 'distinct'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <span>Distinct</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                {stats.distinct}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterTab === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              All ({stats.total})
            </button>
          </div>
        </div>

        {/* Candidate Groups List */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {filteredGroups.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2] flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {candidateGroups.length === 0
                  ? 'No Same-Name Songs Found'
                  : filterTab === 'pending'
                  ? 'All Same-Name Groups Have Been Reviewed'
                  : 'No Groups in this Category'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                {candidateGroups.length === 0
                  ? 'All songs in your repertoire have unique titles.'
                  : filterTab === 'pending'
                  ? 'Every pair or group sharing a title has either been organized into a Song Family or confirmed as separate compositions.'
                  : 'Try selecting a different filter tab or clearing your search.'}
              </p>
            </div>
          ) : (
            filteredGroups.map((group) => {
              const isConfiguring = activeGroupingKey === group.normalizedKey;

              return (
                <div
                  key={group.normalizedKey}
                  className="rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-slate-800/80 shadow-xs overflow-hidden transition-all"
                >
                  {/* Group Header */}
                  <div className="px-4 py-3 bg-slate-50/80 dark:bg-white/5 border-b border-slate-200/60 dark:border-white/5 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Music className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2] shrink-0" />
                      <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">
                        "{group.displayTitle}"
                      </h4>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-white/10 text-slate-700 dark:text-slate-300 shrink-0">
                        {group.songs.length} Songs
                      </span>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-2">
                      {group.isAlreadySameFamily && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <Check className="w-3.5 h-3.5" />
                          <span>Song Family: {group.sharedFamily?.name || group.displayTitle}</span>
                        </span>
                      )}

                      {group.isMarkedDistinct && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Confirmed Distinct (Different Artists)</span>
                        </span>
                      )}

                      {group.hasFamilyConflict && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Songs in Multiple Families</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Songs Comparison Grid */}
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {group.songs.map((song) => {
                      return (
                        <div
                          key={song.id}
                          className="p-3.5 rounded-xl border border-slate-200/70 dark:border-white/5 bg-slate-50/50 dark:bg-slate-850/50 space-y-2 flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <h5 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 line-clamp-1">
                                {song.title}
                              </h5>
                              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md shrink-0 ${
                                song.category === 'praise'
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                              }`}>
                                {song.category}
                              </span>
                            </div>

                            {/* Artist: Prominently highlighted for easy differentiation */}
                            <p className="text-xs font-semibold text-[#1b75bc] dark:text-[#54b0e2] mt-0.5">
                              by {song.artist || 'Unknown Artist'}
                            </p>

                            {/* Details meta row */}
                            <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                              {(song.key || song.originalKey) && (
                                <span className="font-mono font-bold bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                  Key: {song.key || song.originalKey}
                                </span>
                              )}
                              {song.ccliNumber && (
                                <span>CCLI #{song.ccliNumber}</span>
                              )}
                              <span>Played: {song.timesUsed}x</span>
                              {song.youtubeUrl && (
                                <a
                                  href={song.youtubeUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400 hover:underline"
                                >
                                  <span>YouTube</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>

                            {/* Lyrics snippet if present */}
                            {song.lyrics && (
                              <p className="mt-2 text-[11px] italic text-slate-600 dark:text-slate-400 line-clamp-2 bg-white/70 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-200/50 dark:border-white/5">
                                "{song.lyrics.split('\n').filter(Boolean).slice(0, 2).join(' / ')}"
                              </p>
                            )}
                          </div>

                          <div className="pt-2 border-t border-slate-200/50 dark:border-white/5 text-[10px] text-slate-400 flex items-center justify-between">
                            <span>ID: {song.id.slice(0, 10)}...</span>
                            <span>Added: {song.dateAdded || 'N/A'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Actions / Configuration Section */}
                  <div className="px-4 py-3 bg-slate-50/60 dark:bg-white/5 border-t border-slate-200/60 dark:border-white/5">
                    {!isConfiguring ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {group.isAlreadySameFamily
                            ? 'These songs are already linked in a Song Family.'
                            : group.isMarkedDistinct
                            ? 'These songs are acknowledged as separate compositions.'
                            : 'Choose whether these songs represent the same composition or different songs:'}
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Option A: Group as Family */}
                          {!group.isAlreadySameFamily && (
                            <button
                              type="button"
                              onClick={() => handleOpenGroupConfig(group)}
                              data-tts-label={`Group ${group.displayTitle} songs into a Song Family`}
                              className="btn-tactile inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1b75bc] hover:bg-[#165d97] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                            >
                              <Layers className="w-3.5 h-3.5" />
                              <span>Group as Song Family</span>
                            </button>
                          )}

                          {/* Option B: Mark as Different Songs */}
                          {!group.isMarkedDistinct && !group.isAlreadySameFamily && (
                            <button
                              type="button"
                              onClick={() => handleMarkAsDistinct(group)}
                              data-tts-label={`Mark ${group.displayTitle} songs as different songs`}
                              className="btn-tactile inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer"
                            >
                              <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                              <span>Mark as Different Songs</span>
                            </button>
                          )}

                          {/* Reset / Unmark if already distinct */}
                          {group.isMarkedDistinct && (
                            <button
                              type="button"
                              onClick={() => handleUnmarkDistinct(group)}
                              className="btn-tactile inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-600 dark:text-slate-300 text-xs font-semibold transition-all cursor-pointer"
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                              <span>Re-evaluate / Unmark</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Expanded Family Relationship Configuration Drawer */
                      <div className="space-y-3 pt-1">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-white/5">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
                            <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              Define Song Family Relationships for "{group.displayTitle}"
                            </h5>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveGroupingKey(null)}
                            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            Cancel
                          </button>
                        </div>

                        {/* Song Selection List */}
                        <div className="space-y-2">
                          {group.songs.map((song) => {
                            const isOrig = selectedOriginalId === song.id;
                            const rel = isOrig ? 'ORIGINAL' : versionRelationships[song.id] || 'COVER';

                            return (
                              <div
                                key={song.id}
                                className={`p-2.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors ${
                                  isOrig
                                    ? 'bg-[#1b75bc]/8 border-[#1b75bc]/30 dark:bg-[#1b75bc]/15 dark:border-[#54b0e2]/30'
                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <input
                                    type="radio"
                                    id={`orig-${song.id}`}
                                    name={`original-song-${group.normalizedKey}`}
                                    checked={isOrig}
                                    onChange={() => {
                                      setSelectedOriginalId(song.id);
                                      setVersionRelationships((prev) => ({
                                        ...prev,
                                        [song.id]: 'ORIGINAL'
                                      }));
                                    }}
                                    className="text-[#1b75bc] focus:ring-[#1b75bc] cursor-pointer"
                                  />
                                  <label htmlFor={`orig-${song.id}`} className="min-w-0 cursor-pointer">
                                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                      {song.title}
                                    </p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                      by <span className="font-semibold text-slate-700 dark:text-slate-300">{song.artist || 'Unknown'}</span>
                                      {isOrig && <span className="ml-2 font-bold text-[#1b75bc] dark:text-[#54b0e2]">(Designated Original)</span>}
                                    </p>
                                  </label>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                    Relationship:
                                  </span>
                                  {isOrig ? (
                                    <span className="text-xs font-black uppercase tracking-wider px-2 py-1 rounded bg-[#1b75bc]/15 text-[#1b75bc] dark:text-[#54b0e2]">
                                      ORIGINAL
                                    </span>
                                  ) : (
                                    <select
                                      value={rel}
                                      onChange={(e) => {
                                        const nextRel = e.target.value as SongRelationshipType;
                                        setVersionRelationships((prev) => ({
                                          ...prev,
                                          [song.id]: nextRel
                                        }));
                                      }}
                                      className="text-xs font-semibold py-1 px-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none cursor-pointer focus:ring-1 focus:ring-[#1b75bc]"
                                    >
                                      <option value="COVER">Cover Version</option>
                                      <option value="LIVE_VERSION">Live Recording</option>
                                      <option value="ACOUSTIC_VERSION">Acoustic Version</option>
                                      <option value="REMAKE">Remake / Modern Release</option>
                                      <option value="VERSION">General Variant</option>
                                    </select>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Notes input */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                            Family Notes (Optional)
                          </label>
                          <input
                            type="text"
                            value={familyNotes}
                            onChange={(e) => setFamilyNotes(e.target.value)}
                            placeholder="e.g. Original by Kari Jobe, popular cover by Bethel..."
                            className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/60 dark:border-white/5">
                          <button
                            type="button"
                            onClick={() => setActiveGroupingKey(null)}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleSaveSongFamily(group)}
                            className="btn-tactile inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#1b75bc] hover:bg-[#165d97] text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{isSubmitting ? 'Saving...' : 'Confirm & Save Song Family'}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Song records, IDs, lyrics, and history are preserved completely without automatic merging.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-[#1b75bc] hover:bg-[#165d97] rounded-xl transition-colors cursor-pointer shadow-2xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
