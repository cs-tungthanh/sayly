/**
 * Sayly's own subtitles on a YouTube video: whole sentences instead of the player's short caption
 * lines, held until the next sentence starts, with the last few sentences kept on screen and the
 * word being spoken marked.
 *
 * They show while CC is on and the video's sentences can be read (see caption-tracker.ts), and
 * hide the player's captions meanwhile; otherwise the player's captions show as usual.
 */

import { liveSetting } from '../shared/settings-cache';
import { getYouTubeSubtitleLines, getYouTubeSubtitleSize, getYouTubeSubtitles } from '../shared/utils';
import {
  DEFAULT_YOUTUBE_SUBTITLE_LINES,
  DEFAULT_YOUTUBE_SUBTITLE_SIZE,
  SUBTITLE_HOLD_MS
} from '../constants/app-constants';
import { getCurrentSentences } from './caption-tracker';
import type { CaptionSentence } from './caption-sentences';
import { getWatchVideo, getWatchVideoId, isAdShowing, isCaptionsOn, isWatchPage } from './youtube-page';
import type { YouTubeFeature } from './youtube-features';

const OVERLAY_CLASS = 'elang-yt-subtitles';
// On the player while Sayly's subtitles show, so the stylesheet hides the player's captions
const ACTIVE_CLASS = 'elang-yt-subtitles-on';
const LINE_CLASS = 'elang-yt-subtitle-line';
const PAST_LINE_CLASS = 'elang-yt-subtitle-line-past';
const WORD_CLASS = 'elang-yt-subtitle-word';
const SPOKEN_CLASS = 'elang-yt-subtitle-word-now';

// While the video is paused, check this often for changes (CC turned on, captions arriving, a seek)
const IDLE_POLL_MS = 250;
// How often to ask for the video's sentences; a cached answer is cheap, and a new caption language shows up
const SENTENCES_REFRESH_MS = 1000;

const enabled = liveSetting('youtubeSubtitles', getYouTubeSubtitles, true);
const lineCount = liveSetting('youtubeSubtitleLines', getYouTubeSubtitleLines, DEFAULT_YOUTUBE_SUBTITLE_LINES);
const fontSizePx = liveSetting('youtubeSubtitleFontSize', getYouTubeSubtitleSize, DEFAULT_YOUTUBE_SUBTITLE_SIZE);

let running = false;
let frame: number | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

let overlay: HTMLElement | null = null;
// Which sentences are on screen, as "first:last" indices, so they're only rebuilt when that changes
let shownKey = '';
// The newest sentence's words on screen, with their timings, for marking the word being spoken
let shownWords: Array<{ element: HTMLElement; startMs: number; endMs: number }> = [];
let spokenWord: HTMLElement | null = null;

let sentences: CaptionSentence[] | null = null;
let sentencesVideoId: string | null = null;
let sentencesAskedAt = -Infinity;
let asking = false;

function refreshSentences(): void {
  if (asking || performance.now() - sentencesAskedAt < SENTENCES_REFRESH_MS) return;
  asking = true;
  const videoId = getWatchVideoId();
  getCurrentSentences()
    .then(result => {
      sentences = result;
      sentencesVideoId = videoId;
    })
    .finally(() => {
      asking = false;
      sentencesAskedAt = performance.now();
    });
}

/**
 * The sentences of the video open now, once they've been read
 */
function currentSentences(): CaptionSentence[] | null {
  return sentences && sentencesVideoId === getWatchVideoId() ? sentences : null;
}

/**
 * Index of the last sentence or word that has started by a time, or -1 before the first
 */
function findStartedIndex(list: ReadonlyArray<{ startMs: number }>, nowMs: number): number {
  let low = 0;
  let high = list.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (list[middle].startMs <= nowMs) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

function getOverlay(player: HTMLElement): HTMLElement {
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
  }
  // The player can be rebuilt, so put the overlay back when it's gone
  if (overlay.parentElement !== player) player.appendChild(overlay);
  return overlay;
}

