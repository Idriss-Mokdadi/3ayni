// Scenes for "Through His Eyes".

(function () {
  const $ = (selector, root = document) => root.querySelector(selector);

  // ---- characters and icons into their slots
  document.querySelectorAll('[data-character]').forEach((el, i) => {
    const kind = el.dataset.character;
    if (kind === 'bust') el.innerHTML = Characters.salmaBust({ id: `salma-${i}`, mood: 'talk' });
    if (kind === 'bust-small') el.innerHTML = Characters.salmaBust({ id: `salma-${i}` });
    if (kind === 'bed') el.innerHTML = Characters.patientInBed({ id: `patient-${i}` });
    if (kind === 'standing') el.innerHTML = Characters.salmaStanding({ id: `nurse-${i}` });
    if (kind === 'standing-calm') el.innerHTML = Characters.salmaStanding({ id: `nurse-${i}` });
  });
  document.querySelectorAll('[data-icon]').forEach((el) => {
    const size = el.closest('.flow') ? 40 : el.closest('.cards4') ? 36 : 28;
    el.innerHTML = icon(el.dataset.icon, size);
  });

  // ---- 1 · eyes open on the second step
  Deck.scene('open', {
    enter(slide) {
      slide.classList.remove('eyes-open');
    },
    step(slide, n) {
      slide.classList.toggle('eyes-open', n >= 2);
    },
  });

  // ---- 3 · try it: the mouse is the gaze
  const TILES = [
    { ar: 'نحب نشرب', en: 'I want to drink', icon: 'message' },
    { ar: 'يوجعني', en: 'I am in pain', icon: 'activity', urgency: 'attention', reply: true },
    { ar: 'عيطولي للفرملي', en: 'Call the nurse', icon: 'bell', urgency: 'attention', reply: true },
    { ar: 'إيه', en: 'Yes', icon: 'check' },
    { ar: 'لا', en: 'No', icon: 'minus' },
    { ar: 'أكثر', en: 'More', icon: 'grid' },
  ];
  const DWELL_MS = 1200;
  const board = $('#try-board');
  const cursor = $('#try-cursor');
  const reply = $('#try-reply');
  board.innerHTML = TILES.map(
    (t, i) => `<button class="try-tile" style="--i:${i}" data-i="${i}" ${t.urgency ? `data-urgency="${t.urgency}"` : ''}>
      ${icon(t.icon, 40)}<b lang="ar">${t.ar}</b><span>${t.en}</span>
      <svg class="ring" viewBox="0 0 60 60"><circle class="track" cx="30" cy="30" r="26"/><circle class="fill" cx="30" cy="30" r="26"/></svg>
    </button>`,
  ).join('');
  const tiles = [...board.querySelectorAll('.try-tile')];
  let hovered = null;
  let hoverStart = 0;
  let dwellFrame = null;
  let autoCursor = null;

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith('ar'));
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? 'ar';
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  }

  function setHover(index) {
    if (hovered === index) return;
    tiles.forEach((t) => t.classList.remove('is-hover'));
    tiles.forEach((t) => ($('.fill', t).style.strokeDashoffset = 163.4));
    hovered = index;
    hoverStart = performance.now();
    if (index !== null) tiles[index].classList.add('is-hover');
  }

  function pick(index) {
    const tile = tiles[index];
    tile.classList.add('is-picked');
    setTimeout(() => tile.classList.remove('is-picked'), 600);
    speak(TILES[index].ar);
    if (TILES[index].reply) {
      reply.hidden = false;
      reply.style.animation = 'none';
      void reply.offsetWidth;
      reply.style.animation = '';
    }
    hoverStart = performance.now() + 900; // short pause before the ring refills
  }

  function dwellLoop(now) {
    if (hovered !== null) {
      const progress = Math.max(0, (now - hoverStart) / DWELL_MS);
      $('.fill', tiles[hovered]).style.strokeDashoffset = 163.4 * (1 - Math.min(progress, 1));
      if (progress >= 1) pick(hovered);
    }
    dwellFrame = requestAnimationFrame(dwellLoop);
  }

  function stageScale() {
    return document.querySelector('.stage').getBoundingClientRect().width / 1600;
  }

  function moveCursor(clientX, clientY) {
    const rect = document.querySelector('.stage').getBoundingClientRect();
    const scale = stageScale();
    cursor.style.transform = `translate(${(clientX - rect.left) / scale}px, ${(clientY - rect.top) / scale}px)`;
    cursor.classList.add('is-visible');
    const under = document.elementFromPoint(clientX, clientY)?.closest('.try-tile');
    setHover(under ? Number(under.dataset.i) : null);
  }

  board.addEventListener('pointermove', (e) => moveCursor(e.clientX, e.clientY));
  board.addEventListener('pointerleave', () => {
    setHover(null);
    cursor.classList.remove('is-visible');
  });
  board.addEventListener('click', (e) => {
    const tile = e.target.closest('.try-tile');
    if (tile) pick(Number(tile.dataset.i));
  });

  // Auto-play: a gaze cursor drifts to "I am in pain" and dwells there.
  function runAutoCursor() {
    const target = tiles[1].getBoundingClientRect();
    const start = { x: target.left - 300, y: target.bottom + 120 };
    const end = { x: target.left + target.width / 2, y: target.top + target.height / 2 };
    const t0 = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - t0) / 1600);
      const e = 1 - Math.pow(1 - t, 3);
      moveCursor(start.x + (end.x - start.x) * e, start.y + (end.y - start.y) * e);
      if (t < 1) autoCursor = requestAnimationFrame(frame);
    }
    autoCursor = requestAnimationFrame(frame);
  }

  Deck.scene('try', {
    enter() {
      reply.hidden = true;
      setHover(null);
      cancelAnimationFrame(dwellFrame);
      dwellFrame = requestAnimationFrame(dwellLoop);
      if (Deck.autoplay) setTimeout(runAutoCursor, 1200);
    },
    leave() {
      cancelAnimationFrame(dwellFrame);
      cancelAnimationFrame(autoCursor);
      setHover(null);
      cursor.classList.remove('is-visible');
      speechSynthesis?.cancel();
    },
  });

  // ---- 4 · room: callouts switch on the matching effect
  let roomEcg = null;
  Deck.scene('room', {
    enter(slide) {
      slide.classList.remove('monitor-on', 'alert-on');
      roomEcg ??= ecg($('#room-ecg'), { bpm: 74, line: 3 });
      roomEcg.setRate(74);
    },
    step(slide, n) {
      slide.classList.toggle('monitor-on', n >= 2);
      slide.classList.toggle('alert-on', n >= 3);
      roomEcg?.setRate(n >= 3 ? 108 : 74);
    },
  });

  // ---- 6 · demo: the heart rate climbs and the phone flashes
  let demoEcg = null;
  let demoTimer = null;
  Deck.scene('demo', {
    enter(slide) {
      slide.classList.remove('alert-on');
      demoEcg ??= ecg($('#demo-ecg'), { bpm: 72 });
      clearInterval(demoTimer);
      let hr = 72;
      $('#demo-hr').textContent = hr;
      $('#demo-state').textContent = 'Within personal range';
      demoEcg.setRate(hr);
      setTimeout(() => {
        demoTimer = setInterval(() => {
          hr = Math.min(106, hr + 1);
          $('#demo-hr').textContent = hr;
          demoEcg.setRate(hr);
          if (hr >= 92) $('#demo-state').textContent = 'Heart rate elevated';
          if (hr >= 106) {
            clearInterval(demoTimer);
            slide.classList.add('alert-on');
            $('#demo-state').textContent = 'URGENT · "I am in pain" + heart +47 %';
          }
        }, 140);
      }, 1600);
    },
    leave() {
      clearInterval(demoTimer);
    },
  });

  // ---- 8 · numbers count up
  Deck.scene('proof', {
    enter(slide) {
      slide.querySelectorAll('[data-count]').forEach((el, i) => {
        setTimeout(
          () =>
            countUp(el, Number(el.dataset.count), {
              prefix: el.dataset.prefix ?? '',
              suffix: el.dataset.suffix ?? '',
            }),
          300 + i * 250,
        );
      });
    },
  });

  Deck.start();
})();
