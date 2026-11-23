// Copies the MediaPipe WebAssembly runtime and downloads the face landmark
// model into web/public so the app works without internet at the venue, and
// lists the recorded Darija clips. Runs after `npm install` and before every
// build; safe to run again.

import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSource = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmTarget = join(root, 'web', 'public', 'wasm');
const modelTarget = join(root, 'web', 'public', 'models', 'face_landmarker.task');
const audioDir = join(root, 'web', 'public', 'audio');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

async function exists(path) {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

async function copyWasm() {
  await mkdir(wasmTarget, { recursive: true });
  for (const file of await readdir(wasmSource)) {
    await copyFile(join(wasmSource, file), join(wasmTarget, file));
  }
  console.log('[setup] MediaPipe runtime copied to web/public/wasm');
}

async function downloadModel() {
  if (await exists(modelTarget)) {
    console.log('[setup] Face landmark model already present');
    return;
  }
  await mkdir(dirname(modelTarget), { recursive: true });
  console.log('[setup] Downloading face landmark model (~3.6 MB)...');
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`);
  await writeFile(modelTarget, Buffer.from(await response.arrayBuffer()));
  console.log('[setup] Model saved to web/public/models');
}

// Lists the recorded Darija clips so the app only requests files that exist.
async function writeAudioManifest() {
  await mkdir(audioDir, { recursive: true });
  const clips = (await readdir(audioDir)).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4));
  await writeFile(join(audioDir, 'manifest.json'), JSON.stringify({ clips }, null, 2) + '\n');
  console.log(`[setup] Audio manifest: ${clips.length} recorded clip(s)`);
}

try {
  await writeAudioManifest();
  await copyWasm();
  await downloadModel();
} catch (error) {
  console.warn(`[setup] ${error.message}`);
  console.warn('[setup] Run "npm run setup" again once you are online.');
}
