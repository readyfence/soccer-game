import { LINES } from './commentaryLines.js';
import { TOWNS } from './teams.js';

const LEAD_NAMES = [
  'Daniel', 'Arthur', 'Oliver', 'Google UK English Male',
  'Microsoft Ryan', 'Microsoft George', 'Microsoft Thomas', 'Jamie', 'Reed', 'Eddy',
];
const CO_NAMES = [
  'Serena', 'Kate', 'Google UK English Female',
  'Microsoft Sonia', 'Microsoft Libby', 'Microsoft Hazel', 'Martha', 'Stephanie',
  'Shelley', 'Flo', 'Sandy',
];
const URGENT = /GOAL|RED CARD|win the shootout|scores!|strike!|rocket|Thunderbolt|Curled in|corner!|chip!|Dinked|header!|with the head|bicycle|Overhead kick|From distance|Clinical|Tucked away|Back of the net|back of the net|Own goal/i;
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

// Lines with a player's or team's name in them: Jenko says the name-free version.
const PATTERNS = [
  [/^Great tackle by /, 'tackle_great'],
  [/^What a challenge from /, 'tackle_challenge'],
  [/^Comfortable for /, 'save_comfortable'],
  [/^Great save by /, 'save_great'],
  [/^What a save from /, 'save_what'],
  [/ scores!$/, 'he_scores'],
  [/ saves!$/, 'saved'],
  [/^RED CARD!/, 'red'],
  [/^Yellow card/, 'yellow'],
  [/^Throw-in\b/, 'throw_in'],
  [/^Corner kick\b/, 'corner'],
  [/^Goal kick\b/, 'goal_kick'],
  [/^Free kick\b/, 'free_kick'],
  [/^Penalty\b/, 'penalty'],
  [/ win the shootout!$/, 'shootout_win'],
  [/^Substitution window/, 'sub_window'],
  [/ on for .* left$/, 'substitution'],
  [/^W+H+O+A+!?$/i, 'cele_whoa'],
  [/^Ice in the veins/, 'cele_ice'],
  [/^Pointing to the heavens/, 'cele_sky'],
  [/^Total zen/, 'cele_zen'],
  [/^Read that well/, 'read_well'],
  [/^Sliding in/, 'tackle_slide'],
  [/^Audacious chip/, 'goal_chip'],
  [/^Acrobatic finish/, 'acrobatic'],
];

const VOICE_BASE = `${import.meta.env?.BASE_URL ?? '/'}audio/voice/`;
const TOWN_CLIPS = Object.fromEntries(TOWNS.map((t) => [t.town, `town_${t.id}`]));

export function clipFor(text) {
  const clean = String(text || '').trim();
  if (LINES[clean]) return LINES[clean];
  for (const [re, id] of PATTERNS) if (re.test(clean)) return id;
  return null;
}

export class Commentary {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.lead = null;
    this.co = null;
    this.pending = new Set();
    this.lastCo = true;
    this.muted = false;
    // Recorded commentary (Jenko, generated with ElevenLabs).
    this.audio = null;
    this.clips = new Map();
    this.loading = new Map();
    this.failed = 0;
    this.queue = [];
    this.current = null;
    if (!this.synth) return;
    this.pickVoices();
    this.synth.addEventListener?.('voiceschanged', () => this.pickVoices());
  }

  // Share the match audio context (src/audio.js) so clips mix with the crowd and effects.
  useAudio(sfx) {
    this.audio = sfx;
  }

  get recorded() {
    return !!this.audio?.ctx && this.failed < 10;
  }

  preload() {
    if (!this.audio?.ctx) return;
    const ids = new Set([...Object.values(LINES), ...Object.values(TOWN_CLIPS)]);
    for (const id of ids) this.load(id);
  }

  load(id) {
    if (this.clips.has(id)) return Promise.resolve(this.clips.get(id));
    if (this.loading.has(id)) return this.loading.get(id);
    const ctx = this.audio.ctx;
    const p = fetch(`${VOICE_BASE}${id}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((data) => new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject)))
      .then((buf) => {
        this.clips.set(id, buf);
        return buf;
      })
      .catch(() => {
        this.failed++;
        return null;
      });
    this.loading.set(id, p);
    return p;
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
    if (on) this.stopClips();
    if (on && this.synth) {
      this.synth.cancel();
      this.pending.clear();
    }
  }

  stopClips() {
    this.queue = [];
    try { this.current?.stop(); } catch { /* already stopped */ }
    this.current = null;
  }

  // Plays a recorded clip; urgent lines (goals, red cards) cut in, others wait their turn.
  playClip(id, urgent) {
    if (urgent) this.stopClips();
    else if (this.queue.length >= MAX_QUEUE) return;
    this.queue.push(id);
    if (!this.current) this.next();
  }

  async next() {
    const id = this.queue.shift();
    if (!id) return;
    this.current = { stop() {} };
    const buf = await this.load(id);
    const ctx = this.audio?.ctx;
    if (!buf || !ctx || this.muted) {
      this.current = null;
      this.next();
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 1.1;
    src.connect(g).connect(this.audio.master);
    src.onended = () => {
      if (this.current === src) this.current = null;
      setTimeout(() => this.next(), 120);
    };
    this.current = src;
    this.audio.duck?.(buf.duration);
    src.start();
  }

  // Jenko calls the scoring town ("Maple Grove!") after the goal line.
  sayTown(town) {
    const id = TOWN_CLIPS[town];
    if (!id || this.muted || !this.recorded) return;
    this.queue = this.queue.slice(0, 1);
    this.queue.push(id);
    if (!this.current) this.next();
  }

  say(text) {
    if (this.muted || !text) return;
    const urgent = URGENT.test(text);
    if (this.recorded) {
      // Recorded voice only: lines without a clip just show on screen.
      const id = clipFor(text);
      if (id) this.playClip(id, urgent);
      return;
    }
    if (!this.synth) return;
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
