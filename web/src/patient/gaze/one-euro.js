// One Euro filter (Casiez, Roussel & Vogel, CHI 2012): smooths strongly when
// the gaze is still, so the pointer does not shake, and lightly when it moves,
// so it does not lag behind a deliberate glance.

export class OneEuroFilter {
  /**
   * @param {object} [options]
   * @param {number} [options.minCutoff=1.0] Hz; lower = smoother at rest
   * @param {number} [options.beta=0.02]     how fast smoothing relaxes with speed
   * @param {number} [options.dCutoff=1.0]   Hz; cutoff for the speed estimate
   */
  constructor({ minCutoff = 1.0, beta = 0.02, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  reset() {
    this.previousValue = null;
    this.previousDerivative = 0;
    this.previousTime = null;
  }

  /**
   * @param {number} value
   * @param {number} t time in ms
   */
  filter(value, t) {
    if (this.previousValue === null) {
      this.previousValue = value;
      this.previousTime = t;
      return value;
    }
    const dt = Math.max((t - this.previousTime) / 1000, 1e-3);
    const derivative = (value - this.previousValue) / dt;
    const smoothedDerivative = lerp(this.previousDerivative, derivative, alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(smoothedDerivative);
    const smoothed = lerp(this.previousValue, value, alpha(cutoff, dt));

    this.previousValue = smoothed;
    this.previousDerivative = smoothedDerivative;
    this.previousTime = t;
    return smoothed;
  }
}

function alpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}
