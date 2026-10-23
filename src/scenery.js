import * as THREE from '../vendor/three.module.min.js';

// ---------------------------------------------------------------------------
// Shared low-poly prototypes. Everything static in a chunk is collected into a
// Batcher and emitted as one InstancedMesh per prototype, so a whole stretch of
// trail costs a couple dozen draw calls no matter how many trees are in it.
// ---------------------------------------------------------------------------

function jitterGeometry(geo, amt, seed = 1) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // identical positions must move identically or the mesh cracks open
    const k = Math.round(v.x * 997) * 73856093 ^ Math.round(v.y * 991) * 19349663 ^ Math.round(v.z * 983) * 83492791 ^ seed;
    const r = ((Math.sin(k) * 43758.5453) % 1 + 1) % 1;
    v.multiplyScalar(1 + (r - 0.5) * amt);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function hipRoof() {
  // Florida ranch houses mostly have hip roofs. Unit footprint, height 1.
  const r = 0.22;
  const P = [
    [-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5],
    [-r, 1, 0], [r, 1, 0],
  ];
  const F = [
    [3, 2, 5], [3, 5, 4], // front
    [1, 0, 4], [1, 4, 5], // back
    [2, 1, 5], // right hip
    [0, 3, 4], // left hip
    [0, 1, 2], [0, 2, 3], // underside
  ];
  const arr = [];
  for (const f of F) for (const k of f) arr.push(...P[k]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  g.computeVertexNormals();
  return g;
}

function palmFrond() {
  // An arching pinnate frond along +z, V-folded down the middle.
  const seg = 7;
  const pos = [];
  const pt = (t, side) => {
    const w = 0.26 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.02;
    const y = 0.38 * t - 0.8 * t * t;
    return [side * w, y - Math.abs(side) * 0.05, t];
  };
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg;
    const t1 = (i + 1) / seg;
    const c0 = pt(t0, 0), c1 = pt(t1, 0);
    for (const s of [-1, 1]) {
      const e0 = pt(t0, s), e1 = pt(t1, s);
      pos.push(...c0, ...e0, ...e1, ...c0, ...e1, ...c1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function fanLeaf() {
  // Pleated fan (sabal / saw palmetto) radiating along +z.
  const n = 11;
  const pos = [];
  const spread = 1.0;
  for (let i = 0; i < n; i++) {
    const a0 = -spread + (2 * spread * i) / n;
    const a1 = -spread + (2 * spread * (i + 1)) / n;
    const y0 = i % 2 ? 0.08 : -0.04;
    const y1 = i % 2 ? -0.04 : 0.08;
    pos.push(0, 0, 0, Math.sin(a0), y0, Math.cos(a0), Math.sin(a1), y1, Math.cos(a1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

let PROTOS = null;
export const MAT = {};

export function protos() {
  if (PROTOS) return PROTOS;
  const lam = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const lam2 = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, side: THREE.DoubleSide });
  const glass = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 90, specular: 0x667788, flatShading: true });
  MAT.lam = lam;
  MAT.lam2 = lam2;
  const up = (g) => g.translate(0, 0.5, 0);
  const moss = new THREE.ConeGeometry(0.16, 1, 4);
  moss.rotateX(Math.PI);
  moss.translate(0, -0.5, 0);
  const blob = jitterGeometry(new THREE.IcosahedronGeometry(1, 1), 0.28, 3);
  const blob0 = jitterGeometry(new THREE.IcosahedronGeometry(1, 0), 0.2, 5);
  const oct = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
  oct.rotateX(Math.PI / 2);
  oct.rotateZ(Math.PI / 8);
  PROTOS = {
    box: { geo: up(new THREE.BoxGeometry(1, 1, 1)), mat: lam, shadow: true },
    flat: { geo: up(new THREE.BoxGeometry(1, 1, 1)), mat: lam, shadow: false },
    glass: { geo: up(new THREE.BoxGeometry(1, 1, 1)), mat: glass, shadow: false },
    cyl: { geo: up(new THREE.CylinderGeometry(1, 1, 1, 7)), mat: lam, shadow: true },
    trunk: { geo: up(new THREE.CylinderGeometry(0.62, 1, 1, 7)), mat: lam, shadow: true },
    cone: { geo: up(new THREE.ConeGeometry(1, 1, 7)), mat: lam, shadow: true },
    blob: { geo: blob, mat: lam, shadow: true },
    blob0: { geo: blob0, mat: lam, shadow: true },
    ball: { geo: new THREE.IcosahedronGeometry(1, 0), mat: lam, shadow: false },
    roof: { geo: hipRoof(), mat: lam, shadow: true },
    frond: { geo: palmFrond(), mat: lam2, shadow: true },
    fan: { geo: fanLeaf(), mat: lam2, shadow: true },
    moss: { geo: moss, mat: lam2, shadow: false },
    oct: { geo: oct, mat: lam, shadow: true },
    wheel: { geo: new THREE.CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2), mat: lam, shadow: true },
  };
  return PROTOS;
}

// ---------------------------------------------------------------------------
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class Batcher {
  constructor() {
    this.map = new Map();
    this.frame = null;
    this.colliders = [];
  }
  setFrame(x, y, z, ry) {
    this.frame = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    this.frameInfo = { x, z, ry };
  }
  clearFrame() {
    this.frame = null;
  }
  put(key, x, y, z, sx, sy, sz, rx, ry, rz, color) {
    _e.set(rx || 0, ry || 0, rz || 0, 'YXZ');
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    if (this.frame) _m2.multiplyMatrices(this.frame, _m);
    else _m2.copy(_m);
    let e = this.map.get(key);
    if (!e) this.map.set(key, (e = { m: [], c: [] }));
    for (let i = 0; i < 16; i++) e.m.push(_m2.elements[i]);
    _c.set(color);
    e.c.push(_c.r, _c.g, _c.b);
  }
  // collision circle (world space unless a frame is active)
  circle(x, z, r) {
    if (this.frame) {
      const { x: fx, z: fz, ry } = this.frameInfo;
      const c = Math.cos(ry), s = Math.sin(ry);
      this.colliders.push({ t: 'c', x: fx + c * x + s * z, z: fz - s * x + c * z, r });
    } else this.colliders.push({ t: 'c', x, z, r });
  }
  // oriented rectangle collider
  rect(x, z, hw, hd, ry) {
    this.colliders.push({ t: 'r', x, z, hw, hd, c: Math.cos(ry), s: Math.sin(ry) });
  }
  build() {
    const P = protos();
    const group = new THREE.Group();
    for (const [key, e] of this.map) {
      const p = P[key];
      const n = e.c.length / 3;
      const mesh = new THREE.InstancedMesh(p.geo, p.mat, n);
      mesh.instanceMatrix.array.set(e.m);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(e.c), 3);
      mesh.computeBoundingSphere();
      mesh.castShadow = p.shadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}

export function vary(hex, rng, dh = 0.02, ds = 0.08, dl = 0.08) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h + rng.range(-dh, dh), Math.min(1, Math.max(0, hsl.s + rng.range(-ds, ds))), Math.min(1, Math.max(0, hsl.l + rng.range(-dl, dl))));
  return c.getHex();
}

// ---------------------------------------------------------------------------
// Plants
// ---------------------------------------------------------------------------

export function liveOak(b, rng, x, z, s = 1, y0 = 0) {
  const th = rng.range(2.0, 3.0) * s;
  const tr = rng.range(0.35, 0.55) * s;
  const bark = vary(0x5b4f43, rng);
  b.put('trunk', x, y0, z, tr, th + 0.4, tr, rng.range(-0.1, 0.1), 0, rng.range(-0.1, 0.1), bark);
  b.circle(x, z, tr + 0.15);
  const top = y0 + th;
  const n = rng.int(3, 5);
  const a0 = rng.range(0, Math.PI * 2);
  b.put('blob', x, top + 2.6 * s, z, 3.2 * s, 1.8 * s, 3.2 * s, 0, rng.range(0, 6), 0, vary(0x47602d, rng));
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const tilt = rng.range(0.85, 1.25);
    const len = rng.range(3.2, 5.2) * s;
    const lr = tr * 0.45;
    b.put('trunk', x, top - 0.3, z, lr, len, lr, tilt, a, 0, bark);
    const ex = x + Math.sin(a) * Math.sin(tilt) * len;
    const ey = top - 0.3 + Math.cos(tilt) * len;
    const ez = z + Math.cos(a) * Math.sin(tilt) * len;
    const r = rng.range(2.4, 3.4) * s;
    b.put('blob', ex, ey + 0.6, ez, r, r * 0.55, r, 0, rng.range(0, 6), 0, vary(0x4a6430, rng));
    const m = rng.int(2, 5);
    for (let k = 0; k < m; k++) {
      const ma = rng.range(0, Math.PI * 2);
      const md = rng.range(0.35, 0.85) * r;
      const mx = ex + Math.sin(ma) * md, mz = ez + Math.cos(ma) * md;
      const col = vary(0x98a088, rng, 0.02, 0.05, 0.06);
      for (let q = 0; q < 4; q++) {
        b.put('moss', mx + rng.range(-0.35, 0.35), ey + 0.25, mz + rng.range(-0.35, 0.35), rng.range(0.6, 1.1), rng.range(0.6, 1.9), rng.range(0.6, 1.1), rng.range(-0.15, 0.15), rng.range(0, 6), rng.range(-0.15, 0.15), col);
      }
    }
  }
}

export function slashPine(b, rng, x, z, s = 1, y0 = 0) {
  const h = rng.range(11, 18) * s;
  const r = rng.range(0.2, 0.3) * s;
  const bark = vary(0x6e4b36, rng);
  b.put('trunk', x, y0, z, r, h, r, rng.range(-0.03, 0.03), 0, rng.range(-0.03, 0.03), bark);
  b.circle(x, z, r + 0.1);
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0.3, 1.5);
    const cr = rng.range(1.3, 2.2) * s;
    b.put('blob', x + Math.sin(a) * d, y0 + h - rng.range(0, 3.2), z + Math.cos(a) * d, cr, cr * 0.6, cr, 0, rng.range(0, 6), 0, vary(0x3f5a2b, rng));
  }
  if (rng.chance(0.5)) {
    const a = rng.range(0, Math.PI * 2);
    b.put('cyl', x, y0 + h * rng.range(0.5, 0.75), z, 0.05, 1.5, 0.05, 1.3, a, 0, 0x5e4c3f);
  }
}

