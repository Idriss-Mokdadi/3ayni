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
import { BoardView } from './board/board-view.js';
import { PHRASES_BY_ID, SUGGESTIBLE_IDS } from './board/phrases.js';
import { FaceTracker } from './camera.js';
import { seedPredictor } from './care-routines.js';
import { DevPanel } from './devpanel.js';
import { CareMonitor, FAST_DEMO_RULES, RULES } from './fusion.js';
import { GazeCalibration } from './gaze/calibration.js';
import { eyeClosure, extractGazeFeatures } from './gaze/features.js';
import { OneEuroFilter } from './gaze/one-euro.js';
import { SelectionEngine } from './gaze/selection.js';
import { PhrasePredictor } from './predictor.js';
import { StressSimulator } from './simulation.js';
import { Speaker } from './speech.js';
import { ValidationLog } from './validation.js';
import { VitalsDisplay } from './vitals-display.js';
import { SkinSampler } from './vitals/roi.js';
import { VitalsEstimator } from './vitals/rppg.js';

const DWELL_NORMAL_MS = 1400;
const DWELL_SLOW_MS = 2200;
const PREDICTOR_KEY = '3ayni.predictor.v1';
const PREVIOUS_MESSAGE_WINDOW_MS = 10 * 60_000; // older messages no longer count as "previous"

const $ = (id) => document.getElementById(id);

class BedsideApp {
  constructor() {
    this.board = new BoardModel();
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
      this.tracker = new FaceTracker($('video'));
      await this.tracker.start();
      this.tracker.onFrame((frame) => this.onFrame(frame));
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
    this.setBanner('Manual mode', 'Click a tile or press 1 to 6');
  }

  startCalibration() {
    if (!this.tracker) {
      this.toast('Calibration needs the camera');
      return;
    }
    this.calibration = new GazeCalibration();
    this.gazeModel = null;
    this.view.setHover(null);
    $('calibration-overlay').hidden = false;
  }

