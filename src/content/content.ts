/**
 * Main content script - orchestrates Sayly functionality
 */

import { createTrigger } from '../ui/popup-builder';
import { openTextPopup, readPopupLook } from '../ui/text-popup';
import { popupManager } from '../ui/popup-manager';
import {
  getSelectedText,
  getSelectionPosition,
  isSelectionInsideElement,
  isSelectionInEditableField
} from '../ui/selection-helper';
import {
  normalizeHostname,
  getDisabledSites,
  isSiteEnabled,
  getPopupMode
} from '../shared/utils';
import { cachedSetting } from '../shared/settings-cache';
import { startYouTubeFeatures, stopYouTubeFeatures } from '../youtube/youtube-features';
import {
  SELECTION_DELAY_MS,
  TOUCH_SELECTION_DELAY_MS,
  TOUCH_MENU_CLEARANCE_PX,
  CLICK_MAX_MOVE_PX,
  MESSAGE_ACTIONS,
  POPUP_MODES,
  DARK_THEME_CSS_CLASS
} from '../constants/app-constants';

/**
 * Extension state
 */
let isActive = false;
let mouseupHandler: ((event: MouseEvent) => void) | null = null;
let pointerdownHandler: ((event: PointerEvent) => void) | null = null;
let selectionchangeHandler: (() => void) | null = null;
// Where the current press started, to tell a drag from a click
let pressX = 0;
let pressY = 0;
// Whether the last press was a finger, so selection changes are read (a mouse is read on mouseup)
let lastPressWasTouch = false;
let touchSelectionTimer: ReturnType<typeof setTimeout> | undefined;
// The text the last touch selection opened a popup for, so the selection settling doesn't reopen it
let touchSelectionText = '';

const readPopupMode = cachedSetting('popupMode', getPopupMode);

/**
 * Get current normalized hostname
 */
function getCurrentHostname(): string {
  return normalizeHostname(window.location.hostname);
}

/**
 * Whether this script still belongs to the loaded extension (false once it is reloaded or removed)
 */
function isExtensionContextValid(): boolean {
  return Boolean(chrome.runtime?.id);
}

/**
 * Check if extension is enabled on current site
 */
async function isExtensionEnabled(): Promise<boolean> {
  return isSiteEnabled(getCurrentHostname(), await getDisabledSites());
}

/**
 * React to a new selection as the popup setting says: open the popup, show the icon, or do nothing.
 * A selection inside a text field or editor shows the icon even in popup mode.
 * @param touch Whether a finger made the selection: the icon is shown instead of the popup, so a
 * selection made to copy isn't covered, and it goes below the system's edit menu
 */
async function handleSelection(touch = false): Promise<void> {
  const selectedText = getSelectedText();
  if (!selectedText) return;

  // Don't react to selecting inside current popup
  const currentPopup = popupManager.getCurrentPopup();
  if (currentPopup && isSelectionInsideElement(currentPopup)) {
    return;
  }

  // Get selection position
  const position = getSelectionPosition();
  if (!position) return;
  if (touch) position.y += TOUCH_MENU_CLEARANCE_PX;

  const mode = await readPopupMode();
  if (mode === POPUP_MODES.NONE) return;

  const look = await readPopupLook();

  // A selection made while typing is usually for editing, so it gets the icon, not the popup
  if (mode === POPUP_MODES.ICON || touch || isSelectionInEditableField()) {
    // Text and position are kept: clicking the icon may change the page's selection
    // A finger selection already has the system's Copy, so the bar is just the icon
    const showCopy = look.showCopy && !touch;
    const bar = createTrigger(selectedText, () => openTextPopup(selectedText, position, look), showCopy);
    bar.classList.toggle(DARK_THEME_CSS_CLASS, look.dark);
    popupManager.showPopup(bar, position);
    return;
  }

  openTextPopup(selectedText, position, look);
}

