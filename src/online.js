// Online two-player session: glues a network Link to the running match.
//
// Host: runs the real match. The guest's input replaces the second human slot (the same
// slot P2 uses in local versus). After each simulation step the host sends a snapshot
// (player positions, facing and animation state in the replay format, plus the ball and a
// little match state), and forwards every HUD, sound and stadium call so the guest sees
// and hears the same match.
//
// Guest: never simulates. It builds the same match from the clubs the host sends, then
// draws interpolated snapshots and replays the forwarded calls. Its own controller input
// goes to the host.

import {
  PROTOCOL, SNAPSHOT_HZ, RemoteInput, SnapshotBuffer, encodeInput, encodeSnapshot, decodeSnapshot,
  plainArgs, coalesceCalls, toPlain,
} from './netcode.js';

// Same layout as the replay recorder in game.js: x, y, z, facing, then the model's
// animation state (MODEL_STATE_SIZE numbers, passed in so this file needs no 3D code).
function captureFrame(g, stride) {
  const p = new Float32Array(g.players.length * stride);
  g.players.forEach((pl, i) => {
    const o = i * stride;
    p[o] = pl.pos.x;
    p[o + 1] = pl.pos.y;
    p[o + 2] = pl.pos.z;
    p[o + 3] = pl.facing;
    pl.model.writeState(p, o + 4);
  });
  const q = g.ball.mesh.quaternion;
  return { p, b: [g.ball.pos.x, g.ball.pos.y, g.ball.pos.z, q.x, q.y, q.z, q.w] };
}

const SILENT = new Proxy({}, { get: () => () => {} });

function silentProxy(real) {
  return new Proxy(real, {
    get(target, prop) {
      const v = target[prop];
      return typeof v === 'function' ? () => {} : v;
    },
  });
}

// HUD calls whose arguments are objects need a JSON-friendly form.
const HUD_ARGS = {
  card: ([kind, p, reason]) => [kind, { data: { name: p?.data?.name ?? '' } }, reason],
  pensShow: ([on, teams]) => [on, teams ? teams.map((t) => ({ short: t.short })) : null],
  pensUpdate: ([P]) => [P ? { scored: [...P.scored], marks: P.marks.map((m) => [...m]) } : null],
  fullTime: ([a, b, pens, ratings]) => {
    const team = (t) => ({
      idx: t.idx, name: t.name, short: t.short, score: t.score,
      club: { name: t.club?.name, short: t.club?.short, badge: t.club?.badge },
    });
    const list = (ratings ?? []).map((s) => toPlain({ ...s, data: s.data }));
    return [team(a), team(b), pens ? { scored: [...pens.scored] } : null, list];
  },
};

export class OnlineSession {
  constructor({ link, role, game, hud, sfx, stadium, modelStateSize, onMessage, onClose }) {
    this.link = link;
    this.stride = 4 + (modelStateSize ?? 0);
    this.role = role;
    this.game = game;
    this.real = { hud, sfx, stadium };
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.remote = new RemoteInput();
    this.buffer = new SnapshotBuffer();
    this.calls = [];
    this.seq = 0;
    this.lastSnapAt = -1;
    this.rosterVersion = 0;
    this.guestRoster = 0;
    this.inMatch = false;
    this.rtt = null;
    this.lastInputSent = 0;
    this.lastInputKey = '';
    game._netSession = this;
    this.pingTimer = setInterval(() => this.send({ t: 'ping', at: performance.now() }), 2000);
    this.pingTimer?.unref?.(); // node tests only; browsers return a plain number
    link.on('message', (msg) => this.receive(msg));
    link.on('close', (why) => {
      clearInterval(this.pingTimer);
      this.endMatch();
      this.onClose?.(why);
    });
    this.send({ t: 'hello', v: PROTOCOL, role });
  }

  send(msg, opts) {
    this.link.send(msg, opts);
  }

  close() {
    clearInterval(this.pingTimer);
    this.endMatch();
    this.link.close();
  }

