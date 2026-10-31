import * as THREE from 'three';
import { HALF_L, HALF_W, GOAL_HW, GOAL_H, BALL_R, PEN_DEPTH, PEN_HW, DIFFICULTY, resolveDifficulty } from './constants.js';
import { PlayerModel, kitMaterials, POSE, KICK, kickContactDelay, MODEL_STATE_SIZE } from './playerModel.js';
import { MAGNUS, SPIN_DECAY } from './ball.js';
import { celebrationFor, shortCelebrationFor } from './celebrations.js';
import { teamRating, shotTraits, makeBench } from './teams.js';
import { rumble, P1_COLOR, P2_COLOR } from './input.js';
import { newStats, matchRatings } from './ratings.js';
import { applyFormToData, playerForm, recordMatchForm } from './form.js';
import { withTraining } from './trainer.js';

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
const SHOT_TYPES = new Set(['shot', 'power', 'finesse', 'chip', 'header', 'bicycle']);
const PASS_TYPES = new Set(['pass', 'through', 'cross']);
const CHARGE_RATE = { shot: 1.2, power: 0.75, finesse: 1.2, chip: 1.3, bicycle: 1.05, pass: 1.5, through: 1.4, cross: 1.3, clear: 1.5 };
export const KICK_ACTIONS = Object.keys(CHARGE_RATE);
const KICK_LABEL = {
  shot: 'SHOT', power: 'POWER SHOT', finesse: 'FINESSE', chip: 'CHIP', bicycle: 'BICYCLE KICK',
  pass: 'PASS', through: 'THROUGH BALL', cross: 'CROSS', clear: 'CLEARANCE',
};
const PEN_SPOT = HALF_L - 11;
const THROW_MAX = 23;
const SUB_EVERY = 7;
const OUT_KINDS = new Set(['throw', 'corner', 'goalkick']);

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
  const spd = Math.max(4, Number.isFinite(speedH) ? speedH : 12);
  const T = D / spd;
  const km = grounded ? MAGNUS * 0.25 : MAGNUS;
  const decay = grounded ? 2.5 : SPIN_DECAY;
  const spinN = Number.isFinite(spin) ? spin : 0;
  const dev = 0.5 * km * spinN * D * D / spd * Math.max(0.25, 1 - (decay * T) / 3);
  const a = Math.atan2(dz, dx) + clamp(dev / D, -0.6, 0.6);
  return { vx: Math.cos(a) * spd, vz: Math.sin(a) * spd, D, T };
}

class Player {
  constructor(game, team, idx, rawData) {
    const data = withTraining(rawData);
    this.game = game;
    this.team = team;
    this.idx = idx;
    this.form = playerForm(data, team.club?.id);
    this.data = applyFormToData(data, this.form);
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
    const mul = team.ai ? game.diff.speed : 1 + game.diff.assist * 0.03;
    this.sprint = (6.3 + this.data.pac * 0.024) * mul;
    this.jog = this.sprint * 0.7;
    this.stamina = 1;
    this.stamLock = false;
    this.cards = 0;
    this.sentOff = false;
    this.st = game.trackStats(this);
    this.drib = (this.data.pac + this.data.pas + this.data.ovr) / 3;
    if (team.ai) this.drib *= lerp(0.82, 1.12, game.diff.dribble);
    else this.drib *= 1 + game.diff.assist * 0.12;
  }

  get fx() {
    return Math.sin(this.facing);
  }

  get fz() {
    return Math.cos(this.facing);
  }

