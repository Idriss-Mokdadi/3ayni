import { describe, expect, it } from 'vitest';
import { PhrasePredictor, timeBucket } from '../web/src/patient/predictor.js';
import { seedPredictor, generateRoutines } from '../web/src/patient/care-routines.js';
import { CareMonitor, RULES } from '../web/src/patient/fusion.js';
import { BoardModel, TILE_COUNT } from '../web/src/patient/board/board-model.js';
import { PHRASES, PHRASES_BY_ID, CATEGORIES } from '../web/src/patient/board/phrases.js';
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
  it('always shows exactly six tiles', () => {
    const board = new BoardModel();
    expect(board.tiles(['water', 'pain', 'sleep'])).toHaveLength(TILE_COUNT);
    board.select(board.tiles()[5]); // More
    expect(board.screen.name).toBe('categories');
    expect(board.tiles()).toHaveLength(TILE_COUNT);
    for (const category of CATEGORIES) {
      const b = new BoardModel();
      b.select({ kind: 'nav', target: 'category', categoryId: category.id });
      expect(b.tiles()).toHaveLength(TILE_COUNT);
    }
  });

  it('reaches any phrase in three selections and returns home after speaking', () => {
    const board = new BoardModel();
    board.select(board.tiles([])[5]); // More
    board.select(board.tiles().find((t) => t.categoryId === 'needs'));
    const action = board.select(board.tiles().find((t) => t.phraseId === 'water'));
    expect(action).toEqual({ kind: 'say', phraseId: 'water', answeredQuestion: null });
    expect(board.screen.name).toBe('home');
  });

  it('reports which question an answer belongs to', () => {
    const board = new BoardModel();
    board.ask('Are you thirsty?');
    const action = board.select(board.tiles()[0]);
    expect(action).toEqual({ kind: 'say', phraseId: 'yes', answeredQuestion: 'Are you thirsty?' });
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

describe('protocol', () => {
  const frame = (type, payload) => JSON.stringify({ type, ts: 1, payload });

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
