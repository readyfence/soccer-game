import * as THREE from 'three';
import { HALF_L, HALF_W, GROUND_W, GROUND_D, PEN_DEPTH, PEN_HW } from './constants.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, renderer, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

export function pitchTexture(renderer) {
  const ppm = 32;
  const W = GROUND_W * ppm;
  const H = GROUND_D * ppm;
  const [c, g] = canvas(W, H);
  const X = (x) => (x + GROUND_W / 2) * ppm;
  const Z = (z) => (z + GROUND_D / 2) * ppm;

  g.fillStyle = '#2d6a28';
  g.fillRect(0, 0, W, H);

  const stripes = 20;
  const sw = (HALF_L * 2) / stripes;
  for (let i = -4; i < stripes + 4; i++) {
    g.fillStyle = Math.abs(i) % 2 === 0 ? '#3b8233' : '#31702b';
    g.fillRect(X(-HALF_L + i * sw), 0, sw * ppm + 1, H);
  }
  const bands = 10;
  const bw = (HALF_W * 2) / bands;
  g.fillStyle = 'rgba(255,255,255,0.03)';
  for (let j = -2; j < bands + 2; j += 2) g.fillRect(0, Z(-HALF_W + j * bw), W, bw * ppm);

  const vignette = g.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.62);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = vignette;
  g.fillRect(0, 0, W, H);

  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 16;
    d[i] += n * 0.5;
    d[i + 1] += n;
    d[i + 2] += n * 0.35;
  }
  g.putImageData(img, 0, 0);

  // Worn goalmouths
  for (const s of [-1, 1]) {
    const grd = g.createRadialGradient(X(s * (HALF_L - 3)), Z(0), 0, X(s * (HALF_L - 3)), Z(0), 7 * ppm);
    grd.addColorStop(0, 'rgba(110,95,55,0.28)');
    grd.addColorStop(1, 'rgba(110,95,55,0)');
    g.fillStyle = grd;
    g.fillRect(X(s * HALF_L - 10), Z(-10), 20 * ppm, 20 * ppm);
  }

  g.strokeStyle = 'rgba(248,248,244,0.93)';
  g.fillStyle = 'rgba(248,248,244,0.93)';
  g.lineWidth = 0.12 * ppm;
  const rect = (x1, z1, x2, z2) =>
    g.strokeRect(X(Math.min(x1, x2)), Z(Math.min(z1, z2)), Math.abs(x2 - x1) * ppm, Math.abs(z2 - z1) * ppm);
  const circle = (x, z, r, a0 = 0, a1 = Math.PI * 2) => {
    g.beginPath();
    g.arc(X(x), Z(z), r * ppm, a0, a1);
    g.stroke();
  };
  const dot = (x, z, r) => {
    g.beginPath();
    g.arc(X(x), Z(z), r * ppm, 0, Math.PI * 2);
    g.fill();
  };

  rect(-HALF_L, -HALF_W, HALF_L, HALF_W);
  g.beginPath();
  g.moveTo(X(0), Z(-HALF_W));
  g.lineTo(X(0), Z(HALF_W));
  g.stroke();
  circle(0, 0, 9.15);
  dot(0, 0, 0.22);

  const a = Math.acos((PEN_DEPTH - 11) / 9.15);
  for (const s of [-1, 1]) {
    const gx = s * HALF_L;
    rect(gx, -PEN_HW, gx - s * PEN_DEPTH, PEN_HW);
    rect(gx, -9.16, gx - s * 5.5, 9.16);
    dot(s * (HALF_L - 11), 0, 0.2);
    if (s === 1) circle(HALF_L - 11, 0, 9.15, Math.PI - a, Math.PI + a);
    else circle(-HALF_L + 11, 0, 9.15, -a, a);
  }
  g.save();
  g.beginPath();
  g.rect(X(-HALF_L), Z(-HALF_W), HALF_L * 2 * ppm, HALF_W * 2 * ppm);
  g.clip();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) circle(sx * HALF_L, sz * HALF_W, 1);
  g.restore();

  return finish(c, renderer);
}

