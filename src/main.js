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
import { Input, CONTROLS, P1_COLOR, P2_COLOR } from './input.js';
import {
  TEAMS, DREAM, STAR_POOL, SLOT_LABELS, teamRating, resolveKits, shotTraits,
  setDreamPlayers, autoDreamNames, emptyDraft, naturalSlots, starMatches, draftedCount,
} from './teams.js';
import { DIFFICULTY, resolveDifficulty } from './constants.js';

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
  composer.addPass(new OutputPass());
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
function applyQuality(level) {
  qLevel = level;
  const q = QUALITY[level];
  renderer.setPixelRatio(q.ratio);
  composer?.setPixelRatio(q.ratio);
  bloom.enabled = q.bloom && !!composer;
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
  fullTime(a, b, pens) {
    const pensTxt = pens ? ` (${pens.scored[0]}–${pens.scored[1]} pens)` : '';
    const pensWin = pens && pens.scored[0] !== pens.scored[1];
    const res = pensWin
      ? (pens.scored[0] > pens.scored[1] ? `${a.name} win on penalties!` : `${b.name} win on penalties!`)
      : a.score > b.score ? `${a.name} win!` : a.score < b.score ? `${b.name} win.` : 'A hard-fought draw.';
    $('ft-score').innerHTML = `<span class="badge" id="ft-ba"></span>${a.score} - ${b.score}${pensTxt}<span class="badge" id="ft-bb"></span>`;
    badgeStyle($('ft-ba'), a.club);
    badgeStyle($('ft-bb'), b.club);
    $('ft-result').textContent = res;
    setTimeout(() => {
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
  if (typeof applyMenuFocus === 'function') applyMenuFocus();
  if (persist) {
    try { localStorage.setItem(MODE_STORE, sel.mode); } catch { /* ignore */ }
  }
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
  if (!twoPlayer()) return;
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
  const ready = !twoPlayer() || input.bothJoined();
  btn.disabled = !ready;
  btn.textContent = ready ? 'KICK OFF' : 'Waiting for P1 & P2…';
}

function pickerTeams(side) {
  return [DREAM[side], ...TEAMS];
}

function clubCard(club, side) {
  const el = document.createElement('div');
  el.className = 'club';
  const tag = club.kind === 'dream' ? '<span class="ckind dream">DREAM</span>'
    : club.kind === 'prime' ? '<span class="ckind prime">PRIME</span>'
    : club.kind === 'nation' ? '<span class="ckind">NATION</span>' : '';
  const rate = club.kind === 'dream' && draftedCount(club) < 11
    ? (draftedCount(club) ? `${draftedCount(club)}/11` : 'DRAFT')
    : `OVR ${teamRating(club)}`;
  el.innerHTML = `<span class="badge"></span><span class="cname">${club.name}</span>${tag}<span class="crate">${rate}</span>`;
  badgeStyle(el.querySelector('.badge'), club);
  el.onclick = () => {
    const again = sel[side] === club && club.kind === 'dream';
    sel[side] = club;
    renderMenu();
    if (again) openDream(side);
  };
  return el;
}

function clubInfo(club, side) {
  const k = club.home;
  const top = club.kind === 'dream'
    ? SLOT_LABELS.map((lab, i) => {
      const name = club.draft?.[i] || '';
      const pl = name && STAR_POOL.find((s) => s.name === name);
      return { num: i + 1, name: name || `Draft ${lab}`, ovr: pl?.ovr ?? '—' };
    })
    : [...club.players].sort((a, b) => b.ovr - a.ovr).slice(0, 6);
  const edit = club.kind === 'dream'
    ? `<button type="button" class="ghost dream-edit" data-side="${side}">Draft players</button>`
    : '';
  return `<div class="ci-head"><span class="badge" data-club="${club.id}"></span><div><div class="ci-title">${club.name}</div>
    <div>Team OVR <b>${teamRating(club)}</b> · Kit <span class="kit"><i style="background:${hex(k.shirt)}"></i><i style="background:${hex(k.shorts)}"></i><i style="background:${hex(k.socks)}"></i></span>
    GK <span class="kit"><i style="background:${hex(club.gk.shirt)}"></i></span></div></div></div>
    <div class="stars">${top.map((p) => `<div><span>#${p.num} ${p.name}</span><b>${p.ovr}</b></div>`).join('')}</div>${edit}`;
}

function renderMenu() {
  for (const side of ['user', 'ai']) {
    const grid = $(`grid-${side}`);
    grid.innerHTML = '';
    for (const c of pickerTeams(side)) {
      const card = clubCard(c, side);
      if (c.kind === 'nation') card.classList.add('nation');
      if (c.kind === 'prime') card.classList.add('prime');
      if (c.kind === 'dream') card.classList.add('dream');
      if (sel[side] === c) card.classList.add('on');
      grid.appendChild(card);
    }
    const info = $(`info-${side}`);
    info.innerHTML = clubInfo(sel[side], side);
    badgeStyle(info.querySelector('.badge'), sel[side]);
    info.querySelector('.dream-edit')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openDream(side);
    });
  }
  updateJoinUI();
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
let dreamOpen = false;
let quitOpen = false;
let pausedBeforeQuit = false;
let reconnecting = false;
let subsOpen = false;
const subUI = { team: 0, col: 0, out: 0, inn: 0, from: '' };

const PITCH_XY = [
  [50, 88], [86, 68], [64, 70], [36, 70], [14, 68],
  [78, 42], [50, 46], [22, 42], [82, 18], [50, 16], [18, 18],
];
const dreamUI = { side: 'user', slot: 0, query: '', era: 'all', pos: 'all', names: [] };

function openDream(side) {
  dreamOpen = true;
  dreamUI.side = side;
  dreamUI.slot = 0;
  dreamUI.query = '';
  dreamUI.era = 'all';
  dreamUI.pos = 'all';
  dreamUI.names = [...(DREAM[side].draft || emptyDraft())];
  dreamUI.slot = Math.max(0, dreamUI.names.findIndex((n) => !n));
  const search = $('dream-search');
  if (search) search.value = '';
  for (const root of ['dream-era', 'dream-pos']) {
    $(root)?.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === 'all'));
  }
  $('dream-sub').textContent = side === 'user'
    ? 'Draft anyone — Zlatan, Pelé, Messi, whoever. They slot into position.'
    : 'Draft the opponent XI from past and present stars.';
  $('dream').classList.remove('hidden');
  renderDream();
  setOverlayFocus('dream', 2);
  search?.focus();
}

