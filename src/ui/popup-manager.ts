/**
 * Manage popup lifecycle, positioning, and state
 */

import {
  POPUP_CSS_CLASS,
  TRIGGER_CSS_CLASS,
  POPUP_POSITION_OFFSET_PX,
  POPUP_EDGE_MARGIN_PX
} from '../constants/app-constants';
import { speechService } from '../speech/speech-service';

/**
 * Told when a shown popup goes away; replaced is true when another popup took its place
 */
export type PopupRemoveListener = (replaced: boolean) => void;

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
   * @param position Page coordinates of the point the popup hangs below
   */
  positionPopup(popup: HTMLElement, position: { x: number; y: number }): void {
    const container = getPopupContainer();
    // In full screen the popup sits inside the full-screen element, placed against the viewport
    const fixed = container !== document.body;
    const viewTop = fixed ? 0 : window.scrollY;
    const anchorY = position.y - (fixed ? window.scrollY : 0);

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

    // Adjust vertical position if off-screen (show above selection)
    if (top + popupRect.height > viewTop + viewportHeight) {
      top = anchorY - popupRect.height - POPUP_POSITION_OFFSET_PX;
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }

  /**
   * Show a new popup (removes current popup if exists)
   * @param onRemove Called once when this popup goes away
   */
  showPopup(popup: HTMLElement, position: { x: number; y: number }, onRemove?: PopupRemoveListener): void {
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
      this.currentPopup.remove();
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
