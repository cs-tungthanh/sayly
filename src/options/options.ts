/**
 * Extension options page for managing disabled sites
 */

import {
  getRecentWebTabHostname,
  getDisabledSites,
  isSiteEnabled,
  toggleSite,
  removeSite,
  getTargetLanguage,
  saveTargetLanguage,
  getGeminiApiKey,
  saveGeminiApiKey,
  getPopupMode,
  savePopupMode,
  getDictionarySite,
  saveDictionarySite,
  getShowCopyButton,
  saveShowCopyButton,
  getTheme,
  saveTheme,
  getSpeechSpeed,
  saveSpeechSpeed,
  getVoice,
  saveVoice,
  getYouTubeSeekSeconds,
  saveYouTubeSeekSeconds,
  isValidYouTubeSeekSeconds,
  getYouTubeShortcutsEnabled,
  saveYouTubeShortcutsEnabled,
  getYouTubeAutoLoadCaptions,
  saveYouTubeAutoLoadCaptions,
  getYouTubeShortcutMode,
  saveYouTubeShortcutMode,
  getYouTubeHoverWords,
  saveYouTubeHoverWords,
  getYouTubeSubtitles,
  saveYouTubeSubtitles,
  getYouTubeSubtitleLines,
  saveYouTubeSubtitleLines,
  isValidYouTubeSubtitleLines,
  getYouTubeSubtitleSize,
  saveYouTubeSubtitleSize,
  isValidYouTubeSubtitleSize
} from '../shared/utils';
import { speechService } from '../speech/speech-service';
import { getOptionalElement, onDOMReady, applyPageTheme, fillTranslationSelect } from '../shared/dom-helpers';
import {
  ERROR_MESSAGES,
  UI_LABELS,
  THEME_CHOICES,
  SPEED_CHOICES,
  SHORTCUT_MODE_CHOICES,
  seekSecondsLabel
} from '../constants/messages';
import {
  POPUP_MODES,
  PopupMode,
  DICTIONARY_SITES,
  DictionarySite,
  Theme,
  GOOGLE_VOICE,
  AUTO_VOICE,
  VOICE_SAMPLE_TEXT,
  YOUTUBE_SUBTITLE_MIN_LINES,
  YOUTUBE_SUBTITLE_MAX_LINES,
  YouTubeShortcutMode,
  GEMINI_API_KEY_URL
} from '../constants/app-constants';

/**
 * DOM element references
 */
interface OptionsElements {
  currentSite: HTMLElement | null;
  enableToggle: HTMLInputElement | null;
  toggleLabel: HTMLElement | null;
  disabledSitesList: HTMLElement | null;
  targetLanguage: HTMLSelectElement | null;
  geminiApiKey: HTMLInputElement | null;
  geminiApiKeyLink: HTMLAnchorElement | null;
  popupMode: HTMLSelectElement | null;
  dictionarySite: HTMLSelectElement | null;
  showCopyButton: HTMLInputElement | null;
  theme: HTMLSelectElement | null;
  voice: HTMLSelectElement | null;
  speechSpeed: HTMLSelectElement | null;
  voicePreview: HTMLButtonElement | null;
  youtubeSeekSeconds: HTMLInputElement | null;
  youtubeShortcutsEnabled: HTMLInputElement | null;
  youtubeAutoLoadCaptions: HTMLInputElement | null;
  youtubeHoverWords: HTMLInputElement | null;
  youtubeSubtitles: HTMLInputElement | null;
  youtubeSubtitleLines: HTMLSelectElement | null;
  youtubeSubtitleSize: HTMLInputElement | null;
  youtubeShortcutMode: HTMLSelectElement | null;
  youtubeSeekLabel: HTMLElement | null;
}

/**
 * Get DOM elements (all optional to handle partial templates)
 */
