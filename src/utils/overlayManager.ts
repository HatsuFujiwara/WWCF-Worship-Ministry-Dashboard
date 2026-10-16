/**
 * WWCF Santa Cruz - Centralized Overlay & Stacking Architecture
 * 
 * Provides a unified, deterministic hierarchy for all floating windows,
 * modals, popovers, utility panels, guided tours, and critical dialogs.
 * 
 * Rules:
 * 1. Semantic Layer tokens define bounded absolute priority bands (gaps of 200).
 * 2. Semantic layer ALWAYS outranks lower layers (DROPDOWN < FLOATING_PANEL < MODAL < NESTED_MODAL < CRITICAL_DIALOG < GUIDE < GUIDE_DIALOG < TOAST).
 * 3. Within the same layer, newest active window gets priority within its reserved band, strictly bounded to prevent layer crossover.
 * 4. Dynamic Guide Promotion: Modals open alongside the interactive guide dynamically receive GUIDE_DIALOG priority, returning to normal when guide closes.
 * 5. Parent/Child relationships enforce blocking and topmost-aware focus restoration.
 * 6. Escape key closes ONLY the topmost closable overlay, respecting inner dropdowns.
 * 7. Underlying overlays are blocked (pointer-events-none, inert, aria-hidden) while a child/higher modal is active.
 * 8. When the top window closes, the underlying window smoothly regains active focus & front position.
 */

export enum OverlayLayer {
  BASE = 0,
  STICKY_NAV = 20,
  SIDEBAR_BACKDROP = 40,
  SIDEBAR_DRAWER = 50,
  DROPDOWN = 1000,        // Local popovers, dropdown menus, autocomplete suggestions
  FLOATING_PANEL = 1200,  // Modeless floating utility widgets (e.g., TextToSpeechNavigator)
  MODAL = 1400,           // Standard full modals (SongFamiliesModal, SongFormModal, SettingsModal, etc.)
  NESTED_MODAL = 1600,    // Secondary dialogs opened over another modal (DuplicateSongModal, SongFamilyModal from SongFamilies)
  CRITICAL_DIALOG = 1800, // Dangerous/system confirmations (DeleteAllDataModal, disciplinary confirm, conflict confirm)
  GUIDE = 2000,           // Guided walkthrough overlays (InteractiveTourOverlay, WelcomeGuideModal)
  GUIDE_DIALOG = 2200,    // Dialogs explicitly opened while the interactive guide is active
  TOAST = 2400            // Notification toasts (always float above, pointer-events-none container)
}

/**
 * Standard semantic sublayer offsets for Guided Tour internals.
 * Bounded strictly within the GUIDE layer band (2000..2085).
 */
export const GuideSublayer = {
  BACKDROP: 1,
  SPOTLIGHT: 2,
  POPOVER: 5
} as const;

export interface OverlayItem {
  id: string;
  baseLayer: OverlayLayer;
  get layer(): OverlayLayer;
  order: number;
  isOpen: boolean;
  onClose?: () => void;
  closeOnEscape?: boolean;
  parentId?: string;
  trapFocus?: boolean;
  triggerElement?: HTMLElement | null;
}

type OverlaySubscriber = () => void;

const MAX_SAME_LAYER_OFFSET = 80;

class OverlayStackManager {
  private items: Map<string, OverlayItem> = new Map();
  private subscribers: Set<OverlaySubscriber> = new Set();
  private globalSequence = 0;
  private version = 0;
  private isEscapeListenerAttached = false;

  constructor() {
    this.attachGlobalListeners();
  }

  public getVersion = (): number => {
    return this.version;
  };

