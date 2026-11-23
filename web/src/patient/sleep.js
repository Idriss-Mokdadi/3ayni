// Screen sleep. After a while without a choice, the board turns dark and only
// one dot stays in the middle; looking at the dot for two seconds wakes it.
// Without this, a patient who simply rests their eyes on the screen would end
// up selecting tiles all day and all night.
//
// How long before sleeping depends on the patient's condition: a patient whose
// heart rate is above their own baseline, or who recently asked for help, may
// need to speak again soon, so the board stays awake much longer.

export const SLEEP_RULES = Object.freeze({
  calmMs: 60_000, // heart rate at baseline: 1 minute
  distressMs: 5 * 60_000, // heart rate 25 % above baseline or more: 5 minutes
  recentHelpMs: 10 * 60_000, // an attention or urgent message counts this long
  wakeDwellMs: 2000, // look at the dot this long to wake the board
});

export const FAST_SLEEP_RULES = Object.freeze({ ...SLEEP_RULES, calmMs: 20_000, distressMs: 60_000, recentHelpMs: 120_000 });

/**
 * Milliseconds of inactivity before the board sleeps.
 * @param {object} s
 * @param {number|null} s.hr          current heart rate, or null
 * @param {number|null} s.baseline    the patient's baseline, or null while learning
 * @param {string} s.state            care monitor state ('elevated' means distress)
 * @param {number|null} s.lastHelpAt  time of the last attention/urgent message
 * @param {number} s.now
 * @param {object} [rules]
 * @returns {number|null} null = never sleep (an unanswered urgent alert)
 */
export function sleepDelayMs({ hr, baseline, state, lastHelpAt = null, urgentOpen = false, now }, rules = SLEEP_RULES) {
  if (urgentOpen) return null;
  if (state === 'elevated') return rules.distressMs;
  if (lastHelpAt !== null && now - lastHelpAt < rules.recentHelpMs) return rules.distressMs;
  if (!Number.isFinite(hr) || !Number.isFinite(baseline) || baseline <= 0) return rules.calmMs;
  // Between baseline and +25 %, the delay grows smoothly from calm to distress.
  const stress = Math.min(1, Math.max(0, (hr / baseline - 1) / 0.25));
  return Math.round(rules.calmMs + (rules.distressMs - rules.calmMs) * stress);
}