function getOptionsElements(): OptionsElements {
  return {
    currentSite: getOptionalElement<HTMLElement>('currentSite'),
    enableToggle: getOptionalElement<HTMLInputElement>('enableToggle'),
    toggleLabel: getOptionalElement<HTMLElement>('toggleLabel'),
    disabledSitesList: getOptionalElement<HTMLElement>('disabledSitesList'),
    targetLanguage: getOptionalElement<HTMLSelectElement>('targetLanguage'),
    geminiApiKey: getOptionalElement<HTMLInputElement>('geminiApiKey'),
    geminiApiKeyLink: getOptionalElement<HTMLAnchorElement>('geminiApiKeyLink'),
    popupMode: getOptionalElement<HTMLSelectElement>('popupMode'),
    dictionarySite: getOptionalElement<HTMLSelectElement>('dictionarySite'),
    showCopyButton: getOptionalElement<HTMLInputElement>('showCopyButton'),
    theme: getOptionalElement<HTMLSelectElement>('theme'),
    voice: getOptionalElement<HTMLSelectElement>('voice'),
    speechSpeed: getOptionalElement<HTMLSelectElement>('speechSpeed'),
    voicePreview: getOptionalElement<HTMLButtonElement>('voicePreview'),
    youtubeSeekSeconds: getOptionalElement<HTMLInputElement>('youtubeSeekSeconds'),
    youtubeShortcutsEnabled: getOptionalElement<HTMLInputElement>('youtubeShortcutsEnabled'),
    youtubeAutoLoadCaptions: getOptionalElement<HTMLInputElement>('youtubeAutoLoadCaptions'),
    youtubeHoverWords: getOptionalElement<HTMLInputElement>('youtubeHoverWords'),
    youtubeSubtitles: getOptionalElement<HTMLInputElement>('youtubeSubtitles'),
    youtubeSubtitleLines: getOptionalElement<HTMLSelectElement>('youtubeSubtitleLines'),
    youtubeSubtitleSize: getOptionalElement<HTMLInputElement>('youtubeSubtitleSize'),
    youtubeShortcutMode: getOptionalElement<HTMLSelectElement>('youtubeShortcutMode'),
    youtubeSeekLabel: getOptionalElement<HTMLElement>('youtubeSeekLabel')
  };
}

/**
 * Render translation target language selector
 */
async function renderTargetLanguage(elements: OptionsElements): Promise<void> {
  const select = elements.targetLanguage;
  if (!select) {
    return;
  }

  fillTranslationSelect(select);

  select.value = await getTargetLanguage();

  // Content scripts listen for storage changes, so no reload is needed
  select.addEventListener('change', () => saveTargetLanguage(select.value));
}

/**
 * Render the selector for what happens when text is selected
 */
async function renderPopupMode(elements: OptionsElements): Promise<void> {
  const select = elements.popupMode;
  if (!select) {
    return;
  }

  const options: { mode: PopupMode; name: string }[] = [
    { mode: POPUP_MODES.IMMEDIATE, name: UI_LABELS.POPUP_MODE_IMMEDIATE },
    { mode: POPUP_MODES.ICON, name: UI_LABELS.POPUP_MODE_ICON },
    { mode: POPUP_MODES.NONE, name: UI_LABELS.POPUP_MODE_NONE }
  ];
  options.forEach(({ mode, name }) => {
    select.appendChild(new Option(name, mode));
  });

  select.value = await getPopupMode();

  // Content scripts listen for storage changes, so no reload is needed
  select.addEventListener('change', () => savePopupMode(select.value as PopupMode));
}

/**
 * Render the theme picker and apply the theme to this page, also as it changes
 */
async function renderTheme(elements: OptionsElements): Promise<void> {
  const current = await getTheme();
  applyPageTheme(current);

  const select = elements.theme;
  if (!select) {
    return;
  }

  THEME_CHOICES.forEach(({ theme, name }) => {
    select.appendChild(new Option(name, theme));
  });

  select.value = current;
  select.addEventListener('change', () => {
    const theme = select.value as Theme;
    applyPageTheme(theme);
    saveTheme(theme);
  });
}

/**
 * Render the Gemini API key field; saved when it changes, and an empty field removes the key
 */