export function cabbagePalm(b, rng, x, z, s = 1, y0 = 0) {
  const h = rng.range(4, 9) * s;
  const lean = rng.range(-0.12, 0.12);
  const leanA = rng.range(0, 6.28);
  b.put('cyl', x, y0, z, 0.24, h, 0.24, lean, leanA, 0, vary(0x7d6c58, rng));
  b.circle(x, z, 0.35);
  const tx = x + Math.sin(leanA) * Math.sin(lean) * h;
  const tz = z + Math.cos(leanA) * Math.sin(lean) * h;
  const ty = y0 + Math.cos(lean) * h;
  b.put('blob0', tx, ty - 0.3, tz, 0.45, 0.7, 0.45, 0, 0, 0, 0x6d5f45);
  const n = rng.int(12, 16);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const tilt = rng.range(-0.5, 1.1);
    const sc = rng.range(1.3, 1.8) * s;
    b.put('fan', tx, ty, tz, sc, sc, sc, tilt, a, 0, vary(0x546f36, rng));
  }
  for (let i = 0; i < rng.int(1, 4); i++) {
    b.put('fan', tx, ty - 0.2, tz, 1.3, 1.3, 1.3, rng.range(1.9, 2.4), rng.range(0, 6.28), 0, vary(0x8c7550, rng));
  }
}

