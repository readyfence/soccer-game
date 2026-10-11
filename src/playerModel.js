import * as THREE from 'three';
import { backTexture, shirtTexture } from './textures.js';

const geo = {
  torso: new THREE.CapsuleGeometry(0.17, 0.3, 6, 16),
  shorts: new THREE.CylinderGeometry(0.175, 0.2, 0.26, 16),
  neck: new THREE.CylinderGeometry(0.055, 0.06, 0.1, 10),
  head: new THREE.SphereGeometry(0.115, 20, 16),
  hair: new THREE.SphereGeometry(0.123, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
  upperArm: new THREE.CapsuleGeometry(0.05, 0.2, 4, 10),
  forearm: new THREE.CapsuleGeometry(0.042, 0.2, 4, 10),
  hand: new THREE.SphereGeometry(0.05, 10, 8),
  thigh: new THREE.CapsuleGeometry(0.075, 0.28, 4, 12),
  shin: new THREE.CapsuleGeometry(0.058, 0.3, 4, 12),
  boot: new THREE.BoxGeometry(0.1, 0.08, 0.25),
  back: new THREE.PlaneGeometry(0.3, 0.3),
  collar: new THREE.TorusGeometry(0.07, 0.018, 6, 16),
};

const std = (color, rough = 0.65) => new THREE.MeshStandardMaterial({ color, roughness: rough });
const skinMats = [0xf1c7a5, 0xd9a07a, 0xb07a52, 0x7a4a2e, 0x5a3520].map((c) => std(c, 0.55));
const hairMats = [0x1a1410, 0x3b2616, 0x6b4a2a, 0xc9a45c, 0x0a0a0a].map((c) => std(c, 0.8));
const bootMats = [0x111111, 0xffffff, 0xff3d00, 0x00e5ff, 0xffea00].map((c) => std(c, 0.35));

export const POSE = {
  NONE: 0, ARMS_UP: 1, AIRPLANE: 2, KNEE_SLIDE: 3, HANDS_HEAD: 4, CROUCH: 5, HOLD: 6, CLAP: 7,
  SIUU: 8, SKY_POINT: 9, ARMS_CROSSED: 10, ZEN: 11, HEY_JUDE: 12, DANCE: 13, PRAYER: 14,
  ICE_SLIDE: 15, COLD: 16, MASK: 17, KISS: 18, THROW: 19,
};
export const KICK = { PASS: 0, SHOT: 1, POWER: 2, CHIP: 3, CLEAR: 4, THROW: 5, BICYCLE: 6 };
// [duration, backswing, followThrough, contact fraction]
const KICK_ANIM = [
  [0.3, 0.45, 1.1, 0.35],
  [0.38, 0.75, 2.0, 0.35],
  [0.55, 1.2, 2.4, 0.45],
  [0.34, 0.55, 1.0, 0.4],
  [0.48, 1.1, 2.6, 0.4],
  [0.62, 0.9, 1.5, 0.52],
  [0.56, 1.3, 2.2, 0.40],
];
export const kickContactDelay = (kind) => {
  const a = KICK_ANIM[kind] ?? KICK_ANIM[1];
  return a[0] * a[3];
};

// Serializable animation state, used by live play and replays.
const FIELDS = ['phase', 'amp', 'speed', 'kickT', 'kickKind', 'tackleT', 'diveT', 'diveDir', 'fallT',
  'stumbleT', 'pose', 'poseT', 'headYaw', 'headPitch', 'standT'];
export const MODEL_STATE_SIZE = FIELDS.length;

export function kitMaterials(renderer, kit, gkKit, gk) {
  if (gk) {
    return {
      shirt: std(gkKit.shirt, 0.55), sleeves: std(gkKit.shirt, 0.55), shorts: std(gkKit.shorts, 0.6),
      socks: std(gkKit.socks, 0.7), trim: std(0x111111, 0.5), glove: std(0xf5f5f5, 0.5), number: '#111111',
    };
  }
  return {
    shirt: new THREE.MeshStandardMaterial({ map: shirtTexture(renderer, kit), roughness: 0.55 }),
    sleeves: std(kit.sleeves ?? kit.shirt, 0.55),
    shorts: std(kit.shorts, 0.6),
    socks: std(kit.socks, 0.7),
    trim: std(kit.trim, 0.5),
    glove: std(0xf5f5f5, 0.5),
    number: kit.number,
  };
}

function limb(parent, g, mat, y) {
  const m = new THREE.Mesh(g, mat);
  m.position.y = y;
  m.castShadow = true;
  parent.add(m);
  return m;
}

export class PlayerModel {
  constructor(renderer, mats, data, gk) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const skin = skinMats[(Math.random() * skinMats.length) | 0];
    const hair = hairMats[(Math.random() * hairMats.length) | 0];
    const boots = bootMats[(Math.random() * bootMats.length) | 0];

    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 0.92;
    this.body.add(this.pelvis);

    limb(this.pelvis, geo.shorts, mats.shorts, -0.02);
    const torso = limb(this.pelvis, geo.torso, mats.shirt, 0.34);
    torso.scale.set(1.18, 1, 0.72);
    const collar = new THREE.Mesh(geo.collar, mats.trim);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.56;
    this.pelvis.add(collar);
    limb(this.pelvis, geo.neck, skin, 0.6);
    this.head = new THREE.Group();
    this.head.position.y = 0.73;
    this.pelvis.add(this.head);
    limb(this.head, geo.head, skin, 0);
    const h = limb(this.head, geo.hair, hair, 0.012);
    h.rotation.x = -0.25;

    const backMat = new THREE.MeshBasicMaterial({
      map: backTexture(renderer, data.back, data.num, mats.number), transparent: true, depthWrite: false,
    });
    const back = new THREE.Mesh(geo.back, backMat);
    back.position.set(0, 0.36, -0.13);
    back.rotation.y = Math.PI;
    this.pelvis.add(back);

    this.shoulders = [-1, 1].map((side) => {
      const s = new THREE.Group();
      s.position.set(side * 0.245, 0.5, 0);
      s.userData.side = side;
      this.pelvis.add(s);
      limb(s, geo.upperArm, mats.sleeves, -0.13);
      const elbow = new THREE.Group();
      elbow.position.y = -0.27;
      s.add(elbow);
      limb(elbow, geo.forearm, gk ? mats.shirt : skin, -0.12);
      limb(elbow, geo.hand, gk ? mats.glove : skin, -0.26);
      s.userData.elbow = elbow;
      return s;
    });

    this.hips = [-1, 1].map((side) => {
      const hp = new THREE.Group();
      hp.rotation.order = 'YXZ';
      hp.position.set(side * 0.1, 0.92, 0);
      this.body.add(hp);
      limb(hp, geo.thigh, skin, -0.2);
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hp.add(knee);
      limb(knee, geo.shin, mats.socks, -0.2);
      const b = limb(knee, geo.boot, boots, -0.44);
      b.position.z = 0.05;
      hp.userData.knee = knee;
      return hp;
    });

    this.s = {};
    for (const f of FIELDS) this.s[f] = 0;
    this.s.phase = Math.random() * 10;
  }

  kick(kind) {
    this.s.kickT = 0.001;
    this.s.kickKind = kind;
  }

  dive(dir) {
    this.s.diveT = 0.001;
    this.s.diveDir = dir;
  }

  slide() {
    this.s.tackleT = 0.001;
  }

  fall() {
    this.s.fallT = 0.001;
  }

  stumble() {
    this.s.stumbleT = 0.001;
  }

  setPose(pose) {
    if (this.s.pose !== pose) {
      this.s.pose = pose;
      this.s.poseT = 0;
    }
  }

  get busy() {
    return this.s.fallT > 0 || this.s.tackleT > 0 || this.s.diveT > 0;
  }

  writeState(arr, o) {
    for (let i = 0; i < FIELDS.length; i++) arr[o + i] = this.s[FIELDS[i]];
  }

  readState(arr, o) {
    for (let i = 0; i < FIELDS.length; i++) this.s[FIELDS[i]] = arr[o + i];
  }

  update(dt, speed, time) {
    const s = this.s;
    s.speed = speed;
    const k = Math.min(speed / 8, 1);
    s.amp += ((speed > 0.3 ? 0.2 + 0.7 * k : 0) - s.amp) * Math.min(1, dt * 8);
    s.phase += dt * (5 + speed * 1.25);
    s.poseT += dt;
    const tick = (name, dur) => {
      if (s[name] > 0) {
        s[name] += dt;
        if (s[name] >= dur) s[name] = 0;
      }
    };
    if (s.kickT > 0) tick('kickT', (KICK_ANIM[s.kickKind] ?? KICK_ANIM[1])[0]);
    tick('tackleT', 0.75);
    tick('diveT', 1.3);
    tick('fallT', 1.7);
    tick('stumbleT', 0.6);
    this.applyPose(time);
  }

  applyPose(time) {
    const s = this.s;
    const k = Math.min(s.speed / 8, 1);
    const sw = Math.sin(s.phase) * s.amp;
    const [L, R] = this.hips;
    const [SL, SR] = this.shoulders;
    const body = this.body;

    L.rotation.set(-sw, 0, 0);
    R.rotation.set(sw, 0, 0);
    L.userData.knee.rotation.x = Math.max(0, Math.sin(s.phase - 1.4)) * 1.4 * s.amp + 0.05;
    R.userData.knee.rotation.x = Math.max(0, Math.sin(s.phase + Math.PI - 1.4)) * 1.4 * s.amp + 0.05;
    SL.rotation.set(sw * 0.9, 0, -0.12);
    SR.rotation.set(-sw * 0.9, 0, 0.12);
    SL.userData.elbow.rotation.set(-0.4 - s.amp * 0.8, 0, 0);
    SR.userData.elbow.rotation.set(-0.4 - s.amp * 0.8, 0, 0);
    body.position.set(0, Math.abs(Math.sin(s.phase)) * 0.05 * s.amp + Math.sin(time * 2 + s.phase) * 0.004, 0);
    body.rotation.set(0.2 * k, 0, 0);
    this.pelvis.rotation.set(0, 0, 0);
    this.head.rotation.set(s.headPitch, s.headYaw, 0, 'YXZ');

    const ease = Math.min(1, s.poseT * 3);
    const t = s.poseT;
    const crossArms = () => {
      for (const sh of this.shoulders) {
        const side = sh.userData.side;
        sh.rotation.set(-0.55 * ease, 0, side * 0.1);
        sh.userData.elbow.rotation.set(-0.2 * ease, 0, -side * 1.55 * ease);
      }
    };
    const kneel = (e) => {
      body.position.y = -0.45 * e;
      body.rotation.x = 0;
      L.rotation.x = R.rotation.x = -0.1 * e;
      L.userData.knee.rotation.x = R.userData.knee.rotation.x = 1.6 * e;
    };
    switch (s.pose) {
      case POSE.ARMS_UP:
        SL.rotation.set(-2.9 + Math.sin(time * 8) * 0.15, 0, -0.4);
        SR.rotation.set(-2.9 + Math.sin(time * 8 + 1) * 0.15, 0, 0.4);
        SL.userData.elbow.rotation.x = SR.userData.elbow.rotation.x = -0.2;
        body.position.y += Math.max(0, Math.sin(time * 7 + s.phase)) * 0.28;
        break;
      case POSE.AIRPLANE:
        SL.rotation.set(0, 0, -1.45 * ease);
        SR.rotation.set(0, 0, 1.45 * ease);
        SL.userData.elbow.rotation.x = SR.userData.elbow.rotation.x = -0.1;
        body.rotation.z = Math.sin(time * 3) * 0.25 * ease;
        break;
      case POSE.KNEE_SLIDE:
        body.position.y = -0.45 * ease;
        body.rotation.set(-0.45 * ease, 0, 0);
        L.rotation.x = R.rotation.x = -0.15;
        L.userData.knee.rotation.x = R.userData.knee.rotation.x = 1.6 * ease;
        SL.rotation.set(-0.3, 0, -2.3 * ease);
        SR.rotation.set(-0.3, 0, 2.3 * ease);
        SL.userData.elbow.rotation.x = SR.userData.elbow.rotation.x = -0.3;
        this.head.rotation.x = -0.5 * ease;
        break;
      case POSE.HANDS_HEAD:
        SL.rotation.set(-0.5, 0, -2.5 * ease);
        SR.rotation.set(-0.5, 0, 2.5 * ease);
        SL.userData.elbow.rotation.set(0, 0, -1.9 * ease);
        SR.userData.elbow.rotation.set(0, 0, 1.9 * ease);
        this.head.rotation.x = 0.45 * ease;
        break;
      case POSE.CROUCH:
        body.position.y = -0.22 * ease;
        body.rotation.x = 0.75 * ease;
        L.rotation.x = R.rotation.x = -0.75 * ease;
        L.userData.knee.rotation.x = R.userData.knee.rotation.x = 1.1 * ease;
        SL.rotation.set(-0.9 * ease, 0, -0.1);
        SR.rotation.set(-0.9 * ease, 0, 0.1);
        SL.userData.elbow.rotation.x = SR.userData.elbow.rotation.x = -0.2;
        this.head.rotation.x = 0.5 * ease;
        break;
      case POSE.HOLD:
        SL.rotation.set(-1.1, 0, 0.25);
        SR.rotation.set(-1.1, 0, -0.25);
        SL.userData.elbow.rotation.x = SR.userData.elbow.rotation.x = -0.8;
        break;
      case POSE.CLAP: {
        const c = Math.sin(time * 14) * 0.25;
        SL.rotation.set(-1.3, 0, 0.35 + c);
        SR.rotation.set(-1.3, 0, -0.35 - c);
        SL.userData.elbow.rotation.x = SR.userData.elbow.rotation.x = -0.6;
        break;
      }
      case POSE.SIUU: {
        // crouch, leap with a half spin, land legs apart with arms thrust down and out
        body.rotation.set(0, Math.PI, 0);
        if (t < 0.3) {
          const e = t / 0.3;
          body.position.y = -0.15 * e;
          L.rotation.x = R.rotation.x = -0.3 * e;
          L.userData.knee.rotation.x = R.userData.knee.rotation.x = 0.6 * e;
          SL.rotation.set(0.5 * e, 0, -0.2);
          SR.rotation.set(0.5 * e, 0, 0.2);
        } else if (t < 0.95) {
          const e = (t - 0.3) / 0.65;
          body.position.y = Math.sin(e * Math.PI) * 0.75;
          body.rotation.y = Math.PI + Math.PI * e * e * (3 - 2 * e);
          L.userData.knee.rotation.x = R.userData.knee.rotation.x = 0.5;
          SL.rotation.set(-2.6, 0, -0.3);
          SR.rotation.set(-2.6, 0, 0.3);
        } else {
          const e = Math.min(1, (t - 0.95) * 6);
          body.rotation.y = 0;
          body.position.y = -0.12 * e;
          body.rotation.x = -0.15 * e;
          L.rotation.set(-0.1, 0, -0.38 * e);
          R.rotation.set(-0.1, 0, 0.38 * e);
          L.userData.knee.rotation.x = R.userData.knee.rotation.x = 0.3 * e;
          SL.rotation.set(0.35 * e, 0, -0.75 * e);
          SR.rotation.set(0.35 * e, 0, 0.75 * e);
          SL.userData.elbow.rotation.x = SR.userData.elbow.rotation.x = 0;
          this.head.rotation.x = -0.35 * e;
        }
        break;
      }
      case POSE.SKY_POINT: {
        const e = ease;
        SL.rotation.set(-2.85 * e, 0, -0.2);
        SR.rotation.set(-2.85 * e, 0, 0.2);
        SL.userData.elbow.rotation.x = SR.userData.elbow.rotation.x = -0.05;
        this.head.rotation.x = -0.55 * e;
        body.rotation.x = -0.08 * e;
        break;
      }
      case POSE.ARMS_CROSSED:
        crossArms();
        this.head.rotation.set(0.12 * ease, 0.25 * ease, 0);
        body.rotation.x = -0.05;
        break;
      case POSE.ZEN: {
        const e = ease;
        body.position.y = -0.74 * e;
        body.rotation.x = 0;
        for (const hp of this.hips) {
          const side = hp.userData.side ?? (hp === L ? -1 : 1);
          hp.rotation.set(-1.5 * e, side * 0.85 * e, 0);
          hp.userData.knee.rotation.x = 2.5 * e;
        }
        SL.rotation.set(-0.7 * e, 0, -0.45 * e);
        SR.rotation.set(-0.7 * e, 0, 0.45 * e);
        SL.userData.elbow.rotation.x = SR.userData.elbow.rotation.x = -0.35;
        this.head.rotation.set(0.05, 0, 0);
        break;
      }
      case POSE.HEY_JUDE: {
        const e = ease;
        SL.rotation.set(-0.25 * e, 0, -1.4 * e);
        SR.rotation.set(-0.25 * e, 0, 1.4 * e);
        SL.userData.elbow.rotation.x = SR.userData.elbow.rotation.x = -0.1;
        body.rotation.x = -0.22 * e;
        this.head.rotation.x = -0.35 * e;
        break;
      }
      case POSE.DANCE: {
        const b = Math.sin(t * 9);
        body.rotation.set(0, Math.sin(t * 4.5) * 0.45, b * 0.08);
        body.position.y = -0.08 + Math.abs(b) * 0.06;
        L.rotation.x = -Math.max(0, b) * 0.5;
        R.rotation.x = -Math.max(0, -b) * 0.5;
        L.userData.knee.rotation.x = 0.3 + Math.max(0, b) * 0.9;
        R.userData.knee.rotation.x = 0.3 + Math.max(0, -b) * 0.9;
        SL.rotation.set(-1.0 + b * 0.6, 0, -0.5);
        SR.rotation.set(-1.0 - b * 0.6, 0, 0.5);
        SL.userData.elbow.rotation.x = SR.userData.elbow.rotation.x = -1.4;
        break;
      }
      case POSE.PRAYER: {
        kneel(Math.min(1, t * 3));
        const bow = Math.max(0, Math.min(1, (t - 0.6) * 2.5)) * (0.75 + 0.25 * Math.cos(Math.max(0, t - 1.2) * 1.5));
        this.pelvis.rotation.x = 1.35 * bow;
        SL.rotation.set(-1.5 * bow, 0, -0.25);
        SR.rotation.set(-1.5 * bow, 0, 0.25);
        SL.userData.elbow.rotation.x = SR.userData.elbow.rotation.x = -0.3 * bow;
        this.head.rotation.x = 0.3 * bow;
        break;
      }
      case POSE.ICE_SLIDE:
        kneel(ease);
        body.rotation.x = -0.25 * ease;
        crossArms();
        this.head.rotation.set(-0.1, 0, 0);
        break;
      case POSE.COLD: {
        crossArms();
        const shiver = Math.sin(t * 45) * 0.03;
        body.rotation.z = shiver;
        body.position.y = -0.04;
        SL.rotation.x += shiver * 4;
        SR.rotation.x -= shiver * 4;
        this.head.rotation.x = 0.1;
        break;
      }
      case POSE.MASK: {
        const e = ease;
        SL.rotation.set(-1.95 * e, 0, 0.35 * e);
        SR.rotation.set(-1.95 * e, 0, -0.35 * e);
        SL.userData.elbow.rotation.x = SR.userData.elbow.rotation.x = -1.35 * e;
        body.rotation.x = -0.1 * e;
        break;
      }
      case POSE.KISS: {
        const e = ease;
        SR.rotation.set(-1.7 * e, 0, -0.45 * e);
        SR.userData.elbow.rotation.x = -2.1 * e;
        SL.rotation.set(-2.8 * e, 0, -0.25);
        SL.userData.elbow.rotation.x = 0;
        this.head.rotation.x = -0.2 * e;
        break;
      }
      case POSE.THROW:
        SL.rotation.set(-2.75, 0, -0.42);
        SR.rotation.set(-2.75, 0, 0.42);
        SL.userData.elbow.rotation.x = SR.userData.elbow.rotation.x = -1.65;
        body.rotation.x = -0.22;
        this.head.rotation.x = -0.15;
        break;
      default:
        break;
    }

    if (s.kickT > 0 && s.kickKind === KICK.BICYCLE) {
      const [dur, , , contact] = KICK_ANIM[KICK.BICYCLE];
      const t = Math.min(1, s.kickT / dur);
      const wind = t < contact ? t / contact : 1;
      const follow = t < contact ? 0 : (t - contact) / (1 - contact);
      const e = t < contact ? wind : Math.max(0.2, 1 - follow * 0.75);
      body.rotation.x = 1.28 * e;
      body.position.y = 0.38 * e;
      R.rotation.x = -0.35 - 2.35 * (t < contact ? wind : 1 - follow * 0.45);
      R.userData.knee.rotation.x = t < contact ? 0.15 * wind : 0.7 * (1 - follow);
      L.rotation.x = 0.55 * e;
      L.userData.knee.rotation.x = 1.15 * e;
      SL.rotation.set(-0.25 - 0.35 * e, 0, -1.3 * e);
      SR.rotation.set(-1.55 * e, 0, 0.85 * e);
      SL.userData.elbow.rotation.x = -0.35;
      SR.userData.elbow.rotation.x = -0.55;
      this.head.rotation.x = 0.32 * e;
    } else if (s.kickT > 0 && s.kickKind === KICK.THROW) {
      const [dur, , , contact] = KICK_ANIM[KICK.THROW];
      const t = Math.min(1, s.kickT / dur);
      const wind = t < contact ? t / contact : 1;
      const follow = t < contact ? 0 : (t - contact) / (1 - contact);
      const armX = -2.85 * (1 - follow * 0.85) + 0.15 * follow;
      const z = 0.38 * (1 - follow * 0.5);
      SL.rotation.set(armX, 0, -z);
      SR.rotation.set(armX, 0, z);
      const el = -1.7 * (1 - follow) - 0.15;
      SL.userData.elbow.rotation.x = SR.userData.elbow.rotation.x = el;
      body.rotation.x = -0.28 * (1 - follow) + 0.55 * follow;
      this.head.rotation.x = -0.2 * (1 - follow) + 0.25 * follow;
    } else if (s.kickT > 0) {
      const [dur, backA, fwdA, contact] = KICK_ANIM[s.kickKind];
      const t = s.kickT / dur;
      const back = t < contact ? t / contact : 0;
      const swing = t < contact
        ? backA * back
        : backA - (backA + fwdA * 0.6) * Math.sin(((t - contact) / (1 - contact)) * Math.PI * 0.6);
      R.rotation.x = swing;
      R.userData.knee.rotation.x = t < contact ? 1.4 * back : 1.4 * Math.max(0, 1 - (t - contact) * 3) * 0.3;
      if (s.kickKind === KICK.PASS) R.rotation.y = -0.6;
      if (s.kickKind === KICK.CHIP) R.userData.knee.rotation.x += 0.4;
      SL.rotation.set(-0.5 * Math.sin(t * Math.PI), 0, -0.3 - 0.6 * Math.sin(t * Math.PI));
      SR.rotation.z = 0.2 + 0.4 * Math.sin(t * Math.PI);
      body.rotation.x = (s.kickKind === KICK.POWER || s.kickKind === KICK.CLEAR ? -0.25 : -0.1) * Math.sin(t * Math.PI);
    }

    if (s.tackleT > 0) {
      const t = s.tackleT / 0.75;
      const e = t < 0.7 ? Math.min(1, t * 6) : 1 - (t - 0.7) / 0.3;
      body.rotation.x = -1.2 * e;
      body.position.y = -0.62 * e;
      R.rotation.x = -1.45 * e;
      R.userData.knee.rotation.x = 0.1;
      L.rotation.x = -0.6 * e;
      L.userData.knee.rotation.x = 1.3 * e;
      SL.rotation.set(-0.3, 0, -1.2 * e);
      SR.rotation.set(0.6 * e, 0, 0.5 * e);
    }

    if (s.stumbleT > 0) {
      const t = s.stumbleT / 0.6;
      const e = Math.sin(t * Math.PI);
      body.rotation.x = 0.55 * e;
      SL.rotation.set(-1.4 * e, 0, -0.8 * e);
      SR.rotation.set(-0.8 * e, 0, 1.1 * e);
    }

    if (s.fallT > 0) {
      const t = s.fallT / 1.7;
      const e = t < 0.2 ? t / 0.2 : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      const ee = e * e * (3 - 2 * e);
      body.rotation.x = 1.45 * ee;
      body.position.y = 0.12 * ee;
      L.rotation.x = 0.3 * ee;
      R.rotation.x = 0.6 * ee;
      SL.rotation.set(-2.2 * ee, 0, -0.4);
      SR.rotation.set(-2.2 * ee, 0, 0.4);
    }

    if (s.diveT > 0) {
      const t = s.diveT / 1.3;
      const e = Math.min(1, t * 5) * (t > 0.6 ? Math.max(0, 1 - (t - 0.6) / 0.4) : 1);
      body.rotation.z = -s.diveDir * 1.35 * e;
      body.position.y += Math.sin(Math.min(1, t * 2.4) * Math.PI) * 0.55 * e;
      SL.rotation.set(0, 0, -2.8 * e);
      SR.rotation.set(0, 0, 2.8 * e);
      L.rotation.z = -0.3 * e;
      R.rotation.z = 0.3 * e;
    }
  }
}
