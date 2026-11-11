/**
 * User-facing messages and error text
 */

import {
  THEMES,
  Theme,
  SPEECH_SPEEDS,
  DEFAULT_SPEECH_SPEED,
  YOUTUBE_SHORTCUT_MODES,
  YouTubeShortcutMode
} from './app-constants';

export const ERROR_MESSAGES = {
  ERROR_LOADING: 'Error loading',
  UNABLE_TO_DETECT: 'Unable to detect current site',
  NO_SITES_DISABLED: 'No sites disabled yet',
} as const;

export const UI_LABELS = {
  PLAY_TOOLTIP: 'Read out loud',
  STOP_TOOLTIP: 'Stop',
  ENABLED: 'Enabled',
  DISABLED: 'Disabled',
  DRAG_TOOLTIP: 'Drag to move',
  CLOSE_TOOLTIP: 'Close (Esc)',
  PLAY_WORD_TOOLTIP: 'Hear this word',
  WORD_TOOLTIP: 'Click for pronunciation',
  LOOKING_UP: 'Looking up…',
  NO_IPA: 'No IPA found',
  ENABLE_ON_SITE: 'Enable on this site',
  TRANSLATION_OFF: 'Off (no translation)',
  SUGGESTED_LANGUAGES: 'Suggested',
  OTHER_LANGUAGES: 'Other languages',
  TRIGGER_TOOLTIP: 'Show pronunciation',
  COPY_TOOLTIP: 'Copy',
  COPIED: 'Copied',
  COPY_FAILED: "Couldn't copy",
  GEMINI_BUTTON: 'Say it naturally',
  GEMINI_TOOLTIP: 'Ask Gemini how a native speaker would say this in English',
  GEMINI_LABEL: 'Gemini',
  GEMINI_FAILED: "Gemini couldn't translate this",
  POPUP_MODE_IMMEDIATE: 'Immediately display',
  POPUP_MODE_ICON: 'Display icon',
  POPUP_MODE_NONE: "Don't display",
  SITE_ON: 'On for this site',
  SITE_OFF: 'Off for this site',
  BROWSER_PAGE: 'Browser page',
  BROWSER_PAGE_STATUS: "Sayly can't run on browser pages",
  ALL_SETTINGS: 'All settings',
  DICTIONARY_SITE: 'Open words in',
  THEME_SYSTEM: 'Match system',
  THEME_LIGHT: 'Light',
  THEME_DARK: 'Dark',
  SELECTION_LEGEND: 'When you select text',
  MODE_IMMEDIATE_SHORT: 'Popup',
  MODE_ICON_SHORT: 'Icon',
  MODE_NONE_SHORT: 'Off',
  MODE_IMMEDIATE_HINT: 'The popup opens as soon as you select text.',
  MODE_ICON_HINT: 'A small icon appears by the selection. Click it to open the popup.',
  MODE_NONE_HINT: 'Nothing appears when you select text.',
  VOICE_AUTO: 'Automatic',
  VOICE_GOOGLE: 'Google',
  SPEED_NORMAL: 'Normal',
  YT_PANEL_BUTTON: 'Sayly settings',
  YT_PANEL_TITLE: 'Sayly',
  YT_SHORTCUTS: 'A / D shortcuts',
  YT_SHORTCUTS_SENTENCE_HINT: 'A: hear the sentence again (twice: the one before) · D: next sentence',
  YT_SHORTCUTS_SECONDS_HINT: 'A: skip back · D: skip forward',
  YT_SHORTCUT_MODE: 'Jump by',
  YT_SHORTCUT_MODE_SENTENCE: 'Sentence',
  YT_SHORTCUT_MODE_SECONDS: 'Seconds',
  YT_SKIP_SECONDS: 'Without captions, skip by',
  YT_SKIP_SECONDS_ALWAYS: 'Skip by',
  YT_SKIP_LESS: 'Skip less',
  YT_SKIP_MORE: 'Skip more',
  YT_CAPTIONS_READY: 'Sentences ready from this video\'s captions',
  YT_CAPTIONS_MISSING: 'Turn on captions (CC) once to load this video\'s sentences',
  YT_CAPTIONS_NONE: 'No captions loaded for this video',
  YT_SUBTITLES: 'Sayly subtitles',
  YT_SUBTITLES_HINT: 'Whole sentences in place of YouTube\'s captions, with the spoken word marked',
  YT_SUBTITLE_LINES: 'Sentences shown',
  YT_SUBTITLE_LINES_LESS: 'Show fewer sentences',
  YT_SUBTITLE_LINES_MORE: 'Show more sentences',
  YT_SUBTITLE_SIZE: 'Subtitle size',
  YT_SUBTITLE_SIZE_LESS: 'Smaller subtitles',
  YT_SUBTITLE_SIZE_MORE: 'Larger subtitles',
  YT_HOVER_WORDS: 'Hover words in captions',
  YT_HOVER_WORDS_HINT: 'Pauses on a word to show its popup; resumes when you move away',
  YT_ALL_SETTINGS: 'All settings',
} as const;

export const LOG_PREFIX = '[Sayly]';

/** The Theme setting's choices, as shown in the pickers */
export const THEME_CHOICES: ReadonlyArray<{ theme: Theme; name: string }> = [
  { theme: THEMES.SYSTEM, name: UI_LABELS.THEME_SYSTEM },
  { theme: THEMES.LIGHT, name: UI_LABELS.THEME_LIGHT },
  { theme: THEMES.DARK, name: UI_LABELS.THEME_DARK }
];

/** What the A and D shortcuts can jump by, as shown in the pickers */
export const SHORTCUT_MODE_CHOICES: ReadonlyArray<{ mode: YouTubeShortcutMode; name: string }> = [
  { mode: YOUTUBE_SHORTCUT_MODES.SENTENCE, name: UI_LABELS.YT_SHORTCUT_MODE_SENTENCE },
  { mode: YOUTUBE_SHORTCUT_MODES.SECONDS, name: UI_LABELS.YT_SHORTCUT_MODE_SECONDS }
];

/**
 * The seconds setting's label: jumping by sentence uses the seconds only for videos without captions
 */
export function seekSecondsLabel(mode: YouTubeShortcutMode): string {
  return mode === YOUTUBE_SHORTCUT_MODES.SENTENCE ? UI_LABELS.YT_SKIP_SECONDS : UI_LABELS.YT_SKIP_SECONDS_ALWAYS;
}

/** The speech speed setting's choices, as shown in the pickers */
export const SPEED_CHOICES: ReadonlyArray<{ speed: number; name: string }> = SPEECH_SPEEDS.map(speed => ({
  speed,
  name: speed === DEFAULT_SPEECH_SPEED ? `${speed}× (${UI_LABELS.SPEED_NORMAL})` : `${speed}×`
}));