export function grassBumpTexture(renderer) {
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const l = 3 + Math.random() * 6;
    const v = 90 + Math.random() * 120;
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 3, y - l);
    g.stroke();
  }
  const t = finish(c, renderer, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(GROUND_W / 1.5, GROUND_D / 1.5);
  return t;
}

export function netTexture(renderer) {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.clearRect(0, 0, S, S);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 3;
  const cells = 8;
  for (let i = 0; i <= cells; i++) {
    const p = (i / cells) * S;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, S);
    g.stroke();
    g.beginPath();
    g.moveTo(0, p);
    g.lineTo(S, p);
    g.stroke();
  }
  const t = finish(c, renderer);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function ballTexture(renderer) {
  const W = 1024;
  const H = 512;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#f5f5f2';
  g.fillRect(0, 0, W, H);
  const colors = ['#10204a', '#d4202f', '#10204a', '#f0b400'];
  for (let k = 0; k < 4; k++) {
    g.fillStyle = colors[k];
    g.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const y = H / 2 + Math.sin((x / W) * Math.PI * 4 + k * 1.6) * 150 - 18 + k * 9;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    for (let x = W; x >= 0; x -= 8) {
      const y = H / 2 + Math.sin((x / W) * Math.PI * 4 + k * 1.6) * 150 + (k === 0 ? 26 : 8) + k * 9;
      g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
  }
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo((i / 6) * W, 0);
    g.lineTo((i / 6) * W, H);
    g.stroke();
  }
  return finish(c, renderer);
}

const SPONSORS = [
  ['CURSOR', '#0b0b0f', '#ffffff'],
  ['VOLT ENERGY', '#00c853', '#04210f'],
  ['NOVA BANK', '#1a237e', '#ffd54f'],
  ['PIXEL AIR', '#ffffff', '#d50000'],
  ['KICK+', '#ff6d00', '#ffffff'],
  ['ORBIT TV', '#6200ea', '#ffffff'],
  ['ZEN MOTORS', '#111111', '#00e5ff'],
  ['SOCKER 26', '#ffea00', '#111111'],
];

export function adTexture(renderer) {
  const seg = 320;
  const W = seg * SPONSORS.length;
  const H = 128;
  const [c, g] = canvas(W, H);
  SPONSORS.forEach(([text, bg, fg], i) => {
    g.fillStyle = bg;
    g.fillRect(i * seg, 0, seg, H);
    g.fillStyle = fg;
    g.font = 'italic 900 58px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, i * seg + seg / 2, H / 2 + 2, seg - 20);
  });
  const t = finish(c, renderer);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export function inkFor(shirt) {
  const r = (shirt >> 16) & 255;
  const gr = (shirt >> 8) & 255;
  const b = shirt & 255;
  return 0.299 * r + 0.587 * gr + 0.114 * b > 150 ? '#111111' : '#ffffff';
}

function fabricNoise(g, W, H, amount) {
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const n = ((x + y) % 2 ? 1 : -1) * amount * 0.5 + (Math.random() - 0.5) * amount;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
  }
  g.putImageData(img, 0, 0);
}

