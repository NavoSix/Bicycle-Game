import * as THREE from '../vendor/three.module.min.js';
import { RNG, hash } from './rng.js';
import { STEP } from './path.js';
import { textures } from './textures.js';
import * as S from './scenery.js';

export const CH = 100; // path points per chunk (200 m)
const MILE = 1609.344;

const ROAD_NAMES = [
  'Red Bug Lake Rd', 'Tuskawilla Rd', 'Winter Springs Blvd', 'Northern Way', 'Old Sanford Oviedo Rd',
  'Lake Jesup Ave', 'Mitchell Hammock Rd', 'Lockwood Blvd', 'Alafaya Trl', 'Aloma Ave', 'Howell Branch Rd',
  'Dike Rd', 'Eagle Blvd', 'Shepard Rd', 'Moss Rd', 'Gardena Ave', 'Central Ave', 'Orange Blvd',
  'Lake Howell Rd', 'Dodd Rd', 'Chapman Rd', 'Lake Mary Blvd', 'Wekiva Springs Rd', 'Ranchland Trl',
  'Hayes Rd', 'Vistawilla Dr', 'Seneca Blvd', 'Sweetwater Blvd', 'Palm Springs Dr', 'Live Oak Blvd',
];

export const GROUND_TINT = {
  street: 0x6a9440,
  suburbTrail: 0x6a9440,
  town: 0x76944a,
  hammock: 0x6e6a40,
  flatwoods: 0x9a9660,
  wetland: 0x5f7e3a,
  lake: 0x68913f,
  grove: 0x759844,
};

// --- shared strip materials -----------------------------------------------
let M = null;
function mats() {
  if (M) return M;
  const T = textures();
  const lam = (map, color = 0xffffff) => new THREE.MeshLambertMaterial({ map, color });
  M = {
    trail: lam(T.trail),
    road: lam(T.road),
    road2: lam(T.road2),
    road4: lam(T.road4),
    concrete: lam(T.concrete),
    board: lam(T.boards, 0xd8c8b0),
    sand: lam(T.sand),
    litter: lam(T.litter),
    parking: lam(T.road, 0xdddddd),
    lake: new THREE.MeshPhongMaterial({ color: 0x3d6b78, specular: 0x8fb0c0, shininess: 70, flatShading: false }),
    swamp: new THREE.MeshPhongMaterial({ color: 0x2e3f2c, specular: 0x667766, shininess: 60 }),
    pond: new THREE.MeshPhongMaterial({ color: 0x3a6660, specular: 0x88aaaa, shininess: 70 }),
  };
  for (const k of ['lake', 'swamp', 'pond', 'sand', 'litter', 'concrete']) {
    M[k].polygonOffset = true;
    M[k].polygonOffsetFactor = -1;
  }
  return M;
}

