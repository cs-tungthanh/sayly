/**
 * Shared utility functions for site management and settings
 */

import {
  DEFAULT_TARGET_LANGUAGE,
  DEFAULT_POPUP_MODE,
  POPUP_MODES,
  PopupMode,
  DEFAULT_DICTIONARY_SITE,
  DICTIONARY_SITES,
  DictionarySite,
  DEFAULT_THEME,
  THEMES,
  Theme,
  SPEECH_SPEEDS,
  DEFAULT_SPEECH_SPEED,
  DEFAULT_VOICE,
  DEFAULT_YOUTUBE_SEEK_SECONDS,
  YOUTUBE_SEEK_MIN_SECONDS,
  YOUTUBE_SEEK_MAX_SECONDS,
  YOUTUBE_SUBTITLE_MIN_LINES,
  YOUTUBE_SUBTITLE_MAX_LINES,
  DEFAULT_YOUTUBE_SUBTITLE_LINES,
  YOUTUBE_SUBTITLE_MIN_SIZE,
  YOUTUBE_SUBTITLE_MAX_SIZE,
  DEFAULT_YOUTUBE_SUBTITLE_SIZE,
  YOUTUBE_SHORTCUT_MODES,
  DEFAULT_YOUTUBE_SHORTCUT_MODE,
  type YouTubeShortcutMode
} from '../constants/app-constants';
import { LOG_PREFIX } from '../constants/messages';

/**
 * Normalize hostname by stripping www. prefix
 * @param hostname - The hostname to normalize
 * @returns Normalized hostname without www. prefix
 * @example
 * normalizeHostname('www.example.com') // returns 'example.com'
 * normalizeHostname('example.com') // returns 'example.com'
 */
export function normalizeHostname(hostname: string): string {
  return hostname.replace(/^www\./, '');
}

/**
 * Normalized hostname of a web page URL
 * @returns null for anything but http(s) pages (browser internal pages, extension pages, files)
 */
function getWebHostname(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? normalizeHostname(hostname) : null;
  } catch {
    return null;
  }
}

/**
 * Get current active tab's normalized hostname
 * @returns Normalized hostname or null when the tab is not a web page
 * @example
 * await getCurrentTabHostname() // returns 'example.com' or null
 */
export async function getCurrentTabHostname(): Promise<string | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return getWebHostname(tab?.url);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get current tab:`, error);
    return null;
  }
}

/**
 * Get the hostname of the most recently used web page tab in the focused window
 * (the options page opens in its own tab, so the active tab is the options page itself)
 * @returns Normalized hostname or null when no web page is open
 */
export async function getRecentWebTabHostname(): Promise<string | null> {
  try {
    const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
    const recentFirst = tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
    for (const tab of recentFirst) {
      const hostname = getWebHostname(tab.url);
      if (hostname) return hostname;
    }
    return null;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to query tabs:`, error);
    return null;
  }
}

/**
 * Get list of disabled sites from storage
 * @returns Array of disabled hostnames
 */
export async function getDisabledSites(): Promise<string[]> {
  try {
    const result = await chrome.storage.local.get('disabledSites');
    return result.disabledSites || [];
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to read storage:`, error);
    return [];
  }
}

/**
 * Save disabled sites to storage
 * @param sites - Array of hostnames to save as disabled
 */
export async function saveDisabledSites(sites: string[]): Promise<void> {
  try {
    await chrome.storage.local.set({ disabledSites: sites });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save to storage:`, error);
  }
}

/**
 * Check if extension is enabled on a specific site
 * @param hostname - The hostname to check
 * @param disabledSites - Array of disabled hostnames
 * @returns true if enabled, false if disabled
 */
export function isSiteEnabled(hostname: string, disabledSites: string[]): boolean {
  return !disabledSites.includes(hostname);
}

/**
 * Toggle extension enabled/disabled status for a site
 * @param hostname - The hostname to toggle
 * @param enabled - true to enable, false to disable
 */
export async function toggleSite(hostname: string, enabled: boolean): Promise<void> {
  const disabledSites = await getDisabledSites();

  if (enabled) {
    // Remove from disabled list
    const filtered = disabledSites.filter(site => site !== hostname);
    await saveDisabledSites(filtered);
  } else {
    // Add to disabled list
    if (!disabledSites.includes(hostname)) {
      disabledSites.push(hostname);
      await saveDisabledSites(disabledSites);
    }
  }
}

/**
 * Remove a site from the disabled list (enable it)
 * @param hostname - The hostname to remove from disabled list
 */
