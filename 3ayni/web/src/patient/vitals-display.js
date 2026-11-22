// Top-bar vitals: heart rate, breathing rate, live pulse wave and a plain
// signal-quality label. A weak signal shows "--", never a guessed number.

const QUALITY_TEXT = { good: 'Good signal', fair: 'Fair signal', poor: 'Weak signal', none: 'No signal' };

export class VitalsDisplay {
  constructor() {
    this.root = document.getElementById('vitals');
    this.hr = document.getElementById('hr-value');
    this.rr = document.getElementById('rr-value');
    this.dot = document.getElementById('signal-dot');
    this.text = document.getElementById('signal-text');
    this.canvas = document.getElementById('pulse-wave');
    this.context = this.canvas.getContext('2d');
    this.#fitCanvas();
  }

  /**
   * @param {{hr: number|null, rr: number|null, quality: string}} vitals
   * @param {number[]} waveform values in -1..1
   * @param {{paused?: boolean}} [options]
   */
  update(vitals, waveform, { paused = false } = {}) {
    const quality = paused ? 'none' : vitals.quality;
    this.root.dataset.quality = quality;
    setNumber(this.hr, paused ? null : vitals.hr);
    setNumber(this.rr, paused ? null : vitals.rr);
    this.dot.dataset.state = quality;
    this.text.textContent = paused ? 'Sharing paused' : QUALITY_TEXT[quality];
    this.#drawWave(paused ? [] : waveform, quality);
  }

  #fitCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.context.scale(ratio, ratio);
    this.size = { width, height };
  }

  #drawWave(values, quality) {
    const { width, height } = this.size;
    const ctx = this.context;
    ctx.clearRect(0, 0, width, height);
    if (values.length < 2) return;
    const styles = getComputedStyle(document.documentElement);
    ctx.strokeStyle = quality === 'good' ? styles.getPropertyValue('--urgent') : styles.getPropertyValue('--text-faint');
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height / 2 - v * (height / 2 - 3);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

function setNumber(element, value) {
  const valid = Number.isFinite(value);
  element.textContent = valid ? String(Math.round(value)) : '—';
  element.classList.toggle('is-empty', !valid);
}
