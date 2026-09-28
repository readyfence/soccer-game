import * as THREE from 'three';
import { HALF_L, HALF_W, GOAL_HW, GOAL_H, BALL_R, PEN_DEPTH, PEN_HW, DIFFICULTY } from './constants.js';
import { PlayerModel, kitMaterials, POSE, KICK, kickContactDelay, MODEL_STATE_SIZE } from './playerModel.js';
import { MAGNUS, SPIN_DECAY } from './ball.js';
import { celebrationFor } from './celebrations.js';
import { teamRating } from './teams.js';

// 4-3-3 in team coordinates: own goal at x = -52.5, +z is the team's right side.
const FORMATION = [
  { role: 'GK', x: -50, z: 0 },
  { role: 'DEF', x: -36, z: 22 },
  { role: 'DEF', x: -38, z: 7 },
  { role: 'DEF', x: -38, z: -7 },
  { role: 'DEF', x: -36, z: -22 },
  { role: 'MID', x: -22, z: 12 },
  { role: 'MID', x: -26, z: 0 },
  { role: 'MID', x: -22, z: -12 },
  { role: 'FWD', x: -8, z: 22 },
  { role: 'FWD', x: -5, z: 0 },
  { role: 'FWD', x: -8, z: -22 },
];
const CLAMP_X = { GK: [-52, -30], DEF: [-48, 12], MID: [-42, 36], FWD: [-34, 47] };

const rand = Math.random;
const gauss = () => (rand() + rand() + rand() - 1.5) * 1.15;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const hyp = Math.hypot;
const pick = (arr) => arr[(rand() * arr.length) | 0];

const REC_STRIDE = 4 + MODEL_STATE_SIZE;
const SHOT_TYPES = new Set(['shot', 'power', 'finesse', 'chip', 'header']);
const CHARGE_RATE = { shot: 1.2, power: 0.75, finesse: 1.2, chip: 1.3, pass: 1.5, through: 1.4, cross: 1.3, clear: 1.5 };
export const KICK_ACTIONS = Object.keys(CHARGE_RATE);
const KICK_LABEL = {
  shot: 'SHOT', power: 'POWER SHOT', finesse: 'FINESSE', chip: 'CHIP', pass: 'PASS', through: 'THROUGH BALL',
  cross: 'CROSS', clear: 'CLEARANCE',
};

function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const l2 = vx * vx + vz * vz || 1;
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / l2, 0, 1);
  return hyp(px - (ax + vx * t), pz - (az + vz * t));
}

// Pre-rotate the launch direction so Magnus curl bends the ball back onto the target.
function launch(from, tx, tz, speedH, spin, grounded) {
  const dx = tx - from.x;
  const dz = tz - from.z;
  const D = hyp(dx, dz) || 1;
  const T = D / speedH;
  const km = grounded ? MAGNUS * 0.25 : MAGNUS;
  const decay = grounded ? 2.5 : SPIN_DECAY;
  const dev = 0.5 * km * spin * D * D / speedH * Math.max(0.25, 1 - (decay * T) / 3);
  const a = Math.atan2(dz, dx) + clamp(dev / D, -0.6, 0.6);
  return { vx: Math.cos(a) * speedH, vz: Math.sin(a) * speedH, D, T };
}

class Player {
  constructor(game, team, idx, data) {
    this.game = game;
    this.team = team;
    this.idx = idx;
    this.data = data;
    const f = FORMATION[idx];
    this.role = f.role;
    this.base = { x: f.x, z: f.z };
    this.isGK = f.role === 'GK';
    this.model = new PlayerModel(game.renderer, this.isGK ? team.mats.gk : team.mats.outfield, data, this.isGK);
    game.scene.add(this.model.root);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.want = new THREE.Vector3();
    this.facing = 0;
    this.kickCd = 0;
    this.stun = 0;
    this.slideT = 0;
    this.slideDir = new THREE.Vector3();
    this.slideHit = false;
    this.tackleCd = 0;
    this.diveCd = 0;
    this.decisionT = rand() * 0.5;
    this.holdT = 0;
    this.pending = null;
    this.headYaw = 0;
    this.headPitch = 0;
    const mul = team.ai ? game.diff.speed : 1;
    this.sprint = (6.3 + data.pac * 0.024) * mul;
    this.jog = this.sprint * 0.7;
    this.drib = (data.pac + data.pas + data.ovr) / 3;
  }

  get fx() {
    return Math.sin(this.facing);
  }

  get fz() {
    return Math.cos(this.facing);
  }

  dispose() {
    this.game.scene.remove(this.model.root);
  }
}

export class Game {
  constructor({ scene, renderer, stadium, ball, sfx, hud }) {
    Object.assign(this, { scene, renderer, stadium, ball, sfx, hud });
    this.teams = [];
    this.players = [];
    this.state = 'idle';
    this.simT = 0;
    this.frames = [];
    this.shake = 0;
    this.charge = null;
    ball.onBounce = (v) => { if (v > 4) this.sfx.kick(Math.min(0.4, v / 30)); };
    ball.onPost = (v) => {
      if (v < 3) return;
      this.sfx.post();
      if (this.shot && this.simT - this.shot.t < 3) {
        this.say(pick(['Off the post!', 'Rattles the woodwork!', 'Denied by the frame!']));
        this.nearMiss(0.8);
      }
    };
  }

  // ------------------------------------------------------------------ setup

  setupMatch({ userClub, aiClub, kits, difficulty, minutes }) {
    for (const p of this.players) p.dispose();
    this.diff = DIFFICULTY[difficulty];
    this.difficulty = difficulty;
    const mk = (idx, club, kit, dir, ai) => {
      const rating = teamRating(club);
      const base = clamp((rating - 72) / 18, 0, 1);
      const bonus = ai ? { easy: -0.25, normal: 0, hard: 0.2 }[difficulty] : 0;
      return {
        idx, club, kit, dir, ai, human: !ai, score: 0, rating,
        q: clamp(base * 0.75 + 0.2 + bonus, 0, 1),
        name: club.name, short: club.short, players: [],
        mats: { outfield: kitMaterials(this.renderer, kit, club.gk, false), gk: kitMaterials(this.renderer, kit, club.gk, true) },
      };
    };
    this.teams = [mk(0, userClub, kits.user, 1, false), mk(1, aiClub, kits.ai, -1, true)];
    this.players = [];
    for (const t of this.teams) {
      t.players = t.club.players.map((d, i) => new Player(this, t, i, d));
      this.players.push(...t.players);
      t.gk = t.players[0];
    }
    this.clock = 0;
    this.clockRate = 5400 / (minutes * 60);
    this.half = 1;
    this.owner = null;
    this.lastTouch = null;
    this.receiver = null;
    this.shot = null;
    this.lastKick = null;
    this.controlled = this.teams[0].players[9];
    this.switchCd = 0;
    this.frames = [];
    this.startKickoff(0, true);
  }

  opp(team) {
    return this.teams[1 - team.idx];
  }

  say(text) {
    this.hud.say(text);
  }

  nearMiss(amount) {
    this.stadium.setExcite(0.6 * amount);
    this.sfx.swell(0.55 * amount, 2.5);
  }

  // ------------------------------------------------------------------ restarts

  resetPoses() {
    for (const p of this.players) {
      p.model.setPose(POSE.NONE);
      p.model.s.fallT = p.model.s.tackleT = p.model.s.diveT = p.model.s.stumbleT = p.model.s.kickT = 0;
      p.vel.set(0, 0, 0);
      p.stun = p.slideT = 0;
      p.pending = null;
      p.kickCd = 0;
    }
  }

