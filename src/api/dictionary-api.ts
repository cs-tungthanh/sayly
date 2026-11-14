/**
 * Dictionary lookups (run in the background service worker): IPA from the bundled dictionary first,
 * then the online dictionary API for words it can't pronounce; English definitions from the online API
 */

import {
  DICTIONARY_API_BASE_URL,
  DICTIONARY_ENTRY_CACHE_SIZE,
  ENGLISH_MAX_PARTS_OF_SPEECH,
  ENGLISH_MAX_DEFINITIONS
} from '../constants/app-constants';
import { PromiseCache } from '../shared/promise-cache';
import { lookupBundledIpa } from './cmudict';
import { extractWords } from '../text/text-processor';
import { findIrregularVerbForms, isIrregularVerbBase, type VerbForm } from '../constants/irregular-verbs';

/** One sense of a word in English, with an example sentence when the dictionary has one */
export interface EnglishDefinition {
  definition: string;
  example?: string;
}

/** A word's English senses for one part of speech */
export interface EnglishMeaning {
  partOfSpeech: string;
  definitions: EnglishDefinition[];
  /** The verb these senses belong to, when they are another word's ("see" for "seen") */
  headword?: string;
}

/** What the popup shows to explain a word in English */
export interface WordDefinitions {
  /** The irregular verbs the word is a past form of */
  forms: VerbForm[];
  meanings: EnglishMeaning[];
}

/** The parts of the Free Dictionary API's answer that Sayly reads */
interface ApiEntry {
  phonetic?: string;
  phonetics?: { text?: string }[];
  meanings?: {
    partOfSpeech?: string;
    definitions?: { definition?: string; example?: string }[];
  }[];
}

// The API's answer for a word, shared by the IPA and definition lookups so a word is fetched once
const entryCache = new PromiseCache<ApiEntry[] | null>(DICTIONARY_ENTRY_CACHE_SIZE);

/**
 * Fetch a word's entries from the online dictionary
 * @returns null when the dictionary doesn't know the word
 * @throws Error on network or server failure, so the miss is not cached
 */