export function queenPalm(b, rng, x, z, s = 1, y0 = 0) {
  const h = rng.range(5.5, 9) * s;
  const lean = rng.range(-0.08, 0.08);
  const leanA = rng.range(0, 6.28);
  b.put('cyl', x, y0, z, 0.17, h, 0.17, lean, leanA, 0, vary(0x9b9488, rng));
  b.circle(x, z, 0.3);
  const tx = x + Math.sin(leanA) * Math.sin(lean) * h;
  const tz = z + Math.cos(leanA) * Math.sin(lean) * h;
  const ty = y0 + Math.cos(lean) * h;
  b.put('cyl', tx, ty - 0.2, tz, 0.2, 0.9, 0.2, 0, 0, 0, 0x6f8a3c);
  const n = rng.int(9, 12);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const sc = rng.range(2.4, 3.1) * s;
    b.put('frond', tx, ty + 0.6, tz, sc, sc, sc * 1.25, rng.range(-0.6, 0.1), a, 0, vary(0x5a8434, rng));
  }
}

export function cypress(b, rng, x, z, s = 1, y0 = 0) {
  const h = rng.range(10, 17) * s;
  const bark = vary(0x8a8072, rng);
  b.put('cone', x, y0, z, 0.95 * s, 1.8 * s, 0.95 * s, 0, 0, 0, bark);
  b.put('trunk', x, y0, z, 0.32 * s, h, 0.32 * s, 0, 0, 0, bark);
  b.circle(x, z, 0.6 * s);
  const n = rng.int(4, 7);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0.4, 2.0);
    const cr = rng.range(1.2, 2.0) * s;
    b.put('blob', x + Math.sin(a) * d, y0 + h * rng.range(0.55, 1.0), z + Math.cos(a) * d, cr, cr * 0.5, cr, 0, rng.range(0, 6), 0, vary(0x6f8a3a, rng, 0.03, 0.1, 0.06));
  }
  for (let i = 0; i < rng.int(0, 4); i++) {
    const a = rng.range(0, 6.28);
    const d = rng.range(1.2, 2.6);
    b.put('cone', x + Math.sin(a) * d, y0, z + Math.cos(a) * d, 0.12, rng.range(0.3, 0.6), 0.12, 0, 0, 0, bark);
  }
}

export function citrus(b, rng, x, z, s = 1) {
  b.put('cyl', x, 0, z, 0.12, 0.8, 0.12, 0, 0, 0, 0x5a4a3a);
  b.circle(x, z, 0.3);
  const r = rng.range(1.6, 2.1) * s;
  const cy = 0.6 + r * 0.85;
  b.put('blob', x, cy, z, r, r * 0.9, r, 0, rng.range(0, 6), 0, vary(0x2f5826, rng, 0.02, 0.06, 0.05));
  const n = rng.int(8, 16);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const el = rng.range(-0.4, 0.9);
    const rr = r * 0.97;
    b.put('ball', x + Math.cos(el) * Math.sin(a) * rr, cy + Math.sin(el) * rr * 0.9, z + Math.cos(el) * Math.cos(a) * rr, 0.1, 0.1, 0.1, 0, 0, 0, vary(0xf28a1a, rng, 0.02, 0.05, 0.05));
  }
}

