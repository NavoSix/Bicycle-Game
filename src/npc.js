import * as THREE from '../vendor/three.module.min.js';
import { RNG } from './rng.js';
import { STEP } from './path.js';

const SKIN = [0xf1c8a8, 0xd9a882, 0xb07a55, 0x8a5a3a, 0x5e3d28];
const SHIRT = [0xd23b3b, 0x2f6fb5, 0xf0f0f0, 0x2a2a2a, 0xf2c230, 0x3aa065, 0xe86fa0, 0x6a4aa0, 0xff8a2a, 0x57c4d8];
const PANTS = [0x23262e, 0x3a4a6a, 0x5a4a3a, 0x1c1c1c, 0x8a8a8a];
const CARC = [0xf4f4f4, 0x1c1c1c, 0x8a9096, 0xb8bcc0, 0x7c1a1a, 0x1f3a64, 0x2f4f3f, 0xc9b38a, 0x3a5f8f, 0xa83232];

const box = new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0);
const boxC = new THREE.BoxGeometry(1, 1, 1);
const ball = new THREE.IcosahedronGeometry(1, 1);
const torus = new THREE.TorusGeometry(0.33, 0.025, 5, 20).rotateY(Math.PI / 2);
const wheelG = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12).rotateZ(Math.PI / 2);
const matCache = new Map();
const mat = (c) => {
  if (!matCache.has(c)) matCache.set(c, new THREE.MeshLambertMaterial({ color: c }));
  return matCache.get(c);
};

function part(geo, color, sx, sy, sz, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat(color));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function person(rng, seated) {
  const g = new THREE.Group();
  const skin = rng.pick(SKIN);
  const shirt = rng.pick(SHIRT);
  const pants = rng.pick(PANTS);
  const hipY = seated ? 1.0 : 0.95;
  const legs = [];
  for (const sx of [-0.1, 0.1]) {
    const hip = new THREE.Group();
    hip.position.set(sx, hipY, 0);
    g.add(hip);
    part(box, pants, 0.13, 0.48, 0.14, 0, 0, 0, hip);
    const knee = new THREE.Group();
    knee.position.set(0, -0.46, 0);
    hip.add(knee);
    part(box, skin, 0.1, 0.46, 0.1, 0, 0, 0, knee);
    part(boxC, 0xeeeeee, 0.11, 0.07, 0.24, 0, -0.47, 0.05, knee);
    legs.push({ hip, knee });
  }
  const torso = new THREE.Group();
  torso.position.set(0, hipY, 0);
  g.add(torso);
  part(boxC, shirt, 0.38, 0.56, 0.22, 0, 0.3, 0, torso);
  part(ball, skin, 0.11, 0.13, 0.12, 0, 0.7, 0, torso);
  if (rng.chance(0.6)) part(ball, rng.pick([0x1a1a1a, 0x5a3a20, 0xc8a050, 0x8a8a8a]), 0.12, 0.08, 0.125, 0, 0.77, -0.01, torso);
  const arms = [];
  for (const sx of [-0.24, 0.24]) {
    const sh = new THREE.Group();
    sh.position.set(sx, 0.55, 0);
    torso.add(sh);
    part(box, shirt, 0.1, 0.25, 0.1, 0, 0, 0, sh);
    part(box, skin, 0.08, 0.32, 0.08, 0, -0.24, 0, sh);
    arms.push(sh);
  }
  return { g, legs, torso, arms };
}

function cyclistModel(rng) {
  const g = new THREE.Group();
  const frame = rng.pick(SHIRT);
  const p = person(rng, true);
  p.torso.rotation.x = 0.5;
  p.torso.position.z = -0.25;
  p.legs.forEach((l) => (l.hip.position.z = -0.25));
  g.add(p.g);
  for (const z of [-0.55, 0.5]) {
    const w = new THREE.Mesh(torus, mat(0x1b1b1b));
    w.position.set(0, 0.34, z);
    g.add(w);
  }
  part(boxC, frame, 0.04, 0.04, 1.0, 0, 0.62, -0.02, g).rotation.x = 0.25;
  part(boxC, frame, 0.04, 0.6, 0.04, 0, 0.62, 0.45, g);
  part(boxC, 0x999999, 0.55, 0.03, 0.03, 0, 1.0, 0.4, g);
  for (const a of p.arms) a.rotation.x = -1.1;
  if (rng.chance(0.8)) part(ball, rng.pick([0xf0f0f0, 0x1a1a1a, 0xd23b3b, 0x2f6fb5]), 0.14, 0.09, 0.17, 0, 0.82, -0.02, p.torso); // helmet
  return { g, p };
}

