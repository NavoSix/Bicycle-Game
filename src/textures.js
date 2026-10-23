import * as THREE from '../vendor/three.module.min.js';
import { RNG } from './rng.js';

function canvas(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function speckle(g, w, h, base, spread, n, rng, size = 2) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = rng.range(-spread, spread);
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(rng.range(0, w), rng.range(0, h), rng.range(1, size), rng.range(1, size));
  }
}

let T = null;
export function textures() {
  if (T) return T;
  const rng = new RNG(4242);
  T = {};
  T.grass = canvas(256, 256, (g, w, h) => {
    speckle(g, w, h, '#ffffff', 0.18, 9000, rng, 3);
    for (let i = 0; i < 1400; i++) {
      g.strokeStyle = `rgba(${rng.chance(0.5) ? '40,60,20' : '255,255,220'},${rng.range(0.05, 0.16)})`;
      const x = rng.range(0, w), y = rng.range(0, h);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + rng.range(-2, 2), y - rng.range(2, 6));
      g.stroke();
    }
  });
  const asphalt = (line, dark) => (g, w, h) => {
    speckle(g, w, h, dark ? '#4a4a4c' : '#55565a', 0.12, 6000, rng, 2);
    // worn tire paths
    g.fillStyle = 'rgba(0,0,0,0.05)';
    g.fillRect(w * 0.2, 0, w * 0.12, h);
    g.fillRect(w * 0.68, 0, w * 0.12, h);
    g.fillStyle = 'rgba(230,230,220,0.35)';
    g.fillRect(0, 0, 3, h);
    g.fillRect(w - 3, 0, 3, h);
    if (line === 'dash') {
      g.fillStyle = '#d8b030';
      g.fillRect(w / 2 - 3, 0, 6, h * 0.3);
    }
  };
  T.trail = canvas(128, 512, asphalt('dash'));
  T.road = canvas(256, 256, asphalt(null, true));
  T.road2 = canvas(256, 256, (g, w, h) => {
    asphalt(null, true)(g, w, h);
    g.fillStyle = '#d8b030';
    g.fillRect(w / 2 - 7, 0, 4, h);
    g.fillRect(w / 2 + 3, 0, 4, h);
    g.fillStyle = '#e8e8e0';
    g.fillRect(8, 0, 3, h);
    g.fillRect(w - 11, 0, 3, h);
  });
  T.road4 = canvas(256, 256, (g, w, h) => {
    asphalt(null, true)(g, w, h);
    g.fillStyle = '#d8b030';
    g.fillRect(w / 2 - 5, 0, 3, h);
    g.fillRect(w / 2 + 2, 0, 3, h);
    g.fillStyle = '#e8e8e0';
    g.fillRect(w * 0.25 - 1, 0, 3, h * 0.35);
    g.fillRect(w * 0.75 - 1, 0, 3, h * 0.35);
    g.fillRect(6, 0, 3, h);
    g.fillRect(w - 9, 0, 3, h);
  });
  T.concrete = canvas(128, 128, (g, w, h) => {
    speckle(g, w, h, '#bdb9ae', 0.08, 2500, rng, 2);
    g.fillStyle = 'rgba(60,60,50,0.4)';
    g.fillRect(0, 0, w, 2);
  });
  T.boards = canvas(256, 256, (g, w, h) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const l = rng.range(-0.06, 0.06);
      g.fillStyle = `hsl(28, 28%, ${44 + l * 100}%)`;
      g.fillRect(0, (i * h) / n, w, h / n);
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `rgba(40,25,10,${rng.range(0.03, 0.12)})`;
        g.fillRect(0, (i * h) / n + rng.range(0, h / n), w, 1);
      }
      g.fillStyle = 'rgba(20,12,5,0.55)';
      g.fillRect(0, (i * h) / n, w, 3);
    }
  });
  T.sand = canvas(256, 256, (g, w, h) => speckle(g, w, h, '#cdbd94', 0.14, 8000, rng, 2));
  T.litter = canvas(256, 256, (g, w, h) => {
    speckle(g, w, h, '#7a6a48', 0.12, 3000, rng, 2);
    for (let i = 0; i < 600; i++) {
      g.fillStyle = `hsla(${rng.range(20, 50)}, 40%, ${rng.range(20, 45)}%, 0.6)`;
      g.beginPath();
      g.ellipse(rng.range(0, w), rng.range(0, h), rng.range(2, 5), rng.range(1, 3), rng.range(0, 3), 0, Math.PI * 2);
      g.fill();
    }
  });
  return T;
}
