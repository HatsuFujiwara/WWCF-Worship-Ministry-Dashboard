import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { StorageService } from '../services/storage';
import { SongService } from '../services/songService';
import { SongFamilyService } from '../services/songFamilyService';
import { LineupHistoryService } from '../services/lineupHistoryService';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import {
  AlertTriangle,
  X,
  Trash2,
  ArrowLeft,
  ShieldAlert,
  Clock,
  CheckCircle2,
  Users,
  Music,
  Calendar,
  BarChart3
} from 'lucide-react';

interface DeleteAllDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataDeleted: () => void;
  showToast: (text: string, type?: 'success' | 'danger' | 'info') => void;
}

const REQUIRED_CONFIRMATION_PHRASE = 'I am sure what I am doing';

export const DeleteAllDataModal: React.FC<DeleteAllDataModalProps> = ({
  isOpen,
  onClose,
  onDataDeleted,
  showToast
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [typedPhrase, setTypedPhrase] = useState('');
  const [countdown, setCountdown] = useState(5);
  const [isDeleting, setIsDeleting] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset all state when modal opens or closes
  const resetAllState = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setStep(1);
    setTypedPhrase('');
    setCountdown(5);
    setIsDeleting(false);
  };

  useEffect(() => {
    if (isOpen) {
      resetAllState();
    } else {
      resetAllState();
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isOpen]);

  // Countdown timer for Step 4
  useEffect(() => {
    if (step === 4 && isOpen) {
      setCountdown(5);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [step, isOpen]);

  // Handle GO BACK at any stage: completely cancel and reset
  const handleGoBack = () => {
    resetAllState();
    onClose();
  };

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'delete-all-data-modal',
    isOpen,
    layer: OverlayLayer.CRITICAL_DIALOG,
    onClose: handleGoBack,
    closeOnEscape: true
  });

  // Execute deletion only when all prerequisites are strictly satisfied
  const handleExecuteDelete = async () => {
    // Strict safety check: must be on step 4, phrase must match, countdown must be 0
    if (step !== 4 || typedPhrase !== REQUIRED_CONFIRMATION_PHRASE || countdown > 0 || isDeleting) {
      handleGoBack();
      return;
    }

    try {
      setIsDeleting(true);
      const prevMembers = StorageService.getMembersSync();
      const prevLabels = StorageService.getLabelsSync();
      const prevSchedules = StorageService.getSchedulesSync();
      const prevSongs = await SongService.getSongs();
      const prevFamilies = await SongFamilyService.getSongFamilies();
      const prevDraft = StorageService.getDraftSchedule();

      await StorageService.deleteAllData();

      LineupHistoryService.pushAppAction({
        description: 'Purged all application data',
        undo: async () => {
          StorageService.saveMembers(prevMembers);
          StorageService.saveLabels(prevLabels);
          StorageService.saveSchedules(prevSchedules);
          await SongService.saveSongsList(prevSongs);
          await SongFamilyService.saveSongFamilies(prevFamilies);
          StorageService.saveDraftSchedule(prevDraft);
          onDataDeleted();
        },
        redo: async () => {
          await StorageService.deleteAllData();
          onDataDeleted();
        }
      });

      showToast('All data has been deleted. You can undo this action from the toolbar or with Ctrl+Z.', 'success');
      onDataDeleted();
      handleGoBack();
    } catch (err) {
      console.error('Failed to execute Delete All Data:', err);
      showToast('An error occurred while deleting stored data. Please try again.', 'danger');
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      style={{ zIndex }}
      data-overlay-id="delete-all-data-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200 transition-opacity ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      onClick={isBlocked ? undefined : handleGoBack}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border-2 border-rose-500/80 dark:border-rose-600/80 overflow-hidden flex flex-col max-h-[92vh] my-auto transform animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rose-100 dark:border-rose-950/60 bg-rose-50/80 dark:bg-rose-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-900/80 text-rose-600 dark:text-rose-400">
              <ShieldAlert className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-rose-950 dark:text-rose-100 text-base">
                  Delete All Data / Fresh Start
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-full bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200">
                  Step {step} of 4
                </span>
              </div>
              <p className="text-xs text-rose-700/80 dark:text-rose-400/80">
                Destructive Action • Irreversible Reset
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleGoBack}
            className="p-1.5 text-rose-400 hover:text-rose-700 dark:hover:text-rose-200 hover:bg-rose-100/60 dark:hover:bg-rose-900/40 rounded-lg transition-colors cursor-pointer"
            title="Cancel and Go Back"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Dependent on Step */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* STEP 1: First Confirmation */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-800/80 bg-rose-50/60 dark:bg-rose-950/30 flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-rose-900 dark:text-rose-200">
                    Are you sure you want to delete ALL data?
                  </h4>
                  <p className="text-xs text-rose-800/90 dark:text-rose-300/90 leading-relaxed">
                    This will permanently remove all stored website data and reset the website to a fresh state.
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Starting a fresh state will allow you to re-populate the worship ministry database from scratch. Please confirm if you wish to proceed to the safety verification steps.
              </p>
            </div>
          )}

          {/* STEP 2: Second Confirmation */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-800/80 bg-rose-50/60 dark:bg-rose-950/30 flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-rose-900 dark:text-rose-200">
                    Are you absolutely sure?
                  </h4>
                  <p className="text-xs text-rose-800/90 dark:text-rose-300/90 leading-relaxed">
                    Deleting all data will remove your members, songs, lineups, settings, song history, analytics, and other stored application data.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-2">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  The following stored application records will be erased:
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>Member roster & tags</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-slate-400" />
                    <span>Song library & metadata</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>Saved lineups & drafts</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Song history & analytics</span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                Note: This action cannot be reversed once finalized. You can export a backup first via Settings → Backup & Restore if you wish to preserve your records.
              </p>
            </div>
          )}

          {/* STEP 3: Required Phrase Confirmation */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Type the following phrase exactly to continue:
                </label>
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-xs font-bold text-slate-900 dark:text-slate-100 select-none text-center tracking-wide">
                  {REQUIRED_CONFIRMATION_PHRASE}
                </div>
              </div>

              <div className="space-y-1.5">
                <input
                  type="text"
                  value={typedPhrase}
                  onChange={(e) => setTypedPhrase(e.target.value)}
                  placeholder="Type the exact phrase above..."
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-medium focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all placeholder:text-slate-400"
                />
                <div className="flex items-center justify-between text-[11px]">
                  {typedPhrase === REQUIRED_CONFIRMATION_PHRASE ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Phrase matched exactly
                    </span>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">
                      Exact case and character match required
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Final Confirmation with 5-Second Safety Delay */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-rose-700 dark:text-rose-300 font-bold text-sm">
                  <Clock className="w-4 h-4 animate-pulse" />
                  <span>5-Second Safety Countdown</span>
                </div>
                {countdown > 0 ? (
                  <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
                    Safety timer in progress. The final delete button will unlock in{' '}
                    <strong className="font-bold text-rose-900 dark:text-rose-100 text-sm">
                      {countdown}
                    </strong>{' '}
                    second{countdown === 1 ? '' : 's'}.
                  </p>
                ) : (
                  <p className="text-xs text-rose-800 dark:text-rose-300 font-semibold leading-relaxed">
                    Safety timer complete. You may now manually click the button below to perform the deletion.
                  </p>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                <div className="font-bold text-slate-700 dark:text-slate-300">Final Verification Checklist:</div>
                <div className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Initial confirmation accepted</div>
                <div className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Irreversible data loss acknowledged</div>
                <div className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Exact security phrase verified</div>
                <div className={countdown === 0 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-amber-600 dark:text-amber-400 font-medium'}>
                  {countdown === 0 ? '✓ Safety delay completed' : `⏳ Safety delay active (${countdown}s)`}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions: Every step has [GO BACK] */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60">
          {/* GO BACK button present on all steps */}
          <button
            type="button"
            onClick={handleGoBack}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>GO BACK</span>
          </button>

          {/* Action Button for Step 1 */}
          {step === 1 && (
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors cursor-pointer shadow-2xs"
            >
              YES, CONTINUE
            </button>
          )}

          {/* Action Button for Step 2 */}
          {step === 2 && (
            <button
              type="button"
              onClick={() => setStep(3)}
              className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors cursor-pointer shadow-2xs"
            >
              YES, I UNDERSTAND
            </button>
          )}

          {/* Action Button for Step 3 */}
          {step === 3 && (
            <button
              type="button"
              disabled={typedPhrase !== REQUIRED_CONFIRMATION_PHRASE}
              onClick={() => {
                if (typedPhrase === REQUIRED_CONFIRMATION_PHRASE) {
                  setStep(4);
                }
              }}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors shadow-2xs ${
                typedPhrase === REQUIRED_CONFIRMATION_PHRASE
                  ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed border border-slate-300 dark:border-slate-700'
              }`}
            >
              YES, CONTINUE
            </button>
          )}

          {/* Action Button for Step 4: 5-second safety timer */}
          {step === 4 && (
            <button
              type="button"
              disabled={countdown > 0 || isDeleting}
              onClick={handleExecuteDelete}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all shadow-2xs flex items-center gap-1.5 ${
                countdown === 0 && !isDeleting
                  ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer animate-pulse'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed border border-slate-300 dark:border-slate-700'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>
                {isDeleting
                  ? 'DELETING DATA...'
                  : countdown > 0
                  ? `DELETE ALL DATA (${countdown})`
                  : 'DELETE ALL DATA'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