function carModel(rng) {
  const g = new THREE.Group();
  const c = rng.pick(CARC);
  const suv = rng.chance(0.35);
  const len = suv ? 4.8 : 4.5;
  part(boxC, c, 1.85, 0.7, len, 0, 0.7, 0, g);
  part(boxC, c, 1.75, suv ? 0.7 : 0.58, suv ? 2.9 : 2.3, 0, suv ? 1.38 : 1.32, -0.2, g);
  const glass = new THREE.MeshPhongMaterial({ color: 0x1f2a33, shininess: 90, specular: 0x88aacc });
  const gm = new THREE.Mesh(boxC, glass);
  gm.scale.set(1.78, suv ? 0.5 : 0.42, suv ? 2.8 : 2.2);
  gm.position.set(0, suv ? 1.4 : 1.34, -0.2);
  g.add(gm);
  for (const [x, z] of [[0.82, len / 2 - 0.85], [-0.82, len / 2 - 0.85], [0.82, -len / 2 + 0.85], [-0.82, -len / 2 + 0.85]]) {
    const w = new THREE.Mesh(wheelG, mat(0x151515));
    w.position.set(x, 0.33, z);
    g.add(w);
  }
  const head = new THREE.MeshBasicMaterial({ color: 0xdddddd });
  const tail = new THREE.MeshBasicMaterial({ color: 0x661111 });
  for (const x of [-0.65, 0.65]) {
    const h = new THREE.Mesh(boxC, head);
    h.scale.set(0.35, 0.14, 0.05);
    h.position.set(x, 0.85, len / 2 + 0.01);
    g.add(h);
    const t = new THREE.Mesh(boxC, tail);
    t.scale.set(0.35, 0.14, 0.05);
    t.position.set(x, 0.85, -len / 2 - 0.01);
    g.add(t);
  }
  g.children[0].castShadow = true;
  g.userData = { head, tail };
  return g;
}

export class NPCs {
  constructor(scene, path, seed) {
    this.scene = scene;
    this.path = path;
    this.rng = new RNG(seed ^ 0xbeef);
    this.users = [];
    this.cars = [];
    this.crossCars = [];
    this.timer = 3;
    this.carTimer = 2;
    this.tmp = {};
  }

  remove(e) {
    this.scene.remove(e.g);
  }

  spawnUser(bike) {
    const rng = this.rng;
    const r = rng.next();
    let kind, speed, lat, ds;
    if (r < 0.45) [kind, speed, lat, ds] = ['cyclist', -rng.range(4.5, 7), -rng.range(0.7, 1.0), rng.range(140, 220)];
    else if (r < 0.68) [kind, speed, lat, ds] = ['jogger', -rng.range(2.4, 3.2), -rng.range(0.8, 1.2), rng.range(110, 160)];
    else if (r < 0.82) [kind, speed, lat, ds] = ['walker', -rng.range(1.2, 1.6), -rng.range(0.9, 1.3), rng.range(90, 140)];
    else [kind, speed, lat, ds] = ['walker', rng.range(1.1, 1.5), rng.range(1.0, 1.3), rng.range(60, 140)];
    const s = bike.s + ds / STEP;
    this.path.ensure(Math.ceil(s) + 2);
    const p = this.path.pts[Math.floor(s)];
    if (p.surf === 'road' || p.type === 'street') return;
    const e = { kind, speed, lat, s, phase: rng.range(0, 6), wave: 0 };
    if (kind === 'cyclist') {
      const m = cyclistModel(rng);
      e.g = m.g;
      e.p = m.p;
    } else {
      const m = person(rng, false);
      e.g = m.g;
      e.p = m;
      if (kind === 'walker' && rng.chance(0.35)) {
        // a dog on a leash
        const dog = new THREE.Group();
        const dc = rng.pick([0x8a5a2a, 0x1a1a1a, 0xe8d8b0, 0x6a4a30]);
        part(boxC, dc, 0.22, 0.22, 0.6, 0, 0.42, 0, dog);
        part(boxC, dc, 0.18, 0.18, 0.22, 0, 0.6, 0.36, dog);
        for (const [x, z] of [[0.08, 0.22], [-0.08, 0.22], [0.08, -0.22], [-0.08, -0.22]]) part(box, dc, 0.06, 0.32, 0.06, x, 0.32, z, dog);
        dog.position.set(0.55, 0, 0.9);
        e.g.add(dog);
        e.dog = dog;
      }
    }
    this.scene.add(e.g);
    this.users.push(e);
  }

