/**
 * Web Audio API Feedback Synthesizer
 * Provides gentle, zero-asset synthesized sound cues when audio feedback is enabled.
 */

class SoundEffects {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playBeep(frequency = 440, duration = 0.08, type: OscillatorType = 'sine', volume = 0.04) {
    try {
      if (typeof document === 'undefined') return;
      const isEnabled = document.documentElement.getAttribute('data-audio-feedback') !== 'false';
      if (!isEnabled) return;

      const ctx = this.getContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);

      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Ignore audio synthesis errors on restricted devices
    }
  }

  playSuccess() {
    this.playBeep(587.33, 0.06, 'sine', 0.04);
    setTimeout(() => this.playBeep(880, 0.08, 'sine', 0.04), 70);
  }

  playTap() {
    this.playBeep(440, 0.03, 'sine', 0.02);
  }

  playWarning() {
    this.playBeep(330, 0.1, 'triangle', 0.05);
  }
}

export const soundEffects = new SoundEffects();