// Build a strip that follows the path between lateral offsets.
// lat(p, i) -> [left, right] (left < right), y(p) -> height.
function strip(path, i0, i1, lat, y, mat, opts = {}) {
  const pos = [];
  const uv = [];
  const idx = [];
  const vScale = opts.vScale || 10;
  const uScale = opts.uScale || 0;
  let n = 0;
  for (let i = i0; i <= i1; i++) {
    const p = path.pts[i];
    const [l, r] = lat(p, i);
    const rx = -Math.cos(p.h), rz = Math.sin(p.h);
    const yy = y(p);
    pos.push(p.x + rx * l, yy, p.z + rz * l, p.x + rx * r, yy, p.z + rz * r);
    const v = p.d / vScale;
    if (uScale) uv.push(l / uScale, v, r / uScale, v);
    else uv.push(0, v, 1, v);
    if (i > i0) {
      const a = n - 2, b = n - 1, c = n, d = n + 1;
      idx.push(a, b, c, b, d, c);
    }
    n += 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

function runs(i0, i1, test) {
  // contiguous [a, b] index ranges where test(i) holds (b inclusive)
  const out = [];
  let a = -1;
  for (let i = i0; i <= i1; i++) {
    if (test(i)) {
      if (a < 0) a = i;
    } else if (a >= 0) {
      out.push([a, i - 1 >= a ? i - 1 : a]);
      a = -1;
    }
  }
  if (a >= 0) out.push([a, i1]);
  return out.filter(([a, b]) => b > a);
}

export class World {
  constructor(scene, path, seed) {
    this.scene = scene;
    this.path = path;
    this.seed = seed;
    this.chunks = new Map();
    this.root = new THREE.Group();
    scene.add(this.root);
    this.start = null;
    path.ensure(CH * 4);
  }

  update(playerIndex, budget = 1) {
    const c = Math.floor(playerIndex / CH);
    const want = [];
    for (let k = c - 1; k <= c + 3; k++) if (k >= 0) want.push(k);
    // nearest-first
    want.sort((a, b) => Math.abs(a - c - 0.5) - Math.abs(b - c - 0.5));
    for (const k of want) {
      if (!this.chunks.has(k) && budget > 0) {
        this.buildChunk(k);
        budget--;
      }
    }
    for (const [k, ch] of this.chunks) {
      if (k < c - 2 || k > c + 4) {
        this.disposeChunk(ch);
        this.chunks.delete(k);
      }
    }
  }

  colliders(c) {
    const out = [];
    for (let k = c - 1; k <= c + 1; k++) {
      const ch = this.chunks.get(k);
      if (ch) out.push(ch.colliders);
    }
    return out;
  }

  disposeChunk(ch) {
    this.root.remove(ch.group);
    ch.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      else if (o.isMesh && o.userData.ownGeo) o.geometry.dispose();
      if (o.userData.dispose) o.userData.dispose();
    });
  }

  buildChunk(c) {
    const path = this.path;
    const i0 = c * CH;
    const i1 = (c + 1) * CH;
    path.ensure(i1 + CH);
    const rng = new RNG(hash(this.seed, c, 5));
    const b = new S.Batcher();
    const group = new THREE.Group();
    const add = (m) => {
      m.userData.ownGeo = true;
      group.add(m);
      return m;
    };
    const mt = mats();
    const pts = path.pts;

    const ctx = {
      b, rng, path, pts, c, i0, i1, group, add, seed: this.seed,
      at(i, lat) {
        const p = pts[i];
        return { x: p.x - Math.cos(p.h) * lat, z: p.z + Math.sin(p.h) * lat, h: p.h, p };
      },
      ok(x, z, clr, i) {
        if (path.clearance(x, z, i - 70, i + 70) < clr) return false;
        for (const cr of path.crossings) {
          if (Math.abs(cr.i - i) > 120) continue;
          const dx = x - cr.x, dz = z - cr.z;
          const along = dx * Math.sin(cr.h) + dz * Math.cos(cr.h);
          if (Math.abs(along) < 5 + clr) return false;
        }
        return true;
      },
    };
    ctx.place = (i, lat, clr, fn) => {
      const q = ctx.at(i, lat);
      if (!ctx.ok(q.x, q.z, clr, i)) return false;
      fn(q.x, q.z, q.h, q.p);
      return true;
    };

    // ---- surfaces ----------------------------------------------------------
    for (const [a, bb] of runs(i0, i1, (i) => pts[i].surf === 'trail' || pts[i].surf === 'board' || pts[i].surf === 'road')) {
      // split by material
      for (const kind of ['trail', 'board', 'road']) {
        for (const [ra, rb] of runs(a, bb, (i) => pts[i].surf === kind || (i > a && pts[i - 1].surf === kind))) {
          const mat = kind === 'trail' ? mt.trail : kind === 'board' ? mt.board : mt.road;
          add(strip(path, ra, rb, (p) => [-p.w / 2, p.w / 2], (p) => p.y, mat, { vScale: kind === 'board' ? 1.6 : kind === 'trail' ? 12 : 9 }));
        }
      }
    }
    // sidewalks along streets, sand shoulders in flatwoods
    for (const [a, bb] of runs(i0, i1, (i) => pts[i].type === 'street' && pts[i].d > 30)) {
      add(strip(path, a, bb, () => [-6.1, -4.6], () => 0.07, mt.concrete, { vScale: 1.6 }));
      add(strip(path, a, bb, () => [4.6, 6.1], () => 0.07, mt.concrete, { vScale: 1.6 }));
    }
    for (const [a, bb] of runs(i0, i1, (i) => pts[i].type === 'flatwoods')) {
      add(strip(path, a, bb, (p) => [-p.w / 2 - 2.5, -p.w / 2 + 0.1], () => 0.035, mt.sand, { vScale: 6, uScale: 6 }));
      add(strip(path, a, bb, (p) => [p.w / 2 - 0.1, p.w / 2 + 2.5], () => 0.035, mt.sand, { vScale: 6, uScale: 6 }));
    }
    for (const [a, bb] of runs(i0, i1, (i) => pts[i].type === 'hammock')) {
      add(strip(path, a, bb, (p) => [-p.w / 2 - 9, -p.w / 2 - 0.3], () => 0.03, mt.litter, { vScale: 7, uScale: 7 }));
      add(strip(path, a, bb, (p) => [p.w / 2 + 0.3, p.w / 2 + 9], () => 0.03, mt.litter, { vScale: 7, uScale: 7 }));
    }
    // town: parallel 4-lane road on the left + parking on the right
    for (const [a, bb] of runs(i0, i1, (i) => pts[i].type === 'town')) {
      add(strip(path, a, bb, () => [-17.5, -6], () => 0.04, mt.road4, { vScale: 12 }));
      add(strip(path, a, bb, () => [-19.5, -17.5], () => 0.07, mt.concrete, { vScale: 1.6 }));
    }
    // wetland water under raised boardwalk
    for (const [a, bb] of runs(i0, i1, (i) => pts[i].surf === 'board' && pts[i].y > 0.35)) {
      const f = (p) => Math.min(1, (p.y - 0.35) / 0.4);
      add(strip(path, a, bb, (p, i) => [-(4 + 36 * f(p) + 6 * Math.sin(i * 0.13)), 4 + 36 * f(p) + 6 * Math.sin(i * 0.11 + 2)], () => 0.03, mt.swamp));
    }

    // ---- scenery -----------------------------------------------------------
    if (c === 0) this.buildHome(ctx);
    this.decorate(ctx);

    const inst = b.build();
    group.add(inst);
    this.root.add(group);
    const ch = { c, group, colliders: b.colliders };
    this.chunks.set(c, ch);
    return ch;
  }

  // --------------------------------------------------------------------------
  buildHome(ctx) {
    const { b, add } = ctx;
    const rng = new RNG(hash(this.seed, 31337));
    const mt = mats();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(13, 40).rotateX(-Math.PI / 2), mt.road);
    disc.position.y = 0.035;
    disc.receiveShadow = true;
    add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(14, 15.5, 48).rotateX(-Math.PI / 2), mt.concrete);
    ring.position.y = 0.07;
    ring.receiveShadow = true;
    add(ring);
    // island in the middle of the cul-de-sac
    const island = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.2, 0.2, 28), new THREE.MeshLambertMaterial({ color: 0x5f8a3a }));
    island.position.y = 0.1;
    island.receiveShadow = true;
    add(island);
    S.queenPalm(b, rng, 0.5, 0.3, 1.0);
    S.queenPalm(b, rng, -1.2, -0.8, 0.9);
    S.shrub(b, rng, 1.5, -1.5, 0.8, 0x4a7a32);
    S.crapeMyrtle(b, rng, -1.8, 1.4);
    b.circle(0, 0, 4.2);

    const R = 28;
    const angles = [-90, -142, 180, 142, 92];
    for (const deg of angles) {
      const t = (deg * Math.PI) / 180;
      const x = Math.sin(t) * R;
      const z = Math.cos(t) * R;
      const rot = t + Math.PI;
      const home = deg === -90;
      const info = S.house(b, rng, x, z, rot, { pool: home || rng.chance(0.5), reach: R - 15.3, car: !home && rng.chance(0.7) });
      const c = Math.cos(rot), s = Math.sin(rot);
      const L = (lx, lz) => ({ x: x + c * lx + s * lz, z: z - s * lx + c * lz });
      // yard trees
      const yt = L(info.w / 2 + 3, info.d / 2 + 4);
      if (rng.chance(0.7)) S.liveOak(b, rng, yt.x, yt.z, 0.9);
      else S.cabbagePalm(b, rng, yt.x, yt.z);
      const mb = L(info.gx + 4.4, R - 15.6);
      S.mailbox(b, rng, mb.x, mb.z, rot);
      if (home) {
        // your car on one side of the driveway, you on the other
        b.setFrame(x, 0, z, rot);
        S.car(b, rng, info.gx - 1.3, info.d / 2 + 2.9, 0, false);
        b.clearFrame();
        const cp = L(info.gx - 1.3, info.d / 2 + 2.9);
        b.rect(cp.x, cp.z, 1.1, 2.5, rot);
        const pa = L(info.w / 2 + 1.2, info.d / 2 - 1);
        S.queenPalm(b, rng, pa.x, pa.z, 0.9);
        const pb = L(info.w / 2 + 1.2, -info.d / 2 + 1);
        S.queenPalm(b, rng, pb.x, pb.z, 1.0);
        const bn = L(info.gx - 3.3, R - 16.2);
        S.bins(b, rng, bn.x, bn.z, rot);
        const sp = L(info.gx + 1.2, info.d / 2 + 2.6);
        this.start = { x: sp.x, z: sp.z, h: rot };
        for (let k = 0; k < 4; k++) {
          const sh = L(info.dx + 1.5 + k * 1.1, info.d / 2 + 0.8);
          S.shrub(b, rng, sh.x, sh.z, 0.6, 0x3f6a2e);
        }
      } else {
        const bk = L(rng.range(-6, 6), -info.d / 2 - 12);
        S.liveOak(b, rng, bk.x, bk.z, 1.1);
      }
      // back fence between yards
      const f0 = L(-info.w / 2 - 2, -info.d / 2 - 10);
      const f1 = L(info.w / 2 + 2, -info.d / 2 - 10);
      for (let k = 0; k < 8; k++) {
        const t0 = k / 8, t1 = (k + 1) / 8;
        S.fenceRun(b, f0.x + (f1.x - f0.x) * t0, f0.z + (f1.z - f0.z) * t0, f0.x + (f1.x - f0.x) * t1, f0.z + (f1.z - f0.z) * t1, 1.8, 0x9a8468);
      }
    }
    // trees behind the circle
    for (let k = 0; k < 26; k++) {
      const t = rng.range(-Math.PI, Math.PI);
      if (Math.abs(t) < 0.45) continue;
      const r = rng.range(50, 75);
      const x = Math.sin(t) * r, z = Math.cos(t) * r;
      if (rng.chance(0.6)) S.liveOak(b, rng, x, z, rng.range(0.9, 1.3));
      else S.slashPine(b, rng, x, z);
    }
  }

  // --------------------------------------------------------------------------
  decorate(ctx) {
    const { b, rng, pts, i0, i1, path } = ctx;
    const regions = path.regions;
    for (let i = i0; i < i1; i++) {
      const p = pts[i];
      const fn = DECOR[p.type];
      if (fn) fn(ctx, i, p);
      // region entry signs
      const reg = regions.list[p.r];
      if (p.r > 0 && i > 0 && pts[i - 1].r !== p.r && reg.sign) this.regionSign(ctx, i, reg);
      // mile markers
      if (i > 0 && Math.floor(p.d / MILE) !== Math.floor(pts[i - 1].d / MILE)) this.mileMarker(ctx, i, Math.floor(p.d / MILE));
      if (p.cross) this.crossing(ctx, p.cross);
      // boardwalk railings
      if (p.surf === 'board' && p.y > 0.2 && i + 1 < pts.length) {
        const q = pts[i + 1];
        for (const side of [-1, 1]) {
          const lat = side * (p.w / 2 - 0.08);
          const ax = p.x - Math.cos(p.h) * lat, az = p.z + Math.sin(p.h) * lat;
          const bx = q.x - Math.cos(q.h) * lat, bz = q.z + Math.sin(q.h) * lat;
          const len = Math.hypot(bx - ax, bz - az);
          const rot = Math.atan2(bx - ax, bz - az);
          const ym = (p.y + q.y) / 2;
          if (i % 2 === 0) b.put('box', ax, p.y, az, 0.12, 1.05, 0.12, 0, rot, 0, 0x7a6248);
          b.put('box', (ax + bx) / 2, ym + 0.98, (az + bz) / 2, 0.12, 0.08, len + 0.02, 0, rot, 0, 0x8a7055);
          b.put('box', (ax + bx) / 2, ym + 0.5, (az + bz) / 2, 0.06, 0.08, len + 0.02, 0, rot, 0, 0x7a6248);
          b.put('box', (ax + bx) / 2, 0, (az + bz) / 2, 0.06, ym, len + 0.02, 0, rot, 0, 0x5e4a36);
          if (i % 4 === 0) b.put('cyl', ax, -0.4, az, 0.13, p.y, 0.13, 0, 0, 0, 0x5a4a3a);
        }
      }
    }
  }

  regionSign(ctx, i, reg) {
    const p = ctx.pts[i];
    let tex, w = 2.6, h = 1.3, elev = 1.3, wood = false;
    if (reg.sign === 'city') {
      tex = S.signTexture([{ text: reg.name, size: 64 }, { text: 'CITY LIMIT', size: 34 }], '#0f6b3a', '#f4f4ee');
    } else if (reg.sign === 'park' || reg.sign === 'trailhead') {
      tex = S.signTexture([{ text: reg.name, size: 56, font: 'Georgia, serif' }, { text: reg.sign === 'trailhead' ? 'Seminole County Trails' : reg.sub, size: 32, font: 'Georgia, serif', weight: 400 }], '#5a3a1e', '#efe2c0');
      wood = true;
      w = 3.0;
      h = 1.4;
      elev = 0.6;
    } else {
      tex = S.signTexture([{ text: reg.name, size: 60, font: 'Georgia, serif' }], '#e8dcc0', '#3a3a2a', 512, 160, false);
      w = 3.6;
      h = 1.1;
      elev = 0.25;
      // little stucco monument
      const q = ctx.at(i, p.w / 2 + 3);
      ctx.b.put('box', q.x, 0, q.z, 4.2, 1.6, 0.6, 0, p.h + Math.PI / 2, 0, 0xd8cdb4);
    }
    const lat = p.w / 2 + (reg.sign === 'neighborhood' ? 3 : 2.0);
    const q = ctx.at(i, lat);
    const sign = S.textSign(tex, w, h, elev, reg.sign === 'neighborhood' ? 0 : 2, wood);
    sign.position.set(q.x, 0, q.z);
    sign.rotation.y = p.h + Math.PI + (reg.sign === 'neighborhood' ? -Math.PI / 2 : -0.25);
    if (reg.sign === 'neighborhood') sign.position.y = 0.0;
    ctx.group.add(sign);
    if (reg.sign === 'trailhead') {
      S.bikeRack(ctx.b, q.x - Math.cos(p.h) * 2 + Math.sin(p.h) * 6, q.z + Math.sin(p.h) * 2 + Math.cos(p.h) * 6, p.h);
      const bq = ctx.at(i + 6, -(p.w / 2 + 1.5));
      S.bench(ctx.b, bq.x, bq.z, p.h - Math.PI / 2);
      const m = ctx.at(i + 3, 0);
      S.bollard(ctx.b, m.x, m.z);
    }
  }

  mileMarker(ctx, i, n) {
    const p = ctx.pts[i];
    const tex = S.signTexture([{ text: 'MILE', size: 40 }, { text: String(n), size: 96 }], '#f2f0e8', '#2a2a2a', 160, 256, true);
    const s = S.textSign(tex, 0.32, 0.5, 0.7, 1, false);
    const q = ctx.at(i, p.w / 2 + 0.7);
    s.position.set(q.x, 0, q.z);
    s.rotation.y = p.h + Math.PI;
    ctx.group.add(s);
  }

  crossing(ctx, cr) {
    const { b, add } = ctx;
    const mt = mats();
    const len = 260;
    const g = new THREE.PlaneGeometry(7.6, len, 1, 1).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * (len / 9));
    const road = add(new THREE.Mesh(g, mt.road2));
    road.position.set(cr.x, 0.065, cr.z);
    road.rotation.y = cr.h + Math.PI / 2;
    road.receiveShadow = true;
    // ladder crosswalk
    for (let k = -3; k <= 3; k++) {
      const x = cr.x + Math.sin(cr.h) * k * 1.05;
      const z = cr.z + Math.cos(cr.h) * k * 1.05;
      b.put('flat', x, 0.07, z, 3.3, 0.01, 0.45, 0, cr.h, 0, 0xf2f2ee);
    }
    const f = (k, lat) => ({ x: cr.x + Math.sin(cr.h) * k - Math.cos(cr.h) * lat, z: cr.z + Math.cos(cr.h) * k + Math.sin(cr.h) * lat });
    let q = f(-6, 2.6);
    S.stopSign(b, q.x, q.z, cr.h + Math.PI);
    q = f(6, -2.6);
    S.stopSign(b, q.x, q.z, cr.h);
    q = f(-6.5, 0);
    S.bollard(b, q.x, q.z);
    q = f(6.5, 0);
    S.bollard(b, q.x, q.z);
    const crng = new RNG(cr.seed);
    const name = crng.pick(ROAD_NAMES);
    cr.name = name;
    const tex = S.signTexture([{ text: name, size: 70 }], '#13603a', '#f4f4ee', 512, 110, true);
    const sign = S.textSign(tex, 1.9, 0.4, 2.3, 1, false);
    q = f(-6.6, 3.0);
    sign.position.set(q.x, 0, q.z);
    sign.rotation.y = cr.h + Math.PI;
    ctx.group.add(sign);
  }
}

