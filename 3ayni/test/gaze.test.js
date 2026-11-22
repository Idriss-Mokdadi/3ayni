import { describe, expect, it } from 'vitest';
import { fitRidge, solve } from '../web/src/patient/gaze/ridge.js';
import { GazeCalibration, DEFAULT_TARGETS } from '../web/src/patient/gaze/calibration.js';
import { OneEuroFilter } from '../web/src/patient/gaze/one-euro.js';
import { SelectionEngine } from '../web/src/patient/gaze/selection.js';
import { extractGazeFeatures, eyeClosure } from '../web/src/patient/gaze/features.js';

function seededRandom(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('solve', () => {
  it('solves a 3x3 system', () => {
    const x = solve(
      [
        [2, 1, -1],
        [-3, -1, 2],
        [-2, 1, 2],
      ],
      [8, -11, -3],
    );
    expect(x[0]).toBeCloseTo(2);
    expect(x[1]).toBeCloseTo(3);
    expect(x[2]).toBeCloseTo(-1);
  });
});

describe('fitRidge', () => {
  it('recovers a linear relationship with small penalty', () => {
    const rand = seededRandom(3);
    const X = [];
    const y = [];
    for (let i = 0; i < 200; i++) {
      const a = rand();
      const b = rand() * 10;
      X.push([a, b]);
      y.push(3 * a - 0.5 * b + 2);
    }
    const model = fitRidge(X, y, 1e-6);
    expect(model.predict([0.4, 6])).toBeCloseTo(3 * 0.4 - 3 + 2, 4);
  });
});

describe('GazeCalibration', () => {
  // Synthetic person: features are a noisy linear function of where they look.
  const featuresFor = (target, rand) => [
    0.5 + 0.08 * (target.x - 0.5) + (rand() - 0.5) * 0.004,
    0.5 + 0.05 * (target.y - 0.5) + (rand() - 0.5) * 0.004,
    0.6 * (target.x - 0.5) + (rand() - 0.5) * 0.03,
    -0.5 * (target.y - 0.5) + (rand() - 0.5) * 0.03,
    0.02 * (target.x - 0.5),
    0.01 * (target.y - 0.5),
  ];

  it('learns a usable mapping from five dots', () => {
    const rand = seededRandom(7);
    const calibration = new GazeCalibration();
    // The person looks at whichever dot is currently shown (30 fps).
    const dotAt = (t) => DEFAULT_TARGETS[Math.min(Math.floor(t / 1700), DEFAULT_TARGETS.length - 1)];
    for (let t = 0; !calibration.update(t, featuresFor(dotAt(t), rand)).done; t += 33);

    const result = calibration.finish();
    expect(result.ok).toBe(true);
    expect(result.error).toBeLessThan(0.08);

    // Unseen positions: the centre of each tile of a 3x2 board.
    for (const target of [
      { x: 1 / 6, y: 0.25 },
      { x: 0.5, y: 0.75 },
      { x: 5 / 6, y: 0.25 },
    ]) {
      const p = result.model.predict(featuresFor(target, rand));
      expect(Math.abs(p.x - target.x)).toBeLessThan(0.1);
      expect(Math.abs(p.y - target.y)).toBeLessThan(0.15);
    }
  });

  it('refuses to finish when a dot got no eye data', () => {
    const calibration = new GazeCalibration();
    for (let t = 0; t < 10_000; t += 33) calibration.update(t, null);
    expect(calibration.finish().ok).toBe(false);
  });

  it('has the centre dot first', () => {
    expect(DEFAULT_TARGETS[0]).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('OneEuroFilter', () => {
  it('reduces jitter of a still signal', () => {
    const rand = seededRandom(11);
    const filter = new OneEuroFilter();
    let rawVariance = 0;
    let filteredVariance = 0;
    for (let i = 0; i < 300; i++) {
      const noisy = 0.5 + (rand() - 0.5) * 0.1;
      const smooth = filter.filter(noisy, i * 33);
      if (i > 30) {
        rawVariance += (noisy - 0.5) ** 2;
        filteredVariance += (smooth - 0.5) ** 2;
      }
    }
    expect(filteredVariance).toBeLessThan(rawVariance / 4);
  });
});

describe('SelectionEngine', () => {
  const run = (engine, from, to, input, step = 33) => {
    const events = [];
    for (let t = from; t < to; t += step) events.push(...engine.update(t, input));
    return events;
  };

  it('selects after the dwell time, not before', () => {
    const engine = new SelectionEngine({ dwellMs: 1400, cooldownMs: 0 });
    const early = run(engine, 0, 1200, { tile: 2, closure: 0 });
    expect(early.some((e) => e.type === 'select')).toBe(false);
    const later = run(engine, 1200, 1700, { tile: 2, closure: 0 });
    expect(later.filter((e) => e.type === 'select')).toEqual([{ type: 'select', tile: 2, via: 'dwell' }]);
  });

  it('restarts the dwell when the gaze moves to another tile', () => {
    const engine = new SelectionEngine({ dwellMs: 1400, cooldownMs: 0 });
    run(engine, 0, 1000, { tile: 1, closure: 0 });
    const events = run(engine, 1000, 2300, { tile: 4, closure: 0 });
    expect(events.some((e) => e.type === 'select')).toBe(false);
  });

  it('counts a short blink but does not select with it', () => {
    const engine = new SelectionEngine({ dwellEnabled: false, cooldownMs: 0 });
    run(engine, 0, 500, { tile: 0, closure: 0 });
    run(engine, 500, 650, { tile: 0, closure: 0.9 });
    const events = run(engine, 650, 700, { tile: 0, closure: 0 });
    expect(events.map((e) => e.type)).toContain('blink');
    expect(events.some((e) => e.type === 'select')).toBe(false);
    expect(engine.blinkRate(700)).toBe(1);
  });

  it('selects the hovered tile with a deliberate long blink', () => {
    const engine = new SelectionEngine({ dwellEnabled: false, cooldownMs: 0 });
    run(engine, 0, 500, { tile: 3, closure: 0 });
    run(engine, 500, 1400, { tile: null, closure: 0.95 });
    const events = run(engine, 1400, 1450, { tile: 3, closure: 0 });
    expect(events).toContainEqual({ type: 'select', tile: 3, via: 'blink' });
  });

  it('ignores eyes closed for a long time (sleep)', () => {
    const engine = new SelectionEngine({ dwellEnabled: false, cooldownMs: 0 });
    run(engine, 0, 500, { tile: 3, closure: 0 });
    run(engine, 500, 6000, { tile: null, closure: 0.95 });
    const events = run(engine, 6000, 6050, { tile: 3, closure: 0 });
    expect(events.some((e) => e.type === 'select')).toBe(false);
  });

  it('does not select again during the cooldown', () => {
    const engine = new SelectionEngine({ dwellMs: 1000, cooldownMs: 900 });
    const events = run(engine, 0, 3000, { tile: 0, closure: 0 });
    const selects = events.filter((e) => e.type === 'select');
    expect(selects.length).toBe(1);
  });
});

describe('extractGazeFeatures', () => {
  const makeFace = (irisShift) => {
    const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    const set = (i, x, y) => (points[i] = { x, y, z: 0 });
    set(33, 0.38, 0.4);
    set(133, 0.46, 0.4);
    set(159, 0.42, 0.385);
    set(145, 0.42, 0.415);
    set(362, 0.54, 0.4);
    set(263, 0.62, 0.4);
    set(386, 0.58, 0.385);
    set(374, 0.58, 0.415);
    set(468, 0.42 + irisShift, 0.4);
    set(473, 0.58 + irisShift, 0.4);
    set(1, 0.5, 0.5);
    set(234, 0.3, 0.45);
    set(454, 0.7, 0.45);
    set(10, 0.5, 0.25);
    set(152, 0.5, 0.75);
    return points;
  };

  it('moves irisX with the iris and stays centred when looking ahead', () => {
    const centre = extractGazeFeatures(makeFace(0), {});
    const right = extractGazeFeatures(makeFace(0.02), {});
    expect(centre[0]).toBeCloseTo(0.5, 5);
    expect(right[0]).toBeGreaterThan(centre[0]);
  });

  it('returns null without a full mesh', () => {
    expect(extractGazeFeatures([], {})).toBeNull();
  });

  it('uses the more open eye for closure', () => {
    expect(eyeClosure({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.2 })).toBe(0.2);
  });
});