  private attachGlobalListeners() {
    if (typeof window === 'undefined' || this.isEscapeListenerAttached) return;

    // Use bubble phase (false) so focused dropdowns/inputs can consume Escape (via e.preventDefault)
    // before the global modal closer handles it.
    window.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          // If an active dropdown/input inside the modal already handled Escape, respect it
          if (e.defaultPrevented) return;

          const top = this.getTopmostClosable();
          if (top && top.onClose) {
            e.preventDefault();
            e.stopPropagation();
            top.onClose();
          }
        }
      },
      false
    );

    this.isEscapeListenerAttached = true;
  }

  /**
   * Determine the effective layer dynamically.
   * Modals opened while the Guide is active are dynamically promoted to GUIDE_DIALOG
   * without permanently mutating their base layer.
   */
  public getEffectiveLayer(item: OverlayItem): OverlayLayer {
    if (
      item.baseLayer !== OverlayLayer.MODAL &&
      item.baseLayer !== OverlayLayer.NESTED_MODAL &&
      item.baseLayer !== OverlayLayer.CRITICAL_DIALOG
    ) {
      return item.baseLayer;
    }

    // Check if an Interactive Guide is currently open
    const isGuideOpen = Array.from(this.items.values()).some(
      (i) => i.isOpen && i.id !== item.id && i.baseLayer === OverlayLayer.GUIDE
    );

    if (isGuideOpen) {
      if (item.baseLayer === OverlayLayer.CRITICAL_DIALOG) {
        return OverlayLayer.GUIDE_DIALOG + 20;
      }
      if (item.baseLayer === OverlayLayer.NESTED_MODAL) {
        return OverlayLayer.GUIDE_DIALOG + 10;
      }
      return OverlayLayer.GUIDE_DIALOG;
    }

    return item.baseLayer;
  }

  /**
   * Register or update an overlay's open state in the global stack.
   * Preserves activation order across ordinary re-renders.
   */
  public register(
    id: string,
    isOpen: boolean,
    layer: OverlayLayer = OverlayLayer.MODAL,
    options: {
      onClose?: () => void;
      closeOnEscape?: boolean;
      parentId?: string;
      trapFocus?: boolean;
    } = {}
  ): void {
    const existing = this.items.get(id);

    if (!isOpen) {
      if (existing && existing.isOpen) {
        existing.isOpen = false;

        // Topmost-aware focus restoration
        const remainingOpenModals = this.getOpenOverlays().filter(
          (i) =>
            i.id !== id &&
            this.getEffectiveLayer(i) >= OverlayLayer.MODAL &&
            this.getEffectiveLayer(i) < OverlayLayer.TOAST
        );
        const topRemaining =
          remainingOpenModals.length > 0
            ? remainingOpenModals[remainingOpenModals.length - 1]
            : null;

        if (!topRemaining) {
          // No other modal open: restore focus to main page trigger
          if (existing.triggerElement && typeof existing.triggerElement.focus === 'function') {
            try {
              if (document.body.contains(existing.triggerElement)) {
                existing.triggerElement.focus();
              }
            } catch {
              // Ignore focus error
            }
          }
        } else {
          // A parent or sibling modal remains open: restore focus to trigger inside it, or first interactive element
          const topEl = document.querySelector(`[data-overlay-id="${topRemaining.id}"]`);
          if (topEl) {
            if (
              existing.triggerElement &&
              topEl.contains(existing.triggerElement) &&
              typeof existing.triggerElement.focus === 'function'
            ) {
              try {
                existing.triggerElement.focus();
              } catch {
                // Ignore focus error
              }
            } else if (!topEl.contains(document.activeElement)) {
              const focusable = topEl.querySelector<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
              );
              if (focusable) {
                try {
                  focusable.focus();
                } catch {
                  // Ignore focus error
                }
              }
            }
          }
        }

        this.version++;
        this.notify();
      } else if (!existing) {
        const self = this;
        this.items.set(id, {
          id,
          baseLayer: layer,
          get layer() {
            return self.getEffectiveLayer(this);
          },
          order: 0,
          isOpen: false,
          onClose: options.onClose,
          closeOnEscape: options.closeOnEscape !== false,
          parentId: options.parentId,
          trapFocus: options.trapFocus,
          triggerElement: null
        });
      }
      return;
    }

    // Overlay is open
    const wasOpen = existing ? existing.isOpen : false;
    let order = existing ? existing.order : 0;
    let triggerElement = existing?.triggerElement || null;

    if (!wasOpen) {
      // Real activation!
      order = ++this.globalSequence;
      triggerElement =
        typeof document !== 'undefined' ? (document.activeElement as HTMLElement) : null;
    }

    const self = this;
    this.items.set(id, {
      id,
      baseLayer: layer,
      get layer() {
        return self.getEffectiveLayer(this);
      },
      order,
      isOpen: true,
      onClose: options.onClose,
      closeOnEscape: options.closeOnEscape !== false,
      parentId: options.parentId,
      trapFocus: options.trapFocus,
      triggerElement
    });

    this.version++;
    this.notify();
  }

  /**
   * Update options for an open overlay without re-ordering or incrementing sequence.
   */
  public updateOptions(
    id: string,
    options: {
      onClose?: () => void;
      closeOnEscape?: boolean;
      parentId?: string;
      trapFocus?: boolean;
    }
  ): void {
    const item = this.items.get(id);
    if (!item) return;

    let changed = false;
    if (options.onClose !== undefined && item.onClose !== options.onClose) {
      item.onClose = options.onClose;
      changed = true;
    }
    if (options.closeOnEscape !== undefined && item.closeOnEscape !== options.closeOnEscape) {
      item.closeOnEscape = options.closeOnEscape;
      changed = true;
    }
    if (options.parentId !== undefined && item.parentId !== options.parentId) {
      item.parentId = options.parentId;
      changed = true;
    }
    if (options.trapFocus !== undefined && item.trapFocus !== options.trapFocus) {
      item.trapFocus = options.trapFocus;
      changed = true;
    }

    if (changed) {
      this.version++;
      this.notify();
    }
  }

  /**
   * Unregister an overlay when it unmounts
   */
  public unregister(id: string): void {
    if (this.items.has(id)) {
      this.items.delete(id);
      this.version++;
      this.notify();
    }
  }

  /**
   * Intentionally bring an overlay to front within its layer category
   */
  public bringToFront(id: string): void {
    const item = this.items.get(id);
    if (item && item.isOpen) {
      item.order = ++this.globalSequence;
      this.version++;
      this.notify();
    }
  }

  /**
   * Get calculated CSS z-index for an overlay.
   * Bound by semantic layer band: effectiveLayer + Math.min(localIndexInLayer * 2, MAX_SAME_LAYER_OFFSET)
   * Semantic layer ALWAYS wins. Local index ensures newest activation in that layer is on top.
   * Mathematical proof: MAX_SAME_LAYER_OFFSET (80) < minimum band gap (200).
   * Layer crossover is mathematically impossible.
   */
  public getZIndex(id: string): number {
    const item = this.items.get(id);
    if (!item) return OverlayLayer.MODAL;

    const effectiveLayer = this.getEffectiveLayer(item);

    const sameLayerOpenItems = Array.from(this.items.values())
      .filter((i) => i.isOpen && this.getEffectiveLayer(i) === effectiveLayer)
      .sort((a, b) => a.order - b.order);

    const localIdx = sameLayerOpenItems.findIndex((i) => i.id === id);
    const safeIdx = localIdx >= 0 ? localIdx : 0;
    const offset = Math.min(safeIdx * 2, MAX_SAME_LAYER_OFFSET);

    return effectiveLayer + offset;
  }

  /**
   * Returns all currently open overlays, sorted by effective stacking order ascending.
   * 1. Higher effective layer wins.
   * 2. Within same layer, higher activation order wins.
   */
  public getOpenOverlays(): OverlayItem[] {
    return Array.from(this.items.values())
      .filter((i) => i.isOpen)
      .sort((a, b) => {
        const layerA = this.getEffectiveLayer(a);
        const layerB = this.getEffectiveLayer(b);
        if (layerA !== layerB) {
          return layerA - layerB;
        }
        return a.order - b.order;
      });
  }

  /**
   * Get the topmost active overlay that can be closed by Escape
   */
  public getTopmostClosable(): OverlayItem | null {
    const open = this.getOpenOverlays();
    for (let i = open.length - 1; i >= 0; i--) {
      const item = open[i];
      if (item.baseLayer !== OverlayLayer.TOAST && item.closeOnEscape && item.onClose) {
        return item;
      }
    }
    return null;
  }

  /**
   * Is this overlay the topmost active window among modal-level overlays?
   */
  public isTopmost(id: string): boolean {
    const openModals = this.getOpenOverlays().filter((i) => {
      const eff = this.getEffectiveLayer(i);
      return eff >= OverlayLayer.MODAL && eff < OverlayLayer.TOAST;
    });
    if (openModals.length === 0) return false;
    return openModals[openModals.length - 1].id === id;
  }

  /**
   * Is this overlay blocked by a higher modal or by an open child modal?
   */
  public isBlocked(id: string): boolean {
    const item = this.items.get(id);
    if (!item || !item.isOpen) return false;

    // TOAST is never blocked
    if (item.baseLayer === OverlayLayer.TOAST) return false;

    const openModals = this.getOpenOverlays().filter((i) => {
      const eff = this.getEffectiveLayer(i);
      return eff >= OverlayLayer.MODAL && eff < OverlayLayer.TOAST;
    });

    // Modeless floating panels are blocked if ANY modal is open
    if (item.baseLayer < OverlayLayer.MODAL) {
      return openModals.length > 0;
    }

    // Check if this overlay is the explicit parent of any currently open modal
    const hasOpenChild = openModals.some((child) => child.parentId === id);
    if (hasOpenChild) {
      return true;
    }

    const targetIdx = openModals.findIndex((i) => i.id === id);
    if (targetIdx === -1) return false;

    // If there is any modal, nested modal, critical dialog, or guide dialog open above it
    return targetIdx < openModals.length - 1;
  }

  /**
   * Subscribe to stack changes
   */
  public subscribe = (subscriber: OverlaySubscriber): (() => void) => {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  };

  private notify(): void {
    for (const sub of this.subscribers) {
      try {
        sub();
      } catch (err) {
        console.error('Error notifying overlay subscriber:', err);
      }
    }
  }
}

export const overlayManager = new OverlayStackManager();


