// Picks skin regions on the face (forehead and both cheeks) and returns their
// average colour for each frame. Regions are rectangles aligned with the face,
// so they follow small head tilts. Eyes, mouth and hair are avoided because
// blinking and talking would add motion that looks like a pulse.

// Landmarks used as anchors (MediaPipe face mesh).
const FACE_LEFT = 234;
const FACE_RIGHT = 454;
const FOREHEAD_CENTRE = 151;
const FOREHEAD_TOP = 10;
const CHEEK_A = 205;
const CHEEK_B = 425;
const NOSE_TIP = 1;

const ANCHORS = [FACE_LEFT, FACE_RIGHT, FOREHEAD_CENTRE, FOREHEAD_TOP, CHEEK_A, CHEEK_B, NOSE_TIP];

// Frames are read at the camera's own resolution, capped at 640 pixels wide.
// The pulse changes skin colour by about 0.1 %, less than one grey level, so it
// only shows after averaging many pixels: at 320 pixels wide a face at 60 cm
// gave about 340 skin pixels, and their noise hid the pulse.
const MAX_SAMPLE_WIDTH = 640;

// Face points jitter by a pixel or so from frame to frame. Moving the regions
// with them adds noise, so the regions follow a smoothed copy of the points,
// and jump straight to the new place when the head really moves.
const SMOOTHING = 0.25;
const JUMP = 0.04; // normalised distance that counts as real head movement

/**
 * Face-aligned regions in pixel coordinates.
 * @param {Array<{x:number,y:number}>} landmarks normalised
 * @param {number} width  @param {number} height  frame size in pixels
 * @returns {Array<{name: string, polygon: Array<[number, number]>}>}
 */
export function buildRegions(landmarks, width, height) {
  const p = (i) => [landmarks[i].x * width, landmarks[i].y * height];
  const left = p(FACE_LEFT);
  const right = p(FACE_RIGHT);
  const faceWidth = Math.hypot(right[0] - left[0], right[1] - left[1]);
  if (faceWidth < 1) return [];
  const u = [(right[0] - left[0]) / faceWidth, (right[1] - left[1]) / faceWidth]; // across the face
  const v = [-u[1], u[0]]; // down the face

  const rect = (centre, w, h) => [
    [centre[0] - u[0] * w / 2 - v[0] * h / 2, centre[1] - u[1] * w / 2 - v[1] * h / 2],
    [centre[0] + u[0] * w / 2 - v[0] * h / 2, centre[1] + u[1] * w / 2 - v[1] * h / 2],
    [centre[0] + u[0] * w / 2 + v[0] * h / 2, centre[1] + u[1] * w / 2 + v[1] * h / 2],
    [centre[0] - u[0] * w / 2 + v[0] * h / 2, centre[1] - u[1] * w / 2 + v[1] * h / 2],
  ];

  const foreheadCentre = p(FOREHEAD_CENTRE);
  const foreheadTop = p(FOREHEAD_TOP);
  const foreheadHeight = Math.hypot(foreheadTop[0] - foreheadCentre[0], foreheadTop[1] - foreheadCentre[1]);
  return [
    { name: 'forehead', polygon: rect(foreheadCentre, faceWidth * 0.34, Math.max(foreheadHeight * 0.7, faceWidth * 0.08)) },
    { name: 'cheekA', polygon: rect(p(CHEEK_A), faceWidth * 0.18, faceWidth * 0.15) },
    { name: 'cheekB', polygon: rect(p(CHEEK_B), faceWidth * 0.18, faceWidth * 0.15) },
  ];
}

/**
 * Sums the colour of pixels inside a polygon (scanline fill, even-odd rule).
 * Very dark or clipped pixels are skipped: they carry no pulse information.
 * @param {Uint8ClampedArray} data RGBA pixels of the full frame
 * @param {number} width frame width
 * @param {number} height frame height
 * @param {Array<[number, number]>} polygon
 * @returns {{sum: [number, number, number], count: number}}
 */
export function accumulatePolygon(data, width, height, polygon) {
  const sum = [0, 0, 0];
  let count = 0;
  const ys = polygon.map((pt) => pt[1]);
  const yStart = Math.max(0, Math.ceil(Math.min(...ys)));
  const yEnd = Math.min(height - 1, Math.floor(Math.max(...ys)));

  for (let y = yStart; y <= yEnd; y++) {
    const scan = y + 0.5;
    const crossings = [];
    for (let i = 0; i < polygon.length; i++) {
      const [x1, y1] = polygon[i];
      const [x2, y2] = polygon[(i + 1) % polygon.length];
      if ((y1 <= scan && y2 > scan) || (y2 <= scan && y1 > scan)) {
        crossings.push(x1 + ((scan - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const xStart = Math.max(0, Math.ceil(crossings[k] - 0.5));
      const xEnd = Math.min(width - 1, Math.floor(crossings[k + 1] - 0.5));
      for (let x = xStart; x <= xEnd; x++) {
        const offset = (y * width + x) * 4;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        if (r + g + b < 60 || r > 250 || g > 250 || b > 250) continue;
        sum[0] += r;
        sum[1] += g;
        sum[2] += b;
        count++;
      }
    }
  }
  return { sum, count };
}

/** Reads video frames into a small canvas and returns the mean skin colour. */
export class SkinSampler {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d', { willReadFrequently: true });
    this.lastRegions = [];
    this.anchors = null;
  }

  /** Smoothed copies of the few face points the regions are built from. */
  #smoothAnchors(landmarks) {
    const previous = this.anchors;
    const moved = previous && ANCHORS.some((i) => Math.hypot(landmarks[i].x - previous[i].x, landmarks[i].y - previous[i].y) > JUMP);
    const next = {};
    for (const i of ANCHORS) {
      const now = landmarks[i];
      const before = previous && !moved ? previous[i] : now;
      next[i] = { x: before.x + SMOOTHING * (now.x - before.x), y: before.y + SMOOTHING * (now.y - before.y) };
    }
    this.anchors = next;
    return next;
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {Array<{x:number,y:number}>|null} landmarks
   * @returns {{rgb: [number, number, number], motionY: number} | null}
   */
  sample(video, landmarks) {
    if (!landmarks || !video.videoWidth) {
      this.anchors = null;
      return null;
    }
    const width = Math.min(video.videoWidth, MAX_SAMPLE_WIDTH);
    const height = Math.round((video.videoHeight / video.videoWidth) * width);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.context.drawImage(video, 0, 0, width, height);
    const { data } = this.context.getImageData(0, 0, width, height);

    const regions = buildRegions(this.#smoothAnchors(landmarks), width, height);
    this.lastRegions = regions.map((region) => ({
      name: region.name,
      polygon: region.polygon.map(([x, y]) => [x / width, y / height]), // normalised, for the debug overlay
    }));

    const total = [0, 0, 0];
    let count = 0;
    for (const region of regions) {
      const result = accumulatePolygon(data, width, height, region.polygon);
      total[0] += result.sum[0];
      total[1] += result.sum[1];
      total[2] += result.sum[2];
      count += result.count;
    }
    if (count < 60) return null;
    return { rgb: [total[0] / count, total[1] / count, total[2] / count], motionY: landmarks[NOSE_TIP].y, pixels: count };
  }
}
