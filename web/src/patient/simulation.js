// Demo-only stress scenario. A healthy volunteer on stage cannot produce a
// real tachycardia, so this replaces the camera reading with a heart rate that
// climbs to +45 % above baseline. Every reading it produces is flagged
// `simulated: true`, and both screens show a "Simulation" label.

export class StressSimulator {
  constructor() {
    this.active = false;
    this.startedAt = 0;
    this.fromHr = 72;
  }

  start(t, baselineHr) {
    this.active = true;
    this.startedAt = t;
    this.fromHr = Number.isFinite(baselineHr) ? baselineHr : 72;
  }

  stop() {
    this.active = false;
  }

  /** @returns {{hr: number, rr: number, quality: 'good'}} */
  reading(t) {
    const rampSeconds = 10;
    const progress = Math.min(1, (t - this.startedAt) / 1000 / rampSeconds);
    const target = this.fromHr * 1.45;
    const wobble = Math.sin(t / 1300) * 1.5;
    return {
      hr: this.fromHr + (target - this.fromHr) * progress + wobble,
      rr: 16 + 8 * progress,
      quality: 'good',
    };
  }
}
