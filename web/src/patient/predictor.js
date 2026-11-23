// Ranks phrases so the three most likely ones sit on the home screen, where
// they cost one selection instead of three (More -> category -> phrase).
//
// A small probabilistic model, chosen over a large language model because it
// runs instantly on the bedside device, needs no internet, explains itself, and
// learns this patient's habits from a handful of uses:
//
//   score(p) = log P(p | previous phrase)               what usually follows what
//            + beta * log[ P(p | time of day) / P(p) ]  e.g. "sleep" at night
//            + distress boost                           when vitals are elevated
//
// Probabilities use Dirichlet smoothing toward the overall phrase frequency, so
// rare contexts fall back gracefully instead of producing zeros.

import { DISTRESS_IDS, SUGGESTIBLE_IDS } from './board/phrases.js';

export function timeBucket(hour) {
  if (hour >= 22 || hour < 6) return 'night';
  if (hour < 11) return 'morning';
  if (hour < 15) return 'midday';
  if (hour < 19) return 'afternoon';
  return 'evening';
}

export class PhrasePredictor {
  constructor({ vocabulary = SUGGESTIBLE_IDS, smoothing = 2, timeWeight = 0.8, distressBoost = Math.log(3) } = {}) {
    this.vocabulary = vocabulary;
    this.smoothing = smoothing;
    this.timeWeight = timeWeight;
    this.distressBoost = distressBoost;
    this.unigram = {};
    this.total = 0;
    this.bigram = {}; // previous -> next -> count
    this.byTime = {}; // bucket -> phrase -> count
  }

  /**
   * Records that the patient said `id`, so future suggestions adapt.
   * @param {string} id
   * @param {{previousId?: string|null, hour: number}} context
   * @param {number} [weight=1] real uses count fully; simulated seed data counts less
   */
  observe(id, { previousId = null, hour }, weight = 1) {
    if (!this.vocabulary.includes(id)) return;
    this.unigram[id] = (this.unigram[id] ?? 0) + weight;
    this.total += weight;
    if (previousId) increment(this.bigram, previousId, id, weight);
    increment(this.byTime, timeBucket(hour), id, weight);
  }

  /**
   * @param {{previousId?: string|null, hour: number, distress?: boolean}} context
   * @param {number} k
   * @returns {string[]} the k best phrase ids, best first
   */
  suggest(context, k = 3) {
    return this.rank(context)
      .slice(0, k)
      .map((entry) => entry.id);
  }

  /** Full ranking with scores, useful for the debug panel. */
  rank({ previousId = null, hour, distress = false }) {
    const bucket = timeBucket(hour);
    const followers = previousId ? this.bigram[previousId] : undefined;
    const followersTotal = sum(followers);
    const timeCounts = this.byTime[bucket];
    const timeTotal = sum(timeCounts);
    const a = this.smoothing;

    return this.vocabulary
      .map((id) => {
        const prior = this.#prior(id);
        const pNext = ((followers?.[id] ?? 0) + a * prior) / (followersTotal + a);
        const pTime = ((timeCounts?.[id] ?? 0) + a * prior) / (timeTotal + a);
        let score = Math.log(pNext) + this.timeWeight * (Math.log(pTime) - Math.log(prior));
        if (distress && DISTRESS_IDS.has(id)) score += this.distressBoost;
        if (id === previousId) score -= 1; // repeating the same request is rare; "Repeat" exists for that
        return { id, score };
      })
      .sort((x, y) => y.score - x.score);
  }

  #prior(id) {
    return ((this.unigram[id] ?? 0) + 1) / (this.total + this.vocabulary.length);
  }

  toJSON() {
    return { unigram: this.unigram, total: this.total, bigram: this.bigram, byTime: this.byTime };
  }

  load(state) {
    if (!state || typeof state !== 'object') return;
    this.unigram = state.unigram ?? {};
    this.total = state.total ?? 0;
    this.bigram = state.bigram ?? {};
    this.byTime = state.byTime ?? {};
  }
}

function increment(table, key, id, weight) {
  table[key] ??= {};
  table[key][id] = (table[key][id] ?? 0) + weight;
}

function sum(counts) {
  if (!counts) return 0;
  let total = 0;
  for (const value of Object.values(counts)) total += value;
  return total;
}
