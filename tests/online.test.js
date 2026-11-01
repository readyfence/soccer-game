import { test } from 'node:test';
import assert from 'node:assert/strict';

const { OnlineSession } = await import('../src/online.js');

// Two in-memory links wired together. Messages go through JSON like the real channels.
function linkPair() {
  const make = () => ({
    handlers: { message: [], close: [] },
    other: null,
    on(ev, fn) { this.handlers[ev].push(fn); return this; },
    send(msg) {
      const copy = JSON.parse(JSON.stringify(msg));
      for (const fn of this.other.handlers.message) fn(copy);
    },
    close() {
      for (const fn of this.handlers.close) fn('local');
      for (const fn of this.other.handlers.close) fn('closed');
    },
  });
  const a = make();
  const b = make();
  a.other = b;
  b.other = a;
  return [a, b];
}

const v3 = (x = 0, y = 0, z = 0) => ({
  x, y, z,
  set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; return this; },
  copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; },
});

function fakePlayer(team, idx, x) {
  return {
    team, idx, pos: v3(x, 0, idx), facing: 0.5, stamina: 1, data: { name: `P${idx}`, num: idx + 1 },
    model: {
      s: [idx, idx + 0.5],
      writeState(arr, o) { arr[o] = this.s[0]; arr[o + 1] = this.s[1]; },
      readState(arr, o) { this.s = [arr[o], arr[o + 1]]; },
    },
  };
}

// Just enough of Game for the session: players, ball, humans, applyFramePair.
function fakeGame() {
  const teams = [0, 1].map((idx) => ({ idx, score: 0, yellows: 0, reds: 0, players: [], subsLeft: 5, bench: [] }));
  const players = [];
  for (const t of teams) {
    for (let i = 0; i < 3; i++) {
      const p = fakePlayer(t, i, t.idx * 10 + i);
      t.players.push(p);
      players.push(p);
    }
  }
  const g = {
    teams, players, state: 'play', clock: 12.3, time: 4.5, half: 1, shake: 0,
    owner: null, goalTeam: null, celebration: null, pens: null,
    humans: [{ controlled: players[2] }, { controlled: players[5] }],
    ball: { pos: v3(1, 0.11, 2), vel: v3(), spin: v3(), mesh: { quaternion: { x: 0, y: 0, z: 0, w: 1 } } },
    makeSub: () => true,
    sendOff(p) {
      const i = this.players.indexOf(p);
      if (i >= 0) this.players.splice(i, 1);
    },
    applyFramePair(A, B, k) {
      this.applied = { A, B, k };
      this.players.forEach((p, i) => {
        p.pos.set(A.p[i * 6], A.p[i * 6 + 1], A.p[i * 6 + 2]);
        p.model.readState(A.p, i * 6 + 4);
      });
    },
  };
  return g;
}

function recorder() {
  const calls = [];
  return {
    calls,
    obj: new Proxy({}, { get: (_, name) => (name === 'then' ? undefined : (...a) => calls.push([name, ...a])) }),
  };
}

function setup() {
  const [hostLink, guestLink] = linkPair();
  const hostGame = fakeGame();
  const guestGame = fakeGame();
  const hostSide = { hud: recorder(), sfx: recorder(), stadium: recorder() };
  const guestSide = { hud: recorder(), sfx: recorder(), stadium: recorder() };
  const host = new OnlineSession({
    link: hostLink, role: 'host', game: hostGame, hud: hostSide.hud.obj, sfx: hostSide.sfx.obj,
    stadium: hostSide.stadium.obj, modelStateSize: 2,
  });
  const guest = new OnlineSession({
    link: guestLink, role: 'guest', game: guestGame, hud: guestSide.hud.obj, sfx: guestSide.sfx.obj,
    stadium: guestSide.stadium.obj, modelStateSize: 2,
    onMessage: (msg) => { if (msg.t === 'start') guest.guestPrepare(); },
  });
  return { host, guest, hostGame, guestGame, hostSide, guestSide };
}

