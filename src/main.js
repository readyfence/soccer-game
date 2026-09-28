import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HALF_L, HALF_W } from './constants.js';
import { buildStadium } from './stadium.js';
import { Ball } from './ball.js';
import { Sfx } from './audio.js';
import { Game } from './game.js';
import { Input, CONTROLS } from './input.js';
import { CLUBS, teamRating, resolveKits } from './teams.js';

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ renderer

const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 4000);
camera.position.set(0, 30, 60);

const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.5, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const stadium = buildStadium(scene, renderer);

// Quality levels, highest first. Auto mode steps down when the frame rate stays low.
const QUALITY = [
  { name: 'Ultra', ratio: Math.min(window.devicePixelRatio, 1.75), bloom: true, shadow: 4096, samples: 4 },
  { name: 'High', ratio: 1, bloom: true, shadow: 4096, samples: 4 },
  { name: 'Medium', ratio: 1, bloom: false, shadow: 2048, samples: 4 },
  { name: 'Performance', ratio: 0.75, bloom: false, shadow: 2048, samples: 0 },
];
let qLevel = 0;
let qAuto = true;
function applyQuality(level) {
  qLevel = level;
  const q = QUALITY[level];
  renderer.setPixelRatio(q.ratio);
  composer.setPixelRatio(q.ratio);
  bloom.enabled = q.bloom;
  for (const t of [composer.renderTarget1, composer.renderTarget2]) {
    if (t.samples !== q.samples) {
      t.samples = q.samples;
      t.dispose();
    }
  }
  const sun = stadium.sun;
  if (sun.shadow.mapSize.x !== q.shadow) {
    sun.shadow.mapSize.set(q.shadow, q.shadow);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  resize();
}
const fpsWin = { t: 0, n: 0, grace: 3 };
function autoQuality(dt) {
  if (!qAuto || qLevel >= QUALITY.length - 1) return;
  if (fpsWin.grace > 0) {
    fpsWin.grace -= dt;
    return;
  }
  fpsWin.t += dt;
  fpsWin.n++;
  if (fpsWin.t >= 2.5) {
    const fps = fpsWin.n / fpsWin.t;
    fpsWin.t = 0;
    fpsWin.n = 0;
    if (fps < 42) {
      applyQuality(qLevel + 1);
      fpsWin.grace = 1.5;
    }
  }
}
const ball = new Ball(scene, renderer);
const sfx = new Sfx();
const input = new Input();

// Controlled-player marker
const marker = new THREE.Group();
const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.55, 0.72, 40),
  new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.9, depthWrite: false }),
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.03;
const arrow = new THREE.Mesh(
  new THREE.ConeGeometry(0.16, 0.32, 3),
  new THREE.MeshBasicMaterial({ color: 0xffd400 }),
);
arrow.rotation.x = Math.PI;
arrow.position.y = 2.35;
marker.add(ring, arrow);
marker.visible = false;
scene.add(marker);

// ------------------------------------------------------------------ HUD

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
function badgeStyle(el, club) {
  const [a, b, c] = club.badge;
  el.style.background = `linear-gradient(135deg, ${a} 0 50%, ${b} 50% 100%)`;
  el.style.borderColor = c;
  el.style.color = '#fff';
  el.textContent = club.short;
}

let bannerTimer = 0;
const hud = {
  say(text) {
    const el = document.createElement('div');
    el.className = 'say';
    el.textContent = text;
    const box = $('commentary');
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.remove(), 3100);
  },
  banner(text, sub, dur) {
    if (!text) return;
    $('banner-text').textContent = text;
    $('banner-sub').textContent = sub || '';
    const b = $('banner');
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    bannerTimer = dur;
  },
  power(v, label) {
    $('power').classList.toggle('show', v > 0);
    $('power-fill').style.width = `${Math.round(v * 100)}%`;
    $('power-label').textContent = label;
  },
  setScore(h, a) {
    $('sb-hs').textContent = h;
    $('sb-as').textContent = a;
  },
  replay(on) {
    $('replay').classList.toggle('hidden', !on);
  },
  fullTime(a, b) {
    const res = a.score > b.score ? `${a.name} win!` : a.score < b.score ? `${b.name} win.` : 'A hard-fought draw.';
    $('ft-score').innerHTML = `<span class="badge" id="ft-ba"></span>${a.score} - ${b.score}<span class="badge" id="ft-bb"></span>`;
    badgeStyle($('ft-ba'), a.club);
    badgeStyle($('ft-bb'), b.club);
    $('ft-result').textContent = res;
    setTimeout(() => {
      $('fulltime').classList.remove('hidden');
      $('hud').classList.add('hidden');
    }, 3500);
  },
};

