import { useEffect, useRef, useId, useSyncExternalStore } from 'react';
import { overlayManager, OverlayLayer, GuideSublayer } from '../utils/overlayManager';

export { OverlayLayer, GuideSublayer, overlayManager };

export interface UseOverlayOptions {
  id?: string;
  isOpen: boolean;
  layer?: OverlayLayer;
  onClose?: () => void;
  closeOnEscape?: boolean;
  parentId?: string;
  trapFocus?: boolean;
}

export interface UseOverlayReturn {
  zIndex: number;
  isTopmost: boolean;
  isBlocked: boolean;
  style: React.CSSProperties;
  overlayProps: {
    style: React.CSSProperties;
    'data-overlay-id': string;
    'data-overlay-topmost': boolean;
    'aria-hidden'?: boolean;
    inert?: true;
  };
}

export function useOverlay({
  id: explicitId,
  isOpen,
  layer = OverlayLayer.MODAL,
  onClose,
  closeOnEscape = true,
  parentId,
  trapFocus
}: UseOverlayOptions): UseOverlayReturn {
  const generatedId = useId();
  const id = explicitId || generatedId;

  // Stable ref for callbacks & options so parent re-renders don't trigger unregister/re-register
  const optionsRef = useRef({
    onClose,
    closeOnEscape,
    parentId,
    trapFocus
  });

  // Always update optionsRef on render
  optionsRef.current = {
    onClose,
    closeOnEscape,
    parentId,
    trapFocus
  };

  // Subscribe to overlayManager external store
  // Version increments synchronously whenever the overlay stack changes
  useSyncExternalStore(
    overlayManager.subscribe,
    overlayManager.getVersion,
    overlayManager.getVersion
  );

  // Register on mount and when isOpen / layer / id changes
  useEffect(() => {
    overlayManager.register(id, isOpen, layer, {
      onClose: () => optionsRef.current.onClose?.(),
      closeOnEscape: optionsRef.current.closeOnEscape,
      parentId: optionsRef.current.parentId,
      trapFocus: optionsRef.current.trapFocus
    });
  }, [id, isOpen, layer]);

  // Clean unregister ONLY on unmount or id change
  useEffect(() => {
    return () => {
      overlayManager.unregister(id);
    };
  }, [id]);

  // If already open and options (e.g. closeOnEscape) change, update them in place without reordering
  useEffect(() => {
    if (isOpen) {
      overlayManager.updateOptions(id, {
        onClose: () => optionsRef.current.onClose?.(),
        closeOnEscape: optionsRef.current.closeOnEscape,
        parentId: optionsRef.current.parentId,
        trapFocus: optionsRef.current.trapFocus
      });
    }
  }, [id, isOpen, closeOnEscape, parentId, trapFocus]);

  // Fresh calculations on every render - guaranteed never stale
  const zIndex = overlayManager.getZIndex(id);
  const isTopmost = overlayManager.isTopmost(id);
  const isBlocked = overlayManager.isBlocked(id);

  const style: React.CSSProperties = { zIndex };

  const overlayProps = {
    style,
    'data-overlay-id': id,
    'data-overlay-topmost': isTopmost,
    'aria-hidden': isBlocked ? true : undefined,
    inert: isBlocked ? (true as const) : undefined
  };

  return {
    zIndex,
    isTopmost,
    isBlocked,
    style,
    overlayProps
  };
}

