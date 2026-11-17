import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';

interface ModalProps {
  id?: string;
  isOpen: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
  maxWidth?: string;
  children?: React.ReactNode;
  confirmButtonClassName?: string;
}

export const Modal: React.FC<ModalProps> = ({
  id,
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDanger = false,
  onConfirm,
  onClose,
  maxWidth = 'max-w-md',
  children,
  confirmButtonClassName
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusedRef = useRef<HTMLElement | null>(null);
  const generatedId = React.useId();
  const titleId = `modal-dialog-title-${generatedId.replace(/:/g, '')}`;
  const descId = `modal-dialog-desc-${generatedId.replace(/:/g, '')}`;
  const overlayId = id || `modal-${generatedId.replace(/:/g, '')}`;

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: overlayId,
    isOpen,
    layer: isDanger ? OverlayLayer.CRITICAL_DIALOG : OverlayLayer.MODAL,
    onClose,
    closeOnEscape: true,
    trapFocus: true
  });

  // Save previously focused element and restore when closing
  useEffect(() => {
    if (!isOpen) return;
    previousFocusedRef.current = document.activeElement as HTMLElement | null;
    return () => {
      const prev = previousFocusedRef.current;
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        prev.focus();
      }
      previousFocusedRef.current = null;
    };
  }, [isOpen]);

  // Manage initial focus & Tab focus trap when opened and topmost
  useEffect(() => {
    if (!isOpen || !isTopmost) return;

    const timer = setTimeout(() => {
      if (confirmBtnRef.current) {
        confirmBtnRef.current.focus();
      } else if (modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        focusables[0]?.focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (!active || active === first || !modalRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (!active || active === last || !modalRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isTopmost]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      style={{ zIndex }}
      data-overlay-id={overlayId}
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-hidden backdrop-enter-animation transition-opacity duration-200 ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      onClick={isBlocked ? undefined : onClose}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? descId : undefined}
        className={`w-full ${maxWidth} wwcf-glass-modal rounded-2xl shadow-2xl overflow-hidden transform modal-enter-animation max-h-[92dvh] sm:max-h-[88vh] my-auto flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200/80 dark:border-white/10 shrink-0 bg-slate-50/70 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2.5 min-w-0">
            {isDanger && <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" aria-hidden="true" />}
            <h3 id={titleId} className="font-semibold text-slate-900 dark:text-slate-100 text-base truncate">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-white/10 rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        {children ? (
          <div className="p-5 sm:p-6 overflow-y-auto overscroll-contain flex-1 min-h-0">
            {children}
          </div>
        ) : (
          <div
            id={descId}
            className="px-5 sm:px-6 py-5 text-sm text-slate-600 dark:text-slate-300 overflow-y-auto overscroll-contain flex-1 min-h-0 leading-relaxed"
          >
            {message}
          </div>
        )}

        {/* Footer / Buttons */}
        {(onConfirm || !children) && (
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 px-5 sm:px-6 py-3.5 sm:py-4 bg-slate-50/80 dark:bg-white/[0.03] border-t border-slate-200/80 dark:border-white/10 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="btn-tactile w-full sm:w-auto px-4 py-2.5 min-h-[42px] text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-all cursor-pointer flex items-center justify-center focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmBtnRef}
              type="button"
              onClick={() => {
                if (typeof onConfirm === 'function') {
                  try {
                    onConfirm();
                  } catch (err) {
                    console.error('Error executing onConfirm callback:', err);
                  }
                }
                if (typeof onClose === 'function') {
                  onClose();
                }
              }}
              className={
                confirmButtonClassName ||
                `btn-tactile w-full sm:w-auto px-5 py-2.5 min-h-[42px] text-sm font-semibold text-white rounded-xl shadow-sm transition-all cursor-pointer flex items-center justify-center focus-visible:outline-hidden focus-visible:ring-2 ${
                  isDanger
                    ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-rose-600/20 focus-visible:ring-rose-500'
                    : 'bg-[#1b75bc] hover:bg-[#165d97] active:bg-[#144d7c] shadow-[#1b75bc]/20 focus-visible:ring-[#1b75bc]'
                }`
              }
            >
              {confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};

