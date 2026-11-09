/**
 * Translation API client (runs in the background service worker)
 *
 * Google's free translate endpoint is tried first; MyMemory is the fallback.
 */

import {
  GOOGLE_TRANSLATE_URL,
  GOOGLE_TRANSLATE_CLIENTS,
  MYMEMORY_TRANSLATE_URL,
  MYMEMORY_MAX_CHARS,
  TRANSLATION_MAX_CHARS,
  ENGLISH_LANG,
  AUTO_DETECT_LANG,
  VIETNAMESE_LANG,
  DICTIONARY_MAX_MEANINGS,
  TRANSLATION_CACHE_SIZE
} from '../constants/app-constants';
import { PromiseCache } from '../shared/promise-cache';
import { isValidSingleWord, isVietnamese } from '../text/text-processor';

/** One part of speech for a single word, e.g. noun → ["gian kế", "hành động"] */
export interface DictionaryEntry {
  partOfSpeech: string;
  meanings: string[];
}

export interface TranslationResult {
  text: string;
  provider: 'google' | 'mymemory';
  /** Meanings by part of speech; only filled for a single word translated by Google */
  dictionary: DictionaryEntry[];
}

type GoogleTranslation = Pick<TranslationResult, 'text' | 'dictionary'> & {
  /** Source language Google detected, when asked to detect it */
  detected: string | null;
};

/** Which language to translate from and into */
interface LanguagePair {
  from: string;
  to: string;
}

const translationCache = new PromiseCache<TranslationResult | null>(TRANSLATION_CACHE_SIZE);

// Index into GOOGLE_TRANSLATE_CLIENTS of the client string that last answered
let googleClientIndex = 0;

/**
 * Translate with Google's undocumented endpoint using one client string
 */
async function translateWithGoogleClient(
  text: string,
  { from, to }: LanguagePair,
  client: string
): Promise<GoogleTranslation> {
  const url = new URL(GOOGLE_TRANSLATE_URL);
  url.searchParams.set('client', client);
  url.searchParams.set('sl', from);
  url.searchParams.set('tl', to);
  url.searchParams.set('dt', 't');
  // Dictionary entries (part of speech + meanings) only make sense for one word
  if (isSingleWord(text, from)) url.searchParams.append('dt', 'bd');
  url.searchParams.set('q', text);

  const response = await fetch(url.toString(), { credentials: 'omit' });
  if (!response.ok) throw new Error(`Google HTTP ${response.status}`);

  // A refused client gets an HTML abuse page instead of JSON
  // NFC: dictionary entries come decomposed with deprecated tone marks (U+0340), which iOS fonts draw as boxes
  const body = (await response.text()).normalize('NFC');
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`Google returned non-JSON: ${body.slice(0, 120)}`);
  }

  // Response shape: [[["translated", "original", ...], ...], ...]
  const segments = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
  const translated = segments.map((segment: unknown) => (Array.isArray(segment) && segment[0]) || '').join('');
  if (!translated) throw new Error('Google returned an empty translation');

  // data[2] is the detected source language, e.g. "fr"
  const detected = Array.isArray(data) && typeof data[2] === 'string' ? data[2] : null;

  return { text: translated, dictionary: parseGoogleDictionary(data), detected };
}

/**
 * Whether text is one word, so Google can list its meanings; a non-English word may carry accents
 */
function isSingleWord(text: string, from: string): boolean {
  return from === ENGLISH_LANG ? isValidSingleWord(text) : /^[\p{L}'-]+$/u.test(text);
}

/**
 * Whether two language codes name the same language, ignoring the region ("zh-CN" and "zh")
 */
function isSameLanguage(a: string, b: string): boolean {
  return a.split('-')[0].toLowerCase() === b.split('-')[0].toLowerCase();
}

/**
 * Read dictionary entries from a dt=bd response
 * Shape: data[1] = [["noun", ["meaning", ...], ...], ...]
 */
function parseGoogleDictionary(data: unknown): DictionaryEntry[] {
  const entries = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];

  return entries.flatMap((entry: unknown) => {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Array.isArray(entry[1])) return [];

    const meanings = entry[1]
      .filter((meaning: unknown): meaning is string => typeof meaning === 'string')
      .slice(0, DICTIONARY_MAX_MEANINGS);
    return meanings.length > 0 ? [{ partOfSpeech: entry[0], meanings }] : [];
  });
}

