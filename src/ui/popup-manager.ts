/**
 * Manage popup lifecycle, positioning, and state
 */

import {
  POPUP_CSS_CLASS,
  TRIGGER_CSS_CLASS,
  POPUP_POSITION_OFFSET_PX,
  POPUP_EDGE_MARGIN_PX,
  POPUP_LEAVE_FALLBACK_MS
} from '../constants/app-constants';
import { speechService } from '../speech/speech-service';

/**
 * Told when a shown popup goes away; replaced is true when another popup took its place
 */
export type PopupRemoveListener = (replaced: boolean) => void;

/**
 * Where a popup hangs, in page coordinates: below y (the bottom of the selected text), or, when
 * there is no room below, above top (its top edge), so it never covers the text or the pointer on it
 */
export interface PopupAnchor {
  x: number;
  y: number;
  /** Defaults to y, for anchors that are a point rather than a span of text */
  top?: number;
}

// Events kept from reaching a player under an element, which would pause, seek or leave full screen
const PLAYER_EVENTS = ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'wheel'];

/**
 * Keep clicks and scrolls on an element from reaching a video player beneath it
 */
export function stopPlayerEvents(element: HTMLElement): void {
  PLAYER_EVENTS.forEach(type => element.addEventListener(type, event => event.stopPropagation()));
}

/**
 * Where popups go: the body, or the full-screen element when the body is hidden behind it
 */
function getPopupContainer(): HTMLElement {
  const fullscreen = document.fullscreenElement;
  return fullscreen instanceof HTMLElement && !fullscreen.contains(document.body) ? fullscreen : document.body;
}

/**
 * A popup shown above the selection grows as its translation and definitions arrive; move it up as
 * it grows, so it stays clear of the text, until the user drags or resizes it
 * @param bottom The popup's bottom edge to keep, in its container's coordinates
 * @param minTop How high it may go
 */
function keepBottomPinned(popup: HTMLElement, bottom: number, minTop: number): void {
  const observer = new ResizeObserver(() => {
    if (!popup.isConnected) {
      observer.disconnect();
      return;
    }
    popup.style.top = `${Math.max(bottom - popup.offsetHeight, minTop)}px`;
  });
  observer.observe(popup);

  popup.addEventListener('pointerdown', (event) => {
    const target = event.target as Element | null;
    if (target?.closest('.elang-popup-drag-handle, .elang-popup-resize-grip')) observer.disconnect();
  });
}

/**
 * Fade an element out, then remove it; the timer covers a fade that never reports its end
 */
function fadeOutAndRemove(element: HTMLElement): void {
  element.classList.add('elang-popup-leave');
  const remove = () => element.remove();
  // Animations inside the popup report their end here too; only the popup's own fade counts
  element.addEventListener('animationend', (event) => {
    if (event.target === element) remove();
  });
  setTimeout(remove, POPUP_LEAVE_FALLBACK_MS);
}

/**
 * Popup state manager; the shown element is either the popup or the selection bar that opens it
 */
class PopupManager {
  private currentPopup: HTMLElement | null = null;
  private onRemove: PopupRemoveListener | null = null;

  constructor() {
    // A popup placed for one screen mode would be hidden or clipped in the other, so entering or leaving full screen closes it
    document.addEventListener('fullscreenchange', () => {
      if (this.currentPopup) this.removePopup();
    });
  }

  /**
   * Position popup near selection with smart boundary detection
   * @param position Where the popup hangs: below the selection, or above it when there is no room below
   */
  positionPopup(popup: HTMLElement, position: PopupAnchor): void {
    const container = getPopupContainer();
    // In full screen the popup sits inside the full-screen element, placed against the viewport
    const fixed = container !== document.body;
    const viewTop = fixed ? 0 : window.scrollY;
    const anchorY = position.y - (fixed ? window.scrollY : 0);
    const anchorTop = (position.top ?? position.y) - (fixed ? window.scrollY : 0);

    let left = position.x;
    let top = anchorY + POPUP_POSITION_OFFSET_PX;

    // Temporarily position to measure dimensions
    popup.style.position = fixed ? 'fixed' : '';
    popup.style.left = '0px';
    popup.style.top = '0px';
    container.appendChild(popup);

    if (fixed) stopPlayerEvents(popup);

    const popupRect = popup.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Adjust horizontal position if off-screen
    if (left + popupRect.width > viewportWidth) {
      left = viewportWidth - popupRect.width - POPUP_EDGE_MARGIN_PX;
    }
    if (left < POPUP_EDGE_MARGIN_PX) {
      left = POPUP_EDGE_MARGIN_PX;
    }

    // No room below: show it above the selection's top edge, clear of the text and the pointer on it.
    // When it fits on neither side, take the side with more room and keep it inside the view.
    const viewBottom = viewTop + viewportHeight;
    if (top + popupRect.height > viewBottom) {
      const aboveTop = anchorTop - popupRect.height - POPUP_POSITION_OFFSET_PX;
      const roomAbove = anchorTop - viewTop;
      const roomBelow = viewBottom - anchorY;
      if (aboveTop >= viewTop || roomAbove > roomBelow) {
        top = Math.max(aboveTop, viewTop + POPUP_EDGE_MARGIN_PX);
      }
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    if (top < anchorTop) keepBottomPinned(popup, top + popupRect.height, viewTop + POPUP_EDGE_MARGIN_PX);

    // Grow out of the selection: from its side horizontally, from the edge nearest it vertically
    const above = top < anchorTop;
    const originX = Math.max(0, Math.min(position.x - left, popupRect.width));
    popup.style.setProperty('--elang-origin', `${originX}px ${above ? '100%' : '0'}`);
    popup.classList.toggle('elang-popup-above', above);
    popup.classList.add('elang-popup-enter');
  }

  /**
   * Show a new popup (removes current popup if exists)
   * @param onRemove Called once when this popup goes away
   */
  showPopup(popup: HTMLElement, position: PopupAnchor, onRemove?: PopupRemoveListener): void {
    this.close(true);

    // Also clear popups left by another copy of this script (e.g. one orphaned by an extension reload)
    document.querySelectorAll(`.${POPUP_CSS_CLASS}, .${TRIGGER_CSS_CLASS}`).forEach((stale) => stale.remove());

    this.positionPopup(popup, position);
    this.currentPopup = popup;
    this.onRemove = onRemove ?? null;
  }

  /**
   * Remove the current popup and stop any playing audio
   */
  removePopup(): void {
    this.close(false);
  }

  private close(replaced: boolean): void {
    if (this.currentPopup) {
      // A replaced popup goes at once, so it never overlaps the new one; a dismissed one fades out
      if (replaced) {
        this.currentPopup.remove();
      } else {
        fadeOutAndRemove(this.currentPopup);
      }
      this.currentPopup = null;
    }

    const onRemove = this.onRemove;
    this.onRemove = null;
    onRemove?.(replaced);

    speechService.stop();
  }

  /**
   * Get current popup element
   */
  getCurrentPopup(): HTMLElement | null {
    return this.currentPopup;
  }

  /**
   * Check if a popup is currently shown
   */
  hasPopup(): boolean {
    return this.currentPopup !== null;
  }
}

// Export singleton instance
export const popupManager = new PopupManager();
