import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Song, SongConflictResult, SongRelationshipType } from '../types';
import { areArtistsEquivalent } from '../utils/songFamilyUtils';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import {
  AlertTriangle,
  AlertCircle,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
  X,
  Music,
  Check,
  Sparkles,
  Layers,
  Info,
  PlusCircle
} from 'lucide-react';

export interface DuplicateSongModalProps {
  isOpen: boolean;
  conflictResult?: SongConflictResult;
  matchType?: 'title' | 'artist_title' | 'youtubeId' | 'youtubeUrl' | 'composition';
  existingSong: Song;
  candidateSong?: {
    id?: string;
    title: string;
    artist?: string;
    key?: string;
    album?: string;
    originalArtist?: string;
    songwriters?: string;
    lyrics?: string;
    category?: string;
    thumbnailUrl?: string;
  };
  isEditing?: boolean;
  onCancel: () => void;
  onContinueAnyway?: () => void; // Backward compatibility fallback -> saves as separate
  onSaveSeparate?: () => void;
  onSaveRelated?: (relationship: SongRelationshipType) => void;
  onViewExisting: (song: Song) => void;
}

export const DuplicateSongModal: React.FC<DuplicateSongModalProps> = ({
  isOpen,
  conflictResult,
  matchType,
  existingSong,
  candidateSong,
  isEditing = false,
  onCancel,
  onContinueAnyway,
  onSaveSeparate,
  onSaveRelated,
  onViewExisting
}) => {
  const [step, setStep] = useState<'INITIAL' | 'PICK_RELATIONSHIP'>('INITIAL');
  const [selectedRelationship, setSelectedRelationship] = useState<SongRelationshipType>('COVER');

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'duplicate-song-modal',
    isOpen,
    layer: OverlayLayer.NESTED_MODAL,
    onClose: onCancel,
    closeOnEscape: true,
    parentId: 'song-form-modal'
  });

  if (!isOpen) return null;

  // Fallback handlers
  const handleSeparate = () => {
    if (onSaveSeparate) {
      onSaveSeparate();
    } else if (onContinueAnyway) {
      onContinueAnyway();
    }
  };

  const handleRelatedConfirm = (rel: SongRelationshipType) => {
    if (onSaveRelated) {
      onSaveRelated(rel);
    } else if (onContinueAnyway) {
      onContinueAnyway();
    }
  };

  // Determine Conflict Type
  const effectiveArtistA = existingSong.artist || 'Unknown Artist';
  const effectiveArtistB = candidateSong?.artist || 'Unknown Artist';
  const isSameArtist = areArtistsEquivalent(effectiveArtistA, effectiveArtistB);

  const conflictType =
    conflictResult?.conflictType ||
    (matchType === 'youtubeId' || matchType === 'youtubeUrl'
      ? 'SAME_VIDEO_MATCH'
      : isSameArtist
      ? 'SAME_TITLE_SAME_ARTIST'
      : 'SAME_TITLE_DIFF_ARTIST');

  const isDiffArtist = conflictType === 'SAME_TITLE_DIFF_ARTIST';
  const isPossibleComposition = conflictType === 'DIFF_TITLE_POSSIBLE_COMPOSITION';
  const isSameArtistDuplicate = conflictType === 'SAME_TITLE_SAME_ARTIST';
  const isVideoMatch = conflictType === 'SAME_VIDEO_MATCH';

  const modalContent = (
    <div
      style={{ zIndex }}
      data-overlay-id="duplicate-song-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200 transition-opacity ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      onClick={(e) => {
        if (!isBlocked && e.target === e.currentTarget) {
          onCancel();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
      aria-labelledby="duplicate-modal-title"
    >
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5 animate-in zoom-in-95 duration-200 max-h-[90vh] my-auto flex flex-col">
        
        {/* Header Icon & Title */}
        <div className="flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3">
            {isSameArtistDuplicate ? (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="w-6 h-6" />
              </div>
            ) : isPossibleComposition ? (
              <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/80 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                <Sparkles className="w-6 h-6" />
              </div>
            ) : isVideoMatch ? (
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                <Music className="w-6 h-6" />
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                <AlertCircle className="w-6 h-6" />
              </div>
            )}

            <div>
              <h3 id="duplicate-modal-title" className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                {isEditing ? (
                  isSameArtistDuplicate
                    ? '⚠️ DUPLICATE SONG DETECTED ON RENAME'
                    : isDiffArtist
                    ? '⚠️ RENAMED TITLE MATCHES ANOTHER ARTIST'
                    : isVideoMatch
                    ? '⚠️ MATCHING VIDEO LINK FOUND'
                    : '⚠️ POSSIBLE CONFLICT ON RENAME'
                ) : (
                  isSameArtistDuplicate
                    ? '⚠️ POSSIBLE DUPLICATE SONG'
                    : isDiffArtist
                    ? '⚠️ SAME TITLE, DIFFERENT ARTIST'
                    : isPossibleComposition
                    ? '⚠️ POSSIBLE RELATED SONG'
                    : isVideoMatch
                    ? '⚠️ MATCHING VIDEO LINK FOUND'
                    : '⚠️ DUPLICATE TITLE FOUND'
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {isEditing ? (
                  isSameArtistDuplicate
                    ? `A song titled "${candidateSong?.title || existingSong.title}" by "${existingSong.artist || 'Unknown Artist'}" already exists in your Song Database.`
                    : isDiffArtist
                    ? 'A song with this title already exists in your database by a different artist.'
                    : 'This renamed song matches an existing record.'
                ) : (
                  isSameArtistDuplicate
                    ? 'A song with the same title and artist already exists in your Song Database.'
                    : isDiffArtist
                    ? 'A song with the same title exists, but the artist is different.'
                    : isPossibleComposition
                    ? 'These songs have different titles but may represent the same underlying composition.'
                    : isVideoMatch
                    ? 'An existing song shares the same YouTube video link or ID.'
                    : 'A song with this title was found in your database.'
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto pr-1 space-y-4 text-xs">
          
          {/* STEP 1: INITIAL COMPARISON VIEW */}
          {step === 'INITIAL' && (
            <>
              {/* Visual Side-by-Side Comparison (Existing vs New) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative">
                
                {/* Existing Song Card */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/90 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 bg-slate-200/60 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                      Existing in Library
                    </span>
                    {existingSong.timesUsed > 0 && (
                      <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                        Used {existingSong.timesUsed}x
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 pt-1">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
                      {existingSong.title}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-medium line-clamp-1">
                      {existingSong.artist || 'Unknown Artist'}
                    </p>
                    {existingSong.album && (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                        Album: {existingSong.album}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                    {existingSong.key && <span>Key: <strong className="text-slate-700 dark:text-slate-200">{existingSong.key}</strong></span>}
                    {existingSong.originalKey && <span>Orig: <strong className="text-slate-700 dark:text-slate-200">{existingSong.originalKey}</strong></span>}
                    {existingSong.songFamilyId && (
                      <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 font-semibold">
                        <Layers className="w-3 h-3" /> In Song Family
                      </span>
                    )}
                  </div>
                </div>

                {/* VS Badge for Desktop / Mobile */}
                <div className="hidden sm:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-slate-900 items-center justify-center text-[10px] font-extrabold text-slate-600 dark:text-slate-300 shadow-xs z-10">
                  VS
                </div>

                {/* New / Candidate Song Card */}
                <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/80 px-2 py-0.5 rounded-md">
                      {isEditing ? 'Current Edited Song' : 'New / Imported Entry'}
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {isEditing ? (candidateSong?.id ? `ID #${candidateSong.id}` : 'Editing') : 'New Record'}
                    </span>
                  </div>

                  <div className="space-y-1 pt-1">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
                      {candidateSong?.title || existingSong.title}
                    </h4>
                    <p className="text-xs text-indigo-950 dark:text-indigo-200 font-semibold line-clamp-1">
                      {candidateSong?.artist || 'Unknown Artist'}
                    </p>
                    {candidateSong?.album && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        Album: {candidateSong.album}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-indigo-200/60 dark:border-indigo-900/60">
                    {candidateSong?.key && <span>Key: <strong className="text-slate-700 dark:text-slate-200">{candidateSong.key}</strong></span>}
                    {candidateSong?.category && <span>Category: <strong className="text-slate-700 dark:text-slate-200 capitalize">{candidateSong.category}</strong></span>}
                  </div>
                </div>

              </div>

              {/* Strong Evidence Banner if available */}
              {conflictResult?.evidence?.reasons && conflictResult.evidence.reasons.length > 0 && (
                <div className="p-3 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300 text-xs">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>Composition Analysis:</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-amber-900 dark:text-amber-200 space-y-0.5 pl-1">
                    {conflictResult.evidence.reasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                  {conflictResult.hasStrongEvidence && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium pt-0.5">
                      This appears to be the same underlying composition performed by a different artist.
                    </p>
                  )}
                </div>
              )}

              {/* Conflict explanation for Different Artist / Composition */}
              {(isDiffArtist || isPossibleComposition) && (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Are these the same underlying song?
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    If they are the same composition (e.g. original vs cover/version), you can link them in a Song Family to track usage history across arrangements. If they are completely different songs that happen to share a title, they will be saved as separate, independent entries.
                  </p>
                </div>
              )}

              {/* Same Artist Guidance */}
              {isSameArtistDuplicate && (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {isEditing ? 'Renamed song matches an existing database entry.' : 'This song may already exist in your database.'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    {isEditing
                      ? 'You can cancel and return to editing to adjust the title, view the existing entry, or save this rename as a separate independent version.'
                      : 'You can view/edit the existing entry, or continue saving this as an alternate recording (such as a live version, acoustic version, or separate release).'}
                  </p>
                </div>
              )}
            </>
          )}

          {/* STEP 2: PICK RELATIONSHIP (When user confirmed songs are related) */}
          {step === 'PICK_RELATIONSHIP' && (
            <div className="space-y-3.5">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-xl">
                <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wide">
                  HOW IS THE NEW SONG RELATED?
                </p>
                <p className="text-[11px] text-indigo-700 dark:text-indigo-300 pt-0.5">
                  Both song records will remain independent with their own keys, recordings, and metadata.
                </p>
              </div>

              <div className="space-y-2">
                {/* 1. ORIGINAL */}
                <label
                  onClick={() => setSelectedRelationship('ORIGINAL')}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedRelationship === 'ORIGINAL'
                      ? 'bg-indigo-50/80 dark:bg-indigo-950/80 border-indigo-500 ring-1 ring-indigo-500'
                      : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="relationship"
                    value="ORIGINAL"
                    checked={selectedRelationship === 'ORIGINAL'}
                    onChange={() => setSelectedRelationship('ORIGINAL')}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <span>ORIGINAL</span>
                      <span className="text-[10px] font-normal px-1.5 py-0.2 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded">
                        Primary Composition
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      The new song is the original composition. (Existing entry will be grouped in the same Song Family).
                    </p>
                  </div>
                </label>

                {/* 2. COVER */}
                <label
                  onClick={() => setSelectedRelationship('COVER')}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedRelationship === 'COVER'
                      ? 'bg-indigo-50/80 dark:bg-indigo-950/80 border-indigo-500 ring-1 ring-indigo-500'
                      : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="relationship"
                    value="COVER"
                    checked={selectedRelationship === 'COVER'}
                    onChange={() => setSelectedRelationship('COVER')}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <span>COVER</span>
                      <span className="text-[10px] font-normal px-1.5 py-0.2 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded">
                        Different Artist Performing Composition
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Cover recording performed by a different artist ({candidateSong?.artist || 'new artist'}).
                    </p>
                  </div>
                </label>

                {/* 3. OTHER VERSION / ARRANGEMENT */}
                <label
                  onClick={() => setSelectedRelationship('VERSION')}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedRelationship === 'VERSION'
                      ? 'bg-indigo-50/80 dark:bg-indigo-950/80 border-indigo-500 ring-1 ring-indigo-500'
                      : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="relationship"
                    value="VERSION"
                    checked={selectedRelationship === 'VERSION'}
                    onChange={() => setSelectedRelationship('VERSION')}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <span>OTHER VERSION / ARRANGEMENT</span>
                      <span className="text-[10px] font-normal px-1.5 py-0.2 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded">
                        Alternate Recording / Live / Acoustic
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Live version, acoustic version, studio re-recording, or alternate arrangement.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

        </div>

        {/* Modal Action Buttons Footer */}
        <div className="shrink-0 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          
          {/* STEP 1 ACTIONS */}
          {step === 'INITIAL' && (
            <>
              {/* If DIFFERENT ARTIST or POSSIBLE COMPOSITION */}
              {(isDiffArtist || isPossibleComposition) && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleSeparate}
                      className="py-2.5 px-4 text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <PlusCircle className="w-4 h-4 text-slate-500" />
                      <span>{isEditing ? 'KEEP AS SEPARATE SONG' : 'NO — DIFFERENT SONG'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setStep('PICK_RELATIONSHIP')}
                      className="py-2.5 px-4 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isEditing ? 'LINK TO SONG FAMILY' : 'YES — RELATED SONG'}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={onCancel}
                    className="w-full py-2 px-3 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    {isEditing ? 'Cancel & Return to Editing' : 'Cancel'}
                  </button>
                </div>
              )}

              {/* If SAME ARTIST DUPLICATE or VIDEO MATCH */}
              {(isSameArtistDuplicate || isVideoMatch) && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => onViewExisting(existingSong)}
                    className="w-full py-2.5 px-4 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 border border-indigo-200/80 dark:border-indigo-800/80 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>{isEditing ? 'VIEW CONFLICTING SONG' : 'VIEW / EDIT EXISTING SONG'}</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={onCancel}
                      className="py-2.5 px-4 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer"
                    >
                      {isEditing ? 'CANCEL & RETURN' : 'CANCEL'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSeparate}
                      className="py-2.5 px-4 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/80 hover:bg-amber-100 dark:hover:bg-amber-900/80 border border-amber-200 dark:border-amber-800 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1"
                    >
                      <span>{isEditing ? 'SAVE RENAME ANYWAY' : 'CONTINUE AS SEPARATE SONG'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* STEP 2 ACTIONS (Relationship Selection) */}
          {step === 'PICK_RELATIONSHIP' && (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep('INITIAL')}
                className="py-2.5 px-4 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <button
                type="button"
                onClick={() => handleRelatedConfirm(selectedRelationship)}
                className="py-2.5 px-5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Save to Song Family as {selectedRelationship}</span>
              </button>
            </div>
          )}

        </div>

      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
