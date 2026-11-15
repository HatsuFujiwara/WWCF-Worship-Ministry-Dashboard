import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Member, Song, SongFamiliarity, FamiliarityLevel } from '../types';
import { FamiliarityService } from '../services/familiarityService';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import {
  X,
  Award,
  Search,
  Filter,
  Users,
  Music,
  CheckCircle2,
  Clock,
  Sparkles,
  BookOpen,
  Info
} from 'lucide-react';

interface SongFamiliarityModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Member[];
  songs: Song[];
  initialSongId?: string;
  initialMemberId?: string;
  showToast: (text: string, type?: 'success' | 'danger' | 'info') => void;
}

const FAMILIARITY_LEVELS: { level: FamiliarityLevel; label: string; color: string; desc: string }[] = [
  {
    level: 'confident',
    label: 'Confident',
    color: 'bg-emerald-500 text-white',
    desc: 'Ready for live leading/playing without sheet music'
  },
  {
    level: 'familiar',
    label: 'Familiar',
    color: 'bg-blue-500 text-white',
    desc: 'Practiced and comfortable with standard chord/vocal cues'
  },
  {
    level: 'learning',
    label: 'Learning',
    color: 'bg-amber-500 text-white',
    desc: 'Currently learning chords, lyrics, or harmonies'
  },
  {
    level: 'unfamiliar',
    label: 'Unfamiliar',
    color: 'bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200',
    desc: 'New or not yet rehearsed'
  }
];

