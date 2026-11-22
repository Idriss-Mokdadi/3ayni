// Personal gaze calibration. The person looks at nine dots (a 3 x 3 grid that
// reaches the corners, where the board's tiles are); we record their eye and
// head features at each dot and fit one ridge regression per screen axis.
//
// Three things make it hold up with an awkward camera position (for example a
// phone below the screen, looking up at the face):
//   - curved terms: squares and a cross term of the eye features, because the
//     iris moves less and less towards the edges of the screen;
//   - noisy samples dropped: frames far from the median at a dot (a blink, a
//     glance away, a late saccade) are left out before fitting;
//   - the penalty strength is chosen by leaving each dot out in turn and
//     checking how well the others predict it, so the model is judged on
//     points it did not see, not on the ones it memorised;
//   - a stretch per axis undoes the pull towards the middle. A penalised
//     model plays safe and aims a little towards the centre of the screen,
//     which hardly matters there but makes the corners hard to reach. The
//     same left-out predictions show by how much, and a straight-line fit
//     of "where the dot was" against "where the model said" corrects it.

import { fitRidge } from './ridge.js';

/** Screen positions in normalised units (0..1): centre first, then the edges and corners. */
export const DEFAULT_TARGETS = [
  { x: 0.5, y: 0.5 },
  { x: 0.1, y: 0.12 },
  { x: 0.5, y: 0.12 },
  { x: 0.9, y: 0.12 },
  { x: 0.9, y: 0.5 },
  { x: 0.9, y: 0.88 },
  { x: 0.5, y: 0.88 },
  { x: 0.1, y: 0.88 },
  { x: 0.1, y: 0.5 },
];

export const SETTLE_MS = 650; // eyes travel to the dot, samples ignored
export const CAPTURE_MS = 1000; // samples recorded
const MIN_SAMPLES_PER_TARGET = 8;
const LAMBDAS = [0.05, 0.2, 0.5, 2, 8];
const MAX_STRETCH = 1.8; // never stretch more than this (a noisy calibration must not explode)

// Feature indices (see features.js FEATURE_NAMES) given curved terms.
const IRIS_X = 0;
const IRIS_HEIGHT = 2;
const LOOK_X = 4;
const LOOK_Y = 5;

/** Adds squares and a cross term of the main eye features. */
export function expandFeatures(f) {
  return [
    ...f,
    f[IRIS_X] ** 2,
    f[IRIS_HEIGHT] ** 2,
    f[IRIS_X] * f[IRIS_HEIGHT],
    f[LOOK_X] ** 2,
    f[LOOK_Y] ** 2,
  ];
}