const game = new Game({ scene, renderer, stadium, ball, sfx, hud });

// ------------------------------------------------------------------ menu

const sel = { user: CLUBS[0], ai: CLUBS[2], diff: 'normal', len: 5 };

function clubCard(club, side) {
  const el = document.createElement('div');
  el.className = 'club';
  el.innerHTML = `<span class="badge"></span><span class="cname">${club.name}</span><span class="crate">OVR ${teamRating(club)}</span>`;
  badgeStyle(el.querySelector('.badge'), club);
  el.onclick = () => {
    sel[side] = club;
    renderMenu();
  };
  return el;
}

function clubInfo(club) {
  const k = club.home;
  const top = [...club.players].sort((a, b) => b.ovr - a.ovr).slice(0, 6);
  return `<div class="ci-head"><span class="badge" data-club="${club.id}"></span><div><div class="ci-title">${club.name}</div>
    <div>Team OVR <b>${teamRating(club)}</b> · Kit <span class="kit"><i style="background:${hex(k.shirt)}"></i><i style="background:${hex(k.shorts)}"></i><i style="background:${hex(k.socks)}"></i></span>
    GK <span class="kit"><i style="background:${hex(club.gk.shirt)}"></i></span></div></div></div>
    <div class="stars">${top.map((p) => `<div><span>#${p.num} ${p.name}</span><b>${p.ovr}</b></div>`).join('')}</div>`;
}

function renderMenu() {
  for (const side of ['user', 'ai']) {
    const grid = $(`grid-${side}`);
    grid.innerHTML = '';
    for (const c of CLUBS) {
      const card = clubCard(c, side);
      if (sel[side] === c) card.classList.add('on');
      grid.appendChild(card);
    }
    const info = $(`info-${side}`);
    info.innerHTML = clubInfo(sel[side]);
    badgeStyle(info.querySelector('.badge'), sel[side]);
  }
}

function segment(id, key, parse) {
  for (const b of $(id).querySelectorAll('button')) {
    b.onclick = () => {
      for (const o of $(id).querySelectorAll('button')) o.classList.remove('on');
      b.classList.add('on');
      sel[key] = parse(b.dataset.v);
    };
  }
}
segment('opt-diff', 'diff', (v) => v);
segment('opt-len', 'len', Number);
for (const b of $('opt-gfx').querySelectorAll('button')) {
  b.addEventListener('click', () => {
    const v = b.dataset.v;
    qAuto = v === 'auto';
    fpsWin.grace = 2;
    applyQuality(qAuto ? 0 : Number(v));
  });
}
segment('opt-gfx', 'gfx', (v) => v);

function fillControls() {
  const row = ([k, v]) => `<tr><td>${k.split('  or  ').map((s) => s.split(' / ').map((x) => `<kbd>${x}</kbd>`).join(' ')).join(' or ')}</td><td>${v}</td></tr>`;
  $('keys-attack').innerHTML = CONTROLS.attack.map(row).join('');
  $('keys-defend').innerHTML = CONTROLS.defend.map(row).join('');
  $('keys-pad').innerHTML = CONTROLS.pad.map(row).join('');
}
fillControls();

let mode = 'menu';
let paused = false;
let helpOpen = false;

function toggleHelp(force) {
  helpOpen = force ?? !helpOpen;
  $('help').classList.toggle('hidden', !helpOpen);
}

function startMatch() {
  sfx.init();
  const kits = resolveKits(sel.user, sel.ai);
  game.setupMatch({ userClub: sel.user, aiClub: sel.ai, kits, difficulty: sel.diff, minutes: sel.len });
  $('sb-home').textContent = sel.user.short;
  $('sb-away').textContent = sel.ai.short;
  badgeStyle($('sb-home-badge'), sel.user);
  badgeStyle($('sb-away-badge'), sel.ai);
  $('sb-clock').style.background = hex(kits.user.shirt === 0xf6f6f6 ? 0x1a2340 : kits.user.shirt);
  hud.setScore(0, 0);
  $('menu').classList.add('hidden');
  $('fulltime').classList.add('hidden');
  $('hud').classList.remove('hidden');
  toggleHelp(false);
  mode = 'match';
  paused = false;
  sfx.whistle();
}