async function fetchEntries(word: string): Promise<ApiEntry[] | null> {
  const response = await fetch(`${DICTIONARY_API_BASE_URL}/${encodeURIComponent(word)}`, { credentials: 'omit' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Dictionary HTTP ${response.status}`);

  const data = await response.json();
  return Array.isArray(data) && data.length > 0 ? data : null;
}

function getEntries(word: string): Promise<ApiEntry[] | null> {
  const key = word.toLowerCase();
  return entryCache.get(key, () => fetchEntries(key));
}

/**
 * The first IPA in a word's entries
 */
function findIpa(entries: ApiEntry[]): string | null {
  for (const entry of entries) {
    if (entry.phonetic) return entry.phonetic;
    const text = entry.phonetics?.find(phonetic => phonetic.text)?.text;
    if (text) return text;
  }
  return null;
}

/**
 * IPA for one word; failures read as "no IPA"
 */
async function getIPA(word: string): Promise<string | null> {
  const key = word.toLowerCase();

  try {
    const bundled = await lookupBundledIpa(key);
    if (bundled) return bundled;
  } catch (error) {
    console.error('[Dictionary] Failed to load the bundled dictionary:', error);
  }

  try {
    const entries = await getEntries(key);
    return entries ? findIpa(entries) : null;
  } catch (error) {
    console.error('[Dictionary API] Failed to fetch IPA:', error);
    return null;
  }
}

/**
 * Look up IPA for one word as shown in the text; contractions are expanded ("it's" → "it is")
 */
export async function lookupWordIpa(word: string): Promise<string | null> {
  const parts = extractWords(word.replace(/’/g, "'"));
  const ipas = await Promise.all(parts.map(getIPA));
  if (ipas.every(ipa => !ipa)) return null;

  // Keep the parts aligned so a missing piece is visible rather than silently dropped
  return ipas.map((ipa, i) => ipa || parts[i]).join(' ');
}

/**
 * Whether a definition only repeats the word: Wiktionary defines some old senses as just "To run."
 */
function isCircular(definition: string, word: string): boolean {
  const bare = definition.toLowerCase().replace(/[^a-z' ]/g, '').trim();
  return bare === word || bare === `to ${word}`;
}

/** A part of speech within one dictionary entry (Wiktionary has an entry per origin of the word) */
interface SenseGroup {
  entryIndex: number;
  partOfSpeech: string;
  definitions: EnglishDefinition[];
}

/**
 * Fetch a word's entries for definitions
 * @returns null when the dictionary doesn't know the word or the request fails
 */
async function getEntriesForDefinitions(word: string): Promise<ApiEntry[] | null> {
  try {
    return await getEntries(word);
  } catch (error) {
    console.error('[Dictionary API] Failed to fetch definitions:', error);
    return null;
  }
}

/**
 * A word's senses by entry and part of speech, skipping empty and circular ones
 */
function collectSenseGroups(entries: ApiEntry[], word: string): SenseGroup[] {
  return entries.flatMap((entry, entryIndex) =>
    (entry.meanings ?? []).flatMap((meaning) => {
      const partOfSpeech = meaning.partOfSpeech?.trim();
      const definitions = (meaning.definitions ?? [])
        .filter(({ definition }) => definition?.trim() && !isCircular(definition, word))
        // A trailing colon introduces sub-senses the API leaves out ("To move:")
        .map(({ definition, example }) => ({
          definition: definition!.trim().replace(/:$/, ''),
          example: example?.trim() || undefined
        }));
      return partOfSpeech && definitions.length > 0 ? [{ entryIndex, partOfSpeech, definitions }] : [];
    })
  );
}

const hasExample = (group: SenseGroup) => group.definitions.some(({ example }) => example);

/**
 * Whether a group is worth showing a learner: the main entry, or a later one with examples. Later
 * entries without any are mostly rare words that share the spelling ("seen", the Arabic letter)
 */
const isCommon = (group: SenseGroup) => group.entryIndex === 0 || hasExample(group);

// A part of speech with fewer senses than this, under this share of them with an example, is a minor
// one and goes after the others
const MINOR_POS_MAX_SENSES = 10;
const MINOR_POS_EXAMPLE_SHARE = 0.35;

/**
 * Merge groups that share a part of speech and trim to what the popup shows. The dictionary's order
 * is kept, except that minor parts of speech go last: Wiktionary lists them by origin, not by use, so
 * "familiar" starts with a rare noun ("an attendant spirit") before the everyday adjective. A part of
 * speech is minor when it has few senses and few of them have examples; a big one ("book" as a noun)
 * stays where it is however few examples it has.
 */
function toMeanings(groups: SenseGroup[], headword?: string): EnglishMeaning[] {
  const byPartOfSpeech = new Map<string, EnglishDefinition[]>();
  for (const { partOfSpeech, definitions } of groups) {
    byPartOfSpeech.set(partOfSpeech, [...(byPartOfSpeech.get(partOfSpeech) ?? []), ...definitions]);
  }
  const isMinor = (definitions: EnglishDefinition[]) =>
    definitions.length < MINOR_POS_MAX_SENSES &&
    definitions.filter(({ example }) => example).length < definitions.length * MINOR_POS_EXAMPLE_SHARE;
  const all = [...byPartOfSpeech];
  const ordered = [...all.filter(([, d]) => !isMinor(d)), ...all.filter(([, d]) => isMinor(d))];
  return ordered.map(([partOfSpeech, definitions]) => ({
    partOfSpeech,
    definitions: definitions.slice(0, ENGLISH_MAX_DEFINITIONS),
    ...(headword ? { headword } : {})
  }));
}

/**
 * English definitions of a word, by part of speech in the dictionary's order. For a past form of an
 * irregular verb ("seen"), says which verb it comes from and shows that verb's meanings, which the
 * dictionary answers unreliably for the form itself; the form's own other meanings ("left" as a
 * direction) follow when the main entry gives them with examples.
 * @returns null when there is nothing to show
 */
export async function lookupEnglishDefinitions(word: string): Promise<WordDefinitions | null> {
  const key = word.replace(/’/g, "'").toLowerCase();
  const forms = findIrregularVerbForms(key);
  const bases = [...new Set(forms.map(({ base }) => base))];

  const [ownEntries, ...baseEntries] = await Promise.all([key, ...bases].map(getEntriesForDefinitions));
  const ownGroups = ownEntries ? collectSenseGroups(ownEntries, key).filter(isCommon) : [];

  let meanings: EnglishMeaning[];
  if (forms.length === 0) {
    meanings = toMeanings(ownGroups);
  } else {
    const baseMeanings = bases.flatMap((base, i) => {
      const entries = baseEntries[i];
      if (!entries) return [];
      const verbGroups = collectSenseGroups(entries, base).filter(g => isCommon(g) && g.partOfSpeech === 'verb');
      return toMeanings(verbGroups, base);
    });
    // A form that is also a verb of its own ("lay", "found") keeps its verb senses
    const ownKept = ownGroups.filter(g => g.entryIndex === 0 && hasExample(g) && (g.partOfSpeech !== 'verb' || isIrregularVerbBase(key)));
    meanings = [...baseMeanings, ...toMeanings(ownKept)];
  }

  meanings = meanings.slice(0, ENGLISH_MAX_PARTS_OF_SPEECH);
  return forms.length > 0 || meanings.length > 0 ? { forms, meanings } : null;
}
