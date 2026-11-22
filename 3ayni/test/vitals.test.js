import { describe, expect, it } from 'vitest';
import { dominantFrequency, fft, powerSpectrum, resampleUniform, detrend, median } from '../web/src/patient/vitals/dsp.js';
import { VitalsEstimator, pos } from '../web/src/patient/vitals/rppg.js';

function seededRandom(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Synthetic face video, reduced to mean skin colour per frame.
 * The pulse changes green most (blood absorbs green light), lighting changes
 * all three channels together, sensor noise is independent per channel.
 */
function syntheticSkin({
  seconds = 20,
  fps = 30,
  bpm = 72,
  pulseAmplitude = 0.004,
  lightingAmplitude = 0.02,
  lightingHz = 0.25,
  noise = 0.002,
  breathsPerMin = 15,
  jitterMs = 4,
  seed = 1,
} = {}) {
  const rand = seededRandom(seed);
  const base = [180, 130, 110];
  const pulseWeights = [0.33, 0.77, 0.53]; // relative pulsatile strength in R, G, B (skin model, de Haan 2013)
  const frames = [];
  for (let i = 0; i < seconds * fps; i++) {
    const t = (i * 1000) / fps + (rand() - 0.5) * jitterMs;
    const s = t / 1000;
    const pulse = Math.sin(2 * Math.PI * (bpm / 60) * s) + 0.3 * Math.sin(4 * Math.PI * (bpm / 60) * s);
    const lighting = lightingAmplitude * Math.sin(2 * Math.PI * lightingHz * s);
    const rgb = base.map(
      (value, c) => value * (1 + pulseAmplitude * pulseWeights[c] * pulse + lighting + noise * (rand() - 0.5) * 2),
    );
    const motionY = 0.5 + 0.002 * Math.sin(2 * Math.PI * (breathsPerMin / 60) * s) + 0.0003 * (rand() - 0.5);
    frames.push({ t, rgb, motionY });
  }
  return frames;
}

function runEstimator(frames) {
  const estimator = new VitalsEstimator();
  let result;
  frames.forEach((frame, i) => {
    estimator.push(frame.t, frame.rgb, frame.motionY);
    if (i % 30 === 29) result = estimator.estimate(); // once per second, as in the app
  });
  return result;
}

describe('dsp', () => {
  it('fft finds a pure tone at the right bin', () => {
    const n = 64;
    const re = Float64Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * 5 * i) / n));
    const im = new Float64Array(n);
    fft(re, im);
    const magnitudes = Array.from(re, (v, k) => Math.hypot(v, im[k]));
    expect(magnitudes.indexOf(Math.max(...magnitudes.slice(0, n / 2)))).toBe(5);
  });

  it('dominantFrequency is accurate between FFT bins', () => {
    const fs = 30;
    const signal = Array.from({ length: 360 }, (_, i) => Math.sin(2 * Math.PI * 1.23 * (i / fs)));
    const { frequency, snrDb } = dominantFrequency(powerSpectrum(signal, fs), 0.7, 3);
    expect(frequency).toBeCloseTo(1.23, 2);
    expect(snrDb).toBeGreaterThan(10);
  });

  it('resampleUniform interpolates linearly', () => {
    expect(resampleUniform([0, 100, 200], [0, 10, 20], 20)).toEqual([0, 5, 10, 15, 20]);
  });

  it('detrend removes a ramp', () => {
    const out = detrend(Array.from({ length: 100 }, (_, i) => i), 11);
    expect(Math.abs(out[50])).toBeLessThan(1e-9);
  });

  it('median handles even and odd lengths', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe('pos', () => {
  it('cancels lighting changes that affect all channels equally', () => {
    const fs = 30;
    const n = 300;
    const lighting = Array.from({ length: n }, (_, i) => 1 + 0.05 * Math.sin(2 * Math.PI * 1.5 * (i / fs)));
    const pulse = pos(
      lighting.map((l) => 180 * l),
      lighting.map((l) => 130 * l),
      lighting.map((l) => 110 * l),
      fs,
    );
    expect(Math.max(...pulse.map(Math.abs))).toBeLessThan(1e-9);
  });
});

describe('VitalsEstimator', () => {
  for (const bpm of [52, 72, 95, 130]) {
    it(`measures ${bpm} bpm within 3 bpm despite lighting flicker`, () => {
      const result = runEstimator(syntheticSkin({ bpm, seed: bpm }));
      expect(result.quality).not.toBe('poor');
      expect(Math.abs(result.hr - bpm)).toBeLessThan(3);
    });
  }

  it('ignores a lighting flicker inside the heart-rate band', () => {
    // 1.5 Hz flicker would read as 90 bpm if we used the green channel alone.
    const result = runEstimator(syntheticSkin({ bpm: 66, lightingHz: 1.5, lightingAmplitude: 0.03 }));
    expect(Math.abs(result.hr - 66)).toBeLessThan(3);
  });

  it('reports poor quality instead of a number when there is no pulse', () => {
    const result = runEstimator(syntheticSkin({ pulseAmplitude: 0, noise: 0.01, seed: 5 }));
    expect(result.quality).toBe('poor');
    expect(result.hr).toBeNull();
  });

  it('estimates breathing rate from small head motion', () => {
    const result = runEstimator(syntheticSkin({ seconds: 35, breathsPerMin: 15 }));
    expect(result.rr).not.toBeNull();
    expect(Math.abs(result.rr - 15)).toBeLessThan(2);
  });

  it('waits for enough signal before answering', () => {
    const estimator = new VitalsEstimator();
    syntheticSkin({ seconds: 4 }).forEach((f) => estimator.push(f.t, f.rgb, f.motionY));
    expect(estimator.estimate().quality).toBe('none');
  });

  it('starts over after the face is lost for more than a second', () => {
    const estimator = new VitalsEstimator();
    syntheticSkin({ seconds: 10 }).forEach((f) => estimator.push(f.t, f.rgb, f.motionY));
    expect(estimator.bufferedSeconds()).toBeGreaterThan(9);
    estimator.push(15_000, [180, 130, 110], 0.5);
    expect(estimator.bufferedSeconds()).toBe(0);
  });
});
