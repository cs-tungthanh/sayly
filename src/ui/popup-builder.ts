/**
 * Build popup DOM elements with clickable words and speech controls
 */

import { requestWordIpa } from '../api/ipa-client';
import { requestEnglishDefinitions } from '../api/definitions-client';
import type { WordDefinitions } from '../api/dictionary-api';
import { requestGeminiTranslation } from '../api/translation-client';
import type { DictionaryEntry, TranslationResult } from '../api/translate-api';
import {
  POPUP_CSS_CLASS,
  TRIGGER_CSS_CLASS,
  COPY_FEEDBACK_MS,
  WORD_BUBBLE_GAP_PX,
  DICTIONARY_SITES
} from '../constants/app-constants';
import { UI_LABELS } from '../constants/messages';
import { makeDraggable } from './draggable';
import { ICONS, createIcon, setButtonIcon } from './icons';
import type { IconNode } from 'lucide';
import { speechService } from '../speech/speech-service';
import { getDictionarySite } from '../shared/utils';
import { cachedSetting } from '../shared/settings-cache';
import { isVietnamese } from '../text/text-processor';

const readDictionarySite = cachedSetting('dictionarySite', getDictionarySite);

// A word, allowing inner apostrophes (straight or curly) and hyphens: "it's", "well-known"
const WORD_PATTERN = /([A-Za-z]+(?:['’-][A-Za-z]+)*)/;
// The whole selection is one word, ignoring punctuation around it: "hello," → "hello"
const SINGLE_WORD_PATTERN = new RegExp(`^[^A-Za-z]*${WORD_PATTERN.source}[^A-Za-z]*$`);

/**
 * Popup element plus setters for content that arrives after it is shown
 */
export interface PronunciationPopup {
  element: HTMLElement;
  setTranslation: (translation: TranslationResult | null) => void;
}

/**
 * What a popup offers besides the text, its IPA and the translation
 */
export interface PopupOptions {
  /** The copy button (word + IPA, or text + translation) */
  showCopy: boolean;
  /** The Gemini button, which translates only when clicked */
  showGemini: boolean;
  /** For a single word: its English definitions with examples, as a learner's dictionary shows them */
  showDefinitions: boolean;
}

/**
 * Create the popup element with a loading placeholder for the translation
 */
export function createPopup(
  text: string,
  onClose: () => void,
  { showCopy, showGemini, showDefinitions }: PopupOptions
): PronunciationPopup {
  const popup = document.createElement('div');
  popup.className = POPUP_CSS_CLASS;

  // Drag handle header
  const dragHandle = createDragHandle(onClose);
  popup.appendChild(dragHandle);

  // Make popup draggable
  makeDraggable(popup, dragHandle);

  // Content wrapper for scrolling
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'elang-popup-content-wrapper';
  popup.appendChild(contentWrapper);

  // Vietnamese text has no English pronunciation to show: it is only translated, into English
  const vietnamese = isVietnamese(text);
  const singleWord = vietnamese ? undefined : text.match(SINGLE_WORD_PATTERN)?.[1];
  if (!vietnamese) speechService.warmUp();

  // Copies what is hard to select by hand: a word with its IPA, or the text with its translation
  let ipa: string | null = null;
  let translationText: string | null = null;
  const copyButton = showCopy
    ? createCopyButton('elang-play-button', 14, () =>
        singleWord ? [singleWord, ipa].filter(Boolean).join(' ') : [text, translationText].filter(Boolean).join('\n')
      )
    : null;

  if (singleWord) {
    // One word: show its IPA, play and dictionary link, like the bubble a clicked word opens
    contentWrapper.appendChild(createWordHeader(singleWord, copyButton, (found) => (ipa = found)));
  } else {
    // Several words: each word opens its pronunciation bubble; Vietnamese is shown as plain text
    const wordBubble = vietnamese ? null : createWordBubble(popup);
    const textDisplay = wordBubble ? createTextDisplay(text, wordBubble.toggle) : createPlainText(text);
    const sourceRow = document.createElement('div');
    sourceRow.className = 'elang-popup-source';
    sourceRow.appendChild(textDisplay);

    // Play and copy buttons beside the text
    const actions = document.createElement('div');
    actions.className = 'elang-popup-source-actions';
    if (!vietnamese) actions.appendChild(createPlayButton(text));
    if (copyButton) actions.appendChild(copyButton);
    if (actions.childElementCount > 0) sourceRow.appendChild(actions);
    contentWrapper.appendChild(sourceRow);

    // Buttons sit in a row beside a one-line selection and stack beside a longer one. Decided
    // once, on the first layout with the buttons in a row, so the choice can't flip back and forth
    const layoutObserver = new ResizeObserver(() => {
      // The first report can come before the popup is on the page; wait for a real layout
      if (textDisplay.clientWidth === 0) return;
      layoutObserver.disconnect();
      sourceRow.classList.toggle('elang-popup-source-stacked', countLines(textDisplay) > 1);
    });
    layoutObserver.observe(textDisplay);

    if (wordBubble) {
      // The bubble is anchored to a word, so it closes when the word scrolls away
      textDisplay.addEventListener('scroll', wordBubble.close);
      contentWrapper.addEventListener('scroll', wordBubble.close);

      // Clicking anywhere else in the popup dismisses the bubble
      popup.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.elang-popup-word, .elang-popup-word-bubble')) {
          wordBubble.close();
        }
      });
    }
  }

  // Placeholder keeps the layout stable while the translation is in flight
  const translationSlot = createSkeleton('elang-popup-skeleton-translation');
  contentWrapper.appendChild(translationSlot);
  if (showGemini) contentWrapper.appendChild(createGeminiSection(text));
  // A single word's English definitions come after its translation
  if (singleWord && showDefinitions) contentWrapper.appendChild(createDefinitionsSection(singleWord));

  return {
    element: popup,
    setTranslation: (translation) => {
      translationText = translation?.text ?? null;
      replaceSlot(translationSlot, translation ? createTranslationDisplay(translation) : null);
    }
  };
}

