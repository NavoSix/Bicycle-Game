import * as THREE from '../vendor/three.module.min.js';
import { RNG } from './rng.js';
import * as S from './scenery.js';
import { wallKinds } from './walls.js';

// ---------------------------------------------------------------------------
// Places of interest: hand-built scenes a short spur off the trail, far more
// detailed than the trail itself, with things to walk out onto and read.
// Each scene is laid out in a local frame: origin at its centre, +z pointing
// back toward the trail (the entrance), x along the trail.
// ---------------------------------------------------------------------------

const PLAQUES = {
  spring: [
    ['A thousand springs', 'Florida has more than a thousand freshwater springs, likely the largest concentration on Earth. Rain soaks into the Floridan Aquifer and comes back up here through the limestone at about 72°F, every day of the year.'],
    ['The boil', 'The deep blue at the centre is the vent, where aquifer water pushes up out of a cavern in the limestone. Watch the surface above it: the upwelling never stops. Some of this water fell as rain decades ago.'],
    ['Cold-weather visitors', 'Because spring water stays warm while rivers chill in winter, manatees crowd into spring runs on cold mornings. On a summer afternoon it is the swimmers who come for the cool water.'],
  ],
  overlook: [
    ['Wading birds', 'Great egrets, white ibis, little blue herons and roseate spoonbills feed in these shallows. Spoonbills get their pink from the small crustaceans they eat. Try the binoculars at the top of the tower.'],
    ['Alligators', 'Florida has about 1.3 million alligators, and a marsh like this is home. Enjoy them from a distance, and never feed one: it teaches them to approach people, and it is against state law.'],
    ['A river of grass', 'Sawgrass marshes like this one rise and fall with the rains. In the dry season the water pulls back into pools, and the wading birds follow the fish into them.'],
  ],
  bigtree: [
    ['Bald cypress', 'Bald cypress can live for well over a thousand years. Their buttressed trunks keep them upright in soft, flooded ground, and the "knees" that poke up around them are still something of a mystery.'],
    ['Spanish moss', 'Spanish moss is neither Spanish nor moss. It is a bromeliad, a cousin of the pineapple, and it takes everything it needs from rain and air. It does not harm the trees it hangs from.'],
  ],
  park: [
    ['Gopher tortoise', 'Look for a half-moon burrow in the sand. Gopher tortoises dig burrows up to forty feet long, and more than 350 other species have been found sheltering in them. Please give them room.'],
    ['Sabal palm', 'The cabbage palm, or sabal palm, is Florida’s state tree. Its fan-shaped fronds once thatched roofs, and its tough, fire-resistant trunk lets it survive the fires that sweep through pine flatwoods.'],
  ],
  fishcamp: [
    ['A river that runs north', 'The St. Johns River flows north for about 310 miles, one of the few large American rivers that does. It is so flat that its whole fall from the headwaters to the sea is less than thirty feet.'],
    ['Airboats', 'An airboat is pushed by a big aircraft-style propeller instead of one in the water, so it can skim across marsh only inches deep. Fish camps like this one have rented them out for generations.'],
  ],
  depot: [
    ['Celery City', 'Railroads opened central Florida to the rest of the country in the late 1800s. Growers shipped citrus and vegetables north by the trainload, and Sanford sent out so much celery it was called Celery City.'],
    ['Rails to trails', 'When rail lines were abandoned, many of their corridors became trails. That is why so many paths here run arrow-straight on a slightly raised bed, with old depots and crossings along the way.'],
  ],
};

const NAMES = {
  spring: ['Rock Springs', 'Wekiwa Springs', 'Sanlando Springs', 'Palm Springs', 'Starbuck Spring', 'Green Springs', 'Gemini Springs', 'Blue Spring', 'Miami Springs', 'Witherington Spring'],
  overlook: ['Lake Jesup Overlook', 'Marl Bed Flats', 'Black Hammock Overlook', 'Kolokee Overlook', 'Seminole Ranch Marsh', 'Lake Proctor Overlook', 'Econ River Overlook', 'Lake Harney Marsh'],
  bigtree: ['Big Tree Park', 'Old Cypress Grove', 'Spring Hammock Giants', 'Cypress Cathedral', 'Soldiers Creek Cypress'],
  park: ['Central Winds Park', 'Soldiers Creek Park', 'Black Hammock Trailhead', 'Torcaso Park', 'Sunrise Park', 'Red Bug Lake Park', 'Sanlando Park', 'Moss Park'],
  fishcamp: ['Black Hammock Landing', 'Lake Harney Landing', 'Mullet Lake Landing', 'Lake Monroe Landing', 'Lemon Bluff Landing', 'Hontoon Landing'],
  depot: ['Old Oviedo Depot', 'Lake Mary Depot', 'Sanford Depot', 'Longwood Depot', 'Chuluota Depot', 'Geneva Depot'],
};

const SUB = {
  spring: 'Scenic spring',
  overlook: 'Observation tower',
  bigtree: 'Ancient cypress',
  park: 'Trailside park',
  fishcamp: 'Fish camp',
  depot: 'Historic depot',
};

// R: radius of the built scene. Rv: radius of the space it claims (walls and
// trail scenery stay out). gap: half-angle of the opening toward the trail.
export const POI_KINDS = {
  spring: { R: 34, Rv: 38, ring: 'forestDark', gap: 0.85, regions: ['hammock', 'wetland', 'railtrail', 'foottrail', 'flatwoods'] },
  overlook: { R: 34, Rv: 95, ring: 'cypress', gap: 1.3, regions: ['wetland', 'lake', 'flatwoods', 'railtrail', 'foottrail'] },
  bigtree: { R: 32, Rv: 36, ring: 'forestDark', gap: 0.85, regions: ['hammock', 'wetland'] },
  park: { R: 38, Rv: 42, ring: 'forest', gap: 0.9, regions: ['suburbTrail', 'corridor', 'town', 'street'] },
  fishcamp: { R: 36, Rv: 105, ring: 'forest', gap: 1.3, regions: ['lake', 'wetland', 'railtrail'] },
  depot: { R: 30, Rv: 34, ring: 'forest', gap: 0.9, regions: ['railtrail', 'town', 'corridor'] },
};
for (const [k, v] of Object.entries(POI_KINDS)) {
  v.name = (poi, rng) => {
    poi.name = rng.pick(NAMES[k]);
    poi.sub = SUB[k];
    poi.Rv = v.Rv;
  };
}

export function poiFor(type, rng) {
  const ks = Object.keys(POI_KINDS).filter((k) => POI_KINDS[k].regions.includes(type));
  return ks.length ? rng.pick(ks) : null;
}

// Where a POI sits in the world (centre, rotation), without building it.
export function poiPlace(path, poi) {
  if (poi.place) return poi.place;
  path.ensure(poi.i + 1);
  const p = path.pts[poi.i];
  const D = p.w / 2 + 10 + poi.R;
  const lat = poi.side * D;
  const cx = p.x - Math.cos(p.h) * lat;
  const cz = p.z + Math.sin(p.h) * lat;
  // local +z points back toward the trail
  const rot = Math.atan2(poi.side * Math.cos(p.h), -poi.side * Math.sin(p.h));
  poi.place = { cx, cz, rot, D };
  return poi.place;
}

// ---------------------------------------------------------------------------
// Local frame helper
// ---------------------------------------------------------------------------
class Local {
  constructor(b, rng, cx, cz, rot) {
    this.b = b;
    this.rng = rng;
    this.cx = cx;
    this.cz = cz;
    this.rot = rot;
    this.c = Math.cos(rot);
    this.s = Math.sin(rot);
    this.M = new THREE.Matrix4().makeRotationY(rot).setPosition(cx, 0, cz);
  }
  w(lx, lz) {
    return [this.cx + this.c * lx + this.s * lz, this.cz - this.s * lx + this.c * lz];
  }
  // world -> local
  l(x, z) {
    const dx = x - this.cx, dz = z - this.cz;
    return [this.c * dx - this.s * dz, this.s * dx + this.c * dz];
  }
  put(key, lx, ly, lz, sx, sy, sz, rx, ry, rz, color) {
    this.b.frame = this.M;
    this.b.frameInfo = { x: this.cx, z: this.cz, ry: this.rot };
    this.b.put(key, lx, ly, lz, sx, sy, sz, rx, ry, rz, color);
    this.b.frame = null;
  }
  tree(fn, lx, lz, ...args) {
    const [x, z] = this.w(lx, lz);
    fn(this.b, this.rng, x, z, ...args);
  }
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

// A straight run of boardwalk (or stairs) from A to B in local space,
// rising from ya to yb. rails: 'both' | 'left' | 'right' | 'none'.
function deck(L, data, mats, ax, az, bx, bz, w, ya, yb, opts = {}) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  const ang = Math.atan2(dx, dz);
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const ym = (ya + yb) / 2;
  const tilt = -Math.atan2(yb - ya, len);
  const rails = opts.rails ?? 'both';
  const wood = opts.color ?? 0x8a7055;
  // surface: board texture, planks run across
  const g = new THREE.PlaneGeometry(w, Math.hypot(len, yb - ya)).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * (len / 1.6));
  const m = new THREE.Mesh(g, opts.stairs ? mats.stairs : mats.board);
  const [wx, wz] = L.w(mx, mz);
  m.position.set(wx, ym + 0.01, wz);
  m.rotation.order = 'YXZ';
  m.rotation.set(tilt, L.rot + ang, 0);
  m.receiveShadow = true;
  m.castShadow = true;
  m.userData.ownGeo = true;
  data.meshes.push(m);
  // joists under the deck
  L.put('box', mx, ym - 0.16, mz, w, 0.14, len, tilt, ang, 0, opts.under ?? 0x5e4a36);
  // posts down to the ground or water
  const n = Math.max(1, Math.round(len / 2.4));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const px = ax + dx * t, pz = az + dz * t, py = ya + (yb - ya) * t;
    for (const sd of [-1, 1]) {
      const ox = Math.cos(ang) * sd * (w / 2 - 0.1), oz = -Math.sin(ang) * sd * (w / 2 - 0.1);
      if (py > 0.2) L.put('cyl', px + ox, -0.6, pz + oz, 0.1, py + 0.45, 0.1, 0, 0, 0, 0x5a4a3a);
      if (rails === 'both' || (rails === 'left' && sd < 0) || (rails === 'right' && sd > 0)) {
        L.put('box', px + ox, py, pz + oz, 0.1, 1.05, 0.1, 0, ang, 0, wood);
      }
    }
  }
  for (const sd of [-1, 1]) {
    if (!(rails === 'both' || (rails === 'left' && sd < 0) || (rails === 'right' && sd > 0))) continue;
    const ox = Math.cos(ang) * sd * (w / 2 - 0.1), oz = -Math.sin(ang) * sd * (w / 2 - 0.1);
    L.put('box', mx + ox, ym + 1.0, mz + oz, 0.1, 0.08, len + 0.05, tilt, ang, 0, wood);
    L.put('box', mx + ox, ym + 0.5, mz + oz, 0.06, 0.08, len + 0.05, tilt, ang, 0, wood);
    // rail collider (only at this deck's height)
    const [cx, cz] = L.w(mx + ox, mz + oz);
    data.blocks.push({ t: 'r', x: cx, z: cz, hw: 0.08, hd: len / 2, c: Math.cos(L.rot + ang), s: Math.sin(L.rot + ang), y0: Math.min(ya, yb) - 0.3, y1: Math.max(ya, yb) + 1.1 });
  }
  // walkable surface
  const [cx, cz] = L.w(mx, mz);
  data.walk.push({ x: cx, z: cz, c: Math.cos(L.rot + ang), s: Math.sin(L.rot + ang), hw: w / 2, hd: len / 2, y0: ya, y1: yb });
}