function toMenu() {
  mode = 'menu';
  game.state = 'idle';
  for (const p of game.players) p.dispose();
  game.players = [];
  ball.place(0, 0);
  $('menu').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('fulltime').classList.add('hidden');
  $('nametag').classList.add('hidden');
  hud.replay(false);
  marker.visible = false;
  paused = false;
}

$('btn-start').onclick = startMatch;
$('btn-controls').onclick = () => toggleHelp(true);
$('btn-help-close').onclick = () => toggleHelp(false);
$('btn-resume').onclick = () => setPaused(false);
$('btn-quit').onclick = toMenu;
$('btn-rematch').onclick = startMatch;
$('btn-menu').onclick = toMenu;

function setPaused(v) {
  paused = v;
  $('pause').classList.toggle('hidden', !v);
}

// ------------------------------------------------------------------ camera

let camMode = 'broadcast';
const camPos = new THREE.Vector3(0, 30, 60);
const camLook = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const forward = new THREE.Vector3(0, 0, -1);
const right = new THREE.Vector3(1, 0, 0);

function updateCamera(dt, t) {
  let pos;
  let look;
  let rate = 3;
  if (mode === 'menu') {
    const a = t * 0.06;
    pos = tmpV.set(Math.cos(a) * 48, 20 + Math.sin(t * 0.1) * 4, Math.sin(a) * 32);
    look = new THREE.Vector3(0, 0, 0);
    rate = 1.5;
  } else if (game.state === 'replay') {
    const b = ball.pos;
    const sx = Math.sign(game.goalTeam.dir);
    pos = tmpV.set(b.x - sx * 9, 2.6, b.z + 11);
    look = b.clone();
    rate = 4;
  } else if (game.state === 'goal' && game.celebration) {
    const s = game.celebration.player.pos;
    pos = tmpV.set(s.x * 0.97, 3.4, s.z + 9);
    look = new THREE.Vector3(s.x, 1.1, s.z);
    rate = 2.2;
  } else {
    const b = ball.pos;
    const c = game.controlled?.pos ?? b;
    const fx = THREE.MathUtils.lerp(b.x, c.x, 0.2);
    const fz = THREE.MathUtils.lerp(b.z, c.z, 0.2);
    if (camMode === 'broadcast') {
      pos = tmpV.set(THREE.MathUtils.clamp(fx * 0.85, -44, 44), 17.5, 36.5 + fz * 0.08);
      look = new THREE.Vector3(fx * 0.93, 0, fz * 0.7 + 2);
    } else {
      const d = game.teams[0]?.dir ?? 1;
      pos = tmpV.set(fx - d * 17, 8.5, fz * 0.9);
      look = new THREE.Vector3(fx + d * 12, 0, fz);
    }
  }
  const k = 1 - Math.exp(-rate * dt);
  camPos.lerp(pos, k);
  camLook.lerp(look, k);
  camera.position.copy(camPos);
  if (game.shake > 0) {
    const s = game.shake * game.shake * 0.6;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
  }
  camera.lookAt(camLook);

  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  right.set(-forward.z, 0, forward.x);
}

// ------------------------------------------------------------------ minimap & player card

