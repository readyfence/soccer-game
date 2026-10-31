import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { HALF_L, HALF_W } from './constants.js';
import { buildStadium } from './stadium.js';
import { Ball } from './ball.js';
import { Sfx } from './audio.js';
import { Commentary } from './commentary.js';
import { Game } from './game.js';
import { OnlineSession } from './online.js';
import { hostGame, joinGame } from './netlink.js';
import { normalizeCode, toPlain } from './netcode.js';
import { statLine, ratingTier } from './ratings.js';
import { formMarkup, formView } from './form.js';
import { lookFor, HAIR_STYLES, HAIR_COLOUR_NAMES } from './appearance.js';
import { CELEBRATIONS } from './celebrations.js';
import {
  withTraining, trainedList, trainedRecord, forgetTrained, trainerHost, setTrainerHost, sendPayload, sendUrl,
  syncUrl, pingTrainer, consumeSyncFromLocation, deltaLabel, asciiName,
} from './trainer.js';
import { Input, CONTROLS, P1_COLOR, P2_COLOR } from './input.js';
import {
  TEAMS, TOWNS, AGE_BANDS, POSITIONS, SLOT_LABELS, PRO_CLUB, PRO_CALLUP_OVR, CELEBRATION_IDS,
  teamRating, resolveKits, kitsClash, shotTraits, findTown,
} from './teams.js';
import { DIFFICULTY, resolveDifficulty } from './constants.js';
import {
  loadCareer, saveCareer, clearCareer, createCareer, currentBand, userClub, opponentClub, nextFixture,
  seasonOver, finishMatch, endSeason, leagueTable, teamName, describeStage, findPlayer, updatePlayer,
  swapPlayers, updateKit, renameClub, defaultKits, callUpCandidates, pointCost, LEAGUE_SIZE,
} from './career.js';

const $ = (id) => document.getElementById(id);
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// ------------------------------------------------------------------ renderer

const canvas = $('c');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: isSafari ? 'default' : 'high-performance',
  failIfMajorPerformanceCaveat: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isSafari ? 1.25 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 4000);
camera.position.set(0, 30, 60);

const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.5, 0.88);
// Runs on linear HDR before OutputPass tone maps it.
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max(mix(vec3(luma), col, 1.06), 0.0);
      col *= vec3(1.02, 1.0, 0.97);
      vec2 d = vUv - 0.5;
      col *= 1.0 - smoothstep(0.35, 0.95, length(d * vec2(1.25, 1.0))) * 0.45;
      float n = fract(sin(dot(vUv * 1000.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      col *= 1.0 + n * 0.025;
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const smaa = new SMAAPass();
let composer = null;
try {
  const rt = new THREE.WebGLRenderTarget(1, 1, {
    type: isSafari ? THREE.UnsignedByteType : THREE.HalfFloatType,
    samples: isSafari ? 0 : 4,
    depthBuffer: true,
  });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  composer.addPass(smaa);
} catch (err) {
  console.warn('Postprocessing unavailable, using WebGL renderer', err);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  composer?.setSize(w, h);
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
if (isSafari) {
  for (const q of QUALITY) q.samples = 0;
}
let qLevel = isSafari ? 2 : 0;
let qAuto = true;
smaa.enabled = QUALITY[qLevel].samples === 0;
function applyQuality(level) {
  qLevel = level;
  const q = QUALITY[level];
  renderer.setPixelRatio(q.ratio);
  composer?.setPixelRatio(q.ratio);
  bloom.enabled = q.bloom && !!composer;
  smaa.enabled = q.samples === 0;
  for (const t of [composer?.renderTarget1, composer?.renderTarget2]) {
    if (t && t.samples !== q.samples) {
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
const unlockAudio = () => sfx.init();
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);
if (isSafari) {
  for (const el of document.querySelectorAll('.safari-only')) el.classList.remove('hidden');
}

function makeMarker(color) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.72, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.32, 3),
    new THREE.MeshBasicMaterial({ color }),
  );
  arrow.rotation.x = Math.PI;
  arrow.position.y = 2.35;
  g.add(ring, arrow);
  g.visible = false;
  g.userData.arrow = arrow;
  scene.add(g);
  return g;
}
const marker = makeMarker(P1_COLOR);
const marker2 = makeMarker(P2_COLOR);

function makeSwitchMark(color) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.5, 28),
    new THREE.MeshBasicMaterial({ color: 0xf4f7ff, transparent: true, opacity: 0.7, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  const chev = new THREE.Mesh(
    new THREE.ConeGeometry(0.15, 0.2, 3),
    new THREE.MeshBasicMaterial({ color }),
  );
  chev.rotation.x = Math.PI;
  chev.position.y = 2.2;
  g.add(ring, chev);
  g.visible = false;
  g.userData.chev = chev;
  scene.add(g);
  return g;
}
const switchMark = makeSwitchMark(0xe8eef8);
const switchMark2 = makeSwitchMark(0xffb0b0);

function makePenReticle() {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
  });
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.27, 32), mat);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), mat);
  ring.renderOrder = dot.renderOrder = 10;
  g.add(ring, dot);
  g.rotation.y = Math.PI / 2;
  g.visible = false;
  g.userData.mat = mat;
  scene.add(g);
  return g;
}
const penReticle = makePenReticle();

