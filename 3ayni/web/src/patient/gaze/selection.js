// Decides when looking at a tile means "choose it": keep looking at the tile
// until the ring fills (dwell, default 1.4 s).
//
// Closing the eyes stops everything: the ring empties and nothing can be
// chosen until the eyes open again and the dwell starts over. A patient who
// rests or sleeps with the board in front of them never selects by accident.
// Normal blinks (< 0.4 s) are counted for the fatigue estimate only.
// A deliberate long blink as a way to choose exists but is off by default.

const CLOSE_THRESHOLD = 0.55;
const OPEN_THRESHOLD = 0.35; // lower than CLOSE_THRESHOLD so a half-closed eye does not flicker
const NORMAL_BLINK_MS = [60, 400];

export class SelectionEngine {
  constructor({
    dwellMs = 1400,
    cooldownMs = 900,
    hysteresisMs = 150,
    longBlinkMs = [600, 2500],
    dwellEnabled = true,
    blinkEnabled = false,
  } = {}) {
    Object.assign(this, { dwellMs, cooldownMs, hysteresisMs, longBlinkMs, dwellEnabled, blinkEnabled });
    this.reset(0);
    this.blinkTimes = [];
  }

  /** Clears hover state, e.g. after the screen changes. */
  reset(t) {
    this.hovered = null;
    this.hoverStart = t;
    this.candidate = null;
    this.candidateSince = t;
    this.cooldownUntil = t + this.cooldownMs;
    this.eyesClosed = false;
    this.closedSince = 0;
    this.pausedDwell = 0;
  }

  /**
   * @param {number} t ms
   * @param {{tile: number|null, closure: number}} input
   * @returns {Array<{type: 'hover'|'progress'|'select'|'blink', tile?: number|null, value?: number, via?: string}>}
   */
  update(t, { tile, closure }) {
    const events = [];

    // Eye open/closed state with hysteresis.
    if (!this.eyesClosed && closure > CLOSE_THRESHOLD) {
      this.eyesClosed = true;
      this.closedSince = t;
      if (!this.blinkEnabled && this.hovered !== null) {
        // Eyes closed: cancel the current choice entirely.
        this.hovered = null;
        this.candidate = null;
        events.push({ type: 'hover', tile: null });
      }
    } else if (this.eyesClosed && closure < OPEN_THRESHOLD) {
      this.eyesClosed = false;
      const duration = t - this.closedSince;
      this.hoverStart = t; // any dwell starts from zero after the eyes open
      if (duration >= NORMAL_BLINK_MS[0] && duration < NORMAL_BLINK_MS[1]) {
        this.blinkTimes.push(t);
        events.push({ type: 'blink' });
      } else if (
        this.blinkEnabled &&
        this.hovered !== null &&
        t >= this.cooldownUntil &&
        duration >= this.longBlinkMs[0] &&
        duration <= this.longBlinkMs[1]
      ) {
        events.push(this.#select(t, 'blink'));
        return events;
      }
    }
    if (this.eyesClosed) return events; // gaze is meaningless with closed eyes

    // Hover changes only after the new tile has been looked at for a moment.
    if (tile !== this.candidate) {
      this.candidate = tile;
      this.candidateSince = t;
    }
    if (this.candidate !== this.hovered && t - this.candidateSince >= this.hysteresisMs) {
      this.hovered = this.candidate;
      this.hoverStart = t;
      events.push({ type: 'hover', tile: this.hovered });
    }

    if (this.hovered === null || !this.dwellEnabled) return events;
    const start = Math.max(this.hoverStart, this.cooldownUntil);
    const value = Math.max(0, (t - start) / this.dwellMs);
    if (value >= 1) {
      events.push(this.#select(t, 'dwell'));
    } else {
      events.push({ type: 'progress', tile: this.hovered, value });
    }
    return events;
  }

  /** Normal blinks per minute over the last 60 s. */
  blinkRate(t) {
    this.blinkTimes = this.blinkTimes.filter((time) => t - time <= 60_000);
    return this.blinkTimes.length;
  }

  #select(t, via) {
    const tile = this.hovered;
    this.cooldownUntil = t + this.cooldownMs;
    this.hoverStart = t;
    return { type: 'select', tile, via };
  }
}
