// Personal gaze calibration. The person looks at a few dots; we record their
// eye and head features at each dot and fit one ridge regression per screen
// axis. Works whether the person moves only the eyes or the whole head.

import { fitRidge } from './ridge.js';

/** Screen positions in normalised units (0..1), centre first. */
export const DEFAULT_TARGETS = [
  { x: 0.5, y: 0.5 },
  { x: 0.1, y: 0.5 },
  { x: 0.9, y: 0.5 },
  { x: 0.5, y: 0.12 },
  { x: 0.5, y: 0.88 },
];

const SETTLE_MS = 700; // eyes travel to the dot, samples ignored
const CAPTURE_MS = 1000; // samples recorded
const MIN_SAMPLES_PER_TARGET = 8;

export class GazeCalibration {
  constructor({ targets = DEFAULT_TARGETS, settleMs = SETTLE_MS, captureMs = CAPTURE_MS, lambda = 0.5 } = {}) {
    this.targets = targets;
    this.settleMs = settleMs;
    this.captureMs = captureMs;
    this.lambda = lambda;
    this.samples = targets.map(() => []);
    this.startTime = null;
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
   * @returns {{ok: true, model: GazeModel} | {ok: false, reason: string}}
   */
  finish() {
    const missing = this.samples.findIndex((s) => s.length < MIN_SAMPLES_PER_TARGET);
    if (missing !== -1) return { ok: false, reason: `Not enough eye data at point ${missing + 1}` };

    const X = [];
    const xs = [];
    const ys = [];
    this.samples.forEach((targetSamples, i) => {
      for (const features of targetSamples) {
        X.push(features);
        xs.push(this.targets[i].x);
        ys.push(this.targets[i].y);
      }
    });
    const model = new GazeModel(fitRidge(X, xs, this.lambda), fitRidge(X, ys, this.lambda));
    const error = model.rmsError(X, xs, ys);
    return { ok: true, model, error };
  }
}

export class GazeModel {
  constructor(xRegression, yRegression) {
    this.xRegression = xRegression;
    this.yRegression = yRegression;
  }

  /** @returns {{x: number, y: number}} normalised screen position, clamped to the screen */
  predict(features) {
    return {
      x: clamp(this.xRegression.predict(features), 0, 1),
      y: clamp(this.yRegression.predict(features), 0, 1),
    };
  }

  rmsError(X, xs, ys) {
    let sum = 0;
    X.forEach((features, i) => {
      const p = this.predict(features);
      sum += (p.x - xs[i]) ** 2 + (p.y - ys[i]) ** 2;
    });
    return Math.sqrt(sum / X.length);
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
