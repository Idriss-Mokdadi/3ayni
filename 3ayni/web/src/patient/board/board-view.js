// Renders the board's tiles and the gaze feedback (hover outline, dwell ring,
// selection flash). Each screen has its own grid (see board-model.js); tiles
// can span several columns, and inert tiles (typed text, the question) can be
// looked at without ever being chosen. Mouse clicks and keyboard also work, so
// a nurse can use the same screen and the app stays testable without a camera.

import { icon } from '../../shared/icons.js';

const RING_RADIUS = 26;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * Places tiles row by row into a grid and returns, for every cell, the index
 * of the tile covering it (null for inert tiles). Pure, for unit tests.
 * @param {Array<{span?: number, inert?: boolean}>} tiles
 * @param {{columns: number, rows: number}} layout
 */
export function cellMap(tiles, { columns, rows }) {
  const cells = Array.from({ length: rows }, () => Array(columns).fill(null));
  let position = 0;
  tiles.forEach((tile, index) => {
    const span = Math.min(tile.span ?? 1, columns);
    if ((position % columns) + span > columns) position += columns - (position % columns); // wrap to the next row
    for (let k = 0; k < span; k++) {
      const p = position + k;
      const row = Math.floor(p / columns);
      if (row < rows) cells[row][p % columns] = tile.inert ? null : index;
    }
    position += span;
  });
  return cells;
}

export class BoardView {
  /**
   * @param {HTMLElement} container
   * @param {(index: number, via: string) => void} onActivate
   */
  constructor(container, onActivate) {
    this.container = container;
    this.onActivate = onActivate;
    this.tileElements = [];
    this.selectable = [];
    this.cells = [[]];
    this.layout = { columns: 3, rows: 2 };
    this.hovered = null;
    this.keyboardIndex = 0;

    container.addEventListener('click', (event) => {
      const tile = event.target.closest('[data-index]');
      if (tile && !tile.dataset.inert) this.onActivate(Number(tile.dataset.index), 'pointer');
    });
    window.addEventListener('keydown', (event) => this.#onKey(event));
  }

  /**
   * @param {object[]} tiles from BoardModel.tiles()
   * @param {{columns: number, rows: number}} layout
   * @param {string} screen screen name, used for styling
   */
  render(tiles, layout, screen) {
    this.layout = layout;
    this.cells = cellMap(tiles, layout);
    this.container.dataset.screen = screen;
    this.container.style.gridTemplateColumns = `repeat(${layout.columns}, minmax(0, 1fr))`;
    this.container.style.gridTemplateRows = `repeat(${layout.rows}, minmax(0, 1fr))`;
    this.container.replaceChildren();
    this.tileElements = tiles.map((tile, index) => this.#tileElement(tile, index));
    this.selectable = tiles.map((tile, index) => (tile.inert ? null : index)).filter((i) => i !== null);
    this.container.append(...this.tileElements);
    this.hovered = null;
  }

  #tileElement(tile, index) {
    const inert = Boolean(tile.inert);
    const element = document.createElement(inert ? 'div' : 'button');
    if (!inert) element.type = 'button';
    element.className = 'tile';
    element.dataset.index = String(index);
    element.dataset.kind = tile.kind;
    if (inert) element.dataset.inert = 'true';
    if (tile.urgency) element.dataset.urgency = tile.urgency;
    if (tile.span > 1) element.style.gridColumn = `span ${tile.span}`;

    const text = (className, value, dir) => {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = value;
      if (dir) span.dir = dir;
      return span;
    };

    switch (tile.kind) {
      case 'empty':
        break;
      case 'wake': {
        const dot = document.createElement('span');
        dot.className = 'wake-dot';
        element.append(dot, ringElement());
        element.setAttribute('aria-label', tile.label);
        break;
      }
      case 'display':
        element.append(text('typed', tile.text || '', tile.dir));
        if (!tile.text) element.append(text('typed-hint', 'Look at the letters to write'));
        break;
      case 'question':
        element.append(text('question-text', tile.text ?? ''));
        break;
      case 'key':
        if (tile.icon) element.append(iconWrap(tile.icon), text('tile-latin', tile.label));
        else element.append(text('key-char', tile.char, tile.dir));
        element.append(ringElement());
        break;
      case 'page':
        element.append(iconWrap(tile.icon, 48), text('tile-latin', tile.label), ringElement());
        break;
      case 'suggestion':
        element.append(text('suggestion-text', tile.text, tile.dir));
        if (tile.label) element.append(text('tile-latin', tile.label));
        element.append(ringElement());
        break;
      default: {
        element.append(iconWrap(tile.icon, 40));
        const ar = text('tile-ar', tile.ar ?? '', 'rtl');
        ar.lang = 'ar';
        element.append(ar);
        const latin = [tile.latin, tile.label].filter(Boolean).join(' · ');
        if (latin && latin !== tile.ar) element.append(text('tile-latin', latin));
        element.append(ringElement());
      }
    }
    return element;
  }

  /**
   * Which tile a gaze point falls on, or null for an inert area. Points
   * outside the board snap to the nearest cell, so the screen edges are easy.
   * @param {{x: number, y: number}} point normalised to the window
   */
  tileAt(point) {
    const rect = this.container.getBoundingClientRect();
    const { columns, rows } = this.layout;
    const px = point.x * window.innerWidth;
    const py = point.y * window.innerHeight;
    const column = clamp(Math.floor(((px - rect.left) / rect.width) * columns), 0, columns - 1);
    const row = clamp(Math.floor(((py - rect.top) / rect.height) * rows), 0, rows - 1);
    return this.cells[row]?.[column] ?? null;
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
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -this.layout.columns, ArrowDown: this.layout.columns };
    if (event.key in moves) {
      event.preventDefault();
      this.keyboardIndex = clamp(this.keyboardIndex + moves[event.key], 0, this.tileElements.length - 1);
      this.tileElements[this.keyboardIndex]?.focus();
    } else if (event.key >= '1' && event.key <= '9') {
      // Number keys choose the n-th tile that can be chosen.
      const index = this.selectable[Number(event.key) - 1];
      if (index !== undefined) this.onActivate(index, 'keyboard');
    }
  }
}

function iconWrap(name, size = 40) {
  const wrap = document.createElement('span');
  wrap.className = 'tile-icon';
  wrap.append(icon(name, size));
  return wrap;
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
