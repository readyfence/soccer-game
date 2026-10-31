// Bridge between Socker 26 and the handheld Trainer (M5Stack CoreS3, see trainer/).
//
// The game and the device talk by top-level page navigation rather than fetch(), so it
// works from Safari, an iPad, and an https copy of the game alike (a page can always
// navigate to a plain-http LAN address; it cannot fetch one).
//
//   Send:  game  -> http://<trainer>/send#<payload>        device stores the player
//   Sync:  game  -> http://<trainer>/sync?to=<game url>   device redirects back to
//          <game url>#trainer=<payload>                   with the trained stats
//
// Trained players are stored as stat deltas keyed by player name, so every version of a
// player (current squad, prime legend, dream team draft) gets the same training.

const STORE_KEY = 'socker26.trainer';
const STORE_VERSION = 1;
export const DEFAULT_HOST = 'soccer-trainer.local';
export const PROTOCOL_VERSION = 1;

const STATS = ['pac', 'sho', 'pas', 'def', 'ovr'];
const MAX_DELTA = 40;

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

// ---------- storage ----------

let memory = null;

function store() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* ignore */ }
  if (!memory) {
    const map = new Map();
    memory = {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => { map.set(k, String(v)); },
      removeItem: (k) => { map.delete(k); },
    };
  }
  return memory;
}

function emptyState() {
  return { version: STORE_VERSION, host: DEFAULT_HOST, players: {} };
}

export function loadTrainer() {
  try {
    const raw = store().getItem(STORE_KEY);
    if (!raw) return emptyState();
    const s = JSON.parse(raw);
    if (!s || s.version !== STORE_VERSION || typeof s.players !== 'object' || !s.players) return emptyState();
    return { ...emptyState(), ...s };
  } catch {
    return emptyState();
  }
}

