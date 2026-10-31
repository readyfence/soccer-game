// Connections between the two computers.
//
// Real games use WebRTC through PeerJS: the free PeerJS cloud server only introduces the
// two browsers, then data flows directly between them (or through PeerJS's public TURN
// relay when a network blocks direct connections). Two data channels are opened: a
// reliable one for input, events and control, and an unreliable one for snapshots so a
// lost packet never holds up newer positions.
//
// `?net=local` swaps in a BroadcastChannel transport so two tabs of the same browser can
// play each other with no network at all (used for testing).

import { makeRoomCode, peerIdFor, normalizeCode } from './netcode.js';

class Link {
  constructor() {
    this.handlers = { message: [], close: [] };
    this.closed = false;
  }

  on(event, fn) {
    this.handlers[event]?.push(fn);
    return this;
  }

  emit(event, arg) {
    for (const fn of this.handlers[event] ?? []) {
      try { fn(arg); } catch (err) { console.error(err); }
    }
  }

  fireClose(reason) {
    if (this.closed) return;
    this.closed = true;
    this.emit('close', reason);
  }
}

// ---------------------------------------------------------------- PeerJS

const PEER_ERRORS = {
  'peer-unavailable': 'No game found with that code. Check it and try again.',
  network: 'Could not reach the matchmaking server. Check your internet connection.',
  'server-error': 'The matchmaking server had a problem. Try again in a minute.',
  'socket-error': 'Lost contact with the matchmaking server.',
  'socket-closed': 'Lost contact with the matchmaking server.',
  'browser-incompatible': 'This browser can\'t play online. Try Chrome or Safari.',
  'webrtc': 'The two computers could not connect directly. Some school or work networks block this; try a home network.',
};

function friendlyError(err) {
  return PEER_ERRORS[err?.type] || err?.message || 'Connection problem.';
}

class PeerLink extends Link {
  constructor(peer, ctl, snap) {
    super();
    this.peer = peer;
    this.ctl = ctl;
    this.snap = snap;
    for (const conn of [ctl, snap]) {
      conn.on('data', (data) => this.emit('message', data));
      conn.on('close', () => this.fireClose('closed'));
      conn.on('error', () => this.fireClose('error'));
    }
    peer.on('disconnected', () => {
      // Losing the signalling server does not break an open game; try to reconnect quietly.
      try { peer.reconnect(); } catch { /* ignore */ }
    });
  }

  send(msg, { reliable = true } = {}) {
    if (this.closed) return;
    const conn = reliable || !this.snap?.open ? this.ctl : this.snap;
    try { if (conn?.open) conn.send(msg); } catch { /* channel closing */ }
  }

  close() {
    this.fireClose('local');
    try { this.ctl?.close(); } catch { /* ignore */ }
    try { this.snap?.close(); } catch { /* ignore */ }
    try { this.peer?.destroy(); } catch { /* ignore */ }
  }
}

async function loadPeer() {
  const mod = await import('peerjs');
  return mod.Peer ?? mod.default;
}

function openPeer(Peer, id) {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, { debug: 1 }) : new Peer({ debug: 1 });
    const fail = (err) => {
      peer.off?.('open', ok);
      reject(err);
    };
    const ok = () => {
      peer.off?.('error', fail);
      resolve(peer);
    };
    peer.once('open', ok);
    peer.once('error', fail);
  });
}

