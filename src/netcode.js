// Pure helpers for online two-player: room codes, input packets, snapshots and the
// guest's interpolation buffer. No DOM, no networking, so they run under node tests.
//
// Model: the host runs the match. The guest sends its controller input (it plays the
// second human, like P2 in local versus) and draws the snapshots the host sends back.

export const PROTOCOL = 1;
export const PEER_PREFIX = 'socker26-';
// No 0/O, 1/I/L: easy to read out over the phone.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;
export const SNAPSHOT_HZ = 25;
export const INTERP_DELAY = 0.1; // seconds the guest renders behind the newest snapshot

export function makeRoomCode(random = Math.random) {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return out;
}

// Accepts what people type (lower case, spaces, dashes). Returns null if it can't be a code.
export function normalizeCode(text) {
  const cleaned = String(text || '').toUpperCase().replace(/[\s-]+/g, '');
  const ok = cleaned.length === CODE_LENGTH && [...cleaned].every((c) => CODE_ALPHABET.includes(c));
  return ok ? cleaned : null;
}

export function peerIdFor(code) {
  return `${PEER_PREFIX}${code}`;
}

// ---------------------------------------------------------------- input

const ACTIONS = ['shot', 'pass', 'through', 'cross', 'chip', 'power', 'finesse', 'bicycle', 'clear',
  'tackle', 'slide', 'dive', 'switch', 'skip'];

const r3 = (v) => Math.round((Number(v) || 0) * 1000) / 1000;

// Packs one guest input frame (as returned by Input.frame().slots[0]) plus the presses and
// releases accumulated since the last packet.
export function encodeInput(frame, pressed, released) {
  return {
    m: [r3(frame?.move?.x), r3(frame?.move?.z)],
    c: [r3(frame?.curve?.x), r3(frame?.curve?.z)],
    s: frame?.sprint ? 1 : 0,
    k: frame?.ctrl ? 1 : 0,
    d: [...(frame?.down ?? [])].filter((a) => ACTIONS.includes(a)),
    p: [...(pressed ?? [])].filter((a) => ACTIONS.includes(a)),
    r: [...(released ?? [])].filter((a) => ACTIONS.includes(a)),
  };
}

const clampUnit = (v) => Math.max(-1, Math.min(1, Number(v) || 0));
const actionList = (list) => (Array.isArray(list) ? list.filter((a) => ACTIONS.includes(a)) : []);

// The host's view of the guest's controller. Packets can arrive faster or slower than the
// host's frames, so presses/releases queue up until a frame consumes them.
export class RemoteInput {
  constructor() {
    this.reset();
  }

  reset() {
    this.move = { x: 0, z: 0 };
    this.curve = { x: 0, z: 0 };
    this.sprint = false;
    this.ctrl = false;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
  }

  apply(pkt) {
    if (!pkt || typeof pkt !== 'object') return;
    const m = Array.isArray(pkt.m) ? pkt.m : [0, 0];
    const c = Array.isArray(pkt.c) ? pkt.c : [0, 0];
    this.move = { x: clampUnit(m[0]), z: clampUnit(m[1]) };
    this.curve = { x: clampUnit(c[0]), z: clampUnit(c[1]) };
    this.sprint = !!pkt.s;
    this.ctrl = !!pkt.k;
    for (const a of actionList(pkt.p)) this.pressed.add(a);
    for (const a of actionList(pkt.r)) this.released.add(a);
    this.down = new Set(actionList(pkt.d));
  }

  // One host frame's slot, in the same shape Input.frame() produces.
  takeFrame() {
    const frame = {
      move: { ...this.move },
      curve: { ...this.curve },
      sprint: this.sprint,
      ctrl: this.ctrl,
      down: new Set(this.down),
      pressed: this.pressed,
      released: this.released,
      padIndex: null,
    };
    this.pressed = new Set();
    this.released = new Set();
    return frame;
  }
}

// ---------------------------------------------------------------- snapshots

const q = (v, scale) => Math.round((Number(v) || 0) * scale) / scale;

