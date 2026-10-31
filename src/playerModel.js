import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  shirtTexture, sleeveTexture, sockTexture, contactShadowTexture, hairTexture, inkFor,
} from './textures.js';
import { appearanceFor, AVG_HEIGHT } from './appearance.js';

// Profiles are [radius, y] pairs listed top to bottom. The seam sits at the back (u = 0), the front at u = 0.5,
// and v follows arc length from the bottom so textures don't stretch.
function lathe(profile, segs = 16) {
  const pts = profile.slice().reverse().map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, segs, Math.PI, Math.PI * 2);
  const cum = [0];
  for (let j = 1; j < pts.length; j++) cum.push(cum[j - 1] + pts[j].distanceTo(pts[j - 1]));
  const total = cum[cum.length - 1];
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, cum[i % pts.length] / total);
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
function part(geo, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0], color = null) {
  const g = geo.clone();
  g.applyMatrix4(_m.compose(new THREE.Vector3(...p), _q.setFromEuler(_e.set(...r)), new THREE.Vector3(...s)));
  if (color !== null) {
    const c = new THREE.Color(color);
    const arr = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  return g;
}

const ball = new THREE.SphereGeometry(1, 18, 12);
const lowBall = new THREE.SphereGeometry(1, 10, 8);
const box = new THREE.BoxGeometry(1, 1, 1);
// Cranium centre and radii in head space; hair and features hang off these.
const CR = [0, 0.02, 0];
const CS = [0.096, 0.112, 0.108];
const crSc = (k) => CS.map((v) => v * k);

const geo = {
  torso: part(lathe([
    [0.001, 0.612], [0.055, 0.606], [0.1, 0.592], [0.155, 0.568], [0.188, 0.535], [0.196, 0.49], [0.19, 0.42],
    [0.18, 0.35], [0.163, 0.27], [0.15, 0.19], [0.15, 0.11], [0.158, 0.03], [0.17, -0.045], [0.15, -0.04],
  ], 24), [0, 0, 0], [1.16, 1, 0.68]),
  shorts: part(lathe([
    [0.001, 0.09], [0.13, 0.085], [0.138, 0.04], [0.145, -0.03], [0.17, -0.07], [0.12, -0.09], [0.001, -0.095],
  ], 20), [0, 0, 0], [1.12, 1, 0.66]),
  shortsLeg: part(lathe([[0.096, 0.02], [0.1, -0.06], [0.1, -0.15], [0.097, -0.2], [0.09, -0.205]], 14), [0, 0, 0], [1, 1, 0.92]),
  collar: new THREE.TorusGeometry(0.062, 0.014, 6, 20).rotateX(Math.PI / 2).scale(1.15, 1, 0.95),
  neck: new THREE.CylinderGeometry(0.047, 0.054, 0.14, 12),
  thigh: lathe([
    [0.001, 0.01], [0.08, -0.005], [0.09, -0.07], [0.086, -0.17], [0.073, -0.29], [0.06, -0.38], [0.054, -0.43],
    [0.03, -0.455], [0.001, -0.46],
  ], 14),
  sock: lathe([
    [0.001, 0.035], [0.042, 0.026], [0.056, 0.0], [0.062, -0.07], [0.066, -0.13], [0.059, -0.22], [0.044, -0.33],
    [0.036, -0.4], [0.038, -0.43], [0.001, -0.445],
  ], 14),
  sleeve: part(lathe([
    [0.001, 0.06], [0.035, 0.055], [0.058, 0.03], [0.066, -0.02], [0.066, -0.1], [0.064, -0.17],
  ], 18), [0, 0, 0], [0.95, 1, 1]),
  sleeveLong: lathe([
    [0.001, 0.075], [0.04, 0.066], [0.064, 0.035], [0.071, -0.02], [0.063, -0.12], [0.054, -0.22], [0.049, -0.28],
    [0.001, -0.3],
  ], 14),
  upperArm: lathe([[0.001, 0.0], [0.056, -0.02], [0.058, -0.1], [0.05, -0.2], [0.044, -0.27], [0.001, -0.29]], 12),
  forearm: mergeGeometries([
    lathe([[0.001, 0.025], [0.044, 0.008], [0.049, -0.05], [0.04, -0.16], [0.03, -0.22], [0.001, -0.235]], 12),
    part(ball, [0, -0.268, 0.006], [0.022, 0.052, 0.04]),
  ]),
  gkForearm: lathe([[0.001, 0.025], [0.046, 0.008], [0.05, -0.05], [0.042, -0.16], [0.036, -0.22], [0.001, -0.235]], 12),
  glove: part(ball, [0, -0.272, 0.006], [0.034, 0.064, 0.054]),
  headSkin: mergeGeometries([
    part(ball, CR, CS),
    part(ball, [0, -0.04, 0.018], [0.078, 0.07, 0.085]),
    part(lowBall, [0, -0.008, 0.104], [0.011, 0.02, 0.016], [-0.25, 0, 0]),
    part(lowBall, [0.093, -0.005, -0.004], [0.014, 0.027, 0.019]),
    part(lowBall, [-0.093, -0.005, -0.004], [0.014, 0.027, 0.019]),
  ]),
  face: mergeGeometries([
    part(lowBall, [0.034, 0.018, 0.093], [0.012, 0.012, 0.012]),
    part(lowBall, [-0.034, 0.018, 0.093], [0.012, 0.012, 0.012]),
    part(box, [0, -0.058, 0.098], [0.032, 0.006, 0.008]),
  ]),
};

const BROWS = [
  part(box, [0.035, 0.04, 0.099], [0.032, 0.008, 0.012], [0, 0, 0.12]),
  part(box, [-0.035, 0.04, 0.099], [0.032, 0.008, 0.012], [0, 0, -0.12]),
];
const { smoothstep, lerp } = THREE.MathUtils;
// smoothstep that also handles edge0 > edge1 (falling edge)
const ramp = (a, b, x) => (a < b ? smoothstep(x, a, b) : 1 - smoothstep(x, b, a));

// Shrink-wraps a sphere onto the cranium: inside the hairline it is pushed out to the style's volume, outside it
// sinks just under the skin, so the hairline follows forehead, temples, ears and nape and fades instead of
// ending in a hard helmet edge.
function scalp({
  top = 1.07, side = 1.03, back = 1.05, sweep = 0, bumps = 0, freq = 22,
  front = 0.36, temple = 0.5, nape = 0.7,
}) {
  const g = new THREE.SphereGeometry(1, 48, 28);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const polar = Math.acos(THREE.MathUtils.clamp(v.y, -1, 1)) / Math.PI;
    const f = Math.abs(Math.atan2(v.x, v.z)) / Math.PI;
    let line = f < 0.5 ? lerp(front, temple, smoothstep(f, 0.05, 0.5)) : lerp(temple, nape, smoothstep(f, 0.5, 0.9));
    // dip of the hairline in front of the ears (sideburns)
    line += 0.06 * Math.exp(-((f - 0.42) ** 2) / 0.004);
    const inHair = ramp(line + 0.025, line - 0.045, polar);
    const crown = 1 - smoothstep(polar, 0.12, 0.5);
    let k = lerp(side, top, crown) + (back - side) * smoothstep(f, 0.55, 1) * smoothstep(polar, 0.15, 0.45);
    k += sweep * (1 - smoothstep(f, 0.1, 0.45)) * (1 - smoothstep(polar, 0.08, 0.38));
    if (bumps) {
      k += bumps * (Math.sin(v.x * freq + 1.3) * Math.sin(v.y * freq * 0.9) * Math.sin(v.z * freq * 1.1 + 0.7) * 0.5 + 0.5);
    }
    const r = lerp(0.975, k, inHair);
    pos.setXYZ(i, CR[0] + v.x * r * CS[0], CR[1] + v.y * r * CS[1], CR[2] + v.z * r * CS[2]);
  }
  g.computeVertexNormals();
  return g;
}