// ------------------------------------------------------------------ HUD

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
function badgeStyle(el, club) {
  const [a, b, c] = club.badge;
  el.style.background = `linear-gradient(135deg, ${a} 0 50%, ${b} 50% 100%)`;
  el.style.borderColor = c;
  el.style.color = '#fff';
  el.textContent = club.short;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ratingBadge = (r, cls = '') => `<span class="rating ${ratingTier(r)} ${cls}">${r.toFixed(1)}</span>`;
const posOf = (s) => (s.isGK ? 'GK' : s.role);

function renderRatings(teams, list) {
  const potmEl = $('ft-potm');
  const topsEl = $('ft-tops');
  const potm = list[0];
  if (!potm) {
    potmEl.innerHTML = topsEl.innerHTML = '';
    return;
  }
  const pt = teams[potm.teamIdx];
  potmEl.innerHTML = `<div class="potm-kicker">Player of the Match</div>
    <div class="potm-row">${ratingBadge(potm.rating, 'big')}
      <div class="potm-who">
        <div class="potm-name">${esc(potm.data.name)}</div>
        <div class="potm-meta"><span class="badge sm"></span>${esc(pt.name)} · ${posOf(potm)} · #${potm.data.num}</div>
        <div class="potm-line">${esc(statLine(potm))}</div>
        ${formMarkup(potm.form)}
      </div>
    </div>`;
  badgeStyle(potmEl.querySelector('.badge'), pt.club);
  topsEl.innerHTML = teams.map((t) => {
    const rows = list.filter((s) => s.teamIdx === t.idx && s !== potm).slice(0, 3).map((s) => `
      <div class="tp-row">${ratingBadge(s.rating)}
        <div class="tp-who"><div class="tp-name">${esc(s.data.back)} <small>${posOf(s)}${s.mins < 85 ? ` · ${s.mins}'` : ''}</small></div>
        <div class="tp-line">${esc(statLine(s))}</div>${formMarkup(s.form, 'mini')}</div>
      </div>`).join('');
    return `<div class="tp-col"><h3><span class="badge sm"></span>${esc(t.name)}</h3>${rows}</div>`;
  }).join('');
  topsEl.querySelectorAll('.tp-col .badge').forEach((el, i) => badgeStyle(el, teams[i].club));
}

let bannerTimer = 0;
const commentary = new Commentary();
const hud = {
  say(text) {
    commentary.say(text);
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
  fullTime(a, b, pens, ratings = []) {
    const pensTxt = pens ? ` (${pens.scored[0]}–${pens.scored[1]} pens)` : '';
    const pensWin = pens && pens.scored[0] !== pens.scored[1];
    const res = pensWin
      ? (pens.scored[0] > pens.scored[1] ? `${a.name} win on penalties!` : `${b.name} win on penalties!`)
      : a.score > b.score ? `${a.name} win!` : a.score < b.score ? `${b.name} win.` : 'A hard-fought draw.';
    $('ft-score').innerHTML = `<span class="badge" id="ft-ba"></span>${a.score} - ${b.score}${pensTxt}<span class="badge" id="ft-bb"></span>`;
    badgeStyle($('ft-ba'), a.club);
    badgeStyle($('ft-bb'), b.club);
    $('ft-result').textContent = res;
    renderRatings([a, b], ratings);
    lastMatchRatings = ratings;
    setTimeout(() => {
      syncFtButtons();
      $('fulltime').classList.remove('hidden');
      $('hud').classList.add('hidden');
      $('pens-board')?.classList.add('hidden');
      setOverlayFocus('fulltime', 0);
    }, 3500);
  },
  pensShow(on, teams) {
    const el = $('pens-board');
    if (!el) return;
    el.classList.toggle('hidden', !on);
    if (on && teams) {
      $('pens-n0').textContent = teams[0].short;
      $('pens-n1').textContent = teams[1].short;
    }
  },
  pensUpdate(P) {
    if (!P || !$('pens-board')) return;
    $('pens-s0').textContent = P.scored[0];
    $('pens-s1').textContent = P.scored[1];
    for (const i of [0, 1]) {
      const el = $(`pens-d${i}`);
      const marks = P.marks[i];
      const n = Math.max(5, marks.length);
      el.innerHTML = '';
      for (let k = 0; k < n; k++) {
        const dot = document.createElement('i');
        if (marks[k] === true) dot.className = 'hit';
        else if (marks[k] === false) dot.className = 'miss';
        el.appendChild(dot);
      }
    }
  },
  card(kind, p, reason) {
    const el = $('ref-card');
    if (!el) return;
    const face = $('ref-card-face');
    el.classList.remove('hidden');
    if (face) face.className = `ref-card-face ${kind}`;
    $('ref-card-name').textContent = p.data.name;
    $('ref-card-reason').textContent = reason || (kind === 'red' ? 'Sent off' : 'Booked');
    clearTimeout(hud._cardT);
    hud._cardT = setTimeout(() => el.classList.add('hidden'), 2800);
    hud.bookings();
  },
  bookings() {
    const ts = game.teams;
    if (!ts?.length) return;
    const set = (id, n) => { const el = $(id); if (el) el.textContent = String(n ?? 0); };
    set('sb-y0', ts[0].yellows);
    set('sb-r0', ts[0].reds);
    set('sb-y1', ts[1].yellows);
    set('sb-r1', ts[1].reds);
  },
  outs(left, open) {
    const el = $('sb-outs');
    if (!el) return;
    el.classList.toggle('open', !!open);
    el.textContent = open ? 'SUBS OPEN' : `OUT ${7 - left}/7`;
  },
};

const game = new Game({ scene, renderer, stadium, ball, sfx, hud });

// ------------------------------------------------------------------ menu

const DIFF_STORE = 'socker26.diff';
const MODE_STORE = 'socker26.mode';
function loadDiff() {
  try { return resolveDifficulty(localStorage.getItem(DIFF_STORE)); } catch { return 'professional'; }
}
function loadMode() {
  try {
    const v = localStorage.getItem(MODE_STORE);
    if (v === 'versus' || v === 'coop' || v === '1p') return v;
  } catch { /* ignore */ }
  return '1p';
}

const sel = { user: TEAMS[0], ai: TEAMS[2], diff: loadDiff(), len: 5, mode: loadMode() };

function twoPlayer() {
  return sel.mode === 'versus' || sel.mode === 'coop';
}

function setDifficulty(id, persist = true) {
  sel.diff = resolveDifficulty(id);
  const root = $('opt-diff');
  if (root) {
    for (const b of root.querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === sel.diff);
  }
  const d = DIFFICULTY[sel.diff];
  const blurb = $('diff-blurb');
  if (blurb) blurb.textContent = d.blurb;
  if (persist) {
    try { localStorage.setItem(DIFF_STORE, sel.diff); } catch { /* ignore */ }
  }
}

function setMode(mode, persist = true) {
  if (mode === '2p') mode = 'versus';
  if (mode !== '1p' && mode !== 'versus' && mode !== 'coop') mode = '1p';
  sel.mode = mode;
  $('mode-ai')?.classList.toggle('on', mode === '1p');
  $('mode-2p')?.classList.toggle('on', twoPlayer());
  $('mode-career')?.classList.remove('on');
  $('btn-coop')?.classList.toggle('hidden', !twoPlayer());
  if ($('btn-coop')) {
    $('btn-coop').textContent = sel.mode === 'coop'
      ? 'You vs dad instead (versus)'
      : 'Both vs AI instead (co-op)';
  }
  $('join-row')?.classList.toggle('hidden', !twoPlayer());
  $('join-kb')?.classList.toggle('hidden', !twoPlayer());
  $('label-user').textContent = sel.mode === 'coop' ? 'P1 + P2 club' : twoPlayer() ? 'P1 club' : 'Your club';
  $('label-ai').textContent = sel.mode === 'versus' ? 'P2 club' : 'Opponent (AI)';
  $('grid-user')?.closest('.side')?.classList.toggle('p1-side', twoPlayer());
  $('grid-ai')?.closest('.side')?.classList.toggle('p2-side', sel.mode === 'versus');
  const diffWrap = document.querySelector('.opt-diff-wrap');
  if (diffWrap) diffWrap.classList.toggle('hidden', sel.mode === 'versus');
  input.setPlayMode(mode === '1p' ? '1p' : mode);
  updateJoinUI();
  updateKickoffBtn();
  if (typeof menuNav !== 'undefined') menuNav.modeCard = twoPlayer() ? 'versus' : '1p';
  if (typeof applyMenuFocus === 'function') applyMenuFocus();
  if (persist) {
    try { localStorage.setItem(MODE_STORE, sel.mode); } catch { /* ignore */ }
  }
  syncOnlineMenu();
  const hint = $('menu-pad-hint');
  if (hint) {
    hint.innerHTML = twoPlayer()
      ? `<span class="xb-dot a"></span> Each pad: press A to join (first A is P1)
         <span class="xb-dot b"></span> Leave
         <span class="sep">·</span> Each stick picks that player's club
         <span class="sep">·</span> Menu / Kick Off starts
         <span class="sep">·</span> Keyboard: 1 joins P1, 2 joins P2`
      : `<span class="xb-dot a"></span> Confirm
         <span class="xb-dot b"></span> Back
         <span class="sep">·</span> Left stick / D-pad move
         <span class="sep">·</span> LB / RB switch clubs
         <span class="sep">·</span> View controls
         <span class="sep">·</span> Plug in an Xbox pad, then press a button`;
  }
}

function updateJoinUI() {
  if (!twoPlayer() || net) {
    updateKickoffBtn();
    return;
  }
  const st = input.joinStatus();
  for (let i = 0; i < 2; i++) {
    const el = $(`join-p${i + 1}`);
    if (!el) continue;
    el.textContent = st[i].text;
    el.classList.toggle('ready', st[i].ready);
  }
  updateKickoffBtn();
}

function updateKickoffBtn() {
  const btn = $('btn-start');
  if (!btn) return;
  if (net) {
    btn.disabled = !isHost();
    btn.textContent = isHost() ? 'KICK OFF (ONLINE)' : 'Waiting for the host…';
    return;
  }
  const ready = !twoPlayer() || input.bothJoined();
  btn.disabled = !ready;
  btn.textContent = ready ? 'KICK OFF' : 'Waiting for P1 & P2…';
}

// Friendlies: your career team (if you have one) plus every local club at U14 strength.
let friendlyCareerClub = null;
function refreshFriendlyClubs() {
  const c = loadCareer();
  friendlyCareerClub = c ? userClub(c) : null;
  for (const side of ['user', 'ai']) {
    if (sel[side]?.kind === 'career') sel[side] = friendlyCareerClub || TEAMS[side === 'user' ? 0 : 2];
  }
}

function pickerTeams() {
  return friendlyCareerClub ? [friendlyCareerClub, ...TEAMS] : TEAMS;
}

function clubCard(club, side) {
  const el = document.createElement('div');
  el.className = 'club';
  const tag = club.kind === 'career' ? '<span class="ckind dream">YOURS</span>' : '';
  const rate = `OVR ${teamRating({ players: club.players.map(withTraining) })}`;
  el.innerHTML = `<span class="badge"></span><span class="cname">${club.name}</span>${tag}<span class="crate">${rate}</span>`;
  badgeStyle(el.querySelector('.badge'), club);
  el.onclick = () => {
    sel[side] = club;
    renderMenu();
  };
  return el;
}

function clubInfo(club) {
  const k = club.home;
  const top = club.players.map(withTraining).sort((a, b) => b.ovr - a.ovr).slice(0, 6);
  return `<div class="ci-head"><span class="badge" data-club="${club.id}"></span><div><div class="ci-title">${esc(club.name)}</div>
    <div>Team OVR <b>${teamRating({ players: club.players.map(withTraining) })}</b> · Kit <span class="kit"><i style="background:${hex(k.shirt)}"></i><i style="background:${hex(k.shorts)}"></i><i style="background:${hex(k.socks)}"></i></span>
    GK <span class="kit"><i style="background:${hex(club.gk.shirt)}"></i></span></div></div></div>
    <div class="stars">${top.map((p) => `<div><span>#${p.num} ${esc(p.name)}${trainedStar(p)}</span><b>${p.ovr}</b></div>`).join('')}</div>`;
}

function renderMenu() {
  for (const side of ['user', 'ai']) {
    const grid = $(`grid-${side}`);
    grid.innerHTML = '';
    for (const c of pickerTeams(side)) {
      const card = clubCard(c, side);
      if (c.kind === 'career') card.classList.add('dream');
      if (sel[side] === c) card.classList.add('on');
      grid.appendChild(card);
    }
    const info = $(`info-${side}`);
    info.innerHTML = clubInfo(sel[side]);
    badgeStyle(info.querySelector('.badge'), sel[side]);
  }
  updateJoinUI();
  sendLobby();
  if (typeof applyMenuFocus === 'function') applyMenuFocus();
}

function segment(id, key, parse) {
  const root = $(id);
  if (!root) return;
  for (const b of root.querySelectorAll('button')) {
    b.onclick = () => {
      for (const o of $(id).querySelectorAll('button')) o.classList.remove('on');
      b.classList.add('on');
      sel[key] = parse(b.dataset.v);
      if (key === 'diff') setDifficulty(b.dataset.v);
    };
  }
}
segment('opt-diff', 'diff', (v) => v);
setDifficulty(sel.diff, false);
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
let trainerOpen = false;
let quitOpen = false;
let pausedBeforeQuit = false;
let reconnecting = false;
let subsOpen = false;
let crNewOpen = false;
let crHubOpen = false;
let crPlayerOpen = false;
let crKitOpen = false;
let inCareerMatch = false;
let crFixtureId = null;
let crTown = TOWNS[0];
const crNav = { zone: 'grid', idx: 0, opt: 1 };
const crHubNav = { idx: 0 };
const subUI = { team: 0, col: 0, out: 0, inn: 0, from: '' };

// ------------------------------------------------------------------ trainer

const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

function trainedStar(pl) {
  return pl?.trained ? '<span class="trained-star" title="Trained on the handheld trainer">★</span>' : '';
}

const trainerUI = { query: '' };

function gameUrl() {
  return `${location.origin}${location.pathname}${location.search}`;
}

function openTrainer() {
  trainerOpen = true;
  $('trainer-host').value = trainerHost();
  $('trainer-search').value = trainerUI.query;
  $('trainer').classList.remove('hidden');
  renderTrainer();
  setOverlayFocus('trainer', 1);
  checkTrainer();
}

function closeTrainer() {
  if (!trainerOpen) return;
  setTrainerHost($('trainer-host').value);
  trainerOpen = false;
  $('trainer').classList.add('hidden');
  refreshFriendlyClubs();
  renderMenu();
  if (crHubOpen) renderCareerHub();
  else applyMenuFocus();
}

async function checkTrainer() {
  const el = $('trainer-status');
  setTrainerHost($('trainer-host').value);
  el.className = 'trainer-status';
  if (location.protocol === 'https:') {
    el.textContent = 'Can’t check from https — just try Send';
    el.classList.add('warn');
    return;
  }
  el.textContent = 'Looking…';
  const info = await pingTrainer();
  if (!trainerOpen) return;
  if (info?.ok) {
    el.textContent = info.player ? `Connected · ${info.player} is training` : 'Connected · no player yet';
    el.classList.add('ok');
  } else {
    el.textContent = 'Not found — tap LINK on the trainer';
    el.classList.add('warn');
  }
}

function sendToTrainer(pl) {
  setTrainerHost($('trainer-host').value);
  const state = loadCareer();
  if (!state) return;
  const payload = sendPayload(pl, { team: userClub(state), look: lookFor(pl), ret: gameUrl() });
  location.href = sendUrl(payload);
}

function syncFromTrainer() {
  setTrainerHost($('trainer-host').value);
  location.href = syncUrl(gameUrl());
}

function renderTrainer() {
  const list = $('trainer-list');
  list.innerHTML = '';
  const state = loadCareer();
  const q = asciiName(trainerUI.query).toLowerCase();
  const rows = state ? state.squad.filter((pl) => !q || asciiName(pl.name).toLowerCase().includes(q)) : [];
  for (const raw of rows) {
    const pl = withTraining(raw);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'drow';
    b.innerHTML = `<span class="dwho">${escHtml(pl.name)}${trainedStar(pl)}</span>`
      + `<span class="dmeta">#${pl.num} · ${escHtml(pl.pos)}</span>`
      + `<span class="dstat">${pl.ovr}</span><span class="dsend">SEND</span>`;
    b.onclick = () => sendToTrainer(raw);
    list.appendChild(b);
  }
  if (!state) list.innerHTML = '<p class="tip">Start a Career first. Then you can send your players to the trainer.</p>';
  else if (!rows.length) list.innerHTML = '<p class="tip">No players match that search.</p>';

  const trained = $('trainer-trained');
  trained.innerHTML = '';
  for (const rec of trainedList()) {
    const row = document.createElement('div');
    row.className = 'drow trow';
    const when = rec.at ? new Date(rec.at).toLocaleDateString() : '';
    const coach = rec.coach ? `Coach ${escHtml(rec.coach)} · ` : '';
    const steps = rec.log?.steps ? ` · ${rec.log.steps.toLocaleString()} steps` : '';
    const current = state && findPlayer(state, rec.id);
    row.innerHTML = `<span class="dwho">${escHtml(current?.name || rec.name || rec.id)}<span class="trained-star">★</span></span>`
      + `<span class="dmeta">${coach}${when}</span>`
      + '<button type="button" class="dforget">Forget</button>'
      + `<span class="dgain">${escHtml(deltaLabel(rec.train || []))} · OVR +${rec.train?.[4] ?? 0}${steps}</span>`;
    row.querySelector('.dforget').onclick = () => {
      if (!window.confirm(`Remove ${current?.name || rec.name}'s training from this game? The trainer keeps its copy.`)) return;
      forgetTrained(rec.id);
      renderTrainer();
    };
    trained.appendChild(row);
  }
  if (!trained.children.length) {
    trained.innerHTML = '<p class="tip">Nobody yet. Send a player, train him on the device, then press Sync.</p>';
  }
}

function showSyncResult(res) {
  if (!res) return;
  const el = $('trainer-toast');
  el.classList.remove('err');
  if (res.error) {
    el.textContent = res.error;
    el.classList.add('err');
  } else {
    const gained = res.gained.slice(0, 4).some((v) => v > 0) ? deltaLabel(res.gained) : 'No new gains since last sync';
    const total = trainedRecord(res.id)?.train?.[4] ?? 0;
    el.innerHTML = `${escHtml(res.name)} is back from training!`
      + `<span class="tt-sub">${escHtml(gained)} · OVR +${total} overall</span>`;
  }
  el.classList.remove('hidden');
  const hide = () => el.classList.add('hidden');
  el.onclick = hide;
  clearTimeout(showSyncResult.t);
  showSyncResult.t = setTimeout(hide, 7000);
  refreshFriendlyClubs();
  renderMenu();
}

$('trainer-search')?.addEventListener('input', (e) => {
  trainerUI.query = e.target.value;
  renderTrainer();
});
$('trainer-host')?.addEventListener('change', () => checkTrainer());
$('btn-trainer-check')?.addEventListener('click', () => checkTrainer());
$('btn-trainer-sync')?.addEventListener('click', () => syncFromTrainer());
$('btn-trainer-done')?.addEventListener('click', () => closeTrainer());

// ------------------------------------------------------------------ online two-player

var net = null; // OnlineSession while connected (var: read by setMode during start-up)
var onlineUi = { open: false, view: '', abort: null };

const isHost = () => net?.role === 'host';
const isGuest = () => net?.role === 'guest';

function onlineStatus(text, kind = '') {
  const el = $('online-status');
  el.textContent = text || '';
  el.className = `online-status${kind ? ` ${kind}` : ''}`;
}

function showOnlineView(view, title) {
  onlineUi.open = true;
  onlineUi.view = view;
  $('online-title').textContent = title;
  for (const v of ['host', 'join', 'guest']) $(`online-${v}`).classList.toggle('hidden', v !== view);
  $('online').classList.remove('hidden');
}

function closeOnlineOverlay() {
  onlineUi.open = false;
  $('online').classList.add('hidden');
}

function syncOnlineMenu() {
  const two = sel.mode === 'versus' || sel.mode === 'coop';
  $('online-row')?.classList.toggle('hidden', !two || !!net);
  const chip = $('online-chip');
  if (chip) {
    chip.classList.toggle('hidden', !net);
    chip.classList.toggle('ok', !!net);
    const ping = net?.rtt != null ? ` · ${net.rtt} ms` : '';
    $('online-chip-text').textContent = isHost()
      ? `Online: friend connected${ping}. You are P1 (left club); your friend is P2 (right club).`
      : '';
  }
  if (net) {
    $('join-row')?.classList.add('hidden');
    $('join-kb')?.classList.add('hidden');
    $('btn-coop')?.classList.add('hidden');
    $('label-ai').textContent = "Friend's club (online)";
  }
}

function lobbyClub(c) {
  return c ? { name: c.name, short: c.short, badge: c.badge } : null;
}

function sendLobby() {
  if (!isHost()) return;
  net.send({ t: 'lobby', user: lobbyClub(sel.user), ai: lobbyClub(sel.ai), len: sel.len, diff: sel.diff });
}

function startOnlineSession(link, role) {
  net = new OnlineSession({
    link, role, game, hud, sfx, stadium,
    onMessage: onOnlineMessage,
    onClose: () => onOnlineClosed(),
  });
  input.setPlayMode('1p');
  input.resetJoin();
}

async function hostOnline() {
  if (net) return;
  showOnlineView('host', 'Host an online game');
  $('online-code').textContent = '·····';
  onlineStatus('Getting a code…');
  const abort = new AbortController();
  onlineUi.abort = abort;
  try {
    const link = await hostGame({
      signal: abort.signal,
      onCode: (code) => {
        $('online-code').textContent = code;
        onlineStatus('Waiting for your friend to join…');
      },
    });
    onlineUi.abort = null;
    startOnlineSession(link, 'host');
    closeOnlineOverlay();
    setMode('versus');
    renderMenu();
    sendLobby();
  } catch (err) {
    onlineUi.abort = null;
    if (err?.message !== 'cancelled') onlineStatus(err?.message || 'Could not host a game.', 'err');
  }
}

function joinOnlineView() {
  if (net) return;
  showOnlineView('join', 'Join an online game');
  onlineStatus('');
  const inp = $('online-code-input');
  inp.value = '';
  setTimeout(() => inp.focus(), 50);
}

async function joinOnline() {
  if (net) return;
  const raw = $('online-code-input').value;
  if (!normalizeCode(raw)) {
    onlineStatus('Codes are 5 letters and numbers, like K7Q2M.', 'err');
    return;
  }
  onlineStatus('Connecting…');
  $('btn-online-connect').disabled = true;
  try {
    const link = await joinGame(raw);
    startOnlineSession(link, 'guest');
    showGuestLobby();
  } catch (err) {
    onlineStatus(err?.message || 'Could not join that game.', 'err');
  } finally {
    $('btn-online-connect').disabled = false;
  }
}

var guestLobby = null;
var guestPick = null;

function showGuestLobby() {
  showOnlineView('guest', 'Connected');
  onlineStatus('Waiting for the host to kick off…', 'ok');
  renderGuestLobby();
}

function renderGuestLobby() {
  const L = guestLobby;
  $('online-guest-picks').textContent = L
    ? `Host's club: ${L.user?.name ?? '…'} · ${L.len} min match. You play as ${L.ai?.name ?? '…'}.`
    : 'Connected! The host is picking the match.';
  const grid = $('online-guest-grid');
  grid.innerHTML = '';
  for (const c of pickerTeams()) {
    const el = document.createElement('div');
    const on = guestPick ? guestPick === c : L?.ai?.name === c.name;
    el.className = `club${on ? ' on' : ''}`;
    el.innerHTML = `<span class="badge"></span><span class="cname">${esc(c.name)}</span>`;
    badgeStyle(el.querySelector('.badge'), c);
    el.onclick = () => {
      guestPick = c;
      net?.send({ t: 'pick', club: toPlain(c) });
      renderGuestLobby();
    };
    grid.appendChild(el);
  }
}

function onOnlineMessage(msg) {
  switch (msg.t) {
    case 'lobby':
      if (isGuest()) {
        guestLobby = msg;
        if (onlineUi.open && onlineUi.view === 'guest') renderGuestLobby();
      }
      break;
    case 'pick':
      if (isHost() && msg.club?.players?.length === 11) {
        sel.ai = msg.club;
        renderMenu();
      }
      break;
    case 'start':
      if (isGuest()) startGuestMatch(msg);
      break;
    case 'tomenu':
      if (isGuest()) {
        leaveMatch();
        $('menu').classList.add('hidden');
        showGuestLobby();
      }
      break;
    case 'req':
      if (!isHost() || mode !== 'match') break;
      if (msg.what === 'pause' && game.state !== 'fulltime') setPaused(!paused);
      if (msg.what === 'secondHalf' && game.state === 'halftime') {
        game.continueHalf = true;
        $('halftime')?.classList.add('hidden');
      }
      break;
    case 'full':
      onlineStatus('That game already has two players.', 'err');
      break;
    default:
      break;
  }
}

function startGuestMatch(msg) {
  if (!msg.user?.players || !msg.ai?.players) return;
  closeOnlineOverlay();
  sel.user = msg.user;
  sel.ai = msg.ai;
  sel.diff = resolveDifficulty(msg.diff);
  sel.len = Number(msg.len) || sel.len;
  net.guestPrepare();
  startMatch({ online: 'guest' });
}

function onOnlineClosed() {
  const wasMatch = mode === 'match';
  const wasHost = net?.role === 'host';
  net = null;
  guestLobby = null;
  guestPick = null;
  $('online-badge')?.classList.add('hidden');
  input.setPlayMode(sel.mode === 'versus' || sel.mode === 'coop' ? sel.mode : '1p');
  if (onlineUi.open) closeOnlineOverlay();
  $('online-notice-title').textContent = wasHost ? 'Your friend left' : 'Lost the host';
  $('online-notice-text').textContent = wasMatch
    ? 'The online game has ended.'
    : 'The connection closed. You can host or join again from Two Player.';
  if (wasMatch) paused = true;
  $('online-notice').classList.remove('hidden');
  syncOnlineMenu();
}

function leaveOnline() {
  if (!net) return;
  const s = net;
  net = null;
  s.close();
  $('online-badge')?.classList.add('hidden');
  input.setPlayMode(sel.mode === 'versus' || sel.mode === 'coop' ? sel.mode : '1p');
  syncOnlineMenu();
}

function cancelOnline() {
  if (onlineUi.abort) {
    onlineUi.abort.abort();
    onlineUi.abort = null;
  }
  if (isGuest()) leaveOnline();
  closeOnlineOverlay();
  syncOnlineMenu();
  updateKickoffBtn();
}

function updateOnlineBadge() {
  const el = $('online-badge');
  if (!el) return;
  const show = !!net && mode === 'match';
  el.classList.toggle('hidden', !show);
  if (!show) return;
  const late = net.rtt != null && net.rtt > 180;
  el.classList.toggle('warn', late);
  el.textContent = `Online · ${isHost() ? 'you host (P1)' : 'you are P2'}${net.rtt != null ? ` · ${net.rtt} ms` : ''}`;
}

// The guest mirrors the host's pause screen; its Resume asks the host to resume.
var guestPauseShown = false;
function syncGuestPause() {
  if (!isGuest() || mode !== 'match') return;
  const want = !!net.hostPaused;
  if (want === guestPauseShown) return;
  guestPauseShown = want;
  $('pause').classList.toggle('hidden', !want);
  $('btn-subs')?.classList.toggle('hidden', want);
  $('pause-diff').textContent = want ? 'Paused by the host' : $('pause-diff').textContent;
}

$('btn-online-host')?.addEventListener('click', () => hostOnline());
$('btn-online-join')?.addEventListener('click', () => joinOnlineView());
$('btn-online-connect')?.addEventListener('click', () => joinOnline());
$('online-code-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinOnline();
});
$('btn-online-cancel')?.addEventListener('click', () => cancelOnline());
$('btn-online-leave')?.addEventListener('click', () => {
  leaveOnline();
  setMode(sel.mode, false);
  renderMenu();
});
$('btn-online-copy')?.addEventListener('click', async () => {
  const code = $('online-code').textContent.trim();
  try {
    await navigator.clipboard.writeText(code);
    onlineStatus('Code copied. Waiting for your friend to join…');
  } catch {
    onlineStatus(`Your code is ${code}. Waiting for your friend…`);
  }
});
$('btn-online-notice-ok')?.addEventListener('click', () => {
  $('online-notice').classList.add('hidden');
  toMenu();
});
setInterval(() => {
  if (net && mode === 'menu') syncOnlineMenu();
}, 2000);


function toggleHelp(force) {
  helpOpen = force ?? !helpOpen;
  $('help').classList.toggle('hidden', !helpOpen);
  if (helpOpen) setOverlayFocus('help', 0);
  else applyMenuFocus();
}

function startMatch(opts = {}) {
  const career = !!opts.career;
  const online = net ? net.role : null;
  if (online === 'guest' && opts.online !== 'guest') return; // only the host kicks off
  if (!career && !online && twoPlayer() && !input.bothJoined()) return;
  sfx.init();
  const kits = resolveKits(sel.user, sel.ai);
  const matchMode = online ? 'versus' : career ? '1p' : sel.mode;
  game.setupMatch({
    userClub: sel.user, aiClub: sel.ai, kits, difficulty: sel.diff, minutes: sel.len,
    matchMode, pads: input.slots.map((s) => s.padIndex),
    allowDraw: !!opts.allowDraw,
  });
  if (online === 'host') {
    net.hostBeginMatch({ user: toPlain(sel.user), ai: toPlain(sel.ai), diff: sel.diff, len: sel.len });
  }
  $('sb-home').textContent = sel.user.short;
  $('sb-away').textContent = sel.ai.short;
  badgeStyle($('sb-home-badge'), sel.user);
  badgeStyle($('sb-away-badge'), sel.ai);
  $('sb-clock').style.background = hex(kits.user.shirt === 0xf6f6f6 ? 0x1a2340 : kits.user.shirt);
  hud.setScore(0, 0);
  const d = DIFFICULTY[sel.diff];
  const bandLabel = career ? (sel.user.band || '').toUpperCase() : '';
  $('sb-diff').textContent = online ? 'ONLINE' : career ? `${bandLabel} · ${d.short}` : sel.mode === 'versus' ? '2P' : sel.mode === 'coop' ? 'CO-OP' : d.short;
  $('pause-diff').textContent = online ? 'Online match' : career ? `Career ${bandLabel} · ${d.label}` : sel.mode === 'versus' ? 'Two Player' : sel.mode === 'coop' ? `Co-op · ${d.label}` : d.label;
  guestPauseShown = false;
  $('btn-subs')?.classList.toggle('hidden', online === 'guest');
  $('btn-ht-subs')?.classList.toggle('hidden', online === 'guest');
  $('playercard2')?.classList.toggle('hidden', matchMode !== 'versus' && matchMode !== 'coop');
  $('menu').classList.add('hidden');
  hideCareerOverlays();
  $('trainer')?.classList.add('hidden');
  trainerOpen = false;
  $('fulltime').classList.add('hidden');
  $('quit-confirm').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('reconnect')?.classList.add('hidden');
  $('pens-board')?.classList.add('hidden');
  $('halftime')?.classList.add('hidden');
  $('subs')?.classList.add('hidden');
  $('ref-card')?.classList.add('hidden');
  $('help').classList.add('hidden');
  $('hud').classList.remove('hidden');
  hud.bookings();
  hud.outs(7, false);
  lastCard = [null, null];
  subsOpen = false;
  helpOpen = false;
  if (!career) inCareerMatch = false;
  mode = 'match';
  paused = false;
  quitOpen = false;
  reconnecting = false;
  input.latchMenu();
  sfx.whistle();
}

function leaveMatch() {
  net?.endMatch();
  mode = 'menu';
  game.state = 'idle';
  game.celebration = null;
  game.controlled = null;
  game.owner = null;
  game.humans = [];
  for (const p of game.players) p.dispose();
  game.players = [];
  game.teams = [];
  ball.place(0, 0);
  $('hud').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('quit-confirm').classList.add('hidden');
  $('fulltime').classList.add('hidden');
  $('reconnect')?.classList.add('hidden');
  $('nametag').classList.add('hidden');
  $('nametag2')?.classList.add('hidden');
  $('pens-board')?.classList.add('hidden');
  $('halftime')?.classList.add('hidden');
  $('subs')?.classList.add('hidden');
  $('ref-card')?.classList.add('hidden');
  $('playercard2')?.classList.add('hidden');
  subsOpen = false;
  hud.replay(false);
  marker.visible = false;
  marker2.visible = false;
  switchMark.visible = false;
  switchMark2.visible = false;
  $('switch-tag')?.classList.add('hidden');
  $('switch-tag2')?.classList.add('hidden');
  paused = false;
  quitOpen = false;
  reconnecting = false;
}

function toMenu() {
  if (isHost() && mode === 'match') net.send({ t: 'tomenu' });
  if (isGuest() && mode === 'match') {
    // A guest leaving the match leaves the online game.
    leaveOnline();
  }
  leaveMatch();
  inCareerMatch = false;
  hideCareerOverlays();
  refreshFriendlyClubs();
  renderMenu();
  $('menu').classList.remove('hidden');
  if (twoPlayer()) input.resetJoin();
  setMode(sel.mode, false);
  menuNav.zone = 'mode';
  applyMenuFocus();
}

function syncFtButtons() {
  const career = inCareerMatch;
  $('btn-rematch')?.classList.toggle('hidden', career || isGuest());
  $('btn-menu')?.classList.toggle('hidden', career);
  $('btn-menu').textContent = isGuest() ? 'Leave online game' : 'Change teams';
  $('btn-ft-continue')?.classList.toggle('hidden', !career);
}

// ------------------------------------------------------------------ career

const SKIN_SWATCHES = ['#f7d9c8', '#f0c8ae', '#dcab88', '#bd8662', '#8e5b3c', '#5c3822', '#3b2214'];
const HAIR_LABELS = {
  buzz: 'Buzz cut', crop: 'Short crop', slick: 'Slicked back', curly: 'Curly', afro: 'Afro',
  dreads: 'Dreads', long: 'Long', bun: 'Man bun', bald: 'Shaved',
};
const STAT_KEYS = ['pac', 'sho', 'pas', 'def'];
const STAT_LABEL = { pac: 'PAC', sho: 'SHO', pas: 'PAS', def: 'DEF' };

let careerReport = null;
let seasonReport = null;
let lastMatchRatings = [];
const editUI = { id: null, look: null };
let kitDraft = null;

function townBadge(t) {
  return { short: t.short, badge: [hex(t.home.shirt), hex(t.home.trim), hex(t.home.shorts)] };
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function careerOverlayOpen() {
  return crNewOpen || crHubOpen || crPlayerOpen || crKitOpen;
}

function hideCareerOverlays() {
  for (const id of ['career-new', 'career-hub', 'career-player', 'career-kit']) $(id)?.classList.add('hidden');
  crNewOpen = false;
  crHubOpen = false;
  crPlayerOpen = false;
  crKitOpen = false;
}

function openCareer() {
  if (loadCareer()) showCareerHub();
  else showCareerNew();
}

function showCareerNew() {
  hideCareerOverlays();
  crNewOpen = true;
  inCareerMatch = false;
  crNav.zone = 'grid';
  crNav.idx = Math.max(0, TOWNS.indexOf(crTown));
  crNav.opt = 1;
  $('menu').classList.add('hidden');
  $('career-new').classList.remove('hidden');
  $('career-nick').value = crTown.nickname;
  renderCareerNew();
}

function renderCareerNew() {
  const grid = $('career-towns');
  grid.innerHTML = '';
  TOWNS.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = `club${t === crTown ? ' on' : ''}`;
    el.innerHTML = `<span class="badge"></span><span class="cname">${esc(t.town)}</span><span class="crate">${esc(t.nickname)}</span>`;
    badgeStyle(el.querySelector('.badge'), townBadge(t));
    el.onclick = () => {
      const nick = $('career-nick');
      if (!nick.value.trim() || nick.value === crTown.nickname) nick.value = t.nickname;
      crTown = t;
      crNav.idx = i;
      renderCareerNew();
    };
    grid.appendChild(el);
  });
  $('career-town-label').textContent = crTown.town;
  paintCareerFocus();
}

function startNewCareer() {
  const state = createCareer({ townId: crTown.id, nickname: $('career-nick').value });
  saveCareer(state);
  careerReport = null;
  seasonReport = null;
  showCareerHub();
}

function showCareerHub() {
  hideCareerOverlays();
  crHubOpen = true;
  inCareerMatch = false;
  $('menu').classList.add('hidden');
  $('career-hub').classList.remove('hidden');
  renderCareerHub();
}

function toCareerHub() {
  leaveMatch();
  inCareerMatch = false;
  showCareerHub();
}

function startCareerMatch() {
  const state = loadCareer();
  const fx = state && nextFixture(state);
  if (!fx) return;
  const oppId = fx.home === 'career' ? fx.away : fx.home;
  const opp = opponentClub(state, oppId);
  const mine = userClub(state);
  if (!opp) return;
  // Away days: wear the away kit unless it clashes with the home side.
  if (fx.away === 'career' && !kitsClash(mine.away, opp.home)) mine.home = mine.away;
  sel.user = mine;
  sel.ai = opp;
  inCareerMatch = true;
  crFixtureId = fx.id;
  careerReport = null;
  seasonReport = null;
  startMatch({ career: true, allowDraw: true });
  hud.say(`${describeStage(state)} · ${mine.short} vs ${opp.short}`);
}

function continueCareer() {
  const state = loadCareer();
  if (!state || !game.teams?.length) {
    toCareerHub();
    return;
  }
  const [userTeam, aiTeam] = game.teams;
  const lines = (lastMatchRatings || []).filter((s) => s.teamIdx === 0);
  const fx = state.league.fixtures.find((f) => f.id === crFixtureId);
  const oppId = fx ? (fx.home === 'career' ? fx.away : fx.home) : '';
  careerReport = finishMatch(state, crFixtureId, userTeam.score, aiTeam.score, lines);
  if (careerReport) careerReport.opp = teamName(state, oppId);
  saveCareer(state);
  toCareerHub();
}

function finishCareerSeason() {
  const state = loadCareer();
  const res = state && endSeason(state);
  if (!res) return;
  saveCareer(state);
  seasonReport = res;
  careerReport = null;
  renderCareerHub();
}

function careerPlayerName(state, id) {
  return findPlayer(state, id)?.name || 'A player';
}

function gainText(gained) {
  return STAT_KEYS.filter((k) => gained?.[k] > 0).map((k) => `${STAT_LABEL[k]} +${gained[k]}`).join(' · ');
}

function renderCareerReport(state) {
  const el = $('career-report');
  if (careerReport) {
    const r = careerReport;
    const word = r.result > 0 ? 'Won' : r.result < 0 ? 'Lost' : 'Drew';
    const rows = r.players.slice(0, 6).map((p) => {
      const g = gainText(p.gained);
      return `<div class="cr-row"><span>${esc(p.name)}</span><span class="cr-rate">${(p.rating ?? 6).toFixed(1)}</span>`
        + `<span class="cr-xp">+${p.xp} XP</span><span class="cr-gain">${g ? esc(g) : ''}</span></div>`;
    }).join('');
    const scouts = r.scouts?.length
      ? `<p class="cr-scout">Scouts from ${esc(PRO_CLUB.name)} are watching ${esc(r.scouts.map((id) => careerPlayerName(state, id)).join(', '))}.</p>`
      : '';
    el.innerHTML = `<h3>${word} ${r.userGoals}–${r.oppGoals} vs ${esc(r.opp || 'opponents')}</h3>${rows}${scouts}`;
    el.classList.remove('hidden');
    return;
  }
  if (seasonReport) {
    const r = seasonReport;
    const s = r.summary;
    const avg = (key) => Math.round(r.growth.reduce((a, g) => a + g[key], 0) / Math.max(1, r.growth.length));
    let extra = '';
    if (r.finished) {
      extra = `<p class="cr-big">${esc(r.calledUp.map((id) => careerPlayerName(state, id)).join(' and '))} `
        + `${r.calledUp.length > 1 ? 'have' : 'has'} been called up to ${esc(r.pro.name)}!</p>`;
    } else if (r.academyInvite) {
      extra = `<p class="cr-big">The ${esc(PRO_CLUB.name)} Academy has invited your team! Next stop: ${esc(r.next.label)} ${esc(r.next.tier)}.</p>`;
    } else if (r.next) {
      extra = `<p>Everyone moves up to ${esc(r.next.label)} ${esc(r.next.tier)}.</p>`;
    }
    el.innerHTML = `<h3>${esc(s.label)}: ${s.champions ? 'Champions!' : `finished ${ordinal(s.place)} of ${s.of}`}</h3>`
      + `<p>W${s.w} D${s.d} L${s.l} · ${s.gf} scored, ${s.ga} conceded · ${s.pts} pts</p>`
      + `<p>Growing up: team average OVR ${avg('ovrBefore')} → ${avg('ovrAfter')}</p>${extra}`;
    el.classList.remove('hidden');
    return;
  }
  el.innerHTML = '';
  el.classList.add('hidden');
}

function renderCareerHub() {
  const state = loadCareer();
  if (!state) {
    showCareerNew();
    return;
  }
  const band = currentBand(state);
  const club = userClub(state);
  $('career-title').textContent = club.name;
  $('career-stage').textContent = state.done ? 'Career complete' : describeStage(state);
  const you = $('career-you');
  you.innerHTML = `<span class="badge sm"></span>${esc(band.label)}`;
  badgeStyle(you.querySelector('.badge'), club);

  $('career-ladder').innerHTML = AGE_BANDS.map((b, i) => {
    const cls = state.done || i < state.band ? 'done' : i === state.band ? 'now' : '';
    return `<span class="rung ${cls}">${b.label}<small>${b.academy ? 'Academy' : b.tier.replace(' League', '')}</small></span>`;
  }).join('') + `<span class="rung pro${state.done ? ' now' : ''}">PRO<small>${esc(PRO_CLUB.name)}</small></span>`;

  const over = seasonOver(state);
  const next = nextFixture(state);
  const table = leagueTable(state);
  const st = $('career-status');
  st.className = 'wc-status';
  if (state.done) {
    st.classList.add('champ');
    const names = (state.calledUp || []).map((id) => careerPlayerName(state, id)).join(' and ');
    st.textContent = `${names} called up to ${PRO_CLUB.name}! From U8 to the pros. Career complete.`;
  } else if (over) {
    const place = table.findIndex((r) => r.id === 'career') + 1;
    st.textContent = `Season over: you finished ${ordinal(place)} of ${table.length}. Finish the season to move up an age group.`;
  } else {
    const scouts = callUpCandidates(state);
    st.textContent = band.academy
      ? (scouts.length
        ? `Scouts are watching ${scouts.map((id) => careerPlayerName(state, id)).join(', ')}. Keep it up to earn a call-up!`
        : `Academy football. Get a player to ${PRO_CALLUP_OVR} OVR and the pros will call.`)
      : `${band.label} ${band.tier}. Win games and train players to grow your team.`;
  }
  renderCareerReport(state);

  const nextEl = $('career-next');
  if (next && !state.done) {
    const home = next.home === 'career' ? club : opponentClub(state, next.home);
    const away = next.away === 'career' ? club : opponentClub(state, next.away);
    nextEl.innerHTML = `<div><div class="wn-kicker">Your next match · ${next.home === 'career' ? 'Home' : 'Away'}</div>
      <div class="wn-teams"><span class="badge sm" data-n="h"></span>${esc(home.name)} vs ${esc(away.name)}<span class="badge sm" data-n="a"></span></div>
      <div class="wn-meta">Matchday ${next.round} of ${LEAGUE_SIZE - 1} · ${esc(away === club ? home.town : club.town)}</div></div>`;
    badgeStyle(nextEl.querySelector('[data-n="h"]'), home);
    badgeStyle(nextEl.querySelector('[data-n="a"]'), away);
  } else nextEl.innerHTML = '';

  $('career-table').innerHTML = `<table class="wc-table"><thead><tr><th>#</th><th class="team">Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>${
    table.map((r, i) => `<tr class="${r.id === 'career' ? 'you' : ''}"><td>${i + 1}</td>`
      + `<td class="team">${esc(teamName(state, r.id))}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>`
      + `<td>${r.gf - r.ga}</td><td>${r.pts}</td></tr>`).join('')}</tbody></table>`;

  const mine = state.league.fixtures.filter((f) => f.hg != null && (f.home === 'career' || f.away === 'career'));
  $('career-results').innerHTML = mine.length
    ? mine.map((f) => {
      const us = f.home === 'career' ? f.hg : f.ag;
      const them = f.home === 'career' ? f.ag : f.hg;
      const res = us > them ? 'w' : us < them ? 'l' : 'd';
      const opp = f.home === 'career' ? f.away : f.home;
      return `<div class="cr-res ${res}"><b>${res.toUpperCase()}</b> ${us}–${them} ${f.home === 'career' ? 'vs' : 'at'} ${esc(teamName(state, opp))}</div>`;
    }).join('')
    : '<p class="tip">No games played yet this season.</p>';

  const squad = $('career-squad');
  squad.innerHTML = '';
  state.squad.forEach((raw, i) => {
    if (i === SLOT_LABELS.length) {
      const div = document.createElement('div');
      div.className = 'cs-divider';
      div.textContent = 'Substitutes';
      squad.appendChild(div);
    }
    const pl = withTraining(raw);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'drow cs-row';
    const slot = i < SLOT_LABELS.length ? SLOT_LABELS[i] : 'SUB';
    b.innerHTML = `<span class="cs-slot">${slot}</span><span class="cs-num">${pl.num}</span>`
      + `<span class="dwho">${esc(pl.name)}${trainedStar(pl)}</span><span class="dmeta">${esc(pl.pos)}</span>`
      + `<span class="dstat">${pl.ovr}</span>`;
    b.onclick = () => openPlayerEditor(raw.id);
    squad.appendChild(b);
  });

  $('btn-career-play')?.classList.toggle('hidden', state.done || over);
  $('btn-career-season')?.classList.toggle('hidden', state.done || !over);
  $('btn-career-again')?.classList.toggle('hidden', !state.done);
  $('btn-career-abandon')?.classList.toggle('hidden', state.done);
  crHubNav.idx = 0;
  paintCareerFocus();
}

// ---------------- player editor

function fillSelect(el, items, value) {
  el.innerHTML = items.map(([v, label]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(label)}</option>`).join('');
}

function openPlayerEditor(id) {
  const state = loadCareer();
  const pl = state && findPlayer(state, id);
  if (!pl) return;
  editUI.id = id;
  editUI.look = { ...lookFor(pl) };
  crPlayerOpen = true;
  $('ed-name').value = pl.name;
  $('ed-num').value = pl.num;
  fillSelect($('ed-pos'), POSITIONS.map((p) => [p, p]), pl.pos);
  fillSelect($('ed-hair'), HAIR_STYLES.map((h) => [h, HAIR_LABELS[h] || h]), editUI.look.hair);
  fillSelect($('ed-hc'), HAIR_COLOUR_NAMES.map((c) => [c, c[0].toUpperCase() + c.slice(1)]), editUI.look.hairColour);
  fillSelect($('ed-cele'), [['', 'Random'], ...CELEBRATION_IDS.map((c) => [c, CELEBRATIONS[c]?.label || c])], pl.celebration || '');
  const others = state.squad
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => o.id !== id)
    .map(({ o, i }) => [o.id, `${i < SLOT_LABELS.length ? SLOT_LABELS[i] : 'Sub'} · #${o.num} ${o.name}`]);
  fillSelect($('ed-swap'), [['', 'Keep his place'], ...others], '');
  $('ed-height').value = editUI.look.height;
  $('ed-height-v').textContent = `${editUI.look.height} cm`;
  renderToneSwatches();

  const t = withTraining(pl);
  $('ed-stats').innerHTML = STAT_KEYS.map((k) => {
    const bonus = t.trained?.[k] ? ` <span class="trained-star">+${t.trained[k]}★</span>` : '';
    const cost = pointCost(pl[k]);
    const pct = Math.round(Math.min(1, (pl.xp?.[k] || 0) / cost) * 100);
    return `<div class="es-row"><span>${STAT_LABEL[k]}</span><b>${t[k]}</b>${bonus}<i><em style="width:${pct}%"></em></i></div>`;
  }).join('') + `<div class="es-row ovr"><span>OVR</span><b>${t.ovr}</b><span class="tip">${pl.apps || 0} games · ${pl.goals || 0} goals</span></div>`;
  $('career-player').classList.remove('hidden');
  $('ed-name').focus();
}

function renderToneSwatches() {
  const box = $('ed-tone');
  box.innerHTML = '';
  SKIN_SWATCHES.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `ed-swatch${editUI.look.tone === i ? ' on' : ''}`;
    b.style.background = c;
    b.title = `Tone ${i + 1}`;
    b.onclick = () => {
      editUI.look.tone = i;
      renderToneSwatches();
    };
    box.appendChild(b);
  });
}

