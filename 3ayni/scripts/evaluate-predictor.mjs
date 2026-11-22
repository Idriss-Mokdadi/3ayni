// Measures how many gaze selections a message costs, with and without the
// suggestion model. Trains on one set of simulated routines and tests on a
// different set (different random seed), so the model never sees test data.
//
//   Without suggestions: every phrase costs 3 selections (More -> category -> phrase).
//   With suggestions:    1 selection if the phrase is in the top 3 on the home screen, else 3.
//
// Usage: npm run evaluate:predictor

import { PhrasePredictor } from '../web/src/patient/predictor.js';
import { generateRoutines, seedPredictor } from '../web/src/patient/care-routines.js';

const FULL_PATH = 3;

function evaluate(suggestFor, sessions) {
  let messages = 0;
  let hits = 0;
  for (const { hour, messages: chain } of sessions) {
    chain.forEach((id, i) => {
      messages++;
      if (suggestFor({ previousId: chain[i - 1] ?? null, hour }).includes(id)) hits++;
    });
  }
  const selections = (hits * 1 + (messages - hits) * FULL_PATH) / messages;
  return { messages, hitRate: hits / messages, selections };
}

const test = generateRoutines(2000, 7);
const model = seedPredictor(new PhrasePredictor());

// Baseline 1: the three most common phrases overall, always the same.
const frequent = Object.entries(model.unigram)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 3)
  .map(([id]) => id);

const rows = [
  ['No suggestions', { selections: FULL_PATH, hitRate: 0 }],
  ['Fixed top-3 (most frequent)', evaluate(() => frequent, test)],
  ['Context model (3ayni)', evaluate((context) => model.suggest(context, 3), test)],
];

console.log(`Test set: ${test.reduce((s, x) => s + x.messages.length, 0)} simulated messages\n`);
console.log('Method                        | Top-3 hit rate | Selections / message');
console.log('------------------------------|----------------|---------------------');
for (const [name, r] of rows) {
  console.log(`${name.padEnd(30)}| ${(r.hitRate * 100).toFixed(1).padStart(13)}% | ${r.selections.toFixed(2).padStart(20)}`);
}
const saving = 1 - rows[2][1].selections / FULL_PATH;
console.log(`\nEffort saved vs. no suggestions: ${(saving * 100).toFixed(0)}%`);
console.log('Note: simulated routines, not patient data. Real-world numbers must come from a pilot.');