export function palmetto(b, rng, x, z, s = 1) {
  const n = rng.int(5, 10);
  const col = rng.chance(0.25) ? 0x7b9a82 : 0x5f7c3c;
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0, 0.8) * s;
    const px = x + Math.sin(a) * d;
    const pz = z + Math.cos(a) * d;
    const y = rng.range(0.25, 0.9) * s;
    b.put('cyl', px, 0, pz, 0.02, y, 0.02, 0, 0, 0, 0x6b6b3a);
    const sc = rng.range(0.6, 0.95) * s;
    b.put('fan', px, y, pz, sc, sc, sc, rng.range(-0.9, 0.4), a + rng.range(-0.6, 0.6), 0, vary(col, rng));
  }
}

export function shrub(b, rng, x, z, s = 1, color = 0x3f6a2e) {
  const n = rng.int(1, 3);
  for (let i = 0; i < n; i++) {
    const r = rng.range(0.5, 1.0) * s;
    b.put('blob', x + rng.range(-0.6, 0.6) * s, r * 0.5, z + rng.range(-0.6, 0.6) * s, r, r * 0.8, r, 0, rng.range(0, 6), 0, vary(color, rng));
  }
}

export function crapeMyrtle(b, rng, x, z) {
  const bloom = rng.pick([0xd0549a, 0xb366c4, 0xf2f0f0, 0xe0457a]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * 6.28 + rng.range(0, 1);
    b.put('cyl', x, 0, z, 0.06, 3.2, 0.06, 0.25, a, 0, 0xa38b72);
  }
  b.circle(x, z, 0.3);
  for (let i = 0; i < 5; i++) {
    const r = rng.range(0.8, 1.3);
    b.put('blob', x + rng.range(-1.1, 1.1), rng.range(3.0, 4.0), z + rng.range(-1.1, 1.1), r, r * 0.8, r, 0, rng.range(0, 6), 0, vary(bloom, rng, 0.02, 0.05, 0.06));
  }
  b.put('blob', x, 3.3, z, 1.2, 0.8, 1.2, 0, 0, 0, 0x4e6e33);
}

export function grassTuft(b, rng, x, z, s = 1, color = 0x6f8a3a) {
  for (let i = 0; i < 3; i++) {
    b.put('cone', x + rng.range(-0.3, 0.3), 0, z + rng.range(-0.3, 0.3), 0.12 * s, rng.range(0.4, 0.9) * s, 0.12 * s, rng.range(-0.3, 0.3), 0, rng.range(-0.3, 0.3), vary(color, rng));
  }
}

export function reeds(b, rng, x, z, y0 = 0) {
  for (let i = 0; i < 6; i++) {
    b.put('cyl', x + rng.range(-0.6, 0.6), y0, z + rng.range(-0.6, 0.6), 0.02, rng.range(1.0, 1.9), 0.02, rng.range(-0.2, 0.2), 0, rng.range(-0.2, 0.2), vary(0x7d8c46, rng));
  }
  if (rng.chance(0.4)) b.put('cyl', x, y0 + 1.3, z, 0.05, 0.25, 0.05, 0, 0, 0, 0x5a3d26); // cattail
}

export function lilyPads(b, rng, x, z, y) {
  for (let i = 0; i < rng.int(3, 8); i++) {
    const r = rng.range(0.2, 0.45);
    b.put('flat', x + rng.range(-2, 2), y, z + rng.range(-2, 2), r * 2, 0.02, r * 2, 0, rng.range(0, 6), 0, vary(0x4f7a32, rng));
  }
}

// ---------------------------------------------------------------------------
// Wildlife (static, but it sells the place)
// ---------------------------------------------------------------------------

export function egret(b, rng, x, z, rot, y0 = 0) {
  b.setFrame(x, y0, z, rot);
  b.put('cyl', 0.05, 0, 0, 0.012, 0.55, 0.012, 0, 0, 0, 0x222222);
  b.put('cyl', -0.05, 0, 0, 0.012, 0.55, 0.012, 0, 0, 0, 0x222222);
  b.put('blob0', 0, 0.75, 0, 0.16, 0.18, 0.3, 0.3, 0, 0, 0xf6f6f2);
  b.put('cyl', 0, 0.8, 0.18, 0.03, 0.5, 0.03, 0.35, 0, 0, 0xf6f6f2);
  b.put('blob0', 0, 1.27, 0.35, 0.06, 0.06, 0.09, 0, 0, 0, 0xf6f6f2);
  b.put('cone', 0, 1.27, 0.42, 0.02, 0.18, 0.02, Math.PI / 2, 0, 0, 0xe0b020);
  b.clearFrame();
}

export function crane(b, rng, x, z, rot) {
  b.setFrame(x, 0, z, rot);
  b.put('cyl', 0.07, 0, 0, 0.015, 0.75, 0.015, 0, 0, 0, 0x333333);
  b.put('cyl', -0.07, 0, 0, 0.015, 0.75, 0.015, 0, 0, 0, 0x333333);
  b.put('blob0', 0, 1.0, 0, 0.22, 0.24, 0.42, 0.15, 0, 0, 0x8d8a86);
  b.put('blob0', 0, 0.95, -0.35, 0.14, 0.16, 0.22, -0.5, 0, 0, 0x7a746c);
  b.put('cyl', 0, 1.1, 0.25, 0.04, 0.55, 0.04, 0.2, 0, 0, 0x8d8a86);
  b.put('blob0', 0, 1.62, 0.36, 0.08, 0.08, 0.11, 0, 0, 0, 0x9a9792);
  b.put('blob0', 0, 1.67, 0.37, 0.05, 0.03, 0.06, 0, 0, 0, 0xc0281e);
  b.put('cone', 0, 1.6, 0.45, 0.025, 0.2, 0.025, Math.PI / 2, 0, 0, 0x333333);
  b.clearFrame();
}

