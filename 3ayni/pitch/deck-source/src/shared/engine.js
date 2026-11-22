// Minimal slide engine shared by both 3ayni presentations.
//
//   <section class="slide" id="intro" data-notes="..." data-auto="8"> ... <div class="step">...</div> </section>
//
// Keys: → / Space / Page Down next · ← / Page Up back · Home / End
//       N speaker notes · T talk timer · A auto-play · F fullscreen
// Elements with class "step" appear one by one (class "on"). Scenes can hook in:
//   Deck.scene('intro', { enter(slide), leave(slide), step(slide, index) })

(function () {
  const STAGE_W = 1600;
  const STAGE_H = 900;
  const TALK_SECONDS = 240;

  const scenes = {};
  const state = { index: 0, step: 0, autoplay: false, timerStart: null, autoTimer: null };
  let slides = [];
  let stage;

  function fitStage() {
    const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  function stepsOf(slide) {
    return [...slide.querySelectorAll('.step')];
  }

  function render(direction) {
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === state.index);
      slide.classList.toggle('is-before', i < state.index);
      slide.classList.toggle('is-after', i > state.index);
      slide.setAttribute('aria-hidden', String(i !== state.index));
    });
    const current = slides[state.index];
    stepsOf(current).forEach((el, i) => el.classList.toggle('on', i < state.step));
    document.documentElement.style.setProperty('--progress', String((state.index + 1) / slides.length));
    document.getElementById('deck-counter').textContent = `${state.index + 1} / ${slides.length}`;
    document.getElementById('deck-notes-text').textContent = current.dataset.notes ?? '';
    if (location.hash !== `#${state.index + 1}`) history.replaceState(null, '', `#${state.index + 1}`);
    return direction;
  }

  // A deck may set Deck.transition(fromSlide, toSlide, apply) to stage the
  // change itself (here: the slide changes while the eyelids are closed).
  let changing = false;
  function goTo(index, step = 0) {
    const target = Math.max(0, Math.min(slides.length - 1, index));
    const changed = target !== state.index;
    if (changing) return;
    const apply = () => {
      if (changed) scenes[slides[state.index].id]?.leave?.(slides[state.index]);
      state.index = target;
      state.step = step;
      render();
      if (changed || step === 0) scenes[slides[target].id]?.enter?.(slides[target]);
      scheduleAuto();
    };
    if (changed && typeof window.Deck.transition === 'function') {
      changing = true;
      Promise.resolve(window.Deck.transition(slides[state.index], slides[target], apply)).finally(() => (changing = false));
    } else {
      apply();
    }
  }

  function next() {
    const current = slides[state.index];
    const total = stepsOf(current).length;
    if (state.step < total) {
      state.step += 1;
      render();
      scenes[current.id]?.step?.(current, state.step);
      scheduleAuto();
    } else if (state.index < slides.length - 1) {
      goTo(state.index + 1);
    }
  }

  function prev() {
    if (state.step > 0) {
      state.step -= 1;
      render();
      scenes[slides[state.index].id]?.step?.(slides[state.index], state.step);
    } else if (state.index > 0) {
      const previous = slides[state.index - 1];
      goTo(state.index - 1, stepsOf(previous).length);
    }
  }

  // ---- auto-play: each slide declares how long it needs (data-auto, seconds)
  function scheduleAuto() {
    clearTimeout(state.autoTimer);
    if (!state.autoplay) return;
    const slide = slides[state.index];
    const steps = stepsOf(slide).length + 1;
    const seconds = Number(slide.dataset.auto ?? 8);
    state.autoTimer = setTimeout(() => {
      if (state.index === slides.length - 1 && state.step >= stepsOf(slide).length) return;
      next();
    }, (seconds * 1000) / steps);
  }

  function toggleAutoplay() {
    state.autoplay = !state.autoplay;
    document.body.classList.toggle('is-autoplay', state.autoplay);
    toast(state.autoplay ? 'Auto-play on' : 'Auto-play off');
    scheduleAuto();
  }

  // ---- talk timer (4 minutes)
  function tickTimer() {
    const el = document.getElementById('deck-timer');
    if (state.timerStart === null) {
      el.textContent = '4:00';
      return;
    }
    const left = Math.max(0, TALK_SECONDS - Math.floor((Date.now() - state.timerStart) / 1000));
    el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    el.classList.toggle('is-late', left <= 30);
  }

  function toggleTimer() {
    const el = document.getElementById('deck-timer');
    const visible = el.classList.toggle('is-visible');
    if (visible && state.timerStart === null) state.timerStart = Date.now();
    if (!visible) state.timerStart = null;
    tickTimer();
  }

  function toast(text) {
    const el = document.getElementById('deck-toast');
    el.textContent = text;
    el.classList.add('is-visible');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('is-visible'), 1400);
  }

  function buildChrome() {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div class="deck-progress" aria-hidden="true"></div>
       <div class="deck-counter" id="deck-counter"></div>
       <div class="deck-timer" id="deck-timer" aria-live="off"></div>
       <div class="deck-toast" id="deck-toast" role="status"></div>
       <aside class="deck-notes" id="deck-notes" aria-label="Speaker notes"><strong>Speaker notes</strong><p id="deck-notes-text"></p>
         <small>→ next · ← back · N notes · T timer · A auto-play · F fullscreen</small></aside>`,
    );
  }

  function onKey(event) {
    if (event.target.closest?.('input, textarea')) return;
    const key = event.key;
    if (['ArrowRight', ' ', 'PageDown', 'Enter'].includes(key)) {
      event.preventDefault();
      next();
    } else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(key)) {
      event.preventDefault();
      prev();
    } else if (key === 'Home') goTo(0);
    else if (key === 'End') goTo(slides.length - 1);
    else if (key === 'n' || key === 'N') document.getElementById('deck-notes').classList.toggle('is-visible');
    else if (key === 't' || key === 'T') toggleTimer();
    else if (key === 'a' || key === 'A') toggleAutoplay();
    else if (key === 'f' || key === 'F') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    }
  }

  function start() {
    stage = document.querySelector('.stage');
    slides = [...document.querySelectorAll('.slide')];
    buildChrome();
    fitStage();
    window.addEventListener('resize', fitStage);
    document.addEventListener('keydown', onKey);
    stage.addEventListener('click', (event) => {
      if (event.target.closest('button, a, .interactive')) return;
      next();
    });
    setInterval(tickTimer, 500);
    const fromHash = Number(location.hash.slice(1)) - 1;
    state.index = Number.isInteger(fromHash) && fromHash >= 0 ? Math.min(fromHash, slides.length - 1) : 0;
    render();
    requestAnimationFrame(() => {
      document.body.classList.add('is-ready');
      scenes[slides[state.index].id]?.enter?.(slides[state.index]);
    });
  }

  window.Deck = {
    scene(id, hooks) {
      scenes[id] = hooks;
    },
    next,
    get autoplay() {
      return state.autoplay;
    },
    toast,
    start,
  };
})();

/** Counts a number up inside an element, e.g. countUp(el, 37, {suffix: ' %'}). */
window.countUp = function countUp(el, to, { from = 0, duration = 1400, decimals = 0, prefix = '', suffix = '' } = {}) {
  const startTime = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function frame(now) {
    const t = Math.min(1, (now - startTime) / duration);
    el.textContent = `${prefix}${(from + (to - from) * ease(t)).toFixed(decimals)}${suffix}`;
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};

/**
 * Draws a scrolling ECG trace on a canvas. Returns a controller to change the
 * heart rate; the caller decides colours.
 */
window.ecg = function ecg(canvas, { color = '#e5534b', glow = 'rgba(229,83,75,0.6)', bpm = 72, line = 3 } = {}) {
  const ctx = canvas.getContext('2d');
  const ratio = 2;
  const width = canvas.width;
  const height = canvas.height;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.scale(ratio, ratio);
  const points = new Array(Math.ceil(width)).fill(height / 2);
  let phase = 0;
  let rate = bpm;
  let running = true;
  let last = performance.now();

  // One heartbeat shape (P wave, QRS spike, T wave) as a function of phase 0..1.
  const beat = (p) =>
    0.08 * Math.exp(-((p - 0.18) ** 2) / 0.0012) -
    0.1 * Math.exp(-((p - 0.3) ** 2) / 0.00012) +
    0.95 * Math.exp(-((p - 0.33) ** 2) / 0.00018) -
    0.25 * Math.exp(-((p - 0.36) ** 2) / 0.00015) +
    0.18 * Math.exp(-((p - 0.58) ** 2) / 0.004);

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const speed = 160; // pixels per second
    const advance = Math.max(1, Math.round(speed * dt));
    for (let i = 0; i < advance; i++) {
      phase = (phase + rate / 60 / speed) % 1;
      points.shift();
      points.push(height / 2 - beat(phase) * height * 0.42);
    }
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = line;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    points.forEach((y, x) => (x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return {
    setRate(value) {
      rate = value;
    },
    stop() {
      running = false;
    },
  };
};