// A flat platform with rails on chosen edges: n (z0), s (z1), w (x0), e (x1).
// open: { edge: [[from, to], ...] } leaves gaps in that edge's rail.
function platform(L, data, mats, x0, z0, x1, z1, y, edges = 'nsew', open = {}) {
  const w = x1 - x0, d = z1 - z0;
  const g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * (d / 1.6));
  const m = new THREE.Mesh(g, mats.board);
  const [wx, wz] = L.w((x0 + x1) / 2, (z0 + z1) / 2);
  m.position.set(wx, y + 0.01, wz);
  m.rotation.y = L.rot;
  m.receiveShadow = true;
  m.castShadow = true;
  m.userData.ownGeo = true;
  data.meshes.push(m);
  L.put('box', (x0 + x1) / 2, y - 0.2, (z0 + z1) / 2, w, 0.18, d, 0, 0, 0, 0x5e4a36);
  const [cx, cz] = L.w((x0 + x1) / 2, (z0 + z1) / 2);
  data.walk.push({ x: cx, z: cz, c: L.c, s: L.s, hw: w / 2, hd: d / 2, y0: y, y1: y });
  const rail = (ax, az, bx, bz, gaps = []) => {
    // skip any part covered by an opening [a, b] given in the edge's own coordinate
    const segs = [[ax, az, bx, bz]];
    for (const [oa, ob] of gaps) {
      for (let k = segs.length - 1; k >= 0; k--) {
        const [sx, sz, ex, ez] = segs[k];
        const horiz = sz === ez;
        const a0 = horiz ? Math.min(sx, ex) : Math.min(sz, ez);
        const a1 = horiz ? Math.max(sx, ex) : Math.max(sz, ez);
        const fixed = horiz ? sz : sx;
        if (ob <= a0 || oa >= a1) continue;
        segs.splice(k, 1);
        if (oa > a0) segs.push(horiz ? [a0, fixed, oa, fixed] : [fixed, a0, fixed, oa]);
        if (ob < a1) segs.push(horiz ? [ob, fixed, a1, fixed] : [fixed, ob, fixed, a1]);
      }
    }
    for (const [sx, sz, ex, ez] of segs) {
      const len = Math.hypot(ex - sx, ez - sz);
      if (len < 0.2) continue;
      const ang = Math.atan2(ex - sx, ez - sz);
      const mx = (sx + ex) / 2, mz = (sz + ez) / 2;
      L.put('box', mx, y + 1.0, mz, 0.1, 0.08, len, 0, ang, 0, 0x8a7055);
      L.put('box', mx, y + 0.5, mz, 0.06, 0.08, len, 0, ang, 0, 0x8a7055);
      for (let t = 0; t <= len + 0.01; t += 1.6) {
        const k = len > 0 ? t / len : 0;
        L.put('box', sx + (ex - sx) * k, y, sz + (ez - sz) * k, 0.1, 1.05, 0.1, 0, 0, 0, 0x8a7055);
      }
      const [cx2, cz2] = L.w(mx, mz);
      data.blocks.push({ t: 'r', x: cx2, z: cz2, hw: 0.08, hd: len / 2, c: Math.cos(L.rot + ang), s: Math.sin(L.rot + ang), y0: y - 0.3, y1: y + 1.1 });
    }
  };
  if (edges.includes('n')) rail(x0, z0, x1, z0, open.n);
  if (edges.includes('s')) rail(x0, z1, x1, z1, open.s);
  if (edges.includes('w')) rail(x0, z0, x0, z1, open.w);
  if (edges.includes('e')) rail(x1, z0, x1, z1, open.e);
}

// Two posts and a sign: walk through, but leave the bike here.
function noBikes(L, data, lx, lz, ang) {
  for (const sd of [-1, 1]) {
    const px = lx + Math.cos(ang) * sd * 0.75, pz = lz - Math.sin(ang) * sd * 0.75;
    L.put('cyl', px, 0, pz, 0.09, 0.85, 0.09, 0, 0, 0, 0x6a5440);
    const [x, z] = L.w(px, pz);
    data.blocks.push({ t: 'c', x, z, r: 0.11 });
  }
  L.put('box', lx + Math.cos(ang) * 0.75, 0.85, lz - Math.sin(ang) * 0.75, 0.42, 0.42, 0.04, 0, ang, Math.PI / 4, 0xf2f2ee);
  const [x, z] = L.w(lx, lz);
  data.blocks.push({ t: 'r', x, z, hw: 0.75, hd: 0.15, c: Math.cos(L.rot + ang), s: Math.sin(L.rot + ang), bike: true });
}

function plaqueTexture(title, text) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 340;
  const g = cv.getContext('2d');
  g.fillStyle = '#4a3220';
  g.fillRect(0, 0, 512, 340);
  g.fillStyle = '#efe4c8';
  g.fillRect(14, 14, 484, 312);
  g.fillStyle = '#3d4a2a';
  g.fillRect(14, 14, 484, 64);
  g.fillStyle = '#f4ecd6';
  g.font = 'bold 34px Georgia, serif';
  g.textBaseline = 'middle';
  g.fillText(title, 32, 47);
  g.fillStyle = '#2a2418';
  g.font = '19px Georgia, serif';
  g.textBaseline = 'top';
  const words = text.split(' ');
  let line = '';
  let y = 94;
  for (const wd of words) {
    const t = line ? line + ' ' + wd : wd;
    if (g.measureText(t).width > 440) {
      g.fillText(line, 32, y);
      y += 26;
      line = wd;
    } else line = t;
  }
  g.fillText(line, 32, y);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// An interpretive panel on a slanted lectern; you can walk up and read it.
function plaque(L, data, lx, lz, ang, title, text, y = 0) {
  const tex = plaqueTexture(title, text);
  const front = new THREE.MeshLambertMaterial({ map: tex });
  const back = new THREE.MeshLambertMaterial({ color: 0x4a3220 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.73, 0.05), [back, back, back, back, front, back]);
  const grp = new THREE.Group();
  board.position.set(0, 1.0, 0);
  board.rotation.x = -0.55;
  board.castShadow = true;
  grp.add(board);
  for (const sx of [-0.4, 0.4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.95, 0.09), back);
    post.position.set(sx, 0.47, -0.08);
    grp.add(post);
  }
  const [x, z] = L.w(lx, lz);
  grp.position.set(x, y, z);
  grp.rotation.y = L.rot + ang;
  grp.userData.dispose = () => {
    tex.dispose();
    front.dispose();
    back.dispose();
    board.geometry.dispose();
  };
  data.meshes.push(grp);
  // where you stand to read it: in front of the panel
  const fx = lx + Math.sin(ang) * 0.9, fz = lz + Math.cos(ang) * 0.9;
  const [sx, sz] = L.w(fx, fz);
  data.plaques.push({ x: sx, z: sz, y, title, text, px: x, pz: z });
  data.blocks.push({ t: 'r', x, z, hw: 0.6, hd: 0.15, c: Math.cos(L.rot + ang), s: Math.sin(L.rot + ang), y0: y - 0.3, y1: y + 1.4 });
}

function bikeRackAndBench(L, data, lx, lz) {
  const [x, z] = L.w(lx, lz);
  S.bikeRack(L.b, x, z, L.rot + Math.PI / 2);
  const [bx, bz] = L.w(-lx - 1.6, lz + 1);
  S.bench(L.b, bx, bz, L.rot + Math.PI / 2);
  data.rack = { x, z };
  L.put('cyl', lx + 3.2, 0, lz, 0.3, 0.95, 0.3, 0, 0, 0, 0x3a4a3a); // trash can
}

// Low-poly fern rosette.
function fern(L, lx, lz, s = 1, color = 0x4f7a34) {
  const n = 6 + Math.floor(L.rng.next() * 4);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + L.rng.range(-0.3, 0.3);
    const sc = L.rng.range(0.6, 1.0) * s;
    L.put('frond', lx, 0.05, lz, sc * 0.7, sc * 0.6, sc, L.rng.range(-0.1, 0.4), a, 0, S.vary(color, L.rng));
  }
}

function flowers(L, lx, lz, r, n, palette) {
  for (let k = 0; k < n; k++) {
    const a = L.rng.range(0, Math.PI * 2), d = Math.sqrt(L.rng.next()) * r;
    const x = lx + Math.sin(a) * d, z = lz + Math.cos(a) * d;
    const h = L.rng.range(0.25, 0.6);
    L.put('cyl', x, 0, z, 0.012, h, 0.012, 0, 0, 0, 0x4f7a34);
    const c = L.rng.pick(palette);
    L.put('ball', x, h, z, 0.06, 0.04, 0.06, 0, 0, 0, S.vary(c, L.rng, 0.02, 0.05, 0.05));
  }
}