  spawnPathCar(bike, region) {
    const rng = this.rng;
    let lat, speed, ds;
    if (region === 'street') {
      [lat, speed, ds] = [-1.9, -rng.range(8, 11), rng.range(120, 200)];
    } else {
      const lane = rng.int(0, 3);
      lat = [-7.4, -10.2, -13.3, -16.1][lane];
      speed = lane < 2 ? rng.range(13, 18) : -rng.range(13, 18);
      ds = speed > 0 ? -rng.range(80, 200) : rng.range(120, 260);
      if (rng.chance(0.5) && speed > 0) ds = rng.range(80, 220); // already ahead, driving away
    }
    const s = Math.max(0, bike.s + ds / STEP);
    this.path.ensure(Math.ceil(s) + 2);
    if (this.path.pts[Math.floor(s)].type !== region) return;
    // keep some spacing between cars in a lane
    for (const c of this.cars) if (Math.abs(c.lat - lat) < 0.5 && Math.abs(c.s - s) * STEP < 25) return;
    const g = carModel(rng);
    this.scene.add(g);
    this.cars.push({ g, s, lat, speed, cruise: speed, region });
  }

  update(dt, bike, env) {
    const path = this.path;
    const rng = this.rng;
    const here = path.pts[Math.floor(bike.s)];
    const near = bike.near;
    const bikeLat = near ? near.lat : 0;
    let closest = Infinity;
    let closestV = 0;

    // ---- trail users ------------------------------------------------------
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = rng.range(5, 16);
      if (this.users.length < 6 && here.type !== 'street') this.spawnUser(bike);
    }
    const tmp = this.tmp;
    for (let k = this.users.length - 1; k >= 0; k--) {
      const e = this.users[k];
      e.s += (e.speed * dt) / STEP;
      const rel = (e.s - bike.s) * STEP;
      // step aside if we're about to meet
      const meet = e.speed < 0 ? rel > 0 && rel < 14 : rel > -3 && rel < 10;
      if (meet && Math.abs(e.lat - bikeLat) < 1.2) {
        const away = e.lat >= bikeLat ? 1 : -1;
        e.lat += away * dt * 1.2;
        e.lat = Math.max(-2.1, Math.min(2.1, e.lat));
      }
      path.sample(e.s, e.lat, tmp);
      e.g.position.set(tmp.x, tmp.y, tmp.z);
      e.g.rotation.y = tmp.h + (e.speed < 0 ? Math.PI : 0);
      e.phase += dt * Math.abs(e.speed) * (e.kind === 'cyclist' ? 1.1 : 2.6);
      const P = e.p;
      if (e.kind === 'cyclist') {
        P.legs.forEach((l, i) => {
          const ph = e.phase + i * Math.PI;
          l.hip.rotation.x = -1.2 + Math.sin(ph) * 0.45;
          l.knee.rotation.x = 1.3 + Math.cos(ph) * 0.4;
        });
      } else {
        const amp = e.kind === 'jogger' ? 0.75 : 0.45;
        P.legs.forEach((l, i) => {
          const ph = e.phase + i * Math.PI;
          l.hip.rotation.x = Math.sin(ph) * amp;
          l.knee.rotation.x = Math.max(0, -Math.cos(ph)) * amp * 1.3;
        });
        P.arms.forEach((a, i) => (a.rotation.x = -Math.sin(e.phase + i * Math.PI) * amp * 0.8 - (e.kind === 'jogger' ? 0.6 : 0)));
        P.torso.rotation.x = e.kind === 'jogger' ? 0.12 : 0;
        e.g.position.y += Math.abs(Math.sin(e.phase)) * (e.kind === 'jogger' ? 0.06 : 0.02);
        if (e.dog) e.dog.children.slice(2).forEach((l, i) => (l.rotation.x = Math.sin(e.phase * 1.6 + i * 1.6) * 0.5));
      }
      // the trail wave
      if (e.speed < 0 && rel > 2 && rel < 16 && bike.v > 1) e.wave = Math.min(1, e.wave + dt * 3);
      else e.wave = Math.max(0, e.wave - dt * 2);
      if (e.wave > 0) {
        const arm = P.arms[0];
        arm.rotation.x = arm.rotation.x * (1 - e.wave) + -2.6 * e.wave;
        arm.rotation.z = -0.3 * e.wave;
      }
      if (rel < -50 || rel > 320 || path.pts[Math.floor(e.s)]?.type === 'street') {
        this.remove(e);
        this.users.splice(k, 1);
      }
    }

