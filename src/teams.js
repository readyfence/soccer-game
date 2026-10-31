// Fictional youth clubs from towns around Maple Grove, Minnesota. Club nicknames and every
// player are invented: names are random pairings of common first and last names, so no
// team, badge or player represents a real club or person.
//
// Roster order matches the 4-3-3 formation in game.js:
// GK, RB, RCB, LCB, LB, RCM, CDM, LCM, RW, ST, LW (then 7 substitutes)

export const SLOT_LABELS = ['GK', 'RB', 'RCB', 'LCB', 'LB', 'RCM', 'CDM', 'LCM', 'RW', 'ST', 'LW'];
export const SLOT_POS = ['GK', 'RB', 'CB', 'CB', 'LB', 'CM', 'CDM', 'CM', 'RW', 'ST', 'LW'];
export const SLOT_NUMS = [1, 2, 4, 5, 3, 8, 6, 10, 7, 9, 11];
export const BENCH_POS = ['GK', 'CB', 'LB', 'CM', 'CM', 'RW', 'ST'];
export const POS_ROLE = { GK: 'GK', RB: 'DEF', CB: 'DEF', LB: 'DEF', CM: 'MID', CDM: 'MID', RW: 'FWD', ST: 'FWD', LW: 'FWD' };
export const POSITIONS = Object.keys(POS_ROLE);

// The career ladder. `level` is a typical overall rating for a team at that age.
export const AGE_BANDS = [
  { id: 'u8', label: 'U8', tier: 'Rec League', level: 34 },
  { id: 'u10', label: 'U10', tier: 'Rec League', level: 41 },
  { id: 'u12', label: 'U12', tier: 'Travel League', level: 48 },
  { id: 'u14', label: 'U14', tier: 'Travel League', level: 55 },
  { id: 'u16', label: 'U16', tier: 'Academy League', level: 63, academy: true },
  { id: 'u18', label: 'U18', tier: 'Academy League', level: 70, academy: true },
];
export const PRO_CLUB = { name: 'North Woods FC', short: 'NWF' };
export const PRO_CALLUP_OVR = 76;

