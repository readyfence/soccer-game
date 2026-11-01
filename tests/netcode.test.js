import { test } from 'node:test';
import assert from 'node:assert/strict';

const N = await import('../src/netcode.js');

test('room codes use the unambiguous alphabet and round-trip through normalizeCode', () => {
  let seed = 1;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 200; i++) {
    const code = N.makeRoomCode(rand);
    assert.equal(code.length, N.CODE_LENGTH);
    assert.ok(/^[A-HJ-NP-Z2-9]+$/.test(code), code);
    assert.ok(!/[01ILO]/.test(code));
    assert.equal(N.normalizeCode(code.toLowerCase()), code);
  }
  assert.equal(N.normalizeCode(' k7q-2m '), 'K7Q2M');
  assert.equal(N.normalizeCode('K7Q2'), null);
  assert.equal(N.normalizeCode('K7Q2M9'), null);
  assert.equal(N.normalizeCode('K7O2M'), null, 'O is never in a code');
  assert.equal(N.peerIdFor('K7Q2M'), 'socker26-K7Q2M');
});

test('guest input packs moves, holds and taps; host consumes taps once', () => {
  const frame = {
    move: { x: 0.70710678, z: -0.70710678 },
    curve: { x: 0, z: 0.25 },
    sprint: true,
    ctrl: false,
    down: new Set(['shot', 'bogus']),
  };
  const pkt = N.encodeInput(frame, new Set(['shot']), new Set(['pass']));
  assert.deepEqual(pkt.m, [0.707, -0.707]);
  assert.deepEqual(pkt.d, ['shot'], 'unknown actions are dropped');
  assert.deepEqual(pkt.p, ['shot']);
  assert.deepEqual(pkt.r, ['pass']);

  const remote = new N.RemoteInput();
  remote.apply(JSON.parse(JSON.stringify(pkt)));
  remote.apply({ ...pkt, p: [], r: [], m: [5, -5] });
  const f1 = remote.takeFrame();
  assert.deepEqual(f1.move, { x: 1, z: -1 }, 'moves are clamped');
  assert.ok(f1.sprint);
  assert.ok(f1.down.has('shot'));
  assert.ok(f1.pressed.has('shot'), 'a press survives later packets until a frame takes it');
  assert.ok(f1.released.has('pass'));
  assert.equal(f1.padIndex, null);
  const f2 = remote.takeFrame();
  assert.equal(f2.pressed.size, 0, 'presses are delivered once');
  assert.ok(f2.down.has('shot'), 'holds persist');

  remote.apply(N.encodeInput(null, null, null));
  const f3 = remote.takeFrame();
  assert.equal(f3.down.size, 0, 'a neutral packet lets go of everything');
  assert.deepEqual(f3.move, { x: 0, z: 0 });
  remote.apply(null);
  remote.apply('junk');
});

test('snapshots survive JSON and reject bad input', () => {
  const players = new Float32Array([1.23456, 0, -3.5, 1.5707963, 0.5]);
  const enc = N.encodeSnapshot({ seq: 7, t: 12.3456789, players, ball: [0, 0.11, 0, 0, 0, 0, 1], meta: { st: 'play' } });
  // Sent as { t: 'snap', ...enc }: the snapshot must not clobber the message type.
  const msg = JSON.parse(JSON.stringify({ t: 'snap', ...enc }));
  assert.equal(msg.t, 'snap');
  const dec = N.decodeSnapshot(msg);
  assert.equal(dec.seq, 7);
  assert.equal(dec.t, 12.346);
  assert.deepEqual(dec.p, [1.235, 0, -3.5, 1.571, 0.5]);
  assert.equal(dec.meta.st, 'play');
  assert.equal(N.decodeSnapshot(null), null);
  assert.equal(N.decodeSnapshot({ ...enc, v: 99 }), null);
  assert.equal(N.decodeSnapshot({ ...enc, b: [1, 2] }), null);
});

test('snapshot buffer orders, drops late packets and interpolates behind real time', () => {
  const buf = new N.SnapshotBuffer(0.1);
  const snap = (seq, t) => ({ seq, t, p: [], b: [0, 0, 0, 0, 0, 0, 1], meta: {} });
  assert.equal(buf.sample(0), null);
  assert.ok(buf.push(snap(1, 10.0), 0.0));
  assert.ok(buf.push(snap(2, 10.04), 0.04));
  assert.ok(!buf.push(snap(1, 10.0), 0.05), 'duplicates are ignored');
  assert.ok(buf.push(snap(4, 10.12), 0.12));
  assert.ok(!buf.push(snap(3, 10.08), 0.13), 'late packets are ignored');
  // At local 0.16 the host clock is ~10.16, so we draw at ~10.06: between seq 2 and 4.
  const s = buf.sample(0.16);
  assert.equal(s.a.seq, 2);
  assert.equal(s.b.seq, 4);
  assert.ok(s.k > 0 && s.k < 1);
  const late = buf.sample(5);
  assert.equal(late.a.seq, 4, 'holds the newest snapshot when packets stop');
});

test('forwarded calls: plain args only, chatty calls coalesced', () => {
  assert.deepEqual(N.plainArgs(['GOAL!', 3, true, null, { x: 1 }, () => 1]), ['GOAL!', 3, true, null, null, null]);
  const calls = [
    { f: 'power', a: [0.1] }, { f: 'kick', a: [0.5] }, { f: 'power', a: [0.2] },
    { f: 'power', a: [0.3] }, { f: 'power', a: [0.4] }, { f: 'whistle', a: [] },
  ];
  const out = N.coalesceCalls(calls);
  assert.deepEqual(out.map((c) => `${c.f}:${c.a[0] ?? ''}`), ['kick:0.5', 'power:0.4', 'whistle:']);
  const plain = N.toPlain({ a: 1, f() {}, nested: { isVector3: true, x: 1 }, list: [1, { b: 2 }] });
  assert.deepEqual(plain, { a: 1, list: [1, { b: 2 }] });
});
