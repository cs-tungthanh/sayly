/**
 * Text-to-speech: Google Translate's voice (played by the background's offscreen document),
 * falling back to the browser's speech synthesis
 */

import {
  PREFERRED_VOICE_LANG,
  SLOW_SPEECH_RATE,
  GOOGLE_VOICE,
  AUTO_VOICE,
  NATURAL_VOICE_NAMES,
  SLOW_REPEAT_WINDOW_MS,
  VOICE_LOAD_TIMEOUT_MS,
  SPEECH_FALLBACK_TIMEOUT_MS
} from '../constants/app-constants';
import { TTS_MESSAGES, SpeechStatus } from './tts-messages';
import { getSpeechSpeed, getVoice } from '../shared/utils';
import { cachedSetting } from '../shared/settings-cache';

const readSpeechSpeed = cachedSetting('speechSpeed', getSpeechSpeed);
const readVoice = cachedSetting('voice', getVoice);

interface SpeakCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}

/**
 * State management for speech playback
 */
class SpeechService {
  // Bumped on every speak/stop so a superseded playback can tell it is stale
  private playToken = 0;
  // Google-Translate-style repeat: playing the same text again soon after plays it slowly
  private lastText = '';
  private lastWasSlow = false;
  private lastSpokenAt = 0;
  // Whether the background can play Google's voice; null until it answers. False in Safari
  private googleSupported: boolean | null = null;

  // Shared by every caller, so a browser that never reports voices (common on Linux) costs the timeout once
  private voicesLoaded: Promise<void> | null = null;

  /**
   * Wait for browser voices to load, with a timeout (needed only by browser voices, so loaded on first use)
   */
  private ensureVoicesLoaded(): Promise<void> {
    this.voicesLoaded ??= new Promise((resolve) => {
      if (!('speechSynthesis' in window) || speechSynthesis.getVoices().length > 0) {
        resolve();
        return;
      }

      const handler = () => {
        if (speechSynthesis.getVoices().length > 0) {
          speechSynthesis.removeEventListener('voiceschanged', handler);
          resolve();
        }
      };

      speechSynthesis.addEventListener('voiceschanged', handler);

      setTimeout(() => {
        speechSynthesis.removeEventListener('voiceschanged', handler);
        resolve();
      }, VOICE_LOAD_TIMEOUT_MS);
    });
    return this.voicesLoaded;
  }

  /**
   * Get the preferred browser voice for the fallback
   */
  private getPreferredVoice(): SpeechSynthesisVoice | null {
    const voices = speechSynthesis.getVoices();
    return voices.find(voice => voice.lang === PREFERRED_VOICE_LANG) || null;
  }

  /**
   * The browser's English voices, for the voice picker
   */
  async getEnglishVoices(): Promise<SpeechSynthesisVoice[]> {
    if (!('speechSynthesis' in window)) return [];
    await this.ensureVoicesLoaded();
    return speechSynthesis.getVoices().filter(voice => voice.lang.toLowerCase().startsWith('en'));
  }

  /**
   * The browser voice Automatic plays here, or null when it plays Google's
   */
  async getAutoVoice(): Promise<SpeechSynthesisVoice | null> {
    if (!('speechSynthesis' in window)) return null;
    await this.ensureVoicesLoaded();
    return this.findNaturalVoice(speechSynthesis.getVoices());
  }

  /**
   * The browser voice chosen in settings
   * @returns null for Google's voice, or when the chosen voice isn't on this device
   */
  private async getChosenVoice(voiceId: string): Promise<SpeechSynthesisVoice | null> {
    if (voiceId === GOOGLE_VOICE || !('speechSynthesis' in window)) return null;
    // warmUp() starts loading voices when the popup opens, so by the time play is pressed this rarely waits
    await this.ensureVoicesLoaded();
    const voices = speechSynthesis.getVoices();
    if (voiceId === AUTO_VOICE) return this.findNaturalVoice(voices);
    return voices.find(voice => voice.voiceURI === voiceId) || null;
  }

