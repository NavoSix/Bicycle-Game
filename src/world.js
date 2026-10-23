import * as THREE from '../vendor/three.module.min.js';
import { RNG, hash } from './rng.js';
import { STEP, CROSS_HALF } from './path.js';
import { textures } from './textures.js';
import * as S from './scenery.js';
import { wallKinds } from './walls.js';

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
  lakeloop: 0x6a9440,
  corridor: 0x7d9c4a,
  railtrail: 0x6a8a40,
  foottrail: 0x8a8458,
};

const HIGHWAYS = ['SR 436 · Semoran Blvd', 'SR 417 · Central Florida GreeneWay', 'SR 434', 'US 17-92', 'SR 50 · Colonial Dr', 'SR 426 · Aloma Ave', 'SR 419', 'SR 46'];
const EXPRESSWAYS = ['SR 408 · East-West Expwy', 'SR 417', 'I-4', 'SR 429', 'SR 414 · Maitland Blvd'];

// --- lakes ---------------------------------------------------------------
const LAKE = {
  lake: { s0: 13, sa: 4, sb: 2, f0: 150, fa: 60 },
  lakeloop: { s0: 6.5, sa: 0.8, sb: 0.4, f0: 230, fa: 40 },
};
export const lakeSide = (reg) => (hash(reg.index, 99) % 2 ? 1 : -1);
function lakeGeom(type, i, d, reg) {
  const L = LAKE[type];
  const e = Math.max(0, Math.min(1, (d - reg.start) / 120, (reg.end - d) / 120));
  const shore = L.s0 + L.sa * Math.sin(i * 0.05) + L.sb * Math.sin(i * 0.17);
  const ss = shore + (1 - e) * 140;
  const far = Math.max(ss + 1, (L.f0 + L.fa * Math.sin(i * 0.011 + reg.index)) * Math.max(0.05, e));
  return { e, shore, ss, far };
}

// --- backdrop walls: [kind, lateral distance] nearest first ---------------
function wallSpec(p, i, reg, side) {
  switch (p.type) {
    case 'street': return [['suburb', 56], ['forest', 95]];
    case 'suburbTrail': return [['suburb', 58], ['forest', 95]];
    case 'town': return [['city', side > 0 ? 78 : 70], ['skyline', 300]];
    case 'hammock': return [['forest', 21], ['forestDark', 42]];
    case 'flatwoods': return [['pines', 30], ['pines', 58]];
    case 'wetland': return [['cypress', 38], ['forest', 72]];
    case 'grove': return [['grove', 58], ['forest', 95]];
    case 'corridor': return [[(hash(reg.index, 7) % 2 ? 1 : -1) === side ? 'forest' : 'suburb', 46], ['forest', 92]];
    case 'railtrail': return [['forest', 30], ['pines', 62]];
    case 'foottrail': return [['forestDark', 11], ['pines', 24]];
    case 'lake':
    case 'lakeloop': {
      const ls = lakeSide(reg);
      const lg = lakeGeom(p.type, i, p.d, reg);
      if (p.type === 'lake') return side === ls ? [['forest', lg.far + 12]] : [['forest', 34], ['forestDark', 60]];
      return side === ls ? [['suburb', lg.far + 8], ['skyline', lg.far + 260]] : [['suburb', 42], ['skyline', 320]];
    }
  }
  return [];
}

