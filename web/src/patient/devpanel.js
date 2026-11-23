// Operator panel (press D): camera preview with the tracked eye points and
// the skin regions used for the pulse, live metrics, demo controls and the
// validation logger. For the team and the jury, not for the patient.

const EYE_POINTS = [33, 133, 159, 145, 263, 362, 386, 374, 468, 473];

export class DevPanel {
  /**
   * @param {Record<string, () => void>} actions handlers keyed by button id
   */
  constructor(actions) {
    this.root = document.getElementById('devpanel');
    this.canvas = document.getElementById('overlay-canvas');
    this.context = this.canvas.getContext('2d');
    this.metrics = document.getElementById('metrics');
    this.open = false;
    this.root.inert = true;
    for (const [id, handler] of Object.entries(actions)) {
      document.getElementById(id)?.addEventListener('click', handler);
    }
  }

  toggle() {
    this.open = !this.open;
    this.root.classList.toggle('is-open', this.open);
    this.root.inert = !this.open; // off-screen buttons must not take keyboard focus
  }

  /** Sets a toggle button's label and pressed state, e.g. "Simulate stress: on". */
  setToggle(id, label, on) {
    const button = document.getElementById(id);
    if (!button) return;
    button.textContent = `${label}: ${on ? 'on' : 'off'}`;
    button.setAttribute('aria-pressed', String(on));
  }

  /**
   * @param {{landmarks: Array|null, video: HTMLVideoElement}} frame
   * @param {Array<{polygon: Array<[number, number]>}>} regions normalised
   */
  drawOverlay(frame, regions) {
    if (!this.open) return;
    const { videoWidth: width, videoHeight: height } = frame.video;
    if (!width) return;
    if (this.canvas.width !== width) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const ctx = this.context;
    ctx.clearRect(0, 0, width, height);
    if (!frame.landmarks) return;

    ctx.strokeStyle = 'rgba(229, 83, 75, 0.9)';
    ctx.lineWidth = 2;
    for (const { polygon } of regions) {
      ctx.beginPath();
      polygon.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * width, y * height) : ctx.lineTo(x * width, y * height)));
      ctx.closePath();
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(79, 179, 169, 0.95)';
    for (const index of EYE_POINTS) {
      const point = frame.landmarks[index];
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, index >= 468 ? 3 : 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** @param {Record<string, string>} values */
  showMetrics(values) {
    if (!this.open) return;
    const rows = Object.entries(values).flatMap(([key, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = key;
      const dd = document.createElement('dd');
      dd.textContent = value;
      return [dt, dd];
    });
    this.metrics.replaceChildren(...rows);
  }
}
