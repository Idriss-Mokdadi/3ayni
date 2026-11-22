# 3ayni (عيني): project report

**Event:** IEEE Tech4Health 2.0
**Domain:** 1, people with disabilities, with prevention and early warning (domain 3)
**Report date:** 22 November 2026

3ayni ("my eyes" in Tunisian Darija) gives a voice to patients who cannot speak or move, and keeps a quiet watch on their heart rate. It needs only an ordinary laptop camera. The patient speaks with their eyes, and the same camera reads their pulse from the skin of the face. When the two together point to distress, the caregiver's phone is alerted with the reason.

This report covers everything built for the challenge:

1. the working application;
2. how it works and why each technique was chosen;
3. the measured results;
4. responsible AI and data security;
5. the pitch materials (a PowerPoint deck and two generations of animated HTML presentations);
6. how to run the demo, and what is still left to do.

---

## 1. The problem

- **Who:** patients after a stroke, with ALS (Charcot disease), on a breathing tube, or with severe cerebral palsy. They are often fully aware but cannot speak or use their hands.
- **What happens today:** in Tunisian hospitals and homes they communicate by blinking while a relative guesses ("is it water? the light? pain?").
- **Why existing devices don't help:** dedicated eye-gaze devices cost thousands of dinars and are rare outside large centres.
- **The hidden risk:** a patient who cannot speak also cannot say they are in pain or in distress. Nurses on a night shift cannot watch every bed.

## 2. The solution

| Function | What the patient or caregiver experiences |
|---|---|
| **Communicate** | The patient looks at one of six phrases the nurse chose for the home screen. A ring fills (dwell, 1.4 s) and the phrase is spoken aloud in Darija. Closing the eyes cancels any choice. |
| **Write** | A gaze keyboard: 12 letters per page, most used first; previous and next pages; two suggestions based on the letters typed and the heart rate. |
| **Answer** | The nurse's questions fill the screen with just Yes and No. |
| **Rest** | With no choice for a while, the screen sleeps to one dot, staying awake longer when the heart rate is high; looking at the dot wakes it. |
| **Monitor** | Heart rate (and an experimental breathing rate) is estimated from the face video. Every value carries a signal-quality grade. |
| **Combine** | "Pain" plus a heart rate above the patient's own baseline raises an **urgent** alert. If the body is under stress and the patient stays silent, the screen asks *"Are you in pain?"* |
| **Connect** | The caregiver's phone receives messages, alerts and vitals, and can send yes/no questions back. "I'm on my way" tells the patient that help is coming. |

The hardware is a laptop with a webcam, plus any phone. No special device, no cloud and no subscription are needed.

---

## 3. The application

**Location:** `E:\IEEE\Tech4Health 2.0\3ayni\` (git repository, commit `a253b1c`).

### 3.1 Stack

| Layer | Technology |
|---|---|
| Bedside screen and caregiver screen | Vite web app, plain JavaScript modules, IBM Plex Sans and Sans Arabic fonts, Lucide icons |
| Face tracking | MediaPipe Face Landmarker: 478 points, blendshapes and iris points. Runs in the browser; the model and WebAssembly runtime are bundled for offline use. |
| Relay | Node.js with Express 5 and `ws` (WebSocket) on port 3000 |
| Pairing | QR code (`qrcode`) carrying a random token |
| Tests | Vitest: 86 unit tests in 5 files |

### 3.2 Architecture

```
camera frame ─┬─> MediaPipe face mesh (478 points + blendshapes, on device)
              │
              ├─> gaze features ──> personal calibration ──> One Euro filter ──> tile ──> dwell (eyes open)
              │                     (ridge regression,                                     │
              │                      5 dots, ~8 s)                                         ▼
              │                                        suggestions (phrase model) ──> board ──> speech + message ─┐
              │                                                                                                   ▼
              └─> forehead + cheeks ──> POS pulse extraction ──> FFT peak + SNR ──> care monitor ──> relay ──> caregiver phone
                  (mean skin colour)     (cancels lighting)       (heart rate,       (rules: baseline,
                                                                   quality grade)     elevated, silent, urgent)
