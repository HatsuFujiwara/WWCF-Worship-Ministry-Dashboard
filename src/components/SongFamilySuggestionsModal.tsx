import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Song, SongFamily } from '../types';
import { PotentialFamilySuggestion } from '../utils/songFamilyUtils';
import { SongFamilyService } from '../services/songFamilyService';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import {
  X,
  Sparkles,
  Layers,
  Check,
  CheckCheck,
  Music,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

interface SongFamilySuggestionsModalProps {
  isOpen: boolean;
  suggestions: PotentialFamilySuggestion[];
  onClose: () => void;
  onApplied: () => void;
  showToast: (msg: string, type?: 'success' | 'danger' | 'info') => void;
}

export const SongFamilySuggestionsModal: React.FC<SongFamilySuggestionsModalProps> = ({
  isOpen,
  suggestions,
  onClose,
  onApplied,
  showToast
}) => {
  const [applyingIndex, setApplyingIndex] = useState<number | null>(null);
  const [appliedIndices, setAppliedIndices] = useState<Set<number>>(new Set());

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'song-family-suggestions-modal',
    isOpen,
    layer: OverlayLayer.NESTED_MODAL,
    onClose,
    closeOnEscape: true,
    parentId: 'song-families-modal'
  });

  const handleApplySingle = async (sug: PotentialFamilySuggestion, index: number) => {
    setApplyingIndex(index);
    try {
      await SongFamilyService.createSongFamily({
        name: sug.familyName,
        songIds: sug.songs.map((s) => s.id),
        originalSongId: sug.suggestedOriginalId,
        notes: `Auto-grouped based on: ${sug.evidence.reasons.join('; ')}`,
        versions: sug.songs.map((s) => ({
          songId: s.id,
          relationshipType: s.id === sug.suggestedOriginalId ? 'ORIGINAL' : sug.evidence.suggestedRelationship
        }))
      });

      setAppliedIndices((prev) => new Set(prev).add(index));
      showToast(`Created Song Family "${sug.familyName}" with ${sug.songs.length} versions.`, 'success');
      onApplied();
    } catch (err) {
      console.error('Failed to group family:', err);
      showToast(`Failed to create family "${sug.familyName}".`, 'danger');
    } finally {
      setApplyingIndex(null);
    }
  };

  const handleApplyAll = async () => {
    let count = 0;
    for (let i = 0; i < suggestions.length; i++) {
      if (!appliedIndices.has(i)) {
        const sug = suggestions[i];
        try {
          await SongFamilyService.createSongFamily({
            name: sug.familyName,
            songIds: sug.songs.map((s) => s.id),
            originalSongId: sug.suggestedOriginalId,
            notes: `Auto-grouped based on: ${sug.evidence.reasons.join('; ')}`,
            versions: sug.songs.map((s) => ({
              songId: s.id,
              relationshipType: s.id === sug.suggestedOriginalId ? 'ORIGINAL' : sug.evidence.suggestedRelationship
            }))
          });
          setAppliedIndices((prev) => new Set(prev).add(i));
          count++;
        } catch (err) {
          console.error('Error grouping:', err);
        }
      }
    }

    if (count > 0) {
      showToast(`Successfully grouped ${count} Song Families!`, 'success');
      onApplied();
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      style={{ zIndex }}
      data-overlay-id="song-family-suggestions-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto backdrop-enter-animation transition-opacity duration-200 ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] my-auto overflow-hidden modal-enter-animation">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Song Family Relationship Discovery
              </h2>
              <p className="text-xs text-slate-500">
                Multi-source composition verification detected {suggestions.length} potential song groupings
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {suggestions.length === 0 ? (
            <div className="text-center py-10">
              <ShieldCheck className="w-12 h-12 text-emerald-500 mx-auto mb-2 opacity-80" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                All Song Relationships Are Up to Date
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                No unlinked multi-version compositions detected in your Song Database.
              </p>
            </div>
          ) : (
            suggestions.map((sug, idx) => {
              const isApplied = appliedIndices.has(idx);
              const isApplying = applyingIndex === idx;

              return (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border transition-colors ${
                    isApplied
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
                      : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {sug.familyName}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300">
                          {sug.songs.length} Versions
                        </span>
                        {sug.evidence.confidence === 'high' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                            High Confidence Match
                          </span>
                        )}
                      </div>

                      {/* Song Items */}
                      <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-indigo-200 dark:border-indigo-800">
                        {sug.songs.map((song) => (
                          <div key={song.id} className="flex items-center gap-2 text-xs">
                            <Music className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="font-medium text-slate-800 dark:text-slate-200">{song.title}</span>
                            <span className="text-slate-400">• {song.artist}</span>
                            {song.id === sug.suggestedOriginalId && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold ml-1">
                                (Original)
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Evidence */}
                      <div className="mt-2 text-[11px] text-slate-500">
                        <strong>Evidence:</strong> {sug.evidence.reasons.join('; ')}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isApplied || isApplying}
                      onClick={() => handleApplySingle(sug, idx)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors shrink-0 ${
                        isApplied
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                      }`}
                    >
                      {isApplied ? (
                        <span className="inline-flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Grouped
                        </span>
                      ) : isApplying ? (
                        'Grouping...'
                      ) : (
                        'Group Family'
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            Close
          </button>

          {suggestions.length > 0 && (
            <button
              type="button"
              onClick={handleApplyAll}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Group All ({suggestions.length})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
