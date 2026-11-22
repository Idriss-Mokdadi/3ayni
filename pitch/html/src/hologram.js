// Scenes for "Holographic Guide".

(function () {
  const $ = (selector, root = document) => root.querySelector(selector);

  // ---- Salma as a hologram: figure, scan beam, light cone, projector
  document.querySelectorAll('[data-holo]').forEach((el, i) => {
    el.innerHTML = `<div class="cone"></div>
      <div class="figure">${Characters.salmaBust({ id: `holo-${i}`, mood: el.dataset.holo })}<div class="beam"></div></div>
      <div class="projector"></div>`;
  });

  document.querySelectorAll('[data-icon]').forEach((el) => {
    const size = el.classList.contains('hex') ? 52 : el.closest('.shield') ? 46 : 28;
    el.innerHTML = icon(el.dataset.icon, size, el.classList.contains('hex') ? 2 : 1.75);
  });

  // ---- floating particles
  (function particles() {
    const canvas = $('#particles');
    const ctx = canvas.getContext('2d');
    const dots = Array.from({ length: 90 }, () => ({
      x: Math.random() * 1600,
      y: Math.random() * 900,
      r: Math.random() * 1.8 + 0.4,
      v: Math.random() * 0.25 + 0.05,
      a: Math.random() * 0.6 + 0.2,
    }));
    function frame() {
      ctx.clearRect(0, 0, 1600, 900);
      for (const d of dots) {
        d.y -= d.v;
        if (d.y < -4) {
          d.y = 904;
          d.x = Math.random() * 1600;
        }
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(116, 227, 255, ${d.a})`;
        ctx.fill();
      }
      requestAnimationFrame(frame);
    }
    frame();
  })();

  // ---- subtitles: Salma "speaks" each slide's caption
  const captionAr = $('#caption-ar');
  const captionEn = $('#caption-en');
  let typing = null;
  function typeCaption(slide) {
    clearInterval(typing);
    const ar = slide.dataset.captionAr ?? '';
    const en = slide.dataset.captionEn ?? '';
    captionAr.textContent = '';
    captionEn.textContent = '';
    let i = 0;
    typing = setInterval(() => {
      i += 1;
      captionAr.textContent = ar.slice(0, i);
      captionEn.textContent = en.slice(0, Math.round((i / ar.length) * en.length));
      if (i >= ar.length) {
        captionEn.textContent = en;
        clearInterval(typing);
      }
    }, 38);
  }

  // Every slide types its caption when it appears.
  document.querySelectorAll('.slide').forEach((slide) => {
    Deck.scene(slide.id, { enter: () => typeCaption(slide) });
  });

  const withCaption = (id, hooks) =>
    Deck.scene(id, {
      ...hooks,
      enter(slide) {
        typeCaption(slide);
        hooks.enter?.(slide);
      },
    });

  // ---- 3 · solution: gaze grid cycles, ECG runs
  let gridTimer = null;
  let solEcg = null;
  withCaption('solution', {
    enter() {
      const cells = [...document.querySelectorAll('#mini-grid i')];
      let k = 0;
      clearInterval(gridTimer);
      gridTimer = setInterval(() => {
        cells.forEach((c, i) => c.classList.toggle('on', i === [1, 4, 2, 0][k % 4]));
        k += 1;
      }, 1100);
      solEcg ??= ecg($('#sol-ecg'), { color: '#ff5d6c', glow: 'rgba(255,93,108,.7)', bpm: 74 });
    },
    leave() {
      clearInterval(gridTimer);
    },
  });

  // ---- 5 · demo: heart rate climbs, the phone goes urgent
  let demoEcg = null;
  let demoTimer = null;
  withCaption('demo', {
    enter(slide) {
      slide.classList.remove('alert-on');
      $('#demo-badge').textContent = 'Normal';
      demoEcg ??= ecg($('#demo-ecg'), { color: '#ff5d6c', glow: 'rgba(255,93,108,.7)', bpm: 72 });
      let hr = 72;
      $('#demo-bpm').textContent = hr;
      $('#demo-state').textContent = 'Within personal range';
      demoEcg.setRate(hr);
      clearInterval(demoTimer);
      setTimeout(() => {
        demoTimer = setInterval(() => {
          hr = Math.min(106, hr + 1);
          $('#demo-bpm').textContent = hr;
          demoEcg.setRate(hr);
          if (hr >= 92) $('#demo-state').textContent = 'Heart rate elevated';
          if (hr >= 106) {
            clearInterval(demoTimer);
            slide.classList.add('alert-on');
            $('#demo-badge').textContent = 'Urgent';
            $('#demo-state').textContent = 'Urgent · pain + heart +47 %';
          }
        }, 140);
      }, 2200);
    },
    leave() {
      clearInterval(demoTimer);
    },
  });

  // ---- 7 · counters
  withCaption('proof', {
    enter(slide) {
      slide.querySelectorAll('[data-count]').forEach((el, i) => {
        setTimeout(
          () => countUp(el, Number(el.dataset.count), { prefix: el.dataset.prefix ?? '', suffix: el.dataset.suffix ?? '', duration: 1800 }),
          900 + i * 260,
        );
      });
    },
  });

  Deck.start();
})();
