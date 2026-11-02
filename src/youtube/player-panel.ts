/**
 * A Sayly button in the YouTube player's control bar, opening a panel with Sayly's YouTube
 * settings over the video (so they can be changed without leaving it, in full screen too)
 */

import {
  getYouTubeSeekSeconds,
  saveYouTubeSeekSeconds,
  getYouTubeShortcutsEnabled,
  saveYouTubeShortcutsEnabled,
  getYouTubeAutoLoadCaptions,
  getYouTubeShortcutMode,
  saveYouTubeShortcutMode,
  getYouTubeHoverWords,
  saveYouTubeHoverWords,
  getYouTubeSubtitles,
  saveYouTubeSubtitles,
  getYouTubeSubtitleLines,
  saveYouTubeSubtitleLines,
  getYouTubeSubtitleSize,
  saveYouTubeSubtitleSize
} from '../shared/utils';
import { createIcon, setButtonIcon, ICONS } from '../ui/icons';
import { stopPlayerEvents } from '../ui/popup-manager';
import { UI_LABELS, SHORTCUT_MODE_CHOICES, seekSecondsLabel } from '../constants/messages';
import {
  MESSAGE_ACTIONS,
  YOUTUBE_SEEK_MIN_SECONDS,
  YOUTUBE_SEEK_MAX_SECONDS,
  YOUTUBE_SUBTITLE_MIN_LINES,
  YOUTUBE_SUBTITLE_MAX_LINES,
  YOUTUBE_SUBTITLE_MIN_SIZE,
  YOUTUBE_SUBTITLE_MAX_SIZE,
  YOUTUBE_SHORTCUT_MODES,
  type YouTubeShortcutMode
} from '../constants/app-constants';
import { hasCurrentCaptions } from './caption-tracker';
import type { YouTubeFeature } from './youtube-features';

const BUTTON_CLASS = 'elang-yt-button';
const PANEL_CLASS = 'elang-yt-panel';

let button: HTMLButtonElement | null = null;
let panel: HTMLElement | null = null;
let observer: MutationObserver | null = null;
let insertQueued = false;

/**
 * A switch row: label on the left, toggle on the right
 */
function createSwitchRow(label: string, hint: string, checked: boolean, onChange: (checked: boolean) => void): HTMLElement {
  const row = document.createElement('label');
  row.className = 'elang-yt-row';

  const text = document.createElement('span');
  text.className = 'elang-yt-row-text';
  const name = document.createElement('span');
  name.textContent = label;
  const hintElement = document.createElement('span');
  hintElement.className = 'elang-yt-hint';
  hintElement.textContent = hint;
  text.append(name, hintElement);

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'elang-yt-checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));

  row.append(text, input);
  return row;
}

/**
 * A row choosing one of a few values with a segmented control
 */
function createChoiceRow<T extends string>(
  label: string,
  choices: ReadonlyArray<{ value: T; label: string }>,
  selected: T,
  onChange: (value: T) => void
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'elang-yt-row';

  const name = document.createElement('span');
  name.className = 'elang-yt-row-text';
  name.textContent = label;

  const group = document.createElement('span');
  group.className = 'elang-yt-choice';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', label);

  const buttons = choices.map(choice => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.textContent = choice.label;
    button.addEventListener('click', () => {
      buttons.forEach((other, i) => other.setAttribute('aria-checked', String(choices[i].value === choice.value)));
      onChange(choice.value);
    });
    button.setAttribute('aria-checked', String(choice.value === selected));
    return button;
  });

  group.append(...buttons);
  row.append(name, group);
  return row;
}