export function gator(b, rng, x, z, rot, y) {
  b.setFrame(x, y, z, rot);
  b.put('blob0', 0, -0.1, 0, 0.35, 0.18, 1.4, 0, 0, 0, 0x2e3324);
  b.put('blob0', 0, -0.08, 1.45, 0.18, 0.1, 0.45, 0, 0, 0, 0x2e3324);
  b.put('ball', 0.1, 0.04, 1.2, 0.05, 0.05, 0.05, 0, 0, 0, 0x2e3324);
  b.put('ball', -0.1, 0.04, 1.2, 0.05, 0.05, 0.05, 0, 0, 0, 0x2e3324);
  b.put('blob0', 0, -0.12, -1.6, 0.18, 0.08, 0.9, 0, 0, 0, 0x2e3324);
  b.clearFrame();
}

export function chicken(b, rng, x, z, rot) {
  const body = rng.pick([0x8b4a22, 0xb06a2c, 0x2b2b2b, 0xe8e2d0]);
  b.setFrame(x, 0, z, rot);
  b.put('cyl', 0.04, 0, 0, 0.01, 0.15, 0.01, 0, 0, 0, 0xd9a520);
  b.put('cyl', -0.04, 0, 0, 0.01, 0.15, 0.01, 0, 0, 0, 0xd9a520);
  b.put('blob0', 0, 0.27, 0, 0.13, 0.12, 0.17, 0, 0, 0, body);
  b.put('blob0', 0, 0.42, 0.12, 0.06, 0.07, 0.06, 0, 0, 0, body);
  b.put('blob0', 0, 0.5, 0.12, 0.015, 0.035, 0.04, 0, 0, 0, 0xcc2222);
  b.put('blob0', 0, 0.3, -0.16, 0.05, 0.1, 0.06, -0.5, 0, 0, 0x1e3a2a);
  b.clearFrame();
}

// ---------------------------------------------------------------------------
// Built things
// ---------------------------------------------------------------------------

const STUCCO = [0xefe6d2, 0xe8d8b4, 0xf2e8c8, 0xd9d4c8, 0xe6c9b0, 0xc9cfb8, 0xf4f1ea, 0xd8c3a2, 0xbfd0d4, 0xe8d0a8];
const ROOF = [0x5d5a55, 0x6b6157, 0x7a6f62, 0x4f4d4b, 0xa8553a, 0x8c8c86, 0x6a5040];
const DOOR = [0x7a2c22, 0x23465f, 0x2f5a4a, 0x5a3b26, 0xf4f1ea, 0x1e2a33, 0xb8862b];

