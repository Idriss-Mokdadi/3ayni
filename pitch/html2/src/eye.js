// The view from inside Am Hédi's eye: eyelids frame the scene, eyelashes
// hang out of focus at the edges, and the eye blinks with real timing
// (close about 90 ms, hold about 60 ms, open about 180 ms, every 3 to 7 s).
// While the lids are closed, light through the skin turns the view dark red.

window.Eye = (function () {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 1600;
  const H = 900;

  // Lid openings as cubic Bézier curves, from the outer corner to the inner one.
  const UPPER = [[-60, 470], [280, -60], [1320, -80], [1660, 430]];
  const LOWER = [[-60, 470], [280, 980], [1320, 960], [1660, 430]];
  const CLOSE_TOP = 745; // how far the upper lid travels to meet the lower one
  const CLOSE_BOTTOM = -60;

  const bez = (p, t) => {
    const u = 1 - t;
    return [0, 1].map((k) => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]);
  };
  const bezTangent = (p, t) => {
    const u = 1 - t;
    return [0, 1].map((k) => 3 * u * u * (p[1][k] - p[0][k]) + 6 * u * t * (p[2][k] - p[1][k]) + 3 * t * t * (p[3][k] - p[2][k]));
  };
  const curve = (p) => `M${p[0][0]} ${p[0][1]} C${p[1][0]} ${p[1][1]} ${p[2][0]} ${p[2][1]} ${p[3][0]} ${p[3][1]}`;

  // Deterministic pseudo-random numbers, so the lashes look the same every time.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  /** Eyelashes along a lid: longest in the middle, fanning outward toward the corners. */
  function lashes(p, { count, minLen, maxLen, dir }) {
    let d = '';
    for (let i = 0; i < count; i++) {
      const t = 0.06 + 0.88 * (i / (count - 1)) + (rand() - 0.5) * 0.012;
      const [x, y] = bez(p, t);
      const [tx, ty] = bezTangent(p, t);
      const len = Math.hypot(tx, ty);
      let nx = (-ty / len) * dir;
      let ny = (tx / len) * dir;
      // Real lashes fan out: at the corners they lean toward the outside.
      const fan = (t - 0.5) * 0.9;
      nx += fan;
      const n = Math.hypot(nx, ny);
      nx /= n;
      ny /= n;
      const middle = 1 - Math.abs(t - 0.5) * 1.6;
      const l = minLen + (maxLen - minLen) * Math.max(0.15, middle) * (0.75 + rand() * 0.5);
      const curl = (rand() * 0.5 + 0.5) * l * 0.35 * Math.sign(t - 0.5 || 1);
      const ex = x + nx * l + curl;
      const ey = y + ny * l;
      const cx = x + nx * l * 0.55 + curl * 0.2;
      const cy = y + ny * l * 0.55;
      d += `M${x.toFixed(1)} ${y.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
    }
    return d;
  }

  let svg;
  let top;
  let bottom;
  let tint;
  let shown = false;
  let closed = false;
  let timer = null;
  let busy = false;

  function build(stage) {
    svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'eye-frame');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('aria-hidden', 'true');
    const lowerReversed = [LOWER[3], LOWER[2], LOWER[1], LOWER[0]];
    svg.innerHTML = `
      <defs>
        <filter id="eye-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16"/></filter>
        <filter id="eye-rim" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="30"/></filter>
        <filter id="eye-lash" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.6"/></filter>
        <filter id="eye-nose" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="46"/></filter>
      </defs>
      <ellipse cx="1610" cy="930" rx="250" ry="340" fill="#120706" opacity=".92" filter="url(#eye-nose)"/>
      <rect class="eye-tint" x="0" y="0" width="${W}" height="${H}" fill="#4a130c" opacity="0"/>
      <g class="eye-lid eye-bottom">
        <path d="M-300 470 L-60 470 C280 980 1320 960 1660 430 L1900 430 V1800 H-300 Z" fill="#060302" filter="url(#eye-soft)"/>
        <path d="${curve(lowerReversed)}" stroke="#4d1a13" stroke-width="56" fill="none" opacity=".3" filter="url(#eye-rim)"/>
        <path d="${curve(LOWER)}" stroke="#ffd9cf" stroke-width="3" fill="none" opacity=".09" transform="translate(0 -8)" filter="url(#eye-lash)"/>
        <path d="${lashes(LOWER, { count: 48, minLen: 10, maxLen: 40, dir: -1 })}" stroke="#090403" stroke-width="3" stroke-linecap="round" fill="none" opacity=".8" filter="url(#eye-lash)"/>
      </g>
      <g class="eye-lid eye-top">
        <path d="M-300 -1200 H1900 V430 L1660 430 C1320 -80 280 -60 -60 470 L-300 470 Z" fill="#060302" filter="url(#eye-soft)"/>
        <path d="${curve(UPPER)}" stroke="#4d1a13" stroke-width="70" fill="none" opacity=".34" filter="url(#eye-rim)"/>
        <path d="${lashes(UPPER, { count: 96, minLen: 22, maxLen: 108, dir: 1 })}" stroke="#090403" stroke-width="4.2" stroke-linecap="round" fill="none" opacity=".93" filter="url(#eye-lash)"/>
      </g>`;
    stage.appendChild(svg);
    top = svg.querySelector('.eye-top');
    bottom = svg.querySelector('.eye-bottom');
    tint = svg.querySelector('.eye-tint');
    setLids(1, false); // start closed
  }

  /** 0 = open, 1 = closed. */
  function setLids(amount) {
    top.style.transform = `translateY(${CLOSE_TOP * amount}px)`;
    bottom.style.transform = `translateY(${CLOSE_BOTTOM * amount}px)`;
    tint.style.opacity = String(0.94 * amount);
  }

  function animateLids(from, to, ms, easing) {
    const opts = { duration: ms, easing, fill: 'forwards' };
    const a = top.animate([{ transform: `translateY(${CLOSE_TOP * from}px)` }, { transform: `translateY(${CLOSE_TOP * to}px)` }], opts);
    bottom.animate([{ transform: `translateY(${CLOSE_BOTTOM * from}px)` }, { transform: `translateY(${CLOSE_BOTTOM * to}px)` }], opts);
    tint.animate([{ opacity: 0.94 * from }, { opacity: 0.94 * to }], opts);
    return a.finished.then(() => {
      setLids(to);
      top.getAnimations().forEach((x) => x.cancel());
      bottom.getAnimations().forEach((x) => x.cancel());
      tint.getAnimations().forEach((x) => x.cancel());
      closed = to >= 1;
    });
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function blink({ hold = 60, close = 90, open = 180 } = {}) {
    if (!shown || busy || closed) return;
    busy = true;
    if (reduced()) {
      busy = false;
      return;
    }
    await animateLids(0, 1, close, 'cubic-bezier(0.55, 0.06, 0.68, 0.19)');
    await wait(hold);
    await animateLids(1, 0, open, 'cubic-bezier(0.22, 1, 0.36, 1)');
    busy = false;
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await blink();
      if (Math.random() < 0.15) await blink(); // occasional double blink
      schedule();
    }, 3000 + Math.random() * 4000);
  }

  return {
    build,
    blink,
    /** Close, run `during` while the eye is shut, then open. Used for slide changes. */
    async through(during, { hold = 160, open = 240 } = {}) {
      busy = true;
      if (!closed) await animateLids(0, 1, 100, 'cubic-bezier(0.55, 0.06, 0.68, 0.19)');
      during();
      await wait(hold);
      await animateLids(1, 0, open, 'cubic-bezier(0.22, 1, 0.36, 1)');
      busy = false;
    },
    async closeSlowly(ms = 2200) {
      busy = true;
      clearTimeout(timer);
      await animateLids(0, 1, ms, 'cubic-bezier(0.65, 0, 0.35, 1)');
    },
    async openSlowly(ms = 1400) {
      await animateLids(1, 0, ms, 'cubic-bezier(0.22, 1, 0.36, 1)');
      busy = false;
      schedule();
    },
    show(on) {
      shown = on;
      svg.classList.toggle('is-on', on);
      if (on) schedule();
      else clearTimeout(timer);
    },
    closeNow() {
      setLids(1);
      closed = true;
    },
    get closed() {
      return closed;
    },
  };
})();
