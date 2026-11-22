// Combines what the patient says (gaze messages) with what their body shows
// (camera vital signs). Deliberately rule-based: alerts in a care setting must
// be predictable and explainable, so every alert carries its reason.
//
// Rules
//   baseline   median heart rate over the first 90 s of good signal
//   elevated   HR > baseline +25 % for 45 s  (cleared below +15 % for 30 s)
//   low        HR < 45 bpm for 30 s -> attention: check the patient
//   silent     elevated and no selection for 2 min -> ask the patient "are you in pain?"
//   message    urgent phrase -> urgent alert; attention phrase while elevated -> urgent
//   signal     no usable signal for 30 s -> monitoring paused, never a guessed number
//   fatigue    blink rate well above the patient's own baseline -> slower, simpler board

import { median } from './vitals/dsp.js';

export const RULES = Object.freeze({
  baselineMs: 90_000,
  baselineMinSamples: 20,
  elevatedRatio: 1.25,
  clearRatio: 1.15,
  elevatedHoldMs: 45_000,
  clearHoldMs: 30_000,
  lowHr: 45,
  lowHoldMs: 30_000,
  silentMs: 120_000,
  promptCooldownMs: 300_000,
  signalLossMs: 30_000,
  fatigueRatio: 1.6,
  fatigueMinRate: 25,
  fatigueClearRatio: 1.3,
  blinkBaselineMs: 120_000,
});

/**
 * Same rules with short timings, for a 4-minute stage demo. Clearly labelled
 * in the operator panel; never the default.
 */
export const FAST_DEMO_RULES = Object.freeze({
  ...RULES,
  baselineMs: 20_000,
  baselineMinSamples: 10,
  elevatedHoldMs: 8_000,
  clearHoldMs: 8_000,
  lowHoldMs: 10_000,
  silentMs: 20_000,
  promptCooldownMs: 60_000,
  signalLossMs: 10_000,
  blinkBaselineMs: 30_000,
});

let alertCounter = 0;
const newAlertId = () => `a${Date.now().toString(36)}${(alertCounter++).toString(36)}`;

export class CareMonitor {
  /** @param {number} startTime ms */
  constructor(startTime, rules = RULES) {
    this.rules = rules;
    this.startTime = startTime;
    this.baselineSamples = [];
    this.baseline = null;
    this.state = 'calibrating'; // calibrating | normal | elevated | paused
    this.elevatedCandidateSince = null;
    this.clearCandidateSince = null;
    this.lowSince = null;
    this.lowAlerted = false;
    this.lastUsableSignal = startTime;
    this.lastInteraction = startTime;
    this.lastPrompt = -Infinity;
    this.blinkBaseline = null;
    this.blinkSamples = [];
    this.fatigued = false;
    this.lastHr = null;
  }

  /** True when the body currently shows signs of stress. */
  get distressed() {
    return this.state === 'elevated';
  }