async function renderGeminiApiKey(elements: OptionsElements): Promise<void> {
  if (elements.geminiApiKeyLink) elements.geminiApiKeyLink.href = GEMINI_API_KEY_URL;

  const input = elements.geminiApiKey;
  if (!input) {
    return;
  }

  input.value = await getGeminiApiKey();
  // Saved on every edit: a pasted key is kept even if the tab is closed without leaving the field
  input.addEventListener('input', () => saveGeminiApiKey(input.value));
}

/**
 * Render the switch for copy buttons in the popup and the selection bar
 */
async function renderShowCopyButton(elements: OptionsElements): Promise<void> {
  const checkbox = elements.showCopyButton;
  if (!checkbox) {
    return;
  }

  checkbox.checked = await getShowCopyButton();
  checkbox.addEventListener('change', () => saveShowCopyButton(checkbox.checked));
}

/**
 * Render the picker for the site that dictionary links open
 */
async function renderDictionarySite(elements: OptionsElements): Promise<void> {
  const select = elements.dictionarySite;
  if (!select) {
    return;
  }

  Object.entries(DICTIONARY_SITES).forEach(([id, { name }]) => {
    select.appendChild(new Option(name, id));
  });

  select.value = await getDictionarySite();
  select.addEventListener('change', () => saveDictionarySite(select.value as DictionarySite));
}

/**
 * Render the voice picker: Google's voice, then the browser's English voices
 */
async function renderVoice(elements: OptionsElements): Promise<void> {
  const select = elements.voice;
  if (!select) {
    return;
  }

  const [voices, autoVoice, current] = await Promise.all([
    speechService.getEnglishVoices(),
    speechService.getAutoVoice(),
    getVoice()
  ]);
  // Name the voice Automatic plays in this browser, without the language suffix ("… - English (United States)")
  const autoName = autoVoice ? autoVoice.name.split(' - ')[0] : UI_LABELS.VOICE_GOOGLE;
  select.appendChild(new Option(`${UI_LABELS.VOICE_AUTO}: ${autoName}`, AUTO_VOICE));
  select.appendChild(new Option(UI_LABELS.VOICE_GOOGLE, GOOGLE_VOICE));
  voices.forEach(voice => {
    select.appendChild(new Option(`${voice.name} (${voice.lang})`, voice.voiceURI));
  });

  // A stored voice that is no longer installed plays with Google's, so show that
  const listed = current === AUTO_VOICE || voices.some(voice => voice.voiceURI === current);
  select.value = listed ? current : GOOGLE_VOICE;
  select.addEventListener('change', () => saveVoice(select.value));
}

/**
 * Render the speech speed picker
 */
async function renderSpeechSpeed(elements: OptionsElements): Promise<void> {
  const select = elements.speechSpeed;
  if (!select) {
    return;
  }

  SPEED_CHOICES.forEach(({ speed, name }) => {
    select.appendChild(new Option(name, String(speed)));
  });

  select.value = String(await getSpeechSpeed());
  select.addEventListener('change', () => saveSpeechSpeed(Number(select.value)));
}

/**
 * Render the switch for the YouTube sentence shortcuts
 */
async function renderYouTubeShortcutsEnabled(elements: OptionsElements): Promise<void> {
  const checkbox = elements.youtubeShortcutsEnabled;
  if (!checkbox) {
    return;
  }

  checkbox.checked = await getYouTubeShortcutsEnabled();
  checkbox.addEventListener('change', () => saveYouTubeShortcutsEnabled(checkbox.checked));
}

/**
 * Render the switch for loading YouTube captions automatically
 */
async function renderYouTubeAutoLoadCaptions(elements: OptionsElements): Promise<void> {
  const checkbox = elements.youtubeAutoLoadCaptions;
  if (!checkbox) {
    return;
  }

  checkbox.checked = await getYouTubeAutoLoadCaptions();
  checkbox.addEventListener('change', () => saveYouTubeAutoLoadCaptions(checkbox.checked));
}

/**
 * Render the switch for Sayly's YouTube subtitles
 */
