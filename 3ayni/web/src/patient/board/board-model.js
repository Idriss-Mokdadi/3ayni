// Navigation logic of the communication board, independent of the DOM so it
// can be unit-tested. Each screen is a grid of large targets for webcam gaze:
//
//   home       : 6 phrases chosen by the nurse | More | Keyboard        (3 x 3)
//   categories : 5 categories | Back                                    (3 x 2)
//   category   : 5 phrases | Back                                       (3 x 2)
//   controls   : settings | Back                                        (3 x 2)
//   keyboard   : typed text, Space, Delete, Speak, Home                 (6 x 4)
//                12 letters, most used first
//                previous page | 2 suggestions | next page
//   question   : the question, then Yes | No                           (2 x 2)
//   sleep      : one dot in the middle; looking at it wakes the board   (3 x 3)
//
// Tiles marked `inert` are shown but can never be chosen.

import { CATEGORIES, PHRASES, PHRASES_BY_ID } from './phrases.js';
import { ALPHABETS, applyKey, completeWord, pages, suggest } from './keyboard.js';

export const HOME_SLOTS = 6;
export const DEFAULT_HOME = ['water', 'pain', 'nurse', 'position', 'yes', 'no'].map((id) => ({ id }));

const LAYOUTS = {
  home: { columns: 3, rows: 3 },
  categories: { columns: 3, rows: 2 },
  category: { columns: 3, rows: 2 },
  controls: { columns: 3, rows: 2 },
  keyboard: { columns: 6, rows: 4 },
  question: { columns: 2, rows: 2 },
  sleep: { columns: 3, rows: 3 },
};

const back = { key: 'nav:back', kind: 'nav', target: 'back', icon: 'arrow-left', ar: 'رجوع', latin: 'Rjou3', label: 'Back' };
const more = { key: 'nav:more', kind: 'nav', target: 'categories', icon: 'layout-grid', ar: 'أكثر', latin: 'Akther', label: 'More phrases' };
const keyboardButton = {
  key: 'nav:keyboard', kind: 'nav', target: 'keyboard', icon: 'keyboard', ar: 'نكتب', latin: 'Nekteb', label: 'Keyboard', span: 2,
};

function phraseTile(phrase, extra = {}) {
  return {
    key: `phrase:${phrase.id}`,
    kind: 'phrase',
    phraseId: phrase.id,
    icon: phrase.icon,
    ar: phrase.ar,
    latin: phrase.latin,
    label: phrase.en,
    urgency: phrase.urgency,
    ...extra,
  };
}

/** A nurse-written phrase for the home screen. */
function customPhrase(slot, text) {
  return { id: `custom-${slot}`, category: 'custom', urgency: 'routine', icon: 'message-circle', ar: text, latin: '', fr: text, en: text };
}

export class BoardModel {
  constructor() {
    this.screen = { name: 'home' };
    this.question = null;
    this.questionMeta = {};
    this.settings = { shareVitals: true, slowSelection: false };
    this.typed = '';
    this.page = 0;
    this.alphabet = 'ar';
    this.beforeSleep = null;
    this.setHome(DEFAULT_HOME);
  }

  // ------------------------------------------------------------ configuration

  /**
   * The nurse's six home phrases: catalogue ids or free text.
   * @param {Array<{id?: string, text?: string}>} items
   */
  setHome(items) {
    const clean = [];
    this.customPhrases = new Map();
    for (const item of items.slice(0, HOME_SLOTS)) {
      if (item?.id && PHRASES_BY_ID.has(item.id)) clean.push({ id: item.id });
      else if (typeof item?.text === 'string' && item.text.trim()) clean.push({ text: item.text.trim().slice(0, 60) });
    }
    while (clean.length < HOME_SLOTS) clean.push(DEFAULT_HOME.find((d) => !clean.some((c) => c.id === d.id)) ?? { id: 'yes' });
    this.homeItems = clean;
    this.homePhrases = clean.map((item, slot) => {
      if (item.id) return PHRASES_BY_ID.get(item.id);
      const phrase = customPhrase(slot + 1, item.text);
      this.customPhrases.set(phrase.id, phrase);
      return phrase;
    });
  }

  setAlphabet(alphabet) {
    if (ALPHABETS[alphabet]) {
      this.alphabet = alphabet;
      this.page = 0;
    }
  }

  /** Any phrase the board can say, including the nurse's own. */
  phrase(id) {
    return PHRASES_BY_ID.get(id) ?? this.customPhrases.get(id);
  }