// A circular backdrop around the scene, open toward the trail.
function ringWall(L, data, R, kind, gap) {
  const W = wallKinds()[kind];
  const pos = [], uv = [], ix = [];
  let n = 0, u = 0, prev = null;
  for (let a = gap; a <= Math.PI * 2 - gap + 1e-6; a += 0.06) {
    const lx = Math.sin(a) * R, lz = Math.cos(a) * R;
    const [x, z] = L.w(lx, lz);
    if (prev) u += Math.hypot(x - prev[0], z - prev[1]) / W.rep;
    prev = [x, z];
    pos.push(x, -0.5, z, x, W.H, z);
    uv.push(u, 0, u, 1);
    if (n) ix.push(n - 2, n, n - 1, n - 1, n, n + 1);
    n += 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ix);
  const m = new THREE.Mesh(g, W.mat);
  m.userData.ownGeo = true;
  data.meshes.push(m);
  // real trees where the backdrop ends, so its edges never show
  for (const a of [gap, -gap]) {
    L.tree(S.liveOak, Math.sin(a) * (R - 3), Math.cos(a) * (R - 3), 1.5);
    L.tree(S.cabbagePalm, Math.sin(a) * (R - 7), Math.cos(a) * (R - 7), 1.1);
  }
}

// Ring of big trees just inside the backdrop.
function treeRing(L, R, n, fnPick, gap = 0.85) {
  for (let k = 0; k < n; k++) {
    const a = gap + L.rng.next() * (Math.PI * 2 - 2 * gap);
    const d = R - L.rng.range(2, 9);
    L.tree(fnPick(), Math.sin(a) * d, Math.cos(a) * d, L.rng.range(1.0, 1.4));
  }
}

// Water body as a flat polygon (local), opaque like the lakes along the trail.
function waterPoly(L, data, mat, pts, y = 0.035) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape, 2).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(L.cx, y, L.cz);
  m.rotation.y = L.rot;
  m.receiveShadow = true;
  m.userData.ownGeo = true;
  data.meshes.push(m);
}

function inPoly(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Spring: a clear blue basin you can see into, the boil turning over at the
// vent, fish drifting over sand, oaks and palms leaning in.
// ---------------------------------------------------------------------------
function springBowl(shape, depth, rings = 10, segs = 64) {
  const pos = [], col = [], idx = [];
  const sand = new THREE.Color(0xd8c898), aqua = new THREE.Color(0x1fa8b0), deep = new THREE.Color(0x06306a), grass = new THREE.Color(0x3f7a3a);
  const c = new THREE.Color();
  for (let r = 0; r <= rings; r++) {
    const t = r / rings; // 0 at rim, 1 at centre
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const R = shape(a) * (1 - t);
      const y = -depth(t, a);
      pos.push(Math.sin(a) * R, y, Math.cos(a) * R);
      const d = -y;
      if (d < 0.5) c.copy(sand).lerp(aqua, d / 0.5);
      else c.copy(aqua).lerp(deep, Math.min(1, (d - 0.5) / 4.5));
      // patches of eelgrass on the shallow shelf
      if (t > 0.15 && t < 0.55 && Math.sin(a * 7 + r) > 0.6) c.lerp(grass, 0.45);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let k = 0; k < segs; k++) {
      const a = r * segs + k, b = r * segs + ((k + 1) % segs);
      const cc = (r + 1) * segs + k, d = (r + 1) * segs + ((k + 1) % segs);
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

let SPRING_MATS = null;
function springMats() {
  if (SPRING_MATS) return SPRING_MATS;
  // The basin is drawn right after the ground, without depth testing, so it
  // shows "through" the flat ground plane. Water goes over it, transparent.
  // Only drawn where the water's outline marked the stencil, so the basin can
  // never poke out past its rim.
  const clip = { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp };
  const bowl = new THREE.MeshLambertMaterial({ vertexColors: true, depthTest: false, depthWrite: false, ...clip });
  const mask = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const img = g.createImageData(128, 128);
  const rng = new RNG(77);
  const hgt = new Float32Array(128 * 128);
  for (let k = 0; k < 40; k++) {
    const fx = rng.int(1, 6), fy = rng.int(1, 6), ph = rng.range(0, 6.28), amp = rng.range(0.3, 1) / (fx + fy);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) hgt[y * 128 + x] += amp * Math.sin(((x * fx + y * fy) / 128) * Math.PI * 2 + ph);
  }
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const dx = hgt[y * 128 + ((x + 1) % 128)] - hgt[y * 128 + ((x + 127) % 128)];
      const dy = hgt[((y + 1) % 128) * 128 + x] - hgt[((y + 127) % 128) * 128 + x];
      const i = (y * 128 + x) * 4;
      img.data[i] = 128 + dx * 160;
      img.data[i + 1] = 128 + dy * 160;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const normal = new THREE.CanvasTexture(cv);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.repeat.set(3, 3);
  const water = new THREE.MeshPhongMaterial({ color: 0x4cc0c8, transparent: true, opacity: 0.22, shininess: 120, specular: 0xffffff, normalMap: normal, normalScale: new THREE.Vector2(0.35, 0.35), depthWrite: false });
  const fish = new THREE.MeshLambertMaterial({ color: 0x3a4a48, depthTest: false, depthWrite: false, ...clip });
  const ring = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
  SPRING_MATS = { bowl, water, fish, ring, normal, mask };
  return SPRING_MATS;
}

function buildSpring(L, data, mats, rng) {
  const M = springMats();
  const bcx = 0, bcz = 3;
  const wob = [rng.range(0, 6), rng.range(0, 6)];
  const shape = (a) => 11 + 1.5 * Math.sin(3 * a + wob[0]) + 0.9 * Math.sin(5 * a + wob[1]);
  // a sandy shelf, a broad bowl, and the vent dropping away at the middle
  const depth = (t) => (t < 0.3 ? t * 1.3 : 0.39 + (t - 0.3) * 4.6) + (t > 0.85 ? (t - 0.85) * 18 : 0);
  const bowl = new THREE.Mesh(springBowl(shape, depth), M.bowl);
  const [bx, bz] = L.w(bcx, bcz);
  bowl.position.set(bx, 0.0, bz);
  bowl.rotation.y = L.rot;
  bowl.renderOrder = -1;
  bowl.userData.ownGeo = true;
  data.meshes.push(bowl);
  // the spring run, a shallow channel winding away to the side
  const runShape = (a) => {
    const along = Math.cos(a);
    return 3.2 + 15 * Math.max(0, along) ** 3;
  };
  const run = new THREE.Mesh(springBowl(runShape, (t) => t * 1.3, 6, 48), M.bowl);
  const [rx, rz] = L.w(bcx - 9, bcz - 4);
  run.position.set(rx, 0.0, rz);
  run.rotation.y = L.rot - 2.0;
  run.renderOrder = -1;
  run.userData.ownGeo = true;
  data.meshes.push(run);
  // water surfaces
  const surf = [];
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    surf.push([bcx + Math.sin(a) * shape(a), bcz + Math.cos(a) * shape(a)]);
  }
  const runPts = [];
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    const r = runShape(a);
    const lx = Math.sin(a) * r, lz = Math.cos(a) * r;
    // rotate by -2.0 rad about the run centre
    const ca = Math.cos(-2.0), sa = Math.sin(-2.0);
    runPts.push([bcx - 9 + ca * lx + sa * lz, bcz - 4 - sa * lx + ca * lz]);
  }
  for (const poly of [surf, runPts]) {
    const shapeT = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const wg = new THREE.ShapeGeometry(shapeT, 3).rotateX(-Math.PI / 2);
    const wm = new THREE.Mesh(wg, M.water);
    wm.position.set(L.cx, 0.05, L.cz);
    wm.rotation.y = L.rot;
    wm.renderOrder = 2;
    wm.userData.ownGeo = true;
    data.meshes.push(wm);
    // same outline into the stencil, just before the basin draws
    const mk = new THREE.Mesh(wg, M.mask);
    mk.position.copy(wm.position);
    mk.rotation.y = L.rot;
    mk.renderOrder = -1.5;
    data.meshes.push(mk);
  }
  data.water.push((lx, lz) => inPoly(surf, lx, lz) || inPoly(runPts, lx, lz));
  // limestone ledge around the basin
  for (let k = 0; k < 34; k++) {
    const a = rng.range(0, Math.PI * 2);
    if (Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.35) continue; // leave the dock side open
    const r = shape(a) + rng.range(-0.2, 0.9);
    const s = rng.range(0.35, 0.9);
    L.put('blob0', bcx + Math.sin(a) * r, -0.05, bcz + Math.cos(a) * r, s * 1.4, s * 0.55, s, 0, rng.range(0, 6), 0, S.vary(0xc9c2ad, rng, 0.02, 0.05, 0.08));
  }
  // dock with steps into the water
  const dz0 = bcz + shape(0) - 3.4; // dock platform reaches out over the water
  deck(L, data, mats, 0, dz0 + 10, 0, dz0 + 6.6, 2.2, 0.08, 0.45, { rails: 'both' });
  deck(L, data, mats, 0, dz0 + 6.6, 0, dz0 + 3.2, 2.2, 0.45, 0.45, { rails: 'both' });
  platform(L, data, mats, -2.2, dz0, 2.2, dz0 + 3.2, 0.45, 'nsew', { n: [[-0.8, 0.8]], s: [[-1.1, 1.1]] });
  noBikes(L, data, 0, dz0 + 10.6, 0);
  for (let k = 0; k < 3; k++) L.put('box', 0, 0.3 - k * 0.25, dz0 - 0.3 - k * 0.35, 1.4, 0.08, 0.35, 0, 0, 0, 0x7a6248);
  // swim ladder rails
  for (const sx of [-0.75, 0.75]) L.put('cyl', sx, -1.0, dz0, 0.03, 2.4, 0.03, 0.3, 0, 0, 0xc0c4c8);
  // fallen log with turtles sunning on it
  L.put('cyl', 7.5, 0.15, bcz - 4, 0.3, 8, 0.3, 0, 0.6, Math.PI / 2 - 0.08, 0x5e4a36);
  for (const t of [8.5, 10.2]) {
    L.put('blob0', t, 0.42, bcz - 4 + (t - 7.5) * -0.68, 0.22, 0.09, 0.28, 0, 0.6, 0, 0x3a3f2a);
    L.put('ball', t + 0.22, 0.42, bcz - 4 + (t - 7.5) * -0.68 - 0.14, 0.06, 0.05, 0.06, 0, 0, 0, 0x3a3f2a);
  }
  // fish: a school of mullet and a couple of bass, drifting under the surface
  const fishGeo = new THREE.IcosahedronGeometry(1, 0);
  for (let k = 0; k < 9; k++) {
    const f = new THREE.Mesh(fishGeo, M.fish);
    const big = k < 2;
    f.scale.set(big ? 0.12 : 0.08, big ? 0.1 : 0.07, big ? 0.42 : 0.28);
    f.renderOrder = -0.5;
    f.userData.ownGeo = false;
    data.meshes.push(f);
    const r = rng.range(2, 7), sp = rng.range(0.15, 0.35) * rng.sign(), ph = rng.range(0, 6.28), dy = rng.range(0.5, 2.2);
    data.anims.push((t) => {
      const a = ph + t * sp;
      const lx = bcx + Math.sin(a) * r, lz = bcz + Math.cos(a) * r * 0.8;
      const [x, z] = L.w(lx, lz);
      f.position.set(x, -dy + Math.sin(t * 0.7 + ph) * 0.15, z);
      f.rotation.y = L.rot + a + (sp > 0 ? Math.PI / 2 : -Math.PI / 2);
    });
  }
  // the boil: rings swelling out from the vent
  for (let k = 0; k < 3; k++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 32).rotateX(-Math.PI / 2), M.ring.clone());
    ring.renderOrder = 3;
    ring.userData.ownGeo = true;
    const mat = ring.material;
    ring.userData.dispose = () => mat.dispose();
    data.meshes.push(ring);
    const [x, z] = L.w(bcx + 0.5, bcz - 0.5);
    data.anims.push((t) => {
      const ph = (t * 0.35 + k / 3) % 1;
      ring.position.set(x, 0.065, z);
      ring.scale.setScalar(0.5 + ph * 3.2);
      mat.opacity = 0.32 * (1 - ph);
    });
  }
  data.anims.push((t) => {
    M.normal.offset.set(t * 0.012, t * 0.008);
  });
  // a shady hammock wrapped around it
  treeRing(L, 34, 16, () => (rng.chance(0.65) ? S.liveOak : S.cabbagePalm));
  for (let k = 0; k < 14; k++) {
    const a = rng.range(0, Math.PI * 2);
    const d = shape(a) + rng.range(2.5, 6);
    if (Math.cos(a) > 0.75) continue;
    L.tree(rng.chance(0.5) ? S.cabbagePalm : S.liveOak, bcx + Math.sin(a) * d, bcz + Math.cos(a) * d, rng.range(0.9, 1.2));
  }
  // a thick understory everywhere except the paths
  for (let k = 0; k < 150; k++) {
    const a = rng.range(0, Math.PI * 2);
    const d = shape(a) + rng.range(1.0, 22);
    const lx = bcx + Math.sin(a) * d, lz = bcz + Math.cos(a) * d;
    if (lx * lx + lz * lz > 31 * 31) continue;
    if (Math.abs(lx) < 3 && lz > 0) continue;
    if (Math.abs(lx + 8) < 2.5 && Math.abs(lz - 16) < 3) continue;
    const r = rng.next();
    if (r < 0.55) fern(L, lx, lz, rng.range(0.9, 1.5));
    else if (r < 0.8) L.tree(S.palmetto, lx, lz, rng.range(0.9, 1.4));
    else if (r < 0.9) L.tree(S.shrub, lx, lz, rng.range(0.7, 1.2), 0x3d6a30);
    else L.tree(S.grassTuft, lx, lz, 1.2, 0x5a7a34);
  }
  for (let k = 0; k < 10; k++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(16, 27);
    const lx = Math.sin(a) * d, lz = Math.cos(a) * d;
    if (Math.abs(lx) < 4 && lz > 0) continue;
    L.tree(rng.chance(0.6) ? S.liveOak : S.cabbagePalm, lx, lz, rng.range(1.1, 1.5));
  }
  flowers(L, 9, 18, 3, 30, [0xf4f4f0, 0xe8d860]);
  flowers(L, -10, 12, 3, 24, [0xb070d0, 0xf4f4f0]);
  // picnic table in a clearing
  picnicTable(L, data, -8, 16, 0.3);
  // a pair of pool-noodle swimmers would be nice; a lone heron will do
  L.tree((b, r, x, z) => S.egret(b, r, x, z, L.rot + 2.4, 0), -12, -14);
  plaque(L, data, -2.8, dz0 + 11, 0, ...PLAQUES.spring[0]);
  plaque(L, data, 1.6, dz0 + 2.7, 0.3, ...PLAQUES.spring[1], 0.45);
  plaque(L, data, -15.5, bcz + 2, -Math.PI / 2, ...PLAQUES.spring[2]);
  data.fireflies = { x: bcx, z: bcz, r: 18 };
  data.floor = 'litter';
}

