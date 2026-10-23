import { RNG, hash } from './rng.js';
import { RegionPlan } from './regions.js';

// The ride is one endless polyline sampled every STEP metres. Everything else
// (scenery, traffic, the bike's height) is positioned relative to it.
export const STEP = 2;

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const CURVE = {
  street: { amp: 0.004, every: [60, 200], bend: 0.3 },
  suburbTrail: { amp: 0.012, every: [30, 120], bend: 0 },
  town: { amp: 0.004, every: [80, 200], bend: 0 },
  hammock: { amp: 0.016, every: [20, 90], bend: 0 },
  flatwoods: { amp: 0.008, every: [60, 200], bend: 0 },
  wetland: { amp: 0.012, every: [30, 90], bend: 0 },
  lake: { amp: 0.009, every: [40, 140], bend: 0 },
  grove: { amp: 0.003, every: [100, 250], bend: 0 },
};

const CROSSING_TYPES = ['suburbTrail', 'town', 'grove', 'flatwoods'];

export class Path {
  constructor(seed) {
    this.seed = seed;
    this.rng = new RNG(hash(seed, 77));
    this.regions = new RegionPlan(seed);
    this.pts = [];
    this.crossings = [];
    this.base = this.rng.range(-0.25, 0.45); // general direction of travel
    this.x = 0;
    this.z = 0;
    this.h = 0;
    this.curv = 0;
    this.curvTarget = 0;
    this.curvLeft = 40;
    this.w = 7.2;
    this.board = null;
    this.nextCross = 1500;
    this.straightUntil = 60;
  }

  ensure(i) {
    while (this.pts.length <= i) this.step();
  }

  step() {
    const i = this.pts.length;
    const d = i * STEP;
    const rng = this.rng;
    const region = this.regions.at(d);
    const type = region.type;
    const cfg = CURVE[type];

    // --- surface + width --------------------------------------------------
    let surf = type === 'street' ? 'road' : 'trail';
    if (type === 'wetland' && !this.board && d > region.start + 40 && region.end - d > 140 && rng.chance(0.03)) {
      const len = Math.min(rng.range(80, 260), region.end - d - 30);
      this.board = { start: d, end: d + len };
    }
    let y = surf === 'road' ? 0.04 : 0.06;
    if (this.board) {
      if (d >= this.board.end) this.board = null;
      else {
        surf = 'board';
        const s = d - this.board.start;
        const len = this.board.end - this.board.start;
        y = 0.06 + 0.72 * smooth(0, 12, s) * smooth(0, 12, len - s);
      }
    }
    const wTarget = surf === 'road' ? 7.2 : surf === 'board' ? 3.4 : 3.6;
    this.w += Math.max(-0.12, Math.min(0.12, wTarget - this.w));

    // --- crossings ----------------------------------------------------------
    let cross = null;
    if (d >= this.nextCross - 40 && this.straightUntil < this.nextCross + 40) this.straightUntil = this.nextCross + 40;
    if (d >= this.nextCross) {
      if (CROSSING_TYPES.includes(type) && surf === 'trail' && d - region.start > 60 && region.end - d > 60) {
        cross = { i, x: this.x, z: this.z, h: this.h, region: region.index, d, seed: hash(this.seed, i, 9) };
        this.crossings.push(cross);
      }
      this.nextCross = d + (type === 'town' ? rng.range(300, 600) : rng.range(450, 1100));
    }

    // --- heading ------------------------------------------------------------
    this.curvLeft -= STEP;
    if (this.curvLeft <= 0) {
      this.curvLeft = rng.range(...cfg.every);
      if (cfg.bend && rng.chance(cfg.bend)) {
        // a proper street corner-ish bend
        this.curvTarget = rng.sign() * rng.range(0.015, 0.025);
        this.curvLeft = rng.range(30, 50);
      } else {
        this.curvTarget = rng.range(-cfg.amp, cfg.amp);
      }
    }
    let target = this.curvTarget;
    const off = this.h - this.base;
    if (off > 0.75) target = -Math.abs(target) - 0.004;
    if (off < -0.75) target = Math.abs(target) + 0.004;
    if (d < this.straightUntil && d > this.straightUntil - 120) target = 0;
    const slew = d < this.straightUntil ? 0.004 : 0.0012;
    this.curv += Math.max(-slew, Math.min(slew, target - this.curv));

    const p = { x: this.x, y, z: this.z, h: this.h, w: this.w, surf, d, r: region.index, type, cross };
    this.pts.push(p);

    this.h += this.curv * STEP;
    this.x += Math.sin(this.h) * STEP;
    this.z += Math.cos(this.h) * STEP;
  }

  // Interpolated sample at fractional index s, optionally offset sideways.
  sample(s, lat = 0, out = {}) {
    s = Math.max(0, s);
    const i = Math.floor(s);
    this.ensure(i + 1);
    const a = this.pts[i];
    const b = this.pts[i + 1];
    const t = s - i;
    const h = a.h + (b.h - a.h) * t;
    out.h = h;
    out.x = a.x + (b.x - a.x) * t - Math.cos(h) * lat;
    out.z = a.z + (b.z - a.z) * t + Math.sin(h) * lat;
    out.y = a.y + (b.y - a.y) * t;
    out.w = a.w + (b.w - a.w) * t;
    out.surf = t < 0.5 ? a.surf : b.surf;
    return out;
  }

  // Closest point on the path to (x, z), searched around a hint index.
  nearest(x, z, hint = 0, span = 40) {
    let best = null;
    let bestD = Infinity;
    const lo = Math.max(0, Math.floor(hint) - span);
    const hi = Math.floor(hint) + span;
    this.ensure(hi + 1);
    for (let i = lo; i < hi; i++) {
      const a = this.pts[i];
      const b = this.pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      let t = ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz);
      t = Math.max(0, Math.min(1, t));
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const dd = (x - px) ** 2 + (z - pz) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = { i, t, s: i + t, px, pz };
      }
    }
    if (bestD > 60 * 60 && span < 1000) {
      return this.nearest(x, z, hint, span * 4);
    }
    const a = this.pts[best.i];
    const b = this.pts[best.i + 1];
    const h = a.h + (b.h - a.h) * best.t;
    best.dist = Math.sqrt(bestD);
    best.lat = (x - best.px) * -Math.cos(h) + (z - best.pz) * Math.sin(h);
    best.h = h;
    best.y = a.y + (b.y - a.y) * best.t;
    best.w = a.w + (b.w - a.w) * best.t;
    best.surf = a.surf;
    best.p = a;
    return best;
  }

  // Minimum distance from (x, z) to the path's edge across a range of indices.
  clearance(x, z, i0, i1) {
    let m = Infinity;
    const lo = Math.max(0, i0);
    this.ensure(i1);
    for (let i = lo; i <= i1; i += 2) {
      const p = this.pts[i];
      const dd = Math.hypot(x - p.x, z - p.z) - p.w / 2;
      if (dd < m) m = dd;
    }
    return m;
  }
}