// --- shared strip materials -----------------------------------------------
let M = null;
function mats() {
  if (M) return M;
  const T = textures();
  const lam = (map, color = 0xffffff) => new THREE.MeshLambertMaterial({ map, color });
  M = {
    trail: lam(T.trail),
    trailw: lam(T.trailw),
    dirt: lam(T.dirt),
    bridge: lam(T.deck),
    deck: lam(T.deck),
    gravel: lam(T.gravel),
    road3: lam(T.road3),
    concreteTrail: lam(T.deck, 0xeeeae2),
    struct: new THREE.MeshLambertMaterial({ color: 0xb9b4a8 }),
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
  for (const k of ['lake', 'swamp', 'pond', 'sand', 'litter', 'concrete', 'gravel']) {
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

// A vertical ribbon following the path: walls, bridge sides.
function vstrip(path, idx, lat, yTop, yBot, mat, rep) {
  const pos = [];
  const uv = [];
  const ix = [];
  let n = 0;
  for (const i of idx) {
    const p = path.pts[i];
    const l = typeof lat === 'function' ? lat(p, i) : lat;
    const x = p.x - Math.cos(p.h) * l, z = p.z + Math.sin(p.h) * l;
    const u = p.d / rep;
    pos.push(x, yBot(p, i), z, x, yTop(p, i), z);
    uv.push(u, 0, u, 1);
    if (n) ix.push(n - 2, n, n - 1, n - 1, n, n + 1);
    n += 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ix);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
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
      else if ((o.isMesh || o.isLine) && o.userData.ownGeo) o.geometry.dispose();
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
          if (Math.abs(cr.i - i) > 200) continue;
          const dx = x - cr.x, dz = z - cr.z;
          const along = dx * Math.sin(cr.h) + dz * Math.cos(cr.h);
          if (Math.abs(along) < CROSS_HALF[cr.kind] + 0.5 + clr) return false;
        }
        return true;
      },
    };
    ctx.place = (i, lat, clr, fn) => {
      // nothing behind the backdrop wall; it would never be seen
      const p = pts[i];
      const ws = wallSpec(p, i, path.regions.list[p.r], Math.sign(lat))[0];
      if (ws && Math.abs(lat) > ws[1] - 1.5) return false;
      const q = ctx.at(i, lat);
      if (!ctx.ok(q.x, q.z, clr, i)) return false;
      fn(q.x, q.z, q.h, q.p);
      return true;
    };

    // ---- surfaces ----------------------------------------------------------
    const SURF = {
      trail: [mt.trail, 12], trailw: [mt.trailw, 12], road: [mt.road, 9], board: [mt.board, 1.6],
      concrete: [mt.concreteTrail, 4.5], dirt: [mt.dirt, 10], bridge: [mt.bridge, 3],
    };
    for (const kind in SURF) {
      for (const [ra, rb] of runs(i0, i1, (i) => pts[i].surf === kind || (i > i0 && pts[i - 1].surf === kind))) {
        add(strip(path, ra, rb, (p) => [-p.w / 2, p.w / 2], (p) => p.y, SURF[kind][0], { vScale: SURF[kind][1] }));
      }
    }
    // bridge: solid embankment under the ramps, a slim deck over the highway
    for (const [a, bb] of runs(i0, i1 - 1, (i) => pts[i].surf === 'bridge' || pts[i + 1].surf === 'bridge')) {
      const idx = [];
      for (let i = a; i <= bb + 1; i++) idx.push(i);
      const bot = (p, i) => {
        const cr = path.crossings.find((c) => c.kind === 'highway' && Math.abs(c.i - i) < 140);
        return cr && Math.abs(cr.i - i) * STEP < 16 ? p.y - 1.3 : 0;
      };
      for (const sd of [-1, 1]) add(vstrip(path, idx, (p) => sd * p.w / 2, (p) => p.y + 0.02, bot, mt.struct, 4));
    }
    // creeks under footbridges and trestles
    for (const [a, bb] of runs(i0, i1, (i) => pts[i].creek)) {
      add(strip(path, Math.max(0, a - 2), Math.min(bb + 2, pts.length - 1), (p, i) => {
        const f = Math.min(1, Math.max(0.15, (p.y - 0.06) / 0.3));
        return [-(1.5 + 9 * f + 2 * Math.sin(i)), 1.5 + 9 * f + 2 * Math.cos(i)];
      }, () => 0.03, mt.swamp));
    }
    // rail-trail gravel shoulders and ditches
    for (const [a, bb] of runs(i0, i1, (i) => pts[i].type === 'railtrail')) {
      for (const sd of [-1, 1]) {
        add(strip(path, a, bb, (p) => (sd > 0 ? [p.w / 2 - 0.05, p.w / 2 + 1.1] : [-p.w / 2 - 1.1, -p.w / 2 + 0.05]), () => 0.045, mt.gravel, { vScale: 4, uScale: 4 }));
      }
      for (const [c0, c1] of runs(a, bb, (i) => !path.crossings.some((c) => Math.abs(c.i - i) < 8))) {
        add(strip(path, c0, c1, () => [-10.5, -7], () => 0.03, mt.pond));
        add(strip(path, c0, c1, () => [7, 10.5], () => 0.03, mt.pond));
      }
    }
    // lake-loop road on the land side (Lake Underhill Rd)
    for (const [a, bb] of runs(i0, i1, (i) => pts[i].type === 'lakeloop')) {
      const ls = -lakeSide(path.regions.list[pts[a].r]);
      add(strip(path, a, bb, () => (ls > 0 ? [10, 17] : [-17, -10]), () => 0.04, mt.road2, { vScale: 9 }));
      add(strip(path, a, bb, () => (ls > 0 ? [17, 18.6] : [-18.6, -17]), () => 0.07, mt.concrete, { vScale: 1.6 }));
    }
    // lake water
    for (const type of ['lake', 'lakeloop']) {
      for (const [a, bb] of runs(i0, i1, (i) => pts[i].type === type)) {
        const reg = path.regions.list[pts[a].r];
        const side = lakeSide(reg);
        const fn = (q, k) => {
          const g = lakeGeom(type, k, q.d, reg);
          return side > 0 ? [g.ss, g.far] : [-g.far, -g.ss];
        };
        add(strip(path, a, bb, fn, () => 0.03, mt.lake, { vScale: 20, uScale: 20 }));
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

    this.buildWalls(ctx);

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
  // Backdrop walls: painted tree lines, rooftops and skylines that close the
  // world in. They part for road crossings and fold away where the trail
  // curves back toward them.
  buildWalls(ctx) {
    const { path, pts, i0, i1, add } = ctx;
    const W = wallKinds();
    for (const side of [-1, 1]) {
      for (let layer = 0; layer < 2; layer++) {
        let run = [];
        let runKind = null;
        let prevLat = 0;
        const flush = () => {
          if (run.length > 1) {
            const k = W[runKind];
            const lats = new Map(run.map(([i, l]) => [i, l]));
            const m = vstrip(path, run.map(([i]) => i), (p, i) => side * lats.get(i), () => k.H, (p) => (runKind === 'skyline' ? -2 : -0.4), k.mat, k.rep);
            m.userData.wall = true;
            add(m);
          }
          run = [];
          runKind = null;
        };
        // where a road cuts through, hide the wall's raw edge behind real trees
        const mask = (i, lat) => {
          const q = ctx.at(i, side * (lat - 2.5));
          S.liveOak(ctx.b, ctx.rng, q.x, q.z, ctx.rng.range(1.3, 1.6));
          const q2 = ctx.at(i, side * (lat - 6));
          if (ctx.rng.chance(0.6)) S.cabbagePalm(ctx.b, ctx.rng, q2.x, q2.z);
          else S.shrub(ctx.b, ctx.rng, q2.x, q2.z, 1.6, 0x3a5a28);
        };
        let gapPrev = false;
        let okPrev = false;
        for (let i = i0; i <= i1; i++) {
          const p = pts[i];
          const reg = path.regions.list[p.r];
          const spec = wallSpec(p, i, reg, side)[layer];
          let ok = !!spec && !(p.type === 'street' && p.d < 60);
          let gap = false;
          if (ok) {
            const [kind, lat] = spec;
            const x = p.x - Math.cos(p.h) * side * lat, z = p.z + Math.sin(p.h) * side * lat;
            for (const cr of path.crossings) {
              if (Math.abs(cr.i - i) > 220) continue;
              const along = (x - cr.x) * Math.sin(cr.h) + (z - cr.z) * Math.cos(cr.h);
              if (Math.abs(along) < CROSS_HALF[cr.kind] + 3) ok = gap = false;
              if (Math.abs(along) < CROSS_HALF[cr.kind] + 3) gap = true;
            }
            if (layer === 0 && kind !== 'skyline' && kind !== 'city') {
              if (gap && okPrev) mask(i - 1, prevLat);
              if (!gap && gapPrev) mask(i, lat);
            }
            if (ok && kind !== 'skyline' && lat < 200 && path.clearance(x, z, i - 160, i + 160) < lat - p.w / 2 - 4) ok = false;
            if (ok && runKind && (kind !== runKind || Math.abs(lat - prevLat) > 3)) {
              run.push([i, prevLat]);
              flush();
            }
            if (ok) {
              runKind = kind;
              prevLat = lat;
              run.push([i, lat]);
            }
          }
          if (!ok) flush();
          gapPrev = gap;
          okPrev = ok;
        }
        flush();
      }
    }
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
      if (p.surf === 'bridge' && i + 1 < pts.length) this.bridgeRail(ctx, i);
      this.trailLights(ctx, i, p);
      this.bridgeTrees(ctx, i, p);
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

  // Low bollard lights, alternating sides, along paved trail. On bridges and
  // boardwalks they sit on the deck at the rail.
  trailLights(ctx, i, p) {
    // only through towns and parks; the woods stay dark
    if (!LIT.includes(p.type) || p.w < 2.8 || i % 9 !== 0) return;
    const side = i % 18 === 0 ? 1 : -1;
    const raised = (p.surf === 'board' || p.surf === 'bridge') && p.y > 0.2;
    const lat = side * (p.w / 2 + (raised ? -0.25 : 0.45));
    const q = ctx.at(i, lat);
    const t = ctx.at(i, side * (p.w / 2 - 0.6));
    if (raised) S.trailLight(ctx.b, q.x, q.z, t.x, t.z, p.y);
    else if (ctx.ok(q.x, q.z, 0.2, i)) S.trailLight(ctx.b, q.x, q.z, t.x, t.z, p.y - 0.06);
  }

  // From the top of a pedestrian bridge you can see over the near scenery, so
  // pack real trees in front of the painted walls for a couple hundred metres
  // around it.
  bridgeTrees(ctx, i, p) {
    const near = ctx.path.crossings.find((c) => c.kind === 'highway' && Math.abs(c.i - i) < 110);
    if (!near) return;
    const { b, rng, path } = ctx;
    const reg = path.regions.list[p.r];
    const urban = p.type === 'town' || p.type === 'suburbTrail' || p.type === 'corridor';
    for (const side of [-1, 1]) {
      const ws = wallSpec(p, i, reg, side)[0];
      const far = ws ? ws[1] - 2 : 45;
      if (rng.chance(0.45)) {
        ctx.place(i, side * rng.range(p.w / 2 + 4, far), 2.5, (x, z) => {
          const r = rng.next();
          if (r < 0.5) S.liveOak(b, rng, x, z, rng.range(1.2, 1.7));
          else if (r < 0.7) S.slashPine(b, rng, x, z, rng.range(1.0, 1.3));
          else if (r < 0.85 || !urban) S.cabbagePalm(b, rng, x, z, rng.range(1.0, 1.3));
          else S.queenPalm(b, rng, x, z, 1.2);
        });
      }
      // a second, taller band hugging the wall itself
      if (rng.chance(0.3)) ctx.place(i, side * rng.range(far - 8, far), 3, (x, z) => S.liveOak(b, rng, x, z, rng.range(1.5, 1.9)));
      if (rng.chance(0.2)) ctx.place(i, side * rng.range(p.w / 2 + 3, far), 1.5, (x, z) => S.shrub(b, rng, x, z, rng.range(1.2, 1.8), 0x3a5a28));
    }
  }

  bridgeRail(ctx, i) {
    const { b, pts } = ctx;
    const p = pts[i], q = pts[i + 1];
    for (const side of [-1, 1]) {
      const lat = side * (p.w / 2 - 0.06);
      const ax = p.x - Math.cos(p.h) * lat, az = p.z + Math.sin(p.h) * lat;
      const bx = q.x - Math.cos(q.h) * lat, bz = q.z + Math.sin(q.h) * lat;
      const len = Math.hypot(bx - ax, bz - az);
      const rot = Math.atan2(bx - ax, bz - az);
      const ym = (p.y + q.y) / 2;
      const tilt = -Math.atan2(q.y - p.y, len);
      if (i % 2 === 0) b.put('box', ax, p.y, az, 0.08, 1.4, 0.08, 0, rot, 0, 0x8a9096);
      for (const hgt of [1.38, 0.9, 0.42]) b.put('box', (ax + bx) / 2, ym + hgt, (az + bz) / 2, 0.06, 0.06, len + 0.02, tilt, rot, 0, 0x9aa0a6);
    }
  }

  crossing(ctx, cr) {
    if (cr.kind === 'highway') return this.highway(ctx, cr);
    if (cr.kind === 'over') return this.overpass(ctx, cr);
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
    if (ctx.pts[cr.i].type === 'railtrail') {
      // the old railroad crossbuck, kept for nostalgia
      q = f(-7.5, -2.6);
      b.put('box', q.x, 0, q.z, 0.1, 3.2, 0.1, 0, cr.h, 0, 0xeeeeea);
      for (const a of [0.7, -0.7]) b.put('box', q.x, 2.4, q.z, 1.5, 0.22, 0.04, 0, cr.h, a, 0xf4f4f0);
    }
  }

  roadPlane(ctx, cr, width, offset, mat, flip, len = 300, y = 0.065) {
    const g = new THREE.PlaneGeometry(width, len, 1, 1).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * (len / 9));
    const m = ctx.add(new THREE.Mesh(g, mat));
    m.position.set(cr.x + Math.sin(cr.h) * offset, y, cr.z + Math.cos(cr.h) * offset);
    m.rotation.y = cr.h + Math.PI / 2 + (flip ? Math.PI : 0);
    m.receiveShadow = true;
    return m;
  }

  roadSign(ctx, text, x, z, rot, elev = 2.4, posts = 1) {
    const tex = S.signTexture([{ text, size: 64 }], '#13603a', '#f4f4ee', 640, 120, true);
    const s = S.textSign(tex, 3.2, 0.6, elev, posts, false);
    s.position.set(x, 0, z);
    s.rotation.y = rot;
    ctx.group.add(s);
  }

  // Six lanes of highway running under the pedestrian bridge.
  highway(ctx, cr) {
    const { b } = ctx;
    const mt = mats();
    this.roadPlane(ctx, cr, 11, 7, mt.road3, false);
    this.roadPlane(ctx, cr, 11, -7, mt.road3, true);
    this.roadPlane(ctx, cr, 3, 0, mt.concrete, false, 300, 0.07);
    const rot = cr.h + Math.PI / 2;
    b.put('box', cr.x, 0, cr.z, 0.5, 0.9, 300, 0, rot, 0, 0xc8c4ba);
    // piers under the deck in the median, and a steel arch over the span
    const at = (k, lat) => ({ x: cr.x + Math.sin(cr.h) * k - Math.cos(cr.h) * lat, z: cr.z + Math.cos(cr.h) * k + Math.sin(cr.h) * lat });
    const p = ctx.pts[cr.i];
    for (const lat of [-1.3, 1.3]) {
      const q = at(0, lat);
      b.put('cyl', q.x, 0, q.z, 0.45, p.y - 1.2, 0.45, 0, 0, 0, 0xb9b4a8);
    }
    const span = 17;
    const archH = 7.5;
    for (const side of [-1, 1]) {
      const lat = side * (p.w / 2 + 0.25);
      let prev = null;
      for (let k = -span; k <= span; k += 1.7) {
        const t = k / span;
        const y = p.y + archH * (1 - t * t);
        const q = at(k, lat);
        if (prev) S.beam(b, prev.x, prev.y, prev.z, q.x, y, q.z, 0.32, 0xf2f2ee);
        if (Math.abs(k) < span - 1) S.beam(b, q.x, p.y + 0.1, q.z, q.x, y, q.z, 0.05, 0xdedede);
        prev = { x: q.x, y, z: q.z };
      }
    }
    for (let k = -span + 4; k <= span - 4; k += 6) {
      const a = at(k, -(p.w / 2 + 0.25)), c = at(k, p.w / 2 + 0.25);
      const t = k / span;
      const y = p.y + archH * (1 - t * t);
      S.beam(b, a.x, y, a.z, c.x, y, c.z, 0.12, 0xf2f2ee);
    }
    // chain-link screening over the traffic
    for (const side of [-1, 1]) {
      const q0 = at(-16, side * (p.w / 2 - 0.05)), q1 = at(16, side * (p.w / 2 - 0.05));
      S.beam(b, q0.x, p.y + 2.4, q0.z, q1.x, p.y + 2.4, q1.z, 0.06, 0x8a9096);
    }
    const name = new RNG(cr.seed).pick(HIGHWAYS);
    cr.name = name;
    const sq = ctx.at(Math.max(0, cr.i - 64), p.w / 2 + 2.5);
    this.roadSign(ctx, name + ' Bridge', sq.x, sq.z, p.h + Math.PI - 0.3, 1.6, 2);
  }

  // An expressway overpass carried high over the trail.
  overpass(ctx, cr) {
    const { b, add } = ctx;
    const mt = mats();
    const len = 420;
    const deckY = 6.8;
    const deck = add(new THREE.Mesh(new THREE.BoxGeometry(22, 1.3, len), mt.struct));
    deck.position.set(cr.x, deckY, cr.z);
    deck.rotation.y = cr.h + Math.PI / 2;
    deck.castShadow = true;
    deck.receiveShadow = true;
    const rot = cr.h + Math.PI / 2;
    const at = (u, k) => ({ x: cr.x - Math.cos(cr.h) * u + Math.sin(cr.h) * k, z: cr.z + Math.sin(cr.h) * u + Math.cos(cr.h) * k });
    for (const k of [-10.8, 10.8]) {
      const q = at(0, k);
      b.put('box', q.x, deckY + 0.65, q.z, 0.4, 1.0, len, 0, rot, 0, 0xc8c4ba);
    }
    const piers = [];
    for (let u = 7; u < len / 2; u += u < 10 ? 28 : 35) piers.push(u, -u);
    for (const u of piers) {
      for (const k of [-7, 0, 7]) {
        const q = at(u, k);
        b.put('cyl', q.x, -0.5, q.z, 0.7, deckY - 0.15, 0.7, 0, 0, 0, 0xb3aea2);
        if (Math.abs(u) < 60) b.circle(q.x, q.z, 0.8);
      }
      const q = at(u, 0);
      b.put('box', q.x, deckY - 1.5, q.z, 1.6, 1.0, 19, 0, cr.h, 0, 0xb9b4a8);
    }
    const name = new RNG(cr.seed).pick(EXPRESSWAYS);
    cr.name = name;
    // a green guide sign on the fascia, facing the trail
    const tex = S.signTexture([{ text: name, size: 64 }], '#13603a', '#f4f4ee', 640, 120, true);
    const sg = S.textSign(tex, 4.2, 0.8, 0, 0, false);
    const sq = at(0, -11.1);
    sg.position.set(sq.x, deckY - 0.4, sq.z);
    sg.rotation.y = cr.h + Math.PI;
    ctx.group.add(sg);
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

// region types that get trail lights: towns, city lake parks, greenways and
// the backyard stretches through neighborhoods
const LIT = ['town', 'lakeloop', 'corridor', 'suburbTrail'];

const WIRE = new THREE.LineBasicMaterial({ color: 0x2a2a2a, fog: true });

const DECOR = {
  // Lake Underhill: concrete path on the seawall, the expressway on piers over
  // the water, fountains, lamp posts and the downtown skyline across the lake.
  lakeloop(ctx, i, p) {
    const { b, rng, path } = ctx;
    const reg = path.regions.list[p.r];
    const side = lakeSide(reg);
    const land = -side;
    const lg = lakeGeom('lakeloop', i, p.d, reg);
    const wet = lg.e > 0.3;
    if (wet && i + 1 < ctx.pts.length) {
      // low seawall cap along the water's edge
      const q = ctx.pts[i + 1];
      const lat = side * (lg.shore - 0.2);
      const ax = p.x - Math.cos(p.h) * lat, az = p.z + Math.sin(p.h) * lat;
      const bx = q.x - Math.cos(q.h) * lat, bz = q.z + Math.sin(q.h) * lat;
      if (ctx.ok(ax, az, 1, i)) b.put('box', (ax + bx) / 2, 0, (az + bz) / 2, 0.45, 0.35, Math.hypot(bx - ax, bz - az) + 0.05, 0, Math.atan2(bx - ax, bz - az), 0, 0xd2ccbe);
      if (rng.chance(0.05)) ctx.place(i, side * (lg.shore + rng.range(0.3, 2)), 0.3, (x, z) => S.reeds(b, rng, x, z));
      if (i % 110 === 40) ctx.place(i, side * (lg.shore + rng.range(40, 90)), 3, (x, z) => S.fountain(b, rng, x, z));
      if (rng.chance(0.006)) ctx.place(i, side * (lg.shore + rng.range(0.5, 2)), 0.5, (x, z, h) => S.egret(b, rng, x, z, h + rng.range(0, 6)));
      if (i % 36 === 18) ctx.place(i, side * (p.w / 2 + 1.3), 0.4, (x, z, h) => S.bench(b, x, z, h + (side > 0 ? -Math.PI / 2 : Math.PI / 2)));
    }
    if (i % 14 === 0) ctx.place(i, land * (p.w / 2 + 0.9), 0.2, (x, z) => S.lampPost(b, x, z));
    if (i % 9 === 4) ctx.place(i, land * rng.range(3.5, 6), 1, (x, z) => (rng.chance(0.6) ? S.queenPalm(b, rng, x, z) : S.cabbagePalm(b, rng, x, z)));
    if (rng.chance(0.03)) ctx.place(i, land * rng.range(6, 9), 3, (x, z) => S.liveOak(b, rng, x, z, rng.range(1.0, 1.3)));
    if (i % 200 === 120) {
      // fitness station
      ctx.place(i, land * (p.w / 2 + 2.5), 1.5, (x, z, h) => {
        b.setFrame(x, 0, z, h);
        for (const k of [-1, 0, 1]) b.put('cyl', 0, 0, k * 1.2, 0.06, 2.2 - Math.abs(k) * 0.4, 0.06, 0, 0, 0, 0x2a5a8a);
        b.put('cyl', 0, 2.05, -1.2, 0.03, 1.2, 0.03, Math.PI / 2, 0, 0, 0xb0b0b0);
        b.put('cyl', 0, 1.65, 0, 0.03, 1.2, 0.03, Math.PI / 2, 0, 0, 0xb0b0b0);
        b.clearFrame();
      });
    }
    // houses facing Lake Underhill Rd
    if (i % 13 === 0) {
      const rot = p.h + (land > 0 ? Math.PI / 2 : -Math.PI / 2);
      ctx.place(i, land * 30, 13, (x, z) => S.house(b, rng, x, z, rot, { reach: 30 - 18.6, car: rng.chance(0.4) }));
      if (rng.chance(0.6)) ctx.place(i + 6, land * rng.range(20, 23), 2, (x, z) => yardTree(b, rng, x, z));
    }
  },

  // Cady Way: a greenway down a power-line easement behind the neighborhoods.
  corridor(ctx, i, p) {
    const { b, rng, path, pts } = ctx;
    const reg = path.regions.list[p.r];
    const ts = hash(reg.index, 7) % 2 ? 1 : -1;
    if (i % 80 === 0) {
      const q = ctx.at(i, ts * 18);
      if (ctx.ok(q.x, q.z, 4, i)) {
        const arms = S.powerTower(b, q.x, q.z, p.h + Math.PI / 2);
        const j = i + 80;
        path.ensure(j + 1);
        if (pts[j].type === 'corridor') {
          const r = ctx.at(j, ts * 18);
          const c = Math.cos(pts[j].h + Math.PI / 2), sn = Math.sin(pts[j].h + Math.PI / 2);
          const pos = [];
          // each conductor sags between the towers
          for (const a of arms) {
            const lx = (a[0] - q.x) * c - (a[2] - q.z) * sn;
            const bx2 = r.x + c * lx, bz2 = r.z - sn * lx;
            for (let k = 0; k < 12; k++) {
              const t0 = k / 12, t1 = (k + 1) / 12;
              const sag = (t) => 3.2 * 4 * t * (1 - t);
              pos.push(a[0] + (bx2 - a[0]) * t0, a[1] - sag(t0), a[2] + (bz2 - a[2]) * t0);
              pos.push(a[0] + (bx2 - a[0]) * t1, a[1] - sag(t1), a[2] + (bz2 - a[2]) * t1);
            }
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          ctx.add(new THREE.LineSegments(g, WIRE));
        }
      }
    }
    // mowed easement with clumps of oak and wax myrtle, backyard fences beyond
    if (rng.chance(0.04)) ctx.place(i, -ts * rng.range(6, 16), 3, (x, z) => wildTree(b, rng, x, z, 0.7));
    if (rng.chance(0.02)) ctx.place(i, ts * rng.range(25, 40), 3, (x, z) => wildTree(b, rng, x, z, 0.7));
    if (rng.chance(0.03)) ctx.place(i, rng.sign() * rng.range(4, 12), 1, (x, z) => S.shrub(b, rng, x, z, rng.range(0.8, 1.3), 0x4a6a34));
    if (rng.chance(0.015)) ctx.place(i, rng.sign() * rng.range(4, 9), 1, (x, z) => S.crapeMyrtle(b, rng, x, z));
    if (i + 1 < pts.length && (hash(Math.floor(i / 30), reg.index) % 3) !== 0) {
      const q = pts[i + 1];
      const lat = -ts * 24;
      const ax = p.x - Math.cos(p.h) * lat, az = p.z + Math.sin(p.h) * lat;
      const bx = q.x - Math.cos(q.h) * lat, bz = q.z + Math.sin(q.h) * lat;
      if (ctx.ok(ax, az, 5, i)) S.fenceRun(b, ax, az, bx, bz, 1.2, 0x9aa0a4, i % 2 === 0);
    }
    if (i % 25 === 5) {
      const rot = p.h + (-ts > 0 ? -Math.PI / 2 : Math.PI / 2);
      ctx.place(i, -ts * 34, 14, (x, z) => S.house(b, rng, x, z, rot, { pool: rng.chance(0.5) }));
    }
    if (i % 120 === 60) ctx.place(i, -ts * (p.w / 2 + 1.4), 0.5, (x, z, h) => S.bench(b, x, z, h + (-ts > 0 ? -Math.PI / 2 : Math.PI / 2)));
    if (rng.chance(0.003)) ctx.place(i, rng.sign() * rng.range(5, 12), 2, (x, z, h) => S.crane(b, rng, x, z, h + rng.range(-2, 2)));
  },

  // Old rail bed: dead straight, ditches either side, the odd telegraph pole.
  railtrail(ctx, i, p) {
    const { b, rng, path } = ctx;
    const reg = path.regions.list[p.r];
    const ps = hash(reg.index, 3) % 2 ? 1 : -1;
    if (i % 24 === 0 && hash(i, 5) % 7 !== 0) ctx.place(i, ps * 5.2, 0.3, (x, z, h) => S.telegraphPole(b, rng, x, z, h + Math.PI / 2));
    for (const side of [1, -1]) {
      if (rng.chance(0.08)) ctx.place(i, side * rng.range(6.8, 10.7), 0.3, (x, z) => S.reeds(b, rng, x, z));
      if (rng.chance(0.16)) ctx.place(i, side * rng.range(12, 29), 4, (x, z) => wildTree(b, rng, x, z, 0.55));
      if (rng.chance(0.08)) ctx.place(i, side * rng.range(3.2, 6), 1, (x, z) => S.grassTuft(b, rng, x, z, 1.3, 0x7d8c46));
      if (rng.chance(0.06)) ctx.place(i, side * rng.range(11, 20), 1.5, (x, z) => S.palmetto(b, rng, x, z, 1.2));
    }
    if (rng.chance(0.003)) ctx.place(i, rng.sign() * rng.range(7.5, 10), 0.5, (x, z, h) => S.egret(b, rng, x, z, h + rng.range(0, 6)));
    if (i % 150 === 75) ctx.place(i, -ps * (p.w / 2 + 1.5), 0.5, (x, z, h) => S.bench(b, x, z, h + (-ps > 0 ? -Math.PI / 2 : Math.PI / 2)));
  },

  // Florida National Scenic Trail: narrow sand tread, palmetto right at your
  // pedals, orange blazes on the pines.
  foottrail(ctx, i, p) {
    const { b, rng } = ctx;
    for (const side of [1, -1]) {
      if (rng.chance(0.5)) ctx.place(i, side * rng.range(1.1, 4.5), 0.3, (x, z) => S.palmetto(b, rng, x, z, rng.range(1.0, 1.7)));
      if (rng.chance(0.11)) ctx.place(i, side * rng.range(2.6, 10), 1.8, (x, z) => S.slashPine(b, rng, x, z, rng.range(0.8, 1.15)));
      if (rng.chance(0.06)) ctx.place(i, side * rng.range(3, 10), 2.2, (x, z) => S.liveOak(b, rng, x, z, rng.range(0.8, 1.2)));
      if (rng.chance(0.03)) ctx.place(i, side * rng.range(2, 9), 1, (x, z) => S.cabbagePalm(b, rng, x, z, 0.9));
      if (rng.chance(0.15)) ctx.place(i, side * rng.range(0.9, 3), 0.1, (x, z) => S.grassTuft(b, rng, x, z, 0.9, 0x8a9a55));
      if (rng.chance(0.006)) ctx.place(i, side * rng.range(2, 6), 1.5, (x, z, h) => S.fallenLog(b, rng, x, z, h + rng.range(-0.5, 0.5)));
    }
    if (i % 17 === 0 && !p.creek) {
      // an orange blaze, two inches by six, on a pine beside the tread
      const side = i % 34 === 0 ? 1 : -1;
      ctx.place(i, side * (p.w / 2 + 1.0), 0.7, (x, z, h) => {
        b.put('trunk', x, 0, z, 0.24, 14, 0.24, 0, 0, 0, 0x6e4b36);
        const cr = 1.6;
        for (let k = 0; k < 3; k++) b.put('blob', x + rng.range(-1, 1), rng.range(12, 14), z + rng.range(-1, 1), cr, cr * 0.6, cr, 0, rng.range(0, 6), 0, 0x3f5a2b);
        const bx = x + Math.cos(h) * side * 0.24, bz = z - Math.sin(h) * side * 0.24;
        b.put('box', bx, 1.55, bz, 0.07, 0.17, 0.07, 0, h, 0, 0xf27a12);
        b.circle(x, z, 0.25);
      });
    }
  },
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
      if (rng.chance(0.24)) ctx.place(i, side * rng.range(7, 19.5), 5, (x, z) => wildTree(b, rng, x, z, 0.6));
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
      if (rng.chance(0.14)) ctx.place(i, side * rng.range(5, 28.5), 4, (x, z) => S.slashPine(b, rng, x, z, rng.range(0.9, 1.25)));
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
    const side = lakeSide(reg);
    const lg = lakeGeom('lake', i, p.d, reg);
    const shore = lg.shore;
    const e = lg.e;
    const inWater = e > 0.3;
    // lake side shoreline
    if (inWater) {
      if (rng.chance(0.1)) ctx.place(i, side * (shore + rng.range(-1.5, 1)), 0.5, (x, z) => S.reeds(b, rng, x, z));
      if (rng.chance(0.02)) ctx.place(i, side * (shore + rng.range(2, 15)), 1, (x, z) => S.lilyPads(b, rng, x, z, 0.04));
      if (rng.chance(0.03)) ctx.place(i, side * rng.range(4, shore - 3), 2, (x, z) => (rng.chance(0.5) ? S.cabbagePalm(b, rng, x, z) : S.cypress(b, rng, x, z, 0.8)));
      if (rng.chance(0.004)) ctx.place(i, side * (shore + rng.range(1, 4)), 1, (x, z, h) => S.egret(b, rng, x, z, h + rng.range(0, 6)));
      if (rng.chance(0.0015)) ctx.place(i, side * (shore + rng.range(8, 30)), 2, (x, z, h) => S.gator(b, rng, x, z, h + rng.range(0, 6), 0.06));
      // far shore tree line in front of the backdrop
      if (rng.chance(0.3)) {
        ctx.place(i, side * (lg.far + rng.range(2, 9)), 10, (x, z) => {
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