function closeDream() {
  if (!dreamOpen) return;
  setDreamPlayers(DREAM[dreamUI.side], dreamUI.names);
  sel[dreamUI.side] = DREAM[dreamUI.side];
  dreamOpen = false;
  $('dream').classList.add('hidden');
  renderMenu();
}

function filteredStars() {
  const taken = new Set(dreamUI.names.filter(Boolean));
  return STAR_POOL.filter((pl) => {
    if (dreamUI.era !== 'all' && pl.era !== 'both' && pl.era !== dreamUI.era) return false;
    if (dreamUI.pos !== 'all') {
      const role = { GK: 'GK', RB: 'DEF', CB: 'DEF', LB: 'DEF', CM: 'MID', CDM: 'MID', RW: 'FWD', ST: 'FWD', LW: 'FWD' }[pl.pos];
      if (role !== dreamUI.pos) return false;
    }
    return starMatches(pl, dreamUI.query);
  }).map((pl) => ({ pl, taken: taken.has(pl.name) }));
}

function draftPlayer(name) {
  const pl = STAR_POOL.find((s) => s.name === name);
  if (!pl) return;
  const have = dreamUI.names.indexOf(name);
  if (have >= 0) {
    dreamUI.slot = have;
    renderDream();
    return;
  }
  const prefs = naturalSlots(pl.pos);
  const selectedEmpty = !dreamUI.names[dreamUI.slot];
  const selectedFits = prefs.includes(dreamUI.slot);
  let slot = selectedEmpty && selectedFits
    ? dreamUI.slot
    : prefs.find((i) => !dreamUI.names[i]);
  if (slot == null) slot = dreamUI.names.findIndex((n) => !n);
  if (slot < 0) slot = selectedEmpty ? dreamUI.slot : prefs[0];
  dreamUI.names[slot] = name;
  const next = dreamUI.names.findIndex((n) => !n);
  dreamUI.slot = next >= 0 ? next : slot;
  renderDream();
}

