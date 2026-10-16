import React, { useState, useEffect } from 'react';
import { Song, SongRelationshipType } from '../types';
import { SongService } from '../services/songService';
import {
  fetchMultiSourceMetadata,
  ComprehensiveMetadata
} from '../services/musicMetadataService';
import { SongLanguage, sanitizeSongLanguage } from '../utils/languageUtils';
import { Modal } from './Modal';
import {
  Music,
  Sparkles,
  Check,
  AlertTriangle,
  Layers,
  Globe,
  FileText,
  User,
  Disc,
  Link,
  ShieldCheck,
  RefreshCw,
  Info,
  KeyRound,
  BookOpen
} from 'lucide-react';

interface GetMetadataModalProps {
  isOpen: boolean;
  song: Song | null;
  onClose: () => void;
  onMetadataApplied: (updatedSong: Song) => void;
  showToast: (text: string, type: 'success' | 'danger' | 'info') => void;
}

interface FieldSelectionState {
  title: boolean;
  artist: boolean;
  album: boolean;
  coverArtUrl: boolean;
  youtubeUrl: boolean;
  spotifyUrl: boolean;
  appleMusicUrl: boolean;
  qobuzUrl: boolean;
  tidalUrl: boolean;
  relationshipType: boolean;
  originalArtist: boolean;
  songwriters: boolean;
  language: boolean;
  lyrics: boolean;
  originalKey: boolean; // MUST default to FALSE to protect existing Original Key
}