// ---------------------------------------------------------------------------
// Per-region decorators. Called once per path point (every 2 m).
// ---------------------------------------------------------------------------

const yardTree = (b, rng, x, z) => {
  const r = rng.next();
  if (r < 0.45) S.liveOak(b, rng, x, z, rng.range(0.8, 1.2));
  else if (r < 0.62) S.queenPalm(b, rng, x, z);
  else if (r < 0.78) S.cabbagePalm(b, rng, x, z);
  else if (r < 0.9) S.crapeMyrtle(b, rng, x, z);
  else S.slashPine(b, rng, x, z, 0.9);
};

const wildTree = (b, rng, x, z, oak = 0.5) => {
  const r = rng.next();
  if (r < oak) S.liveOak(b, rng, x, z, rng.range(0.9, 1.4));
  else if (r < oak + 0.25) S.cabbagePalm(b, rng, x, z);
  else S.slashPine(b, rng, x, z);
};

// pond patches for suburban trail (retention ponds)
function pondPatch(ctx, i, side) {
  const { b, rng, path } = ctx;
  const a = i, bb = Math.min(i + 40, ctx.pts.length - 1);
  const m = strip(path, a, bb, (q, k) => {
    const t = (k - a) / (bb - a);
    const bulge = Math.sin(Math.PI * t);
    const inner = 9 + (1 - bulge) * 14;
    const outer = Math.max(inner + 0.5, 9 + bulge * 30);
    return side > 0 ? [inner, outer] : [-outer, -inner];
  }, () => 0.03, mats().pond, { vScale: 10, uScale: 10 });
  ctx.add(m);
  for (let k = 0; k < 6; k++) {
    const kk = a + rng.int(4, 36);
    ctx.place(kk, side * rng.range(5, 7.5), 0.4, (x, z) => S.reeds(b, rng, x, z));
  }
  if (rng.chance(0.5)) ctx.place(a + 20, side * 10, 1, (x, z, h) => S.crane(b, rng, x, z, h + rng.range(-2, 2)));
  if (rng.chance(0.5)) ctx.place(a + 12, side * 11, 1, (x, z, h) => S.egret(b, rng, x, z, h + rng.range(-2, 2)));
  if (rng.chance(0.15)) ctx.place(a + 25, side * 20, 1, (x, z, h) => S.gator(b, rng, x, z, h, 0.06));
  // houses beyond the pond
  for (let k = 0; k < 3; k++) {
    const kk = a + 6 + k * 14;
    const rot = path.pts[kk].h + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    ctx.place(kk, side * 52, 14, (x, z) => S.house(b, rng, x, z, rot, { pool: rng.chance(0.6) }));
  }
};