// Hair hanging behind the head and over the ears, down towards the collar.
function curtain(length, ridges = 0) {
  const g = new THREE.CylinderGeometry(0.11, 0.122, length, 40, 6, true, Math.PI / 2 + 0.2, Math.PI - 0.4);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = pos.getY(i);
    const a = Math.atan2(x, z);
    const s = (1 + ridges * Math.sin(a * 26)) * (1 - 0.06 * ((0.5 - y / length) ** 2));
    pos.setXYZ(i, x * s * 0.95, y, z * s);
  }
  g.computeVertexNormals();
  return part(g, [0, CR[1] - 0.02 - length / 2, -0.004]);
}

const HAIR = {
  buzz: () => [scalp({ top: 1.018, side: 1.012, back: 1.014, front: 0.37 })],
  crop: () => [scalp({ top: 1.075, side: 1.025, back: 1.04 })],
  slick: () => [scalp({ top: 1.1, side: 1.025, back: 1.06, sweep: 0.07, front: 0.35 })],
  curly: () => [scalp({ top: 1.12, side: 1.035, back: 1.07, bumps: 0.04, freq: 26 })],
  afro: () => [scalp({ top: 1.3, side: 1.22, back: 1.28, bumps: 0.05, freq: 20, front: 0.34, temple: 0.56, nape: 0.68 })],
  dreads: () => [
    scalp({ top: 1.1, side: 1.06, back: 1.08, bumps: 0.06, freq: 34, temple: 0.55, nape: 0.76 }),
    curtain(0.11, 0.07),
  ],
  long: () => [scalp({ top: 1.08, side: 1.06, back: 1.07, front: 0.35, temple: 0.6, nape: 0.78 }), curtain(0.16)],
  bun: () => [
    scalp({ top: 1.04, side: 1.025, back: 1.035, sweep: 0.02 }),
    part(ball, [0, 0.105, -0.085], [0.042, 0.038, 0.042]),
  ],
  bald: () => [],
};

