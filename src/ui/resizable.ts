/**
 * Make the popup resizable from a grip in its corner
 */

import { POPUP_MIN_WIDTH_PX, POPUP_MIN_HEIGHT_PX, POPUP_EDGE_MARGIN_PX } from '../constants/app-constants';
import { UI_LABELS } from '../constants/messages';

export interface PopupSize {
  width: number;
  height: number;
}

// Marks a popup whose size the user chose, so the default size limits stop applying
const RESIZED_CLASS = 'elang-popup-resized';

/**
 * Keep a size within the minimum and what fits in the window from the popup's left and top edges
 */
function clampSize(size: PopupSize, rect: DOMRect): PopupSize {
  const maxWidth = Math.max(POPUP_MIN_WIDTH_PX, window.innerWidth - rect.left - POPUP_EDGE_MARGIN_PX);
  const maxHeight = Math.max(POPUP_MIN_HEIGHT_PX, window.innerHeight - rect.top - POPUP_EDGE_MARGIN_PX);
  return {
    width: Math.round(Math.min(Math.max(size.width, POPUP_MIN_WIDTH_PX), maxWidth)),
    height: Math.round(Math.min(Math.max(size.height, POPUP_MIN_HEIGHT_PX), maxHeight))
  };
}

/**
 * Open a popup at a size chosen earlier: that width, and that height at most, so a popup with
 * little in it stays short. Call before the popup is positioned, so it is placed at this size.
 */
export function applySavedSize(popup: HTMLElement, size: PopupSize): void {
  const width = Math.min(size.width, window.innerWidth - 2 * POPUP_EDGE_MARGIN_PX);
  const height = Math.min(size.height, window.innerHeight - 2 * POPUP_EDGE_MARGIN_PX);
  popup.classList.add(RESIZED_CLASS);
  popup.style.width = `${Math.max(width, POPUP_MIN_WIDTH_PX)}px`;
  popup.style.maxHeight = `${Math.max(height, POPUP_MIN_HEIGHT_PX)}px`;
}

/**
 * Add a grip to the popup's bottom-right corner: dragging it resizes the popup, double-clicking it
 * goes back to the default size
 * @param onResize Told the new size when a resize ends, or null when it went back to the default
 */
export function makeResizable(popup: HTMLElement, onResize: (size: PopupSize | null) => void): void {
  const grip = document.createElement('div');
  grip.className = 'elang-popup-resize-grip';
  grip.title = UI_LABELS.RESIZE_TOOLTIP;
  popup.appendChild(grip);

  let start: { size: PopupSize; x: number; y: number } | null = null;

  const resize = (e: PointerEvent) => {
    if (!start) return;
    e.preventDefault();
    const size = clampSize(
      { width: start.size.width + e.clientX - start.x, height: start.size.height + e.clientY - start.y },
      popup.getBoundingClientRect()
    );
    popup.style.width = `${size.width}px`;
    popup.style.height = `${size.height}px`;
  };

  const resizeEnd = (e: PointerEvent) => {
    if (!start) return;
    start = null;
    grip.releasePointerCapture(e.pointerId);
    const rect = popup.getBoundingClientRect();
    // Later popups take this as their width and largest height
    popup.style.maxHeight = `${Math.round(rect.height)}px`;
    onResize({ width: Math.round(rect.width), height: Math.round(rect.height) });
  };

  grip.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = popup.getBoundingClientRect();
    start = { size: { width: rect.width, height: rect.height }, x: e.clientX, y: e.clientY };
    // Fix the current size first, so the popup doesn't jump when the default limits stop applying
    popup.style.width = `${Math.round(rect.width)}px`;
    popup.style.height = `${Math.round(rect.height)}px`;
    popup.style.maxHeight = 'none';
    popup.classList.add(RESIZED_CLASS);
    grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener('pointermove', resize);
  grip.addEventListener('pointerup', resizeEnd);
  grip.addEventListener('pointercancel', resizeEnd);

  grip.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    popup.classList.remove(RESIZED_CLASS);
    popup.style.width = '';
    popup.style.height = '';
    popup.style.maxHeight = '';
    onResize(null);
  });
}