export const SongFamiliarityModal: React.FC<SongFamiliarityModalProps> = ({
  isOpen,
  onClose,
  members,
  songs,
  initialSongId,
  initialMemberId,
  showToast
}) => {
  const [selectedMemberId, setSelectedMemberId] = useState<string>(() => initialMemberId || (members[0]?.id || ''));
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'praise' | 'worship'>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');

  const [familiarityList, setFamiliarityList] = useState<SongFamiliarity[]>(() =>
    FamiliarityService.getFamiliarityListSync()
  );

  useEffect(() => {
    if (isOpen) {
      setFamiliarityList(FamiliarityService.getFamiliarityListSync());
      if (initialMemberId) {
        setSelectedMemberId(initialMemberId);
      } else if (!selectedMemberId && members[0]?.id) {
        setSelectedMemberId(members[0].id);
      }
    }
  }, [isOpen, initialMemberId, members, selectedMemberId]);

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'song-familiarity-modal',
    isOpen,
    layer: OverlayLayer.MODAL,
    onClose,
    closeOnEscape: true
  });

  // Current member's familiarity map
  const memberFamiliarityMap = useMemo(() => {
    const map = new Map<string, FamiliarityLevel>();
    familiarityList
      .filter((item) => item.memberId === selectedMemberId)
      .forEach((item) => {
        map.set(item.songId, item.level);
      });
    return map;
  }, [familiarityList, selectedMemberId]);

  // Selected member
  const currentMember = useMemo(
    () => members.find((m) => m.id === selectedMemberId) || members[0],
    [members, selectedMemberId]
  );

  // Filtered songs
  const filteredSongs = useMemo(() => {
    return songs.filter((s) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = s.title.toLowerCase().includes(q);
        const matchesArtist = (s.artist || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesArtist) return false;
      }

      if (categoryFilter !== 'all') {
        if (s.category !== categoryFilter && s.category !== 'both') return false;
      }

      if (levelFilter !== 'all') {
        const currentLevel = memberFamiliarityMap.get(s.id);
        if (levelFilter === 'not_rated') {
          if (currentLevel !== undefined) return false;
        } else if (currentLevel !== levelFilter) {
          return false;
        }
      }

      return true;
    });
  }, [songs, searchQuery, categoryFilter, levelFilter, memberFamiliarityMap]);

  // Member stats
  const memberStats = useMemo(() => {
    let confident = 0;
    let familiar = 0;
    let learning = 0;
    let unfamiliar = 0;
    let notRated = 0;

    songs.forEach((s) => {
      const lvl = memberFamiliarityMap.get(s.id);
      if (lvl === 'confident') confident++;
      else if (lvl === 'familiar') familiar++;
      else if (lvl === 'learning') learning++;
      else if (lvl === 'unfamiliar') unfamiliar++;
      else notRated++;
    });

    return { confident, familiar, learning, unfamiliar, notRated, total: songs.length };
  }, [songs, memberFamiliarityMap]);

  const handleSetLevel = (songId: string, level: FamiliarityLevel) => {
    if (!selectedMemberId) return;
    try {
      const current = memberFamiliarityMap.get(songId);
      if (current === level) {
        // Toggle off to "Not rated"
        FamiliarityService.removeFamiliarity(selectedMemberId, songId);
      } else {
        FamiliarityService.setFamiliarity(selectedMemberId, songId, level);
      }
      setFamiliarityList(FamiliarityService.getFamiliarityListSync());
    } catch (err: any) {
      console.error('[SongFamiliarityModal] Failed to save familiarity:', err);
      showToast(err?.message || 'Failed to save familiarity rating. Storage may be full.', 'danger');
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      style={{ zIndex }}
      data-overlay-id="song-familiarity-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200 transition-opacity ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div
        className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[90vh] my-auto flex flex-col transform animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2]">
              <Award className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                Song Repertoire Familiarity Matrix
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Track readiness levels of song leaders, vocalists, and musicians across church songs
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Member Selector & Stats Bar */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-4 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-[240px]">
              <Users className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Team Member:
              </label>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/60 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-[#1b75bc]"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {(m.labels || []).length > 0 ? `(${m.labels.join(', ')})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Readiness badges */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="px-2.5 py-1 rounded-full font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {memberStats.confident} Confident
              </span>
              <span className="px-2.5 py-1 rounded-full font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {memberStats.familiar} Familiar
              </span>
              <span className="px-2.5 py-1 rounded-full font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                {memberStats.learning} Learning
              </span>
              <span className="px-2.5 py-1 rounded-full font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
                {memberStats.unfamiliar} Unfamiliar
              </span>
              <span className="px-2.5 py-1 rounded-full font-semibold bg-slate-200/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                {memberStats.notRated} Not Rated
              </span>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search song title or artist..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/60 text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none focus:ring-1 focus:ring-[#1b75bc]"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/60 text-slate-900 dark:text-slate-100 outline-none"
            >
              <option value="all">All Categories</option>
              <option value="praise">Praise Songs</option>
              <option value="worship">Worship Songs</option>
            </select>

            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/60 text-slate-900 dark:text-slate-100 outline-none"
            >
              <option value="all">All Readiness Levels</option>
              <option value="confident">Confident Only</option>
              <option value="familiar">Familiar Only</option>
              <option value="learning">Learning Only</option>
              <option value="unfamiliar">Unfamiliar Only</option>
              <option value="not_rated">Not Rated Only</option>
            </select>
          </div>
        </div>

        {/* Songs List */}
        <div className="p-6 overflow-y-auto space-y-2.5 flex-1 divide-y divide-slate-100 dark:divide-slate-800">
          {filteredSongs.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-xs">
              No songs match your search or filter settings.
            </div>
          ) : (
            filteredSongs.map((song) => {
              const currentLevel = memberFamiliarityMap.get(song.id);

              return (
                <div
                  key={song.id}
                  className="pt-2.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                        {song.title}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase">
                        {song.category}
                      </span>
                      {song.key && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-[#1b75bc] dark:text-[#54b0e2]">
                          Key {song.key}
                        </span>
                      )}
                      {!currentLevel && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">
                          Not rated
                        </span>
                      )}
                    </div>
                    {song.artist && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {song.artist}
                      </div>
                    )}
                  </div>

                  {/* Level Pill Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    {FAMILIARITY_LEVELS.map((lvl) => {
                      const isSelected = currentLevel === lvl.level;

                      return (
                        <button
                          key={lvl.level}
                          type="button"
                          onClick={() => handleSetLevel(song.id, lvl.level)}
                          className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? `${lvl.color} shadow-2xs font-bold scale-102 ring-1 ring-black/10 dark:ring-white/10`
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                          title={lvl.desc}
                        >
                          {lvl.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 shrink-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Familiarity updates save automatically to your local database.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-white bg-[#1b75bc] hover:bg-[#155d97] rounded-xl shadow-xs transition-colors cursor-pointer"
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