test('host forwards HUD, sound and stadium calls the match makes; guest replays them', () => {
  const t = setup();
  t.host.hostBeginMatch({ user: {}, ai: {} });
  t.hostGame.hud.say('Great save!');
  t.hostGame.hud.card('yellow', { data: { name: 'Sam Berg' } }, 'Late tackle');
  t.hostGame.sfx.kick(0.5);
  t.hostGame.sfx.whistle(true);
  t.hostGame.stadium.setExcite(1);
  for (let i = 0; i < 10; i++) t.hostGame.hud.power(i / 10, 'SHOT');
  // The host still hears/sees everything itself.
  assert.deepEqual(t.hostSide.sfx.calls[0], ['kick', 0.5]);
  t.host.hostTick(100);
  assert.deepEqual(t.guestSide.hud.calls.find((c) => c[0] === 'say'), ['say', 'Great save!']);
  assert.deepEqual(t.guestSide.hud.calls.find((c) => c[0] === 'card'), ['card', 'yellow', { data: { name: 'Sam Berg' } }, 'Late tackle']);
  assert.deepEqual(t.guestSide.sfx.calls, [['kick', 0.5], ['whistle', true]]);
  assert.deepEqual(t.guestSide.stadium.calls, [['setExcite', 1]]);
  const powers = t.guestSide.hud.calls.filter((c) => c[0] === 'power');
  assert.deepEqual(powers, [['power', 0.9, 'SHOT']], 'a meter updated every frame only sends its latest value');
  // The guest's own match code stays silent while online.
  t.guestGame.sfx.kick(1);
  t.guestGame.hud.say('guest-made line');
  assert.equal(t.guestSide.sfx.calls.length, 2);
  assert.ok(!t.guestSide.hud.calls.some((c) => c[1] === 'guest-made line'));
});

test('snapshots move the guest players; meta drives score, clock and controlled players', () => {
  const t = setup();
  t.host.hostBeginMatch({ user: {}, ai: {} });
  t.hostGame.players[4].pos.set(7.25, 0, -3.5);
  t.hostGame.teams[1].score = 2;
  t.hostGame.humans[1].controlled = t.hostGame.players[4];
  t.hostGame.players[4].stamina = 0.4;
  t.hostGame.owner = t.hostGame.players[4];
  t.host.hostTick(100);
  t.host.hostTick(100.05);
  assert.ok(t.guest.buffer.frames.length >= 2);
  assert.ok(t.guest.guestApply(performance.now() / 1000 + 1));
  assert.deepEqual([t.guestGame.players[4].pos.x, t.guestGame.players[4].pos.z], [7.25, -3.5]);
  assert.deepEqual(t.guestGame.players[4].model.s, [1, 1.5], 'animation state is copied');
  assert.equal(t.guestGame.teams[1].score, 2);
  assert.equal(t.guestGame.clock, 12.3);
  assert.equal(t.guestGame.humans[1].controlled, t.guestGame.players[4]);
  assert.equal(t.guestGame.players[4].stamina, 0.4);
  assert.equal(t.guestGame.owner, t.guestGame.players[4]);
});

test('guest controller reaches the host as the second human slot', () => {
  const t = setup();
  t.host.hostBeginMatch({ user: {}, ai: {} });
  const slot = { move: { x: -1, z: 0 }, curve: { x: 0, z: 0 }, sprint: true, ctrl: false, down: new Set(['shot']), pressed: new Set(['shot']), released: new Set() };
  t.guest.sendInput(slot, 1);
  const f = t.host.remoteFrame();
  assert.deepEqual(f.move, { x: -1, z: 0 });
  assert.ok(f.sprint && f.pressed.has('shot') && f.down.has('shot'));
  t.guest.sendInput(null, 2);
  const g = t.host.remoteFrame();
  assert.equal(g.down.size, 0, 'pausing on the guest lets go of every button');
});

test('red cards keep both player lists in step; frames from the old roster are not drawn', () => {
  const t = setup();
  t.host.hostBeginMatch({ user: {}, ai: {} });
  t.host.hostTick(100);
  const sentOff = t.hostGame.players[1];
  t.hostGame.sendOff(sentOff);
  assert.equal(t.hostGame.players.length, 5);
  assert.equal(t.guestGame.players.length, 5, 'the guest removes the same player');
  assert.equal(t.guest.guestRoster, 1);
  t.host.hostTick(100.05);
  t.guest.guestApply(performance.now() / 1000 + 1);
  assert.equal(t.guestGame.applied.A.p.length, 5 * 6, 'only the new-roster frame is drawn');
});

test('closing one side tells the other and restores the real HUD and sound', () => {
  const t = setup();
  let closed = 0;
  t.guest.onClose = () => { closed++; };
  t.host.hostBeginMatch({ user: {}, ai: {} });
  assert.notEqual(t.hostGame.sfx, t.hostSide.sfx.obj);
  t.host.close();
  assert.equal(closed, 1);
  assert.equal(t.hostGame.sfx, t.hostSide.sfx.obj);
  assert.equal(t.hostGame.hud, t.hostSide.hud.obj);
});