interface StepperOptions {
  label: string;
  value: number;
  min: number;
  max: number;
  lessLabel: string;
  moreLabel: string;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

/**
 * A − value + stepper row, e.g. how far the shortcuts skip without captions
 */
function createStepperRow({ label, value: initial, min, max, lessLabel, moreLabel, format, onChange }: StepperOptions): HTMLElement {
  const row = document.createElement('div');
  row.className = 'elang-yt-row';

  const name = document.createElement('span');
  name.className = 'elang-yt-row-text';
  name.textContent = label;

  const stepper = document.createElement('span');
  stepper.className = 'elang-yt-stepper';
  const value = document.createElement('output');
  value.className = 'elang-yt-stepper-value';
  const less = document.createElement('button');
  const more = document.createElement('button');
  less.type = more.type = 'button';
  setButtonIcon(less, ICONS.LESS, 18, lessLabel);
  setButtonIcon(more, ICONS.MORE, 18, moreLabel);

  let current = initial;
  const show = () => {
    value.textContent = format(current);
    less.disabled = current <= min;
    more.disabled = current >= max;
  };
  const step = (by: number) => {
    current = Math.min(Math.max(current + by, min), max);
    show();
    onChange(current);
  };
  less.addEventListener('click', () => step(-1));
  more.addEventListener('click', () => step(1));
  show();

  stepper.append(less, value, more);
  row.append(name, stepper);
  return row;
}

/**
 * Build the panel with the settings as they're stored now
 */
async function createPanel(): Promise<HTMLElement> {
  const [enabled, mode, seconds, autoLoad, hoverWords, subtitlesOn, subtitleLines, subtitleSize] = await Promise.all([
    getYouTubeShortcutsEnabled(),
    getYouTubeShortcutMode(),
    getYouTubeSeekSeconds(),
    getYouTubeAutoLoadCaptions(),
    getYouTubeHoverWords(),
    getYouTubeSubtitles(),
    getYouTubeSubtitleLines(),
    getYouTubeSubtitleSize()
  ]);

  const element = document.createElement('div');
  element.className = PANEL_CLASS;
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-label', UI_LABELS.YT_PANEL_BUTTON);

  const title = document.createElement('p');
  title.className = 'elang-yt-title';
  title.textContent = UI_LABELS.YT_PANEL_TITLE;

  const status = document.createElement('p');
  const ready = hasCurrentCaptions();
  status.className = `elang-yt-status${ready ? ' elang-yt-status-ready' : ''}`;
  status.textContent = ready
    ? UI_LABELS.YT_CAPTIONS_READY
    : autoLoad ? UI_LABELS.YT_CAPTIONS_NONE : UI_LABELS.YT_CAPTIONS_MISSING;

  const allSettings = document.createElement('button');
  allSettings.type = 'button';
  allSettings.className = 'elang-yt-link';
  allSettings.textContent = UI_LABELS.YT_ALL_SETTINGS;
  allSettings.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: MESSAGE_ACTIONS.OPEN_OPTIONS });
    closePanel();
  });

  const shortcutsRow = createSwitchRow(UI_LABELS.YT_SHORTCUTS, '', enabled, saveYouTubeShortcutsEnabled);
  const secondsRow = createStepperRow({
    label: '',
    value: seconds,
    min: YOUTUBE_SEEK_MIN_SECONDS,
    max: YOUTUBE_SEEK_MAX_SECONDS,
    lessLabel: UI_LABELS.YT_SKIP_LESS,
    moreLabel: UI_LABELS.YT_SKIP_MORE,
    format: value => `${value}s`,
    onChange: saveYouTubeSeekSeconds
  });
  // The shortcut hint and the seconds label say what A and D do in the chosen mode
  const showMode = (current: YouTubeShortcutMode) => {
    const bySentence = current === YOUTUBE_SHORTCUT_MODES.SENTENCE;
    shortcutsRow.querySelector('.elang-yt-hint')!.textContent = bySentence
      ? UI_LABELS.YT_SHORTCUTS_SENTENCE_HINT
      : UI_LABELS.YT_SHORTCUTS_SECONDS_HINT;
    secondsRow.querySelector('.elang-yt-row-text')!.textContent = seekSecondsLabel(current);
  };
  showMode(mode);
  const modeRow = createChoiceRow(
    UI_LABELS.YT_SHORTCUT_MODE,
    SHORTCUT_MODE_CHOICES.map(({ mode: value, name: label }) => ({ value, label })),
    mode,
    current => {
      showMode(current);
      saveYouTubeShortcutMode(current);
    }
  );

  element.append(
    title,
    shortcutsRow,
    modeRow,
    secondsRow,
    createSwitchRow(UI_LABELS.YT_SUBTITLES, UI_LABELS.YT_SUBTITLES_HINT, subtitlesOn, saveYouTubeSubtitles),
    createStepperRow({
      label: UI_LABELS.YT_SUBTITLE_LINES,
      value: subtitleLines,
      min: YOUTUBE_SUBTITLE_MIN_LINES,
      max: YOUTUBE_SUBTITLE_MAX_LINES,
      lessLabel: UI_LABELS.YT_SUBTITLE_LINES_LESS,
      moreLabel: UI_LABELS.YT_SUBTITLE_LINES_MORE,
      format: lines => String(lines),
      onChange: saveYouTubeSubtitleLines
    }),
    createStepperRow({
      label: UI_LABELS.YT_SUBTITLE_SIZE,
      value: subtitleSize,
      min: YOUTUBE_SUBTITLE_MIN_SIZE,
      max: YOUTUBE_SUBTITLE_MAX_SIZE,
      lessLabel: UI_LABELS.YT_SUBTITLE_SIZE_LESS,
      moreLabel: UI_LABELS.YT_SUBTITLE_SIZE_MORE,
      format: size => `${size}px`,
      onChange: saveYouTubeSubtitleSize
    }),
    createSwitchRow(UI_LABELS.YT_HOVER_WORDS, UI_LABELS.YT_HOVER_WORDS_HINT, hoverWords, saveYouTubeHoverWords),
    status,
    allSettings
  );

  // Keep clicks inside the panel from reaching the player (which would pause or seek)
  stopPlayerEvents(element);
  // Keys pressed in the panel stay out of the player's shortcuts (Escape is handled on the document)
  element.addEventListener('keydown', event => {
    if (event.key !== 'Escape') event.stopPropagation();
  });

  return element;
}

