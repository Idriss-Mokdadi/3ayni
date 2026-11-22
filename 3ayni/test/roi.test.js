import { describe, expect, it } from 'vitest';
import { accumulatePolygon, buildRegions } from '../web/src/patient/vitals/roi.js';

function solidFrame(width, height, rgb) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...rgb, 255], i * 4);
  return data;
}

describe('accumulatePolygon', () => {
  it('counts the pixels of an axis-aligned square', () => {
    const data = solidFrame(20, 20, [100, 80, 60]);
    const { sum, count } = accumulatePolygon(data, 20, 20, [
      [5, 5],
      [15, 5],
      [15, 15],
      [5, 15],
    ]);
    expect(count).toBe(100);
    expect(sum).toEqual([10_000, 8_000, 6_000]);
  });

  it('counts about half the pixels of a triangle', () => {
    const data = solidFrame(100, 100, [100, 100, 100]);
    const { count } = accumulatePolygon(data, 100, 100, [
      [0, 0],
      [100, 0],
      [0, 100],
    ]);
    expect(count).toBeGreaterThan(4900);
    expect(count).toBeLessThan(5100);
  });

  it('skips dark and clipped pixels', () => {
    expect(accumulatePolygon(solidFrame(10, 10, [10, 10, 10]), 10, 10, [[0, 0], [10, 0], [10, 10], [0, 10]]).count).toBe(0);
    expect(accumulatePolygon(solidFrame(10, 10, [255, 200, 200]), 10, 10, [[0, 0], [10, 0], [10, 10], [0, 10]]).count).toBe(0);
  });

  it('clips polygons that leave the frame', () => {
    const { count } = accumulatePolygon(solidFrame(10, 10, [100, 100, 100]), 10, 10, [[-5, -5], [5, -5], [5, 5], [-5, 5]]);
    expect(count).toBe(25);
  });
});

describe('buildRegions', () => {
  it('places the forehead above the cheeks on an upright face', () => {
    const landmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
    landmarks[234] = { x: 0.3, y: 0.5 };
    landmarks[454] = { x: 0.7, y: 0.5 };
    landmarks[151] = { x: 0.5, y: 0.3 };
    landmarks[10] = { x: 0.5, y: 0.22 };
    landmarks[205] = { x: 0.4, y: 0.6 };
    landmarks[425] = { x: 0.6, y: 0.6 };
    const regions = buildRegions(landmarks, 320, 240);
    const centreY = (polygon) => polygon.reduce((s, p) => s + p[1], 0) / polygon.length;
    expect(regions.map((r) => r.name)).toEqual(['forehead', 'cheekA', 'cheekB']);
    expect(centreY(regions[0].polygon)).toBeLessThan(centreY(regions[1].polygon));
  });
});