export async function removeSite(hostname: string): Promise<void> {
  const disabledSites = await getDisabledSites();
  const filtered = disabledSites.filter(site => site !== hostname);
  await saveDisabledSites(filtered);
}

/**
 * Get the translation target language from storage
 * @returns Language code, or TRANSLATION_OFF when translation is disabled
 */
export async function getTargetLanguage(): Promise<string> {
  try {
    const result = await chrome.storage.local.get('targetLanguage');
    return result.targetLanguage || DEFAULT_TARGET_LANGUAGE;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to read storage:`, error);
    return DEFAULT_TARGET_LANGUAGE;
  }
}

/**
 * Save the translation target language to storage
 * @param language - Language code, or TRANSLATION_OFF to disable translation
 */
export async function saveTargetLanguage(language: string): Promise<void> {
  try {
    await chrome.storage.local.set({ targetLanguage: language });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save to storage:`, error);
  }
}

/**
 * Get the user's Gemini API key
 * @returns The key, or an empty string when none is set
 */
export async function getGeminiApiKey(): Promise<string> {
  try {
    const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey');
    return typeof geminiApiKey === 'string' ? geminiApiKey : '';
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to read storage:`, error);
    return '';
  }
}

/**
 * Save the user's Gemini API key; an empty key removes it, which hides the popup's Gemini button
 */
export async function saveGeminiApiKey(key: string): Promise<void> {
  try {
    const trimmed = key.trim();
    if (trimmed) {
      await chrome.storage.local.set({ geminiApiKey: trimmed });
    } else {
      await chrome.storage.local.remove('geminiApiKey');
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save to storage:`, error);
  }
}

/**
 * Get what happens when text is selected
 * @returns The stored popup mode, or the default when unset or unknown
 */
export async function getPopupMode(): Promise<PopupMode> {
  try {
    const { popupMode } = await chrome.storage.local.get('popupMode');
    const modes: readonly string[] = Object.values(POPUP_MODES);
    return modes.includes(popupMode) ? popupMode : DEFAULT_POPUP_MODE;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to read storage:`, error);
    return DEFAULT_POPUP_MODE;
  }
}

/**
 * Save what happens when text is selected
 */
export async function savePopupMode(mode: PopupMode): Promise<void> {
  try {
    await chrome.storage.local.set({ popupMode: mode });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save to storage:`, error);
  }
}

/**
 * Get the site the dictionary link opens words on
 * @returns The stored site, or the default when unset or unknown
 */
export async function getDictionarySite(): Promise<DictionarySite> {
  try {
    const { dictionarySite } = await chrome.storage.local.get('dictionarySite');
    const sites: readonly string[] = Object.keys(DICTIONARY_SITES);
    return sites.includes(dictionarySite) ? dictionarySite : DEFAULT_DICTIONARY_SITE;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to read storage:`, error);
    return DEFAULT_DICTIONARY_SITE;
  }
}

/**
 * Save the site the dictionary link opens words on
 */
export async function saveDictionarySite(site: DictionarySite): Promise<void> {
  try {
    await chrome.storage.local.set({ dictionarySite: site });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save to storage:`, error);
  }
}

/**
 * Get whether copy buttons are shown, in the popup and next to the icon in "display icon" mode
 * @returns true unless turned off
 */
export async function getShowCopyButton(): Promise<boolean> {
  try {
    const { showCopyButton } = await chrome.storage.local.get('showCopyButton');
    return showCopyButton !== false;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to read storage:`, error);
    return true;
  }
}

/**
 * Save whether copy buttons are shown, in the popup and next to the icon
 */
export async function saveShowCopyButton(show: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ showCopyButton: show });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save to storage:`, error);
  }
}

/**
 * Get the speech speed (playback rate)
 * @returns The stored speed, or normal speed when unset or unknown
 */
export async function getSpeechSpeed(): Promise<number> {
  try {
    const { speechSpeed } = await chrome.storage.local.get('speechSpeed');
    const speeds: readonly number[] = SPEECH_SPEEDS;
    return speeds.includes(speechSpeed) ? speechSpeed : DEFAULT_SPEECH_SPEED;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to read storage:`, error);
    return DEFAULT_SPEECH_SPEED;
  }
}

/**
 * Save the speech speed
 */
export async function saveSpeechSpeed(speed: number): Promise<void> {
  try {
    await chrome.storage.local.set({ speechSpeed: speed });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save to storage:`, error);
  }
}

