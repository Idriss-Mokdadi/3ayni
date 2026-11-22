import { describe, expect, it } from 'vitest';
import { PhrasePredictor, timeBucket } from '../web/src/patient/predictor.js';
import { seedPredictor, generateRoutines } from '../web/src/patient/care-routines.js';
import { CareMonitor, RULES } from '../web/src/patient/fusion.js';
import { BoardModel } from '../web/src/patient/board/board-model.js';
import { cellMap } from '../web/src/patient/board/board-view.js';
import { ALPHABETS, applyKey, completeWord, learnWords, normalise, pages as keyboardPages, suggest as suggestKeys } from '../web/src/patient/board/keyboard.js';
import { SLEEP_RULES, sleepDelayMs } from '../web/src/patient/sleep.js';
import { PHRASES, PHRASES_BY_ID, CATEGORIES, DISTRESS_IDS as DISTRESS } from '../web/src/patient/board/phrases.js';
import { parseEvent, PATIENT_EVENTS, CAREGIVER_EVENTS } from '../web/src/shared/protocol.js';

describe('PhrasePredictor', () => {
  const model = seedPredictor(new PhrasePredictor());

  it('maps hours to the right part of the day', () => {
    expect(timeBucket(2)).toBe('night');
    expect(timeBucket(23)).toBe('night');
    expect(timeBucket(8)).toBe('morning');
    expect(timeBucket(13)).toBe('midday');
  });

  it('suggests a nurse after pain', () => {
    expect(model.suggest({ previousId: 'pain', hour: 10 })).toContain('nurse');
  });

  it('suggests sleep-related phrases at night', () => {
    const night = model.suggest({ previousId: null, hour: 23 });
    expect(night.some((id) => ['sleep', 'light'].includes(id))).toBe(true);
  });

  it('puts distress phrases first when vitals are elevated', () => {
    const calm = model.suggest({ previousId: 'thanks', hour: 16 });
    const distressed = model.suggest({ previousId: 'thanks', hour: 16, distress: true });
    expect(distressed.filter((id) => ['pain', 'breath', 'nurse', 'scared', 'position'].includes(id)).length).toBeGreaterThan(
      calm.filter((id) => ['pain', 'breath', 'nurse', 'scared', 'position'].includes(id)).length,
    );
  });

  it('adapts to one patient: a phrase used repeatedly rises to the top', () => {
    const personal = seedPredictor(new PhrasePredictor());
    expect(personal.suggest({ previousId: null, hour: 16 })).not.toContain('cold');
    for (let i = 0; i < 15; i++) personal.observe('cold', { previousId: null, hour: 16 });
    expect(personal.suggest({ previousId: null, hour: 16 })).toContain('cold');
  });

  it('round-trips through JSON', () => {
    const copy = new PhrasePredictor();
    copy.load(JSON.parse(JSON.stringify(model)));
    expect(copy.suggest({ previousId: 'pain', hour: 10 })).toEqual(model.suggest({ previousId: 'pain', hour: 10 }));
  });

  it('only ever suggests known phrases', () => {
    for (const session of generateRoutines(50, 3)) {
      for (const id of model.suggest({ previousId: session.messages[0], hour: session.hour })) {
        expect(PHRASES_BY_ID.has(id)).toBe(true);
      }
    }
  });
});