function waitOpen(conn, ms = 15000) {
  return new Promise((resolve, reject) => {
    if (conn.open) {
      resolve(conn);
      return;
    }
    const t = setTimeout(() => reject({ type: 'webrtc' }), ms);
    conn.once('open', () => {
      clearTimeout(t);
      resolve(conn);
    });
    conn.once('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

// Host: gets a code, then waits for one guest. onCode(code) fires as soon as the code is
// registered; the returned promise resolves with the Link when the guest has connected.
async function hostPeer({ onCode, signal }) {
  const Peer = await loadPeer();
  let peer = null;
  let code = null;
  for (let attempt = 0; attempt < 5 && !peer; attempt++) {
    code = makeRoomCode();
    try {
      peer = await openPeer(Peer, peerIdFor(code));
    } catch (err) {
      if (err?.type !== 'unavailable-id') throw new Error(friendlyError(err));
    }
  }
  if (!peer) throw new Error('Could not get a game code. Try again.');
  onCode?.(code);
  return new Promise((resolve, reject) => {
    const conns = {};
    const cancel = () => {
      try { peer.destroy(); } catch { /* ignore */ }
      reject(new Error('cancelled'));
    };
    signal?.addEventListener('abort', cancel, { once: true });
    peer.on('error', (err) => {
      if (err?.type === 'peer-unavailable') return;
      reject(new Error(friendlyError(err)));
    });
    peer.on('connection', async (conn) => {
      const label = conn.label === 'snap' ? 'snap' : 'ctl';
      if (conns[label]) {
        // Somebody else trying to join a full game.
        conn.on('open', () => {
          conn.send({ t: 'full' });
          setTimeout(() => conn.close(), 300);
        });
        return;
      }
      conns[label] = conn;
      try {
        await waitOpen(conn);
      } catch (err) {
        reject(new Error(friendlyError(err)));
        return;
      }
      if (conns.ctl?.open && conns.snap?.open) {
        signal?.removeEventListener('abort', cancel);
        resolve(new PeerLink(peer, conns.ctl, conns.snap));
      }
    });
  });
}

async function joinPeer(code) {
  const Peer = await loadPeer();
  let peer;
  try {
    peer = await openPeer(Peer, null);
  } catch (err) {
    throw new Error(friendlyError(err));
  }
  const id = peerIdFor(code);
  const errorP = new Promise((_, reject) => peer.once('error', (err) => reject(new Error(friendlyError(err)))));
  const ctl = peer.connect(id, { label: 'ctl', reliable: true, serialization: 'json' });
  const snap = peer.connect(id, { label: 'snap', reliable: false, serialization: 'json' });
  try {
    await Promise.race([Promise.all([waitOpen(ctl), waitOpen(snap)]), errorP]);
  } catch (err) {
    try { peer.destroy(); } catch { /* ignore */ }
    throw err instanceof Error ? err : new Error(friendlyError(err));
  }
  return new PeerLink(peer, ctl, snap);
}

// ---------------------------------------------------------------- BroadcastChannel (testing)

class LocalLink extends Link {
  constructor(code, side) {
    super();
    this.side = side;
    this.bc = new BroadcastChannel(`socker26-local-${code}`);
    this.bc.onmessage = (e) => {
      const { from, msg } = e.data || {};
      if (from === this.side) return;
      if (msg?.t === '__bye') this.fireClose('closed');
      else this.emit('message', msg);
    };
  }

  send(msg) {
    if (!this.closed) this.bc.postMessage({ from: this.side, msg });
  }

  close() {
    try { this.bc.postMessage({ from: this.side, msg: { t: '__bye' } }); } catch { /* ignore */ }
    this.fireClose('local');
    this.bc.close();
  }
}

async function hostLocal({ onCode, signal }) {
  const code = makeRoomCode();
  onCode?.(code);
  const link = new LocalLink(code, 'host');
  return new Promise((resolve, reject) => {
    signal?.addEventListener('abort', () => {
      link.close();
      reject(new Error('cancelled'));
    }, { once: true });
    const onHello = (msg) => {
      if (msg?.t !== '__hello') return;
      link.handlers.message = link.handlers.message.filter((f) => f !== onHello);
      link.send({ t: '__welcome' });
      resolve(link);
    };
    link.on('message', onHello);
  });
}

async function joinLocal(code) {
  const link = new LocalLink(code, 'guest');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      link.close();
      reject(new Error('No game found with that code. Check it and try again.'));
    }, 4000);
    const onWelcome = (msg) => {
      if (msg?.t !== '__welcome') return;
      clearTimeout(timer);
      link.handlers.message = link.handlers.message.filter((f) => f !== onWelcome);
      resolve(link);
    };
    link.on('message', onWelcome);
    link.send({ t: '__hello' });
  });
}

// ---------------------------------------------------------------- public

function useLocal() {
  try { return new URLSearchParams(location.search).get('net') === 'local'; } catch { return false; }
}

export function hostGame(opts) {
  return useLocal() ? hostLocal(opts) : hostPeer(opts);
}

export function joinGame(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return Promise.reject(new Error('Codes are 5 letters and numbers, like K7Q2M.'));
  return useLocal() ? joinLocal(code) : joinPeer(code);
}
