/**
 * Side panel: shows the text picked with the right-click menu, using the same view as the in-page
 * popup. It is how Sayly works where content scripts can't run, such as the browser's PDF viewer.
 */

import { createPopup } from '../ui/popup-builder';
import { readPopupLook } from '../ui/text-popup';
import { requestTranslation } from '../api/translation-client';
import { speechService } from '../speech/speech-service';
import { getTheme } from '../shared/utils';
import { getRequiredElement, onDOMReady, applyPageTheme } from '../shared/dom-helpers';
import { DARK_THEME_CSS_CLASS, SIDE_PANEL_TEXT_KEY } from '../constants/app-constants';

interface PickedText {
  text: string;
  at: number;
}

// Bumped for every text shown, so a translation that returns late doesn't fill a newer view
let showToken = 0;

/**
 * Remove the shown text and go back to the hint
 */
function clear(result: HTMLElement, empty: HTMLElement): void {
  showToken++;
  speechService.stop();
  result.replaceChildren();
  empty.hidden = false;
}

/**
 * Show text with IPA and speech controls; the translation fills in when it arrives
 */
async function show(text: string, result: HTMLElement, empty: HTMLElement): Promise<void> {
  const token = ++showToken;
  speechService.stop();

  const look = await readPopupLook();
  if (token !== showToken) return;

  const popup = createPopup(text, () => clear(result, empty), {
    showCopy: look.showCopy,
    showGemini: look.gemini,
    showDefinitions: look.definitions
  });
  popup.element.classList.toggle(DARK_THEME_CSS_CLASS, look.dark);

  result.replaceChildren(popup.element);
  empty.hidden = true;

  const translation = await requestTranslation(text);
  if (token === showToken) popup.setTranslation(translation);
}

async function initSidePanel(): Promise<void> {
  const result = getRequiredElement<HTMLElement>('result');
  const empty = getRequiredElement<HTMLElement>('emptyState');

  applyPageTheme(await getTheme());

  const showPicked = (picked: PickedText | undefined) => {
    if (picked?.text) show(picked.text, result, empty);
  };

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'session' && SIDE_PANEL_TEXT_KEY in changes) {
      showPicked(changes[SIDE_PANEL_TEXT_KEY].newValue);
    }
    // Follow the Theme setting; the shown text is redrawn with the new look
    if (areaName === 'local' && 'theme' in changes) {
      applyPageTheme(changes.theme.newValue);
      chrome.storage.session.get(SIDE_PANEL_TEXT_KEY).then(stored => {
        if (result.childElementCount) showPicked(stored[SIDE_PANEL_TEXT_KEY]);
      });
    }
  });

  // The menu click that opened the panel stored its text before the panel loaded
  const stored = await chrome.storage.session.get(SIDE_PANEL_TEXT_KEY);
  showPicked(stored[SIDE_PANEL_TEXT_KEY]);
}

onDOMReady(initSidePanel);