// Local towns with invented nicknames and colours.
// kit: [shirt, shorts, socks, trim, number, away shirt, away shorts, gk]
const TOWN_DATA = [
  ['mgm', 'Maple Grove', 'Mallards', 'MGM', [0x1f6f3f, 0xffffff, 0x1f6f3f, 0xf2c200, '#ffffff', 0xf2c200, 0x1f6f3f, 0xff6a00]],
  ['oso', 'Osseo', 'Otters', 'OSO', [0x6b3a1e, 0xf4e7d0, 0x6b3a1e, 0xf4e7d0, '#f4e7d0', 0xf4e7d0, 0x6b3a1e, 0x16a3c4]],
  ['ply', 'Plymouth', 'Pines', 'PLY', [0x0f4d2e, 0x0f4d2e, 0xffffff, 0xffffff, '#ffffff', 0xffffff, 0x0f4d2e, 0xe0218a]],
  ['bpk', 'Brooklyn Park', 'Badgers', 'BPK', [0x2d2d2d, 0x2d2d2d, 0x2d2d2d, 0xffffff, '#ffffff', 0xffffff, 0x2d2d2d, 0x7ad400]],
  ['cha', 'Champlin', 'Comets', 'CHA', [0x3b2bb8, 0xffffff, 0x3b2bb8, 0xffd400, '#ffd400', 0xffd400, 0x3b2bb8, 0xff3d00]],
  ['rog', 'Rogers', 'Rockets', 'ROG', [0xd7261e, 0x111111, 0xd7261e, 0xffffff, '#ffffff', 0xffffff, 0x111111, 0x00c2a8]],
  ['day', 'Dayton', 'Dragonflies', 'DAY', [0x00a6a6, 0x0b2340, 0x00a6a6, 0xffffff, '#0b2340', 0x0b2340, 0x0b2340, 0xffd400]],
  ['cor', 'Corcoran', 'Coyotes', 'COR', [0xb5651d, 0x1a1a1a, 0xb5651d, 0x1a1a1a, '#1a1a1a', 0x1a1a1a, 0x1a1a1a, 0x36c9ff]],
  ['way', 'Wayzata', 'Walleyes', 'WAY', [0xe8b400, 0x0b3d91, 0xe8b400, 0x0b3d91, '#0b3d91', 0x0b3d91, 0x0b3d91, 0x16c24b]],
  ['med', 'Medina', 'Moose', 'MED', [0x5a2d82, 0x5a2d82, 0x5a2d82, 0xd9c27a, '#d9c27a', 0xd9c27a, 0x5a2d82, 0xff8c00]],
  ['han', 'Hanover', 'Hawks', 'HAN', [0x8b0000, 0xffffff, 0x8b0000, 0xc0c0c0, '#ffffff', 0xc0c0c0, 0x8b0000, 0x00b3ff]],
  ['ots', 'Otsego', 'Owls', 'OTS', [0x1b1b5e, 0x1b1b5e, 0xff8f1f, 0xff8f1f, '#ff8f1f', 0xff8f1f, 0x1b1b5e, 0x66e000]],
  ['stm', 'St. Michael', 'Stars', 'STM', [0x0a7cc1, 0xffffff, 0x0a7cc1, 0xffffff, '#ffffff', 0xffffff, 0x0a7cc1, 0xff2d8a]],
  ['alb', 'Albertville', 'Arrows', 'ALB', [0xff6a13, 0x222222, 0xff6a13, 0x222222, '#222222', 0x222222, 0x222222, 0x00e0d0]],
  ['rob', 'Robbinsdale', 'Ravens', 'ROB', [0x121212, 0x121212, 0xc8102e, 0xc8102e, '#ffffff', 0xc8102e, 0x121212, 0xffe100]],
  ['nwh', 'New Hope', 'Herons', 'NWH', [0x7fc8f8, 0x0d3b66, 0x7fc8f8, 0x0d3b66, '#0d3b66', 0x0d3b66, 0x0d3b66, 0xff4f00]],
  ['cry', 'Crystal', 'Cranes', 'CRY', [0xe6e6f0, 0x4b2c83, 0xe6e6f0, 0x4b2c83, '#4b2c83', 0x4b2c83, 0x4b2c83, 0x2bb673]],
  ['gvl', 'Golden Valley', 'Gophers', 'GVL', [0xc99700, 0x3a2a12, 0xc99700, 0x3a2a12, '#3a2a12', 0x3a2a12, 0x3a2a12, 0x1e90ff]],
];

export const TOWNS = TOWN_DATA.map(([id, town, nick, short, k]) => ({
  id,
  town,
  nickname: nick,
  short,
  home: { shirt: k[0], shorts: k[1], socks: k[2], trim: k[3], number: k[4] },
  away: { shirt: k[5], shorts: k[6], socks: k[5], trim: k[0], number: hexCss(k[0]) },
  gk: { shirt: k[7], shorts: 0x1a1a1a, socks: k[7] },
}));

function hexCss(n) {
  return `#${(n >>> 0).toString(16).padStart(6, '0')}`;
}

export function findTown(id) {
  return TOWNS.find((t) => t.id === id) || null;
}

// ---------------------------------------------------------------- random names

