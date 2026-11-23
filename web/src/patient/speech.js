// Speaks a phrase out loud. A recorded Darija clip (web/public/audio/<id>.mp3)
// is always preferred: browsers have no Tunisian voice. Without a clip we fall
// back to the browser's Arabic or French synthetic voice.

let manifest = null;

export class Speaker {
  constructor({ language = 'ar' } = {}) {
    this.language = language; // 'ar' speaks the Darija text, 'fr' the French text
    this.currentAudio = null;
  }

  /** @param {{id: string, ar: string, fr: string}} phrase */
  async speak(phrase) {
    this.stop();
    if (await hasClip(phrase.id)) {
      this.currentAudio = new Audio(clipUrl(phrase.id));
      try {
        await this.currentAudio.play();
        return 'clip';
      } catch {
        // Autoplay can be refused before the first user gesture; fall through.
      }
    }
    return this.#synthesize(this.language === 'fr' ? phrase.fr : phrase.ar);
  }

  /**
   * Speaks free text written on the keyboard.
   * @param {string} text
   * @param {'ar'|'fr'} language Arabic letters use an Arabic voice; Latin letters a French one
   */
  speakText(text, language = this.language) {
    this.stop();
    const previous = this.language;
    this.language = language;
    const result = this.#synthesize(text);
    this.language = previous;
    return result;
  }

  stop() {
    this.currentAudio?.pause();
    this.currentAudio = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  #synthesize(text) {
    if (!('speechSynthesis' in window)) return 'none';
    const utterance = new SpeechSynthesisUtterance(text);
    const wanted = this.language === 'fr' ? ['fr-FR', 'fr'] : ['ar-TN', 'ar-SA', 'ar'];
    const voices = window.speechSynthesis.getVoices();
    const voice = wanted.map((lang) => voices.find((v) => v.lang.startsWith(lang))).find(Boolean);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? wanted[0];
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
    return 'synthetic';
  }
}

function clipUrl(id) {
  return `/audio/${encodeURIComponent(id)}.mp3`;
}

/** Recorded clips are listed in audio/manifest.json (written by `npm run setup`). */
async function hasClip(id) {
  manifest ??= fetch('/audio/manifest.json')
    .then((r) => (r.ok ? r.json() : { clips: [] }))
    .then((data) => new Set(data.clips ?? []))
    .catch(() => new Set());
  return (await manifest).has(id);
}