  #finishCalibration() {
    const result = this.calibration.finish();
    this.calibration = null;
    if (!result.ok) {
      $('calibration-overlay').querySelector('.calibration-hint span:last-child').textContent =
        `${result.reason}. Keep your face in view; starting again…`;
      setTimeout(() => this.startCalibration(), 1500);
      return;
    }
    $('calibration-overlay').hidden = true;
    this.gazeModel = result.model;
    this.calibrationError = result.error;
    this.filterX.reset();
    this.filterY.reset();
    this.selection.reset(performance.now());
    if (result.error > 0.18) {
      this.setBanner('Calibration', 'Imprecise. Recalibrate from Settings if tiles are hard to reach', 'attention');
    } else {
      this.setBanner('Ready', 'Look at a tile to choose it');
    }
  }

  // ------------------------------------------------------------ per frame

  /** @param {import('./camera.js').FaceFrame} frame */
  onFrame(frame) {
    this.lastFrame = frame;
    const { t, landmarks, blendshapes } = frame;

    const skin = this.sampler.sample(frame.video, landmarks);
    this.estimator.push(Date.now(), skin?.rgb ?? null, skin?.motionY);

    const closure = landmarks ? eyeClosure(blendshapes) : 0;
    const features = landmarks && closure < 0.5 ? extractGazeFeatures(landmarks, blendshapes) : null;

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
    } else if (event.type === 'prompt') {
      this.board.ask(event.question);
      this.setBanner('Question', `${event.questionAr}  ·  ${event.question}`, 'question');
      playTone('question');
      this.renderBoard();
    }
  }

  // ------------------------------------------------------------ choosing a tile

  activate(index, via) {
    // Footer arrow / clear buttons
    if (index === 'footer:prev') {
      this.board.prevPage();
      this.view.flash('footer:prev');
      this.renderBoard();
      return;
    }
    if (index === 'footer:next') {
      this.board.nextPage();
      this.view.flash('footer:next');
      this.renderBoard();
      return;
    }
    if (index === 'footer:clear') {
      this.board.clearTiles();
      this.view.flash('footer:clear');
      this.renderBoard();
      return;
    }

    const tile = this.tiles[index];
    if (!tile || tile.kind === 'empty') return;
    const now = Date.now();
    this.view.flash(index);
    this.monitor.noteInteraction(now);
    const action = this.board.select(tile);

    if (action.kind === 'say') this.#say(action.phraseId, action.answeredQuestion, now);
    else if (action.kind === 'control') this.#runControl(action.name);

    this.renderBoard();
    console.debug(`selected ${tile.key} via ${via}`);
  }

  #say(phraseId, answeredQuestion, now) {
    const phrase = PHRASES_BY_ID.get(phraseId);
    this.speaker.speak(phrase);

    const previousId = this.#previousMessageId(now);
    if (SUGGESTIBLE_IDS.includes(phraseId)) {
      this.predictor.observe(phraseId, { previousId, hour: new Date().getHours() });
      saveJson(PREDICTOR_KEY, this.predictor);
    }
    this.lastMessage = { id: phraseId, at: now };

    const { urgency, alert } = this.monitor.assessMessage(now, phrase);
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

  #runControl(name) {
    switch (name) {
      case 'repeat':
        if (this.lastMessage) this.speaker.speak(PHRASES_BY_ID.get(this.lastMessage.id));
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
    this.selection.dwellMs = this.fatigued || this.board.settings.slowSelection ? DWELL_SLOW_MS : DWELL_NORMAL_MS;
  }

  renderBoard() {
    const suggestions = this.predictor.suggest({
      previousId: this.#previousMessageId(Date.now()),
      hour: new Date().getHours(),
      distress: this.monitor.distressed,
    });
    this.tiles = this.board.tiles(suggestions);
    this.view.render(this.tiles);

    // Footer — only shown when caregiver has set tiles
    const hasCaregiverTiles = !!this.board.caregiverTiles;
    this.view.renderFooter({
      show: hasCaregiverTiles,
      hasPrev: this.board.caregiverPage > 0,
      hasNext: this.board.caregiverPage < this.board.caregiverPageCount - 1,
      page: this.board.caregiverPage,
      pageCount: this.board.caregiverPageCount,
    });

    this.selection.reset(performance.now());
    if (this.board.screen.name !== 'question' && $('banner').dataset.tone === 'question') {
      this.setBanner('Ready', 'Look at a tile to choose it');
    }
  }

  #previousMessageId(now) {
    return this.lastMessage && now - this.lastMessage.at < PREVIOUS_MESSAGE_WINDOW_MS ? this.lastMessage.id : null;
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
      onStatus: (online) => this.#setLinkState(online ? 'online' : 'offline', online ? 'Relay connected' : 'Reconnecting'),
    });
  }

  #onRelayEvent(event) {
    if (event.type === 'question') {
      this.board.ask(event.payload.text);
      this.setBanner('Question', event.payload.text, 'question');
      playTone('question');
      this.renderBoard();
    } else if (event.type === 'set-tiles') {
      this.board.setTiles(event.payload.phraseIds);
      this.setBanner('Caregiver', 'الممرض اختار ليك  ·  Caregiver set your choices', 'question');
      playTone('question');
      this.renderBoard();
    } else if (event.type === 'ack') {
      this.setBanner('Caregiver', 'جايين ليك  ·  Help is on the way', null);
      this.toast('Your caregiver has seen your message');
    }
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
      'Calibration error': this.calibrationError === null ? '--' : `${fmt(this.calibrationError * 100)}% of screen`,
      'Blinks / min': String(this.selection.blinkRate(performance.now())),
      'Dwell time': `${this.selection.dwellMs} ms`,
      'Pulse buffer': `${fmt(e?.bufferedSeconds, 1)} s`,
      'Pulse SNR': `${fmt(e?.hrSnrDb, 1)} dB`,
      'Camera HR': `${fmt(e?.hr)} bpm (${e?.quality ?? '--'})`,
      'Breathing (exp.)': `${fmt(e?.rr)} /min (${e?.rrQuality ?? '--'})`,
      Baseline: this.monitor.baseline === null ? 'learning…' : `${fmt(this.monitor.baseline)} bpm`,
      'Monitor state': this.monitor.state,
      Timings: this.fastTimings ? 'fast demo' : 'clinical',
    });
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

  #bindUi() {
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

new BedsideApp();