// players: flat array of stride numbers per player (x, y, z, facing, model state...)
export function encodeSnapshot({ seq, t, players, ball, meta }) {
  return {
    v: PROTOCOL,
    n: seq,
    t: q(t, 1000),
    p: Array.from(players ?? [], (v) => q(v, 1000)),
    b: Array.from(ball ?? [], (v) => q(v, 10000)),
    m: meta ?? {},
  };
}

export function decodeSnapshot(msg) {
  if (!msg || msg.v !== PROTOCOL || !Array.isArray(msg.p) || !Array.isArray(msg.b) || msg.b.length < 7) return null;
  if (!Number.isFinite(msg.t) || !Number.isFinite(msg.n)) return null;
  return { seq: msg.n, t: msg.t, p: msg.p, b: msg.b, meta: msg.m && typeof msg.m === 'object' ? msg.m : {} };
}

// Keeps recent snapshots in order and picks the pair to draw between.
export class SnapshotBuffer {
  constructor(delay = INTERP_DELAY, keep = 40) {
    this.delay = delay;
    this.keep = keep;
    this.frames = [];
    this.lastSeq = -1;
    this.offset = null; // host time minus local time, smoothed
  }

  push(snap, localNow) {
    if (!snap || snap.seq <= this.lastSeq) return false; // late or duplicate
    this.lastSeq = snap.seq;
    this.frames.push(snap);
    if (this.frames.length > this.keep) this.frames.splice(0, this.frames.length - this.keep);
    const off = snap.t - localNow;
    this.offset = this.offset == null ? off : this.offset + (off - this.offset) * 0.1;
    if (off > this.offset) this.offset = off; // never fall further behind than the newest packet allows
    return true;
  }

  latest() {
    return this.frames[this.frames.length - 1] ?? null;
  }

  // Returns { a, b, k } to interpolate at local time `localNow`, or null if empty.
  sample(localNow) {
    const F = this.frames;
    if (!F.length) return null;
    const t = localNow + (this.offset ?? 0) - this.delay;
    if (F.length === 1 || t <= F[0].t) return { a: F[0], b: F[0], k: 0 };
    const newest = F[F.length - 1];
    if (t >= newest.t) return { a: newest, b: newest, k: 0 };
    for (let i = F.length - 1; i > 0; i--) {
      if (F[i - 1].t <= t) {
        const A = F[i - 1];
        const B = F[i];
        const span = B.t - A.t;
        const k = span > 0 ? Math.max(0, Math.min(1, (t - A.t) / span)) : 1;
        return { a: A, b: B, k };
      }
    }
    const last = F[F.length - 1];
    return { a: last, b: last, k: 0 };
  }
}

// ---------------------------------------------------------------- forwarded calls

// HUD, sound and stadium calls made by the host's match are replayed on the guest. Plain
// values pass straight through; objects go through `special` serializers or are dropped.
export function plainArgs(args) {
  return args.map((a) => {
    if (a == null || typeof a === 'number' || typeof a === 'string' || typeof a === 'boolean') return a;
    return null;
  });
}

// Within one batch, a call repeated many times (a meter updating every frame) keeps only
// its newest arguments; one-off calls are kept in order.
export function coalesceCalls(calls, limit = 3) {
  const counts = new Map();
  for (const c of calls) counts.set(c.f, (counts.get(c.f) ?? 0) + 1);
  const lastIndex = new Map();
  calls.forEach((c, i) => lastIndex.set(c.f, i));
  return calls.filter((c, i) => counts.get(c.f) <= limit || lastIndex.get(c.f) === i);
}

// JSON-safe copy (drops functions, cycles and THREE objects).
export function toPlain(value, depth = 0) {
  if (value == null || typeof value !== 'object') return typeof value === 'function' ? undefined : value;
  if (depth > 6) return undefined;
  if (Array.isArray(value)) return value.map((v) => toPlain(v, depth + 1));
  if (value.isObject3D || value.isMaterial || value.isTexture || value.isVector3) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'function') continue;
    const p = toPlain(v, depth + 1);
    if (p !== undefined) out[k] = p;
  }
  return out;
}