function picnicTable(L, data, lx, lz, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const P = (x, y, z, sx, sy, sz, col) => L.put('box', lx + c * x + s * z, y, lz - s * x + c * z, sx, sy, sz, 0, ang, 0, col);
  P(0, 0.72, 0, 0.8, 0.06, 1.9, 0x8a6a48);
  for (const sx of [-0.62, 0.62]) P(sx, 0.42, 0, 0.3, 0.05, 1.9, 0x8a6a48);
  for (const z of [-0.7, 0.7]) {
    P(-0.3, 0, z, 0.08, 0.75, 0.08, 0x6a5038);
    P(0.3, 0, z, 0.08, 0.75, 0.08, 0x6a5038);
  }
  const [x, z] = L.w(lx, lz);
  data.blocks.push({ t: 'r', x, z, hw: 0.85, hd: 1.0, c: Math.cos(L.rot + ang), s: Math.sin(L.rot + ang), y0: -1, y1: 1 });
}

// ---------------------------------------------------------------------------
// Overlook: a boardwalk out into open marsh and a two-storey tower to climb.
// ---------------------------------------------------------------------------
function wadingBird(L, kind, lx, lz, ang) {
  const rng = L.rng;
  const col = { egret: 0xf6f6f2, spoonbill: 0xe9a0b4, ibis: 0xf4f4f0, heron: 0x8a96a4 }[kind];
  const tall = kind === 'heron' ? 1.35 : kind === 'egret' ? 1.0 : 0.8;
  const c = Math.cos(ang), s = Math.sin(ang);
  const P = (key, x, y, z, sx, sy, sz, rx, color) => L.put(key, lx + c * x + s * z, y * tall, lz - s * x + c * z, sx * tall, sy * tall, sz * tall, rx, ang, 0, color);
  P('cyl', 0.05, 0, 0, 0.012, 0.55, 0.012, 0, 0x2a2a2a);
  P('cyl', -0.05, 0, 0, 0.012, 0.55, 0.012, 0, 0x2a2a2a);
  P('blob0', 0, 0.72, 0, 0.16, 0.17, 0.3, 0.3, col);
  P('cyl', 0, 0.78, 0.18, 0.03, 0.42, 0.03, 0.35, col);
  P('blob0', 0, 1.2, 0.33, 0.06, 0.06, 0.09, 0, col);
  const bill = { spoonbill: 0x8a8a6a, ibis: 0xd2584a, egret: 0xe0b020, heron: 0xc8a040 }[kind];
  P('cone', 0, 1.2, 0.4, 0.02, kind === 'ibis' ? 0.24 : 0.18, 0.02, Math.PI / 2 + (kind === 'ibis' ? 0.5 : 0), bill);
  void rng;
}

