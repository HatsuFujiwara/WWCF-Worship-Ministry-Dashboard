import { StorageService } from '../services/storage';

export type HapticType = 'tap' | 'selection' | 'success' | 'warning' | 'error';

/**
 * Trigger subtle haptic vibration on supported devices (phones/tablets).
 * Requires the Haptic Feedback accessibility setting to be enabled.
 * Gracefully no-ops on desktop, iOS Safari, or devices without Vibration API support.
 */
export const triggerHaptic = (type: HapticType = 'tap'): void => {
  try {
    if (typeof window === 'undefined') return;

    // Feature detection: Check if navigator.vibrate is available
    if (!('vibrate' in navigator) || typeof navigator.vibrate !== 'function') {
      return;
    }

    // Check if user has enabled Haptic Feedback in Accessibility settings
    const settings = StorageService.getAccessibilitySettings();
    if (!settings.hapticFeedback) {
      try {
        navigator.vibrate(0);
      } catch {}
      return;
    }

    switch (type) {
      case 'tap':
      case 'selection':
        // Extremely brief, subtle 10ms click vibration
        navigator.vibrate(10);
        break;
      case 'success':
        // Subtle double-pulse confirming positive action
        navigator.vibrate([12, 40, 16]);
        break;
      case 'warning':
      case 'error':
        // Noticeable double-pulse for destructive or warning feedback
        navigator.vibrate([22, 45, 28]);
        break;
    }
  } catch {
    // Gracefully handle any browser permission or hardware restrictions
  }
};

/**
 * Immediately cancel any ongoing vibration
 */
export const cancelHaptic = (): void => {
  try {
    if (typeof window !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(0);
    }
  } catch {}
};
