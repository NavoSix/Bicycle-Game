import * as THREE from '../vendor/three.module.min.js';
import { RNG } from './rng.js';

// Painted backdrops that line the trail at a distance, so the world reads as
// woods and neighborhoods instead of an open lawn. Each texture tiles
// horizontally; transparent pixels above the silhouette let the sky through.

const W = 2048;

function paint(w, h, seed, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  draw(g, w, h, new RNG(seed));
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

// draw something at x, and again across the seam so the tile wraps cleanly
function wrapDraw(w, x, r, fn) {
  fn(x);
  if (x - r < 0) fn(x + w);
  if (x + r > w) fn(x - w);
}

function blob(g, x, y, rx, ry, color) {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

// smooth periodic noise along x (sum of sines with integer periods)
function ridge(rng, w, terms) {
  const t = terms.map(([n, amp]) => [n, amp * rng.range(0.6, 1.2), rng.range(0, Math.PI * 2)]);
  return (x) => t.reduce((s, [n, amp, ph]) => s + amp * Math.sin((x / w) * Math.PI * 2 * n + ph), 0);
}

function palmCrown(g, x, y, r, color) {
  g.strokeStyle = color;
  g.lineCap = 'round';
  for (let k = 0; k < 11; k++) {
    const a = -Math.PI + (k / 10) * Math.PI + (k % 2 ? 0.1 : -0.1);
    g.lineWidth = r * 0.22;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6 - r * 0.2, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7 + r * 0.25);
    g.stroke();
  }
}

// --- forest: live oak / mixed hammock canopy -------------------------------
function forest(dark, moss, palms) {
  return (g, w, h, rng) => {
    const top = ridge(rng, w, [[3, 0.07], [7, 0.05], [17, 0.035], [41, 0.02]]);
    const base = dark ? [100, 30, 17] : [96, 32, 22];
    // canopy mass
    g.fillStyle = hsl(base[0], base[1], base[2]);
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, h * (0.3 + top(x)));
    g.lineTo(w, h);
    g.fill();
    // billowy crowns along the top edge
    for (let i = 0; i < 420; i++) {
      const x = rng.range(0, w);
      const y = h * (0.3 + top(x)) + rng.range(-0.02, 0.35) * h;
      const r = rng.range(0.04, 0.11) * h;
      const l = base[2] + rng.range(-5, 12) * (1 - (y / h) * 0.6);
      wrapDraw(w, x, r * 1.6, (xx) => blob(g, xx, y, r * 1.6, r, hsl(base[0] + rng.range(-10, 10), base[1] + rng.range(-6, 8), l)));
    }
    // sunlit tops
    for (let i = 0; i < 260; i++) {
      const x = rng.range(0, w);
      const y = h * (0.31 + top(x)) + rng.range(0, 0.08) * h;
      const r = rng.range(0.02, 0.05) * h;
      wrapDraw(w, x, r * 1.5, (xx) => blob(g, xx, y, r * 1.5, r, hsl(base[0] - 8 + rng.range(-6, 6), 38, base[2] + 14 + rng.range(0, 8), 0.8)));
    }
    if (palms) {
      for (let i = 0; i < 14; i++) {
        const x = rng.range(0, w);
        const y = h * (0.22 + top(x)) - rng.range(0, 0.1) * h;
        g.strokeStyle = hsl(30, 15, 30);
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + rng.range(-6, 6), h * 0.55);
        g.stroke();
        wrapDraw(w, x, 40, (xx) => palmCrown(g, xx, y, rng.range(0.07, 0.1) * h, hsl(85, 28, rng.range(22, 30))));
      }
    }
    // understory: shade, trunks, palmettos
    const grd = g.createLinearGradient(0, h * 0.5, 0, h);
    grd.addColorStop(0, hsl(base[0], base[1], base[2] - 4, 0));
    grd.addColorStop(1, hsl(base[0], 25, 9, 0.9));
    g.fillStyle = grd;
    g.fillRect(0, h * 0.5, w, h * 0.5);
    for (let i = 0; i < 90; i++) {
      const x = rng.range(0, w);
      const tw = rng.range(3, 10);
      g.fillStyle = hsl(30, 12, rng.range(10, 20));
      g.beginPath();
      g.moveTo(x - tw, h);
      g.lineTo(x - tw * 0.5, h * rng.range(0.5, 0.7));
      g.lineTo(x + tw * 0.5, h * rng.range(0.5, 0.7));
      g.lineTo(x + tw, h);
      g.fill();
    }
    if (moss) {
      for (let i = 0; i < 140; i++) {
        const x = rng.range(0, w);
        const y = h * rng.range(0.42, 0.6);
        g.fillStyle = hsl(80, 8, rng.range(30, 40), 0.7);
        g.beginPath();
        g.moveTo(x - 3, y);
        g.lineTo(x + 3, y);
        g.lineTo(x + rng.range(-1, 1), y + rng.range(8, 18));
        g.fill();
      }
    }
    for (let i = 0; i < 320; i++) {
      const x = rng.range(0, w);
      const y = h * rng.range(0.82, 0.98);
      const r = rng.range(8, 20);
      g.fillStyle = hsl(85 + rng.range(-10, 10), 30, rng.range(18, 28));
      g.beginPath();
      g.moveTo(x, y + r * 0.6);
      g.arc(x, y + r * 0.6, r, Math.PI * 1.1, Math.PI * 1.9);
      g.fill();
    }
  };
}