  /**
   * The best installed Microsoft natural en-US voice, or null outside Edge
   */
  private findNaturalVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    for (const name of NATURAL_VOICE_NAMES) {
      const voice = voices.find(v =>
        v.lang === PREFERRED_VOICE_LANG && v.name.startsWith(`Microsoft ${name} Online (Natural)`)
      );
      if (voice) return voice;
    }
    return null;
  }

  /**
   * Decide the speed: a repeat of the same text within the window alternates normal → slow → normal
   */
  private nextIsSlow(text: string): boolean {
    const now = Date.now();
    const isRepeat = text === this.lastText && now - this.lastSpokenAt < SLOW_REPEAT_WINDOW_MS;
    const slow = isRepeat && !this.lastWasSlow;

    this.lastText = text;
    this.lastWasSlow = slow;
    this.lastSpokenAt = now;
    return slow;
  }

  /**
   * Get ready to speak when a popup opens: load browser voices and, for Google's voice, start the
   * offscreen document. Nothing is sent to Google until play is pressed
   */
  warmUp(): void {
    if (this.googleSupported === null) {
      chrome.runtime.sendMessage({ action: TTS_MESSAGES.SUPPORT })
        .then(response => { this.googleSupported = response?.google !== false; })
        .catch(() => {});
    }

    readVoice()
      .then(voiceId => this.getChosenVoice(voiceId))
      .then(voice => {
        // A browser voice needs no offscreen document, and Safari can't make one
        if (voice || this.googleSupported === false) return;
        return chrome.runtime.sendMessage({ action: TTS_MESSAGES.PRELOAD });
      })
      // Extension context invalidated (extension reloaded); playing will report it
      .catch(() => {});
  }

  /**
   * Speak the given text; callbacks fire exactly once each, also when replaced or stopped
   */
  speak(text: string, callbacks?: SpeakCallbacks): void {
    // No stop message: the offscreen document replaces its audio on play, and a separate
    // stop could reach it after this play and cut it off
    this.cancelLocal();
    const token = this.playToken;
    const slow = this.nextIsSlow(text);
    if (this.googleSupported === false) this.unlockBrowserSpeech();

    callbacks?.onStart?.();

    const finish = (failed: boolean) => {
      if (failed) {
        callbacks?.onError?.();
      } else {
        callbacks?.onEnd?.();
      }
    };

    const isCurrent = () => token === this.playToken;
    this.play(text, slow, isCurrent).then(ok => finish(!ok));
  }

  /**
   * Play with the chosen voice: a browser voice, or Google's with the browser's as fallback
   * @returns false when playback failed
   */
  private async play(text: string, slow: boolean, isCurrent: () => boolean): Promise<boolean> {
    const [speed, voiceId] = await Promise.all([readSpeechSpeed(), readVoice()]);
    const chosenVoice = await this.getChosenVoice(voiceId);
    // Replaced or stopped while reading settings: not a failure
    if (!isCurrent()) return true;

    // A chosen voice that is no longer installed falls through to Google
    if (chosenVoice) {
      return this.speakWithBrowser(text, slow, speed, chosenVoice, isCurrent);
    }

    if (this.googleSupported === false) {
      return this.speakWithBrowser(text, slow, speed, null, isCurrent);
    }

    const status = await this.speakWithGoogle(text, slow, speed);
    // Fall back only if this playback is still the current one
    if (status === 'failed' && isCurrent()) {
      return this.speakWithBrowser(text, slow, speed, null, isCurrent);
    }
    return true;
  }

  /**
   * Ask the background to play Google's voice; resolves when playback is over
   */
  private async speakWithGoogle(text: string, slow: boolean, speed: number): Promise<SpeechStatus> {
    try {
      const response = await chrome.runtime.sendMessage({ action: TTS_MESSAGES.SPEAK, text, slow, speed });
      return response?.status ?? 'failed';
    } catch {
      return 'failed';
    }
  }

  /**
   * Speak with the browser's own voices
   * @param voice The voice to use, or null for the preferred en-US voice
   * @param isCurrent Whether this playback is still wanted once the voices have loaded
   * @returns false when speech synthesis is unavailable or errors
   */
  private async speakWithBrowser(
    text: string,
    slow: boolean,
    speed: number,
    voice: SpeechSynthesisVoice | null,
    isCurrent: () => boolean
  ): Promise<boolean> {
    if (!('speechSynthesis' in window)) return false;
    await this.ensureVoicesLoaded();
    // Replaced or stopped while waiting: not a failure
    if (!isCurrent()) return true;

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      voice ??= this.getPreferredVoice();
      if (voice) {
        utterance.voice = voice;
      }
      utterance.lang = voice?.lang ?? PREFERRED_VOICE_LANG;
      utterance.rate = slow ? speed * SLOW_SPEECH_RATE : speed;

      utterance.onend = () => resolve(true);
      // Being cancelled by stop() is not a failure
      utterance.onerror = (event) => resolve(event.error === 'interrupted' || event.error === 'canceled');

      // Fallback timeout for unreliable onend event
      setTimeout(() => resolve(true), SPEECH_FALLBACK_TIMEOUT_MS);

      speechSynthesis.speak(utterance);
    });
  }

  /**
   * Speak a silent utterance while still inside the tap that pressed play: Safari on iPad and iPhone
   * only lets speech start from a user gesture, and the real utterance starts after awaiting settings
   */
  private unlockBrowserSpeech(): void {
    if (!('speechSynthesis' in window)) return;
    const silent = new SpeechSynthesisUtterance(' ');
    silent.volume = 0;
    speechSynthesis.speak(silent);
  }

  /**
   * Invalidate the current playback and silence the browser voice
   */
  private cancelLocal(): void {
    this.playToken++;

    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
  }

  /**
   * Stop any current speech playback, Google or browser
   */
  stop(): void {
    this.cancelLocal();

    try {
      chrome.runtime.sendMessage({ action: TTS_MESSAGES.STOP }).catch(() => {});
    } catch {
      // Extension context invalidated (extension reloaded); nothing to stop
    }
  }
}

// Export singleton instance
export const speechService = new SpeechService();
