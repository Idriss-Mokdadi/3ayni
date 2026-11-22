// Turns one MediaPipe face result into a small numeric feature vector that
// describes where the person is looking. Calibration later learns how these
// features map to screen positions, so the exact sign conventions here do not
// matter; they only need to be stable for one person in one sitting.

// Landmark indices in the 478-point MediaPipe face mesh.
const EYE_A = { cornerOuter: 33, cornerInner: 133, top: 159, bottom: 145 };
const EYE_B = { cornerOuter: 263, cornerInner: 362, top: 386, bottom: 374 };
const IRIS_CENTERS = [468, 473];
const NOSE_TIP = 1;
const FACE_LEFT = 234;
const FACE_RIGHT = 454;
const FOREHEAD = 10;
const CHIN = 152;

export const FEATURE_NAMES = ['irisX', 'irisY', 'lookX', 'lookY', 'headYaw', 'headPitch'];

/**
 * @param {Array<{x:number,y:number}>} landmarks
 * @param {Record<string, number>} blendshapes
 * @returns {number[] | null} feature vector in FEATURE_NAMES order, or null when the eyes are not usable
 */
export function extractGazeFeatures(landmarks, blendshapes) {
  if (!landmarks || landmarks.length < 478) return null;

  const eyeA = irisPosition(landmarks, EYE_A);
  const eyeB = irisPosition(landmarks, EYE_B);
  if (!eyeA || !eyeB) return null;

  const b = (name) => blendshapes[name] ?? 0;
  // Left/right and up/down eye rotation as estimated by the blendshape head.
  const lookX = (b('eyeLookOutLeft') + b('eyeLookInRight') - b('eyeLookInLeft') - b('eyeLookOutRight')) / 2;
  const lookY = (b('eyeLookUpLeft') + b('eyeLookUpRight') - b('eyeLookDownLeft') - b('eyeLookDownRight')) / 2;

  // Head rotation proxies: where the nose sits between the face edges.
  const faceWidth = distance(landmarks[FACE_LEFT], landmarks[FACE_RIGHT]);
  const faceHeight = distance(landmarks[FOREHEAD], landmarks[CHIN]);
  if (faceWidth < 1e-6 || faceHeight < 1e-6) return null;
  const nose = landmarks[NOSE_TIP];
  const headYaw = (nose.x - (landmarks[FACE_LEFT].x + landmarks[FACE_RIGHT].x) / 2) / faceWidth;
  const headPitch = (nose.y - (landmarks[FOREHEAD].y + landmarks[CHIN].y) / 2) / faceHeight;

  return [(eyeA.x + eyeB.x) / 2, (eyeA.y + eyeB.y) / 2, lookX, lookY, headYaw, headPitch];
}

/**
 * Iris centre expressed in the eye's own frame: x from one corner (0) to the
 * other (1), y from the upper lid (0) to the lower lid (1).
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

  const x = ((iris.x - start.x) * axisX + (iris.y - start.y) * axisY) / axisLength2;
  const lidGap = landmarks[eye.bottom].y - landmarks[eye.top].y;
  const y = lidGap > 1e-4 ? (iris.y - landmarks[eye.top].y) / lidGap : 0.5;
  return { x, y };
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