/**
 * Whether a press ending in this mouseup could have selected text: a drag, a double/triple click
 * or a shift-click. A plain click selects nothing, but some pages don't clear the old selection
 * on click, so reading it then would reopen the popup that the click just dismissed.
 */
function isSelectionGesture(event: MouseEvent): boolean {
  const moved = Math.hypot(event.clientX - pressX, event.clientY - pressY) >= CLICK_MAX_MOVE_PX;
  return moved || event.detail >= 2 || event.shiftKey;
}

/**
 * After a touch selection rests, react to it as mouseup does for a mouse
 */
function handleSelectionChange(): void {
  if (!lastPressWasTouch) return;

  clearTimeout(touchSelectionTimer);
  touchSelectionTimer = setTimeout(() => {
    const text = getSelectedText();
    if (!text || (text === touchSelectionText && popupManager.hasPopup())) return;
    touchSelectionText = text;
    handleSelection(true);
  }, TOUCH_SELECTION_DELAY_MS);
}

/**
 * Handle click outside popup to dismiss
 */
function handleDocumentClick(event: PointerEvent): void {
  pressX = event.clientX;
  pressY = event.clientY;
  lastPressWasTouch = event.pointerType === 'touch';

  const currentPopup = popupManager.getCurrentPopup();
  if (!currentPopup) return;

  const target = event.target as HTMLElement;
  if (!currentPopup.contains(target)) {
    popupManager.removePopup();
  }
}

/**
 * Handle Escape to dismiss
 */
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && popupManager.hasPopup()) {
    popupManager.removePopup();
  }
}

/**
 * Cleanup function to remove all event listeners and UI
 */
function cleanup(): void {
  popupManager.removePopup();

  if (mouseupHandler) {
    document.removeEventListener('mouseup', mouseupHandler);
    mouseupHandler = null;
  }

  if (pointerdownHandler) {
    document.removeEventListener('pointerdown', pointerdownHandler);
    pointerdownHandler = null;
  }

  if (selectionchangeHandler) {
    document.removeEventListener('selectionchange', selectionchangeHandler);
    selectionchangeHandler = null;
  }
  clearTimeout(touchSelectionTimer);

  document.removeEventListener('keydown', handleKeydown);
  stopYouTubeFeatures();

  isActive = false;
}

/**
 * Initialize the extension
 */
function init(): void {
  if (isActive) return;
  isActive = true;

  // Create event handlers
  mouseupHandler = (event: MouseEvent) => {
    // After the extension reloads, this script is orphaned while a fresh copy runs; step aside
    if (!isExtensionContextValid()) {
      cleanup();
      return;
    }

    const currentPopup = popupManager.getCurrentPopup();
    if (currentPopup && currentPopup.contains(event.target as HTMLElement)) {
      return; // Clicked inside popup
    }

    if (!isSelectionGesture(event)) return;

    setTimeout(() => handleSelection(), SELECTION_DELAY_MS);
  };

  // Pointer events, not mouse events: Safari on iPad sends no mousedown for a tap on plain text
  pointerdownHandler = handleDocumentClick;
  selectionchangeHandler = handleSelectionChange;

  // Register event listeners
  document.addEventListener('mouseup', mouseupHandler);
  document.addEventListener('pointerdown', pointerdownHandler);
  document.addEventListener('selectionchange', selectionchangeHandler);
  document.addEventListener('keydown', handleKeydown);
  startYouTubeFeatures();
}

/**
 * Start extension if enabled on current site
 */
async function start() {
  if (await isExtensionEnabled()) {
    init();
  }
}

/**
 * Handle messages from the extension popup to enable/disable immediately
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.hostname !== getCurrentHostname()) return false;

  if (message.action === MESSAGE_ACTIONS.DISABLE) {
    cleanup();
    sendResponse({ success: true });
  } else if (message.action === MESSAGE_ACTIONS.ENABLE) {
    init();
    sendResponse({ success: true });
  }

  return false; // Any response was sent synchronously
});

// Start the extension
start();
