import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Song } from '../types';
import { SongService } from '../services/songService';
import { LineupHistoryService } from '../services/lineupHistoryService';
import {
  fetchMultiSourceMetadata,
  cleanVideoTitle,
  parseCandidateTitleAndArtist,
  ComprehensiveMetadata
} from '../services/musicMetadataService';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import { triggerHaptic } from '../utils/haptics';
import {
  X,
  Search,
  Sparkles,
  Check,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Music,
  Disc,
  ExternalLink,
  ShieldCheck,
  Loader2,
  Filter,
  RotateCcw,
  Undo2,
  Edit2
} from 'lucide-react';

interface BulkMetadataReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  songs: Song[];
  onSongsUpdated: () => void;
  showToast: (msg: string, type?: 'success' | 'danger' | 'info') => void;
  initialSelectedSongIds?: string[];
}

export interface FlaggedSongItem {
  song: Song;
  reasons: string[];
}

export interface ProposedMetadataMatch {
  songId: string;
  originalSong: Song;
  selected: boolean;
  proposedTitle: string;
  proposedArtist: string;
  proposedAlbum?: string;
  proposedCoverArtUrl?: string;
  proposedYear?: string;
  proposedDuration?: string;
  proposedIsrc?: string;
  verificationSource: string;
  hasMatch: boolean;
  confidence: 'high' | 'medium' | 'low';
}

export function detectSongMetadataIssues(song: Song): string[] {
  const issues: string[] = [];
  const lowerTitle = song.title.toLowerCase();
  const lowerArtist = (song.artist || '').trim().toLowerCase();

  // 1. Missing or placeholder artist
  if (!lowerArtist || lowerArtist === 'unknown artist' || lowerArtist === 'unknown' || lowerArtist === 'n/a') {
    issues.push('Missing Artist');
  }

  // 2. Combined Title & Artist in title string
  if (song.title.includes(' - ') || song.title.includes(' | ') || /\bby\s+[A-Z]/i.test(song.title)) {
    issues.push('Combined Title & Artist');
  }

  // 3. Cluttered video tags in title
  if (/\b(official\s*(music\s*)?video|lyrics?(\s*video)?|live(\s*worship)?|audio|4k|hd|visualizer|full\s*track)\b/i.test(lowerTitle)) {
    issues.push('Title Clutter / Tags');
  }

  // 4. Missing Album & Cover Art
  if (!song.coverArtUrl && !song.album) {
    issues.push('Missing Album & Art');
  }

  // 5. Missing streaming link
  if (!song.youtubeUrl && !song.youtubeId && !song.spotifyUrl && !song.appleMusicUrl) {
    issues.push('Missing Streaming Link');
  }

  return issues;
}

