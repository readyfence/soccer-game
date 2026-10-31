const LEAD_NAMES = [
  'Daniel', 'Arthur', 'Oliver', 'Google UK English Male',
  'Microsoft Ryan', 'Microsoft George', 'Microsoft Thomas', 'Jamie', 'Reed', 'Eddy',
];
const CO_NAMES = [
  'Serena', 'Kate', 'Google UK English Female',
  'Microsoft Sonia', 'Microsoft Libby', 'Microsoft Hazel', 'Martha', 'Stephanie',
  'Shelley', 'Flo', 'Sandy',
];
const URGENT = /GOAL|RED CARD|win the shootout|scores!/i;
const MAX_QUEUE = 2;

// Android/Chrome report 'en_GB' while desktop browsers use 'en-GB'.
const langOf = (v) => (v.lang || '').replace('_', '-').toLowerCase();

function rankVoice(v, names) {
  const i = names.findIndex((n) => v.name.startsWith(n));
  if (i < 0) return -1;
  const premium = /premium|enhanced|neural|natural/i.test(v.name) ? 0.5 : 0;
  return names.length - i + premium;
}

function bestVoice(voices, names, exclude) {
  let best = null;
  let bestRank = -1;
  for (const v of voices) {
    if (v === exclude) continue;
    const r = rankVoice(v, names);
    if (r > bestRank) {
      best = v;
      bestRank = r;
    }
  }
  return best;
}

export class Commentary {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.lead = null;
    this.co = null;
    this.pending = new Set();
    this.lastCo = true;
    this.muted = false;
    if (!this.synth) return;
    this.pickVoices();
    this.synth.addEventListener?.('voiceschanged', () => this.pickVoices());
  }

  pickVoices() {
    const voices = this.synth.getVoices();
    if (!voices.length) return;
    const gb = voices.filter((v) => langOf(v) === 'en-gb');
    const en = voices.filter((v) => langOf(v).startsWith('en'));
    const pool = gb.length ? gb : en;
    this.lead = bestVoice(pool, LEAD_NAMES)
      || bestVoice(pool, CO_NAMES)
      || pool[0]
      || null;
    this.co = bestVoice(pool, CO_NAMES, this.lead)
      || bestVoice(pool, LEAD_NAMES, this.lead)
      || pool.find((v) => v !== this.lead)
      || this.lead;
  }

  setMuted(on) {
    this.muted = on;
    if (on && this.synth) {
      this.synth.cancel();
      this.pending.clear();
    }
  }

  say(text) {
    if (!this.synth || this.muted || !text) return;
    const urgent = URGENT.test(text);
    if (this.pending.size >= MAX_QUEUE) {
      if (!urgent) return;
      this.synth.cancel();
      this.pending.clear();
    }
    const co = !urgent && !this.lastCo && Math.random() < 0.4;
    this.lastCo = co;
    const u = new SpeechSynthesisUtterance(text.replace(/\s*·\s*/g, ', '));
    u.lang = 'en-GB';
    const voice = co ? this.co : this.lead;
    if (voice) u.voice = voice;
    u.rate = urgent ? 1.15 : 1.05;
    u.pitch = co ? 1.0 : urgent ? 1.1 : 0.95;
    const done = () => this.pending.delete(u);
    u.onend = done;
    u.onerror = done;
    this.pending.add(u);
    this.synth.speak(u);
  }
}
