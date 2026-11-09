/**
 * Background service worker - performs cross-origin translation and IPA requests for content scripts
 * and plays Google TTS audio through the offscreen document
 */

import { translate } from '../api/translate-api';
import { lookupWordIpa } from '../api/dictionary-api';
import { buildGoogleTtsUrls } from '../api/google-tts';
import { getTtsAudio, getCachedTtsAudio } from '../speech/tts-audio-cache';
import { OFFSCREEN_DOCUMENT_PATH, MESSAGE_ACTIONS } from '../constants/app-constants';
import { LOG_PREFIX } from '../constants/messages';
import { OFFSCREEN_TARGET, TTS_MESSAGES, SpeechStatus } from '../speech/tts-messages';

// Shared while a createDocument call is in flight; creating a second document throws
let creatingOffscreen: Promise<void> | null = null;
// Bumped on every speak and stop, so a playback still downloading can tell it was replaced or stopped
let speechToken = 0;
// Safari has no offscreen documents, so it can't play Google's voice; content scripts use the browser's
const offscreenSupported = Boolean(chrome.offscreen);

/**
 * Create the offscreen audio document unless it already exists
 */
async function ensureOffscreenDocument(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;

  creatingOffscreen ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: 'Play pronunciation audio'
    })
    .finally(() => {
      creatingOffscreen = null;
    });

  await creatingOffscreen;
}

/**
 * What to play for one chunk: the cached audio, or else Google's URL, which starts playing while it
 * downloads; the cache downloads a copy of it for next time
 */
async function getCachedSource(url: string): Promise<string> {
  const cached = await getCachedTtsAudio(url);
  if (cached) return cached;
  getTtsAudio(url).catch(() => {});
  return url;
}

/**
 * Speak text with Google's voice; resolves when playback ends, is stopped, or fails
 */
async function speakWithGoogle(text: string, slow: boolean, speed: number): Promise<SpeechStatus> {
  const token = ++speechToken;
  const urls = buildGoogleTtsUrls(text, slow);
  // Only text that fits in one chunk is cached: replays are of a word or a phrase, and caching long
  // text would download every chunk again at once
  const cached = urls.length === 1;
  const [sources] = await Promise.all([
    cached ? getCachedSource(urls[0]).then(source => [source]) : urls,
    ensureOffscreenDocument()
  ]);
  if (token !== speechToken) return 'stopped';

  // Playing the same text again soon after is the slow repeat: get it ready while this one plays
  if (cached && !slow) getTtsAudio(buildGoogleTtsUrls(text, true)[0]).catch(() => {});

  const response = await chrome.runtime.sendMessage({
    target: OFFSCREEN_TARGET,
    action: TTS_MESSAGES.OFFSCREEN_PLAY,
    urls: sources,
    speed
  });
  return response?.status ?? 'failed';
}

/**
 * Stop Google TTS playback, if the offscreen document is running
 */
async function stopGoogleSpeech(): Promise<void> {
  speechToken++;
  if (!offscreenSupported || !(await chrome.offscreen.hasDocument())) return;
  await chrome.runtime.sendMessage({ target: OFFSCREEN_TARGET, action: TTS_MESSAGES.OFFSCREEN_STOP });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Addressed to the offscreen document, not to us
  if (message.target === OFFSCREEN_TARGET) return false;

  if (message.action === MESSAGE_ACTIONS.OPEN_OPTIONS) {
    chrome.runtime.openOptionsPage();
    return false;
  }

  if (message.action === MESSAGE_ACTIONS.LOOKUP_IPA) {
    // lookupWordIpa reads failures as "no IPA", so it never rejects
    lookupWordIpa(message.word).then(ipa => sendResponse({ ipa }));
    return true;
  }

  if (message.action === MESSAGE_ACTIONS.TRANSLATE) {
    translate(message.text, message.to)
      .then(result => sendResponse({ result }))
      .catch(error => {
        console.error(`${LOG_PREFIX} Translation failed:`, error);
        sendResponse({ error: error instanceof Error ? error.message : String(error) });
      });
    return true; // Keep message channel open for the async response
  }

  if (message.action === TTS_MESSAGES.SPEAK) {
    if (!offscreenSupported) {
      sendResponse({ status: 'failed' });
      return false;
    }
    speakWithGoogle(message.text, message.slow, message.speed ?? 1)
      .then(status => sendResponse({ status }))
      .catch(error => {
        console.error(`${LOG_PREFIX} Google TTS failed:`, error);
        sendResponse({ status: 'failed' });
      });
    return true;
  }

  // Only starts the offscreen document: the text is sent to Google when play is pressed, not before
  if (message.action === TTS_MESSAGES.PRELOAD) {
    if (!offscreenSupported) {
      sendResponse({ googleUnavailable: true });
      return false;
    }
    ensureOffscreenDocument()
      .catch(error => console.error(`${LOG_PREFIX} Preloading Google TTS failed:`, error))
      .finally(() => sendResponse({}));
    return true;
  }

  if (message.action === TTS_MESSAGES.SUPPORT) {
    sendResponse({ google: offscreenSupported });
    return false;
  }

  if (message.action === TTS_MESSAGES.STOP) {
    stopGoogleSpeech()
      .catch(error => console.error(`${LOG_PREFIX} Stopping Google TTS failed:`, error))
      .finally(() => sendResponse({}));
    return true;
  }

  return false;
});
