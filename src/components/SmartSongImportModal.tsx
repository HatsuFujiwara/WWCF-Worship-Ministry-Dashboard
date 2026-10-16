import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Youtube,
  Music,
  Check,
  AlertTriangle,
  AlertCircle,
  Loader2,
  X,
  Plus,
  ExternalLink,
  Sparkles,
  Layers,
  Info,
  Calendar,
  Clock,
  ArrowRight,
  ArrowLeft,
  Edit2,
  Clipboard,
  ListMusic,
  CheckCircle2,
  RotateCcw,
  EyeOff
} from 'lucide-react';
import { Song, SongCategory, SongConflictResult, SongRelationshipType, SongFamily, SongVersionType } from '../types';
import { extractYouTubeId, SongService } from '../services/songService';
import { SongFamilyService } from '../services/songFamilyService';
import { fetchMultiSourceMetadata } from '../services/musicMetadataService';
import {
  YouTubePlaylistService,
  YouTubePlaylistPreview,
  PlaylistItem,
  ImportSummary,
  extractPlaylistId
} from '../services/youtubePlaylistService';
import { RearrangeableSongList } from './RearrangeableSongList';
import { sanitizeSongLanguage, SongLanguage } from '../utils/languageUtils';
import { getManilaTodayString } from '../utils/dateUtils';
import { detectSongVersionType } from '../utils/versionDetectionUtils';
import { detectYouTubeImportType, DetectedImportType } from '../utils/importUrlUtils';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import { SwapTitleArtistButton } from './SwapTitleArtistButton';

export interface SmartSongImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Single song completions
  onSongImportComplete?: (savedSong: Song, isNew: boolean) => void;
  // Playlist completions
  onPlaylistImportComplete?: (importedSongs: Song[], summary: ImportSummary) => void;
  // Fallback combined completion
  onImportComplete?: (importedSongs: Song[] | Song, summaryOrIsNew?: any) => void;
  // Lineup Context
  isEditing?: boolean;
  initialCategory?: 'praise' | 'worship' | 'both';
  targetLineupSlot?: {
    category: 'praise' | 'worship';
    index: number;
  };
  onSelectExistingForLineup?: (existingSong: Song, performedKey?: string) => void;
  onSelectBlank?: () => void;
  showToast?: (msg: string, type?: 'success' | 'danger' | 'info') => void;
}

type ModalStep =
  | 'INPUT'
  | 'SONG_PREVIEW'
  | 'SONG_CONFLICT'
  | 'PLAYLIST_PREVIEW'
  | 'PLAYLIST_SUMMARY';