function renderDream() {
  const pitch = $('dream-pitch');
  const list = $('dream-list');
  if (!pitch || !list) return;
  const squad = dreamUI.names.map((name) => (name ? STAR_POOL.find((pl) => pl.name === name) : null));
  const filled = dreamUI.names.filter(Boolean).length;
  const ovr = filled ? Math.round(squad.reduce((a, pl) => a + (pl?.ovr || 0), 0) / filled) : 0;
  $('dream-ovr').textContent = filled < 11 ? `${filled}/11` : `OVR ${ovr}`;
  pitch.innerHTML = '';
  SLOT_LABELS.forEach((label, i) => {
    const drafted = Boolean(dreamUI.names[i]);
    const pl = drafted ? squad[i] : null;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `dslot${pl ? '' : ' empty'}${dreamUI.slot === i ? ' on' : ''}`;
    b.style.left = `${PITCH_XY[i][0]}%`;
    b.style.top = `${PITCH_XY[i][1]}%`;
    b.innerHTML = `<span class="dpos">${label}</span><span class="dname">${pl ? pl.back : 'Draft'}</span><span class="dovr">${pl ? pl.ovr : '—'}</span>`;
    b.onclick = () => {
      if (dreamUI.slot === i && dreamUI.names[i]) dreamUI.names[i] = '';
      else dreamUI.slot = i;
      renderDream();
    };
    pitch.appendChild(b);
  });
  const rows = filteredStars();
  list.innerHTML = '';
  for (const { pl, taken } of rows) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `drow${taken ? ' taken' : ''}${dreamUI.names[dreamUI.slot] === pl.name ? ' on' : ''}`;
    const era = pl.era === 'prime' ? 'PRIME' : pl.era === 'now' ? 'NOW' : 'ALL';
    b.innerHTML = `<span class="dwho">${pl.name}</span><span class="dmeta">${pl.pos} · ${era}</span><span class="dstat">${pl.ovr}</span>`;
    b.onclick = () => draftPlayer(pl.name);
    list.appendChild(b);
  }
}

function bindDreamFilters(id, key) {
  $(id)?.querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      dreamUI[key] = b.dataset.v;
      $(id).querySelectorAll('button').forEach((o) => o.classList.toggle('on', o === b));
      renderDream();
    };
  });
}
bindDreamFilters('dream-era', 'era');
bindDreamFilters('dream-pos', 'pos');
$('dream-search')?.addEventListener('input', (e) => {
  dreamUI.query = e.target.value;
  renderDream();
});
$('btn-dream-best')?.addEventListener('click', () => {
  dreamUI.names = autoDreamNames();
  renderDream();
});
$('btn-dream-reset')?.addEventListener('click', () => {
  dreamUI.names = emptyDraft();
  dreamUI.slot = 0;
  renderDream();
});
$('btn-dream-done')?.addEventListener('click', () => closeDream());

function toggleHelp(force) {
  helpOpen = force ?? !helpOpen;
  $('help').classList.toggle('hidden', !helpOpen);
  if (helpOpen) setOverlayFocus('help', 0);
  else applyMenuFocus();
}

