// Bedside screen. Wires the camera, gaze selection, communication board,
// vital signs, alert rules and the link to caregivers together.
//
//   camera frame ─┬─> gaze features ─> calibration / gaze model ─> tile ─> selection ─> board ─> speech + message
//                 └─> skin colour ───> vitals estimator ─(1 Hz)─> care monitor ─> alerts / questions
//
// Everything above runs in this tab. Only messages, alerts and numbers leave it.

import '../styles/patient.css';
import { icon } from '../shared/icons.js';
import { RelayLink } from '../shared/link.js';
import { playTone, unlockAudio } from '../shared/sound.js';
import { loadJson, saveJson } from '../shared/storage.js';
import { BoardModel } from './board/board-model.js';
import { learnWords } from './board/keyboard.js';
import { BoardView } from './board/board-view.js';
import { SUGGESTIBLE_IDS } from './board/phrases.js';
import { FaceTracker, listCameras } from './camera.js';
import { seedPredictor } from './care-routines.js';
import { DevPanel } from './devpanel.js';
import { CareMonitor, FAST_DEMO_RULES, RULES } from './fusion.js';
import { GazeCalibration } from './gaze/calibration.js';
import { eyeClosure, extractGazeFeatures } from './gaze/features.js';
import { OneEuroFilter } from './gaze/one-euro.js';
import { SelectionEngine } from './gaze/selection.js';
import { PhrasePredictor } from './predictor.js';
import { StressSimulator } from './simulation.js';
import { FAST_SLEEP_RULES, SLEEP_RULES, sleepDelayMs } from './sleep.js';
import { Speaker } from './speech.js';
import { ValidationLog } from './validation.js';
import { VitalsDisplay } from './vitals-display.js';
import { SkinSampler } from './vitals/roi.js';
import { VitalsEstimator } from './vitals/rppg.js';

const DWELL_NORMAL_MS = 1400;
const DWELL_SLOW_MS = 2200;
const PREDICTOR_KEY = '3ayni.predictor.v1';
const LEXICON_KEY = '3ayni.lexicon.v1';
const CAMERA_KEY = '3ayni.camera.v1'; // the chosen camera, e.g. a phone used as a webcam
const BOARD_KEY = '3ayni.board.v1'; // the nurse's home phrases and keyboard alphabet
const QUESTION_TIMEOUT_MS = 3 * 60_000; // an unanswered question goes back to the home screen
const PREVIOUS_MESSAGE_WINDOW_MS = 10 * 60_000; // older messages no longer count as "previous"

const $ = (id) => document.getElementById(id);

class BedsideApp {
  constructor() {
    this.board = new BoardModel();
    const savedBoard = loadJson(BOARD_KEY);
    if (savedBoard?.home) this.board.setHome(savedBoard.home);
    if (savedBoard?.alphabet) this.board.setAlphabet(savedBoard.alphabet);
    this.lexicon = loadJson(LEXICON_KEY) ?? {};
    this.sleepRules = SLEEP_RULES;
    this.lastActivity = Date.now(); // last deliberate choice, question or wake-up
    this.lastHelpAt = null; // last attention or urgent message
    this.urgentOpen = false; // an urgent alert not yet acknowledged by a caregiver
    this.questionAt = 0;
    this.view = new BoardView($('board'), (index, via) => this.activate(index, via));
    this.speaker = new Speaker();
    this.selection = new SelectionEngine({ dwellMs: DWELL_NORMAL_MS });
    this.filterX = new OneEuroFilter({ minCutoff: 0.8, beta: 0.015 });
    this.filterY = new OneEuroFilter({ minCutoff: 0.8, beta: 0.015 });
    this.sampler = new SkinSampler();
    this.estimator = new VitalsEstimator();
    this.monitor = new CareMonitor(Date.now());
    this.simulator = new StressSimulator();
    this.validation = new ValidationLog();
    this.vitalsDisplay = new VitalsDisplay();
    this.predictor = this.#loadPredictor();

    this.tracker = null;
    this.calibration = null;
    this.gazeModel = null;
    this.calibrationError = null;
    this.tiles = [];
    this.lastFrame = null;
    this.lastGaze = null;
    this.lastVitals = { hr: null, rr: null, quality: 'none' };
    this.lastEstimate = null;
    this.rawSignal = []; // last 90 s of [time ms, r, g, b, pixels], for offline analysis
    this.lastMessage = null; // { id, at }
    this.fatigued = false;
    this.showCursor = false;
    this.fastTimings = false;
    this.link = null;
    this.session = null;

    this.devPanel = new DevPanel({
      'btn-fast': () => this.toggleFastTimings(),
      'btn-baseline': () => this.setBaselineNow(),
      'btn-stress': () => this.toggleStress(),
      'btn-recal': () => this.startCalibration(),
      'btn-cursor': () => this.toggleCursor(),
      'btn-exposure': () => this.lockExposure(),
      'btn-export': () => this.exportValidation(),
      'btn-raw': () => this.exportRawSignal(),
    });

    this.#renderStaticIcons();
    this.#bindUi();
    this.renderBoard();
    this.#connectRelay();
    setInterval(() => this.tick(), 1000);
  }