function closePanel(): void {
  panel?.remove();
  panel = null;
  button?.setAttribute('aria-expanded', 'false');
  window.removeEventListener('click', handleOutsideClick, true);
  document.removeEventListener('keydown', handleEscape, true);
}

/**
 * A click outside the panel closes it. On the video it only closes the panel, like the player's
 * own menus, instead of also pausing or playing.
 */
function handleOutsideClick(event: MouseEvent): void {
  const target = event.target as Node;
  if (panel?.contains(target) || button?.contains(target)) return;

  const player = document.getElementById('movie_player');
  const onControls = target instanceof Element && target.closest('.ytp-chrome-bottom');
  if (player?.contains(target) && !onControls) {
    event.preventDefault();
    event.stopPropagation();
  }
  closePanel();
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  // Taken here, so the player doesn't also leave full screen
  event.preventDefault();
  event.stopPropagation();
  const focusWasInside = panel?.contains(document.activeElement);
  closePanel();
  if (focusWasInside) button?.focus();
}

async function togglePanel(): Promise<void> {
  if (panel) {
    closePanel();
    return;
  }

  const player = document.getElementById('movie_player');
  if (!player) return;

  // Rebuilt on each open, so it shows settings changed elsewhere and whether captions arrived
  panel = await createPanel();
  player.appendChild(panel);
  button?.setAttribute('aria-expanded', 'true');
  window.addEventListener('click', handleOutsideClick, true);
  document.addEventListener('keydown', handleEscape, true);
}

function createButton(): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  // ytp-button gives it the size and hover look of the player's own buttons
  element.className = `ytp-button ${BUTTON_CLASS}`;
  element.setAttribute('aria-haspopup', 'dialog');
  element.setAttribute('aria-expanded', 'false');
  element.title = UI_LABELS.YT_PANEL_BUTTON;
  element.setAttribute('aria-label', UI_LABELS.YT_PANEL_BUTTON);
  element.appendChild(createIcon(ICONS.TRIGGER, 24));
  element.addEventListener('click', event => {
    event.stopPropagation();
    togglePanel();
  });
  return element;
}

/**
 * Put the button in the control bar, before the player's settings button, unless it's there
 */
function insertButton(): void {
  insertQueued = false;
  if (button?.isConnected) return;

  const controls = document.querySelector('#movie_player .ytp-right-controls');
  if (!controls) return;

  button ??= createButton();
  // The settings button may sit in a group inside the controls, so insert into whatever holds it
  const settingsButton = controls.querySelector('.ytp-settings-button');
  if (settingsButton?.parentElement) {
    settingsButton.parentElement.insertBefore(button, settingsButton);
  } else {
    controls.prepend(button);
  }
}

export const playerPanel: YouTubeFeature = {
  start() {
    if (observer) return;
    insertButton();
    // The player appears after the page loads and can be rebuilt; put the button back when it goes
    observer = new MutationObserver(() => {
      if (button?.isConnected || insertQueued) return;
      insertQueued = true;
      requestAnimationFrame(insertButton);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  },
  stop() {
    observer?.disconnect();
    observer = null;
    closePanel();
    button?.remove();
  }
};