describe('CareMonitor', () => {
  // Feeds one reading per second from `from` to `to` (seconds).
  const feed = (monitor, from, to, hr, quality = 'good') => {
    const events = [];
    for (let s = from; s < to; s++) events.push(...monitor.updateVitals(s * 1000, { hr, quality }));
    return events;
  };

  it('learns a baseline from fair webcam readings too', () => {
    // Real webcams rarely reach "good"; with good-only the baseline never formed.
    const monitor = new CareMonitor(0);
    feed(monitor, 0, 91, 68, 'fair');
    expect(monitor.baseline).toBe(68);
    expect(monitor.state).toBe('normal');
  });

  it('learns a baseline, then flags a sustained rise and clears it', () => {
    const monitor = new CareMonitor(0);
    feed(monitor, 0, 91, 70);
    expect(monitor.baseline).toBe(70);
    expect(monitor.state).toBe('normal');

    const short = feed(monitor, 91, 120, 95); // 29 s: not long enough
    expect(short.some((e) => e.state === 'elevated')).toBe(false);
    const rise = feed(monitor, 120, 150, 95);
    expect(rise).toContainEqual(expect.objectContaining({ type: 'state', state: 'elevated' }));

    const back = feed(monitor, 150, 185, 72);
    expect(back).toContainEqual(expect.objectContaining({ type: 'state', state: 'normal' }));
  });

  it('asks the patient when the body is stressed but they are silent', () => {
    const monitor = new CareMonitor(0);
    feed(monitor, 0, 91, 70);
    const events = feed(monitor, 91, 91 + 45 + 130, 100);
    expect(events).toContainEqual(expect.objectContaining({ type: 'prompt', question: 'Are you in pain?' }));
    expect(events.filter((e) => e.type === 'prompt').length).toBe(1); // cooldown prevents nagging
  });

  it('upgrades "pain" to urgent only when the heart rate is elevated', () => {
    const monitor = new CareMonitor(0);
    feed(monitor, 0, 91, 70);
    expect(monitor.assessMessage(92_000, PHRASES_BY_ID.get('pain')).urgency).toBe('attention');
    feed(monitor, 92, 150, 100);
    const result = monitor.assessMessage(150_000, PHRASES_BY_ID.get('pain'));
    expect(result.urgency).toBe('urgent');
    expect(result.alert.reason).toMatch(/above baseline/);
  });

  it('always treats "cannot breathe" as urgent', () => {
    const monitor = new CareMonitor(0);
    expect(monitor.assessMessage(1000, PHRASES_BY_ID.get('breath')).urgency).toBe('urgent');
    expect(monitor.assessMessage(1000, PHRASES_BY_ID.get('water')).alert).toBeNull();
  });

  it('pauses instead of guessing when the signal is lost', () => {
    const monitor = new CareMonitor(0);
    feed(monitor, 0, 91, 70);
    const lost = feed(monitor, 91, 125, null, 'poor');
    expect(lost).toContainEqual(expect.objectContaining({ state: 'paused' }));
    const back = feed(monitor, 125, 127, 70);
    expect(back).toContainEqual(expect.objectContaining({ state: 'normal' }));
  });

  it('warns about a sustained very low reading', () => {
    const monitor = new CareMonitor(0);
    feed(monitor, 0, 91, 60);
    const events = feed(monitor, 91, 125, 40);
    expect(events).toContainEqual(expect.objectContaining({ type: 'alert', level: 'attention' }));
  });

  it('detects fatigue from the blink rate relative to the patient baseline', () => {
    const monitor = new CareMonitor(0);
    for (let s = 0; s <= RULES.blinkBaselineMs / 1000; s += 10) monitor.updateBlinkRate(s * 1000, 12);
    expect(monitor.updateBlinkRate(130_000, 14)).toBeNull();
    expect(monitor.updateBlinkRate(140_000, 30)).toEqual({ type: 'fatigue', on: true });
    expect(monitor.updateBlinkRate(150_000, 13)).toEqual({ type: 'fatigue', on: false });
  });
});

