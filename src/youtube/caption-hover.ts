/**
 * Hover a word in a YouTube video's captions (the player's or Sayly's subtitles) to pause the video and open the word's popup, as if
 * it were selected; moving away closes the popup and plays the video again.
 *
 * The player rebuilds the caption elements as lines change, so words aren't wrapped in elements of
 * Sayly's own: the word under the pointer is found by measuring the caption text, and marked with
 * the CSS Custom Highlight API, which styles a range without touching the page's elements.
 */

import { liveSetting } from '../shared/settings-cache';
import { getPopupMode, getYouTubeHoverWords } from '../shared/utils';
import { popupManager } from '../ui/popup-manager';
import { openTextPopup, readPopupLook } from '../ui/text-popup';
import {
  CAPTION_HOVER_OPEN_DELAY_MS,
  CAPTION_HOVER_CLOSE_DELAY_MS,
  DEFAULT_POPUP_MODE,
  POPUP_MODES
} from '../constants/app-constants';
import { getWatchVideo, isAdShowing, isWatchPage } from './youtube-page';
import type { YouTubeFeature } from './youtube-features';

// The player's caption text, and the lines of Sayly's own subtitles (subtitles.ts)
const CAPTION_TEXT = '.ytp-caption-segment, .elang-yt-subtitle-line';
// Styled in popup.css with ::highlight()
const HIGHLIGHT_NAME = 'elang-caption-word';
// A word in any script, allowing inner apostrophes and hyphens: "it's", "well-known"
const WORD_PATTERN = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu;

const hoverEnabled = liveSetting('youtubeHoverWords', getYouTubeHoverWords, true);
// "Don't display" turns hover off too; "Display icon" doesn't apply here, hovering opens the popup itself
const popupMode = liveSetting('popupMode', getPopupMode, DEFAULT_POPUP_MODE);

interface CaptionWord {
  text: string;
  range: Range;
}

// The popup this feature opened and the word it is for
let popup: HTMLElement | null = null;
let shownWord: CaptionWord | null = null;
// The video hovering paused, to play again when the popup closes
let pausedVideo: HTMLVideoElement | null = null;

let pendingWord: CaptionWord | null = null;
let openTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
// Bumped on each open, so a popup whose settings arrive late isn't shown over a newer one
let openCount = 0;

let pointer: { x: number; y: number; target: EventTarget | null } | null = null;
let frameQueued = false;

/**
 * The caption word at a point in the viewport, if any
 */
function findWordAt(x: number, y: number): CaptionWord | null {
  // Other player layers can sit over the captions, so look at everything under the point
  const segment = document.elementsFromPoint(x, y).find(element => element.matches(CAPTION_TEXT));
  if (!segment) return null;

  const walker = document.createTreeWalker(segment, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const match of (node.textContent ?? '').matchAll(WORD_PATTERN)) {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const hit = Array.from(range.getClientRects()).some(rect =>
        x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
      );
      if (hit) return { text: match[0], range };
    }
  }
  return null;
}

function isSameWord(a: CaptionWord | null, b: CaptionWord | null): boolean {
  return Boolean(a && b)
    && a!.range.startContainer === b!.range.startContainer
    && a!.range.startOffset === b!.range.startOffset;
}

function setHighlight(range: Range | null): void {
  // Missing in older browsers; the popup still works without the mark
  if (typeof CSS === 'undefined' || !CSS.highlights) return;
  // The registry is map-like, but this TypeScript version's types leave out the map methods
  const registry = CSS.highlights as unknown as Map<string, Highlight>;
  if (range) {
    registry.set(HIGHLIGHT_NAME, new Highlight(range));
  } else {
    registry.delete(HIGHLIGHT_NAME);
  }
}

/**
 * Whether a popup opened some other way (a selection's) is shown; hovering leaves it alone
 */
function isOtherPopupShown(): boolean {
  const current = popupManager.getCurrentPopup();
  return current !== null && current !== popup;
}

function cancelOpen(): void {
  if (openTimer) clearTimeout(openTimer);
  openTimer = null;
  pendingWord = null;
}

function cancelClose(): void {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = null;
}

/**
 * Open a word's popup once the pointer has rested on it, so passing over the captions doesn't pause the video
 */
function scheduleOpen(word: CaptionWord): void {
  if (isSameWord(word, pendingWord)) return;
  cancelOpen();
  pendingWord = word;
  openTimer = setTimeout(() => {
    openTimer = null;
    pendingWord = null;
    // The captions may have moved on while the video played; open whatever is under the pointer now
    if (isOtherPopupShown()) return;
    const current = pointer && findWordAt(pointer.x, pointer.y);
    if (current) showWord(current);
  }, CAPTION_HOVER_OPEN_DELAY_MS);
}