const FIRST = [
  'Aiden', 'Ben', 'Caleb', 'Dylan', 'Eli', 'Finn', 'Gavin', 'Henry', 'Isaac', 'Jack', 'Kai', 'Leo', 'Mason',
  'Nate', 'Owen', 'Parker', 'Quinn', 'Ryan', 'Sam', 'Tyler', 'Will', 'Xavier', 'Zach', 'Adrian', 'Brody',
  'Carter', 'Diego', 'Ethan', 'Gabe', 'Hudson', 'Ian', 'Jonah', 'Liam', 'Max', 'Noah', 'Omar', 'Rafa', 'Sebastian',
  'Theo', 'Victor', 'Wyatt', 'Ahmed', 'Bao', 'Chris', 'Elias', 'Felix', 'Hamza', 'Jayden', 'Kofi', 'Lucas',
  'Mateo', 'Nico', 'Oscar', 'Pablo', 'Reid', 'Tobias', 'Yusuf', 'Asher', 'Cole', 'Evan',
];
const LAST = [
  'Anderson', 'Berg', 'Carlson', 'Dahl', 'Erickson', 'Fischer', 'Gustafson', 'Hagen', 'Iverson', 'Jensen',
  'Kowalski', 'Lindgren', 'Moe', 'Nelson', 'Olson', 'Peterson', 'Quist', 'Rasmussen', 'Sorensen', 'Thorson',
  'Ueland', 'Vang', 'Wold', 'Xiong', 'Yang', 'Ziegler', 'Ali', 'Brandt', 'Christensen', 'Duong', 'Engstrom',
  'Flores', 'Garcia', 'Holm', 'Ibrahim', 'Johansson', 'Kline', 'Lor', 'Mendoza', 'Nguyen', 'Osei', 'Pham',
  'Ramirez', 'Strand', 'Torres', 'Vasquez', 'Warsame', 'Hanson', 'Lund', 'Moua', 'Novak', 'Ortiz', 'Sandberg',
];