describe('BoardModel', () => {
  // Every screen's tiles exactly fill its grid (spans included).
  const cellsUsed = (tiles) => tiles.reduce((n, t) => n + (t.span ?? 1), 0);
  const fills = (board) => {
    const { columns, rows } = board.layout();
    expect(cellsUsed(board.tiles(['water', 'pain', 'sleep']))).toBe(columns * rows);
  };

  it('every screen fills its grid', () => {
    const board = new BoardModel();
    fills(board); // home
    board.select({ kind: 'nav', target: 'keyboard' });
    fills(board);
    board.ask('Are you thirsty?');
    fills(board);
    board.sleep();
    fills(board);
    for (const category of CATEGORIES) {
      const b = new BoardModel();
      b.select({ kind: 'nav', target: 'category', categoryId: category.id });
      fills(b);
    }
  });

  it('home shows the six phrases chosen by the nurse, then More and the keyboard', () => {
    const board = new BoardModel();
    board.setHome([{ id: 'sleep' }, { text: 'Is my wife here?' }, { id: 'pain' }, { id: 'cold' }, { id: 'yes' }, { id: 'no' }]);
    const tiles = board.tiles();
    expect(tiles.slice(0, 6).map((t) => t.label)).toEqual(['I want to sleep', 'Is my wife here?', 'I am in pain', 'I am cold', 'Yes', 'No']);
    expect(tiles.at(-1)).toMatchObject({ target: 'keyboard', span: 2 });
    const action = board.select(tiles[1]);
    expect(action.kind).toBe('say');
    expect(board.phrase(action.phraseId).en).toBe('Is my wife here?');
  });

  it('ignores unknown phrase ids from the nurse and fills empty slots', () => {
    const board = new BoardModel();
    board.setHome([{ id: 'not-a-phrase' }, { id: 'pain' }]);
    expect(board.homeItems).toHaveLength(6);
    expect(board.homeItems.some((item) => item.id === 'not-a-phrase')).toBe(false);
  });

  it('reaches any phrase in three selections and returns home after speaking', () => {
    const board = new BoardModel();
    board.select(board.tiles().find((t) => t.target === 'categories')); // More
    board.select(board.tiles().find((t) => t.categoryId === 'needs'));
    const action = board.select(board.tiles().find((t) => t.phraseId === 'water'));
    expect(action).toEqual({ kind: 'say', phraseId: 'water', answeredQuestion: null });
    expect(board.screen.name).toBe('home');
  });

  it('a question shows only the question, Yes and No; the question cannot be chosen', () => {
    const board = new BoardModel();
    board.ask('Are you thirsty?');
    const tiles = board.tiles();
    expect(tiles.map((t) => t.kind)).toEqual(['question', 'phrase', 'phrase']);
    expect(tiles[0].inert).toBe(true);
    expect(board.select(tiles[0])).toEqual({ kind: 'none' });
    expect(board.select(tiles[1])).toEqual({ kind: 'say', phraseId: 'yes', answeredQuestion: 'Are you thirsty?' });
  });

  it('"yes" to the system\'s "Are you in pain?" says "I am in pain"', () => {
    const board = new BoardModel();
    board.ask('Are you in pain?', { yesMeans: 'pain' });
    expect(board.select(board.tiles()[1])).toEqual({ kind: 'say', phraseId: 'pain', answeredQuestion: 'Are you in pain?' });
  });

  it('types with the keyboard, pages through letters and speaks the text', () => {
    const board = new BoardModel();
    board.select({ kind: 'nav', target: 'keyboard' });
    const pick = (char) => board.select(board.tiles().find((t) => t.kind === 'key' && t.char === char));
    pick('م');
    pick('ا');
    expect(board.typed).toBe('ما');
    const firstPage = board.tiles().filter((t) => t.kind === 'key' && t.char.length === 1);
    expect(firstPage).toHaveLength(12);
    board.select(board.tiles().find((t) => t.kind === 'page' && t.delta === 1));
    expect(board.tiles().find((t) => t.kind === 'key' && t.char.length === 1).char).toBe('ف');
    board.select(board.tiles().find((t) => t.kind === 'page' && t.delta === -1));
    board.select(board.tiles().find((t) => t.kind === 'page' && t.delta === -1)); // wraps to the last page
    expect(board.page).toBe(2);
    pick('delete');
    expect(board.typed).toBe('م');
    const action = board.select(board.tiles().find((t) => t.kind === 'speak'));
    expect(action).toEqual({ kind: 'sayText', text: 'م', alphabet: 'ar' });
    expect(board.screen.name).toBe('home');
  });

  it('a phrase suggestion on the keyboard is said at once', () => {
    const board = new BoardModel();
    board.select({ kind: 'nav', target: 'keyboard' });
    const suggestion = board.tiles(['pain', 'nurse']).find((t) => t.kind === 'suggestion');
    expect(board.select(suggestion)).toEqual({ kind: 'say', phraseId: 'pain', answeredQuestion: null });
  });

  it('sleeps with one dot and wakes back to where the patient was', () => {
    const board = new BoardModel();
    board.select({ kind: 'nav', target: 'keyboard' });
    board.sleep();
    const tiles = board.tiles();
    expect(tiles.filter((t) => !t.inert).map((t) => t.kind)).toEqual(['wake']);
    expect(board.select(tiles[4])).toEqual({ kind: 'wake' });
    expect(board.screen.name).toBe('keyboard');
  });

  it('toggles vitals sharing from the settings screen', () => {
    const board = new BoardModel();
    board.select({ kind: 'nav', target: 'category', categoryId: 'controls' });
    const toggle = board.tiles().find((t) => t.name === 'shareVitals');
    board.select(toggle);
    expect(board.settings.shareVitals).toBe(false);
  });

  it('back goes from a category to the category list, then home', () => {
    const board = new BoardModel();
    board.select({ kind: 'nav', target: 'category', categoryId: 'body' });
    board.select(board.tiles()[5]);
    expect(board.screen.name).toBe('categories');
    board.select(board.tiles()[5]);
    expect(board.screen.name).toBe('home');
  });

  it('every category has exactly five phrases', () => {
    for (const category of CATEGORIES.filter((c) => c.id !== 'controls')) {
      expect(PHRASES.filter((p) => p.category === category.id)).toHaveLength(5);
    }
  });
});

