import * as THREE from '../vendor/three.module.min.js';

// On foot: step off the bike to wander a place of interest, climb a tower,
// walk out on a dock, read the signs, then walk back and ride on.
const RADIUS = 0.28;
const EYE = 1.62;
const STEP_UP = 0.55;

export class Walker {
  constructor(scene, camera, path, world) {
    this.camera = camera;
    this.path = path;
    this.world = world;
    this.head = new THREE.Object3D();
    this.head.rotation.order = 'YXZ';
    scene.add(this.head);
    this.active = false;
    this.x = this.z = this.y = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.s = 0;
    this.v = 0;
    this.vx = this.vz = 0;
    this.vy = 0;
    this.stride = 0;
    this.bob = 0;
    this.near = null;
    this.surface = 'grass';
  }

  begin(bike) {
    // step off on the right of the bike
    const rx = -Math.cos(bike.h), rz = Math.sin(bike.h);
    this.x = bike.x + rx * 0.85;
    this.z = bike.z + rz * 0.85;
    this.y = bike.y;
    this.yaw = bike.h + bike.yaw;
    this.pitch = Math.max(-0.5, bike.pitch);
    this.s = bike.s;
    this.vx = this.vz = this.vy = 0;
    this.active = true;
    this.head.add(this.camera);
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
    this.place();
  }

  end(bike) {
    this.active = false;
    bike.root.add(this.camera);
  }

  place() {
    this.head.position.set(this.x, this.y + EYE + Math.abs(Math.sin(this.bob)) * 0.035, this.z);
    this.head.rotation.set(this.pitch, this.yaw + Math.PI, Math.sin(this.bob) * 0.006);
  }

  // Where the ground (or deck, or trail) is under you, no more than a step up.
  groundAt(x, z, y) {
    let g = 0;
    let surf = 'grass';
    const n = this.path.nearest(x, z, this.s, 30);
    if (Math.abs(n.lat) < n.w / 2 + 0.05 && n.y <= y + STEP_UP) {
      g = n.y;
      surf = n.surf;
    }
    const d = this.world.deckHeight(x, z, y);
    if (d !== null && d >= g - 0.01) {
      g = d;
      surf = 'board';
    }
    return { g, surf, n };
  }

  // May you stand at (x, z)?
  free(x, z, y) {
    if (this.world.blocked(x, z, y, true)) return false;
    // stay inside the world: within the backdrop walls, or inside a place of interest
    const n = this.path.nearest(x, z, this.s, 30);
    const inPoi = this.world.pois().some((d) => {
      const dd = (x - d.cx) ** 2 + (z - d.cz) ** 2;
      return dd < (d.Rv - 1.5) ** 2 && Math.sign(n.lat) === d.poi.side;
    });
    if (!inPoi && Math.abs(n.lat) > this.world.limit(n)) return false;
    // you can't walk off a raised boardwalk or bridge into thin air
    if ((n.surf === 'board' || n.surf === 'bridge') && n.p.y > 0.3 && y > 0.3 && Math.abs(n.lat) > n.w / 2 - 0.3 && Math.abs(n.lat) < n.w / 2 + 2) return false;
    for (const list of this.world.colliders(Math.floor(n.s / 100))) {
      for (const c of list) {
        if (c.bike) continue; // bike-only barriers at boardwalk entrances
        if (c.y0 !== undefined && (y + 1.6 < c.y0 || y > c.y1)) continue;
        const dx = x - c.x, dz = z - c.z;
        if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue;
        if (c.t === 'c') {
          if (dx * dx + dz * dz < (c.r + RADIUS) ** 2) return false;
        } else {
          const lx = c.c * dx - c.s * dz, lz = c.s * dx + c.c * dz;
          if (Math.abs(lx) < c.hw + RADIUS && Math.abs(lz) < c.hd + RADIUS) return false;
        }
      }
    }
    return true;
  }

  update(dt, inp, env) {
    // look
    this.yaw -= inp.lookX * 0.0022 + (inp.turn || 0) * 1.9 * dt;
    this.pitch = Math.max(-1.3, Math.min(1.2, this.pitch - inp.lookY * 0.0022));
    // move relative to where you're facing
    const fwd = Math.max(-1, Math.min(1, inp.throttle - inp.brake + (inp.moveY || 0)));
    const side = Math.max(-1, Math.min(1, inp.strafe || 0));
    const run = inp.sprint || Math.hypot(fwd, side) > 1.25;
    const speed = run ? 3.6 : 1.55;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    let mag = Math.hypot(fwd, side);
    const k = mag > 1 ? 1 / mag : 1;
    const tx = (fx * fwd + rx * side) * k * speed;
    const tz = (fz * fwd + rz * side) * k * speed;
    const a = Math.min(1, dt * 9);
    this.vx += (tx - this.vx) * a;
    this.vz += (tz - this.vz) * a;
    // slide along whatever you bump into
    const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    if (this.free(nx, nz, this.y)) {
      this.x = nx;
      this.z = nz;
    } else if (this.free(nx, this.z, this.y)) {
      this.x = nx;
      this.vz *= 0.5;
    } else if (this.free(this.x, nz, this.y)) {
      this.z = nz;
      this.vx *= 0.5;
    } else {
      this.vx *= 0.2;
      this.vz *= 0.2;
    }
    // height: climb stairs smoothly, fall off ledges with gravity
    const { g, surf, n } = this.groundAt(this.x, this.z, this.y);
    this.near = n;
    this.s = n.s;
    this.surface = surf;
    if (g >= this.y) {
      this.y += (g - this.y) * Math.min(1, dt * 14);
      this.vy = 0;
    } else {
      this.vy -= 9.8 * dt;
      this.y = Math.max(g, this.y + this.vy * dt);
      if (this.y === g) this.vy = 0;
    }
    this.v = Math.hypot(this.vx, this.vz);
    if (this.v > 0.2) {
      this.bob += this.v * dt * (Math.PI / 0.75);
      this.stride += this.v * dt;
      if (this.stride > (run ? 1.0 : 0.72)) {
        this.stride = 0;
        env.step?.(surf, run);
      }
    }
    this.place();
  }
}