function closePlayerEditor() {
  crPlayerOpen = false;
  $('career-player').classList.add('hidden');
  paintCareerFocus();
}

function savePlayerEditor() {
  const state = loadCareer();
  if (!state || !editUI.id) return closePlayerEditor();
  updatePlayer(state, editUI.id, {
    name: $('ed-name').value,
    num: $('ed-num').value,
    pos: $('ed-pos').value,
    celebration: $('ed-cele').value || null,
    look: {
      tone: editUI.look.tone,
      hair: $('ed-hair').value,
      hairColour: $('ed-hc').value,
      height: Number($('ed-height').value),
      beard: 0,
    },
  });
  const swap = $('ed-swap').value;
  if (swap) swapPlayers(state, editUI.id, swap);
  saveCareer(state);
  closePlayerEditor();
  renderCareerHub();
}

// ---------------- kit editor

const KIT_FIELDS = {
  home: [['shirt', 'Shirt'], ['shorts', 'Shorts'], ['socks', 'Socks'], ['trim', 'Trim'], ['number', 'Numbers']],
  away: [['shirt', 'Shirt'], ['shorts', 'Shorts'], ['socks', 'Socks'], ['trim', 'Trim'], ['number', 'Numbers']],
  gk: [['shirt', 'Shirt'], ['shorts', 'Shorts'], ['socks', 'Socks']],
};