const DECOR = {
  street(ctx, i, p) {
    const { b, rng } = ctx;
    if (p.d < 46) return;
    for (const side of [1, -1]) {
      const slot = side > 0 ? 0 : 6;
      if (i % 12 === slot) {
        const rot = p.h + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
        ctx.place(i, side * 21, 12, (x, z) => {
          S.house(b, rng, x, z, rot, { pool: rng.chance(0.4), reach: 21 - 6.1, car: rng.chance(0.55) });
          ctx.place(i - side * 2, side * 4.2, 0.5, (mx, mz) => S.mailbox(b, rng, mx, mz, rot));
          if (rng.chance(0.3)) ctx.place(i - side * 3, side * 4.4, 0.5, (mx, mz) => S.bins(b, rng, mx, mz, rot));
        });
        // front yard tree
        if (rng.chance(0.7)) ctx.place(i + side * 4 + rng.int(-1, 1), side * rng.range(8, 11), 3, (x, z) => yardTree(b, rng, x, z));
        // back yard trees
        if (rng.chance(0.6)) ctx.place(i + rng.int(-5, 5), side * rng.range(36, 48), 20, (x, z) => wildTree(b, rng, x, z, 0.7));
      }
      if (i % 12 === slot + 6 && rng.chance(0.4)) ctx.place(i, side * rng.range(14, 30), 10, (x, z) => yardTree(b, rng, x, z));
      if (rng.chance(0.08)) ctx.place(i, side * rng.range(52, 70), 30, (x, z) => wildTree(b, rng, x, z, 0.6));
    }
    if (i % 30 === 0) ctx.place(i, 4.1, 0, (x, z, h) => S.streetLight(b, x, z, h - Math.PI / 2));
  },

  suburbTrail(ctx, i, p) {
    const { b, rng } = ctx;
    for (const side of [1, -1]) {
      const lot = Math.floor((i + (side > 0 ? 0 : 5)) / 12);
      const lr = new RNG(hash(ctx.c, lot, side, 17));
      const style = lr.next(); // fence style per lot
      const pond = hash(Math.floor(i / 40), side, ctx.seed) % 9 === 0;
      if (pond) {
        if (i % 40 === 0) pondPatch(ctx, i, side);
        continue;
      }
      // fence
      if (style < 0.75 && i + 1 < ctx.pts.length) {
        const q = ctx.pts[i + 1];
        const lat = side * 8.5;
        const ax = p.x - Math.cos(p.h) * lat, az = p.z + Math.sin(p.h) * lat;
        const bx = q.x - Math.cos(q.h) * lat, bz = q.z + Math.sin(q.h) * lat;
        if (ctx.ok(ax, az, 4, i)) {
          if (style < 0.55) S.fenceRun(b, ax, az, bx, bz, 1.8, lr.chance(0.5) ? 0x9a8468 : 0xa89478, i % 2 === 0);
          else S.fenceRun(b, ax, az, bx, bz, 1.6, 0xeeeee8, i % 2 === 0);
        }
      }
      if ((i + (side > 0 ? 0 : 5)) % 12 === 0) {
        const rot = p.h + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        ctx.place(i + 1, side * lr.range(22, 25), 14, (x, z) => S.house(b, rng, x, z, rot, { pool: lr.chance(0.55) }));
        if (lr.chance(0.6)) ctx.place(i + 3, side * lr.range(10, 13), 2, (x, z) => yardTree(b, rng, x, z));
      }
      // buffer trees between trail and fence
      if (rng.chance(0.07)) ctx.place(i, side * rng.range(4, 7), 2.2, (x, z) => wildTree(b, rng, x, z, 0.55));
      if (rng.chance(0.05)) ctx.place(i, side * rng.range(3.2, 7), 1.3, (x, z) => (rng.chance(0.5) ? S.palmetto(b, rng, x, z) : S.shrub(b, rng, x, z, 0.8)));
      if (rng.chance(0.06)) ctx.place(i, side * rng.range(40, 60), 25, (x, z) => wildTree(b, rng, x, z, 0.7));
    }
    if (rng.chance(0.004)) ctx.place(i, rng.sign() * rng.range(4, 6), 2, (x, z, h) => S.crane(b, rng, x, z, h + rng.range(-2, 2)));
    if (i % 140 === 70) ctx.place(i, -(p.w / 2 + 1.4), 0.5, (x, z, h) => S.bench(b, x, z, h + Math.PI / 2));
  },

  town(ctx, i, p) {
    const { b, rng, path } = ctx;
    const reg = path.regions.list[p.r];
    // median between trail and road
    if (i % 9 === 0) ctx.place(i, -4, 1, (x, z) => (rng.chance(0.6) ? S.queenPalm(b, rng, x, z) : S.cabbagePalm(b, rng, x, z)));
    if (i % 22 === 0) ctx.place(i, -5.2, 0, (x, z, h) => S.streetLight(b, x, z, h + Math.PI / 2));
    // right side: parking lot + plaza, or gas station, or grass lot
    const blk = Math.floor(i / 45);
    const br = new RNG(hash(blk, 71, ctx.seed));
    const kind = br.next();
    if (i % 45 === 0) {
      if (kind < 0.6) {
        ctx.place(i + 22, 46, 30, (x, z, h) => S.strip(b, rng, x, z, h + Math.PI / 2));
      } else if (kind < 0.8) {
        ctx.place(i + 22, 22, 12, (x, z, h) => S.canopy(b, x, z, h));
        ctx.place(i + 22, 40, 12, (x, z, h) => {
          b.put('box', x, 0, z, 10, 4, 8, 0, h, 0, 0xe8e2d0);
          b.rect(x, z, 5.4, 4.4, h);
        });
      }
    }
    if (kind < 0.8) {
      // parking lot asphalt + parked cars
      if (i % 4 === 0) {
        ctx.place(i, 20, 2, (x, z, h) => b.put('flat', x, 0.02, z, 26, 0.03, 8.1, 0, h, 0, 0x5a5a5c));
        for (const lat of [12, 26]) {
          ctx.place(i, lat, 2, (x, z, h) => {
            b.put('flat', x, 0.06, z, 5, 0.01, 0.12, 0, h, 0, 0xeeeeee);
            if (rng.chance(0.5)) {
              b.setFrame(x, 0, z, h + Math.PI / 2);
              S.car(b, rng, 0, 0, 0, rng.chance(0.3));
              b.clearFrame();
              b.rect(x, z, 2.5, 1.2, h);
            }
          });
        }
      }
    } else if (rng.chance(0.03)) ctx.place(i, rng.range(8, 30), 5, (x, z) => wildTree(b, rng, x, z, 0.7));
    // across the road
    if (i % 50 === 25) ctx.place(i, -42, 30, (x, z, h) => S.strip(b, rng, x, z, h - Math.PI / 2));
    if (rng.chance(0.03)) ctx.place(i, -rng.range(22, 26), 3, (x, z) => S.queenPalm(b, rng, x, z));
    if (i % 60 === 10) ctx.place(i, p.w / 2 + 1.3, 0.5, (x, z, h) => S.bench(b, x, z, h - Math.PI / 2));
    // Oviedo's famous downtown chickens
    if (reg.name === 'Oviedo' && rng.chance(0.06)) ctx.place(i, rng.sign() * rng.range(2.4, 5), 0.3, (x, z) => S.chicken(b, rng, x, z, rng.range(0, 6.28)));
  },

  hammock(ctx, i, p) {
    const { b, rng } = ctx;
    for (const side of [1, -1]) {
      if (rng.chance(0.11)) ctx.place(i, side * rng.range(3.6, 7), 2.4, (x, z) => S.liveOak(b, rng, x, z, rng.range(1.1, 1.5)));
      if (rng.chance(0.3)) ctx.place(i, side * rng.range(7, 45), 5, (x, z) => wildTree(b, rng, x, z, 0.6));
      if (rng.chance(0.3)) ctx.place(i, side * rng.range(2.8, 22), 1.2, (x, z) => S.palmetto(b, rng, x, z, rng.range(1.0, 1.6)));
      if (rng.chance(0.08)) ctx.place(i, side * rng.range(3, 14), 1.5, (x, z) => S.shrub(b, rng, x, z, rng.range(0.9, 1.5), 0x3a5a28));
      if (rng.chance(0.12)) ctx.place(i, side * rng.range(2.4, 12), 0.6, (x, z) => S.grassTuft(b, rng, x, z, 1, 0x4f6a30));
      if (rng.chance(0.03)) ctx.place(i, side * rng.range(45, 70), 30, (x, z) => S.liveOak(b, rng, x, z, 1.3));
    }
    if (i % 170 === 85) ctx.place(i, p.w / 2 + 1.4, 0.5, (x, z, h) => S.bench(b, x, z, h - Math.PI / 2));
  },

  flatwoods(ctx, i, p) {
    const { b, rng } = ctx;
    for (const side of [1, -1]) {
      if (rng.chance(0.18)) ctx.place(i, side * rng.range(5, 60), 4, (x, z) => S.slashPine(b, rng, x, z, rng.range(0.9, 1.25)));
      if (rng.chance(0.3)) ctx.place(i, side * rng.range(4.5, 30), 3.5, (x, z) => S.palmetto(b, rng, x, z, rng.range(1.2, 1.9)));
      if (rng.chance(0.2)) ctx.place(i, side * rng.range(2.5, 20), 0.5, (x, z) => S.grassTuft(b, rng, x, z, 1, 0x9a9a55));
      if (rng.chance(0.012)) ctx.place(i, side * rng.range(8, 40), 3, (x, z) => b.put('trunk', x, 0, z, 0.22, rng.range(6, 12), 0.22, 0, 0, 0, 0x9a948a)); // snag
      if (rng.chance(0.02)) ctx.place(i, side * rng.range(5, 25), 2, (x, z) => S.cabbagePalm(b, rng, x, z));
      if (rng.chance(0.01)) ctx.place(i, side * rng.range(4, 10), 1, (x, z) => b.put('blob0', x, -0.2, z, 0.9, 0.35, 0.9, 0, 0, 0, 0xd8c89a)); // tortoise burrow
    }
    if (rng.chance(0.002)) ctx.place(i, rng.sign() * rng.range(6, 12), 2, (x, z, h) => S.crane(b, rng, x, z, h + rng.range(-2, 2)));
  },

  wetland(ctx, i, p) {
    const { b, rng } = ctx;
    const wet = p.surf === 'board' && p.y > 0.35;
    for (const side of [1, -1]) {
      if (wet) {
        if (rng.chance(0.12)) {
          const q = ctx.at(i, side * rng.range(3.5, 35));
          if (ctx.ok(q.x, q.z, 1.8, i)) S.cypress(b, rng, q.x, q.z, rng.range(0.8, 1.2), 0);
        }
        if (rng.chance(0.06)) ctx.place(i, side * rng.range(3, 25), 1, (x, z) => S.lilyPads(b, rng, x, z, 0.045));
        if (rng.chance(0.06)) ctx.place(i, side * rng.range(2.5, 10), 0.5, (x, z) => S.reeds(b, rng, x, z));
        if (rng.chance(0.006)) ctx.place(i, side * rng.range(5, 18), 1, (x, z, h) => S.egret(b, rng, x, z, h + rng.range(0, 6), 0));
        if (rng.chance(0.002)) ctx.place(i, side * rng.range(6, 20), 2, (x, z, h) => S.gator(b, rng, x, z, h + rng.range(0, 6), 0.06));
        if (rng.chance(0.08)) ctx.place(i, side * rng.range(42, 60), 8, (x, z) => S.cypress(b, rng, x, z, 1.1));
      } else {
        if (rng.chance(0.25)) ctx.place(i, side * rng.range(2.4, 14), 0.4, (x, z) => S.grassTuft(b, rng, x, z, 1.4, 0x7d8c46));
        if (rng.chance(0.06)) ctx.place(i, side * rng.range(5, 30), 2, (x, z) => S.cabbagePalm(b, rng, x, z));
        if (rng.chance(0.07)) ctx.place(i, side * rng.range(10, 50), 3, (x, z) => S.cypress(b, rng, x, z));
        if (rng.chance(0.04)) ctx.place(i, side * rng.range(3, 12), 1, (x, z) => S.reeds(b, rng, x, z));
        if (rng.chance(0.03)) ctx.place(i, side * rng.range(5, 30), 4, (x, z) => S.liveOak(b, rng, x, z));
      }
    }
  },

  lake(ctx, i, p) {
    const { b, rng, path } = ctx;
    const reg = path.regions.list[p.r];
    const side = hash(reg.index, 99) % 2 ? 1 : -1;
    const shore = 13 + 4 * Math.sin(i * 0.05) + 2 * Math.sin(i * 0.17);
    const far = 150 + 60 * Math.sin(i * 0.011 + reg.index);
    {
      // water is built once per chunk (first lake point)
      if (!ctx.lakeDone) {
        ctx.lakeDone = true;
        const lakeRuns = runs(ctx.i0, ctx.i1, (k) => ctx.pts[k].type === 'lake');
        for (const [a, bb] of lakeRuns) {
          const fn = (q, k) => {
            const s0 = 13 + 4 * Math.sin(k * 0.05) + 2 * Math.sin(k * 0.17);
            const s1 = 150 + 60 * Math.sin(k * 0.011 + reg.index);
            // taper in/out at region ends
            const e = Math.min(1, (q.d - reg.start) / 120, (reg.end - q.d) / 120);
            const ss = s0 + (1 - Math.max(0, e)) * 140;
            return side > 0 ? [ss, Math.max(ss + 1, s1 * Math.max(0.05, e))] : [-Math.max(ss + 1, s1 * Math.max(0.05, e)), -ss];
          };
          ctx.add(strip(path, a, bb, fn, () => 0.03, mats().lake, { vScale: 20, uScale: 20 }));
        }
      }
    }
    const e = Math.min(1, (p.d - reg.start) / 120, (reg.end - p.d) / 120);
    const inWater = e > 0.3;
    // lake side shoreline
    if (inWater) {
      if (rng.chance(0.1)) ctx.place(i, side * (shore + rng.range(-1.5, 1)), 0.5, (x, z) => S.reeds(b, rng, x, z));
      if (rng.chance(0.02)) ctx.place(i, side * (shore + rng.range(2, 15)), 1, (x, z) => S.lilyPads(b, rng, x, z, 0.04));
      if (rng.chance(0.03)) ctx.place(i, side * rng.range(4, shore - 3), 2, (x, z) => (rng.chance(0.5) ? S.cabbagePalm(b, rng, x, z) : S.cypress(b, rng, x, z, 0.8)));
      if (rng.chance(0.004)) ctx.place(i, side * (shore + rng.range(1, 4)), 1, (x, z, h) => S.egret(b, rng, x, z, h + rng.range(0, 6)));
      if (rng.chance(0.0015)) ctx.place(i, side * (shore + rng.range(8, 30)), 2, (x, z, h) => S.gator(b, rng, x, z, h + rng.range(0, 6), 0.06));
      // far shore tree line
      if (rng.chance(0.3)) {
        const fl = far * Math.max(0.05, e);
        ctx.place(i, side * (fl + rng.range(3, 25)), 10, (x, z) => {
          const r = rng.range(4, 7);
          b.put('blob', x, r * 0.8, z, r, r * 0.9, r, 0, rng.range(0, 6), 0, S.vary(0x3f5a2c, rng));
        });
      }
      if (i % 120 === 60) {
        // fishing pier
        const q0 = ctx.at(i, side * (shore - 1));
        const rot = p.h + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        const L = 18;
        b.setFrame(q0.x, 0, q0.z, rot);
        b.put('box', 0, 0.55, L / 2, 2.2, 0.15, L, 0, 0, 0, 0x8a7055);
        for (let k = 0; k <= L; k += 3) {
          for (const sx of [-1.05, 1.05]) {
            b.put('cyl', sx, -0.3, k, 0.1, 2.0, 0.1, 0, 0, 0, 0x5e4a36);
            if (k < L) b.put('box', sx, 1.45, k + 1.5, 0.08, 0.08, 3, 0, 0, 0, 0x8a7055);
          }
        }
        b.put('box', 0, 0.55, L + 2, 6, 0.15, 4, 0, 0, 0, 0x8a7055);
        b.clearFrame();
        ctx.place(i + 3, side * 3.5, 0.5, (x, z, h) => S.bench(b, x, z, h + (side > 0 ? -Math.PI / 2 : Math.PI / 2)));
      }
    }
    // land side
    const ls = -side;
    if (rng.chance(0.1)) ctx.place(i, ls * rng.range(5, 45), 4, (x, z) => wildTree(b, rng, x, z, 0.6));
    if (rng.chance(0.08)) ctx.place(i, ls * rng.range(3, 15), 1, (x, z) => S.palmetto(b, rng, x, z));
    if (!inWater && rng.chance(0.08)) ctx.place(i, side * rng.range(5, 40), 4, (x, z) => wildTree(b, rng, x, z, 0.6));
  },

  grove(ctx, i, p) {
    const { b, rng } = ctx;
    if (i % 3 === 0) {
      for (const side of [1, -1]) {
        for (let r = 0; r < 7; r++) {
          const lat = side * (8 + r * 6.5);
          ctx.place(i + (r % 2), lat, 2.5, (x, z) => S.citrus(b, rng, x, z, rng.range(0.85, 1.05)));
        }
      }
    }
    if (rng.chance(0.03)) ctx.place(i, rng.sign() * rng.range(3, 5.5), 0.5, (x, z) => S.grassTuft(b, rng, x, z, 1, 0x8a9a4a));
    if (i % 200 === 100) {
      // roadside fruit stand
      ctx.place(i, p.w / 2 + 5, 3, (x, z, h) => {
        const rot = h + Math.PI / 2;
        b.setFrame(x, 0, z, rot);
        b.put('box', 0, 0, 0, 4, 2.6, 3, 0, 0, 0, 0xc9a26a);
        b.put('roof', 0, 2.6, 0, 4.8, 1.0, 3.8, 0, 0, 0, 0x9a3a2a);
        b.put('box', 0, 0, 2.0, 3.6, 0.9, 0.8, 0, 0, 0, 0x8a6a48);
        for (let k = 0; k < 8; k++) b.put('ball', -1.4 + k * 0.4, 1.0, 2.0, 0.17, 0.12, 0.17, 0, 0, 0, 0xf28a1a);
        b.clearFrame();
        b.rect(x, z, 2.2, 1.8, rot);
        const tex = S.signTexture([{ text: 'FRESH CITRUS', size: 60 }, { text: 'JUICE · HONEY · BOILED PEANUTS', size: 26 }], '#f4ead0', '#b5381f', 512, 200, true);
        const s = S.textSign(tex, 2.4, 0.95, 0.8, 2, true);
        s.position.set(x - Math.cos(h) * -3.5 + Math.sin(h) * -5, 0, z + Math.sin(h) * -3.5 + Math.cos(h) * -5);
        s.rotation.y = h + Math.PI - 0.3;
        ctx.group.add(s);
      });
    }
  },
};

