import { NATIONS, teamRating } from './teams.js';

export const WC_KEY = 'socker26.worldcup';
export const WC_SIZE = 16;
export const GROUPS = ['A', 'B', 'C', 'D'];
export const PHASE_LABEL = {
  group: 'Group Stage',
  qf: 'Quarter-finals',
  sf: 'Semi-finals',
  final: 'Final',
  done: 'Finished',
};

export function wcNations() {
  return NATIONS.slice(0, WC_SIZE);
}

export function findNation(id) {
  return NATIONS.find((n) => n.id === id) || null;
}

function store() {
  try { return localStorage; } catch { return null; }
}

export function loadCup() {
  try {
    const raw = store()?.getItem(WC_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.version !== 1 || !s.userId || !s.groups || !s.fixtures) return null;
    if (!findNation(s.userId)) return null;
    const ids = GROUPS.flatMap((g) => s.groups[g] || []);
    if (ids.length !== WC_SIZE || ids.some((id) => !findNation(id))) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveCup(state) {
  try { store()?.setItem(WC_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  return state;
}

export function clearCup() {
  try { store()?.removeItem(WC_KEY); } catch { /* ignore */ }
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawGroups(userId, nations) {
  const ranked = [...nations].sort((a, b) => teamRating(b) - teamRating(a) || a.id.localeCompare(b.id));
  const pots = [0, 1, 2, 3].map((i) => ranked.slice(i * 4, i * 4 + 4));
  const groups = { A: [null, null, null, null], B: [null, null, null, null], C: [null, null, null, null], D: [null, null, null, null] };
  const userPot = pots.findIndex((pot) => pot.some((n) => n.id === userId));
  const potIdx = userPot >= 0 ? userPot : 0;
  groups.A[potIdx] = userId;
  pots[potIdx] = pots[potIdx].filter((n) => n.id !== userId);
  for (let pot = 0; pot < 4; pot++) {
    const left = shuffle(pots[pot]);
    for (const g of GROUPS) {
      if (groups[g][pot]) continue;
      groups[g][pot] = left.pop().id;
    }
  }
  return groups;
}

function emptyKo(id, round) {
  return { id, round, home: null, away: null, homeG: null, awayG: null, pens: null, winner: null };
}

export function createCup(userId) {
  const nations = wcNations();
  if (!nations.some((n) => n.id === userId)) return null;
  const groups = drawGroups(userId, nations);
  const fixtures = [];
  for (const g of GROUPS) {
    const [a, b, c, d] = groups[g];
    const pairs = [
      [1, a, b], [1, c, d],
      [2, a, c], [2, d, b],
      [3, d, a], [3, b, c],
    ];
    for (const [md, home, away] of pairs) {
      fixtures.push({
        id: `g-${g}-${md}-${home}`, group: g, md, home, away,
        homeG: null, awayG: null, pens: null,
      });
    }
  }
  return {
    version: 1,
    userId,
    size: WC_SIZE,
    groups,
    fixtures,
    knockouts: [
      emptyKo('qf-0', 'qf'), emptyKo('qf-1', 'qf'), emptyKo('qf-2', 'qf'), emptyKo('qf-3', 'qf'),
      emptyKo('sf-0', 'sf'), emptyKo('sf-1', 'sf'),
      emptyKo('final-0', 'final'),
    ],
    phase: 'group',
    champion: null,
    created: Date.now(),
  };
}

function poisson(lambda) {
  const L = Math.exp(-Math.max(0.05, lambda));
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

export function simulateScore(homeId, awayId, knockout) {
  const hr = teamRating(findNation(homeId));
  const ar = teamRating(findNation(awayId));
  const diff = (hr - ar) / 14;
  let homeG = poisson(Math.max(0.3, 1.22 + diff * 0.58));
  let awayG = poisson(Math.max(0.3, 1.05 - diff * 0.58));
  let pens = null;
  if (knockout && homeG === awayG) {
    let hs = 0;
    let as = 0;
    for (let i = 0; i < 5; i++) {
      if (Math.random() < 0.74 + diff * 0.05) hs += 1;
      if (Math.random() < 0.74 - diff * 0.05) as += 1;
    }
    while (hs === as) {
      if (Math.random() < 0.72 + diff * 0.04) hs += 1;
      if (Math.random() < 0.72 - diff * 0.04) as += 1;
    }
    pens = [hs, as];
  }
  return { homeG, awayG, pens };
}

export function winnerOf(fx) {
  if (!fx || fx.homeG == null) return null;
  if (fx.homeG > fx.awayG) return fx.home;
  if (fx.awayG > fx.homeG) return fx.away;
  if (fx.pens && fx.pens[0] !== fx.pens[1]) return fx.pens[0] > fx.pens[1] ? fx.home : fx.away;
  return null;
}

function writeScore(fx, homeG, awayG, pens) {
  fx.homeG = homeG;
  fx.awayG = awayG;
  fx.pens = pens || null;
  fx.winner = winnerOf(fx);
}

function findMatch(state, id) {
  return state.fixtures.find((f) => f.id === id) || state.knockouts.find((k) => k.id === id) || null;
}

export function groupsComplete(state) {
  return state.fixtures.every((f) => f.homeG != null);
}

export function userGroup(state) {
  return GROUPS.find((g) => state.groups[g].includes(state.userId)) || 'A';
}

function emptyRow(id) {
  return { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
}

function addResult(row, gf, ga) {
  row.p += 1;
  row.gf += gf;
  row.ga += ga;
  row.gd = row.gf - row.ga;
  if (gf > ga) {
    row.w += 1;
    row.pts += 3;
  } else if (gf === ga) {
    row.d += 1;
    row.pts += 1;
  } else row.l += 1;
}

export function groupTables(state) {
  const out = {};
  for (const g of GROUPS) {
    const rows = Object.fromEntries(state.groups[g].map((id) => [id, emptyRow(id)]));
    for (const fx of state.fixtures) {
      if (fx.group !== g || fx.homeG == null) continue;
      addResult(rows[fx.home], fx.homeG, fx.awayG);
      addResult(rows[fx.away], fx.awayG, fx.homeG);
    }
    out[g] = Object.values(rows).sort((a, b) =>
      b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.id.localeCompare(b.id));
  }
  return out;
}

function seedQF(state) {
  const tables = groupTables(state);
  const pick = (g, i) => tables[g][i].id;
  const pairs = [
    [pick('A', 0), pick('B', 1)],
    [pick('B', 0), pick('A', 1)],
    [pick('C', 0), pick('D', 1)],
    [pick('D', 0), pick('C', 1)],
  ];
  pairs.forEach(([home, away], i) => {
    const k = state.knockouts.find((x) => x.id === `qf-${i}`);
    k.home = home;
    k.away = away;
  });
}

function seedFrom(state, from, to, pairs) {
  const src = state.knockouts.filter((k) => k.round === from);
  if (!src.every((k) => k.winner)) return false;
  pairs.forEach((pair, i) => {
    const k = state.knockouts.find((x) => x.id === `${to}-${i}`);
    k.home = src[pair[0]].winner;
    k.away = src[pair[1]].winner;
  });
  return true;
}

function advanceIfRoundDone(state) {
  if (state.phase === 'qf' && seedFrom(state, 'qf', 'sf', [[0, 1], [2, 3]])) state.phase = 'sf';
  else if (state.phase === 'sf' && seedFrom(state, 'sf', 'final', [[0, 1]])) state.phase = 'final';
  else if (state.phase === 'final') {
    const fin = state.knockouts.find((k) => k.round === 'final');
    if (fin?.winner) {
      state.phase = 'done';
      state.champion = fin.winner;
    }
  }
}

export function userStatus(state) {
  if (!state) return 'none';
  if (state.phase === 'done') return state.champion === state.userId ? 'champion' : 'eliminated';
  if (state.phase === 'group') {
    if (!groupsComplete(state)) return 'playing';
    const table = groupTables(state)[userGroup(state)];
    return table.findIndex((r) => r.id === state.userId) < 2 ? 'playing' : 'eliminated';
  }
  const lost = state.knockouts.some((k) =>
    (k.home === state.userId || k.away === state.userId) && k.winner && k.winner !== state.userId);
  return lost ? 'eliminated' : 'playing';
}

export function nextUserMatch(state) {
  if (!state || userStatus(state) !== 'playing') return null;
  if (state.phase === 'group') {
    return state.fixtures
      .filter((f) => f.homeG == null && (f.home === state.userId || f.away === state.userId))
      .sort((a, b) => a.md - b.md)[0] || null;
  }
  return state.knockouts.find((k) =>
    k.round === state.phase
    && k.homeG == null
    && k.home && k.away
    && (k.home === state.userId || k.away === state.userId)) || null;
}

export function simulateRestOfCup(state) {
  let guard = 0;
  while (state.phase !== 'done' && guard++ < 24) {
    if (state.phase === 'group') {
      for (const f of state.fixtures) {
        if (f.homeG == null) {
          const r = simulateScore(f.home, f.away, false);
          writeScore(f, r.homeG, r.awayG, null);
        }
      }
      seedQF(state);
      state.phase = 'qf';
      continue;
    }
    for (const k of state.knockouts.filter((x) => x.round === state.phase)) {
      if (k.homeG == null && k.home && k.away) {
        const r = simulateScore(k.home, k.away, true);
        writeScore(k, r.homeG, r.awayG, r.pens);
      }
    }
    const before = state.phase;
    advanceIfRoundDone(state);
    if (state.phase === before) break;
  }
  return state;
}

export function finishUserMatch(state, matchId, homeG, awayG, pens) {
  const fx = findMatch(state, matchId);
  if (!fx || fx.homeG != null) return state;
  writeScore(fx, homeG, awayG, pens);
  if (fx.group) {
    for (const f of state.fixtures) {
      if (f.md === fx.md && f.homeG == null) {
        const r = simulateScore(f.home, f.away, false);
        writeScore(f, r.homeG, r.awayG, null);
      }
    }
    if (groupsComplete(state)) {
      seedQF(state);
      state.phase = 'qf';
    }
  } else {
    for (const k of state.knockouts) {
      if (k.round === fx.round && k.homeG == null && k.home && k.away) {
        const r = simulateScore(k.home, k.away, true);
        writeScore(k, r.homeG, r.awayG, r.pens);
      }
    }
    advanceIfRoundDone(state);
  }
  if (userStatus(state) === 'eliminated' && state.phase !== 'done') simulateRestOfCup(state);
  return saveCup(state);
}

export function describePhase(state) {
  if (!state) return 'World Cup';
  if (state.phase === 'group') {
    const next = nextUserMatch(state);
    const md = next?.md || currentMatchday(state);
    return `Group Stage · Matchday ${md}`;
  }
  return PHASE_LABEL[state.phase] || 'World Cup';
}

export function currentMatchday(state) {
  const next = state.fixtures.filter((f) => f.homeG == null).sort((a, b) => a.md - b.md)[0];
  return next?.md || 3;
}

export function matchLabel(fx) {
  const h = findNation(fx.home);
  const a = findNation(fx.away);
  if (!h || !a) return '';
  if (fx.homeG == null) return `${h.short} vs ${a.short}`;
  const pens = fx.pens ? ` (${fx.pens[0]}–${fx.pens[1]} p)` : '';
  return `${h.short} ${fx.homeG}–${fx.awayG} ${a.short}${pens}`;
}

export function bracketRounds(state) {
  return {
    qf: state.knockouts.filter((k) => k.round === 'qf'),
    sf: state.knockouts.filter((k) => k.round === 'sf'),
    final: state.knockouts.filter((k) => k.round === 'final'),
  };
}

export function roundName(round) {
  return { qf: 'Quarter-finals', sf: 'Semi-finals', final: 'Final' }[round] || PHASE_LABEL[round] || round;
}
