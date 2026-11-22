import { describe, expect, it } from 'vitest';
import { fitRidge, solve } from '../web/src/patient/gaze/ridge.js';
import { GazeCalibration, DEFAULT_TARGETS, SETTLE_MS, CAPTURE_MS, dropOutliers } from '../web/src/patient/gaze/calibration.js';
import { OneEuroFilter } from '../web/src/patient/gaze/one-euro.js';
import { SelectionEngine } from '../web/src/patient/gaze/selection.js';
import { extractGazeFeatures, eyeClosure, FEATURE_NAMES } from '../web/src/patient/gaze/features.js';

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
  const PER_DOT = SETTLE_MS + CAPTURE_MS;
  const run = (calibration, featuresFor, rand) => {
    // The person looks at whichever dot is currently shown (30 fps).
    const dotAt = (t) => DEFAULT_TARGETS[Math.min(Math.floor(t / PER_DOT), DEFAULT_TARGETS.length - 1)];
    for (let t = 0; !calibration.update(t, featuresFor(dotAt(t), rand)).done; t += 33);
    return calibration.finish();
  };
  // Unseen positions: tile centres of the 3x3 home screen.
  const UNSEEN = [
    { x: 1 / 6, y: 1 / 6 },
    { x: 0.5, y: 0.5 },
    { x: 5 / 6, y: 5 / 6 },
    { x: 1 / 6, y: 5 / 6 },
    { x: 0.5, y: 1 / 6 },
  ];

  // Camera in front: features are a noisy linear function of where they look.
  const frontCamera = (target, rand) => [
    0.5 + 0.08 * (target.x - 0.5) + (rand() - 0.5) * 0.004,
    0.5 + 0.05 * (target.y - 0.5) + (rand() - 0.5) * 0.004,
    0.03 * (target.y - 0.5) + (rand() - 0.5) * 0.002,
    0.3 - 0.04 * (target.y - 0.5) + (rand() - 0.5) * 0.004,
    0.6 * (target.x - 0.5) + (rand() - 0.5) * 0.03,
    -0.5 * (target.y - 0.5) + (rand() - 0.5) * 0.03,
    0.02 * (target.x - 0.5),
    0.01 * (target.y - 0.5),
  ];

  // Camera below the screen (a phone under a monitor): the face is seen from
  // below, the iris barely moves up and down and its position between the
  // lids is pure noise; the vertical signal is in the eye opening and the
  // iris height, and it flattens towards the top of the screen (curved).
  const cameraBelow = (target, rand) => {
    const v = target.y - 0.5;
    return [
      0.5 + 0.07 * (target.x - 0.5) + 0.02 * (target.x - 0.5) ** 3 + (rand() - 0.5) * 0.004,
      0.5 + (rand() - 0.5) * 0.08, // between the lids: no information
      0.012 * v + 0.02 * v * v + (rand() - 0.5) * 0.0015,
      0.42 - 0.06 * v + 0.05 * v * v + (rand() - 0.5) * 0.004,
      0.5 * (target.x - 0.5) + (rand() - 0.5) * 0.04,
      -0.15 * v + (rand() - 0.5) * 0.05,
      0.02 * (target.x - 0.5),
      0.015 * v + (rand() - 0.5) * 0.002,
    ];
  };

  it('learns a usable mapping from nine dots', () => {
    const rand = seededRandom(7);
    const result = run(new GazeCalibration(), frontCamera, rand);
    expect(result.ok).toBe(true);
    expect(result.error).toBeLessThan(0.08);
    for (const target of UNSEEN) {
      const p = result.model.predict(frontCamera(target, rand));
      expect(Math.abs(p.x - target.x)).toBeLessThan(0.08);
      expect(Math.abs(p.y - target.y)).toBeLessThan(0.1);
    }
  });

  it('still finds the right row with the camera below the screen', () => {
    const rand = seededRandom(21);
    const result = run(new GazeCalibration(), cameraBelow, rand);
    expect(result.ok).toBe(true);
    for (const target of UNSEEN) {
      const p = result.model.predict(cameraBelow(target, rand));
      expect(Math.abs(p.y - target.y)).toBeLessThan(1 / 6); // inside the right row of a 3-row board
      expect(Math.abs(p.x - target.x)).toBeLessThan(1 / 6);
    }
  });

  it('ignores blinks and glances away during a dot', () => {
    const rand = seededRandom(5);
    let frame = 0;
    const noisy = (target, r) => {
      frame += 1;
      const f = frontCamera(target, r);
      // One frame in five is a blink or a glance: wildly wrong eye features.
      if (frame % 5 === 0) return f.map((v, j) => (j < 4 ? v + 0.3 * (r() - 0.5) : v));
      return f;
    };
    const result = run(new GazeCalibration(), noisy, rand);
    expect(result.ok).toBe(true);
    for (const target of UNSEEN) {
      const p = result.model.predict(frontCamera(target, rand));
      expect(Math.hypot(p.x - target.x, p.y - target.y)).toBeLessThan(0.12);
    }
  });

  it('dropOutliers keeps the steady samples', () => {
    const steady = Array.from({ length: 20 }, (_, i) => [0.5 + i * 1e-4, 0.5, 0.01, 0.3]);
    const kept = dropOutliers([...steady, [0.9, 0.1, 0.2, 0.05]]);
    expect(kept).toHaveLength(20);
  });

  it('refuses to finish when a dot got no eye data', () => {
    const calibration = new GazeCalibration();
    for (let t = 0; t < 30_000; t += 33) calibration.update(t, null);
    expect(calibration.finish().ok).toBe(false);
  });

  it('has the centre dot first and reaches the corners', () => {
    expect(DEFAULT_TARGETS[0]).toEqual({ x: 0.5, y: 0.5 });
    expect(DEFAULT_TARGETS).toHaveLength(9);
    expect(DEFAULT_TARGETS).toContainEqual({ x: 0.1, y: 0.12 });
    expect(DEFAULT_TARGETS).toContainEqual({ x: 0.9, y: 0.88 });
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

  it('closing the eyes cancels the current choice and never selects', () => {
    const engine = new SelectionEngine({ dwellMs: 1400, cooldownMs: 0 });
    run(engine, 0, 1200, { tile: 2, closure: 0 }); // ring almost full
    const closed = run(engine, 1200, 4000, { tile: 2, closure: 0.95 });
    expect(closed).toContainEqual({ type: 'hover', tile: null });
    expect(closed.some((e) => e.type === 'select')).toBe(false);
    // Eyes open again: the dwell starts from zero, not from where it was.
    const reopened = run(engine, 4000, 5000, { tile: 2, closure: 0 });
    expect(reopened.some((e) => e.type === 'select')).toBe(false);
  });

  it('can select with a deliberate long blink when that option is turned on', () => {
    const engine = new SelectionEngine({ dwellEnabled: false, blinkEnabled: true, cooldownMs: 0 });
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

  it('measures iris height and eye opening, which carry up-down gaze', () => {
    const level = extractGazeFeatures(makeFace(0), {});
    const lowered = makeFace(0);
    lowered[468] = { x: 0.42, y: 0.41, z: 0 };
    lowered[473] = { x: 0.58, y: 0.41, z: 0 };
    const down = extractGazeFeatures(lowered, {});
    expect(FEATURE_NAMES).toHaveLength(level.length);
    expect(down[FEATURE_NAMES.indexOf('irisHeight')]).toBeGreaterThan(level[FEATURE_NAMES.indexOf('irisHeight')]);
    expect(level[FEATURE_NAMES.indexOf('eyeOpening')]).toBeCloseTo(0.03 / 0.08, 5);
  });

  it('uses the 3D head pose when MediaPipe provides it', () => {
    const pose = [1, 0, 0, 0, 0, 1, 0, 0, 0.2, -0.3, 0.93, 0, 0, 0, 0, 1];
    const f = extractGazeFeatures(makeFace(0), {}, pose);
    expect(f[FEATURE_NAMES.indexOf('headYaw')]).toBe(0.2);
    expect(f[FEATURE_NAMES.indexOf('headPitch')]).toBe(-0.3);
  });

  it('returns null without a full mesh', () => {
    expect(extractGazeFeatures([], {})).toBeNull();
  });

  it('uses the more open eye for closure', () => {
    expect(eyeClosure({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.2 })).toBe(0.2);
  });
});
