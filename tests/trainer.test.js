import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const T = await import('../src/trainer.js');

const STRIKER = { id: 'p7k2', name: 'José Lindqvist', back: 'LINDQVIST', num: 9, pac: 97, sho: 92, pas: 81, def: 36, ovr: 91, pos: 'ST', lon: 88, fin: 84 };
const CLUB = { short: 'MGM', home: { shirt: 0xf6f6f6, shorts: 0xf6f6f6, number: '#1a2340' } };

function syncCode(obj) {
  return T.toBase64Url(JSON.stringify(obj));
}

beforeEach(() => {
  mem.clear();
  // Reset the module cache by forgetting everyone.
  for (const r of T.trainedList()) T.forgetTrained(r.id);
});

test('asciiName folds accents and special letters for the device font', () => {
  assert.equal(T.asciiName('José Lindqvist'), 'Jose Lindqvist');
  assert.equal(T.asciiName('Søren Ødegård'), 'Soren Odegard');
  assert.equal(T.asciiName('Joško Brandt'), 'Josko Brandt');
  assert.equal(T.asciiName('Zoë Aït-Nour'), 'Zoe Ait-Nour');
  assert.equal(T.asciiName('Lukas Müller'), 'Lukas Muller');
});

test('base64url round-trips unicode', () => {
  const s = JSON.stringify({ name: 'Éder Militão ★' });
  const code = T.toBase64Url(s);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.equal(T.fromBase64Url(code), s);
});

test('sendPayload carries base stats, kit, look and return url', () => {
  const p = T.sendPayload(STRIKER, {
    team: CLUB, look: { tone: 5, hair: 'buzz', hairColour: 'black', beard: 0 }, ret: 'http://127.0.0.1:5173/', now: 1000, tzMinutes: -300,
  });
  assert.equal(p.v, 1);
  assert.equal(p.id, 'p7k2');
  assert.equal(p.name, 'José Lindqvist');
  assert.equal(p.ascii, 'Jose Lindqvist');
  assert.equal(p.back, 'LINDQVIST');
  assert.equal(p.role, 'FWD');
  assert.deepEqual(p.base, [97, 92, 81, 36, 91]);
  assert.deepEqual(p.train, [0, 0, 0, 0, 0]);
  assert.deepEqual(p.kit, [0xf6f6f6, 0xf6f6f6, 0x1a2340]);
  assert.deepEqual(p.look, { tone: 5, hair: 'buzz', hc: 'black', beard: 0 });
  assert.equal(p.tz, -300);
  assert.equal(p.now, 1000);
  const url = T.sendUrl(p);
  assert.ok(url.startsWith('http://soccer-trainer.local/send#'));
  const back = JSON.parse(T.fromBase64Url(url.split('#')[1]));
  assert.equal(back.name, 'José Lindqvist');
});

test('sync from the location hash stores training and cleans the URL', () => {
  const code = syncCode({ v: 1, id: 'p7k2', name: 'José Lindqvist', train: [2, 3, 0, 1, 2], coach: 'Huxley', log: { steps: 12345, games: 4 } });
  let replaced = null;
  globalThis.history = { replaceState: (_a, _b, url) => { replaced = url; } };
  const res = T.consumeSyncFromLocation({ hash: `#trainer=${code}`, pathname: '/', search: '' });
  assert.equal(replaced, '/');
  assert.equal(res.name, 'José Lindqvist');
  assert.deepEqual(res.gained, [2, 3, 0, 1, 2]);
  assert.equal(T.trainedRecord('p7k2').coach, 'Huxley');
  assert.equal(T.trainedRecord('p7k2').log.steps, 12345);

  // A second sync reports only what is new.
  // Renamed in the squad editor since: same id, so still the same player.
  const code2 = syncCode({ v: 1, id: 'p7k2', name: 'Joey Lindqvist', train: [3, 3, 1, 1, 2] });
  const res2 = T.consumeSyncFromLocation({ hash: `#trainer=${code2}`, pathname: '/', search: '' });
  assert.deepEqual(res2.gained, [1, 0, 1, 0, 0]);
  assert.equal(T.trainedRecord('p7k2').name, 'Joey Lindqvist');
});

test('withTraining applies deltas, caps at 99 and marks the player', () => {
  T.recordSync({ id: 'p7k2', name: 'José Lindqvist', train: [5, 3, 2, 1, 2], coach: '', log: {} });
  const t = T.withTraining(STRIKER);
  assert.equal(t.pac, 99);
  assert.equal(t.sho, 95);
  assert.equal(t.pas, 83);
  assert.equal(t.def, 37);
  assert.equal(t.ovr, 93);
  assert.ok(t.lon > STRIKER.lon);
  assert.deepEqual(t.trained, { pac: 5, sho: 3, pas: 2, def: 1, ovr: 2 });
  assert.equal(T.withTraining(t), t, 'applying twice is a no-op');
  assert.equal(STRIKER.pac, 97, 'source data is untouched');
  const other = { ...STRIKER, id: 'p0000', name: 'Someone Else' };
  assert.equal(T.withTraining(other), other);
});

test('sending an already trained player continues from his training', () => {
  T.recordSync({ id: 'p7k2', name: 'José Lindqvist', train: [1, 2, 0, 0, 1], coach: '', log: {} });
  const p = T.sendPayload(STRIKER, { team: CLUB });
  assert.deepEqual(p.base, [97, 92, 81, 36, 91]);
  assert.deepEqual(p.train, [1, 2, 0, 0, 1]);
});

test('bad or hostile sync payloads are rejected', () => {
  assert.equal(T.parseSyncPayload('not base64!!'), null);
  assert.equal(T.parseSyncPayload(syncCode({ v: 2, name: 'X', train: [1, 1, 1, 1, 1] })), null);
  assert.equal(T.parseSyncPayload(syncCode({ v: 1, name: '', train: [1, 1, 1, 1, 1] })), null);
  assert.equal(T.parseSyncPayload(syncCode({ v: 1, name: 'X', train: [1] })), null);
  const huge = T.parseSyncPayload(syncCode({ v: 1, name: 'X', train: [999, -5, 'a', 3, 4] }));
  assert.deepEqual(huge.train, [40, 0, 0, 3, 4]);
  const res = T.consumeSyncFromLocation({ hash: '#trainer=%%%', pathname: '/', search: '' });
  assert.equal(res, null, 'non-matching hash is ignored');
});

test('trainer host is normalised', () => {
  assert.equal(T.setTrainerHost(' http://192.168.1.50/whatever '), '192.168.1.50');
  assert.equal(T.syncUrl('http://127.0.0.1:5173/'), 'http://192.168.1.50/sync?to=http%3A%2F%2F127.0.0.1%3A5173%2F');
  assert.equal(T.setTrainerHost(''), T.DEFAULT_HOST);
});
