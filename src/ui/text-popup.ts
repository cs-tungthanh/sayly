/**
 * Open the pronunciation popup for some text: the selection popup and the YouTube caption hover share it
 */

import { requestTranslation, isGeminiAvailable } from '../api/translation-client';
import { createPopup } from './popup-builder';
import { popupManager, type PopupRemoveListener } from './popup-manager';
import { getShowCopyButton, getShowDefinitions, getPopupSize, savePopupSize, getTheme, isDarkTheme } from '../shared/utils';
import { makeResizable, applySavedSize, type PopupSize } from './resizable';
import { cachedSetting } from '../shared/settings-cache';
import { DARK_THEME_CSS_CLASS } from '../constants/app-constants';

const readShowCopyButton = cachedSetting('showCopyButton', getShowCopyButton);
const readTheme = cachedSetting('theme', getTheme);
const readShowDefinitions = cachedSetting('showDefinitions', getShowDefinitions);
const readPopupSize = cachedSetting('popupSize', getPopupSize);

/**
 * Settings that shape a popup, read once per popup
 */
export interface PopupLook {
  showCopy: boolean;
  dark: boolean;
  /** A Gemini API key is set and translation is on */
  gemini: boolean;
  /** A single selected word shows its English definitions with examples */
  definitions: boolean;
  /** The size the user resized popups to, or null for the default */
  size: PopupSize | null;
}

export async function readPopupLook(): Promise<PopupLook> {
  const [showCopy, theme, gemini, definitions, size] = await Promise.all([
    readShowCopyButton(),
    readTheme(),
    isGeminiAvailable(),
    readShowDefinitions(),
    readPopupSize()
  ]);
  return { showCopy, dark: isDarkTheme(theme), gemini, definitions, size };
}

/**
 * Show the popup for text with IPA and speech controls; the translation fills in when it arrives
 * @returns The popup element
 */
export function openTextPopup(
  text: string,
  position: { x: number; y: number },
  look: PopupLook,
  onRemove?: PopupRemoveListener
): HTMLElement {
  const popup = createPopup(text, () => popupManager.removePopup(), {
    showCopy: look.showCopy,
    showGemini: look.gemini,
    showDefinitions: look.definitions
  });
  popup.element.classList.toggle(DARK_THEME_CSS_CLASS, look.dark);
  // Sized before it is placed, so it is kept inside the window at that size
  if (look.size) applySavedSize(popup.element, look.size);
  makeResizable(popup.element, savePopupSize);
  popupManager.showPopup(popup.element, position, onRemove);

  // A newer popup may have replaced this one before the request returned
  const isStillShown = () => popupManager.getCurrentPopup() === popup.element;

  requestTranslation(text).then((translation) => {
    if (isStillShown()) popup.setTranslation(translation);
  });

  return popup.element;
}
