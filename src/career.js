// Career mode: take a local youth team from U8 through to the academy, until one of your
// players is called up by the pro club. Pure logic plus localStorage; no DOM.
//
// Players improve three ways:
//   - matches: XP from their match rating, goals, assists and the result
//   - growing up: a development boost at the end of every season
//   - the handheld trainer: stat points Huxley earns on the device (see trainer.js),
//     applied on top of the career stats wherever the player is used.

import {
  AGE_BANDS, TOWNS, findTown, makeClub, generateSquad, computeOvr, roleOf, backName, rng,
  PRO_CLUB, PRO_CALLUP_OVR, clubName, SLOT_POS, BENCH_POS, POSITIONS,
} from './teams.js';
import { withTraining } from './trainer.js';

export const CAREER_KEY = 'socker26.career';
const VERSION = 1;
export const LEAGUE_SIZE = 8;
export const SQUAD_SIZE = SLOT_POS.length + BENCH_POS.length;
const STATS = ['pac', 'sho', 'pas', 'def'];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------- storage

function store() {
  try { return localStorage; } catch { return null; }
}

export function loadCareer() {
  try {
    const raw = store()?.getItem(CAREER_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.version !== VERSION || !s.club || !Array.isArray(s.squad) || !s.league) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveCareer(state) {
  try { store()?.setItem(CAREER_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  return state;
}

export function clearCareer() {
  try { store()?.removeItem(CAREER_KEY); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- XP and levelling

// Same curve as the trainer device: 40 XP + 3 per point above 40.
export function pointCost(value) {
  return 40 + Math.max(0, value - 40) * 3;
}

function ensureXp(pl) {
  if (!pl.xp || typeof pl.xp !== 'object') pl.xp = { pac: 0, sho: 0, pas: 0, def: 0 };
  return pl.xp;
}

// Adds XP to one player's stats. Returns points gained per stat.
export function addXp(pl, xp) {
  const pool = ensureXp(pl);
  const gained = { pac: 0, sho: 0, pas: 0, def: 0 };
  for (const k of STATS) {
    let v = pool[k] + Math.max(0, Math.round(xp[k] || 0));
    while (pl[k] < 99 && v >= pointCost(pl[k])) {
      v -= pointCost(pl[k]);
      pl[k]++;
      gained[k]++;
    }
    pool[k] = pl[k] >= 99 ? 0 : v;
  }
  pl.ovr = computeOvr(pl);
  return gained;
}

// How a role's match XP is shared across stats.
const XP_SPLIT = {
  GK: { pac: 0.05, sho: 0, pas: 0.25, def: 0.7 },
  DEF: { pac: 0.25, sho: 0.05, pas: 0.2, def: 0.5 },
  MID: { pac: 0.2, sho: 0.2, pas: 0.45, def: 0.15 },
  FWD: { pac: 0.35, sho: 0.45, pas: 0.15, def: 0.05 },
};

// XP for one player's match. `line` is his entry from matchRatings (rating 3..10, goals...).
export function matchXp(pl, line, result) {
  const rating = Number(line?.rating) || 6;
  let base = 8 + Math.max(0, rating - 6) * 12;
  base += result > 0 ? 12 : result === 0 ? 5 : 0;
  const split = XP_SPLIT[roleOf(pl.pos)];
  const xp = {};
  for (const k of STATS) xp[k] = base * split[k];
  xp.sho += (line?.goals || 0) * 10;
  xp.pas += (line?.assists || 0) * 6 + (line?.keyPasses || 0) * 2;
  xp.def += ((line?.tackles || 0) + (line?.interceptions || 0) + (line?.blocks || 0)) * 2 + (line?.saves || 0) * 3;
  return xp;
}

// End-of-season development: kids get better just by growing up.
export function seasonGrowth(pl, band, r = Math.random) {
  const base = band.academy ? 3 : 5;
  const gained = {};
  for (const k of STATS) {
    const g = base + Math.floor(r() * 3);
    const before = pl[k];
    pl[k] = clamp(pl[k] + g, 1, 99);
    gained[k] = pl[k] - before;
  }
  pl.ovr = computeOvr(pl);
  return gained;
}

// ---------------------------------------------------------------- club and squad

function newId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `p${Date.now().toString(36).slice(-5)}${rand}`;
}

export function defaultKits(town) {
  return { home: { ...town.home }, away: { ...town.away }, gk: { ...town.gk } };
}

export function createCareer({ townId = 'mgm', nickname, seed = Date.now() } = {}) {
  const town = findTown(townId) || TOWNS[0];
  const band = AGE_BANDS[0];
  // Your team starts a little below the league average: it's an amateur side.
  const { players, bench } = generateSquad(`career:${seed}`, band.level - 2, 'tmp');
  const squad = [...players, ...bench].map((pl) => ({
    ...pl,
    id: newId(),
    xp: { pac: 0, sho: 0, pas: 0, def: 0 },
    apps: 0,
    goals: 0,
    assists: 0,
    ratings: [],
  }));
  const nick = String(nickname || town.nickname).trim().slice(0, 20) || town.nickname;
  const state = {
    version: VERSION,
    seed: String(seed),
    club: {
      townId: town.id,
      town: town.town,
      nickname: nick,
      short: town.short,
      ...defaultKits(town),
    },
    band: 0,
    season: 1,
    squad,
    league: null,
    history: [],
    log: [],
    calledUp: null,
    done: false,
  };
  state.league = createLeague(state);
  return state;
}

export function currentBand(state) {
  return AGE_BANDS[clamp(state.band, 0, AGE_BANDS.length - 1)];
}

export function careerClubName(state) {
  return clubName(state.club.town, state.club.nickname);
}

function badge(kit) {
  const h = (n) => `#${(n >>> 0).toString(16).padStart(6, '0')}`;
  return [h(kit.shirt), h(kit.trim), h(kit.shorts)];
}

// The club object the match engine and menus use.
export function userClub(state) {
  const band = currentBand(state);
  return {
    id: 'career',
    kind: 'career',
    name: careerClubName(state),
    short: state.club.short,
    town: state.club.town,
    badge: badge(state.club.home),
    home: { ...state.club.home },
    away: { ...state.club.away },
    gk: { ...state.club.gk },
    band: band.id,
    players: state.squad.slice(0, SLOT_POS.length),
    bench: state.squad.slice(SLOT_POS.length),
  };
}

export function findPlayer(state, id) {
  return state.squad.find((p) => p.id === id) || null;
}

// Editable fields only; stats and progress cannot be edited.
export function updatePlayer(state, id, changes) {
  const pl = findPlayer(state, id);
  if (!pl) return null;
  if (typeof changes.name === 'string') {
    const name = changes.name.replace(/\s+/g, ' ').trim().slice(0, 28);
    if (name) {
      pl.name = name;
      pl.back = backName(name);
    }
  }
  if (Number.isFinite(Number(changes.num))) pl.num = clamp(Math.round(Number(changes.num)), 1, 99);
  if (POSITIONS.includes(changes.pos)) {
    pl.pos = changes.pos;
    pl.ovr = computeOvr(pl);
  }
  if (changes.look && typeof changes.look === 'object') pl.look = { ...(pl.look || {}), ...changes.look };
  if ('celebration' in changes) pl.celebration = changes.celebration || null;
  return pl;
}

// Swaps two squad places (starter <-> substitute, or two starters' slots).
export function swapPlayers(state, a, b) {
  const i = state.squad.findIndex((p) => p.id === a);
  const j = state.squad.findIndex((p) => p.id === b);
  if (i < 0 || j < 0 || i === j) return false;
  [state.squad[i], state.squad[j]] = [state.squad[j], state.squad[i]];
  return true;
}

const KIT_PARTS = ['shirt', 'shorts', 'socks', 'trim'];

export function updateKit(state, which, changes) {
  const kit = state.club[which];
  if (!kit) return null;
  for (const part of KIT_PARTS) {
    const v = changes[part];
    if (Number.isFinite(v)) kit[part] = v & 0xffffff;
  }
  if (typeof changes.number === 'string' && /^#[0-9a-f]{6}$/i.test(changes.number)) kit.number = changes.number;
  return kit;
}

export function renameClub(state, nickname) {
  const nick = String(nickname || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  if (nick) state.club.nickname = nick;
  return careerClubName(state);
}

// ---------------------------------------------------------------- league

function shuffle(list, r) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Round robin by the circle method: every team plays every other once.
function roundRobin(ids, r) {
  const teams = shuffle(ids, r);
  const n = teams.length;
  const rounds = [];
  for (let round = 0; round < n - 1; round++) {
    const games = [];
    for (let i = 0; i < n / 2; i++) {
      const a = teams[i];
      const b = teams[n - 1 - i];
      games.push((round + i) % 2 ? [a, b] : [b, a]);
    }
    rounds.push(games);
    teams.splice(1, 0, teams.pop());
  }
  return rounds;
}

export function createLeague(state) {
  const band = currentBand(state);
  const r = rng(`${state.seed}:league:${state.season}`);
  const pool = TOWNS.filter((t) => t.id !== state.club.townId);
  const picks = shuffle(pool, r).slice(0, LEAGUE_SIZE - 1);
  const opponents = picks.map((t, i) => ({
    townId: t.id,
    // A spread of strengths: two strong sides, a few average, a couple weaker.
    variance: [5, 3, 1, 0, -1, -3, -5][i] + (band.academy ? 1 : 0),
  }));
  const ids = ['career', ...opponents.map((o) => o.townId)];
  const fixtures = [];
  roundRobin(ids, r).forEach((games, round) => {
    games.forEach(([home, away], k) => fixtures.push({ id: `r${round + 1}m${k + 1}`, round: round + 1, home, away, hg: null, ag: null }));
  });
  return { band: band.id, season: state.season, opponents, fixtures };
}

export function opponentClub(state, townId) {
  const town = findTown(townId);
  const opp = state.league.opponents.find((o) => o.townId === townId);
  if (!town || !opp) return null;
  return makeClub(town, currentBand(state), { seed: `${state.seed}:${state.season}`, variance: opp.variance });
}

export function teamName(state, id) {
  if (id === 'career') return careerClubName(state);
  const town = findTown(id);
  return town ? clubName(town.town, town.nickname) : id;
}

export function teamShort(state, id) {
  return id === 'career' ? state.club.short : (findTown(id)?.short || id.toUpperCase());
}

function strengthOf(state, id) {
  if (id === 'career') {
    const xi = state.squad.slice(0, SLOT_POS.length).map((p) => withTraining(p));
    return xi.reduce((a, p) => a + p.ovr, 0) / xi.length;
  }
  const opp = state.league.opponents.find((o) => o.townId === id);
  return currentBand(state).level + (opp?.variance || 0);
}

function poisson(lambda, r) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > L && k < 12);
  return k - 1;
}

export function simulateScore(state, home, away, r = Math.random) {
  const diff = (strengthOf(state, home) - strengthOf(state, away)) / 10;
  const hl = clamp(1.4 + diff * 0.45 + 0.15, 0.25, 4);
  const al = clamp(1.25 - diff * 0.45, 0.25, 4);
  return [poisson(hl, r), poisson(al, r)];
}

export function nextFixture(state) {
  return state.league.fixtures.find((f) => f.hg == null && (f.home === 'career' || f.away === 'career')) || null;
}

export function seasonOver(state) {
  return !nextFixture(state);
}

// Plays every other match of rounds up to and including `round`.
function simulateRound(state, round) {
  for (const f of state.league.fixtures) {
    if (f.round > round || f.hg != null) continue;
    if (f.home === 'career' || f.away === 'career') continue;
    [f.hg, f.ag] = simulateScore(state, f.home, f.away);
  }
}

export function leagueTable(state) {
  const rows = new Map();
  const row = (id) => {
    if (!rows.has(id)) rows.set(id, { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
    return rows.get(id);
  };
  row('career');
  for (const o of state.league.opponents) row(o.townId);
  for (const f of state.league.fixtures) {
    if (f.hg == null) continue;
    const h = row(f.home);
    const a = row(f.away);
    h.p++;
    a.p++;
    h.gf += f.hg;
    h.ga += f.ag;
    a.gf += f.ag;
    a.ga += f.hg;
    if (f.hg > f.ag) {
      h.w++;
      h.pts += 3;
      a.l++;
    } else if (f.hg < f.ag) {
      a.w++;
      a.pts += 3;
      h.l++;
    } else {
      h.d++;
      a.d++;
      h.pts++;
      a.pts++;
    }
  }
  return [...rows.values()].sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.id.localeCompare(y.id));
}

// ---------------------------------------------------------------- results

function playerOvr(pl) {
  return withTraining(pl).ovr;
}

export function callUpCandidates(state) {
  if (!currentBand(state).academy) return [];
  return state.squad.filter((p) => playerOvr(p) >= PRO_CALLUP_OVR).map((p) => p.id);
}

// Records the user's match: score, then XP for everyone who played.
// `lines` are matchRatings() entries for the user's team ({ data: { id }, rating, goals, ... }).
export function finishMatch(state, fixtureId, userGoals, oppGoals, lines = []) {
  const f = state.league.fixtures.find((x) => x.id === fixtureId);
  if (!f || f.hg != null) return null;
  const userHome = f.home === 'career';
  f.hg = userHome ? userGoals : oppGoals;
  f.ag = userHome ? oppGoals : userGoals;
  simulateRound(state, f.round);

  const result = Math.sign(userGoals - oppGoals);
  const report = { fixtureId, result, userGoals, oppGoals, players: [] };
  for (const line of lines) {
    const pl = findPlayer(state, line?.data?.id);
    if (!pl) continue;
    const xp = matchXp(pl, line, result);
    const before = pl.ovr;
    const gained = addXp(pl, xp);
    pl.apps = (pl.apps || 0) + 1;
    pl.goals = (pl.goals || 0) + (line.goals || 0);
    pl.assists = (pl.assists || 0) + (line.assists || 0);
    pl.ratings = [...(pl.ratings || []), Number(line.rating) || 6].slice(-6);
    const totalXp = Math.round(STATS.reduce((a, k) => a + xp[k], 0));
    report.players.push({ id: pl.id, name: pl.name, rating: line.rating, xp: totalXp, gained, ovrBefore: before, ovrAfter: pl.ovr });
  }
  report.players.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  report.scouts = callUpCandidates(state);
  state.log = [...(state.log || []), { season: state.season, band: currentBand(state).id, fixtureId, userGoals, oppGoals }].slice(-60);
  if (seasonOver(state)) simulateRound(state, Infinity);
  return report;
}

// Ends the season: final placing, growth, call-ups, then the next age band.
export function endSeason(state, r = Math.random) {
  if (!seasonOver(state) || state.done) return null;
  const band = currentBand(state);
  const table = leagueTable(state);
  const place = table.findIndex((row) => row.id === 'career') + 1;
  const mine = table[place - 1];
  const summary = {
    band: band.id, label: `${band.label} ${band.tier}`, season: state.season, place, of: table.length,
    w: mine.w, d: mine.d, l: mine.l, gf: mine.gf, ga: mine.ga, pts: mine.pts, champions: place === 1,
  };
  state.history = [...state.history, summary];

  const growth = state.squad.map((pl) => {
    const before = pl.ovr;
    seasonGrowth(pl, band, r);
    return { id: pl.id, name: pl.name, ovrBefore: before, ovrAfter: pl.ovr };
  });

  let calledUp = callUpCandidates(state);
  const lastBand = state.band >= AGE_BANDS.length - 1;
  if (!calledUp.length && lastBand) {
    // End of the youth road: the pros take the best player anyway.
    const best = [...state.squad].sort((a, b) => playerOvr(b) - playerOvr(a))[0];
    calledUp = best ? [best.id] : [];
  }
  if (calledUp.length) {
    state.calledUp = calledUp;
    state.done = true;
    return { summary, growth, calledUp, pro: PRO_CLUB, finished: true };
  }

  const academyNext = !band.academy && AGE_BANDS[state.band + 1]?.academy;
  state.band += 1;
  state.season += 1;
  state.league = createLeague(state);
  return { summary, growth, calledUp: [], academyInvite: !!academyNext, next: currentBand(state), finished: false };
}

export function describeStage(state) {
  const band = currentBand(state);
  return `${band.label} · ${band.tier} · Season ${state.season}`;
}