const cssOf = (v) => (typeof v === 'string' ? v : hex(v >>> 0));

function renderKitEditor() {
  for (const col of document.querySelectorAll('#career-kit .kit-col')) {
    const which = col.dataset.kit;
    const kit = kitDraft[which];
    const shirt = cssOf(kit.shirt);
    const num = cssOf(kit.number || '#ffffff');
    col.innerHTML = `<h3>${which === 'gk' ? 'Goalkeeper' : which === 'home' ? 'Home' : 'Away'}</h3>
      <div class="kit-prev"><div class="kp-shirt" style="background:${shirt};border-color:${cssOf(kit.trim ?? kit.shirt)}"><span style="color:${num}">9</span></div>
      <div class="kp-shorts" style="background:${cssOf(kit.shorts)}"></div><div class="kp-socks" style="background:${cssOf(kit.socks)}"></div></div>
      ${KIT_FIELDS[which].map(([k, label]) => `<label class="kit-field">${label}<input type="color" data-kit="${which}" data-part="${k}" value="${cssOf(kit[k] ?? '#ffffff')}" /></label>`).join('')}`;
  }
  document.querySelectorAll('#career-kit input[type=color]').forEach((inp) => {
    inp.oninput = () => {
      const { kit, part } = inp.dataset;
      kitDraft[kit][part] = part === 'number' ? inp.value : parseInt(inp.value.slice(1), 16);
      renderKitEditor();
    };
  });
}

