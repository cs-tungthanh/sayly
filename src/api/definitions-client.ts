/**
 * Content-script side of English definitions: asks the background worker, which caches results
 */

import type { WordDefinitions } from './dictionary-api';
import { MESSAGE_ACTIONS } from '../constants/app-constants';
import { LOG_PREFIX } from '../constants/messages';

/**
 * Look up a word's English definitions, with examples
 * @returns The verb it is a form of and its meanings, or null when none are found or the request fails
 */
export async function requestEnglishDefinitions(word: string): Promise<WordDefinitions | null> {
  try {
    const response = await chrome.runtime.sendMessage({ action: MESSAGE_ACTIONS.LOOKUP_DEFINITIONS, word });
    return response?.definitions ?? null;
  } catch (error) {
    console.error(`${LOG_PREFIX} Definitions request failed:`, error);
    return null;
  }
}