/**
 * Get whether the YouTube sentence shortcuts (A and D) are on
 * @returns true unless turned off
 */
export async function getYouTubeShortcutsEnabled(): Promise<boolean> {
  try {
    const { youtubeShortcutsEnabled } = await chrome.storage.local.get('youtubeShortcutsEnabled');
    return youtubeShortcutsEnabled !== false;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to read storage:`, error);
    return true;
  }
}

/**
 * Save whether the YouTube sentence shortcuts are on
 */
export async function saveYouTubeShortcutsEnabled(enabled: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ youtubeShortcutsEnabled: enabled });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save to storage:`, error);
  }
}

/**
 * Whether a value is a valid subtitle text size: a whole number of pixels within the allowed range
 */
export function isValidYouTubeSubtitleSize(size: unknown): size is number {
  return Number.isInteger(size)
    && (size as number) >= YOUTUBE_SUBTITLE_MIN_SIZE
    && (size as number) <= YOUTUBE_SUBTITLE_MAX_SIZE;
}

/**
 * Get the text size of Sayly's subtitles, in pixels
 * @returns The stored size, or the default when unset or invalid
 */
export async function getYouTubeSubtitleSize(): Promise<number> {
  try {
    const { youtubeSubtitleFontSize } = await chrome.storage.local.get('youtubeSubtitleFontSize');
    return isValidYouTubeSubtitleSize(youtubeSubtitleFontSize) ? youtubeSubtitleFontSize : DEFAULT_YOUTUBE_SUBTITLE_SIZE;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to read storage:`, error);
    return DEFAULT_YOUTUBE_SUBTITLE_SIZE;
  }
}

/**
 * Save the text size of Sayly's subtitles (callers validate with isValidYouTubeSubtitleSize)
 */
export async function saveYouTubeSubtitleSize(size: number): Promise<void> {
  try {
    await chrome.storage.local.set({ youtubeSubtitleFontSize: size });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save to storage:`, error);
  }
}

/**
 * Get whether hovering a word in YouTube captions pauses the video and shows the word's popup
 * @returns true unless turned off
 */
export async function getYouTubeHoverWords(): Promise<boolean> {
  try {
    const { youtubeHoverWords } = await chrome.storage.local.get('youtubeHoverWords');
    return youtubeHoverWords !== false;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to read storage:`, error);
    return true;
  }
}

/**
 * Save whether hovering caption words shows their popup
 */
export async function saveYouTubeHoverWords(enabled: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ youtubeHoverWords: enabled });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save to storage:`, error);
  }
}

/**
 * Get whether Sayly shows its own subtitles (whole sentences) in place of YouTube's captions
 * @returns true unless turned off
 */
export async function getYouTubeSubtitles(): Promise<boolean> {
  try {
    const { youtubeSubtitles } = await chrome.storage.local.get('youtubeSubtitles');
    return youtubeSubtitles !== false;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to read storage:`, error);
    return true;
  }
}

/**
 * Save whether Sayly shows its own subtitles
 */
export async function saveYouTubeSubtitles(enabled: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ youtubeSubtitles: enabled });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save to storage:`, error);
  }
}

/**
 * Whether a value is a valid number of subtitle sentences to show at once
 */
export function isValidYouTubeSubtitleLines(lines: unknown): lines is number {
  return Number.isInteger(lines)
    && (lines as number) >= YOUTUBE_SUBTITLE_MIN_LINES
    && (lines as number) <= YOUTUBE_SUBTITLE_MAX_LINES;
}

/**
 * Get how many recent sentences Sayly's subtitles show at once
 * @returns The stored count, or the default when unset or invalid
 */
export async function getYouTubeSubtitleLines(): Promise<number> {
  try {
    const { youtubeSubtitleLines } = await chrome.storage.local.get('youtubeSubtitleLines');
    return isValidYouTubeSubtitleLines(youtubeSubtitleLines) ? youtubeSubtitleLines : DEFAULT_YOUTUBE_SUBTITLE_LINES;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to read storage:`, error);
    return DEFAULT_YOUTUBE_SUBTITLE_LINES;
  }
}

/**
 * Save how many sentences Sayly's subtitles show (callers validate with isValidYouTubeSubtitleLines)
 */
export async function saveYouTubeSubtitleLines(lines: number): Promise<void> {
  try {
    await chrome.storage.local.set({ youtubeSubtitleLines: lines });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save to storage:`, error);
  }
}

