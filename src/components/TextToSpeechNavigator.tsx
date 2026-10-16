import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ActiveTab, Schedule, Song, Member, formatAssignmentMemberNames } from '../types';
import { speechAssistant } from '../utils/speechAssistant';
import { StorageService } from '../services/storage';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  ChevronDown,
  ChevronUp,
  X,
  Globe,
  Gauge,
  HelpCircle,
  Focus
} from 'lucide-react';

interface TextToSpeechNavigatorProps {
  isOpen: boolean;
  onClose: () => void;
  onDisableTts?: () => void;
  activeTab: ActiveTab;
  schedule?: Schedule | null;
  songs?: Song[];
  members?: Member[];
  schedules?: Schedule[];
}

export const TextToSpeechNavigator: React.FC<TextToSpeechNavigatorProps> = ({
  isOpen,
  onClose,
  onDisableTts,
  activeTab,
  schedule,
  songs = [],
  members = [],
  schedules = []
}) => {
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [speechRate, setSpeechRate] = useState<number>(() => {
    return StorageService.getAccessibilitySettings().ttsSpeechRate || 1;
  });
  const [selectedVoice, setSelectedVoice] = useState<string>(() => {
    return StorageService.getAccessibilitySettings().ttsVoice || '';
  });
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check Web Speech API support
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      setIsSupported(false);
      return;
    }

    const synth = window.speechSynthesis;

    const updateVoices = () => {
      try {
        const voices = synth.getVoices();
        setAvailableVoices(voices);
        if (voices.length > 0 && !selectedVoice) {
          // Prefer English voice by default if available
          const defaultVoice = voices.find((v) => v.lang.startsWith('en') && v.default) ||
            voices.find((v) => v.lang.startsWith('en')) ||
            voices[0];
          if (defaultVoice) {
            setSelectedVoice(defaultVoice.name);
          }
        }
      } catch (err) {
        console.error('Error getting voices:', err);
      }
    };

    updateVoices();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = updateVoices;
    }

    return () => {
      try {
        synth.cancel();
      } catch (e) {
        // ignore
      }
    };
  }, []);

  // Stop speech when tab changes or modal closes
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      setIsPaused(false);
      setCurrentIndex(0);
    }
  }, [activeTab, isOpen]);

  // Construct structured, semantic reading items for the current page
  const speechItems = useMemo<string[]>(() => {
    const items: string[] = [];

    if (activeTab === 'dashboard') {
      items.push('WWCF Santa Cruz Worship Ministry. Dashboard Overview.');
      if (schedule) {
        items.push(`Upcoming service date: ${schedule.serviceDate}. Service Type: ${schedule.serviceType}.`);
        const leaderAss = schedule.ministryAssignments?.find((a) =>
          a.role.toLowerCase().includes('leader')
        );
        const leaderName = leaderAss ? formatAssignmentMemberNames(leaderAss) : 'Unassigned';
        items.push(`Worship Leader: ${leaderName}.`);

        const praiseCount = schedule.praiseSongs?.length || 0;
        const worshipCount = schedule.worshipSongs?.length || 0;
        items.push(`Lineup includes ${praiseCount} Praise songs and ${worshipCount} Worship songs.`);

        if (praiseCount > 0) {
          items.push('Praise songs:');
          schedule.praiseSongs.forEach((songTitle, idx) => {
            const keyInfo = schedule.praiseSongKeys?.[idx] ? `in key of ${schedule.praiseSongKeys[idx]}` : '';
            items.push(`Praise song ${idx + 1}: ${songTitle} ${keyInfo}.`);
          });
        }
        if (worshipCount > 0) {
          items.push('Worship songs:');
          schedule.worshipSongs.forEach((songTitle, idx) => {
            const keyInfo = schedule.worshipSongKeys?.[idx] ? `in key of ${schedule.worshipSongKeys[idx]}` : '';
            items.push(`Worship song ${idx + 1}: ${songTitle} ${keyInfo}.`);
          });
        }
      } else {
        items.push('No upcoming service schedule currently drafted.');
      }
      items.push(`Worship library statistics: ${songs.length} songs cataloged, ${schedules.length} saved lineups in history.`);
    } else if (activeTab === 'scheduler') {
      items.push('Song Line-up Scheduler.');
      if (schedule) {
        items.push(`Editing lineup for ${schedule.serviceDate}. Service Type: ${schedule.serviceType}.`);
        const leaderAss = schedule.ministryAssignments?.find((a) =>
          a.role.toLowerCase().includes('leader')
        );
        const leaderName = leaderAss ? formatAssignmentMemberNames(leaderAss) : 'Unassigned';
        items.push(`Assigned Leader: ${leaderName}.`);

        const praiseSongs = schedule.praiseSongs || [];
        const worshipSongs = schedule.worshipSongs || [];

        items.push(`Praise Section: ${praiseSongs.length} songs.`);
        praiseSongs.forEach((songTitle, i) => {
          const keyInfo = schedule.praiseSongKeys?.[i] ? `, key ${schedule.praiseSongKeys[i]}` : '';
          items.push(`Praise song ${i + 1}: ${songTitle}${keyInfo}.`);
        });

        items.push(`Worship Section: ${worshipSongs.length} songs.`);
        worshipSongs.forEach((songTitle, i) => {
          const keyInfo = schedule.worshipSongKeys?.[i] ? `, key ${schedule.worshipSongKeys[i]}` : '';
          items.push(`Worship song ${i + 1}: ${songTitle}${keyInfo}.`);
        });
      } else {
        items.push('No active schedule loaded in Scheduler.');
      }
    } else if (activeTab === 'songs') {
      items.push('Song Database and Worship Music Library.');
      items.push(`Total songs in library: ${songs.length}.`);
      items.push('Showing songs in catalog:');
      songs.slice(0, 15).forEach((song, idx) => {
        const artist = song.artist ? `by ${song.artist}` : '';
        const key = song.key ? `Key of ${song.key}` : '';
        items.push(`Song ${idx + 1}: ${song.title} ${artist}. Category: ${song.category}. ${key}.`);
      });
      if (songs.length > 15) {
        items.push(`and ${songs.length - 15} more songs in database.`);
      }
    } else if (activeTab === 'schedules') {
      items.push('Saved Lineups and Worship Service Archive.');
      items.push(`Total historical lineups: ${schedules.length}.`);
      schedules.slice(0, 8).forEach((sched, idx) => {
        const leaderAss = sched.ministryAssignments?.find((a) =>
          a.role.toLowerCase().includes('leader')
        );
        const leader = leaderAss ? formatAssignmentMemberNames(leaderAss) : 'Unassigned';
        const count = (sched.praiseSongs?.length || 0) + (sched.worshipSongs?.length || 0);
        items.push(`Lineup ${idx + 1}: Date ${sched.serviceDate}. Service: ${sched.serviceType}. Leader: ${leader}. ${count} songs.`);
      });
    } else if (activeTab === 'members') {
      items.push('Worship Team Roster and Member Directory.');
      items.push(`Total team members: ${members.length}.`);
      members.forEach((member, idx) => {
        const tags = member.labels?.join(', ') || 'Team Member';
        items.push(`Member ${idx + 1}: ${member.name}. Ministry labels: ${tags}.`);
      });
    }

    return items;
  }, [activeTab, schedule, songs, members, schedules]);

  // Speak a specific index
  const speakIndex = (index: number) => {
    if (!isSupported || typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const synth = window.speechSynthesis;
    const settings = StorageService.getAccessibilitySettings();
    if (!settings.ttsEnabled) {
      synth.cancel();
      setIsPlaying(false);
      setIsPaused(false);
      return;
    }

    synth.cancel();

    if (index < 0 || index >= speechItems.length) {
      setIsPlaying(false);
      setIsPaused(false);
      setStatusMessage('Finished reading page content.');
      return;
    }

    const textToSpeak = speechItems[index];
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = speechRate;

    if (selectedVoice && availableVoices.length > 0) {
      const voiceObj = availableVoices.find((v) => v.name === selectedVoice);
      if (voiceObj) {
        utterance.voice = voiceObj;
      }
    }

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsPaused(false);
      setCurrentIndex(index);
      setStatusMessage(`Reading item ${index + 1} of ${speechItems.length}`);
    };

    utterance.onend = () => {
      // Auto-advance to next phrase
      if (index + 1 < speechItems.length) {
        speakIndex(index + 1);
      } else {
        setIsPlaying(false);
        setIsPaused(false);
        setStatusMessage('Completed reading.');
      }
    };

    utterance.onerror = (e) => {
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        console.error('Speech synthesis error:', e);
        setIsPlaying(false);
        setIsPaused(false);
      }
    };

    currentUtteranceRef.current = utterance;
    synth.speak(utterance);
  };

  const handlePlayPause = () => {
    if (!isSupported || typeof window === 'undefined') return;
    const synth = window.speechSynthesis;

    if (isPlaying) {
      if (isPaused) {
        synth.resume();
        setIsPaused(false);
      } else {
        synth.pause();
        setIsPaused(true);
      }
    } else {
      speakIndex(currentIndex >= speechItems.length ? 0 : currentIndex);
    }
  };

  const handleStop = () => {
    if (!isSupported || typeof window === 'undefined') return;
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentIndex(0);
    setStatusMessage('Stopped.');
  };

  const handlePrev = () => {
    const nextIdx = Math.max(0, currentIndex - 1);
    setCurrentIndex(nextIdx);
    if (isPlaying) {
      speakIndex(nextIdx);
    }
  };

  const handleNext = () => {
    const nextIdx = Math.min(speechItems.length - 1, currentIndex + 1);
    setCurrentIndex(nextIdx);
    if (isPlaying) {
      speakIndex(nextIdx);
    }
  };

  const handleRateChange = (rate: number) => {
    setSpeechRate(rate);
    speechAssistant.setRate(rate);
    const curr = StorageService.getAccessibilitySettings();
    StorageService.saveAccessibilitySettings({ ...curr, ttsSpeechRate: rate });
    if (isPlaying) {
      speakIndex(currentIndex);
    }
  };

  const handleVoiceChange = (voiceName: string) => {
    setSelectedVoice(voiceName);
    speechAssistant.setVoice(voiceName);
    const curr = StorageService.getAccessibilitySettings();
    StorageService.saveAccessibilitySettings({ ...curr, ttsVoice: voiceName });
    if (isPlaying) {
      speakIndex(currentIndex);
    }
  };

  const handleReadFocusedElement = () => {
    if (!isSupported || typeof window === 'undefined') return;
    const settings = StorageService.getAccessibilitySettings();
    if (!settings.ttsEnabled) return;

    const activeEl = document.activeElement as HTMLElement | null;
    if (!activeEl || activeEl === document.body) {
      const msg = 'No specific element currently focused. Use Tab or touch controls to navigate.';
      speechAssistant.speak(msg, { priority: 'critical', force: true });
      setStatusMessage(msg);
      return;
    }

    const desc = speechAssistant.getSpeechDescription(activeEl);
    if (desc) {
      speechAssistant.speak(`Focused: ${desc}`, { priority: 'critical', force: true });
      setStatusMessage(desc);
    } else {
      const fallback = activeEl.getAttribute('aria-label') || activeEl.innerText?.slice(0, 100) || activeEl.tagName.toLowerCase();
      speechAssistant.speak(`Focused element: ${fallback}`, { priority: 'critical', force: true });
      setStatusMessage(fallback);
    }
  };

  const { zIndex } = useOverlay({
    id: 'tts-navigator-panel',
    isOpen,
    layer: OverlayLayer.FLOATING_PANEL,
    onClose,
    closeOnEscape: false
  });

  if (!isOpen) return null;

  const navigatorContent = (
    <div
      role="region"
      aria-label="Text-to-Speech Accessibility Navigator"
      style={{ zIndex }}
      data-overlay-id="tts-navigator-panel"
      className="fixed bottom-4 right-4 w-84 sm:w-96 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md transition-all duration-200"
    >
      {/* Navigator Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800 flex items-center justify-center">
            <Volume2 className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <span>Speech Navigator</span>
              {isPlaying && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Speaking" />
              )}
            </h4>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              Web Speech Assistant
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
            aria-label={isMinimized ? 'Expand speech navigator' : 'Minimize speech navigator'}
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              handleStop();
              onClose();
            }}
            className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
            aria-label="Hide speech navigator panel. Active speech assistant remains enabled on hover and focus."
            title="Hide panel (TTS remains active on hover and focus)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body / Content */}
      {!isSupported ? (
        <div className="p-4 text-center space-y-2">
          <div className="w-8 h-8 mx-auto rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <VolumeX className="w-4 h-4" />
          </div>
          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Text-to-speech is not supported by this browser.
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
            Please use Chrome, Edge, or Safari to enable speech synthesis assistance.
          </p>
        </div>
      ) : isMinimized ? (
        <div className="px-3.5 py-2 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
            {statusMessage || `${speechItems.length} items ready`}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePlayPause}
              className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              aria-label={isPlaying && !isPaused ? 'Pause' : 'Play'}
            >
              {isPlaying && !isPaused ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={handleStop}
              className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              aria-label="Stop"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3.5 space-y-3">
          {/* Current Live Caption Box */}
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-xs">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1">
              <span>CURRENT PHRASE ({currentIndex + 1} of {speechItems.length})</span>
              <span className="capitalize">{activeTab}</span>
            </div>
            <p className="text-slate-800 dark:text-slate-200 text-xs leading-relaxed font-medium min-h-[38px] line-clamp-3">
              {speechItems[currentIndex] || 'Ready to read.'}
            </p>
          </div>

          {/* Primary Controls */}
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-750 disabled:opacity-40 transition-colors cursor-pointer"
              aria-label="Previous item"
              title="Previous"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handlePlayPause}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              aria-label={isPlaying && !isPaused ? 'Pause reading' : 'Start reading'}
            >
              {isPlaying && !isPaused ? (
                <>
                  <Pause className="w-4 h-4" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>{isPaused ? 'Resume' : 'Read Page'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleStop}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors cursor-pointer"
              aria-label="Stop reading"
              title="Stop"
            >
              <Square className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={currentIndex >= speechItems.length - 1}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-750 disabled:opacity-40 transition-colors cursor-pointer"
              aria-label="Next item"
              title="Next"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleReadFocusedElement}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition-colors cursor-pointer ml-1"
              aria-label="Read currently focused element"
              title="Read Focused Control (Tab)"
            >
              <Focus className="w-4 h-4" />
            </button>
          </div>

          {/* Secondary Controls: Rate and Voice Selection */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px]">
            {/* Speed Rate */}
            <div className="flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500 dark:text-slate-400">Speed:</span>
              <div className="flex items-center gap-1">
                {[0.75, 1, 1.25, 1.5].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => handleRateChange(rate)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                      speechRate === rate
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            {/* Voice select if voices available */}
            {availableVoices.length > 0 && (
              <div className="flex items-center gap-1 max-w-[130px]">
                <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  value={selectedVoice}
                  onChange={(e) => handleVoiceChange(e.target.value)}
                  className="w-full text-[10px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-0.5 text-slate-700 dark:text-slate-300 truncate"
                  aria-label="Select voice"
                >
                  {availableVoices.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Bottom helper info & disable option */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
            <span className="truncate max-w-[200px]">Active TTS is on (hover / focus reading)</span>
            {onDisableTts && (
              <button
                type="button"
                onClick={() => {
                  handleStop();
                  onDisableTts();
                }}
                className="text-rose-600 dark:text-rose-400 hover:underline font-semibold cursor-pointer shrink-0"
                aria-label="Turn off text-to-speech assistant completely"
              >
                Turn Off TTS
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(navigatorContent, document.body);
};
