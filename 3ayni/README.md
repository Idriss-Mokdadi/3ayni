# 3ayni (عيني) — "my eyes"

A voice for patients who cannot speak or move, and a quiet watch on their heart rate — using only an ordinary laptop camera.

Built for **Tech4Health 2.0** · Domain 1 (people with disabilities), with prevention and early warning.

---

## The problem

Patients after a stroke, with ALS, on a breathing tube, or with severe cerebral palsy are often fully aware but cannot speak or use their hands. In Tunisian hospitals and homes they communicate by blinking while a relative guesses. Dedicated eye-gaze devices cost thousands of dinars, and a patient who cannot speak also cannot say they are in distress.

## What 3ayni does

| | |
|---|---|
| **Communicate** | The patient looks at one of six phrases the nurse chose for the home screen; a ring fills and the phrase is spoken in Darija. Closing the eyes cancels any choice. |
| **Write** | A gaze keyboard: 12 letters per page, most used first, with previous and next pages and two suggestions in the middle, based on the letters typed and the heart rate. |
| **Answer** | The nurse's questions fill the screen with just Yes and No. |
| **Rest** | With no choice for a while, the screen sleeps to one dot (longer awake when the heart rate is high); looking at the dot wakes it. |
| **Monitor** | Heart rate (and an experimental breathing rate) estimated from the face video, with a signal-quality grade. |
| **Combine** | "Pain" + heart rate above the patient's own baseline → **urgent**. Body under stress + patient silent → the screen asks *"Are you in pain?"* |
| **Connect** | The caregiver's phone receives messages, alerts and vitals, and can send yes/no questions back. |

## Quick start

Requirements: Node.js 20+ and a laptop with a webcam (Chrome or Edge).

```powershell
npm install        # also copies the face model and runtime for offline use
npm start          # builds and starts the server on port 3000
```

1. On the laptop, open **http://localhost:3000** and click **Start camera**.
2. Follow the dot with your eyes for about 15 seconds, head still (calibration). With a phone used as a webcam, choose it in the **Camera** list first.
3. Press **P** to show the pairing QR code. Scan it with a phone on the same Wi-Fi or hotspot.

No camera? Click **Continue without camera** and use the mouse or the number keys.

### Keyboard shortcuts (bedside screen)

| Key | Action |
|---|---|
| `1`–`6` | Choose a tile (top row 1–3, bottom row 4–6) |
| `D` | Operator panel: camera preview, metrics, demo and validation tools |
| `P` | Pair a caregiver phone (QR code) |
| `C` | Recalibrate gaze |
| `G` | Show the gaze cursor |
| `S` | Simulated stress scenario (demo only, labelled "Simulation" on both screens) |
| `B` | Take the current heart rate as baseline |

### Recording real Darija voices

Browsers have no Tunisian voice, so without recordings the app falls back to an Arabic synthetic voice. Record one clip per phrase, save it as `web/public/audio/<phrase-id>.mp3` (ids are in `web/src/patient/board/phrases.js`, e.g. `water.mp3`, `pain.mp3`), then run `npm run build`.

## Stage demo (4 minutes)

1. Before going on stage: `npm start`, open the bedside screen, pair the phone, mirror the phone or hold it up.
2. In the operator panel (`D`): **Fast demo timings: on** (baseline in 20 s instead of 90 s, alerts after 8 s instead of 45 s).
3. A judge sits 50–60 cm from the laptop, a lamp lighting their face from the front. Calibrate (`C`).
4. The judge says *"I want to drink"* with their eyes → the laptop speaks it → the phone receives it with their live heart rate. Compare with a smartwatch.
5. Press `S` (simulated stress). The heart rate climbs; the bedside asks *"Are you in pain?"*; answer *pain* → **URGENT** on the phone with *"+45 % above baseline"*.
6. Tap **I'm on my way** on the phone → the patient sees *"Help is on the way"*.

## How it works

```
camera frame ─┬─> MediaPipe face mesh (478 points + blendshapes, on device)
              │
              ├─> gaze features ──> personal calibration ──> One Euro filter ──> tile ──> dwell (eyes open)
              │   (iris position,     (ridge regression,       (smooth when still,             │
              │    eye rotation,       9 dots, ~15 s)            responsive when moving)        ▼
              │    head pose)                                              board ──> speech + message ──┐
              │                                                              ▲                          │
              │                                        suggestions (phrase model)                       │
              │                                                                                         ▼
              └─> forehead + cheeks ──> POS pulse extraction ──> FFT peak + SNR ──> care monitor ──> relay ──> caregiver phone
                  (mean skin colour)     (cancels lighting)       (heart rate,       (rules: baseline,
                                                                   quality grade)     elevated, silent, urgent)
```