/**
 * Close the popup a moment after the pointer leaves the word and popup, so it can cross the gap
 */
function scheduleClose(): void {
  if (!popup || closeTimer) return;
  closeTimer = setTimeout(() => {
    closeTimer = null;
    if (popup && popupManager.getCurrentPopup() === popup) popupManager.removePopup();
  }, CAPTION_HOVER_CLOSE_DELAY_MS);
}

function pauseVideo(): void {
  const video = getWatchVideo();
  if (!video || video.paused || pausedVideo) return;
  video.pause();
  pausedVideo = video;
  // Played by the user while the popup is open: it's theirs again, so closing leaves it alone
  video.addEventListener('play', () => { if (pausedVideo === video) pausedVideo = null; }, { once: true });
}

function resumeVideo(): void {
  const video = pausedVideo;
  pausedVideo = null;
  // Rejected when the browser refuses to play; the user can press play
  if (video?.isConnected && video.paused) video.play().catch(() => {});
}

async function showWord(word: CaptionWord): Promise<void> {
  const count = ++openCount;
  const look = await readPopupLook();
  // Check again after the wait: the line may have changed, the pointer left, or a selection's popup opened
  if (count !== openCount || !word.range.startContainer.isConnected || !pointer || isOtherPopupShown()) return;

  const rect = word.range.getBoundingClientRect();
  const position = { x: rect.left + rect.width / 2, y: rect.bottom + window.scrollY };

  // Pause only once the popup is sure to open, so nothing is left paused without one
  pauseVideo();
  // Let go of the previous word's popup first: its removal is then ignored, keeping the video paused
  popup = null;
  cancelClose();
  const element: HTMLElement = openTextPopup(word.text, position, look, replaced => handlePopupRemoved(element, replaced));

  popup = element;
  shownWord = word;
  setHighlight(word.range);
}

function handlePopupRemoved(element: HTMLElement, replaced: boolean): void {
  if (element !== popup) return;
  popup = null;
  shownWord = null;
  setHighlight(null);
  cancelClose();

  // Another popup (a selection's) took over; leave the video paused for it
  if (replaced) {
    pausedVideo = null;
    return;
  }
  resumeVideo();
}

/**
 * React to where the pointer is now: over a word, over the open popup, or elsewhere
 */
function update(): void {
  frameQueued = false;
  if (!pointer) return;

  if (!hoverEnabled() || popupMode() === POPUP_MODES.NONE || !isWatchPage() || isAdShowing()) {
    cancelOpen();
    scheduleClose();
    return;
  }

  if (popup && pointer.target instanceof Node && popup.contains(pointer.target)) {
    cancelOpen();
    cancelClose();
    return;
  }

  // Only look for words over the player, to keep pointer moves elsewhere cheap
  const overPlayer = pointer.target instanceof Element && pointer.target.closest('#movie_player');
  const word = overPlayer ? findWordAt(pointer.x, pointer.y) : null;

  if (!word) {
    cancelOpen();
    scheduleClose();
    return;
  }

  if (isSameWord(word, shownWord)) {
    cancelOpen();
    cancelClose();
    return;
  }

  if (isOtherPopupShown()) return;

  // Crossing other words on the way to the popup shouldn't swap it, so a new word waits like the first
  cancelClose();
  scheduleOpen(word);
}

function handleMouseMove(event: MouseEvent): void {
  // After the extension reloads, this script is orphaned while a fresh copy runs; step aside
  if (!chrome.runtime?.id) {
    captionHover.stop();
    return;
  }

  pointer = { x: event.clientX, y: event.clientY, target: event.target };
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(update);
}

function handlePointerLeavePage(): void {
  pointer = null;
  cancelOpen();
  scheduleClose();
}

export const captionHover: YouTubeFeature = {
  start() {
    // Capture on window, so the player can't keep the moves from Sayly
    window.addEventListener('mousemove', handleMouseMove, { capture: true, passive: true });
    document.documentElement.addEventListener('mouseleave', handlePointerLeavePage);
  },
  stop() {
    window.removeEventListener('mousemove', handleMouseMove, { capture: true });
    document.documentElement.removeEventListener('mouseleave', handlePointerLeavePage);
    cancelOpen();
    cancelClose();
    if (popup && popupManager.getCurrentPopup() === popup) popupManager.removePopup();
    setHighlight(null);
  }
};