function buildOverlook(L, data, mats, rng, poi) {
  const Rw = poi.Rv - 6;
  // marsh water: everything on the far side of a wobbly shoreline
  const shore = (lx) => 4 + 2.5 * Math.sin(lx * 0.11 + 1) + 1.5 * Math.sin(lx * 0.27);
  const pts = [];
  for (let k = 0; k <= 80; k++) {
    const a = Math.PI / 2 + (k / 80) * Math.PI; // back half circle
    pts.push([Math.sin(a) * Rw * 1.02, Math.cos(a) * Rw]);
  }
  for (let x = -Rw; x <= Rw; x += 4) {
    const z = Math.min(shore(x), Math.sqrt(Math.max(0, Rw * Rw - x * x)));
    pts.push([-x, z]);
  }
  // reorder so the polygon runs around consistently
  const poly = pts.slice(0, 81).concat(pts.slice(81).sort((a, b) => b[0] - a[0]));
  waterPoly(L, data, mats.lake, poly);
  data.water.push((lx, lz) => lz < shore(lx) && inPoly(poly, lx, lz));
  // sawgrass and spatterdock, islands of cypress
  for (let k = 0; k < 220; k++) {
    const a = rng.range(Math.PI / 2, Math.PI * 1.5);
    const d = rng.range(6, Rw - 2);
    const lx = Math.sin(a) * d, lz = Math.cos(a) * d;
    if (Math.abs(lx) < 4 && lz > -18) continue; // keep the view from the boardwalk clear
    for (let q = 0; q < 4; q++) L.put('cone', lx + rng.range(-0.6, 0.6), 0, lz + rng.range(-0.6, 0.6), 0.1, rng.range(0.7, 1.5), 0.1, rng.range(-0.25, 0.25), 0, rng.range(-0.25, 0.25), S.vary(0xa09a5a, rng));
  }
  for (let k = 0; k < 4; k++) {
    const a = rng.range(Math.PI * 0.65, Math.PI * 1.35), d = rng.range(35, Rw - 8);
    const lx = Math.sin(a) * d, lz = Math.cos(a) * d;
    for (let q = 0; q < 9; q++) L.tree(S.cypress, lx + rng.range(-7, 7), lz + rng.range(-7, 7), rng.range(0.8, 1.3));
  }
  for (let k = 0; k < 30; k++) {
    const a = rng.range(Math.PI / 2, Math.PI * 1.5), d = rng.range(8, 40);
    L.tree((b, r, x, z) => S.lilyPads(b, r, x, z, 0.05), Math.sin(a) * d, Math.cos(a) * d);
  }
  // wading birds scattered across the shallows
  const kinds = ['egret', 'egret', 'spoonbill', 'spoonbill', 'ibis', 'ibis', 'ibis', 'heron'];
  for (let k = 0; k < 16; k++) {
    const a = rng.range(Math.PI * 0.6, Math.PI * 1.4), d = rng.range(10, 55);
    wadingBird(L, rng.pick(kinds), Math.sin(a) * d, Math.cos(a) * d, rng.range(0, 6.28));
  }
  for (let k = 0; k < 2; k++) {
    const a = rng.range(Math.PI * 0.7, Math.PI * 1.3), d = rng.range(15, 45);
    L.tree((b, r, x, z) => S.gator(b, r, x, z, L.rot + rng.range(0, 6), 0.06), Math.sin(a) * d, Math.cos(a) * d);
  }
  // boardwalk from the plaza out to the tower
  deck(L, data, mats, 0, 16, 0, 11, 2.2, 0.08, 0.6);
  deck(L, data, mats, 0, 11, 0, 0, 2.2, 0.6, 0.6);
  noBikes(L, data, 0, 16.6, 0);
  // the tower: porch, stair, mid deck, stair, top deck under a roof
  platform(L, data, mats, -3, -4, 3, 0, 0.6, 'nwe', { n: [[1.5, 3.1]] });
  deck(L, data, mats, 2.3, -4, 2.3, -10, 1.4, 0.6, 3.2, { rails: 'both', stairs: true });
  platform(L, data, mats, -3, -14, 3, -10, 3.2, 'nsew', { s: [[1.5, 3.1], [-3.1, -1.5]] });
  deck(L, data, mats, -2.3, -10, -2.3, -4, 1.4, 3.2, 6.0, { rails: 'both', stairs: true });
  platform(L, data, mats, -3, -4, 3, 0, 6.0, 'nsew', { n: [[-3.1, -1.5]] });
  for (const [x, z] of [[-3, 0], [3, 0], [-3, -4], [3, -4], [-3, -14], [3, -14], [-3, -10], [3, -10]]) {
    L.put('box', x, -0.5, z, 0.22, (z > -5 ? 8.6 : 4.4) + 0.5, 0.22, 0, 0, 0, 0x6a5440);
  }
  L.put('roof', 0, 8.5, -2, 7.2, 1.6, 5.4, 0, 0, 0, 0x5a4a3a);
  // coin binoculars at the top rail, looking out over the marsh
  L.put('cyl', 0, 6.0, -3.5, 0.06, 1.1, 0.06, 0, 0, 0, 0x2a5a8a);
  L.put('box', 0, 7.05, -3.5, 0.34, 0.2, 0.3, 0, 0, 0, 0x2a5a8a);
  for (const sx of [-0.09, 0.09]) L.put('cyl', sx, 7.15, -3.75, 0.05, 0.22, 0.05, Math.PI / 2, 0, 0, 0x1a1a1a);
  const [sx, sz] = L.w(0, -2.8);
  data.scopes.push({ x: sx, z: sz, y: 6.0, yaw: L.rot + Math.PI });
  plaque(L, data, -3.2, 17.5, 0, ...PLAQUES.overlook[0]);
  plaque(L, data, 2.2, -0.6, Math.PI, ...PLAQUES.overlook[1], 0.6);
  plaque(L, data, 1.6, -13.4, Math.PI, ...PLAQUES.overlook[2], 3.2);
  // the hammock you come through to reach it
  for (let k = 0; k < 12; k++) {
    const sd = k % 2 ? 1 : -1;
    L.tree(rng.chance(0.6) ? S.liveOak : S.cabbagePalm, sd * rng.range(6, 22), rng.range(10, 30), rng.range(1.0, 1.3));
  }
  for (let k = 0; k < 30; k++) L.tree(S.palmetto, rng.sign() * rng.range(3, 24), rng.range(7, 30), rng.range(1, 1.5));
  // wet prairie out to the sides: palms standing in the grass
  for (let k = 0; k < 60; k++) {
    const x = rng.sign() * rng.range(26, Rw * 0.95), z = rng.range(6, poi.R + 6);
    if (x * x + z * z > Rw * Rw) continue;
    if (rng.chance(0.25)) L.tree(S.cabbagePalm, x, z, rng.range(0.9, 1.3));
    else L.tree(S.grassTuft, x, z, 1.5, 0x9a9a55);
  }
  data.fireflies = { x: 0, z: 10, r: 14 };
}

// ---------------------------------------------------------------------------
// Big tree: one enormous bald cypress, a boardwalk loop around its knees.
// ---------------------------------------------------------------------------
function buildBigTree(L, data, mats, rng) {
  const tx = 0, tz = -6;
  // dark swamp water around the tree
  const poly = [];
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    const r = 19 + 2.5 * Math.sin(a * 3 + 1);
    poly.push([tx + Math.sin(a) * r, tz + Math.cos(a) * r * 0.85]);
  }
  waterPoly(L, data, mats.swamp, poly);
  data.water.push((lx, lz) => inPoly(poly, lx, lz));
  // the giant: flared, fluted base, a trunk you could not reach around
  const bark = 0x8a7c6a;
  L.put('cone', tx, -0.2, tz, 4.2, 4.5, 4.2, 0, 0.3, 0, bark);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    L.put('cone', tx + Math.sin(a) * 2.2, -0.2, tz + Math.cos(a) * 2.2, 1.5, 3.2, 1.5, Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3, S.vary(bark, rng));
  }
  L.put('trunk', tx, 0, tz, 2.0, 30, 2.0, 0, 0, 0, bark);
  L.put('trunk', tx + 0.6, 28, tz, 1.1, 8, 1.1, 0.2, 0.4, 0, bark);
  for (let k = 0; k < 8; k++) {
    const a = rng.range(0, 6.28), up = rng.range(22, 34);
    L.put('trunk', tx, up, tz, 0.5, rng.range(5, 9), 0.5, rng.range(0.9, 1.3), a, 0, bark);
  }
  for (let k = 0; k < 22; k++) {
    const a = rng.range(0, 6.28), d = rng.range(0, 9), y = rng.range(26, 40);
    const r = rng.range(3, 5.5);
    L.put('blob', tx + Math.sin(a) * d, y, tz + Math.cos(a) * d, r, r * 0.45, r, 0, rng.range(0, 6), 0, S.vary(0x6f8a3a, rng, 0.03, 0.1, 0.06));
  }
  for (let k = 0; k < 30; k++) {
    const a = rng.range(0, 6.28), d = rng.range(2, 9);
    L.put('moss', tx + Math.sin(a) * d, rng.range(22, 30), tz + Math.cos(a) * d, 1.0, rng.range(1.5, 3.2), 1.0, 0, rng.range(0, 6), 0, S.vary(0x98a088, rng));
  }
  const [gx, gz] = L.w(tx, tz);
  data.blocks.push({ t: 'c', x: gx, z: gz, r: 4.6 });
  // knees, lots of them
  for (let k = 0; k < 40; k++) {
    const a = rng.range(0, 6.28), d = rng.range(5, 15);
    L.put('cone', tx + Math.sin(a) * d, -0.1, tz + Math.cos(a) * d, rng.range(0.15, 0.35), rng.range(0.4, 1.2), rng.range(0.15, 0.35), 0, 0, 0, S.vary(bark, rng));
  }
  // boardwalk: in from the plaza, then a square loop around the giant
  const r = 8;
  deck(L, data, mats, 0, 15, 0, 11.5, 2.0, 0.08, 0.5, { rails: 'both' });
  deck(L, data, mats, 0, 11.5, 0, r - 0.2, 2.0, 0.5, 0.5, { rails: 'both' });
  noBikes(L, data, 0, 15.6, 0);
  // the loop runs clockwise with its rail on the outside; the water inside
  // keeps you on the boards without fencing off the view of the tree
  deck(L, data, mats, -r - 1, r - 1.2, r + 1, r - 1.2, 2.0, 0.5, 0.5, { rails: 'none' });
  deck(L, data, mats, r, r - 1.2, r, -r - 13, 2.0, 0.5, 0.5, { rails: 'left' });
  deck(L, data, mats, r + 1, -r - 13, -r - 1, -r - 13, 2.0, 0.5, 0.5, { rails: 'left' });
  deck(L, data, mats, -r, -r - 13, -r, r - 1.2, 2.0, 0.5, 0.5, { rails: 'left' });
  for (const [a, b2] of [[-r - 1, -1.1], [1.1, r + 1]]) {
    const mx = (a + b2) / 2, len = b2 - a;
    L.put('box', mx, 1.5, r - 0.25, len, 0.08, 0.1, 0, 0, 0, 0x8a7055);
    L.put('box', mx, 1.0, r - 0.25, len, 0.08, 0.06, 0, 0, 0, 0x8a7055);
    for (let x = a; x <= b2; x += 1.6) L.put('box', x, 0.5, r - 0.25, 0.1, 1.05, 0.1, 0, 0, 0, 0x8a7055);
    const [x, z] = L.w(mx, r - 0.25);
    data.blocks.push({ t: 'r', x, z, hw: len / 2, hd: 0.08, c: L.c, s: L.s, y0: 0.2, y1: 1.6 });
  }
  // a bench on the far side of the loop, facing the tree
  L.tree((b, rr, x, z) => S.bench(b, x, z, L.rot), -3, -r - 12.35);
  // ferns and young cypress around the edge
  for (let k = 0; k < 50; k++) {
    const a = rng.range(0, 6.28), d = rng.range(20, 30);
    const lx = Math.sin(a) * d, lz = tz + Math.cos(a) * d;
    if (lz > 8 && Math.abs(lx) < 3) continue;
    fern(L, lx, lz, rng.range(1, 1.5), 0x5a8a3a);
  }
  // young cypress in the water, kept clear of the boardwalk loop
  const onLoop = (x, z) => (Math.abs(Math.abs(x) - r) < 2.2 && z > -r - 14.5 && z < r + 0.5) || (Math.abs(x) < r + 2.2 && (Math.abs(z - (r - 1.2)) < 2.2 || Math.abs(z - (-r - 13)) < 2.2));
  for (let k = 0, n = 0; k < 40 && n < 12; k++) {
    const a = rng.range(0, 6.28), d = rng.range(11, 18);
    const x = tx + Math.sin(a) * d, z = tz + Math.cos(a) * d * 0.85;
    if (onLoop(x, z)) continue;
    L.tree(S.cypress, x, z, rng.range(0.7, 1.0));
    n++;
  }
  treeRing(L, 32, 14, () => (rng.chance(0.5) ? S.cypress : S.liveOak));
  data.floor = 'litter';
  plaque(L, data, -2.6, 14, 0, ...PLAQUES.bigtree[0]);
  plaque(L, data, 4, -r - 12.08, Math.PI, ...PLAQUES.bigtree[1], 0.5);
  data.fireflies = { x: 0, z: 0, r: 20 };
}