// --- pine flatwoods: open stands of tall slash pine over palmetto ------------
function pines(cypress) {
  return (g, w, h, rng) => {
    // hazy distant stand
    for (let i = 0; i < 90; i++) {
      const x = rng.range(0, w);
      const top = h * rng.range(0.22, 0.4);
      g.fillStyle = hsl(90, 10, 46, 0.9);
      g.fillRect(x, top, 3, h - top);
      wrapDraw(w, x, 30, (xx) => {
        for (let k = 0; k < 4; k++) blob(g, xx + rng.range(-14, 14), top + rng.range(-8, 10), rng.range(10, 22), rng.range(6, 11), hsl(95, 12, rng.range(42, 50)));
      });
    }
    // main trunks
    for (let i = 0; i < 70; i++) {
      const x = rng.range(0, w);
      const top = h * rng.range(0.05, 0.22);
      const tw = rng.range(4, 8);
      g.fillStyle = cypress ? hsl(35, 8, rng.range(40, 52)) : hsl(22, 30, rng.range(22, 32));
      g.beginPath();
      g.moveTo(x - tw * (cypress ? 2.2 : 0.8), h);
      g.lineTo(x - tw * 0.35, top);
      g.lineTo(x + tw * 0.35, top);
      g.lineTo(x + tw * (cypress ? 2.2 : 0.8), h);
      g.fill();
      wrapDraw(w, x, 70, (xx) => {
        const n = cypress ? 7 : 5;
        for (let k = 0; k < n; k++) {
          const cx = xx + rng.range(-34, 34);
          const cy = top + rng.range(-10, cypress ? 60 : 30);
          const col = cypress ? hsl(80, 35, rng.range(32, 44)) : hsl(100, 28, rng.range(18, 28));
          blob(g, cx, cy, rng.range(16, 32), rng.range(8, 15), col);
        }
      });
    }
    // palmetto / marsh band along the bottom
    const band = ridge(rng, w, [[9, 0.03], [23, 0.02], [61, 0.015]]);
    g.fillStyle = cypress ? hsl(110, 20, 18) : hsl(88, 28, 26);
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) g.lineTo(x, h * (0.8 + band(x)));
    g.lineTo(w, h);
    g.fill();
    for (let i = 0; i < 500; i++) {
      const x = rng.range(0, w);
      const y = h * (0.8 + band(x)) + rng.range(-4, 20);
      const r = rng.range(6, 14);
      g.fillStyle = cypress ? hsl(80, 25, rng.range(22, 34)) : hsl(rng.chance(0.3) ? 150 : 85, 22, rng.range(24, 36));
      g.beginPath();
      g.moveTo(x, y + r * 0.5);
      g.arc(x, y + r * 0.5, r, Math.PI * 1.1, Math.PI * 1.9);
      g.fill();
    }
  };
}

const STUCCO = ['#efe6d2', '#e8d8b4', '#f2e8c8', '#d9d4c8', '#e6c9b0', '#c9cfb8', '#f4f1ea', '#bfd0d4'];
const ROOF = ['#5d5a55', '#6b6157', '#7a6f62', '#4f4d4b', '#a8553a', '#8c8c86'];