  receive(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'ping':
        this.send({ t: 'pong', at: msg.at });
        return;
      case 'pong':
        if (Number.isFinite(msg.at)) this.rtt = Math.round(performance.now() - msg.at);
        return;
      case 'in':
        if (this.role === 'host') this.remote.apply(msg);
        return;
      case 'snap': {
        if (this.role !== 'guest') return;
        const snap = decodeSnapshot(msg);
        if (snap) this.buffer.push(snap, performance.now() / 1000);
        return;
      }
      case 'ev':
        if (this.role === 'guest' && Array.isArray(msg.calls)) this.replayCalls(msg.calls);
        return;
      case 'sub':
        if (this.role === 'guest') this.mirrorSub(msg);
        return;
      case 'off':
        if (this.role === 'guest') this.mirrorOff(msg);
        return;
      default:
        this.onMessage?.(msg);
    }
  }

  // ------------------------------------------------------------------ host

  // Call right after game.setupMatch on the host.
  hostBeginMatch(setup) {
    this.inMatch = true;
    this.remote.reset();
    this.rosterVersion = 0;
    this.calls = [];
    this.send({ t: 'start', ...setup });
    const g = this.game;
    g.hud = this.forwarding('hud', this.real.hud, HUD_ARGS);
    g.sfx = this.forwarding('sfx', this.real.sfx, {});
    g.stadium = this.forwarding('stadium', this.real.stadium, {});
    this.wrapRoster();
  }

  forwarding(kind, real, special) {
    const session = this;
    return new Proxy(real, {
      get(target, prop) {
        const v = target[prop];
        if (typeof v !== 'function') return v;
        return (...args) => {
          const out = v.apply(target, args);
          if (session.inMatch) {
            const enc = special[prop];
            let a;
            try { a = enc ? enc(args) : plainArgs(args); } catch { a = null; }
            if (a) session.calls.push({ o: kind, f: String(prop), a });
          }
          return out;
        };
      },
    });
  }

  // Wraps the game's substitution and red-card functions once; the wrappers look up the
  // current session so a later online game in the same tab still reports changes.
  wrapRoster() {
    const g = this.game;
    if (g._netWrapped) return;
    g._netWrapped = true;
    const makeSub = g.makeSub.bind(g);
    const sendOff = g.sendOff.bind(g);
    const hosting = () => {
      const s = g._netSession;
      return s && s.role === 'host' && s.inMatch ? s : null;
    };
    g.makeSub = (team, outP, inData) => {
      const ti = team?.players?.indexOf(outP) ?? -1;
      const ok = makeSub(team, outP, inData);
      const s = hosting();
      if (ok && s) {
        s.rosterVersion++;
        s.flushCalls();
        s.send({ t: 'sub', team: team.idx, ti, data: toPlain(inData), rv: s.rosterVersion });
      }
      return ok;
    };
    g.sendOff = (p) => {
      const gi = g.players.indexOf(p);
      sendOff(p);
      const s = hosting();
      if (s && gi >= 0) {
        s.rosterVersion++;
        s.flushCalls();
        s.send({ t: 'off', gi, rv: s.rosterVersion });
      }
    };
  }

  // The guest's controller as an Input.frame() slot.
  remoteFrame() {
    return this.remote.takeFrame();
  }

  flushCalls() {
    if (!this.calls.length) return;
    this.send({ t: 'ev', calls: coalesceCalls(this.calls) });
    this.calls = [];
  }

  // Call once per rendered frame on the host, after the simulation.
  hostTick(now, { paused = false } = {}) {
    if (!this.inMatch) return;
    this.flushCalls();
    const gap = paused ? 0.2 : 1 / SNAPSHOT_HZ;
    if (now - this.lastSnapAt < gap) return;
    this.lastSnapAt = now;
    const g = this.game;
    if (!g.players?.length || !g.ball) return;
    const frame = captureFrame(g, this.stride);
    const idx = (p) => (p ? g.players.indexOf(p) : -1);
    const meta = {
      st: g.state,
      ck: Math.round((g.clock ?? 0) * 10) / 10,
      tm: Math.round((g.time ?? 0) * 1000) / 1000,
      half: g.half,
      sc: g.teams.map((t) => t.score),
      yl: g.teams.map((t) => t.yellows ?? 0),
      rd: g.teams.map((t) => t.reds ?? 0),
      hc: g.humans.map((h) => idx(h.controlled)),
      hs: g.humans.map((h) => Math.round((h.controlled?.stamina ?? 1) * 100) / 100),
      ow: idx(g.owner),
      gt: g.goalTeam ? g.goalTeam.idx : -1,
      cel: g.celebration?.player ? idx(g.celebration.player) : -1,
      sh: Math.round((g.shake ?? 0) * 100) / 100,
      rv: this.rosterVersion,
      ps: paused ? 1 : 0,
      ht: g.state === 'halftime' ? 1 : 0,
    };
    if (g.state === 'pens' && g.pens) {
      meta.pk = { k: idx(g.pens.kicker), g: idx(g.pens.keeper), ph: g.pens.phase ?? '', ch: g.pens.charge ? 1 : 0 };
    }
    this.send({ t: 'snap', ...encodeSnapshot({ seq: ++this.seq, t: now, players: frame.p, ball: frame.b, meta }) }, { reliable: false });
  }

  // ------------------------------------------------------------------ guest

  // Call before game.setupMatch on the guest: the guest's own match must stay silent and
  // only show what the host forwards.
  guestPrepare() {
    this.inMatch = true;
    this.buffer = new SnapshotBuffer();
    this.guestRoster = 0;
    this.pendingRoster = [];
    const g = this.game;
    g.hud = silentProxy(this.real.hud);
    g.sfx = SILENT;
    g.stadium = silentProxy(this.real.stadium);
  }

  replayCalls(calls) {
    for (const c of calls) {
      const target = this.real[c.o];
      const fn = target?.[c.f];
      if (typeof fn !== 'function' || !Array.isArray(c.a)) continue;
      try { fn.apply(target, c.a); } catch (err) { console.error(err); }
    }
  }

  // Substitutions and red cards run the game's own functions so the guest's player list
  // stays in the same order as the host's.
  mirrorSub(msg) {
    const g = this.game;
    const team = g.teams?.[msg.team];
    const outP = team?.players?.[msg.ti];
    if (!team || !outP || !msg.data) return;
    const saved = { subWindow: g.subWindow, state: g.state, subsLeft: team.subsLeft, bench: team.bench };
    g.subWindow = true;
    g.state = 'remote';
    team.subsLeft = Math.max(1, team.subsLeft ?? 1);
    team.bench = [msg.data, ...(team.bench ?? [])];
    g.makeSub(team, outP, msg.data);
    g.subWindow = saved.subWindow;
    g.state = saved.state;
    this.guestRoster = msg.rv ?? this.guestRoster + 1;
  }

  mirrorOff(msg) {
    const g = this.game;
    const p = g.players?.[msg.gi];
    if (p) g.sendOff(p);
    this.guestRoster = msg.rv ?? this.guestRoster + 1;
  }

  // Draws the host's match. Returns false until the first snapshot arrives.
  guestApply(localNow) {
    const pick = this.buffer.sample(localNow);
    if (!pick) return false;
    const g = this.game;
    const { a, b, k } = pick;
    // Only draw frames that match our player list; a sub or red card arrives on the
    // reliable channel and may be a moment ahead of or behind the snapshots.
    const want = this.guestRoster;
    const A = a.meta.rv === want ? a : b.meta.rv === want ? b : null;
    const B = b.meta.rv === want ? b : A;
    const m = b.meta;
    g.time = m.tm ?? g.time;
    if (A && B) {
      g.applyFramePair({ p: A.p, b: A.b }, { p: B.p, b: B.b }, A === B ? 0 : k);
      g.ball.vel.set(0, 0, 0);
      g.ball.spin.set(0, 0, 0);
    }
    const at = (i) => (i >= 0 ? g.players[i] ?? null : null);
    g.state = m.st || g.state;
    g.clock = m.ck ?? g.clock;
    g.half = m.half ?? g.half;
    g.teams.forEach((t, i) => {
      t.score = m.sc?.[i] ?? t.score;
      t.yellows = m.yl?.[i] ?? t.yellows;
      t.reds = m.rd?.[i] ?? t.reds;
    });
    g.humans?.forEach((h, i) => {
      const p = at(m.hc?.[i] ?? -1);
      if (p) {
        h.controlled = p;
        p.stamina = m.hs?.[i] ?? p.stamina;
      }
    });
    g.controlled = g.humans?.[0]?.controlled ?? g.controlled;
    g.owner = at(m.ow ?? -1);
    g.goalTeam = m.gt >= 0 ? g.teams[m.gt] : g.goalTeam;
    g.celebration = m.cel >= 0 && at(m.cel) ? { player: at(m.cel) } : null;
    g.shake = m.sh ?? 0;
    if (m.pk) g.pens = { ...(g.pens || {}), kicker: at(m.pk.k), keeper: at(m.pk.g), phase: m.pk.ph, charge: m.pk.ch ? {} : null };
    this.hostPaused = !!m.ps;
    return true;
  }

  // Send the guest's controller to the host (slot 0 of the guest's own Input).
  // A null slot (paused, menus open) sends a neutral controller so nothing stays held.
  sendInput(slot, now) {
    if (!this.inMatch) return;
    const pkt = slot ? encodeInput(slot, slot.pressed, slot.released) : encodeInput(null, null, null);
    const key = JSON.stringify(pkt);
    const changed = key !== this.lastInputKey || pkt.p.length || pkt.r.length;
    if (!changed && now - this.lastInputSent < 0.1) return;
    this.lastInputKey = key;
    this.lastInputSent = now;
    this.send({ t: 'in', ...pkt });
  }

  // ------------------------------------------------------------------ both

  endMatch() {
    if (!this.inMatch) return;
    this.inMatch = false;
    const g = this.game;
    g.hud = this.real.hud;
    g.sfx = this.real.sfx;
    g.stadium = this.real.stadium;
  }
}
