// Remote photoplethysmography (rPPG): heart rate from the tiny colour changes
// of facial skin as blood volume pulses, plus an experimental breathing rate.
//
// Heart rate uses the POS method ("Plane-Orthogonal-to-Skin", Wang, den Brinker,
// Stuijk & de Haan, IEEE TBME 2017). It projects the RGB signal onto a plane
// that cancels brightness changes common to all channels (lighting, small head
// motion) while keeping the pulse, which affects green more than red or blue.
//
// Every estimate comes with a quality grade. When the signal is weak we report
// "poor" rather than a made-up number.

import { bandpass, detrend, dominantFrequency, median, powerSpectrum, resampleUniform, std } from './dsp.js';

const HR_BAND_HZ = [0.7, 3.0]; // 42 to 180 beats per minute
const RR_BAND_HZ = [0.1, 0.6]; // 6 to 36 breaths per minute
const STEP_RATIO = 0.06; // frame-to-frame brightness change treated as a camera or lighting jump

/**
 * POS pulse extraction.
 * @param {number[]} r @param {number[]} g @param {number[]} b uniformly sampled channel means
 * @param {number} fs sample rate in Hz
 * @returns {Float64Array} pulse signal (arbitrary units)
 */
export function pos(r, g, b, fs) {
  const n = r.length;
  const windowSize = Math.ceil(1.6 * fs);
  const pulse = new Float64Array(n);
  if (n < windowSize) return pulse;
  const s1 = new Float64Array(windowSize);
  const s2 = new Float64Array(windowSize);

  for (let start = 0; start <= n - windowSize; start++) {
    let mr = 0;
    let mg = 0;
    let mb = 0;
    for (let i = start; i < start + windowSize; i++) {
      mr += r[i];
      mg += g[i];
      mb += b[i];
    }
    mr /= windowSize;
    mg /= windowSize;
    mb /= windowSize;
    if (mr <= 0 || mg <= 0 || mb <= 0) continue;

    for (let i = 0; i < windowSize; i++) {
      const cr = r[start + i] / mr;
      const cg = g[start + i] / mg;
      const cb = b[start + i] / mb;
      s1[i] = cg - cb;
      s2[i] = cg + cb - 2 * cr;
    }
    const sd2 = std(s2);
    const alpha = sd2 > 0 ? std(s1) / sd2 : 0;
    let windowMean = 0;
    for (let i = 0; i < windowSize; i++) windowMean += s1[i] + alpha * s2[i];
    windowMean /= windowSize;
    for (let i = 0; i < windowSize; i++) pulse[start + i] += s1[i] + alpha * s2[i] - windowMean;
  }
  return pulse;
}

export function gradeSnr(snrDb, { good = 3, fair = 0 } = {}) {
  if (!Number.isFinite(snrDb) && snrDb < 0) return 'poor';
  if (snrDb >= good) return 'good';
  if (snrDb >= fair) return 'fair';
  return 'poor';
}

export class VitalsEstimator {
  constructor({ fs = 30, hrWindowS = 12, minHrWindowS = 6, rrWindowS = 30, minRrWindowS = 15, maxGapMs = 1000, spectraAveraged = 4, fairSnrDb = 0 } = {}) {
    Object.assign(this, { fs, hrWindowS, minHrWindowS, rrWindowS, minRrWindowS, maxGapMs, spectraAveraged, fairSnrDb });
    this.reset();
  }

  reset() {
    this.times = [];
    this.red = [];
    this.green = [];
    this.blue = [];
    this.motion = [];
    this.trackedHr = null;
    this.recentHr = [];
    this.poorStreak = 0;
    this.spectra = [];
  }

  /**
   * @param {number} t ms
   * @param {[number, number, number] | null} rgb mean skin colour, null when no face
   * @param {number} [motionY] vertical head position (for breathing)
   */
  push(t, rgb, motionY = 0) {
    if (!rgb) return;
    const last = this.times.at(-1);
    if (last !== undefined && t - last > this.maxGapMs) this.reset(); // the face was lost: start over
    else if (last !== undefined) {
      // A sudden brightness jump (the camera adjusting its exposure, a light
      // switched on) is far larger than any pulse and would spoil the whole
      // window: start over from the new level.
      const before = this.red.at(-1) + this.green.at(-1) + this.blue.at(-1);
      const now = rgb[0] + rgb[1] + rgb[2];
      if (Math.abs(now - before) > STEP_RATIO * before) this.reset();
    }
    this.times.push(t);
    this.red.push(rgb[0]);
    this.green.push(rgb[1]);
    this.blue.push(rgb[2]);
    this.motion.push(motionY);

    const keepFrom = t - this.rrWindowS * 1000;
    let drop = 0;
    while (drop < this.times.length && this.times[drop] < keepFrom) drop++;
    if (drop > 0) for (const series of [this.times, this.red, this.green, this.blue, this.motion]) series.splice(0, drop);
  }

  /** Seconds of continuous signal currently buffered. */
  bufferedSeconds() {
    return this.times.length > 1 ? (this.times.at(-1) - this.times[0]) / 1000 : 0;
  }