// --- suburb: rooftops of the next street over, with trees and palms ----------
function suburb(g, w, h, rng) {
  const px = h / 12; // pixels per metre
  let x = 0;
  const trees = [];
  while (x < w) {
    const hw = rng.range(10, 16) * px;
    const wall = rng.range(2.6, 3.2) * px;
    const roofH = rng.range(1.6, 2.4) * px;
    const gy = h;
    g.fillStyle = rng.pick(STUCCO);
    g.fillRect(x, gy - wall, hw, wall);
    g.fillStyle = 'rgba(30,40,48,0.85)';
    for (let k = 0; k < 3; k++) g.fillRect(x + hw * (0.15 + k * 0.28), gy - wall * 0.75, hw * 0.12, wall * 0.42);
    g.fillStyle = rng.pick(ROOF);
    g.beginPath();
    g.moveTo(x - 0.6 * px, gy - wall);
    g.lineTo(x + hw * 0.3, gy - wall - roofH);
    g.lineTo(x + hw * 0.7, gy - wall - roofH);
    g.lineTo(x + hw + 0.6 * px, gy - wall);
    g.fill();
    trees.push(x + hw + rng.range(1, 4) * px);
    x += hw + rng.range(3, 8) * px;
  }
  for (const tx of trees) {
    const r = rng.next();
    if (r < 0.55) {
      const cr = rng.range(2.5, 4.5) * px;
      const cy = h - rng.range(5, 8) * px;
      g.fillStyle = hsl(30, 12, 22);
      g.fillRect(tx - 3, cy, 6, h - cy);
      wrapDraw(w, tx, cr * 2, (xx) => {
        for (let k = 0; k < 6; k++) blob(g, xx + rng.range(-cr, cr), cy + rng.range(-cr * 0.4, cr * 0.3), cr * rng.range(0.6, 1), cr * rng.range(0.4, 0.6), hsl(95 + rng.range(-8, 8), 30, rng.range(20, 30)));
      });
    } else if (r < 0.85) {
      const top = h - rng.range(7, 11) * px;
      g.strokeStyle = hsl(30, 10, 45);
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(tx, h);
      g.lineTo(tx + rng.range(-8, 8), top);
      g.stroke();
      wrapDraw(w, tx, 40, (xx) => palmCrown(g, xx, top, rng.range(1.6, 2.2) * px, hsl(90, 30, rng.range(25, 32))));
    }
  }
  // privacy fences in front
  g.fillStyle = 'rgba(140,118,90,0.95)';
  for (let fx = 0; fx < w; fx += rng.range(80, 200)) g.fillRect(fx, h - 1.8 * px, rng.range(50, 160), 1.8 * px);
}

// --- city: plazas, offices and parking decks ----------------------------------
function city(g, w, h, rng) {
  const px = h / 24;
  let x = 0;
  while (x < w) {
    const bw = rng.range(10, 28) * px;
    const bh = rng.range(5, 22) * px;
    const glass = rng.chance(0.35);
    const col = glass ? hsl(205, 20, rng.range(35, 48)) : rng.pick(['#e2d6bc', '#d8c8a8', '#efe9dd', '#c8c0b0', '#b9b2a6', '#d6c9b5']);
    g.fillStyle = col;
    g.fillRect(x, h - bh, bw, bh);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(x + bw * 0.85, h - bh, bw * 0.15, bh);
    // window grid
    const rows = Math.floor(bh / (3.2 * px));
    const colsN = Math.floor(bw / (2.6 * px));
    g.fillStyle = glass ? 'rgba(170,200,220,0.35)' : 'rgba(40,55,65,0.8)';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < colsN; c++) {
        if (!glass && rng.chance(0.08)) continue;
        g.fillRect(x + c * 2.6 * px + 0.6 * px, h - bh + r * 3.2 * px + 0.9 * px, 1.4 * px, (glass ? 2.6 : 1.4) * px);
      }
    }
    g.fillStyle = vary(col, -12);
    g.fillRect(x - 2, h - bh - 0.6 * px, bw + 4, 0.6 * px);
    if (rng.chance(0.3)) {
      g.fillStyle = '#9a9a96';
      g.fillRect(x + bw * 0.2, h - bh - 1.6 * px, bw * 0.2, 1.0 * px);
    }
    x += bw + rng.range(0, 6) * px;
  }
  for (let i = 0; i < 26; i++) {
    const tx = rng.range(0, w);
    const top = h - rng.range(7, 12) * px;
    g.strokeStyle = hsl(30, 10, 45);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(tx, h);
    g.lineTo(tx, top);
    g.stroke();
    wrapDraw(w, tx, 40, (xx) => palmCrown(g, xx, top, rng.range(1.6, 2.2) * px, hsl(90, 30, rng.range(25, 32))));
  }
}