function openKitEditor() {
  const state = loadCareer();
  if (!state) return;
  kitDraft = JSON.parse(JSON.stringify({ home: state.club.home, away: state.club.away, gk: state.club.gk }));
  $('kit-town').textContent = state.club.town;
  $('kit-nick').value = state.club.nickname;
  crKitOpen = true;
  renderKitEditor();
  $('career-kit').classList.remove('hidden');
}

function closeKitEditor() {
  crKitOpen = false;
  $('career-kit').classList.add('hidden');
  paintCareerFocus();
}

function saveKitEditor() {
  const state = loadCareer();
  if (!state || !kitDraft) return closeKitEditor();
  updateKit(state, 'home', kitDraft.home);
  updateKit(state, 'away', kitDraft.away);
  state.club.gk = { ...state.club.gk, shirt: kitDraft.gk.shirt & 0xffffff, shorts: kitDraft.gk.shorts & 0xffffff, socks: kitDraft.gk.socks & 0xffffff };
  renameClub(state, $('kit-nick').value);
  saveCareer(state);
  closeKitEditor();
  renderCareerHub();
}

function resetKitDraft() {
  const state = loadCareer();
  const town = state && findTown(state.club.townId);
  if (!town) return;
  kitDraft = JSON.parse(JSON.stringify(defaultKits(town)));
  renderKitEditor();
}

// ---------------- pad / keyboard focus

function careerHubButtons() {
  return ['btn-career-play', 'btn-career-season', 'btn-career-again', 'btn-career-kits', 'btn-career-trainer', 'btn-career-menu', 'btn-career-abandon']
    .filter((id) => {
      const el = $(id);
      return el && !el.classList.contains('hidden');
    });
}

function paintCareerFocus() {
  document.querySelectorAll('#career-new .pad-focus, #career-hub .pad-focus').forEach((el) => el.classList.remove('pad-focus'));
  if (crPlayerOpen || crKitOpen) return;
  if (crNewOpen) {
    if (crNav.zone === 'grid') $('career-towns')?.children[crNav.idx]?.classList.add('pad-focus');
    else $(crNav.opt ? 'btn-career-start' : 'btn-career-back')?.classList.add('pad-focus');
    return;
  }
  if (crHubOpen) {
    const ids = careerHubButtons();
    if (!ids.length) return;
    crHubNav.idx = ((crHubNav.idx % ids.length) + ids.length) % ids.length;
    $(ids[crHubNav.idx])?.classList.add('pad-focus');
  }
}

function handleCareerPad(m) {
  if (crPlayerOpen || crKitOpen) {
    if (m.back) {
      input.latchMenu();
      if (crPlayerOpen) closePlayerEditor();
      else closeKitEditor();
    }
    return;
  }
  if (crNewOpen) {
    const grid = $('career-towns');
    const cols = grid ? gridCols(grid) : 4;
    if (m.navX || m.navY) {
      const nx = Math.abs(m.navX) >= Math.abs(m.navY) ? m.navX : 0;
      const ny = nx ? 0 : m.navY;
      if (crNav.zone === 'grid') {
        const next = crNav.idx + nx + ny * cols;
        if (next >= TOWNS.length) {
          crNav.zone = 'opts';
          crNav.opt = 1;
        } else if (next >= 0) {
          grid.children[next]?.click();
          return;
        }
      } else if (ny < 0) crNav.zone = 'grid';
      else if (nx) crNav.opt = nx > 0 ? 1 : 0;
      paintCareerFocus();
    }
    if (m.confirm) {
      input.latchMenu();
      if (crNav.zone === 'opts') $(crNav.opt ? 'btn-career-start' : 'btn-career-back')?.click();
      else {
        crNav.zone = 'opts';
        crNav.opt = 1;
        paintCareerFocus();
      }
    }
    if (m.back) {
      input.latchMenu();
      toMenu();
    }
    return;
  }
  const ids = careerHubButtons();
  if (m.navX || m.navY) {
    crHubNav.idx += m.navX + m.navY;
    paintCareerFocus();
  }
  if (m.confirm && ids[crHubNav.idx]) {
    input.latchMenu();
    $(ids[crHubNav.idx])?.click();
  }
  if (m.back) {
    input.latchMenu();
    toMenu();
  }
}