  dispose() {
    this.game.scene.remove(this.model.root);
    this.model.dispose();
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
    this.humans = [];
    this.matchMode = '1p';
    this.pens = null;
    this.allowDraw = false;
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

  setupMatch({ userClub, aiClub, kits, difficulty, minutes, matchMode = '1p', pads = [], allowDraw = false }) {
    for (const p of this.players) p.dispose();
    this.difficulty = resolveDifficulty(difficulty);
    this.diff = DIFFICULTY[this.difficulty];
    this.matchMode = matchMode;
    const versus = matchMode === 'versus';
    const coop = matchMode === 'coop';
    const mk = (idx, club, kit, dir, ai) => {
      const rating = teamRating(club);
      const base = clamp((rating - 72) / 18, 0, 1);
      const bonus = ai ? this.diff.qBonus : 0;
      return {
        idx, club, kit, dir, ai, human: !ai, score: 0, rating,
        q: clamp(base * 0.78 + 0.18 + bonus, 0, 1),
        name: club.name, short: club.short, players: [],
        mats: { outfield: kitMaterials(this.renderer, kit, club.gk, false), gk: kitMaterials(this.renderer, kit, club.gk, true) },
      };
    };
    this.teams = [mk(0, userClub, kits.user, 1, false), mk(1, aiClub, kits.ai, -1, !versus)];
    this.players = [];
    this.stats = new Map();
    this.matchMinutes = minutes;
    this.clock = 0;
    this.lastPass = null;
    this.prevKick = null;
    for (const t of this.teams) {
      t.players = t.club.players.map((d, i) => new Player(this, t, i, d));
      t.bench = makeBench(t.club);
      t.subsLeft = 5;
      t.yellows = 0;
      t.reds = 0;
      this.players.push(...t.players);
      t.gk = t.players[0];
    }
    this.clockRate = 5400 / (minutes * 60);
    this.half = 1;
    this.owner = null;
    this.lastTouch = null;
    this.receiver = null;
    this.shot = null;
    this.lastKick = null;
    const mkHuman = (id, teamIdx, color, startIdx) => ({
      id, teamIdx, color, padIndex: pads[id] ?? null, charge: null, switchCd: 0, nextSwitch: null,
      controlled: this.teams[teamIdx].players[startIdx],
    });
    this.humans = versus
      ? [mkHuman(0, 0, P1_COLOR, 9), mkHuman(1, 1, P2_COLOR, 9)]
      : coop
        ? [mkHuman(0, 0, P1_COLOR, 9), mkHuman(1, 0, P2_COLOR, 8)]
        : [mkHuman(0, 0, P1_COLOR, 9)];
    this.controlled = this.humans[0].controlled;
    this.switchCd = 0;
    this.frames = [];
    this.pens = null;
    this.penStress = null;
    this.allowDraw = !!allowDraw;
    this.outs = 0;
    this.outsSinceWindow = 0;
    this.subWindow = false;
    this.startKickoff(0, true);
  }

  isHumanControlled(p) {
    return this.humans.some((h) => h.controlled === p);
  }

  // Keyed by team + squad identity so subbed-off and sent-off players keep their line.
  trackStats(p) {
    if (!this.stats) this.stats = new Map();
    const key = `${p.team.idx}|${p.data.num}|${p.data.name}`;
    let s = this.stats.get(key);
    if (!s) {
      s = newStats(p, this.clock ?? 0);
      this.stats.set(key, s);
    }
    return s;
  }

  assistFor(p, t) {
    const lp = this.lastPass;
    if (lp && lp.to === p && t - lp.t < 10) return lp.from;
    const pk = this.prevKick;
    if (pk && PASS_TYPES.has(pk.type) && pk.team === p.team && pk.player !== p && t - pk.t < 3.5) return pk.player;
    return null;
  }

  noteShot(p) {
    if (this.state === 'pens') return;
    p.st.shots++;
    const from = this.assistFor(p, this.simT);
    if (from) from.st.keyPasses++;
  }

  matchRatings() {
    return matchRatings(this);
  }

  humanFor(p) {
    return this.humans.find((h) => h.controlled === p) ?? null;
  }

  humansOn(team) {
    return this.humans.filter((h) => h.teamIdx === team.idx);
  }

  padFor(p) {
    return this.humanFor(p)?.padIndex ?? this.humans.find((h) => h.teamIdx === p.team.idx)?.padIndex ?? null;
  }

  anyPressed(input, ...names) {
    const slots = input.slots ?? [input];
    return slots.some((s) => names.some((n) => s.pressed?.has(n)));
  }

  syncPads(slots) {
    if (!this.humans || !slots) return;
    for (const h of this.humans) h.padIndex = slots[h.id]?.padIndex ?? h.padIndex;
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
    this.clearCharges();
    this.celebration = null;
    this.crossSit = null;
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
        p.stamina = 1;
        p.stamLock = false;
      }
    }
    const kt = this.teams[teamIdx];
    const st = kt.players[9];
    st.pos.set(-0.45 * kt.dir, 0, 0);
    kt.players[5].pos.set(-4 * kt.dir, 0, 5 * kt.dir);
    this.setOwner(st, true);
    if (kt.human) this.takeHuman(st);
    this.hud.banner(first ? 'KICK OFF' : '', first ? `${this.teams[0].name} vs ${this.teams[1].name}` : '', 1.6);
    this.hud.outs?.(this.outsUntilSub(), this.subAllowed());
  }

  startSetPiece(kind, team, x, z) {
    this.noteOut(kind);
    this.state = 'setpiece';
    this.stateT = 0;
    this.setPieceKind = kind;
    this.setPieceTeam = team;
    this.charge = null;
    this.clearCharges();
    this.receiver = null;
    this.shot = null;
    for (const p of this.players) {
      p.stun = p.slideT = 0;
      p.pending = null;
    }
    if (kind === 'penalty') {
      const def = this.opp(team);
      x = (-HALF_L + 11) * def.dir;
      z = 0;
    }
    this.ball.place(x, z);
    let taker;
    const d = team.dir;
    if (kind === 'goalkick') taker = team.gk;
    else if (kind === 'penalty') {
      taker = team.players.filter((p) => !p.isGK).sort((a, b) => b.data.sho - a.data.sho)[0] ?? team.players[1];
    } else {
      taker = this.nearest(team, x, z, (p) => !p.isGK) ?? team.players.find((p) => !p.isGK);
    }
    if (!taker) return;
    const into = new THREE.Vector3(-x, 0, -z);
    if (into.lengthSq() < 1e-6) into.set(-d || -1, 0, 0);
    else into.normalize();
    if (kind === 'throw') into.set(0, 0, -Math.sign(z) || 1);
    if (kind === 'goalkick') into.set(d, 0, 0);
    if (kind === 'throw') {
      const side = Math.sign(z) || 1;
      taker.pos.set(x, 0, side * HALF_W);
      taker.facing = Math.atan2(into.x, into.z);
      taker.vel.set(0, 0, 0);
      taker.model.setPose(POSE.THROW);
      const inZ = -side;
      let i = 0;
      for (const p of team.players) {
        if (p === taker || p.isGK) continue;
        const along = ((i % 5) - 2) * 4.2;
        const depth = 8 + (i % 3) * 4.5;
        p.pos.set(clamp(x + along + gauss() * 0.6, -HALF_L + 4, HALF_L - 4), 0, clamp(side * HALF_W + inZ * depth, -HALF_W + 1, HALF_W - 1));
        p.facing = taker.facing;
        p.vel.set(0, 0, 0);
        i++;
      }
      for (const p of this.opp(team).players) {
        if (p.isGK) continue;
        const dx = p.pos.x - taker.pos.x;
        const dz = p.pos.z - taker.pos.z;
        const dist = hyp(dx, dz);
        if (dist < 2.15) {
          p.pos.x = taker.pos.x + (dx / (dist || 1)) * 2.2;
          p.pos.z = taker.pos.z + (dz / (dist || 1)) * 2.2;
        }
      }
    } else if (kind === 'penalty') {
      taker.pos.set(x - team.dir * 0.55, 0, 0);
      taker.facing = Math.atan2(team.dir, 0);
      taker.vel.set(0, 0, 0);
    } else {
      taker.pos.set(x - into.x * 0.6, 0, z - into.z * 0.6);
      taker.facing = Math.atan2(into.x, into.z);
      taker.vel.set(0, 0, 0);
    }
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
    if (kind === 'freekick') this.placeFreeKickWall(team, x, z);
    if (kind === 'penalty') this.placePenalty(team, taker, x);
    this.setOwner(taker, true);
    if (team.human && !taker.isGK) this.takeHuman(taker);
    this.penStress = null;
    if (kind === 'penalty') this.beginPenStress(taker, this.opp(team).gk);
    const msg = {
      throw: 'Throw-in', corner: 'Corner kick', goalkick: 'Goal kick',
      freekick: 'Free kick', penalty: 'Penalty',
    }[kind];
    this.say(`${msg} — ${team.name}`);
  }

  placeFreeKickWall(team, x, z) {
    const def = this.opp(team);
    const gx = HALF_L * team.dir;
    const dx = gx - x;
    const dz = -z;
    const D = hyp(dx, dz) || 1;
    const nx = dx / D;
    const nz = dz / D;
    let wi = 0;
    for (const p of def.players) {
      if (p.isGK) {
        p.pos.set(-HALF_L * def.dir + def.dir * 1.4, 0, clamp(z * 0.15, -3, 3));
        p.facing = Math.atan2(x - p.pos.x, z - p.pos.z);
        continue;
      }
      if (wi < 4) {
        const side = (wi - 1.5) * 0.9;
        p.pos.set(x + nx * 9.15 - nz * side, 0, z + nz * 9.15 + nx * side);
        p.facing = Math.atan2(-nx, -nz);
        p.vel.set(0, 0, 0);
        wi++;
      }
    }
  }

  placePenalty(team, taker, spotX) {
    const def = this.opp(team);
    const gx = HALF_L * team.dir;
    def.gk.pos.set(gx - team.dir * 0.45, 0, 0);
    def.gk.facing = Math.atan2(-team.dir, 0);
    def.gk.vel.set(0, 0, 0);
    let i = 0;
    for (const p of this.players) {
      if (p === taker || p === def.gk) continue;
      const side = i % 2 === 0 ? 1 : -1;
      const row = (i / 2) | 0;
      p.pos.set(spotX - team.dir * (17.2 + row * 1.4), 0, side * (6 + (row % 4) * 3.2));
      p.facing = Math.atan2(team.dir, 0);
      p.vel.set(0, 0, 0);
      i++;
    }
  }

  // ------------------------------------------------------------------ possession

  setOwner(p, silent = false) {
    this.owner = p;
    this.ball.vel.set(0, 0, 0);
    this.ball.spin.set(0, 0, 0);
    p.holdT = 0;
    const think = lerp(0.55, 0.22, p.team.q) + rand() * 0.22;
    p.decisionT = p.team.ai ? think * this.diff.decision + this.diff.reaction * 0.18 : think;
    if (this.receiver && this.receiver.team !== p.team && !silent && this.lastKick?.team !== p.team) {
      if (this.lastKick && ['pass', 'through', 'cross'].includes(this.lastKick.type) && rand() < 0.35) {
        this.say(pick(['Intercepted!', 'Read that well', 'Cut out!']));
      }
    }
    const lk = this.lastKick;
    if (!silent && lk && !lk.counted && lk.player !== p && PASS_TYPES.has(lk.type) && this.simT - lk.t < 4) {
      lk.counted = true;
      if (lk.team === p.team) {
        lk.player.st.passesDone++;
        this.lastPass = { from: lk.player, to: p, t: this.simT };
      } else p.st.interceptions++;
    }
    if (this.lastPass && this.lastPass.from.team !== p.team) this.lastPass = null;
    this.receiver = null;
    this.lastTouch = p.team;
    if (p.team.human && !p.isGK) this.takeHuman(p);
  }

  clearCharges() {
    if (this.humans) for (const h of this.humans) h.charge = null;
  }

  takeHuman(p) {
    const hs = this.humansOn(p.team);
    if (!hs.length || p.isGK) return;
    if (hs.some((h) => h.controlled === p)) return;
    const h = hs.slice().sort((a, b) => hyp(a.controlled.pos.x - p.pos.x, a.controlled.pos.z - p.pos.z)
      - hyp(b.controlled.pos.x - p.pos.x, b.controlled.pos.z - p.pos.z))[0];
    this.setControlled(p, h);
  }

  setControlled(p, human) {
    if (!p) return;
    const h = human ?? this.humans.find((x) => x.teamIdx === p.team.idx) ?? this.humans[0];
    if (!h) return;
    if (this.matchMode === 'coop') {
      const other = this.humans.find((x) => x !== h);
      if (other?.controlled === p) return;
    }
    if (h.controlled === p) return;
    h.controlled = p;
    h.switchCd = 0.8;
    this.controlled = this.humans[0]?.controlled ?? p;
  }

  isKeeperOneOnOne(team) {
    const opp = this.opp(team);
    const goalX = -HALF_L * team.dir;
    let carrier = this.owner && this.owner.team === opp ? this.owner : null;
    if (!carrier && this.receiver && this.receiver.team === opp) carrier = this.receiver;
    if (!carrier) {
      const b = this.ball;
      const toward = b.vel.x * team.dir < -2.5 || Math.abs(b.pos.x - goalX) < 22;
      if (!toward) return false;
      carrier = this.nearest(opp, b.pos.x, b.pos.z, (m) => !m.isGK);
    }
    if (!carrier) return false;
    const vicD = Math.abs(carrier.pos.x - goalX);
    if (vicD > 30) return false;
    let closer = 0;
    for (const m of team.players) {
      if (m.isGK || m.sentOff) continue;
      if (Math.abs(m.pos.x - goalX) < vicD + 1.4) closer++;
    }
    return closer <= 1;
  }

  switchable(m, h, current) {
    if (!m || m === current || m.stun > 0 || m.sentOff) return false;
    if (this.humans.some((o) => o !== h && o.controlled === m)) return false;
    if (m.isGK && !this.isKeeperOneOnOne(m.team)) return false;
    return true;
  }

  bestSwitch(h) {
    const p = h.controlled;
    const team = this.teams[h.teamIdx];
    if (!p || !team) return null;
    const b = this.ball;
    const leadX = b.pos.x + b.vel.x * 0.38;
    const leadZ = b.pos.z + b.vel.z * 0.38;
    const one = this.isKeeperOneOnOne(team);
    const goalX = -HALF_L * team.dir;
    const defending = !this.owner || this.owner.team !== team;
    let best = null;
    let bs = -Infinity;
    for (const m of team.players) {
      if (!this.switchable(m, h, p)) continue;
      const d = hyp(m.pos.x - leadX, m.pos.z - leadZ);
      let s = 36 - d;
      if (this.receiver === m) s += 9;
      if (m.isGK && one) {
        const inBox = this.inDefBox(team, b.pos.x, b.pos.z) || this.inDefBox(team, leadX, leadZ);
        s += inBox ? 22 : 10;
      }
      if (defending && Math.abs(m.pos.x - goalX) < Math.abs((this.owner?.pos.x ?? b.pos.x) - goalX) + 2) s += 4;
      if (s > bs) {
        bs = s;
        best = m;
      }
    }
    return best;
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

  isThrowIn() {
    return this.state === 'setpiece' && this.setPieceKind === 'throw';
  }

  performThrow(p, type, power, opts = {}) {
    if (p.pending) return;
    const plan = this.planThrow(p, type, power, opts);
    if (!plan) return;
    p.model.setPose(POSE.NONE);
    p.model.kick(KICK.THROW);
    p.pending = { t: opts.instant ? 0.04 : kickContactDelay(KICK.THROW), plan };
    p.facing = Math.atan2(plan.vx, plan.vz);
  }

  planThrow(p, type, power, opts) {
    const dx = opts.dirX ?? p.fx;
    const dz = opts.dirZ ?? p.fz;
    const l = hyp(dx, dz) || 1;
    const pas = p.data.pas / 100;
    const loft = type === 'through';
    let dist = lerp(8, THROW_MAX, clamp(power, 0.12, 1)) * (0.9 + 0.1 * pas);
    if (loft) dist *= 0.92;
    dist = Math.min(dist, 25);
    const err = (1 - pas) * 0.1 * (p.team.ai ? this.diff.passErr : Math.max(0.35, 1 - this.diff.assist * 0.4));
    const ang = Math.atan2(dx / l, dz / l) + gauss() * err;
    const dirX = Math.sin(ang);
    const dirZ = Math.cos(ang);
    const T = loft ? 1.55 : 1.22;
    const speedH = dist / T;
    const vy = loft ? 6.8 + power * 2.8 : 4.8 + power * 2.4;
    let receiver = opts.target ?? null;
    if (!receiver) {
      let best = null;
      let bd = Infinity;
      for (const m of p.team.players) {
        if (m === p || m.isGK) continue;
        const D = hyp(m.pos.x - p.pos.x, m.pos.z - p.pos.z);
        if (D < 5 || D > 24) continue;
        const along = ((m.pos.x - p.pos.x) * dirX + (m.pos.z - p.pos.z) * dirZ) / (D || 1);
        const score = D + (1 - along) * 8;
        if (score < bd) {
          bd = score;
          best = m;
        }
      }
      receiver = best;
    }
    return {
      type: loft ? 'through' : 'pass', vx: dirX * speedH, vz: dirZ * speedH, vy, spin: 0,
      throw: true, dist, receiver, T, spot: receiver ? { x: receiver.pos.x, z: receiver.pos.z } : null,
    };
  }

  performKick(p, type, power, opts = {}) {
    if (p.pending) return;
    const plan = this.planKick(p, type, power, opts);
    if (!plan) return;
    const kind = {
      pass: KICK.PASS, through: KICK.CHIP, cross: KICK.SHOT, shot: KICK.SHOT, finesse: KICK.SHOT,
      power: KICK.POWER, chip: KICK.CHIP, clear: KICK.CLEAR, bicycle: KICK.BICYCLE,
    }[type];
    p.model.kick(kind);
    p.pending = { t: opts.instant ? 0.02 : kickContactDelay(kind), plan };
    p.facing = Math.atan2(plan.vx, plan.vz);
    if (type === 'bicycle') p.facing += Math.PI;
  }

  releaseKick(p) {
    const { plan } = p.pending;
    p.pending = null;
    if (this.owner !== p && !plan.aerial) return;
    this.owner = null;
    const b = this.ball;
    if (plan.throw) {
      b.pos.set(p.pos.x + p.fx * 0.45, 1.72, p.pos.z + p.fz * 0.45);
      b.vel.set(plan.vx, plan.vy, plan.vz);
      b.spin.set(0, 0, 0);
    } else {
      const y = plan.strikeY ?? (BALL_R + 0.02);
      const along = plan.type === 'bicycle' ? -0.22 : 0.35;
      b.pos.set(p.pos.x + p.fx * along, y, p.pos.z + p.fz * along);
      b.vel.set(plan.vx, plan.vy, plan.vz);
      b.spin.set(0, plan.spin, 0);
    }
    p.kickCd = 0.3;
    this.lastTouch = p.team;
    this.prevKick = this.lastKick;
    this.lastKick = { type: plan.type, team: p.team, player: p, t: this.simT, dist: plan.dist ?? 0 };
    if (PASS_TYPES.has(plan.type) && this.state !== 'pens') p.st.passes++;
    this.sfx.kick(clamp(hyp(plan.vx, plan.vz) / (plan.throw ? 22 : 34), 0.15, 0.85));
    rumble(plan.throw ? 0.16 : (SHOT_TYPES.has(plan.type) ? 0.42 : 0.2), plan.throw ? 70 : (SHOT_TYPES.has(plan.type) ? 95 : 55), plan.throw ? 0.12 : (SHOT_TYPES.has(plan.type) ? 0.5 : 0.18), this.padFor(p));
    if (SHOT_TYPES.has(plan.type) && !plan.throw) {
      const pen = this.state === 'setpiece' && this.setPieceKind === 'penalty';
      this.shot = { team: p.team, player: p, type: plan.type, t: this.simT, dist: plan.dist, checked: false, pen };
      this.noteShot(p);
      this.stadium.setExcite(0.35);
      if (plan.dist > 25 && rand() < 0.5) this.say(pick(['He tries his luck from range!', 'Long-range effort!']));
    }
    if (plan.receiver) {
      this.receiver = plan.receiver;
      this.receiver.receiveT = plan.T + 1.5;
      this.receiveSpot = plan.spot;
      if (plan.receiver.team.human) this.takeHuman(plan.receiver);
    } else this.receiver = null;
    if (plan.throw && rand() < 0.4) this.say(plan.type === 'through' ? 'Lofted throw!' : 'Thrown in.');
    if (plan.type === 'clear') this.say(pick(['Hoofed clear!', 'Big clearance!', 'Launched upfield!']));
    if (plan.type === 'cross' && rand() < 0.5) this.say(pick(['Whipped in!', 'Ball into the box!']));
    if (plan.type === 'through' && !plan.throw && rand() < 0.4) this.say(pick(['Lovely ball over the top!', 'Threaded through!']));
    if (plan.type === 'bicycle') this.say(pick(['Bicycle kick!', 'Overhead volley!', 'Acrobatic strike!']));
    if (this.state === 'setpiece' || this.state === 'kickoff') {
      this.subWindow = false;
      this.state = 'play';
    }
  }

  planKick(p, type, power, opts) {
    const d = p.team.dir;
    const gx = HALF_L * d;
    const sho = p.data.sho / 100;
    const pas = p.data.pas / 100;
    const traits = shotTraits(p.data);
    const lon = traits.lon / 100;
    const fin = traits.fin / 100;
    const cfg = this.diff;
    const ai = p.team.ai;
    const assist = ai ? 0 : cfg.assist;
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
        const skill = distG > 20 ? lon : sho;
        const weak = Math.max(0, 1 - skill);
        speedH = (17 + 13 * power) * (0.85 + 0.3 * skill);
        height = 0.3 + power * 1.5 + (power > 0.9 ? (power - 0.9) * 14 : 0) + (distG > 20 ? Math.max(0, 1 - lon) * 1.1 * power : 0);
        errA = (0.018 + weak ** 1.35 * 0.16) * (0.6 + power);
        errH = (0.15 + weak ** 1.3 * 1.4) * power;
        spin = lateral * 0.35;
      } else if (type === 'power') {
        const weakL = Math.max(0, 1 - lon);
        speedH = (25 + 12 * power) * (0.82 + 0.28 * lon);
        height = 0.25 + power * 1.1 + (power > 0.92 ? (power - 0.92) * 16 : 0) + weakL * 1.6 * power;
        errA = (0.035 + weakL ** 1.35 * 0.40) * (0.5 + power);
        errH = (0.25 + weakL ** 1.3 * 2.6) * power;
        spin = lateral * 0.15;
      } else if (type === 'finesse') {
        if (opts.aimZ === undefined) tz = -Math.sign(from.z || (rand() - 0.5)) * (GOAL_HW - 0.35 - fin * 0.25);
        const weakF = Math.max(0, 1 - fin);
        speedH = (15 + 8 * power) * (0.88 + 0.2 * fin);
        height = 0.75 + power * 0.85 + weakF * 0.7;
        errA = 0.014 + weakF ** 1.4 * 0.24;
        errH = 0.12 + weakF ** 1.3 * 1.15;
        const dx = gx - from.x;
        const dz = tz - from.z;
        const L = hyp(dx, dz) || 1;
        const leftX = dz / L;
        const leftZ = -dx / L;
        const bend = Math.sign((gx - gx) * leftX + (0 - tz) * leftZ) || 1;
        spin = bend * (0.35 + 0.95 * fin) * (0.8 + 0.4 * power) + lateral * 0.3;
      } else if (type === 'bicycle') {
        const tech = sho * 0.5 + lon * 0.3 + fin * 0.2;
        const weak = Math.max(0, 1 - tech);
        speedH = (19 + 12 * power) * (0.82 + 0.24 * tech);
        height = 1.05 + power * 0.7 + weak * 0.55;
        errA = (0.05 + weak ** 1.3 * 0.36) * (0.55 + power);
        errH = (0.32 + weak ** 1.25 * 2.1) * (0.45 + power);
        spin = lateral * 0.1;
      } else {
        const tech = sho * 0.5 + fin * 0.5;
        const weakC = Math.max(0, 1 - tech);
        const T = 0.95 + distG / 30;
        speedH = Math.max(6, (distG / T) * (0.95 + 0.1 * power));
        height = 1.9 - (1 - power) * 0.9;
        errA = 0.02 + weakC ** 1.3 * 0.14;
        errH = 0.15 + weakC ** 1.3 * 1.1;
      }
      if (ai) {
        speedH *= cfg.shotPower;
        errA *= cfg.shotErr;
        errH *= cfg.shotErr;
      } else {
        errA *= 1 - assist * 0.5;
        errH *= 1 - assist * 0.45;
        if (assist > 0) tz = clamp(tz, -(GOAL_HW - 0.35), GOAL_HW - 0.35);
      }
      const ps = this.penStress;
      if (ps && !ps.done && p === ps.kicker && this.state === 'setpiece') {
        const wob = this.penWobble();
        const { over, under } = this.penMiskick(power);
        const k = 1 + ps.stress * 0.9;
        tz += wob.z * GOAL_HW;
        height = Math.max(0.15, height + wob.y * GOAL_H * 0.5 + over * 9 - under * 1.2);
        speedH *= 1 - Math.min(0.6, under * 1.4);
        errA *= k;
        errH *= k;
        ps.done = true;
        ps.aim = null;
      }
      if (this.nearestOpponentDist(p) < 2) errA += 0.03;
      const spd = Math.max(4, Number.isFinite(speedH) ? speedH : 12);
      const aim = launch(from, gx, tz, spd, Number.isFinite(spin) ? spin : 0, false);
      const ang = Math.atan2(aim.vz, aim.vx) + gauss() * (Number.isFinite(errA) ? errA : 0.08);
      const T = aim.T;
      const h = (Number.isFinite(height) ? height : 1) + gauss() * (Number.isFinite(errH) ? errH : 0.3);
      const vy = (h - BALL_R + 4.9 * T * T) / T;
      const shot = {
        type, vx: Math.cos(ang) * spd, vy, vz: Math.sin(ang) * spd, spin, dist: distG, T,
        aerial: type === 'bicycle',
        strikeY: type === 'bicycle' ? clamp(this.ball.pos.y, 0.55, 1.7) : undefined,
      };
      if (![shot.vx, shot.vy, shot.vz].every(Number.isFinite)) {
        return {
          type, vx: p.fx * 14, vy: 2.2, vz: p.fz * 14, spin: 0, dist: distG, T: 1,
          aerial: type === 'bicycle', strikeY: type === 'bicycle' ? 1.1 : undefined,
        };
      }
      return shot;
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
    const errA = ((1 - pas) * 0.09 + D * 0.0008) * (p.team.ai
      ? this.diff.passErr * lerp(1.25, 0.65, p.team.q)
      : 1 - this.diff.assist * 0.4);

    if (type === 'pass') {
      const vArr = 4.5 + D * 0.12 + power * 5;
      const speedH = clamp(Math.sqrt(2 * 1.9 * D + vArr * vArr), 7, 29);
      const spin = lateral * 0.6;
      const aim = launch(from, spot.x, spot.z, speedH, spin, true);
      const ang = Math.atan2(aim.vz, aim.vx) + gauss() * (Number.isFinite(errA) ? errA : 0.06);
      const pass = { type, vx: Math.cos(ang) * speedH, vy: 0.4, vz: Math.sin(ang) * speedH, spin, receiver: recv, spot, T: D / speedH };
      if (![pass.vx, pass.vz].every(Number.isFinite)) {
        return { type, vx: dirX * 12, vy: 0.4, vz: dirZ * 12, spin: 0, receiver: recv, spot, T: 1 };
      }
      return pass;
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
    const ang = Math.atan2(aim.vz, aim.vx) + gauss() * (Number.isFinite(errA) ? errA : 0.06);
    const vy = 4.9 * T + (type === 'cross' ? 0.6 : 0);
    const loft = { type, vx: Math.cos(ang) * speedH, vy, vz: Math.sin(ang) * speedH, spin, receiver: recv, spot, T };
    if (![loft.vx, loft.vy, loft.vz].every(Number.isFinite)) {
      return { type, vx: dirX * 14, vy: 5, vz: dirZ * 14, spin: 0, receiver: recv, spot, T: 1 };
    }
    return loft;
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
    if (p.tackleCd > 0 || p.stun > 0 || this.owner === p || p.sentOff) return;
    p.tackleCd = 0.7;
    p.model.kick(KICK.PASS);
    const o = this.owner;
    if (!o || o.team === p.team || o.isGK && o.holdT > 0 && this.inOwnBox(o)) return;
    const d = hyp(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
    if (d > 2.0) return;
    const behind = this.fromBehind(p, o);
    const aiMul = p.team.ai ? this.diff.steal * this.diff.press * this.diff.tackleTiming : 1;
    const vsHuman = o.team.human ? this.diff.assist : 0;
    const chance = clamp(0.38 + (p.data.def - o.drib) / 100 * 0.9 + (aiMul - 1) * 0.22 - (d - 1) * 0.15 - vsHuman * 0.28, 0.08, 0.92);
    if (rand() < chance) {
      if (behind && this.shouldWhistle(p, o, { slide: false, wonBall: true })) {
        this.callFoul(p, o, { slide: false });
        return;
      }
      o.stun = 0.6;
      o.model.stumble();
      o.kickCd = 0.6;
      p.st.tackles++;
      if (rand() < 0.6) this.setOwner(p);
      else {
        this.owner = null;
        this.ball.vel.set((o.pos.x - p.pos.x) * 3 + gauss() * 2, 0.5, (o.pos.z - p.pos.z) * 3 + gauss() * 2);
        this.lastTouch = p.team;
      }
      rumble(0.48, 100, 0.55, this.padFor(p));
      if (rand() < 0.5) this.say(pick([`Great tackle by ${p.data.back}!`, 'Won it back!', 'Timed to perfection!']));
    } else if (behind && this.shouldWhistle(p, o, { slide: false, wonBall: false })) {
      this.callFoul(p, o, { slide: false });
    } else {
      rumble(0.18, 45, 0.12, this.padFor(p));
      p.stun = 0.45;
      p.model.stumble();
    }
  }

  humanDive(p, dirX, dirZ) {
    if (!p.isGK || p.diveCd > 0 || p.diving || p.stun > 0) return;
    const l = hyp(dirX, dirZ) || 1;
    const side = dirX * p.fz - dirZ * p.fx;
    p.diving = { t: 0, vz: clamp((dirZ / l) * 6.2, -7, 7) };
    p.diveCd = 1.7;
    p.model.dive(Math.sign(side) || 1);
    rumble(0.4, 90, 0.35, this.padFor(p));
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
    const o = this.owner;
    const b = this.ball.pos;
    if (hyp(b.x - fx, b.z - fz) > 1.3 || b.y > 0.6) return;
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
    const aiMul = p.team.ai ? this.diff.steal * this.diff.press * this.diff.tackleTiming : 1;
    const vsHuman = o.team.human ? this.diff.assist : 0;
    const chance = clamp(0.52 + (p.data.def - o.drib) / 100 + (aiMul - 1) * 0.22 - vsHuman * 0.22, 0.14, 0.94);
    if (rand() < chance) {
      if (this.fromBehind(p, o) && this.shouldWhistle(p, o, { slide: true, wonBall: true })) {
        this.callFoul(p, o, { slide: true });
        p.slideT = 0;
        return;
      }
      knock();
      p.st.tackles++;
      o.stun = 1.4;
      o.model.fall();
      o.kickCd = 1;
      rumble(0.58, 130, 0.7, this.padFor(p));
      this.say(pick(['Crunching slide tackle!', `What a challenge from ${p.data.back}!`, 'Sliding in — and wins it!']));
      this.stadium.setExcite(0.3);
    } else if (this.fromBehind(p, o) && this.shouldWhistle(p, o, { slide: true, wonBall: false })) {
      this.callFoul(p, o, { slide: true });
      p.slideT = 0;
    } else {
      rumble(0.2, 50, 0.14, this.padFor(p));
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
    if (this.penStress && this.state !== 'pens' && !(this.state === 'setpiece' && this.setPieceKind === 'penalty')) {
      this.penStress = null;
    }

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
        if (this.penStress) {
          this.tickPenStress(dt, 2);
          this.penAimInMatch(input);
        }
        this.updateAll(dt, input, true);
        if (this.owner && this.owner.team.ai || this.owner?.isGK) {
          if (this.stateT > (this.subWindow ? 4.5 : 1.3) && !this.owner.pending) this.aiSetPiece(this.owner);
        } else if (this.stateT > 8 && this.owner && !this.owner.pending) {
          if (this.setPieceKind === 'throw') this.performThrow(this.owner, 'pass', 0.45, {});
          else this.performKick(this.owner, 'pass', 0.4, {});
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
        if (this.continueHalf || this.stateT > 16) this.startKickoff(1);
        break;
      case 'fulltime':
        this.updateAll(dt, input, true, true);
        break;
      case 'pens':
        this.updatePens(dt, input);
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
    this.continueHalf = false;
    this.owner = null;
    this.charge = null;
    this.clearCharges();
    this.aiMakeSubs();
    this.sfx.whistle(true);
    this.hud.banner('HALF TIME', `${this.teams[0].short} ${this.teams[0].score} - ${this.teams[1].score} ${this.teams[1].short}`, 2.4);
    this.hud.outs?.(0, true);
  }

  fullTime() {
    this.clock = 5400;
    this.charge = null;
    this.clearCharges();
    this.sfx.whistle(true);
    const [a, b] = this.teams;
    if (a.score === b.score && !this.pens && !this.allowDraw) {
      this.startPens();
      return;
    }
    this.endMatch();
  }

  endMatch() {
    this.state = 'fulltime';
    this.stateT = 0;
    this.owner = null;
    const [a, b] = this.teams;
    for (const t of this.teams) {
      const o = this.opp(t);
      const pensWin = this.pens && this.pens.scored[t.idx] > this.pens.scored[o.idx];
      const pensLose = this.pens && this.pens.scored[t.idx] < this.pens.scored[o.idx];
      const won = t.score > o.score || pensWin;
      const lost = t.score < o.score || pensLose;
      for (const p of t.players) {
        if (won) p.model.setPose(rand() < 0.5 ? POSE.ARMS_UP : POSE.CLAP);
        else if (lost) p.model.setPose(rand() < 0.5 ? POSE.HANDS_HEAD : POSE.CROUCH);
        else p.model.setPose(POSE.CLAP);
      }
    }
    this.stadium.setExcite(0.8);
    this.sfx.swell(0.8, 5);
    this.hud.fullTime(a, b, this.pens, recordMatchForm(this.matchRatings()));
  }

  // Moves everyone; `frozen` stops normal play logic (set pieces, kickoff, stoppages).
  updateAll(dt, input, frozen, idle = false) {
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

    if (!idle) this.handleHumans(dt, input, frozen);

    for (const p of this.players) {
      if (idle) {
        p.want.set(0, 0, 0);
        continue;
      }
      if (p.slideT > 0) {
        this.updateSlide(p, dt);
        continue;
      }
      if (p.diving) {
        p.diving.t += dt;
        p.want.set(0, 0, p.diving.vz * Math.max(0, 1 - p.diving.t / 0.7));
        p.vel.z = p.want.z;
        p.vel.x *= 0.9;
        if (p.diving.t > 1.1) {
          p.diving = null;
          p.stun = 0.3;
        }
        continue;
      }
      if (p.stun > 0) {
        p.want.set(0, 0, 0);
        continue;
      }
      if (this.isHumanControlled(p)) continue;
      if (frozen) this.aiFrozen(p);
      else if (this.owner === p) this.aiOwner(p, dt);
      else if (p.isGK) this.aiKeeper(p, dt);
      else this.aiOffBall(p, dt);
    }

    for (const p of this.players) this.tickStamina(p, dt, idle);

    this.integrate(dt);
    if (!frozen) this.updatePossession();
    this.updateBall(dt);
  }

  // ------------------------------------------------------------------ human input

  handleHumans(dt, input, frozen) {
    const frames = input.slots ?? [input];
    let powerV = 0;
    let powerL = '';
    for (const h of this.humans) {
      h.switchCd -= dt;
      const inp = frames[h.id] ?? frames[0];
      this.handleHuman(dt, inp, frozen, h);
      if (h.charge) {
        powerV = h.charge.power;
        const who = this.humans.length > 1 ? `P${h.id + 1} ` : '';
        let lab = KICK_LABEL[h.charge.type] ?? '';
        if (h.charge.type === 'bicycle' && !this.canBicycle(h.controlled)) lab = 'BICYCLE · NEED AIR';
        powerL = who + lab;
      }
    }
    this.hud.power(
      powerV,
      powerL ? (this.isThrowIn() ? powerL.replace('PASS', 'THROW').replace('THROUGH BALL', 'LOFTED THROW') : powerL) : '',
    );
  }

  handleHuman(dt, input, frozen, h) {
    const p = h.controlled;
    if (!p || !input || p.sentOff) return;
    const mv = input.move ?? { x: 0, z: 0 };
    const mlen = Math.min(1, hyp(mv.x, mv.z));
    const locked = frozen && this.owner === p;
    const busy = p.stun > 0 || p.slideT > 0 || p.model.s.fallT > 0;
    const pressed = input.pressed ?? new Set();
    const released = input.released ?? new Set();
    const down = input.down ?? new Set();

    if (!busy && !locked && (!frozen || this.owner !== p)) {
      const hasBall = this.owner === p;
      const sp = (input.sprint ? p.sprint : p.jog) * (hasBall ? 0.92 + this.diff.assist * 0.08 : 1) * (p.pending ? 0.4 : 1);
      if (mlen > 0.1) p.want.set((mv.x / mlen) * sp * mlen, 0, (mv.z / mlen) * sp * mlen);
      else p.want.set(0, 0, 0);
      if (!hasBall && mlen < 0.38 && p.kickCd <= 0) {
        const incoming = this.receiver === p || (!this.owner && hyp(this.ball.pos.x - p.pos.x, this.ball.pos.z - p.pos.z) < 2.4
          && this.lastKick && ['pass', 'through', 'cross'].includes(this.lastKick.type) && this.lastKick.team === p.team
          && this.simT - this.lastKick.t < 2.4);
        if (incoming) {
          const dx = this.ball.pos.x + this.ball.vel.x * 0.12 - p.pos.x;
          const dz = this.ball.pos.z + this.ball.vel.z * 0.12 - p.pos.z;
          const dist = hyp(dx, dz);
          if (dist > 0.35 && dist < 2.6) {
            const trap = p.jog * 0.85;
            p.want.x += (dx / dist) * trap * (1 - mlen);
            p.want.z += (dz / dist) * trap * (1 - mlen);
          }
        }
      }
      if (frozen && this.state === 'kickoff') p.want.set(0, 0, 0);
    } else if (locked) {
      p.want.set(0, 0, 0);
      if (mlen > 0.2) p.facing = Math.atan2(mv.x, mv.z);
    } else p.want.set(0, 0, 0);

    const ourBall = this.owner && this.owner.team === p.team || this.receiver && this.receiver.team === p.team;
    h.nextSwitch = this.owner === p ? null : this.bestSwitch(h);
    if (frozen && this.state === 'setpiece' && this.stateT < 0.4) return;
    if (frozen && this.state === 'kickoff') return;
    if (!ourBall && !frozen && h.switchCd <= 0 && !h.charge && !p.isGK) {
      const n = h.nextSwitch;
      if (n && n !== p) {
        const b = this.ball.pos;
        const gap = hyp(b.x - p.pos.x, b.z - p.pos.z) - hyp(b.x - n.pos.x, b.z - n.pos.z);
        const gkOk = n.isGK && this.inDefBox(p.team, b.x, b.z);
        if ((!n.isGK && gap > 5) || (gkOk && gap > 1.5)) {
          this.setControlled(n, h);
          return;
        }
      }
    }

    if (pressed.has('switch') && this.owner !== p) {
      const n = h.nextSwitch ?? this.bestSwitch(h);
      if (n) {
        this.setControlled(n, h);
        h.switchCd = 1.2;
        h.charge = null;
        h.nextSwitch = this.bestSwitch(h);
      }
      return;
    }

    if (this.owner !== p) {
      if (p.isGK && (pressed.has('dive') || pressed.has('slide') || pressed.has('tackle') && mlen > 0.25)) {
        this.humanDive(p, mlen > 0.2 ? mv.x : p.fx, mlen > 0.2 ? mv.z : p.fz);
      } else {
        if (pressed.has('tackle')) this.standingTackle(p);
        if (pressed.has('slide')) {
          const dx = mlen > 0.2 ? mv.x : p.fx;
          const dz = mlen > 0.2 ? mv.z : p.fz;
          this.slideTackle(p, dx, dz);
        }
      }
    }

    for (const a of KICK_ACTIONS) {
      if ((pressed.has(a) || down.has(a)) && !h.charge) {
        if (this.isThrowIn() && this.owner === p) {
          if (a === 'through') h.charge = { key: a, type: 'through', power: 0 };
          else if (a === 'pass' || a === 'shot' || a === 'finesse') h.charge = { key: a, type: 'pass', power: 0 };
          continue;
        }
        let type = a;
        if (a === 'shot' && input.ctrl) type = 'finesse';
        h.charge = { key: a, type, power: 0 };
      }
    }
    if (h.charge) {
      const c = h.charge;
      const rate = this.isThrowIn() && this.owner === p ? 1.35 : CHARGE_RATE[c.type];
      c.power = Math.min(1, c.power + dt * rate);
      if (released.has(c.key) || !down.has(c.key)) {
        h.charge = null;
        this.humanKick(p, c.type, Math.max(0.12, c.power), mv, mlen, input.curve);
      }
    }
  }

  canBicycle(p) {
    if (!p || p.pending || p.stun > 0 || p.slideT > 0 || p.kickCd > 0 || p.model.s.fallT > 0) return false;
    if (this.owner) return false;
    const b = this.ball.pos;
    if (hyp(b.x - p.pos.x, b.z - p.pos.z) > 2.15) return false;
    if (b.y < BALL_R + 0.28 || b.y > 2.25) return false;
    return true;
  }

  humanKick(p, type, power, mv, mlen, curve) {
    if (p.pending || p.stun > 0 || p.slideT > 0) return;
    if (type === 'bicycle') {
      if (!this.canBicycle(p)) {
        rumble(0.12, 40, 0.08, this.padFor(p));
        return;
      }
      this.performKick(p, type, power, { ...this.humanAim(p, type, mv, mlen, curve), aerial: true });
      return;
    }
    if (this.owner !== p) {
      const b = this.ball.pos;
      if (this.owner || hyp(b.x - p.pos.x, b.z - p.pos.z) > 1.7 || b.y > 1.2 || p.kickCd > 0) return;
      this.setOwner(p);
      this.performKick(p, type, power, { ...this.humanAim(p, type, mv, mlen, curve), instant: true });
      return;
    }
    if (this.state === 'setpiece' && this.setPieceKind === 'throw') {
      if (type === 'power' || type === 'chip' || type === 'cross' || type === 'clear' || type === 'bicycle') return;
      const kind = type === 'through' ? 'through' : 'pass';
      this.performThrow(p, kind, power, this.humanAim(p, kind, mv, mlen, curve));
      return;
    }
    this.performKick(p, type, power, this.humanAim(p, type, mv, mlen, curve));
  }

  humanAim(p, type, mv, mlen, curve = { x: 0, z: 0 }) {
    const opts = {};
    const clen = hyp(curve.x, curve.z);
    const use = clen > 0.2 ? curve : mv;
    const ulen = clen > 0.2 ? clen : mlen;
    const dx = ulen > 0.2 ? use.x / ulen : p.fx;
    const dz = ulen > 0.2 ? use.z / ulen : p.fz;
    opts.dirX = dx;
    opts.dirZ = dz;
    // Lateral stick relative to the kick direction (+ = left, which bends the ball left).
    let kx;
    let kz;
    if (SHOT_TYPES.has(type)) {
      kx = HALF_L * p.team.dir - p.pos.x;
      kz = -p.pos.z;
      if (clen > 0.2) opts.aimZ = clamp(curve.z, -1, 1) * (GOAL_HW - 0.45);
      else if (mlen > 0.2 && Math.abs(mv.z) > 0.25) opts.aimZ = clamp(mv.z, -1, 1) * (GOAL_HW - 0.45);
      else if (this.penStress && !this.penStress.done && p === this.penStress.kicker) opts.aimZ = 0;
    } else {
      kx = p.fx;
      kz = p.fz;
    }
    const kl = hyp(kx, kz) || 1;
    const side = (v) => clamp((v.x * (kz / kl) - v.z * (kx / kl)), -1, 1);
    opts.lateral = ulen > 0.2 ? side(use) : 0;
    if (clen > 0.12) opts.lateral = clamp(opts.lateral * 0.4 + side(curve), -1, 1);
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
    const line = t.ai ? this.diff.line : 0.6;
    const mark = t.ai ? this.diff.mark : 0.7;
    const push = attacking ? lerp(7, 14, line) : lerp(-11, -1, line);
    let tx = p.base.x + (bx + 8) * 0.55 + push;
    let tz = p.base.z * (attacking ? 1.1 : lerp(0.55, 0.85, mark)) + bz * lerp(0.18, 0.48, mark);
    const [lo, hi] = CLAMP_X[p.role];
    tx = clamp(tx, lo, hi);
    if (!attacking && p.role === 'DEF') tx = Math.min(tx, bx - lerp(9, 2.5, mark));
    if (attacking && p.role === 'FWD') {
      // stay roughly onside: not beyond the deepest defender
      const deepest = Math.max(...this.opp(t).players.filter((o) => !o.isGK).map((o) => o.pos.x * d));
      tx = Math.min(tx, Math.max(deepest - 0.5, bx));
    }
    tz = clamp(tz, -HALF_W + 2, HALF_W - 2);
    return [tx * d, tz * d];
  }

  stamCap(p) {
    if (p.stamLock) return p.jog * 0.96;
    if (p.stamina > 0.22) return p.sprint;
    return lerp(p.jog, p.sprint, (p.stamina / 0.22) ** 1.35);
  }

  tickStamina(p, dt, idle) {
    if (idle) {
      p.stamina = 1;
      p.stamLock = false;
      return;
    }
    const wantSp = hyp(p.want.x, p.want.z);
    const cap = this.stamCap(p);
    if (wantSp > cap + 0.01) {
      const s = cap / wantSp;
      p.want.x *= s;
      p.want.z *= s;
    }
    const moving = wantSp > 0.45;
    const usedSprint = Math.min(wantSp, cap) > p.jog * 1.04;
    const pac = p.data.pac;
    if (usedSprint) {
      const drain = (0.155 - pac * 0.0007) * (this.owner === p ? 1.16 : 1);
      p.stamina = Math.max(0, p.stamina - drain * dt);
      if (p.stamina <= 0) p.stamLock = true;
    } else {
      const recover = moving ? 0.09 + pac * 0.00045 : 0.20 + pac * 0.0007;
      p.stamina = Math.min(1, p.stamina + recover * dt);
      if (p.stamLock && p.stamina >= 0.34) p.stamLock = false;
    }
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
    return this.pressPack(team)[0] ?? null;
  }

  pressPack(team) {
    const n = team.ai ? Math.max(1, Math.round(this.diff.pressers)) : 2;
    const b = this.ball;
    const px = b.pos.x + b.vel.x * 0.45;
    const pz = b.pos.z + b.vel.z * 0.45;
    return team.players
      .filter((m) => !m.isGK && m.stun <= 0 && !this.isHumanControlled(m))
      .sort((a, c) => hyp(a.pos.x - px, a.pos.z - pz) - hyp(c.pos.x - px, c.pos.z - pz))
      .slice(0, n);
  }

  aiFrozen(p) {
    if (this.owner === p) {
      p.want.set(0, 0, 0);
      return;
    }
    if (this.state === 'setpiece' && this.setPieceKind === 'throw' && p.team === this.setPieceTeam) {
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
      const min = this.setPieceKind === 'throw' ? 2 : this.setPieceKind === 'penalty' ? 16.6 : 9.15;
      if (d < min) {
        p.pos.x = b.x + ((p.pos.x - b.x) / (d || 1)) * min;
        p.pos.z = b.z + ((p.pos.z - b.z) / (d || 1)) * min;
      }
    }
  }

  aiSetPiece(p) {
    const k = this.setPieceKind;
    if (k === 'penalty') {
      this.performKick(p, rand() < 0.35 ? 'finesse' : 'shot', this.penAiPower(), { aimZ: (rand() - 0.5) * 5.2 });
      return;
    }
    if (k === 'freekick') {
      const gx = HALF_L * p.team.dir;
      const dist = hyp(gx - p.pos.x, p.pos.z);
      if (dist < 32 && rand() < 0.62) {
        this.performKick(p, rand() < 0.5 ? 'finesse' : 'shot', 0.68 + rand() * 0.22, {});
        return;
      }
    }
    if (k === 'corner') this.performKick(p, 'cross', 0.6 + rand() * 0.3, {});
    else if (k === 'goalkick') {
      const t = p.team;
      const target = this.bestPassOption(p);
      if (target && rand() < 0.5) this.performKick(p, 'pass', 0.6, { target: target.m });
      else {
        const mids = t.players.filter((m) => m.role === 'MID' || m.role === 'FWD');
        this.performKick(p, 'through', 0.3, { target: pick(mids) });
      }
    } else if (k === 'throw') {
      const o = this.bestPassOption(p);
      const maxD = 22;
      let target = o?.m;
      if (target && hyp(target.pos.x - p.pos.x, target.pos.z - p.pos.z) > maxD) target = null;
      if (!target) {
        target = p.team.players.find((m) => m !== p && !m.isGK && hyp(m.pos.x - p.pos.x, m.pos.z - p.pos.z) < maxD)
          ?? p.team.players.find((m) => m !== p && !m.isGK);
      }
      const loft = rand() < 0.28;
      this.performThrow(p, loft ? 'through' : 'pass', 0.35 + rand() * 0.4, target ? { target } : { dirX: p.fx, dirZ: p.fz });
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
      const noise = gauss() * (1 - t.q) * 5 * (t.ai ? this.diff.passErr : 1);
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
          const ts = score + (3 + t.q * 4 + (p.data.pas - 75) * 0.1) * (t.ai ? this.diff.through : 1);
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
      if (p.holdT > lerp(1.7, 0.55, this.diff.gkPos)) {
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
    p.holdT += dt;
    p.decisionT -= dt;
    if (p.decisionT <= 0) {
      p.decisionT = (lerp(0.85, 0.32, t.q) + rand() * 0.35) * this.diff.decision + this.diff.reaction * 0.08;
      const inRange = distG < 30 && (Math.abs(p.pos.z) < 18 || distG < 17);
      if (inRange) {
        const lon = shotTraits(p.data).lon;
        const want = distG < 13 ? 0.95 : distG < 19 ? 0.6 : distG < 25 ? 0.28 * (lon / 85) : 0.12 * (lon / 85);
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
      if (p.pos.x * d < -HALF_L + 24 && pressure < 2.6 && p.role === 'DEF' && rand() < 0.55 - t.q * 0.25) {
        this.performKick(p, 'clear', 0.5 + rand() * 0.5, {});
        return;
      }
      const o = this.bestPassOption(p);
      const tired = p.stamina < 0.4;
      if (o && (tired && o.score > -10 || pressure < 2.6 && o.score > -6 || o.score > 9 - t.q * 3 && rand() < 0.45 + t.q * 0.2)) {
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
      const w = (1 - od / 7) * 1.6 * lerp(0.7, 1.25, this.diff.dribble);
      const side = Math.sign(ox * dz - oz * dx) || 1;
      ax += dz * side * w;
      az += -dx * side * w;
    }
    let mx = dx + ax;
    let mz = dz + az;
    if (Math.abs(p.pos.z) > HALF_W - 4) mz -= Math.sign(p.pos.z) * 1.5;
    const ml = hyp(mx, mz) || 1;
    const sp = crowded ? p.jog * lerp(1.0, 1.12, this.diff.dribble) : p.sprint * lerp(0.72, 1.0, this.diff.sprint);
    p.want.set((mx / ml) * sp, 0, (mz / ml) * sp);
  }

  aiShoot(p, distG) {
    const t = p.team;
    const d = t.dir;
    const og = this.opp(t).gk;
    const gkOff = HALF_L - Math.abs(og.pos.x);
    const sho = p.data.sho;
    const { lon, fin } = shotTraits(p.data);
    let type = 'shot';
    const r = rand();
    const tech = this.diff.technique;
    if (gkOff > 4.5 && distG > 12 && distG < 32 && r < 0.75 * tech) type = 'chip';
    else if (distG > 20 && lon >= 76 && r < 0.62 * tech * (lon / 82)) type = 'power';
    else if ((Math.abs(p.pos.z) > 5 || r < 0.35) && fin >= 74 && distG > 8 && rand() < tech * (fin / 82)) type = 'finesse';
    let power = clamp(0.45 + distG / 60 + gauss() * 0.08 * this.diff.shotErr, 0.4, 0.88);
    if (type === 'power') power = clamp(0.55 + distG / 70, 0.5, 0.9);
    if (type === 'chip') power = 0.6 + rand() * 0.3;
    power = clamp(power * this.diff.shotPower, 0.35, 0.95);
    const side = og.pos.z * d > 0.3 ? -1 : og.pos.z * d < -0.3 ? 1 : (rand() < 0.5 ? -1 : 1);
    const scatter = 1.2 + (this.diff.shotErr - 1) * 0.55;
    const aimZ = side * d * (GOAL_HW - 0.5 - rand() * scatter) * (1 - (1 - t.q) * 0.42);
    const lateral = (rand() * 2 - 1) * tech * 0.55;
    this.performKick(p, type, power, { aimZ: type === 'finesse' ? undefined : aimZ, lateral });
  }

  // Wing-cross attack: RW/LW (or anyone high and wide) driving toward the byline.
  // ST + far-side forward / late mid sprint into the box; humans are never dragged.
  detectWingCross() {
    const lk = this.lastKick;
    if (lk?.type === 'cross' && this.simT - lk.t < 2.4 && lk.player && !lk.player.sentOff) {
      const kicker = lk.player;
      const d = kicker.team.dir;
      const wingSign = Math.sign(kicker.pos.z) || Math.sign(kicker.base.z * d) || 1;
      return { carrier: kicker, team: kicker.team, dir: d, wingSign, prog: kicker.pos.x * d, live: false };
    }

    let carrier = this.owner;
    if (!carrier && this.receiver && lk && ['pass', 'through'].includes(lk.type) && lk.team === this.receiver.team) {
      carrier = this.receiver;
    }
    if (!carrier || carrier.isGK || carrier.sentOff) return null;

    const t = carrier.team;
    const d = t.dir;
    const prog = carrier.pos.x * d;
    const absZ = Math.abs(carrier.pos.z);
    const wingSign = Math.sign(carrier.pos.z) || Math.sign(carrier.base.z * d) || 1;
    const isWing = carrier.idx === 8 || carrier.idx === 10;
    const isWideBack = carrier.idx === 1 || carrier.idx === 4;
    const highWide = prog > HALF_L - 32 && absZ > HALF_W - 15;

    if (prog < 6) return null;
    if (!isWing && !isWideBack && !highWide) return null;
    if (!isWing && prog < HALF_L - 34) return null;
    if (absZ < (isWing ? 13 : 16)) return null;

    const vx = carrier.vel.x * d;
    const outWide = carrier.vel.z * wingSign;
    if (vx < -1.8) return null;
    // Cut inside to shoot from the D — not a cross.
    if (absZ < 15.5 && prog > HALF_L - 24 && prog < HALF_L - 11 && -outWide > 2.4 && vx > 1.2) return null;

    const deep = prog > HALF_L - 22;
    const running = vx > 0.55 || outWide > 1.0;
    if (!running && !deep) return null;
    if (isWing && prog > 8 && absZ > 14) {
      return { carrier, team: t, dir: d, wingSign, prog, live: true };
    }
    if ((isWideBack || highWide) && prog > HALF_L - 32 && absZ > 16) {
      return { carrier, team: t, dir: d, wingSign, prog, live: true };
    }
    return null;
  }

  wingCrossSit() {
    const prev = this.crossSit;
    if (this.owner && prev && this.owner.team !== prev.team) {
      this.crossSit = null;
      return null;
    }
    const fresh = this.detectWingCross();
    if (fresh) {
      this.crossSit = { ...fresh, t: this.simT };
      return this.crossSit;
    }
    if (!prev || this.simT - prev.t > 0.55) {
      this.crossSit = null;
      return null;
    }
    const carrier = this.owner && this.owner.team === prev.team ? this.owner : prev.carrier;
    if (!carrier || carrier.team !== prev.team) {
      this.crossSit = null;
      return null;
    }
    if (carrier.vel.x * prev.dir < -2.2 || Math.abs(carrier.pos.z) < 11) {
      this.crossSit = null;
      return null;
    }
    return prev;
  }

  boxRunTarget(p, sit) {
    if (!p || p.isGK || p.sentOff || p === sit.carrier || this.isHumanControlled(p)) return null;
    const d = sit.dir;
    const wing = sit.wingSign;
    const depth = HALF_L - sit.prog;
    const isST = p.idx === 9;
    const isFarWing = (p.idx === 8 || p.idx === 10) && Math.sign(p.base.z * d) !== wing;
    const isLateMid = p.idx === 5 || p.idx === 7;
    if (!isST && !isFarWing && !isLateMid) return null;

    let teamX;
    let worldZ;
    if (isST) {
      if (depth < 12) {
        teamX = HALF_L - 8.2;
        worldZ = -wing * 6.4;
      } else if (depth < 20) {
        teamX = HALF_L - 7.6;
        worldZ = wing * 5.5;
      } else {
        teamX = HALF_L - 11;
        worldZ = wing * 2.2;
      }
    } else if (isFarWing) {
      const st = sit.team.players[9];
      const stBusy = !st || st === sit.carrier || st.sentOff || this.isHumanControlled(st);
      teamX = HALF_L - (stBusy ? 11 : 9.8);
      worldZ = -wing * (stBusy ? 3.0 : 8.6);
    } else {
      const mids = [sit.team.players[5], sit.team.players[7]]
        .filter((m) => m && !m.sentOff && m !== sit.carrier && !this.isHumanControlled(m))
        .sort((a, c) => c.pos.x * d - a.pos.x * d);
      if (mids[0] !== p || p.pos.x * d < 0) return null;
      teamX = HALF_L - 16.6;
      worldZ = wing * 3.4;
    }

    teamX = clamp(teamX, HALF_L - PEN_DEPTH + 1.4, HALF_L - 6.8);
    worldZ = clamp(worldZ, -PEN_HW + 1.6, PEN_HW - 1.6);
    if (sit.prog < HALF_L - 22) {
      const line = Math.max(
        ...this.opp(sit.team).players.filter((o) => !o.isGK && !o.sentOff).map((o) => o.pos.x * d),
        -HALF_L,
      );
      teamX = Math.min(teamX, Math.max(line + 1.1, HALF_L - 22));
    }
    return [teamX * d, worldZ];
  }

  humanContesting(team, x, z, radius = 5.2) {
    return this.humansOn(team).some((h) => {
      const c = h.controlled;
      if (!c || c.isGK) return false;
      return hyp(c.pos.x - x, c.pos.z - z) < radius;
    });
  }

  aiOffBall(p, dt) {
    const t = p.team;
    const b = this.ball;
    if (this.receiver === p) {
      const s = this.receiveSpot;
      const bx = b.pos.x + b.vel.x * 0.3;
      const bz = b.pos.z + b.vel.z * 0.3;
      const tx = s && hyp(bx - p.pos.x, bz - p.pos.z) > 6 ? s.x : bx;
      const tz = s && hyp(bx - p.pos.x, bz - p.pos.z) > 6 ? s.z : bz;
      this.steer(p, tx, tz, p.sprint, 0.3);
      return;
    }
    const attacking = this.owner && this.owner.team === t || this.receiver && this.receiver.team === t;
    const sit = this.wingCrossSit();
    if (sit && sit.team === t && attacking) {
      const run = this.boxRunTarget(p, sit);
      if (run) {
        const gap = hyp(run[0] - p.pos.x, run[1] - p.pos.z);
        this.steer(p, run[0], run[1], gap > 2.6 ? p.sprint : p.jog * 1.08, 1.1);
        return;
      }
    }
    if (!attacking) {
      const pack = this.pressPack(t);
      const rank = pack.indexOf(p);
      const hx = this.owner?.pos.x ?? b.pos.x;
      const hz = this.owner?.pos.z ?? b.pos.z;
      const humanNear = this.humanContesting(t, hx, hz, this.owner ? 6.5 : 5.2);
      if (rank === 0 && !humanNear) {
        if (!this.owner) this.aiChaseBall(p);
        else this.aiPress(p, dt);
        return;
      }
      if (rank === 0 && humanNear) {
        this.aiSupportPress(p, dt, 1);
        return;
      }
      if (rank > 0) {
        if (!this.owner && rank === 1 && !humanNear) this.aiChaseBall(p);
        else this.aiSupportPress(p, dt, rank);
        return;
      }
    }
    let [tx, tz] = this.teamTarget(p);
    if (!attacking) {
      const dBall = hyp(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      const press = t.ai ? this.diff.press : 0.7;
      if (dBall < lerp(10, 17, press)) {
        tx = lerp(tx, b.pos.x, 0.16 * press);
        tz = lerp(tz, b.pos.z, 0.16 * press);
      }
    }
    if (!attacking && !this.owner && !this.humanContesting(t, b.pos.x, b.pos.z)
      && this.nearest(t, b.pos.x, b.pos.z, (m) => !m.isGK && !this.isHumanControlled(m)) === p) {
      tx = b.pos.x + b.vel.x * 0.25;
      tz = b.pos.z + b.vel.z * 0.25;
    }
    const d = hyp(tx - p.pos.x, tz - p.pos.z);
    this.steer(p, tx, tz, d > 9 ? p.sprint * 0.9 : p.jog);
  }

  aiChaseBall(p) {
    const b = this.ball;
    const press = p.team.ai ? this.diff.press : 0.85;
    const dist = hyp(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
    const tLook = Math.min(0.55, dist / Math.max(p.sprint, 0.01));
    const tx = b.pos.x + b.vel.x * tLook;
    const tz = b.pos.z + b.vel.z * tLook;
    const chase = p.sprint * lerp(0.82, 1.0, press) * (p.team.ai ? this.diff.sprint : 1);
    this.steer(p, tx, tz, chase, 0.28);
  }

  aiPress(p, dt) {
    const o = this.owner;
    if (!o) {
      this.aiChaseBall(p);
      return 0;
    }
    const press = this.diff.press;
    const assist = o.team.human ? this.diff.assist : 0;
    const ownX = -HALF_L * p.team.dir;
    const cx = o.pos.x;
    const cz = o.pos.z;
    const gx = ownX - cx;
    const gz = -cz;
    const gl = hyp(gx, gz) || 1;
    const nx = gx / gl;
    const nz = gz / gl;
    const dist = hyp(p.pos.x - cx, p.pos.z - cz);
    let gap = 2.15;
    let speed = p.jog;
    if (dist > 4.8) {
      gap = dist > 10 ? 2.6 : 2.15;
      speed = p.sprint * lerp(0.78, 0.98, press) * (p.team.ai ? this.diff.sprint : 1);
    } else if (dist > 2.6) {
      gap = 2.05;
      speed = p.jog * 1.15;
    } else {
      gap = 1.7;
      speed = p.jog * 0.7;
    }
    const tx = cx + nx * gap;
    const tz = cz + nz * gap * 0.7;
    const d = this.steer(p, tx, tz, speed, 0.42);
    const od = hyp(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
    const inFront = !this.fromBehind(p, o);
    const heavy = o.vel.length() > 7.4 || o.stamina < 0.28;
    const rate = this.diff.steal * this.diff.tackleTiming * (0.28 + p.data.def / 140)
      * lerp(0.35, 0.85, p.team.q) * press * (1 - assist * 0.75);
    if (!inFront && p.team.ai) return d;
    if (inFront && od < 1.55 && p.tackleCd <= 0 && (heavy || rand() < rate * dt * 0.85)) this.standingTackle(p);
    else if (inFront && heavy && od > 2.4 && od < 3.4 && p.tackleCd <= 0 && rand() < dt * 0.07 * rate) {
      this.slideTackle(p, o.pos.x + o.vel.x * 0.22 - p.pos.x, o.pos.z + o.vel.z * 0.22 - p.pos.z);
    }
    return d;
  }

  aiSupportPress(p, dt, rank) {
    const o = this.owner;
    const b = this.ball;
    const press = this.diff.press;
    const ownX = -HALF_L * p.team.dir;
    const opp = this.opp(p.team);
    const from = o ? o.pos : b.pos;
    const options = opp.players
      .filter((m) => !m.isGK && m !== o)
      .sort((a, c) => {
        const da = hyp(a.pos.x - from.x, a.pos.z - from.z);
        const dc = hyp(c.pos.x - from.x, c.pos.z - from.z);
        const fa = (a.pos.x - from.x) * p.team.dir;
        const fc = (c.pos.x - from.x) * p.team.dir;
        return (da - fa * 0.6) - (dc - fc * 0.6);
      });
    const mate = options[Math.max(0, rank - 1)] ?? options[0];
    let tx;
    let tz;
    if (mate) {
      tx = lerp(from.x, mate.pos.x, 0.52);
      tz = lerp(from.z, mate.pos.z, 0.52);
      tx = lerp(tx, ownX, 0.06);
    } else {
      const side = rank % 2 === 1 ? 1 : -1;
      tx = lerp(from.x, ownX, 0.12);
      tz = from.z + side * lerp(6.5, 4.2, press);
    }
    const dist = hyp(p.pos.x - tx, p.pos.z - tz);
    this.steer(p, tx, tz, dist > 10 ? p.sprint * 0.78 : p.jog * 0.95, 0.5);
  }

  inOwnBox(p) {
    const ownX = -HALF_L * p.team.dir;
    return Math.abs(p.pos.x - ownX) < PEN_DEPTH && Math.abs(p.pos.z) < PEN_HW;
  }

  inDefBox(team, x, z) {
    const ownX = -HALF_L * team.dir;
    return Math.abs(x - ownX) < PEN_DEPTH && Math.abs(z) < PEN_HW;
  }

  fromBehind(tackler, victim) {
    if (!tackler || !victim) return false;
    const vx = victim.vel.x;
    const vz = victim.vel.z;
    const sp = hyp(vx, vz);
    const fx = sp > 1.4 ? vx / sp : victim.fx;
    const fz = sp > 1.4 ? vz / sp : victim.fz;
    const dx = tackler.pos.x - victim.pos.x;
    const dz = tackler.pos.z - victim.pos.z;
    const d = hyp(dx, dz) || 1;
    return (dx / d) * fx + (dz / d) * fz < -0.45;
  }

  shouldWhistle(tackler, victim, { slide = false, wonBall = false } = {}) {
    if (!tackler || !victim || !this.fromBehind(tackler, victim)) return false;
    if (this.isLastMan(tackler, victim) && !tackler.isGK) return true;
    const late = victim.vel.length() > 7.8;
    if (wonBall && !slide) return rand() < (late ? 0.05 : 0.02);
    if (wonBall && slide) return rand() < (late ? 0.10 : 0.04);
    if (slide) return rand() < (late ? 0.22 : 0.10);
    return rand() < (late ? 0.12 : 0.05);
  }

  isLastMan(offender, victim) {
    const goalX = -HALF_L * offender.team.dir;
    const vicD = Math.abs(victim.pos.x - goalX);
    if (vicD > 30) return false;
    let closer = 0;
    for (const m of offender.team.players) {
      if (m === offender || m.isGK) continue;
      if (Math.abs(m.pos.x - goalX) < vicD + 0.4) closer++;
    }
    return closer === 0;
  }

  callFoul(offender, victim, { slide = false } = {}) {
    if (this.state !== 'play') return;
    this.sfx.whistle(true);
    this.owner = null;
    this.receiver = null;
    this.shot = null;
    this.charge = null;
    this.clearCharges();
    this.hud.power?.(0, '');
    victim.model.fall();
    victim.stun = 1.8;
    victim.kickCd = 0.8;
    offender.stun = 1.0;
    offender.slideT = 0;
    offender.vel.set(0, 0, 0);
    this.ball.place(clamp(victim.pos.x, -HALF_L + 2, HALF_L - 2), clamp(victim.pos.z, -HALF_W + 2, HALF_W - 2));
    this.ball.vel.set(0, 0, 0);
    this.ball.spin.set(0, 0, 0);
    this.lastTouch = offender.team;
    rumble(0.42, 160, 0.5, this.padFor(offender));
    rumble(0.28, 120, 0.22, this.padFor(victim));

    const lastMan = this.isLastMan(offender, victim);
    const pen = this.inDefBox(offender.team, victim.pos.x, victim.pos.z);
    let reason = slide ? 'Sliding in from behind' : 'Tackle from behind';
    let card = 'yellow';
    if (lastMan && !offender.isGK) {
      card = 'red';
      reason = 'Last man — from behind';
    } else if (slide && victim.vel.length() > 7.4) {
      reason = 'Dangerous slide from behind';
    }
    offender.st.fouls++;
    if (pen) offender.st.pensConceded++;
    this.book(offender, card, reason);

    const team = victim.team;
    if (pen) {
      this.hud.banner('PENALTY', `${offender.data.back} · ${reason}`, 2.3);
      this.startSetPiece('penalty', team, victim.pos.x, victim.pos.z);
    } else {
      this.hud.banner('FREE KICK', `${offender.data.back} · ${reason}`, 2.1);
      this.startSetPiece('freekick', team, clamp(victim.pos.x, -HALF_L + 3, HALF_L - 3), clamp(victim.pos.z, -HALF_W + 3, HALF_W - 3));
    }
  }

  book(p, kind, reason) {
    const secondYellow = kind === 'yellow' && (p.cards || 0) >= 1;
    if (kind === 'red' || secondYellow) {
      p.cards = 2;
      p.team.reds = (p.team.reds || 0) + 1;
      p.st.red++;
      this.hud.card?.('red', p, secondYellow ? `Second yellow — ${reason}` : reason);
      this.say(`RED CARD! ${p.data.name} — ${secondYellow ? 'second yellow' : reason}`);
      this.sendOff(p);
      return;
    }
    p.cards = (p.cards || 0) + 1;
    p.team.yellows = (p.team.yellows || 0) + 1;
    p.st.yellow++;
    this.hud.card?.('yellow', p, reason);
    this.say(`Yellow card — ${p.data.back} (${reason})`);
  }

  sendOff(p) {
    p.sentOff = true;
    p.st.off = this.clock;
    if (this.owner === p) this.owner = null;
    if (this.receiver === p) this.receiver = null;
    for (const h of this.humans) {
      if (h.controlled === p) {
        const n = this.nearest(p.team, p.pos.x, p.pos.z, (m) => m !== p && !m.isGK);
        if (n) this.setControlled(n, h);
        else h.controlled = p.team.gk;
      }
    }
    const ti = p.team.players.indexOf(p);
    if (ti >= 0) p.team.players.splice(ti, 1);
    const gi = this.players.indexOf(p);
    if (gi >= 0) this.players.splice(gi, 1);
    if (p.team.gk === p) p.team.gk = p.team.players.find((m) => m.isGK) ?? p.team.players[0];
    p.dispose();
  }

  noteOut(kind) {
    if (!OUT_KINDS.has(kind)) return;
    this.outs = (this.outs || 0) + 1;
    this.outsSinceWindow = (this.outsSinceWindow || 0) + 1;
    if (this.outsSinceWindow < SUB_EVERY) {
      this.hud.outs?.(this.outsUntilSub(), false);
      return;
    }
    this.outsSinceWindow = 0;
    this.subWindow = true;
    const left = this.teams.reduce((n, t) => n + (t.human ? t.subsLeft : 0), 0);
    this.hud.banner('SUB WINDOW', left ? 'Press U to make a change' : '5-sub limit', 2.3);
    this.say('Substitution window — every 7 outs');
    this.hud.outs?.(0, true);
    this.aiMakeSubs();
  }

  subAllowed() {
    return this.state === 'halftime' || !!this.subWindow;
  }

  outsUntilSub() {
    if (this.subAllowed()) return 0;
    return SUB_EVERY - (this.outsSinceWindow || 0);
  }

  canSub(team) {
    return !!team && this.subAllowed() && (team.subsLeft ?? 0) > 0 && team.bench?.length
      && this.state !== 'fulltime' && this.state !== 'pens' && this.state !== 'replay' && this.state !== 'goal';
  }

  makeSub(team, outP, inData) {
    if (!this.canSub(team) || !outP || !inData || outP.sentOff) return false;
    const inIsGk = inData.role === 'GK';
    if (outP.isGK !== inIsGk) return false;
    const np = new Player(this, team, outP.idx, inData);
    np.pos.copy(outP.pos);
    np.facing = outP.facing;
    np.stamina = 1;
    const ti = team.players.indexOf(outP);
    if (ti < 0) return false;
    team.players[ti] = np;
    const gi = this.players.indexOf(outP);
    if (gi >= 0) this.players[gi] = np;
    else this.players.push(np);
    if (team.gk === outP) team.gk = np;
    for (const h of this.humans) {
      if (h.controlled === outP) h.controlled = np;
    }
    if (this.controlled === outP) this.controlled = np;
    if (this.owner === outP) this.setOwner(np, true);
    if (this.receiver === outP) this.receiver = np;
    outP.st.off = this.clock;
    outP.dispose();
    team.bench = team.bench.filter((d) => d !== inData);
    team.subsLeft--;
    this.say(`${inData.name} on for ${outP.data.back} · ${team.subsLeft} sub${team.subsLeft === 1 ? '' : 's'} left`);
    this.hud.banner('SUBSTITUTION', `${outP.data.back}  →  ${inData.back}`, 1.8);
    return true;
  }

  aiMakeSubs() {
    for (const t of this.teams) {
      if (!t.ai) continue;
      const tired = t.players
        .filter((p) => !p.isGK && (p.stamina < 0.45 || p.cards >= 1 && p.stamina < 0.72))
        .sort((a, b) => a.stamina - b.stamina || b.cards - a.cards);
      const n = Math.min(t.subsLeft, tired.length, t.bench.filter((d) => d.role !== 'GK').length, 2);
      for (let i = 0; i < n; i++) {
        const outP = tired[i];
        const like = t.bench.find((d) => d.role === outP.role) ?? t.bench.find((d) => d.role !== 'GK');
        if (like) this.makeSub(t, outP, like);
      }
    }
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
          if (tt < lerp(0.9, 0.42, this.diff.gkPos) && Math.abs(gap) > 0.9 && p.diveCd <= 0 && b.vel.length() > 12) {
            const react = t.ai ? this.diff.gkSave : 0.62;
            const reach = clamp(gap, -3.2, 3.2) * lerp(0.75, 1.08, (p.data.def / 100) * react / 0.62);
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
    const out = clamp(bl * lerp(0.07, 0.14, t.ai ? this.diff.gkPos : 0.7), 0.5, lerp(3.2, 5.4, t.ai ? this.diff.gkPos : 0.7));
    this.steer(p, ownX + (bx / bl) * out, clamp((bz / bl) * out, -GOAL_HW + 0.3, GOAL_HW - 0.3), lerp(4.4, 6.2, t.ai ? this.diff.gkPos : 0.7), 0.4);
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
      if (this.isThrowIn() && this.setPieceTeam === o.team) {
        const delay = kickContactDelay(KICK.THROW);
        const wind = o.pending ? clamp(1 - o.pending.t / delay, 0, 1) : 0;
        const back = 0.2 - wind * 0.55;
        const y = 1.9 - wind * 0.18;
        b.pos.set(o.pos.x - o.fx * back, y, o.pos.z - o.fz * back);
      } else if (o.isGK && o.model.s.pose === POSE.HOLD) {
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
    this.attractBall(dt);
  }

  attractBall(dt) {
    if (this.owner) return;
    if (this.state !== 'play' && this.state !== 'setpiece' && this.state !== 'kickoff') return;
    if (this.shot && this.simT - this.shot.t < 2.1) return;
    const b = this.ball;
    if (b.pos.y > 1.85) return;
    const pass = this.lastKick && ['pass', 'through', 'cross'].includes(this.lastKick.type)
      && this.simT - this.lastKick.t < 2.6;
    const kickTeam = this.lastKick?.team;
    let target = null;
    let range = 0;
    let strength = 0;
    if (this.receiver && this.receiver.stun <= 0 && this.receiver.kickCd <= 0 && this.receiver.slideT <= 0) {
      const d = hyp(b.pos.x - this.receiver.pos.x, b.pos.z - this.receiver.pos.z);
      if (d < 4.4) {
        target = this.receiver;
        range = 4.4;
        strength = pass ? 0.7 : 0.42;
      }
    }
    if (!target) {
      let bd = Infinity;
      for (const p of this.players) {
        if (p.isGK || p.stun > 0 || p.kickCd > 0 || p.slideT > 0 || p.model.s.fallT > 0) continue;
        const friendly = pass && kickTeam && p.team === kickTeam;
        const maxD = friendly ? 2.9 : 1.55;
        const d = hyp(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
        if (d < maxD && d < bd) {
          bd = d;
          target = p;
          range = maxD;
          strength = friendly ? 0.62 : 0.28;
        }
      }
    }
    if (!target || range <= 0) return;
    const d = hyp(b.pos.x - target.pos.x, b.pos.z - target.pos.z) || 0.001;
    const t = clamp(1 - d / range, 0, 1);
    const pull = strength * t;
    const feetX = target.pos.x + target.fx * 0.32;
    const feetZ = target.pos.z + target.fz * 0.32;
    const dx = feetX - b.pos.x;
    const dz = feetZ - b.pos.z;
    b.pos.x += dx * pull * dt * 7.5;
    b.pos.z += dz * pull * dt * 7.5;
    b.vel.x += dx * pull * 5.5 * dt;
    b.vel.z += dz * pull * 5.5 * dt;
    const damp = 1 - pull * dt * 2.4;
    b.vel.x *= damp;
    b.vel.z *= damp;
    if (b.pos.y > BALL_R && pull > 0.2) b.vel.y -= pull * 4.5 * dt;
    if (d > 0.45 && d < range && target.stun <= 0 && !this.isHumanControlled(target)) {
      const step = (pass ? 0.55 : 0.28) * t;
      target.pos.x += (b.pos.x - target.pos.x) / d * step * dt * 8;
      target.pos.z += (b.pos.z - target.pos.z) / d * step * dt * 8;
    }
  }

  updatePossession() {
    if (this.owner) return;
    const b = this.ball;
    const bs = b.vel.length();
    this.checkSaves(bs);
    if (this.owner) return;
    let best = null;
    let bd = Infinity;
    const pass = this.lastKick && ['pass', 'through', 'cross'].includes(this.lastKick.type)
      && this.simT - this.lastKick.t < 2.6;
    for (const p of this.players) {
      if (p.kickCd > 0 || p.stun > 0 || p.slideT > 0 || p.model.s.fallT > 0) continue;
      const d = hyp(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      const hands = p.isGK && this.inOwnBox(p);
      const intended = this.receiver === p || (pass && this.lastKick?.team === p.team);
      const reach = hands ? 1.25 : intended ? 1.45 : 1.12;
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
      if (this.shot && this.shot.team !== best.team) best.st.blocks++;
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
    this.prevKick = this.lastKick;
    this.sfx.kick(0.3);
    if (attackBox) {
      const tz = (rand() < 0.5 ? -1 : 1) * (GOAL_HW - 0.5 - rand());
      const err = (1 - p.data.sho / 100) * 0.25 * (p.team.ai ? this.diff.shotErr : 1 - this.diff.assist * 0.4);
      const ang = Math.atan2(tz - p.pos.z, gx - p.pos.x) + gauss() * err;
      const sp = 12 + p.data.sho / 20;
      b.vel.set(Math.cos(ang) * sp, -1 + rand() * 2.5, Math.sin(ang) * sp);
      this.shot = { team: p.team, player: p, type: 'header', t: this.simT, dist: hyp(gx - p.pos.x, p.pos.z), checked: false };
      this.lastKick = { type: 'header', team: p.team, player: p, t: this.simT };
      this.noteShot(p);
      this.say(pick(['Header!', 'Rises highest!']));
    } else if (defBox) {
      b.vel.set(d * (8 + rand() * 4), 4 + rand() * 3, gauss() * 5);
      this.lastKick = { type: 'clear', team: p.team, player: p, t: this.simT };
    } else {
      b.vel.set(p.fx * 7 + gauss(), 1.5, p.fz * 7 + gauss());
      this.lastKick = { type: 'pass', team: p.team, player: p, t: this.simT };
      p.st.passes++;
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
    const typeMod = { power: -0.08, finesse: -0.12, chip: -0.1, header: 0.05, bicycle: -0.04, shot: 0 }[s.type] ?? 0;
    const traits = s.player ? shotTraits(s.player.data) : { lon: 75, fin: 75 };
    let traitMod = 0;
    if (s.type === 'power') traitMod = (traits.lon - 75) * 0.004;
    else if (s.type === 'finesse') traitMod = (traits.fin - 75) * 0.0045;
    else if (s.type === 'shot' && s.dist > 20) traitMod = (traits.lon - 75) * 0.003;
    const chance = clamp(base + (skill - 0.82) * 1.2 - (bs - 18) * 0.012 + typeMod - traitMod - (gk.diving ? 0.05 : -0.1), 0.12, 0.93);
    if (rand() > chance) {
      gk.kickCd = 0.6;
      return;
    }
    this.stadium.setExcite(0.55);
    this.sfx.swell(0.5, 2.5);
    if (this.state !== 'pens') {
      gk.st.saves++;
      if (s.player) s.player.st.onTarget++;
      if (s.player && s.pen) s.player.st.penMissed++;
      this.lastPass = null;
    }
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
    if (!Number.isFinite(b.x + b.y + b.z)) {
      this.ball.place(0, 0);
      this.owner = null;
      return;
    }
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
    if (s.player && s.pen) s.player.st.penMissed++;
    if (Math.abs(b.z) < GOAL_HW + 2.5 && b.y < GOAL_H + 1.8) {
      this.say(b.y > GOAL_H ? pick(['Just over!', 'Over the bar!']) : pick(['Just wide!', 'Inches wide!', 'So close!']));
      this.nearMiss(1);
      if (s.player && !s.pen && s.dist < 12) s.player.st.bigMiss++;
    } else if (Math.abs(b.z) < GOAL_HW + 7) this.say(pick(['Wide of the target.', 'Off target.']));
    this.shot = null;
  }

  goalScored(team) {
    team.score++;
    const lk = this.lastKick;
    const scorer = lk && lk.team === team ? lk.player : null;
    if (scorer) {
      scorer.st.goals++;
      if (this.shot?.player !== scorer) scorer.st.shots++;
      scorer.st.onTarget++;
      const assist = this.assistFor(scorer, lk.t);
      if (assist) assist.st.assists++;
    } else if (lk?.player) lk.player.st.ownGoals++;
    for (const p of this.opp(team).players) p.st.conceded++;
    this.lastPass = null;
    this.state = 'goal';
    this.stateT = 0;
    this.goalT = this.simT;
    this.goalTeam = team;
    this.owner = null;
    this.charge = null;
    this.clearCharges();
    this.receiver = null;
    this.hud.power(0, '');
    this.shake = 1;
    rumble(0.75, 340, 0.9);
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
        bicycle: pick(['What a bicycle kick!', 'Acrobatic finish!', 'Overhead kick! Outrageous!']),
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
    const skip = this.anyPressed(input, 'shot', 'pass', 'skip');
    if (this.stateT > 6.5 || skip && this.stateT > 1) this.startReplay();
  }

  // ------------------------------------------------------------------ replay

  record() {
    if (this.simT - (this.lastRecT ?? -99) < 1 / 28) return;
    this.lastRecT = this.simT;
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
    if (this.frames.length > 400) this.frames.splice(0, this.frames.length - 340);
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
    const skip = this.anyPressed(input, 'shot', 'pass', 'skip');
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
    if (!F.length) return;
    if (F.length === 1) {
      this.applyFramePair(F[0], F[0], 0);
      return;
    }
    let lo = 0;
    let hi = F.length - 1;
    let guard = 0;
    while (hi - lo > 1 && guard++ < 24) {
      const mid = (lo + hi) >> 1;
      if (F[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const A = F[lo];
    const B = F[hi];
    const a = B.t > A.t ? clamp((t - A.t) / (B.t - A.t), 0, 1) : 0;
    this.applyFramePair(A, B, a);
  }

  applyFramePair(A, B, a) {
    const n = Math.min(this.players.length, ((A.p?.length ?? 0) / REC_STRIDE) | 0, ((B.p?.length ?? 0) / REC_STRIDE) | 0);
    this.players.forEach((p, i) => {
      if (i >= n) return;
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

  // ------------------------------------------------------------------ penalty pressure

  penComposure(p) {
    const d = p.data;
    if (p.isGK) return (d.ovr * 0.6 + d.def * 0.4) / 100;
    const { fin } = shotTraits(d);
    return (d.ovr * 0.4 + fin * 0.35 + d.sho * 0.25) / 100;
  }

  // Elite finishers (~0.9 composure) feel ~40% less pressure; poor finishers ~30% more.
  penCalm(p) {
    return lerp(1.3, 0.62, clamp((this.penComposure(p) - 0.6) / 0.32, 0, 1));
  }

  penSituation(team) {
    const opp = this.opp(team);
    if (this.state !== 'pens') {
      const diff = team.score - opp.score;
      const late = clamp((this.clock / 60 - 70) / 20, 0, 1);
      const close = Math.abs(diff) <= 1;
      const kick = 0.24 + (diff === -1 ? 0.12 : diff === 0 ? 0.08 : diff === 1 ? 0.03 : -0.06) + late * (close ? 0.26 : 0.06);
      const tag = late > 0.5 && diff === -1 ? 'TO EQUALISE' : late > 0.5 && diff === 0 ? 'LATE WINNER' : '';
      return { kick, keep: null, tag };
    }
    const P = this.pens;
    const i = team.idx;
    const after = (goal) => {
      const taken = [...P.taken];
      const scored = [...P.scored];
      taken[i]++;
      if (goal) scored[i]++;
      return this.pensWinner(taken, scored);
    };
    const missLoses = after(false) === opp.idx;
    const scoreWins = after(true) === i;
    const sudden = P.taken[i] >= 5;
    const round = Math.min(P.taken[i], 4) * 0.025;
    return {
      kick: 0.3 + round + (sudden ? 0.14 : 0) + (missLoses ? 0.24 : 0) + (scoreWins ? 0.16 : 0),
      keep: 0.24 + round + (sudden ? 0.1 : 0) + (scoreWins ? 0.24 : 0) - (missLoses ? 0.06 : 0),
      tag: missLoses ? 'MUST SCORE' : scoreWins ? 'TO WIN IT' : sudden ? 'SUDDEN DEATH' : '',
    };
  }

  beginPenStress(kicker, keeper) {
    const sit = this.penSituation(kicker.team);
    const base = clamp(sit.kick * this.penCalm(kicker), 0, 1);
    this.penStress = {
      kicker,
      keeper,
      base,
      stress: base,
      keep: sit.keep == null || !keeper ? null : clamp(sit.keep * this.penCalm(keeper), 0, 1),
      tag: sit.tag,
      t: 0,
      seed: rand() * 100,
      done: false,
      human: this.isHumanControlled(kicker),
      showKeeper: !!keeper && sit.keep != null && this.isHumanControlled(keeper),
      zone: this.penZone(base),
      aim: null,
    };
  }

  // Hesitating past `grace` seconds adds up to +0.3 stress.
  tickPenStress(dt, grace) {
    const s = this.penStress;
    if (!s || s.done) return;
    s.t += dt;
    s.human = this.isHumanControlled(s.kicker);
    s.stress = clamp(s.base + Math.min(0.3, Math.max(0, s.t - grace) * 0.1), 0, 1);
    s.zone = this.penZone(s.stress);
  }

  // Aim drift in goal-relative units: z × GOAL_HW, y × half the bar height.
  penWobble() {
    const s = this.penStress;
    if (!s) return { z: 0, y: 0 };
    const k = s.stress;
    const amp = 0.03 + k * k * 0.5;
    const t = s.t * (1 + k * 0.9) + s.seed;
    return {
      z: amp * (Math.sin(t * 1.7) * 0.65 + Math.sin(t * 4.1 + 1.3) * 0.35),
      y: amp * 0.7 * (Math.sin(t * 2.3 + 0.7) * 0.6 + Math.sin(t * 5.3) * 0.4),
    };
  }

  penZone(k) {
    const w = lerp(0.26, 0.09, k);
    return { lo: 0.68 - w, hi: 0.68 + w };
  }

  // Power outside the sweet spot: `over` skies it, `under` scuffs it.
  penMiskick(power) {
    const z = this.penZone(this.penStress?.stress ?? 0);
    return { over: Math.max(0, power - z.hi), under: Math.max(0, z.lo - power) };
  }

  penAiPower() {
    const k = this.penStress?.stress ?? 0;
    return clamp(0.68 + gauss() * 0.08 * Math.sqrt(this.diff.shotErr) * (0.6 + k), 0.25, 1);
  }

  penAimInMatch(input) {
    const s = this.penStress;
    if (!s || s.done || !s.human) {
      if (s) s.aim = null;
      return;
    }
    const inp = this.slotFrame(input, this.humanFor(s.kicker));
    const mv = inp.move ?? { x: 0, z: 0 };
    const cv = inp.curve ?? { x: 0, z: 0 };
    const side = hyp(cv.x, cv.z) > 0.2 ? clamp(cv.z, -1, 1)
      : hyp(mv.x, mv.z) > 0.2 && Math.abs(mv.z) > 0.25 ? clamp(mv.z, -1, 1) : 0;
    const wob = this.penWobble();
    s.aim = { x: HALF_L * s.kicker.team.dir, z: side * (GOAL_HW - 0.45) + wob.z * GOAL_HW, y: 1.2 + wob.y * GOAL_H * 0.5 };
  }

  pensAimPoint(aimSide, aimH) {
    const wob = this.penWobble();
    return {
      z: clamp(aimSide, -1, 1) * (GOAL_HW - 0.28) + wob.z * GOAL_HW,
      y: lerp(0.32, GOAL_H - 0.22, clamp(aimH, 0, 1)) + wob.y * GOAL_H * 0.5,
    };
  }

  // ------------------------------------------------------------------ penalties

  startPens() {
    this.state = 'pens';
    this.stateT = 0;
    this.owner = null;
    this.penStress = null;
    this.celebration = null;
    this.clearCharges();
    this.pens = {
      phase: 'intro',
      t: 0,
      next: 0,
      taken: [0, 0],
      scored: [0, 0],
      marks: [[], []],
      cursor: [1, 1],
      used: [new Set(), new Set()],
      kicker: null,
      keeper: null,
      dive: 0,
      jump: 0.45,
      charge: null,
      decided: false,
      dived: false,
      holdDive: false,
    };
    this.placePensIdle();
    this.pens.keeper = this.teams[1].gk;
    this.placePensKeeper(this.pens.keeper, true);
    this.hud.banner('PENALTY SHOOTOUT', 'Best of five · then sudden death', 2.8);
    this.hud.pensShow?.(true, this.teams);
    this.hud.pensUpdate?.(this.pens);
    this.stadium.setExcite(0.55);
  }

  placePensIdle() {
    for (const t of this.teams) {
      for (const p of t.players) {
        p.pending = null;
        p.stun = 0;
        p.slideT = 0;
        p.diving = null;
        p.diveCd = 0;
        p.vel.set(0, 0, 0);
        p.want.set(0, 0, 0);
        p.model.setPose(POSE.NONE);
        p.model.s.diveT = 0;
        p.model.s.kickT = 0;
      }
    }
    // Park outfield in the centre. Both GKs wait at the UNUSED (left) end —
    // the original bug put the home keeper on the shootout line every kick,
    // so two keepers stacked in the same net when the home side took.
    let i = 0;
    for (const p of this.players) {
      if (p.isGK) continue;
      const row = (i / 10) | 0;
      const col = i % 10;
      p.pos.set(-20 + row * 5.5, 0, -22 + col * 4.6);
      p.facing = Math.PI / 2;
      i++;
    }
    for (const t of this.teams) this.placePensKeeper(t.gk, false);
    this.ball.place(PEN_SPOT, 0);
  }

  placePensKeeper(gk, defending) {
    if (!gk) return;
    if (defending) {
      gk.pos.set(HALF_L - 0.4, 0, 0);
      gk.facing = -Math.PI / 2;
    } else {
      gk.pos.set(-HALF_L + 0.5, 0, gk.team.idx === 0 ? -6 : 6);
      gk.facing = Math.PI / 2;
    }
    gk.vel.set(0, 0, 0);
    gk.want.set(0, 0, 0);
    gk.diving = null;
  }

  nextPensTaker(team) {
    const used = this.pens.used[team.idx];
    const out = team.players.filter((p) => !p.isGK);
    if (!out.length) return team.players[0];
    if (used.size >= out.length) used.clear();
    for (let n = 0; n < out.length + 2; n++) {
      let idx = this.pens.cursor[team.idx] % out.length;
      const p = out[idx];
      this.pens.cursor[team.idx] = idx + 1;
      if (p && !used.has(p.idx)) {
        used.add(p.idx);
        return p;
      }
    }
    used.clear();
    return out[0];
  }

  pensHumanShoots(team) {
    if (this.matchMode === 'versus') return true;
    if (this.matchMode === 'coop') return team.idx === 0;
    return team.idx === 0;
  }

  pensHumanKeeps(shootTeam) {
    if (this.matchMode === 'versus') return true;
    if (this.matchMode === 'coop') return shootTeam.idx === 1;
    return shootTeam.idx === 1;
  }

  shooterSlot(team) {
    if (this.matchMode === 'versus') return this.humans[team.idx];
    return this.humans[0];
  }

  keeperSlot(shootTeam) {
    if (this.matchMode === 'versus') return this.humans[1 - shootTeam.idx];
    return this.humans[0];
  }

  pensNextKick() {
    const P = this.pens;
    const team = this.teams[P.next];
    const keepT = this.opp(team);
    const kicker = this.nextPensTaker(team);
    const keeper = keepT.gk;
    P.kicker = kicker;
    P.keeper = keeper;
    P.team = team;
    P.phase = 'ready';
    P.t = 0;
    P.dive = 0;
    P.jump = 0.45;
    P.charge = null;
    P.aiShot = false;
    P.dived = false;
    P.holdDive = false;
    P.cele = null;
    P.celePop = false;
    P.reactGoal = false;
    this.placePensIdle();
    kicker.pos.set(PEN_SPOT - 0.55, 0, 0);
    kicker.facing = Math.PI / 2;
    this.placePensKeeper(keeper, true);
    this.ball.place(PEN_SPOT, 0);
    this.setOwner(kicker, true);
    kicker.model.setPose(POSE.NONE);
    keeper.model.setPose(POSE.NONE);
    if (this.pensHumanShoots(team)) this.setControlled(kicker, this.shooterSlot(team));
    if (this.pensHumanKeeps(team)) this.setControlled(keeper, this.keeperSlot(team));
    this.beginPenStress(kicker, keeper);
    this.say(`${kicker.data.name} — ${team.short}`);
    this.hud.pensUpdate?.(P);
  }

  updatePens(dt, input) {
    const P = this.pens;
    if (!P) return;
    P.t += dt;
    this.time = (this.time ?? 0) + dt;
    this.shake = Math.max(0, this.shake - dt * 1.4);
    for (const p of this.players) {
      p.kickCd -= dt;
      p.tackleCd -= dt;
      p.diveCd -= dt;
      p.stun -= dt;
      if (p.pending) {
        p.pending.t -= dt;
        if (p.pending.t <= 0) this.releaseKick(p);
      }
      if (p.diving) {
        p.diving.t += dt;
        p.want.set(0, 0, p.diving.vz * Math.max(0, 1 - p.diving.t / 0.7));
        p.vel.z = p.want.z;
        p.vel.x *= 0.9;
        if (p.diving.t > 1.15) {
          p.diving = null;
          p.stun = 0.2;
        }
      }
    }

    if (P.phase === 'intro') {
      this.integrate(dt);
      this.updateBall(dt);
      this.anchorPensKeepers();
      if (P.t > 2.7) this.pensNextKick();
      return;
    }

    if (P.phase === 'ready') this.updatePensReady(dt, input);
    else if (P.phase === 'flight') this.updatePensFlight(dt, input);
    else if (P.phase === 'react') {
      this.updatePensReact(dt);
      if (P.t > 1.85) {
        if (this.pensWinner() != null) this.pensFinish();
        else this.pensNextKick();
      }
    }
    for (const p of this.players) p.model.update(dt, hyp(p.vel.x, p.vel.z), this.time);
  }

  slotFrame(input, human) {
    if (!human) return input.slots?.[0] ?? input;
    return input.slots?.[human.id] ?? input;
  }

  updatePensReady(dt, input) {
    const P = this.pens;
    const kicker = P.kicker;
    const keeper = P.keeper;
    const team = P.team;
    const shootH = this.pensHumanShoots(team);
    const keepH = this.pensHumanKeeps(team);
    const sInp = this.slotFrame(input, shootH ? this.shooterSlot(team) : null);
    const kInp = this.slotFrame(input, keepH ? this.keeperSlot(team) : null);
    this.tickPenStress(dt, 1.6);
    const ps = this.penStress;

    for (const p of this.players) {
      if (p !== kicker && p !== keeper) p.want.set(0, 0, 0);
    }

    const sm = sInp.move ?? { x: 0, z: 0 };
    const km = kInp.move ?? { x: 0, z: 0 };
    const scrv = sInp.curve ?? { x: 0, z: 0 };

    if (shootH) {
      const aim = hyp(scrv.x, scrv.z) > 0.15 ? scrv : sm;
      if (hyp(aim.x, aim.z) > 0.12) {
        kicker.facing = Math.atan2(0.85, clamp(aim.z, -0.85, 0.85) * 0.35);
      } else kicker.facing = Math.PI / 2;
      kicker.want.set(0, 0, 0);
      const pressed = sInp.pressed ?? new Set();
      const released = sInp.released ?? new Set();
      const down = sInp.down ?? new Set();
      const side = clamp(aim.z, -1, 1);
      const height = clamp(0.35 + Math.max(0, -aim.x) * 0.5 + (aim.x < -0.2 ? 0.15 : 0), 0.12, 0.95);
      if (ps) ps.aim = { x: HALF_L, ...this.pensAimPoint(side, height) };
      for (const a of ['shot', 'power', 'finesse', 'chip']) {
        if (pressed.has(a) && !P.charge) {
          let type = a;
          if (a === 'shot' && sInp.ctrl) type = 'finesse';
          P.charge = { key: a, type, power: 0 };
        }
      }
      if (P.charge) {
        const c = P.charge;
        c.power = Math.min(1, c.power + dt * CHARGE_RATE[c.type]);
        this.hud.power(c.power, KICK_LABEL[c.type]);
        if (released.has(c.key) || !down.has(c.key)) {
          this.pensStrike(c.type, Math.max(0.18, c.power), side, height);
        }
      } else this.hud.power(0, '');
    } else {
      kicker.want.set(0, 0, 0);
      kicker.facing = Math.PI / 2;
      if (!P.aiShot && P.t > lerp(1.35, 0.7, this.diff.technique)) {
        P.aiShot = true;
        const acc = 1 - this.diff.shotErr * 0.28;
        const side = (rand() * 2 - 1) * lerp(0.35, 0.92, acc);
        const height = lerp(0.25, 0.75, acc) + gauss() * 0.12 * this.diff.shotErr;
        const type = rand() < 0.2 ? 'power' : rand() < 0.35 ? 'finesse' : rand() < 0.15 ? 'chip' : 'shot';
        this.pensStrike(type, this.penAiPower(), side, height);
      }
    }

    if (keepH) {
      const down = kInp.down ?? new Set();
      const pressed = kInp.pressed ?? new Set();
      const aim = hyp(km.x, km.z) > 0.12 ? km : { x: 0, z: 0 };
      P.dive = Math.abs(aim.z) > 0.18 ? Math.sign(aim.z) : 0;
      P.jump = clamp(0.22 + Math.max(0, aim.x) * 0.78, 0.15, 1);
      P.holdDive = this.pensDiveHeld(down);
      if (!P.dived && !keeper.diving) {
        keeper.want.set(0, 0, clamp(aim.z, -1, 1) * 1.8);
        if (this.pensDivePressed(pressed)) this.startPensDive(keeper, P.dive, P.jump);
      }
      if (!shootH || !P.charge) {
        const ready = P.dived ? 1 : 0.18 + Math.abs(aim.z) * 0.5 + Math.max(0, aim.x) * 0.32;
        this.hud.power(ready, P.dived ? 'DIVING' : 'DIVE  J / X');
      }
    } else {
      keeper.want.set(0, 0, 0);
    }

    this.integrate(dt);
    this.updateBall(dt);
    this.anchorPensKeepers();
  }

  pensStrike(type, power, aimSide, aimH) {
    const P = this.pens;
    const p = P.kicker;
    if (!p || p.pending) return;
    P.charge = null;
    this.hud.power(0, '');
    const sho = p.data.sho / 100;
    const { lon, fin } = shotTraits(p.data);
    const skill = type === 'power' ? lon / 100 : type === 'finesse' ? fin / 100 : sho;
    const gx = HALF_L;
    const ps = this.penStress;
    const stress = ps?.stress ?? 0;
    const pt = this.pensAimPoint(aimSide, aimH);
    const { over, under } = this.penMiskick(power);
    if (ps) {
      ps.done = true;
      ps.aim = null;
    }
    let tz = pt.z;
    let ty = pt.y + over * 9 - under * 1.5;
    let err = (0.03 + (1 - skill) ** 1.35 * 0.22) * (0.45 + power) * (1 + stress * 0.9);
    if (p.team.ai) err *= this.diff.shotErr;
    else err *= Math.max(0.35, 1 - this.diff.assist * 0.4);
    if (type === 'power') err *= 1.05;
    if (type === 'finesse') err *= 0.85;
    tz += gauss() * err * GOAL_HW;
    ty = clamp(ty + gauss() * err * 1.6, 0.15, GOAL_H + 1.8);
    const from = p.pos;
    const T = (type === 'chip' ? 0.95 : type === 'power' ? 0.42 : 0.55) * (1 + under * 1.8);
    let vx = (gx - from.x) / T;
    let vz = (tz - from.z) / T;
    let vy = (ty - BALL_R) / T + 0.5 * 9.81 * T;
    if (type === 'power') {
      vx *= 1.12;
      vy *= 0.9;
    }
    if (type === 'chip') vy += 2.4;
    if (type === 'finesse') vz += aimSide * 1.8;
    const plan = { type, vx, vy, vz, spin: type === 'finesse' ? -aimSide * 0.6 : 0, dist: 11, receiver: null };
    p.model.kick({ shot: KICK.SHOT, power: KICK.POWER, finesse: KICK.SHOT, chip: KICK.CHIP }[type] ?? KICK.SHOT);
    p.pending = { t: kickContactDelay(p.model.s.kickKind), plan };
    p.facing = Math.atan2(vx, vz);
    P.phase = 'flight';
    P.t = 0;
    this.commitPensDive(tz, ty);
  }

  pensDivePressed(pressed) {
    return pressed.has('dive') || pressed.has('slide') || pressed.has('tackle');
  }

  pensDiveHeld(down) {
    return down.has('dive') || down.has('slide') || down.has('tackle');
  }

  lockPensKeeper(gk) {
    if (!gk) return;
    gk.pos.x = HALF_L - 0.4;
    gk.pos.z = clamp(gk.pos.z, -GOAL_HW + 0.12, GOAL_HW - 0.12);
    if (!gk.diving) gk.facing = -Math.PI / 2;
  }

  anchorPensKeepers() {
    const P = this.pens;
    if (!P) return;
    for (const t of this.teams) {
      const gk = t.gk;
      if (!gk) continue;
      if (gk === P.keeper) this.lockPensKeeper(gk);
      else if (gk !== P.kicker) this.placePensKeeper(gk, false);
    }
  }

  startPensDive(gk, side, jump) {
    const P = this.pens;
    if (!gk || !P || gk.diving) return;
    const reach = (gk.data.def / 100) * lerp(0.7, 1.15, this.diff.gkSave);
    const hop = jump ?? 0.45;
    gk.diving = { t: 0, vz: side * (4.8 + reach * 3.2), jump: hop };
    gk.diveCd = 2;
    gk.model.dive(side, hop);
    P.gkSide = side;
    P.gkJump = hop;
    P.dived = true;
    rumble(0.4, 90, 0.35, this.padFor(gk));
  }

  commitPensDive(ballZ, ballY) {
    const P = this.pens;
    const gk = P.keeper;
    if (!gk) return;
    const keepH = this.pensHumanKeeps(P.team);
    if (gk.diving || P.dived) return;
    let side = P.dive;
    let jump = P.jump;
    if (keepH) {
      if (!P.holdDive) {
        P.gkSide = 0;
        P.gkJump = 0.2;
        return;
      }
    } else {
      const read = this.diff.gkSave * (0.45 + gk.data.def / 200) * (1 - (this.penStress?.keep ?? 0) * 0.2);
      if (rand() < read) {
        side = Math.abs(ballZ) < 0.45 ? 0 : Math.sign(ballZ);
        jump = clamp(ballY / GOAL_H, 0.2, 1);
      } else {
        side = pick([-1, 0, 1]);
        jump = 0.3 + rand() * 0.6;
      }
    }
    this.startPensDive(gk, side, jump);
  }

  updatePensFlight(dt, input) {
    const P = this.pens;
    const gk = P.keeper;
    if (gk && this.pensHumanKeeps(P.team) && !P.dived) {
      const kInp = this.slotFrame(input, this.keeperSlot(P.team));
      const km = kInp.move ?? { x: 0, z: 0 };
      const aim = hyp(km.x, km.z) > 0.12 ? km : { x: 0, z: 0 };
      if (hyp(aim.x, aim.z) > 0.12) {
        P.dive = Math.abs(aim.z) > 0.18 ? Math.sign(aim.z) : 0;
        P.jump = clamp(0.22 + Math.max(0, aim.x) * 0.78, 0.15, 1);
      }
      if (this.pensDivePressed(kInp.pressed ?? new Set())) this.startPensDive(gk, P.dive, P.jump);
    }
    this.integrate(dt);
    this.updateBall(dt);
    this.anchorPensKeepers();
    const b = this.ball.pos;
    if (gk && !this.owner) {
      const d = hyp(b.x - gk.pos.x, b.z - gk.pos.z);
      const hands = 0.95 + (P.gkJump ?? 0.4) * 0.7;
      if (d < 1.15 && b.y < 1.1 + hands && b.x > HALF_L - 3.2) {
        const skill = (gk.data.def / 100) * this.diff.gkSave;
        const linedUp = Math.abs(b.z - gk.pos.z) < lerp(1.6, 0.7, 1 - skill);
        if (linedUp && rand() < clamp(0.22 + skill * 0.7, 0.15, 0.92) * (1 - (this.penStress?.keep ?? 0) * 0.15)) {
          this.pensResolve(false, 'save');
          return;
        }
      }
    }
    if (b.x > HALF_L + BALL_R) {
      const on = Math.abs(b.z) < GOAL_HW && b.y < GOAL_H;
      this.pensResolve(on, on ? 'goal' : (b.y >= GOAL_H ? 'over' : 'wide'));
    } else if (P.t > 3.2) this.pensResolve(false, 'wide');
  }

  pensResolve(goal, why) {
    const P = this.pens;
    if (P.phase !== 'flight') return;
    const team = P.team;
    P.taken[team.idx]++;
    P.marks[team.idx].push(!!goal);
    P.reactGoal = !!goal;
    P.reactWhy = why;
    P.celePop = false;
    if (P.kicker) {
      P.kicker.pending = null;
      P.kicker.model.s.kickT = 0;
      P.kicker.want.set(0, 0, 0);
    }
    if (goal) {
      P.scored[team.idx]++;
      this.stadium.netHit(1, this.ball.pos.z, this.ball.pos.y, 0.7);
      this.sfx.swell(0.7, 2.2);
      this.shake = 0.55;
      rumble(0.55, 180, 0.6, this.padFor(P.kicker));
      P.cele = shortCelebrationFor(P.kicker.data);
      P.kicker.model.setPose(P.cele.pose);
      this.say(pick(['GOAL!', 'In the back of the net!', `${P.kicker.data.back} scores!`]));
    } else {
      P.cele = null;
      P.kicker.model.setPose(POSE.HANDS_HEAD);
      if (why === 'save') {
        this.owner = P.keeper;
        this.say(pick([`${P.keeper.data.back} saves!`, 'What a stop!', 'Denied!']));
        rumble(0.4, 120, 0.35, this.padFor(P.keeper));
      } else {
        this.say(why === 'over' ? 'Over the bar!' : 'Wide!');
      }
    }
    this.hud.setScore(this.teams[0].score, this.teams[1].score);
    this.hud.power(0, '');
    this.hud.pensUpdate?.(P);
    P.phase = 'react';
    P.t = 0;
    P.next = 1 - P.next;
    this.owner = goal ? null : this.owner;
  }

  updatePensReact(dt) {
    const P = this.pens;
    const kicker = P.kicker;
    const keeper = P.keeper;
    for (const p of this.players) {
      if (p === keeper && p.diving) continue;
      p.want.set(0, 0, 0);
      if (p !== keeper) p.vel.multiplyScalar(Math.exp(-dt * 8));
    }
    this.integrate(dt);
    this.updateBall(dt);
    this.anchorPensKeepers();
    if (kicker) {
      kicker.vel.set(0, 0, 0);
      if (P.reactGoal && P.cele) {
        kicker.model.setPose(P.cele.pose);
        const face = 0.45;
        kicker.facing += clamp(wrap(face - kicker.facing), -5 * dt, 5 * dt);
        if (!P.celePop && P.t >= (P.cele.popupAt ?? 0.2)) {
          P.celePop = true;
          if (P.cele.popup) this.say(P.cele.popup);
        }
      } else {
        kicker.model.setPose(POSE.HANDS_HEAD);
        kicker.facing = Math.PI / 2;
      }
    }
    if (keeper && !keeper.diving) {
      keeper.pos.x = HALF_L - 0.4;
      keeper.pos.z = clamp(keeper.pos.z, -GOAL_HW + 0.15, GOAL_HW - 0.15);
      keeper.facing = -Math.PI / 2;
      if (P.reactGoal) keeper.model.setPose(POSE.HANDS_HEAD);
      else if (P.reactWhy === 'save') keeper.model.setPose(POSE.ARMS_UP);
      else keeper.model.setPose(POSE.CLAP);
    }
  }

  pensWinner(taken = this.pens.taken, scored = this.pens.scored) {
    const [ta, tb] = taken;
    const [sa, sb] = scored;
    if (ta >= 5 && tb >= 5) {
      if (ta === tb && sa !== sb) return sa > sb ? 0 : 1;
      return null;
    }
    if (sa > sb + (5 - tb)) return 0;
    if (sb > sa + (5 - ta)) return 1;
    return null;
  }

  pensFinish() {
    const w = this.pensWinner();
    const winner = this.teams[w];
    this.hud.banner(`${winner.short} WIN`, `${this.pens.scored[0]} - ${this.pens.scored[1]} on penalties`, 3);
    this.say(`${winner.name} win the shootout!`);
    this.endMatch();
  }

  debugPens() {
    if (!this.teams.length) return;
    this.teams[0].score = this.teams[1].score;
    this.clock = 5400;
    this.pens = null;
    this.fullTime();
  }

  debugThrow() {
    if (this.state !== 'play' && this.state !== 'setpiece' && this.state !== 'kickoff') return;
    const team = this.teams[0];
    this.startSetPiece('throw', team, 0, HALF_W);
  }

  humanHasBall() {
    return !!(this.owner && this.isHumanControlled(this.owner));
  }

  humanHasBallAt(i) {
    const h = this.humans?.[i];
    return !!(h && this.owner === h.controlled);
  }
}