function startMatch() {
  if (twoPlayer() && !input.bothJoined()) return;
  sfx.init();
  const kits = resolveKits(sel.user, sel.ai);
  game.setupMatch({
    userClub: sel.user, aiClub: sel.ai, kits, difficulty: sel.diff, minutes: sel.len,
    matchMode: sel.mode, pads: input.slots.map((s) => s.padIndex),
  });
  $('sb-home').textContent = sel.user.short;
  $('sb-away').textContent = sel.ai.short;
  badgeStyle($('sb-home-badge'), sel.user);
  badgeStyle($('sb-away-badge'), sel.ai);
  $('sb-clock').style.background = hex(kits.user.shirt === 0xf6f6f6 ? 0x1a2340 : kits.user.shirt);
  hud.setScore(0, 0);
  const d = DIFFICULTY[sel.diff];
  $('sb-diff').textContent = sel.mode === 'versus' ? '2P' : sel.mode === 'coop' ? 'CO-OP' : d.short;
  $('pause-diff').textContent = sel.mode === 'versus' ? 'Two Player' : sel.mode === 'coop' ? `Co-op · ${d.label}` : d.label;
  $('playercard2')?.classList.toggle('hidden', !twoPlayer());
  $('menu').classList.add('hidden');
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
  mode = 'match';
  paused = false;
  quitOpen = false;
  reconnecting = false;
  input.latchMenu();
  sfx.whistle();
}

function toMenu() {
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
  $('menu').classList.remove('hidden');
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
  if (twoPlayer()) input.resetJoin();
  setMode(sel.mode, false);
  menuNav.zone = 'mode';
  applyMenuFocus();
}

function openQuitConfirm() {
  if (mode !== 'match' || game.state === 'fulltime' || quitOpen) return;
  if (helpOpen) toggleHelp(false);
  if (subsOpen) closeSubs();
  pausedBeforeQuit = paused;
  quitOpen = true;
  paused = true;
  $('pause').classList.add('hidden');
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
  toMenu();
}

