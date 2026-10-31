import * as THREE from 'three';
import {
  HALF_L, HALF_W, GOAL_HW, GOAL_H, GOAL_D, POST_R, GROUND_W, GROUND_D,
} from './constants.js';
import {
  pitchTexture, grassBumpTexture, netTexture, adTexture, concreteTexture,
} from './textures.js';

const crowdUniforms = { uTime: { value: 0 }, uExcite: { value: 0 } };

function crowdMaterial(flashes) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  mat.customProgramCacheKey = () => (flashes ? 'crowd-flash' : 'crowd');
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = crowdUniforms.uTime;
    shader.uniforms.uExcite = crowdUniforms.uExcite;
    shader.vertexShader = 'uniform float uTime;\nuniform float uExcite;\nvarying float vFlash;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float fid = float(gl_InstanceID);
      float h = fract(sin(fid * 12.9898) * 43758.5453);
      float speed = 2.5 + h * 5.0 + uExcite * 4.0;
      float bob = max(0.0, sin(uTime * speed + h * 6.2831));
      transformed.y += bob * (0.03 + uExcite * 0.42 * step(0.25, h));
      float roll = fract(sin(fid * 78.233 + floor(uTime * 10.0 + h * 10.0) * 13.17) * 43758.5453);
      vFlash = step(1.0 - 0.0002 - 0.0025 * uExcite * uExcite, roll);`,
    );
    shader.fragmentShader = 'varying float vFlash;\n' + shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      ${flashes ? 'totalEmissiveRadiance += vec3(1.0, 0.97, 0.92) * vFlash * 30.0;' : ''}`,
    );
  };
  return mat;
}

