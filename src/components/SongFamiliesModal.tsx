import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Layers,
  Folder,
  FolderOpen,
  Plus,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Star,
  Unlink,
  Edit3,
  Trash2,
  Music,
  Sparkles,
  Calendar,
  Key
} from 'lucide-react';
import { Song, SongFamily, SongRelationshipType } from '../types';
import { SongFamilyService } from '../services/songFamilyService';
import { SongService } from '../services/songService';
import { LineupHistoryService } from '../services/lineupHistoryService';
import { triggerHaptic } from '../utils/haptics';
import { speechAssistant } from '../utils/speechAssistant';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';

interface SongFamiliesModalProps {
  isOpen: boolean;
  onClose: () => void;
  families: SongFamily[];
  allSongs: Song[];
  schedules?: any[];
  onCreateFamily: () => void;
  onEditFamily: (family: SongFamily) => void;
  onRefreshFamilies: () => void;
  onRefreshSongs: () => void;
  onEditSong: (song: Song) => void;
  onDetectFamilies?: () => void;
  suggestionsCount?: number;
  showToast: (message: string, type?: 'success' | 'danger' | 'info') => void;
  initialExpandedFamilyId?: string | null;
  triggerButtonRef?: React.RefObject<HTMLElement | null>;
}

export const SongFamiliesModal: React.FC<SongFamiliesModalProps> = ({
  isOpen,
  onClose,
  families,
  allSongs,
  onCreateFamily,
  onEditFamily,
  onRefreshFamilies,
  onRefreshSongs,
  onEditSong,
  onDetectFamilies,
  suggestionsCount = 0,
  showToast,
  initialExpandedFamilyId = null,
  triggerButtonRef
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFamilyIds, setExpandedFamilyIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (initialExpandedFamilyId) {
      initial.add(initialExpandedFamilyId);
    }
    return initial;
  });
  const [dissolvingFamilyId, setDissolvingFamilyId] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'song-families-modal',
    isOpen,
    layer: OverlayLayer.MODAL,
    onClose,
    closeOnEscape: true
  });

  // Sync initialExpandedFamilyId whenever it changes or modal opens
  useEffect(() => {
    if (isOpen && initialExpandedFamilyId) {
      setExpandedFamilyIds((prev) => {
        const next = new Set(prev);
        next.add(initialExpandedFamilyId);
        return next;
      });
    }
  }, [isOpen, initialExpandedFamilyId]);

  // Handle Focus Trapping when topmost
  useEffect(() => {
    if (!isOpen) return;

    // Focus first interactive element or container if topmost
    const timer = setTimeout(() => {
      if (modalRef.current && isTopmost) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        }
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && modalRef.current && isTopmost) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isTopmost]);

  // Restore focus to trigger button on close
  const prevOpenRef = useRef(isOpen);
  useEffect(() => {
    if (prevOpenRef.current && !isOpen) {
      if (triggerButtonRef?.current) {
        triggerButtonRef.current.focus();
      } else {
        const trigger = document.querySelector('[data-tour="song-families-btn"]') as HTMLElement | null;
        if (trigger) trigger.focus();
      }
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, triggerButtonRef]);

  // Announce modal opening to speech assistant & screen readers
  useEffect(() => {
    if (isOpen) {
      speechAssistant.speak(
        `Song Families panel opened with ${families.length} families. Use Tab or Arrow keys to browse, and Escape to close.`,
        { priority: 'interactive' }
      );
    }
  }, [isOpen, families.length]);

  // Lock background body scroll while the Song Families panel is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  const toggleExpand = (familyId: string) => {
    triggerHaptic('selection');
    const fam = families.find((f) => f.id === familyId);
    const willExpand = !expandedFamilyIds.has(familyId);
    if (fam) {
      speechAssistant.speak(`${fam.name}, ${willExpand ? 'expanded' : 'collapsed'}`, { priority: 'interactive' });
    }
    setExpandedFamilyIds((prev) => {
      const next = new Set(prev);
      if (next.has(familyId)) {
        next.delete(familyId);
      } else {
        next.add(familyId);
      }
      return next;
    });
  };

  const expandAll = () => {
    triggerHaptic('tap');
    speechAssistant.speak('All song families expanded', { priority: 'interactive' });
    setExpandedFamilyIds(new Set(families.map((f) => f.id)));
  };

  const collapseAll = () => {
    triggerHaptic('tap');
    speechAssistant.speak('All song families collapsed', { priority: 'interactive' });
    setExpandedFamilyIds(new Set());
  };

  const handleFamilyHeaderKeyDown = (e: React.KeyboardEvent, index: number, familyId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpand(familyId);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const headers = modalRef.current?.querySelectorAll<HTMLElement>('[data-family-header="true"]');
      if (headers && headers.length > index + 1) {
        headers[index + 1].focus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const headers = modalRef.current?.querySelectorAll<HTMLElement>('[data-family-header="true"]');
      if (headers && index > 0) {
        headers[index - 1].focus();
      }
    }
  };

  // Filtered families based on search query
  const filteredFamilies = useMemo(() => {
    if (!searchQuery.trim()) return families;
    const q = searchQuery.toLowerCase().trim();

    return families.filter((fam) => {
      if (fam.name.toLowerCase().includes(q)) return true;
      if (fam.notes && fam.notes.toLowerCase().includes(q)) return true;

      // Check member songs
      const memberSongs = fam.versionIds
        .map((id) => allSongs.find((s) => s.id === id))
        .filter(Boolean) as Song[];

      return memberSongs.some(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          (s.key && s.key.toLowerCase().includes(q))
      );
    });
  }, [families, allSongs, searchQuery]);

  // Handle unlinking single song from a family
  const handleRemoveSongFromFamily = async (
    family: SongFamily,
    song: Song,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    try {
      const prevFamilies = await SongFamilyService.getSongFamilies();
      const prevSongs = await SongService.getSongs();

      await SongFamilyService.unlinkSongFromFamily(song.id);

      LineupHistoryService.pushAppAction({
        description: `Unlinked "${song.title}" from Song Family "${family.name}"`,
        undo: async () => {
          await SongFamilyService.saveSongFamilies(prevFamilies);
          await SongService.saveSongsList(prevSongs);
          onRefreshFamilies();
          onRefreshSongs();
        },
        redo: async () => {
          await SongFamilyService.unlinkSongFromFamily(song.id);
          onRefreshFamilies();
          onRefreshSongs();
        }
      });

      showToast(`"${song.title}" unlinked from Song Family "${family.name}". Song remains in database.`, 'info');
      onRefreshFamilies();
      onRefreshSongs();
    } catch (err) {
      console.error('Failed to unlink song from family:', err);
      showToast('Failed to unlink song from family.', 'danger');
    }
  };

  // Handle setting a song as original in family
  const handleSetAsOriginal = async (
    family: SongFamily,
    songId: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    try {
      const prevFamilies = await SongFamilyService.getSongFamilies();

      const updatedVersions = (family.versions || []).map((v) => ({
        ...v,
        relationshipType:
          v.songId === songId
            ? ('ORIGINAL' as SongRelationshipType)
            : v.relationshipType === 'ORIGINAL'
            ? ('VERSION' as SongRelationshipType)
            : v.relationshipType
      }));

      if (!updatedVersions.some((v) => v.songId === songId)) {
        updatedVersions.push({
          songId,
          relationshipType: 'ORIGINAL',
          confidence: 'high'
        });
      }

      const updatedFamily: SongFamily = {
        ...family,
        originalSongId: songId,
        versions: updatedVersions
      };

      await SongFamilyService.updateSongFamily(updatedFamily);

      LineupHistoryService.pushAppAction({
        description: `Set original version for family "${family.name}"`,
        undo: async () => {
          await SongFamilyService.saveSongFamilies(prevFamilies);
          onRefreshFamilies();
          onRefreshSongs();
        },
        redo: async () => {
          await SongFamilyService.updateSongFamily(updatedFamily);
          onRefreshFamilies();
          onRefreshSongs();
        }
      });

      showToast('Original version updated.', 'success');
      onRefreshFamilies();
      onRefreshSongs();
    } catch (err) {
      console.error('Failed to set original version:', err);
      showToast('Failed to update original version.', 'danger');
    }
  };

  // Handle dissolving family
  const handleDissolveFamily = async (family: SongFamily, e: React.MouseEvent) => {
    e.stopPropagation();
    setDissolvingFamilyId(family.id);
  };

  const confirmDissolve = async (family: SongFamily) => {
    try {
      const prevFamilies = await SongFamilyService.getSongFamilies();
      const prevSongs = await SongService.getSongs();

      await SongFamilyService.deleteSongFamily(family.id);

      LineupHistoryService.pushAppAction({
        description: `Dissolved Song Family "${family.name}"`,
        undo: async () => {
          await SongFamilyService.saveSongFamilies(prevFamilies);
          await SongService.saveSongsList(prevSongs);
          onRefreshFamilies();
          onRefreshSongs();
        },
        redo: async () => {
          await SongFamilyService.deleteSongFamily(family.id);
          onRefreshFamilies();
          onRefreshSongs();
        }
      });

      showToast(`Song Family "${family.name}" dissolved. Member songs remain in database.`, 'info');
      setDissolvingFamilyId(null);
      onRefreshFamilies();
      onRefreshSongs();
    } catch (err) {
      console.error('Failed to dissolve family:', err);
      showToast('Failed to dissolve Song Family.', 'danger');
    }
  };

  // Helper to get member songs for a family
  const getFamilySongs = (family: SongFamily): { song: Song; relationshipType: SongRelationshipType; isOriginal: boolean }[] => {
    return family.versionIds
      .map((sid) => {
        const song = allSongs.find((s) => s.id === sid);
        if (!song) return null;
        const verRef = family.versions?.find((v) => v.songId === sid);
        const isOriginal = family.originalSongId === sid || verRef?.relationshipType === 'ORIGINAL';
        const relationshipType: SongRelationshipType =
          verRef?.relationshipType || (isOriginal ? 'ORIGINAL' : 'VERSION');
        return { song, relationshipType, isOriginal };
      })
      .filter(Boolean) as { song: Song; relationshipType: SongRelationshipType; isOriginal: boolean }[];
  };

  // Helper to render relationship badge
  const renderRelationshipBadge = (rel: SongRelationshipType, isOriginal: boolean) => {
    if (isOriginal || rel === 'ORIGINAL') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
          Original
        </span>
      );
    }
    if (rel === 'COVER') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
          Cover
        </span>
      );
    }
    if (rel === 'ACOUSTIC_VERSION') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          Acoustic
        </span>
      );
    }
    if (rel === 'LIVE_VERSION') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          Live
        </span>
      );
    }
    if (rel === 'REMAKE') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-pink-100 dark:bg-pink-950/80 text-pink-800 dark:text-pink-300 border border-pink-200 dark:border-pink-800">
          Remake
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
        Version
      </span>
    );
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      style={{ zIndex }}
      data-overlay-id="song-families-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/75 backdrop-blur-xs backdrop-enter-animation transition-opacity duration-200 ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      onClick={isBlocked ? undefined : onClose}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="song-families-modal-title"
        aria-describedby="song-families-modal-desc"
        className="relative w-full max-w-2xl wwcf-glass-modal rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[88vh] my-auto transform modal-enter-animation text-slate-900 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Live region for screen readers */}
        <div aria-live="polite" className="sr-only">
          {searchQuery
            ? `${filteredFamilies.length} song families matching ${searchQuery}`
            : `Showing ${families.length} song families`}
        </div>

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#5aa7e8] shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="song-families-modal-title" className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  Song Families
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#5aa7e8] border border-[#1b75bc]/20">
                  {families.length} {families.length === 1 ? 'Family' : 'Families'}
                </span>
              </div>
              <p id="song-families-modal-desc" className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Group related versions, covers, and acoustic arrangements of the same song.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Song Families panel"
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Collapse Toolbar (shown when families exist) */}
        {families.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-3 border-b border-slate-100 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Song Families by name, version, or artist..."
                className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/80 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#1b75bc]/30 focus:border-[#1b75bc] outline-none transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0 text-xs">
              <button
                type="button"
                onClick={expandAll}
                className="px-2 py-1 font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
              >
                Expand All
              </button>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <button
                type="button"
                onClick={collapseAll}
                className="px-2 py-1 font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
              >
                Collapse All
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Modal Content */}
        <div className="p-4 sm:p-5 overflow-y-auto overscroll-contain flex-1 min-h-0 space-y-3">
          {/* Empty State when 0 families exist */}
          {families.length === 0 ? (
            <div className="py-10 px-4 text-center bg-slate-50/50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto shadow-xs">
                <Folder className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  No Song Families Yet
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Group alternate recordings, covers, and versions of the same composition.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={onCreateFamily}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Song Family</span>
                </button>
                {suggestionsCount > 0 && onDetectFamilies && (
                  <button
                    type="button"
                    onClick={onDetectFamilies}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/80 hover:bg-amber-100 dark:hover:bg-amber-900/80 border border-amber-200 dark:border-amber-800 rounded-xl transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                    <span>Auto-Detect ({suggestionsCount})</span>
                  </button>
                )}
              </div>
            </div>
          ) : filteredFamilies.length === 0 ? (
            /* Search returned 0 families */
            <div className="py-8 text-center bg-slate-50/50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                No Song Families match &ldquo;{searchQuery}&rdquo;
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-3 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/80 rounded-lg hover:bg-indigo-100 transition-colors cursor-pointer"
              >
                Clear Search Filter
              </button>
            </div>
          ) : (
            /* Family Cards List */
            filteredFamilies.map((family, index) => {
              const isExpanded = expandedFamilyIds.has(family.id);
              const familySongs = getFamilySongs(family);
              const totalFamilyUsage = familySongs.reduce((acc, curr) => acc + (curr.song.timesUsed || 0), 0);

              return (
                <div
                  key={family.id}
                  data-family-id={family.id}
                  data-family-name={family.name}
                  data-family-count={familySongs.length}
                  className={`rounded-xl border transition-all duration-150 overflow-hidden ${
                    isExpanded
                      ? 'bg-white dark:bg-slate-800/95 border-indigo-300 dark:border-indigo-800/80 shadow-xs'
                      : 'bg-white dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
                  }`}
                >
                  {/* Family Header */}
                  <div
                    role="button"
                    tabIndex={0}
                    data-family-header="true"
                    aria-expanded={isExpanded}
                    aria-label={`${family.name}, ${familySongs.length} versions. Press Enter to ${isExpanded ? 'collapse' : 'expand'}, or use Up and Down arrow keys to navigate families.`}
                    onKeyDown={(e) => handleFamilyHeaderKeyDown(e, index, family.id)}
                    onClick={() => toggleExpand(family.id)}
                    className="p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer select-none focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`p-2 rounded-lg shrink-0 transition-colors ${
                          isExpanded
                            ? 'bg-indigo-600 text-white'
                            : 'bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400'
                        }`}
                      >
                        {isExpanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                            {family.name}
                          </h4>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/60">
                            {familySongs.length} {familySongs.length === 1 ? 'version' : 'versions'}
                          </span>
                          {totalFamilyUsage > 0 && (
                            <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300">
                              <Calendar className="w-2.5 h-2.5 text-slate-400" />
                              Used {totalFamilyUsage}x
                            </span>
                          )}
                        </div>
                        {family.notes && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {family.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions & Chevron */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditFamily(family);
                        }}
                        aria-label={`Edit Song Family ${family.name}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700/80 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors cursor-pointer"
                        title="Edit family name, notes, or add versions"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleDissolveFamily(family, e)}
                        aria-label={`Dissolve Song Family ${family.name}`}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors cursor-pointer"
                        title="Dissolve family (songs remain in database)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="p-1 text-slate-400 dark:text-slate-500">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {/* Inline Confirmation for Dissolving Family */}
                  {dissolvingFamilyId === family.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="mx-3.5 mb-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                    >
                      <div className="space-y-0.5">
                        <p className="font-bold text-rose-800 dark:text-rose-200 text-xs">
                          Dissolve Song Family &ldquo;{family.name}&rdquo;?
                        </p>
                        <p className="text-rose-600 dark:text-rose-400 text-[11px]">
                          All songs remain in the Song Database as independent entries.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setDissolvingFamilyId(null)}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmDissolve(family)}
                          className="px-2.5 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                        >
                          Confirm Dissolve
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-3.5 sm:px-4 pb-3.5 pt-2 border-t border-slate-100 dark:border-slate-700/80 space-y-2.5">
                      {family.notes && (
                        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">Notes: </span>
                          {family.notes}
                        </div>
                      )}

                      <div className="space-y-1.5">
                        {familySongs.length === 0 ? (
                          <div className="p-4 text-center rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-400">
                            No member songs in this family.
                          </div>
                        ) : (
                          familySongs.map(({ song, relationshipType, isOriginal }) => (
                            <div
                              key={song.id}
                              data-song-id={song.id}
                              data-song-title={song.title}
                              data-song-artist={song.artist}
                              data-song-key={song.key || ''}
                              className={`p-2.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors ${
                                isOriginal
                                  ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-900/50'
                                  : 'bg-slate-50/60 dark:bg-slate-900/40 border-slate-200/80 dark:border-slate-800'
                              }`}
                            >
                              {/* Song Info */}
                              <div className="flex items-center gap-2.5 min-w-0">
                                {song.thumbnailUrl ? (
                                  <img
                                    src={song.thumbnailUrl}
                                    alt={song.title}
                                    referrerPolicy="no-referrer"
                                    className="w-8 h-8 rounded-md object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                                    <Music className="w-3.5 h-3.5" />
                                  </div>
                                )}

                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                      {song.title}
                                    </span>
                                    {renderRelationshipBadge(relationshipType, isOriginal)}
                                    {song.key && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                        <Key className="w-2.5 h-2.5 text-slate-400" />
                                        {song.key}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                    <span>{song.artist || 'Unknown Artist'}</span>
                                    {song.bpm && <span>• {song.bpm} BPM</span>}
                                    <span>• Used {song.timesUsed || 0}x</span>
                                  </div>
                                </div>
                              </div>

                              {/* Controls */}
                              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                                {!isOriginal && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleSetAsOriginal(family, song.id, e)}
                                    aria-label={`Mark ${song.title} as original in ${family.name}`}
                                    className="px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/60 hover:bg-amber-200/80 rounded transition-colors cursor-pointer"
                                    title="Mark as Original composition"
                                  >
                                    Mark Original
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEditSong(song);
                                  }}
                                  aria-label={`Edit ${song.title} in database`}
                                  className="px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
                                  title="Edit song in database"
                                >
                                  Edit Song
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => handleRemoveSongFromFamily(family, song, e)}
                                  aria-label={`Unlink ${song.title} from ${family.name}`}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded transition-colors cursor-pointer"
                                  title="Unlink song from this family (remains in database)"
                                >
                                  <Unlink className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Footer for this specific family */}
                      <div className="pt-1.5 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditFamily(family);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg transition-colors cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add / Manage Songs in Family</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Bottom Action Footer */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <div>
            {suggestionsCount > 0 && onDetectFamilies && (
              <button
                type="button"
                onClick={onDetectFamilies}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/80 hover:bg-amber-100 dark:hover:bg-amber-900/80 border border-amber-200/80 dark:border-amber-800/80 rounded-xl transition-colors cursor-pointer"
                title="Auto-detect possible Song Families based on composition verification"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                <span>Auto-Detect Families ({suggestionsCount})</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCreateFamily}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#1b75bc] hover:bg-[#16629e] rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Song Family</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
