// Records camera heart rate next to a reference device (smartwatch or finger
// pulse oximeter) to measure accuracy honestly. Export the CSV and report the
// mean absolute error in the pitch.

export class ValidationLog {
  constructor() {
    this.pairs = [];
  }

  /** @returns {boolean} false when there is no camera value to compare */
  add({ cameraHr, referenceHr, quality, note = '' }) {
    if (!Number.isFinite(cameraHr) || !Number.isFinite(referenceHr)) return false;
    this.pairs.push({ time: new Date().toISOString(), cameraHr, referenceHr, quality, note });
    return true;
  }

  summary() {
    const n = this.pairs.length;
    if (n === 0) return null;
    const errors = this.pairs.map((p) => p.cameraHr - p.referenceHr);
    const mae = errors.reduce((s, e) => s + Math.abs(e), 0) / n;
    const bias = errors.reduce((s, e) => s + e, 0) / n;
    const within5 = errors.filter((e) => Math.abs(e) <= 5).length / n;
    return { n, mae, bias, within5 };
  }

  toCsv() {
    const header = 'time,camera_bpm,reference_bpm,error_bpm,quality,note';
    const rows = this.pairs.map((p) =>
      [p.time, p.cameraHr.toFixed(1), p.referenceHr, (p.cameraHr - p.referenceHr).toFixed(1), p.quality, csvField(p.note)].join(','),
    );
    return [header, ...rows].join('\n');
  }
}

function csvField(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