// Breaks up the flat pitch texture with world-space patchiness, blade detail and mowing-stripe sheen.
function grassMaterial(map, bumpMap) {
  const mat = new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: 0.6, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 vGrassPos;\n' + shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      vGrassPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );
    shader.fragmentShader = `varying vec3 vGrassPos;
      float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float gNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x),
                   mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      ` + shader.fragmentShader
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 gp = vGrassPos.xz;
        float patches = gNoise(gp * 0.045) * 0.6 + gNoise(gp * 0.11) * 0.4;
        float clumps = gNoise(gp * 0.9);
        float blades = gNoise(gp * 9.0);
        float isLine = smoothstep(0.35, 0.6, min(diffuseColor.r, diffuseColor.b) * 3.0);
        vec3 grass = diffuseColor.rgb * (0.84 + 0.26 * patches + 0.1 * clumps + 0.08 * blades);
        grass = mix(grass, grass * vec3(1.12, 1.04, 0.72), smoothstep(0.6, 0.85, patches) * 0.6);
        float stripe = mod(floor((gp.x + ${HALF_L.toFixed(2)}) / ${((HALF_L * 2) / 20).toFixed(4)}), 2.0) * 2.0 - 1.0;
        vec3 toCam = normalize(cameraPosition - vGrassPos);
        grass *= 1.0 - stripe * toCam.z * 0.14;
        grass = mix(vec3(dot(grass, vec3(0.2126, 0.7152, 0.0722))), grass, 0.82);
        diffuseColor.rgb = mix(grass, diffuseColor.rgb, isLine);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.88 + 0.2 * clumps), 0.0, 1.0);`,
      );
  };
  return mat;
}

function skyDome() {
  const geo = new THREE.SphereGeometry(1800, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {},
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        float h = vDir.y;
        vec3 horizon = vec3(1.0, 0.52, 0.28);
        vec3 mid = vec3(0.32, 0.30, 0.55);
        vec3 top = vec3(0.03, 0.06, 0.18);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.18, h));
        col = mix(col, top, smoothstep(0.15, 0.7, h));
        vec3 sunDir = normalize(vec3(-0.8, 0.06, -0.6));
        float sun = max(dot(vDir, sunDir), 0.0);
        col += vec3(1.0, 0.6, 0.3) * pow(sun, 12.0) * 0.8 + vec3(1.0, 0.8, 0.5) * pow(sun, 400.0) * 3.0;
        vec3 sp = floor(vDir * 420.0);
        float star = step(0.9975, hash(sp)) * smoothstep(0.25, 0.6, h);
        col += star * 0.9;
        if (h < 0.0) col = mix(horizon * 0.35, vec3(0.05, 0.06, 0.08), smoothstep(0.0, -0.1, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

function buildGoal(scene, s, netTex) {
  const group = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.1 });
  const postGeo = new THREE.CylinderGeometry(POST_R, POST_R, GOAL_H + POST_R, 20);
  for (const z of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(s * HALF_L, (GOAL_H + POST_R) / 2, z * (GOAL_HW + POST_R));
    post.castShadow = true;
    group.add(post);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, GOAL_H, 8), postMat);
    back.position.set(s * (HALF_L + GOAL_D), GOAL_H / 2, z * GOAL_HW);
    group.add(back);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(POST_R, POST_R, GOAL_HW * 2 + POST_R * 4, 20), postMat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(s * HALF_L, GOAL_H + POST_R, 0);
  bar.castShadow = true;
  group.add(bar);

  const netMat = (w, h) => {
    const t = netTex.clone();
    t.repeat.set(w / 0.9, h / 0.9);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      map: t, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9, color: 0xf0f0f0,
    });
  };
  const backNet = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_HW * 2, GOAL_H, 16, 8), netMat(GOAL_HW * 2, GOAL_H));
  backNet.rotation.y = Math.PI / 2;
  backNet.position.set(s * (HALF_L + GOAL_D), GOAL_H / 2, 0);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_D, GOAL_HW * 2), netMat(GOAL_D, GOAL_HW * 2));
  top.rotation.x = -Math.PI / 2;
  top.position.set(s * (HALF_L + GOAL_D / 2), GOAL_H, 0);
  group.add(backNet, top);
  for (const z of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_D, GOAL_H), netMat(GOAL_D, GOAL_H));
    side.position.set(s * (HALF_L + GOAL_D / 2), GOAL_H / 2, z * GOAL_HW);
    group.add(side);
  }
  for (const m of group.children) if (m.material.alphaTest) m.castShadow = true;
  scene.add(group);

  const base = backNet.geometry.attributes.position.array.slice();
  return { backNet, base, s, shake: 0, hitZ: 0, hitY: 1 };
}

function buildStand(scene, { length, rows, position, rotY, mix, seatColor }) {
  const g = new THREE.Group();
  g.position.copy(position);
  g.rotation.y = rotY;
  scene.add(g);

  const rowD = 0.85;
  const rise = 0.44;
  const baseH = 1.3;
  const topH = baseH + rows * rise;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const unit = new THREE.BoxGeometry(1, 1, 1);

  const stepMat = new THREE.MeshStandardMaterial({ roughness: 0.8, map: stadiumTex.concrete });
  const steps = new THREE.InstancedMesh(unit, stepMat, rows);
  const c = new THREE.Color();
  for (let r = 0; r < rows; r++) {
    const h = baseH + r * rise;
    m.compose(new THREE.Vector3(0, h / 2, r * rowD + rowD / 2), q, new THREE.Vector3(length, h, rowD));
    steps.setMatrixAt(r, m);
    c.set(seatColor).multiplyScalar(r % 2 ? 0.8 : 1);
    steps.setColorAt(r, c);
  }
  steps.receiveShadow = true;
  g.add(steps);

  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.6, metalness: 0.4 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(length + 2, topH + 8, 0.6), dark);
  wall.position.set(0, (topH + 8) / 2, rows * rowD + 0.3);
  g.add(wall);

  const roofDepth = rows * rowD + 3;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 2, 0.5, roofDepth), dark);
  roof.position.set(0, topH + 7.5, rows * rowD - roofDepth / 2 + 0.6);
  roof.rotation.x = 0.05;
  g.add(roof);

  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.25, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 3.5 }),
  );
  strip.position.set(0, topH + 7.0, rows * rowD - roofDepth + 1.2);
  g.add(strip);

  const spacing = 0.62;
  const perRow = Math.floor(length / spacing);
  const count = perRow * rows;
  const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.24, 2, 6).scale(1.1, 1, 0.72);
  const headGeo = new THREE.IcosahedronGeometry(0.12, 1);
  const bodyMat = crowdMaterial(true);
  const headMat = crowdMaterial(false);
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
  const heads = new THREE.InstancedMesh(headGeo, headMat, count);
  const skins = [0xf1c7a5, 0xd9a07a, 0xa86b45, 0x6e4228, 0xe8b894];
  const homeCols = [0x1d4fd6, 0x2a66ff, 0xffffff, 0x163c9e];
  const awayCols = [0xc8102e, 0xe03040, 0x151515, 0xa00c22];
  const miscCols = [0x2f2f2f, 0xe0e0e0, 0x3a6b3a, 0xd8b030, 0x6a4c93, 0x555f70];
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < perRow; k++) {
      const empty = Math.random() < 0.06;
      const x = -length / 2 + (k + 0.5) * spacing + (Math.random() - 0.5) * 0.12;
      const y = baseH + r * rise + 0.31;
      const z = r * rowD + 0.42 + (Math.random() - 0.5) * 0.1;
      const s = empty ? 0.0001 : 0.9 + Math.random() * 0.2;
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
      bodies.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(x, y + 0.45 * s, z), q, new THREE.Vector3(s, s, s));
      heads.setMatrixAt(i, m);
      const roll = Math.random();
      const pal = roll < mix.home ? homeCols : roll < mix.home + mix.away ? awayCols : miscCols;
      c.setHex(pal[(Math.random() * pal.length) | 0]).multiplyScalar(0.75 + Math.random() * 0.3);
      bodies.setColorAt(i, c);
      c.setHex(skins[(Math.random() * skins.length) | 0]);
      heads.setColorAt(i, c);
      i++;
    }
  }
  g.add(bodies, heads);
  return g;
}

function floodlight(scene, x, z) {
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 0.7, roughness: 0.35 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 44, 12), metal);
  pole.position.set(x, 22, z);
  scene.add(pole);

  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#111';
  g.fillRect(0, 0, 256, 160);
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 7; k++) {
      const gr = g.createRadialGradient(20 + k * 36, 22 + r * 38, 0, 20 + k * 36, 22 + r * 38, 16);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.6, '#fff4dc');
      gr.addColorStop(1, '#333');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(20 + k * 36, 22 + r * 38, 15, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const head = new THREE.Group();
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(9, 5.6, 0.5),
    [metal, metal, metal, metal,
      new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 4 }),
      metal],
  );
  head.add(panel);
  head.position.set(x, 45, z);
  head.lookAt(0, 0, 0);
  scene.add(head);
}

function adBoards(scene, renderer) {
  const base = adTexture(renderer);
  const boards = [];
  const backMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  const add = (len, x, z, rotY) => {
    const t = base.clone();
    t.repeat.set(len / 26, 1);
    t.offset.x = Math.random();
    t.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({
      map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.25, roughness: 0.35,
    });
    const g = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.95), mat);
    face.position.y = 0.55;
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, 1.05, 0.2), backMat);
    back.position.set(0, 0.52, -0.12);
    back.castShadow = true;
    g.add(face, back);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    scene.add(g);
    boards.push(t);
  };
  for (const sx of [-1, 1]) {
    add(56, sx * 28.5, -(HALF_W + 4), 0);
    add(56, sx * 28.5, HALF_W + 4, Math.PI);
  }
  add(64, HALF_L + 5.5, 0, -Math.PI / 2);
  add(64, -(HALF_L + 5.5), 0, Math.PI / 2);
  return boards;
}

function cornerFlags(scene) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xffd400, side: THREE.DoubleSide, emissive: 0x332200 });
  const flags = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 6), poleMat);
      pole.position.set(sx * HALF_L, 0.8, sz * HALF_W);
      pole.castShadow = true;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.32, 6, 1), flagMat);
      flag.position.set(sx * HALF_L + 0.23, 1.44, sz * HALF_W);
      flag.castShadow = true;
      scene.add(pole, flag);
      flags.push(flag);
    }
  }
  return flags;
}

const stadiumTex = {};

export function buildStadium(scene, renderer) {
  stadiumTex.concrete = concreteTexture(renderer);

  const sky = skyDome();
  scene.add(sky);
  const envScene = new THREE.Scene();
  envScene.add(skyDome());
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.55;
  scene.fog = new THREE.Fog(0x2a2440, 160, 700);

  const hemi = new THREE.HemisphereLight(0xc4d8ff, 0x2a4a20, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3e2, 3.2);
  sun.position.set(-30, 75, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -72;
  sc.right = 72;
  sc.top = 52;
  sc.bottom = -52;
  sc.near = 10;
  sc.far = 220;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xaecbff, 0.9);
  fill.position.set(40, 50, -40);
  scene.add(fill);

  const grass = grassMaterial(pitchTexture(renderer), grassBumpTexture(renderer));
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_W, GROUND_D), grass);
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  scene.add(pitch);

  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardMaterial({ color: 0x23291f, roughness: 1 }),
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.03;
  outer.receiveShadow = true;
  scene.add(outer);

  const nt = netTexture(renderer);
  const goals = [buildGoal(scene, 1, nt), buildGoal(scene, -1, nt)];
  const boards = adBoards(scene, renderer);
  const flags = cornerFlags(scene);

  const rows = 24;
  buildStand(scene, {
    length: 124, rows, position: new THREE.Vector3(0, 0, HALF_W + 7.5), rotY: 0,
    mix: { home: 0.45, away: 0.35 }, seatColor: 0x2b3f8c,
  });
  buildStand(scene, {
    length: 124, rows, position: new THREE.Vector3(0, 0, -(HALF_W + 7.5)), rotY: Math.PI,
    mix: { home: 0.5, away: 0.3 }, seatColor: 0x2b3f8c,
  });
  buildStand(scene, {
    length: 84, rows, position: new THREE.Vector3(-(HALF_L + 9.5), 0, 0), rotY: -Math.PI / 2,
    mix: { home: 0.85, away: 0.05 }, seatColor: 0x1d4fd6,
  });
  buildStand(scene, {
    length: 84, rows, position: new THREE.Vector3(HALF_L + 9.5, 0, 0), rotY: Math.PI / 2,
    mix: { home: 0.05, away: 0.85 }, seatColor: 0xa01020,
  });

  for (const sx of [-1, 1]) for (const sz of [-1, 1]) floodlight(scene, sx * 76, sz * 58);

  let excite = 0;
  return {
    sun,
    goals,
    setExcite(v) {
      excite = Math.max(excite, v);
    },
    netHit(s, z, y, power) {
      const goal = goals.find((gl) => gl.s === s);
      goal.shake = Math.min(1, power);
      goal.hitZ = z;
      goal.hitY = y;
    },
    update(dt, t) {
      crowdUniforms.uTime.value = t;
      excite = Math.max(0.12, excite - dt * 0.12);
      crowdUniforms.uExcite.value = excite;
      for (const b of boards) b.offset.x += dt * 0.04;
      for (const f of flags) {
        const p = f.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i) + 0.225;
          p.setZ(i, Math.sin(t * 6 + x * 9) * 0.05 * x * 2);
        }
        p.needsUpdate = true;
      }
      for (const gl of goals) {
        if (gl.shake <= 0.001) continue;
        gl.shake *= Math.exp(-dt * 2.5);
        const p = gl.backNet.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const bx = gl.base[i * 3];
          const by = gl.base[i * 3 + 1];
          const d = Math.hypot(-bx - gl.hitZ, by + GOAL_H / 2 - gl.hitY);
          const push = Math.max(0, 1 - d / 2.8) * gl.shake * 0.9 * Math.cos(t * 18);
          p.setZ(i, gl.base[i * 3 + 2] + gl.s * Math.abs(push));
        }
        p.needsUpdate = true;
      }
    },
  };
}