### Why AI here, and why rules there

The jury asked for purposeful AI. Each part uses the simplest tool that works:

| Part | Approach | Why |
|---|---|---|
| Face and eye tracking | Neural network (MediaPipe Face Landmarker) | Cannot be done with rules |
| Gaze → screen position | Ridge regression, fitted per person | Every face and camera position differs; a learned mapping absorbs it in 15 s |
| Pulse from video | POS signal processing (Wang et al., IEEE TBME 2017) + spectral analysis | A published method that is explainable, fast and needs no training data |
| Phrase suggestions | Probabilistic model (what follows what × time of day × distress) | Runs instantly offline, explains itself, learns this patient's habits; a large language model would be slower, opaque and need the internet |
| Alerts | **Transparent rules** with hysteresis | Clinical alerts must be predictable; every alert states its reason |

### Measured results

Run them yourself: `npm test` and `npm run evaluate:predictor`.

- **Suggestions** (3,978 held-out simulated messages): the right phrase is in the model's top 3 **55.7 %** of the time, against 37.5 % for a fixed "most frequent" list. Used as the home screen, that would mean 1.89 selections per message instead of 3. *These are simulated routines, not patient data; real numbers must come from a pilot.*
- **Heart rate on synthetic signals**: within 3 bpm from 52 to 130 bpm, including a lighting flicker placed inside the heart-rate band (which fools a green-channel-only method). Pure noise is reported as **poor quality, not a number**.
- **Heart rate on real people**: use the operator panel's validation logger next to a smartwatch or finger pulse oximeter, then export the CSV and report the mean absolute error.

## Responsible AI and privacy

- **Video never leaves the laptop.** Frames are processed in the browser tab and discarded. Only phrases, alerts and numbers are sent, and only on the local network.
- **Pairing.** The caregiver link needs a random token shown as a QR code at the bedside. The bedside role and the token are only available from the laptop itself.
- **Validated input.** The relay checks every event against a schema, limits size and rate, and lets each role send only its own event types.
- **No false numbers.** Every estimate carries a quality grade; a weak signal shows "—" and monitoring pauses with a clear reason.
- **Known bias.** Camera pulse measurement is less accurate on darker skin and in low light. Test on different skin tones and lighting with the validation logger, and report the results.
- **Patient control.** A settings tile pauses vitals sharing; repeat, recalibrate and slower selection are one glance away.
- **Assistive, not diagnostic.** 3ayni adds to clinical monitors and never replaces them.

## Project structure

```
3ayni/
├─ server/index.js            relay: pairing, validation, history for late-joining phones
├─ scripts/
│  ├─ setup-assets.mjs        offline model + runtime, audio manifest
│  └─ evaluate-predictor.mjs  suggestion model vs. baselines
├─ web/
│  ├─ index.html              bedside screen
│  ├─ caregiver.html          caregiver phone
│  └─ src/
│     ├─ patient/
│     │  ├─ main.js           wiring of everything below
│     │  ├─ camera.js         webcam + MediaPipe loop
│     │  ├─ gaze/             features, calibration, ridge regression, One Euro filter, selection
│     │  ├─ vitals/           skin regions, DSP toolkit, POS heart-rate estimator
│     │  ├─ board/            phrases (Darija/French/English), navigation model, view
│     │  ├─ predictor.js      phrase suggestion model
│     │  ├─ care-routines.js  simulated routines (seed + evaluation)
│     │  ├─ fusion.js         alert rules
│     │  └─ …                 speech, simulation, validation log, operator panel
│     ├─ caregiver/main.js
│     ├─ shared/              protocol, relay link, icons, sound, storage
│     └─ styles/
└─ test/                      91 unit tests (vitest)
```

## Limits and next steps

- Webcam gaze is coarse: six large tiles are reliable, a full keyboard is not.
- Camera heart rate needs light on the face and a fairly still head (which bedridden patients usually have).
- Breathing rate is experimental.
- Next: a pilot in a Tunisian neurology or intensive-care unit to measure real-world selection speed and heart-rate accuracy; recorded Darija voices by native speakers; a multi-bed nurse station view.