$('btn-start').onclick = startMatch;
$('btn-controls').onclick = () => toggleHelp(true);
$('btn-help-close').onclick = () => toggleHelp(false);
$('btn-resume').onclick = () => setPaused(false);
$('btn-subs')?.addEventListener('click', () => openSubs('pause'));
$('btn-ht-subs')?.addEventListener('click', () => openSubs('half'));
$('btn-second-half')?.addEventListener('click', () => {
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
$('btn-coop').onclick = () => setMode(sel.mode === 'coop' ? 'versus' : 'coop');

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
  if (dreamOpen) return ['btn-dream-best', 'btn-dream-reset', 'btn-dream-done'];
  if (helpOpen) return ['btn-help-close'];
  if (quitOpen) return ['btn-quit-cancel', 'btn-quit-yes'];
  if (subsOpen) return ['btn-sub-confirm', 'btn-sub-close'];
  if (paused) return ['btn-resume', 'btn-subs', 'btn-quit'];
  if (!$('halftime')?.classList.contains('hidden')) return ['btn-second-half', 'btn-ht-subs'];
  if (!$('fulltime').classList.contains('hidden')) return ['btn-rematch', 'btn-menu'];
  return [];
}

function paintOverlayFocus() {
  for (const id of ['btn-help-close', 'btn-resume', 'btn-subs', 'btn-quit', 'btn-quit-cancel', 'btn-quit-yes', 'btn-rematch', 'btn-menu', 'btn-second-half', 'btn-ht-subs', 'btn-sub-confirm', 'btn-sub-close', 'btn-dream-best', 'btn-dream-reset', 'btn-dream-done']) {
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
  if (dreamOpen) closeDream();
  else if (helpOpen) toggleHelp(false);
  else if (quitOpen) closeQuitConfirm();
  else if (subsOpen) closeSubs();
  else if (paused) setPaused(false);
  else if (!$('fulltime').classList.contains('hidden')) toMenu();
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

const menuNav = { zone: 'mode', opt: 4 };
const overlayFocus = { name: '', idx: 0 };
const OPTS = [
  { id: 'opt-diff', key: 'diff', parse: (v) => v },
  { id: 'opt-len', key: 'len', parse: Number },
  { id: 'opt-gfx', key: 'gfx', parse: (v) => v },
  { id: 'btn-controls' },
  { id: 'btn-start' },
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
  if (mode !== 'menu' || helpOpen || dreamOpen) {
    paintOverlayFocus();
    return;
  }
  if (menuNav.zone === 'mode') {
    $(sel.mode === '1p' ? 'mode-ai' : 'mode-2p')?.classList.add('pad-focus');
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
  if (dx) setMode(dx > 0 ? (sel.mode === 'coop' ? 'coop' : 'versus') : '1p');
  if (dy > 0) {
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
  const blocking = helpOpen || dreamOpen || quitOpen || subsOpen || (paused && !reconnecting)
    || !$('fulltime').classList.contains('hidden') || !$('halftime')?.classList.contains('hidden');
  if (reconnecting) return;
  if (subsOpen && (m.lb || m.rb) && game.matchMode === 'versus') {
    subUI.team = m.rb ? 1 : 0;
    subUI.out = 0;
    subUI.inn = 0;
    renderSubs();
  }
  if ((m.lb || m.rb) && mode === 'menu' && !blocking && !twoPlayer()) {
    if (menuNav.zone === 'opts' && menuNav.opt === 0) moveOpts(m.rb ? 1 : -1, 0);
    else if (menuNav.zone === 'mode') setMode(m.rb ? 'versus' : '1p');
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
        menuNav.zone = 'user';
        applyMenuFocus();
      } else if (menuNav.zone === 'opts') {
        const spec = activeOpts()[menuNav.opt];
        if (spec && !spec.key) {
          input.latchMenu();
          $(spec.id).click();
        }
      } else if (!twoPlayer()) {
        if (sel[menuNav.zone]?.kind === 'dream') openDream(menuNav.zone);
        else {
          menuNav.zone = 'opts';
          menuNav.opt = activeOpts().length - 1;
          applyMenuFocus();
        }
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
      pos = tmpV.set(follow, twoP ? 19.2 : 17.5, twoP ? 40.5 : 36.5 + fz * 0.06);
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
  $(`${prefix}-name`).textContent = d.name;
  const { lon, fin } = shotTraits(d);
  $(`${prefix}-stats`).innerHTML = `<span>SHO <b>${d.sho}</b></span><span>LON <b>${lon}</b></span><span>FIN <b>${fin}</b></span><span>PAS <b>${d.pas}</b></span>`;
  $(`${prefix}-ovr`).textContent = d.ovr;
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
    }
    if (code === 'Escape') {
      if (helpOpen) toggleHelp(false);
      else if (subsOpen) closeSubs();
      else if (quitOpen) closeQuitConfirm();
      else if (mode === 'match' && game.state !== 'fulltime') openQuitConfirm();
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
      join: (mode === 'menu' && twoPlayer()) || reconnecting,
      hasBallAt: (i) => !!game.humanHasBallAt?.(i),
      dt,
    });
    handleUI();
    handlePadMenu();
    if (mode === 'match') syncHalfTime();
    if (mode === 'menu' && twoPlayer()) updateJoinUI();
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

    if (mode === 'match' && !paused && !helpOpen && !quitOpen && !reconnecting) {
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
    if (composer) composer.render();
    else renderer.render(scene, camera);
    input.endFrame();
  } catch (err) {
    console.error(err);
  }
  requestAnimationFrame(frame);
}

renderMenu();
setMode(sel.mode, false);
$('loading').classList.add('hidden');
requestAnimationFrame(frame);

window.__game = game;
