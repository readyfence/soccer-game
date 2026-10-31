import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const C = await import('../src/career.js');
const Teams = await import('../src/teams.js');
const T = await import('../src/trainer.js');

beforeEach(() => mem.clear());

function playSeason(state, score = [2, 1]) {
  const reports = [];
  let fx;
  while ((fx = C.nextFixture(state))) {
    const lines = state.squad.slice(0, 11).map((p) => ({ data: { id: p.id }, rating: 7.4, goals: p.pos === 'ST' ? 1 : 0 }));
    reports.push(C.finishMatch(state, fx.id, score[0], score[1], lines));
  }
  return reports;
}

test('no real clubs or players: every club is a local fictional town side', () => {
  assert.ok(Teams.TOWNS.length >= 14);
  for (const t of Teams.TOWNS) assert.ok(t.town && t.nickname && t.short.length === 3);
  const names = Teams.TOWNS.map((t) => t.town);
  for (const town of ['Maple Grove', 'Osseo', 'Plymouth']) assert.ok(names.includes(town));
  for (const club of Teams.TEAMS) {
    assert.equal(club.players.length, 11);
    assert.equal(club.bench.length, 7);
  }
});

test('squads are generated deterministically from a seed', () => {
  const a = Teams.generateSquad('seed-1', 50);
  const b = Teams.generateSquad('seed-1', 50);
  const c = Teams.generateSquad('seed-2', 50);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.players.map((p) => p.name), c.players.map((p) => p.name));
  const avg = a.players.reduce((s, p) => s + p.ovr, 0) / 11;
  assert.ok(Math.abs(avg - 50) <= 4, `team level ~50, got ${avg}`);
  assert.equal(a.players[0].pos, 'GK');
  assert.ok(a.players[0].def > a.players[0].sho);
});

test('a new career starts at U8 with an 18-player squad and a 7-game league', () => {
  const s = C.createCareer({ townId: 'mgm', seed: 42 });
  assert.equal(C.currentBand(s).label, 'U8');
  assert.equal(C.careerClubName(s), 'Maple Grove Mallards');
  assert.equal(s.squad.length, C.SQUAD_SIZE);
  assert.equal(new Set(s.squad.map((p) => p.id)).size, s.squad.length, 'ids are unique');
  assert.equal(s.league.opponents.length, C.LEAGUE_SIZE - 1);
  assert.ok(!s.league.opponents.some((o) => o.townId === 'mgm'));
  const mine = s.league.fixtures.filter((f) => f.home === 'career' || f.away === 'career');
  assert.equal(mine.length, 7);
  assert.equal(s.league.fixtures.length, 28);
  const opponents = new Set(mine.map((f) => (f.home === 'career' ? f.away : f.home)));
  assert.equal(opponents.size, 7, 'plays every other team once');
  const club = C.userClub(s);
  assert.equal(club.players.length, 11);
  assert.equal(club.bench.length, 7);
});

test('match XP raises stats and is recorded per player', () => {
  const s = C.createCareer({ seed: 7 });
  const st = s.squad.find((p) => p.pos === 'ST');
  const before = { sho: st.sho, ovr: st.ovr };
  const fx = C.nextFixture(s);
  const report = C.finishMatch(s, fx.id, 3, 0, [{ data: { id: st.id }, rating: 9.2, goals: 3, assists: 0 }]);
  assert.equal(report.result, 1);
  const line = report.players.find((p) => p.id === st.id);
  assert.ok(line.xp > 60);
  assert.ok(st.sho > before.sho, 'a hat-trick improves shooting at U8 level');
  assert.equal(st.apps, 1);
  assert.equal(st.goals, 3);
  assert.equal(C.finishMatch(s, fx.id, 1, 0, []), null, 'a fixture cannot be played twice');
  const row = C.leagueTable(s).find((r) => r.id === 'career');
  assert.equal(row.pts, 3);
  assert.equal(row.gf, 3);
});

test('levelling uses the same XP curve as the trainer device', () => {
  assert.equal(C.pointCost(60), 100);
  assert.equal(C.pointCost(90), 190);
  const pl = { pos: 'ST', pac: 40, sho: 40, pas: 40, def: 40, xp: { pac: 0, sho: 0, pas: 0, def: 0 } };
  const g = C.addXp(pl, { sho: 125 });
  assert.equal(g.sho, 2); // 40 + 43 = 83 spent; the third point needs 46 more
  assert.equal(pl.sho, 42);
  assert.equal(pl.xp.sho, 125 - 83);
});

