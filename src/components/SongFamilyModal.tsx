import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Song, SongFamily, SongRelationshipType } from '../types';
import { SongFamilyService } from '../services/songFamilyService';
import { SongService } from '../services/songService';
import { LineupHistoryService } from '../services/lineupHistoryService';
import { getNormalizedBaseTitle, inferRelationshipType } from '../utils/songFamilyUtils';
import { CustomSelect } from './CustomSelect';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import {
  X,
  Layers,
  Music,
  Plus,
  Trash2,
  Check,
  Search,
  Star,
  Unlink,
  AlertTriangle,
  Info,
  ArrowRight
} from 'lucide-react';

interface SongFamilyModalProps {
  isOpen: boolean;
  familyToEdit?: SongFamily | null;
  initialSongs?: Song[];
  allSongs: Song[];
  allFamilies?: SongFamily[];
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string, type?: 'success' | 'danger' | 'info') => void;
}

const RELATIONSHIP_OPTIONS: { value: SongRelationshipType; label: string; desc: string }[] = [
  { value: 'ORIGINAL', label: 'Original Version', desc: 'The canonical original recording/release' },
  { value: 'LIVE_VERSION', label: 'Live Version', desc: 'Live concert or worship service recording' },
  { value: 'ACOUSTIC_VERSION', label: 'Acoustic / Unplugged', desc: 'Acoustic or stripped-down arrangement' },
  { value: 'COVER', label: 'Cover Version', desc: 'Recorded by a different artist/band' },
  { value: 'REMAKE', label: 'Remake / Re-recording', desc: 'Modern re-recording or new arrangement' },
  { value: 'ALTERNATE_VERSION', label: 'Alternate / Studio Edit', desc: 'Radio edit, extended, or alternate mix' },
  { value: 'VERSION', label: 'General Version', desc: 'Another recording or variation' },
  { value: 'UNKNOWN', label: 'Unknown', desc: 'Unspecified version or relationship' }
];

