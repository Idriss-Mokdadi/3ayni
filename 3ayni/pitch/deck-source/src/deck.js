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
    const deferred = slide && ['demo', 'try'].includes(slide.id);
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

  // ---- Try it: the product's own board; the mouse is his gaze
  const TILES = [
    { ar: 'نحب نشرب', en: 'I want to drink' },
    { ar: 'يوجعني', en: 'I am in pain', reply: true },
    { ar: 'عيطولي للفرملي', en: 'Call the nurse', reply: true },
    { ar: 'إيه', en: 'Yes' },
    { ar: 'لا', en: 'No' },
    { ar: 'أكثر', en: 'More' },
  ];
  const DWELL = 1200;
  const board = $('#board');
  board.innerHTML = TILES.map(
    (t, i) => `<button class="app-tile" style="--i:${i}" data-i="${i}" type="button">
      <b lang="ar">${t.ar}</b><span>${t.en}</span>
      <svg viewBox="0 0 60 60" aria-hidden="true"><circle class="track" cx="30" cy="30" r="26"/><circle class="fill" cx="30" cy="30" r="26"/></svg>
    </button>`,
  ).join('');
  const tiles = [...board.querySelectorAll('.app-tile')];
  let hovered = null;
  let since = 0;
  let frame = null;

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith('ar'));
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? 'ar';
    u.rate = 0.9;
    speechSynthesis.speak(u);
  }

  function hover(i) {
    if (hovered === i) return;
    tiles.forEach((t) => {
      t.classList.remove('is-hover');
      $('.fill', t).style.strokeDashoffset = 163.4;
    });
    hovered = i;
    since = performance.now();
    if (i !== null) tiles[i].classList.add('is-hover');
  }

  function pick(i) {
    tiles[i].classList.add('is-picked');
    setTimeout(() => tiles[i].classList.remove('is-picked'), 600);
    speak(TILES[i].ar);
    if (TILES[i].reply) {
      moveGuide('right');
      showSubtitle($('#try'), true);
    }
    since = performance.now() + 900;
  }

  function loop(now) {
    if (hovered !== null) {
      const p = Math.max(0, (now - since) / DWELL);
      $('.fill', tiles[hovered]).style.strokeDashoffset = 163.4 * (1 - Math.min(1, p));
      if (p >= 1) pick(hovered);
    }
    frame = requestAnimationFrame(loop);
  }

  board.addEventListener('pointermove', (e) => {
    const tile = e.target.closest('.app-tile');
    hover(tile ? Number(tile.dataset.i) : null);
  });
  board.addEventListener('pointerleave', () => hover(null));
  board.addEventListener('click', (e) => {
    const tile = e.target.closest('.app-tile');
    if (tile) pick(Number(tile.dataset.i));
  });

  scene('try', {
    enter() {
      hover(null);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(loop);
      if (Deck.autoplay) setTimeout(() => hover(1), 1800);
    },
    leave() {
      cancelAnimationFrame(frame);
      hover(null);
      if ('speechSynthesis' in window) speechSynthesis.cancel();
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
