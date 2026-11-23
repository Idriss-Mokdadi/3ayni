// Gaze keyboard: 7 letters and Space per page (4 columns x 2 rows), so each key
// is a large target for webcam gaze. Pages go from the most to the least used
// letters, so most words need only the first pages.
// Under the letters: previous page, two suggestions, next page.
//
// Suggestions come from two sources:
//   - whole phrases, ranked by the phrase model (which already puts distress
//     phrases first when the heart rate is above the patient's baseline);
//   - single words this patient has typed before, or that appear in the phrases.
// Pure functions and a small class with no DOM, so all of it is unit-tested.

import { DISTRESS_IDS, PHRASES } from './phrases.js';

export const KEYS_PER_PAGE = 7; // letters per page; Space is always the 8th key

// Letter order by frequency. Arabic: approximate order of letter frequency in
// written Arabic, then the hamza and alif forms. Latin: Tunisian Darija as
// typed in Latin letters ("Arabizi"), where 3, 7, 9 and 5 stand for ع ح ق خ.
// The rarest forms (آ ؤ ئ) are left out: suggestions match them anyway.
export const ALPHABETS = {
  ar: {
    dir: 'rtl',
    letters: [...'اليمونهرتبعكفدسقحجشةصطخزذثغضظأإىء'],
  },
  latin: {
    dir: 'ltr',
    letters: [...'eaionrstlumdkchb3795yfpgjwzqvx2?.'],
  },
};

/** The letter pages of an alphabet, KEYS_PER_PAGE letters each (the last may be shorter). */
export function pages(alphabet) {
  const letters = ALPHABETS[alphabet]?.letters ?? ALPHABETS.ar.letters;
  const result = [];
  for (let i = 0; i < letters.length; i += KEYS_PER_PAGE) result.push(letters.slice(i, i + KEYS_PER_PAGE));
  return result;
}

/** Applies one key to the typed text. */
export function applyKey(text, key) {
  if (key === 'delete') return [...text].slice(0, -1).join('');
  if (key === 'space') return text.length === 0 || text.endsWith(' ') ? text : `${text} `;
  return text + key;
}

/** Folds spelling variants so "اكل" finds "أكل" and "ماء" finds "ماء". */
export function normalise(text) {
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ؤئ]/g, 'ء')
    .replace(/[ً-ْ]/g, '') // short-vowel marks
    .trim();
}

const words = (text) => normalise(text).split(/\s+/).filter(Boolean);
const phraseText = (phrase, alphabet) => (alphabet === 'latin' ? phrase.latin : phrase.ar);

/**
 * Up to `count` suggestions for what the patient is typing.
 * @param {object} input
 * @param {string} input.text          typed so far
 * @param {'ar'|'latin'} input.alphabet
 * @param {string[]} input.rankedPhraseIds  phrase ids best first (from the phrase model)
 * @param {Record<string, number>} input.lexicon  word -> times typed
 * @param {boolean} [input.distress]  heart rate above baseline: distress phrases come first
 * @param {number} [count]
 * @returns {Array<{kind: 'phrase', phraseId: string} | {kind: 'word', word: string}>}
 */
export function suggest({ text, alphabet, rankedPhraseIds, lexicon = {}, distress = false, phrases = PHRASES }, count = 2) {
  const byId = new Map(phrases.map((p) => [p.id, p]));
  const typed = normalise(text);
  const typedWords = words(text);
  const endsWithSpace = /\s$/.test(text);
  const current = endsWithSpace ? '' : (typedWords.at(-1) ?? '');
  const rank = (id) => {
    const i = rankedPhraseIds.indexOf(id);
    const base = i === -1 ? rankedPhraseIds.length : i;
    // With a racing heart, "call the nurse" or "I am in pain" must not hide behind habits.
    return distress && DISTRESS_IDS.has(id) ? base - 1000 : base;
  };

  // Nothing typed yet: the most likely phrases right now.
  if (!typed) {
    const ordered = [...rankedPhraseIds].sort((a, b) => rank(a) - rank(b));
    return ordered.slice(0, count).map((phraseId) => ({ kind: 'phrase', phraseId }));
  }

  // Phrases that continue what was typed: the whole text is its beginning, or
  // every typed word starts a word of the phrase.
  const phraseScores = [];
  for (const phrase of phrases) {
    if (phrase.category === 'answers') continue;
    const target = normalise(phraseText(phrase, alphabet) ?? '');
    if (!target) continue;
    const targetWords = target.split(/\s+/);
    let score = null;
    if (target.startsWith(typed)) score = 0;
    else if (typedWords.every((w) => targetWords.some((tw) => tw.startsWith(w)))) score = 1;
    if (score !== null) phraseScores.push({ id: phrase.id, score: score * 10_000 + rank(phrase.id) });
  }
  phraseScores.sort((a, b) => a.score - b.score);

  // Words that complete the current word, most typed first, then phrase words.
  const wordCounts = new Map(Object.entries(lexicon));
  for (const phrase of phrases) for (const w of words(phraseText(phrase, alphabet) ?? '')) if (!wordCounts.has(w)) wordCounts.set(w, 0);
  const completions = current
    ? [...wordCounts.entries()]
        .filter(([w]) => w.startsWith(current) && w !== current)
        .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
        .map(([w]) => w)
    : [];

  const result = [];
  // One phrase first (a whole message in one look), then a word, then the rest.
  if (phraseScores[0]) result.push({ kind: 'phrase', phraseId: phraseScores[0].id });
  const shown = new Set(result.map((r) => normalise(phraseText(byId.get(r.phraseId), alphabet) ?? '')));
  for (const word of completions) {
    if (result.length >= count) break;
    if (shown.has(word)) continue; // the same text is already offered as a whole phrase
    result.push({ kind: 'word', word });
  }
  for (const p of phraseScores.slice(1)) {
    if (result.length >= count) break;
    result.push({ kind: 'phrase', phraseId: p.id });
  }
  return result.filter((s) => s.kind === 'word' || byId.has(s.phraseId)).slice(0, count);
}

/** Replaces the word being typed with a chosen completion. */
export function completeWord(text, word) {
  const cut = /\s$/.test(text) ? text.length : text.search(/\S+$/);
  return `${text.slice(0, cut === -1 ? text.length : cut)}${word} `;
}

/** Counts the words of a sent message, so they are suggested next time. */
export function learnWords(lexicon, text) {
  for (const w of words(text)) if (w.length > 1) lexicon[w] = (lexicon[w] ?? 0) + 1;
  return lexicon;
}