export const GetMetadataModal: React.FC<GetMetadataModalProps> = ({
  isOpen,
  song,
  onClose,
  onMetadataApplied,
  showToast
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [retrievedMeta, setRetrievedMeta] = useState<ComprehensiveMetadata | null>(null);

  // Selected fields to update
  const [selectedFields, setSelectedFields] = useState<FieldSelectionState>({
    title: true,
    artist: false,
    album: true,
    coverArtUrl: true,
    youtubeUrl: true,
    spotifyUrl: true,
    appleMusicUrl: true,
    qobuzUrl: true,
    tidalUrl: true,
    relationshipType: true,
    originalArtist: true,
    songwriters: true,
    language: true,
    lyrics: true,
    originalKey: false // STRICTLY FALSE by default
  });

  const [customSearchQuery, setCustomSearchQuery] = useState('');

  // Fetch metadata when modal opens
  useEffect(() => {
    if (isOpen && song) {
      setError('');
      setRetrievedMeta(null);
      const query = song.youtubeUrl || `${song.title} ${song.artist !== 'Unknown Artist' ? song.artist : ''}`.trim();
      setCustomSearchQuery(query);
      handleFetchMetadata(query);
    }
  }, [isOpen, song]);

  const handleFetchMetadata = async (queryToSearch: string) => {
    if (!song) return;
    setIsLoading(true);
    setError('');

    try {
      const meta = await fetchMultiSourceMetadata(queryToSearch, song);
      setRetrievedMeta(meta);

      // Intelligently configure initial checkbox selections based on difference
      setSelectedFields({
        title: Boolean(meta.title && meta.title.trim() !== song.title.trim()),
        artist: Boolean(
          meta.artist &&
            meta.artist !== 'Unknown Artist' &&
            (!song.artist || song.artist === 'Unknown Artist' || song.artist.trim() !== meta.artist.trim())
        ),
        album: Boolean(meta.album && meta.album !== song.album),
        coverArtUrl: Boolean(meta.coverArtUrl && meta.coverArtUrl !== song.coverArtUrl),
        youtubeUrl: Boolean(meta.youtubeUrl && meta.youtubeUrl !== song.youtubeUrl),
        spotifyUrl: Boolean(meta.spotifyUrl && meta.spotifyUrl !== song.spotifyUrl),
        appleMusicUrl: Boolean(meta.appleMusicUrl && meta.appleMusicUrl !== song.appleMusicUrl),
        qobuzUrl: Boolean(meta.qobuzUrl && meta.qobuzUrl !== song.qobuzUrl),
        tidalUrl: Boolean(meta.tidalUrl && meta.tidalUrl !== song.tidalUrl),
        relationshipType: Boolean(
          meta.relationshipType &&
            meta.relationshipType !== 'UNKNOWN' &&
            meta.relationshipType !== song.relationshipType
        ),
        originalArtist: Boolean(meta.originalArtist && meta.originalArtist !== song.originalArtist),
        songwriters: Boolean(meta.songwriters && meta.songwriters !== song.songwriters),
        language: Boolean(
          meta.language &&
            meta.language !== sanitizeSongLanguage(song.language)
        ),
        lyrics: Boolean(meta.lyrics && meta.lyrics !== song.lyrics),
        originalKey: false // NEVER automatically checked
      });
    } catch (err: any) {
      console.error('Metadata fetch error:', err);
      setError(err?.message || 'Unable to retrieve metadata. Please check the song title or link.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleField = (field: keyof FieldSelectionState) => {
    setSelectedFields((prev) => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleSelectAll = () => {
    setSelectedFields({
      title: true,
      artist: true,
      album: true,
      coverArtUrl: true,
      youtubeUrl: true,
      spotifyUrl: true,
      appleMusicUrl: true,
      qobuzUrl: true,
      tidalUrl: true,
      relationshipType: true,
      originalArtist: true,
      songwriters: true,
      language: true,
      lyrics: true,
      originalKey: false // Keep protected unless user manually toggles
    });
  };

  const handleDeselectAll = () => {
    setSelectedFields({
      title: false,
      artist: false,
      album: false,
      coverArtUrl: false,
      youtubeUrl: false,
      spotifyUrl: false,
      appleMusicUrl: false,
      qobuzUrl: false,
      tidalUrl: false,
      relationshipType: false,
      originalArtist: false,
      songwriters: false,
      language: false,
      lyrics: false,
      originalKey: false
    });
  };

  const handleApplySelectedMetadata = async () => {
    if (!song || !retrievedMeta) return;

    try {
      const updatedData: Partial<Song> = { ...song };

      // Apply ONLY checked fields
      if (selectedFields.title && retrievedMeta.title) {
        updatedData.title = retrievedMeta.title.trim();
      }
      if (selectedFields.artist && retrievedMeta.artist) {
        updatedData.artist = retrievedMeta.artist.trim();
      }
      if (selectedFields.album && retrievedMeta.album !== undefined) {
        updatedData.album = retrievedMeta.album.trim();
      }
      if (selectedFields.coverArtUrl && retrievedMeta.coverArtUrl) {
        updatedData.coverArtUrl = retrievedMeta.coverArtUrl;
      }
      if (selectedFields.youtubeUrl && retrievedMeta.youtubeUrl) {
        updatedData.youtubeUrl = retrievedMeta.youtubeUrl;
        if (retrievedMeta.youtubeId) {
          updatedData.youtubeId = retrievedMeta.youtubeId;
          updatedData.thumbnailUrl = retrievedMeta.thumbnailUrl;
        }
      }
      if (selectedFields.spotifyUrl && retrievedMeta.spotifyUrl) {
        updatedData.spotifyUrl = retrievedMeta.spotifyUrl;
      }
      if (selectedFields.appleMusicUrl && retrievedMeta.appleMusicUrl) {
        updatedData.appleMusicUrl = retrievedMeta.appleMusicUrl;
      }
      if (selectedFields.qobuzUrl && retrievedMeta.qobuzUrl) {
        updatedData.qobuzUrl = retrievedMeta.qobuzUrl;
      }
      if (selectedFields.tidalUrl && retrievedMeta.tidalUrl) {
        updatedData.tidalUrl = retrievedMeta.tidalUrl;
      }
      if (selectedFields.relationshipType && retrievedMeta.relationshipType) {
        updatedData.relationshipType = retrievedMeta.relationshipType;
      }
      if (selectedFields.originalArtist && retrievedMeta.originalArtist) {
        updatedData.originalArtist = retrievedMeta.originalArtist;
      }
      if (selectedFields.songwriters && retrievedMeta.songwriters) {
        updatedData.songwriters = retrievedMeta.songwriters;
      }
      if (selectedFields.language && retrievedMeta.language) {
        updatedData.language = sanitizeSongLanguage(retrievedMeta.language);
      }
      if (selectedFields.lyrics && retrievedMeta.lyrics) {
        updatedData.lyrics = retrievedMeta.lyrics;
      }
      // ONLY update originalKey if user explicitly checked it
      if (selectedFields.originalKey && retrievedMeta.originalKey) {
        updatedData.originalKey = retrievedMeta.originalKey;
      }

      // Save updated song to database
      const saved = await SongService.saveSong(updatedData as any);
      onMetadataApplied(saved);
      showToast('Selected metadata applied successfully!', 'success');
      onClose();
    } catch (err: any) {
      console.error('Failed to apply metadata:', err);
      showToast('Failed to apply metadata: ' + (err?.message || 'Unknown error'), 'danger');
    }
  };

  if (!isOpen || !song) return null;

  const currentLanguage = sanitizeSongLanguage(song.language);
  const detectedLanguage = retrievedMeta?.language || 'Multi-lingual';

  const isCheckedCount = Object.values(selectedFields).filter(Boolean).length;

  return (
    <Modal
      id="get-metadata-modal"
      isOpen={isOpen}
      onClose={onClose}
      title={`Get Metadata: ${song.title}`}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4 text-slate-800 dark:text-slate-200">
        {/* Search Bar / Re-query header */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center justify-between">
            <span>Query Sources (MusicBrainz [Primary], Deezer [Secondary], YouTube, Spotify, Apple Music, LRCLIB)</span>
            {isLoading && (
              <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">
                <RefreshCw className="w-3 h-3 animate-spin" /> Cross-checking sources...
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={customSearchQuery}
              onChange={(e) => setCustomSearchQuery(e.target.value)}
              placeholder="Enter song title, artist, or YouTube / Spotify / Apple Music link..."
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFetchMetadata(customSearchQuery);
              }}
            />
            <button
              type="button"
              onClick={() => handleFetchMetadata(customSearchQuery)}
              disabled={isLoading || !customSearchQuery.trim()}
              className="px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Search</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-bold">Metadata Lookup Notice</div>
              <div>{error}</div>
            </div>
          </div>
        )}

        {/* Multi-source Status Badges */}
        {retrievedMeta && (
          <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/60 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Cross-Source Verification Results
                </span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {retrievedMeta.sourcesSucceeded.length} / {retrievedMeta.sourcesQueried.length} sources matched
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {retrievedMeta.sourcesQueried.map((src) => {
                const succeeded = retrievedMeta.sourcesSucceeded.includes(src);
                return (
                  <span
                    key={src}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                      succeeded
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {succeeded ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : null}
                    <span>{src}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Original Source & Relationship Preview */}
        {retrievedMeta?.originalSourceDetails && (
          <div className="p-3 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                <Layers className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Original Source & Version Relationship</span>
              </div>
              <span
                className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                  retrievedMeta.originalSourceDetails.confidence === 'high'
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                }`}
              >
                Confidence: {retrievedMeta.originalSourceDetails.confidence}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Classified Relationship:</span>{' '}
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {retrievedMeta.originalSourceDetails.relationship.replace('_', ' ')}
                </span>
              </div>
              {retrievedMeta.originalSourceDetails.originalArtist && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Original Source Artist:</span>{' '}
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {retrievedMeta.originalSourceDetails.originalArtist}
                  </span>
                </div>
              )}
            </div>

            <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 italic">
              {retrievedMeta.originalSourceDetails.evidence}
            </p>
          </div>
        )}

        {/* Field Comparison and Selection List */}
        {retrievedMeta && (
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-700">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Select Metadata Fields to Apply ({isCheckedCount} selected)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-300 dark:text-slate-600">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
                >
                  Deselect All
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {/* 1. Title */}
              <ComparisonRow
                id="field-title"
                label="Title"
                icon={<Music className="w-3.5 h-3.5 text-indigo-500" />}
                current={song.title}
                detected={retrievedMeta.title}
                checked={selectedFields.title}
                onChange={() => toggleField('title')}
                disabled={!retrievedMeta.title}
              />

              {/* 2. Artist */}
              <ComparisonRow
                id="field-artist"
                label="Artist"
                icon={<User className="w-3.5 h-3.5 text-indigo-500" />}
                current={song.artist}
                detected={retrievedMeta.artist}
                checked={selectedFields.artist}
                onChange={() => toggleField('artist')}
                disabled={!retrievedMeta.artist}
              />

              {/* 3. Album */}
              <ComparisonRow
                id="field-album"
                label="Album"
                icon={<Disc className="w-3.5 h-3.5 text-indigo-500" />}
                current={song.album || '(None)'}
                detected={retrievedMeta.album || '(None)'}
                checked={selectedFields.album}
                onChange={() => toggleField('album')}
                disabled={!retrievedMeta.album}
              />

              {/* 4. Language (Automatic Tagalog vs English vs Other/Unknown) */}
              <ComparisonRow
                id="field-language"
                label="Language"
                icon={<Globe className="w-3.5 h-3.5 text-emerald-500" />}
                current={currentLanguage}
                detected={detectedLanguage}
                checked={selectedFields.language}
                onChange={() => toggleField('language')}
                badgeText={retrievedMeta.languageDetails?.reason}
                disabled={!retrievedMeta.language}
              />

              {/* 5. Original Artist / Songwriter */}
              <ComparisonRow
                id="field-songwriters"
                label="Songwriter(s) / Composer(s)"
                icon={<FileText className="w-3.5 h-3.5 text-purple-500" />}
                current={song.songwriters || '(None)'}
                detected={retrievedMeta.songwriters || '(None)'}
                checked={selectedFields.songwriters}
                onChange={() => toggleField('songwriters')}
                disabled={!retrievedMeta.songwriters}
              />

              {/* 6. Original Artist (if Cover) */}
              <ComparisonRow
                id="field-originalArtist"
                label="Original Artist (Cover Status)"
                icon={<User className="w-3.5 h-3.5 text-amber-500" />}
                current={song.originalArtist || '(None)'}
                detected={retrievedMeta.originalArtist || '(None)'}
                checked={selectedFields.originalArtist}
                onChange={() => toggleField('originalArtist')}
                disabled={!retrievedMeta.originalArtist}
              />

              {/* 7. Relationship Type */}
              <ComparisonRow
                id="field-relationshipType"
                label="Version Relationship"
                icon={<Layers className="w-3.5 h-3.5 text-indigo-500" />}
                current={song.relationshipType || 'ORIGINAL'}
                detected={retrievedMeta.relationshipType || 'UNKNOWN'}
                checked={selectedFields.relationshipType}
                onChange={() => toggleField('relationshipType')}
                disabled={!retrievedMeta.relationshipType}
              />

              {/* 8. YouTube URL */}
              <ComparisonRow
                id="field-youtubeUrl"
                label="YouTube / YouTube Music URL"
                icon={<Link className="w-3.5 h-3.5 text-red-500" />}
                current={song.youtubeUrl || '(None)'}
                detected={retrievedMeta.youtubeUrl || retrievedMeta.youtubeMusicUrl || '(None)'}
                checked={selectedFields.youtubeUrl}
                onChange={() => toggleField('youtubeUrl')}
                disabled={!retrievedMeta.youtubeUrl && !retrievedMeta.youtubeMusicUrl}
              />

              {/* 9. Spotify URL */}
              <ComparisonRow
                id="field-spotifyUrl"
                label="Spotify Link"
                icon={<Link className="w-3.5 h-3.5 text-emerald-500" />}
                current={song.spotifyUrl || '(None)'}
                detected={retrievedMeta.spotifyUrl || '(None)'}
                checked={selectedFields.spotifyUrl}
                onChange={() => toggleField('spotifyUrl')}
                disabled={!retrievedMeta.spotifyUrl}
              />

              {/* 10. Apple Music URL */}
              <ComparisonRow
                id="field-appleMusicUrl"
                label="Apple Music Link"
                icon={<Link className="w-3.5 h-3.5 text-pink-500" />}
                current={song.appleMusicUrl || '(None)'}
                detected={retrievedMeta.appleMusicUrl || '(None)'}
                checked={selectedFields.appleMusicUrl}
                onChange={() => toggleField('appleMusicUrl')}
                disabled={!retrievedMeta.appleMusicUrl}
              />

              {/* 11. Lyrics */}
              <ComparisonRow
                id="field-lyrics"
                label="Lyrics (lrclib / verified)"
                icon={<BookOpen className="w-3.5 h-3.5 text-slate-500" />}
                current={song.lyrics ? `${song.lyrics.slice(0, 40)}...` : '(None)'}
                detected={retrievedMeta.lyrics ? `${retrievedMeta.lyrics.slice(0, 50)}...` : '(None)'}
                checked={selectedFields.lyrics}
                onChange={() => toggleField('lyrics')}
                disabled={!retrievedMeta.lyrics}
              />

              {/* 12. Original Key (CRITICAL: Protected & Unchecked by default) */}
              <ComparisonRow
                id="field-originalKey"
                label="Original Key (Database Reference)"
                icon={<KeyRound className="w-3.5 h-3.5 text-amber-500" />}
                current={song.originalKey || song.key || '(None)'}
                detected={retrievedMeta.originalKey || '(Protected / Manual Only)'}
                checked={selectedFields.originalKey}
                onChange={() => toggleField('originalKey')}
                disabled={!retrievedMeta.originalKey}
                warning="Original Key is protected and will never change unless explicitly checked."
              />
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Unchecked fields will remain strictly unchanged.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplySelectedMetadata}
              disabled={!retrievedMeta || isCheckedCount === 0}
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Apply Selected Metadata ({isCheckedCount})</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

interface ComparisonRowProps {
  id: string;
  label: string;
  icon: React.ReactNode;
  current: string;
  detected?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  badgeText?: string;
  warning?: string;
}

const ComparisonRow: React.FC<ComparisonRowProps> = ({
  id,
  label,
  icon,
  current,
  detected,
  checked,
  onChange,
  disabled,
  badgeText,
  warning
}) => {
  const isDifferent = Boolean(detected && detected !== '(None)' && detected !== current);

  return (
    <label
      htmlFor={id}
      className={`block p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
        disabled
          ? 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200/50 dark:border-slate-800/50 opacity-60 cursor-not-allowed'
          : checked
          ? 'bg-indigo-50/60 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 shadow-xs'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-600 cursor-pointer"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
            {icon}
            <span>{label}</span>
            {isDifferent && (
              <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                Changed
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1 text-[11px]">
            <div className="truncate">
              <span className="text-slate-400 font-medium">Current:</span>{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-300">{current}</span>
            </div>
            <div className="truncate">
              <span className="text-slate-400 font-medium">Detected:</span>{' '}
              <span className={`font-semibold ${isDifferent ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400'}`}>
                {detected || '(None)'}
              </span>
            </div>
          </div>

          {badgeText && (
            <div className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400 italic">
              {badgeText}
            </div>
          )}

          {warning && (
            <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
              {warning}
            </div>
          )}
        </div>
      </div>
    </label>
  );
};
