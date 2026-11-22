// Small signal-processing toolkit for the vital-signs estimator. Pure
// functions on plain arrays, so they run in the browser and in unit tests.

export function mean(values) {
  let sum = 0;
  for (const v of values) sum += v;
  return values.length ? sum / values.length : 0;
}

export function std(values) {
  const m = mean(values);
  let sum = 0;
  for (const v of values) sum += (v - m) ** 2;
  return values.length ? Math.sqrt(sum / values.length) : 0;
}

/**
 * Resamples irregularly timed samples onto a uniform grid by linear
 * interpolation. Webcam frames do not arrive at an exact rate, and the FFT
 * assumes they do.
 * @param {number[]} times  ms, increasing
 * @param {number[]} values
 * @param {number} fs       target rate in Hz
 */
export function resampleUniform(times, values, fs) {
  const n = times.length;
  if (n < 2) return [];
  const step = 1000 / fs;
  const out = [];
  let j = 0;
  for (let t = times[0]; t <= times[n - 1]; t += step) {
    while (j < n - 2 && times[j + 1] < t) j++;
    const span = times[j + 1] - times[j];
    const w = span > 0 ? (t - times[j]) / span : 0;
    out.push(values[j] + w * (values[j + 1] - values[j]));
  }
  return out;
}

/** Removes slow drift (lighting changes, slow head motion) with a centred moving average. */
export function detrend(values, windowSize) {
  const n = values.length;
  const half = Math.max(1, Math.floor(windowSize / 2));
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + values[i];
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n, i + half + 1);
    out[i] = values[i] - (prefix[hi] - prefix[lo]) / (hi - lo);
  }
  return out;
}

export function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place iterative radix-2 FFT. `re` and `im` must have a power-of-two length. */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < size / 2; k++) {
        const a = start + k;
        const b = a + size / 2;
        const tRe = re[b] * curRe - im[b] * curIm;
        const tIm = re[b] * curIm + im[b] * curRe;
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/**
 * Power spectrum of a real signal with a Hann window, zero-padded for a finer
 * frequency grid.
 * @returns {{freqs: Float64Array, power: Float64Array}}
 */
export function powerSpectrum(values, fs, minBins = 2048) {
  const n = values.length;
  const size = nextPowerOfTwo(Math.max(n, minBins));
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const m = mean(values);
  for (let i = 0; i < n; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    re[i] = (values[i] - m) * hann;
  }
  fft(re, im);
  const half = size / 2;
  const freqs = new Float64Array(half);
  const power = new Float64Array(half);
  for (let k = 0; k < half; k++) {
    freqs[k] = (k * fs) / size;
    power[k] = re[k] * re[k] + im[k] * im[k];
  }
  return { freqs, power };
}

/**
 * Strongest frequency inside [lo, hi] Hz, refined by parabolic interpolation,
 * and a signal-to-noise ratio: power near the peak (and its first harmonic)
 * versus the rest of the band, in dB (de Haan & Jeanne, 2013).
 */
export function dominantFrequency({ freqs, power }, lo, hi, peakHalfWidthHz = 0.1) {
  let best = -1;
  for (let k = 0; k < freqs.length; k++) {
    if (freqs[k] < lo || freqs[k] > hi) continue;
    if (best === -1 || power[k] > power[best]) best = k;
  }
  if (best === -1) return { frequency: NaN, snrDb: -Infinity };

  let frequency = freqs[best];
  if (best > 0 && best < freqs.length - 1) {
    const [a, b, c] = [power[best - 1], power[best], power[best + 1]];
    const denominator = a - 2 * b + c;
    if (denominator !== 0) frequency += (0.5 * (a - c)) / denominator * (freqs[1] - freqs[0]);
  }

  let signal = 0;
  let noise = 0;
  const bandHi = Math.max(hi, 2 * frequency + peakHalfWidthHz);
  for (let k = 0; k < freqs.length; k++) {
    const f = freqs[k];
    if (f < lo || f > bandHi) continue;
    const nearPeak = Math.abs(f - frequency) <= peakHalfWidthHz || Math.abs(f - 2 * frequency) <= peakHalfWidthHz;
    if (nearPeak) signal += power[k];
    else noise += power[k];
  }
  const snrDb = noise > 0 ? 10 * Math.log10(signal / noise) : Infinity;
  return { frequency, snrDb };
}

export function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
