import React from 'react';
import { createPortal } from 'react-dom';
import { MonthlyUsageCheckResult } from '../services/songService';
import { AlertCircle, Calendar, RefreshCw, CheckCircle2, X, Eye, ExternalLink } from 'lucide-react';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';

interface MonthlyUsageModalProps {
  isOpen: boolean;
  warnings: MonthlyUsageCheckResult[];
  monthYearName: string;
  onUseAnyway: () => void;
  onChooseAnother: () => void;
  onViewExistingLineup?: (scheduleId?: string) => void;
}

export const MonthlyUsageModal: React.FC<MonthlyUsageModalProps> = ({
  isOpen,
  warnings,
  monthYearName,
  onUseAnyway,
  onChooseAnother,
  onViewExistingLineup
}) => {
  const isEffectivelyOpen = Boolean(isOpen && warnings && warnings.length > 0);

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'monthly-usage-modal',
    isOpen: isEffectivelyOpen,
    layer: OverlayLayer.NESTED_MODAL,
    onClose: onChooseAnother,
    closeOnEscape: true
  });

  if (!isEffectivelyOpen) return null;

  const firstAffectedScheduleId = warnings.find((w) => w.affectedSchedules && w.affectedSchedules.length > 0)
    ?.affectedSchedules?.[0]?.id;

  const modalContent = (
    <div
      style={{ zIndex }}
      data-overlay-id="monthly-usage-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200 transition-opacity ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5 animate-in zoom-in-95 duration-200 max-h-[90vh] my-auto flex flex-col">
        
        {/* Header */}
        <div className="flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Monthly Song Usage Warning
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {warnings.length} song(s) already used in {monthYearName}
              </p>
            </div>
          </div>
          <button
            onClick={onChooseAnother}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning List */}
        <div className="space-y-3 overflow-y-auto pr-1 flex-1">
          {warnings.map((w, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/60 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-extrabold text-amber-900 dark:text-amber-200 truncate">
                  "{w.songTitle}"
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-900/80 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 shrink-0">
                  Used {w.timesUsedThisMonth} {w.timesUsedThisMonth === 1 ? 'time' : 'times'} this month
                </span>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 pt-0.5">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>
                    Last date used: <strong className="text-slate-800 dark:text-slate-200">{w.lastDateUsed || 'N/A'}</strong>
                  </span>
                </div>

                {w.serviceTypes.length > 0 && (
                  <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span>
                      Service type(s): <strong className="text-slate-800 dark:text-slate-200">{w.serviceTypes.join(', ')}</strong>
                    </span>
                  </div>
                )}

                {/* Affected Line-ups References */}
                {w.affectedSchedules && w.affectedSchedules.length > 0 && (
                  <div className="pt-2 border-t border-amber-200/60 dark:border-amber-800/40 space-y-1.5">
                    <span className="text-[11px] font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider block">
                      Affected Line-up(s):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {w.affectedSchedules.map((schRef, sIdx) => (
                        <button
                          key={sIdx}
                          type="button"
                          onClick={() => onViewExistingLineup && onViewExistingLineup(schRef.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold bg-white dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-200 rounded-lg border border-amber-300 dark:border-amber-700/80 transition-colors cursor-pointer shadow-2xs"
                          title={`View lineup for ${schRef.serviceType} on ${schRef.serviceDate}`}
                        >
                          <ExternalLink className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          <span>{schRef.serviceType} ({schRef.serviceDate})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed shrink-0">
          Reusing songs frequently within the same month can reduce lineup variety. How would you like to proceed?
        </p>

        {/* Options / Action Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2 shrink-0">
          <button
            type="button"
            onClick={onChooseAnother}
            className="px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer text-center"
          >
            Choose Another Song
          </button>

          {onViewExistingLineup && (
            <button
              type="button"
              onClick={() => onViewExistingLineup(firstAffectedScheduleId)}
              className="px-3.5 py-2 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 hover:bg-indigo-100 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 text-center"
            >
              <Eye className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>View Existing Line-up(s)</span>
            </button>
          )}

          <button
            type="button"
            onClick={onUseAnyway}
            className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer text-center"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Continue Anyway</span>
          </button>
        </div>

      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
