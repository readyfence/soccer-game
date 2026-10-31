// Match sound: recorded effects (generated with ElevenLabs, in public/audio/sfx) layered on
// the original synthesised crowd. Every effect falls back to a synthesised version until its
// sample has loaded, or if it fails to load, so the game is never silent.

const SFX_BASE = `${import.meta.env?.BASE_URL ?? '/'}audio/sfx/`;
const SAMPLES = [
  'kick_hard', 'kick_soft', 'header', 'tackle', 'whistle', 'net', 'post',
  'crowd_goal', 'crowd_groan', 'applause', 'crowd_bed',
];

export class Sfx {
  constructor() {
    this.ctx = null;
    this.crowdGain = null;
    this.base = 0.07;
    this.buffers = new Map();
    this.lastCheer = -10;
  }

  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);
    // Commentary and effects go through separate buses so commentary can duck the crowd.
    this.fx = ctx.createGain();
    this.fx.connect(this.master);
    this.crowdBus = ctx.createGain();
    this.crowdBus.connect(this.master);

    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = last * 0.97 + w * 0.03;
        d[i] = last * 6 + w * 0.08;
      }
    }
    this.noiseBuf = buf;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.5;
    this.crowdFilter = bp;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = this.base;
    src.connect(bp).connect(this.crowdGain).connect(this.crowdBus);
    src.start();
    this.loadSamples();
  }

  async loadSamples() {
    await Promise.all(SAMPLES.map(async (name) => {
      try {
        const res = await fetch(`${SFX_BASE}${name}.mp3`);
        if (!res.ok) return;
        const data = await res.arrayBuffer();
        const audio = await new Promise((resolve, reject) => this.ctx.decodeAudioData(data, resolve, reject));
        this.buffers.set(name, audio);
      } catch { /* keep the synthesised fallback */ }
    }));
    this.startBed();
  }

  // Sideline chatter from parents and families, looped quietly under the synthesised hum.
  startBed() {
    const bed = this.buffers.get('crowd_bed');
    if (!bed || this.bed) return;
    const src = this.ctx.createBufferSource();
    src.buffer = bed;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0.35;
    src.connect(g).connect(this.crowdBus);
    src.start();
    this.bed = src;
  }

  play(name, { gain = 1, rate = 1, delay = 0 } = {}) {
    const buffer = this.buffers.get(name);
    if (!this.ctx || !buffer) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.fx);
    src.start(this.ctx.currentTime + delay);
    return true;
  }

  // Lower the crowd while the commentator speaks.
  duck(seconds) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.crowdBus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.55, t + 0.08);
    g.setValueAtTime(0.55, t + Math.max(0.1, seconds));
    g.linearRampToValueAtTime(1, t + Math.max(0.1, seconds) + 0.4);
  }

  swell(amount, dur = 3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.crowdGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(this.base + amount * 0.35, t + 0.25);
    g.linearRampToValueAtTime(this.base, t + dur);
    const f = this.crowdFilter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.linearRampToValueAtTime(700 + amount * 700, t + 0.25);
    f.linearRampToValueAtTime(700, t + dur);
  }

  // ---- crowd reactions

  cheer(amount = 1) {
    if (!this.ctx) return;
    this.swell(1.2 * amount, 5);
    const now = this.ctx.currentTime;
    if (now - this.lastCheer < 1.5) return;
    this.lastCheer = now;
    this.play('crowd_goal', { gain: 0.9 * Math.min(1.2, amount) });
    this.play('applause', { gain: 0.5, delay: 1.6 });
  }

  groan(amount = 1) {
    this.swell(0.55 * amount, 2.5);
    this.play('crowd_groan', { gain: 0.45 + 0.35 * Math.min(1, amount) });
  }

  applause(amount = 1) {
    this.swell(0.5 * amount, 2.5);
    this.play('applause', { gain: 0.6 * Math.min(1.2, amount) });
  }

  // ---- ball

  net(power = 1) {
    this.play('net', { gain: 0.5 + 0.4 * Math.min(1, power) });
  }

  header() {
    if (!this.play('header', { gain: 0.8, rate: 0.95 + Math.random() * 0.1 })) this.kick(0.3);
  }

  tackle() {
    this.play('tackle', { gain: 0.7, rate: 0.95 + Math.random() * 0.1 });
  }

  whistle(long = false) {
    if (!this.ctx) return;
    if (this.buffers.has('whistle')) {
      // Two short blasts then a long one for half and full time.
      if (long) {
        this.play('whistle', { gain: 0.5, rate: 1.0 });
        this.play('whistle', { gain: 0.5, rate: 1.02, delay: 0.42 });
        this.play('whistle', { gain: 0.55, rate: 0.98, delay: 0.85 });
        this.play('whistle', { gain: 0.45, rate: 0.98, delay: 1.25 });
      } else {
        this.play('whistle', { gain: 0.5 });
      }
      return;
    }
    const ctx = this.ctx;
    const blasts = long ? [[0, 0.35], [0.45, 0.35], [0.9, 0.9]] : [[0, 0.45]];
    for (const [off, len] of blasts) {
      const t = ctx.currentTime + off;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 2950;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 38;
      const lg = ctx.createGain();
      lg.gain.value = 120;
      lfo.connect(lg).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.02);
      g.gain.setValueAtTime(0.06, t + len - 0.05);
      g.gain.linearRampToValueAtTime(0, t + len);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 4000;
      o.connect(lp).connect(g).connect(this.fx);
      o.start(t);
      lfo.start(t);
      o.stop(t + len);
      lfo.stop(t + len);
    }
  }

  kick(power = 0.5) {
    if (!this.ctx) return;
    const sample = power > 0.45 ? 'kick_hard' : 'kick_soft';
    const rate = 0.92 + Math.random() * 0.16;
    if (this.play(sample, { gain: 0.35 + power * 0.65, rate })) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    const g = ctx.createGain();
    const v = 0.15 + power * 0.35;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g).connect(this.fx);
    o.start(t);
    o.stop(t + 0.2);

    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(v * 0.25, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(hp).connect(ng).connect(this.fx);
    n.start(t, Math.random() * 2, 0.08);
  }

  post() {
    if (!this.ctx) return;
    if (this.play('post', { gain: 0.85 })) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (const f of [520, 1310, 2090]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.connect(g).connect(this.fx);
      o.start(t);
      o.stop(t + 0.65);
    }
  }
}
