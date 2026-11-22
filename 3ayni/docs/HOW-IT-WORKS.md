# How 3ayni works: a complete explanation

This document explains the whole application from the ground up: the medical problem, every technology used, every engineering technique, and the reasons behind each choice. No prior knowledge is assumed. The last part tells how the heart-rate bug was found and fixed, which also makes a strong story for the jury.

**Contents**

1. [The medical side](#1-the-medical-side)
2. [The big picture](#2-the-big-picture)
3. [The technologies](#3-the-technologies)
4. [Seeing the face: MediaPipe](#4-seeing-the-face-mediapipe)
5. [Gaze: from the eyes to a tile](#5-gaze-from-the-eyes-to-a-tile)
6. [Choosing, and the screens the patient sees](#6-choosing-and-the-screens-the-patient-sees)
7. [Heart rate from a camera (rPPG)](#7-heart-rate-from-a-camera-rppg)
8. [Breathing rate (experimental)](#8-breathing-rate-experimental)
9. [Phrase suggestions: the small AI model](#9-phrase-suggestions-the-small-ai-model)
10. [Alerts: the care monitor](#10-alerts-the-care-monitor)
11. [The caregiver phone and the relay server](#11-the-caregiver-phone-and-the-relay-server)
12. [Security and privacy](#12-security-and-privacy)
13. [Testing](#13-testing)
14. [The heart-rate bug: what was wrong and how it was fixed](#14-the-heart-rate-bug-what-was-wrong-and-how-it-was-fixed)
15. [Getting a good heart-rate reading](#15-getting-a-good-heart-rate-reading)
16. [Glossary](#16-glossary)

---

## 1. The medical side

### 1.1 Who the patients are

3ayni is for people who are **conscious but cannot speak or use their hands**. The main groups:

| Condition | What happens | Why they cannot communicate |
|---|---|---|
| **Stroke** (AVC) | A blood vessel in the brain is blocked or bursts, and part of the brain dies. | Depending on the area, it can cause **aphasia** (language itself is damaged), **dysarthria** (the muscles of speech are weak), or paralysis of one side. A brainstem stroke can cause **locked-in syndrome**: fully awake, but only the eyes and eyelids move. |
| **ALS** (amyotrophic lateral sclerosis, "maladie de Charcot") | The motor neurons that drive the muscles slowly die. | Speech, hands and swallowing are lost over months or years, while thinking stays intact. **Eye muscles are usually spared until very late**, so the eyes become the last channel. |
| **Intubated or tracheostomised patients** (intensive care) | A tube in the windpipe helps them breathe. | The tube passes between the vocal cords, so no sound is possible, even when the patient is awake. |
| **Severe cerebral palsy** (IMC, infirmité motrice cérébrale) | Brain damage around birth affects movement control. | Speech and hand control can be very limited while understanding is good. |
| **Guillain-Barré syndrome, high spinal cord injury** | Paralysis from nerve or spinal damage. | Temporary or permanent loss of speech and hands. |

What they have in common: **the eyes still move and the person still understands**. The eyes are the last way out.

### 1.2 How they communicate today

- **Blink codes:** "blink once for yes, twice for no". It is slow, tiring, and the patient can only answer questions someone thinks to ask.
- **Letter boards:** a relative points at letters while watching the patient's eyes. Slow, and it needs a trained partner.
- **AAC devices** (augmentative and alternative communication): dedicated eye-tracking tablets with infrared cameras. They work well, but cost thousands of dinars and are rare in Tunisia.

### 1.3 The hidden danger: distress that cannot be said

A patient who cannot speak also **cannot say "I am in pain" or "I can't breathe"**. In a ward at night one nurse watches many beds. This is why 3ayni also watches the body.

### 1.4 Heart rate and what it tells us

- **Heart rate (HR)** is the number of heartbeats per minute (**bpm**). A normal resting adult HR is about **60 to 100 bpm**.
- **Tachycardia** means above 100 bpm at rest; **bradycardia** means below 60 (normal in athletes, worrying in a sick patient below about 45).
- **Pain, fear, breathlessness, fever and many complications** activate the **sympathetic nervous system** (the "fight or flight" system). It releases adrenaline, and the heart speeds up. So a **sustained rise above the patient's own normal** is a useful warning sign. It does not say *what* is wrong, only that something may be.
- That is why 3ayni compares each patient to **their own baseline**, not to a fixed number: 95 bpm is normal for one person and alarming for another.

### 1.5 Photoplethysmography: the physics of seeing a pulse

- With each heartbeat, a wave of blood fills the tiny vessels (capillaries) of the skin, so the **blood volume in the skin rises and falls** with the pulse.
- **Haemoglobin** (the protein that carries oxygen in red blood cells) **absorbs light**, strongly in green (around 540–580 nm), less in red. More blood means more absorption, so the skin reflects slightly less light, especially green.
- A **pulse oximeter** on a fingertip uses this principle with its own light source. This is **photoplethysmography (PPG)**: "recording volume changes with light".
- **Remote PPG (rPPG)** does the same with an ordinary camera from a distance, with room light. The colour change is tiny: **about 0.1 % of the brightness, less than one grey level** on an 8-bit camera. It becomes visible only after averaging many pixels and using careful signal processing.

### 1.6 Breathing and blinking

- **Breathing rate:** a normal adult takes about 12 to 20 breaths per minute. Breathing slightly moves the head and changes the light on the face. 3ayni estimates it, but it is **experimental**.
- **Blink rate:** about 15–20 blinks per minute at rest. It rises with fatigue and eye strain. 3ayni learns the patient's own blink rate, and when it climbs well above it, the board slows down and simplifies.

### 1.7 Assistive, not diagnostic

A **medical device** that diagnoses must be certified (CE marking in Europe, the competent authority in Tunisia), which needs clinical trials. 3ayni is an **assistive tool**: it helps the patient communicate and draws a caregiver's attention. It **never replaces** a clinical monitor (ECG, oximeter). This position is honest and it is the right one for a hackathon prototype.

---

## 2. The big picture

```
                         THE LAPTOP (bedside)                                       THE PHONE (caregiver)

 webcam ──> MediaPipe face mesh (AI, in the browser)
              │
              ├── eyes ──> gaze features ──> calibration model ──> smoothing ──> which tile?
              │                                                                     │
              │                                         dwell (eyes open) ──> CHOOSE 
              │                                                                     │
              │                     suggestion model ──> board ──> speak phrase ────┤
              │                                                                     │
              └── skin of forehead and cheeks ──> rPPG ──> heart rate + quality     │
                                                              │                     ▼
                                                      care monitor (rules) ──> relay server ──WebSocket──> messages, alerts,
                                                                                                           vitals, "I'm on my way"
```

**Everything that touches the video happens inside the browser tab on the laptop.** Only small text events (a phrase, an alert, a number) leave it, and only to the local relay server and the paired phone.

---

## 3. The technologies

| Technology | What it is | What 3ayni uses it for |
|---|---|---|
| **JavaScript (ES modules)** | The language of web browsers. "Modules" means each file imports what it needs. | All the logic, on the laptop, on the phone and on the server. |
| **HTML and CSS** | Page structure and styling. | The bedside board and the caregiver screen. |
| **Browser camera API** (`getUserMedia`) | The standard way for a web page to open the webcam, after the user agrees. | Reading 640×480 video at up to 30 frames per second. |
| **Canvas 2D** | A drawing surface; `getImageData` reads its pixels. | Copying each video frame to read the skin pixels' colours. |
| **WebAssembly (WASM)** | Compiled code that runs in the browser almost as fast as native code. | Runs the MediaPipe neural network. |
| **WebGL / GPU delegate** | Lets the browser run calculations on the graphics card. | MediaPipe uses the GPU when available and falls back to the CPU. |
| **MediaPipe Tasks Vision** (Google) | A library of ready-trained vision models. | The **Face Landmarker**: 478 face points, eye-movement scores, iris position. |
| **Web Speech API** (`speechSynthesis`) | The browser's built-in text-to-speech. | Speaking the chosen phrase when no recorded Darija voice exists. |
| **Vite** | A build tool for web apps. | Bundles and optimises the code into `dist/`, and serves it during development. |
| **Node.js** | JavaScript outside the browser. | The relay server and the scripts. |
| **Express 5** | A small web server framework for Node. | Serves the built pages to the laptop and the phone. |
| **WebSocket** (`ws` library) | A permanent two-way connection between browser and server. | Instant messages between the bedside and the phones. |
| **qrcode** | Generates QR codes. | The pairing code a phone scans. |
| **Vitest** | A test runner for JavaScript. | 96 automated tests. |
| **Lucide** | An open-source icon set. | Icons on the tiles. |
| **IBM Plex Sans / Sans Arabic** | Open-source fonts. | Readable Latin and Arabic text. |

**Why a web app?** It runs on any laptop with Chrome or Edge with nothing to install, the phone side needs only a browser, and the same code is used everywhere. The model and its runtime are **copied into the app** (`npm install` does it), so **it works with no internet**: important in a hospital or in rural areas.

---

## 4. Seeing the face: MediaPipe

**File:** `web/src/patient/camera.js`

### 4.1 What the Face Landmarker gives

For each video frame, the neural network returns:

- **478 landmarks:** 3D points on the face (corners of the eyes, eyelids, nose tip, cheeks, forehead, lips, jaw, and 10 points on the two irises). Coordinates are **normalised**: x and y go from 0 to 1 across the image, so they don't depend on its size.
- **52 blendshapes:** scores from 0 to 1 for facial movements, for example `eyeBlinkLeft`, `eyeLookInRight`, `eyeLookUpLeft`, `jawOpen`. They were designed for animating 3D avatars, and are very useful here for eye movement and blinks.

### 4.2 Why a neural network here

Finding a face and its exact points in any lighting, skin tone, angle and with glasses cannot be done with hand-written rules. This is the one place where deep learning is indispensable, and Google's trained model is reliable and runs in real time.

### 4.3 The processing loop

1. `getUserMedia` opens the webcam at 640×480, about 30 fps.
2. `requestAnimationFrame` calls our function at each screen refresh (60 times a second on most screens).
3. We check whether the camera **has really delivered a new image**, using the browser's decoded-frame counter (`getVideoPlaybackQuality().totalVideoFrames`). If not, nothing is done. *This check was the first part of the heart-rate fix; see section 14.*
4. For a new image, `detectForVideo` runs the network and every listener (gaze, vitals) receives the result.

---

## 5. Gaze: from the eyes to a tile

**Files:** `web/src/patient/gaze/`

### 5.1 Features: describing where the eyes point

`features.js` turns the 478 points into **eight numbers**:

| Feature | How it is computed | What it captures |
|---|---|---|
| `irisX` | Position of the iris centre between the two eye corners, averaged over both eyes | Eyes turning left or right |
| `irisY` | Position of the iris between the upper and lower lids | Up and down, when the camera faces the eyes |
| `irisHeight` | Distance of the iris from the line joining the eye corners, in eye widths | Up and down, stable even when the lids move |
| `eyeOpening` | Gap between the lids, in eye widths | Up and down: the upper lid rises when the eyes look up and drops when they look down |
| `lookX`, `lookY` | Combination of the `eyeLookIn/Out/Up/Down` blendshapes | Eye rotation, as estimated by the network |
| `headYaw`, `headPitch` | The real 3D head angles from MediaPipe's face pose (or, if missing, where the nose sits between the face edges) | Head turning left/right and up/down |

**Why vertical gaze needs extra signals.** Up-and-down is the hard direction, and it gets harder when the camera is not in front of the eyes, for example **a phone used as a webcam, placed below the screen**. The face is then seen from below, and the iris moves very little between the top and the bottom of the screen. The eye opening and the iris height still change clearly, and the head pose tells how the head is tilted, so calibration can rely on them instead.

### 5.2 Calibration: a model fitted to each person

**File:** `calibration.js`. The patient looks at **9 dots**: the centre, then a 3 × 3 grid reaching the corners, where the tiles are (about 15 seconds). At each dot, the first 0.65 s are ignored (the eyes travel and settle), then 1 s of features is recorded.

Four things make it hold up with an awkward camera position and reach the corners:

1. **Noisy frames are dropped.** At each dot, frames far from the median (a blink, a glance away, a late eye movement) are left out before fitting. The test injects one bad frame in five and the result stays accurate.
2. **Curved terms.** Besides the eight features, the model also gets their squares and a cross term (`irisX²`, `irisHeight²`, `irisX × irisHeight`, `lookX²`, `lookY²`). Near the edges of the screen the eyes move less for the same distance, and a straight line can't follow that.
3. **Corners are stretched back into reach.** A penalised model plays safe and aims a little towards the middle of the screen. In the centre that changes nothing, but in the corners the gaze point stopped short of the tile. The left-out predictions (point 4) show by how much: a straight line is fitted between "where the dot was" and "where the model said", per axis, and applied to every prediction. It only ever expands, at most ×1.8. In a simulation with a noisy webcam, a 1.4-second look completed on the corner tile 64 times out of 100 before, and 97 with the stretch.
4. **The model is judged on dots it did not see.** Several penalty strengths are tried. For each one, every dot is left out in turn, the model is fitted on the other eight, and the left-out dot is predicted. The strength that predicts unseen dots best wins. The error shown after calibration is measured the same way, per axis (left-right and up-down), so it is honest about new positions rather than flattering.

### 5.3 Ridge regression, explained simply

**File:** `ridge.js`

- **Linear regression** finds the weights *w* so that `screen x ≈ w0 + w1·irisX + w2·irisY + …`, by minimising the squared error over all the calibration samples. It is the classic "line of best fit", with many inputs.
- **The problem:** with few distinct positions and features that are strongly related (iris position and blendshape look scores measure almost the same thing), plain regression can choose huge weights that cancel each other. It then fits the calibration perfectly but goes wild on new data. This is called **overfitting**.
- **Ridge regression** adds a penalty `λ·(sum of the squared weights)`. The model prefers small, balanced weights: a little less exact on the calibration dots, **much more stable afterwards**. λ is chosen by the leave-one-dot-out test above.
- One model is fitted for x and one for y. Fitting takes milliseconds, so it can be redone any time (`C` key).
- **Why this is "purposeful AI":** every face, camera position and person differs. A fixed formula cannot work for everyone; a small learned model, fitted in 15 seconds, absorbs those differences.

**Sticky tiles.** Once the gaze is on a tile, it must go 20 % of a cell past the tile's edge before another tile takes over. Webcam gaze shakes most near the corners and edges; without this margin the ring kept restarting. With the stretch and sticky tiles, the same simulation completed 100 corner looks out of 100.

After calibration, if the error is above 20 % of the screen, the banner says which direction is imprecise (up-down or left-right) and suggests recalibrating with the head still.

**Choosing the camera.** When several cameras are connected (the laptop's own and a phone used as a webcam), the start screen shows a **Camera** list. The choice is remembered, and if that camera is unplugged the default one is used.

### 5.4 The One Euro filter: steady but responsive

**File:** `one-euro.js` (Casiez, Roussel and Vogel, CHI 2012)

- Raw gaze shakes: the landmarks jitter a little from frame to frame. Strong smoothing removes the shake but makes the pointer **lag** when the patient really looks elsewhere.
- The **One Euro filter** is a low-pass filter whose strength adapts to speed: **when the gaze is still, it smooths a lot** (no shake); **when the gaze moves fast, it smooths little** (no lag).
- Technically it is an exponential moving average whose cutoff frequency is `minCutoff + beta·|speed|`.

### 5.5 From a point to a tile

The filtered point (0–1 across the screen) is matched to the tile under it. **Six large tiles** are used because webcam gaze is accurate to a few centimetres on screen, not to millimetres. Big targets make the system reliable.

---

## 6. Choosing, and the screens the patient sees

**Files:** `gaze/selection.js`, `board/board-model.js`, `board/board-view.js`, `board/keyboard.js`, `sleep.js`

### 6.1 Choosing with the eyes: dwell

The challenge here is the "**Midas touch problem**": the eyes look at everything, so looking cannot mean choosing, or everything gets chosen.

- **Dwell:** keep looking at the same tile for **1.4 s** (adjustable). A ring fills to show progress. A short glance elsewhere (under 150 ms) doesn't reset it.
- **Closed eyes choose nothing.** As soon as both eyes close, the ring empties and the current choice is cancelled. When the eyes open again, the dwell starts from zero. A patient who rests or falls asleep in front of the screen never selects anything. (A deliberate long blink as a way to choose still exists in the code, but it is off by default.)
- **Hysteresis:** an eye counts as closed above a score of 0.55 and as open again only below 0.35, so a half-closed eye doesn't flicker between states.
- **Cooldown:** after a choice, 0.9 s with no new choice, to avoid double selections.
- **Fatigue:** the normal blinks are counted. When the blink rate rises well above the patient's own rate, the dwell gets longer.

Each screen is a grid; the gaze point is mapped to the grid cell under it. Some cells are **inert** (the typed text, the question): looking at them never chooses anything.

### 6.2 Home screen: the nurse's six phrases

A 3 × 3 grid: **six phrases chosen by the nurse**, then **More phrases** (the categories) and a wide **Keyboard** button at the bottom.

- The nurse changes the six phrases from her phone (caregiver screen, *Patient's home screen*): each tile is a phrase from the catalogue or **her own words** (up to 60 characters).
- The phone sends a validated `board` event; the bedside saves it, updates the screen and sends back its current state, so every paired phone stays in sync.
- Default: I want to drink, I am in pain, Call the nurse, Change my position, Yes, No.

### 6.3 The keyboard: most used letters first

A 4 × 4 grid with large keys, because fewer, bigger targets are chosen more reliably with webcam gaze:

| Row | Content |
|---|---|
| Top | The text written so far (inert, two cells wide), Delete, **Speak** (it shows **Home** while nothing is written) |
| Middle two rows | **7 letters and Space (4 × 2)**, letters sorted by how often they are used |
| Bottom | **Previous letters** on the left, **two suggestions** in the middle, **Next letters** on the right |

- **Letter order:** Arabic letters in order of frequency in written Arabic (ا ل ي م و ن ه on the first page, ر ت ب ع ك ف د on the second), so most words need only the first pages. A Latin option (Darija as typed in Latin letters, with 3, 7, 9, 5) can be chosen by the nurse. Five pages of 7 letters; the arrows wrap around. The rarest forms (آ ؤ ئ) are left out, and suggestions still match them.
- **Suggestions** come from two sources:
  1. **whole phrases** that continue the typed letters, ranked by the phrase model (section 9). One look says a whole sentence;
  2. **words** that complete the word being typed: words this patient has typed before (counted on the laptop) and words from the phrases.
- **Heart rate changes the suggestions:** when the heart rate is 15 % or more above the patient's baseline, phrases of distress (pain, can't breathe, call the nurse, scared, position) come first among the matches. Example: after typing "عيطولي", a calm patient at 3 pm is offered "call my son"; the same letters with a racing heart offer "call the nurse".
- **Speak** says the text aloud (Arabic voice for Arabic letters, French voice for Latin letters) and sends it to the caregiver phone.
- Arabic spelling variants are folded together when matching (أ إ آ → ا, ة → ه, ى → ي), and the same text is never offered twice.

### 6.4 The nurse's questions: just yes or no

When the nurse asks a question from her phone, the screen shows **only the question, large in the middle, with Yes and No under it**. The question itself can't be chosen. The answer goes back to her phone with the question it answers. When the system itself asks "Are you in pain?" (heart rate elevated and no message for 2 minutes), **Yes** is sent as "I am in pain", so the alert rules treat it as pain. An unanswered question returns to the home screen after 3 minutes.

### 6.5 The screen sleeps to one dot

A patient who rests their eyes on the screen all day would end up choosing tiles all day and all night. So after a while without any choice, the screen turns black with **one dot in the middle**. Looking at the dot for **2 seconds** wakes it, back where the patient was. A nurse's question wakes it at once.

The time before sleeping depends on the patient's condition (`sleep.js`):

| Condition | Screen stays on for |
|---|---|
| Heart rate at the patient's baseline | 1 minute |
| Between baseline and +25 % | grows smoothly from 1 to 5 minutes |
| Heart rate +25 % or more, or "elevated" state | 5 minutes |
| A call for help (attention or urgent message) in the last 10 minutes | 5 minutes |
| An urgent alert not yet acknowledged | never sleeps |

The worse the condition, the longer the board stays ready, because the patient may need to speak again soon. With fast demo timings: 20 s and 60 s. Sleep only happens in camera mode; in manual mode a nurse is using the mouse.

---

## 7. Heart rate from a camera (rPPG)

**Files:** `web/src/patient/vitals/roi.js`, `dsp.js`, `rppg.js`

This is the most technical part. Step by step:

### 7.1 Regions of interest (ROI)

`roi.js` builds three skin regions from the face landmarks: **the forehead and both cheeks**.

- These areas are rich in capillaries and flat.
- They **avoid** the eyes (blinks), the mouth (talking), the eyebrows and hair (no pulse), and the nose (often shiny).
- The rectangles are aligned with the face, so they follow head tilt.
- **They follow a smoothed copy of the face points**, so that 1-pixel landmark jitter doesn't shift them every frame. They jump straight to the new position when the head really moves.

### 7.2 One colour per frame

- The frame is copied to a canvas at up to **640 pixels wide** and the pixels inside the regions are read.
- Pixels that are **too dark** (no information) or **saturated** (above 250: a highlight carries no colour change) are skipped.
- The rest are **averaged** into one red, green, blue triple per frame.
- Averaging around **1,200–2,000 pixels** divides the camera's random noise by about 35–45 (noise falls with the square root of the number of pixels). This is what makes the 0.1 % pulse visible.

### 7.3 Resampling to a regular rhythm

The camera doesn't deliver frames at exactly regular intervals (we measured gaps between 33 and 128 ms). The frequency analysis requires evenly spaced samples, so `resampleUniform` **interpolates linearly** onto an exact 30 Hz grid.

### 7.4 POS: separating the pulse from the lighting

**Paper:** Wang, den Brinker, Stuijk and de Haan, "Algorithmic Principles of Remote PPG", *IEEE Transactions on Biomedical Engineering*, 2017.

The problem: the colour of the skin changes because of the pulse (tiny) and because of **lighting and movement** (much larger).

The idea:

1. In a short window (1.6 s), divide each channel by its mean. This **temporal normalisation** removes the skin's own colour and the overall brightness.
2. A change in brightness (a light dims, the head moves) changes R, G and B **by the same factor**. The pulse changes them **in different proportions**, because haemoglobin absorbs green more.
3. POS projects the normalised colour onto **two axes perpendicular to the "pure brightness" direction**: `S1 = G − B` and `S2 = G + B − 2R`. Brightness changes cancel out in both.
4. The two are combined as `S1 + α·S2`, where `α = std(S1)/std(S2)` is chosen in each window so that the remaining distortions cancel as well as possible.
5. Overlapping windows are added together (**overlap-add**) into one continuous pulse signal.

**Why POS rather than AI:** POS is published and validated, explainable line by line, very fast, and needs **no training data**, which we don't have for Tunisian patients. A deep network would need thousands of labelled videos and would be a black box. The automated tests show its effect: a light flickering at 1.5 Hz (it would read as 90 bpm with the green channel alone) is ignored.

### 7.5 Band-pass filter

**Function:** `bandpass` in `dsp.js`

- The pulse can only lie between **42 and 180 bpm** (0.7 to 3 Hz). Anything slower (posture, white-balance drift, breathing) or faster (sensor noise) is unwanted.
- A **Butterworth filter** (2nd order, flat in the pass band) is applied as a high-pass at 0.65 Hz, then a low-pass at 3.2 Hz.
- It is run **forward and then backward** ("zero-phase" filtering), so the pulse wave isn't shifted in time.
- *Added during the fix: without it, slow drift leaked into the bottom of the band and won as a false 35–45 bpm.*

### 7.6 From a wave to a number: the FFT

- The **Fourier transform** decomposes a signal into the frequencies it contains. A heartbeat at 72 bpm gives a peak at **1.2 Hz** (72 / 60).
- We use the **FFT** (fast Fourier transform, radix-2, written from scratch in `dsp.js`) on the last **12 seconds**.
- A **Hann window** tapers the ends of the segment, so the abrupt cut doesn't create false frequencies.
- **Zero-padding** to 2,048 points gives a finer frequency grid.
- **Parabolic interpolation** around the highest point refines the frequency between grid points.
- **Spectrum averaging** (added during the fix): the last 4 spectra (1 s apart) are averaged. A real pulse stays at the same frequency and adds up; noise peaks move around and average out.

### 7.7 Signal quality: the SNR

- **SNR** (signal-to-noise ratio, de Haan and Jeanne 2013) is the power near the peak and its first harmonic (twice the frequency: a real pulse wave isn't a pure sine, so it has one), compared with all the other power in the band. It is expressed in **decibels** (dB): 0 dB means equal power, +3 dB about double.
- Grades: **good** at 3 dB or more, **fair** from 0 to 3 dB, **poor** below 0. **A poor estimate shows "—", never a number.**

### 7.8 Robustness rules

| Rule | Why |
|---|---|
| **Median of the last 5 estimates** | One wrong estimate cannot move the displayed value. |
| **Tracking:** a sudden jump of more than 20 bpm is accepted only if no strong peak remains near the previous value | Jumps are more often motion or a harmonic than a real change. |
| **5 poor estimates in a row clear the memory** | The app doesn't stay anchored to an old value. |
| **Face lost for more than 1 s means starting over** | Mixing two different stretches of signal produces nonsense. |
| **A brightness jump of more than 6 % between two frames means starting over** (added during the fix) | The camera adjusting its exposure, or a light switched on, is far larger than any pulse. |
| **The last reading stays on screen, greyed, for 8 s** (added during the fix) | The signal comes and goes with small movements; this avoids a flickering display. **Alerts never use held values.** |

---

## 8. Breathing rate (experimental)

Two candidate signals over 30 seconds:

1. the **vertical position of the nose tip** (breathing moves the head slightly);
2. the **overall brightness** of the skin.

Each is detrended and analysed with the FFT between 6 and 36 breaths per minute, and the one with the better SNR wins. It works on test signals but is fragile in real life, so it is labelled experimental and not used for alerts.

---

## 9. Phrase suggestions: the small AI model

**File:** `web/src/patient/predictor.js`

### 9.1 Why

Typing a message letter by letter takes many looks, and reaching a phrase through the categories costs 3 selections. The model ranks every phrase for this moment, and that ranking feeds the keyboard's suggestions: with nothing typed, its top phrases appear; while typing, the matching phrases come in its order.

### 9.2 The model

The score of each phrase *p* is:

```
score(p) = log P(p | previous phrase)                 what usually follows what ("bigram")
         + 0.8 × log[ P(p | time of day) / P(p) ]     e.g. "I want to sleep" at night
         + log 3   if the vitals show distress        pain, nurse and breathing phrases come first
```

- A **bigram** is a pair of consecutive items. Counting "after *water* comes *thank you*" gives the probability of the next phrase.
- **Five time-of-day buckets:** night, morning, midday, afternoon, evening.
- **Dirichlet smoothing:** a context seen only once or twice (a rare previous phrase) would give extreme probabilities, so each count is blended with the overall frequency of the phrase. Rare contexts fall back gracefully instead of producing zeros.
- **It learns:** every real selection updates the counts, so the suggestions adapt to this patient's habits. A seed of simulated routines gives sensible suggestions on day one and counts less than real uses.

### 9.3 Why not ChatGPT or another large language model (LLM)?

| | Small model (3ayni) | LLM |
|---|---|---|
| Speed | Under a millisecond | Seconds |
| Internet | Not needed | Usually needed |
| Privacy | Nothing leaves the laptop | The conversation goes to a server |
| Explainable | Yes: "suggested because it often follows *water*" | No |
| Learns this patient | Yes, from a few uses | Not without fine-tuning |

### 9.4 Evaluation

`npm run evaluate:predictor` simulates daily care routines, trains on part of them and tests on **3,978 held-out messages** the model never saw:

| Method | Top-3 hit rate | Selections per message |
|---|---|---|
| No suggestions | 0 % | 3.00 |
| Fixed "most frequent" list | 37.5 % | 2.25 |
| **3ayni model** | **55.7 %** | **1.89 (37 % less effort)** |

Comparing against a simple **baseline** (the fixed list) proves that the model adds value beyond the obvious. *The data is simulated, and real numbers must come from a pilot. Say so if asked.*

---

## 10. Alerts: the care monitor

**File:** `web/src/patient/fusion.js`

### 10.1 Deliberately rules, not AI

In care, an alert must be **predictable** (the same situation always gives the same result) and **explainable** (the nurse must know why). Rules do this; a learned model wouldn't. Every alert carries its reason, for example "Heart rate 106 bpm, 45 % above baseline".

### 10.2 The rules

| Rule | Condition | Action |
|---|---|---|
| **Baseline** | Median HR over the first 90 s of usable signal (at least 20 readings) | Becomes this patient's normal |
| **Elevated** | HR above baseline + 25 % for 45 s | "Elevated" state, caregiver informed |
| **Cleared** | Back below baseline + 15 % for 30 s | Back to normal |
| **Low** | HR below 45 bpm for 30 s | "Attention: check the patient" |
| **Silent distress** | Elevated, and no selection for 2 minutes | The bedside asks *"Are you in pain?"* |
| **Urgent message** | "I cannot breathe" | Urgent alert straight away |
| **Fusion** | An attention phrase ("I am in pain", "I am scared", "Call the nurse", "Call the doctor", "I need the toilet") while HR is elevated | Raised from attention to **urgent** |
| **Signal loss** | No usable reading for 30 s | Monitoring paused, with the reason. Never a guessed number. |
| **Fatigue** | Blink rate 60 % above the patient's own | Slower, simpler board |

### 10.3 Engineering concept: hysteresis

The thresholds for "on" (+25 %) and "off" (+15 %) are different, and each needs a minimum duration. Without that, a heart rate hovering around +25 % would switch the alarm on and off every second. This is called **alarm fatigue**, a real and dangerous problem in hospitals: nurses learn to ignore alarms that ring for nothing.

**Fast demo timings** (operator panel) shorten the durations so a 4-minute pitch can show them (baseline in 20 s, alerts after 8 s). They are clearly labelled and never the default.

---

## 11. The caregiver phone and the relay server

**Files:** `server/index.js`, `web/src/caregiver/main.js`, `web/src/shared/`

### 11.1 The relay server

A small Node.js server on the laptop:

- serves the pages over HTTP;
- passes events over **WebSocket** between the bedside (role `patient`) and the phones (role `caregiver`);
- keeps the **last 100 events**, so a phone that joins late sees what happened.

### 11.2 Pairing by QR code

1. At start-up the server creates a **random token** (18 random bytes, about 144 bits: impossible to guess).
2. The bedside shows a **QR code** containing the phone's address and the token (`P` key).
3. The phone scans it and connects with the token. Without the token, the connection is refused.

The phone and the laptop must be on the same Wi-Fi or hotspot. No internet is needed.

### 11.3 What the phone shows and does

- the patient's messages, with the time and the live heart rate;
- alerts with their reason, and the vitals with their quality grade;
- it can send a **yes/no question** to the patient, and **"I'm on my way"**, which the patient sees as *"Help is on the way"*.

---

## 12. Security and privacy

| Measure | What it protects against |
|---|---|
| **Video never leaves the tab.** Frames are processed in memory and discarded; nothing is recorded or uploaded. | The most sensitive data never exists outside the laptop's memory. |
| **The bedside role and the token are only given to the laptop itself** (localhost). | Someone else on the Wi-Fi pretending to be the bedside. |
| **Token checked in constant time** (`tokensMatch`) | Guessing the token by measuring response times (a "timing attack"). |
| **Schema validation:** each event type has a fixed shape, and each role may send only its own types | Malformed or malicious messages, and a phone sending fake alerts. |
| **Size limit** (`maxPayload`) **and rate limit** (30 messages per second per connection) | Flooding the server (denial of service). |
| **Binary frames refused** | Unexpected payloads. |
| **Quality grades instead of guesses** | False reassurance from a wrong number. |
| **Patient control:** a tile pauses vitals sharing | The patient keeps control over their own data. |
| **Known bias, stated openly** | rPPG is less accurate on darker skin (more melanin absorbs light, leaving less pulse signal) and in low light. The validation logger exists to measure it across skin tones. |

This is **privacy by design**: rather than protecting video on a server, there is no video on a server.

---

## 13. Testing

```powershell
npm test
```

**96 automated tests in 5 files:**

| File | What it proves |
|---|---|
| `test/gaze.test.js` | Ridge regression recovers known weights; nine-dot calibration maps features to the right positions, also for a simulated camera below the screen and with blinks mixed in; iris height, eye opening and head pose are measured; the One Euro filter smooths without lag; dwell, cooldown and hysteresis behave as specified; closing the eyes cancels a choice and never selects. |
| `test/vitals.test.js` | The FFT finds the right frequency; POS cancels pure lighting changes; the estimator measures 52, 72, 95 and 130 bpm within 3 bpm; it ignores a 1.5 Hz flicker; the band-pass removes slow drift (new); it is not fooled by colour drift near the band's bottom (new); it restarts after an exposure jump (new); pure noise gives "poor" and no number. |
| `test/roi.test.js` | The regions are placed correctly and the pixel averaging is exact. |
| `test/logic.test.js` | Every screen fills its grid; the nurse's home phrases; yes/no questions; keyboard pages, keys and suggestions (letters, words, heart rate); screen-sleep timing; suggestions; every care-monitor rule; the protocol, including the nurse's board settings. |
| `test/server.test.js` | Pairing, refusing wrong tokens, role permissions, validation, history, and the nurse's home phrases travelling to the bedside and back. |

The test signals are **synthetic**: the skin colour is generated with a known heart rate, realistic channel weights (the pulse is strongest in green), lighting changes, sensor noise and timing jitter. Because the right answer is known, accuracy can be measured exactly. Real-world accuracy needs a reference device: the **validation logger** in the operator panel records camera HR next to a smartwatch or oximeter value and exports a CSV with the mean error.

**Regression tests:** each new test was checked to **fail on the old code and pass on the fixed code**, so the bugs can't come back unnoticed.

---

## 14. The heart-rate bug: what was wrong and how it was fixed

### 14.1 The symptom

On your laptop the heart rate always showed "—" and "Weak signal", even though all tests passed. The tests used clean synthetic signals; the real camera revealed problems the simulation didn't have.

### 14.2 The method

Instead of guessing, a **raw-signal recorder** was added (operator panel → *Save raw signal*). It saves the averaged skin colour of each frame, never the video. Three 45-second recordings of your face were made and analysed offline.

### 14.3 The causes found

| # | Cause | Evidence in the recording | Fix |
|---|---|---|---|
| 1 | **Each camera image was processed about twice.** For a live stream, Chrome updates the video's `currentTime` at every screen refresh (60 Hz), while the camera sends about 25–30 images per second. The same image was analysed again, the face points moved slightly each time, and that jitter added false noise. | 2,475 samples in 42 s (59 per second) from a 30 fps camera. A direct browser check: 121 "new frames" in 2 s, against 50 real ones. | Detect new images with the decoded-frame counter (`camera.js`). |
| 2 | **Too few skin pixels.** The frame was shrunk to 320 pixels wide before sampling, so only about **340 skin pixels** were averaged. Their noise was larger than the pulse. | Pixel count of about 340 per frame | Sample at the camera's resolution (640 wide), with slightly larger cheek regions: now **1,200–2,000 pixels**, 4 to 6 times more (`roi.js`). |
| 3 | **Regions jittering with the landmarks** | Same as cause 1 | The regions follow a smoothed copy of the face points (`roi.js`). |
| 4 | **Slow drift won the spectrum.** With no band-pass filter, white-balance and posture drift leaked into the bottom of the band and gave false peaks at 35–45 bpm. | Raw POS peaks at 35, 36, 41 bpm while the green channel showed about 72 | Zero-phase Butterworth band-pass (`dsp.js`, `rppg.js`) |
| 5 | **Unstable estimates** | The peak jumped between windows | Average of the last 4 spectra (`rppg.js`) |
| 6 | **The camera's warm-up** spoiled the first 12 s | Brightness 117 in the first second, then 156 | Start over after a brightness jump above 6 % (`rppg.js`) |
| 7 | **The baseline needed "good" readings**, which a webcam rarely reaches, so in real use **no alert could ever fire** | SNR mostly between 0 and 3 dB ("fair") | Learn the baseline from good *and* fair readings (`fusion.js`) |
| 8 | **The display flickered** between a value and "—" | Readings coming and going | Hold the last value, greyed, for 8 s; alerts ignore it (`vitals-display.js`) |

### 14.4 Results

| | Before | After |
|---|---|---|
| Samples per second | 59 (duplicates) | about 24 (real frames) |
| Skin pixels per frame | about 340 | 1,200–2,000 |
| Readings on the same recording | none (always "poor") | stable **65–68 bpm**, plus "—" where the signal really was bad (you moved at about 35 s) |
| Automated tests | 63 | **67** (4 new regression tests) |

### 14.5 Honest limits

A webcam is not a medical sensor. Readings appear when the face is **well lit from the front and still**, and disappear (showing "—") when the patient moves or the light is poor. This is the right behaviour: a missing number is safe, a wrong number is not. Accuracy on real people hasn't been measured against a reference device yet: do it with the validation logger before claiming a figure.

---

## 15. Getting a good heart-rate reading

1. **Light the face from the front:** a desk lamp behind or beside the laptop, or the screen brightness at maximum. Avoid a window behind the person.
2. **Avoid lighting that is too bright:** if the forehead looks shiny or white on camera, those pixels are skipped.
3. **Distance 50–60 cm**, face filling a good part of the image.
4. **Stay still and don't talk** for the first 15–20 seconds; the first value appears after about 12–15 s.
5. **Open the operator panel (`D`):** watch *Pulse SNR*. Above 0 dB means a reading; above 3 dB is good.
6. **Click *Lock exposure*** once the image has settled, if your camera supports it. It stops the camera from adjusting itself, which looks like noise.
7. **For the stage demo,** use the **simulated stress** (`S`) to show the alert reliably. It is clearly labelled "Simulation". Show the live heart rate as a bonus, without depending on it.

---

## 16. Glossary

| Term | Meaning |
|---|---|
| **AAC** | Augmentative and alternative communication: any way of communicating other than speech |
| **Blendshape** | A 0–1 score for one facial movement (from 3D animation) |
| **bpm** | Beats per minute |
| **Butterworth filter** | A filter designed to be as flat as possible in the frequencies it keeps |
| **Calibration** | Measuring a person's eye features at known screen points to fit their gaze model |
| **dB (decibel)** | Ten times the base-10 logarithm of a power ratio. 0 dB means equal, +3 dB double, +10 dB ten times. |
| **Dwell** | Selecting by looking at a target for a set time |
| **FFT** | Fast Fourier transform: computes which frequencies a signal contains |
| **Hann window** | A bell-shaped taper applied before the FFT to avoid edge artefacts |
| **Harmonic** | A multiple of a base frequency; a heartbeat at 1.2 Hz also has energy at 2.4 Hz |
| **Hysteresis** | Different on and off thresholds, to stop flickering between states |
| **Landmark** | A tracked point on the face |
| **Locked-in syndrome** | Full awareness with paralysis of everything except eye movements |
| **Overfitting** | A model that memorises its training data and fails on new data |
| **POS** | Plane-Orthogonal-to-Skin, the rPPG method used |
| **PPG / rPPG** | (Remote) photoplethysmography: measuring the pulse from changes in light |
| **Regression test** | A test that locks in a fixed bug so it can't come back |
| **Ridge regression** | Linear regression with a penalty on large weights |
| **ROI** | Region of interest: the skin areas analysed |
| **SNR** | Signal-to-noise ratio |
| **Tachycardia / bradycardia** | Heart rate too fast (over 100) or too slow (under 60) at rest |
| **Token** | A random secret that proves a phone was paired at the bedside |
| **WebSocket** | A permanent two-way connection between a browser and a server |
| **Zero-phase filtering** | Filtering forward then backward, so the signal isn't shifted in time |