  layout() {
    return LAYOUTS[this.screen.name];
  }

  // ------------------------------------------------------------ tiles

  /**
   * @param {string[]} rankedPhraseIds phrases best first, from the phrase model (distress-aware)
   * @param {Record<string, number>} lexicon words this patient has typed
   * @param {boolean} distress heart rate above the patient's baseline
   * @returns {object[]} tiles filling the layout, row by row
   */
  tiles(rankedPhraseIds = [], lexicon = {}, distress = false) {
    switch (this.screen.name) {
      case 'home':
        return [...this.homePhrases.map((p) => phraseTile(p)), more, keyboardButton];
      case 'categories':
        return [
          ...CATEGORIES.map((c) => ({
            key: `category:${c.id}`, kind: 'nav', target: 'category', categoryId: c.id,
            icon: c.icon, ar: c.ar, latin: c.latin, label: c.en,
          })),
          back,
        ];
      case 'category':
        return [...PHRASES.filter((p) => p.category === this.screen.categoryId).map((p) => phraseTile(p)), back];
      case 'controls':
        return this.#controlTiles();
      case 'keyboard':
        return this.#keyboardTiles(rankedPhraseIds, lexicon, distress);
      case 'question':
        return [
          { key: 'question', kind: 'question', inert: true, span: 2, text: this.question },
          phraseTile(PHRASES_BY_ID.get('yes'), { key: 'answer:yes' }),
          phraseTile(PHRASES_BY_ID.get('no'), { key: 'answer:no' }),
        ];
      case 'sleep':
        return Array.from({ length: 9 }, (_, i) =>
          i === 4
            ? { key: 'wake', kind: 'wake', label: 'Look here to wake the screen' }
            : { key: `empty:${i}`, kind: 'empty', inert: true },
        );
      default:
        throw new Error(`Unknown screen ${this.screen.name}`);
    }
  }