// Same trick on the jaw: the beard covers chin, jaw line and cheeks and runs up into the sideburns.
const JAW = [0, -0.04, 0.018];
const JS = [0.078, 0.07, 0.085];
function beardGeometry(full) {
  const g = new THREE.SphereGeometry(1, 36, 20);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  const k = full ? 1.1 : 1.035;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const limit = lerp(0.15, 0.75, smoothstep(Math.abs(v.x), 0.55, 0.9));
    const t = ramp(limit + 0.08, limit - 0.12, v.y) * smoothstep(v.z, -0.55, -0.2);
    const lips = (1 - smoothstep(Math.abs(v.x), 0.22, 0.38)) * smoothstep(v.y, -0.42, -0.32)
      * (1 - smoothstep(v.y, -0.2, -0.1)) * smoothstep(v.z, 0.6, 0.8);
    const kk = lerp(k + (full ? 0.03 * Math.sin(v.x * 30) * Math.sin(v.y * 27) : 0), 0.99, lips);
    const r = lerp(0.97, kk, t);
    pos.setXYZ(i, JAW[0] + v.x * r * JS[0], JAW[1] + v.y * r * JS[1], JAW[2] + v.z * r * JS[2]);
  }
  g.computeVertexNormals();
  return g;
}

const hairCache = new Map();
function hairGeometry(style, beard) {
  const key = `${style}-${beard}`;
  if (!hairCache.has(key)) {
    const parts = [...(HAIR[style] ?? HAIR.crop)(), ...BROWS];
    if (beard) parts.push(beardGeometry(beard === 2));
    hairCache.set(key, mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g))));
  }
  return hairCache.get(key);
}

