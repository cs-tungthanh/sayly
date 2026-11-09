/**
 * Messages between the content script, background worker and offscreen document for Google TTS
 */

/** How a Google TTS playback ended */
export type SpeechStatus = 'ended' | 'stopped' | 'failed';

export const TTS_MESSAGES = {
  // Content script → background
  SPEAK: 'tts-speak',
  STOP: 'tts-stop',
  PRELOAD: 'tts-preload',
  // Whether Google's voice can play here (it can't in Safari, which has no offscreen documents)
  SUPPORT: 'tts-support',
  // Background → offscreen document
  OFFSCREEN_PLAY: 'tts-offscreen-play',
  OFFSCREEN_STOP: 'tts-offscreen-stop'
} as const;

// Runtime messages reach every extension page, so offscreen ones are tagged with a target
export const OFFSCREEN_TARGET = 'offscreen';