  // ---------------------------------------------------------------- startup

  async startCamera() {
    $('start-error').hidden = true;
    $('start-camera').disabled = true;
    $('start-camera').textContent = 'Starting camera…';
    try {
      const chosen = $('camera-select').value || null;
      saveJson(CAMERA_KEY, chosen);
      this.tracker = new FaceTracker($('video'));
      try {
        await this.tracker.start(chosen);
      } catch (error) {
        if (!chosen || error?.name === 'NotAllowedError') throw error;
        await this.tracker.start(); // the saved camera is gone (phone unplugged): use the default one
      }
      this.tracker.onFrame((frame) => this.onFrame(frame));
      this.#fillCameras(); // names are known now, for the next start
      $('start-overlay').hidden = true;
      this.startCalibration();
    } catch (error) {
      console.error(error);
      const denied = error?.name === 'NotAllowedError';
      $('start-error').textContent = denied
        ? 'Camera access was refused. Allow the camera in the browser, or continue without it.'
        : `The camera could not start (${error?.message ?? error}). You can continue without it.`;
      $('start-error').hidden = false;
      $('start-camera').disabled = false;
      $('start-camera').textContent = 'Try again';
    }
  }

  startManual() {
    $('start-overlay').hidden = true;
    this.setBanner('Manual mode', 'Click a tile, or press a number key');
  }

  startCalibration() {
    if (!this.tracker) {
      this.toast('Calibration needs the camera');
      return;
    }
    this.calibration = new GazeCalibration();
    $('calibration-message').textContent =
      `Follow the dot with your eyes and keep your head still (about ${Math.round(this.calibration.durationMs / 1000)} seconds)`;
    this.gazeModel = null;
    this.view.setHover(null);
    $('calibration-overlay').hidden = false;
  }

