// Renders the six tiles, the gaze feedback (hover outline, dwell ring,
// selection flash), and the pagination footer (prev/next arrows).
// Mouse clicks and keyboard also work so a nurse can use the same screen.

import { icon } from '../../shared/icons.js';
import { TILE_COUNT } from './board-model.js';

const COLUMNS = 3;
const RING_RADIUS = 26;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

// Footer arrow indices are virtual — outside the 0-5 tile range.
export const FOOTER_PREV = 'footer:prev';
export const FOOTER_NEXT = 'footer:next';
export const FOOTER_CLEAR = 'footer:clear';

export class BoardView {
  /**
   * @param {HTMLElement} container   the <main class="board"> element
   * @param {(index: number|string, via: string) => void} onActivate
   */
  constructor(container, onActivate) {
    this.container = container;
    this.onActivate = onActivate;
    this.tileElements = [];
    this.footerElements = {}; // keyed by FOOTER_* constants
    this.hovered = null;
    this.keyboardIndex = 0;

    // Inject footer into the DOM once — it lives below the board grid.
    this.footer = document.createElement('footer');
    this.footer.className = 'board-footer';
    this.footer.hidden = true;
    container.after(this.footer);

    container.addEventListener('click', (event) => {
      const tile = event.target.closest('[data-index]');
      if (tile) this.onActivate(Number(tile.dataset.index), 'pointer');
    });
    this.footer.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-footer]');
      if (btn) this.onActivate(btn.dataset.footer, 'pointer');
    });
    window.addEventListener('keydown', (event) => this.#onKey(event));
  }

  /** @param {object[]} tiles from BoardModel.tiles() */
  render(tiles) {
    this.container.replaceChildren();
    this.tileElements = tiles.map((tile, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tile';
      button.dataset.index = String(index);
      button.dataset.kind = tile.kind;
      if (tile.urgency) button.dataset.urgency = tile.urgency;
      if (tile.suggested) button.dataset.suggested = 'true';
      if (tile.caregiverPicked) button.dataset.caregiverPicked = 'true';

      if (tile.kind === 'empty') {
        button.disabled = true;
        button.setAttribute('aria-hidden', 'true');
        return button;
      }

      const iconWrap = document.createElement('span');
      iconWrap.className = 'tile-icon';
      if (tile.icon) iconWrap.append(icon(tile.icon, 40));

      const ar = document.createElement('span');
      ar.className = 'tile-ar';
      ar.lang = 'ar';
      ar.dir = 'rtl';
      ar.textContent = tile.ar;

      const latin = document.createElement('span');
      latin.className = 'tile-latin';
      latin.textContent = `${tile.latin} · ${tile.label}`;

      button.append(iconWrap, ar, latin, ringElement());
      if (tile.suggested) {
        const badge = document.createElement('span');
        badge.className = 'tile-badge';
        badge.textContent = 'Suggested';
        button.append(badge);
      }
      return button;
    });
    this.container.append(...this.tileElements);
    this.hovered = null;
  }

  /**
   * Renders the pagination footer.
   * @param {{ show: boolean, hasPrev: boolean, hasNext: boolean, page: number, pageCount: number }} opts
   */
  renderFooter({ show, hasPrev, hasNext, page, pageCount }) {
    this.footer.hidden = !show;
    if (!show) {
      this.footerElements = {};
      return;
    }

    this.footer.replaceChildren();
    this.footerElements = {};

    // Left arrow — prev page
    const prevBtn = footerArrow('arrow-left', FOOTER_PREV, 'السابق · Prev', !hasPrev);
    prevBtn.dataset.footer = FOOTER_PREV;
    this.footerElements[FOOTER_PREV] = prevBtn;

    // Page indicator
    const pageInfo = document.createElement('span');
    pageInfo.className = 'footer-page';
    pageInfo.textContent = `${page + 1} / ${pageCount}`;

    // Clear button — dismiss all caregiver tiles
    const clearBtn = footerArrow('x', FOOTER_CLEAR, 'إلغاء · Clear', false);
    clearBtn.dataset.footer = FOOTER_CLEAR;
    clearBtn.classList.add('footer-clear');
    this.footerElements[FOOTER_CLEAR] = clearBtn;

    // Right arrow — next page
    const nextBtn = footerArrow('arrow-right', FOOTER_NEXT, 'التالي · Next', !hasNext);
    nextBtn.dataset.footer = FOOTER_NEXT;
    this.footerElements[FOOTER_NEXT] = nextBtn;

    this.footer.append(prevBtn, pageInfo, clearBtn, nextBtn);
  }

  /**
   * Which tile or footer button a gaze point falls on.
   * Returns a tile index (0-5) or a FOOTER_* string.
   * @param {{x: number, y: number}} point normalised to the window
   */
  tileAt(point) {
    const px = point.x * window.innerWidth;
    const py = point.y * window.innerHeight;

    // Check footer buttons first (they sit below the board).
    if (!this.footer.hidden) {
      for (const [key, btn] of Object.entries(this.footerElements)) {
        if (!btn || btn.disabled) continue;
        const r = btn.getBoundingClientRect();
        // Generous hit zone — extend 20px outward on each side.
        if (px >= r.left - 20 && px <= r.right + 20 && py >= r.top - 20 && py <= r.bottom + 20) {
          return key;
        }
      }
    }

    // Board grid.
    const rect = this.container.getBoundingClientRect();
    const rows = TILE_COUNT / COLUMNS;
    const column = clamp(Math.floor(((px - rect.left) / rect.width) * COLUMNS), 0, COLUMNS - 1);
    const row = clamp(Math.floor(((py - rect.top) / rect.height) * rows), 0, rows - 1);
    return row * COLUMNS + column;
  }

  setHover(index) {
    if (this.hovered === index) return;
    this.#resetHover(this.hovered);
    this.hovered = index;
    if (index === null) return;
    if (typeof index === 'string') {
      this.footerElements[index]?.classList.add('is-hovered');
    } else {
      this.tileElements[index]?.classList.add('is-hovered');
    }
  }

  setProgress(index, value) {
    let element;
    if (typeof index === 'string') {
      element = this.footerElements[index];
    } else {
      element = this.tileElements[index];
    }
    const ring = element?.querySelector('.ring-progress');
    if (ring) ring.style.strokeDashoffset = String(RING_LENGTH * (1 - Math.min(value, 1)));
  }

  flash(index) {
    let element;
    if (typeof index === 'string') {
      element = this.footerElements[index];
    } else {
      element = this.tileElements[index];
    }
    if (!element) return;
    element.classList.add('is-selected');
    setTimeout(() => element.classList.remove('is-selected'), 450);
  }

  #resetHover(index) {
    if (index === null || index === undefined) return;
    let element;
    if (typeof index === 'string') {
      element = this.footerElements[index];
    } else {
      element = this.tileElements[index];
    }
    if (!element) return;
    element.classList.remove('is-hovered');
    const ring = element.querySelector('.ring-progress');
    if (ring) ring.style.strokeDashoffset = String(RING_LENGTH);
  }

  #onKey(event) {
    if (event.target instanceof HTMLInputElement || event.altKey || event.ctrlKey || event.metaKey) return;
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLUMNS, ArrowDown: COLUMNS };
    if (event.key in moves) {
      event.preventDefault();
      this.keyboardIndex = clamp(this.keyboardIndex + moves[event.key], 0, this.tileElements.length - 1);
      this.tileElements[this.keyboardIndex]?.focus();
    } else if (event.key >= '1' && event.key <= '6') {
      this.onActivate(Number(event.key) - 1, 'keyboard');
    }
  }
}

// ---------------------------------------------------------------- helpers

function footerArrow(iconName, key, label, disabled) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'footer-arrow';
  btn.dataset.footer = key;
  btn.disabled = disabled;
  btn.setAttribute('aria-label', label);
  btn.append(icon(iconName, 32), ringElement());
  return btn;
}

function ringElement() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'ring');
  svg.setAttribute('viewBox', '0 0 60 60');
  svg.setAttribute('aria-hidden', 'true');
  for (const className of ['ring-track', 'ring-progress']) {
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('class', className);
    circle.setAttribute('cx', '30');
    circle.setAttribute('cy', '30');
    circle.setAttribute('r', String(RING_RADIUS));
    if (className === 'ring-progress') {
      circle.style.strokeDasharray = String(RING_LENGTH);
      circle.style.strokeDashoffset = String(RING_LENGTH);
    }
    svg.append(circle);
  }
  return svg;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
