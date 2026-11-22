// Turns one MediaPipe face result into a small numeric feature vector that
// describes where the person is looking. Calibration later learns how these
// features map to screen positions, so the exact sign conventions here do not
// matter; they only need to be stable for one person in one sitting.
//
// Vertical gaze is the hard part, especially when the camera sits below the
// screen (a phone propped under a monitor): the face is seen from below and the
// iris moves very little between the top and the bottom of the screen. Three
// signals carry it, and calibration learns how much each one counts:
//   - the iris height measured against the line between the eye corners,
//     scaled by the eye's width (stable, unlike the gap between the lids);
//   - the eye opening: the upper lid rises when the eyes look up and drops
//     when they look down;
//   - the head's real pitch, from MediaPipe's 3D face pose when available.

// Landmark indices in the 478-point MediaPipe face mesh.
const EYE_A = { cornerOuter: 33, cornerInner: 133, top: 159, bottom: 145 };
const EYE_B = { cornerOuter: 263, cornerInner: 362, top: 386, bottom: 374 };
const IRIS_CENTERS = [468, 473];
const NOSE_TIP = 1;
const FACE_LEFT = 234;
const FACE_RIGHT = 454;
const FOREHEAD = 10;
const CHIN = 152;

export const FEATURE_NAMES = ['irisX', 'irisY', 'irisHeight', 'eyeOpening', 'lookX', 'lookY', 'headYaw', 'headPitch'];

/**
 * @param {Array<{x:number,y:number}>} landmarks
 * @param {Record<string, number>} blendshapes
 * @param {ArrayLike<number>|null} [pose] MediaPipe facial transformation matrix (4x4, column-major)
 * @returns {number[] | null} feature vector in FEATURE_NAMES order, or null when the eyes are not usable
 */
export function extractGazeFeatures(landmarks, blendshapes, pose = null) {
  if (!landmarks || landmarks.length < 478) return null;

  const eyeA = irisPosition(landmarks, EYE_A);
  const eyeB = irisPosition(landmarks, EYE_B);
  if (!eyeA || !eyeB) return null;

  const b = (name) => blendshapes[name] ?? 0;
  // Left/right and up/down eye rotation as estimated by the blendshape head.
  const lookX = (b('eyeLookOutLeft') + b('eyeLookInRight') - b('eyeLookInLeft') - b('eyeLookOutRight')) / 2;
  const lookY = (b('eyeLookUpLeft') + b('eyeLookUpRight') - b('eyeLookDownLeft') - b('eyeLookDownRight')) / 2;

  let headYaw;
  let headPitch;
  if (pose && pose.length >= 16) {
    // The face's forward direction is the third column of the rotation.
    headYaw = pose[8];
    headPitch = pose[9];
  } else {
    // Fallback proxies: where the nose sits between the face edges.
    const faceWidth = distance(landmarks[FACE_LEFT], landmarks[FACE_RIGHT]);
    const faceHeight = distance(landmarks[FOREHEAD], landmarks[CHIN]);
    if (faceWidth < 1e-6 || faceHeight < 1e-6) return null;
    const nose = landmarks[NOSE_TIP];
    headYaw = (nose.x - (landmarks[FACE_LEFT].x + landmarks[FACE_RIGHT].x) / 2) / faceWidth;
    headPitch = (nose.y - (landmarks[FOREHEAD].y + landmarks[CHIN].y) / 2) / faceHeight;
  }

  const mean = (k) => (eyeA[k] + eyeB[k]) / 2;
  return [mean('x'), mean('y'), mean('height'), mean('opening'), lookX, lookY, headYaw, headPitch];
}

/**
 * Iris centre in the eye's own frame:
 *   x       along the corner-to-corner axis, 0 at one corner and 1 at the other;
 *   y       from the upper lid (0) to the lower lid (1);
 *   height  distance from the corner axis, in eye widths (positive = below it);
 *   opening gap between the lids, in eye widths.
 */
function irisPosition(landmarks, eye) {
  const outer = landmarks[eye.cornerOuter];
  const inner = landmarks[eye.cornerInner];
  const iris = nearestIris(landmarks, outer, inner);

  // Orient the axis left-to-right in the image so both eyes share a direction.
  const [start, end] = outer.x < inner.x ? [outer, inner] : [inner, outer];
  const axisX = end.x - start.x;
  const axisY = end.y - start.y;
  const axisLength2 = axisX * axisX + axisY * axisY;
  if (axisLength2 < 1e-10) return null;
  const axisLength = Math.sqrt(axisLength2);

  const x = ((iris.x - start.x) * axisX + (iris.y - start.y) * axisY) / axisLength2;
  // Perpendicular distance to the axis (also cancels head roll).
  const height = ((iris.y - start.y) * axisX - (iris.x - start.x) * axisY) / axisLength2;
  const top = landmarks[eye.top];
  const bottom = landmarks[eye.bottom];
  const lidGap = bottom.y - top.y;
  const y = lidGap > 1e-4 ? (iris.y - top.y) / lidGap : 0.5;
  const opening = Math.hypot(bottom.x - top.x, bottom.y - top.y) / axisLength;
  return { x, y, height, opening };
}

function nearestIris(landmarks, cornerA, cornerB) {
  const cx = (cornerA.x + cornerB.x) / 2;
  const cy = (cornerA.y + cornerB.y) / 2;
  let best = landmarks[IRIS_CENTERS[0]];
  let bestDistance = Infinity;
  for (const index of IRIS_CENTERS) {
    const p = landmarks[index];
    const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = p;
    }
  }
  return best;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Eye closure from the blink blendshapes (0 = open, 1 = closed).
 * Uses the more open eye so a droopy eyelid on one side does not count as a blink.
 */
export function eyeClosure(blendshapes) {
  return Math.min(blendshapes.eyeBlinkLeft ?? 0, blendshapes.eyeBlinkRight ?? 0);
}
