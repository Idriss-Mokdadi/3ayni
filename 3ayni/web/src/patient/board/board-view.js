// Renders the six tiles and the gaze feedback (hover outline, dwell ring,
// selection flash). Mouse clicks and keyboard also work, so a nurse can use
// the same screen and the app stays testable without a camera.

import { icon } from '../../shared/icons.js';
import { TILE_COUNT } from './board-model.js';

const COLUMNS = 3;
const RING_RADIUS = 26;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export class BoardView {
  /**
   * @param {HTMLElement} container
   * @param {(index: number, via: string) => void} onActivate
   */
  constructor(container, onActivate) {
    this.container = container;
    this.onActivate = onActivate;
    this.tileElements = [];
    this.hovered = null;
    this.keyboardIndex = 0;

    container.addEventListener('click', (event) => {
      const tile = event.target.closest('[data-index]');
      if (tile) this.onActivate(Number(tile.dataset.index), 'pointer');
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

      const iconWrap = document.createElement('span');
      iconWrap.className = 'tile-icon';
      iconWrap.append(icon(tile.icon, 40));

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
   * Which tile a gaze point falls on. The six tiles split the board area into
   * a 3x2 grid; points outside the board snap to the nearest tile, so the
   * edges of the screen are easy targets.
   * @param {{x: number, y: number}} point normalised to the window
   */
  tileAt(point) {
    const rect = this.container.getBoundingClientRect();
    const px = point.x * window.innerWidth;
    const py = point.y * window.innerHeight;
    const rows = TILE_COUNT / COLUMNS;
    const column = clamp(Math.floor(((px - rect.left) / rect.width) * COLUMNS), 0, COLUMNS - 1);
    const row = clamp(Math.floor(((py - rect.top) / rect.height) * rows), 0, rows - 1);
    return row * COLUMNS + column;
  }

  setHover(index) {
    if (this.hovered === index) return;
    if (this.hovered !== null) this.#reset(this.tileElements[this.hovered]);
    this.hovered = index;
    if (index !== null) this.tileElements[index]?.classList.add('is-hovered');
  }

  setProgress(index, value) {
    const ring = this.tileElements[index]?.querySelector('.ring-progress');
    if (ring) ring.style.strokeDashoffset = String(RING_LENGTH * (1 - Math.min(value, 1)));
  }

  flash(index) {
    const element = this.tileElements[index];
    if (!element) return;
    element.classList.add('is-selected');
    setTimeout(() => element.classList.remove('is-selected'), 450);
  }

  #reset(element) {
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