test('full career: seasons age up, academy invite at U16, pro call-up ends the game', () => {
  const s = C.createCareer({ seed: 99 });
  const bands = [];
  let invite = false;
  let end = null;
  for (let i = 0; i < 10 && !s.done; i++) {
    bands.push(C.currentBand(s).label);
    playSeason(s, [3, 0]);
    end = C.endSeason(s, () => 0.5);
    if (end.academyInvite) invite = true;
  }
  assert.ok(s.done, 'the career finishes');
  assert.ok(end.finished);
  assert.ok(end.calledUp.length >= 1);
  assert.equal(end.pro.name, 'North Woods FC');
  assert.deepEqual(bands.slice(0, 4), ['U8', 'U10', 'U12', 'U14']);
  assert.ok(invite, 'the academy invites the team after U14');
  assert.ok(bands.length <= 6);
  assert.equal(s.history.length, bands.length);
  assert.equal(s.history[0].place, 1, 'winning every game tops the table');
  assert.equal(C.endSeason(s), null, 'nothing after the end');
});

test('a player trained on the device can earn the call-up sooner', () => {
  const s = C.createCareer({ seed: 5 });
  s.band = 4; // U16 academy
  s.league = C.createLeague(s);
  const star = s.squad[9];
  Object.assign(star, { pac: 70, sho: 72, pas: 66, def: 30 });
  star.ovr = Teams.computeOvr(star);
  assert.ok(star.ovr < Teams.PRO_CALLUP_OVR);
  assert.deepEqual(C.callUpCandidates(s), []);
  T.recordSync({ id: star.id, name: star.name, train: [8, 10, 3, 0, 9], coach: 'Huxley', log: {} });
  assert.deepEqual(C.callUpCandidates(s), [star.id]);
});

test('editing names, positions, kits and line-up', () => {
  const s = C.createCareer({ seed: 3 });
  const p = s.squad[2];
  C.updatePlayer(s, p.id, { name: '  Huxley   Jr  ', num: 23, look: { hair: 'afro', tone: 4 }, celebration: 'dance' });
  assert.equal(p.name, 'Huxley Jr');
  assert.equal(p.back, 'JR');
  assert.equal(p.num, 23);
  assert.equal(p.look.hair, 'afro');
  assert.equal(p.celebration, 'dance');
  C.updatePlayer(s, p.id, { name: '   ', num: 'x', pos: 'nope' });
  assert.equal(p.name, 'Huxley Jr');
  assert.equal(p.num, 23);
  C.updatePlayer(s, p.id, { pos: 'ST' });
  assert.equal(p.pos, 'ST');
  assert.equal(p.ovr, Teams.computeOvr(p));

  const sub = s.squad[15];
  assert.ok(C.swapPlayers(s, p.id, sub.id));
  assert.equal(s.squad[2].id, sub.id);
  assert.ok(!C.swapPlayers(s, p.id, 'missing'));

  C.updateKit(s, 'home', { shirt: 0x123456, number: '#abcdef', bogus: 1 });
  assert.equal(s.club.home.shirt, 0x123456);
  assert.equal(s.club.home.number, '#abcdef');
  C.updateKit(s, 'home', { number: 'red' });
  assert.equal(s.club.home.number, '#abcdef');
  assert.equal(C.renameClub(s, 'Thunder'), 'Maple Grove Thunder');
});

test('opponents change kit when colours clash with ours', () => {
  const s = C.createCareer({ townId: 'mgm', seed: 1 });
  const mine = C.userClub(s);
  const twin = { ...Teams.TEAMS[1], id: 'x', home: { ...mine.home }, away: { ...mine.home } };
  const k = Teams.resolveKits(mine, twin);
  assert.equal(k.user, mine.home);
  assert.ok(!Teams.kitsClash(k.user, k.ai), 'falls back to a contrasting kit');
  const other = Teams.TEAMS.find((t) => !Teams.kitsClash(mine.home, t.home));
  assert.equal(Teams.resolveKits(mine, other).ai, other.home);
});

test('career survives a save and load', () => {
  const s = C.createCareer({ seed: 11 });
  playSeason(s);
  C.saveCareer(s);
  const back = C.loadCareer();
  assert.deepEqual(back, JSON.parse(JSON.stringify(s)));
  C.clearCareer();
  assert.equal(C.loadCareer(), null);
});