export function house(b, rng, x, z, rot, opts = {}) {
  const w = rng.range(11, 15.5);
  const d = rng.range(9, 12);
  const h = rng.range(2.8, 3.2);
  const stucco = vary(rng.pick(STUCCO), rng, 0.01, 0.04, 0.03);
  const roof = vary(rng.pick(ROOF), rng, 0.01, 0.04, 0.04);
  const trim = 0xf6f4ee;
  const door = rng.pick(DOOR);
  const shutter = rng.chance(0.6) ? rng.pick(DOOR) : null;
  const glass = 0x2c3b45;
  b.setFrame(x, 0, z, rot);
  b.put('box', 0, 0, 0, w + 0.4, 0.25, d + 0.4, 0, 0, 0, 0xbcb5a6);
  b.put('box', 0, 0.25, 0, w, h, d, 0, 0, 0, stucco);
  b.put('box', 0, 0.25 + h - 0.05, 0, w + 1.3, 0.28, d + 1.3, 0, 0, 0, trim);
  b.put('roof', 0, 0.25 + h + 0.2, 0, w + 1.3, rng.range(1.8, 2.6), d + 1.3, 0, 0, 0, roof);
  // garage
  const gx = -w / 2 + 3.0;
  b.put('box', gx, 0.25, d / 2, 4.8, 2.2, 0.12, 0, 0, 0, 0xf2f0ea);
  for (let k = 1; k < 4; k++) b.put('flat', gx, 0.25 + k * 0.55, d / 2 + 0.07, 4.7, 0.03, 0.02, 0, 0, 0, 0xc8c6c0);
  // door
  const dx = gx + 4.2;
  b.put('box', dx, 0.25, d / 2, 1.0, 2.15, 0.12, 0, 0, 0, door);
  b.put('box', dx, 0, d / 2 + 0.6, 1.8, 0.25, 1.2, 0, 0, 0, 0xbcb5a6);
  // windows
  const win = (wx, wy, wz, ww, wh, ry) => {
    b.put('flat', wx, wy - 0.08, wz, ww + 0.2, wh + 0.16, 0.1, 0, ry, 0, trim);
    b.put('glass', wx, wy, wz + (ry ? 0 : 0.03), ww, wh, 0.1, 0, ry, 0, glass);
  };
  const wxs = [dx + 1.8, w / 2 - 1.6];
  for (const wx of wxs) {
    if (wx > w / 2 - 0.9) continue;
    win(wx, 1.15, d / 2 + 0.02, 1.3, 1.25, 0);
    if (shutter) {
      b.put('flat', wx - 0.9, 1.05, d / 2 + 0.04, 0.4, 1.45, 0.06, 0, 0, 0, shutter);
      b.put('flat', wx + 0.9, 1.05, d / 2 + 0.04, 0.4, 1.45, 0.06, 0, 0, 0, shutter);
    }
  }
  // back windows + slider
  for (const wx of [-w / 4 - 1, w / 4 + 1]) {
    b.put('flat', wx, 1.07, -d / 2 - 0.08, 1.5, 1.4, 0.1, 0, 0, 0, trim);
    b.put('glass', wx, 1.15, -d / 2 - 0.1, 1.3, 1.25, 0.1, 0, 0, 0, glass);
  }
  b.put('glass', 0, 0.3, -d / 2 - 0.1, 2.6, 2.1, 0.1, 0, 0, 0, 0x3a4c58);
  b.put('box', w / 2 + 0.6, 0, -d / 4, 0.9, 0.9, 0.9, 0, 0, 0, 0x9a9a98); // A/C
  let depth = d / 2 + 0.5;
  if (opts.pool) {
    // a screened pool cage, the most Florida thing there is
    const cw = Math.min(w - 1, rng.range(8, 11));
    const cd = rng.range(7, 9);
    const z0 = -d / 2;
    const z1 = z0 - cd;
    const bronze = 0x3b332b;
    b.put('flat', 0, 0, (z0 + z1) / 2, cw, 0.12, cd, 0, 0, 0, 0xd9d1c0);
    b.put('flat', 0, 0.1, (z0 + z1) / 2 - 0.6, cw - 3, 0.04, cd - 3, 0, 0, 0, 0x3db4d8);
    const hh = 3.4;
    for (let k = 0; k <= 4; k++) {
      const px = -cw / 2 + (k * cw) / 4;
      b.put('box', px, 0, z1, 0.08, hh, 0.08, 0, 0, 0, bronze);
      b.put('box', px, hh, (z0 + z1) / 2, 0.06, 0.06, cd, 0, 0, 0, bronze);
    }
    for (let k = 1; k < 4; k++) {
      const pz = z0 - (k * cd) / 4;
      b.put('box', -cw / 2, 0, pz, 0.08, hh, 0.08, 0, 0, 0, bronze);
      b.put('box', cw / 2, 0, pz, 0.08, hh, 0.08, 0, 0, 0, bronze);
    }
    b.put('box', 0, hh, z1, cw, 0.06, 0.06, 0, 0, 0, bronze);
    b.put('box', 0, 1.0, z1, cw, 0.05, 0.05, 0, 0, 0, bronze);
    b.put('box', -cw / 2, 1.0, (z0 + z1) / 2, 0.05, 0.05, cd, 0, 0, 0, bronze);
    b.put('box', cw / 2, 1.0, (z0 + z1) / 2, 0.05, 0.05, cd, 0, 0, 0, bronze);
    b.put('box', 0, hh + 0.9, (z0 + z1) / 2, 0.06, 0.06, cd, 0, 0, 0, bronze);
    b.put('box', -cw / 4, hh + 0.45, (z0 + z1) / 2, 0.05, 0.05, cd, 0, 0, 0.4, bronze);
    b.put('box', cw / 4, hh + 0.45, (z0 + z1) / 2, 0.05, 0.05, cd, 0, 0, -0.4, bronze);
    depth = d / 2 + cd + 0.5;
  }
  if (opts.reach) {
    const drive = opts.reach - d / 2;
    b.put('flat', gx, 0, d / 2 + drive / 2, 5.2, 0.05, drive, 0, 0, 0, 0xc9c4b8);
    b.put('flat', dx, 0, d / 2 + 1.2 + (drive - 1.2) / 2, 1.2, 0.04, drive - 1.2, 0, 0, 0, 0xc9c4b8);
  }
  if (opts.car) car(b, rng, gx + rng.range(-0.8, 0.8), d / 2 + 3.5, 0, rng.chance(0.5));
  b.clearFrame();
  // collider covers house + cage
  const extra = depth - d / 2 - 0.5;
  const cz = -extra / 2;
  b.rect(x + Math.sin(rot) * cz, z + Math.cos(rot) * cz, w / 2 + 0.6, d / 2 + 0.5 + extra / 2, rot);
  return { w, d, gx, dx };
}

const CAR_COLORS = [0xf4f4f4, 0x1c1c1c, 0x8a9096, 0xb8bcc0, 0x7c1a1a, 0x1f3a64, 0x2f4f3f, 0xc9b38a, 0x3a5f8f, 0xe8e2d0];

