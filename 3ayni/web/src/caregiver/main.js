// Caregiver dashboard (phone). Receives the patient's messages, alerts and
// vital signs from the relay, and sends yes/no questions and acknowledgements.

import '../styles/caregiver.css';
import { RelayLink } from '../shared/link.js';
import { playTone, unlockAudio } from '../shared/sound.js';
import { CATEGORIES, PHRASES } from '../patient/board/phrases.js';

const HOME_SLOTS = 6;
const CUSTOM = '__custom';

const TREND_WINDOW_MS = 10 * 60_000;
const QUESTIONS = ['Are you in pain?', 'Are you thirsty?', 'Are you cold?', 'Do you want to sleep?', 'Do you want to change position?'];
const STATE_LABELS = {
  calibrating: 'Learning baseline',
  normal: 'Within personal range',
  elevated: 'Heart rate elevated',
  paused: 'Monitoring paused',
};
const QUALITY_LABELS = { good: 'Good signal', fair: 'Fair signal', poor: 'Weak signal', none: 'No signal' };

const $ = (id) => document.getElementById(id);

class CaregiverApp {
  constructor(token) {
    this.trend = [];
    this.baseline = null;
    this.activeAlert = null;
    this.lastMessageTs = null;
    this.soundEnabled = false;
    this.historyItems = [];

    this.#buildQuestionChips();
    this.#buildBoardForm();
    this.#bindUi();
    this.link = new RelayLink({
      role: 'caregiver',
      token,
      onEvent: (event) => this.onEvent(event),
      onStatus: (online) => !online && this.#setPresence(false, 'Relay offline'),
    });
    setInterval(() => this.#refreshTimes(), 15_000);
    window.addEventListener('resize', () => this.#drawTrend());
  }

  onEvent(event) {
    switch (event.type) {
      case 'history':
        for (const past of event.payload.events) this.onEvent({ ...past, replay: true });
        if (event.payload.lastVitals) this.onEvent(event.payload.lastVitals);
        this.#restoreOpenAlert(event.payload.events);
        break;
      case 'presence':
        // A bedside screen that (re)connects starts a new monitoring session.
        if (event.payload.patientOnline && this.patientOnline === false) this.#resetVitals();
        this.patientOnline = event.payload.patientOnline;
        this.#setPresence(event.payload.patientOnline, event.payload.patientOnline ? 'Patient screen online' : 'Patient screen offline');
        break;
      case 'message':
        this.#showMessage(event);
        this.#addHistory(event.ts, 'message', `${event.payload.text}`, event.payload.urgency);
        // Routine messages get a soft chime; attention/urgent ones arrive with their own alert.
        if (!event.replay && event.payload.urgency === 'routine' && this.soundEnabled) playTone('question');
        break;
      case 'alert':
        this.#addHistory(event.ts, 'alert', event.payload.reason, event.payload.level);
        if (!event.replay) this.#raiseAlert(event);
        break;
      case 'vitals':
        this.#showVitals(event);
        break;
      case 'status':
        if (event.payload.baseline !== undefined && event.payload.baseline !== null) this.baseline = event.payload.baseline;
        if (event.payload.reason && ['elevated', 'normal', 'paused'].includes(event.payload.state)) {
          this.#addHistory(event.ts, 'status', event.payload.reason);
        }
        break;
      case 'question':
        this.#addHistory(event.ts, 'question', `Asked: ${event.payload.text}`);
        break;
      case 'board-state':
        this.#fillBoardForm(event.payload);
        $('board-status').textContent = 'In sync with the bedside';
        break;
      case 'board':
        this.#addHistory(event.ts, 'status', 'Home phrases changed by a caregiver');
        break;
      case 'ack':
        this.#addHistory(event.ts, 'ack', 'Alert acknowledged');
        if (this.activeAlert?.payload.id === event.payload.alertId) this.#clearAlert();
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- views

  #showMessage(event) {
    const { payload, ts } = event;
    $('message-ar').textContent = payload.ar ?? '';
    $('message-en').textContent = payload.text;
    $('message-card').dataset.urgency = payload.urgency;
    this.lastMessageTs = ts;
    this.#refreshTimes();
  }

  #showVitals({ ts, payload }) {
    const { hr, rr, quality, simulated, state } = payload;
    if ('baseline' in payload) this.baseline = payload.baseline; // the bedside is the source of truth
    setNumber($('hr'), hr);
    setNumber($('rr'), rr);
    $('sim-tag').hidden = !simulated;
    $('quality-dot').dataset.state = quality;
    $('quality-text').textContent = QUALITY_LABELS[quality] ?? quality;
    $('hr-detail').textContent =
      hr && this.baseline
        ? `Baseline ${this.baseline} bpm · ${formatDelta(hr / this.baseline)}`
        : this.baseline
          ? `Baseline ${this.baseline} bpm`
          : 'Learning personal baseline';
    if (state) {
      $('state-chip').dataset.state = state;
      $('state-chip').textContent = STATE_LABELS[state] ?? state;
    }

    if (hr !== null) this.trend.push({ t: ts, hr });
    const cutoff = ts - TREND_WINDOW_MS;
    while (this.trend.length && this.trend[0].t < cutoff) this.trend.shift();
    this.#drawTrend();
  }

  #drawTrend() {
    const canvas = $('trend');
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);

    const styles = getComputedStyle(document.documentElement);
    const color = (name) => styles.getPropertyValue(name).trim();
    const values = this.trend.map((p) => p.hr);
    const lo = Math.min(50, ...values, this.baseline ?? 70) - 5;
    const hi = Math.max(110, ...values, this.baseline ?? 70) + 5;
    const now = this.trend.at(-1)?.t ?? Date.now();
    const x = (t) => width - ((now - t) / TREND_WINDOW_MS) * width;
    const y = (v) => height - ((v - lo) / (hi - lo)) * height;

    ctx.strokeStyle = color('--line');
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, height - 0.5);
    ctx.lineTo(width, height - 0.5);
    ctx.stroke();