/** Keeps the samples close to the median at one dot (robust to blinks and glances). */
export function dropOutliers(samples, limit = 3) {
  if (samples.length < 5) return samples;
  const d = samples[0].length;
  const median = (values) => {
    const s = [...values].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const centre = [];
  const spread = [];
  for (let j = 0; j < d; j++) {
    const column = samples.map((row) => row[j]);
    centre[j] = median(column);
    spread[j] = median(column.map((v) => Math.abs(v - centre[j]))) || 1e-9;
  }
  // Only the eye features decide: head features may legitimately drift a little.
  const checked = [IRIS_X, 1, IRIS_HEIGHT, 3];
  const kept = samples.filter((row) => checked.every((j) => Math.abs(row[j] - centre[j]) / spread[j] <= limit));
  return kept.length >= Math.min(MIN_SAMPLES_PER_TARGET, samples.length) ? kept : samples;
}

export class GazeCalibration {
  constructor({ targets = DEFAULT_TARGETS, settleMs = SETTLE_MS, captureMs = CAPTURE_MS, lambdas = LAMBDAS } = {}) {
    this.targets = targets;
    this.settleMs = settleMs;
    this.captureMs = captureMs;
    this.lambdas = lambdas;
    this.samples = targets.map(() => []);
    this.startTime = null;
  }

  /** Total duration in ms, for the on-screen hint. */
  get durationMs() {
    return this.targets.length * (this.settleMs + this.captureMs);
  }

  /**
   * Feed one frame. Returns where the dot should be and whether we are done.
   * @param {number} t ms
   * @param {number[]|null} features null when the eyes are closed or the face is lost
   */
  update(t, features) {
    if (this.startTime === null) this.startTime = t;
    const perTarget = this.settleMs + this.captureMs;
    const elapsed = t - this.startTime;
    const index = Math.floor(elapsed / perTarget);
    if (index >= this.targets.length) return { done: true };

    const withinTarget = elapsed - index * perTarget;
    const capturing = withinTarget >= this.settleMs;
    if (capturing && features) this.samples[index].push(features);
    return {
      done: false,
      index,
      target: this.targets[index],
      capturing,
      progress: (index + withinTarget / perTarget) / this.targets.length,
    };
  }

  /**
   * Fits the model from the collected samples.
   * @returns {{ok: true, model: GazeModel, error: number, errorX: number, errorY: number, lambda: number} | {ok: false, reason: string}}
   */
  finish() {
    const missing = this.samples.findIndex((s) => s.length < MIN_SAMPLES_PER_TARGET);
    if (missing !== -1) return { ok: false, reason: `Not enough eye data at point ${missing + 1}` };

    const groups = this.samples.map((s) => dropOutliers(s).map(expandFeatures));
    const fit = (lambda, skip = -1) => {
      const X = [];
      const xs = [];
      const ys = [];
      groups.forEach((rows, i) => {
        if (i === skip) return;
        for (const row of rows) {
          X.push(row);
          xs.push(this.targets[i].x);
          ys.push(this.targets[i].y);
        }
      });
      return new GazeModel(fitRidge(X, xs, lambda), fitRidge(X, ys, lambda));
    };

    // Leave-one-dot-out: how well does each penalty predict a dot it never saw?
    let best = { lambda: this.lambdas[0], score: Infinity };
    for (const lambda of this.lambdas) {
      let sum = 0;
      groups.forEach((rows, i) => {
        const model = fit(lambda, i);
        const p = model.predictMean(rows);
        sum += (p.x - this.targets[i].x) ** 2 + (p.y - this.targets[i].y) ** 2;
      });
      if (sum < best.score) best = { lambda, score: sum };
    }

    // Where each dot lands when the model never saw it (raw, before clamping).
    const heldOut = groups.map((rows, i) => fit(best.lambda, i).predictMeanRaw(rows));
    const stretch = {
      x: fitStretch(heldOut.map((p) => p.x), this.targets.map((t) => t.x)),
      y: fitStretch(heldOut.map((p) => p.y), this.targets.map((t) => t.y)),
    };
    const model = fit(best.lambda);
    model.stretch = stretch;

    // Reported error: on held-out dots, after the stretch, per axis.
    let ex = 0;
    let ey = 0;
    heldOut.forEach((p, i) => {
      ex += (clamp(stretch.x.offset + stretch.x.gain * p.x, 0, 1) - this.targets[i].x) ** 2;
      ey += (clamp(stretch.y.offset + stretch.y.gain * p.y, 0, 1) - this.targets[i].y) ** 2;
    });
    const errorX = Math.sqrt(ex / groups.length);
    const errorY = Math.sqrt(ey / groups.length);
    return { ok: true, model, error: Math.hypot(errorX, errorY), errorX, errorY, lambda: best.lambda, stretch };
  }
}

/**
 * Straight-line fit target = offset + gain * predicted (least squares), with
 * the gain kept between 1 (no shrinking) and MAX_STRETCH.
 */
export function fitStretch(predicted, targets) {
  const n = predicted.length;
  const mp = predicted.reduce((a, b) => a + b, 0) / n;
  const mt = targets.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varP = 0;
  for (let i = 0; i < n; i++) {
    cov += (predicted[i] - mp) * (targets[i] - mt);
    varP += (predicted[i] - mp) ** 2;
  }
  const gain = varP > 1e-12 ? Math.min(MAX_STRETCH, Math.max(1, cov / varP)) : 1;
  return { gain, offset: mt - gain * mp };
}

export class GazeModel {
  constructor(xRegression, yRegression) {
    this.xRegression = xRegression;
    this.yRegression = yRegression;
    this.stretch = { x: { gain: 1, offset: 0 }, y: { gain: 1, offset: 0 } };
  }

  /**
   * @param {number[]} features raw features (FEATURE_NAMES order)
   * @returns {{x: number, y: number}} normalised screen position, clamped to the screen
   */
  predict(features) {
    return this.#predictExpanded(expandFeatures(features));
  }

  /** Average prediction over already-expanded rows (used during calibration). */
  predictMean(rows) {
    let x = 0;
    let y = 0;
    for (const row of rows) {
      const p = this.#predictExpanded(row);
      x += p.x / rows.length;
      y += p.y / rows.length;
    }
    return { x, y };
  }

  /** Average unclamped prediction, before the stretch (used to measure the stretch). */
  predictMeanRaw(rows) {
    let x = 0;
    let y = 0;
    for (const row of rows) {
      x += this.xRegression.predict(row) / rows.length;
      y += this.yRegression.predict(row) / rows.length;
    }
    return { x, y };
  }

  #predictExpanded(row) {
    const { x: sx, y: sy } = this.stretch;
    return {
      x: clamp(sx.offset + sx.gain * this.xRegression.predict(row), 0, 1),
      y: clamp(sy.offset + sy.gain * this.yRegression.predict(row), 0, 1),
    };
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