function saveTrainer(state) {
  try { store().setItem(STORE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  cache = state;
}

let cache = null;
function state() {
  if (!cache) cache = loadTrainer();
  return cache;
}

export function trainerHost() {
  return state().host || DEFAULT_HOST;
}

export function setTrainerHost(host) {
  const clean = String(host || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '');
  saveTrainer({ ...state(), host: clean || DEFAULT_HOST });
  return trainerHost();
}

export function trainedRecord(name) {
  return state().players[String(name || '')] || null;
}

export function trainedList() {
  return Object.entries(state().players)
    .map(([name, rec]) => ({ name, ...rec }))
    .sort((a, b) => (b.at || 0) - (a.at || 0));
}

export function forgetTrained(name) {
  const s = state();
  if (!s.players[name]) return;
  const players = { ...s.players };
  delete players[name];
  saveTrainer({ ...s, players });
}

// ---------- applying training to player data ----------

function deltasOf(rec) {
  const d = rec?.train;
  if (!Array.isArray(d)) return null;
  return STATS.map((_, i) => clampInt(d[i], 0, MAX_DELTA));
}

// Returns a copy of the player with training applied, or the player itself if untrained.
// Safe to call on already-trained data: the copy remembers its untrained source.
export function withTraining(pl) {
  if (!pl || pl.trained) return pl;
  const d = deltasOf(trainedRecord(pl.name));
  if (!d || d.every((v) => v === 0)) return pl;
  const up = (v, k) => clampInt((Number(v) || 0) + k, 1, 99);
  const out = {
    ...pl,
    pac: up(pl.pac, d[0]),
    sho: up(pl.sho, d[1]),
    pas: up(pl.pas, d[2]),
    def: up(pl.def, d[3]),
    ovr: up(pl.ovr, d[4]),
    trained: { pac: d[0], sho: d[1], pas: d[2], def: d[3], ovr: d[4] },
  };
  if (Number.isFinite(pl.lon)) out.lon = up(pl.lon, Math.round(d[1] * 0.78 + d[2] * 0.16));
  if (Number.isFinite(pl.fin)) out.fin = up(pl.fin, Math.round(d[1] * 0.5 + d[2] * 0.44));
  return out;
}

// ---------- payload encoding ----------

export function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(code) {
  const b64 = String(code || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const ASCII_MAP = {
  ß: 'ss', ø: 'o', Ø: 'O', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', đ: 'd', Đ: 'D', ł: 'l', Ł: 'L', ı: 'i', þ: 'th', ð: 'd',
};

// The device's fonts are ASCII only, so names are sent pre-folded ("Mbappé" -> "Mbappe").
export function asciiName(s) {
  return String(s || '')
    .replace(/[ßøØæÆœŒđĐłŁıþð]/g, (c) => ASCII_MAP[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .trim();
}

const ROLE_OF = { GK: 'GK', RB: 'DEF', CB: 'DEF', LB: 'DEF', CM: 'MID', CDM: 'MID', RW: 'FWD', ST: 'FWD', LW: 'FWD' };

// Builds the JSON the device receives. `pl` is a roster/star-pool player (untrained values),
// `team` is the club or nation it came from (for the kit colours), `look` its appearance.
export function sendPayload(pl, { team, look, ret, now = Date.now(), tzMinutes } = {}) {
  const rec = trainedRecord(pl.name);
  const base = STATS.map((k) => clampInt(pl[k], 1, 99));
  const train = deltasOf(rec) || [0, 0, 0, 0, 0];
  const kit = team?.home || { shirt: 0x111111, shorts: 0x111111, number: '#ffd400' };
  const numberColour = typeof kit.number === 'string' ? parseInt(kit.number.replace('#', ''), 16) : 0xffffff;
  const tz = Number.isFinite(tzMinutes) ? tzMinutes : -new Date(now).getTimezoneOffset();
  return {
    v: PROTOCOL_VERSION,
    name: pl.name,
    ascii: asciiName(pl.name) || 'Player',
    back: asciiName(pl.back || pl.name).toUpperCase().slice(0, 14),
    num: clampInt(pl.num, 1, 99),
    pos: pl.pos || 'ST',
    role: ROLE_OF[pl.pos] || 'FWD',
    club: asciiName(team?.short || pl.club || '').slice(0, 4),
    base,
    train,
    kit: [kit.shirt >>> 0, kit.shorts >>> 0, Number.isFinite(numberColour) ? numberColour : 0xffffff],
    look: look
      ? { tone: clampInt(look.tone, 0, 6), hair: look.hair, hc: look.hairColour, beard: clampInt(look.beard, 0, 2) }
      : { tone: 2, hair: 'crop', hc: 'dark', beard: 0 },
    ret: ret || '',
    now,
    tz,
  };
}

function trainerOrigin() {
  return `http://${trainerHost()}`;
}

export function sendUrl(payload) {
  return `${trainerOrigin()}/send#${toBase64Url(JSON.stringify(payload))}`;
}

export function syncUrl(returnTo) {
  return `${trainerOrigin()}/sync?to=${encodeURIComponent(returnTo)}`;
}

// Best-effort check that the trainer is reachable. Browsers block this from an https page
// (mixed content), so a failure only means "couldn't confirm", never "not there".
export async function pingTrainer(timeoutMs = 2500) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), timeoutMs);
  try {
    const res = await fetch(`${trainerOrigin()}/ping`, { signal: ctrl?.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- receiving trained players back ----------

export function parseSyncPayload(code) {
  let data;
  try {
    data = JSON.parse(fromBase64Url(code));
  } catch {
    return null;
  }
  if (!data || data.v !== PROTOCOL_VERSION || typeof data.name !== 'string' || !data.name.trim()) return null;
  if (!Array.isArray(data.train) || data.train.length < 5) return null;
  const train = data.train.slice(0, 5).map((v) => clampInt(v, 0, MAX_DELTA));
  const log = data.log && typeof data.log === 'object' ? data.log : {};
  return {
    name: data.name.trim(),
    train,
    coach: typeof data.coach === 'string' ? data.coach.slice(0, 24) : '',
    log: {
      steps: clampInt(log.steps, 0, 1e9),
      runMin: clampInt(log.runMin, 0, 1e7),
      sessions: clampInt(log.sessions, 0, 1e6),
      sessionMin: clampInt(log.sessionMin, 0, 1e7),
      games: clampInt(log.games, 0, 1e6),
      days: clampInt(log.days, 0, 1e5),
    },
  };
}

export function recordSync(parsed, at = Date.now()) {
  const s = state();
  const prev = s.players[parsed.name];
  const players = {
    ...s.players,
    [parsed.name]: { train: parsed.train, coach: parsed.coach, log: parsed.log, at, prev: prev?.train || null },
  };
  saveTrainer({ ...s, players });
  return players[parsed.name];
}

// Reads `#trainer=<payload>` left by the device's redirect, stores it and cleans the URL.
// Returns { name, train, gained } or null.
export function consumeSyncFromLocation(loc = typeof location !== 'undefined' ? location : null) {
  if (!loc) return null;
  const m = /(?:^#|&)trainer=([A-Za-z0-9_-]+)/.exec(loc.hash || '');
  if (!m) return null;
  try {
    if (typeof history !== 'undefined' && history.replaceState) {
      history.replaceState(null, '', `${loc.pathname}${loc.search}`);
    }
  } catch { /* ignore */ }
  const parsed = parseSyncPayload(m[1]);
  if (!parsed) return { error: 'That trainer link was damaged. Try syncing again.' };
  const before = deltasOf(trainedRecord(parsed.name)) || [0, 0, 0, 0, 0];
  recordSync(parsed);
  const gained = parsed.train.map((v, i) => v - before[i]);
  return { name: parsed.name, train: parsed.train, gained, coach: parsed.coach, log: parsed.log };
}

export function deltaLabel(train) {
  const names = ['PAC', 'SHO', 'PAS', 'DEF'];
  const parts = names.map((n, i) => (train[i] > 0 ? `${n} +${train[i]}` : '')).filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No stat gains yet';
}
