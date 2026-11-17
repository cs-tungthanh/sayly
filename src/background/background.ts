/**
 * Background service worker - performs cross-origin translation, IPA and definition requests for content scripts
 * and plays Google TTS audio through the offscreen document
 */

import { translate } from '../api/translate-api';
import { translateWithGemini } from '../api/gemini-api';
import { lookupWordIpa, lookupEnglishDefinitions } from '../api/dictionary-api';
import { buildGoogleTtsUrls } from '../api/google-tts';
import { getTtsAudio, getCachedTtsAudio } from '../speech/tts-audio-cache';
import {
  OFFSCREEN_DOCUMENT_PATH,
  MESSAGE_ACTIONS,
  CONTEXT_MENU_PRONOUNCE_ID,
  SIDE_PANEL_TEXT_KEY
} from '../constants/app-constants';
import { LOG_PREFIX, UI_LABELS } from '../constants/messages';
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

// The right-click menu shows the selection in the side panel. It is the way in where content scripts
// can't run, such as the browser's PDF viewer. Safari has no side panel, so it gets no menu item.
if (chrome.sidePanel && chrome.contextMenus) {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_PRONOUNCE_ID,
      title: UI_LABELS.CONTEXT_MENU_PRONOUNCE,
      contexts: ['selection']
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_PRONOUNCE_ID) return;
    console.info(`${LOG_PREFIX} Menu clicked`, { tabId: tab?.id, windowId: tab?.windowId, hasText: Boolean(info.selectionText) });
    const text = info.selectionText?.trim();
    if (!text) return;

    // The panel reads the text when it opens and follows later changes; `at` makes the same text
    // picked twice a change too
    chrome.storage.session.set({ [SIDE_PANEL_TEXT_KEY]: { text, at: Date.now() } });
    openSidePanel(tab);
  });
}

/**
 * Open the side panel; where it can't open (no side panel API, or the browser refuses), show the
 * same page in a small window at the right of the screen instead
 */
function openSidePanel(tab: chrome.tabs.Tab | undefined): void {
  // A click in the PDF viewer can come without its tab, so fall back to the current window.
  // open() only works during the click's user gesture, so it must be called before any await.
  const windowId = tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
  let opening: Promise<void>;
  try {
    opening = chrome.sidePanel.open({ windowId });
  } catch (error) {
    opening = Promise.reject(error);
  }
  opening.then(() => console.info(`${LOG_PREFIX} Side panel opened`, { windowId })).catch(error => {
    console.warn(`${LOG_PREFIX} Opening the side panel failed, opening a window instead:`, error);
    openPanelWindow(tab?.windowId);
  });
}

// The fallback window, reused so repeated clicks don't stack windows
let panelWindowId: number | null = null;

async function openPanelWindow(nearWindowId: number | undefined): Promise<void> {
  if (panelWindowId !== null) {
    try {
      await chrome.windows.update(panelWindowId, { focused: true });
      return;
    } catch {
      panelWindowId = null; // It was closed
    }
  }

  const width = 380;
  const near = await chrome.windows
    .get(nearWindowId ?? chrome.windows.WINDOW_ID_CURRENT)
    .catch(() => null);
  const left = near?.left !== undefined && near.width !== undefined ? near.left + near.width - width : undefined;

  const created = await chrome.windows.create({
    url: chrome.runtime.getURL('sidepanel.html'),
    type: 'popup',
    width,
    height: near?.height ?? 640,
    left,
    top: near?.top
  });
  panelWindowId = created?.id ?? null;
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

  if (message.action === MESSAGE_ACTIONS.LOOKUP_DEFINITIONS) {
    // Failures read as "no definitions", so it never rejects
    lookupEnglishDefinitions(message.word).then(definitions => sendResponse({ definitions }));
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

  if (message.action === MESSAGE_ACTIONS.TRANSLATE_GEMINI) {
    translateWithGemini(message.text)
      .then(text => sendResponse({ text }))
      .catch(error => {
        console.error(`${LOG_PREFIX} Gemini translation failed:`, error);
        sendResponse({ error: error instanceof Error ? error.message : String(error) });
      });
    return true;
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
