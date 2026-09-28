export class Sfx {
  constructor() {
    this.ctx = null;
    this.crowdGain = null;
    this.base = 0.07;
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
    src.connect(bp).connect(this.crowdGain).connect(this.master);
    src.start();
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

  whistle(long = false) {
    if (!this.ctx) return;
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
      o.connect(lp).connect(g).connect(this.master);
      o.start(t);
      lfo.start(t);
      o.stop(t + len);
      lfo.stop(t + len);
    }
  }

  kick(power = 0.5) {
    if (!this.ctx) return;
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
    o.connect(g).connect(this.master);
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
    n.connect(hp).connect(ng).connect(this.master);
    n.start(t, Math.random() * 2, 0.08);
  }

  post() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (const f of [520, 1310, 2090]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.65);
    }
  }
}