/**
 * Create the small bar shown by a selection in "display icon" mode: an icon that opens the popup,
 * and a button that copies the selected text unless that is turned off
 */
export function createTrigger(text: string, onOpen: () => void, showCopy: boolean): HTMLElement {
  const bar = document.createElement('div');
  bar.className = TRIGGER_CSS_CLASS;

  // Keep the page's selection and focus as they are while pressing a button
  bar.addEventListener('mousedown', (e) => e.preventDefault());

  bar.appendChild(createTriggerButton(ICONS.TRIGGER, UI_LABELS.TRIGGER_TOOLTIP, onOpen));
  if (showCopy) bar.appendChild(createCopyButton('elang-trigger-button', 16, () => text));

  return bar;
}

/**
 * Create one icon button for the selection bar
 */
function createTriggerButton(icon: IconNode, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'elang-trigger-button';
  setButtonIcon(button, icon, 16, label);
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return button;
}

/**
 * Create a button that copies text, briefly showing whether it worked
 * @param getText Read when clicked, so it can include content that arrived after the button was made
 */
function createCopyButton(className: string, iconSize: number, getText: () => string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = className;
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  const showIdle = () => {
    setButtonIcon(button, ICONS.COPY, iconSize, UI_LABELS.COPY_TOOLTIP);
    button.classList.remove('elang-copy-done');
  };
  showIdle();

  button.addEventListener('click', async (e) => {
    e.stopPropagation();
    const copied = await copyText(getText());
    setButtonIcon(button, copied ? ICONS.COPIED : ICONS.COPY, iconSize, copied ? UI_LABELS.COPIED : UI_LABELS.COPY_FAILED);
    button.classList.toggle('elang-copy-done', copied);

    clearTimeout(resetTimer);
    resetTimer = setTimeout(showIdle, COPY_FEEDBACK_MS);
  });

  return button;
}

/**
 * Copy text to the clipboard
 * @returns whether it was copied
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // The clipboard API is missing on http pages or blocked by some sites
    return copyWithCommand(text);
  }
}

/**
 * Copy text with the browser's copy command, through a hidden text box,
 * then put the page's selection and focus back
 */
function copyWithCommand(text: string): boolean {
  const selection = window.getSelection();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i))
    : [];
  const focused = document.activeElement;

  const textBox = document.createElement('textarea');
  textBox.value = text;
  textBox.readOnly = true;
  textBox.style.cssText = 'position: fixed; top: 0; left: 0; opacity: 0; pointer-events: none;';
  document.body.appendChild(textBox);
  textBox.select();

  try {
    return document.execCommand('copy');
  } finally {
    textBox.remove();
    selection?.removeAllRanges();
    ranges.forEach((range) => selection?.addRange(range));
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
  }
}

/**
 * How many lines an element's text wraps onto
 */
function countLines(element: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(element);

  // Fragments on one line share a top, give or take a few pixels of padding on the word spans
  const tops = Array.from(range.getClientRects(), (rect) => rect.top).sort((a, b) => a - b);
  return tops.filter((top, i) => i === 0 || top - tops[i - 1] > 4).length;
}