  /**
   * @returns {{hr: number|null, hrSnrDb: number, quality: 'good'|'fair'|'poor'|'none',
   *           rr: number|null, rrQuality: string, waveform: number[], bufferedSeconds: number}}
   */
  estimate() {
    const buffered = this.bufferedSeconds();
    const empty = { hr: null, hrSnrDb: -Infinity, quality: 'none', rr: null, rrQuality: 'none', waveform: [], bufferedSeconds: buffered };
    if (buffered < this.minHrWindowS) return empty;

    const heart = this.#estimateHeartRate();
    const breath = buffered >= this.minRrWindowS ? this.#estimateBreathing() : { rr: null, rrQuality: 'none' };
    return { ...heart, ...breath, bufferedSeconds: buffered };
  }

  #window(seconds) {
    const from = this.times.at(-1) - seconds * 1000;
    let start = 0;
    while (start < this.times.length && this.times[start] < from) start++;
    return start;
  }

  #estimateHeartRate() {
    const start = this.#window(this.hrWindowS);
    const times = this.times.slice(start);
    const [r, g, b] = [this.red, this.green, this.blue].map((c) => resampleUniform(times, c.slice(start), this.fs));
    // Band-pass before the spectrum: without it, slow drift from posture and
    // lighting leaked into the bottom of the band and won as a false 35-45 bpm.
    const pulse = bandpass(pos(r, g, b, this.fs), HR_BAND_HZ[0] - 0.05, HR_BAND_HZ[1] + 0.2, this.fs);
    const spectrum = this.#averagedSpectrum(powerSpectrum(pulse, this.fs));
    let { frequency, snrDb } = dominantFrequency(spectrum, HR_BAND_HZ[0], HR_BAND_HZ[1], 0.15);

    // Tracking: a sudden jump to a far-away peak is more often motion or a
    // harmonic than a real change. Prefer a strong peak near the last value.
    if (this.trackedHr !== null) {
      const previousHz = this.trackedHr / 60;
      if (Math.abs(frequency - previousHz) > 20 / 60) {
        const near = dominantFrequency(spectrum, previousHz - 15 / 60, previousHz + 15 / 60, 0.15);
        const globalPower = powerAt(spectrum, frequency);
        if (powerAt(spectrum, near.frequency) >= 0.5 * globalPower) frequency = near.frequency;
      }
    }

    const quality = gradeSnr(snrDb, { good: 3, fair: this.fairSnrDb });
    let hr = null;
    if (quality !== 'poor' && Number.isFinite(frequency)) {
      this.recentHr.push(frequency * 60);
      if (this.recentHr.length > 5) this.recentHr.shift();
      hr = median(this.recentHr); // median of recent estimates rejects single outliers
      this.trackedHr = hr;
      this.poorStreak = 0;
    } else if (++this.poorStreak >= 5) {
      // A long weak stretch: forget the old value instead of anchoring to it.
      this.trackedHr = null;
      this.recentHr = [];
    }
    return { hr, hrSnrDb: snrDb, quality, waveform: displayWaveform(pulse, this.fs) };
  }

  /**
   * Average of the last few spectra (estimates are 1 s apart, windows overlap).
   * A real pulse stays at the same frequency, so it adds up, while noise peaks
   * move around and average out. Each spectrum is normalised to the power in
   * the heart band, so one loud window does not dominate.
   */
  #averagedSpectrum({ freqs, power }) {
    let total = 0;
    for (let k = 0; k < freqs.length; k++) if (freqs[k] >= HR_BAND_HZ[0] && freqs[k] <= HR_BAND_HZ[1]) total += power[k];
    this.spectra.push(total > 0 ? power.map((v) => v / total) : power);
    if (this.spectra.length > this.spectraAveraged) this.spectra.shift();
    const averaged = new Float64Array(power.length);
    for (const s of this.spectra) for (let k = 0; k < s.length; k++) averaged[k] += s[k] / this.spectra.length;
    return { freqs, power: averaged };
  }

  #estimateBreathing() {
    const start = this.#window(this.rrWindowS);
    const times = this.times.slice(start);
    const intensity = this.red.slice(start).map((v, i) => v + this.green[start + i] + this.blue[start + i]);
    const candidates = [this.motion.slice(start), intensity].map((series) => {
      const uniform = detrend(resampleUniform(times, series, this.fs), this.fs * 10);
      return dominantFrequency(powerSpectrum(uniform, this.fs, 4096), RR_BAND_HZ[0], RR_BAND_HZ[1], 0.04);
    });
    const best = candidates[0].snrDb >= candidates[1].snrDb ? candidates[0] : candidates[1];
    const rrQuality = gradeSnr(best.snrDb);
    return { rr: rrQuality === 'poor' ? null : best.frequency * 60, rrQuality };
  }
}

function powerAt({ freqs, power }, frequency) {
  const step = freqs[1] - freqs[0];
  const k = Math.round(frequency / step);
  return power[k] ?? 0;
}

/** Last ~6 s of the pulse, lightly smoothed and scaled to -1..1, for drawing. */
function displayWaveform(pulse, fs) {
  const tail = Array.from(pulse.slice(-Math.round(6 * fs)));
  const smoothed = tail.map((_, i) => (tail[i - 1] ?? tail[i]) * 0.25 + tail[i] * 0.5 + (tail[i + 1] ?? tail[i]) * 0.25);
  const peak = Math.max(1e-9, ...smoothed.map(Math.abs));
  return smoothed.map((v) => v / peak);
}
