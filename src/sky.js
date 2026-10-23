import * as THREE from '../vendor/three.module.min.js';
import { RNG } from './rng.js';
import { protos } from './scenery.js';

const C = (h) => new THREE.Color(h);
// palette keyed by sun elevation (sin of altitude)
// (the dusk and dawn keys follow the colors of a central Florida sunset:
// periwinkle overhead, peach at the horizon, mauve as the light goes)
const KEYS = [
  { e: -0.3, top: C(0x03060f), hor: C(0x0b1222), sun: C(0x000000), amb: 0.10 },
  { e: -0.13, top: C(0x121a3c), hor: C(0x2e2a4c), sun: C(0x3a2040), amb: 0.16 },
  { e: -0.05, top: C(0x2a3270), hor: C(0x9a5a78), sun: C(0xd05a50), amb: 0.26 },
  { e: 0.0, top: C(0x4a5494), hor: C(0xf6a070), sun: C(0xff7c40), amb: 0.38 },
  { e: 0.06, top: C(0x5a6cb0), hor: C(0xfcbc84), sun: C(0xffa258), amb: 0.5 },
  { e: 0.14, top: C(0x4f86c8), hor: C(0xeed6b4), sun: C(0xffd49a), amb: 0.66 },
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

// Sun and moon ride the same arc: up in the east (+x) around 7:00, down in the
// west around 19:45 (for the moon, shifted by its phase).
function arcDir(hours, out) {
  const t = ((hours - 7.0) / 12.75) * Math.PI;
  const alt = Math.sin(t);
  out.set(Math.cos(t), alt * 0.93, -Math.abs(alt) * 0.35 - 0.12).normalize();
  if (alt < 0) out.y = alt * 0.9;
  return out;
}

const MOON_COL = new THREE.Color(0x9fb0d8);

// The sky's colour in a direction, without clouds: the day gradient, the
// layered Florida sunset, and storm grey. Shared by the sky dome and the
// water, which reflects it.
export const SKY_GLSL = /* glsl */ `
  uniform vec3 top, hor, sunCol, sunDir;
  uniform float glow, glowLum, storm, amb;
  // colours below are picked as on-screen (sRGB) values
  vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
  vec3 skyColor(vec3 d) {
    float h = max(d.y, 0.0);
    vec3 col = mix(hor, top, pow(h, 0.55));
    // lavender overhead, salmon pink below it, a peach and gold band along the
    // horizon that burns hottest under the sun, and the pink belt of Venus
    // over a blue earth shadow on the far side
    vec2 sh = normalize(sunDir.xz + vec2(1e-4, 0.0));
    vec2 dh = normalize(d.xz + vec2(1e-4, 0.0));
    float az = dot(dh, sh);
    float sunward = pow(max(az, 0.0), 2.0);
    if (glow > 0.001) {
      // (kept below 1.0 so the tone mapper leaves them orange instead of cream)
      vec3 gold = mix(srgb(vec3(0.82, 0.26, 0.08)), srgb(vec3(0.9, 0.42, 0.1)), sunward);
      float band = exp(-h * mix(9.0, 4.5, sunward));
      vec3 pink = mix(srgb(vec3(0.82, 0.32, 0.5)), srgb(vec3(0.95, 0.38, 0.36)), sunward);
      float pinkB = exp(-pow((h - mix(0.12, 0.2, sunward)) / 0.15, 2.0));
      vec3 lav = srgb(vec3(0.3, 0.33, 0.68));
      vec3 sunset = mix(lav, pink, pinkB * 0.95);
      sunset = mix(sunset, gold, band * (0.45 + 0.55 * sunward));
      float anti = pow(max(-az, 0.0), 1.5) * exp(-h * 5.0);
      sunset = mix(sunset, mix(srgb(vec3(0.32, 0.36, 0.6)), srgb(vec3(0.88, 0.5, 0.64)), smoothstep(0.02, 0.1, h)), anti * 0.75);
      col = mix(col, sunset * glowLum, glow * (1.0 - 0.6 * pow(h, 1.2)));
    }
    col = mix(col, srgb(vec3(0.46, 0.49, 0.54)) * (0.2 + 0.8 * amb), storm * 0.85);
    return col;
  }
`;

export class Sky {
  constructor(scene, seed) {
    this.scene = scene;
    this.pal = { top: new THREE.Color(), hor: new THREE.Color(), sun: new THREE.Color(), amb: 1 };
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, 1, 0);
    this.moonLight = 0;

    this.uniforms = {
      top: { value: new THREE.Color() },
      hor: { value: new THREE.Color() },
      sunCol: { value: new THREE.Color() },
      sunDir: { value: this.sunDir },
      night: { value: 0 },
      camPos: { value: new THREE.Vector3() },
      windOff: { value: new THREE.Vector2() },
      cloudT: { value: 0 },
      cover: { value: 0.4 },
      amb: { value: 1 },
      moonDir: { value: this.moonDir },
      moonPhase: { value: 0.75 },
      moonVis: { value: 0 },
      moonLight: { value: 0 },
      glow: { value: 0 },
      glowLum: { value: 1 },
      storm: { value: 0 },
      flash: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 camPos; uniform vec2 windOff;
        uniform float night, cloudT, cover; varying vec3 vDir;
        uniform vec3 moonDir; uniform float moonPhase, moonVis, moonLight;
        uniform float flash;
        ${SKY_GLSL}
        float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float vnoise(vec3 x){
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + vec3(13.1, 7.7, 3.3); a *= 0.5; } return s; }
        // Cloud density at a point on the cloud deck. Stretched along the wind
        // so cumulus line up in streets that run across the whole sky.
        float field(vec2 q){
          vec2 st = vec2(q.x * 0.42, q.y) / 1400.0;
          vec3 pp = vec3(st, cloudT);
          vec2 warp = vec2(fbm(pp * 0.5 + 3.0), fbm(pp * 0.5 + 7.0)) - 0.5;
          float n = fbm(vec3(st + warp * 0.9, cloudT * 1.3));
          float big = vnoise(vec3(q / 9000.0, cloudT * 0.4 + 11.0));
          float c = cover + (big - 0.5) * 0.55;
          return smoothstep(1.0 - c, 1.0 - c + 0.2, n);
        }
        void main(){
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 col = skyColor(d);
          if (d.y < 0.0) col = mix(col, col * 0.7, min(1.0, -d.y * 4.0));
          vec2 sh = normalize(sunDir.xz + vec2(1e-4, 0.0));
          vec2 dh = normalize(d.xz + vec2(1e-4, 0.0));
          float az = dot(dh, sh);
          col += vec3(0.8, 0.82, 1.0) * flash * 0.5;
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunCol * (pow(s, 900.0) * 6.0 * smoothstep(-0.03, 0.0, sunDir.y) + (pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.12) * (1.0 - 0.7 * glow)) * (1.0 - 0.9 * storm);
          // the moon: a lit disc whose terminator follows the phase, lit side toward the sun
          vec3 md = normalize(moonDir);
          float mc = dot(d, md);
          const float MR = 0.028;
          if (mc > 0.99 && md.y > -0.05) {
            vec3 rt = normalize(cross(md, vec3(0.0, 1.0, 0.0)));
            vec3 upv = cross(rt, md);
            vec2 q = vec2(dot(d, rt), dot(d, upv)) / MR;
            float r2 = dot(q, q);
            if (r2 < 1.0) {
              vec3 n = vec3(q, sqrt(1.0 - r2));
              vec3 sp = sunDir - md * dot(sunDir, md);
              vec2 e2 = normalize(vec2(dot(sp, rt), dot(sp, upv)) + vec2(1e-5, 0.0));
              float ph = moonPhase * 6.2831853;
              vec3 L = vec3(e2 * abs(sin(ph)), -cos(ph));
              float lit = smoothstep(-0.05, 0.05, dot(n, L));
              float maria = 0.8 + 0.2 * vnoise(vec3(q * 2.6 + 5.0, 1.0));
              vec3 mcol = vec3(0.97, 0.96, 0.9) * maria * (lit * 1.15 + 0.03);
              float edge = smoothstep(1.0, 0.92, r2);
              col = mix(col, max(col, mcol), edge * moonVis);
            }
          }
          col += vec3(0.55, 0.62, 0.8) * moonLight * (pow(max(mc, 0.0), 1500.0) * 0.6 + pow(max(mc, 0.0), 60.0) * 0.07);
          if (d.y > 0.012) {
            float t = 1500.0 / d.y;
            vec2 q = camPos.xz + d.xz * t + windOff;
            float den = field(q);
            if (den > 0.002) {
              vec2 toSun = normalize(sunDir.xz + vec2(1e-4));
              float den2 = field(q + toSun * 280.0);
              float lit = clamp(1.0 - (den2 - den) * 1.4 - den * 0.3, 0.25, 1.0);
              vec3 litC = mix(vec3(1.0), sunCol, 0.45) * (0.3 + 0.8 * amb);
              vec3 shC = mix(hor, top, 0.45) * (0.5 + 0.25 * amb);
              litC += vec3(0.5, 0.56, 0.72) * moonLight * 0.45;
              shC += vec3(0.25, 0.28, 0.36) * moonLight * 0.25;
              if (glow > 0.001) {
                // lit from below in salmon and gold, shadowed in lavender-gray
                float sw = pow(max(az, 0.0), 1.5);
                vec3 sc = mix(srgb(vec3(0.98, 0.44, 0.52)), srgb(vec3(1.0, 0.56, 0.26)), sw) * glowLum * 0.95;
                litC = mix(litC, sc, glow);
                shC = mix(shC, mix(srgb(vec3(0.36, 0.32, 0.54)), srgb(vec3(0.56, 0.34, 0.44)), sw) * glowLum, glow);
                lit = mix(lit, max(lit, 0.6), glow * 0.5);
                // low cloud toward the sun: dark slate silhouettes with gilded edges
                float back = sw * smoothstep(0.22, 0.03, h) * glow;
                vec3 sil = srgb(vec3(0.24, 0.21, 0.3)) * glowLum;
                litC = mix(litC, sil + srgb(vec3(1.0, 0.72, 0.4)) * pow(1.0 - den, 2.0) * 1.6 * glowLum, back);
                shC = mix(shC, sil, back);
              }
              litC = mix(litC, srgb(vec3(0.56, 0.58, 0.63)) * (0.25 + 0.75 * amb), storm);
              shC = mix(shC, srgb(vec3(0.2, 0.22, 0.26)) * (0.25 + 0.75 * amb), storm);
              litC += flash * 1.1;
              shC += flash * 0.7;
              vec3 cc = mix(shC, litC, lit);
              cc += sunCol * pow(s, 10.0) * 0.5 * (1.0 - den) * (1.0 - storm);
              float fade = smoothstep(0.012, 0.16, d.y);
              col = mix(col, cc, den * fade * 0.96);
            }
          }
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
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const n = rng.int(4, 9);
      const sx = rng.range(25, 60);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(P.blob.geo, this.cloudMat);
        const r = rng.range(10, 22);
        m.position.set(rng.range(-sx, sx), rng.range(0, 12), rng.range(-sx * 0.5, sx * 0.5));
        m.scale.set(r * rng.range(1, 1.5), r * rng.range(0.6, 0.9), r);
        m.userData.base = m.scale.clone();
        m.userData.ph = rng.range(0, 6.28);
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
    this.cloudBase = rng.range(0.28, 0.42);
    this.time = 0;

    // Towering cumulonimbus that build over the interior every summer
    // afternoon, anvils smeared downwind. They sit on the horizon and grow.
    this.storms = [];
    this.stormMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8899aa, flatShading: true, fog: false });
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const H = rng.range(420, 640);
      const R = rng.range(150, 220);
      // a lumpy, broad-shouldered tower with smaller turrets around it
      for (let k = 0; k < 13; k++) {
        const t = k / 12;
        const ring = 0.55 * R * (1 - t * 0.35);
        const n = 5 - Math.floor(t * 2);
        for (let j = 0; j < n; j++) {
          const m = new THREE.Mesh(P.blob.geo, this.stormMat);
          const a = (j / n) * 6.28 + rng.range(-0.4, 0.4) + k;
          const r = R * (0.62 - t * 0.22) * rng.range(0.75, 1.15);
          m.position.set(Math.cos(a) * ring * rng.range(0.4, 1), H * t * 0.92, Math.sin(a) * ring * rng.range(0.4, 1));
          m.scale.set(r, r * rng.range(0.75, 1.0), r);
          g.add(m);
        }
      }
      // flat-topped anvil spreading downwind
      for (let k = 0; k < 18; k++) {
        const m = new THREE.Mesh(P.blob.geo, this.stormMat);
        const u = rng.range(-0.3, 1);
        const r = rng.range(110, 190) * (1 - u * 0.25);
        m.position.set(u * 420, H + rng.range(-25, 25) - u * 30, rng.range(-1, 1) * (160 + u * 120));
        m.scale.set(r * 1.5, r * 0.28, r);
        g.add(m);
      }
      for (const m of g.children) {
        m.userData.base = m.scale.clone();
        m.userData.ph = rng.range(0, 6.28);
      }
      g.userData = { a: rng.range(0, Math.PI * 2), d: rng.range(1050, 1250), start: rng.range(11.5, 14.5), base: rng.range(80, 140) };
      g.rotation.y = rng.range(0, 6.28);
      this.storms.push(g);
      scene.add(g);
    }

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

  // moonPhase: 0 new, 0.25 waxing half, 0.5 full, 0.75 waning half
  // w: { storm, rain, flash, after, cell } from weather.js
  update(dt, hours, cam, moonPhase = 0.75, w = null) {
    w = w || { storm: 0, rain: 0, flash: 0, after: 0, cell: null };
    this.w = w;
    arcDir(hours, this.sunDir);
    const e = this.sunDir.y;
    const pal = palette(e, this.pal);
    const u = this.uniforms;
    // sunset (and sunrise) glow: builds as the sun gets low, peaks right at
    // the horizon, and lingers in mauve and rose for a while after
    const ss = THREE.MathUtils.smoothstep;
    const glow = (1 - ss(e, 0.05, 0.24)) * ss(e, -0.14, -0.035) * (1 - 0.92 * w.storm);
    this.glow = glow;
    u.glow.value = glow;
    u.glowLum.value = 0.22 + 0.78 * ss(e, -0.13, 0.01);
    u.storm.value = w.storm;
    u.flash.value = w.flash;
    const night = Math.min(1, Math.max(0, (-e - 0.02) / 0.15));
    u.night.value = night;
    this.night = night;

    // The moon trails the sun by its phase: a waning half rises near midnight,
    // a full moon at sunset, a new moon is up with the sun and can't be seen.
    arcDir((((hours - moonPhase * 24) % 24) + 24) % 24, this.moonDir);
    const illum = (1 - Math.cos(moonPhase * Math.PI * 2)) / 2;
    const moonUp = THREE.MathUtils.smoothstep(this.moonDir.y, -0.02, 0.12);
    this.moonLight = illum * moonUp * night;
    this.illum = illum;
    u.moonPhase.value = moonPhase;
    u.moonVis.value = Math.min(1, illum * 3) * (0.35 + 0.65 * night);
    u.moonLight.value = this.moonLight;

    // a bright moon lifts the night sky toward a deep blue
    const ml = this.moonLight;
    pal.top.lerp(new THREE.Color(0x182844), ml * 0.6 * night);
    pal.hor.lerp(new THREE.Color(0x26324a), ml * 0.6 * night);
    u.top.value.copy(pal.top);
    u.hor.value.copy(pal.hor);
    u.sunCol.value.copy(pal.sun);
    this.starMat.opacity = night * 0.9 * (1 - 0.55 * ml);

    // a storm greys everything out and pulls the fog in
    const gray = this._gray || (this._gray = new THREE.Color());
    gray.setRGB(0.46, 0.49, 0.54).multiplyScalar(0.2 + 0.8 * pal.amb);
    this.scene.fog.color.copy(pal.hor).lerp(gray, w.storm * 0.85);
    // at sunset the haze picks up the pink of the sky
    this.scene.fog.color.lerp(this._rose || (this._rose = new THREE.Color(0xd88a90)), glow * 0.25 * u.glowLum.value);
    this.scene.fog.near = 60 - 40 * w.rain;
    this.scene.fog.far = 520 - 300 * w.rain - 80 * w.storm;
    this.hemi.color.copy(pal.hor).lerp(pal.top, 0.3).lerp(MOON_COL, ml * 0.5).lerp(gray, w.storm * 0.7);
    this.hemi.groundColor.setHex(0x8a9466).multiplyScalar(0.4 + pal.amb * 0.6);
    this.hemi.intensity = (0.3 + pal.amb * 1.9 + ml * 0.45) * (1 - 0.4 * w.storm) + w.flash * 2.5;
    const sunUp = Math.max(0, Math.min(1, e / 0.08 + 0.3));
    this.sun.color.copy(pal.sun);
    this.sun.intensity = 2.8 * sunUp * (1 - 0.85 * w.storm);
    this.sun.castShadow = e > -0.02 && w.storm < 0.7;
    // after sunset the key light becomes the moon, as bright as its phase allows
    this.lightDir = this.sunDir;
    if (e < 0) {
      this.sun.color.copy(MOON_COL);
      this.sun.intensity = night * (0.03 + 0.85 * ml) * (1 - 0.9 * w.storm);
      this.sun.castShadow = ml > 0.25 && w.storm < 0.5;
      if (moonUp > 0.01) this.lightDir = this.moonDir;
    }

    const p = cam.getWorldPosition(this._v || (this._v = new THREE.Vector3()));
    this.dome.position.copy(p);
    this.stars.position.copy(p);
    const ld = this.lightDir.y > 0.02 ? this.lightDir : this._zen || (this._zen = new THREE.Vector3(-0.3, 0.8, 0.4).normalize());
    // snap shadow camera to texel grid to stop shimmering
    const snap = 140 / 2048;
    const sx = Math.round(p.x / snap) * snap;
    const sz = Math.round(p.z / snap) * snap;
    this.sun.target.position.set(sx, 0, sz);
    this.sun.position.set(sx + ld.x * 200, ld.y * 200, sz + ld.z * 200);

    // cloud deck: drifts with the wind, slowly reshapes, builds after lunch
    this.time += dt;
    const build = THREE.MathUtils.smoothstep(hours, 10.5, 15) * 0.15 - THREE.MathUtils.smoothstep(hours, 18.5, 21.5) * 0.15;
    // overcast in a storm, broken and ragged after it passes
    u.cover.value = Math.min(1.05, this.cloudBase + build + w.storm * 0.55 + w.after * 0.08);
    u.cloudT.value = this.time * 0.006;
    u.windOff.value.x += this.wind.x * dt * 8;
    u.windOff.value.y += this.wind.z * dt * 8;
    u.camPos.value.copy(p);
    u.amb.value = pal.amb;

    this.cloudMat.emissive.copy(pal.hor).multiplyScalar(0.35 + 0.1 * (1 - night)).lerp(this._lav || (this._lav = new THREE.Color(0x6a5a90)), glow * 0.6).lerp(gray, w.storm);
    this.cloudMat.color.setScalar((0.7 + 0.3 * pal.amb) * (1 - 0.5 * w.storm));
    // thunderheads glow peach and rose on the sunward side as the sun goes down
    // at sunset the tower's shadowed side goes lavender; the lit side takes
    // the sun's orange from the directional light
    this.stormMat.emissive.copy(pal.hor).multiplyScalar(0.3 + 0.1 * (1 - night)).lerp(this._lav || (this._lav = new THREE.Color(0x6a5a90)), glow * 0.7).lerp(gray, w.storm * 0.6);
    this.stormMat.color.setScalar(0.6 + 0.35 * pal.amb);
    const billow = (g, k) => {
      for (const m of g.children) {
        const s = 1 + k * Math.sin(this.time * 0.25 + m.userData.ph);
        m.scale.copy(m.userData.base).multiplyScalar(s);
      }
    };
    for (let k = 0; k < this.storms.length; k++) {
      const g = this.storms[k];
      const d = g.userData;
      let grow = THREE.MathUtils.smoothstep(hours, d.start, d.start + 4) * (1 - THREE.MathUtils.smoothstep(hours, 20, 22.5));
      d.a += dt * 0.0015;
      let a = d.a, dist = d.d;
      // the first tower is the storm that's coming for you (or just left)
      if (k === 0 && w.cell) {
        a = w.cell.dir;
        dist = w.cell.dist;
        grow = Math.max(grow, 1 - w.cell.hide);
        if (w.cell.hide > 0.98) grow = 0;
      } else if (w.storm > 0.6) grow *= 1 - (w.storm - 0.6) / 0.4; // lost in the overcast
      g.visible = grow > 0.02;
      if (!g.visible) continue;
      g.position.set(p.x + Math.cos(a) * dist, d.base, p.z + Math.sin(a) * dist);
      g.scale.set(0.6 + 0.4 * grow, grow, 0.6 + 0.4 * grow);
      billow(g, 0.05);
    }
    for (const g of this.clouds) {
      g.visible = w.storm < 0.45; // swallowed by the overcast
      billow(g, 0.07);
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
      v.visible = night < 0.5 && w.storm < 0.5;
    }
  }
}