/**
 * Swap a placeholder for its loaded content, or drop it when there is none
 */
function replaceSlot(slot: HTMLElement, content: HTMLElement | null): void {
  if (content) {
    slot.replaceWith(content);
  } else {
    slot.remove();
  }
}

/**
 * Create a pulsing placeholder block
 */
function createSkeleton(variantClass: string): HTMLElement {
  const skeleton = document.createElement('div');
  skeleton.className = `elang-popup-skeleton ${variantClass}`;
  return skeleton;
}

/**
 * Create drag handle with close button
 */
function createDragHandle(onClose: () => void): HTMLElement {
  const dragHandle = document.createElement('div');
  dragHandle.className = 'elang-popup-drag-handle';
  dragHandle.appendChild(createIcon(ICONS.DRAG, 14));
  dragHandle.title = UI_LABELS.DRAG_TOOLTIP;

  const closeButton = document.createElement('button');
  closeButton.className = 'elang-popup-close-button';
  setButtonIcon(closeButton, ICONS.CLOSE, 14, UI_LABELS.CLOSE_TOOLTIP);
  closeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    onClose();
  });
  dragHandle.appendChild(closeButton);

  return dragHandle;
}

/**
 * Create a text display without clickable words
 */
function createPlainText(text: string): HTMLElement {
  const textDiv = document.createElement('div');
  textDiv.className = 'elang-popup-text';
  textDiv.textContent = text;
  return textDiv;
}

/**
 * Create text display where every word is clickable; punctuation and spacing stay as plain text
 */
function createTextDisplay(text: string, onWordClick: (wordElement: HTMLElement) => void): HTMLElement {
  const textDiv = document.createElement('div');
  textDiv.className = 'elang-popup-text';

  // split() with a capture group keeps the words at odd indexes
  text.split(WORD_PATTERN).forEach((part, index) => {
    if (!part) return;

    if (index % 2 === 0) {
      textDiv.appendChild(document.createTextNode(part));
      return;
    }

    const wordSpan = document.createElement('span');
    wordSpan.className = 'elang-popup-word';
    wordSpan.textContent = part;
    wordSpan.title = UI_LABELS.WORD_TOOLTIP;
    wordSpan.tabIndex = 0;
    wordSpan.setAttribute('role', 'button');
    textDiv.appendChild(wordSpan);
  });

  // One listener for every word, so a long text doesn't add two per word
  const wordAt = (target: EventTarget | null) =>
    (target as HTMLElement | null)?.closest<HTMLElement>('.elang-popup-word') ?? null;

  textDiv.addEventListener('click', (e) => {
    const wordSpan = wordAt(e.target);
    if (wordSpan) onWordClick(wordSpan);
  });
  textDiv.addEventListener('keydown', (e) => {
    const wordSpan = wordAt(e.target);
    if (wordSpan && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onWordClick(wordSpan);
    }
  });

  return textDiv;
}

/**
 * Create a link that opens a word on the chosen dictionary site in a new tab
 */
function createDictionaryLink(className: string, iconSize: number, word?: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = className;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  setButtonIcon(link, ICONS.DICTIONARY, iconSize, '');
  if (word) pointDictionaryLink(link, word);
  return link;
}

/**
 * Point a dictionary link at a word, as shown in the text, on the chosen dictionary site
 */
function pointDictionaryLink(link: HTMLAnchorElement, word: string): void {
  const slug = encodeURIComponent(word.replace(/’/g, "'").toLowerCase());
  readDictionarySite().then((siteId) => {
    const site = DICTIONARY_SITES[siteId];
    const label = `Open in ${site.name}`;
    link.href = site.url + slug;
    link.title = label;
    link.setAttribute('aria-label', label);
  });
}

/**
 * Create the header for a single selected word: word, IPA, play and dictionary link
 */
