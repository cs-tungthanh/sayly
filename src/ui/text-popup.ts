/**
 * Open the pronunciation popup for some text: the selection popup and the YouTube caption hover share it
 */

import { requestTranslation, isGeminiAvailable } from '../api/translation-client';
import { createPopup } from './popup-builder';
import { popupManager, type PopupRemoveListener } from './popup-manager';
import { getShowCopyButton, getTheme, isDarkTheme } from '../shared/utils';
import { cachedSetting } from '../shared/settings-cache';
import { DARK_THEME_CSS_CLASS } from '../constants/app-constants';

const readShowCopyButton = cachedSetting('showCopyButton', getShowCopyButton);
const readTheme = cachedSetting('theme', getTheme);

/**
 * Settings that shape a popup, read once per popup
 */
export interface PopupLook {
  showCopy: boolean;
  dark: boolean;
  /** A Gemini API key is set and translation is on */
  gemini: boolean;
}

export async function readPopupLook(): Promise<PopupLook> {
  const [showCopy, theme, gemini] = await Promise.all([readShowCopyButton(), readTheme(), isGeminiAvailable()]);
  return { showCopy, dark: isDarkTheme(theme), gemini };
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
  const popup = createPopup(text, () => popupManager.removePopup(), look.showCopy, look.gemini);
  popup.element.classList.toggle(DARK_THEME_CSS_CLASS, look.dark);
  popupManager.showPopup(popup.element, position, onRemove);

  // A newer popup may have replaced this one before the request returned
  const isStillShown = () => popupManager.getCurrentPopup() === popup.element;

  requestTranslation(text).then((translation) => {
    if (isStillShown()) popup.setTranslation(translation);
  });

  return popup.element;
}
