import * as THREE from '../vendor/three.module.min.js';
import { RNG, hash } from './rng.js';

// Florida summer weather: most afternoons a thunderstorm builds over the
// interior, rolls in, rains hard for half an hour or so, and moves off, often
// leaving broken cloud behind for a spectacular sunset.
//
//   storm  0..1  how dark and overcast it is
//   rain   0..1  how hard it's raining
//   wet    0..1  how wet the pavement still is
//   flash  0..1  lightning, this frame
const BUILD = 1.0; // hours from first towers to the first drops
const TAPER = 0.3; // rain easing off
const CLEAR = 0.9; // overcast breaking up

export class Weather {
  constructor(scene, seed) {
    this.scene = scene;
    this.seed = seed;
    this.storm = 0;
    this.rain = 0;
    this.wet = 0;
    this.flash = 0;
    this.after = 0; // a storm has passed this afternoon (for the clearing sky)
    this.override = null;
    this.nextBolt = 0;
    this.bolts = [];
    this.thunder = [];
    this.lastClock = null;

    // rain: thin streaks in a box that follows the camera
    const N = 4500;
    this.N = N;
    const pos = new Float32Array(N * 6);
    const rng = new RNG(seed ^ 0x7a1);
    this.drops = [];
    for (let i = 0; i < N; i++) this.drops.push([rng.range(-35, 35), rng.range(0, 26), rng.range(-35, 35), rng.range(0.8, 1.2)]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainMat = new THREE.LineBasicMaterial({ color: 0xb8c4d0, transparent: true, opacity: 0, depthWrite: false });
    this.rainMesh = new THREE.LineSegments(g, this.rainMat);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    scene.add(this.rainMesh);

    // lightning bolts: a jagged line from the cloud base to the ground
    this.boltMat = new THREE.LineBasicMaterial({ color: 0xf4f0ff, transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending });
    this.boltGeo = new THREE.BufferGeometry();
    this.boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 2 * 60), 3));
    this.boltMesh = new THREE.LineSegments(this.boltGeo, this.boltMat);
    this.boltMesh.frustumCulled = false;
    scene.add(this.boltMesh);
    this.boltLife = 0;
    this.rng = rng;
  }

  // The storm planned for a given day, or null for a dry day.
  plan(day) {
    const r = new RNG(hash(this.seed, day, 4111));
    // two days out of three; the first afternoon almost always
    if (!r.chance(day === 0 ? 0.85 : 0.65)) return null;
    const start = day * 24 + r.range(13.6, 16.4);
    return { start, rainStart: start + BUILD, rainEnd: start + BUILD + r.range(0.4, 1.0), dir: r.range(0, Math.PI * 2), power: r.range(0.75, 1.0) };
  }

  current(clock) {
    const o = this.override;
    if (o && clock < o.rainEnd + TAPER + CLEAR) return o;
    const day = Math.floor(clock / 24);
    return this.plan(day);
  }

  // R: call in a storm now, or send the current one on its way.
  toggle(clock) {
    const s = this.current(clock);
    if (s && clock > s.start && clock < s.rainEnd) {
      this.override = { ...s, rainEnd: clock };
      return false;
    }
    const start = clock - BUILD * 0.6;
    this.override = { start, rainStart: start + BUILD, rainEnd: start + BUILD + 0.7, dir: this.rng.range(0, 6.28), power: 1 };
    return true;
  }

  // Where the active storm cell sits, for the sky's thunderhead: approaching,
  // overhead, then moving off the other way.
  cell(clock) {
    const s = this.current(clock);
    if (!s || clock < s.start - 1.5) return null;
    const ss = THREE.MathUtils.smoothstep;
    if (clock < s.rainStart) return { dir: s.dir, dist: 1150 - 650 * ss(clock, s.start - 1.5, s.rainStart), hide: ss(clock, s.rainStart - 0.25, s.rainStart) };
    if (clock < s.rainEnd + TAPER) return { dir: s.dir, dist: 500, hide: 1 };
    return { dir: s.dir + Math.PI, dist: 450 + 800 * ss(clock, s.rainEnd + TAPER, s.rainEnd + TAPER + 3.5), hide: 1 - ss(clock, s.rainEnd + TAPER, s.rainEnd + TAPER + 0.4) };
  }

  update(dt, clock, cam, sound) {
    const ss = THREE.MathUtils.smoothstep;
    const s = this.current(clock);
    let storm = 0, rain = 0, after = 0;
    if (s) {
      storm = ss(clock, s.start, s.rainStart) * (1 - ss(clock, s.rainEnd, s.rainEnd + TAPER + CLEAR)) * s.power;
      const peak = s.rainStart + (s.rainEnd - s.rainStart) * 0.35;
      rain = ss(clock, s.rainStart - 0.05, s.rainStart + 0.12) * (1 - ss(clock, s.rainEnd - 0.05, s.rainEnd + TAPER));
      rain *= 0.65 + 0.35 * Math.exp(-(((clock - peak) / 0.35) ** 2));
      after = ss(clock, s.rainEnd, s.rainEnd + TAPER + CLEAR) * (1 - ss(clock, s.start + 9, s.start + 11));
    }
    this.storm = storm;
    this.rain = rain;
    this.after = after;
    // pavement soaks quickly, then dries over an hour or two in the sun
    const gh = this.lastClock === null ? 0 : Math.max(0, Math.min(1, clock - this.lastClock));
    this.lastClock = clock;
    this.wet = rain > 0.05 ? Math.min(1, this.wet + gh * 6 * rain) : Math.max(0, this.wet - gh * 0.6);

    // lightning: often in the heart of the storm, now and then while it builds
    this.flash = Math.max(0, this.flash - dt * 6);
    this.boltLife -= dt;
    this.boltMat.opacity = this.boltLife > 0 ? (Math.random() < 0.8 ? 0.95 : 0.2) : 0;
    const t = performance.now() / 1000;
    if (storm > 0.45 && t > this.nextBolt) {
      const rate = 0.05 + 0.25 * rain * storm; // strikes per second
      this.nextBolt = t + (-Math.log(1 - Math.random()) / rate);
      if (this.nextBolt - t < 0.8) this.nextBolt = t + 0.8;
      this.strike(cam, s, sound);
    }
    for (let k = this.thunder.length - 1; k >= 0; k--) {
      const th = this.thunder[k];
      if (t >= th.at) {
        sound?.thunder(th.power);
        this.thunder.splice(k, 1);
      }
    }

    // rain streaks
    const show = rain > 0.01;
    this.rainMesh.visible = show;
    if (show) {
      const p = cam.getWorldPosition(this._p || (this._p = new THREE.Vector3()));
      this.rainMat.opacity = 0.18 + 0.35 * rain;
      const arr = this.rainMesh.geometry.attributes.position.array;
      const n = Math.floor(this.N * Math.min(1, rain * 1.2));
      const fall = 16 * dt;
      const wx = 1.6, wz = 0.7; // wind slant
      for (let i = 0; i < n; i++) {
        const d = this.drops[i];
        d[1] -= fall * d[3];
        if (d[1] < 0) d[1] += 26;
        // wrap the box around the camera
        const x = ((((d[0] - p.x) % 70) + 105) % 70) - 35 + p.x;
        const z = ((((d[2] - p.z) % 70) + 105) % 70) - 35 + p.z;
        const y = p.y - 6 + d[1];
        const o = i * 6;
        arr[o] = x;
        arr[o + 1] = y;
        arr[o + 2] = z;
        arr[o + 3] = x + wx * 0.06;
        arr[o + 4] = y - 0.55 * d[3];
        arr[o + 5] = z + wz * 0.06;
      }
      this.rainMesh.geometry.setDrawRange(0, n * 2);
      this.rainMesh.geometry.attributes.position.needsUpdate = true;
    }
  }

  strike(cam, s, sound) {
    const p = cam.getWorldPosition(this._p || (this._p = new THREE.Vector3()));
    const close = this.rain > 0.3 && Math.random() < 0.35;
    const dist = close ? 120 + Math.random() * 250 : 350 + Math.random() * 600;
    const a = (s ? s.dir : 0) + (Math.random() - 0.5) * (close ? Math.PI * 2 : 1.4);
    const gx = p.x + Math.cos(a) * dist, gz = p.z + Math.sin(a) * dist;
    // a jagged channel with a fork or two
    const arr = this.boltGeo.attributes.position.array;
    let n = 0;
    const seg = (x0, y0, z0, steps, spread) => {
      let x = x0, y = y0, z = z0;
      for (let k = 0; k < steps && n < 60; k++) {
        const nx = x + (Math.random() - 0.5) * spread, ny = y - y0 / steps, nz = z + (Math.random() - 0.5) * spread;
        arr.set([x, y, z, nx, Math.max(0, ny), nz], n * 6);
        n++;
        x = nx;
        y = ny;
        z = nz;
        if (k === 5 && n < 44) seg(x, y, z, 6, spread * 0.8);
      }
    };
    seg(gx, 330, gz, 18, 26);
    this.boltGeo.setDrawRange(0, n * 2);
    this.boltGeo.attributes.position.needsUpdate = true;
    this.boltLife = 0.14 + Math.random() * 0.12;
    this.flash = Math.min(1, (close ? 1 : 0.45) * (0.6 + Math.random() * 0.4));
    // sound travels about a kilometre every three seconds
    this.thunder.push({ at: performance.now() / 1000 + dist / 340, power: Math.min(1, 220 / dist) });
  }
}
