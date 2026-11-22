// Scenes for "3ayni, through his eyes": the camera is Am Hédi's eye.

(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const stage = $('.stage');
  const room = $('#room');
  const roomDim = $('#room-dim');
  const guide = $('#guide');
  const subtitle = $('#subtitle');

  Eye.build(stage);

  // ---- Karim's positions. x and y move the 475x820 figure; s scales it from his feet.
  const SPOTS = {
    off: { x: 1800, y: 0, s: 1, flip: 1 },
    right: { x: 1030, y: 30, s: 1, flip: 1 },
    left: { x: 140, y: 30, s: 1, flip: -1 },
    'edge-right': { x: 1190, y: 70, s: 0.92, flip: 1 },
    near: { x: 597, y: 560, s: 1.75, flip: 1 },
    center: { x: 812, y: 200, s: 1.3, flip: 1 },
    rush: { x: 784, y: 395, s: 1.55, flip: 1 },
  };
  let spot = 'off';
  let walkTimer = null;

  function moveGuide(name, { fast = false } = {}) {
    const to = SPOTS[name] ?? SPOTS.off;
    const from = SPOTS[spot];
    guide.classList.toggle('fast', fast);
    const distance = Math.abs(to.x - from.x);
    if (distance > 120) {
      guide.classList.add('walking');
      clearTimeout(walkTimer);
      walkTimer = setTimeout(() => guide.classList.remove('walking'), fast ? 700 : 1250);
    }
    guide.style.setProperty('--gx', `${to.x}px`);
    guide.style.setProperty('--gy', `${to.y}px`);
    guide.style.setProperty('--gs', to.s);
    guide.style.setProperty('--gflip', to.flip);
    stage.classList.toggle('focus-near', name === 'near' || name === 'rush' || name === 'center');
    spot = name;
  }

  // ---- What the eye looks at: a small gaze shift of the room, and how dark it reads.
  function look(slide) {
    room.style.setProperty('--look', `${Number(slide.dataset.look ?? 0)}px`);
    roomDim.style.opacity = slide.dataset.dim ?? '0.5';
  }

  function showSubtitle(slide, force = false) {
    const ar = slide?.dataset.subAr;
    const deferred = slide && slide.id === 'demo';
    if (!ar || (deferred && !force)) {
      subtitle.classList.remove('is-on');
      guide.classList.remove('talking');
      return;
    }
    $('#sub-ar').textContent = ar;
    $('#sub-en').textContent = slide.dataset.subEn ?? '';
    subtitle.classList.add('is-on');
    if (spot !== 'off') guide.classList.add('talking');
  }

  // ---- Slide changes happen during a blink. From the cover, we dive into the pupil.
  Deck.transition = async (from, to, apply) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    if (from.id === 'cover') {
      from.classList.add('entering-eye');
      await wait(1050);
      Eye.closeNow();
      Eye.show(true);
      apply();
      from.classList.remove('entering-eye');
      await wait(500);
      await Eye.openSlowly(1600);
      return;
    }
    if (to.id === 'cover') {
      Eye.show(false);
      apply();
      return;
    }
    await Eye.through(apply);
  };

  const hooks = {};
  const scene = (id, h) => (hooks[id] = h);

  // ---- He hears everything
  scene('silence', {});

  // ---- Karim asks for a blink; the click makes the eye blink once, slowly
  scene('ask', {
    step(s, n) {
      if (n >= 1) {
        subtitle.classList.remove('is-on');
        guide.classList.remove('talking');
        setTimeout(() => Eye.blink({ close: 220, hold: 320, open: 380 }), 150);
      }
    },
  });

  // ---- Today's options, lived from inside his eye

  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Karim says a line: Darija subtitle with its English translation. */
  function say(ar, en) {
    if (!ar) {
      subtitle.classList.remove('is-on');
      guide.classList.remove('talking');
      return;
    }
    $('#sub-ar').textContent = ar;
    $('#sub-en').textContent = en;
    subtitle.classList.add('is-on');
    guide.classList.toggle('talking', spot !== 'off');
  }

  /** Two blinks: "no" in a blink code. Waits for a spontaneous blink to end first. */
  async function blinkNo() {
    for (let i = 0; i < 2; i++) {
      await pause(i === 0 ? 120 : 160);
      await Eye.blink({ close: 110, hold: 90, open: 200 });
    }
  }

  // Blink codes: each click, Am Hédi answers "no" and Karim tries another guess.
  const GUESSES = [
    ['تحب تشرب؟', 'Do you want to drink?'],
    ['نطفيلك الضو؟', 'Shall I turn off the light?'],
    ['نقلبك على جنبك؟', 'Shall I turn you on your side?'],
    ['مالا ارتاح، نرجعلك بعد.', 'Then rest. I will come back later.'],
  ];
  let guessStep = 0;
  scene('guess', {
    enter() {
      guessStep = 0;
      setTimeout(() => say(...GUESSES[0]), 900);
    },
    async step(s, n) {
      const forward = n > guessStep;
      guessStep = n;
      if (n === 0) return say(...GUESSES[0]);
      if (n <= 3) {
        if (forward) {
          say(null);
          await blinkNo();
          await pause(350);
        }
        if (guessStep !== n) return; // moved on meanwhile
        say(...GUESSES[n]);
        if (n === 3) setTimeout(() => guessStep === 3 && moveGuide('off'), 1800);
        else moveGuide('near');
      } else {
        say(null);
        moveGuide('off');
      }
    },
    leave() {
      say(null);
    },
  });

  // Letter board: partner-assisted scanning spells "PAIN", row then letter.
  const ROWS = ['ABCDEF', 'GHIJKL', 'MNOPQR', 'STUVWX', 'YZ.,?!'];
  const WORD = 'PAIN';
  const SIM_STEP_S = 1.5; // Karim reads one row or one letter about every 1.5 s
  const SPEEDUP = 6;
  const eboard = $('#eboard');
  eboard.innerHTML = ROWS.map((row) => `<div class="eboard-row">${[...row].map((c) => `<span>${c}</span>`).join('')}</div>`).join('');
  const rowEls = [...eboard.querySelectorAll('.eboard-row')];
  let scanRun = 0;

  async function spell() {
    const run = ++scanRun;
    let simSeconds = 0;
    const alive = () => run === scanRun;
    const tick = async () => {
      await pause((SIM_STEP_S * 1000) / SPEEDUP);
      simSeconds += SIM_STEP_S;
      const m = Math.floor(simSeconds / 60);
      $('#clock').textContent = `${m}:${String(Math.floor(simSeconds % 60)).padStart(2, '0')}`;
    };
    const clear = () => eboard.querySelectorAll('.is-scan, .is-chosen').forEach((el) => el.classList.remove('is-scan', 'is-chosen'));
    $('#spelled').textContent = '';
    $('#clock').textContent = '0:00';
    clear();
    await pause(1600);
    for (const letter of WORD) {
      const r = ROWS.findIndex((row) => row.includes(letter));
      const c = ROWS[r].indexOf(letter);
      for (let i = 0; i <= r; i++) {
        if (!alive()) return;
        rowEls.forEach((el, k) => el.classList.toggle('is-scan', k === i));
        await tick();
      }
      Eye.blink({ close: 100, hold: 120, open: 200 });
      await tick();
      const cells = [...rowEls[r].children];
      for (let i = 0; i <= c; i++) {
        if (!alive()) return;
        cells.forEach((el, k) => el.classList.toggle('is-scan', k === i));
        await tick();
      }
      Eye.blink({ close: 100, hold: 120, open: 200 });
      cells[c].classList.add('is-chosen');
      await tick();
      if (!alive()) return;
      $('#spelled').textContent += letter;
      clear();
    }
  }

  scene('letters', {
    enter() {
      spell();
    },
    leave() {
      scanRun++;
    },
  });

  // Call button and monitor: the button does nothing, the monitor races.
  let monitorTrace = null;
  const callButton = $('#call-button');
  const callHint = $('#call-hint');
  callButton.addEventListener('click', () => {
    callButton.classList.remove('is-tried');
    void callButton.offsetWidth; // restart the refusal shake
    callButton.classList.add('is-tried');
    callHint.textContent = 'Nothing happens. His hand cannot move.';
    callHint.classList.add('is-tried');
  });
  scene('button', {
    enter() {
      monitorTrace ??= ecg($('#monitor-trace'), { color: '#3ccf7a', glow: 'rgba(60,207,122,0.45)', bpm: 104, line: 2.5 });
      callHint.textContent = 'Try to press it.';
      callHint.classList.remove('is-tried');
      if (Deck.autoplay) setTimeout(() => callButton.click(), 6000);
    },
  });

  // ---- How it works: his heartbeat as a red trace
  let trace = null;
  scene('how', {
    enter() {
      trace ??= ecg($('#how-trace'), { color: '#e0324a', glow: 'rgba(224,50,74,0.5)', bpm: 72, line: 3 });
    },
  });

  // ---- Demo: heart rate climbs, the alarm turns the room red, Karim runs in
  let timer = null;
  scene('demo', {
    enter(s) {
      s.classList.remove('alert-on');
      stage.classList.remove('alarm');
      clearInterval(timer);
      let hr = 72;
      $('#demo-hr').textContent = hr;
      $('#demo-state').textContent = 'within his usual range';
      setTimeout(() => {
        timer = setInterval(() => {
          hr += 1;
          $('#demo-hr').textContent = hr;
          if (hr >= 92) $('#demo-state').textContent = 'rising';
          if (hr >= 106) {
            clearInterval(timer);
            s.classList.add('alert-on');
            stage.classList.add('alarm');
            setTimeout(() => moveGuide('rush', { fast: true }), 500);
            setTimeout(() => showSubtitle(s, true), 1300);
          }
        }, 150);
      }, 1800);
    },
    leave() {
      clearInterval(timer);
      stage.classList.remove('alarm');
    },
  });

  // ---- Figures roll up once per visit
  scene('proof', {
    enter(s) {
      s.querySelectorAll('[data-count]').forEach((el, i) =>
        setTimeout(() => countUp(el, Number(el.dataset.count), { prefix: el.dataset.prefix ?? '', suffix: el.dataset.suffix ?? '', duration: 1600 }), 600 + i * 160),
      );
    },
  });

  // ---- Closing: one click and the eye closes for good
  scene('close', {
    step(s, n) {
      if (n >= 1) {
        subtitle.classList.remove('is-on');
        guide.classList.remove('talking');
        Eye.closeSlowly(2400);
      } else if (Eye.closed) {
        Eye.openSlowly(1200);
      }
    },
  });

  document.querySelectorAll('.slide').forEach((slide) => {
    const h = hooks[slide.id] ?? {};
    Deck.scene(slide.id, {
      enter(s) {
        look(s);
        showSubtitle(s);
        // He moves once the eye is open again.
        setTimeout(() => {
          moveGuide(s.dataset.guide ?? 'off');
          guide.classList.toggle('talking', subtitle.classList.contains('is-on') && spot !== 'off');
        }, s.id === 'silence' ? 0 : 280);
        h.enter?.(s);
      },
      step: h.step,
      leave: h.leave,
    });
  });

  Deck.start();
  // A deck opened directly on an inside slide starts with the eye open.
  if (location.hash && location.hash !== '#1') {
    Eye.closeNow();
    Eye.show(true);
    Eye.openSlowly(900);
  }
})();