  #keyboardTiles(rankedPhraseIds, lexicon, distress) {
    const { dir } = ALPHABETS[this.alphabet];
    const all = pages(this.alphabet);
    const letters = all[this.page % all.length];
    const key = (char) => ({ key: `key:${char}`, kind: 'key', char, label: char, dir });
    const suggestions = suggest({ text: this.typed, alphabet: this.alphabet, rankedPhraseIds, lexicon, distress });
    const suggestionTile = (s, i) => {
      if (!s) return { key: `suggestion:${i}:empty`, kind: 'empty', inert: true, span: 2 };
      if (s.kind === 'word') return { key: `suggestion:word:${s.word}`, kind: 'suggestion', span: 2, suggestion: s, text: s.word, dir };
      const p = this.phrase(s.phraseId);
      return {
        key: `suggestion:phrase:${p.id}`, kind: 'suggestion', span: 2, suggestion: s, urgency: p.urgency,
        text: this.alphabet === 'latin' ? p.latin : p.ar, label: p.en, dir,
      };
    };
    return [
      { key: 'display', kind: 'display', inert: true, span: 2, text: this.typed, dir },
      { key: 'key:space', kind: 'key', char: 'space', icon: 'space', label: 'Space' },
      { key: 'key:delete', kind: 'key', char: 'delete', icon: 'delete', label: 'Delete' },
      { key: 'speak', kind: 'speak', icon: 'volume-2', ar: 'قول', latin: 'Ql', label: 'Speak' },
      { key: 'nav:home', kind: 'nav', target: 'home', icon: 'house', ar: 'البداية', latin: 'Lbideya', label: 'Home' },
      ...letters.map(key),
      { key: 'page:prev', kind: 'page', delta: -1, icon: 'chevron-left', label: 'Previous letters' },
      suggestionTile(suggestions[0], 0),
      suggestionTile(suggestions[1], 1),
      { key: 'page:next', kind: 'page', delta: 1, icon: 'chevron-right', label: 'Next letters' },
    ];
  }

  // ------------------------------------------------------------ choosing

  /**
   * Applies a tile selection and says what the app should do.
   * @returns {{kind: 'say', phraseId: string, answeredQuestion: string|null}
   *   | {kind: 'sayText', text: string} | {kind: 'control', name: string}
   *   | {kind: 'type'} | {kind: 'wake'} | {kind: 'navigate'} | {kind: 'none'}}
   */
  select(tile) {
    if (!tile || tile.inert) return { kind: 'none' };
    switch (tile.kind) {
      case 'phrase': {
        const answeredQuestion = this.screen.name === 'question' ? this.question : null;
        let phraseId = tile.phraseId;
        if (answeredQuestion && phraseId === 'yes' && this.questionMeta.yesMeans) phraseId = this.questionMeta.yesMeans;
        this.question = null;
        this.questionMeta = {};
        this.screen = { name: 'home' };
        return { kind: 'say', phraseId, answeredQuestion };
      }
      case 'key':
        this.typed = applyKey(this.typed, tile.char).slice(0, 120);
        return { kind: 'type' };
      case 'page': {
        const count = pages(this.alphabet).length;
        this.page = (this.page + tile.delta + count) % count;
        return { kind: 'type' };
      }
      case 'suggestion':
        if (tile.suggestion.kind === 'word') {
          this.typed = completeWord(this.typed, tile.suggestion.word);
          return { kind: 'type' };
        }
        this.typed = '';
        this.page = 0;
        this.screen = { name: 'home' };
        return { kind: 'say', phraseId: tile.suggestion.phraseId, answeredQuestion: null };
      case 'speak': {
        const text = this.typed.trim();
        if (!text) return { kind: 'none' };
        this.typed = '';
        this.page = 0;
        this.screen = { name: 'home' };
        return { kind: 'sayText', text, alphabet: this.alphabet };
      }
      case 'wake':
        this.screen = this.beforeSleep ?? { name: 'home' };
        this.beforeSleep = null;
        return { kind: 'wake' };
      case 'control':
        if (tile.name === 'shareVitals') this.settings.shareVitals = !this.settings.shareVitals;
        if (tile.name === 'slowSelection') this.settings.slowSelection = !this.settings.slowSelection;
        if (tile.name === 'recalibrate') this.screen = { name: 'home' };
        return { kind: 'control', name: tile.name };
      default:
        break;
    }
    // Navigation
    if (tile.target === 'back') {
      this.screen = this.screen.name === 'category' || this.screen.name === 'controls' ? { name: 'categories' } : { name: 'home' };
    } else if (tile.target === 'category') {
      this.screen = tile.categoryId === 'controls' ? { name: 'controls' } : { name: 'category', categoryId: tile.categoryId };
    } else if (tile.target === 'keyboard') {
      this.page = 0;
      this.screen = { name: 'keyboard' };
    } else if (tile.target === 'home') {
      this.question = null;
      this.screen = { name: 'home' };
    } else {
      this.screen = { name: tile.target };
    }
    return { kind: 'navigate' };
  }

  /**
   * Shows a yes/no question from the nurse (or the system).
   * @param {string} text
   * @param {{yesMeans?: string}} [meta] e.g. "Are you in pain?" answered yes means the pain phrase
   */
  ask(text, meta = {}) {
    this.question = text;
    this.questionMeta = meta;
    this.beforeSleep = null;
    this.screen = { name: 'question' };
  }

  /** Turns the board off, remembering where the patient was. */
  sleep() {
    if (this.screen.name === 'sleep') return;
    this.beforeSleep = this.screen.name === 'question' ? null : this.screen;
    this.screen = { name: 'sleep' };
  }

  get asleep() {
    return this.screen.name === 'sleep';
  }

  #controlTiles() {
    const control = (name, icon, ar, latin, label) => ({ key: `control:${name}`, kind: 'control', name, icon, ar, latin, label });
    const { shareVitals, slowSelection } = this.settings;
    return [
      control('repeat', 'repeat', 'عاود', '3awed', 'Repeat last'),
      phraseTile(PHRASES_BY_ID.get('unsure')),
      control('recalibrate', 'scan-eye', 'عاود الضبط', '3awed edhabt', 'Recalibrate eyes'),
      control(
        'shareVitals',
        shareVitals ? 'heart-pulse' : 'eye-off',
        shareVitals ? 'وقف المراقبة' : 'رجع المراقبة',
        shareVitals ? 'Wa99ef el mora9ba' : 'Rajja3 el mora9ba',
        shareVitals ? 'Pause vitals sharing' : 'Resume vitals sharing',
      ),
      control(
        'slowSelection',
        'timer',
        slowSelection ? 'اختيار عادي' : 'اختيار بالشوية',
        slowSelection ? 'E5tiyar 3adi' : 'E5tiyar bechwaya',
        slowSelection ? 'Normal speed' : 'Slower selection',
      ),
      back,
    ];
  }
}