  #finishCalibration() {
    const result = this.calibration.finish();
    this.calibration = null;
    if (!result.ok) {
      $('calibration-message').textContent =
        `${result.reason}. Keep your face in view; starting again…`;
      setTimeout(() => this.startCalibration(), 1500);
      return;
    }
    $('calibration-overlay').hidden = true;
    this.gazeModel = result.model;
    this.calibrationError = result.error;
    this.calibrationAxes = { x: result.errorX, y: result.errorY, stretchX: result.stretch.x.gain, stretchY: result.stretch.y.gain };
    this.filterX.reset();
    this.filterY.reset();
    this.selection.reset(performance.now());
    // The error is measured on dots left out of the fit, so it is honest about new positions.
    if (result.error > 0.2) {
      const axis = result.errorY > result.errorX ? 'up and down' : 'left and right';
      this.setBanner('Calibration', `Imprecise ${axis}. Keep the head still and press C to recalibrate`, 'attention');
    } else {
      this.setBanner('Ready', 'Look at a tile to choose it');
    }
  }

  // ------------------------------------------------------------ per frame

  /** @param {import('./camera.js').FaceFrame} frame */
  onFrame(frame) {
    this.lastFrame = frame;
    const { t, landmarks, blendshapes, pose } = frame;

    const skin = this.sampler.sample(frame.video, landmarks);
    const now = Date.now();
    this.estimator.push(now, skin?.rgb ?? null, skin?.motionY);
    if (skin) {
      this.rawSignal.push([now, ...skin.rgb.map((v) => Number(v.toFixed(4))), skin.pixels]);
      while (this.rawSignal.length && this.rawSignal[0][0] < now - 90_000) this.rawSignal.shift();
    }

    const closure = landmarks ? eyeClosure(blendshapes) : 0;
    const features = landmarks && closure < 0.5 ? extractGazeFeatures(landmarks, blendshapes, pose) : null;

    if (this.calibration) {
      const state = this.calibration.update(t, features);
      if (state.done) this.#finishCalibration();
      else this.#drawCalibration(state);
    } else if (this.gazeModel) {
      let tile = null;
      if (features) {
        const raw = this.gazeModel.predict(features);
        this.lastGaze = { x: this.filterX.filter(raw.x, t), y: this.filterY.filter(raw.y, t) };
        tile = this.view.tileAt(this.lastGaze);
        this.lastTile = tile;
        this.#moveCursor(this.lastGaze);
      } else if (landmarks) {
        tile = this.lastTile ?? null; // eyes half-closed: keep the current tile rather than dropping it
      } else {
        this.lastGaze = null;
        this.lastTile = null;
      }
      for (const event of this.selection.update(t, { tile, closure })) this.#onSelectionEvent(event);
    }

    this.devPanel.drawOverlay(frame, this.sampler.lastRegions);
  }

  #onSelectionEvent(event) {
    if (event.type === 'hover') this.view.setHover(event.tile);
    else if (event.type === 'progress') this.view.setProgress(event.tile, event.value);
    else if (event.type === 'select') this.activate(event.tile, event.via);
  }

  #drawCalibration(state) {
    const dot = $('calibration-dot');
    dot.style.left = `${state.target.x * 100}%`;
    dot.style.top = `${state.target.y * 100}%`;
    dot.classList.toggle('is-capturing', state.capturing);
    $('calibration-progress').style.width = `${Math.round(state.progress * 100)}%`;
  }

  #moveCursor(point) {
    const cursor = $('gaze-cursor');
    cursor.hidden = !this.showCursor;
    if (this.showCursor) {
      cursor.style.transform = `translate(${point.x * window.innerWidth}px, ${point.y * window.innerHeight}px)`;
    }
  }

  // ------------------------------------------------------------ once per second

  tick() {
    const now = Date.now();
    const estimate = this.estimator.estimate();
    this.lastEstimate = estimate;
    const simulated = this.simulator.active;
    const vitals = simulated ? this.simulator.reading(now) : { hr: estimate.hr, rr: estimate.rr, quality: estimate.quality };
    this.lastVitals = vitals;

    const sharing = this.board.settings.shareVitals;
    this.vitalsDisplay.update(vitals, simulated ? syntheticWave(now, vitals.hr) : estimate.waveform, { paused: !sharing });

    // Without a camera there is nothing to monitor (and no reason to warn about lighting).
    const monitoring = Boolean(this.tracker) || simulated;
    if (monitoring) for (const event of this.monitor.updateVitals(now, vitals)) this.#onMonitorEvent(event);

    const fatigue = this.monitor.updateBlinkRate(now, this.selection.blinkRate(performance.now()));
    if (fatigue) {
      this.fatigued = fatigue.on;
      $('app').classList.toggle('is-fatigued', this.fatigued);
      this.#applyDwell();
      this.link?.send('status', { state: this.fatigued ? 'fatigued' : 'rested', reason: 'Blink rate' });
    }

    this.#checkSleep(now);

    if (sharing && monitoring) {
      this.link?.send('vitals', {
        hr: vitals.hr === null ? null : Math.round(vitals.hr),
        rr: vitals.rr === null ? null : Math.round(vitals.rr),
        quality: vitals.quality,
        simulated,
        baseline: this.monitor.baseline === null ? null : Math.round(this.monitor.baseline),
        state: this.monitor.state,
      });
    }
    this.#updateMetrics();
  }

  #onMonitorEvent(event) {
    if (event.type === 'state') {
      this.link?.send('status', { state: event.state, reason: event.reason, baseline: event.baseline });
      if (event.state === 'elevated' || event.state === 'normal') this.renderBoard(); // distress changes suggestions
    } else if (event.type === 'alert') {
      this.link?.send('alert', { id: event.id, level: event.level, reason: event.reason });
      if (event.level === 'urgent') this.urgentOpen = true;
    } else if (event.type === 'prompt') {
      this.board.ask(event.question, { yesMeans: 'pain' }); // "yes" to "Are you in pain?" says "I am in pain"
      this.#questionArrived();
      this.setBanner('Question', `${event.questionAr}  ·  ${event.question}`, 'question');
      playTone('question');
      this.renderBoard();
    }
  }

  // ------------------------------------------------------------ choosing a tile

  activate(index, via) {
    const tile = this.tiles[index];
    if (!tile) return;
    const now = Date.now();
    this.view.flash(index);
    this.monitor.noteInteraction(now);
    this.lastActivity = now;
    const action = this.board.select(tile);

    if (action.kind === 'say') this.#say(action.phraseId, action.answeredQuestion, now);
    else if (action.kind === 'sayText') this.#sayText(action.text, action.alphabet, now);
    else if (action.kind === 'control') this.#runControl(action.name);
    else if (action.kind === 'wake') this.#onWake();

    this.renderBoard();
    console.debug(`selected ${tile.key} via ${via}`);
  }

  #say(phraseId, answeredQuestion, now) {
    const phrase = this.board.phrase(phraseId);
    this.speaker.speak(phrase);

    const previousId = this.#previousMessageId(now);
    if (SUGGESTIBLE_IDS.includes(phraseId)) {
      this.predictor.observe(phraseId, { previousId, hour: new Date().getHours() });
      saveJson(PREDICTOR_KEY, this.predictor);
    }
    this.lastMessage = { id: phraseId, at: now };

    const { urgency, alert } = this.monitor.assessMessage(now, phrase);
    if (urgency !== 'routine') this.lastHelpAt = now;
    if (urgency === 'urgent') this.urgentOpen = true;
    const text = answeredQuestion ? `${phrase.en} (answer to "${answeredQuestion}")` : phrase.en;
    this.link?.send('message', {
      id: phrase.id,
      text,
      ar: phrase.ar,
      category: phrase.category,
      urgency,
      question: answeredQuestion,
    });
    if (alert) this.link?.send('alert', { id: alert.id, level: alert.level, reason: alert.reason });

    this.setBanner('Said', `${phrase.ar}  ·  ${phrase.en}`, urgency === 'routine' ? null : urgency);
    playTone('sent');
    this.toast(this.link?.online ? 'Sent to your caregiver' : 'Said aloud. Caregiver not connected');
  }

  /** A message written letter by letter on the keyboard. */
  #sayText(text, alphabet, now) {
    this.speaker.speakText(text, alphabet === 'latin' ? 'fr' : 'ar');
    learnWords(this.lexicon, text);
    saveJson(LEXICON_KEY, this.lexicon);
    this.monitor.noteInteraction(now);
    this.link?.send('message', { id: 'typed', text, ar: text, category: 'typed', urgency: 'routine', question: null });
    this.setBanner('Wrote', text, null);
    playTone('sent');
    this.toast(this.link?.online ? 'Sent to your caregiver' : 'Said aloud. Caregiver not connected');
  }

  #onWake() {
    $('app').classList.remove('is-asleep');
    this.link?.send('status', { state: 'screen-awake', reason: 'Patient woke the screen' });
    this.setBanner('Ready', 'Look at a tile to choose it');
  }

  #runControl(name) {
    switch (name) {
      case 'repeat':
        if (this.lastMessage) this.speaker.speak(this.board.phrase(this.lastMessage.id));
        break;
      case 'recalibrate':
        this.startCalibration();
        break;
      case 'shareVitals': {
        const on = this.board.settings.shareVitals;
        this.link?.send('status', { state: on ? 'sharing' : 'sharing-paused', reason: 'Set by patient' });
        this.toast(on ? 'Vital signs shared again' : 'Vital signs no longer shared');
        break;
      }
      case 'slowSelection':
        this.#applyDwell();
        this.toast(this.board.settings.slowSelection ? 'Slower selection' : 'Normal selection speed');
        break;
      default:
        break;
    }
  }

  #applyDwell() {
    if (this.board.asleep) this.selection.dwellMs = this.sleepRules.wakeDwellMs;
    else this.selection.dwellMs = this.fatigued || this.board.settings.slowSelection ? DWELL_SLOW_MS : DWELL_NORMAL_MS;
  }

  /** Body under stress: elevated state, or heart rate already 15 % above baseline. */
  #distressed() {
    const { hr } = this.lastVitals;
    const base = this.monitor.baseline;
    return this.monitor.distressed || (Number.isFinite(hr) && Number.isFinite(base) && hr / base >= 1.15);
  }

  renderBoard() {
    const distress = this.#distressed();
    const ranked = this.predictor
      .rank({ previousId: this.#previousMessageId(Date.now()), hour: new Date().getHours(), distress })
      .map((entry) => entry.id);
    this.tiles = this.board.tiles(ranked, this.lexicon, distress);
    this.view.render(this.tiles, this.board.layout(), this.board.screen.name);
    $('app').classList.toggle('is-asleep', this.board.asleep);
    this.#applyDwell();
    this.selection.reset(performance.now());
    if (this.board.screen.name !== 'question' && $('banner').dataset.tone === 'question') {
      this.setBanner('Ready', 'Look at a tile to choose it');
    }
  }

  #previousMessageId(now) {
    return this.lastMessage && now - this.lastMessage.at < PREVIOUS_MESSAGE_WINDOW_MS ? this.lastMessage.id : null;
  }

  /** Milliseconds before the board sleeps, given the patient's condition now (null = stays on). */
  sleepDelay(now = Date.now()) {
    return sleepDelayMs(
      {
        hr: this.lastVitals.hr,
        baseline: this.monitor.baseline,
        state: this.monitor.state,
        lastHelpAt: this.lastHelpAt,
        urgentOpen: this.urgentOpen,
        now,
      },
      this.sleepRules,
    );
  }

  #checkSleep(now) {
    if (this.board.screen.name === 'question' && now - this.questionAt > QUESTION_TIMEOUT_MS) {
      this.board.select({ kind: 'nav', target: 'home' });
      this.renderBoard();
    }
    // Only with the camera: in manual mode a nurse is using the mouse.
    if (!this.tracker || this.calibration || this.board.asleep || this.board.screen.name === 'question') return;
    const delay = this.sleepDelay(now);
    if (delay !== null && now - this.lastActivity >= delay) {
      this.board.sleep();
      this.renderBoard();
      this.setBanner('Resting', 'Look at the dot to wake the screen');
      this.link?.send('status', { state: 'screen-asleep', reason: `No choice for ${Math.round(delay / 1000)} s` });
    }
  }

  // ------------------------------------------------------------ caregiver link

  async #connectRelay() {
    try {
      const response = await fetch('/api/session');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.session = await response.json();
    } catch {
      this.#setLinkState('offline', 'No relay');
      return;
    }
    this.link = new RelayLink({
      role: 'patient',
      token: this.session.token,
      onEvent: (event) => this.#onRelayEvent(event),
      onStatus: (online) => {
        this.#setLinkState(online ? 'online' : 'offline', online ? 'Relay connected' : 'Reconnecting');
        if (online) this.#sendBoardState(); // the caregiver phone shows the current home phrases
      },
    });
  }

  #onRelayEvent(event) {
    if (event.type === 'question') {
      this.board.ask(event.payload.text);
      this.#questionArrived();
      this.setBanner('Question', event.payload.text, 'question');
      playTone('question');
      this.renderBoard();
    } else if (event.type === 'board') {
      this.board.setHome(event.payload.home);
      this.board.setAlphabet(event.payload.alphabet);
      saveJson(BOARD_KEY, { home: this.board.homeItems, alphabet: this.board.alphabet });
      this.#sendBoardState();
      this.toast('Home phrases updated by your caregiver');
      this.renderBoard();
    } else if (event.type === 'ack') {
      this.urgentOpen = false;
      this.setBanner('Caregiver', 'جايين ليك  ·  Help is on the way', null);
      this.toast('Your caregiver has seen your message');
    }
  }

  #questionArrived() {
    this.questionAt = Date.now();
    this.lastActivity = this.questionAt;
    $('app').classList.remove('is-asleep');
  }

  #sendBoardState() {
    this.link?.send('board-state', { home: this.board.homeItems, alphabet: this.board.alphabet });
  }

  #setLinkState(state, text) {
    $('link-dot').dataset.state = state;
    $('link-text').textContent = text;
  }

  #showPairing() {
    if (!this.session) {
      this.toast('Start the server with "npm start" to pair a phone');
      return;
    }
    const svg = new DOMParser().parseFromString(this.session.qrSvg, 'image/svg+xml').documentElement;
    $('pair-qr').replaceChildren(svg.nodeName === 'svg' ? document.importNode(svg, true) : document.createTextNode(''));
    $('pair-url').textContent = this.session.caregiverUrl;
    $('pair-overlay').hidden = false;
  }

  // ------------------------------------------------------------ demo + validation

  toggleFastTimings() {
    this.fastTimings = !this.fastTimings;
    this.monitor.rules = this.fastTimings ? FAST_DEMO_RULES : RULES;
    this.sleepRules = this.fastTimings ? FAST_SLEEP_RULES : SLEEP_RULES;
    this.devPanel.setToggle('btn-fast', 'Fast demo timings', this.fastTimings);
  }

  setBaselineNow() {
    const hr = this.lastVitals.hr ?? this.estimator.estimate().hr;
    if (!Number.isFinite(hr)) {
      this.toast('No heart rate yet: wait for a good signal');
      return;
    }
    for (const event of this.monitor.forceBaseline(hr)) this.#onMonitorEvent(event);
    this.toast(`Baseline set to ${Math.round(hr)} bpm`);
  }

  toggleStress() {
    if (this.simulator.active) {
      this.simulator.stop();
    } else {
      // Start from the real baseline when there is one; otherwise a typical resting rate.
      const from = this.monitor.baseline ?? this.lastVitals.hr ?? 72;
      if (this.monitor.baseline === null) {
        for (const event of this.monitor.forceBaseline(from)) this.#onMonitorEvent(event);
      }
      this.simulator.start(Date.now(), from);
    }
    $('sim-pill').hidden = !this.simulator.active;
    this.devPanel.setToggle('btn-stress', 'Simulate stress', this.simulator.active);
  }

  toggleCursor() {
    this.showCursor = !this.showCursor;
    $('gaze-cursor').hidden = !this.showCursor;
    this.devPanel.setToggle('btn-cursor', 'Gaze cursor', this.showCursor);
  }

  async lockExposure() {
    const ok = await this.tracker?.lockExposure();
    this.toast(ok ? 'Camera exposure locked' : 'This camera does not allow locking exposure');
  }

  logValidation(referenceHr) {
    const ok = this.validation.add({
      cameraHr: this.lastEstimate?.hr ?? NaN,
      referenceHr,
      quality: this.lastEstimate?.quality ?? 'none',
    });
    if (!ok) {
      this.toast('No camera reading to compare yet');
      return;
    }
    const s = this.validation.summary();
    $('validation-summary').textContent =
      `${s.n} pairs · mean abs. error ${s.mae.toFixed(1)} bpm · bias ${s.bias >= 0 ? '+' : ''}${s.bias.toFixed(1)} · within ±5 bpm ${Math.round(s.within5 * 100)}%`;
  }

  exportValidation() {
    const blob = new Blob([this.validation.toCsv()], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `3ayni-validation-${new Date().toISOString().slice(0, 16).replace(':', '')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  /** The raw skin-colour trace and camera settings, to study a recording offline. */
  rawSignalData() {
    const track = this.tracker?.video.srcObject?.getVideoTracks()[0];
    return { fps: this.tracker?.fps ?? null, camera: track?.getSettings?.() ?? null, samples: this.rawSignal };
  }

  exportRawSignal() {
    const blob = new Blob([JSON.stringify(this.rawSignalData())], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `3ayni-raw-signal-${new Date().toISOString().slice(0, 16).replace(':', '')}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ------------------------------------------------------------ UI helpers

  setBanner(label, text, tone = null) {
    $('banner-label').textContent = label;
    $('banner-text').textContent = text;
    if (tone) $('banner').dataset.tone = tone;
    else delete $('banner').dataset.tone;
  }

  toast(text) {
    const toast = $('toast');
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (toast.hidden = true), 2600);
  }

  #updateMetrics() {
    const e = this.lastEstimate;
    const frame = this.lastFrame;
    const fmt = (v, digits = 0) => (Number.isFinite(v) ? v.toFixed(digits) : '--');
    this.devPanel.showMetrics({
      'Camera fps': fmt(this.tracker?.fps),
      Face: frame?.landmarks ? 'detected' : 'not found',
      'Eye closure': frame?.landmarks ? fmt(eyeClosure(frame.blendshapes), 2) : '--',
      Gaze: this.lastGaze ? `${fmt(this.lastGaze.x, 2)}, ${fmt(this.lastGaze.y, 2)}` : '--',
      'Calibration error':
        this.calibrationError === null
          ? '--'
          : `${fmt(this.calibrationError * 100)}% of screen (left-right ${fmt(this.calibrationAxes.x * 100)}%, up-down ${fmt(this.calibrationAxes.y * 100)}%; corner stretch ×${fmt(this.calibrationAxes.stretchX, 2)} / ×${fmt(this.calibrationAxes.stretchY, 2)})`,
      'Blinks / min': String(this.selection.blinkRate(performance.now())),
      'Dwell time': `${this.selection.dwellMs} ms`,
      'Pulse buffer': `${fmt(e?.bufferedSeconds, 1)} s`,
      'Pulse SNR': `${fmt(e?.hrSnrDb, 1)} dB`,
      'Camera HR': `${fmt(e?.hr)} bpm (${e?.quality ?? '--'})`,
      'Breathing (exp.)': `${fmt(e?.rr)} /min (${e?.rrQuality ?? '--'})`,
      Baseline: this.monitor.baseline === null ? 'learning…' : `${fmt(this.monitor.baseline)} bpm`,
      'Monitor state': this.monitor.state,
      'Screen sleeps after': this.#sleepMetric(),
      Timings: this.fastTimings ? 'fast demo' : 'clinical',
    });
  }

  #sleepMetric() {
    const delay = this.sleepDelay();
    const idle = Math.round((Date.now() - this.lastActivity) / 1000);
    return delay === null ? 'never (urgent alert open)' : `${Math.round(delay / 1000)} s idle (now ${idle} s)`;
  }

  #loadPredictor() {
    const predictor = new PhrasePredictor();
    const saved = loadJson(PREDICTOR_KEY);
    if (saved) predictor.load(saved);
    else seedPredictor(predictor);
    return predictor;
  }

  #renderStaticIcons() {
    for (const element of document.querySelectorAll('[data-icon]')) {
      element.replaceChildren(icon(element.dataset.icon, 18));
    }
  }

  /** Fills the camera list on the start screen; remembers the last choice. */
  async #fillCameras() {
    const select = $('camera-select');
    // Before the first camera permission the browser hides camera ids: list nothing then.
    const cameras = (await listCameras().catch(() => [])).filter((c) => c.id);
    const saved = loadJson(CAMERA_KEY);
    select.replaceChildren(new Option('Default camera', ''), ...cameras.map((c) => new Option(c.label, c.id)));
    if (saved && cameras.some((c) => c.id === saved)) select.value = saved;
    $('camera-row').hidden = cameras.length < 2 && !saved;
  }

  #bindUi() {
    this.#fillCameras();
    navigator.mediaDevices?.addEventListener?.('devicechange', () => this.#fillCameras());
    $('start-camera').addEventListener('click', () => {
      unlockAudio();
      this.startCamera();
    });
    $('start-manual').addEventListener('click', () => {
      unlockAudio();
      this.startManual();
    });
    $('link-pill').addEventListener('click', () => this.#showPairing());
    $('pair-close').addEventListener('click', () => ($('pair-overlay').hidden = true));
    $('validation-form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.logValidation(Number($('reference-bpm').value));
      $('reference-bpm').value = '';
    });

    window.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'd') this.devPanel.toggle();
      else if (key === 'g') this.toggleCursor();
      else if (key === 's') this.toggleStress();
      else if (key === 'b') this.setBaselineNow();
      else if (key === 'c') this.startCalibration();
      else if (key === 'p') this.#showPairing();
      else if (key === 'escape') {
        $('pair-overlay').hidden = true;
        if (this.devPanel.open) this.devPanel.toggle();
      }
    });
  }
}

/** Smooth pulse-like curve for the simulated stress scenario's display. */
function syntheticWave(now, hr) {
  const beatsPerSecond = (hr ?? 72) / 60;
  return Array.from({ length: 180 }, (_, i) => {
    const phase = (((now / 1000 - (180 - i) / 30) * beatsPerSecond) % 1 + 1) % 1;
    return Math.exp(-((phase - 0.2) ** 2) / 0.004) * 0.9 + Math.exp(-((phase - 0.45) ** 2) / 0.01) * 0.3 - 0.3;
  });
}

window.__3ayni = new BedsideApp(); // reachable from the browser console for debugging