function createWordHeader(
  word: string,
  copyButton: HTMLElement | null,
  onIpa?: (ipa: string | null) => void
): HTMLElement {
  const header = document.createElement('div');
  header.className = 'elang-popup-word-header';

  const wordLabel = document.createElement('span');
  wordLabel.className = 'elang-popup-word-header-word';
  wordLabel.textContent = word;

  const ipaLabel = document.createElement('span');
  ipaLabel.className = 'elang-popup-word-header-ipa elang-popup-word-header-pending';
  ipaLabel.textContent = UI_LABELS.LOOKING_UP;
  requestWordIpa(word).then((ipa) => {
    ipaLabel.textContent = ipa || UI_LABELS.NO_IPA;
    ipaLabel.classList.remove('elang-popup-word-header-pending');
    onIpa?.(ipa);
  });

  const details = document.createElement('div');
  details.className = 'elang-popup-word-header-details';
  details.appendChild(wordLabel);
  details.appendChild(ipaLabel);
  header.appendChild(details);

  header.appendChild(createPlayButton(word));
  if (copyButton) header.appendChild(copyButton);
  header.appendChild(createDictionaryLink('elang-play-button', 14, word));

  return header;
}

/**
 * Create the small bubble that shows a clicked word under it, with the same layout as a single
 * selected word: the IPA sits beside the word when there is room and wraps under it when not
 */
function createWordBubble(popup: HTMLElement) {
  const bubble = document.createElement('div');
  bubble.className = 'elang-popup-word-bubble';
  bubble.hidden = true;
  popup.appendChild(bubble);

  let activeWord: HTMLElement | null = null;

  const close = () => {
    activeWord?.classList.remove('elang-popup-word-active');
    activeWord = null;
    bubble.hidden = true;
    bubble.replaceChildren();
  };

  const position = (wordElement: HTMLElement) => {
    // Measured from the left edge, so its width isn't squeezed by where it was last
    bubble.style.left = '0px';
    const popupRect = popup.getBoundingClientRect();
    const wordRect = wordElement.getBoundingClientRect();
    const maxLeft = popup.clientWidth - bubble.offsetWidth - WORD_BUBBLE_GAP_PX;

    bubble.style.top = `${wordRect.bottom - popupRect.top + WORD_BUBBLE_GAP_PX}px`;
    bubble.style.left = `${Math.max(WORD_BUBBLE_GAP_PX, Math.min(wordRect.left - popupRect.left, maxLeft))}px`;
  };

  const open = (wordElement: HTMLElement) => {
    activeWord?.classList.remove('elang-popup-word-active');
    activeWord = wordElement;
    wordElement.classList.add('elang-popup-word-active');

    // The bubble changes size when the IPA arrives; the background caches it, so reopening is quick
    bubble.replaceChildren(
      createWordHeader(wordElement.textContent || '', null, () => {
        if (activeWord === wordElement) position(wordElement);
      })
    );
    bubble.hidden = false;
    position(wordElement);
  };

  const toggle = (wordElement: HTMLElement) => {
    if (activeWord === wordElement) {
      close();
    } else {
      open(wordElement);
    }
  };

  return { toggle, close };
}

/**
 * Create translation display element, with meanings by part of speech for a single word
 */
function createTranslationDisplay(translation: TranslationResult): HTMLElement {
  const translationDiv = document.createElement('div');
  translationDiv.className = 'elang-popup-translation';

  const translationText = document.createElement('div');
  translationText.textContent = translation.text;
  translationDiv.appendChild(translationText);

  if (translation.dictionary.length > 0) {
    translationDiv.appendChild(createDictionaryDisplay(translation.dictionary));
  }

  return translationDiv;
}

/**
 * Create the Gemini button; clicking it asks Gemini for a natural, spoken translation and shows it
 * in the button's place. On failure the reason shows above the button, so it can be tried again.
 */
function createGeminiSection(text: string): HTMLElement {
  const section = document.createElement('div');
  section.className = 'elang-popup-gemini';

  const button = document.createElement('button');
  button.className = 'elang-gemini-button';
  button.title = UI_LABELS.GEMINI_TOOLTIP;
  const label = document.createElement('span');
  label.textContent = UI_LABELS.GEMINI_BUTTON;
  button.append(createIcon(ICONS.GEMINI, 14), label);

  button.addEventListener('click', async (e) => {
    e.stopPropagation();
    section.replaceChildren(createSkeleton('elang-popup-skeleton-translation'));

    const result = await requestGeminiTranslation(text);
    // The popup may have closed while Gemini was answering
    if (!section.isConnected) return;

    if ('text' in result) {
      section.replaceChildren(createGeminiResult(result.text));
    } else {
      const error = document.createElement('div');
      error.className = 'elang-popup-gemini-error';
      error.textContent = `${UI_LABELS.GEMINI_FAILED}: ${result.error}`;
      section.replaceChildren(error, button);
    }
  });

  section.appendChild(button);
  return section;
}

/**
 * Show Gemini's translation like the regular one, marked as coming from Gemini
 */