// ---------------------------------------------------------------------------
// Park: pavilion, playground, a gopher tortoise working the lawn.
// ---------------------------------------------------------------------------
function buildPark(L, data, mats, rng) {
  // concrete walk loop
  const loop = [];
  for (let k = 0; k <= 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    loop.push([Math.sin(a) * 18, -4 + Math.cos(a) * 14]);
  }
  for (let k = 0; k < 48; k++) {
    const [ax, az] = loop[k], [bx, bz] = loop[k + 1];
    const len = Math.hypot(bx - ax, bz - az);
    L.put('flat', (ax + bx) / 2, 0.02, (az + bz) / 2, 2.2, 0.05, len + 0.3, 0, Math.atan2(bx - ax, bz - az), 0, 0xcfcac0);
  }
  // pavilion with picnic tables
  const px = -9, pz = -6;
  for (const [x, z] of [[-4, -3], [4, -3], [-4, 3], [4, 3], [0, -3], [0, 3]]) {
    L.put('box', px + x, 0, pz + z, 0.25, 3.0, 0.25, 0, 0, 0, 0x7a2c22);
    const [wx, wz] = L.w(px + x, pz + z);
    data.blocks.push({ t: 'c', x: wx, z: wz, r: 0.2 });
  }
  L.put('flat', px, 0, pz, 9.6, 0.12, 7.6, 0, 0, 0, 0xcfcac0);
  L.put('box', px, 3.0, pz, 9.8, 0.3, 7.8, 0, 0, 0, 0xf2eee4);
  L.put('roof', px, 3.3, pz, 10.4, 1.9, 8.4, 0, 0, 0, 0x2f5a3a);
  for (const [x, z] of [[-2, -1.4], [2, -1.4], [-2, 1.4], [2, 1.4]]) picnicTable(L, data, px + x, pz + z, Math.PI / 2);
  // playground: slide, swings, all on mulch
  const gx = 9, gz = -10;
  L.put('flat', gx, 0.01, gz, 12, 0.05, 9, 0, 0, 0, 0x8a5a3a);
  L.put('box', gx - 2, 0, gz, 2, 1.8, 2, 0, 0, 0, 0xd8b030);
  L.put('roof', gx - 2, 2.6, gz, 2.6, 1.0, 2.6, 0, 0, 0, 0x2a6ab0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) L.put('cyl', gx - 2 + x, 0, gz + z, 0.06, 2.6, 0.06, 0, 0, 0, 0x2a6ab0);
  L.put('box', gx - 0.2, 0.05, gz, 1.0, 0.08, 3.6, -0.5, Math.PI / 2, 0, 0xd83a2a);
  const swingX = gx + 3;
  for (const z of [-2.2, 2.2]) {
    L.put('cyl', swingX - 0.9, 0, gz + z, 0.06, 2.8, 0.06, 0, 0, 0.32, 0x2a6ab0);
    L.put('cyl', swingX + 0.9, 0, gz + z, 0.06, 2.8, 0.06, 0, 0, -0.32, 0x2a6ab0);
  }
  L.put('cyl', swingX, 2.62, gz - 2.3, 0.06, 4.6, 0.06, Math.PI / 2, 0, 0, 0x2a6ab0);
  const swingMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  for (const z of [-1.0, 1.0]) {
    const sw = new THREE.Group();
    const [wx, wz] = L.w(swingX, gz + z);
    sw.position.set(wx, 2.6, wz);
    sw.rotation.y = L.rot + Math.PI / 2;
    for (const sx of [-0.25, 0.25]) {
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.1, 0.02), swingMat);
      ch.position.set(sx, -1.05, 0);
      sw.add(ch);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.25), swingMat);
    seat.position.y = -2.1;
    seat.castShadow = true;
    sw.add(seat);
    sw.userData.dispose = () => sw.children.forEach((c) => c.geometry.dispose());
    data.meshes.push(sw);
    const ph = rng.range(0, 6);
    data.anims.push((t) => (sw.rotation.x = Math.sin(t * 1.4 + ph) * 0.12));
  }
  // restrooms, water fountain, bike fix-it stand, flagpole
  L.put('box', -16, 0, 6, 6, 3, 4, 0, 0, 0, 0xd8cdb4);
  L.put('roof', -16, 3, 6, 6.8, 1.4, 4.8, 0, 0, 0, 0x6a5a4a);
  const [rx, rz] = L.w(-16, 6);
  data.blocks.push({ t: 'r', x: rx, z: rz, hw: 3.2, hd: 2.2, c: L.c, s: L.s });
  L.put('box', -12.4, 0, 9, 0.35, 0.95, 0.35, 0, 0, 0, 0x5a7a8a);
  L.put('box', 6, 0, 13, 0.12, 1.4, 0.12, 0, 0, 0, 0x2a5a8a);
  L.put('box', 6, 1.3, 13, 0.6, 0.08, 0.08, 0, 0, 0, 0x2a5a8a);
  L.put('cyl', 0, 0, -20, 0.08, 9, 0.08, 0, 0, 0, 0xd0d0d0);
  const flagMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, map: flagTexture() });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0, 8, 1), flagMat);
  const [fx, fz] = L.w(0.95, -20);
  flag.position.set(fx, 8.3, fz);
  flag.rotation.y = L.rot;
  flag.userData.ownGeo = true;
  flag.userData.dispose = () => {
    flagMat.map.dispose();
    flagMat.dispose();
  };
  data.meshes.push(flag);
  const base = flag.geometry.attributes.position.array.slice();
  data.anims.push((t) => {
    const pa = flag.geometry.attributes.position;
    for (let k = 0; k < pa.count; k++) {
      const x = base[k * 3];
      pa.setZ(k, Math.sin(x * 3 - t * 4) * 0.08 * (x + 0.9));
    }
    pa.needsUpdate = true;
  });
  // big shade oaks, crape myrtles, flower beds around the loop
  for (let k = 0; k < 9; k++) {
    const a = rng.range(0, 6.28), d = rng.range(22, 30);
    L.tree(S.liveOak, Math.sin(a) * d, -4 + Math.cos(a) * d * 0.8, rng.range(1.2, 1.6));
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * 6.28;
    L.tree(S.crapeMyrtle, Math.sin(a) * 21, -4 + Math.cos(a) * 16.5);
  }
  treeRing(L, 38, 12, () => (rng.chance(0.5) ? S.liveOak : S.slashPine), 0.9);
  flowers(L, 0, 2, 3.5, 60, [0xe0457a, 0xf2c230, 0xf4f4f0, 0xb366c4, 0xff7a2a]);
  flowers(L, 12, 2, 2.5, 40, [0xe0457a, 0xf2c230, 0xff7a2a]);
  flowers(L, -4, -17, 2.5, 40, [0xb366c4, 0xf4f4f0]);
  // gopher tortoise burrow, and its owner out for a stroll
  L.put('blob0', 13, -0.2, 6, 1.0, 0.35, 1.0, 0, 0, 0, 0xd8c89a);
  const tort = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6a5a40, flatShading: true }));
  shell.scale.set(1, 0.75, 1.25);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshLambertMaterial({ color: 0x7a6a50 }));
  head.position.set(0, 0.06, 0.3);
  tort.add(shell, head);
  tort.userData.dispose = () => {
    shell.geometry.dispose();
    shell.material.dispose();
    head.geometry.dispose();
    head.material.dispose();
  };
  data.meshes.push(tort);
  data.anims.push((t) => {
    const a = t * 0.02;
    const lx = 13 + Math.sin(a) * 4, lz = 4 + Math.cos(a * 1.3) * 3;
    const [x, z] = L.w(lx, lz);
    tort.position.set(x, 0.02, z);
    tort.rotation.y = L.rot + a + Math.PI / 2;
    head.position.y = 0.06 + Math.sin(t * 2) * 0.01;
  });
  // a kiosk map board by the plaza
  plaque(L, data, -3, 13, 0, ...PLAQUES.park[0]);
  plaque(L, data, 3.2, -18, Math.PI, ...PLAQUES.park[1]);
}