function openQuitConfirm() {
  if (mode !== 'match' || game.state === 'fulltime' || quitOpen) return;
  if (helpOpen) toggleHelp(false);
  if (subsOpen) closeSubs();
  pausedBeforeQuit = paused;
  quitOpen = true;
  paused = true;
  $('pause').classList.add('hidden');
  const tip = $('quit-confirm')?.querySelector('.tip');
  const yes = $('btn-quit-yes');
  if (inCareerMatch) {
    if (tip) tip.textContent = "The match will end without a result and you'll go back to your career. You can play it again.";
    if (yes) yes.textContent = 'Quit to career';
  } else {
    if (tip) tip.textContent = "The match will end and you'll go back to pick clubs. This cannot be undone.";
    if (yes) yes.textContent = 'Quit to team select';
  }
  $('quit-confirm').classList.remove('hidden');
  setOverlayFocus('quit', 0);
}

function closeQuitConfirm() {
  if (!quitOpen) return;
  quitOpen = false;
  $('quit-confirm').classList.add('hidden');
  paused = pausedBeforeQuit;
  $('pause').classList.toggle('hidden', !paused);
}

function confirmQuit() {
  if (inCareerMatch) toCareerHub();
  else toMenu();
}

$('btn-start').onclick = startMatch;
$('btn-controls').onclick = () => toggleHelp(true);
$('btn-trainer').onclick = () => openTrainer();
$('btn-help-close').onclick = () => toggleHelp(false);
$('btn-resume').onclick = () => {
  if (isGuest()) net.send({ t: 'req', what: 'pause' });
  else setPaused(false);
};
$('btn-subs')?.addEventListener('click', () => openSubs('pause'));
$('btn-ht-subs')?.addEventListener('click', () => openSubs('half'));
$('btn-second-half')?.addEventListener('click', (e) => {
  if (isGuest()) {
    net.send({ t: 'req', what: 'secondHalf' });
    e.stopImmediatePropagation();
    return;
  }
  game.continueHalf = true;
  $('halftime')?.classList.add('hidden');
});
$('btn-sub-confirm')?.addEventListener('click', confirmSub);
$('btn-sub-close')?.addEventListener('click', closeSubs);
$('btn-quit').onclick = openQuitConfirm;
$('btn-hud-quit').onclick = openQuitConfirm;
$('btn-quit-cancel').onclick = closeQuitConfirm;
$('btn-quit-yes').onclick = confirmQuit;
$('btn-rematch').onclick = startMatch;
$('btn-menu').onclick = toMenu;
$('mode-ai').onclick = () => setMode('1p');
$('mode-2p').onclick = () => setMode(sel.mode === 'coop' ? 'coop' : 'versus');
$('mode-career').onclick = () => openCareer();
$('btn-coop').onclick = () => setMode(sel.mode === 'coop' ? 'versus' : 'coop');
$('btn-career-back')?.addEventListener('click', () => toMenu());
$('btn-career-start')?.addEventListener('click', () => startNewCareer());
$('btn-career-play')?.addEventListener('click', () => startCareerMatch());
$('btn-career-season')?.addEventListener('click', () => finishCareerSeason());
$('btn-career-again')?.addEventListener('click', () => {
  clearCareer();
  showCareerNew();
});
$('btn-career-kits')?.addEventListener('click', () => openKitEditor());
$('btn-career-trainer')?.addEventListener('click', () => openTrainer());
$('btn-career-menu')?.addEventListener('click', () => toMenu());
$('btn-career-abandon')?.addEventListener('click', () => {
  if (!window.confirm('Start over? Your whole career, squad and results will be deleted.')) return;
  clearCareer();
  careerReport = null;
  seasonReport = null;
  showCareerNew();
});
$('btn-ed-cancel')?.addEventListener('click', () => closePlayerEditor());
$('btn-ed-save')?.addEventListener('click', () => savePlayerEditor());
$('ed-height')?.addEventListener('input', (e) => {
  editUI.look.height = Number(e.target.value);
  $('ed-height-v').textContent = `${e.target.value} cm`;
});
$('btn-kit-cancel')?.addEventListener('click', () => closeKitEditor());
$('btn-kit-save')?.addEventListener('click', () => saveKitEditor());
$('btn-kit-reset')?.addEventListener('click', () => resetKitDraft());
$('btn-ft-continue')?.addEventListener('click', () => continueCareer());

function setPaused(v) {
  if (quitOpen) return;
  paused = v;
  $('pause').classList.toggle('hidden', !v);
  if (v) setOverlayFocus('pause', 0);
}

function setOverlayFocus(name, idx) {
  overlayFocus.name = name;
  overlayFocus.idx = idx;
  paintOverlayFocus();
}

function overlayButtons() {
  if (trainerOpen) return ['btn-trainer-sync', 'btn-trainer-done'];
  if (helpOpen) return ['btn-help-close'];
  if (quitOpen) return ['btn-quit-cancel', 'btn-quit-yes'];
  if (subsOpen) return ['btn-sub-confirm', 'btn-sub-close'];
  if (paused) return ['btn-resume', 'btn-subs', 'btn-quit'];
  if (!$('halftime')?.classList.contains('hidden')) return ['btn-second-half', 'btn-ht-subs'];
  if (!$('fulltime').classList.contains('hidden')) {
    return inCareerMatch ? ['btn-ft-continue'] : ['btn-rematch', 'btn-menu'];
  }
  return [];
}

function paintOverlayFocus() {
  for (const id of ['btn-help-close', 'btn-resume', 'btn-subs', 'btn-quit', 'btn-quit-cancel', 'btn-quit-yes', 'btn-rematch', 'btn-menu', 'btn-ft-continue', 'btn-second-half', 'btn-ht-subs', 'btn-sub-confirm', 'btn-sub-close', 'btn-trainer-sync', 'btn-trainer-done']) {
    $(id)?.classList.remove('pad-focus');
  }
  const ids = overlayButtons();
  if (!ids.length) return;
  overlayFocus.idx = ((overlayFocus.idx % ids.length) + ids.length) % ids.length;
  $(ids[overlayFocus.idx])?.classList.add('pad-focus');
}

function activateOverlay() {
  const ids = overlayButtons();
  const id = ids[overlayFocus.idx];
  if (!id) return;
  input.latchMenu();
  $(id).click();
}

function overlayBack() {
  input.latchMenu();
  if (trainerOpen) closeTrainer();
  else if (helpOpen) toggleHelp(false);
  else if (quitOpen) closeQuitConfirm();
  else if (subsOpen) closeSubs();
  else if (paused) setPaused(false);
  else if (!$('fulltime').classList.contains('hidden')) {
    if (inCareerMatch) continueCareer();
    else toMenu();
  }
}

function openSubs(from) {
  if (mode !== 'match' || game.state === 'fulltime' || game.state === 'pens' || game.state === 'replay') return;
  if (!game.subAllowed()) {
    const n = game.outsUntilSub();
    hud.say(`Subs in ${n} more out${n === 1 ? '' : 's'}`);
    return;
  }
  subUI.from = from || (game.state === 'halftime' ? 'half' : paused ? 'pause' : 'live');
  subUI.team = game.humans[0]?.teamIdx ?? 0;
  subUI.col = 0;
  subUI.out = 0;
  subUI.inn = 0;
  if (subUI.from === 'live') paused = true;
  $('pause').classList.add('hidden');
  $('halftime')?.classList.add('hidden');
  if (helpOpen) toggleHelp(false);
  subsOpen = true;
  $('subs').classList.remove('hidden');
  renderSubs();
  setOverlayFocus('subs', 0);
}

function closeSubs() {
  if (!subsOpen) return;
  subsOpen = false;
  $('subs').classList.add('hidden');
  if (subUI.from === 'half' && game.state === 'halftime') {
    $('halftime').classList.remove('hidden');
    setOverlayFocus('half', 0);
  } else if (paused) {
    $('pause').classList.remove('hidden');
    setOverlayFocus('pause', 0);
  }
}

function confirmSub() {
  const team = game.teams[subUI.team];
  if (!team) return;
  const outP = team.players[subUI.out];
  const inData = team.bench[subUI.inn];
  if (game.makeSub(team, outP, inData)) {
    subUI.out = Math.max(0, Math.min(subUI.out, team.players.length - 1));
    subUI.inn = Math.max(0, Math.min(subUI.inn, team.bench.length - 1));
    lastCard = [null, null];
    hud.bookings();
    renderSubs();
  }
}

function renderSubs() {
  const team = game.teams[subUI.team];
  if (!team) return;
  const windowTxt = game.state === 'halftime' ? 'half-time window' : '7-out window';
  $('subs-meta').textContent = `${team.subsLeft} sub${team.subsLeft === 1 ? '' : 's'} left · ${windowTxt} · pick who comes off, then who comes on`;
  const teamsEl = $('subs-teams');
  teamsEl.innerHTML = '';
  for (const t of game.teams) {
    if (!t.human && game.matchMode !== 'versus') continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t.short;
    b.classList.toggle('on', t.idx === subUI.team);
    b.onclick = () => {
      subUI.team = t.idx;
      subUI.out = 0;
      subUI.inn = 0;
      renderSubs();
    };
    teamsEl.appendChild(b);
  }
  const paint = (el, rows, sel, col) => {
    el.innerHTML = '';
    rows.forEach((row, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `sub-row${i === sel && subUI.col === col ? ' on' : ''}`;
      btn.innerHTML = `<span class="num">${row.num}</span><span class="who">${row.name}</span>`
        + (row.card ? `<i class="${row.card}"></i>` : '')
        + `<span class="meta">${row.meta}</span>`;
      btn.onclick = () => {
        if (col === 0) subUI.out = i;
        else subUI.inn = i;
        subUI.col = col;
        renderSubs();
      };
      el.appendChild(btn);
    });
  };
  paint($('subs-out'), team.players.map((p) => ({
    num: p.data.num, name: p.data.name,
    card: p.cards >= 2 ? 'rc' : p.cards ? 'yc' : '',
    meta: `${p.role} · ${p.data.ovr} · ${Math.round((p.stamina ?? 1) * 100)}%`,
  })), subUI.out, 0);
  paint($('subs-in'), team.bench.map((d) => ({
    num: d.num, name: d.name, card: '',
    meta: `${d.role} · ${d.ovr}`,
  })), subUI.inn, 1);
}

function syncHalfTime() {
  const show = mode === 'match' && game.state === 'halftime' && !subsOpen && !quitOpen;
  const el = $('halftime');
  if (!el) return;
  const was = !el.classList.contains('hidden');
  el.classList.toggle('hidden', !show);
  if (show && !was) {
    $('ht-score').textContent = `${game.teams[0].short} ${game.teams[0].score} - ${game.teams[1].score} ${game.teams[1].short}`;
    setOverlayFocus('half', 0);
  }
}

const menuNav = { zone: 'mode', opt: 4, modeCard: twoPlayer() ? 'versus' : '1p' };
const overlayFocus = { name: '', idx: 0 };
const OPTS = [
  { id: 'opt-diff', key: 'diff', parse: (v) => v },
  { id: 'opt-len', key: 'len', parse: Number },
  { id: 'opt-gfx', key: 'gfx', parse: (v) => v },
  { id: 'btn-controls' },
  { id: 'btn-start' },
  { id: 'btn-trainer' },
];

function activeOpts() {
  return sel.mode === 'versus' ? OPTS.filter((o) => o.id !== 'opt-diff') : OPTS;
}

function gridCols(el) {
  const kids = [...el.children];
  if (kids.length < 2) return 1;
  const y = kids[0].offsetTop;
  let n = 1;
  while (n < kids.length && kids[n].offsetTop === y) n++;
  return n;
}