function clearLines(): void {
  overlay?.replaceChildren();
  shownKey = '';
  shownWords = [];
  spokenWord = null;
}

function hide(): void {
  clearLines();
  overlay?.remove();
  document.getElementById('movie_player')?.classList.remove(ACTIVE_CLASS);
}

function createLine(sentence: CaptionSentence, past: boolean): HTMLElement {
  const line = document.createElement('div');
  line.className = past ? `${LINE_CLASS} ${PAST_LINE_CLASS}` : LINE_CLASS;

  sentence.words.forEach((word, index) => {
    if (index > 0) line.append(' ');
    const element = document.createElement('span');
    element.className = WORD_CLASS;
    element.textContent = word.text;
    line.appendChild(element);
    if (!past) shownWords.push({ element, startMs: word.startMs, endMs: word.endMs });
  });

  return line;
}

/**
 * Mark the word of the newest sentence being spoken now
 */
function markSpokenWord(nowMs: number): void {
  const index = findStartedIndex(shownWords, nowMs);
  // A word stays marked through the pause before the next one; the last one until it ends
  const isLast = index === shownWords.length - 1;
  const word = index >= 0 && (!isLast || nowMs < shownWords[index].endMs) ? shownWords[index].element : null;
  if (word === spokenWord) return;
  spokenWord?.classList.remove(SPOKEN_CLASS);
  word?.classList.add(SPOKEN_CLASS);
  spokenWord = word;
}

/**
 * Show the sentences at the video's current time
 * @returns Whether Sayly's subtitles are in use, i.e. the video has sentences to show
 */
function render(player: HTMLElement, video: HTMLVideoElement): boolean {
  const list = currentSentences();
  player.classList.toggle(ACTIVE_CLASS, list !== null);
  if (!list) {
    hide();
    return false;
  }

  const element = getOverlay(player);
  const fontSize = `${fontSizePx()}px`;
  if (element.style.fontSize !== fontSize) element.style.fontSize = fontSize;

  const nowMs = video.currentTime * 1000;
  const index = findStartedIndex(list, nowMs);
  // Before the first sentence, or long after the last one ended with nothing new yet
  if (index < 0 || nowMs > list[index].endMs + SUBTITLE_HOLD_MS) {
    clearLines();
    return true;
  }

  const first = Math.max(0, index - lineCount() + 1);
  const key = `${first}:${index}`;
  if (key !== shownKey) {
    clearLines();
    shownKey = key;
    element.append(...list.slice(first, index + 1).map((sentence, i, shown) => createLine(sentence, i < shown.length - 1)));
  }

  markSpokenWord(nowMs);
  return true;
}

function tick(): void {
  frame = null;
  timer = null;
  if (!running) return;

  // After the extension reloads, this script is orphaned while a fresh copy runs; step aside
  if (!chrome.runtime?.id) {
    subtitles.stop();
    return;
  }

  const player = document.getElementById('movie_player');
  const video = getWatchVideo();
  let showing = false;
  // An ad plays in the same video element, on its own timeline
  if (player && video && enabled() && isWatchPage() && !isAdShowing() && isCaptionsOn()) {
    refreshSentences();
    showing = render(player, video);
  } else {
    hide();
  }

  // Every frame while subtitles show on a playing video, so the spoken word keeps up; otherwise a slower check
  if (showing && video && !video.paused) {
    frame = requestAnimationFrame(tick);
  } else {
    timer = setTimeout(tick, IDLE_POLL_MS);
  }
}

export const subtitles: YouTubeFeature = {
  start() {
    if (running) return;
    running = true;
    tick();
  },
  stop() {
    running = false;
    if (frame !== null) cancelAnimationFrame(frame);
    if (timer) clearTimeout(timer);
    frame = null;
    timer = null;
    hide();
  }
};