/**
 * Translate with Google, rotating to the next client string when one is refused.
 * Google gates the endpoint per client value, so the one that answered is remembered.
 */
async function translateWithGoogle(text: string, languages: LanguagePair): Promise<GoogleTranslation> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < GOOGLE_TRANSLATE_CLIENTS.length; attempt++) {
    try {
      return await translateWithGoogleClient(text, languages, GOOGLE_TRANSLATE_CLIENTS[googleClientIndex]);
    } catch (error) {
      lastError = error;
      googleClientIndex = (googleClientIndex + 1) % GOOGLE_TRANSLATE_CLIENTS.length;
    }
  }

  throw lastError;
}

/**
 * Translate with MyMemory (free, ~5k words/day, 500 chars per request)
 */
async function translateWithMyMemory(text: string, { from, to }: LanguagePair): Promise<string> {
  if (text.length > MYMEMORY_MAX_CHARS) {
    throw new Error(`MyMemory accepts at most ${MYMEMORY_MAX_CHARS} characters`);
  }

  const params = new URLSearchParams({ q: text, langpair: `${from}|${to}` });
  const response = await fetch(`${MYMEMORY_TRANSLATE_URL}?${params}`, { credentials: 'omit' });
  if (!response.ok) throw new Error(`MyMemory HTTP ${response.status}`);

  const data = await response.json();
  if (Number(data?.responseStatus) !== 200) {
    throw new Error(`MyMemory: ${data?.responseDetails || 'unknown error'}`);
  }

  const translated = data?.responseData?.translatedText;
  if (!translated) throw new Error('MyMemory returned an empty translation');

  return translated;
}

/**
 * Translate text in any language into the target language, or Vietnamese text into English,
 * reusing earlier results
 * @returns The translation, or null when the text is already English and English is the target
 * @throws Error when the text is too long or every provider fails
 */
export function translate(text: string, to: string): Promise<TranslationResult | null> {
  // Vietnamese is caught here so the common case needs no second request after detection
  const languages: LanguagePair = isVietnamese(text)
    ? { from: VIETNAMESE_LANG, to: ENGLISH_LANG }
    : { from: AUTO_DETECT_LANG, to };
  const key = `${languages.from}|${languages.to}\n${text}`;
  return translationCache.get(key, () => translateUncached(text, languages));
}

/**
 * Translate with Google, falling back to MyMemory
 */
async function translateUncached(text: string, languages: LanguagePair): Promise<TranslationResult | null> {
  if (text.length > TRANSLATION_MAX_CHARS) {
    throw new Error(`Text is longer than ${TRANSLATION_MAX_CHARS} characters`);
  }

  try {
    let result = await translateWithGoogle(text, languages);

    // Text already in the target language is translated into English instead
    const { detected } = result;
    if (detected && isSameLanguage(detected, languages.to)) {
      if (isSameLanguage(detected, ENGLISH_LANG)) return null;
      result = await translateWithGoogle(text, { from: detected, to: ENGLISH_LANG });
    }

    return { text: result.text, dictionary: result.dictionary, provider: 'google' };
  } catch (googleError) {
    console.warn('[Translate API] Google failed, falling back to MyMemory:', googleError);
  }

  // MyMemory needs a real source language; without Google's detection, guess English
  const from = languages.from === AUTO_DETECT_LANG ? ENGLISH_LANG : languages.from;
  if (isSameLanguage(from, languages.to)) return null;

  const translated = await translateWithMyMemory(text, { from, to: languages.to });
  return { text: translated, provider: 'mymemory', dictionary: [] };
}