function applyMenuFocus() {
  document.querySelectorAll('.pad-focus').forEach((el) => el.classList.remove('pad-focus'));
  if (careerOverlayOpen() && !trainerOpen) {
    paintCareerFocus();
    return;
  }
  if (mode !== 'menu' || helpOpen || trainerOpen) {
    paintOverlayFocus();
    return;
  }
  if (menuNav.zone === 'mode') {
    const id = menuNav.modeCard === 'career' ? 'mode-career'
      : (menuNav.modeCard === 'versus' || twoPlayer()) ? 'mode-2p'
      : 'mode-ai';
    $(id)?.classList.add('pad-focus');
    return;
  }
  if (menuNav.zone === 'user' || menuNav.zone === 'ai') {
    const grid = $(`grid-${menuNav.zone}`);
    const i = pickerTeams(menuNav.zone).indexOf(sel[menuNav.zone]);
    grid.children[i]?.classList.add('pad-focus');
    return;
  }
  const opts = activeOpts();
  menuNav.opt = Math.max(0, Math.min(opts.length - 1, menuNav.opt));
  const spec = opts[menuNav.opt];
  if (!spec) return;
  if (spec.key) {
    const on = [...$(spec.id).querySelectorAll('button')].find((b) => b.classList.contains('on'));
    (on ?? $(spec.id)).classList.add('pad-focus');
  } else $(spec.id).classList.add('pad-focus');
}

function moveClub(side, dx, dy, lockSide = false) {
  const grid = $(`grid-${side}`);
  const cols = gridCols(grid);
  const list = pickerTeams(side);
  let i = list.indexOf(sel[side]);
  if (!lockSide && dx < 0 && i % cols === 0) {
    menuNav.zone = side === 'user' ? 'ai' : 'user';
    applyMenuFocus();
    return;
  }
  if (!lockSide && dx > 0 && (i % cols === cols - 1 || i === list.length - 1)) {
    menuNav.zone = side === 'user' ? 'ai' : 'user';
    applyMenuFocus();
    return;
  }
  const next = i + dx + dy * cols;
  if (next < 0) {
    if (dy < 0) {
      menuNav.zone = 'mode';
      applyMenuFocus();
    }
    return;
  }
  if (next >= list.length) {
    menuNav.zone = 'opts';
    menuNav.opt = activeOpts().length - 1;
    applyMenuFocus();
    return;
  }
  sel[side] = list[next];
  renderMenu();
}

function moveOpts(dx, dy) {
  const opts = activeOpts();
  if (dy) {
    menuNav.opt = Math.max(0, Math.min(opts.length - 1, menuNav.opt + dy));
    applyMenuFocus();
    return;
  }
  const spec = opts[menuNav.opt];
  if (!spec.key) return;
  const btns = [...$(spec.id).querySelectorAll('button')];
  let i = btns.findIndex((b) => b.classList.contains('on'));
  i = Math.max(0, Math.min(btns.length - 1, i + dx));
  btns[i].click();
  applyMenuFocus();
}

function moveMode(dx, dy) {
  const cards = ['1p', 'versus', 'career'];
  let i = cards.indexOf(menuNav.modeCard || (twoPlayer() ? 'versus' : '1p'));
  if (i < 0) i = 0;
  if (dx) {
    i = Math.max(0, Math.min(cards.length - 1, i + dx));
    menuNav.modeCard = cards[i];
    if (menuNav.modeCard === 'career') {
      $('mode-ai')?.classList.remove('on');
      $('mode-2p')?.classList.remove('on');
      $('mode-career')?.classList.add('on');
      applyMenuFocus();
    } else {
      $('mode-career')?.classList.remove('on');
      setMode(menuNav.modeCard === 'versus' ? (sel.mode === 'coop' ? 'coop' : 'versus') : '1p');
    }
  }
  if (dy > 0 && menuNav.modeCard !== 'career') {
    menuNav.zone = 'user';
    applyMenuFocus();
  }
}

function handleSlotNav(slotMenu, side) {
  if (!slotMenu) return;
  if (slotMenu.navX || slotMenu.navY) {
    const nx = Math.abs(slotMenu.navX) >= Math.abs(slotMenu.navY) ? slotMenu.navX : 0;
    const ny = nx ? 0 : slotMenu.navY;
    moveClub(side, nx, ny, true);
  }
}

function handlePadMenu() {
  const m = input.menu;
  if (reconnecting) return;
  if (careerOverlayOpen() && !trainerOpen && !helpOpen) {
    handleCareerPad(m);
    return;
  }
  const blocking = helpOpen || trainerOpen || quitOpen || subsOpen || (paused && !reconnecting)
    || !$('fulltime').classList.contains('hidden') || !$('halftime')?.classList.contains('hidden');
  if (subsOpen && (m.lb || m.rb) && game.matchMode === 'versus') {
    subUI.team = m.rb ? 1 : 0;
    subUI.out = 0;
    subUI.inn = 0;
    renderSubs();
  }
  if ((m.lb || m.rb) && mode === 'menu' && !blocking && !twoPlayer()) {
    if (menuNav.zone === 'opts' && menuNav.opt === 0) moveOpts(m.rb ? 1 : -1, 0);
    else if (menuNav.zone === 'mode') moveMode(m.rb ? 1 : -1, 0);
    else {
      menuNav.zone = menuNav.zone === 'ai' ? 'user' : 'ai';
      applyMenuFocus();
    }
  }
  if (twoPlayer() && mode === 'menu' && !blocking && menuNav.zone !== 'mode' && menuNav.zone !== 'opts') {
    handleSlotNav(input.slotMenu[0], 'user');
    handleSlotNav(input.slotMenu[1], 'ai');
  }
  if (m.navX || m.navY) {
    if (subsOpen) {
      const team = game.teams[subUI.team];
      if (m.navX) subUI.col = m.navX > 0 ? 1 : 0;
      if (m.navY) {
        if (subUI.col === 0) subUI.out = Math.max(0, Math.min((team?.players.length ?? 1) - 1, subUI.out + m.navY));
        else subUI.inn = Math.max(0, Math.min((team?.bench.length ?? 1) - 1, subUI.inn + m.navY));
      }
      renderSubs();
    } else if (blocking) {
      overlayFocus.idx += m.navX + m.navY;
      paintOverlayFocus();
    } else if (mode === 'menu') {
      const nx = Math.abs(m.navX) >= Math.abs(m.navY) ? m.navX : 0;
      const ny = nx ? 0 : m.navY;
      if (menuNav.zone === 'mode') moveMode(nx, ny);
      else if (menuNav.zone === 'opts') {
        if (ny < 0 && menuNav.opt === 0) {
          menuNav.zone = 'user';
          applyMenuFocus();
        } else moveOpts(nx, ny);
      } else if (!twoPlayer()) moveClub(menuNav.zone, nx, ny);
    }
  }
  if (m.confirm || m.start) {
    if (blocking) activateOverlay();
    else if (mode === 'menu') {
      if (menuNav.zone === 'mode') {
        if (menuNav.modeCard === 'career') {
          input.latchMenu();
          openCareer();
        } else {
          menuNav.zone = 'user';
          applyMenuFocus();
        }
      } else if (menuNav.zone === 'opts') {
        const spec = activeOpts()[menuNav.opt];
        if (spec && !spec.key) {
          input.latchMenu();
          $(spec.id).click();
        }
      } else if (!twoPlayer()) {
        menuNav.zone = 'opts';
        menuNav.opt = activeOpts().length - 1;
        applyMenuFocus();
      }
    }
  }
  if (m.back) {
    if (blocking) overlayBack();
    else if (mode === 'menu' && menuNav.zone !== 'mode') {
      menuNav.zone = menuNav.zone === 'opts' ? 'user' : 'mode';
      applyMenuFocus();
    }
  }
}

function showPadToast(connected, name) {
  const el = $('pad-toast');
  const icon = $('pad-icon');
  if (!el || !icon) return;
  const short = (name || 'Xbox controller').replace(/\(.*\)/, '').trim().slice(0, 42);
  el.textContent = connected ? `Controller connected — ${short || 'Xbox'}` : 'Controller disconnected';
  el.classList.toggle('off', !connected);
  el.classList.remove('hidden');
  clearTimeout(showPadToast.t);
  showPadToast.t = setTimeout(() => el.classList.add('hidden'), 2800);
  icon.classList.toggle('hidden', !connected);
}

input.onPadChange = (connected, name) => showPadToast(connected, name);
input.onDrop = (slotId, name) => {
  if (mode !== 'match') return;
  reconnecting = true;
  paused = true;
  $('pause').classList.add('hidden');
  $('reconnect').classList.remove('hidden');
  $('reconnect-msg').textContent = `${name} controller disconnected — reconnect and press A`;
};
if (input.activePad()) $('pad-icon').classList.remove('hidden');

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
  } else if (game.state === 'pens') {
    const k = game.pens?.kicker?.pos;
    const g = game.pens?.keeper?.pos;
    const b = ball.pos;
    const kx = k?.x ?? (HALF_L - 11);
    const kz = k?.z ?? 0;
    const gx = g?.x ?? HALF_L;
    const gz = g?.z ?? 0;
    pos = tmpV.set(kx - 8.2, 2.9, kz + 6.2);
    look = new THREE.Vector3(
      THREE.MathUtils.lerp(b.x, THREE.MathUtils.lerp(kx, gx, 0.55), 0.35),
      1.05,
      THREE.MathUtils.lerp(b.z, THREE.MathUtils.lerp(kz, gz, 0.4), 0.35),
    );
    rate = 4.2;
  } else if (game.state === 'goal' && game.celebration) {
    const s = game.celebration.player.pos;
    pos = tmpV.set(s.x * 0.97, 3.4, s.z + 9);
    look = new THREE.Vector3(s.x, 1.1, s.z);
    rate = 2.2;
  } else {
    const b = ball.pos;
    const twoP = game.matchMode === 'versus' || game.matchMode === 'coop';
    const humans = game.humans?.filter((h) => h.controlled) ?? [];
    let fx = b.x;
    let fz = b.z;
    if (!twoP && humans.length) {
      let sx = 0;
      let sz = 0;
      for (const h of humans) {
        sx += h.controlled.pos.x;
        sz += h.controlled.pos.z;
      }
      fx = THREE.MathUtils.lerp(b.x, sx / humans.length, 0.28);
      fz = THREE.MathUtils.lerp(b.z, sz / humans.length, 0.28);
    }
    if (twoP || camMode === 'broadcast') {
      const bx = THREE.MathUtils.clamp(b.x, -46, 46);
      const bz = THREE.MathUtils.clamp(b.z, -30, 30);
      const follow = twoP ? bx : THREE.MathUtils.clamp(fx * 0.85, -44, 44);
      // Near stand roof and light strip start at z ≈ 39; keep the camera in front of them.
      pos = tmpV.set(follow, twoP ? 22 : 17.5, twoP ? 38 : 36.5 + fz * 0.06);
      look = new THREE.Vector3(twoP ? bx * 0.9 : fx * 0.93, 0.15, twoP ? bz * 0.14 : fz * 0.45 + 2);
      rate = twoP ? 2.05 : 3;
    } else {
      const d = game.teams[0]?.dir ?? 1;
      pos = tmpV.set(fx - d * 17, 8.5, fz * 0.9);
      look = new THREE.Vector3(fx + d * 12, 0, fz);
    }
  }
  const k = 1 - Math.exp(-rate * dt);
  camPos.lerp(pos, k);
  camLook.x += (look.x - camLook.x) * k;
  camLook.y += (look.y - camLook.y) * k;
  camLook.z += (look.z - camLook.z) * k * ((game.matchMode === 'versus' || game.matchMode === 'coop') ? 0.45 : 1);
  camera.position.copy(camPos);
  if (game.shake > 0) {
    const s = game.shake * game.shake * 0.6;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
  }
  camera.lookAt(camLook);

  if (game.matchMode === 'versus' || game.matchMode === 'coop') {
    forward.set(0, 0, -1);
    right.set(1, 0, 0);
  } else {
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.set(-forward.z, 0, forward.x);
  }
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
      mm.strokeStyle = game.isHumanControlled?.(p)
        ? (game.humanFor(p)?.id === 1 ? '#ff4d4d' : '#3b9eff')
        : 'rgba(0,0,0,0.8)';
      mm.lineWidth = game.isHumanControlled?.(p) ? 2.5 : 1;
      mm.beginPath();
      mm.arc(sx(p.pos.x), sz(p.pos.z), game.isHumanControlled?.(p) ? 4.5 : 3.5, 0, Math.PI * 2);
      mm.fill();
      mm.stroke();
    }
  }
  mm.fillStyle = '#fff';
  mm.beginPath();
  mm.arc(sx(ball.pos.x), sz(ball.pos.z), 2.5, 0, Math.PI * 2);
  mm.fill();
}