// Small seeded RNG so a club's players are the same every time it is built.
export function rng(seed) {
  let h = 2166136261 ^ String(seed).length;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pickFrom = (r, list) => list[Math.floor(r() * list.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function backName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return (parts[parts.length - 1] || 'PLAYER').toUpperCase().slice(0, 14);
}

// ---------------------------------------------------------------- stats

// Overall from the four stats, weighted by role (the trainer device uses the same weights).
const OVR_WEIGHTS = {
  GK: [0.05, 0, 0.15, 0.8],
  DEF: [0.2, 0.05, 0.2, 0.55],
  MID: [0.2, 0.25, 0.4, 0.15],
  FWD: [0.3, 0.45, 0.2, 0.05],
};

export function roleOf(pos) {
  return POS_ROLE[pos] || 'FWD';
}

export function computeOvr(pl) {
  const w = OVR_WEIGHTS[roleOf(pl.pos)];
  const v = w[0] * pl.pac + w[1] * pl.sho + w[2] * pl.pas + w[3] * pl.def;
  return clamp(Math.round(v), 1, 99);
}

// Stat shape per role, relative to the team level (weighted so overall ~= level).
const ROLE_SHAPE = {
  GK: [-12, -25, -8, 4],
  DEF: [-2, -15, -4, 5],
  MID: [0, -2, 4, -6],
  FWD: [3, 3, -3, -25],
};

// Celebration ids from celebrations.js (kept as a list so this file has no 3D imports).
export const CELEBRATION_IDS = ['jumpSpin', 'skyPoint', 'armsCrossed', 'zen', 'armsWide', 'dance', 'prayer', 'iceSlide', 'cold', 'mask', 'kiss'];
const CELE_IDS = CELEBRATION_IDS;

export function makePlayer(r, { pos, num, level, idPrefix, index }) {
  const name = `${pickFrom(r, FIRST)} ${pickFrom(r, LAST)}`;
  const shape = ROLE_SHAPE[roleOf(pos)];
  const spread = () => Math.round((r() - 0.5) * 10);
  const stat = (i) => clamp(level + shape[i] + spread(), 12, 99);
  const pl = {
    id: `${idPrefix}-${index}`,
    name,
    back: backName(name),
    num,
    pos,
    pac: stat(0),
    sho: stat(1),
    pas: stat(2),
    def: stat(3),
    celebration: r() < 0.35 ? pickFrom(r, CELE_IDS) : null,
  };
  pl.ovr = computeOvr(pl);
  return pl;
}

// 11 starters in formation order plus 7 substitutes.
export function generateSquad(seed, level, idPrefix = seed) {
  const r = rng(seed);
  const starters = SLOT_POS.map((pos, i) => makePlayer(r, { pos, num: SLOT_NUMS[i], level, idPrefix, index: i }));
  const bench = BENCH_POS.map((pos, i) => makePlayer(r, {
    pos, num: 12 + i, level: level - 2, idPrefix, index: 11 + i,
  }));
  return { players: starters, bench };
}

// ---------------------------------------------------------------- clubs

export function clubName(town, nickname) {
  return `${town} ${nickname}`.trim();
}

function badgeFor(home) {
  return [hexCss(home.shirt), hexCss(home.trim), hexCss(home.shorts)];
}

// An AI club for an age band. `variance` nudges strength so leagues have good and weak sides.
export function makeClub(town, band, { seed = '', variance = 0 } = {}) {
  const level = band.level + variance;
  const { players, bench } = generateSquad(`${town.id}:${band.id}:${seed}`, level, `${town.id}-${band.id}`);
  return {
    id: `${town.id}-${band.id}`,
    kind: band.academy ? 'academy' : 'local',
    name: clubName(town.town, town.nickname),
    short: town.short,
    town: town.town,
    badge: badgeFor(town.home),
    home: { ...town.home },
    away: { ...town.away },
    gk: { ...town.gk },
    players,
    bench,
  };
}

// Clubs for quick friendlies: every town at U14 strength.
const FRIENDLY_BAND = AGE_BANDS[3];
export const TEAMS = TOWNS.map((t, i) => makeClub(t, FRIENDLY_BAND, { variance: ((i * 7) % 9) - 4 }));

// ---------------------------------------------------------------- engine helpers

function defaultLon(pl) {
  return clamp(Math.round(pl.sho * 0.78 + pl.pas * 0.16), 10, 92);
}
function defaultFin(pl) {
  return clamp(Math.round(pl.sho * 0.5 + pl.pas * 0.44), 10, 92);
}

export function shotTraits(pl) {
  return { lon: pl.lon ?? defaultLon(pl), fin: pl.fin ?? defaultFin(pl) };
}

function withRole(pl) {
  return { ...pl, role: roleOf(pl.pos) };
}

export function makeBench(club) {
  if (Array.isArray(club.bench) && club.bench.length) return club.bench.map(withRole);
  const level = teamRating(club) - 2;
  return generateSquad(`${club.id}:bench`, level, `${club.id}-b`).bench.map(withRole);
}

export function teamRating(club) {
  const s = club.players.reduce((a, pl) => a + pl.ovr, 0);
  return Math.round(s / club.players.length);
}

function hexDist(a, b) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return Math.hypot(ar - br, ag - bg, ab - bb) / 441;
}

export function kitsClash(a, b) {
  return hexDist(a.shirt, b.shirt) < 0.3 || hexDist(a.shorts, b.shorts) + hexDist(a.shirt, b.shirt) < 0.45;
}

// A plain contrasting kit for when neither of a club's kits works.
function contrastKit(against) {
  const dark = ((against.shirt >> 16) & 255) * 0.3 + ((against.shirt >> 8) & 255) * 0.59 + (against.shirt & 255) * 0.11 > 128;
  return dark
    ? { shirt: 0x1a1a2e, shorts: 0x1a1a2e, socks: 0x1a1a2e, trim: 0xffffff, number: '#ffffff' }
    : { shirt: 0xf4f4f4, shorts: 0xf4f4f4, socks: 0xf4f4f4, trim: 0x111111, number: '#111111' };
}

// The user's club keeps its home kit; the opponent changes to its away kit (or a plain
// contrasting one) when the colours are too close to tell apart.
export function resolveKits(userClub, aiClub) {
  const user = userClub.home;
  if (userClub.id !== aiClub.id && !kitsClash(user, aiClub.home)) return { user, ai: aiClub.home };
  if (!kitsClash(user, aiClub.away)) return { user, ai: aiClub.away };
  return { user, ai: contrastKit(user) };
}
