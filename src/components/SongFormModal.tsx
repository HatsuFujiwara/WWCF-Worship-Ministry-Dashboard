import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Song, SongCategory, SongFamily, SongRelationshipType, SongVersionType } from '../types';
import { SongService, DuplicateMatch } from '../services/songService';
import { SongFamilyService } from '../services/songFamilyService';
import { LineupHistoryService } from '../services/lineupHistoryService';
import { fetchMultiSourceMetadata } from '../services/musicMetadataService';
import { getManilaTodayString } from '../utils/dateUtils';
import { COMMON_THEMES } from '../utils/recommendationUtils';
import { detectSongVersionType, resolveSongVersionType } from '../utils/versionDetectionUtils';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import { DuplicateSongModal } from './DuplicateSongModal';
import {
  X,
  Youtube,
  Download,
  Loader2,
  Sparkles,
  Music,
  Calendar,
  Clock,
  Link,
  FileText,
  AlertTriangle,
  Globe,
  KeyRound,
  Layers,
  BookOpen
} from 'lucide-react';

interface SongFormModalProps {
  isOpen: boolean;
  songToEdit?: Song | null;
  onClose: () => void;
  onSave: (song: Song) => void;
  onDeleteSong?: (song: Song) => void;
  onViewExistingSong?: (song: Song) => void;
  showToast: (msg: string, type?: 'success' | 'danger' | 'info') => void;
}

