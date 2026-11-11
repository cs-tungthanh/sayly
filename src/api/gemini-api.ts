/**
 * Gemini translation client (runs in the background service worker)
 *
 * Helps the user use English: gives the text as a native speaker would say it out loud in English,
 * translating it first when it is in another language.
 * Called only when the user clicks the popup's Gemini button, with the user's own API key.
 */

import {
  GEMINI_API_URL,
  GEMINI_MODEL,
  GEMINI_MAX_OUTPUT_TOKENS,
  TRANSLATION_MAX_CHARS,
  TRANSLATION_CACHE_SIZE
} from '../constants/app-constants';
import { PromiseCache } from '../shared/promise-cache';
import { getGeminiApiKey } from '../shared/utils';

const geminiCache = new PromiseCache<string>(TRANSLATION_CACHE_SIZE);

// Always English: the button is for learning how to say things in English, whatever language was selected
const INSTRUCTION = [
  'You help someone learning English say things the way native English speakers do.',
  "Give the user's text as natural, everyday spoken American English: what a native speaker would actually",
  'say out loud in conversation, casual and idiomatic, not word for word.',
  'If the text is in another language, translate it into English this way.',
  'If it is already English, rephrase it so it sounds natural when spoken.',
  'Always answer in English, never in the language of the text.',
  'Keep the meaning, tone and any names. Keep line breaks between paragraphs.',
  'Reply with the English only: no quotes, notes, explanations or alternatives.'
].join(' ');

/**
 * Read Gemini's answer text, or throw with the reason it gave none
 */
function readAnswer(data: any): string {
  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) throw new Error(`Gemini blocked the text (${blockReason})`);

  const parts: unknown[] = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part: any) => (part && !part.thought && typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
  if (!text) throw new Error(`Gemini returned no text (${data?.candidates?.[0]?.finishReason ?? 'unknown reason'})`);
  return text;
}

async function translateUncached(text: string, apiKey: string): Promise<string> {
  const response = await fetch(`${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        // A translation needs no reasoning; thinking only makes the user wait
        thinkingConfig: { thinkingLevel: 'MINIMAL' }
      }
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
  }
  return readAnswer(data);
}

/**
 * Get the natural spoken English for text with Gemini, reusing earlier results
 * @throws Error when no API key is set, the text is too long, or Gemini fails
 */
export async function translateWithGemini(text: string): Promise<string> {
  if (text.length > TRANSLATION_MAX_CHARS) {
    throw new Error(`Text is longer than ${TRANSLATION_MAX_CHARS} characters`);
  }

  const apiKey = await getGeminiApiKey();
  if (!apiKey) throw new Error('No Gemini API key set. Add one in Sayly settings');

  return geminiCache.get(text, () => translateUncached(text, apiKey));
}