/**
 * Get what the YouTube shortcuts (A and D) jump by: sentences or seconds
 * @returns The stored mode, or the default when unset or invalid
 */
export async function getYouTubeShortcutMode(): Promise<YouTubeShortcutMode> {
  try {
    const { youtubeShortcutMode } = await chrome.storage.local.get('youtubeShortcutMode');
    return Object.values(YOUTUBE_SHORTCUT_MODES).includes(youtubeShortcutMode)
      ? youtubeShortcutMode
      : DEFAULT_YOUTUBE_SHORTCUT_MODE;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to read storage:`, error);
    return DEFAULT_YOUTUBE_SHORTCUT_MODE;
  }
}

/**
 * Save what the YouTube shortcuts jump by
 */
export async function saveYouTubeShortcutMode(mode: YouTubeShortcutMode): Promise<void> {
  try {
    await chrome.storage.local.set({ youtubeShortcutMode: mode });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save to storage:`, error);
  }
}

/**
 * Get whether Sayly loads a YouTube video's captions by itself (hidden), so sentence jumps work with CC off
 * @returns true unless turned off
 */
export async function getYouTubeAutoLoadCaptions(): Promise<boolean> {
  try {
    const { youtubeAutoLoadCaptions } = await chrome.storage.local.get('youtubeAutoLoadCaptions');
    return youtubeAutoLoadCaptions !== false;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to read storage:`, error);
    return true;
  }
}

/**
 * Save whether Sayly loads YouTube captions by itself
 */
export async function saveYouTubeAutoLoadCaptions(enabled: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ youtubeAutoLoadCaptions: enabled });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save to storage:`, error);
  }
}

/**
 * Whether a value is a valid YouTube seek amount: a whole number of seconds within the allowed range
 */
export function isValidYouTubeSeekSeconds(seconds: unknown): seconds is number {
  return Number.isInteger(seconds)
    && (seconds as number) >= YOUTUBE_SEEK_MIN_SECONDS
    && (seconds as number) <= YOUTUBE_SEEK_MAX_SECONDS;
}

/**
 * Get how many seconds the YouTube shortcuts skip back or forward when a video has no captions
 * @returns The stored amount, or the default when unset or invalid
 */
export async function getYouTubeSeekSeconds(): Promise<number> {
  try {
    const { youtubeSeekSeconds } = await chrome.storage.local.get('youtubeSeekSeconds');
    return isValidYouTubeSeekSeconds(youtubeSeekSeconds) ? youtubeSeekSeconds : DEFAULT_YOUTUBE_SEEK_SECONDS;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to read storage:`, error);
    return DEFAULT_YOUTUBE_SEEK_SECONDS;
  }
}

/**
 * Save how many seconds the YouTube shortcuts skip (callers validate with isValidYouTubeSeekSeconds)
 */
export async function saveYouTubeSeekSeconds(seconds: number): Promise<void> {
  try {
    await chrome.storage.local.set({ youtubeSeekSeconds: seconds });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save to storage:`, error);
  }
}

/**
 * Get the voice: GOOGLE_VOICE, or a browser voice's voiceURI (which may not exist on this device)
 * @returns The stored voice, or Google's voice when unset
 */
export async function getVoice(): Promise<string> {
  try {
    const { voice } = await chrome.storage.local.get('voice');
    return typeof voice === 'string' && voice ? voice : DEFAULT_VOICE;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to read storage:`, error);
    return DEFAULT_VOICE;
  }
}

/**
 * Save the voice
 */
export async function saveVoice(voice: string): Promise<void> {
  try {
    await chrome.storage.local.set({ voice });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save to storage:`, error);
  }
}

/**
 * Get the color theme
 * @returns The stored theme, or the default (match system) when unset or unknown
 */
export async function getTheme(): Promise<Theme> {
  try {
    const { theme } = await chrome.storage.local.get('theme');
    const themes: readonly string[] = Object.values(THEMES);
    return themes.includes(theme) ? theme : DEFAULT_THEME;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to read storage:`, error);
    return DEFAULT_THEME;
  }
}

/**
 * Save the color theme
 */
export async function saveTheme(theme: Theme): Promise<void> {
  try {
    await chrome.storage.local.set({ theme });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save to storage:`, error);
  }
}

/**
 * Whether a theme setting means dark right now ("system" follows the browser's preference)
 */
export function isDarkTheme(theme: Theme): boolean {
  if (theme === THEMES.SYSTEM) return window.matchMedia('(prefers-color-scheme: dark)').matches;
  return theme === THEMES.DARK;
}