export const SongFormModal: React.FC<SongFormModalProps> = ({
  isOpen,
  songToEdit,
  onClose,
  onSave,
  onDeleteSong,
  onViewExistingSong,
  showToast
}) => {
  // Form State
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [category, setCategory] = useState<SongCategory>('both');
  const [language, setLanguage] = useState('English');
  const [key, setKey] = useState('');
  const [originalKey, setOriginalKey] = useState('');
  const [bpm, setBpm] = useState<string>('');
  const [timeSignature, setTimeSignature] = useState('');
  const [duration, setDuration] = useState('');
  const [ccliNumber, setCcliNumber] = useState('');
  const [album, setAlbum] = useState('');
  const [releaseYear, setReleaseYear] = useState('');
  const [genre, setGenre] = useState('Praise & Worship');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeId, setYoutubeId] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [coverArtUrl, setCoverArtUrl] = useState('');
  const [isrc, setIsrc] = useState('');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [appleMusicUrl, setAppleMusicUrl] = useState('');
  const [qobuzUrl, setQobuzUrl] = useState('');
  const [tidalUrl, setTidalUrl] = useState('');
  const [geniusUrl, setGeniusUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [themes, setThemes] = useState<string[]>([]);
  const [customThemeInput, setCustomThemeInput] = useState('');

  // Song Family & Composition Metadata
  const [songFamilyId, setSongFamilyId] = useState<string>('');
  const [relationshipType, setRelationshipType] = useState<SongRelationshipType>('ORIGINAL');
  const [versionType, setVersionType] = useState<SongVersionType>('original');
  const [songwriters, setSongwriters] = useState('');
  const [originalArtist, setOriginalArtist] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [allFamilies, setAllFamilies] = useState<SongFamily[]>([]);

  // Auto-import metadata state
  const [isFetchingMeta, setIsFetchingMeta] = useState(false);
  const [metaImportError, setMetaImportError] = useState('');
  const [fetchInput, setFetchInput] = useState('');

  // Duplicate Modal State
  const [duplicateMatch, setDuplicateMatch] = useState<DuplicateMatch | null>(null);
  const [pendingSongData, setPendingSongData] = useState<Partial<Song> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    SongFamilyService.getSongFamilies().then(setAllFamilies);

    if (songToEdit) {
      setTitle(songToEdit.title || '');
      setArtist(songToEdit.artist || '');
      setCategory(songToEdit.category || 'both');
      setVersionType(resolveSongVersionType(songToEdit));
      setLanguage(songToEdit.language || 'English');
      setKey(songToEdit.key || '');
      setOriginalKey(songToEdit.originalKey || songToEdit.key || '');
      setBpm(songToEdit.bpm ? String(songToEdit.bpm) : '');
      setTimeSignature(songToEdit.timeSignature || '');
      setDuration(songToEdit.duration || '');
      setCcliNumber(songToEdit.ccliNumber || '');
      setAlbum(songToEdit.album || '');
      setReleaseYear(songToEdit.releaseYear ? String(songToEdit.releaseYear) : '');
      setGenre(songToEdit.genre || 'Praise & Worship');
      setYoutubeUrl(songToEdit.youtubeUrl || '');
      setYoutubeId(songToEdit.youtubeId || '');
      setThumbnailUrl(songToEdit.thumbnailUrl || '');
      setCoverArtUrl(songToEdit.coverArtUrl || '');
      setIsrc(songToEdit.isrc || '');
      setSpotifyUrl(songToEdit.spotifyUrl || '');
      setAppleMusicUrl(songToEdit.appleMusicUrl || '');
      setQobuzUrl(songToEdit.qobuzUrl || '');
      setTidalUrl(songToEdit.tidalUrl || '');
      setGeniusUrl(songToEdit.geniusUrl || '');
      setNotes(songToEdit.notes || '');
      setThemes(songToEdit.themes || songToEdit.labels || []);
      setSongFamilyId(songToEdit.songFamilyId || '');
      setRelationshipType(songToEdit.relationshipType || 'ORIGINAL');
      setSongwriters(songToEdit.songwriters || (songToEdit.composers ? songToEdit.composers.join(', ') : ''));
      setOriginalArtist(songToEdit.originalArtist || '');
      setLyrics(songToEdit.lyrics || '');
      setFetchInput(songToEdit.youtubeUrl || `${songToEdit.title} ${songToEdit.artist}`.trim());
    } else {
      setTitle('');
      setArtist('');
      setCategory('both');
      setVersionType('original');
      setLanguage('English');
      setKey('');
      setOriginalKey('');
      setBpm('');
      setDuration('');
      setCcliNumber('');
      setAlbum('');
      setReleaseYear('');
      setGenre('Praise & Worship');
      setYoutubeUrl('');
      setYoutubeId('');
      setThumbnailUrl('');
      setCoverArtUrl('');
      setIsrc('');
      setSpotifyUrl('');
      setAppleMusicUrl('');
      setQobuzUrl('');
      setTidalUrl('');
      setGeniusUrl('');
      setNotes('');
      setThemes([]);
      setSongFamilyId('');
      setRelationshipType('ORIGINAL');
      setSongwriters('');
      setOriginalArtist('');
      setLyrics('');
      setFetchInput('');
    }
    setMetaImportError('');
    setDuplicateMatch(null);
  }, [songToEdit, isOpen]);

  // Handle multi-source metadata import (YouTube Music, YouTube, Spotify, Apple Music, Qobuz, TIDAL)
  const handleFetchMultiSourceMetadata = async () => {
    const searchTarget = fetchInput.trim() || youtubeUrl.trim() || `${title} ${artist}`.trim();
    if (!searchTarget) {
      setMetaImportError('Please enter a song title, artist, or music URL (YouTube/Spotify/Apple Music).');
      return;
    }

    setMetaImportError('');
    setIsFetchingMeta(true);

    try {
      const meta = await fetchMultiSourceMetadata(searchTarget);

      if (meta.title) setTitle(meta.title);
      if (meta.artist) setArtist(meta.artist);
      if (meta.album) setAlbum(meta.album);
      if (meta.releaseYear) setReleaseYear(meta.releaseYear);
      if (meta.duration) setDuration(meta.duration);
      if (meta.genre) setGenre(meta.genre);
      if (meta.coverArtUrl) setCoverArtUrl(meta.coverArtUrl);
      if (meta.thumbnailUrl) setThumbnailUrl(meta.thumbnailUrl);
      if (meta.isrc) setIsrc(meta.isrc);

      // Platform URLs
      if (meta.youtubeUrl) setYoutubeUrl(meta.youtubeUrl);
      if (meta.youtubeId) setYoutubeId(meta.youtubeId);
      if (meta.spotifyUrl) setSpotifyUrl(meta.spotifyUrl);
      if (meta.appleMusicUrl) setAppleMusicUrl(meta.appleMusicUrl);
      if (meta.qobuzUrl) setQobuzUrl(meta.qobuzUrl);
      if (meta.tidalUrl) setTidalUrl(meta.tidalUrl);

      // Auto-detect versionType (Original vs Cover)
      const detectedVer = detectSongVersionType({
        title: meta.title || title,
        artist: meta.artist || artist,
        rawTitle: (meta as any).rawTitle || meta.title,
        originalArtist: originalArtist,
        relationshipType
      });
      setVersionType(detectedVer.versionType);

      showToast('Metadata fetched successfully!', 'success');
    } catch (err: any) {
      setMetaImportError(err.message || 'Unable to retrieve metadata from available music sources. Please enter the information manually.');
    } finally {
      setIsFetchingMeta(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      showToast('Please enter a song title.', 'danger');
      return;
    }

    const songDataToSave: Partial<Song> & { title: string } = {
      id: songToEdit?.id,
      title: title.trim(),
      artist: artist.trim() || 'Unknown Artist',
      category,
      versionType,
      language,
      originalKey: originalKey.trim(),
      key: originalKey.trim(),
      bpm: bpm ? parseInt(bpm, 10) : undefined,
      timeSignature: timeSignature.trim(),
      duration: duration.trim(),
      ccliNumber: ccliNumber.trim(),
      album: album.trim(),
      releaseYear: releaseYear.trim(),
      genre: genre.trim(),
      youtubeUrl: youtubeUrl.trim(),
      youtubeId: youtubeId.trim(),
      thumbnailUrl: thumbnailUrl.trim(),
      coverArtUrl: coverArtUrl.trim(),
      isrc: isrc.trim(),
      spotifyUrl: spotifyUrl.trim(),
      appleMusicUrl: appleMusicUrl.trim(),
      qobuzUrl: qobuzUrl.trim(),
      tidalUrl: tidalUrl.trim(),
      geniusUrl: geniusUrl.trim(),
      notes: notes.trim(),
      themes,
      labels: themes,
      songFamilyId: songFamilyId.trim() || undefined,
      relationshipType: relationshipType || 'ORIGINAL',
      songwriters: songwriters.trim() || undefined,
      originalArtist: originalArtist.trim() || undefined,
      lyrics: lyrics.trim() || undefined,
      dateAdded: songToEdit?.dateAdded || getManilaTodayString(),
      timesUsed: songToEdit?.timesUsed || 0,
      serviceHistory: songToEdit?.serviceHistory || []
    };

    // Check duplicate & title/artist conflicts
    const conflict = await SongService.detectSongConflict({
      title: songDataToSave.title,
      artist: songDataToSave.artist,
      originalArtist: songDataToSave.originalArtist,
      songwriters: songDataToSave.songwriters,
      album: songDataToSave.album,
      lyrics: songDataToSave.lyrics,
      ccliNumber: songDataToSave.ccliNumber,
      youtubeId: songDataToSave.youtubeId,
      youtubeUrl: songDataToSave.youtubeUrl,
      excludeId: songToEdit?.id
    });

    if (conflict.hasConflict && conflict.existingSong) {
      setDuplicateMatch(conflict);
      setPendingSongData(songDataToSave);
      return;
    }

    // Direct save if no duplicate
    await executeSave(songDataToSave);
  };

  const handleSaveSeparate = async () => {
    if (pendingSongData) {
      const dataToSave = {
        ...pendingSongData,
        songFamilyId: pendingSongData.songFamilyId || undefined,
        relationshipType: pendingSongData.relationshipType || undefined
      };
      await executeSave(dataToSave as Partial<Song> & { title: string });
    }
    setDuplicateMatch(null);
    setPendingSongData(null);
  };

  const handleSaveRelated = async (relationship: SongRelationshipType) => {
    if (pendingSongData && duplicateMatch?.existingSong) {
      try {
        const dataToSave = {
          ...pendingSongData,
          relationshipType: relationship
        } as Partial<Song> & { title: string };

        const savedSong = await SongService.saveSong(dataToSave);

        await SongFamilyService.linkSongPair({
          existingSong: duplicateMatch.existingSong,
          newSong: savedSong,
          relationship,
          isNewSongOriginal: relationship === 'ORIGINAL'
        });

        onSave(savedSong);
        showToast(`Saved and linked to "${duplicateMatch.existingSong.title}" Song Family as ${relationship}!`, 'success');
        onClose();
      } catch (err) {
        console.error('Failed to link related song:', err);
        showToast('Failed to save related song.', 'danger');
      }
    }
    setDuplicateMatch(null);
    setPendingSongData(null);
  };

  const executeSave = async (data: Partial<Song> & { title: string }) => {
    try {
      const previousSong = songToEdit ? { ...songToEdit } : null;
      const saved = await SongService.saveSong(data);

      if (saved.songFamilyId) {
        await SongFamilyService.addSongToFamily(
          saved.songFamilyId,
          saved.id,
          saved.relationshipType || 'VERSION'
        );
      }

      LineupHistoryService.pushAppAction({
        description: previousSong ? `Updated song "${saved.title}"` : `Added song "${saved.title}"`,
        undo: async () => {
          if (previousSong) {
            await SongService.saveSong(previousSong);
          } else {
            await SongService.deleteSong(saved.id);
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('wwcf:songs-updated'));
          }
        },
        redo: async () => {
          await SongService.saveSong(saved);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('wwcf:songs-updated'));
          }
        }
      });

      onSave(saved);
      showToast(songToEdit ? 'Song updated successfully!' : 'Song added to database!', 'success');
      onClose();
    } catch (err) {
      console.error('Failed to save song:', err);
      showToast('Failed to save song.', 'danger');
    }
  };

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'song-form-modal',
    isOpen,
    layer: OverlayLayer.MODAL,
    onClose,
    closeOnEscape: !duplicateMatch
  });

  if (!isOpen) return null;

  const modalContent = (
    <>
      <div
        style={{ zIndex }}
        data-overlay-id="song-form-modal"
        data-overlay-topmost={isTopmost}
        className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto backdrop-enter-animation transition-opacity ${
          isBlocked || duplicateMatch ? 'pointer-events-none select-none opacity-40' : ''
        }`}
        aria-hidden={isBlocked || Boolean(duplicateMatch)}
        inert={isBlocked || Boolean(duplicateMatch) ? true : undefined}
      >
        <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5 modal-enter-animation max-h-[90vh] my-auto flex flex-col">
          
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900">
                <Music className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {songToEdit ? 'Edit Song Record' : 'Add New Song to Library'}
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                  Auto-retrieve metadata from official sources (YouTube Music, YouTube, Spotify, Apple Music, Qobuz, TIDAL)
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

          {/* Form Body */}
          <form id="song-form" onSubmit={handleSubmit} className="overflow-y-auto space-y-4 pr-1 flex-1 min-h-0">
            
            {/* Multi-Source Metadata Auto-Fetch Box */}
            <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-slate-800/80 border border-indigo-100 dark:border-slate-700 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Multi-Source Metadata Retriever</span>
                </label>
                <span className="text-[10px] text-indigo-600/80 dark:text-indigo-400/80 font-medium">
                  YouTube Music • YouTube • Spotify • Apple • Qobuz • TIDAL
                </span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={fetchInput}
                  onChange={(e) => {
                    setFetchInput(e.target.value);
                    setMetaImportError('');
                  }}
                  placeholder="Enter song title, artist, or music link (e.g. Goodness of God or YouTube/Spotify link)"
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />

                <button
                  type="button"
                  onClick={handleFetchMultiSourceMetadata}
                  disabled={isFetchingMeta}
                  className="px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0 shadow-xs"
                >
                  {isFetchingMeta ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>Fetch Metadata</span>
                </button>
              </div>

              {metaImportError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300">{metaImportError}</p>
                </div>
              )}

              {(thumbnailUrl || coverArtUrl) && (
                <div className="flex items-center gap-3 pt-1 border-t border-indigo-100/60 dark:border-slate-700/60">
                  <img
                    src={coverArtUrl || thumbnailUrl}
                    alt="Album / Video Art"
                    className="w-12 h-12 object-cover rounded-md border border-slate-200 dark:border-slate-700 shadow-xs"
                  />
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 flex-1">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {title || 'Metadata loaded'} {artist ? `— ${artist}` : ''}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                      <span>Original Key: <strong className="text-indigo-600 dark:text-indigo-400">{originalKey}</strong></span>
                      {album && <span>• Album: {album}</span>}
                      {releaseYear && <span>• Year: {releaseYear}</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Title & Artist */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Song Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Goodness of God"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Artist / Worship Leader
                </label>
                <input
                  type="text"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="e.g. Bethel Music & Jenn Johnson"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Song Family & Relationship */}
            <div className="p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/60 space-y-2.5">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Song Family & Relationship
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Assigned Song Family
                  </label>
                  <select
                    value={songFamilyId}
                    onChange={(e) => setSongFamilyId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none"
                  >
                    <option value="">(Standalone Song / No Family)</option>
                    {allFamilies.map((fam) => (
                      <option key={fam.id} value={fam.id}>
                        {fam.name} ({fam.versionIds.length} versions)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Version Relationship Type
                  </label>
                  <select
                    value={relationshipType}
                    onChange={(e) => setRelationshipType(e.target.value as SongRelationshipType)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none"
                  >
                    <option value="ORIGINAL">Original Version</option>
                    <option value="LIVE_VERSION">Live Version</option>
                    <option value="ACOUSTIC_VERSION">Acoustic / Unplugged</option>
                    <option value="COVER">Cover Version</option>
                    <option value="REMAKE">Remake / Re-recording</option>
                    <option value="ALTERNATE_VERSION">Alternate / Studio Edit</option>
                    <option value="VERSION">General Version</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Songwriter & Original Artist */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Songwriter(s) / Composer(s)
                </label>
                <input
                  type="text"
                  value={songwriters}
                  onChange={(e) => setSongwriters(e.target.value)}
                  placeholder="e.g. Chris Tomlin, Matt Redman"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Original Artist (if Cover)
                </label>
                <input
                  type="text"
                  value={originalArtist}
                  onChange={(e) => setOriginalArtist(e.target.value)}
                  placeholder="e.g. Hillsong Worship"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Lyrics */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                <span>Lyrics (Optional, used for identity verification)</span>
              </label>
              <textarea
                rows={2}
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Paste song lyrics or chorus here..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              />
            </div>

            {/* Song Status: ORIGINAL / COVER */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Song Status: Original / Cover <span className="text-red-500">*</span></span>
                </span>
                <span className="text-[10px] font-medium text-slate-400">Classifies the recording version</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setVersionType('original');
                    if (relationshipType === 'COVER') setRelationshipType('ORIGINAL');
                  }}
                  className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    versionType === 'original'
                      ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-xs ring-1 ring-emerald-500'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${versionType === 'original' ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                  <span>ORIGINAL</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setVersionType('cover');
                    if (relationshipType === 'ORIGINAL') setRelationshipType('COVER');
                  }}
                  className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    versionType === 'cover'
                      ? 'bg-purple-50 dark:bg-purple-950/80 border-purple-500 text-purple-700 dark:text-purple-300 shadow-xs ring-1 ring-purple-500'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${versionType === 'cover' ? 'bg-purple-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                  <span>COVER</span>
                </button>
              </div>
            </div>

            {/* Category, Language & Original Key */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SongCategory)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none"
                >
                  <option value="praise">Praise (Fast)</option>
                  <option value="worship">Worship (Slow)</option>
                  <option value="both">Both / Versatile</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Language
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none"
                >
                  <option value="English">English</option>
                  <option value="Tagalog">Tagalog</option>
                  <option value="Multi-lingual">Multi-lingual</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <KeyRound className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Original Key</span>
                </label>
                <input
                  type="text"
                  value={originalKey}
                  onChange={(e) => {
                    setOriginalKey(e.target.value);
                    setKey(e.target.value);
                  }}
                  placeholder="e.g. G, A, Bb, Eb"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Musical Specs: BPM, Time Signature, Duration, CCLI */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  BPM (Tempo)
                </label>
                <input
                  type="number"
                  value={bpm}
                  onChange={(e) => setBpm(e.target.value)}
                  placeholder="e.g. 72"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Time Signature
                </label>
                <input
                  type="text"
                  value={timeSignature}
                  onChange={(e) => setTimeSignature(e.target.value)}
                  placeholder="e.g. 4/4"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Duration
                </label>
                <input
                  type="text"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="e.g. 4:56"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  CCLI # (Optional)
                </label>
                <input
                  type="text"
                  value={ccliNumber}
                  onChange={(e) => setCcliNumber(e.target.value)}
                  placeholder="e.g. 7117726"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Album & Release Year */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Album
                </label>
                <input
                  type="text"
                  value={album}
                  onChange={(e) => setAlbum(e.target.value)}
                  placeholder="e.g. Victory"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Release Year
                </label>
                <input
                  type="text"
                  value={releaseYear}
                  onChange={(e) => setReleaseYear(e.target.value)}
                  placeholder="e.g. 2019"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Theme Tags */}
            <div className="space-y-1.5 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                🏷️ Theme Tags (for Smart Song Recommendations)
              </label>
              
              {/* Selected Themes */}
              {themes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {themes.map((themeTag) => (
                    <span
                      key={themeTag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                    >
                      <span>{themeTag}</span>
                      <button
                        type="button"
                        onClick={() => setThemes(themes.filter((t) => t !== themeTag))}
                        className="hover:text-red-500 font-bold ml-1 text-xs"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Add Custom Tag Input */}
              <div className="flex gap-2 mb-1.5">
                <input
                  type="text"
                  value={customThemeInput}
                  onChange={(e) => setCustomThemeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = customThemeInput.trim();
                      if (val && !themes.includes(val)) {
                        setThemes([...themes, val]);
                        setCustomThemeInput('');
                      }
                    }
                  }}
                  placeholder="Add custom theme tag (e.g. Communion, Hope) and press Enter"
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const val = customThemeInput.trim();
                    if (val && !themes.includes(val)) {
                      setThemes([...themes, val]);
                      setCustomThemeInput('');
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                >
                  Add Tag
                </button>
              </div>

              {/* Quick Select Presets */}
              <div className="flex flex-wrap gap-1">
                {COMMON_THEMES.slice(0, 16).map((preset) => {
                  const isSelected = themes.includes(preset);
                  return (
                    <button
                      type="button"
                      key={preset}
                      onClick={() => {
                        if (isSelected) {
                          setThemes(themes.filter((t) => t !== preset));
                        } else {
                          setThemes([...themes, preset]);
                        }
                      }}
                      className={`px-2 py-0.5 text-[10px] font-medium rounded-full border transition-colors ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {isSelected ? '✓ ' : '+ '}{preset}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notes / Chords */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Notes & Worship Team Performance Tips
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Key transitions, vocal solos, acoustic start instructions..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              />
            </div>

          </form>

          {/* Footer Controls */}
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
            {songToEdit && onDeleteSong ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDeleteSong(songToEdit);
                }}
                className="px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>Delete Song</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="song-form"
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {songToEdit ? 'Save Changes' : 'Save Song'}
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Duplicate Song / Title Conflict Modal */}
      {duplicateMatch && duplicateMatch.existingSong && pendingSongData && (
        <DuplicateSongModal
          isOpen={!!duplicateMatch}
          conflictResult={duplicateMatch}
          matchType={duplicateMatch.matchType}
          existingSong={duplicateMatch.existingSong}
          candidateSong={{
            id: songToEdit?.id,
            title: pendingSongData.title || title,
            artist: pendingSongData.artist || artist,
            key: pendingSongData.key || key,
            album: pendingSongData.album || album,
            originalArtist: pendingSongData.originalArtist || originalArtist,
            songwriters: pendingSongData.songwriters || songwriters,
            lyrics: pendingSongData.lyrics || lyrics,
            category: pendingSongData.category || category,
            thumbnailUrl: pendingSongData.thumbnailUrl || thumbnailUrl
          }}
          isEditing={Boolean(songToEdit)}
          onCancel={() => {
            setDuplicateMatch(null);
            setPendingSongData(null);
          }}
          onSaveSeparate={handleSaveSeparate}
          onSaveRelated={handleSaveRelated}
          onContinueAnyway={handleSaveSeparate}
          onViewExisting={(song) => {
            setDuplicateMatch(null);
            setPendingSongData(null);
            onClose();
            if (onViewExistingSong) {
              onViewExistingSong(song);
            }
          }}
        />
      )}
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