    if (this.baseline) {
      ctx.strokeStyle = color('--text-faint');
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y(this.baseline));
      ctx.lineTo(width, y(this.baseline));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (this.trend.length < 2) return;
    ctx.strokeStyle = color('--urgent');
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    this.trend.forEach((p, i) => (i === 0 ? ctx.moveTo(x(p.t), y(p.hr)) : ctx.lineTo(x(p.t), y(p.hr))));
    ctx.stroke();
  }

  #raiseAlert(event) {
    // An urgent alert is never replaced by a lesser one.
    if (this.activeAlert?.payload.level === 'urgent' && event.payload.level !== 'urgent') return;
    this.activeAlert = event;
    const card = $('alert-card');
    card.dataset.level = event.payload.level;
    $('alert-level').textContent = event.payload.level === 'urgent' ? 'Urgent' : 'Attention';
    $('alert-reason').textContent = event.payload.reason;
    $('alert-time').textContent = clock(event.ts);
    card.hidden = false;
    this.#notify(event.payload.level, true);
  }

  /** After a reload, show the latest alert nobody has acknowledged yet (if recent). */
  #restoreOpenAlert(events) {
    const acknowledged = new Set(events.filter((e) => e.type === 'ack').map((e) => e.payload.alertId));
    const open = events.filter((e) => e.type === 'alert' && !acknowledged.has(e.payload.id) && Date.now() - e.ts < 30 * 60_000);
    const latest = open.findLast((e) => e.payload.level === 'urgent') ?? open.at(-1);
    if (!latest) return;
    this.activeAlert = latest;
    const card = $('alert-card');
    card.dataset.level = latest.payload.level;
    $('alert-level').textContent = latest.payload.level === 'urgent' ? 'Urgent' : 'Attention';
    $('alert-reason').textContent = latest.payload.reason;
    $('alert-time').textContent = clock(latest.ts);
    card.hidden = false;
  }

  #resetVitals() {
    this.trend = [];
    this.baseline = null;
    setNumber($('hr'), null);
    setNumber($('rr'), null);
    $('hr-detail').textContent = 'Learning personal baseline';
    $('state-chip').dataset.state = 'calibrating';
    $('state-chip').textContent = STATE_LABELS.calibrating;
    this.#drawTrend();
  }

  #clearAlert() {
    this.activeAlert = null;
    $('alert-card').hidden = true;
  }

  #notify(level, vibrate) {
    if (this.soundEnabled) playTone(level === 'urgent' ? 'urgent' : 'attention');
    if (vibrate && 'vibrate' in navigator) navigator.vibrate(level === 'urgent' ? [250, 120, 250, 120, 250] : [200]);
  }

  #addHistory(ts, kind, text, level = '') {
    this.historyItems.unshift({ ts, kind, text, level });
    this.historyItems.length = Math.min(this.historyItems.length, 60);
    const items = this.historyItems.map((item) => {
      const li = document.createElement('li');
      const time = document.createElement('time');
      time.dateTime = new Date(item.ts).toISOString();
      time.textContent = clock(item.ts);
      const span = document.createElement('span');
      span.dataset.kind = item.kind;
      if (item.level) span.dataset.level = item.level;
      span.textContent = item.text;
      li.append(time, span);
      return li;
    });
    $('history').replaceChildren(...items);
  }

  #setPresence(online, text) {
    $('patient-dot').dataset.state = online ? 'online' : 'offline';
    $('patient-text').textContent = text;
  }

  #refreshTimes() {
    if (this.lastMessageTs) $('message-time').textContent = relativeTime(this.lastMessageTs);
  }

  // ---------------------------------------------------------------- input

  #buildQuestionChips() {
    const chips = QUESTIONS.map((text) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip';
      button.textContent = text;
      button.addEventListener('click', () => this.#ask(text));
      return button;
    });
    $('question-chips').replaceChildren(...chips);
  }

  /** Six pickers: a phrase from the catalogue, or the nurse's own words. */
  #buildBoardForm() {
    const groups = [...CATEGORIES.filter((c) => c.id !== 'controls'), { id: 'answers', en: 'Answers' }];
    const slots = Array.from({ length: HOME_SLOTS }, (_, i) => {
      const row = document.createElement('div');
      row.className = 'board-slot';
      const label = document.createElement('label');
      label.textContent = `Tile ${i + 1}`;
      label.htmlFor = `slot-${i}`;
      const select = document.createElement('select');
      select.id = `slot-${i}`;
      for (const group of groups) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group.en;
        for (const phrase of PHRASES.filter((p) => p.category === group.id)) {
          optgroup.append(new Option(`${phrase.en} · ${phrase.ar}`, phrase.id));
        }
        select.append(optgroup);
      }
      select.append(new Option('Own words…', CUSTOM));
      const input = document.createElement('input');
      input.maxLength = 60;
      input.placeholder = 'Your words, in Darija or French';
      input.hidden = true;
      select.addEventListener('change', () => (input.hidden = select.value !== CUSTOM));
      row.append(label, select, input);
      return row;
    });
    $('board-slots').replaceChildren(...slots);
    $('board-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const home = slots.map((row) => {
        const select = row.querySelector('select');
        const text = row.querySelector('input').value.trim();
        return select.value === CUSTOM ? (text ? { text } : { id: 'yes' }) : { id: select.value };
      });
      this.link.send('board', { home, alphabet: $('board-alphabet').value });
      this.#addHistory(Date.now(), 'status', 'You changed the home phrases');
      $('board-status').textContent = 'Sent';
    });
  }

  #fillBoardForm({ home, alphabet }) {
    home.forEach((item, i) => {
      const select = $(`slot-${i}`);
      const input = select?.parentElement.querySelector('input');
      if (!select) return;
      select.value = item.id ?? CUSTOM;
      input.value = item.text ?? '';
      input.hidden = select.value !== CUSTOM;
    });
    $('board-alphabet').value = alphabet;
  }

  #ask(text) {
    const question = text.trim();
    if (!question) return;
    this.link.send('question', { text: question.slice(0, 120) });
    this.#addHistory(Date.now(), 'question', `Asked: ${question}`);
  }

  #bindUi() {
    $('ask-form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.#ask($('ask-input').value);
      $('ask-input').value = '';
    });
    $('alert-ack').addEventListener('click', () => {
      if (!this.activeAlert) return;
      this.link.send('ack', { alertId: this.activeAlert.payload.id });
      this.#addHistory(Date.now(), 'ack', 'You acknowledged the alert');
      this.#clearAlert();
    });
    $('sound-gate').hidden = false;
    $('sound-enable').addEventListener('click', () => {
      unlockAudio();
      this.soundEnabled = true;
      $('sound-gate').hidden = true;
      playTone('sent');
    });
  }
}

function setNumber(element, value) {
  element.textContent = value ?? '—';
  element.classList.toggle('is-empty', value === null || value === undefined);
}

function clock(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

function relativeTime(ts) {
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return clock(ts);
}

function formatDelta(ratio) {
  const percent = Math.round((ratio - 1) * 100);
  return `${percent >= 0 ? '+' : ''}${percent}% vs baseline`;
}

const token = decodeURIComponent(location.hash.slice(1));
if (!token) {
  $('pair-missing').hidden = false;
} else {
  new CaregiverApp(token);
}