const HAIR_COLOURS = {
  black: 0x0d0a08, dark: 0x22160e, brown: 0x462c1a, light: 0x7a5634, blond: 0xc8a062, red: 0x8f4320, grey: 0x9a948c,
};
const strands = hairTexture();
const hairMats = new Map();
function hairMat(colour) {
  if (!hairMats.has(colour)) {
    hairMats.set(colour, rimLit(new THREE.MeshStandardMaterial({
      color: HAIR_COLOURS[colour] ?? HAIR_COLOURS.dark, map: strands, bumpMap: strands, bumpScale: 1.2,
      roughness: 0.62, side: THREE.DoubleSide,
    })));
  }
  return hairMats.get(colour);
}

// [upper, sole]
const BOOTS = [
  [0x111111, 0xf2f2f2], [0xf5f5f5, 0x222222], [0xff3d00, 0x111111], [0x00d8f0, 0xf5f5f5],
  [0xffe100, 0x111111], [0x1a1a1a, 0xff3d00], [0xff2d8a, 0xffffff],
];
const bootGeos = BOOTS.map(([upper, sole]) => mergeGeometries([
  part(ball, [0, -0.452, 0.04], [0.047, 0.033, 0.125], [0.06, 0, 0], upper),
  part(new THREE.CylinderGeometry(0.04, 0.044, 0.05, 12), [0, -0.425, 0], [1, 1, 1], [0, 0, 0], upper),
  part(box, [0, -0.481, 0.035], [0.088, 0.016, 0.255], [0, 0, 0], sole),
]));

const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// Fresnel rim light so players read clearly against the grass from the broadcast camera.
function rimLit(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float rimF = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 3.0);
      outgoingLight += mix(vec3(1.0, 0.96, 0.88), diffuseColor.rgb, 0.4) * rimF * 0.45;
      #include <opaque_fragment>`,
    );
  };
  return mat;
}

const std = (color, rough = 0.65) => rimLit(new THREE.MeshStandardMaterial({ color, roughness: rough }));

const shadowMat = new THREE.MeshBasicMaterial({
  map: contactShadowTexture(), transparent: true, depthWrite: false, opacity: 0.8,
});
const shadowGeo = new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2);
// Indexed by appearance tone, fair to very dark.
const skinMats = [0xf7d9c8, 0xf0c8ae, 0xdcab88, 0xbd8662, 0x8e5b3c, 0x5c3822, 0x3b2214].map((c) => std(c, 0.5));
const bootMat = rimLit(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.3 }));
const faceMat = std(0x2a1712, 0.4);

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

const fabric = (map, rough) => rimLit(new THREE.MeshStandardMaterial({ map, roughness: rough }));

export function kitMaterials(renderer, kit, gkKit, gk) {
  const k = gk
    ? { shirt: gkKit.shirt, shorts: gkKit.shorts, socks: gkKit.socks, trim: 0x111111, number: inkFor(gkKit.shirt) }
    : kit;
  return {
    kit: k,
    sleeves: gk ? std(k.shirt, 0.6) : fabric(sleeveTexture(renderer, k), 0.6),
    shorts: std(k.shorts, 0.6),
    socks: fabric(sockTexture(renderer, k), 0.75),
    trim: std(k.trim ?? 0x111111, 0.5),
    glove: std(0xf5f5f5, 0.5),
  };
}

function limb(parent, g, mat, shadow = true) {
  const m = new THREE.Mesh(g, mat);
  m.castShadow = shadow;
  parent.add(m);
  return m;
}