export function car(b, rng, lx, lz, lrot, truck = false) {
  // placed in the current frame (or world if none)
  const col = rng.pick(CAR_COLORS);
  const len = truck ? 5.3 : 4.6;
  const wid = 1.85;
  const c = Math.cos(lrot), s = Math.sin(lrot);
  const P = (ax, ay, az, sx, sy, sz, color, key = 'box') => b.put(key, lx + c * ax + s * az, ay, lz - s * ax + c * az, sx, sy, sz, 0, lrot, 0, color);
  P(0, 0.35, 0, wid, 0.7, len, col);
  if (truck) {
    P(0, 1.05, 0.5, wid - 0.08, 0.65, 2.0, col);
    P(0, 1.1, 0.5, wid - 0.04, 0.5, 1.9, 0x253039, 'glass');
  } else {
    P(0, 1.05, -0.2, wid - 0.1, 0.6, 2.4, col);
    P(0, 1.1, -0.2, wid - 0.06, 0.45, 2.3, 0x253039, 'glass');
  }
  for (const [wx, wz] of [[wid / 2 - 0.1, len / 2 - 0.9], [-wid / 2 + 0.1, len / 2 - 0.9], [wid / 2 - 0.1, -len / 2 + 0.9], [-wid / 2 + 0.1, -len / 2 + 0.9]]) {
    P(wx, 0.0, wz, 0.25, 0.66, 0.66, 0x1a1a1a, 'wheel');
  }
}

export function mailbox(b, rng, x, z, rot) {
  b.setFrame(x, 0, z, rot);
  b.put('box', 0, 0, 0, 0.1, 1.05, 0.1, 0, 0, 0, rng.chance(0.5) ? 0xf2f0ea : 0x4a3a2a);
  b.put('box', 0, 1.0, 0, 0.25, 0.25, 0.5, 0, 0, 0, rng.pick([0x222222, 0x2f2f2f, 0xf2f0ea, 0x1f3a2a]));
  b.clearFrame();
}

export function bins(b, rng, x, z, rot) {
  b.setFrame(x, 0, z, rot);
  b.put('box', 0, 0, 0, 0.65, 1.05, 0.7, 0, 0, 0, 0x2a4a2a);
  b.put('box', 0.8, 0, 0, 0.65, 1.05, 0.7, 0, 0, 0, 0x1f3f74);
  b.clearFrame();
}

export function streetLight(b, x, z, rot) {
  b.setFrame(x, 0, z, rot);
  b.put('cyl', 0, 0, 0, 0.09, 7, 0.09, 0, 0, 0, 0x6d6d6a);
  b.put('box', 0, 6.9, 0.9, 0.08, 0.08, 1.8, 0, 0, 0, 0x6d6d6a);
  b.put('box', 0, 6.75, 1.8, 0.3, 0.18, 0.6, 0, 0, 0, 0x6d6d6a);
  b.clearFrame();
  b.circle(x, z, 0.2);
}

export function bench(b, x, z, rot) {
  b.setFrame(x, 0, z, rot);
  for (const sx of [-0.7, 0.7]) b.put('box', sx, 0, 0, 0.08, 0.45, 0.45, 0, 0, 0, 0x3a3a3a);
  for (let k = 0; k < 3; k++) b.put('box', 0, 0.45, -0.15 + k * 0.15, 1.7, 0.04, 0.11, 0, 0, 0, 0x8a6a48);
  for (let k = 0; k < 2; k++) b.put('box', 0, 0.65 + k * 0.17, -0.25, 1.7, 0.1, 0.04, 0, 0, 0, 0x8a6a48);
  b.clearFrame();
}

export function bollard(b, x, z) {
  b.put('cyl', x, 0, z, 0.1, 0.95, 0.1, 0, 0, 0, 0xf2f2ee);
  b.put('cyl', x, 0.7, z, 0.105, 0.1, 0.105, 0, 0, 0, 0xd8b21c);
  b.circle(x, z, 0.15);
}

export function stopSign(b, x, z, rot) {
  b.setFrame(x, 0, z, rot);
  b.put('box', 0, 0, 0, 0.06, 2.2, 0.06, 0, 0, 0, 0x8a8a88);
  b.put('oct', 0, 2.2, 0.05, 0.75, 0.75, 0.04, 0, 0, 0, 0xb3141b);
  b.put('oct', 0, 2.2, 0.03, 0.8, 0.8, 0.03, 0, 0, 0, 0xf4f4f4);
  b.clearFrame();
}

export function bikeRack(b, x, z, rot) {
  b.setFrame(x, 0, z, rot);
  for (let k = 0; k < 4; k++) {
    b.put('box', -1.2 + k * 0.8, 0, 0, 0.05, 0.8, 0.05, 0, 0, 0, 0x2a5a8a);
    b.put('box', -1.2 + k * 0.8, 0.75, 0, 0.05, 0.05, 0.7, 0, 0, 0, 0x2a5a8a);
  }
  b.clearFrame();
}

export function fenceRun(b, ax, az, bx, bz, h, color, post = true) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  const rot = Math.atan2(dx, dz);
  b.put('box', (ax + bx) / 2, 0, (az + bz) / 2, 0.06, h, len + 0.02, 0, rot, 0, color);
  if (post) b.put('box', ax, 0, az, 0.12, h + 0.08, 0.12, 0, rot, 0, 0x7a6650);
}