function createGeminiResult(translated: string): HTMLElement {
  const result = document.createElement('div');
  result.className = 'elang-popup-translation elang-popup-gemini-result';

  const source = document.createElement('div');
  source.className = 'elang-popup-gemini-label';
  source.append(createIcon(ICONS.GEMINI, 12), UI_LABELS.GEMINI_LABEL);

  const body = document.createElement('div');
  body.textContent = translated;

  result.append(source, body);
  return result;
}

/**
 * Create the English definitions of a word: a placeholder until they arrive, then each part of speech
 * with its numbered senses and their examples. Shows nothing when the dictionary has none.
 */
function createDefinitionsSection(word: string): HTMLElement {
  const slot = createSkeleton('elang-popup-skeleton-definitions');
  requestEnglishDefinitions(word).then((definitions) => {
    // The popup may have closed while the lookup was running
    if (slot.isConnected) replaceSlot(slot, definitions ? createDefinitionsDisplay(definitions) : null);
  });
  return slot;
}

/**
 * Show a word's English definitions: which verb it is a past form of, then its meanings
 */
function createDefinitionsDisplay({ forms, meanings }: WordDefinitions): HTMLElement {
  const section = document.createElement('div');
  section.className = 'elang-popup-definitions';

  // "past participle of see", one line per verb ("lay": past simple of lie)
  forms.forEach(({ kind, base }) => {
    const note = document.createElement('div');
    note.className = 'elang-popup-definitions-form';
    const baseWord = document.createElement('strong');
    baseWord.textContent = base;
    note.append(`${kind} of `, baseWord);
    section.appendChild(note);
  });

  meanings.forEach(({ partOfSpeech, definitions, headword }) => {
    const group = document.createElement('div');
    group.className = 'elang-popup-definitions-group';

    // Senses borrowed from the verb name it: "verb · see"
    const partOfSpeechLabel = document.createElement('div');
    partOfSpeechLabel.className = 'elang-popup-definitions-pos';
    partOfSpeechLabel.textContent = headword ? `${partOfSpeech} · ${headword}` : partOfSpeech;
    group.appendChild(partOfSpeechLabel);

    const list = document.createElement('ol');
    list.className = 'elang-popup-definitions-list';
    definitions.forEach(({ definition, example }) => {
      const item = document.createElement('li');

      const definitionText = document.createElement('div');
      definitionText.className = 'elang-popup-definitions-text';
      definitionText.textContent = definition;
      item.appendChild(definitionText);

      if (example) {
        const exampleText = document.createElement('div');
        exampleText.className = 'elang-popup-definitions-example';
        exampleText.textContent = example;
        item.appendChild(exampleText);
      }

      list.appendChild(item);
    });
    group.appendChild(list);
    section.appendChild(group);
  });

  return section;
}

/**
 * Create a two-column list: part of speech, then its meanings
 */
function createDictionaryDisplay(entries: DictionaryEntry[]): HTMLElement {
  const dictionary = document.createElement('div');
  dictionary.className = 'elang-popup-dictionary';

  entries.forEach(({ partOfSpeech, meanings }) => {
    const partOfSpeechSpan = document.createElement('span');
    partOfSpeechSpan.className = 'elang-popup-dictionary-pos';
    partOfSpeechSpan.textContent = partOfSpeech;

    const meaningsSpan = document.createElement('span');
    meaningsSpan.className = 'elang-popup-dictionary-meanings';
    meaningsSpan.textContent = meanings.join(', ');

    dictionary.appendChild(partOfSpeechSpan);
    dictionary.appendChild(meaningsSpan);
  });

  return dictionary;
}

/**
 * Create play button that toggles between playing and stopping the selection
 */
function createPlayButton(text: string): HTMLElement {
  const playButton = document.createElement('button');
  playButton.className = 'elang-play-button';

  const showIdle = () => {
    setButtonIcon(playButton, ICONS.SPEAK, 15, UI_LABELS.PLAY_TOOLTIP);
    playButton.classList.remove('elang-play-button-playing');
  };

  const showPlaying = () => {
    setButtonIcon(playButton, ICONS.STOP, 12, UI_LABELS.STOP_TOOLTIP);
    playButton.classList.add('elang-play-button-playing');
  };

  showIdle();

  playButton.addEventListener('click', () => {
    if (playButton.classList.contains('elang-play-button-playing')) {
      speechService.stop();
      showIdle();
      return;
    }

    showPlaying();
    speechService.speak(text, {
      onEnd: showIdle,
      onError: showIdle
    });
  });

  return playButton;
}