export class PlayerModel {
  constructor(renderer, mats, data, gk) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const look = appearanceFor(data.name);
    // Slightly exaggerated so height differences read from the broadcast camera.
    const tall = THREE.MathUtils.clamp(1 + ((look.height - AVG_HEIGHT) / AVG_HEIGHT) * 1.3, 0.85, 1.16);
    const build = 1 + (tall - 1) * 0.5 + (Math.random() - 0.5) * 0.05;
    this.body.scale.set(build, tall, build);
    const contact = new THREE.Mesh(shadowGeo, shadowMat);
    contact.position.y = 0.015;
    contact.renderOrder = -1;
    contact.scale.setScalar(build);
    this.root.add(contact);
    const skin = skinMats[look.tone];
    const boots = pick(bootGeos);
    this.shirtMat = fabric(shirtTexture(renderer, mats.kit, data), 0.6);

    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 0.92;
    this.body.add(this.pelvis);

    limb(this.pelvis, geo.shorts, mats.shorts);
    limb(this.pelvis, geo.torso, this.shirtMat);
    limb(this.pelvis, geo.collar, mats.trim, false).position.y = 0.598;
    limb(this.pelvis, geo.neck, skin).position.y = 0.64;
    this.head = new THREE.Group();
    this.head.position.y = 0.73;
    this.pelvis.add(this.head);
    limb(this.head, geo.headSkin, skin);
    limb(this.head, geo.face, faceMat, false);
    limb(this.head, hairGeometry(look.hair, look.beard), hairMat(look.hairColour));

    this.shoulders = [-1, 1].map((side) => {
      const s = new THREE.Group();
      s.position.set(side * 0.245, 0.5, 0);
      s.userData.side = side;
      this.pelvis.add(s);
      if (gk) limb(s, geo.sleeveLong, mats.sleeves);
      else {
        limb(s, geo.sleeve, mats.sleeves);
        limb(s, geo.upperArm, skin);
      }
      const elbow = new THREE.Group();
      elbow.position.y = -0.27;
      s.add(elbow);
      if (gk) {
        limb(elbow, geo.gkForearm, mats.sleeves);
        limb(elbow, geo.glove, mats.glove);
      } else limb(elbow, geo.forearm, skin);
      s.userData.elbow = elbow;
      return s;
    });

    this.hips = [-1, 1].map((side) => {
      const hp = new THREE.Group();
      hp.rotation.order = 'YXZ';
      hp.position.set(side * 0.1, 0.92, 0);
      this.body.add(hp);
      limb(hp, geo.shortsLeg, mats.shorts);
      limb(hp, geo.thigh, skin);
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hp.add(knee);
      limb(knee, geo.sock, mats.socks);
      limb(knee, boots, bootMat);
      hp.userData.knee = knee;
      return hp;
    });

    this.s = {};
    for (const f of FIELDS) this.s[f] = 0;
    this.s.phase = Math.random() * 10;
  }

  dispose() {
    this.shirtMat.map.dispose();
    this.shirtMat.dispose();
  }

  kick(kind) {
    this.s.kickT = 0.001;
    this.s.kickKind = kind;
  }

  dive(dir, hop = 0.5) {
    this.s.diveT = 0.001;
    this.s.diveDir = dir;
    this.diveHop = hop;
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
      case POSE.HANDS_HEAD: {
        const e = ease;
        SL.rotation.set(-2.55 * e, 0, -0.55 * e);
        SR.rotation.set(-2.55 * e, 0, 0.55 * e);
        SL.userData.elbow.rotation.set(-1.85 * e, 0, 0.2 * e);
        SR.userData.elbow.rotation.set(-1.85 * e, 0, -0.2 * e);
        this.head.rotation.x = 0.42 * e;
        body.rotation.x = 0.12 * e;
        break;
      }
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
      const hop = this.diveHop ?? 0.5;
      body.rotation.z = -s.diveDir * 1.35 * e;
      body.position.y += Math.sin(Math.min(1, t * 2.4) * Math.PI) * (0.22 + hop * 0.7) * e;
      SL.rotation.set(-0.35 * hop, 0, -2.5 * e);
      SR.rotation.set(-0.35 * hop, 0, 2.5 * e);
      L.rotation.z = -0.3 * e;
      R.rotation.z = 0.3 * e;
    }
    body.position.y *= body.scale.y;
  }
}
