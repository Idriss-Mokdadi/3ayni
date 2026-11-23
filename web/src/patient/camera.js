// Opens the webcam and runs MediaPipe Face Landmarker once per new video
// frame. Everything happens in this browser tab: frames are never uploaded.

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const WASM_PATH = '/wasm';
const MODEL_PATH = '/models/face_landmarker.task';

/**
 * @typedef {object} FaceFrame
 * @property {number} t                 frame time in ms (performance clock)
 * @property {Array<{x:number,y:number,z:number}>|null} landmarks  478 normalized points, or null when no face
 * @property {Record<string, number>} blendshapes  e.g. { eyeBlinkLeft: 0.02, ... }
 * @property {number[]|null} pose       4x4 head pose matrix (column-major), or null
 * @property {HTMLVideoElement} video
 */

export class FaceTracker {
  /** @param {HTMLVideoElement} video */
  constructor(video) {
    this.video = video;
    this.landmarker = null;
    this.listeners = new Set();
    this.running = false;
    this.lastVideoTime = -1;
    this.fps = 0;
    this.frameCount = 0;
    this.fpsWindowStart = 0;
  }

  /** @param {(frame: FaceFrame) => void} listener */
  onFrame(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * @param {string|null} [deviceId] a specific camera (e.g. a phone used as a webcam); default: the front camera
   */
  async start(deviceId = null) {
    const size = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };
    const video = deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: 'user', ...size };
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
    this.video.srcObject = stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();

    this.landmarker = await createLandmarker();
    this.running = true;
    this.fpsWindowStart = performance.now();
    this.#scheduleNext();
  }

  /**
   * Automatic exposure changes look like a pulse to the vitals module. Once the
   * image has settled, the operator can freeze exposure and white balance.
   * Opt-in, because some webcams turn dark when switched to manual mode.
   * @returns {Promise<boolean>} whether the camera accepted the request
   */
  lockExposure() {
    return lockCameraAdjustments(this.video.srcObject?.getVideoTracks()[0]);
  }

  stop() {
    this.running = false;
    this.video.srcObject?.getTracks().forEach((track) => track.stop());
    this.landmarker?.close();
  }

  // requestAnimationFrame rather than requestVideoFrameCallback: the latter
  // stops firing in some browsers while the preview <video> is hidden.
  // A new camera frame is detected with the decoded-frame counter. For a live
  // stream Chrome advances `currentTime` on every screen refresh (60 Hz) even
  // when the camera delivers 30 frames per second, and processing the same
  // image twice made the face points jitter, which drowned the pulse.
  #scheduleNext() {
    if (this.running) requestAnimationFrame(() => this.#process());
  }

  #process() {
    if (!this.running) return;
    const video = this.video;
    const frameId = currentFrameId(video);
    if (video.readyState >= 2 && frameId !== this.lastVideoTime) {
      this.lastVideoTime = frameId;
      const t = performance.now();
      const result = this.landmarker.detectForVideo(video, t);
      const frame = {
        t,
        video,
        landmarks: result.faceLandmarks?.[0] ?? null,
        blendshapes: toBlendshapeMap(result.faceBlendshapes?.[0]),
        pose: result.facialTransformationMatrixes?.[0]?.data ?? null,
      };
      this.#trackFps(t);
      for (const listener of this.listeners) listener(frame);
    }
    this.#scheduleNext();
  }

  #trackFps(t) {
    this.frameCount += 1;
    const elapsed = t - this.fpsWindowStart;
    if (elapsed >= 1000) {
      this.fps = (this.frameCount * 1000) / elapsed;
      this.frameCount = 0;
      this.fpsWindowStart = t;
    }
  }
}

async function createLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
  const options = {
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true, // real head angles help when the camera is below or beside the screen
  };
  try {
    return await FaceLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
    });
  } catch (gpuError) {
    console.warn('GPU delegate unavailable, using CPU', gpuError);
    return FaceLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'CPU' },
    });
  }
}

async function lockCameraAdjustments(track) {
  if (!track) return false;
  const capabilities = track.getCapabilities?.() ?? {};
  const settings = track.getSettings?.() ?? {};
  const advanced = {};
  if (capabilities.exposureMode?.includes('manual')) {
    advanced.exposureMode = 'manual';
    if (settings.exposureTime) advanced.exposureTime = settings.exposureTime;
  }
  if (capabilities.whiteBalanceMode?.includes('manual')) {
    advanced.whiteBalanceMode = 'manual';
    if (settings.colorTemperature) advanced.colorTemperature = settings.colorTemperature;
  }
  if (Object.keys(advanced).length === 0) return false;
  try {
    await track.applyConstraints({ advanced: [advanced] });
    return true;
  } catch {
    return false;
  }
}

/** Number of frames decoded so far, or the playback time where that counter is missing. */
function currentFrameId(video) {
  const frames = video.getVideoPlaybackQuality?.().totalVideoFrames;
  return frames > 0 ? frames : video.currentTime;
}

/** Cameras the browser can see (labels appear once camera access was allowed). */
export async function listCameras() {
  const devices = (await navigator.mediaDevices?.enumerateDevices?.()) ?? [];
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}

function toBlendshapeMap(classifications) {
  const map = {};
  for (const category of classifications?.categories ?? []) map[category.categoryName] = category.score;
  return map;
}