// Torso UVs wrap around the body with u = 0 at the spine and u = 0.5 at the chest; v runs hem (0) to collar (1).
export function shirtTexture(renderer, kit, player) {
  const W = 512;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = hex(kit.shirt);
  g.fillRect(0, 0, W, H);
  if (kit.pattern === 'stripes') {
    g.fillStyle = hex(kit.stripe);
    const n = 14;
    for (let i = 1; i < n; i += 2) g.fillRect((i / n) * W, 0, W / n, H);
  } else if (kit.pattern === 'center') {
    const w = W * 0.07;
    g.fillStyle = '#ffffff';
    g.fillRect(W / 2 - w / 2 - 6, 0, w + 12, H);
    g.fillStyle = hex(kit.stripe);
    g.fillRect(W / 2 - w / 2, 0, w, H);
  }
  // Side panels
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(W * 0.235, 40, W * 0.03, H);
  g.fillRect(W * 0.735, 40, W * 0.03, H);

  const trim = hex(kit.trim ?? 0x111111);
  g.fillStyle = trim;
  g.fillRect(0, 0, W, 7);
  g.fillRect(0, H - 9, W, 9);
  // Shoulder piping
  g.fillRect(0, 26, W, 3);

  const ink = kit.number ?? inkFor(kit.shirt);
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  // Crest on the left chest, maker mark on the right
  const cx = W * 0.59;
  const cy = 74;
  g.fillStyle = trim;
  g.beginPath();
  g.moveTo(cx - 11, cy - 13);
  g.lineTo(cx + 11, cy - 13);
  g.lineTo(cx + 11, cy + 2);
  g.quadraticCurveTo(cx + 10, cy + 12, cx, cy + 16);
  g.quadraticCurveTo(cx - 10, cy + 12, cx - 11, cy + 2);
  g.closePath();
  g.fill();
  g.fillStyle = hex(kit.shirt);
  g.fillRect(cx - 6, cy - 8, 12, 3);
  g.fillStyle = ink;
  g.beginPath();
  const mx = W * 0.41;
  g.moveTo(mx - 9, cy + 2);
  g.lineTo(mx + 9, cy - 8);
  g.lineTo(mx + 3, cy + 6);
  g.closePath();
  g.fill();

  const sponsor = ['CURSOR', 'VOLT', 'NOVA BANK', 'PIXEL AIR', 'ORBIT'][(kit.shirt >>> 3) % 5];
  g.font = 'italic 900 22px "Arial Black", Arial, sans-serif';
  g.fillText(sponsor, W / 2, 110, 104);

  if (player) {
    g.font = 'bold 19px Arial, sans-serif';
    for (const x of [0, W]) g.fillText(String(player.back ?? '').toUpperCase(), x, 62, 120);
    g.font = 'bold 92px "Arial Narrow", Arial, sans-serif';
    for (const x of [0, W]) {
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(0,0,0,0.18)';
      g.strokeText(String(player.num ?? ''), x, 132, 110);
      g.fillText(String(player.num ?? ''), x, 132, 110);
    }
  }
  fabricNoise(g, W, H, 10);
  return finish(c, renderer);
}

export function sleeveTexture(renderer, kit) {
  const [c, g] = canvas(64, 64);
  g.fillStyle = hex(kit.sleeves ?? kit.shirt);
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = hex(kit.trim ?? 0x111111);
  g.fillRect(0, 56, 64, 8);
  fabricNoise(g, 64, 64, 10);
  return finish(c, renderer);
}

export function sockTexture(renderer, kit) {
  const [c, g] = canvas(32, 128);
  g.fillStyle = hex(kit.socks);
  g.fillRect(0, 0, 32, 128);
  g.fillStyle = hex(kit.trim ?? 0x111111);
  g.fillRect(0, 9, 32, 7);
  g.fillStyle = 'rgba(0,0,0,0.1)';
  g.fillRect(0, 100, 32, 28);
  fabricNoise(g, 32, 128, 10);
  return finish(c, renderer);
}

// Grey strand streaks running along v (crown to hairline); used as both a colour multiplier and a bump map.
export function hairTexture() {
  const W = 128;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#c8c8c8';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * W;
    const v = 150 + Math.random() * 105;
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 0.6 + Math.random() * 1.2;
    g.beginPath();
    g.moveTo(x, Math.random() * H * 0.3);
    g.lineTo(x + (Math.random() - 0.5) * 6, H * (0.6 + Math.random() * 0.4));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

export function contactShadowTexture() {
  const S = 128;
  const [c, g] = canvas(S, S);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(0,0,0,0.75)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0.4)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

export function concreteTexture(renderer) {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#6b6f76';
  g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 30;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const t = finish(c, renderer);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
