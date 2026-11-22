// Simulated patient routines used to give the suggestion model a sensible
// starting point before it has seen a real patient, and to measure it.
// These are NOT real patient data. They encode common sense about a hospital
// day (meals, nights, family visits, typical follow-ups). On a real bed the
// model keeps learning from that patient's own choices.

const BY_TIME = {
  morning: { water: 4, food: 4, position: 3, pain: 3, toilet: 3, nurse: 2, thanks: 2, cold: 1, doctor: 2 },
  midday: { food: 5, water: 4, hot: 2, toilet: 2, daughter: 2, son: 2, tired: 1, thanks: 2 },
  afternoon: { bored: 3, family: 3, daughter: 3, son: 3, position: 2, tired: 2, water: 2, hot: 1 },
  evening: { tired: 3, sleep: 3, love: 2, family: 2, thanks: 2, cold: 2, water: 2, pain: 1 },
  night: { sleep: 4, light: 4, pain: 3, cold: 2, scared: 2, water: 2, nurse: 2, breath: 1, toilet: 2 },
};

const FOLLOW_UPS = {
  pain: { nurse: 4, position: 3, doctor: 2, scared: 1 },
  breath: { nurse: 5, scared: 2, doctor: 2 },
  scared: { nurse: 3, daughter: 2, son: 2, family: 2 },
  nurse: { thanks: 4, pain: 1, toilet: 1 },
  doctor: { thanks: 3, pain: 1 },
  water: { thanks: 4, food: 1 },
  food: { water: 4, thanks: 2 },
  position: { thanks: 3, pain: 1, cold: 1 },
  toilet: { thanks: 4 },
  cold: { thanks: 2, light: 1 },
  hot: { water: 3, thanks: 1 },
  family: { daughter: 3, son: 3, love: 2 },
  daughter: { love: 3, thanks: 1 },
  son: { love: 3, thanks: 1 },
  bored: { family: 2, daughter: 1, son: 1, sleep: 1 },
  tired: { sleep: 4, light: 2 },
  sleep: { light: 4 },
  light: { thanks: 2 },
  thanks: { love: 1 },
  love: { thanks: 1 },
};

const HOURS = { morning: [6, 11], midday: [11, 15], afternoon: [15, 19], evening: [19, 22], night: [22, 30] };

function pick(weights, rand) {
  const entries = Object.entries(weights);
  let r = rand() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [id, w] of entries) {
    r -= w;
    if (r <= 0) return id;
  }
  return entries.at(-1)[0];
}

export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Generates conversations: short chains of messages at one moment of the day.
 * @returns {Array<{hour: number, messages: string[]}>}
 */
export function generateRoutines(count, seed = 1) {
  const rand = seededRandom(seed);
  const buckets = Object.keys(BY_TIME);
  const sessions = [];
  for (let i = 0; i < count; i++) {
    const bucket = buckets[Math.floor(rand() * buckets.length)];
    const [from, to] = HOURS[bucket];
    const hour = Math.floor(from + rand() * (to - from)) % 24;
    const length = 1 + Math.floor(rand() * 3);
    const messages = [pick(BY_TIME[bucket], rand)];
    while (messages.length < length) {
      const previous = messages.at(-1);
      const next = FOLLOW_UPS[previous] && rand() < 0.7 ? pick(FOLLOW_UPS[previous], rand) : pick(BY_TIME[bucket], rand);
      messages.push(next);
    }
    sessions.push({ hour, messages });
  }
  return sessions;
}

/**
 * Gives a predictor its starting knowledge from simulated routines. Each
 * simulated message counts as a fraction of a real one (`weight`), so after a
 * few days a patient's own habits outweigh the generic routine.
 */
export function seedPredictor(predictor, { count = 1500, seed = 42, weight = 0.1 } = {}) {
  for (const { hour, messages } of generateRoutines(count, seed)) {
    messages.forEach((id, i) => predictor.observe(id, { previousId: messages[i - 1] ?? null, hour }, weight));
  }
  return predictor;
}