export const BulkMetadataReviewModal: React.FC<BulkMetadataReviewModalProps> = ({
  isOpen,
  onClose,
  songs,
  onSongsUpdated,
  showToast,
  initialSelectedSongIds
}) => {
  const [step, setStep] = useState<'select' | 'fetching' | 'review' | 'confirm'>('select');
  const [searchQuery, setSearchQuery] = useState('');
  const [issueFilter, setIssueFilter] = useState<'all_flagged' | 'missing_artist' | 'combined' | 'clutter' | 'all'>('all_flagged');
  const [selectedSongIds, setSelectedSongIds] = useState<Set<string>>(new Set());

  // Fetching & Results state
  const [fetchProgress, setFetchProgress] = useState<{ current: number; total: number; currentTitle: string }>({
    current: 0,
    total: 0,
    currentTitle: ''
  });
  const [proposedMatches, setProposedMatches] = useState<ProposedMetadataMatch[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const cancelFetchRef = useRef(false);

  // Compute flagged songs
  const flaggedItems = useMemo<FlaggedSongItem[]>(() => {
    return songs.map((song) => ({
      song,
      reasons: detectSongMetadataIssues(song)
    }));
  }, [songs]);

  // Initialize selection when opening
  useEffect(() => {
    if (isOpen) {
      setStep('select');
      setSearchQuery('');
      setIssueFilter('all_flagged');
      cancelFetchRef.current = false;

      if (initialSelectedSongIds && initialSelectedSongIds.length > 0) {
        setSelectedSongIds(new Set(initialSelectedSongIds));
      } else {
        // Preselect all songs that have any metadata issues!
        const autoSelected = new Set(
          flaggedItems.filter((item) => item.reasons.length > 0).map((item) => item.song.id)
        );
        setSelectedSongIds(autoSelected);
      }
    }
  }, [isOpen, initialSelectedSongIds, flaggedItems]);

  // Global Overlay Architecture registration
  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'bulk-metadata-review-modal',
    isOpen,
    layer: OverlayLayer.MODAL,
    onClose: step === 'fetching' ? () => {} : onClose,
    closeOnEscape: step !== 'fetching'
  });

  // Filtered flagged items based on search and issue category
  const filteredCandidates = useMemo(() => {
    return flaggedItems.filter(({ song, reasons }) => {
      // Issue filter
      if (issueFilter === 'all_flagged' && reasons.length === 0) return false;
      if (issueFilter === 'missing_artist' && !reasons.includes('Missing Artist')) return false;
      if (issueFilter === 'combined' && !reasons.includes('Combined Title & Artist')) return false;
      if (issueFilter === 'clutter' && !reasons.includes('Title Clutter / Tags')) return false;

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = song.title.toLowerCase().includes(q);
        const matchArtist = (song.artist || '').toLowerCase().includes(q);
        const matchReason = reasons.some((r) => r.toLowerCase().includes(q));
        if (!matchTitle && !matchArtist && !matchReason) return false;
      }

      return true;
    });
  }, [flaggedItems, issueFilter, searchQuery]);

  // Toggle selection
  const handleToggleSelect = (songId: string) => {
    triggerHaptic();
    setSelectedSongIds((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    triggerHaptic();
    setSelectedSongIds((prev) => {
      const next = new Set(prev);
      filteredCandidates.forEach((item) => next.add(item.song.id));
      return next;
    });
  };

  const handleDeselectAll = () => {
    triggerHaptic();
    setSelectedSongIds(new Set());
  };

  // Start Bulk Metadata Discovery
  const handleStartMetadataFetch = async () => {
    const targetSongs = songs.filter((s) => selectedSongIds.has(s.id));
    if (targetSongs.length === 0) {
      showToast('Please select at least one song to review metadata.', 'info');
      return;
    }

    setStep('fetching');
    cancelFetchRef.current = false;
    setFetchProgress({ current: 0, total: targetSongs.length, currentTitle: '' });

    const results: ProposedMetadataMatch[] = [];

    for (let i = 0; i < targetSongs.length; i++) {
      if (cancelFetchRef.current) break;

      const currentSong = targetSongs[i];
      setFetchProgress({
        current: i + 1,
        total: targetSongs.length,
        currentTitle: currentSong.title
      });

      try {
        // Query multi-source metadata (MusicBrainz as Primary, Deezer as Secondary Fallback)
        const meta = await fetchMultiSourceMetadata(currentSong.youtubeUrl || currentSong.title, currentSong);

        let verificationSource = 'Multi-Source';
        if (meta.sourcesSucceeded.includes('MusicBrainz (Primary)')) {
          verificationSource = 'MusicBrainz (Primary)';
        } else if (meta.sourcesSucceeded.includes('Deezer (Secondary Fallback)')) {
          verificationSource = 'Deezer (Secondary Fallback)';
        } else if (meta.sourcesSucceeded.includes('Apple Music')) {
          verificationSource = 'Apple Music';
        }

        const candidate = parseCandidateTitleAndArtist(currentSong.title, currentSong.artist);
        const resolvedTitle = meta.title || candidate.title || cleanVideoTitle(currentSong.title);
        const resolvedArtist =
          meta.artist && meta.artist !== 'Unknown Artist'
            ? meta.artist
            : candidate.artist && candidate.artist !== 'Unknown Artist'
            ? candidate.artist
            : currentSong.artist || 'Unknown Artist';

        const isMeaningfulUpdate =
          resolvedTitle.trim() !== currentSong.title.trim() ||
          resolvedArtist.trim() !== (currentSong.artist || '').trim() ||
          Boolean(meta.album && meta.album !== currentSong.album) ||
          Boolean(meta.coverArtUrl && meta.coverArtUrl !== currentSong.coverArtUrl);

        results.push({
          songId: currentSong.id,
          originalSong: currentSong,
          selected: isMeaningfulUpdate,
          proposedTitle: resolvedTitle,
          proposedArtist: resolvedArtist,
          proposedAlbum: meta.album || currentSong.album,
          proposedCoverArtUrl: meta.coverArtUrl || currentSong.coverArtUrl,
          proposedYear: meta.releaseYear,
          proposedDuration: meta.duration || currentSong.duration,
          proposedIsrc: meta.isrc || currentSong.isrc,
          verificationSource,
          hasMatch: isMeaningfulUpdate,
          confidence: meta.sourcesSucceeded.includes('MusicBrainz (Primary)')
            ? 'high'
            : meta.sourcesSucceeded.includes('Deezer (Secondary Fallback)')
            ? 'medium'
            : 'low'
        });
      } catch (err) {
        console.warn(`Metadata lookup error for ${currentSong.title}:`, err);
        // Fallback to local heuristic parsing
        const candidate = parseCandidateTitleAndArtist(currentSong.title, currentSong.artist);
        results.push({
          songId: currentSong.id,
          originalSong: currentSong,
          selected: false,
          proposedTitle: candidate.title || currentSong.title,
          proposedArtist: candidate.artist || currentSong.artist || 'Unknown Artist',
          proposedAlbum: currentSong.album,
          proposedCoverArtUrl: currentSong.coverArtUrl,
          verificationSource: 'Local Heuristics',
          hasMatch: false,
          confidence: 'low'
        });
      }
    }

    setProposedMatches(results);
    setStep('review');
  };

  // Toggle match inclusion in review step
  const handleToggleProposedMatch = (songId: string) => {
    triggerHaptic();
    setProposedMatches((prev) =>
      prev.map((item) => (item.songId === songId ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleUpdateProposedField = (songId: string, field: 'proposedTitle' | 'proposedArtist', val: string) => {
    setProposedMatches((prev) =>
      prev.map((item) => (item.songId === songId ? { ...item, [field]: val } : item))
    );
  };

  const selectedMatchesToApply = useMemo(() => {
    return proposedMatches.filter((m) => m.selected);
  }, [proposedMatches]);

  // Execute committed changes with undo/redo support
  const handleCommitMetadataUpdates = async () => {
    if (selectedMatchesToApply.length === 0) return;
    setIsApplying(true);

    try {
      const currentSongs = await SongService.getSongs();
      const previousSongsSnapshot = [...currentSongs];

      const matchMap = new Map<string, ProposedMetadataMatch>();
      selectedMatchesToApply.forEach((m) => matchMap.set(m.songId, m));

      const updatedSongs = currentSongs.map((s) => {
        const match = matchMap.get(s.id);
        if (!match) return s;

        return {
          ...s,
          title: match.proposedTitle.trim() || s.title,
          artist: match.proposedArtist.trim() || s.artist,
          album: match.proposedAlbum || s.album,
          coverArtUrl: match.proposedCoverArtUrl || s.coverArtUrl,
          duration: match.proposedDuration || s.duration,
          isrc: match.proposedIsrc || s.isrc
        };
      });

      await SongService.saveSongsList(updatedSongs);

      // Register with central Undo/Redo service
      LineupHistoryService.pushAppAction({
        description: `Applied verified metadata to ${selectedMatchesToApply.length} songs`,
        undo: async () => {
          await SongService.saveSongsList(previousSongsSnapshot);
          onSongsUpdated();
        },
        redo: async () => {
          await SongService.saveSongsList(updatedSongs);
          onSongsUpdated();
        }
      });

      showToast(`Successfully updated metadata for ${selectedMatchesToApply.length} song${selectedMatchesToApply.length > 1 ? 's' : ''}!`, 'success');
      onSongsUpdated();
      onClose();
    } catch (err: any) {
      console.error('Failed to commit bulk metadata:', err);
      showToast('Failed to apply metadata updates. Please try again.', 'danger');
    } finally {
      setIsApplying(false);
    }
  };

  if (!isOpen) return null;

  const content = (
    <div
      style={{ zIndex }}
      data-overlay-id="bulk-metadata-review-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs transition-opacity duration-200 overflow-hidden ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      onClick={step === 'fetching' ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-metadata-title"
    >
      <div
        className="w-full max-w-4xl wwcf-glass-modal rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden transform animate-in zoom-in-95 duration-200 max-h-[92vh] my-auto flex flex-col text-slate-900 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-900/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="bulk-metadata-title" className="text-sm font-bold text-slate-900 dark:text-white">
                  Bulk Song Metadata Review & Correction
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-[#1b75bc]/15 text-[#1b75bc] dark:text-[#54b0e2] border border-[#1b75bc]/20">
                  MusicBrainz & Deezer
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Identify songs with missing artist, combined title/artist, or video clutter and verify with authoritative databases.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={step === 'fetching' ? undefined : onClose}
            disabled={step === 'fetching'}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* STEP 1: SONG SELECTION */}
        {step === 'select' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Toolbar */}
            <div className="p-4 border-b border-slate-200/80 dark:border-white/10 bg-slate-50/40 dark:bg-slate-900/30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search flagged songs or artists..."
                  className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#1b75bc]/30 outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Issue Filters */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIssueFilter('all_flagged')}
                  className={`btn-tactile px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    issueFilter === 'all_flagged'
                      ? 'bg-[#1b75bc] text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  Flagged ({flaggedItems.filter((i) => i.reasons.length > 0).length})
                </button>
                <button
                  type="button"
                  onClick={() => setIssueFilter('missing_artist')}
                  className={`btn-tactile px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    issueFilter === 'missing_artist'
                      ? 'bg-[#1b75bc] text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  Missing Artist
                </button>
                <button
                  type="button"
                  onClick={() => setIssueFilter('combined')}
                  className={`btn-tactile px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    issueFilter === 'combined'
                      ? 'bg-[#1b75bc] text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  Combined Title/Artist
                </button>
                <button
                  type="button"
                  onClick={() => setIssueFilter('all')}
                  className={`btn-tactile px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    issueFilter === 'all'
                      ? 'bg-[#1b75bc] text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  All ({songs.length})
                </button>
              </div>
            </div>

            {/* Selection Quick Bar */}
            <div className="px-6 py-2 bg-slate-100/60 dark:bg-slate-800/40 border-b border-slate-200/60 dark:border-white/5 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 shrink-0">
              <span className="font-medium">
                {selectedSongIds.size} of {filteredCandidates.length} selected for metadata lookup
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  className="text-xs font-bold text-[#1b75bc] dark:text-[#54b0e2] hover:underline cursor-pointer"
                >
                  Select All Filtered
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                >
                  Clear Selection
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredCandidates.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2 opacity-80" />
                  <p className="text-sm font-bold">No songs matching the filter</p>
                  <p className="text-xs text-slate-500 mt-1">All filtered songs already have complete metadata.</p>
                </div>
              ) : (
                filteredCandidates.map(({ song, reasons }) => {
                  const isChecked = selectedSongIds.has(song.id);
                  return (
                    <div
                      key={song.id}
                      onClick={() => handleToggleSelect(song.id)}
                      className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                        isChecked
                          ? 'border-[#1b75bc]/60 bg-[#1b75bc]/5 dark:bg-[#1b75bc]/10 shadow-xs'
                          : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 bg-white/60 dark:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by row container
                          className="w-4 h-4 rounded border-slate-300 text-[#1b75bc] focus:ring-[#1b75bc] cursor-pointer"
                        />
                        {song.coverArtUrl ? (
                          <img
                            src={song.coverArtUrl}
                            alt=""
                            className="w-9 h-9 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-white/10"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 shrink-0">
                            <Music className="w-4 h-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {song.title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {song.artist && song.artist !== 'Unknown Artist' ? song.artist : 'Unknown Artist'}
                            {song.album && ` • ${song.album}`}
                          </p>
                        </div>
                      </div>

                      {/* Reason Badges */}
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0 justify-end">
                        {reasons.map((reason) => (
                          <span
                            key={reason}
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                              reason === 'Missing Artist'
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                                : reason === 'Combined Title & Artist'
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
                            }`}
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between gap-3 shrink-0">
              <span className="text-xs text-slate-500">
                Primary: MusicBrainz • Secondary Fallback: Deezer API
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-tactile px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleStartMetadataFetch}
                  disabled={selectedSongIds.size === 0}
                  className="btn-tactile inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-[#1b75bc] hover:bg-[#165d97] active:bg-[#144d7c] rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Inspect & Detect Metadata ({selectedSongIds.size})</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: FETCHING IN PROGRESS */}
        {step === 'fetching' && (
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-4 my-auto">
            <div className="relative">
              <div className="p-4 rounded-2xl bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2] animate-pulse">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Querying Authoritative Metadata Databases
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                Evaluating MusicBrainz recordings and Deezer catalog for clean title and artist separation.
              </p>
            </div>

            {/* Progress bar */}
            <div className="w-full max-w-md space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>
                  Processing {fetchProgress.current} of {fetchProgress.total}
                </span>
                <span>
                  {Math.round((fetchProgress.current / (fetchProgress.total || 1)) * 100)}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-[#1b75bc] transition-all duration-300 rounded-full"
                  style={{
                    width: `${Math.round((fetchProgress.current / (fetchProgress.total || 1)) * 100)}%`
                  }}
                />
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                Current: {fetchProgress.currentTitle}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                cancelFetchRef.current = true;
                setStep('review');
              }}
              className="btn-tactile px-4 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer mt-2"
            >
              Stop & Review Current Matches
            </button>
          </div>
        )}

        {/* STEP 3: REVIEW PROPOSED CORRECTIONS */}
        {step === 'review' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Top summary */}
            <div className="px-6 py-3 bg-slate-100/60 dark:bg-slate-800/40 border-b border-slate-200/60 dark:border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-white">
                  Proposed Corrections:
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {proposedMatches.filter((m) => m.hasMatch).length} matched online
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  {selectedMatchesToApply.length} selected to apply
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setProposedMatches((prev) => prev.map((m) => ({ ...m, selected: m.hasMatch })));
                  }}
                  className="text-xs font-bold text-[#1b75bc] dark:text-[#54b0e2] hover:underline cursor-pointer"
                >
                  Select All Matched
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => {
                    setProposedMatches((prev) => prev.map((m) => ({ ...m, selected: false })));
                  }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Comparison Cards List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {proposedMatches.map((match) => (
                <div
                  key={match.songId}
                  className={`p-4 rounded-xl border transition-all ${
                    match.selected
                      ? 'border-[#1b75bc]/60 bg-[#1b75bc]/5 dark:bg-[#1b75bc]/10 shadow-xs'
                      : 'border-slate-200 dark:border-white/10 bg-white/50 dark:bg-slate-900/50 opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={match.selected}
                        onChange={() => handleToggleProposedMatch(match.songId)}
                        className="w-4 h-4 rounded border-slate-300 text-[#1b75bc] focus:ring-[#1b75bc] cursor-pointer"
                      />
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {match.selected ? 'Selected for Update' : 'Skip this song'}
                      </span>
                    </label>

                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10">
                        Source: {match.verificationSource}
                      </span>
                      {match.confidence === 'high' && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          High Confidence
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Side-by-Side Diff */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* Current Record */}
                    <div className="p-3 rounded-lg bg-slate-100/70 dark:bg-slate-800/50 border border-slate-200/60 dark:border-white/5 space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Current Record
                      </p>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Title:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {match.originalSong.title}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Artist:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {match.originalSong.artist || 'Unknown Artist'}
                        </span>
                      </div>
                      {match.originalSong.album && (
                        <div>
                          <span className="text-[10px] text-slate-400 block">Album:</span>
                          <span className="text-slate-600 dark:text-slate-400">{match.originalSong.album}</span>
                        </div>
                      )}
                    </div>

                    {/* Proposed Verified Record */}
                    <div className="p-3 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-[#1b75bc]/40 space-y-2 shadow-xs">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#1b75bc] dark:text-[#54b0e2] flex items-center justify-between">
                        <span>Proposed Verified Metadata</span>
                        <Edit2 className="w-3 h-3 text-slate-400" />
                      </p>

                      {/* Editable Title */}
                      <div>
                        <label className="text-[10px] text-slate-500 block font-semibold mb-0.5">
                          Verified Title:
                        </label>
                        <input
                          type="text"
                          value={match.proposedTitle}
                          onChange={(e) => handleUpdateProposedField(match.songId, 'proposedTitle', e.target.value)}
                          className="w-full px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-[#1b75bc] outline-none font-semibold"
                        />
                      </div>

                      {/* Editable Artist */}
                      <div>
                        <label className="text-[10px] text-slate-500 block font-semibold mb-0.5">
                          Verified Artist:
                        </label>
                        <input
                          type="text"
                          value={match.proposedArtist}
                          onChange={(e) => handleUpdateProposedField(match.songId, 'proposedArtist', e.target.value)}
                          className="w-full px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-[#1b75bc] outline-none font-semibold"
                        />
                      </div>

                      {/* Album & Cover Art preview */}
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-white/5">
                        {match.proposedCoverArtUrl && (
                          <img
                            src={match.proposedCoverArtUrl}
                            alt=""
                            className="w-8 h-8 rounded-md object-cover border border-slate-200 dark:border-white/10 shrink-0"
                          />
                        )}
                        <div className="min-w-0 text-[11px] text-slate-600 dark:text-slate-400">
                          {match.proposedAlbum ? (
                            <p className="truncate">Album: {match.proposedAlbum}</p>
                          ) : (
                            <p className="text-slate-400 italic">No album specified</p>
                          )}
                          {match.proposedYear && <span>Released: {match.proposedYear}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setStep('select')}
                className="btn-tactile px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
              >
                Back to Selection
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-tactile px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setStep('confirm')}
                  disabled={selectedMatchesToApply.length === 0}
                  className="btn-tactile inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-[#1b75bc] hover:bg-[#165d97] active:bg-[#144d7c] rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Apply Verified Metadata ({selectedMatchesToApply.length})</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: EXPLICIT CONFIRMATION */}
        {step === 'confirm' && (
          <div className="p-6 space-y-4 my-auto">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <div>
                <h4 className="text-sm font-bold">Confirm Metadata Application</h4>
                <p className="text-xs mt-0.5">
                  You are about to update {selectedMatchesToApply.length} song{selectedMatchesToApply.length > 1 ? 's' : ''} with verified title, artist, and album details.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 space-y-2 text-xs">
              <p className="font-bold text-slate-900 dark:text-white">Protected Business Rules:</p>
              <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-400">
                <li>Historical saved line-ups will continue to work seamlessly.</li>
                <li>Song families and ID relationships will remain intact.</li>
                <li>An Undo action will be recorded in your App History so you can easily revert anytime.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('review')}
                disabled={isApplying}
                className="btn-tactile px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
              >
                Back to Review
              </button>
              <button
                type="button"
                onClick={handleCommitMetadataUpdates}
                disabled={isApplying}
                className="btn-tactile inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-[#1b75bc] hover:bg-[#165d97] active:bg-[#144d7c] rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-40"
              >
                {isApplying ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Applying Changes...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Confirm & Apply Verified Metadata</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