const mm = $('minimap').getContext('2d');
function drawMinimap() {
  const W = 220;
  const H = 144;
  const sx = (x) => ((x + HALF_L) / (HALF_L * 2)) * (W - 12) + 6;
  const sz = (z) => ((z + HALF_W) / (HALF_W * 2)) * (H - 12) + 6;
  mm.clearRect(0, 0, W, H);
  mm.fillStyle = 'rgba(20,60,25,0.85)';
  mm.fillRect(0, 0, W, H);
  mm.strokeStyle = 'rgba(255,255,255,0.6)';
  mm.lineWidth = 1;
  mm.strokeRect(sx(-HALF_L), sz(-HALF_W), sx(HALF_L) - sx(-HALF_L), sz(HALF_W) - sz(-HALF_W));
  mm.beginPath();
  mm.moveTo(sx(0), sz(-HALF_W));
  mm.lineTo(sx(0), sz(HALF_W));
  mm.stroke();
  mm.beginPath();
  mm.arc(sx(0), sz(0), 9.15 * ((W - 12) / 105), 0, Math.PI * 2);
  mm.stroke();
  for (const s of [-1, 1]) mm.strokeRect(s > 0 ? sx(HALF_L - 16.5) : sx(-HALF_L), sz(-20.16), sx(16.5) - sx(0), sz(20.16) - sz(-20.16));
  for (const t of game.teams) {
    const col = hex(t.kit.shirt);
    for (const p of t.players) {
      mm.fillStyle = p.isGK ? hex(t.club.gk.shirt) : col;
      mm.strokeStyle = p === game.controlled ? '#ffd400' : 'rgba(0,0,0,0.8)';
      mm.lineWidth = p === game.controlled ? 2.5 : 1;
      mm.beginPath();
      mm.arc(sx(p.pos.x), sz(p.pos.z), p === game.controlled ? 4.5 : 3.5, 0, Math.PI * 2);
      mm.fill();
      mm.stroke();
    }
  }
  mm.fillStyle = '#fff';
  mm.beginPath();
  mm.arc(sx(ball.pos.x), sz(ball.pos.z), 2.5, 0, Math.PI * 2);
  mm.fill();
}

let lastCardFor = null;
function updatePlayerCard() {
  const p = game.controlled;
  if (!p || p === lastCardFor) return;
  lastCardFor = p;
  const d = p.data;
  $('pc-num').textContent = d.num;
  $('pc-name').textContent = d.name;
  $('pc-stats').innerHTML = `<span>PAC <b>${d.pac}</b></span><span>SHO <b>${d.sho}</b></span><span>PAS <b>${d.pas}</b></span><span>DEF <b>${d.def}</b></span>`;
  $('pc-ovr').textContent = d.ovr;
}

function fmtClock(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const tag = $('nametag');
function updateNameTag() {
  const p = game.controlled;
  const show = mode === 'match' && p && game.state !== 'replay' && game.state !== 'goal';
  tag.classList.toggle('hidden', !show);
  marker.visible = !!show;
  if (!show) return;
  marker.position.set(p.pos.x, 0, p.pos.z);
  arrow.position.y = 2.35 + Math.sin(performance.now() / 180) * 0.06;
  const v = new THREE.Vector3(p.pos.x, 2.75, p.pos.z).project(camera);
  if (v.z > 1) {
    tag.classList.add('hidden');
    return;
  }
  tag.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
  tag.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
  tag.textContent = `${p.data.num} · ${p.data.back}`;
}

// ------------------------------------------------------------------ loop

const timer = new THREE.Timer();
let elapsed = 0;
let muted = false;

function handleUI() {
  for (const code of input.ui) {
    if (code === 'KeyH') toggleHelp();
    if (code === 'KeyG') camMode = camMode === 'broadcast' ? 'behind' : 'broadcast';
    if (code === 'KeyM') {
      muted = !muted;
      if (sfx.master) sfx.master.gain.value = muted ? 0 : 0.8;
    }
    if ((code === 'Escape' || code === 'KeyP') && mode === 'match' && game.state !== 'fulltime') {
      if (helpOpen) toggleHelp(false);
      else setPaused(!paused);
    }
  }
}

function frame(now) {
  timer.update(now);
  const raw = Math.max(0, timer.getDelta());
  const dt = Math.min(raw, 1 / 30);
  elapsed += dt;
  handleUI();
  const inp = input.frame(forward, right, mode === 'match' && !!game.humanHasBall());

  if (mode === 'match' && !paused && !helpOpen) {
    let acc = Math.min(raw, 0.1);
    let step = inp;
    do {
      const s = Math.min(acc, 1 / 30);
      game.update(s, step);
      acc -= s;
      step = { ...inp, pressed: new Set(), released: new Set() };
    } while (acc > 1e-4);
    $('sb-clock').textContent = fmtClock(game.clock ?? 0);
  }
  if (mode === 'match') {
    game.syncVisuals(dt);
    updatePlayerCard();
    drawMinimap();
  } else ball.updateVisual(dt);

  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) $('banner').classList.remove('show');
  }
  autoQuality(Math.min(raw, 0.5));
  updateCamera(dt, elapsed);
  updateNameTag();
  stadium.update(dt, elapsed);
  composer.render();
  input.endFrame();
  requestAnimationFrame(frame);
}

renderMenu();
$('loading').classList.add('hidden');
requestAnimationFrame(frame);

window.__game = game;