export function strip(b, rng, x, z, rot, opts = {}) {
  // a strip-mall plaza, front faces local +z
  const n = rng.int(3, 7);
  const unit = rng.range(9, 13);
  const W = n * unit;
  const D = rng.range(14, 20);
  const H = rng.range(4.5, 6);
  const wall = vary(rng.pick([0xe8dcc0, 0xd8c8a8, 0xefe9dd, 0xcfc0a0, 0xd6c9b5]), rng, 0.01, 0.04, 0.03);
  b.setFrame(x, 0, z, rot);
  b.put('box', 0, 0, 0, W, H, D, 0, 0, 0, wall);
  b.put('box', 0, H, 0, W + 0.2, 0.7, D + 0.2, 0, 0, 0, vary(wall, rng, 0, 0, 0.06));
  b.put('box', 0, H - 1.3, D / 2 + 1.2, W, 0.25, 2.6, 0, 0, 0, 0x9a8a72); // covered walkway
  for (let k = 0; k < n; k++) {
    const cx = -W / 2 + unit * (k + 0.5);
    b.put('box', cx - unit / 2 + 0.2, 0, D / 2 + 2.3, 0.3, H - 1.2, 0.3, 0, 0, 0, wall);
    b.put('glass', cx, 0.1, D / 2 + 0.02, unit - 1.6, 2.6, 0.1, 0, 0, 0, 0x2a3a44);
    const sign = rng.pick([0xb32020, 0x1d5fa8, 0x2c7a3a, 0xd98a1a, 0x6a2a7a, 0x1a1a1a, 0xc23a6a, 0x0f6f6f]);
    b.put('box', cx, H - 0.95, D / 2 + 2.52, unit * 0.6, 0.6, 0.08, 0, 0, 0, sign);
    b.put('box', cx, H - 0.85, D / 2 + 2.58, unit * 0.45, 0.3, 0.04, 0, 0, 0, 0xf4f0e0);
  }
  b.clearFrame();
  b.rect(x + Math.sin(rot) * 1, z + Math.cos(rot) * 1, W / 2 + 0.3, D / 2 + 2.6, rot);
  return { W, D };
}

export function canopy(b, x, z, rot) {
  // gas station canopy
  b.setFrame(x, 0, z, rot);
  for (const px of [-6, 6]) for (const pz of [-3, 3]) b.put('box', px, 0, pz, 0.4, 4.8, 0.4, 0, 0, 0, 0xe8e8e2);
  b.put('box', 0, 4.8, 0, 16, 0.9, 9, 0, 0, 0, 0xf2f2ee);
  b.put('box', 0, 5.15, 0, 16.1, 0.3, 9.1, 0, 0, 0, 0x1f6fb3);
  for (const px of [-3, 3]) b.put('box', px, 0, 0, 0.8, 1.6, 0.5, 0, 0, 0, 0xd0d0cc);
  b.clearFrame();
  b.rect(x, z, 8, 4.5, rot);
}

// ---------------------------------------------------------------------------
// Text signs (separate meshes with canvas textures)
// ---------------------------------------------------------------------------

export function signTexture(lines, bg, fg, w = 512, h = 256, border = true) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (border) {
    g.strokeStyle = fg;
    g.lineWidth = 8;
    g.strokeRect(12, 12, w - 24, h - 24);
  }
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const total = lines.reduce((a, l) => a + l.size * 1.15, 0);
  let y = h / 2 - total / 2;
  for (const l of lines) {
    g.font = `${l.weight || 700} ${l.size}px ${l.font || 'Helvetica, Arial, sans-serif'}`;
    let size = l.size;
    while (g.measureText(l.text).width > w - 50 && size > 10) {
      size -= 2;
      g.font = `${l.weight || 700} ${size}px ${l.font || 'Helvetica, Arial, sans-serif'}`;
    }
    y += l.size * 0.575;
    g.fillText(l.text, w / 2, y);
    y += l.size * 0.575;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const postMat = new THREE.MeshLambertMaterial({ color: 0x8a8a86 });
const brownPost = new THREE.MeshLambertMaterial({ color: 0x5a4430 });
const postGeo = new THREE.BoxGeometry(0.1, 1, 0.1).translate(0, 0.5, 0);

export function textSign(tex, width, height, elevation, posts = 2, wood = false) {
  const g = new THREE.Group();
  const front = new THREE.MeshLambertMaterial({ map: tex });
  const back = new THREE.MeshLambertMaterial({ color: wood ? 0x5a4430 : 0x9a9a96 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.06), [back, back, back, back, front, back]);
  board.position.y = elevation + height / 2;
  board.castShadow = true;
  g.add(board);
  const px = posts === 1 ? [0] : [-width * 0.35, width * 0.35];
  for (const x of px) {
    const p = new THREE.Mesh(postGeo, wood ? brownPost : postMat);
    p.scale.set(wood ? 1.6 : 1, elevation + height, wood ? 1.6 : 1);
    p.position.set(x, 0, -0.06);
    p.castShadow = true;
    g.add(p);
  }
  g.userData.dispose = () => {
    tex.dispose();
    front.dispose();
    back.dispose();
    board.geometry.dispose();
  };
  return g;
}
