// Short synthesized tones, so no audio files are needed. Browsers only allow
// sound after the user has interacted with the page once; `unlock()` is called
// from the first click.

let context = null;

export function unlockAudio() {
  context ??= new AudioContext();
  if (context.state === 'suspended') context.resume();
}

const PATTERNS = {
  // gentle two-note chime: a question arrived
  question: [
    [660, 0, 0.18],
    [880, 0.2, 0.25],
  ],
  // single soft note: message delivered
  sent: [[740, 0, 0.12]],
  // three insistent notes: urgent alert
  urgent: [
    [988, 0, 0.16],
    [988, 0.22, 0.16],
    [988, 0.44, 0.16],
  ],
  attention: [
    [784, 0, 0.16],
    [659, 0.2, 0.2],
  ],
};

/** @param {'question'|'sent'|'urgent'|'attention'} name */
export function playTone(name, volume = 0.18) {
  if (!context || context.state !== 'running') return;
  const now = context.currentTime;
  for (const [frequency, start, duration] of PATTERNS[name] ?? []) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(volume, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + start);
    oscillator.stop(now + start + duration + 0.05);
  }
}