let lastCard = [null, null];
function stamClass(p) {
  if (!p || p.stamLock || (p.stamina ?? 1) <= 0.02) return 'empty';
  if (p.stamina < 0.28) return 'low';
  if (p.stamina < 0.5) return 'mid';
  return '';
}
function setStamBar(fillId, trackId, p) {
  const fill = $(fillId);
  const track = $(trackId);
  if (!fill || !track) return;
  const v = p ? clamp01(p.stamina ?? 1) : 1;
  fill.style.width = `${Math.round(v * 100)}%`;
  track.classList.remove('mid', 'low', 'empty');
  const cls = stamClass(p);
  if (cls) track.classList.add(cls);
}
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
function fillCard(prefix, p) {
  const d = p.data;
  $(`${prefix}-num`).textContent = d.num;
  $(`${prefix}-name`).textContent = d.trained ? `${d.name} ★` : d.name;
  const { lon, fin } = shotTraits(d);
  $(`${prefix}-stats`).innerHTML = `<span>SHO <b>${d.sho}</b></span><span>LON <b>${lon}</b></span><span>FIN <b>${fin}</b></span><span>PAS <b>${d.pas}</b></span>`;
  $(`${prefix}-ovr`).textContent = d.ovr;
  const fm = $(`${prefix}-form`);
  if (fm) {
    const v = formView(p.form);
    fm.className = `pc-form ${v.dir}${v.show ? '' : ' hidden'}`;
    fm.textContent = v.show ? `${v.arrow} ${v.score.toFixed(1)}` : '';
    fm.title = v.show ? v.label : '';
  }
}
function markBook(id, p) {
  const el = $(id);
  if (!el) return;
  const n = p?.cards ?? 0;
  el.classList.toggle('hidden', n <= 0);
  el.classList.toggle('yellow', n === 1);
  el.classList.toggle('red', n >= 2);
}
function updatePlayerCard() {
  const h0 = game.humans?.[0]?.controlled;
  if (h0 && h0 !== lastCard[0]) {
    lastCard[0] = h0;
    fillCard('pc', h0);
  }
  setStamBar('pc-stam', 'pc-stam-track', h0);
  markBook('pc-card', h0);
  const h1 = game.humans?.[1]?.controlled;
  const card2 = $('playercard2');
  if (card2) card2.classList.toggle('hidden', !h1 || mode !== 'match');
  if (h1 && h1 !== lastCard[1]) {
    lastCard[1] = h1;
    fillCard('pc2', h1);
  }
  setStamBar('pc2-stam', 'pc2-stam-track', h1);
  markBook('pc2-card', h1);
}

const stressLevel = (k) => (k < 0.35 ? 'calm' : k < 0.65 ? 'tense' : 'panic');
function updateStress() {
  const s = mode === 'match' ? game.penStress : null;
  const live = !!s && (game.state !== 'pens' || game.pens?.phase === 'ready' || game.pens?.phase === 'flight');
  const el = $('stress');
  const zone = $('power-zone');
  penReticle.visible = live && !s.done && !!s.aim;
  if (penReticle.visible) {
    penReticle.position.set(s.aim.x, s.aim.y, s.aim.z);
    penReticle.userData.mat.color.setHSL((1 - s.stress) * 0.33, 0.95, 0.55);
  }
  if (zone) {
    const on = live && s.human && !s.done
      && (game.state === 'pens' ? !!game.pens?.charge : !!game.humanFor?.(s.kicker)?.charge);
    zone.classList.toggle('hidden', !on);
    if (on) {
      zone.style.left = `${(s.zone.lo * 100).toFixed(1)}%`;
      zone.style.width = `${((s.zone.hi - s.zone.lo) * 100).toFixed(1)}%`;
    }
  }
  if (!el) return;
  el.classList.toggle('hidden', !live);
  if (!live) return;
  const lvl = stressLevel(s.stress);
  el.classList.remove('calm', 'tense', 'panic');
  el.classList.add(lvl);
  el.style.setProperty('--pulse', `${(1.5 - s.stress * 1.1).toFixed(2)}s`);
  $('st-fill').style.width = `${Math.round(s.stress * 100)}%`;
  $('st-val').textContent = { calm: 'CALM', tense: 'TENSE', panic: 'NERVY' }[lvl];
  $('st-name').textContent = `${s.kicker.data.num} · ${s.kicker.data.back}`;
  $('st-tag').textContent = s.tag || '';
  const keep = $('st-keep');
  const showK = s.showKeeper && s.keep != null && s.keeper;
  keep.classList.toggle('hidden', !showK);
  if (showK) {
    keep.classList.remove('calm', 'tense', 'panic');
    keep.classList.add(stressLevel(s.keep));
    $('st-kname').textContent = s.keeper.data.back;
    $('st-kfill').style.width = `${Math.round(s.keep * 100)}%`;
  }
}

function fmtClock(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const tag = $('nametag');
const tag2 = $('nametag2');
function placeTag(el, mark, p, show) {
  mark.visible = !!show;
  if (!el) return;
  el.classList.toggle('hidden', !show);
  if (!show || !p) return;
  mark.position.set(p.pos.x, 0, p.pos.z);
  mark.userData.arrow.position.y = 2.35 + Math.sin(performance.now() / 180) * 0.06;
  const v = new THREE.Vector3(p.pos.x, 2.75, p.pos.z).project(camera);
  if (v.z > 1) {
    el.classList.add('hidden');
    return;
  }
  el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
  el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
  const name = el.querySelector('.tag-name');
  if (name) name.textContent = `${p.data.num} · ${p.data.back}`;
  else el.textContent = `${p.data.num} · ${p.data.back}`;
  const bar = el.querySelector('.tag-stam');
  const fill = bar?.querySelector('b');
  if (bar && fill) {
    fill.style.width = `${Math.round(clamp01(p.stamina ?? 1) * 100)}%`;
    bar.classList.remove('mid', 'low', 'empty');
    const cls = stamClass(p);
    if (cls) bar.classList.add(cls);
  }
}
function placeSwitchHint(el, mark, p, current, show) {
  const on = !!(show && p && p !== current);
  mark.visible = on;
  if (!el) return;
  el.classList.toggle('hidden', !on);
  if (!on) return;
  mark.position.set(p.pos.x, 0, p.pos.z);
  if (mark.userData.chev) mark.userData.chev.position.y = 2.15 + Math.sin(performance.now() / 160) * 0.05;
  const v = new THREE.Vector3(p.pos.x, 2.55, p.pos.z).project(camera);
  if (v.z > 1) {
    el.classList.add('hidden');
    return;
  }
  el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
  el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
  const num = el.querySelector('.sw-num');
  if (num) num.textContent = p.data.num;
}

function updateNameTag() {
  const play = mode === 'match' && game.state !== 'replay' && game.state !== 'goal';
  const h0 = game.humans?.[0]?.controlled;
  const h1 = game.humans?.[1]?.controlled;
  placeTag(tag, marker, h0, play && h0);
  placeTag(tag2, marker2, h1, play && h1);
  placeSwitchHint($('switch-tag'), switchMark, game.humans?.[0]?.nextSwitch, h0, play);
  placeSwitchHint($('switch-tag2'), switchMark2, game.humans?.[1]?.nextSwitch, h1, play && h1);
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
      commentary.setMuted(muted);
    }
    if (code === 'Escape') {
      if (trainerOpen) closeTrainer();
      else if (helpOpen) toggleHelp(false);
      else if (crPlayerOpen) closePlayerEditor();
      else if (crKitOpen) closeKitEditor();
      else if (subsOpen) closeSubs();
      else if (quitOpen) closeQuitConfirm();
      else if (crNewOpen || crHubOpen) toMenu();
      else if (mode === 'match' && game.state !== 'fulltime') openQuitConfirm();
    }
    if (code === 'KeyP' && isGuest() && mode === 'match' && game.state !== 'fulltime') {
      net.send({ t: 'req', what: 'pause' });
      continue;
    }
    if (code === 'KeyP' && mode === 'match' && game.state !== 'fulltime' && !quitOpen && !reconnecting) {
      if (helpOpen) toggleHelp(false);
      else if (subsOpen) closeSubs();
      else setPaused(!paused);
    }
    if (code === 'KeyU' && mode === 'match' && !quitOpen && !reconnecting) {
      if (subsOpen) closeSubs();
      else openSubs();
    }
    if (code === 'F8' && mode === 'match' && game.state !== 'fulltime' && game.state !== 'pens') game.debugPens();
    if (code === 'F9' && mode === 'match' && game.state !== 'fulltime' && game.state !== 'pens') game.debugThrow();
  }
}

function frame(now) {
  try {
    timer.update(now);
    const raw = Math.max(0, Number.isFinite(timer.getDelta()) ? timer.getDelta() : 1 / 60);
    const dt = Math.min(raw, 1 / 30);
    elapsed += dt;
    const inMatch = mode === 'match' && game.state !== 'fulltime';
    const blocking = helpOpen || quitOpen || paused || subsOpen || !$('fulltime').classList.contains('hidden');
    const play = inMatch && !blocking && !reconnecting;
    const menu = !play;
    const inp = input.frame(forward, right, {
      play,
      menu,
      join: (mode === 'menu' && twoPlayer() && !net) || reconnecting,
      // Online, the guest plays the second human on the host's match.
      hasBallAt: (i) => !!game.humanHasBallAt?.(isGuest() ? 1 : i),
      dt,
    });
    handleUI();
    handlePadMenu();
    if (mode === 'match') syncHalfTime();
    if (mode === 'menu' && twoPlayer() && !net) updateJoinUI();
    if (inp.joinEvent?.reclaimed && reconnecting) {
      reconnecting = false;
      paused = false;
      $('reconnect').classList.add('hidden');
    }
    if (inp.joinEvent?.start && mode === 'menu' && twoPlayer() && input.bothJoined()) {
      input.latchMenu();
      startMatch();
    }
    if (game.syncPads) game.syncPads(inp.slots);

    const netNow = performance.now() / 1000;
    if (isGuest() && mode === 'match') {
      // The guest draws the host's match and sends its controller; it never simulates.
      if (net.guestApply(netNow)) $('sb-clock').textContent = fmtClock(game.clock ?? 0);
      net.sendInput(play ? inp.slots?.[0] : null, netNow);
      syncGuestPause();
    } else if (mode === 'match' && !paused && !helpOpen && !quitOpen && !reconnecting) {
      if (isHost() && inp.slots?.length > 1) inp.slots[1] = net.remoteFrame();
      let acc = Math.min(raw, 0.1);
      let step = inp;
      let steps = 0;
      while (acc > 1e-4 && steps++ < 5) {
        const s = Math.min(acc, 1 / 30);
        if (s <= 0) break;
        game.update(s, step);
        acc -= s;
        step = {
          ...inp,
          pressed: new Set(),
          released: new Set(),
          slots: (inp.slots ?? []).map((sl) => ({ ...sl, pressed: new Set(), released: new Set() })),
        };
      }
      $('sb-clock').textContent = fmtClock(game.clock ?? 0);
    }
    if (isHost() && mode === 'match') net.hostTick(netNow, { paused: paused || quitOpen || subsOpen });
    updateOnlineBadge();
    if (mode === 'match') {
      game.syncVisuals(dt);
      updatePlayerCard();
      drawMinimap();
    } else ball.updateVisual(dt);
    updateStress();

    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) $('banner').classList.remove('show');
    }
    autoQuality(Math.min(raw, 0.5));
    updateCamera(dt, elapsed);
    updateNameTag();
    stadium.update(dt, elapsed);
    grade.uniforms.uTime.value = elapsed % 100;
    if (composer) composer.render();
    else renderer.render(scene, camera);
    input.endFrame();
  } catch (err) {
    console.error(err);
  }
  requestAnimationFrame(frame);
}

refreshFriendlyClubs();
renderMenu();
setMode(sel.mode, false);
$('loading').classList.add('hidden');
showSyncResult(consumeSyncFromLocation());
window.addEventListener('hashchange', () => showSyncResult(consumeSyncFromLocation()));
requestAnimationFrame(frame);
