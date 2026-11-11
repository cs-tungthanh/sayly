/**
 * Content-script side of translation: asks the background worker to translate
 */

import type { TranslationResult } from './translate-api';
import { TRANSLATION_OFF, MESSAGE_ACTIONS } from '../constants/app-constants';
import { LOG_PREFIX } from '../constants/messages';
import { getTargetLanguage, getGeminiApiKey } from '../shared/utils';
import { cachedSetting } from '../shared/settings-cache';

const readTargetLanguage = cachedSetting('targetLanguage', getTargetLanguage);
const readGeminiApiKey = cachedSetting('geminiApiKey', getGeminiApiKey);

/** Gemini's answer: the translation, or why there is none */
export type GeminiTranslation = { text: string } | { error: string };

/**
 * Whether the popup offers Gemini: the user has saved an API key
 */
export async function isGeminiAvailable(): Promise<boolean> {
  return (await readGeminiApiKey()) !== '';
}

/**
 * Ask Gemini how a native speaker would say the text out loud in English
 */
export async function requestGeminiTranslation(text: string): Promise<GeminiTranslation> {
  try {
    const response = await chrome.runtime.sendMessage({ action: MESSAGE_ACTIONS.TRANSLATE_GEMINI, text });
    if (typeof response?.text === 'string') return { text: response.text };
    return { error: response?.error || 'No response' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Translate text into the user's target language
 * @returns Translation (with dictionary entries for a single word), or null when translation is off or fails
 */
export async function requestTranslation(text: string): Promise<TranslationResult | null> {
  const to = await readTargetLanguage();
  if (to === TRANSLATION_OFF) return null;

  try {
    const response = await chrome.runtime.sendMessage({ action: MESSAGE_ACTIONS.TRANSLATE, text, to });
    if (response?.error) {
      console.warn(`${LOG_PREFIX} Translation failed:`, response.error);
      return null;
    }
    return response?.result ?? null;
  } catch (error) {
    console.error(`${LOG_PREFIX} Translation request failed:`, error);
    return null;
  }
}