async function renderYouTubeSubtitles(elements: OptionsElements): Promise<void> {
  const checkbox = elements.youtubeSubtitles;
  if (!checkbox) {
    return;
  }

  checkbox.checked = await getYouTubeSubtitles();
  checkbox.addEventListener('change', () => saveYouTubeSubtitles(checkbox.checked));
}

/**
 * Render the picker for how many sentences Sayly's subtitles show at once
 */
async function renderYouTubeSubtitleLines(elements: OptionsElements): Promise<void> {
  const select = elements.youtubeSubtitleLines;
  if (!select) {
    return;
  }

  for (let lines = YOUTUBE_SUBTITLE_MIN_LINES; lines <= YOUTUBE_SUBTITLE_MAX_LINES; lines++) {
    select.appendChild(new Option(String(lines), String(lines)));
  }

  select.value = String(await getYouTubeSubtitleLines());
  select.addEventListener('change', () => {
    const lines = Number(select.value);
    if (isValidYouTubeSubtitleLines(lines)) saveYouTubeSubtitleLines(lines);
  });
}

/**
 * Render the field for the text size of Sayly's subtitles, in pixels
 */
async function renderYouTubeSubtitleSize(elements: OptionsElements): Promise<void> {
  const input = elements.youtubeSubtitleSize;
  if (!input) {
    return;
  }

  let saved = await getYouTubeSubtitleSize();
  input.value = String(saved);

  // Save each valid value as it's typed; content scripts listen for storage changes
  input.addEventListener('input', () => {
    const size = input.valueAsNumber;
    if (isValidYouTubeSubtitleSize(size) && size !== saved) {
      saved = size;
      saveYouTubeSubtitleSize(size);
    }
  });

  // Leaving the field with an invalid value puts back the one that's in effect
  input.addEventListener('change', () => {
    if (!isValidYouTubeSubtitleSize(input.valueAsNumber)) input.value = String(saved);
  });
}

/**
 * Render the picker for what A and D jump by; the seconds field's label follows it
 */
async function renderYouTubeShortcutMode(elements: OptionsElements): Promise<void> {
  const select = elements.youtubeShortcutMode;
  if (!select) {
    return;
  }

  SHORTCUT_MODE_CHOICES.forEach(({ mode, name }) => {
    select.appendChild(new Option(name, mode));
  });

  const showMode = () => {
    if (elements.youtubeSeekLabel) {
      elements.youtubeSeekLabel.textContent = seekSecondsLabel(select.value as YouTubeShortcutMode);
    }
  };

  select.value = await getYouTubeShortcutMode();
  showMode();
  select.addEventListener('change', () => {
    showMode();
    saveYouTubeShortcutMode(select.value as YouTubeShortcutMode);
  });
}

/**
 * Render the switch for hovering words in YouTube captions
 */
async function renderYouTubeHoverWords(elements: OptionsElements): Promise<void> {
  const checkbox = elements.youtubeHoverWords;
  if (!checkbox) {
    return;
  }

  checkbox.checked = await getYouTubeHoverWords();
  checkbox.addEventListener('change', () => saveYouTubeHoverWords(checkbox.checked));
}

/**
 * Render the field for how many seconds the YouTube shortcuts skip when there are no captions
 */
async function renderYouTubeSeekSeconds(elements: OptionsElements): Promise<void> {
  const input = elements.youtubeSeekSeconds;
  if (!input) {
    return;
  }

  let saved = await getYouTubeSeekSeconds();
  input.value = String(saved);

  // Save each valid value as it's typed; content scripts listen for storage changes
  input.addEventListener('input', () => {
    const seconds = input.valueAsNumber;
    if (isValidYouTubeSeekSeconds(seconds) && seconds !== saved) {
      saved = seconds;
      saveYouTubeSeekSeconds(seconds);
    }
  });

  // Leaving the field with an invalid value puts back the one that's in effect
  input.addEventListener('change', () => {
    if (!isValidYouTubeSeekSeconds(input.valueAsNumber)) input.value = String(saved);
  });
}

