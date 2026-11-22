// Navigation logic of the communication board, independent of the DOM so it
// can be unit-tested. Every screen has exactly six tiles (3 columns x 2 rows):
// big enough targets for webcam gaze tracking.
//
//   home       : 3 AI suggestions | Yes | No | More
//   categories : 5 categories | Back
//   category   : 5 phrases | Back
//   controls   : settings | Back
//   question   : a caregiver's question with answer tiles

import { CATEGORIES, PHRASES, PHRASES_BY_ID } from './phrases.js';

export const TILE_COUNT = 6;
const FALLBACK_SUGGESTIONS = ['water', 'pain', 'nurse'];

const back = { key: 'nav:back', kind: 'nav', target: 'back', icon: 'arrow-left', ar: 'رجوع', latin: 'Rjou3', label: 'Back' };
const more = { key: 'nav:more', kind: 'nav', target: 'categories', icon: 'layout-grid', ar: 'أكثر', latin: 'Akther', label: 'More' };

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

export class BoardModel {
  constructor() {
    this.screen = { name: 'home' };
    this.question = null;
    this.caregiverTiles = null; // full list of phraseIds set by caregiver
    this.caregiverPage = 0;    // current page index (6 tiles per page)
    this.settings = { shareVitals: true, slowSelection: false };
  }

  /** Total number of pages for the current caregiver tile list. */
  get caregiverPageCount() {
    if (!this.caregiverTiles) return 0;
    return Math.ceil(this.caregiverTiles.length / TILE_COUNT);
  }

  /**
   * @param {string[]} suggestionIds top suggestions from the predictor (3 used)
   * @returns {object[]} exactly TILE_COUNT tiles
   */
  tiles(suggestionIds = []) {
    switch (this.screen.name) {
      case 'home': {
        // If the caregiver has set specific tiles, show paged tiles.
        if (this.caregiverTiles) {
          const start = this.caregiverPage * TILE_COUNT;
          const slice = this.caregiverTiles.slice(start, start + TILE_COUNT);
          const tiles = slice
            .map((id) => PHRASES_BY_ID.get(id))
            .filter(Boolean)
            .map((p) => phraseTile(p, { caregiverPicked: true }));
          // Pad remaining slots with empty tiles
          while (tiles.length < TILE_COUNT) {
            tiles.push({ key: `empty:${tiles.length}`, kind: 'empty', icon: null, ar: '', latin: '', label: '' });
          }
          return tiles;
        }
        // Until the model has suggestions, fall back to the three most needed phrases.
        const ids = [...new Set([...suggestionIds, ...FALLBACK_SUGGESTIONS])].slice(0, 3);
        const suggested = ids.map((id) => phraseTile(PHRASES_BY_ID.get(id), { suggested: suggestionIds.includes(id) }));
        return [...suggested, phraseTile(PHRASES_BY_ID.get('yes')), phraseTile(PHRASES_BY_ID.get('no')), more];
      }
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
      case 'question':
        return [
          phraseTile(PHRASES_BY_ID.get('yes')),
          phraseTile(PHRASES_BY_ID.get('no')),
          phraseTile(PHRASES_BY_ID.get('unsure')),
          phraseTile(PHRASES_BY_ID.get('pain')),
          phraseTile(PHRASES_BY_ID.get('nurse')),
          { ...back, key: 'nav:dismiss', target: 'home', ar: 'سكر', latin: 'Sakker', label: 'Close' },
        ];
      default:
        throw new Error(`Unknown screen ${this.screen.name}`);
    }
  }

  /**
   * Applies a tile selection and says what the app should do.
   * @returns {{kind: 'say', phraseId: string, answeredQuestion: string|null} | {kind: 'control', name: string} | {kind: 'navigate'}}
   */
  select(tile) {
    if (tile.kind === 'phrase') {
      const answeredQuestion = this.screen.name === 'question' ? this.question : null;
      this.question = null;
      this.caregiverTiles = null; // clear after patient responds
      this.screen = { name: 'home' };
      return { kind: 'say', phraseId: tile.phraseId, answeredQuestion };
    }
    if (tile.kind === 'control') {
      if (tile.name === 'shareVitals') this.settings.shareVitals = !this.settings.shareVitals;
      if (tile.name === 'slowSelection') this.settings.slowSelection = !this.settings.slowSelection;
      if (tile.name === 'recalibrate') this.screen = { name: 'home' };
      return { kind: 'control', name: tile.name };
    }
    // Navigation
    if (tile.target === 'back') {
      this.screen = this.screen.name === 'category' || this.screen.name === 'controls' ? { name: 'categories' } : { name: 'home' };
    } else if (tile.target === 'clear-tiles') {
      this.clearTiles();
    } else if (tile.target === 'category') {
      this.screen = tile.categoryId === 'controls' ? { name: 'controls' } : { name: 'category', categoryId: tile.categoryId };
    } else if (tile.target === 'home') {
      this.question = null;
      this.screen = { name: 'home' };
    } else {
      this.screen = { name: tile.target };
    }
    return { kind: 'navigate' };
  }

  /** Shows a caregiver's (or the system's) yes/no question. */
  ask(text) {
    this.question = text;
    this.screen = { name: 'question' };
  }

  /** Replaces the home screen with a specific set of phrases chosen by the caregiver. */
  setTiles(phraseIds) {
    this.caregiverTiles = phraseIds;
    this.caregiverPage = 0;
    this.screen = { name: 'home' };
  }

  /** Clears caregiver tiles and returns to the normal home screen. */
  clearTiles() {
    this.caregiverTiles = null;
    this.caregiverPage = 0;
    this.screen = { name: 'home' };
  }

  /** Go to the previous page of caregiver tiles. */
  prevPage() {
    if (this.caregiverPage > 0) this.caregiverPage--;
  }

  /** Go to the next page of caregiver tiles. */
  nextPage() {
    if (this.caregiverPage < this.caregiverPageCount - 1) this.caregiverPage++;
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