    // ---- cars along the path (street + town road) -------------------------
    this.carTimer -= dt;
    if (this.carTimer <= 0) {
      if (here.type === 'town') {
        this.carTimer = rng.range(1.2, 3.5);
        if (this.cars.length < 14) this.spawnPathCar(bike, 'town');
      } else if (here.type === 'street') {
        this.carTimer = rng.range(10, 25);
        if (this.cars.length < 3) this.spawnPathCar(bike, 'street');
      } else this.carTimer = 2;
    }
    const night = env.night || 0;
    for (let k = this.cars.length - 1; k >= 0; k--) {
      const c = this.cars[k];
      const sg = Math.sign(c.cruise);
      const ahead = (bike.s - c.s) * STEP * sg;
      let want = Math.abs(c.cruise);
      if (ahead > -2 && ahead < 22 && Math.abs(bikeLat - c.lat) < 2.0) want = 0; // don't run the cyclist over
      for (const o of this.cars) {
        if (o === c || Math.abs(o.lat - c.lat) > 0.5) continue;
        const gap = (o.s - c.s) * STEP * sg;
        if (gap > 0 && gap < 16) want = Math.min(want, Math.abs(o.speed) * (gap < 8 ? 0.5 : 1));
      }
      const mag = Math.abs(c.speed);
      c.speed = sg * Math.max(0, mag + Math.max(-8 * dt, Math.min(3 * dt, want - mag)));
      c.s += (c.speed * dt) / STEP;
      path.sample(c.s, c.lat, tmp);
      c.g.position.set(tmp.x, 0.02, tmp.z);
      c.g.rotation.y = tmp.h + (c.cruise < 0 ? Math.PI : 0);
      c.g.userData.head.color.setScalar(0.85 + night * 0.15);
      c.g.userData.tail.color.setRGB(0.4 + night * 0.6, 0.05, 0.05);
      const d = Math.hypot(tmp.x - bike.x, tmp.z - bike.z);
      if (d < closest) {
        closest = d;
        closestV = Math.abs(c.speed);
      }
      const t = path.pts[Math.floor(c.s)]?.type;
      if (Math.abs(c.s - bike.s) * STEP > 340 || (t !== c.region && Math.abs(c.s - bike.s) * STEP > 60)) {
        this.scene.remove(c.g);
        this.cars.splice(k, 1);
      }
    }

    // ---- cars on crossing roads --------------------------------------------
    for (const cr of path.crossings) {
      const rel = (cr.i - bike.s) * STEP;
      if (rel < -150 || rel > 260) continue;
      cr.timer = (cr.timer ?? rng.range(0, 4)) - dt;
      if (cr.timer <= 0 && this.crossCars.length < 8) {
        cr.timer = rng.range(4, 12);
        const dir = rng.sign();
        const g = carModel(rng);
        this.scene.add(g);
        this.crossCars.push({ g, cr, dir, u: -dir * 130, v: rng.range(12, 17), cruise: 0 });
      }
    }
    for (let k = this.crossCars.length - 1; k >= 0; k--) {
      const c = this.crossCars[k];
      if (!c.cruise) c.cruise = c.v;
      const cr = c.cr;
      const rel = (cr.i - bike.s) * STEP;
      const playerNear = rel > -4 && rel < 30 && Math.abs(bikeLat) < 30;
      const toLine = -c.dir * c.u - 7.5; // metres until the stop point
      let want = c.cruise;
      if (playerNear && toLine > -1 && toLine < 40) want = Math.max(0, Math.min(c.cruise, toLine * 0.9));
      c.v += Math.max(-9 * dt, Math.min(3 * dt, want - c.v));
      c.u += c.dir * c.v * dt;
      const rx = -Math.cos(cr.h), rz = Math.sin(cr.h);
      const fx = Math.sin(cr.h), fz = Math.cos(cr.h);
      const lane = -c.dir * 1.9;
      const x = cr.x + rx * c.u + fx * lane;
      const z = cr.z + rz * c.u + fz * lane;
      c.g.position.set(x, 0.06, z);
      c.g.rotation.y = cr.h + (c.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      c.g.userData.head.color.setScalar(0.85 + night * 0.15);
      c.g.userData.tail.color.setRGB(0.4 + night * 0.6, 0.05, 0.05);
      const d = Math.hypot(x - bike.x, z - bike.z);
      if (d < closest) {
        closest = d;
        closestV = c.v;
      }
      if (Math.abs(c.u) > 135 || rel < -170 || rel > 300) {
        this.scene.remove(c.g);
        this.crossCars.splice(k, 1);
      }
    }
    return { carDist: closest, carSpeed: closestV };
  }

  // cruise control asks where to ride: hug the right, swing left to pass walkers
  laneOffset(s, lane) {
    for (const e of this.users) {
      const rel = (e.s - s) * STEP;
      if (e.speed > 0 && rel > -3 && rel < 14 && e.lat > 0) return Math.min(lane, e.lat - 1.3);
      if (e.speed < 0 && rel > 0 && rel < 25 && e.lat > -0.3) return Math.max(lane, e.lat + 1.3);
    }
    return lane;
  }
}
