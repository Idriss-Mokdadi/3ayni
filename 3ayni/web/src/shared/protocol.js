// Message contract between the bedside screen, the relay server and the
// caregiver dashboard. Shared by browser and Node so both sides validate the
// same way. No image or video data is ever part of this protocol.

export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 4096;

/** Events the bedside (patient) screen may send. */
export const PATIENT_EVENTS = new Set(['message', 'vitals', 'alert', 'status']);

/** Events the caregiver dashboard may send. */
export const CAREGIVER_EVENTS = new Set(['question', 'ack', 'set-tiles']);

export const URGENCY = Object.freeze({ ROUTINE: 'routine', ATTENTION: 'attention', URGENT: 'urgent' });
const URGENCY_LEVELS = new Set(Object.values(URGENCY));

const isFiniteOrNull = (value) => value === null || Number.isFinite(value);
const isShortText = (value, max = 280) => typeof value === 'string' && value.length > 0 && value.length <= max;

const validators = {
  message: (p) =>
    isShortText(p.id, 64) && isShortText(p.text) && URGENCY_LEVELS.has(p.urgency) && typeof p.category === 'string',
  vitals: (p) =>
    isFiniteOrNull(p.hr) &&
    isFiniteOrNull(p.rr) &&
    ['good', 'fair', 'poor', 'none'].includes(p.quality) &&
    typeof p.simulated === 'boolean',
  alert: (p) => isShortText(p.id, 64) && URGENCY_LEVELS.has(p.level) && isShortText(p.reason),
  status: (p) => typeof p.state === 'string' && p.state.length <= 32,
  question: (p) => isShortText(p.text, 120),
  ack: (p) => isShortText(p.alertId, 64),
  'set-tiles': (p) => Array.isArray(p.phraseIds) && p.phraseIds.length >= 1 && p.phraseIds.length <= 6 && p.phraseIds.every((id) => isShortText(id, 64)),
};

/**
 * Parses and validates a raw WebSocket frame.
 * @param {string} raw
 * @param {Set<string>} allowedTypes event types this sender is allowed to emit
 * @returns {{ok: true, event: {type: string, ts: number, payload: object}} | {ok: false, error: string}}
 */
export function parseEvent(raw, allowedTypes) {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return { ok: false, error: 'size' };
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'json' };
  }
  if (!event || typeof event !== 'object') return { ok: false, error: 'shape' };
  const { type, ts, payload } = event;
  if (!allowedTypes.has(type)) return { ok: false, error: 'type' };
  if (!Number.isFinite(ts)) return { ok: false, error: 'ts' };
  if (!payload || typeof payload !== 'object' || !validators[type](payload)) return { ok: false, error: 'payload' };
  return { ok: true, event: { type, ts, payload } };
}

/** Builds a protocol event with the current timestamp. */
export function makeEvent(type, payload, ts = Date.now()) {
  return { type, ts, payload };
}