/**
 * Wire the button that plays a sample with the chosen voice and speed
 */
function setupVoicePreview(elements: OptionsElements): void {
  elements.voicePreview?.addEventListener('click', () => speechService.speak(VOICE_SAMPLE_TEXT));
}

/**
 * Show whether the extension is enabled on the current site
 */
async function renderCurrentSite(elements: OptionsElements, hostname: string | null): Promise<void> {
  if (!elements.currentSite || !elements.enableToggle || !elements.toggleLabel) {
    return;
  }

  if (!hostname) {
    elements.currentSite.textContent = ERROR_MESSAGES.UNABLE_TO_DETECT;
    elements.enableToggle.disabled = true;
    elements.toggleLabel.textContent = UI_LABELS.ENABLE_ON_SITE;
    return;
  }

  elements.currentSite.textContent = hostname;

  const enabled = isSiteEnabled(hostname, await getDisabledSites());
  elements.enableToggle.checked = enabled;
  elements.enableToggle.disabled = false;
  elements.toggleLabel.textContent = enabled ? UI_LABELS.ENABLED : UI_LABELS.DISABLED;
}

/**
 * Wire the current site toggle once; renders only update its state
 */
function setupCurrentSiteToggle(elements: OptionsElements, hostname: string | null): void {
  const { enableToggle } = elements;
  if (!enableToggle || !hostname) {
    return;
  }

  enableToggle.addEventListener('change', async () => {
    await toggleSite(hostname, enableToggle.checked);
    await renderAll(elements, hostname);
  });
}

/**
 * Create a single site list item
 */
function createSiteItem(site: string, onRemove: () => void): HTMLElement {
  const item = document.createElement('div');
  item.className = 'site-item';

  const name = document.createElement('span');
  name.className = 'site-name';
  name.textContent = site;

  const removeButton = document.createElement('button');
  removeButton.className = 'remove-btn';
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', onRemove);

  item.append(name, removeButton);
  return item;
}

/**
 * Render disabled sites list
 */
async function renderDisabledSites(elements: OptionsElements, hostname: string | null): Promise<void> {
  const list = elements.disabledSitesList;
  if (!list) {
    return;
  }

  const disabledSites = await getDisabledSites();

  if (disabledSites.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-message';
    empty.textContent = ERROR_MESSAGES.NO_SITES_DISABLED;
    list.replaceChildren(empty);
    return;
  }

  list.replaceChildren(
    ...[...disabledSites].sort().map(site =>
      createSiteItem(site, async () => {
        await removeSite(site);
        await renderAll(elements, hostname);
      })
    )
  );
}

/**
 * Re-render everything that depends on the disabled sites list
 */
async function renderAll(elements: OptionsElements, hostname: string | null): Promise<void> {
  await Promise.all([
    renderCurrentSite(elements, hostname),
    renderDisabledSites(elements, hostname)
  ]);
}

/**
 * Initialize options page
 */
async function initOptions(): Promise<void> {
  const elements = getOptionsElements();
  const hostname = await getRecentWebTabHostname();
  setupCurrentSiteToggle(elements, hostname);
  setupVoicePreview(elements);
  await Promise.all([
    renderAll(elements, hostname),
    renderPopupMode(elements),
    renderDictionarySite(elements),
    renderShowCopyButton(elements),
    renderTheme(elements),
    renderVoice(elements),
    renderSpeechSpeed(elements),
    renderTargetLanguage(elements),
    renderGeminiApiKey(elements),
    renderYouTubeSeekSeconds(elements),
    renderYouTubeShortcutsEnabled(elements),
    renderYouTubeAutoLoadCaptions(elements),
    renderYouTubeHoverWords(elements),
    renderYouTubeSubtitles(elements),
    renderYouTubeSubtitleLines(elements),
    renderYouTubeSubtitleSize(elements),
    renderYouTubeShortcutMode(elements)
  ]);
}

// Initialize when DOM is ready
onDOMReady(initOptions);