describe('cellMap', () => {
  it('maps spans and leaves inert cells unchoosable', () => {
    const cells = cellMap(
      [{ inert: true, span: 2 }, {}, {}, { span: 2 }],
      { columns: 3, rows: 2 },
    );
    // a 2-wide inert tile, then one tile; next row: one tile, then a 2-wide tile
    expect(cells).toEqual([
      [null, null, 1],
      [2, 3, 3],
    ]);
  });
});

describe('keyboard', () => {
  it('has pages of 12 letters, most used letters first', () => {
    for (const alphabet of Object.keys(ALPHABETS)) {
      const all = keyboardPages(alphabet);
      expect(all.length).toBeGreaterThanOrEqual(3);
      for (const page of all) expect(page).toHaveLength(12);
      expect(new Set(all.flat()).size).toBe(all.flat().length); // no letter twice
    }
    expect(keyboardPages('ar')[0].slice(0, 3)).toEqual(['ا', 'ل', 'ي']);
    expect(keyboardPages('latin')[0][0]).toBe('e');
  });

  it('applies space and delete sensibly', () => {
    expect(applyKey('', 'space')).toBe('');
    expect(applyKey('ma', 'space')).toBe('ma ');
    expect(applyKey('ma ', 'space')).toBe('ma ');
    expect(applyKey('ma', 'delete')).toBe('m');
    expect(applyKey('', 'delete')).toBe('');
  });

  it('with nothing typed, suggests the phrase model\'s top phrases', () => {
    expect(suggestKeys({ text: '', alphabet: 'ar', rankedPhraseIds: ['pain', 'nurse', 'water'] })).toEqual([
      { kind: 'phrase', phraseId: 'pain' },
      { kind: 'phrase', phraseId: 'nurse' },
    ]);
  });

  it('suggests phrases that start with the typed letters', () => {
    const ranked = ['water', 'sleep', 'family'];
    const [first] = suggestKeys({ text: 'نحب ن', alphabet: 'ar', rankedPhraseIds: ranked });
    // "نحب نشرب" (water), "نحب نرقد" (sleep): the higher-ranked one comes first
    expect(first).toEqual({ kind: 'phrase', phraseId: 'water' });
  });

  it('a racing heart puts distress phrases first among matches', () => {
    // "عيطولي ..." starts four phrases: nurse, doctor, daughter, son.
    const model = seedPredictor(new PhrasePredictor());
    const ranked = (distress) => model.rank({ previousId: null, hour: 15, distress }).map((e) => e.id);
    const calm = suggestKeys({ text: 'عيطولي', alphabet: 'ar', rankedPhraseIds: ranked(false) });
    const racing = suggestKeys({ text: 'عيطولي', alphabet: 'ar', rankedPhraseIds: ranked(true), distress: true });
    expect(calm[0].phraseId).not.toBe('nurse'); // at 3 pm this patient usually calls family
    expect(racing[0]).toEqual({ kind: 'phrase', phraseId: 'nurse' });
    // Nothing typed yet: distress phrases come first too.
    expect(DISTRESS.has(suggestKeys({ text: '', alphabet: 'ar', rankedPhraseIds: ranked(false), distress: true })[0].phraseId)).toBe(true);
  });

  it('completes words this patient typed before, most used first', () => {
    const lexicon = learnWords({}, 'mart ya mra marti marti');
    const result = suggestKeys({ text: 'mar', alphabet: 'latin', rankedPhraseIds: [], lexicon });
    expect(result).toContainEqual({ kind: 'word', word: 'marti' });
    expect(completeWord('ana nheb mar', 'marti')).toBe('ana nheb marti ');
  });

  it('matches Arabic spelling variants', () => {
    expect(normalise('أكلة')).toBe(normalise('اكله'));
  });
});