function flagTexture() {
  const cv = document.createElement('canvas');
  cv.width = 190;
  cv.height = 100;
  const g = cv.getContext('2d');
  for (let k = 0; k < 13; k++) {
    g.fillStyle = k % 2 ? '#ffffff' : '#b22234';
    g.fillRect(0, (k * 100) / 13, 190, 100 / 13 + 1);
  }
  g.fillStyle = '#3c3b6e';
  g.fillRect(0, 0, 76, 54);
  g.fillStyle = '#ffffff';
  for (let y = 0; y < 9; y++) for (let x = 0; x < (y % 2 ? 5 : 6); x++) g.fillRect(4 + x * 12 + (y % 2) * 6, 3 + y * 5.6, 2, 2);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Fish camp: bait shop on stilts, docks, airboats tied up, open water beyond.
// ---------------------------------------------------------------------------
function airboat(L, lx, lz, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const P = (key, x, y, z, sx, sy, sz, rx, rz, col) => L.put(key, lx + c * x + s * z, y, lz - s * x + c * z, sx, sy, sz, rx, ang, rz, col);
  P('box', 0, 0.0, 0, 2.3, 0.4, 4.6, 0, 0, 0xd8d8d0);
  P('box', 0, 0.4, 1.0, 0.8, 0.5, 0.8, 0, 0, 0x2a5a8a);
  P('box', 0, 0.4, -0.3, 0.5, 1.5, 0.4, 0, 0, 0x888888);
  P('box', 0, 1.9, -0.3, 0.7, 0.12, 0.7, 0, 0, 0x2a5a8a);
  P('cyl', 0, 1.2, -1.6, 1.0, 0.1, 1.0, Math.PI / 2, 0, 0x7a7a7a);
  P('box', 0, 0.6, -1.7, 0.5, 0.6, 0.6, 0, 0, 0x3a3a3a);
  P('box', 0, 1.2, -1.75, 1.9, 0.1, 0.12, 0, 0.4, 0x2a2a2a);
}

function buildFishCamp(L, data, mats, rng, poi) {
  const Rw = poi.Rv - 6;
  const shore = (lx) => -4 + 1.5 * Math.sin(lx * 0.15);
  const poly = [];
  for (let k = 0; k <= 80; k++) {
    const a = Math.PI / 2 + (k / 80) * Math.PI;
    poly.push([Math.sin(a) * Rw * 1.02, Math.cos(a) * Rw]);
  }
  const edge = [];
  for (let x = -Rw; x <= Rw; x += 3) edge.push([x, Math.min(shore(x), Math.sqrt(Math.max(0, Rw * Rw - x * x)))]);
  edge.sort((a, b) => b[0] - a[0]);
  const water = poly.concat(edge.map(([x, z]) => [-x, z]).sort((a, b) => b[0] - a[0]));
  waterPoly(L, data, mats.lake, water);
  data.water.push((lx, lz) => lz < shore(lx) && inPoly(water, lx, lz));
  // bait shop up on stilts with a porch and stairs
  const sx = -10, sz = 4;
  for (const [x, z] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) L.put('box', sx + x, 0, sz + z, 0.25, 1.2, 0.25, 0, 0, 0, 0x5a4a3a);
  L.put('box', sx, 1.1, sz - 1, 8, 3.0, 4.5, 0, 0, 0, 0x9a8a6a);
  L.put('box', sx, 4.1, sz - 1, 8.8, 0.15, 6.6, 0, 0, 0, 0xb8bcc0);
  L.put('roof', sx, 4.2, sz - 1, 8.8, 1.2, 6.6, 0, 0, 0, 0xa8acb0);
  L.put('glass', sx + 2, 2.0, sz + 1.26, 1.8, 1.2, 0.06, 0, 0, 0, 0x2a3a44);
  L.put('box', sx - 1.5, 1.2, sz + 1.26, 1.0, 2.0, 0.08, 0, 0, 0, 0x6a3a22);
  platform(L, data, mats, sx - 4, sz + 1.25, sx + 4, sz + 3.6, 1.2, 'sew', { s: [[sx - 4.1, sx - 2.3]] });
  deck(L, data, mats, sx - 3.2, sz + 8, sx - 3.2, sz + 3.6, 1.7, 0.05, 1.2, { rails: 'both', stairs: true });
  const [bx, bz] = L.w(sx, sz - 1);
  data.blocks.push({ t: 'r', x: bx, z: bz, hw: 4.1, hd: 2.4, c: L.c, s: L.s, y0: -1, y1: 6 });
  const tex = S.signTexture([{ text: 'BAIT · TACKLE', size: 64 }, { text: 'COLD DRINKS · AIRBOAT RIDES', size: 34 }], '#f2e6c8', '#a8321e', 640, 200, true);
  const sign = S.textSign(tex, 4.4, 1.3, 4.2, 0, true);
  const [gx, gz] = L.w(sx, sz + 1.3);
  sign.position.set(gx, 0, gz);
  sign.rotation.y = L.rot;
  data.meshes.push(sign);
  // docks out into the water with airboats and a jon boat tied up
  deck(L, data, mats, 6, 4, 6, 0, 2.2, 0.08, 0.55, { rails: 'none' });
  deck(L, data, mats, 6, 0, 6, -14, 2.2, 0.55, 0.55, { rails: 'none' });
  deck(L, data, mats, 6, -14, 18, -14, 2.2, 0.55, 0.55, { rails: 'none' });
  noBikes(L, data, 6, 4.6, 0);
  airboat(L, 9.4, -7, 0.1);
  airboat(L, 2.6, -10, -0.08);
  airboat(L, 14, -17.6, Math.PI / 2);
  for (const z of [-2, -6, -10, -14]) for (const x of [4.9, 7.1]) L.put('cyl', x, -0.4, z, 0.12, 1.6, 0.12, 0, 0, 0, 0x5a4a3a);
  // canoes on a rack, an old truck, a boat ramp
  for (let k = 0; k < 3; k++) L.put('blob0', 14, 0.5 + k * 0.45, 8, 0.45, 0.2, 2.4, 0, 0.1, 0, [0x2a7a3a, 0xd83a2a, 0xe8b030][k]);
  L.put('box', 14, 0, 8, 2.8, 0.4, 0.15, 0, 0, 0, 0x5a4a3a);
  L.tree((b, r, x, z) => {
    b.setFrame(x, 0, z, L.rot + 0.6);
    S.car(b, r, 0, 0, 0, true);
    b.clearFrame();
  }, -1, 12);
  L.put('flat', 0, 0.02, 1, 4, 0.05, 10, -0.08, 0, 0, 0xb0aca2);
  picnicTable(L, data, -4, -1, 0.2);
  picnicTable(L, data, 16, 2, -0.3);
  // gators lounging, a great blue heron on the dock
  wadingBird(L, 'heron', 17.2, -14, 2.2);
  for (let k = 0; k < 3; k++) {
    const a = rng.range(Math.PI * 0.7, Math.PI * 1.3), d = rng.range(18, 45);
    L.tree((b, r, x, z) => S.gator(b, r, x, z, L.rot + rng.range(0, 6), 0.06), Math.sin(a) * d, Math.cos(a) * d);
  }
  for (let k = 0; k < 60; k++) {
    const x = rng.range(-Rw, Rw);
    L.tree(S.reeds, x, shore(x) - rng.range(0, 2.5));
  }
  for (let k = 0; k < 6; k++) {
    const a = rng.range(Math.PI * 0.6, Math.PI * 1.4), d = rng.range(40, Rw - 6);
    for (let q = 0; q < 8; q++) L.tree(S.cypress, Math.sin(a) * d + rng.range(-6, 6), Math.cos(a) * d + rng.range(-6, 6), rng.range(0.8, 1.2));
  }
  for (let k = 0; k < 26; k++) {
    const sd = k % 2 ? 1 : -1;
    L.tree(rng.chance(0.5) ? S.liveOak : S.cabbagePalm, sd * rng.range(20, Rw * 0.9), rng.range(0, poi.R + 4), rng.range(1, 1.4));
  }
  plaque(L, data, 2.4, 12.6, 0, ...PLAQUES.fishcamp[0]);
  plaque(L, data, 7.5, -14.6, Math.PI, ...PLAQUES.fishcamp[1], 0.55);
}

// ---------------------------------------------------------------------------
// Historic depot: board-and-batten station, a red caboose on a stub of track.
// ---------------------------------------------------------------------------
function buildDepot(L, data, mats, rng, poi) {
  const dx = 0, dz = -4;
  const town = poi.name.replace(/^Old /, '').replace(/ Depot$/, '').toUpperCase();
  L.put('flat', dx, 0, dz, 22, 0.35, 7, 0, 0, 0, 0xb8b0a0); // platform
  L.put('box', dx, 0.35, dz - 1, 14, 3.4, 5, 0, 0, 0, 0xe2c88a);
  for (let k = -6.5; k <= 6.5; k += 0.5) L.put('box', dx + k, 0.35, dz + 1.53, 0.06, 3.4, 0.06, 0, 0, 0, 0xc9ad70);
  L.put('box', dx, 3.6, dz - 1, 18, 0.2, 9, 0, 0, 0, 0x6a3a22);
  L.put('roof', dx, 3.8, dz - 1, 18, 2.2, 9, 0, 0, 0, 0x7a2c22);
  for (const x of [-4, 0, 4]) {
    L.put('glass', dx + x, 1.3, dz + 1.56, 1.1, 1.6, 0.06, 0, 0, 0, 0x2a3a44);
    L.put('flat', dx + x, 1.22, dz + 1.58, 1.3, 1.78, 0.04, 0, 0, 0, 0xf2eee4);
  }
  L.put('box', dx - 6, 0.35, dz + 1.55, 1.2, 2.3, 0.08, 0, 0, 0, 0x2f5a3a);
  // braces under the eaves
  for (let k = -8; k <= 8; k += 2.6) L.put('box', dx + k, 2.6, dz + 2.2, 0.1, 1.2, 0.1, 0.8, 0, 0, 0x6a3a22);
  const [hx, hz] = L.w(dx, dz - 1);
  data.blocks.push({ t: 'r', x: hx, z: hz, hw: 7.1, hd: 2.6, c: L.c, s: L.s });
  for (const sgn of [-1, 1]) {
    const tex = S.signTexture([{ text: town, size: 70 }], '#f2eee4', '#1a1a1a', 512, 110, true);
    const sg = S.textSign(tex, 2.6, 0.55, 3.0, 0, false);
    const [x, z] = L.w(dx + sgn * 7.05, dz - 1);
    sg.position.set(x, 0, z);
    sg.rotation.y = L.rot + sgn * Math.PI / 2;
    data.meshes.push(sg);
  }
  // track behind the depot, and the caboose
  const tz = dz - 7.5;
  for (let x = -20; x <= 20; x += 0.7) L.put('box', x, 0.02, tz, 0.25, 0.14, 2.5, 0, 0, 0, 0x4a3a2a);
  for (const z of [-0.72, 0.72]) L.put('box', 0, 0.16, tz + z, 40, 0.14, 0.08, 0, Math.PI / 2, 0, 0x7a6a5a);
  const cx = 6;
  L.put('box', cx, 0.9, tz, 8.5, 2.6, 2.9, 0, 0, 0, 0xa82a1e);
  L.put('box', cx, 3.5, tz, 3.2, 1.2, 2.4, 0, 0, 0, 0xa82a1e);
  L.put('box', cx, 3.5, tz, 8.8, 0.15, 3.1, 0, 0, 0, 0x2a2a2a);
  L.put('box', cx, 4.7, tz, 3.4, 0.12, 2.6, 0, 0, 0, 0x2a2a2a);
  for (const x of [-2.5, 0, 2.5]) L.put('glass', cx + x, 2.0, tz + 1.46, 0.7, 0.6, 0.04, 0, 0, 0, 0x2a3a44);
  for (const x of [-3, -1.8, 1.8, 3]) for (const z of [-0.72, 0.72]) L.put('wheel', cx + x, 0.45, tz + z, 0.15, 0.9, 0.9, 0, 0, 0, 0x1a1a1a);
  for (const x of [-4.4, 4.4]) L.put('box', cx + x, 0.7, tz, 0.6, 0.1, 2.9, 0, 0, 0, 0x2a2a2a);
  const [kx, kz] = L.w(cx, tz);
  data.blocks.push({ t: 'r', x: kx, z: kz, hw: 4.6, hd: 1.6, c: L.c, s: L.s });
  // water tower, baggage cart, semaphore
  const wx = -14, wz = -12;
  for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) L.put('box', wx + x, 0, wz + z, 0.25, 7, 0.25, 0, 0, 0, 0x5a4a3a);
  L.put('cyl', wx, 7, wz, 2.4, 3.2, 2.4, 0, 0, 0, 0x6a5a48);
  L.put('cone', wx, 10.2, wz, 2.7, 1.4, 2.7, 0, 0, 0, 0x4a4a48);
  const [ax, az] = L.w(wx, wz);
  data.blocks.push({ t: 'c', x: ax, z: az, r: 2.2 });
  L.put('box', -6, 0.35, dz + 3, 2.6, 0.7, 1.2, 0, 0.2, 0, 0x2f5a3a);
  for (const x of [-7, -5]) L.put('wheel', x, 0.25, dz + 3, 0.08, 0.5, 0.5, 0, 0.2, 0, 0x1a1a1a);
  L.put('cyl', 16, 0, tz + 2, 0.1, 6, 0.1, 0, 0, 0, 0x2a2a2a);
  L.put('box', 16.5, 5.4, tz + 2, 1.4, 0.25, 0.08, 0, 0, 0.5, 0xd8b030);
  // old oaks, a citrus tree or two, a bench on the platform
  for (let k = 0; k < 6; k++) L.tree(S.liveOak, rng.sign() * rng.range(14, 24), rng.range(-18, 14), rng.range(1.1, 1.5));
  for (let k = 0; k < 3; k++) L.tree(S.citrus, rng.range(-18, -10), rng.range(4, 12));
  treeRing(L, 30, 12, () => (rng.chance(0.6) ? S.liveOak : S.cabbagePalm), 0.9);
  L.tree((b, r, x, z) => S.bench(b, x, z, L.rot), 3, dz + 2.6);
  flowers(L, 9, 6, 2.5, 30, [0xe0457a, 0xf2c230, 0xf4f4f0]);
  plaque(L, data, -3, 12, 0, ...PLAQUES.depot[0]);
  plaque(L, data, 11, -3, Math.PI / 2 + 0.6, ...PLAQUES.depot[1]);
}