function vary(css, dl) {
  const c = new THREE.Color(css);
  const o = {};
  c.getHSL(o);
  c.setHSL(o.h, o.s, Math.max(0, Math.min(1, o.l + dl / 100)));
  return '#' + c.getHexString();
}

// --- skyline: downtown Orlando on the horizon --------------------------------
function skyline(g, w, h, rng) {
  const px = h / 90;
  const haze = (l) => hsl(210, 12, l);
  // low city fabric
  for (let x = 0; x < w; ) {
    const bw = rng.range(8, 24) * px;
    const bh = rng.range(6, 20) * px;
    g.fillStyle = haze(rng.range(58, 66));
    g.fillRect(x, h - bh, bw, bh);
    x += bw;
  }
  // a cluster of towers, the tallest with a stepped crown
  const cx = rng.range(w * 0.3, w * 0.7);
  for (let i = 0; i < 16; i++) {
    const x = cx + rng.range(-260, 260);
    const bw = rng.range(10, 22) * px;
    const bh = rng.range(25, 70) * px * (1 - Math.abs(x - cx) / 400);
    g.fillStyle = haze(rng.range(50, 60));
    g.fillRect(x - bw / 2, h - bh, bw, bh);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(x - bw / 2, h - bh, bw * 0.4, bh);
  }
  const tw = 16 * px;
  const th = 82 * px;
  g.fillStyle = haze(52);
  g.fillRect(cx - tw / 2, h - th, tw, th);
  for (let k = 1; k <= 3; k++) g.fillRect(cx - tw / 2 + k * 2 * px, h - th - k * 2.5 * px, tw - k * 4 * px, 2.5 * px);
  g.fillRect(cx - 0.4 * px, h - th - 14 * px, 0.8 * px, 6 * px);
}

// --- grove: rows of citrus seen end-on ---------------------------------------
function grove(g, w, h, rng) {
  const px = h / 7;
  for (let x = 0; x < w; x += rng.range(2.6, 3.4) * px) {
    const r = rng.range(1.8, 2.3) * px;
    const cy = h - r * 1.25;
    g.fillStyle = hsl(30, 15, 20);
    g.fillRect(x - 3, cy, 6, h - cy);
    wrapDraw(w, x, r * 1.2, (xx) => {
      blob(g, xx, cy, r * 1.15, r, hsl(110, 35, rng.range(16, 22)));
      blob(g, xx - r * 0.3, cy - r * 0.3, r * 0.6, r * 0.5, hsl(105, 35, rng.range(24, 30)));
      for (let k = 0; k < 8; k++) blob(g, xx + rng.range(-r, r) * 0.8, cy + rng.range(-r, r) * 0.7, 3, 3, hsl(30, 90, 52));
    });
  }
}

const KINDS = {
  forest: { draw: forest(false, true, true), h: 256, H: 17, rep: 128 },
  forestDark: { draw: forest(true, true, false), h: 256, H: 20, rep: 128 },
  pines: { draw: pines(false), h: 512, H: 22, rep: 128 },
  cypress: { draw: pines(true), h: 512, H: 20, rep: 128 },
  suburb: { draw: suburb, h: 256, H: 12, rep: 150 },
  city: { draw: city, h: 512, H: 24, rep: 170 },
  skyline: { draw: skyline, h: 512, H: 90, rep: 700 },
  grove: { draw: grove, h: 128, H: 7, rep: 90 },
};

let MATS = null;
export function wallKinds() {
  if (MATS) return MATS;
  MATS = {};
  let seed = 900;
  for (const [k, v] of Object.entries(KINDS)) {
    const tex = paint(W, v.h, seed++, v.draw);
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, fog: k !== 'skyline' });
    MATS[k] = { mat, H: v.H, rep: v.rep };
  }
  return MATS;
}

// Walls aren't lit by the scene lights; match them to the sky instead.
const _c = new THREE.Color();
export function lightWalls(pal, night) {
  if (!MATS) return;
  _c.setRGB(1, 1, 1).lerp(pal.sun, 0.18).multiplyScalar(0.55 + pal.amb * 0.5);
  if (night > 0) _c.lerp(new THREE.Color(0x1a2234), night * 0.85);
  for (const k in MATS) MATS[k].mat.color.copy(_c);
  // the skyline sits deep in the haze
  MATS.skyline.mat.color.copy(_c).lerp(pal.hor, 0.5);
}
