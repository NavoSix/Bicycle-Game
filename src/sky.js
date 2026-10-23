import * as THREE from '../vendor/three.module.min.js';
import { RNG } from './rng.js';
import { protos } from './scenery.js';

const C = (h) => new THREE.Color(h);
// palette keyed by sun elevation (sin of altitude)
const KEYS = [
  { e: -0.3, top: C(0x03060f), hor: C(0x0b1222), sun: C(0x000000), amb: 0.10 },
  { e: -0.08, top: C(0x101a38), hor: C(0x3a3550), sun: C(0x442233), amb: 0.18 },
  { e: 0.0, top: C(0x34508a), hor: C(0xe8a070), sun: C(0xff8a4a), amb: 0.38 },
  { e: 0.12, top: C(0x4f86c8), hor: C(0xe9dcc6), sun: C(0xffd49a), amb: 0.65 },
  { e: 0.35, top: C(0x3f7fd0), hor: C(0xc6dcec), sun: C(0xfff0dc), amb: 0.85 },
  { e: 1.0, top: C(0x3a78cc), hor: C(0xc2d8ea), sun: C(0xffffff), amb: 0.95 },
];

function palette(e, out) {
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (e >= KEYS[i].e && e <= KEYS[i + 1].e) {
      a = KEYS[i];
      b = KEYS[i + 1];
      break;
    }
  }
  if (e < KEYS[0].e) b = a;
  const t = b === a ? 0 : (e - a.e) / (b.e - a.e);
  out.top.copy(a.top).lerp(b.top, t);
  out.hor.copy(a.hor).lerp(b.hor, t);
  out.sun.copy(a.sun).lerp(b.sun, t);
  out.amb = a.amb + (b.amb - a.amb) * t;
  return out;
}

export class Sky {
  constructor(scene, seed) {
    this.scene = scene;
    this.pal = { top: new THREE.Color(), hor: new THREE.Color(), sun: new THREE.Color(), amb: 1 };
    this.sunDir = new THREE.Vector3(0, 1, 0);

    this.uniforms = {
      top: { value: new THREE.Color() },
      hor: { value: new THREE.Color() },
      sunCol: { value: new THREE.Color() },
      sunDir: { value: this.sunDir },
      night: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top, hor, sunCol, sunDir; uniform float night; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 col = mix(hor, top, pow(h, 0.55));
          if (d.y < 0.0) col = mix(hor, hor * 0.7, min(1.0, -d.y * 4.0));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunCol * (pow(s, 900.0) * 6.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.12);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // stars
    const rng = new RNG(seed ^ 0x51a7);
    const sp = [];
    for (let i = 0; i < 1500; i++) {
      const u = rng.range(-1, 1);
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(1 - u * u);
      if (u < 0.05) continue;
      sp.push(Math.cos(a) * r * 1300, u * 1300, Math.sin(a) * r * 1300);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // lights
    this.hemi = new THREE.HemisphereLight(0xc6dcec, 0x4a5a30, 1.0);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -70;
    sc.right = 70;
    sc.top = 70;
    sc.bottom = -70;
    sc.near = 1;
    sc.far = 400;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    scene.add(this.sun);
    scene.add(this.sun.target);

    scene.fog = new THREE.Fog(0xc6dcec, 60, 520);

    // cumulus clouds, the afternoon kind
    this.clouds = [];
    const P = protos();
    this.cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8899aa, flatShading: true, fog: false });
    for (let i = 0; i < 22; i++) {
      const g = new THREE.Group();
      const n = rng.int(4, 9);
      const sx = rng.range(25, 60);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(P.blob.geo, this.cloudMat);
        const r = rng.range(10, 22);
        m.position.set(rng.range(-sx, sx), rng.range(0, 12), rng.range(-sx * 0.5, sx * 0.5));
        m.scale.set(r * rng.range(1, 1.5), r * rng.range(0.6, 0.9), r);
        g.add(m);
      }
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(150, 900);
      g.position.set(Math.cos(a) * d, rng.range(160, 280), Math.sin(a) * d);
      g.rotation.y = rng.range(0, 6);
      this.clouds.push(g);
      scene.add(g);
    }
    this.wind = new THREE.Vector3(1.5, 0, 0.6);