  startKickoff(teamIdx, first = false) {
    this.state = 'kickoff';
    this.stateT = 0;
    this.kickoffTeam = teamIdx;
    this.resetPoses();
    this.ball.place(0, 0);
    this.owner = null;
    this.receiver = null;
    this.shot = null;
    this.charge = null;
    this.celebration = null;
    for (const t of this.teams) {
      for (const p of t.players) {
        let x = Math.min(p.base.x * 0.95, -1.5);
        let z = p.base.z;
        if (t.idx !== teamIdx && hyp(x, z) < 10) {
          const s = 10 / (hyp(x, z) || 1);
          x *= s;
          z *= s;
        }
        p.pos.set(x * t.dir, 0, z * t.dir);
        p.facing = t.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
    const kt = this.teams[teamIdx];
    const st = kt.players[9];
    st.pos.set(-0.45 * kt.dir, 0, 0);
    kt.players[5].pos.set(-4 * kt.dir, 0, 5 * kt.dir);
    this.setOwner(st, true);
    if (kt.human) this.setControlled(st);
    this.hud.banner(first ? 'KICK OFF' : '', first ? `${this.teams[0].name} vs ${this.teams[1].name}` : '', 1.6);
  }

  startSetPiece(kind, team, x, z) {
    this.state = 'setpiece';
    this.stateT = 0;
    this.setPieceKind = kind;
    this.setPieceTeam = team;
    this.charge = null;
    this.receiver = null;
    this.shot = null;
    for (const p of this.players) {
      p.stun = p.slideT = 0;
      p.pending = null;
    }
    this.ball.place(x, z);
    let taker;
    const d = team.dir;
    if (kind === 'goalkick') taker = team.gk;
    else {
      taker = this.nearest(team, x, z, (p) => !p.isGK);
    }
    const into = new THREE.Vector3(-x, 0, -z).normalize();
    if (kind === 'throw') into.set(0, 0, -Math.sign(z));
    if (kind === 'goalkick') into.set(d, 0, 0);
    taker.pos.set(x - into.x * 0.6, 0, z - into.z * 0.6);
    taker.facing = Math.atan2(into.x, into.z);
    taker.vel.set(0, 0, 0);
    if (kind === 'corner') {
      const gx = HALF_L * d;
      const spots = [[-6, -3], [-9, 2], [-11, -1], [-7, 4], [-13, 5], [-18, 0]];
      let i = 0;
      for (const p of team.players) {
        if (p === taker || p.isGK || p.role === 'DEF' && p.idx !== 2 && p.idx !== 3) continue;
        const s = spots[i++ % spots.length];
        p.pos.set(gx + s[0] * d + gauss(), 0, s[1] + gauss());
      }
      const def = this.opp(team);
      i = 0;
      for (const p of def.players) {
        if (p.isGK || p.role === 'FWD' && p.idx !== 9) continue;
        const s = spots[i++ % spots.length];
        p.pos.set(gx + (s[0] + 1) * d + gauss() * 0.5, 0, s[1] + 0.8 + gauss() * 0.5);
      }
    }
    this.setOwner(taker, true);
    if (team.human && !taker.isGK) this.setControlled(taker);
    const msg = { throw: 'Throw-in', corner: 'Corner kick', goalkick: 'Goal kick' }[kind];
    this.say(`${msg} — ${team.name}`);
  }

  // ------------------------------------------------------------------ possession

  setOwner(p, silent = false) {
    this.owner = p;
    this.ball.vel.set(0, 0, 0);
    this.ball.spin.set(0, 0, 0);
    p.holdT = 0;
    p.decisionT = lerp(0.5, 0.2, p.team.q) + rand() * 0.2;
    if (this.receiver && this.receiver.team !== p.team && !silent && this.lastKick?.team !== p.team) {
      if (this.lastKick && ['pass', 'through', 'cross'].includes(this.lastKick.type) && rand() < 0.35) {
        this.say(pick(['Intercepted!', 'Read that well', 'Cut out!']));
      }
    }
    this.receiver = null;
    this.lastTouch = p.team;
    if (p.team.human && !p.isGK) this.setControlled(p);
  }

  setControlled(p) {
    if (this.controlled === p) return;
    this.controlled = p;
    this.switchCd = 0.8;
  }

  nearest(team, x, z, filter = () => true, exclude = null) {
    let best = null;
    let bd = Infinity;
    for (const p of team.players) {
      if (p === exclude || !filter(p)) continue;
      const d = hyp(p.pos.x - x, p.pos.z - z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  nearestOpponentDist(p) {
    let bd = Infinity;
    for (const o of this.opp(p.team).players) bd = Math.min(bd, hyp(o.pos.x - p.pos.x, o.pos.z - p.pos.z));
    return bd;
  }

  // ------------------------------------------------------------------ kicks

  // Queue a kick; the ball leaves the foot at the animation's contact frame.
  performKick(p, type, power, opts = {}) {
    if (p.pending) return;
    const plan = this.planKick(p, type, power, opts);
    if (!plan) return;
    const kind = {
      pass: KICK.PASS, through: KICK.CHIP, cross: KICK.SHOT, shot: KICK.SHOT, finesse: KICK.SHOT,
      power: KICK.POWER, chip: KICK.CHIP, clear: KICK.CLEAR,
    }[type];
    p.model.kick(kind);
    p.pending = { t: opts.instant ? 0.02 : kickContactDelay(kind), plan };
    p.facing = Math.atan2(plan.vx, plan.vz);
  }

  releaseKick(p) {
    const { plan } = p.pending;
    p.pending = null;
    if (this.owner !== p) return;
    this.owner = null;
    const b = this.ball;
    b.pos.set(p.pos.x + p.fx * 0.35, BALL_R + 0.02, p.pos.z + p.fz * 0.35);
    b.vel.set(plan.vx, plan.vy, plan.vz);
    b.spin.set(0, plan.spin, 0);
    p.kickCd = 0.3;
    this.lastTouch = p.team;
    this.lastKick = { type: plan.type, team: p.team, player: p, t: this.simT, dist: plan.dist ?? 0 };
    this.sfx.kick(clamp(hyp(plan.vx, plan.vz) / 34, 0.2, 1));
    if (SHOT_TYPES.has(plan.type)) {
      this.shot = { team: p.team, player: p, type: plan.type, t: this.simT, dist: plan.dist, checked: false };
      this.stadium.setExcite(0.35);
      if (plan.dist > 25 && rand() < 0.5) this.say(pick(['He tries his luck from range!', 'Long-range effort!']));
    }
    if (plan.receiver) {
      this.receiver = plan.receiver;
      this.receiver.receiveT = plan.T + 1.5;
      this.receiveSpot = plan.spot;
      if (plan.receiver.team.human) this.setControlled(plan.receiver);
    } else this.receiver = null;
    if (plan.type === 'clear') this.say(pick(['Hoofed clear!', 'Big clearance!', 'Launched upfield!']));
    if (plan.type === 'cross' && rand() < 0.5) this.say(pick(['Whipped in!', 'Ball into the box!']));
    if (plan.type === 'through' && rand() < 0.4) this.say(pick(['Lovely ball over the top!', 'Threaded through!']));
    if (this.state === 'setpiece' || this.state === 'kickoff') this.state = 'play';
  }

  planKick(p, type, power, opts) {
    const d = p.team.dir;
    const gx = HALF_L * d;
    const sho = p.data.sho / 100;
    const pas = p.data.pas / 100;
    const aiErr = p.team.ai ? this.diff.shotErr : 1;
    const lateral = opts.lateral ?? 0;
    const from = p.pos;

    if (SHOT_TYPES.has(type)) {
      let tz = opts.aimZ;
      const distG = hyp(gx - from.x, from.z);
      if (tz === undefined) tz = -Math.sign(from.z || 1) * (GOAL_HW - 0.6) * (0.5 + rand() * 0.5);
      let speedH;
      let height;
      let spin = 0;
      let errA;
      let errH;
      if (type === 'shot') {
        speedH = (17 + 13 * power) * (0.85 + 0.3 * sho);
        height = 0.3 + power * 1.5 + (power > 0.9 ? (power - 0.9) * 14 : 0);
        errA = (1 - sho) * 0.11 * (0.6 + power);
        errH = (1 - sho) * 1.2 * power;
        spin = lateral * 0.35;
      } else if (type === 'power') {
        speedH = (25 + 12 * power) * (0.9 + 0.2 * sho);
        height = 0.25 + power * 1.1 + (power > 0.92 ? (power - 0.92) * 16 : 0);
        errA = (1 - sho) * 0.26 * (0.5 + power);
        errH = (1 - sho) * 2.2 * power;
        spin = lateral * 0.15;
      } else if (type === 'finesse') {
        if (opts.aimZ === undefined) tz = -Math.sign(from.z || (rand() - 0.5)) * (GOAL_HW - 0.55);
        speedH = (15 + 8 * power) * (0.9 + 0.15 * sho);
        height = 0.8 + power * 0.9;
        errA = (1 - sho) * 0.07;
        errH = (1 - sho) * 0.7;
        const dx = gx - from.x;
        const dz = tz - from.z;
        const L = hyp(dx, dz) || 1;
        const leftX = dz / L;
        const leftZ = -dx / L;
        const bend = Math.sign((gx - gx) * leftX + (0 - tz) * leftZ) || 1;
        spin = bend * (0.8 + 0.4 * power) + lateral * 0.3;
      } else {
        const T = 0.95 + distG / 30;
        speedH = (distG / T) * (0.95 + 0.1 * power);
        height = 1.9 - (1 - power) * 0.9;
        errA = (1 - sho) * 0.08;
        errH = (1 - sho) * 0.9;
      }
      errA *= aiErr;
      errH *= aiErr;
      if (this.nearestOpponentDist(p) < 2) errA += 0.03;
      const aim = launch(from, gx, tz, speedH, spin, false);
      const ang = Math.atan2(aim.vz, aim.vx) + gauss() * errA;
      const T = aim.D / speedH;
      const h = height + gauss() * errH;
      const vy = (h - BALL_R + 4.9 * T * T) / T;
      return { type, vx: Math.cos(ang) * speedH, vy, vz: Math.sin(ang) * speedH, spin, dist: distG, T };
    }

    if (type === 'clear') {
      let ang = Math.atan2(0, d);
      const fa = Math.atan2(p.fz, p.fx);
      if (Math.cos(fa - ang) > 0) ang = lerp(ang, ang + wrap(fa - ang), 0.5);
      ang += gauss() * 0.22;
      const speedH = 21 + 10 * power;
      return { type, vx: Math.cos(ang) * speedH, vy: 10 + 5 * power, vz: Math.sin(ang) * speedH, spin: gauss() * 0.3, T: 2 };
    }

    // passing family
    const dirX = opts.dirX ?? p.fx;
    const dirZ = opts.dirZ ?? p.fz;
    let recv = opts.target ?? null;
    let spot;
    if (type === 'cross') {
      const inZone = d * from.x > HALF_L - 26 && Math.abs(from.z) > 10;
      if (inZone) {
        const box = new THREE.Vector3(gx - d * (8 + rand() * 4), 0, -Math.sign(from.z) * rand() * 4);
        recv = recv ?? this.bestInArea(p.team, box.x, box.z, 14, p);
        spot = recv ? new THREE.Vector3(lerp(recv.pos.x, box.x, 0.5), 0, lerp(recv.pos.z, box.z, 0.5)) : box;
      }
    }
    if (!recv && !spot) recv = this.choosePassTarget(p, dirX, dirZ, type === 'through');
    if (recv && !spot) {
      if (type === 'through') {
        const lead = 5 + 9 * power;
        spot = new THREE.Vector3(recv.pos.x + d * lead, 0, recv.pos.z + recv.vel.z * 0.4);
      } else if (type === 'cross') {
        spot = recv.pos.clone().addScaledVector(recv.vel, 0.9);
      } else {
        spot = recv.pos.clone().addScaledVector(recv.vel, 0.55);
      }
    }
    if (!spot) {
      const len = 10 + power * 25;
      spot = new THREE.Vector3(from.x + dirX * len, 0, from.z + dirZ * len);
    }
    spot.x = clamp(spot.x, -HALF_L + 1, HALF_L - 1);
    spot.z = clamp(spot.z, -HALF_W + 1, HALF_W - 1);
    const D = hyp(spot.x - from.x, spot.z - from.z);
    const errA = ((1 - pas) * 0.09 + D * 0.0008) * (p.team.ai ? lerp(1.4, 0.7, p.team.q) : 1);

    if (type === 'pass') {
      const vArr = 4.5 + D * 0.12 + power * 5;
      const speedH = clamp(Math.sqrt(2 * 1.9 * D + vArr * vArr), 7, 29);
      const spin = lateral * 0.6;
      const aim = launch(from, spot.x, spot.z, speedH, spin, true);
      const ang = Math.atan2(aim.vz, aim.vx) + gauss() * errA;
      return { type, vx: Math.cos(ang) * speedH, vy: 0.4, vz: Math.sin(ang) * speedH, spin, receiver: recv, spot, T: D / speedH };
    }

    // lofted: through balls and crosses
    const T = (type === 'cross' ? 1.0 : 0.85) + D / 32;
    const speedH = (D / T) * (type === 'through' ? 0.86 : 0.97);
    let spin = lateral * 0.5;
    if (type === 'cross') {
      const leftX = (spot.z - from.z) / (D || 1);
      const leftZ = -(spot.x - from.x) / (D || 1);
      const toGoal = (gx - spot.x) * leftX + (0 - spot.z) * leftZ;
      spin += Math.sign(toGoal) * 0.5;
    }
    const aim = launch(from, spot.x, spot.z, speedH, spin, false);
    const ang = Math.atan2(aim.vz, aim.vx) + gauss() * errA;
    const vy = 4.9 * T + (type === 'cross' ? 0.6 : 0);
    return { type, vx: Math.cos(ang) * speedH, vy, vz: Math.sin(ang) * speedH, spin, receiver: recv, spot, T };
  }

  bestInArea(team, x, z, radius, exclude) {
    let best = null;
    let bd = radius;
    for (const m of team.players) {
      if (m === exclude || m.isGK) continue;
      const d = hyp(m.pos.x - x, m.pos.z - z);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  choosePassTarget(p, dirX, dirZ, forwardOnly) {
    let best = null;
    let bs = -Infinity;
    const dl = hyp(dirX, dirZ) || 1;
    for (const m of p.team.players) {
      if (m === p) continue;
      const dx = m.pos.x - p.pos.x;
      const dz = m.pos.z - p.pos.z;
      const D = hyp(dx, dz);
      if (D < 3 || D > 50) continue;
      const cos = (dx * dirX + dz * dirZ) / (D * dl);
      if (cos < 0.55) continue;
      if (forwardOnly && (m.pos.x - p.pos.x) * p.team.dir < -2) continue;
      if (m.isGK && cos < 0.9) continue;
      const s = cos * 1.8 - D / 35;
      if (s > bs) {
        bs = s;
        best = m;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ tackles

  standingTackle(p) {
    if (p.tackleCd > 0 || p.stun > 0 || this.owner === p) return;
    p.tackleCd = 0.7;
    p.model.kick(KICK.PASS);
    const o = this.owner;
    if (!o || o.team === p.team || o.isGK && o.holdT > 0 && this.inOwnBox(o)) return;
    const d = hyp(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
    if (d > 2.0) return;
    const aiMul = p.team.ai ? this.diff.steal : 1;
    const chance = clamp(0.38 + (p.data.def - o.drib) / 100 * 0.9 + (aiMul - 1) * 0.15 - (d - 1) * 0.15, 0.12, 0.88);
    if (rand() < chance) {
      o.stun = 0.6;
      o.model.stumble();
      o.kickCd = 0.6;
      if (rand() < 0.6) this.setOwner(p);
      else {
        this.owner = null;
        this.ball.vel.set((o.pos.x - p.pos.x) * 3 + gauss() * 2, 0.5, (o.pos.z - p.pos.z) * 3 + gauss() * 2);
        this.lastTouch = p.team;
      }
      if (rand() < 0.5) this.say(pick([`Great tackle by ${p.data.back}!`, 'Won it back!', 'Timed to perfection!']));
    } else {
      p.stun = 0.45;
      p.model.stumble();
    }
  }

  slideTackle(p, dirX, dirZ) {
    if (p.tackleCd > 0 || p.stun > 0 || this.owner === p || p.slideT > 0) return;
    const l = hyp(dirX, dirZ) || 1;
    p.slideDir.set(dirX / l, 0, dirZ / l);
    p.facing = Math.atan2(p.slideDir.x, p.slideDir.z);
    p.slideT = 0.75;
    p.slideHit = false;
    p.tackleCd = 1.3;
    p.vel.copy(p.slideDir).multiplyScalar(Math.max(8.5, p.vel.length() + 2));
    p.model.slide();
  }

  updateSlide(p, dt) {
    p.slideT -= dt;
    p.vel.multiplyScalar(Math.exp(-dt * 2.2));
    if (p.slideT <= 0) {
      p.stun = 0.45;
      return;
    }
    if (p.slideHit) return;
    const fx = p.pos.x + p.slideDir.x * 0.7;
    const fz = p.pos.z + p.slideDir.z * 0.7;
    const b = this.ball.pos;
    if (hyp(b.x - fx, b.z - fz) > 1.3 || b.y > 0.6) return;
    const o = this.owner;
    if (o && o.team === p.team) return;
    p.slideHit = true;
    const knock = () => {
      this.owner = null;
      this.ball.vel.set(p.slideDir.x * 9 + gauss() * 2, 1 + rand(), p.slideDir.z * 9 + gauss() * 2);
      this.lastTouch = p.team;
      p.kickCd = 0.4;
    };
    if (!o) {
      knock();
      return;
    }
    const aiMul = p.team.ai ? this.diff.steal : 1;
    const chance = clamp(0.52 + (p.data.def - o.drib) / 100 + (aiMul - 1) * 0.15, 0.2, 0.92);
    if (rand() < chance) {
      knock();
      o.stun = 1.4;
      o.model.fall();
      o.kickCd = 1;
      this.say(pick(['Crunching slide tackle!', `What a challenge from ${p.data.back}!`, 'Sliding in — and wins it!']));
      this.stadium.setExcite(0.3);
    } else {
      o.model.stumble();
      o.stun = 0.25;
    }
  }

  // ------------------------------------------------------------------ main update

  update(dt, input) {
    if (this.state === 'idle') return;
    this.time = (this.time ?? 0) + dt;
    this.shake = Math.max(0, this.shake - dt * 1.4);
    if (this.state === 'replay') {
      this.updateReplay(dt, input);
      return;
    }
    this.simT += dt;
    this.stateT += dt;
    this.switchCd -= dt;

    switch (this.state) {
      case 'kickoff':
        this.updateAll(dt, input, true);
        if (this.stateT > 1.4) {
          this.state = 'play';
          this.sfx.whistle();
          const st = this.owner;
          if (st && st.team.ai) this.performKick(st, 'pass', 0.2, { target: st.team.players[6] });
        }
        break;
      case 'setpiece':
        this.updateAll(dt, input, true);
        if (this.owner && this.owner.team.ai || this.owner?.isGK) {
          if (this.stateT > 1.3 && !this.owner.pending) this.aiSetPiece(this.owner);
        } else if (this.stateT > 8 && this.owner && !this.owner.pending) {
          this.performKick(this.owner, 'pass', 0.4, {});
        }
        break;
      case 'play':
        this.clock += dt * this.clockRate;
        this.updateAll(dt, input, false);
        this.checkRules();
        if (this.half === 1 && this.clock >= 2700 && this.state === 'play') this.halfTime();
        else if (this.clock >= 5400 && this.state === 'play') this.fullTime();
        break;
      case 'goal':
        this.updateCelebration(dt, input);
        break;
      case 'halftime':
        this.updateAll(dt, input, true, true);
        if (this.stateT > 3) this.startKickoff(1);
        break;
      case 'fulltime':
        this.updateAll(dt, input, true, true);
        break;
      default:
        break;
    }
    this.record();
  }

  halfTime() {
    this.half = 2;
    this.clock = 2700;
    this.state = 'halftime';
    this.stateT = 0;
    this.owner = null;
    this.sfx.whistle(true);
    this.hud.banner('HALF TIME', `${this.teams[0].short} ${this.teams[0].score} - ${this.teams[1].score} ${this.teams[1].short}`, 3);
  }

  fullTime() {
    this.clock = 5400;
    this.state = 'fulltime';
    this.stateT = 0;
    this.owner = null;
    this.charge = null;
    this.sfx.whistle(true);
    const [a, b] = this.teams;
    for (const t of this.teams) {
      const o = this.opp(t);
      for (const p of t.players) {
        if (t.score > o.score) p.model.setPose(rand() < 0.5 ? POSE.ARMS_UP : POSE.CLAP);
        else if (t.score < o.score) p.model.setPose(rand() < 0.5 ? POSE.HANDS_HEAD : POSE.CROUCH);
        else p.model.setPose(POSE.CLAP);
      }
    }
    this.stadium.setExcite(0.8);
    this.sfx.swell(0.8, 5);
    this.hud.fullTime(a, b);
  }

  // Moves everyone; `frozen` stops normal play logic (set pieces, kickoff, stoppages).
  updateAll(dt, input, frozen, idle = false) {
    const human = this.teams[0];
    for (const p of this.players) {
      p.kickCd -= dt;
      p.tackleCd -= dt;
      p.diveCd -= dt;
      p.stun -= dt;
      if (p.receiveT !== undefined) p.receiveT -= dt;
      if (p.pending) {
        p.pending.t -= dt;
        if (p.pending.t <= 0) this.releaseKick(p);
      }
    }
    if (this.receiver && this.receiver.receiveT <= 0) this.receiver = null;

    if (!idle) this.handleHuman(dt, input, frozen);

    for (const p of this.players) {
      if (idle) {
        p.want.set(0, 0, 0);
        continue;
      }
      if (p.slideT > 0) {
        this.updateSlide(p, dt);
        continue;
      }
      if (p.stun > 0 && !p.diving) {
        p.want.set(0, 0, 0);
        continue;
      }
      if (p === this.controlled && human.human) continue;
      if (frozen) this.aiFrozen(p);
      else if (this.owner === p) this.aiOwner(p, dt);
      else if (p.isGK) this.aiKeeper(p, dt);
      else this.aiOffBall(p, dt);
    }

    this.integrate(dt);
    if (!frozen) this.updatePossession();
    this.updateBall(dt);
  }

  // ------------------------------------------------------------------ human input

  handleHuman(dt, input, frozen) {
    const p = this.controlled;
    if (!p) return;
    const mv = input.move;
    const mlen = Math.min(1, hyp(mv.x, mv.z));
    const locked = frozen && this.owner === p;
    const busy = p.stun > 0 || p.slideT > 0 || p.model.s.fallT > 0;

    if (!busy && !locked && (!frozen || this.owner !== p)) {
      const hasBall = this.owner === p;
      const sp = (input.sprint ? p.sprint : p.jog) * (hasBall ? 0.92 : 1) * (p.pending ? 0.4 : 1);
      if (mlen > 0.1) p.want.set((mv.x / mlen) * sp * mlen, 0, (mv.z / mlen) * sp * mlen);
      else p.want.set(0, 0, 0);
      if (frozen && this.state === 'kickoff') p.want.set(0, 0, 0);
    } else if (locked) {
      p.want.set(0, 0, 0);
      if (mlen > 0.2) p.facing = Math.atan2(mv.x, mv.z);
    } else p.want.set(0, 0, 0);

    if (frozen && this.state === 'setpiece' && this.stateT < 0.4) return;
    if (frozen && this.state === 'kickoff') return;

    // Auto-switch to the closest defender when the ball is theirs or loose.
    const ourBall = this.owner && this.owner.team === p.team || this.receiver && this.receiver.team === p.team;
    if (!ourBall && !frozen && this.switchCd <= 0 && !this.charge) {
      const b = this.ball.pos;
      const n = this.nearest(p.team, b.x + this.ball.vel.x * 0.3, b.z + this.ball.vel.z * 0.3, (m) => !m.isGK && m.stun <= 0);
      if (n && n !== p && hyp(b.x - p.pos.x, b.z - p.pos.z) > hyp(b.x - n.pos.x, b.z - n.pos.z) + 5) {
        this.setControlled(n);
        return;
      }
    }

    // Switch player
    if (input.pressed.has('switch') && this.owner !== p) {
      const b = this.ball.pos;
      const n = this.nearest(this.teams[0], b.x, b.z, (m) => !m.isGK, p);
      if (n) {
        this.controlled = n;
        this.switchCd = 1.2;
        this.charge = null;
      }
      return;
    }

    // Defensive actions
    if (this.owner !== p) {
      if (input.pressed.has('tackle')) this.standingTackle(p);
      if (input.pressed.has('slide')) {
        const dx = mlen > 0.2 ? mv.x : p.fx;
        const dz = mlen > 0.2 ? mv.z : p.fz;
        this.slideTackle(p, dx, dz);
      }
    }

    // Charged kicks
    for (const a of KICK_ACTIONS) {
      if (input.pressed.has(a) && !this.charge) {
        let type = a;
        if (a === 'shot' && input.ctrl) type = 'finesse';
        this.charge = { key: a, type, power: 0 };
      }
    }
    if (this.charge) {
      const c = this.charge;
      c.power = Math.min(1, c.power + dt * CHARGE_RATE[c.type]);
      if (input.released.has(c.key) || !input.down.has(c.key)) {
        this.charge = null;
        this.humanKick(p, c.type, Math.max(0.12, c.power), mv, mlen);
      }
    }
    this.hud.power(this.charge ? this.charge.power : 0, this.charge ? KICK_LABEL[this.charge.type] : '');
  }

  humanKick(p, type, power, mv, mlen) {
    if (p.pending || p.stun > 0 || p.slideT > 0) return;
    if (this.owner !== p) {
      const b = this.ball.pos;
      if (this.owner || hyp(b.x - p.pos.x, b.z - p.pos.z) > 1.7 || b.y > 1.2 || p.kickCd > 0) return;
      this.setOwner(p);
      this.performKick(p, type, power, { ...this.humanAim(p, type, mv, mlen), instant: true });
      return;
    }
    if (this.state === 'setpiece' && this.setPieceKind === 'throw' && SHOT_TYPES.has(type)) type = 'through';
    this.performKick(p, type, power, this.humanAim(p, type, mv, mlen));
  }

  humanAim(p, type, mv, mlen) {
    const opts = {};
    const dx = mlen > 0.2 ? mv.x / mlen : p.fx;
    const dz = mlen > 0.2 ? mv.z / mlen : p.fz;
    opts.dirX = dx;
    opts.dirZ = dz;
    // Lateral stick relative to the kick direction (+ = left, which bends the ball left).
    let kx;
    let kz;
    if (SHOT_TYPES.has(type)) {
      kx = HALF_L * p.team.dir - p.pos.x;
      kz = -p.pos.z;
      if (mlen > 0.2 && Math.abs(mv.z) > 0.25) opts.aimZ = clamp(mv.z, -1, 1) * (GOAL_HW - 0.45);
    } else {
      kx = p.fx;
      kz = p.fz;
    }
    const kl = hyp(kx, kz) || 1;
    opts.lateral = mlen > 0.2 ? clamp((mv.x * (kz / kl) - mv.z * (kx / kl)), -1, 1) : 0;
    if (SHOT_TYPES.has(type)) opts.lateral *= 0.6;
    return opts;
  }

  // ------------------------------------------------------------------ AI

  teamTarget(p) {
    const t = p.team;
    const d = t.dir;
    const b = this.ball.pos;
    const bx = b.x * d;
    const bz = b.z * d;
    const attacking = this.owner && this.owner.team === t || this.receiver && this.receiver.team === t;
    const push = attacking ? 11 : -3;
    let tx = p.base.x + (bx + 8) * 0.55 + push;
    let tz = p.base.z * (attacking ? 1.1 : 0.72) + bz * 0.35;
    const [lo, hi] = CLAMP_X[p.role];
    tx = clamp(tx, lo, hi);
    if (!attacking && p.role === 'DEF') tx = Math.min(tx, bx - 4);
    if (attacking && p.role === 'FWD') {
      // stay roughly onside: not beyond the deepest defender
      const deepest = Math.max(...this.opp(t).players.filter((o) => !o.isGK).map((o) => o.pos.x * d));
      tx = Math.min(tx, Math.max(deepest - 0.5, bx));
    }
    tz = clamp(tz, -HALF_W + 2, HALF_W - 2);
    return [tx * d, tz * d];
  }

  steer(p, tx, tz, speed, arrive = 1.5) {
    const dx = tx - p.pos.x;
    const dz = tz - p.pos.z;
    const d = hyp(dx, dz);
    if (d < 0.3) {
      p.want.set(0, 0, 0);
      return d;
    }
    const s = d < arrive * 2 ? speed * (d / (arrive * 2)) : speed;
    p.want.set((dx / d) * s, 0, (dz / d) * s);
    return d;
  }

  chaser(team) {
    const b = this.ball;
    const px = b.pos.x + b.vel.x * 0.45;
    const pz = b.pos.z + b.vel.z * 0.45;
    return this.nearest(team, px, pz, (m) => !m.isGK && m.stun <= 0);
  }

  aiFrozen(p) {
    if (this.owner === p) {
      p.want.set(0, 0, 0);
      return;
    }
    const [tx, tz] = this.state === 'setpiece' && this.setPieceKind === 'corner' ? [p.pos.x, p.pos.z] : this.teamTarget(p);
    if (p.isGK && this.state === 'setpiece') {
      const ox = -HALF_L * p.team.dir;
      this.steer(p, ox + p.team.dir * 1, 0, 3);
      return;
    }
    this.steer(p, tx, tz, p.jog * 0.8);
    const b = this.ball.pos;
    if (this.state === 'setpiece' && p.team !== this.setPieceTeam) {
      const d = hyp(p.pos.x - b.x, p.pos.z - b.z);
      const min = this.setPieceKind === 'throw' ? 3 : 9;
      if (d < min) {
        p.pos.x = b.x + ((p.pos.x - b.x) / (d || 1)) * min;
        p.pos.z = b.z + ((p.pos.z - b.z) / (d || 1)) * min;
      }
    }
  }

  aiSetPiece(p) {
    const k = this.setPieceKind;
    if (k === 'corner') this.performKick(p, 'cross', 0.6 + rand() * 0.3, {});
    else if (k === 'goalkick') {
      const t = p.team;
      const target = this.bestPassOption(p);
      if (target && rand() < 0.5) this.performKick(p, 'pass', 0.6, { target: target.m });
      else {
        const mids = t.players.filter((m) => m.role === 'MID' || m.role === 'FWD');
        this.performKick(p, 'through', 0.3, { target: pick(mids) });
      }
    } else {
      const o = this.bestPassOption(p);
      if (o) this.performKick(p, 'pass', 0.3, { target: o.m });
      else this.performKick(p, 'pass', 0.3, { dirX: p.team.dir, dirZ: 0 });
    }
  }

  bestPassOption(p) {
    const t = p.team;
    const d = t.dir;
    const opps = this.opp(t).players;
    let best = null;
    for (const m of t.players) {
      if (m === p || m.isGK) continue;
      const D = hyp(m.pos.x - p.pos.x, m.pos.z - p.pos.z);
      if (D < 6 || D > 45) continue;
      let lane = Infinity;
      let open = Infinity;
      for (const o of opps) {
        lane = Math.min(lane, segDist(o.pos.x, o.pos.z, p.pos.x, p.pos.z, m.pos.x, m.pos.z));
        open = Math.min(open, hyp(o.pos.x - m.pos.x, o.pos.z - m.pos.z));
      }
      const noise = gauss() * (1 - t.q) * 5;
      const adv = (m.pos.x - p.pos.x) * d;
      let type = 'pass';
      let score = adv * 0.5 + Math.min(open, 8) * 0.9 + Math.min(lane, 6) * 0.5 - D * 0.08 + noise;
      if (lane < 1.6) score -= 12;
      if ((m.role === 'FWD' || m.role === 'MID') && adv > 4) {
        let space = Infinity;
        for (const o of opps) {
          const ahead = (o.pos.x - m.pos.x) * d;
          if (ahead > 0 && ahead < 14) space = Math.min(space, hyp(o.pos.x - m.pos.x, o.pos.z - m.pos.z));
        }
        if (space > 5 && m.pos.x * d < HALF_L - 14) {
          const ts = score + 3 + t.q * 4 + (p.data.pas - 75) * 0.1;
          if (ts > score) {
            score = ts;
            type = 'through';
          }
        }
      }
      if (!best || score > best.score) best = { m, score, type };
    }
    return best;
  }

  aiOwner(p, dt) {
    const t = p.team;
    const d = t.dir;
    const gx = HALF_L * d;
    if (p.pending) {
      p.want.multiplyScalar(0.5);
      return;
    }
    if (p.isGK) {
      p.holdT += dt;
      p.want.set(0, 0, 0);
      p.model.setPose(POSE.HOLD);
      if (p.holdT > 1.1) {
        p.model.setPose(POSE.NONE);
        const o = this.bestPassOption(p);
        if (o && o.score > 2 && rand() < 0.6) this.performKick(p, 'pass', 0.5, { target: o.m });
        else {
          const tgt = pick(t.players.filter((m) => m.role !== 'GK' && m.role !== 'DEF'));
          this.performKick(p, 'through', 0.2, { target: tgt });
        }
      }
      return;
    }
    const distG = hyp(gx - p.pos.x, p.pos.z);
    const pressure = this.nearestOpponentDist(p);
    p.decisionT -= dt;
    if (p.decisionT <= 0) {
      p.decisionT = lerp(0.6, 0.22, t.q) + rand() * 0.25;
      const sho = p.data.sho;
      const inRange = distG < 30 && (Math.abs(p.pos.z) < 18 || distG < 17);
      if (inRange) {
        const want = distG < 13 ? 0.95 : distG < 19 ? 0.6 : distG < 25 ? 0.28 * (sho / 85) : 0.12 * (sho / 85);
        if (rand() < want) {
          this.aiShoot(p, distG);
          return;
        }
      }
      if (Math.abs(p.pos.z) > 17 && p.pos.x * d > HALF_L - 24) {
        const inBox = this.bestInArea(t, gx - d * 10, 0, 12, p);
        if (inBox && rand() < 0.55 + t.q * 0.2) {
          this.performKick(p, 'cross', 0.55 + rand() * 0.35, { target: inBox });
          return;
        }
      }
      if (p.pos.x * d < -HALF_L + 24 && pressure < 3.2 && p.role === 'DEF' && rand() < 0.55 - t.q * 0.25) {
        this.performKick(p, 'clear', 0.5 + rand() * 0.5, {});
        return;
      }
      const o = this.bestPassOption(p);
      if (o && (pressure < 3.2 && o.score > -6 || o.score > 9 - t.q * 3 && rand() < 0.45 + t.q * 0.2)) {
        this.performKick(p, o.type, o.type === 'through' ? 0.35 + rand() * 0.3 : 0.2 + rand() * 0.3, { target: o.m });
        return;
      }
    }
    // Dribble toward goal, avoiding defenders.
    let dx = gx - p.pos.x;
    let dz = -p.pos.z * 0.6;
    const l = hyp(dx, dz) || 1;
    dx /= l;
    dz /= l;
    let ax = 0;
    let az = 0;
    let crowded = false;
    for (const o of this.opp(t).players) {
      const ox = o.pos.x - p.pos.x;
      const oz = o.pos.z - p.pos.z;
      const od = hyp(ox, oz);
      if (od > 7 || ox * dx + oz * dz < -1) continue;
      crowded = crowded || od < 4;
      const w = (1 - od / 7) * 1.6;
      const side = Math.sign(ox * dz - oz * dx) || 1;
      ax += dz * side * w;
      az += -dx * side * w;
    }
    let mx = dx + ax;
    let mz = dz + az;
    if (Math.abs(p.pos.z) > HALF_W - 4) mz -= Math.sign(p.pos.z) * 1.5;
    const ml = hyp(mx, mz) || 1;
    const sp = (crowded ? p.jog * 1.05 : p.sprint * 0.92);
    p.want.set((mx / ml) * sp, 0, (mz / ml) * sp);
  }

  aiShoot(p, distG) {
    const t = p.team;
    const d = t.dir;
    const og = this.opp(t).gk;
    const gkOff = HALF_L - Math.abs(og.pos.x);
    const sho = p.data.sho;
    let type = 'shot';
    const r = rand();
    if (gkOff > 4.5 && distG > 12 && distG < 32 && r < 0.75) type = 'chip';
    else if (distG > 21 && sho >= 80 && r < 0.55) type = 'power';
    else if ((Math.abs(p.pos.z) > 5 || r < 0.35) && sho >= 76 && distG > 9) type = 'finesse';
    let power = clamp(0.45 + distG / 60 + gauss() * 0.08, 0.4, 0.88);
    if (type === 'power') power = clamp(0.55 + distG / 70, 0.5, 0.9);
    if (type === 'chip') power = 0.6 + rand() * 0.3;
    const side = og.pos.z * d > 0.3 ? -1 : og.pos.z * d < -0.3 ? 1 : (rand() < 0.5 ? -1 : 1);
    const aimZ = side * d * (GOAL_HW - 0.5 - rand() * 1.2) * (1 - (1 - t.q) * 0.3);
    this.performKick(p, type, power, { aimZ: type === 'finesse' ? undefined : aimZ });
  }

  aiOffBall(p, dt) {
    const t = p.team;
    const b = this.ball;
    const humanTeam = t.human;
    if (this.receiver === p) {
      const s = this.receiveSpot;
      const bx = b.pos.x + b.vel.x * 0.3;
      const bz = b.pos.z + b.vel.z * 0.3;
      const tx = s && hyp(bx - p.pos.x, bz - p.pos.z) > 6 ? s.x : bx;
      const tz = s && hyp(bx - p.pos.x, bz - p.pos.z) > 6 ? s.z : bz;
      this.steer(p, tx, tz, p.sprint, 0.3);
      return;
    }
    const ownsBall = this.owner && this.owner.team === t;
    if (!ownsBall && !humanTeam && this.chaser(t) === p) {
      this.aiPress(p, dt);
      return;
    }
    let [tx, tz] = this.teamTarget(p);
    if (!ownsBall && !humanTeam) {
      // Second defender tucks toward the ball.
      const dBall = hyp(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      if (dBall < 18) {
        tx = lerp(tx, b.pos.x, 0.35);
        tz = lerp(tz, b.pos.z, 0.35);
      }
    }
    if (!ownsBall && humanTeam && !this.owner && this.nearest(t, b.pos.x, b.pos.z, (m) => !m.isGK) === p
      && this.controlled && hyp(b.pos.x - this.controlled.pos.x, b.pos.z - this.controlled.pos.z) > 12) {
      tx = b.pos.x;
      tz = b.pos.z;
    }
    const d = hyp(tx - p.pos.x, tz - p.pos.z);
    this.steer(p, tx, tz, d > 9 ? p.sprint * 0.9 : p.jog);
  }

  aiPress(p, dt) {
    const b = this.ball;
    const o = this.owner;
    const tLook = Math.min(1.2, hyp(b.pos.x - p.pos.x, b.pos.z - p.pos.z) / p.sprint);
    let tx = b.pos.x + b.vel.x * tLook;
    let tz = b.pos.z + b.vel.z * tLook;
    if (o) {
      // Goal-side approach: aim slightly between the carrier and our goal.
      const ownX = -HALF_L * p.team.dir;
      tx = lerp(o.pos.x, ownX, 0.04);
      tz = o.pos.z * 0.97;
    }
    const d = this.steer(p, tx, tz, p.sprint, 0.2);
    if (!o) return;
    const od = hyp(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
    const rate = this.diff.steal * (0.55 + p.data.def / 100) * lerp(0.6, 1.2, p.team.q);
    if (od < 1.7 && p.tackleCd <= 0 && rand() < rate * dt * 2.2) this.standingTackle(p);
    else if (od > 2.2 && od < 4 && o.vel.length() > 5 && p.tackleCd <= 0 && rand() < dt * 0.35 * rate) {
      this.slideTackle(p, o.pos.x + o.vel.x * 0.3 - p.pos.x, o.pos.z + o.vel.z * 0.3 - p.pos.z);
    }
    return d;
  }

  inOwnBox(p) {
    const ownX = -HALF_L * p.team.dir;
    return Math.abs(p.pos.x - ownX) < PEN_DEPTH && Math.abs(p.pos.z) < PEN_HW;
  }

  aiKeeper(p, dt) {
    const t = p.team;
    const d = t.dir;
    const ownX = -HALF_L * d;
    const b = this.ball;
    if (p.diving) {
      p.diving.t += dt;
      p.want.set(0, 0, p.diving.vz * Math.max(0, 1 - p.diving.t / 0.7));
      p.vel.z = p.want.z;
      p.vel.x *= 0.9;
      if (p.diving.t > 1.1) {
        p.diving = null;
        p.stun = 0.3;
      }
      return;
    }
    if (!this.owner && b.vel.x * -d > 5) {
      const tt = (ownX - b.pos.x) / b.vel.x;
      if (tt > 0 && tt < 1.8) {
        const zc = b.pos.z + b.vel.z * tt;
        const yc = b.pos.y + b.vel.y * tt - 4.9 * tt * tt;
        if (Math.abs(zc) < GOAL_HW + 1.2 && yc < GOAL_H + 1) {
          const tz = clamp(zc, -GOAL_HW + 0.2, GOAL_HW - 0.2);
          const gap = tz - p.pos.z;
          if (tt < 0.6 && Math.abs(gap) > 0.9 && p.diveCd <= 0 && b.vel.length() > 12) {
            const react = t.ai ? this.diff.gkSave : 0.62;
            const reach = clamp(gap, -3.2, 3.2) * lerp(0.75, 1.05, (p.data.def / 100) * react / 0.62);
            p.diving = { t: 0, vz: reach / 0.45 };
            p.diveCd = 2;
            const leftX = p.fz;
            const leftZ = -p.fx;
            p.model.dive(Math.sign(leftZ * gap + leftX * 0) || 1);
            return;
          }
          this.steer(p, ownX + d * 0.5, tz, 7.5, 0.2);
          return;
        }
      }
    }
    const bIn = Math.abs(b.pos.x - ownX) < PEN_DEPTH && Math.abs(b.pos.z) < PEN_HW;
    if (bIn && (!this.owner || this.owner.team !== t)) {
      const nearestAll = this.nearest(this.opp(t), b.pos.x, b.pos.z);
      const myD = hyp(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      const theirD = nearestAll ? hyp(b.pos.x - nearestAll.pos.x, b.pos.z - nearestAll.pos.z) : 99;
      if (!this.owner && (myD < theirD * 0.85 || myD < 4) && b.pos.y < 2) {
        this.steer(p, b.pos.x + b.vel.x * 0.2, b.pos.z + b.vel.z * 0.2, 7, 0.2);
        return;
      }
      if (this.owner && myD < 6) {
        this.steer(p, b.pos.x, b.pos.z, 6.5, 0.2);
        if (myD < 1.6 && rand() < dt * 2) this.standingTackle(p);
        return;
      }
    }
    const bx = b.pos.x - ownX;
    const bz = b.pos.z;
    const bl = hyp(bx, bz) || 1;
    const out = clamp(bl * 0.1, 0.6, 4.5);
    this.steer(p, ownX + (bx / bl) * out, clamp((bz / bl) * out, -GOAL_HW + 0.3, GOAL_HW - 0.3), 5, 0.4);
  }

  // ------------------------------------------------------------------ physics

  integrate(dt) {
    const b = this.ball.pos;
    for (const p of this.players) {
      if (p.slideT <= 0 && !p.diving) {
        const k = Math.min(1, dt * (p.want.lengthSq() > p.vel.lengthSq() ? 5 : 7));
        p.vel.x += (p.want.x - p.vel.x) * k;
        p.vel.z += (p.want.z - p.vel.z) * k;
      }
      p.pos.addScaledVector(p.vel, dt);
      p.pos.x = clamp(p.pos.x, -HALF_L - 4, HALF_L + 4);
      p.pos.z = clamp(p.pos.z, -HALF_W - 3, HALF_W + 3);
      const sp = hyp(p.vel.x, p.vel.z);
      let targetF = p.facing;
      if (p.slideT > 0 || p.diving || p.model.s.fallT > 0) targetF = p.facing;
      else if (sp > 0.8) targetF = Math.atan2(p.vel.x, p.vel.z);
      else if (this.owner !== p) targetF = Math.atan2(b.x - p.pos.x, b.z - p.pos.z);
      const turn = this.owner === p ? 12 : 8;
      p.facing += clamp(wrap(targetF - p.facing), -turn * dt, turn * dt);

      const dx = b.x - p.pos.x;
      const dz = b.z - p.pos.z;
      const yaw = clamp(wrap(Math.atan2(dx, dz) - p.facing), -1.2, 1.2);
      const pitch = clamp(Math.atan2(1.65 - b.y, hyp(dx, dz) + 0.5) * 0.8, -0.7, 0.6);
      p.headYaw += (yaw - p.headYaw) * Math.min(1, dt * 8);
      p.headPitch += (pitch - p.headPitch) * Math.min(1, dt * 8);
      p.model.s.headYaw = p.headYaw;
      p.model.s.headPitch = p.headPitch;
    }
    // Separation
    const ps = this.players;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i].pos;
        const c = ps[j].pos;
        const dx = c.x - a.x;
        const dz = c.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.64 && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (0.8 - d) * 0.5;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          c.x += (dx / d) * push;
          c.z += (dz / d) * push;
        }
      }
    }
    for (const p of this.players) p.model.update(dt, hyp(p.vel.x, p.vel.z), this.time);
  }

  updateBall(dt) {
    const o = this.owner;
    const b = this.ball;
    if (o) {
      if (o.isGK && o.model.s.pose === POSE.HOLD) {
        b.pos.set(o.pos.x + o.fx * 0.35, 1.05, o.pos.z + o.fz * 0.35);
      } else {
        const lead = 0.5 + 0.12 * Math.abs(Math.sin(o.model.s.phase));
        b.pos.set(o.pos.x + o.fx * lead, BALL_R, o.pos.z + o.fz * lead);
      }
      b.vel.copy(o.vel);
      b.spin.set(0, 0, 0);
      return;
    }
    const sub = 4;
    for (let i = 0; i < sub; i++) b.step(dt / sub);
  }

  updatePossession() {
    if (this.owner) return;
    const b = this.ball;
    const bs = b.vel.length();
    this.checkSaves(bs);
    if (this.owner) return;
    let best = null;
    let bd = Infinity;
    for (const p of this.players) {
      if (p.kickCd > 0 || p.stun > 0 || p.slideT > 0 || p.model.s.fallT > 0) continue;
      const d = hyp(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      const hands = p.isGK && this.inOwnBox(p);
      const reach = hands ? 1.2 : 0.85;
      if (d > reach) continue;
      if (!hands && b.pos.y > 0.9) {
        if (b.pos.y < 2.3 && d < 0.75 && bs > 5) this.header(p);
        continue;
      }
      if (hands && b.pos.y > 2.5) continue;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (!best) return;
    if (!best.isGK && bs > 24 && rand() < 0.6) {
      b.vel.multiplyScalar(-0.25);
      b.vel.x += gauss() * 3;
      b.vel.z += gauss() * 3;
      b.vel.y = 1 + rand() * 2;
      best.kickCd = 0.4;
      this.lastTouch = best.team;
      this.say('Blocked!');
      return;
    }
    const wasShot = this.shot && this.shot.team !== best.team && this.simT - this.shot.t < 3;
    this.setOwner(best);
    if (best.isGK && this.inOwnBox(best)) best.model.setPose(POSE.HOLD);
    if (wasShot) this.shot = null;
  }

  header(p) {
    const b = this.ball;
    const d = p.team.dir;
    const gx = HALF_L * d;
    const attackBox = Math.abs(p.pos.x - gx) < 18 && Math.abs(p.pos.z) < PEN_HW;
    const defBox = Math.abs(p.pos.x + gx) < 20;
    p.kickCd = 0.5;
    this.lastTouch = p.team;
    this.sfx.kick(0.3);
    if (attackBox) {
      const tz = (rand() < 0.5 ? -1 : 1) * (GOAL_HW - 0.5 - rand());
      const err = (1 - p.data.sho / 100) * 0.25 * (p.team.ai ? this.diff.shotErr : 1);
      const ang = Math.atan2(tz - p.pos.z, gx - p.pos.x) + gauss() * err;
      const sp = 12 + p.data.sho / 20;
      b.vel.set(Math.cos(ang) * sp, -1 + rand() * 2.5, Math.sin(ang) * sp);
      this.shot = { team: p.team, player: p, type: 'header', t: this.simT, dist: hyp(gx - p.pos.x, p.pos.z), checked: false };
      this.lastKick = { type: 'header', team: p.team, player: p, t: this.simT };
      this.say(pick(['Header!', 'Rises highest!']));
    } else if (defBox) {
      b.vel.set(d * (8 + rand() * 4), 4 + rand() * 3, gauss() * 5);
      this.lastKick = { type: 'clear', team: p.team, player: p, t: this.simT };
    } else {
      b.vel.set(p.fx * 7 + gauss(), 1.5, p.fz * 7 + gauss());
      this.lastKick = { type: 'pass', team: p.team, player: p, t: this.simT };
    }
    b.spin.set(0, 0, 0);
    p.model.s.headPitch = -0.6;
  }

  checkSaves(bs) {
    const s = this.shot;
    if (!s || s.checked || bs < 6) return;
    const gk = this.opp(s.team).gk;
    const b = this.ball.pos;
    const reach = gk.diving ? 2.1 : 1.15;
    const dx = b.x - gk.pos.x;
    const dz = b.z - gk.pos.z;
    const dy = b.y - (gk.diving ? 0.9 : 1.1);
    if (hyp(dx, dz, dy * 0.8) > reach) return;
    s.checked = true;
    const skill = gk.data.def / 100;
    const base = gk.team.ai ? this.diff.gkSave : 0.62;
    const typeMod = { power: -0.08, finesse: -0.12, chip: -0.1, header: 0.05, shot: 0 }[s.type] ?? 0;
    const chance = clamp(base + (skill - 0.82) * 1.2 - (bs - 18) * 0.012 + typeMod - (gk.diving ? 0.05 : -0.1), 0.12, 0.93);
    if (rand() > chance) {
      gk.kickCd = 0.6;
      return;
    }
    this.stadium.setExcite(0.55);
    this.sfx.swell(0.5, 2.5);
    const catchable = bs < 21 && b.y > 0.2 && b.y < 2.0 && !gk.diving;
    if (catchable) {
      this.setOwner(gk);
      gk.model.setPose(POSE.HOLD);
      this.say(pick([`Comfortable for ${gk.data.back}`, `Great save by ${gk.data.back}!`, 'Gathered safely.']));
    } else {
      const v = this.ball.vel;
      v.x = -v.x * 0.3 + gk.team.dir * 3;
      v.z = v.z * 0.4 + (rand() < 0.5 ? -1 : 1) * (4 + rand() * 5);
      v.y = 2.5 + rand() * 3;
      this.ball.spin.set(0, 0, 0);
      gk.kickCd = 0.8;
      this.lastTouch = gk.team;
      this.say(pick([`What a save from ${gk.data.back}!`, 'Tipped away!', 'Fingertip save!', 'Parried!']));
    }
    this.shot = null;
  }

  // ------------------------------------------------------------------ rules

  checkRules() {
    if (this.state !== 'play') return;
    const b = this.ball.pos;
    const sx = Math.sign(b.x);
    if (Math.abs(b.x) > HALF_L + BALL_R && Math.abs(b.z) < GOAL_HW && b.y < GOAL_H) {
      this.goalScored(this.teams.find((t) => t.dir === sx));
      return;
    }
    if (Math.abs(b.z) > HALF_W + BALL_R) {
      const team = this.lastTouch ? this.opp(this.lastTouch) : this.teams[0];
      this.shotOutcomeCheck(false);
      this.startSetPiece('throw', team, clamp(b.x, -HALF_L + 1, HALF_L - 1), Math.sign(b.z) * (HALF_W - 0.2));
      return;
    }
    if (Math.abs(b.x) > HALF_L + BALL_R) {
      const defending = this.teams.find((t) => t.dir === -sx);
      const attacking = this.opp(defending);
      this.shotOutcomeCheck(true);
      if (this.lastTouch === defending) {
        this.startSetPiece('corner', attacking, sx * (HALF_L - 0.4), Math.sign(b.z || 1) * (HALF_W - 0.4));
      } else {
        this.startSetPiece('goalkick', defending, sx * (HALF_L - 5.5), 0);
      }
    }
  }

  shotOutcomeCheck(byline) {
    const s = this.shot;
    if (!s || this.simT - s.t > 3.5 || !byline) return;
    const b = this.ball.pos;
    if (Math.abs(b.z) < GOAL_HW + 2.5 && b.y < GOAL_H + 1.8) {
      this.say(b.y > GOAL_H ? pick(['Just over!', 'Over the bar!']) : pick(['Just wide!', 'Inches wide!', 'So close!']));
      this.nearMiss(1);
    } else if (Math.abs(b.z) < GOAL_HW + 7) this.say(pick(['Wide of the target.', 'Off target.']));
    this.shot = null;
  }

  goalScored(team) {
    team.score++;
    const lk = this.lastKick;
    const scorer = lk && lk.team === team ? lk.player : null;
    this.state = 'goal';
    this.stateT = 0;
    this.goalT = this.simT;
    this.goalTeam = team;
    this.owner = null;
    this.charge = null;
    this.receiver = null;
    this.hud.power(0, '');
    this.shake = 1;
    this.stadium.setExcite(1);
    this.stadium.netHit(Math.sign(this.ball.pos.x), this.ball.pos.z, this.ball.pos.y, 1);
    this.sfx.swell(1.3, 6);
    const name = scorer ? scorer.data.name : 'Own goal';
    let line = 'GOAL!';
    if (scorer) {
      const type = this.shot?.type ?? lk.type;
      const dist = this.shot?.dist ?? 0;
      line = {
        power: pick(['What a strike!', 'Thunderbolt!', 'Absolute rocket!']),
        finesse: pick(['Curled in!', 'Bent it into the corner!', 'Pure finesse!']),
        chip: pick(['Lovely chip!', 'Dinked over the keeper!', 'Audacious chip!']),
        header: pick(['Bullet header!', 'Powered in with the head!']),
      }[type] ?? (dist > 24 ? 'From distance!' : pick(['Clinical finish!', 'Tucked away!', 'Back of the net!']));
    } else line = 'Own goal! Disaster!';
    this.say(line);
    this.hud.banner('GOAL!', scorer ? `${scorer.data.name}  ${Math.floor(this.clock / 60) + 1}'` : `Own goal — ${team.name}`, 3.2);
    this.hud.setScore(this.teams[0].score, this.teams[1].score);
    this.shot = null;

    for (const p of this.players) {
      p.stun = 0;
      p.slideT = 0;
      p.pending = null;
    }
    const scorerP = scorer ?? this.nearest(team, this.ball.pos.x, this.ball.pos.z, (m) => !m.isGK);
    const def = celebrationFor(scorerP.data);
    const sx = Math.sign(this.ball.pos.x) || team.dir;
    this.celebration = {
      player: scorerP, def, phase: 'run', t: 0, popped: false,
      target: new THREE.Vector3(sx * (HALF_L - 7), 0, HALF_W - 2.5),
      name,
    };
  }

  updateCelebration(dt, input) {
    const c = this.celebration;
    const sc = c.player;
    c.t += dt;
    for (const p of this.players) {
      p.kickCd = 1;
      if (p === sc) continue;
      if (p.team === sc.team) {
        if (p.isGK) {
          p.want.set(0, 0, 0);
          if (this.stateT > 0.5) p.model.setPose(POSE.ARMS_UP);
          continue;
        }
        if (this.stateT > 1.0) {
          const a = (p.idx / 10) * Math.PI * 2;
          const r = 1.6 + (p.idx % 3) * 0.5;
          const d = this.steer(p, sc.pos.x + Math.cos(a) * r, sc.pos.z + Math.sin(a) * r, p.sprint * 0.9, 0.6);
          if (d < 2.5) p.model.setPose(p.idx % 2 ? POSE.CLAP : POSE.ARMS_UP);
        } else p.want.multiplyScalar(0.9);
      } else {
        p.want.set(0, 0, 0);
        if (this.stateT > 0.35 && p.model.s.pose === POSE.NONE) {
          p.model.setPose(p.isGK || rand() < 0.4 ? POSE.CROUCH : POSE.HANDS_HEAD);
        }
      }
    }
    if (c.phase === 'run') {
      sc.model.setPose(c.def.runPose);
      const d = this.steer(sc, c.target.x, c.target.z, sc.sprint * 0.95, 0.1);
      if (c.t > c.def.run || d < 1.5) {
        c.phase = 'pose';
        c.t = 0;
        sc.model.setPose(c.def.pose);
        if (!c.def.slide) sc.vel.multiplyScalar(0.2);
      }
    } else {
      sc.want.set(0, 0, 0);
      if (c.def.slide) {
        sc.vel.multiplyScalar(Math.exp(-dt * 1.6));
      } else sc.vel.multiplyScalar(Math.exp(-dt * 10));
      sc.facing += clamp(wrap(0 - sc.facing), -6 * dt, 6 * dt);
      if (!c.popped && c.t >= (c.def.popupAt ?? 0)) {
        c.popped = true;
        if (c.def.popup) this.say(c.def.popup);
        if (c.def.roar) {
          this.sfx.swell(1.2 * c.def.roar, 4);
          this.stadium.setExcite(1);
          this.shake = Math.max(this.shake, 0.4 * c.def.roar);
        }
      }
    }
    const slide = c.phase === 'pose' && c.def.slide;
    for (const p of this.players) {
      if (p === sc && slide) continue;
      const k = Math.min(1, dt * 6);
      p.vel.x += (p.want.x - p.vel.x) * k;
      p.vel.z += (p.want.z - p.vel.z) * k;
    }
    for (const p of this.players) {
      p.pos.addScaledVector(p.vel, dt);
      p.pos.x = clamp(p.pos.x, -HALF_L - 4, HALF_L + 4);
      p.pos.z = clamp(p.pos.z, -HALF_W - 3, HALF_W + 3);
      const sp = hyp(p.vel.x, p.vel.z);
      if (p !== sc || c.phase === 'run') {
        if (sp > 0.8) p.facing += clamp(wrap(Math.atan2(p.vel.x, p.vel.z) - p.facing), -8 * dt, 8 * dt);
      }
      p.model.s.headYaw *= 0.9;
      p.model.s.headPitch *= 0.9;
      p.model.update(dt, sp, this.time);
    }
    this.updateBall(dt);
    const skip = input.pressed.has('shot') || input.pressed.has('pass') || input.pressed.has('skip');
    if (this.stateT > 6.5 || skip && this.stateT > 1) this.startReplay();
  }

  // ------------------------------------------------------------------ replay

  record() {
    const b = this.ball;
    const arr = new Float32Array(this.players.length * REC_STRIDE);
    this.players.forEach((p, i) => {
      const o = i * REC_STRIDE;
      arr[o] = p.pos.x;
      arr[o + 1] = p.pos.y;
      arr[o + 2] = p.pos.z;
      arr[o + 3] = p.facing;
      p.model.writeState(arr, o + 4);
    });
    const q = b.mesh.quaternion;
    this.frames.push({ t: this.simT, b: [b.pos.x, b.pos.y, b.pos.z, q.x, q.y, q.z, q.w], p: arr });
    while (this.frames.length && this.frames[0].t < this.simT - 12) this.frames.shift();
  }

  startReplay() {
    const start = this.goalT - 3.0;
    if (!this.frames.length || this.frames[0].t > start + 1) {
      this.afterGoal();
      return;
    }
    this.state = 'replay';
    this.replay = { t: Math.max(start, this.frames[0].t), end: this.goalT + 1.2, age: 0 };
    this.hud.replay(true);
  }

  updateReplay(dt, input) {
    const r = this.replay;
    r.age += dt;
    const slow = r.t > this.goalT - 0.8 && r.t < this.goalT + 0.3 ? 0.25 : 0.5;
    r.t += dt * slow;
    this.applyFrame(r.t);
    const skip = input.pressed.has('shot') || input.pressed.has('pass') || input.pressed.has('skip');
    if (r.t >= r.end || skip && r.age > 0.5) {
      this.hud.replay(false);
      this.afterGoal();
    }
  }

  afterGoal() {
    this.startKickoff(this.opp(this.goalTeam).idx);
  }

  applyFrame(t) {
    const F = this.frames;
    let lo = 0;
    let hi = F.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (F[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const A = F[lo];
    const B = F[hi];
    const a = B.t > A.t ? clamp((t - A.t) / (B.t - A.t), 0, 1) : 0;
    this.players.forEach((p, i) => {
      const o = i * REC_STRIDE;
      p.pos.set(lerp(A.p[o], B.p[o], a), 0, lerp(A.p[o + 2], B.p[o + 2], a));
      p.facing = A.p[o + 3] + wrap(B.p[o + 3] - A.p[o + 3]) * a;
      p.model.readState(A.p, o + 4);
      p.model.applyPose(this.time);
    });
    const bb = this.ball;
    bb.pos.set(lerp(A.b[0], B.b[0], a), lerp(A.b[1], B.b[1], a), lerp(A.b[2], B.b[2], a));
    const qa = new THREE.Quaternion(A.b[3], A.b[4], A.b[5], A.b[6]);
    const qb = new THREE.Quaternion(B.b[3], B.b[4], B.b[5], B.b[6]);
    bb.mesh.quaternion.slerpQuaternions(qa, qb, a);
  }

  // ------------------------------------------------------------------ render sync

  syncVisuals(dt) {
    for (const p of this.players) {
      p.model.root.position.copy(p.pos);
      p.model.root.rotation.y = p.facing;
    }
    if (this.state === 'replay') this.ball.mesh.position.copy(this.ball.pos);
    else this.ball.updateVisual(dt);
  }

  humanHasBall() {
    return this.owner && this.owner === this.controlled;
  }
}