const BUILD = { spring: buildSpring, overlook: buildOverlook, bigtree: buildBigTree, park: buildPark, fishcamp: buildFishCamp, depot: buildDepot };

// ---------------------------------------------------------------------------
// Build a place of interest into a chunk. Returns its interactive data.
// ---------------------------------------------------------------------------
export function buildPoi(ctx, poi, mats) {
  const { path, b } = ctx;
  const rng = new RNG(poi.seed);
  const { cx, cz, rot, D } = poiPlace(path, poi);
  const L = new Local(b, rng, cx, cz, rot);
  const kind = POI_KINDS[poi.kind];
  const data = { poi, cx, cz, rot, R: poi.R, Rv: poi.Rv, local: L, walk: [], blocks: [], water: [], plaques: [], scopes: [], anims: [], meshes: [], rack: null, fireflies: null };
  const p = path.pts[poi.i];
  const reg = path.regions.list[p.r];
  const urban = ['town', 'lakeloop', 'corridor', 'street'].includes(p.type);

  BUILD[poi.kind](L, data, mats, rng, poi);
  if (data.floor) {
    // leaf litter under the hammock canopy (drawn early, like the ground)
    const fl = new THREE.Mesh(new THREE.CircleGeometry(poi.Rv - 1, 40).rotateX(-Math.PI / 2), mats.floor[data.floor]);
    fl.position.set(cx, 0.012, cz);
    fl.renderOrder = -1.8;
    fl.receiveShadow = true;
    fl.userData.ownGeo = true;
    data.meshes.push(fl);
  }
  ringWall(L, data, poi.Rv, urban && poi.kind !== 'fishcamp' ? 'suburb' : kind.ring, kind.gap);

  // spur from the trail to a little plaza with a bike rack
  const zEdge = D - p.w / 2 + 0.3;
  const zPlaza = poi.R - 6;
  const dirt = reg.surf === 'dirt';
  const sg = new THREE.PlaneGeometry(2.4, zEdge - zPlaza).rotateX(-Math.PI / 2);
  const suv = sg.attributes.uv;
  for (let k = 0; k < suv.count; k++) suv.setY(k, suv.getY(k) * ((zEdge - zPlaza) / 4));
  const spur = new THREE.Mesh(sg, dirt ? mats.dirt : mats.concreteTrail);
  const [mx, mz] = L.w(0, (zEdge + zPlaza) / 2);
  spur.position.set(mx, 0.05, mz);
  spur.rotation.y = rot;
  spur.receiveShadow = true;
  spur.userData.ownGeo = true;
  data.meshes.push(spur);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(5.5, 28).rotateX(-Math.PI / 2), dirt ? mats.dirt : mats.concreteTrail);
  const [qx, qz] = L.w(0, zPlaza);
  plaza.position.set(qx, 0.045, qz);
  plaza.receiveShadow = true;
  plaza.userData.ownGeo = true;
  data.meshes.push(plaza);
  bikeRackAndBench(L, data, 3.2, zPlaza - 1.5);
  data.spur = { x0: L.w(0, zEdge), x1: L.w(0, zPlaza) };

  // brown sign on the trail, before the turnoff, facing riders
  const arrow = poi.side > 0 ? '→' : '←';
  const tex = S.signTexture([{ text: poi.name, size: 54, font: 'Georgia, serif' }, { text: `${poi.sub}  ${arrow}`, size: 34, font: 'Georgia, serif', weight: 400 }], '#5a3a1e', '#efe2c0');
  const sign = S.textSign(tex, 2.8, 1.25, 0.7, 2, true);
  const ai = Math.max(0, poi.i - 10);
  const ap = path.pts[ai];
  const lat = poi.side * (ap.w / 2 + 1.6);
  sign.position.set(ap.x - Math.cos(ap.h) * lat, 0, ap.z + Math.sin(ap.h) * lat);
  sign.rotation.y = ap.h + Math.PI - poi.side * 0.3;
  data.meshes.push(sign);

  for (const m of data.meshes) ctx.add(m);
  for (const bl of data.blocks) b.colliders.push(bl);
  return data;
}

// Highest walkable surface at (x, z) no more than a step above y.
export function walkHeight(data, x, z, y) {
  let best = null;
  for (const w of data.walk) {
    const dx = x - w.x, dz = z - w.z;
    const lx = w.c * dx - w.s * dz, lz = w.s * dx + w.c * dz;
    if (Math.abs(lx) > w.hw || Math.abs(lz) > w.hd) continue;
    const t = (lz + w.hd) / (2 * w.hd);
    const h = w.y0 + (w.y1 - w.y0) * t;
    if (h <= y + 0.55 && (best === null || h > best)) best = h;
  }
  return best;
}

export function inWater(data, x, z) {
  const [lx, lz] = data.local.l(x, z);
  return data.water.some((f) => f(lx, lz));
}

// Is (x, z) somewhere you can't go: water with no deck over it at your level?
export function wet(data, x, z, y, onFoot) {
  if (!inWater(data, x, z)) return false;
  return !onFoot || walkHeight(data, x, z, Math.max(y, 0.3)) === null;
}

// Fireflies drifting over the water and ferns after dark.
let FF = null;
export function fireflies(scene) {
  if (FF) return FF;
  const n = 140;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  const m = new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  scene.add(pts);
  const seeds = Array.from({ length: n }, (_, k) => [Math.sin(k * 12.9898) * 43758.5453 % 1, Math.sin(k * 78.233) * 12345.678 % 1, Math.sin(k * 3.7) * 9876.54 % 1].map((v) => Math.abs(v)));
  FF = {
    pts,
    update(t, list, night) {
      const pa = g.attributes.position, ca = g.attributes.color;
      const per = list.length ? Math.floor(n / list.length) : 0;
      for (let k = 0; k < n; k++) {
        const f = per ? list[Math.min(list.length - 1, Math.floor(k / per))] : null;
        if (!f || night < 0.2) {
          ca.setXYZ(k, 0, 0, 0);
          continue;
        }
        const [a, b2, c] = seeds[k];
        const ang = a * 6.28 + t * 0.05 * (b2 - 0.5);
        const r = Math.sqrt(b2) * f.r;
        pa.setXYZ(k, f.x + Math.cos(ang) * r + Math.sin(t * 0.3 + k) * 0.6, 0.6 + c * 2.2 + Math.sin(t * 0.5 + k * 1.7) * 0.3, f.z + Math.sin(ang) * r);
        const blink = Math.max(0, Math.sin(t * (1.5 + c * 2) + k * 2.3)) ** 6;
        ca.setXYZ(k, 0.9 * blink * night, 1.0 * blink * night, 0.35 * blink * night);
      }
      pa.needsUpdate = true;
      ca.needsUpdate = true;
    },
  };
  return FF;
}