export const SongFamilyModal: React.FC<SongFamilyModalProps> = ({
  isOpen,
  familyToEdit,
  initialSongs = [],
  allSongs,
  allFamilies = [],
  onClose,
  onSaved,
  showToast
}) => {
  const [familyName, setFamilyName] = useState('');
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);
  const [originalSongId, setOriginalSongId] = useState<string>('');
  const [relationshipMap, setRelationshipMap] = useState<Record<string, SongRelationshipType>>({});
  const [notes, setNotes] = useState('');
  const [songSearchQuery, setSongSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showAddSongsList, setShowAddSongsList] = useState(false);
  const [duplicateConflict, setDuplicateConflict] = useState<{ song: Song; currentFamily: SongFamily } | null>(null);

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'song-family-modal',
    isOpen,
    layer: OverlayLayer.NESTED_MODAL,
    onClose,
    closeOnEscape: !duplicateConflict,
    parentId: 'song-families-modal'
  });

  // When duplicate conflict dialog is open inside, Escape closes the conflict first
  useEffect(() => {
    if (!duplicateConflict) return;
    const handleConflictEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setDuplicateConflict(null);
      }
    };
    window.addEventListener('keydown', handleConflictEscape);
    return () => window.removeEventListener('keydown', handleConflictEscape);
  }, [duplicateConflict]);

  // Initialize or reset form state on open or props change
  useEffect(() => {
    if (!isOpen) return;

    setShowAddSongsList(false);
    setSongSearchQuery('');
    setDuplicateConflict(null);
    setIsSaving(false);

    if (familyToEdit) {
      setFamilyName(familyToEdit.name || '');
      const vIds = familyToEdit.versionIds || [];
      setSelectedSongIds(vIds);
      setOriginalSongId(familyToEdit.originalSongId || (vIds.length > 0 ? vIds[0] : ''));
      setNotes(familyToEdit.notes || '');

      const rMap: Record<string, SongRelationshipType> = {};
      (familyToEdit.versions || []).forEach((v) => {
        rMap[v.songId] = v.relationshipType;
      });
      // Fallback for songs in versionIds but missing in versions array
      vIds.forEach((sid) => {
        if (!rMap[sid]) {
          const song = allSongs.find((s) => s.id === sid);
          rMap[sid] = song?.relationshipType || (sid === familyToEdit.originalSongId ? 'ORIGINAL' : 'VERSION');
        }
      });
      setRelationshipMap(rMap);
    } else {
      const initList = initialSongs || [];
      const initIds = initList.map((s) => s.id);
      setSelectedSongIds(initIds);

      // Determine clean suggested name from first song
      let suggestedName = '';
      if (initList.length > 0) {
        suggestedName = getNormalizedBaseTitle(initList[0].title) || initList[0].title.replace(/\s*[\(\[].*?[\)\]]/g, '').trim() || initList[0].title.trim();
      }
      setFamilyName(suggestedName);

      // Determine initial original song
      const explicitOriginal = initList.find((s) => s.relationshipType === 'ORIGINAL');
      const origId = explicitOriginal ? explicitOriginal.id : (initIds.length > 0 ? initIds[0] : '');
      setOriginalSongId(origId);
      setNotes('');

      // Build initial relationships
      const rMap: Record<string, SongRelationshipType> = {};
      initList.forEach((s, idx) => {
        if (s.id === origId) {
          rMap[s.id] = 'ORIGINAL';
        } else {
          const inferred = initList[0] ? inferRelationshipType(s, initList[0]) : 'VERSION';
          rMap[s.id] = s.relationshipType && s.relationshipType !== 'ORIGINAL' ? s.relationshipType : (inferred || 'VERSION');
        }
      });
      setRelationshipMap(rMap);
    }
  }, [isOpen, familyToEdit, initialSongs, allSongs]);

  const addSongToDraft = (song: Song) => {
    if (selectedSongIds.includes(song.id)) return;
    const nextIds = [...selectedSongIds, song.id];
    setSelectedSongIds(nextIds);

    const isFirst = nextIds.length === 1;
    let relType: SongRelationshipType = 'VERSION';

    if (isFirst) {
      relType = 'ORIGINAL';
      setOriginalSongId(song.id);
    } else {
      const primarySong = allSongs.find((s) => s.id === (originalSongId || selectedSongIds[0]));
      const inferred = primarySong ? inferRelationshipType(song, primarySong) : 'VERSION';
      relType = song.relationshipType && song.relationshipType !== 'ORIGINAL' ? song.relationshipType : (inferred || 'VERSION');
    }

    setRelationshipMap((prev) => ({
      ...prev,
      [song.id]: relType
    }));
  };

  const handleToggleAddSong = (songId: string) => {
    if (selectedSongIds.includes(songId)) {
      handleRemoveSong(songId);
      return;
    }

    const songToAdd = allSongs.find((s) => s.id === songId);
    if (!songToAdd) return;

    // Check if the song already belongs to a different family
    if (songToAdd.songFamilyId && songToAdd.songFamilyId !== familyToEdit?.id) {
      const existingFamily = allFamilies.find((f) => f.id === songToAdd.songFamilyId);
      if (existingFamily) {
        setDuplicateConflict({
          song: songToAdd,
          currentFamily: existingFamily
        });
        return;
      }
    }

    addSongToDraft(songToAdd);
  };

  const handleConfirmMoveConflictSong = () => {
    if (!duplicateConflict) return;
    addSongToDraft(duplicateConflict.song);
    setDuplicateConflict(null);
  };

  const handleRemoveSong = (songId: string) => {
    const nextIds = selectedSongIds.filter((id) => id !== songId);
    setSelectedSongIds(nextIds);

    setRelationshipMap((prev) => {
      const copy = { ...prev };
      delete copy[songId];
      return copy;
    });

    if (originalSongId === songId) {
      // Find next candidate for original
      const nextOriginal = nextIds.find((id) => relationshipMap[id] === 'ORIGINAL') || (nextIds.length > 0 ? nextIds[0] : '');
      setOriginalSongId(nextOriginal);
      if (nextOriginal) {
        setRelationshipMap((prev) => ({ ...prev, [nextOriginal]: 'ORIGINAL' }));
      }
    }
  };

  const handleRelationshipChange = (songId: string, rel: SongRelationshipType) => {
    setRelationshipMap((prev) => {
      const updated = { ...prev, [songId]: rel };
      if (rel === 'ORIGINAL') {
        // Enforce single original rule: set all other versions to non-original
        Object.keys(updated).forEach((id) => {
          if (id !== songId && updated[id] === 'ORIGINAL') {
            updated[id] = 'VERSION';
          }
        });
      }
      return updated;
    });

    if (rel === 'ORIGINAL') {
      setOriginalSongId(songId);
    } else if (originalSongId === songId) {
      // If the current original was changed to something else, clear original or leave open
      const otherOriginal = selectedSongIds.find((id) => id !== songId && relationshipMap[id] === 'ORIGINAL');
      setOriginalSongId(otherOriginal || '');
    }
  };

  const handleSetOriginal = (songId: string) => {
    setOriginalSongId(songId);
    setRelationshipMap((prev) => {
      const updated: Record<string, SongRelationshipType> = { ...prev, [songId]: 'ORIGINAL' };
      Object.keys(updated).forEach((id) => {
        if (id !== songId && updated[id] === 'ORIGINAL') {
          updated[id] = 'VERSION';
        }
      });
      return updated;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!familyName.trim()) {
      showToast('Please enter a Song Family name.', 'danger');
      return;
    }

    if (selectedSongIds.length === 0) {
      showToast('Please select at least one song to include in this family.', 'danger');
      return;
    }

    setIsSaving(true);
    try {
      const prevFamilies = await SongFamilyService.getSongFamilies();
      const prevSongs = await SongService.getSongs();

      const effectiveOriginalId = originalSongId || (selectedSongIds.length > 0 ? selectedSongIds[0] : undefined);
      const versionsList = selectedSongIds.map((sid) => ({
        songId: sid,
        relationshipType: relationshipMap[sid] || (sid === effectiveOriginalId ? 'ORIGINAL' : 'VERSION')
      }));

      let savedFamilyName = familyName.trim();
      if (familyToEdit) {
        await SongFamilyService.updateSongFamily({
          ...familyToEdit,
          name: savedFamilyName,
          versionIds: selectedSongIds,
          originalSongId: effectiveOriginalId,
          notes: notes.trim(),
          versions: versionsList.map((v) => ({ ...v, confidence: 'high' }))
        });
        showToast(`Song Family "${savedFamilyName}" updated successfully.`, 'success');
      } else {
        await SongFamilyService.createSongFamily({
          name: savedFamilyName,
          songIds: selectedSongIds,
          originalSongId: effectiveOriginalId,
          notes: notes.trim(),
          versions: versionsList
        });
        showToast(`Song Family "${savedFamilyName}" created successfully.`, 'success');
      }

      const nextFamilies = await SongFamilyService.getSongFamilies();
      const nextSongs = await SongService.getSongs();

      LineupHistoryService.pushAppAction({
        description: familyToEdit
          ? `Updated Song Family "${savedFamilyName}"`
          : `Created Song Family "${savedFamilyName}"`,
        undo: async () => {
          await SongFamilyService.saveSongFamilies(prevFamilies);
          await SongService.saveSongsList(prevSongs);
          onSaved();
        },
        redo: async () => {
          await SongFamilyService.saveSongFamilies(nextFamilies);
          await SongService.saveSongsList(nextSongs);
          onSaved();
        }
      });

      onSaved();
      onClose();
    } catch (err) {
      console.error('Error saving song family:', err);
      showToast('Failed to save Song Family.', 'danger');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFamily = async () => {
    if (!familyToEdit) return;
    if (window.confirm(`Are you sure you want to dissolve the Song Family "${familyToEdit.name}"? Individual song records, keys, and history will NOT be deleted.`)) {
      setIsSaving(true);
      try {
        const prevFamilies = await SongFamilyService.getSongFamilies();
        const prevSongs = await SongService.getSongs();
        const targetFamily = { ...familyToEdit };

        await SongFamilyService.deleteSongFamily(targetFamily.id);

        LineupHistoryService.pushAppAction({
          description: `Dissolved Song Family "${targetFamily.name}"`,
          undo: async () => {
            await SongFamilyService.saveSongFamilies(prevFamilies);
            await SongService.saveSongsList(prevSongs);
            onSaved();
          },
          redo: async () => {
            await SongFamilyService.deleteSongFamily(targetFamily.id);
            onSaved();
          }
        });

        showToast(`Song Family "${targetFamily.name}" dissolved. All songs are now independent.`, 'info');
        onSaved();
        onClose();
      } catch (err) {
        console.error('Error deleting song family:', err);
        showToast('Failed to delete Song Family.', 'danger');
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Filter available songs for adding
  const availableSongsToAdd = allSongs.filter((s) => {
    if (selectedSongIds.includes(s.id)) return false;
    if (!songSearchQuery.trim()) return true;
    const q = songSearchQuery.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q) || (s.key && s.key.toLowerCase().includes(q));
  });

  const selectedSongObjects = selectedSongIds
    .map((id) => allSongs.find((s) => s.id === id))
    .filter(Boolean) as Song[];

  if (!isOpen) return null;

  const modalContent = (
    <div
      style={{ zIndex }}
      data-overlay-id="song-family-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto backdrop-enter-animation transition-opacity duration-200 ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div className="relative w-full max-w-2xl wwcf-glass-modal rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 flex flex-col max-h-[90vh] my-auto overflow-hidden modal-enter-animation text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#5aa7e8]">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {familyToEdit ? 'Manage Song Family' : 'Create Song Family'}
              </h2>
              <p className="text-xs text-slate-500">
                Group multiple recordings/versions of the same composition together
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Family Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Canonical Song Family Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="e.g. Tribes, Sukdulang Biyaya, Forever"
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/40"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              This name will be displayed as the main title in aggregate usage statistics & member favorite analytics.
            </p>
          </div>

          {/* Member Songs in this Family */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Song Versions ({selectedSongObjects.length})
              </label>
              <button
                type="button"
                onClick={() => setShowAddSongsList(!showAddSongsList)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showAddSongsList ? 'Close Song Picker' : 'Add Songs to Family'}</span>
              </button>
            </div>

            {/* Song Picker Drawer */}
            {showAddSongsList && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={songSearchQuery}
                    onChange={(e) => setSongSearchQuery(e.target.value)}
                    placeholder="Search song from database to add..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/40"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                  {availableSongsToAdd.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-2">No matching songs available.</p>
                  ) : (
                    availableSongsToAdd.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => handleToggleAddSong(s.id)}
                        className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Music className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <div className="truncate">
                            <span className="text-xs font-medium text-slate-800 dark:text-slate-200">{s.title}</span>
                            <span className="text-[11px] text-slate-400 ml-1.5">• {s.artist}</span>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 shrink-0 flex items-center gap-1">
                          <Plus className="w-3 h-3" /> Add
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Selected Songs List */}
            {selectedSongObjects.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-700 text-slate-400 text-xs">
                No songs added to this family yet. Click <strong>"Add Songs to Family"</strong> above.
              </div>
            ) : (
              <div className="space-y-2">
                {selectedSongObjects.map((song) => {
                  const isOriginal = originalSongId === song.id;
                  const currentRel = relationshipMap[song.id] || (isOriginal ? 'ORIGINAL' : 'VERSION');

                  return (
                    <div
                      key={song.id}
                      className={`p-3 rounded-xl border transition-colors ${
                        isOriginal
                          ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60'
                          : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                              {song.title}
                            </span>
                            {isOriginal && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/80 dark:text-amber-300">
                                <Star className="w-2.5 h-2.5 fill-amber-500" /> Original
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 truncate">
                            {song.artist} {song.album ? `• ${song.album}` : ''} {song.key ? `• Key: ${song.key}` : ''} • Used {song.timesUsed}x
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {!isOriginal && (
                            <button
                              type="button"
                              onClick={() => handleSetOriginal(song.id)}
                              title="Set as Original Version"
                              className="px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-950/60 hover:bg-amber-200/80 rounded-lg transition-colors cursor-pointer"
                            >
                              Set as Original
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveSong(song.id)}
                            title="Remove from family"
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors cursor-pointer"
                          >
                            <Unlink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Relationship Type Selector */}
                      <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center gap-2">
                        <span className="text-[11px] font-medium text-slate-500 shrink-0">Relationship:</span>
                        <div className="flex-1">
                          <CustomSelect<SongRelationshipType>
                            value={currentRel}
                            onChange={(val) => handleRelationshipChange(song.id, val)}
                            size="sm"
                            options={RELATIONSHIP_OPTIONS.map((opt) => ({
                              value: opt.value,
                              label: opt.label,
                              description: opt.desc
                            }))}
                            aria-label={`Relationship for ${song.title}`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Family Composition Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Written by Kyle Cedric Salvador; original key C; includes live acoustic variation"
              className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <div>
            {familyToEdit && (
              <button
                type="button"
                onClick={handleDeleteFamily}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-xl transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Dissolve Family</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-[#1b75bc] hover:bg-[#16629e] rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : familyToEdit ? 'Save Changes' : 'Create Family'}</span>
            </button>
          </div>
        </div>

        {/* Duplicate Family Conflict Dialog */}
        {duplicateConflict && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Song Already in Another Family
                  </h3>
                  <p className="text-xs text-slate-500">
                    Duplicate family membership prevention
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                <p>
                  <strong>"{duplicateConflict.song.title}"</strong> already belongs to the Song Family{' '}
                  <strong className="text-indigo-600 dark:text-indigo-400">"{duplicateConflict.currentFamily.name}"</strong>.
                </p>
                <p className="text-slate-500 text-[11px] pt-1">
                  Moving this song will unlink it from its old family while preserving all song records, metadata, keys, and history.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDuplicateConflict(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMoveConflictSong}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <span>Move to This Family</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