    // turkey vultures riding thermals
    this.vultures = [];
    const vmat = new THREE.MeshLambertMaterial({ color: 0x1c1a18, side: THREE.DoubleSide, fog: false });
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.3, 0, 0, -0.3, 0.9, 0.25, 0, 0, 0, 0.3, 0, 0, -0.3, -0.9, 0.25, 0, 0.9, 0.25, 0, 1.7, 0.4, -0.15, 0, 0, -0.3, -0.9, 0.25, 0, -1.7, 0.4, -0.15, 0, 0, -0.3], 3));
    wing.computeVertexNormals();
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(wing, vmat);
      m.userData = { r: rng.range(25, 60), a: rng.range(0, 6), w: rng.range(0.15, 0.3), y: rng.range(60, 110) };
      this.vultures.push(m);
      scene.add(m);
    }
    this.vCenter = new THREE.Vector3();
  }

  update(dt, hours, cam) {
    // sun path: rises in the east (+x) around 7:00, sets west around 19:45
    const t = ((hours - 7.0) / 12.75) * Math.PI;
    const alt = Math.sin(t);
    this.sunDir.set(Math.cos(t), alt * 0.93, -Math.abs(alt) * 0.35 - 0.12).normalize();
    if (alt < 0) this.sunDir.y = alt * 0.9;
    const e = this.sunDir.y;
    const pal = palette(e, this.pal);
    const u = this.uniforms;
    u.top.value.copy(pal.top);
    u.hor.value.copy(pal.hor);
    u.sunCol.value.copy(pal.sun);
    const night = Math.min(1, Math.max(0, (-e - 0.02) / 0.15));
    u.night.value = night;
    this.night = night;
    this.starMat.opacity = night * 0.9;

    this.scene.fog.color.copy(pal.hor);
    this.hemi.color.copy(pal.hor).lerp(pal.top, 0.3);
    this.hemi.groundColor.setHex(0x8a9466).multiplyScalar(0.4 + pal.amb * 0.6);
    this.hemi.intensity = 0.3 + pal.amb * 1.9;
    const sunUp = Math.max(0, Math.min(1, e / 0.08 + 0.3));
    this.sun.color.copy(pal.sun);
    this.sun.intensity = 2.8 * sunUp;
    this.sun.castShadow = e > -0.02;
    // moonlight-ish when the sun's down
    if (e < 0) {
      this.sun.color.setHex(0x8899cc);
      this.sun.intensity = 0.25 * night;
    }

    const p = cam.getWorldPosition(this._v || (this._v = new THREE.Vector3()));
    this.dome.position.copy(p);
    this.stars.position.copy(p);
    const ld = e > 0 ? this.sunDir : this._moon || (this._moon = new THREE.Vector3(-0.3, 0.8, 0.4).normalize());
    // snap shadow camera to texel grid to stop shimmering
    const snap = 140 / 2048;
    const sx = Math.round(p.x / snap) * snap;
    const sz = Math.round(p.z / snap) * snap;
    this.sun.target.position.set(sx, 0, sz);
    this.sun.position.set(sx + ld.x * 200, ld.y * 200, sz + ld.z * 200);

    this.cloudMat.emissive.copy(pal.hor).multiplyScalar(0.35 + 0.1 * (1 - night));
    this.cloudMat.color.setScalar(0.7 + 0.3 * pal.amb);
    for (const g of this.clouds) {
      g.position.addScaledVector(this.wind, dt);
      const dx = g.position.x - p.x;
      const dz = g.position.z - p.z;
      if (dx > 1000) g.position.x -= 2000;
      if (dx < -1000) g.position.x += 2000;
      if (dz > 1000) g.position.z -= 2000;
      if (dz < -1000) g.position.z += 2000;
    }

    // vultures circle a point that lazily follows you
    this.vCenter.lerp(new THREE.Vector3(p.x + 80, 0, p.z + 60), Math.min(1, dt * 0.02));
    if (this.vCenter.lengthSq() === 0) this.vCenter.set(p.x + 80, 0, p.z + 60);
    for (const v of this.vultures) {
      const d = v.userData;
      d.a += d.w * dt;
      v.position.set(this.vCenter.x + Math.cos(d.a) * d.r, d.y + Math.sin(d.a * 0.7) * 4, this.vCenter.z + Math.sin(d.a) * d.r);
      v.rotation.set(0, -d.a, 0.35);
      v.visible = night < 0.5;
    }
  }
}
