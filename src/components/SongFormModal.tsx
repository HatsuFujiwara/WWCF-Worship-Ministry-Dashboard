import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Song,
  SongCategory,
  SongFamily,
  SongRelationshipType,
  SongVersionType,
  ChartInstrumentType,
  InstrumentChartVariant,
  SongVideoMarker
} from '../types';
import { SongService, DuplicateMatch } from '../services/songService';
import { SongFamilyService } from '../services/songFamilyService';
import { LineupHistoryService } from '../services/lineupHistoryService';
import { fetchMultiSourceMetadata } from '../services/musicMetadataService';
import { getManilaTodayString } from '../utils/dateUtils';
import { COMMON_THEMES } from '../utils/recommendationUtils';
import { detectSongVersionType, resolveSongVersionType } from '../utils/versionDetectionUtils';
import {
  parseLyricsSlides,
  MAX_LYRICS_LENGTH,
  DEFAULT_MAX_LINES_PER_SLIDE,
  MIN_LINES_PER_SLIDE,
  MAX_LINES_PER_SLIDE
} from '../utils/lyricsParser';
import {
  CHART_INSTRUMENT_LABELS,
  VALID_CHART_INSTRUMENTS,
  MAX_INSTRUMENT_CHARTS_PER_SONG,
  MAX_CHART_CONTENT_LENGTH,
  isPitchedChartInstrument,
  isCapoSupportedInstrument,
  validateInstrumentCharts
} from '../utils/chordChartUtils';
import {
  MAX_VIDEO_MARKERS_PER_SONG,
  parseMarkerTimestamp,
  formatMarkerTimestamp,
  buildYouTubeTimestampUrl,
  validateVideoMarkers
} from '../utils/videoMarkerUtils';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import { DuplicateSongModal } from './DuplicateSongModal';
import { SwapTitleArtistButton } from './SwapTitleArtistButton';
import { ChordChartViewer } from './ChordChartViewer';
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
  BookOpen,
  SlidersHorizontal,
  Upload,
  ClipboardPaste,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Copy,
  Guitar
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

  // Arrangement & Variant Tracking
  const [arrangementName, setArrangementName] = useState('');
  const [capo, setCapo] = useState('');
  const [tuning, setTuning] = useState('');
  const [rehearsalNotes, setRehearsalNotes] = useState('');

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

  // Lyrics Authoring Studio State
  const lyricsTextareaRef = useRef<HTMLTextAreaElement>(null);
  const lyricsFileInputRef = useRef<HTMLInputElement>(null);
  const [showLyricsPreview, setShowLyricsPreview] = useState(false);
  const [previewLinesPerSlide, setPreviewLinesPerSlide] = useState(DEFAULT_MAX_LINES_PER_SLIDE);
  const [pendingLyricsImport, setPendingLyricsImport] = useState<{
    text: string;
    sourceLabel: string;
  } | null>(null);

  // Instrument Chord Charts Studio State (HX-01)
  const chartTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [instrumentCharts, setInstrumentCharts] = useState<InstrumentChartVariant[]>([]);
  const [activeChartId, setActiveChartId] = useState<string | null>(null);
  const [showChartLivePreview, setShowChartLivePreview] = useState(false);

  // YouTube Section Markers State (HX-04)
  const [videoMarkers, setVideoMarkers] = useState<SongVideoMarker[]>([]);
  const [markerTimeInput, setMarkerTimeInput] = useState('');
  const [markerLabelInput, setMarkerLabelInput] = useState('');

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
      setArrangementName(songToEdit.arrangementName || '');
      setCapo(songToEdit.capo !== undefined ? String(songToEdit.capo) : '');
      setTuning(songToEdit.tuning || '');
      setRehearsalNotes(songToEdit.rehearsalNotes || '');
      setSongFamilyId(songToEdit.songFamilyId || '');
      setRelationshipType(songToEdit.relationshipType || 'ORIGINAL');
      setSongwriters(songToEdit.songwriters || (songToEdit.composers ? songToEdit.composers.join(', ') : ''));
      setOriginalArtist(songToEdit.originalArtist || '');
      setLyrics(songToEdit.lyrics || '');
      const initialCharts = (songToEdit.instrumentCharts || []).map((c) => ({ ...c }));
      setInstrumentCharts(initialCharts);
      setActiveChartId(initialCharts[0]?.id || null);
      setVideoMarkers((songToEdit.videoMarkers || []).map((m) => ({ ...m })));
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
      setArrangementName('');
      setCapo('');
      setTuning('');
      setRehearsalNotes('');
      setSongFamilyId('');
      setRelationshipType('ORIGINAL');
      setSongwriters('');
      setOriginalArtist('');
      setLyrics('');
      setInstrumentCharts([]);
      setActiveChartId(null);
      setVideoMarkers([]);
      setFetchInput('');
    }
    setMetaImportError('');
    setDuplicateMatch(null);
    setPendingLyricsImport(null);
    setMarkerTimeInput('');
    setMarkerLabelInput('');
    setShowChartLivePreview(false);
    setShowLyricsPreview(Boolean(songToEdit?.lyrics && songToEdit.lyrics.trim()));
  }, [songToEdit, isOpen]);

  const parsedLyricsDoc = useMemo(
    () => parseLyricsSlides(lyrics, { maxLinesPerSlide: previewLinesPerSlide }),
    [lyrics, previewLinesPerSlide]
  );

  const applyBoundedLyrics = (incomingText: string, mode: 'replace' | 'append' = 'replace'): boolean => {
    const normalizedIncoming = incomingText.replace(/\r\n?/g, '\n');
    const combined =
      mode === 'append' && lyrics.trim()
        ? `${lyrics.replace(/\s+$/, '')}\n\n${normalizedIncoming.replace(/^\s+/, '')}`
        : normalizedIncoming;

    if (combined.length > MAX_LYRICS_LENGTH) {
      showToast(
        `Lyrics exceed the ${MAX_LYRICS_LENGTH.toLocaleString()}-character limit (${combined.length.toLocaleString()} characters). Please shorten the text before importing.`,
        'danger'
      );
      return false;
    }
    setLyrics(combined);
    return true;
  };

  const handleInsertSectionTag = (tagLabel: string) => {
    const textarea = lyricsTextareaRef.current;
    const tagText = `[${tagLabel}]\n`;

    if (!textarea) {
      const prefix = lyrics.trim() ? (lyrics.endsWith('\n') ? '\n' : '\n\n') : '';
      applyBoundedLyrics(`${lyrics}${prefix}${tagText}`, 'replace');
      return;
    }

    const start = textarea.selectionStart ?? lyrics.length;
    const end = textarea.selectionEnd ?? lyrics.length;
    const before = lyrics.slice(0, start);
    const after = lyrics.slice(end);
    const needsLeadingBreak = before.length > 0 && !before.endsWith('\n');
    const insertion = `${needsLeadingBreak ? '\n\n' : before.length > 0 && !before.endsWith('\n\n') ? '\n' : ''}${tagText}`;
    const nextValue = `${before}${insertion}${after}`;

    if (nextValue.length > MAX_LYRICS_LENGTH) {
      showToast(`Lyrics cannot exceed ${MAX_LYRICS_LENGTH.toLocaleString()} characters.`, 'danger');
      return;
    }

    setLyrics(nextValue);
    const nextCaret = before.length + insertion.length;
    requestAnimationFrame(() => {
      if (lyricsTextareaRef.current) {
        lyricsTextareaRef.current.focus();
        lyricsTextareaRef.current.setSelectionRange(nextCaret, nextCaret);
      }
    });
  };

  const handleImportTxtFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const fileNameLower = file.name.toLowerCase();
    const isTxt = fileNameLower.endsWith('.txt') || file.type === 'text/plain';
    if (!isTxt) {
      showToast('Please select a plain text (.txt) lyrics file.', 'danger');
      return;
    }

    if (file.size > 256 * 1024) {
      showToast('Lyrics text file exceeds the 256 KB upload limit.', 'danger');
      return;
    }

    try {
      const rawText = (await file.text()).replace(/\r\n?/g, '\n').trim();
      if (!rawText) {
        showToast('The selected .txt file is empty.', 'info');
        return;
      }

      if (rawText.length > MAX_LYRICS_LENGTH) {
        showToast(
          `"${file.name}" exceeds the ${MAX_LYRICS_LENGTH.toLocaleString()}-character lyrics limit (${rawText.length.toLocaleString()} characters).`,
          'danger'
        );
        return;
      }

      if (lyrics.trim()) {
        setPendingLyricsImport({ text: rawText, sourceLabel: file.name });
      } else if (applyBoundedLyrics(rawText, 'replace')) {
        setShowLyricsPreview(true);
        showToast(`Imported lyrics from "${file.name}".`, 'success');
      }
    } catch (err) {
      console.error('Failed to read .txt lyrics file:', err);
      showToast('Could not read the selected .txt file.', 'danger');
    }
  };

  const handlePasteClipboardLyrics = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
      showToast('Clipboard access is unavailable here. Paste directly into the lyrics box.', 'info');
      return;
    }

    try {
      const clipText = (await navigator.clipboard.readText()).replace(/\r\n?/g, '\n').trim();
      if (!clipText) {
        showToast('Clipboard is empty or has no plain text.', 'info');
        return;
      }

      if (clipText.length > MAX_LYRICS_LENGTH) {
        showToast(
          `Clipboard lyrics exceed the ${MAX_LYRICS_LENGTH.toLocaleString()}-character limit (${clipText.length.toLocaleString()} characters).`,
          'danger'
        );
        return;
      }

      if (lyrics.trim()) {
        setPendingLyricsImport({ text: clipText, sourceLabel: 'Clipboard' });
      } else if (applyBoundedLyrics(clipText, 'replace')) {
        setShowLyricsPreview(true);
        showToast('Pasted lyrics from clipboard.', 'success');
      }
    } catch {
      showToast('Clipboard permission denied. Paste directly into the lyrics box (Ctrl+V / Cmd+V).', 'info');
    }
  };

  const activeInstrumentChart = useMemo(
    () => instrumentCharts.find((c) => c.id === activeChartId) || instrumentCharts[0] || null,
    [instrumentCharts, activeChartId]
  );

  const handleAddInstrumentChart = (instrument: ChartInstrumentType = 'guitar') => {
    if (instrumentCharts.length >= MAX_INSTRUMENT_CHARTS_PER_SONG) {
      showToast(`A song can store up to ${MAX_INSTRUMENT_CHARTS_PER_SONG} instrument charts.`, 'danger');
      return;
    }
    const usedCount = instrumentCharts.filter((c) => c.instrument === instrument).length;
    const newId = `chart_${instrument}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newChart: InstrumentChartVariant = {
      id: newId,
      instrument,
      label: usedCount > 0 ? `${CHART_INSTRUMENT_LABELS[instrument]} ${usedCount + 1}` : '',
      content: '',
      key: originalKey.trim() || undefined,
      capo: instrument === 'guitar' && capo.trim() ? Number(capo) || undefined : undefined,
      tuning: instrument === 'guitar' && tuning.trim() ? tuning.trim() : undefined,
      updatedAt: new Date().toISOString()
    };
    setInstrumentCharts((prev) => [...prev, newChart]);
    setActiveChartId(newId);
    setShowChartLivePreview(false);
  };

  const handleUpdateActiveChart = (patch: Partial<InstrumentChartVariant>) => {
    if (!activeInstrumentChart) return;
    if (typeof patch.content === 'string' && patch.content.length > MAX_CHART_CONTENT_LENGTH) {
      showToast(
        `Chart content exceeds the ${MAX_CHART_CONTENT_LENGTH.toLocaleString()}-character limit (${patch.content.length.toLocaleString()} characters).`,
        'danger'
      );
      return;
    }
    setInstrumentCharts((prev) =>
      prev.map((c) =>
        c.id === activeInstrumentChart.id
          ? {
              ...c,
              ...patch,
              updatedAt: new Date().toISOString()
            }
          : c
      )
    );
  };

  const handleRemoveInstrumentChart = (chartId: string) => {
    setInstrumentCharts((prev) => {
      const remaining = prev.filter((c) => c.id !== chartId);
      if (activeChartId === chartId) {
        setActiveChartId(remaining[0]?.id || null);
      }
      return remaining;
    });
  };

  const handleInsertChartSectionTag = (tagLabel: string) => {
    if (!activeInstrumentChart) return;
    const content = activeInstrumentChart.content || '';
    const textarea = chartTextareaRef.current;
    const tagText = `[${tagLabel}]\n`;

    if (!textarea) {
      const prefix = content.trim() ? (content.endsWith('\n') ? '\n' : '\n\n') : '';
      handleUpdateActiveChart({ content: `${content}${prefix}${tagText}` });
      return;
    }

    const start = textarea.selectionStart ?? content.length;
    const end = textarea.selectionEnd ?? content.length;
    const before = content.slice(0, start);
    const after = content.slice(end);
    const needsLeadingBreak = before.length > 0 && !before.endsWith('\n');
    const insertion = `${needsLeadingBreak ? '\n\n' : before.length > 0 && !before.endsWith('\n\n') ? '\n' : ''}${tagText}`;
    const nextValue = `${before}${insertion}${after}`;

    if (nextValue.length > MAX_CHART_CONTENT_LENGTH) {
      showToast(`Chart cannot exceed ${MAX_CHART_CONTENT_LENGTH.toLocaleString()} characters.`, 'danger');
      return;
    }

    handleUpdateActiveChart({ content: nextValue });
    const nextCaret = before.length + insertion.length;
    requestAnimationFrame(() => {
      if (chartTextareaRef.current) {
        chartTextareaRef.current.focus();
        chartTextareaRef.current.setSelectionRange(nextCaret, nextCaret);
      }
    });
  };

  const handleCopyLyricsToActiveChart = () => {
    if (!activeInstrumentChart) return;
    const cleanLyrics = lyrics.trim();
    if (!cleanLyrics) {
      showToast('Enter lyrics first before copying structure into this chart.', 'info');
      return;
    }
    if (cleanLyrics.length > MAX_CHART_CONTENT_LENGTH) {
      showToast(`Chart content cannot exceed ${MAX_CHART_CONTENT_LENGTH.toLocaleString()} characters.`, 'danger');
      return;
    }
    if (activeInstrumentChart.content.trim()) {
      const prefix = activeInstrumentChart.content.replace(/\s+$/, '');
      const appended = `${prefix}\n\n${cleanLyrics}`;
      if (appended.length > MAX_CHART_CONTENT_LENGTH) {
        showToast(`Combined chart exceeds the ${MAX_CHART_CONTENT_LENGTH.toLocaleString()}-character limit.`, 'danger');
        return;
      }
      handleUpdateActiveChart({ content: appended });
      showToast('Appended lyrics structure to the end of this chart.', 'success');
    } else {
      handleUpdateActiveChart({ content: cleanLyrics });
      showToast('Copied lyrics structure into chart editor.', 'success');
    }
  };

  const handleAddVideoMarker = () => {
    if (videoMarkers.length >= MAX_VIDEO_MARKERS_PER_SONG) {
      showToast(`A song can store up to ${MAX_VIDEO_MARKERS_PER_SONG} video cues.`, 'danger');
      return;
    }
    const cleanLabel = markerLabelInput.trim();
    if (!cleanLabel) {
      showToast('Enter a section label for the timestamp cue (e.g. Chorus 1).', 'danger');
      return;
    }
    const parsedSec = parseMarkerTimestamp(markerTimeInput);
    if (parsedSec === null) {
      showToast('Enter a valid timestamp such as 1:24, 0:45, or 90 seconds.', 'danger');
      return;
    }
    const nextMarker: SongVideoMarker = {
      id: `marker_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: cleanLabel.slice(0, 80),
      timeSeconds: parsedSec
    };
    setVideoMarkers((prev) => [...prev, nextMarker].sort((a, b) => a.timeSeconds - b.timeSeconds));
    setMarkerTimeInput('');
    setMarkerLabelInput('');
  };

  const handleRemoveVideoMarker = (markerId: string) => {
    setVideoMarkers((prev) => prev.filter((m) => m.id !== markerId));
  };

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

    if (lyrics.trim().length > MAX_LYRICS_LENGTH) {
      showToast(
        `Lyrics cannot exceed ${MAX_LYRICS_LENGTH.toLocaleString()} characters (${lyrics.trim().length.toLocaleString()} entered).`,
        'danger'
      );
      return;
    }

    const chartValidation = validateInstrumentCharts(instrumentCharts, title.trim());
    if (chartValidation.error) {
      showToast(chartValidation.error, 'danger');
      return;
    }

    const markerValidation = validateVideoMarkers(videoMarkers, title.trim());
    if (markerValidation.error) {
      showToast(markerValidation.error, 'danger');
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
      arrangementName: arrangementName.trim() || undefined,
      capo: capo.trim() !== '' ? parseInt(capo, 10) : undefined,
      tuning: tuning.trim() || undefined,
      rehearsalNotes: rehearsalNotes.trim() || undefined,
      songFamilyId: songFamilyId.trim() || undefined,
      relationshipType: relationshipType || 'ORIGINAL',
      songwriters: songwriters.trim() || undefined,
      originalArtist: originalArtist.trim() || undefined,
      lyrics: lyrics.trim() || undefined,
      instrumentCharts: chartValidation.valid ?? [],
      videoMarkers: markerValidation.valid ?? [],
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

            {/* Title & Artist with Swap Button */}
            <div className="flex flex-col md:flex-row items-start md:items-end gap-2.5">
              <div className="flex-1 w-full">
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

              <div className="self-center md:self-end pb-0.5 shrink-0">
                <SwapTitleArtistButton
                  onSwap={() => {
                    const temp = title;
                    setTitle(artist);
                    setArtist(temp);
                  }}
                  disabled={!title.trim() && !artist.trim()}
                />
              </div>

              <div className="flex-1 w-full">
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

            {/* Lyrics Authoring & Projection Slide Studio */}
            <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="song-lyrics-textarea"
                  className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"
                >
                  <BookOpen className="w-3.5 h-3.5 text-[#1b75bc] dark:text-[#54b0e2]" />
                  <span>Lyrics &amp; Projection Slides</span>
                </label>

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {parsedLyricsDoc.hasLyrics && (
                    <span>
                      {parsedLyricsDoc.slideCount} {parsedLyricsDoc.slideCount === 1 ? 'slide' : 'slides'} · {parsedLyricsDoc.groupCount}{' '}
                      {parsedLyricsDoc.groupCount === 1 ? 'section' : 'sections'}
                    </span>
                  )}
                  <span aria-hidden="true">·</span>
                  <span className={lyrics.length >= MAX_LYRICS_LENGTH ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}>
                    {lyrics.length.toLocaleString()} / {MAX_LYRICS_LENGTH.toLocaleString()} chars
                  </span>
                </div>
              </div>

              {/* Authoring Toolbar: Quick Section Tags + Import / Paste / Preview */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Insert lyrics section tag">
                  {['Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Tag', 'Outro', 'Instrumental'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleInsertSectionTag(tag)}
                      className="px-2 py-1 text-[11px] font-semibold rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-[#1b75bc] hover:text-[#1b75bc] dark:hover:text-[#54b0e2] transition-colors cursor-pointer"
                    >
                      + [{tag}]
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    ref={lyricsFileInputRef}
                    type="file"
                    accept=".txt,text/plain"
                    onChange={handleImportTxtFile}
                    className="hidden"
                    aria-label="Upload plain text lyrics file"
                  />
                  <button
                    type="button"
                    onClick={() => lyricsFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Import .txt</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePasteClipboardLyrics}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <ClipboardPaste className="w-3 h-3" />
                    <span>Paste</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLyricsPreview((prev) => !prev)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                      showLyricsPreview
                        ? 'bg-[#1b75bc] text-white border-[#1b75bc]'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {showLyricsPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showLyricsPreview ? 'Hide Preview' : 'Slide Preview'}</span>
                  </button>
                </div>
              </div>

              {/* Replace vs Append Confirmation Prompt */}
              {pendingLyricsImport && (
                <div
                  role="alertdialog"
                  aria-label="Confirm lyrics import action"
                  className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 space-y-2"
                >
                  <div className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">
                        Existing lyrics detected — how should &ldquo;{pendingLyricsImport.sourceLabel}&rdquo; be imported?
                      </p>
                      <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 mt-0.5">
                        Choose Replace to overwrite existing lyrics or Append to add the imported text at the end.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingLyricsImport(null)}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (applyBoundedLyrics(pendingLyricsImport.text, 'append')) {
                          setPendingLyricsImport(null);
                          setShowLyricsPreview(true);
                          showToast('Appended imported lyrics.', 'success');
                        }
                      }}
                      className="px-3 py-1 text-xs font-bold text-[#1b75bc] dark:text-[#54b0e2] bg-[#1b75bc]/10 hover:bg-[#1b75bc]/20 border border-[#1b75bc]/30 rounded-lg cursor-pointer"
                    >
                      Append
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (applyBoundedLyrics(pendingLyricsImport.text, 'replace')) {
                          setPendingLyricsImport(null);
                          setShowLyricsPreview(true);
                          showToast('Replaced lyrics with imported text.', 'success');
                        }
                      }}
                      className="px-3 py-1 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg cursor-pointer"
                    >
                      Replace Existing
                    </button>
                  </div>
                </div>
              )}

              <textarea
                id="song-lyrics-textarea"
                ref={lyricsTextareaRef}
                rows={7}
                maxLength={MAX_LYRICS_LENGTH}
                value={lyrics}
                onChange={(e) => applyBoundedLyrics(e.target.value, 'replace')}
                placeholder={`[Verse]\nEnter stanza lines here...\nUse blank lines to split projection slides.\n\n[Chorus]\nChorus lines...`}
                className="w-full px-3 py-2.5 text-xs font-mono leading-relaxed rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#1b75bc]/25 focus:border-[#1b75bc] outline-none resize-y"
              />

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Tip: Use <span className="font-mono">[Verse]</span>, <span className="font-mono">[Chorus]</span>, or <span className="font-mono">[Bridge]</span> headers and blank lines between slides. Duplicate unnumbered headers auto-number cleanly.
              </p>

              {/* Live Slide Preview Panel */}
              {showLyricsPreview && (
                <div className="pt-2.5 border-t border-slate-200 dark:border-slate-700 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      Live Projection Slide Preview
                    </span>
                    <div className="flex items-center gap-2">
                      <label htmlFor="song-form-lines-per-slide" className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        Lines / slide
                      </label>
                      <select
                        id="song-form-lines-per-slide"
                        value={previewLinesPerSlide}
                        onChange={(e) => setPreviewLinesPerSlide(Number(e.target.value))}
                        className="px-2 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none"
                      >
                        {Array.from(
                          { length: MAX_LINES_PER_SLIDE - MIN_LINES_PER_SLIDE + 1 },
                          (_, i) => MIN_LINES_PER_SLIDE + i
                        ).map((n) => (
                          <option key={n} value={n}>
                            {n} lines
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {!parsedLyricsDoc.hasLyrics ? (
                    <div className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-700 text-center text-xs text-slate-500 dark:text-slate-400">
                      Enter lyrics above to preview grouped projection slides.
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto space-y-3 pr-1">
                      {parsedLyricsDoc.groups.map((group) => (
                        <div key={group.id} className="space-y-1.5">
                          <div className="text-[11px] font-bold text-[#1b75bc] dark:text-[#54b0e2]">
                            {group.group} ({group.slides.length})
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {group.slides.map((slide) => (
                              <div
                                key={slide.id}
                                className="p-2.5 rounded-lg bg-black text-white border border-slate-800 text-xs leading-relaxed space-y-1"
                              >
                                <div className="text-[10px] font-mono text-slate-400 tabular-nums">
                                  Slide {slide.globalIndex + 1} · {group.group}
                                </div>
                                <div className="whitespace-pre-line font-medium">
                                  {slide.text}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Instrument Chord & Cue Charts Studio (HX-01 / HX-02) */}
            <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Guitar className="w-3.5 h-3.5 text-[#1b75bc] dark:text-[#54b0e2]" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Instrument Chord &amp; Cue Charts
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    ({instrumentCharts.length} / {MAX_INSTRUMENT_CHARTS_PER_SONG})
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {instrumentCharts.some((c) => c.content.trim().length > 0) && (
                    <button
                      type="button"
                      onClick={() => setShowChartLivePreview((prev) => !prev)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                        showChartLivePreview
                          ? 'bg-[#1b75bc] text-white border-[#1b75bc]'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {showChartLivePreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{showChartLivePreview ? 'Hide Chart Preview' : 'Test Transpose / Capo'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={instrumentCharts.length >= MAX_INSTRUMENT_CHARTS_PER_SONG}
                    onClick={() => handleAddInstrumentChart(instrumentCharts.length === 0 ? 'all' : 'guitar')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-[#1b75bc] hover:bg-[#165d97] rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Chart</span>
                  </button>
                </div>
              </div>

              {instrumentCharts.length === 0 ? (
                <div className="p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Optional chord-above-lyric or cue maps per instrument (Full Band, Guitar, Keys, Bass, Drums).
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(['guitar', 'piano', 'bass', 'drums'] as ChartInstrumentType[]).map((inst) => (
                      <button
                        key={inst}
                        type="button"
                        onClick={() => handleAddInstrumentChart(inst)}
                        className="px-2 py-1 text-[11px] font-semibold rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-[#1b75bc] hover:text-[#1b75bc] cursor-pointer"
                      >
                        + {CHART_INSTRUMENT_LABELS[inst]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Variant Selector Strip */}
                  <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Edit instrument charts">
                    {instrumentCharts.map((variant) => {
                      const isActive = activeInstrumentChart?.id === variant.id;
                      const tabLabel = variant.label?.trim()
                        ? `${CHART_INSTRUMENT_LABELS[variant.instrument]} (${variant.label.trim()})`
                        : CHART_INSTRUMENT_LABELS[variant.instrument];
                      return (
                        <div key={variant.id} className="inline-flex items-center">
                          <button
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => setActiveChartId(variant.id)}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-l-lg border transition-colors cursor-pointer ${
                              isActive
                                ? 'bg-[#1b75bc] text-white border-[#1b75bc]'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            {tabLabel}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveInstrumentChart(variant.id)}
                            aria-label={`Remove ${tabLabel} chart`}
                            title={`Remove ${tabLabel}`}
                            className={`px-1.5 py-1 rounded-r-lg border-y border-r transition-colors cursor-pointer ${
                              isActive
                                ? 'bg-[#165d97] text-white/90 hover:text-white border-[#1b75bc]'
                                : 'bg-white dark:bg-slate-900 text-slate-400 hover:text-rose-500 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Active Chart Variant Editor */}
                  {activeInstrumentChart && (
                    <div className="space-y-2.5 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Instrument
                          </label>
                          <select
                            value={activeInstrumentChart.instrument}
                            onChange={(e) => {
                              const nextInst = e.target.value as ChartInstrumentType;
                              handleUpdateActiveChart({
                                instrument: nextInst,
                                ...(!isCapoSupportedInstrument(nextInst) ? { capo: undefined } : {})
                              });
                            }}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none"
                          >
                            {VALID_CHART_INSTRUMENTS.map((inst) => (
                              <option key={inst} value={inst}>
                                {CHART_INSTRUMENT_LABELS[inst]}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Variant Label
                          </label>
                          <input
                            type="text"
                            value={activeInstrumentChart.label || ''}
                            onChange={(e) => handleUpdateActiveChart({ label: e.target.value })}
                            placeholder="e.g. Lead Electric, Acoustic"
                            maxLength={80}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-[#1b75bc]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Chart Key (Override)
                          </label>
                          <input
                            type="text"
                            disabled={!isPitchedChartInstrument(activeInstrumentChart.instrument)}
                            value={activeInstrumentChart.key || ''}
                            onChange={(e) => handleUpdateActiveChart({ key: e.target.value })}
                            placeholder={originalKey.trim() ? `Default: ${originalKey.trim()}` : 'e.g. G, Bb, Em'}
                            maxLength={20}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-[#1b75bc] disabled:opacity-50"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Capo / Tuning
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              max={12}
                              disabled={!isCapoSupportedInstrument(activeInstrumentChart.instrument)}
                              value={activeInstrumentChart.capo ?? ''}
                              onChange={(e) => {
                                const raw = e.target.value.trim();
                                handleUpdateActiveChart({
                                  capo: raw === '' ? undefined : Math.max(0, Math.min(12, parseInt(raw, 10) || 0))
                                });
                              }}
                              placeholder="Capo"
                              className="w-16 px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none disabled:opacity-40"
                            />
                            <input
                              type="text"
                              value={activeInstrumentChart.tuning || ''}
                              onChange={(e) => handleUpdateActiveChart({ tuning: e.target.value })}
                              placeholder="Tuning"
                              maxLength={80}
                              className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          Instrument Cues / Tone Notes
                        </label>
                        <input
                          type="text"
                          value={activeInstrumentChart.notes || ''}
                          onChange={(e) => handleUpdateActiveChart({ notes: e.target.value })}
                          placeholder="e.g. Dotted-8th delay on Chorus; warm Rhodes pad in Verse 1"
                          maxLength={1000}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-[#1b75bc]"
                        />
                      </div>

                      {/* Quick Tag & Copy Structure Toolbar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Insert chart section tag">
                          {['Intro', 'Verse', 'Chorus', 'Bridge', 'Instrumental', 'Outro'].map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => handleInsertChartSectionTag(tag)}
                              className="px-2 py-1 text-[11px] font-semibold rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-[#1b75bc] hover:text-[#1b75bc] dark:hover:text-[#54b0e2] cursor-pointer"
                            >
                              + [{tag}]
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleCopyLyricsToActiveChart}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copy Lyrics Structure</span>
                          </button>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                            {activeInstrumentChart.content.length.toLocaleString()} / {MAX_CHART_CONTENT_LENGTH.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <textarea
                        ref={chartTextareaRef}
                        rows={7}
                        maxLength={MAX_CHART_CONTENT_LENGTH}
                        value={activeInstrumentChart.content}
                        onChange={(e) => handleUpdateActiveChart({ content: e.target.value })}
                        placeholder={
                          activeInstrumentChart.instrument === 'drums'
                            ? `[Intro]\nKick 4-on-floor · Rim click Verse 1 (72 BPM)\n\n[Chorus]\nCrash build into full groove`
                            : `[Intro]\nG   D/F#   Em7   Cadd9\n\n[Verse 1]\nG                D/F#\nI love You, Lord\n       Em7            C\nFor Your mercy never fails me`
                        }
                        className="w-full px-3 py-2.5 text-xs font-mono leading-relaxed rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-black text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#1b75bc]/25 focus:border-[#1b75bc] outline-none resize-y"
                      />
                    </div>
                  )}

                  {showChartLivePreview && instrumentCharts.some((c) => c.content.trim().length > 0) && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                      <ChordChartViewer
                        charts={instrumentCharts.filter((c) => c.content.trim().length > 0)}
                        baseKey={originalKey.trim() || key.trim()}
                        initialCapo={capo.trim() ? parseInt(capo, 10) || 0 : 0}
                        preferredInstrument={activeInstrumentChart?.instrument}
                        maxHeightClass="max-h-72"
                      />
                    </div>
                  )}
                </div>
              )}
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

            {/* Arrangement & Variant Tracking */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Arrangement & Band Specs</span>
                </label>
                <span className="text-[10px] text-slate-400">Variant & rehearsal instructions</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Arrangement Label
                  </label>
                  <input
                    type="text"
                    value={arrangementName}
                    onChange={(e) => setArrangementName(e.target.value)}
                    placeholder="e.g. Acoustic Set 2026, Bethel Live"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Capo (Fret)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="12"
                    value={capo}
                    onChange={(e) => setCapo(e.target.value)}
                    placeholder="e.g. 2, 4 (0 if none)"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Tuning
                  </label>
                  <input
                    type="text"
                    value={tuning}
                    onChange={(e) => setTuning(e.target.value)}
                    placeholder="e.g. Standard, Drop D, Eb"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Band Rehearsal Directives
                </label>
                <textarea
                  rows={2}
                  value={rehearsalNotes}
                  onChange={(e) => setRehearsalNotes(e.target.value)}
                  placeholder="e.g. Acoustic guitar and pads start verse 1; drums enter on chorus 2; build to full band on bridge."
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>

              {/* YouTube Rehearsal Timestamp Markers (HX-04) */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Youtube className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                    <span>Reference Video Section Cues ({videoMarkers.length} / {MAX_VIDEO_MARKERS_PER_SONG})</span>
                  </span>
                  <span className="text-[10px] text-slate-400">Jump straight to sections in YouTube</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={markerTimeInput}
                    onChange={(e) => setMarkerTimeInput(e.target.value)}
                    placeholder="mm:ss (e.g. 1:42)"
                    className="w-28 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-[#1b75bc]"
                  />
                  <input
                    type="text"
                    value={markerLabelInput}
                    onChange={(e) => setMarkerLabelInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddVideoMarker();
                      }
                    }}
                    placeholder="Section label (e.g. Bridge Build)"
                    maxLength={80}
                    className="flex-1 min-w-[160px] px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-[#1b75bc]"
                  />
                  <button
                    type="button"
                    onClick={handleAddVideoMarker}
                    disabled={videoMarkers.length >= MAX_VIDEO_MARKERS_PER_SONG}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#1b75bc] hover:bg-[#165d97] rounded-lg cursor-pointer disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Cue</span>
                  </button>
                </div>

                {videoMarkers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {videoMarkers.map((marker) => {
                      const jumpUrl = buildYouTubeTimestampUrl(youtubeUrl, youtubeId, marker.timeSeconds);
                      return (
                        <div
                          key={marker.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                        >
                          <span className="font-mono font-bold text-[#1b75bc] dark:text-[#54b0e2] tabular-nums">
                            {formatMarkerTimestamp(marker.timeSeconds)}
                          </span>
                          {jumpUrl ? (
                            <a
                              href={jumpUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-slate-700 dark:text-slate-200 hover:underline"
                              title={`Open YouTube at ${formatMarkerTimestamp(marker.timeSeconds)}`}
                            >
                              {marker.label}
                            </a>
                          ) : (
                            <span className="font-medium text-slate-700 dark:text-slate-200">
                              {marker.label}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveVideoMarker(marker.id)}
                            aria-label={`Remove cue ${marker.label}`}
                            className="text-slate-400 hover:text-rose-500 cursor-pointer ml-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
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
