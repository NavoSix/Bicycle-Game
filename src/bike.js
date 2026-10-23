import * as THREE from '../vendor/three.module.min.js';
import { STEP } from './path.js';

const MASS = 85;
const G = 9.81;
const WHEELBASE = 1.05;
const CRR = { trail: 0.005, road: 0.0048, board: 0.009, grass: 0.032 };
const RADIUS = 0.4;
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();

const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

function limb(mesh, a, b) {
  _d.subVectors(b, a);
  const len = _d.length();
  mesh.position.copy(a).addScaledVector(_d, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, _d.normalize());
  mesh.scale.set(1, len, 1);
}

export class Bike {
  constructor(scene, camera, path, world) {
    this.path = path;
    this.world = world;
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    scene.add(this.root);
    this.root.add(camera);
    camera.rotation.order = 'YXZ';

    this.x = 0;
    this.z = 0;
    this.y = 0.05;
    this.h = 0;
    this.v = 0;
    this.steer = 0;
    this.steerIn = 0;
    this.lean = 0;
    this.yaw = 0;
    this.pitch = -0.14;
    this.s = 0;
    this.dist = 0;
    this.phase = 0;
    this.wheel = 0;
    this.cruise = false;
    this.bump = 0;
    this.pedal = 0;
    this.rideTime = 0;
    this.surface = 'road';
    this.buildModel();
  }

  reset(pose) {
    this.x = pose.x;
    this.z = pose.z;
    this.h = pose.h;
    this.v = 0;
    this.s = this.path.nearest(this.x, this.z, 0, 60).s;
  }

