/**
 * Helper utilities for working with text selection
 */

import { SELECTION_MAX_CHARS } from '../constants/app-constants';

/**
 * Get the selected text from the page, cut at a word to at most SELECTION_MAX_CHARS with an ellipsis
 */
export function getSelectedText(): string {
  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : '';
  if (text.length <= SELECTION_MAX_CHARS) return text;

  // One character is left for the ellipsis
  const cut = text.slice(0, SELECTION_MAX_CHARS - 1);
  const lastSpace = cut.search(/\s\S*$/);
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

/**
 * Get the position of the current selection for popup placement
 */
export function getSelectionPosition(): { x: number; y: number } | null {
  const field = getFocusedTextField();
  let rect: DOMRect;

  if (field) {
    // A selection inside a text field has no range over its text; the page's range is empty
    rect = getTextFieldSelectionRect(field);
  } else {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    rect = selection.getRangeAt(0).getBoundingClientRect();
  }

  return {
    x: rect.left + rect.width / 2,
    y: rect.bottom + window.scrollY,
  };
}

/**
 * Whether the selection sits where the user types: a text field or a contenteditable editor
 */
export function isSelectionInEditableField(): boolean {
  if (getFocusedTextField()) return true;

  const anchor = window.getSelection()?.anchorNode;
  const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor as HTMLElement : anchor?.parentElement;
  return Boolean(element?.isContentEditable);
}

/**
 * The focused input or textarea holding a text selection, if any
 */
function getFocusedTextField(): HTMLInputElement | HTMLTextAreaElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) return null;

  // selectionStart is null on input types without text selection (checkbox, color, ...)
  const { selectionStart, selectionEnd } = active;
  if (selectionStart === null || selectionEnd === null || selectionStart === selectionEnd) return null;
  return active;
}

const MIRRORED_STYLES = [
  'boxSizing', 'width', 'height',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch',
  'lineHeight', 'letterSpacing', 'wordSpacing', 'textTransform', 'textIndent', 'tabSize',
  'overflowWrap', 'wordBreak', 'direction',
] as const;

/**
 * Viewport rect of the selected text inside a text field, measured on a hidden copy of the field
 * that lays out the same text with the same styles
 */
function getTextFieldSelectionRect(field: HTMLInputElement | HTMLTextAreaElement): DOMRect {
  const fieldRect = field.getBoundingClientRect();
  const style = window.getComputedStyle(field);
  const mirror = document.createElement('div');

  for (const prop of MIRRORED_STYLES) mirror.style[prop] = style[prop];
  Object.assign(mirror.style, {
    position: 'fixed',
    top: `${fieldRect.top}px`,
    left: `${fieldRect.left}px`,
    visibility: 'hidden',
    overflow: 'hidden',
    // An input keeps its text on one line; a textarea wraps it
    whiteSpace: field instanceof HTMLInputElement ? 'pre' : 'pre-wrap',
  });

  const start = field.selectionStart ?? 0;
  const end = field.selectionEnd ?? start;
  const marker = document.createElement('span');
  marker.textContent = field.value.slice(start, end);
  mirror.append(field.value.slice(0, start), marker);
  document.body.appendChild(mirror);

  const markerRect = marker.getBoundingClientRect();
  mirror.remove();

  // Shift by the field's own scroll and keep the result within the visible field
  const left = clamp(markerRect.left - field.scrollLeft, fieldRect.left, fieldRect.right);
  const right = clamp(markerRect.right - field.scrollLeft, fieldRect.left, fieldRect.right);
  const top = clamp(markerRect.top - field.scrollTop, fieldRect.top, fieldRect.bottom);
  const bottom = clamp(markerRect.bottom - field.scrollTop, fieldRect.top, fieldRect.bottom);
  return new DOMRect(left, top, right - left, bottom - top);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Check if selection is inside a given element
 */
export function isSelectionInsideElement(element: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const containerElement = container.nodeType === Node.ELEMENT_NODE
    ? container as Element
    : container.parentElement;

  return containerElement ? element.contains(containerElement) : false;
}