```

### 3.3 Modules

| File or folder | Role |
|---|---|
| `server/index.js` | Relay. Handles pairing tokens, checks each event against a schema, limits size and rate, keeps per-role permissions, and keeps a short history for phones that join late. |
| `web/src/patient/camera.js` | Webcam and MediaPipe loop |
| `web/src/patient/gaze/` | `features.js` (iris position, eye rotation, head pose), `calibration.js` (5-dot procedure), `ridge.js` (ridge regression), `one-euro.js` (One Euro filter), `selection.js` (dwell; closed eyes cancel) |
| `web/src/patient/vitals/` | `roi.js` (forehead and cheek skin regions), `dsp.js` (detrending, band-pass, FFT), `rppg.js` (POS heart-rate estimator with SNR quality grade) |
| `web/src/patient/board/` | `phrases.js` (Darija, French and English phrases), `board-model.js` (navigation), `board-view.js` (rendering) |
| `web/src/patient/predictor.js` | Phrase suggestion model |
| `web/src/patient/fusion.js` | Alert rules with hysteresis |
| `web/src/patient/care-routines.js` | Simulated daily routines, used to seed and evaluate the predictor |
| `web/src/patient/simulation.js` | Stress scenario for the stage demo, labelled "Simulation" on both screens |
| `web/src/patient/validation.js` | Logger to compare camera heart rate with a smartwatch or oximeter, with CSV export |
| `web/src/patient/devpanel.js` | Operator panel: camera preview, metrics, demo and validation tools |
| `web/src/caregiver/main.js` | Caregiver phone screen |
| `web/src/shared/` | Event protocol, relay link, icons, sounds, storage |
| `scripts/setup-assets.mjs` | Copies the face model and runtime for offline use, builds the audio manifest |
| `scripts/evaluate-predictor.mjs` | Evaluates the suggestion model against baselines |
| `test/` | `gaze`, `vitals`, `roi`, `logic` and `server` test files |

### 3.4 How each part works

**Gaze**
- For each frame, a feature vector is built from the iris position inside each eye, the eye-look blendshapes and the head pose.
- A 5-dot calibration (about 8 s) fits a **ridge regression** from these features to screen coordinates. It is fitted per person, because every face and camera position is different.
- A **One Euro filter** smooths the cursor: steady when the eye rests, responsive when it moves.
- The cursor is mapped to the grid cell under it. A tile is selected after a **dwell** (the ring fills). **Closing the eyes cancels the choice**, so a resting patient never selects anything.

**Heart rate (rPPG)**
- The mean skin colour of the forehead and cheeks is tracked over a sliding window.
- The **POS method** (Wang et al., IEEE Transactions on Biomedical Engineering, 2017) projects the colour signal onto a plane that cancels lighting changes and keeps the pulse.
- After a band-pass filter, an **FFT** finds the dominant frequency in the heart-rate band. The **signal-to-noise ratio** of that peak grades the quality. A weak signal shows "—" instead of a false number.

**Suggestions**
- A probabilistic model scores each phrase from three things: what usually follows the last phrase (bigrams), the time of day, and whether distress is present.
- It learns this patient's own habits as they use the board.

**Alerts**
- Transparent rules with hysteresis:
  1. a personal baseline is learned first (90 s, or 20 s in fast demo mode);
  2. heart rate is then compared with that baseline;
  3. sustained elevation while the patient is silent makes the screen ask a question;
  4. "pain" together with elevation is **urgent**.
- Every alert states its reason, for example "+45 % above baseline".

---

## 4. Why AI here, and rules there (Technical Approach)

The jury asked for purposeful AI. Each part uses the simplest tool that works.

| Part | Approach | Why |
|---|---|---|
| Face and eye tracking | Neural network (MediaPipe) | Cannot be done with rules |
| Gaze to screen position | Ridge regression, fitted per person | A learned mapping absorbs each face and camera set-up in 8 s |
| Pulse from video | POS signal processing and spectral analysis | Published, explainable, fast, and needs no training data |
| Phrase suggestions | Small probabilistic model | Instant and offline, explains itself, personalises. A large language model would be slower, opaque and need the internet. |
| Alerts | Transparent rules | Clinical alerts must be predictable and explainable |

---

## 5. Measured results

I re-ran both commands while writing this report (`npm test` and `npm run evaluate:predictor` in `3ayni/`).

| Measure | Result |
|---|---|
| Unit tests | **86 of 86 pass** (5 files, under 2 s) |
| Suggestions, on 3,978 held-out simulated messages | The right phrase is in the model's top 3 **55.7 %** of the time, against 37.5 % for a fixed "most frequent" list. |
| Heart rate on synthetic signals | Within **± 3 bpm** from 52 to 130 bpm, including a lighting flicker placed inside the heart-rate band (which fools a green-channel-only method). Pure noise is graded poor and shows no number. |
| Heart rate on real people | **Not measured yet.** The validation logger is ready: record next to a smartwatch or finger oximeter, export the CSV, and report the mean absolute error. |

Be honest about these numbers on stage. The suggestion results come from simulated routines, not patient data. Real accuracy must come from a pilot.

---

## 6. Responsible AI and data security

- **Video never leaves the laptop.** Frames are processed in the browser tab and discarded. Only phrases, alerts and numbers are sent, and only on the local network.
- **Pairing:**
  - a phone joins only with a random token shown as a QR code at the bedside;
  - the bedside role and the token are available only from the laptop itself.
- **Validated input:**
  - the relay checks every event against a schema;
  - it limits message size and rate;
  - each role may send only its own event types.
- **No false numbers.** Every estimate carries a quality grade. When the signal is weak, monitoring pauses and says why.
- **Known bias.** Camera pulse measurement is less accurate on darker skin and in low light. This is stated openly, and the validation logger is there to test across skin tones and lighting.
- **Patient control.** A settings tile pauses vitals sharing. Repeat, recalibrate and slower selection are one glance away.
- **Assistive, not diagnostic.** 3ayni adds to clinical monitors and never replaces them.
- **Demo transparency.** The simulated stress scenario is labelled "Simulation" on both screens.

---

## 7. Running the app and the stage demo

```powershell
cd "E:\IEEE\Tech4Health 2.0\3ayni"
npm install
npm start
```

1. Open **http://localhost:3000** in Chrome or Edge and click **Start camera**. With no camera, use **Continue without camera** and the mouse or the number keys.
2. Follow the dot with your eyes for about 8 seconds.
3. Press **P** and scan the QR code with a phone on the same Wi-Fi or hotspot.

**Keys on the bedside screen**

| Key | Action |
|---|---|
| `1`–`6` | Choose a tile |
| `D` | Operator panel |
| `P` | Pair a phone |
| `C` | Recalibrate |
| `G` | Show the gaze cursor |
| `S` | Simulated stress scenario |
| `B` | Take the current heart rate as baseline |

**Live demo (inside the 4-minute pitch)**

1. **Before going on stage:**
   - run `npm start`;
   - pair the phone;
   - in the operator panel (`D`), turn **Fast demo timings** on.
2. **Set up the judge:** seat a judge 50–60 cm from the laptop with a lamp lighting their face from the front, then calibrate (`C`).
3. **Speak with the eyes:** the judge says *"I want to drink"* with their eyes. The laptop speaks it, and the phone receives it with their live heart rate. Compare with a smartwatch.
4. **Trigger the alert:** press `S`. The heart rate climbs and the screen asks *"Are you in pain?"* Answering *pain* sends **URGENT** to the phone.
5. **Close the loop:** tap **I'm on my way** on the phone. The patient sees *"Help is on the way"*.

**Real Darija voices (optional):** record one clip per phrase as `web/public/audio/<phrase-id>.mp3` (ids are in `web/src/patient/board/phrases.js`), then run `npm run build`. Without these recordings, the app falls back to a synthetic Arabic voice.

---

## 8. Pitch materials

All of them are in `E:\IEEE\Tech4Health 2.0\pitch\`.

### 8.1 PowerPoint deck: `3ayni-pitch.pptx`

- 10 slides built on the Slidesgo "Remote Patient Monitoring" template, keeping its backgrounds, photos and fonts.
- Content: problem, solution, how it works, AI choices, results, responsible AI, roadmap and close.
- Product screenshots: `assets/bedside.png` and `assets/caregiver.png`.
- Use it as the backup if the HTML deck cannot run.

### 8.2 First animated HTML decks: `html/`

- `3ayni-through-his-eyes.html` and `3ayni-hologram.html`.
- **Superseded.** You judged them too "vibe coded", and they led to the rebuild below.

### 8.3 Final deck: `html2/3ayni-through-his-eyes.html`

One offline file of 3.1 MB: fonts, scripts, images and video are all inlined.

**Concept.** The audience sees through the eyes of Am Hédi, a patient who cannot move or speak.

- **Slide 1** is a real infrared eye-tracking video.
- **Entering the eye:** on the next click, the camera pushes into the pupil, and from then on the screen *is* his eye.
  - The eyelids frame the top and bottom, with out-of-focus lashes, a faint red rim and the shadow of the nose at the inner corner.
  - The eye blinks naturally every 3–7 s, sometimes twice.
  - Every slide change happens during a blink, and the view turns dark red while the lids are closed.
- **The room:** behind the content is a real hospital ward at night, with small gaze shifts from slide to slide. All slides are dark.
- **One guide, Karim, the night nurse,** a real photo cut out and relit to match the room. He:
  - walks between positions;
  - breathes and sways while talking;
  - leans in close, and the room blurs around him as an eye would focus;
  - rushes in when the alarm turns the ward red.
- **His lines** are in Darija, with English subtitles.

**The 22 slides**

| # | Slide | What happens |
|---|---|---|
| 1 | Cover | Real eye video, team Eddes Eddes A777 (Mohamed Idriss Mokdadi and Ahmed Ammar). The next click dives into the pupil. |
| 2 | Silence | He hears everything but cannot answer. |
| 3 | The question | Karim: "عم الهادي، تسمع فيّ؟ كان إيه، غمّض مرّة." Your click makes the eye blink once, slowly: his "yes". |
| 4 | Problem | Today's situation and its cost |
| 5 | Today: blink codes | Karim guesses: water? the light? turn over? Each click, the eye answers "no" with two blinks. He gives up; "He wanted to say: I am in pain. Nobody asked." |
| 6 | Today: letter boards | A letter board in front of the eye; rows then letters are scanned and the eye blinks to choose. "PAIN" takes 40 s of his time, played 6 times faster. |
| 7 | Today: call button and monitor | The audience tries to press the call button: nothing happens. The monitor races at 104 bpm but cannot say why. |
| 8 | No solution does all three | Table: blink codes, letter boards, eye-gaze tablets, phone eye control, monitor and call button, against 3ayni |
| 9 | Try it | The real board. The mouse is his gaze: hover to fill the ring, and the phrase is spoken. "Pain" or "Call the nurse" brings Karim's answer. |
| 10 | Solution | Communicate, monitor, alert |
| 11 | Made for a whole day and night | Keyboard screenshot; nurse-chosen home phrases, keyboard with heart-rate suggestions, yes/no questions, closed eyes choose nothing, screen sleeps to one dot |
| 12 | How it works | The six-step chain with a live red ECG trace |
| 13 | Demo | Heart rate climbs from 72 to 106. The alarm turns the ward red, Karim rushes in: "جاي، ما تخافش." |
| 14 | AI where it matters | The AI versus rules table |
| 15 | Proof | 56 % (top-3 suggestions), ± 3 bpm, 86 of 86, counted up on screen |
| 16 | Trust | Privacy and responsible AI |
| 17 | Scaling | Hardware (webcam today, low-cost infrared camera for night and dark rooms, then tablets and Android phones), deployment (pilot ward, public hospitals and rehab centres, home with a family app), product (Darija voice banking, head or switch input, nurse call integration, pain log) |
| 18 | Vision | "A voice for every patient who cannot speak, from a camera already in the room." |
| 19 | Close | "His eyes speak. His heart is heard." Karim: "يعيشك يا كريم." The last click closes the eye for good, and "Questions and discussion are welcome" appears with the credits. |
| 20–22 | Q&A backup | Prepared answers: accuracy and safety; patients and daily use; privacy, cost and competitors |

**Controls:** → or Space next, ← back, **N** speaker notes, **T** timer, **A** auto-play, **F** fullscreen. Clicks during a blink are ignored, so slides never stack up.

**Source and rebuild.** The source is `html2/src/`:

| File | Role |
|---|---|
| `index.html` | The slides and their texts |
| `eye.js` | The eyelids and the blinks |
| `deck.js` | Scenes and Karim's movements |
| `deck.css` | The look |
| `shared/engine.js` | Stage scaling, steps, notes, timer |
| `media/` | Video, photos and the nurse cut-out |

After any edit, rebuild the single file:

```powershell
cd "E:\IEEE\Tech4Health 2.0\pitch\html2"
node pack.mjs
```

**Verified.** In headless Chrome, all 22 slides render with no page errors, including:

- the dive into the eye;
- half-closed and closed blinks;
- the alarm.

The packed file has no external references.

**Media credits** (also on the last slide, as the licences require):

| Media | Credit | Licence |
|---|---|---|
| Nurse photo | Freepik, via Slidesgo | Slidesgo terms, attribution required |
| Hospital ward | Tomasz Sienicki | Public domain |
| Infrared eye footage | InkassoSchroeder, Wikimedia Commons | CC BY-SA 4.0 |

---

## 9. How 3ayni answers the judging criteria

| Criterion | Our answer |
|---|---|
| **Relevance** | A real, under-served group in Tunisia (stroke, ALS, intubated and cerebral palsy patients). It covers domain 1 (disabilities) and domain 3 (early warning). |
| **Innovation** | One ordinary camera does both communication and vital signs, and the two are fused: the system notices distress the patient cannot express. |
| **Technical approach** | AI only where rules cannot work (face tracking, per-person gaze mapping, personalised suggestions). Rules where predictability matters (alerts). Published signal processing for the pulse. 86 tests. |
| **Responsible AI and data security** | Video never leaves the device. Token pairing, schema validation, quality grades instead of false numbers, a stated skin-tone bias with a way to measure it, and an assistive, not diagnostic, position. |
| **Demo and presentation** | A judge uses it live with their own eyes, the phone receives the message, and the alert loop closes on stage. The deck puts the audience inside the patient's eye. |

---

## 10. Limits, and likely jury questions

| Likely question | Honest answer |
|---|---|
| "Is webcam gaze accurate enough?" | It is coarse: six large tiles are reliable, a full keyboard is not. That is why the board uses tiles, suggestions and categories. |
| "How accurate is the heart rate?" | ± 3 bpm on synthetic signals. Real-world accuracy still has to be measured, and the logger is built for that. It needs light on the face and a fairly still head, which bedridden patients usually have. |
| "What about darker skin?" | Accuracy drops: a known limit of camera pulse measurement. We grade quality, never show a weak number, and will test across skin tones. |
| "Why not an LLM for suggestions?" | It would be slower, need the internet, and be unable to explain itself. Our small model runs instantly offline and learns this patient. |
| "Where does the data go?" | Nowhere outside the room: video stays in the browser tab, and events travel on the local network after QR pairing. |
| "Is this a medical device?" | No. It is assistive and adds to clinical monitors. A pilot and validation would come before any clinical claim. |
| "What next?" | A pilot in a Tunisian neurology or intensive-care unit, Darija voices recorded by native speakers, and a multi-bed nurse station view. |

Breathing rate is experimental. Present it as such, or leave it out.

---

## 11. Checklist before the pitch

- [ ] Open the final deck on the presentation laptop in Chrome, press **F**, and rehearse the full 4 minutes with **T**.
- [ ] Test the app's camera on that laptop under the venue's light. Bring a desk lamp.
- [ ] Pair the phone over a hotspot, not the venue Wi-Fi, and turn **Fast demo timings** on.
- [ ] Keep `3ayni-pitch.pptx` on a USB stick as a backup.
- [ ] Optional: record the Darija voice clips.
- [ ] Keep the credits on the last slide.

---

## 12. File map

```
E:\IEEE\Tech4Health 2.0\
├─ t4h book1.pdf                        challenge specifications
├─ 3ayni-report.md                      this report
├─ 3ayni\                               the application (git, 86 tests)
└─ pitch\
   ├─ 3ayni-pitch.pptx                  PowerPoint deck (10 slides)
   ├─ assets\                           screenshots, room photos, credits.json
   ├─ downloads\                        Slidesgo templates you downloaded
   ├─ html\                             first HTML decks (superseded)
   └─ html2\
      ├─ 3ayni-through-his-eyes.html    final deck, one offline file
      ├─ pack.mjs                       rebuilds the single file
      └─ src\                           source: index.html, eye.js, deck.js, deck.css, media\
```