  buildModel() {
    const R = this.root;
    const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
    const frame = lam(0x1f6f7f);
    const black = lam(0x1b1b1b);
    const metal = new THREE.MeshPhongMaterial({ color: 0xb8bcc0, shininess: 80, specular: 0x999999 });
    const skin = lam(0xc89878);
    const shirt = lam(0x3a6ea5);
    const shorts = lam(0x2a2a30);
    const cyl = (r, m) => {
      const g = new THREE.CylinderGeometry(r, r, 1, 10);
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = true;
      return mesh;
    };
    const tube = (a, b, r, m, parent = R) => {
      const mesh = cyl(r, m);
      limb(mesh, new THREE.Vector3(...a), new THREE.Vector3(...b));
      parent.add(mesh);
      return mesh;
    };

    // frame (fixed)
    const head = [0, 0.98, 0.43];
    const seat = [0, 0.93, -0.28];
    const bb = [0, 0.3, -0.02];
    const rear = [0, 0.34, -0.58];
    tube(head, seat, 0.022, frame);
    tube(head, bb, 0.026, frame);
    tube(bb, seat, 0.022, frame);
    tube(bb, rear, 0.015, frame);
    tube(seat, rear, 0.013, frame);
    tube([0, 0.93, -0.28], [0, 1.0, -0.3], 0.014, metal);
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.28), black);
    saddle.position.set(0, 1.03, -0.31);
    saddle.castShadow = true;
    R.add(saddle);
    const rw = this.makeWheel(black, metal);
    rw.position.set(...rear);
    R.add(rw);
    this.rearWheel = rw;

    // steering assembly pivots at the head tube
    const bar = new THREE.Group();
    bar.position.set(...head);
    R.add(bar);
    this.bar = bar;
    tube([0, 0, 0], [0, 0.1, 0.09], 0.02, metal, bar);
    tube([0, 0, 0], [0.05, -0.64, 0.15], 0.014, metal, bar);
    tube([0, 0, 0], [-0.05, -0.64, 0.15], 0.014, metal, bar);
    const hb = cyl(0.012, metal);
    hb.rotation.z = Math.PI / 2;
    hb.scale.y = 0.6;
    hb.position.set(0, 0.1, 0.09);
    bar.add(hb);
    this.grips = [];
    for (const sx of [-1, 1]) {
      const gr = cyl(0.018, black);
      gr.rotation.z = Math.PI / 2;
      gr.scale.y = 0.12;
      gr.position.set(sx * 0.25, 0.1, 0.09);
      bar.add(gr);
      const lev = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.11), black);
      lev.position.set(sx * 0.22, 0.09, 0.15);
      lev.rotation.y = sx * 0.25;
      bar.add(lev);
      // gloved hand on the grip
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.09), lam(0x2b2b2b));
      hand.position.set(sx * 0.25, 0.115, 0.085);
      bar.add(hand);
      this.grips.push(hand);
    }
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), metal);
    bell.position.set(-0.16, 0.115, 0.09);
    bar.add(bell);
    this.bellMesh = bell;
    // cycle computer — the only "HUD" that's always there
    this.cc = document.createElement('canvas');
    this.cc.width = 256;
    this.cc.height = 192;
    this.ccTex = new THREE.CanvasTexture(this.cc);
    this.ccTex.colorSpace = THREE.SRGBColorSpace;
    this.ccTex.anisotropy = 4;
    this.ccTex.center.set(0.5, 0.5);
    this.ccTex.rotation = Math.PI;
    this.ccScreen = new THREE.MeshBasicMaterial({ map: this.ccTex });
    const ccBody = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.018, 0.063), [black, black, this.ccScreen, black, black, black]);
    ccBody.position.set(0, 0.13, 0.075);
    ccBody.rotation.x = -0.7;
    bar.add(ccBody);
    const fw = this.makeWheel(black, metal);
    fw.position.set(0, -0.64, 0.15);
    bar.add(fw);
    this.frontWheel = fw;

    // headlight
    this.lamp = new THREE.SpotLight(0xfff0d8, 0, 70, 0.55, 0.6, 1.2);
    this.lamp.position.set(0, 0.0, 0.12);
    bar.add(this.lamp);
    const tgt = new THREE.Object3D();
    tgt.position.set(0, -0.9, 12);
    bar.add(tgt);
    this.lamp.target = tgt;
    const lampBody = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.05, 10), black);
    lampBody.rotation.x = Math.PI / 2;
    lampBody.position.set(0, 0.06, 0.12);
    bar.add(lampBody);
    this.lampLens = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.019, 12), this.lampLens);
    lens.position.set(0, 0.06, 0.146);
    bar.add(lens);

    // arms: shoulder -> hand
    this.shoulders = [new THREE.Vector3(-0.19, 1.33, -0.14), new THREE.Vector3(0.19, 1.33, -0.14)];
    this.arms = [cyl(0.036, skin), cyl(0.036, skin)];
    this.sleeves = [cyl(0.055, shirt), cyl(0.055, shirt)];
    for (const m of [...this.arms, ...this.sleeves]) R.add(m);

    // legs pedalling
    this.legs = [];
    for (const sx of [-1, 1]) {
      const thigh = cyl(0.06, shorts);
      const shin = cyl(0.045, skin);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.24), lam(0xe8e8e8));
      shoe.castShadow = true;
      R.add(thigh, shin, shoe);
      this.legs.push({ sx, thigh, shin, shoe });
    }
    const crankArm = [];
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.17, 0.03).translate(0, -0.085, 0), metal);
      c.position.set(sx * 0.09, bb[1], bb[2]);
      R.add(c);
      crankArm.push(c);
    }
    this.cranks = crankArm;
    this.bbPos = new THREE.Vector3(...bb);

    // invisible torso + head so the rider throws a full shadow
    const ghost = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.6, 0.22), ghost);
    torso.position.set(0, 1.25, -0.2);
    torso.rotation.x = 0.35;
    torso.castShadow = true;
    const headM = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), ghost);
    headM.position.set(0, 1.62, -0.06);
    headM.castShadow = true;
    R.add(torso, headM);

    this.camBase = new THREE.Vector3(0, 1.55, -0.04);
    this.camera.position.copy(this.camBase);
  }

  makeWheel(tire, metal) {
    const g = new THREE.Group();
    const spin = new THREE.Group();
    g.add(spin);
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.02, 6, 32), tire);
    t.rotation.y = Math.PI / 2;
    t.castShadow = true;
    spin.add(t);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.305, 0.008, 4, 32), metal);
    rim.rotation.y = Math.PI / 2;
    spin.add(rim);
    for (let i = 0; i < 8; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.6, 0.003), metal);
      sp.rotation.x = (i / 8) * Math.PI;
      spin.add(sp);
    }
    g.userData.spin = spin;
    return g;
  }

  update(dt, inp, env) {
    const path = this.path;
    const near = path.nearest(this.x, this.z, this.s);
    this.s = near.s;
    this.near = near;
    const onSurf = Math.abs(near.lat) < near.w / 2 + 0.15;
    const surf = onSurf ? near.surf : 'grass';
    this.surface = surf;

    // --- cruise / autopilot ------------------------------------------------
    for (const e of inp.events) {
      if (e === 'cruise') this.cruise = !this.cruise;
    }
    if (inp.brake > 0.2 && this.cruise) {
      this.cruise = false;
      env.notify?.('Cruise off');
    }
    let throttle = inp.throttle;
    let steerCmd = inp.steer;
    if (this.cruise) {
      let lane = near.surf === 'road' ? 2.2 : near.surf === 'board' ? 0.6 : 0.85;
      if (env.laneOffset) lane = env.laneOffset(this.s, lane);
      const L = 5 + this.v * 1.3;
      const tp = path.sample(this.s + L / STEP, lane);
      const want = Math.atan2(tp.x - this.x, tp.z - this.z);
      const err = wrap(want - this.h);
      if (Math.abs(inp.steer) < 0.05) steerCmd = Math.max(-1, Math.min(1, -err * 2.4));
      const target = env.cruiseSpeed || 6.7;
      const hold = 0.3 * this.v ** 3 + CRR[surf] * MASS * G * this.v;
      const p = Math.max(0, Math.min(320, hold + (target - this.v) * 450));
      throttle = Math.max(throttle, p / 210);
    }

    // --- longitudinal ------------------------------------------------------
    const power = throttle * (inp.sprint ? 400 : 210);
    const drive = power / Math.max(this.v, 1.4);
    const resist = 0.3 * this.v * this.v + (this.v > 0.05 ? CRR[surf] * MASS * G : 0);
    const brake = inp.brake * MASS * 4.5;
    this.v += ((drive - resist - (this.v > 0 ? brake : 0)) / MASS) * dt;
    if (this.v < 0) this.v = 0;
    this.pedal += ((power > 15 ? Math.min(1, power / 200) : 0) - this.pedal) * Math.min(1, dt * 4);

    // --- steering ----------------------------------------------------------
    const maxSteer = 0.6 / (1 + this.v * 0.33);
    const rate = inp.analog || this.cruise ? 8 : 3.2;
    this.steerIn += (steerCmd - this.steerIn) * Math.min(1, dt * rate);
    this.steer = this.steerIn * maxSteer;
    const yawRate = (-this.v * Math.tan(this.steer)) / WHEELBASE;
    this.h += yawRate * dt;
    const nx = this.x + Math.sin(this.h) * this.v * dt;
    const nz = this.z + Math.cos(this.h) * this.v * dt;
    this.x = nx;
    this.z = nz;
    this.dist += this.v * dt;
    if (this.v > 0.3) this.rideTime += dt;

    // --- boardwalk rails ---------------------------------------------------
    const n2 = path.nearest(this.x, this.z, this.s, 8);
    if (n2.surf === 'board' && n2.p.y > 0.3 && Math.abs(n2.lat) > n2.w / 2 - 0.42 && Math.abs(n2.lat) < n2.w / 2 + 1.5) {
      const over = Math.abs(n2.lat) - (n2.w / 2 - 0.42);
      const sgn = Math.sign(n2.lat);
      this.x -= -Math.cos(n2.h) * over * sgn;
      this.z -= Math.sin(n2.h) * over * sgn;
      this.h += wrap(n2.h - this.h) * 0.25;
      this.v *= 0.985;
      if (this.bump <= 0) env.thump?.(0.3);
      this.bump = 0.25;
    }

    // --- collisions --------------------------------------------------------
    const chunk = Math.floor(this.s / 100);
    for (const list of this.world.colliders(chunk)) {
      for (const c of list) {
        const dx = this.x - c.x;
        const dz = this.z - c.z;
        if (Math.abs(dx) > 25 || Math.abs(dz) > 25) continue;
        if (c.t === 'c') {
          const d = Math.hypot(dx, dz);
          const m = c.r + RADIUS;
          if (d < m && d > 1e-4) {
            this.x = c.x + (dx / d) * m;
            this.z = c.z + (dz / d) * m;
            this.hit(env);
          }
        } else {
          const lx = c.c * dx - c.s * dz;
          const lz = c.s * dx + c.c * dz;
          const ex = c.hw + RADIUS - Math.abs(lx);
          const ez = c.hd + RADIUS - Math.abs(lz);
          if (ex > 0 && ez > 0) {
            let px = 0, pz = 0;
            if (ex < ez) px = Math.sign(lx) * ex;
            else pz = Math.sign(lz) * ez;
            // back to world
            this.x += c.c * px + c.s * pz;
            this.z += -c.s * px + c.c * pz;
            this.hit(env);
          }
        }
      }
    }
    this.bump -= dt;

    // --- pose --------------------------------------------------------------
    const ty = onSurf ? near.y : 0.0;
    this.y += (ty - this.y) * Math.min(1, dt * 10);
    const leanT = Math.max(-0.45, Math.min(0.45, -Math.atan((this.v * yawRate) / G) * 0.85));
    this.lean += (leanT - this.lean) * Math.min(1, dt * 5);
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.set(0, this.h, this.lean);

    this.bar.rotation.y = this.steer * 1.4;
    const wr = (this.v * dt) / 0.34;
    this.wheel += wr;
    this.frontWheel.userData.spin.rotation.x = this.wheel;
    this.rearWheel.userData.spin.rotation.x = this.wheel;
    if (this.pedal > 0.05) this.phase += this.v * dt * 0.17 * Math.PI * 2;
    this.updateLimbs();

    // --- camera ------------------------------------------------------------
    this.yaw -= inp.lookX * 0.0022;
    this.pitch -= inp.lookY * 0.0022;
    this.yaw = Math.max(-2.3, Math.min(2.3, this.yaw));
    this.pitch = Math.max(-1.1, Math.min(0.7, this.pitch));
    const idle = performance.now() / 1000 - inp.lastLook;
    if (idle > 2.0) {
      const k = Math.min(1, dt * 1.2);
      this.yaw += (0 - this.yaw) * k;
      this.pitch += (-0.14 - this.pitch) * k;
    }
    const bob = this.pedal * Math.min(1, this.v / 3);
    const vib = surf === 'board' ? 0.004 : surf === 'grass' ? 0.012 : 0.0012;
    const shake = vib * Math.min(1, this.v / 4);
    const cam = this.camera;
    cam.position.set(
      this.camBase.x + Math.sin(this.phase) * 0.012 * bob + (Math.random() - 0.5) * shake,
      this.camBase.y + Math.abs(Math.sin(this.phase)) * 0.014 * bob + (Math.random() - 0.5) * shake,
      this.camBase.z,
    );
    cam.rotation.set(this.pitch, Math.PI + this.yaw - this.steerIn * 0.12, -this.lean * 0.35 + Math.sin(this.phase) * 0.006 * bob);

    // headlight after dusk
    const night = env.night || 0;
    this.lamp.intensity = night * 45;
    this.lampLens.color.setScalar(0.2 + night * 0.8);

    return { near, surf, onSurf, yawRate };
  }

  hit(env) {
    if (this.bump <= 0 && this.v > 1.5) env.thump?.(Math.min(1, this.v / 7));
    this.bump = 0.3;
    this.v *= 0.25;
  }

  updateLimbs() {
    const hipY = 1.0;
    const L1 = 0.47, L2 = 0.46;
    for (let k = 0; k < 2; k++) {
      const leg = this.legs[k];
      const ph = this.phase + (k ? Math.PI : 0);
      const foot = _a.set(leg.sx * 0.14, this.bbPos.y - Math.cos(ph) * 0.17, this.bbPos.z + Math.sin(ph) * 0.17);
      const hip = _b.set(leg.sx * 0.11, hipY, -0.27);
      const d = Math.min(L1 + L2 - 0.01, hip.distanceTo(foot));
      const dir = new THREE.Vector3().subVectors(foot, hip).normalize();
      const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
      const hh = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      const fwd = new THREE.Vector3(0, 0, 1).addScaledVector(dir, -dir.z).normalize();
      const knee = hip.clone().addScaledVector(dir, a).addScaledVector(fwd, hh);
      limb(leg.thigh, hip, knee);
      limb(leg.shin, knee, foot);
      leg.shoe.position.set(foot.x, foot.y - 0.02, foot.z + 0.05);
      this.cranks[k].rotation.x = -ph + Math.PI;
    }
    // arms follow the grips as the bars turn
    this.root.updateMatrixWorld();
    for (let k = 0; k < 2; k++) {
      const hand = this.grips[k].getWorldPosition(_a);
      this.root.worldToLocal(hand);
      const sh = this.shoulders[k];
      const elbow = new THREE.Vector3().lerpVectors(sh, hand, 0.45);
      elbow.x += (k ? 1 : -1) * 0.05;
      elbow.y -= 0.04;
      limb(this.sleeves[k], sh, elbow);
      limb(this.arms[k], elbow, hand);
    }
  }

  drawComputer(info) {
    const g = this.cc.getContext('2d');
    const W = this.cc.width, H = this.cc.height;
    const night = info.night || 0;
    g.fillStyle = night > 0.3 ? '#9fd8a8' : '#b9c4a8';
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(0, 112, W, 3);
    g.fillStyle = '#1d231a';
    g.textBaseline = 'alphabetic';
    g.font = 'bold 92px "Courier New", monospace';
    g.textAlign = 'right';
    g.fillText(info.speed, W - 62, 98);
    g.font = 'bold 24px "Courier New", monospace';
    g.fillText(info.speedUnit, W - 8, 98);
    g.textAlign = 'left';
    g.font = 'bold 30px "Courier New", monospace';
    g.fillText(info.dist, 10, 146);
    g.textAlign = 'right';
    g.fillText(info.clock, W - 10, 146);
    g.font = 'bold 26px "Courier New", monospace';
    g.textAlign = 'left';
    g.fillText(info.ride, 10, 180);
    if (info.cruise) {
      g.textAlign = 'right';
      g.fillText('CRUISE', W - 10, 180);
    }
    this.ccTex.needsUpdate = true;
  }
}