export const SmartSongImportModal: React.FC<SmartSongImportModalProps> = ({
  isOpen,
  onClose,
  onSongImportComplete,
  onPlaylistImportComplete,
  onImportComplete,
  isEditing = false,
  initialCategory = 'praise',
  targetLineupSlot,
  onSelectExistingForLineup,
  onSelectBlank,
  showToast = (_msg: string, _type?: 'success' | 'danger' | 'info') => {}
}) => {
  // Navigation / Loading state
  const [step, setStep] = useState<ModalStep>('INPUT');
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [detectedType, setDetectedType] = useState<DetectedImportType | null>(null);

  // Single Song Metadata State
  const [isEditingSong, setIsEditingSong] = useState(false);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [releaseYear, setReleaseYear] = useState('');
  const [duration, setDuration] = useState('');
  const [key, setKey] = useState('');
  const [performedKey, setPerformedKey] = useState('');
  const [language, setLanguage] = useState<SongLanguage>('English');
  const [category, setCategory] = useState<SongCategory>(initialCategory);
  const [versionType, setVersionType] = useState<SongVersionType>('original');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeId, setYoutubeId] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [songwriters, setSongwriters] = useState('');
  const [ccliNumber, setCcliNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Single Song Conflict / Duplicate state
  const [conflictResult, setConflictResult] = useState<SongConflictResult | null>(null);
  const [existingSongMatch, setExistingSongMatch] = useState<Song | null>(null);
  const [selectedRelationship, setSelectedRelationship] = useState<SongRelationshipType>('COVER');
  const [existingSongFamily, setExistingSongFamily] = useState<SongFamily | null>(null);

  // Available Song Families for Pre-Import Review
  const [availableFamilies, setAvailableFamilies] = useState<SongFamily[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>('');
  const [familyRelationship, setFamilyRelationship] = useState<SongRelationshipType>('COVER');

  // Playlist State
  const [apiKey, setApiKey] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('YOUTUBE_API_KEY') : null) || (import.meta as any).env?.VITE_YOUTUBE_API_KEY || '');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [serverKeyStatus, setServerKeyStatus] = useState<{ configured: boolean; provider: string } | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [secondaryVideoId, setSecondaryVideoId] = useState<string | null>(null);
  const [playlistPreview, setPlaylistPreview] = useState<YouTubePlaylistPreview | null>(null);
  const [previewItems, setPreviewItems] = useState<PlaylistItem[]>([]);
  const [selectedItemsMap, setSelectedItemsMap] = useState<Record<string, boolean>>({});
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [isImportingPlaylist, setIsImportingPlaylist] = useState(false);

  // Helper to remove common YouTube title noise like "(Official Video)", "[Live]", etc.
  const cleanYouTubeTitleNoise = (rawTitle: string): string => {
    if (!rawTitle) return '';
    let cleaned = rawTitle;
    cleaned = cleaned.replace(/\s*[\[\(](?:official\s+)?(?:music\s+)?(?:lyric\s+)?(?:video|audio|visualizer|live|acoustic|performance|hd|4k|remastered)[^\]\)]*[\]\)]/gi, '');
    cleaned = cleaned.replace(/\s*[\[\(](?:lyrics?|official)[\]\)]/gi, '');
    cleaned = cleaned.replace(/\s*[-–—|]\s*(?:official\s+)?(?:music\s+)?(?:lyric\s+)?(?:video|audio|lyrics?)$/gi, '');
    cleaned = cleaned.replace(/^[\s\-–—|:]+|[\s\-–—|:]+$/g, '').trim();
    return cleaned || rawTitle;
  };

  // Reset state when modal is opened
  useEffect(() => {
    if (isOpen) {
      setStep('INPUT');
      setUrlInput('');
      setErrorMsg(null);
      setIsLoading(false);
      setDetectedType(null);
      setSecondaryVideoId(null);
      setIsEditingSong(true);

      // Check server API key configuration
      YouTubePlaylistService.checkServerStatus()
        .then((status) => setServerKeyStatus(status))
        .catch(() => {});

      // Reset single song fields
      setTitle('');
      setArtist('');
      setAlbum('');
      setReleaseYear('');
      setDuration('');
      setKey('');
      setPerformedKey('');
      setLanguage('English');
      setCategory(initialCategory || 'praise');
      setVersionType('original');
      setYoutubeUrl('');
      setYoutubeId('');
      setThumbnailUrl('');
      setLyrics('');
      setSongwriters('');
      setCcliNumber('');
      setNotes('');
      setConflictResult(null);
      setExistingSongMatch(null);
      setSelectedRelationship('COVER');
      setExistingSongFamily(null);
      setSelectedFamilyId('');
      setFamilyRelationship('COVER');

      // Load available Song Families
      SongFamilyService.getSongFamilies()
        .then((fams) => setAvailableFamilies(fams || []))
        .catch(() => {});

      // Reset playlist fields
      setPlaylistPreview(null);
      setPreviewItems([]);
      setSelectedItemsMap({});
      setImportSummary(null);
      setIsImportingPlaylist(false);
    }
  }, [isOpen, initialCategory]);

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'smart-song-import-modal',
    isOpen,
    layer: OverlayLayer.MODAL,
    onClose,
    closeOnEscape: true
  });

  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    if (val.trim()) {
      localStorage.setItem('YOUTUBE_API_KEY', val.trim());
    } else {
      localStorage.removeItem('YOUTUBE_API_KEY');
    }
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setUrlInput(text.trim());
          setErrorMsg(null);
        }
      }
    } catch {
      // Ignore clipboard permission errors
    }
  };

  // Unified Smart Fetch Handler
  const handleSmartFetch = async () => {
    const raw = urlInput.trim();
    if (!raw) {
      setErrorMsg('Please enter a valid YouTube or YouTube Music song or playlist URL.');
      return;
    }

    const detection = detectYouTubeImportType(raw);

    if (detection.type === 'invalid') {
      setErrorMsg('Unable to identify this link. Please enter a valid YouTube or YouTube Music song or playlist URL.');
      return;
    }

    setDetectedType(detection.type);
    setSecondaryVideoId(detection.secondaryId || null);
    setIsLoading(true);
    setErrorMsg(null);

    if (detection.type === 'song') {
      // ==========================================
      // CASE A: SINGLE SONG WORKFLOW
      // ==========================================
      try {
        const meta = await fetchMultiSourceMetadata(raw);

        const parsedTitle = meta.title || 'Untitled Song';
        const parsedArtist = meta.artist || 'Unknown Artist';
        const parsedYtId = meta.youtubeId || detection.id || extractYouTubeId(raw) || '';
        const parsedYtUrl =
          meta.youtubeMusicUrl ||
          meta.youtubeUrl ||
          (parsedYtId ? `https://www.youtube.com/watch?v=${parsedYtId}` : raw);
        const parsedThumb =
          meta.thumbnailUrl || (parsedYtId ? `https://img.youtube.com/vi/${parsedYtId}/hqdefault.jpg` : '');
        const parsedLang = sanitizeSongLanguage(meta.language || 'English');
        const parsedKey = meta.key || meta.originalKey || '';

        // Auto-detect version type
        const detectedVer = detectSongVersionType({
          title: parsedTitle,
          artist: parsedArtist,
          relationshipType: meta.relationshipType
        });
        setVersionType(detectedVer.versionType);

        setTitle(parsedTitle);
        setArtist(parsedArtist);
        setAlbum(meta.album || '');
        setReleaseYear(meta.releaseYear || '');
        setDuration(meta.duration || '');
        setKey(parsedKey);
        setPerformedKey(parsedKey);
        setLanguage(parsedLang);
        setCategory(initialCategory || 'praise');
        setYoutubeUrl(parsedYtUrl);
        setYoutubeId(parsedYtId);
        setThumbnailUrl(parsedThumb);
        setLyrics(meta.lyrics || '');
        setSongwriters(meta.songwriters || '');
        setCcliNumber(meta.ccliNumber || '');
        setNotes(
          `Imported from ${parsedYtUrl.includes('music.youtube.com') ? 'YouTube Music' : 'YouTube'} on ${getManilaTodayString()}`
        );

        // Load latest available families for user selection during review
        try {
          const fams = await SongFamilyService.getSongFamilies();
          setAvailableFamilies(fams || []);
        } catch (famErr) {
          console.warn('Could not load song families:', famErr);
        }

        // Navigate directly to the Pre-Import Review step so the user can verify
        // and correct Title/Artist BEFORE duplicate detection is run!
        setConflictResult(null);
        setExistingSongMatch(null);
        setSelectedFamilyId('');
        setFamilyRelationship(detectedVer.versionType === 'cover' ? 'COVER' : 'ORIGINAL');
        setIsEditingSong(true);
        setStep('SONG_PREVIEW');
      } catch (err: any) {
        console.warn('Single song metadata fetch error:', err);
        const cleanYtId = detection.id || extractYouTubeId(raw) || '';
        setTitle('');
        setArtist('');
        setVersionType('original');
        setYoutubeUrl(raw);
        setYoutubeId(cleanYtId);
        if (cleanYtId) {
          setThumbnailUrl(`https://img.youtube.com/vi/${cleanYtId}/hqdefault.jpg`);
        }
        setIsEditingSong(true);
        setStep('SONG_PREVIEW');
        setErrorMsg('Unable to retrieve automatic metadata from this link. You can manually enter the song details below.');
      } finally {
        setIsLoading(false);
      }
    } else {
      // ==========================================
      // CASE B: PLAYLIST WORKFLOW
      // ==========================================
      try {
        const data = await YouTubePlaylistService.fetchPlaylistPreview(raw, apiKey);
        if (!data || !data.items || data.items.length === 0) {
          setErrorMsg('The playlist was found, but contains no public, playable videos.');
          return;
        }

        // Initialize preview items with their default category ONCE upon fetch:
        // Rule:
        // EXACTLY 2 SONGS:
        // Song 1 (idx 0) -> Praise
        // Song 2 (idx 1) -> Worship
        // 3 OR MORE SONGS:
        // Song 1 & 2 (idx 0, 1) -> Praise
        // Song 3+ (idx >= 2) -> Worship
        const initializedItems: PlaylistItem[] = data.items.map((item, idx) => {
          let cat: 'praise' | 'worship';
          if (data.items.length === 2) {
            cat = idx === 0 ? 'praise' : 'worship';
          } else {
            cat = idx < 2 ? 'praise' : 'worship';
          }
          return {
            ...item,
            category: cat
          };
        });

        setPlaylistPreview(data);
        setPreviewItems(initializedItems);

        // Select all items by default
        const initialMap: Record<string, boolean> = {};
        data.items.forEach((item) => {
          initialMap[item.videoId] = true;
        });
        setSelectedItemsMap(initialMap);

        setStep('PLAYLIST_PREVIEW');
      } catch (err: any) {
        console.error('Playlist fetch error:', err);
        const isKeyIssue =
          err?.errorCode === 'YOUTUBE_API_KEY_MISSING' ||
          err?.errorCode === 'YOUTUBE_API_KEY_INVALID' ||
          err?.errorCode === 'YOUTUBE_API_NOT_ENABLED' ||
          err?.errorCode === 'YOUTUBE_API_FORBIDDEN';

        if (isKeyIssue) {
          setShowApiKeyInput(true);
        }

        setErrorMsg(err.message || 'Failed to fetch playlist details. Please check the URL and your API key configuration.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Helper to force single-song import if a watch?v=...&list=... link was pasted
  const handleImportSingleSongInstead = () => {
    if (!secondaryVideoId) return;
    const singleSongUrl = `https://www.youtube.com/watch?v=${secondaryVideoId}`;
    setUrlInput(singleSongUrl);
    setSecondaryVideoId(null);
    setDetectedType('song');
    setErrorMsg(null);
    setTimeout(() => {
      handleSmartFetch();
    }, 50);
  };

  // Step 1: Pre-Import Review Validation & Duplicate Detection on Corrected Data
  const handleValidateAndProceedToSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      showToast('Please enter a song title.', 'danger');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      // Run Duplicate / Conflict Detection on the user-corrected / reviewed metadata
      const conflict = await SongService.detectSongConflict({
        title: trimmedTitle,
        artist: artist.trim() || 'Unknown Artist',
        album: album.trim(),
        songwriters: songwriters.trim(),
        lyrics: lyrics.trim(),
        ccliNumber: ccliNumber.trim(),
        youtubeUrl: youtubeUrl.trim(),
        youtubeId: youtubeId.trim()
      });

      if (conflict.hasConflict && conflict.existingSong) {
        setConflictResult(conflict);
        setExistingSongMatch(conflict.existingSong);
        if (conflict.existingSong.songFamilyId) {
          const fam = await SongFamilyService.getSongFamilyById(conflict.existingSong.songFamilyId);
          setExistingSongFamily(fam);
        } else {
          setExistingSongFamily(null);
        }

        if (conflict.suggestedRelationship) {
          setSelectedRelationship(conflict.suggestedRelationship);
          if (conflict.suggestedRelationship === 'COVER') {
            setVersionType('cover');
          } else if (conflict.suggestedRelationship === 'ORIGINAL') {
            setVersionType('original');
          }
        }

        // Move to Conflict resolution view with candidate metadata intact
        setStep('SONG_CONFLICT');
        return;
      }

      // No conflict detected -> proceed to direct save
      await executeSaveImportedSong({ linkToExistingFamily: false });
    } catch (err: any) {
      console.error('Validation before save failed:', err);
      showToast('Failed to validate song. Please try again.', 'danger');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Final Save Execution (with optional Family Linking)
  const executeSaveImportedSong = async (options?: {
    linkToExistingFamily?: boolean;
    customRelationship?: SongRelationshipType;
  }) => {
    const linkToExistingFamily = options?.linkToExistingFamily ?? false;
    const relationshipToUse = options?.customRelationship || selectedRelationship;

    const finalVersionType: SongVersionType = linkToExistingFamily
      ? (relationshipToUse === 'COVER' ? 'cover' : relationshipToUse === 'ORIGINAL' ? 'original' : versionType)
      : versionType;

    setIsLoading(true);
    try {
      const songDataToSave: Partial<Song> & { title: string } = {
        title: title.trim(),
        artist: artist.trim() || 'Unknown Artist',
        album: album.trim(),
        releaseYear: releaseYear.trim(),
        genre: 'Praise & Worship',
        key: key.trim(),
        originalKey: key.trim(),
        versionType: finalVersionType,
        duration: duration.trim() || '3:45',
        category: category,
        language: sanitizeSongLanguage(language),
        youtubeUrl: youtubeUrl.trim(),
        youtubeId: youtubeId.trim() || (youtubeUrl ? extractYouTubeId(youtubeUrl) || undefined : undefined),
        thumbnailUrl: thumbnailUrl.trim() || (youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : undefined),
        lyrics: lyrics.trim(),
        songwriters: songwriters.trim(),
        ccliNumber: ccliNumber.trim(),
        notes: notes.trim()
      };

      const saved = await SongService.saveSong(songDataToSave);

      // Scenario A: User accepted linking to conflicting existing song
      if (linkToExistingFamily && existingSongMatch) {
        try {
          await SongFamilyService.linkSongPair({
            existingSong: existingSongMatch,
            newSong: saved,
            relationship: relationshipToUse
          });
        } catch (e) {
          console.error('Failed to link song family:', e);
        }
      }
      // Scenario B: User explicitly chose an existing Song Family during pre-import review
      else if (selectedFamilyId && selectedFamilyId !== 'NEW') {
        try {
          await SongFamilyService.addSongToFamily(
            selectedFamilyId,
            saved.id,
            familyRelationship || (versionType === 'original' ? 'ORIGINAL' : 'COVER')
          );
        } catch (e) {
          console.error('Failed to add to selected song family:', e);
        }
      }
      // Scenario C: User chose to create a new Song Family for this song
      else if (selectedFamilyId === 'NEW') {
        try {
          await SongFamilyService.createSongFamily({
            name: saved.title,
            songIds: [saved.id],
            originalSongId: saved.id,
            versions: [{ songId: saved.id, relationshipType: 'ORIGINAL' }]
          });
        } catch (e) {
          console.error('Failed to create new song family:', e);
        }
      }

      showToast(`"${saved.title}" imported successfully!`, 'success');

      try {
        if (onSongImportComplete) {
          onSongImportComplete(saved, true);
        } else if (onImportComplete) {
          onImportComplete(saved, true);
        }

        if (targetLineupSlot && onSelectExistingForLineup) {
          onSelectExistingForLineup(saved, performedKey.trim() || key.trim());
        }
      } catch (cbErr) {
        console.warn('[SmartSongImportModal] Error in parent import completion callback:', cbErr);
      }

      onClose();
    } catch (err: any) {
      console.error(err);
      showToast('Failed to save imported song.', 'danger');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseExistingSongInLineup = () => {
    if (!existingSongMatch) return;
    if (onSelectExistingForLineup) {
      onSelectExistingForLineup(existingSongMatch, performedKey.trim() || existingSongMatch.key || '');
    }
    showToast(`Added "${existingSongMatch.title}" to lineup`, 'success');
    onClose();
  };

  // Playlist Items Toggle Handlers
  const handleToggleSelectAll = (selectAll: boolean) => {
    const updated: Record<string, boolean> = {};
    previewItems.forEach((item) => {
      updated[item.videoId] = selectAll;
    });
    setSelectedItemsMap(updated);
  };

  const handleTogglePlaylistItem = (videoId: string) => {
    setSelectedItemsMap((prev) => ({
      ...prev,
      [videoId]: !prev[videoId]
    }));
  };

  const selectedPlaylistCount = Object.values(selectedItemsMap).filter(Boolean).length;

  const handleExecutePlaylistImport = async () => {
    if (!playlistPreview) return;

    const rawSelected = previewItems.filter((item) => selectedItemsMap[item.videoId]);
    if (rawSelected.length === 0) {
      showToast('Please select at least one song to import.', 'danger');
      return;
    }

    // Pass items in their reviewed preview order with user-assigned categories,
    // preserving their original source YouTube playlistPosition for provenance/notes
    const itemsToImport = rawSelected.map((item) => ({
      ...item
    }));

    setIsImportingPlaylist(true);

    try {
      const { summary, importedSongs } = await YouTubePlaylistService.importPlaylistSongs(
        itemsToImport,
        {
          playlistId: playlistPreview.playlistId,
          playlistName: playlistPreview.playlistName
        }
      );

      setImportSummary(summary);
      setStep('PLAYLIST_SUMMARY');

      try {
        if (onPlaylistImportComplete) {
          onPlaylistImportComplete(importedSongs, summary);
        } else if (onImportComplete) {
          onImportComplete(importedSongs, summary);
        }
      } catch (cbErr) {
        console.warn('[SmartSongImportModal] Error in playlist import completion callback:', cbErr);
      }
    } catch (err: any) {
      console.error(err);
      showToast('Error importing songs from playlist.', 'danger');
    } finally {
      setIsImportingPlaylist(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      style={{ zIndex }}
      data-overlay-id="smart-song-import-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto backdrop-enter-animation transition-opacity ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div
        data-tour="import-modal-container"
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto modal-enter-animation"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/80 text-red-600 dark:text-red-400 flex items-center justify-center shadow-xs">
              <Youtube className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                <span>Import Song / Playlist</span>
                {targetLineupSlot && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 capitalize">
                    For {targetLineupSlot.category} #{targetLineupSlot.index + 1}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Paste a YouTube or YouTube Music song or playlist link
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          
          {/* ========================================================================= */}
          {/* STEP 1: INPUT URL */}
          {/* ========================================================================= */}
          {step === 'INPUT' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  YouTube or YouTube Music Link (Song or Playlist) <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      data-tour="playlist-url-input"
                      type="text"
                      value={urlInput}
                      onChange={(e) => {
                        setUrlInput(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSmartFetch();
                        }
                      }}
                      placeholder="https://www.youtube.com/watch?v=... or https://youtube.com/playlist?list=... or music.youtube.com/..."
                      className="w-full pl-9 pr-24 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                      autoFocus
                    />
                    <Youtube className="w-4 h-4 text-red-500 absolute left-3 top-3 pointer-events-none" />
                    {urlInput && (
                      <button
                        type="button"
                        onClick={() => setUrlInput('')}
                        className="absolute right-16 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
                        title="Clear"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handlePasteClipboard}
                      className="absolute right-2 top-2 px-2 py-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-100 dark:bg-slate-700 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                      title="Paste from clipboard"
                    >
                      <Clipboard className="w-3 h-3" />
                      <span>Paste</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSmartFetch}
                    disabled={isLoading || !urlInput.trim()}
                    className="px-5 py-2.5 font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors flex items-center gap-2 shrink-0 cursor-pointer min-h-[40px]"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Fetching...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Import</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 flex items-center justify-between">
                  <span>
                    Auto-detects songs (<code className="text-slate-600 dark:text-slate-300">watch?v=...</code> / <code className="text-slate-600 dark:text-slate-300">youtu.be/...</code>) and playlists (<code className="text-slate-600 dark:text-slate-300">playlist?list=...</code>).
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                    className="text-[11px] text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium underline cursor-pointer ml-2"
                  >
                    {showApiKeyInput ? 'Hide API Key' : 'API Key (Optional)'}
                  </button>
                </p>

                {/* Switch to single song if URL has both v= and list= */}
                {secondaryVideoId && (
                  <div className="mt-2 p-2.5 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200/80 dark:border-indigo-800/80 flex items-center justify-between text-xs animate-fadeIn">
                    <span className="text-slate-600 dark:text-slate-300">
                      Link contains both a playlist and a single song video (<code className="text-indigo-600 dark:text-indigo-400 font-mono">{secondaryVideoId}</code>).
                    </span>
                    <button
                      type="button"
                      onClick={handleImportSingleSongInstead}
                      className="px-2.5 py-1 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:text-indigo-800 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 rounded-md transition-colors cursor-pointer shrink-0 ml-2 shadow-2xs"
                    >
                      Import Single Song Instead
                    </button>
                  </div>
                )}
              </div>

              {/* Optional Custom API Key & Official Google Cloud Credentials Management */}
              {showApiKeyInput && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 animate-fadeIn">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <label htmlFor="custom-youtube-api-key" className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                        Custom YouTube API Key
                      </label>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Optional — saved in your browser for playlist imports
                      </span>
                    </div>

                    {/* Official Google Cloud Credentials Link Button */}
                    <a
                      href="https://console.cloud.google.com/apis/credentials"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/80 dark:hover:bg-indigo-900/80 border border-indigo-200 dark:border-indigo-800 rounded-lg transition-colors cursor-pointer"
                      title="Open official Google Cloud Credentials in a new tab"
                      aria-label="Get or manage YouTube API key in Google Cloud Credentials (opens in a new tab)"
                    >
                      <span>Get / Manage YouTube API Key</span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    </a>
                  </div>

                  {/* Server status indicator if available */}
                  {serverKeyStatus?.configured && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>Server Project Key is active. A custom key below is completely optional.</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <input
                      id="custom-youtube-api-key"
                      type="password"
                      value={apiKey}
                      onChange={(e) => handleApiKeyChange(e.target.value)}
                      placeholder="AIzaSy..."
                      aria-label="YouTube Data API v3 Key"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                    />
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>Need a key? Open Google Cloud Credentials to create or manage your own YouTube API key.</span>
                      <button
                        type="button"
                        onClick={() => setShowSetupGuide(!showSetupGuide)}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold ml-2 shrink-0 cursor-pointer"
                      >
                        {showSetupGuide ? 'Hide Setup Help' : 'Setup Help'}
                      </button>
                    </div>
                  </div>

                  {/* Step-by-Step Setup Help */}
                  {showSetupGuide && (
                    <div className="p-3 bg-white dark:bg-slate-900/90 rounded-lg border border-slate-200 dark:border-slate-750 text-[11px] text-slate-600 dark:text-slate-300 space-y-1.5 animate-fadeIn">
                      <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span>How to get your YouTube Data API v3 key:</span>
                      </div>
                      <ol className="list-decimal list-inside space-y-1 pl-1 text-[11px] leading-relaxed">
                        <li>Click <strong>Get / Manage YouTube API Key</strong> above to open Google Cloud Console.</li>
                        <li>Select an existing project or click <em>New Project</em>.</li>
                        <li>Ensure <strong>YouTube Data API v3</strong> is enabled in <em>APIs &amp; Services &gt; Library</em>.</li>
                        <li>Go to <em>APIs &amp; Services &gt; Credentials</em> &gt; click <strong>+ CREATE CREDENTIALS</strong> &gt; <strong>API key</strong>.</li>
                        <li>(Recommended) Edit the key and set <em>API restrictions</em> to "YouTube Data API v3".</li>
                        <li>Paste your key into the field above. It is saved in your browser for future imports.</li>
                      </ol>
                    </div>
                  )}
                </div>
              )}

              {/* Loading Banner */}
              {isLoading && (
                <div className="p-3.5 bg-indigo-50/80 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs text-indigo-800 dark:text-indigo-200 flex items-center gap-2.5">
                  <Loader2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-spin shrink-0" />
                  <span>Analyzing link and retrieving metadata... Please wait.</span>
                </div>
              )}

              {/* Error Message */}
              {errorMsg && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <p className="font-semibold text-xs leading-relaxed">{errorMsg}</p>
                    {errorMsg.toLowerCase().includes('key') && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <a
                          href="https://console.cloud.google.com/apis/credentials"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer"
                        >
                          <span>Get / Manage YouTube API Key</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        {!showApiKeyInput && (
                          <button
                            type="button"
                            onClick={() => setShowApiKeyInput(true)}
                            className="px-2.5 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 rounded-lg transition-colors cursor-pointer"
                          >
                            Enter API Key Below
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Info Feature Card */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                  <Info className="w-4 h-4 text-indigo-500" />
                  <span>Smart Link Detection</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  • <strong>Single Song Link:</strong> Extracts title, artist, original key, release year, album art, duration, language, and performs duplicate/conflict detection.<br />
                  • <strong>Playlist Link:</strong> Loads the full playlist with rearrangeable ordering, select/deselect options, and bulk database import.
                </p>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 2A: SINGLE SONG CONFLICT / DUPLICATE DETECTION RESOLUTION */}
          {/* ========================================================================= */}
          {step === 'SONG_CONFLICT' && existingSongMatch && (
            <div className="space-y-4 animate-in fade-in">
              <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                conflictResult?.conflictType === 'SAME_TITLE_DIFF_ARTIST'
                  ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-200'
                  : 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/80 text-indigo-950 dark:text-indigo-200'
              }`}>
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <h4 className="font-bold text-sm">
                    {conflictResult?.conflictType === 'SAME_TITLE_SAME_ARTIST' && '⚠️ POSSIBLE DUPLICATE SONG'}
                    {conflictResult?.conflictType === 'SAME_TITLE_DIFF_ARTIST' && '⚠️ SAME TITLE, DIFFERENT ARTIST'}
                    {conflictResult?.conflictType === 'SAME_VIDEO_MATCH' && '⚠️ MATCHING VIDEO LINK FOUND'}
                    {conflictResult?.conflictType === 'DIFF_TITLE_POSSIBLE_COMPOSITION' && '⚠️ POSSIBLE RELATED SONG'}
                  </h4>
                  <p className="text-xs leading-relaxed opacity-90">
                    {conflictResult?.conflictType === 'SAME_TITLE_SAME_ARTIST' &&
                      'Same artist detected. This may be the same recording or a duplicate.'}
                    {conflictResult?.conflictType === 'SAME_TITLE_DIFF_ARTIST' &&
                      'A song with the same title exists in your Song Database, but the artist is different. Are these the same underlying song?'}
                    {conflictResult?.conflictType === 'SAME_VIDEO_MATCH' &&
                      'An existing song in your database shares this exact YouTube recording link.'}
                    {conflictResult?.conflictType === 'DIFF_TITLE_POSSIBLE_COMPOSITION' &&
                      'This song has a different title but composition analysis suggests it may be related to an existing song.'}
                  </p>
                </div>
              </div>

              {/* Side-by-Side Comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative">
                {/* Existing Song Card */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/90 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 bg-slate-200/60 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                      Existing in Library
                    </span>
                    {existingSongMatch.timesUsed > 0 && (
                      <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                        Used {existingSongMatch.timesUsed}x
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 pt-1">
                    <h5 className="text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
                      {existingSongMatch.title}
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-medium line-clamp-1">
                      {existingSongMatch.artist || 'Unknown Artist'}
                    </p>
                    {existingSongMatch.album && (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                        Album: {existingSongMatch.album}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                    {existingSongMatch.key && <span>Key: <strong className="text-slate-700 dark:text-slate-200">{existingSongMatch.key}</strong></span>}
                    {existingSongMatch.language && <span>Lang: <strong className="text-slate-700 dark:text-slate-200">{existingSongMatch.language}</strong></span>}
                    {existingSongFamily && (
                      <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 font-semibold">
                        <Layers className="w-3 h-3" /> Family: {existingSongFamily.name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Candidate / Imported Song Card */}
                <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/80 px-2 py-0.5 rounded-md">
                      Imported Link
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      New Record
                    </span>
                  </div>

                  <div className="space-y-1 pt-1">
                    <h5 className="text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
                      {title}
                    </h5>
                    <p className="text-xs text-indigo-950 dark:text-indigo-200 font-semibold line-clamp-1">
                      {artist || 'Unknown Artist'}
                    </p>
                    {album && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        Album: {album}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-indigo-200/60 dark:border-indigo-900/60">
                    {key && <span>Key: <strong className="text-slate-700 dark:text-slate-200">{key}</strong></span>}
                    <span>Lang: <strong className="text-slate-700 dark:text-slate-200">{language}</strong></span>
                    <span>Cat: <strong className="text-slate-700 dark:text-slate-200 capitalize">{category}</strong></span>
                  </div>
                </div>
              </div>

              {/* Relationship picker if DIFFERENT ARTIST */}
              {conflictResult?.conflictType === 'SAME_TITLE_DIFF_ARTIST' && (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                  <p className="font-bold text-slate-800 dark:text-slate-200">
                    If this is a related song, choose relationship type:
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['COVER', 'LIVE_VERSION', 'ACOUSTIC_VERSION', 'ALTERNATE_VERSION', 'ORIGINAL', 'VERSION'] as SongRelationshipType[]).map((rel) => (
                      <button
                        key={rel}
                        type="button"
                        onClick={() => setSelectedRelationship(rel)}
                        className={`p-2 rounded-lg border text-center transition-all cursor-pointer font-bold ${
                          selectedRelationship === rel
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {rel === 'COVER' && 'Cover'}
                        {rel === 'LIVE_VERSION' && 'Live'}
                        {rel === 'ACOUSTIC_VERSION' && 'Acoustic'}
                        {rel === 'ALTERNATE_VERSION' && 'Alt Version'}
                        {rel === 'ORIGINAL' && 'Original'}
                        {rel === 'VERSION' && 'Version'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons for Conflict */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                {targetLineupSlot && (
                  <button
                    type="button"
                    onClick={handleUseExistingSongInLineup}
                    className="w-full py-2.5 px-4 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>Use Existing Song in Lineup</span>
                  </button>
                )}

                {conflictResult?.conflictType === 'SAME_TITLE_DIFF_ARTIST' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setStep('SONG_PREVIEW')}
                      className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 text-xs text-center"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Back to Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => executeSaveImportedSong({ linkToExistingFamily: false })}
                      disabled={isLoading}
                      className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl transition-colors cursor-pointer text-xs"
                    >
                      DIFFERENT SONG
                    </button>
                    <button
                      type="button"
                      onClick={() => executeSaveImportedSong({ linkToExistingFamily: true })}
                      disabled={isLoading}
                      className="py-2.5 px-3 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 text-xs"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>LINK TO FAMILY</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setStep('SONG_PREVIEW')}
                      className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 text-xs text-center"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Back to Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep('INPUT')}
                      className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer text-xs text-center"
                    >
                      Cancel / New Link
                    </button>
                    <button
                      type="button"
                      onClick={() => executeSaveImportedSong({ linkToExistingFamily: false })}
                      disabled={isLoading}
                      className="py-2.5 px-3 font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/80 hover:bg-amber-100 dark:hover:bg-amber-900/80 border border-amber-200 dark:border-amber-800 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1 text-xs text-center"
                    >
                      <span>Save Separate Song</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 2B: SINGLE SONG PREVIEW & EDIT BEFORE SAVING */}
          {/* ========================================================================= */}
          {step === 'SONG_PREVIEW' && (
            <div className="space-y-4 animate-in fade-in">
              {/* Pre-Import Review Banner */}
              <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-600 text-white">
                      Pre-Import Review
                    </span>
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Verify & Correct Metadata
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    Verify Title, Artist, and Song Family grouping before saving. Duplicate detection will check your corrected details when you click "Save & Import Song".
                  </p>
                </div>
              </div>

              {/* YouTube Media Card */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  {/* Thumbnail */}
                  <div className="w-24 h-20 sm:w-28 sm:h-20 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-700 shrink-0 relative border border-slate-300 dark:border-slate-600 shadow-xs">
                    {thumbnailUrl ? (
                      <img
                        src={thumbnailUrl}
                        alt={title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <Music className="w-8 h-8" />
                      </div>
                    )}
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-white text-[9px] font-bold flex items-center gap-0.5">
                      <Youtube className="w-2.5 h-2.5 text-red-500" />
                      <span>{duration || '3:45'}</span>
                    </div>
                  </div>

                  {/* Song Core Info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <h4 className="text-base font-black text-slate-900 dark:text-slate-100 truncate">
                      {title || 'Untitled Song'}
                    </h4>
                    <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 truncate">
                      {artist || 'Unknown Artist'}
                    </p>
                    {album && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        Album: {album} {releaseYear ? `(${releaseYear})` : ''}
                      </p>
                    )}

                    {youtubeUrl && (
                      <a
                        href={youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline pt-0.5"
                      >
                        <Youtube className="w-3.5 h-3.5" />
                        <span>Open on YouTube / YouTube Music</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Metadata Badges */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold">
                    <span>Status:</span>
                    {versionType === 'cover' ? (
                      <span className="text-purple-600 dark:text-purple-400 uppercase flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                        <span>COVER</span>
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 uppercase flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>ORIGINAL</span>
                      </span>
                    )}
                  </div>

                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold">
                    <span>Language:</span>
                    <span className="text-indigo-600 dark:text-indigo-400">{language}</span>
                  </div>

                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold">
                    <span>Category:</span>
                    <span className="capitalize text-emerald-600 dark:text-emerald-400">{category}</span>
                  </div>

                  {key && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold">
                      <span>Original Key:</span>
                      <span className="text-purple-600 dark:text-purple-400">{key}</span>
                    </div>
                  )}

                  {targetLineupSlot && performedKey && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold">
                      <span>Performed Key:</span>
                      <span>{performedKey}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Editable Metadata Form */}
              <div className="p-4 rounded-xl bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                    <Edit2 className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Song Details & Corrections</span>
                  </h5>
                  <span className="text-[10px] text-slate-400">Correct typos or noise before importing</span>
                </div>

                <div className="space-y-3">
                  {/* Title and Artist with Swap Button */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
                    {/* Title with Clean Noise Action */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          Song Title <span className="text-red-500">*</span>
                        </label>
                        {title && cleanYouTubeTitleNoise(title) !== title && (
                          <button
                            type="button"
                            onClick={() => setTitle(cleanYouTubeTitleNoise(title))}
                            className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer transition-colors"
                            title="Strip video/audio tags and clean title"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Clean Title Noise</span>
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. 10,000 Reasons (Bless the Lord)"
                        aria-label="Song Title"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium focus:ring-2 focus:ring-[#1b75bc]/30 focus:border-[#1b75bc] outline-none"
                      />
                    </div>

                    {/* Swap Title & Artist Button */}
                    <div className="self-center sm:self-end pb-0.5">
                      <SwapTitleArtistButton
                        onSwap={() => {
                          const prevTitle = title;
                          setTitle(artist);
                          setArtist(prevTitle);
                        }}
                      />
                    </div>

                    {/* Artist */}
                    <div className="flex-1 min-w-0">
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Artist / Worship Leader
                      </label>
                      <input
                        type="text"
                        value={artist}
                        onChange={(e) => setArtist(e.target.value)}
                        placeholder="e.g. Matt Redman"
                        aria-label="Artist or Worship Leader"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium focus:ring-2 focus:ring-[#1b75bc]/30 focus:border-[#1b75bc] outline-none"
                      />
                    </div>
                  </div>

                  {/* Status Toggle */}
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Song Status (Original / Cover) <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setVersionType('original')}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                          versionType === 'original'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>ORIGINAL</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setVersionType('cover')}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                          versionType === 'cover'
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                        }`}
                      >
                        <Music className="w-3.5 h-3.5" />
                        <span>COVER</span>
                      </button>
                    </div>
                  </div>

                  {/* Song Family Linking Section */}
                  <div className="sm:col-span-2 p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>Song Family Link (Optional)</span>
                      </label>
                      <span className="text-[10px] text-indigo-600/80 dark:text-indigo-400/80 font-medium">
                        Group related covers/versions
                      </span>
                    </div>

                    <select
                      value={selectedFamilyId}
                      onChange={(e) => setSelectedFamilyId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium cursor-pointer text-xs"
                    >
                      <option value="">Auto-detect / check duplicate on save (Recommended)</option>
                      <option value="NEW">+ Create New Song Family for this song</option>
                      {availableFamilies.map((fam) => (
                        <option key={fam.id} value={fam.id}>
                          Link to: {fam.name} ({fam.versionIds?.length || 1} versions)
                        </option>
                      ))}
                    </select>

                    {selectedFamilyId && (
                      <div className="pt-2 border-t border-indigo-200/50 dark:border-indigo-800/50 space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                          Relationship within Song Family:
                        </label>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                          {(['COVER', 'LIVE_VERSION', 'ACOUSTIC_VERSION', 'ALTERNATE_VERSION', 'VERSION', 'ORIGINAL'] as SongRelationshipType[]).map((rel) => (
                            <button
                              key={rel}
                              type="button"
                              onClick={() => setFamilyRelationship(rel)}
                              className={`py-1.5 px-2 rounded-md border text-center transition-all cursor-pointer font-bold text-[10px] ${
                                familyRelationship === rel
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              {rel === 'COVER' && 'Cover'}
                              {rel === 'LIVE_VERSION' && 'Live'}
                              {rel === 'ACOUSTIC_VERSION' && 'Acoustic'}
                              {rel === 'ALTERNATE_VERSION' && 'Alt'}
                              {rel === 'VERSION' && 'Version'}
                              {rel === 'ORIGINAL' && 'Original'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Language
                    </label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(sanitizeSongLanguage(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium cursor-pointer"
                    >
                      <option value="English">English</option>
                      <option value="Tagalog">Tagalog</option>
                      <option value="Multi-lingual">Multi-lingual</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as SongCategory)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium cursor-pointer"
                    >
                      <option value="praise">Praise (Fast)</option>
                      <option value="worship">Worship (Slow)</option>
                      <option value="both">Both</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Original Key
                    </label>
                    <input
                      type="text"
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      placeholder="e.g. G, C, D"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium uppercase"
                    />
                  </div>

                  {targetLineupSlot && (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Performed Key (For Lineup)
                      </label>
                      <input
                        type="text"
                        value={performedKey}
                        onChange={(e) => setPerformedKey(e.target.value)}
                        placeholder="e.g. D"
                        className="w-full px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-100 font-bold uppercase"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Album
                    </label>
                    <input
                      type="text"
                      value={album}
                      onChange={(e) => setAlbum(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Release Year
                    </label>
                    <input
                      type="text"
                      value={releaseYear}
                      onChange={(e) => setReleaseYear(e.target.value)}
                      placeholder="e.g. 2022"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Duration
                    </label>
                    <input
                      type="text"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      placeholder="e.g. 4:15"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      CCLI # (Optional)
                    </label>
                    <input
                      type="text"
                      value={ccliNumber}
                      onChange={(e) => setCcliNumber(e.target.value)}
                      placeholder="e.g. 7000123"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons for Preview */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setStep('INPUT')}
                  className="px-3.5 py-2 font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to URL Input</span>
                </button>

                <button
                  type="button"
                  onClick={handleValidateAndProceedToSave}
                  disabled={isLoading}
                  className="px-5 py-2.5 font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Checking & Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save & Import Song</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 3A: PLAYLIST PREVIEW */}
          {/* ========================================================================= */}
          {step === 'PLAYLIST_PREVIEW' && playlistPreview && (
            <div className="space-y-4 animate-in fade-in">
              {/* Playlist Summary Card */}
              <div className="flex items-start gap-4 p-4 bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-xl">
                <img
                  src={playlistPreview.playlistThumbnail}
                  alt={playlistPreview.playlistName}
                  className="w-20 h-20 object-cover rounded-lg shadow-sm border border-indigo-200 dark:border-indigo-800 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold rounded-full uppercase tracking-wider">
                      YouTube Playlist
                    </span>
                    {playlistPreview.privacyStatus && (
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider flex items-center gap-1 ${
                          playlistPreview.privacyStatus.toLowerCase() === 'unlisted'
                            ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                            : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                        }`}
                      >
                        {playlistPreview.privacyStatus.toLowerCase() === 'unlisted' && <EyeOff className="w-3 h-3" />}
                        <span>{playlistPreview.privacyStatus}</span>
                      </span>
                    )}
                    <a
                      href={playlistPreview.playlistUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 ml-auto"
                    >
                      <span>Open Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate mt-1">
                    {playlistPreview.playlistName}
                  </h4>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400 mt-1">
                    <span className="flex items-center gap-1">
                      <ListMusic className="w-3.5 h-3.5 text-indigo-500" />
                      <strong>{playlistPreview.totalSongs}</strong> songs available
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {playlistPreview.estimatedTotalDuration}
                    </span>
                    {playlistPreview.skippedUnavailable > 0 && (
                      <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-900">
                        {playlistPreview.skippedUnavailable} unavailable/deleted video{playlistPreview.skippedUnavailable > 1 ? 's' : ''} skipped
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Selection Controls */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPlaylistCount === previewItems.length && previewItems.length > 0}
                      onChange={(e) => handleToggleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span>Select All ({previewItems.length})</span>
                  </label>
                </div>
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  {selectedPlaylistCount} of {previewItems.length} selected
                </span>
              </div>

              {/* Rearrangeable Song List */}
              <RearrangeableSongList
                items={previewItems}
                selectedItemsMap={selectedItemsMap}
                selectedMap={selectedItemsMap}
                onToggleItem={handleTogglePlaylistItem}
                onReorder={(newItems) => setPreviewItems(newItems)}
              />

              {/* Playlist Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setStep('INPUT')}
                  className="px-3.5 py-2 font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>

                <button
                  type="button"
                  onClick={handleExecutePlaylistImport}
                  disabled={isImportingPlaylist || selectedPlaylistCount === 0}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  {isImportingPlaylist ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Importing {selectedPlaylistCount} Songs...</span>
                    </>
                  ) : (
                    <>
                      <span>Import {selectedPlaylistCount} Selected Songs</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 3B: PLAYLIST SUMMARY */}
          {/* ========================================================================= */}
          {step === 'PLAYLIST_SUMMARY' && importSummary && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span>Playlist Import Completed!</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 text-center">
                  <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-emerald-100 dark:border-emerald-900/60">
                    <div className="text-base font-black text-slate-900 dark:text-slate-100">
                      {importSummary.totalImported}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">Total Processed</div>
                  </div>
                  <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-emerald-100 dark:border-emerald-900/60">
                    <div className="text-base font-black text-emerald-600 dark:text-emerald-400">
                      {importSummary.newlyAdded}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">Added as New</div>
                  </div>
                  <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-emerald-100 dark:border-emerald-900/60">
                    <div className="text-base font-black text-indigo-600 dark:text-indigo-400">
                      {importSummary.existingFound}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">Already in DB</div>
                  </div>
                </div>
              </div>

              {/* Detailed Lists */}
              {importSummary.newSongTitles.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    Newly Added Songs ({importSummary.newSongTitles.length})
                  </span>
                  <div className="max-h-32 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1">
                    {importSummary.newSongTitles.map((st, i) => (
                      <div key={i} className="text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="truncate">{st}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {importSummary.existingSongTitles.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    Existing Songs Matched in Library ({importSummary.existingSongTitles.length})
                  </span>
                  <div className="max-h-32 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1">
                    {importSummary.existingSongTitles.map((st, i) => (
                      <div key={i} className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                        <span className="truncate">{st}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Safety Fallback if in an unexpected state */}
          {((step === 'SONG_CONFLICT' && !existingSongMatch) ||
            (step === 'PLAYLIST_PREVIEW' && !playlistPreview) ||
            (step === 'PLAYLIST_SUMMARY' && !importSummary)) && (
            <div className="p-8 text-center space-y-4 animate-in fade-in">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-500 mx-auto flex items-center justify-center border border-amber-200 dark:border-amber-800/60 shadow-xs">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Import Preview Unavailable
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  The link preview could not be loaded into the workspace. You can enter the URL again or input the song details manually.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setStep('INPUT');
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  Try URL Again
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