  /**
   * Feeds one vital-signs estimate (about once per second).
   * @param {number} t
   * @param {{hr: number|null, quality: string}} vitals
   * @returns {object[]} events: {type:'state'} | {type:'alert'} | {type:'prompt'}
   */
  updateVitals(t, { hr, quality }) {
    const events = [];
    const usable = hr !== null && (quality === 'good' || quality === 'fair');

    if (!usable) {
      if (t - this.lastUsableSignal >= this.rules.signalLossMs && this.state !== 'paused') {
        this.previousState = this.state;
        this.#setState('paused', events, 'No usable pulse signal: check lighting and camera position');
      }
      return events;
    }
    this.lastUsableSignal = t;
    this.lastHr = hr;
    if (this.state === 'paused') this.#setState(this.baseline ? this.previousState ?? 'normal' : 'calibrating', events);

    if (this.baseline === null) {
      if (quality === 'good') this.baselineSamples.push(hr);
      if (t - this.startTime >= this.rules.baselineMs && this.baselineSamples.length >= this.rules.baselineMinSamples) {
        this.baseline = median(this.baselineSamples);
        this.#setState('normal', events, `Personal baseline ${Math.round(this.baseline)} bpm`);
      }
      return events;
    }

    // Elevated heart rate, with hysteresis so it does not flap on and off.
    const ratio = hr / this.baseline;
    if (this.state === 'normal') {
      if (ratio > this.rules.elevatedRatio) {
        this.elevatedCandidateSince ??= t;
        if (t - this.elevatedCandidateSince >= this.rules.elevatedHoldMs) {
          this.#setState('elevated', events, `Heart rate ${Math.round(hr)} bpm, ${percentAbove(ratio)} above baseline`);
          this.clearCandidateSince = null;
        }
      } else {
        this.elevatedCandidateSince = null;
      }
    } else if (this.state === 'elevated') {
      if (ratio < this.rules.clearRatio) {
        this.clearCandidateSince ??= t;
        if (t - this.clearCandidateSince >= this.rules.clearHoldMs) {
          this.#setState('normal', events, 'Heart rate back near baseline');
          this.elevatedCandidateSince = null;
        }
      } else {
        this.clearCandidateSince = null;
      }
    }

    // Very low reading: could be a real bradycardia or a measurement problem.
    if (hr < this.rules.lowHr) {
      this.lowSince ??= t;
      if (!this.lowAlerted && t - this.lowSince >= this.rules.lowHoldMs) {
        this.lowAlerted = true;
        events.push(makeAlert('attention', `Low heart rate reading (${Math.round(hr)} bpm): please check the patient`));
      }
    } else {
      this.lowSince = null;
      this.lowAlerted = false;
    }

    // Body in distress but the patient has not said anything: ask them.
    if (
      this.state === 'elevated' &&
      t - this.lastInteraction >= this.rules.silentMs &&
      t - this.lastPrompt >= this.rules.promptCooldownMs
    ) {
      this.lastPrompt = t;
      events.push({ type: 'prompt', question: 'Are you in pain?', questionAr: 'يوجعك حاجة؟' });
      events.push(makeAlert('attention', 'Heart rate elevated and no message for 2 minutes: patient asked if in pain'));
    }
    return events;
  }

  /** Any deliberate selection counts as interaction. */
  noteInteraction(t) {
    this.lastInteraction = t;
  }

  /**
   * Decides the urgency of a message the patient just sent.
   * @param {{id: string, en: string, urgency: string}} phrase
   * @returns {{urgency: string, alert: object|null}}
   */
  assessMessage(t, phrase) {
    this.noteInteraction(t);
    if (phrase.urgency === 'urgent') {
      return { urgency: 'urgent', alert: makeAlert('urgent', `Patient says: "${phrase.en}"`) };
    }
    if (phrase.urgency === 'attention' && this.distressed) {
      const delta = this.lastHr && this.baseline ? `, heart rate ${percentAbove(this.lastHr / this.baseline)} above baseline` : '';
      return { urgency: 'urgent', alert: makeAlert('urgent', `Patient says: "${phrase.en}"${delta}`) };
    }
    if (phrase.urgency === 'attention') {
      return { urgency: 'attention', alert: makeAlert('attention', `Patient says: "${phrase.en}"`) };
    }
    return { urgency: 'routine', alert: null };
  }

  /**
   * Fatigue from the normal blink rate (blinks per minute).
   * @returns {{type: 'fatigue', on: boolean} | null} an event when the state changes
   */
  updateBlinkRate(t, rate) {
    if (this.blinkBaseline === null) {
      this.blinkSamples.push(rate);
      if (t - this.startTime >= this.rules.blinkBaselineMs) this.blinkBaseline = Math.max(8, median(this.blinkSamples));
      return null;
    }
    const tooHigh = rate > Math.max(this.rules.fatigueMinRate, this.blinkBaseline * this.rules.fatigueRatio);
    const recovered = rate < this.blinkBaseline * this.rules.fatigueClearRatio;
    if (!this.fatigued && tooHigh) {
      this.fatigued = true;
      return { type: 'fatigue', on: true };
    }
    if (this.fatigued && recovered) {
      this.fatigued = false;
      return { type: 'fatigue', on: false };
    }
    return null;
  }

  /** For the demo: take the current reading as baseline immediately. */
  forceBaseline(hr) {
    if (!Number.isFinite(hr)) return [];
    this.baseline = hr;
    const events = [];
    this.#setState('normal', events, `Personal baseline ${Math.round(hr)} bpm (set manually)`);
    return events;
  }

  #setState(state, events, reason = '') {
    if (this.state === state) return;
    this.state = state;
    events.push({ type: 'state', state, reason, baseline: this.baseline });
  }
}

function makeAlert(level, reason) {
  return { type: 'alert', id: newAlertId(), level, reason };
}

function percentAbove(ratio) {
  return `+${Math.round((ratio - 1) * 100)}%`;
}

