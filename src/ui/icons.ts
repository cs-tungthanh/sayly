/**
 * Lucide SVG icons for popup buttons (only the icons imported here are bundled)
 */

import { createElement, AudioLines, BookOpen, Check, Copy, GripHorizontal, Minus, Plus, Sparkles, Square, Volume2, X } from 'lucide';
import type { IconNode } from 'lucide';

export const ICONS = {
  SPEAK: Volume2,
  STOP: Square,
  CLOSE: X,
  DICTIONARY: BookOpen,
  DRAG: GripHorizontal,
  TRIGGER: AudioLines,
  COPY: Copy,
  COPIED: Check,
  LESS: Minus,
  MORE: Plus,
  GEMINI: Sparkles
} as const;

/**
 * Create an SVG icon element sized in pixels
 */
export function createIcon(icon: IconNode, size: number): SVGElement {
  return createElement(icon, {
    width: size,
    height: size,
    class: 'elang-icon',
    'aria-hidden': 'true'
  });
}

/**
 * Show an icon on an icon-only button; the label becomes its tooltip and accessible name
 */
export function setButtonIcon(button: HTMLElement, icon: IconNode, size: number, label: string): void {
  button.replaceChildren(createIcon(icon, size));
  button.title = label;
  button.setAttribute('aria-label', label);
}