describe('screen sleep', () => {
  const now = 1_000_000;
  it('stays awake longer when the heart rate is above baseline', () => {
    const calm = sleepDelayMs({ hr: 70, baseline: 70, state: 'normal', now });
    const raised = sleepDelayMs({ hr: 80, baseline: 70, state: 'normal', now });
    const high = sleepDelayMs({ hr: 95, baseline: 70, state: 'normal', now });
    expect(calm).toBe(SLEEP_RULES.calmMs);
    expect(raised).toBeGreaterThan(calm);
    expect(high).toBe(SLEEP_RULES.distressMs);
  });

  it('stays awake longest in distress or after a call for help, never with an urgent alert open', () => {
    expect(sleepDelayMs({ hr: null, baseline: null, state: 'elevated', now })).toBe(SLEEP_RULES.distressMs);
    expect(sleepDelayMs({ hr: 70, baseline: 70, state: 'normal', lastHelpAt: now - 60_000, now })).toBe(SLEEP_RULES.distressMs);
    expect(sleepDelayMs({ hr: 70, baseline: 70, state: 'normal', urgentOpen: true, now })).toBeNull();
  });
});

describe('protocol', () => {
  const frame = (type, payload) => JSON.stringify({ type, ts: 1, payload });

  it('accepts the nurse\'s home phrases and rejects malformed ones', () => {
    const home = [{ id: 'water' }, { text: 'Is my wife here?' }, { id: 'pain' }, { id: 'nurse' }, { id: 'yes' }, { id: 'no' }];
    expect(parseEvent(frame('board', { home, alphabet: 'ar' }), CAREGIVER_EVENTS).ok).toBe(true);
    expect(parseEvent(frame('board', { home: home.slice(0, 5), alphabet: 'ar' }), CAREGIVER_EVENTS).ok).toBe(false);
    expect(parseEvent(frame('board', { home, alphabet: 'klingon' }), CAREGIVER_EVENTS).ok).toBe(false);
    expect(parseEvent(frame('board', { home: [...home.slice(0, 5), { id: 'x', text: 'both' }], alphabet: 'ar' }), CAREGIVER_EVENTS).ok).toBe(false);
    expect(parseEvent(frame('board', { home, alphabet: 'ar' }), PATIENT_EVENTS).ok).toBe(false); // only caregivers change it
  });

  it('accepts a well-formed message from the patient', () => {
    const result = parseEvent(frame('message', { id: 'water', text: 'I want to drink', urgency: 'routine', category: 'needs' }), PATIENT_EVENTS);
    expect(result.ok).toBe(true);
  });

  it('rejects event types the sender may not use', () => {
    expect(parseEvent(frame('question', { text: 'hi' }), PATIENT_EVENTS).ok).toBe(false);
    expect(parseEvent(frame('alert', { id: 'x', level: 'urgent', reason: 'r' }), CAREGIVER_EVENTS).ok).toBe(false);
  });

  it('rejects malformed payloads and oversized frames', () => {
    expect(parseEvent(frame('vitals', { hr: 'fast', rr: null, quality: 'good', simulated: false }), PATIENT_EVENTS).ok).toBe(false);
    expect(parseEvent('{not json', PATIENT_EVENTS).ok).toBe(false);
    expect(parseEvent('x'.repeat(5000), PATIENT_EVENTS).ok).toBe(false);
  });
});
