import * as THREE from '../vendor/three.module.min.js';
import { Path } from './path.js';
import { World, GROUND_TINT, skyOnWater, waterSky } from './world.js';
import { Weather } from './weather.js';
import { Sky } from './sky.js';
import { Bike } from './bike.js';
import { NPCs } from './npc.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { TouchControls } from './touch.js';
import { Walker } from './walker.js';
import { textures } from './textures.js';
import { lightWalls } from './walls.js';
import { lightLamps } from './scenery.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const seed = params.has('seed') ? parseInt(params.get('seed'), 10) >>> 0 : (Math.random() * 1e9) >>> 0;
$('seed').textContent = '#' + seed;
$('newroute').href = '?seed=' + ((Math.random() * 1e9) >>> 0);

// --- renderer / scene --------------------------------------------------------
const canvas = $('c');
// phones and tablets: fewer pixels and a smaller shadow map keep it smooth
const handheld = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
// stencil: spring basins are clipped to their water's outline (see poi.js)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, handheld ? 1.3 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.05, 3000);

const path = new Path(seed);
const world = new World(scene, path, seed);
world.update(0, 99);
const sky = new Sky(scene, seed);
const weather = new Weather(scene, seed);
waterSky(sky.uniforms);
const bike = new Bike(scene, camera, path, world);
bike.reset(world.start);
const npcs = new NPCs(scene, path, seed);
const sound = new Sound();
const input = new Input(canvas);
const touch = new TouchControls(canvas, input);
const walker = new Walker(scene, camera, path, world);
if (handheld) sky.sun.shadow.mapSize.set(1024, 1024);

// ground: one big plane that follows you, texture locked to world space
const T = textures();
T.grass.repeat.set(320, 320);
const groundMat = new THREE.MeshLambertMaterial({ map: T.grass, color: GROUND_TINT.street });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), groundMat);
ground.receiveShadow = true;
// drawn early so spring basins can show "through" it (see poi.js)
ground.renderOrder = -2;
scene.add(ground);

// Keep at least ~70 degrees of horizontal view, so a phone held upright still
// shows the trail ahead and not just a sliver of it.
function fitCamera() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  const minH = (70 * Math.PI) / 180;
  const vForH = (2 * Math.atan(Math.tan(minH / 2) / camera.aspect) * 180) / Math.PI;
  baseFov = Math.min(100, Math.max(74, vForH));
  camera.fov = baseFov;
  camera.updateProjectionMatrix();
}
let baseFov = 74;
addEventListener('resize', fitCamera);
fitCamera();

// --- state -------------------------------------------------------------------
let started = false;
let paused = false;
let clock = 8.2; // hours since midnight of day one: a Saturday-morning start
let hours = clock;
const TIME_SCALE = 6; // one real minute = six minutes of Florida daylight
let metric = false;

// Cruise holds a set speed, adjustable in 2 mph steps up to 30 mph.
const CRUISE_MIN = 4;
const CRUISE_MAX = 30;
let cruiseMph = 14;
const cruiseLabel = () => (metric ? `${Math.round(cruiseMph * 1.609344)} km/h` : `${cruiseMph} mph`);

// The moon starts at a waning half and moves on an eighth of a cycle each
// night. The phase changes at noon, so it holds steady from dusk to dawn.
const moonPhase = () => (0.75 + 0.125 * Math.max(0, Math.floor((clock - 12) / 24))) % 1;
const MOON_NAMES = ['New moon', 'Waxing crescent', 'Waxing half moon', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Waning half moon', 'Waning crescent'];
let region = -1;
let ccTimer = 0;

// --- HUD (as little of it as possible) ---------------------------------------
let toastTimer = null;
function toast(name, sub) {
  const el = $('toast');
  el.querySelector('.name').textContent = name;
  el.querySelector('.sub').textContent = sub || '';
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 6500);
}
let noteTimer = null;
function note(text) {
  const el = $('note');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

const fmtDist = (m) => (metric ? (m / 1000).toFixed(2) + ' km' : (m / 1609.344).toFixed(2) + ' mi');
const fmtClock = (h) => {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h % 1) * 60);
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')}${hh < 12 ? 'a' : 'p'}`;
};
const fmtRide = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

function lock() {
  if (matchMedia('(pointer: coarse)').matches) return;
  canvas.requestPointerLock?.()?.catch?.(() => {});
}

function start() {
  if (started || $('title').classList.contains('loading')) return;
  started = true;
  $('title').classList.add('hidden');
  sound.start();
  lock();
  setTimeout(() => toast('Orlando', 'Home'), 1200);
  setTimeout(() => note(touch.state.active ? 'Hold Pedal · tap Cruise' : 'W to pedal · C to cruise'), 3500);
  if (handheld && !document.fullscreenElement) {
    document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {});
  }
}
$('title').addEventListener('click', start);
addEventListener('keydown', (e) => {
  if (!started && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyW')) start();
});

function setPaused(p) {
  if (!started) return;
  paused = p;
  $('pause').classList.toggle('hidden', !p);
  if (p) {
    $('stats').innerHTML = `${fmtDist(bike.dist)} ridden in ${fmtRide(bike.rideTime)}<br>${path.regions.list[region]?.name || ''} · ${fmtClock(hours)} · ${MOON_NAMES[Math.round(moonPhase() * 8) % 8]}<br>${discovered.size ? `Places discovered: ${discovered.size} · ${[...discovered.values()].slice(-3).join(', ')}<br>` : ''}<span style="opacity:.7">Route #${seed}</span>`;
    if (document.pointerLockElement) document.exitPointerLock();
    sound.ctx?.suspend();
  } else {
    $('help').classList.add('hidden');
    sound.start();
    lock();
  }
}
// leaving the tab or switching apps pauses the ride
document.addEventListener('visibilitychange', () => {
  if (document.hidden && started && !paused) setPaused(true);
});
let hadLock = false;
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) hadLock = true;
  else if (hadLock && started && !paused) setPaused(true);
});
$('resume').addEventListener('click', () => setPaused(false));
$('restart').addEventListener('click', () => (location.href = '?'));
$('keysbtn').addEventListener('click', () => $('help').classList.remove('hidden'));
$('helpclose').addEventListener('click', () => $('help').classList.add('hidden'));
canvas.addEventListener('click', () => {
  if (started && !paused && !document.pointerLockElement) lock();
});

// --- loop --------------------------------------------------------------------
const frameTimer = new THREE.Clock();
const tint = new THREE.Color(GROUND_TINT.street);
const idleInput = { throttle: 0, brake: 0, steer: 0, sprint: false, lookX: 0, lookY: 0, lastLook: -10, events: [], analog: false };

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, frameTimer.getDelta());
  if (started && !paused) step(dt);
  else if (!started) {
    // idle title view: slowly look around the cul-de-sac
    bike.update(dt, { ...idleInput, lastLook: performance.now() / 1000 }, { night: sky.night });
    bike.yaw = Math.sin(performance.now() / 6000) * 0.6;
    bike.pitch = -0.05;
    sky.update(dt, hours, camera, moonPhase(), skyWeather());
  }
  // walls go grey under a storm, rosy in a sunset
  lightWalls(sky.pal, Math.min(1, sky.night * (1 - 0.45 * sky.moonLight) + weather.storm * 0.45 - weather.flash * 0.5));
  skyOnWater(dt, weather.wet);
  // trail lights come on at dusk, a little before full dark
  // (and the photocells catch the dark of a storm, too)
  lightLamps(Math.max(THREE.MathUtils.smoothstep(-sky.sunDir.y, -0.07, 0.07), THREE.MathUtils.smoothstep(weather.storm, 0.55, 0.85) * 0.8));
  touch.update(started && !paused, bike.cruise, cruiseLabel(), mode, action ? action.label : '');
  renderer.render(scene, camera);
}

function skyWeather() {
  return { storm: weather.storm, rain: weather.rain, flash: weather.flash, after: weather.after, cell: weather.cell(clock) };
}

// --- riding and walking ----------------------------------------------------
let mode = 'ride';
let stillTime = 0;
let action = null; // what E (or the touch action button) does right now
let reading = null; // plaque currently open
let zoomed = false; // looking through coin binoculars
const discovered = new Map(); // places you've reached, by key
let animT = 0;

function nearestPoi(x, z) {
  let best = null, bd = Infinity;
  for (const d of world.pois()) {
    const dd = Math.hypot(x - d.cx, z - d.cz);
    if (dd < bd) {
      bd = dd;
      best = d;
    }
  }
  return best ? { d: best, dist: bd } : null;
}

function findAction() {
  if (reading) return { kind: 'close', label: handheld ? 'Close' : 'E · close' };
  if (zoomed) return { kind: 'unzoom', label: handheld ? 'Lower binoculars' : 'E · lower the binoculars' };
  if (mode === 'ride') {
    const np = nearestPoi(bike.x, bike.z);
    const atPoi = np && np.dist < np.d.Rv + 15;
    if (stillTime > (atPoi ? 0.4 : 2.5)) return { kind: 'walk', label: handheld ? 'Walk around' : 'E · get off and walk around' };
    return null;
  }
  // on foot: the bike, a plaque, binoculars, nearest first
  let best = null;
  const consider = (dist, a) => {
    if (!best || dist < best.dist) best = { ...a, dist };
  };
  const bd = Math.hypot(walker.x - bike.x, walker.z - bike.z);
  if (bd < 2.4 && Math.abs(walker.y - bike.y) < 1) consider(bd, { kind: 'ride', label: handheld ? 'Ride' : 'E · back on the bike' });
  for (const d of world.pois()) {
    for (const pl of d.plaques) {
      const dist = Math.hypot(walker.x - pl.x, walker.z - pl.z);
      if (dist > 1.7 || Math.abs(walker.y - pl.y) > 1) continue;
      // facing the panel?
      const want = Math.atan2(pl.px - walker.x, pl.pz - walker.z);
      let diff = Math.abs(((want - walker.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff < 1.2) consider(dist, { kind: 'read', plaque: pl, label: handheld ? 'Read' : `E · read "${pl.title}"` });
    }
    for (const sc of d.scopes) {
      const dist = Math.hypot(walker.x - sc.x, walker.z - sc.z);
      if (dist < 1.4 && Math.abs(walker.y - sc.y) < 1) consider(dist, { kind: 'scope', scope: sc, label: handheld ? 'Binoculars' : 'E · look through the binoculars' });
    }
  }
  return best;
}

function openPlaque(pl) {
  reading = pl;
  $('plaque-title').textContent = pl.title;
  $('plaque-text').textContent = pl.text;
  $('plaque').classList.remove('hidden');
}
function closePlaque() {
  reading = null;
  $('plaque').classList.add('hidden');
}

function doAction(a) {
  if (!a) return;
  if (a.kind === 'close') closePlaque();
  else if (a.kind === 'unzoom') zoomed = false;
  else if (a.kind === 'walk') {
    mode = 'walk';
    bike.park();
    walker.begin(bike);
    stillTime = 0;
  } else if (a.kind === 'ride') {
    mode = 'ride';
    zoomed = false;
    closePlaque();
    walker.end(bike);
    bike.mount(walker.yaw - bike.h);
  } else if (a.kind === 'read') openPlaque(a.plaque);
  else if (a.kind === 'scope') {
    zoomed = true;
    walker.yaw = a.scope.yaw;
    walker.pitch = -0.03;
  }
}

function step(dt) {
  const inp = input.poll();
  for (const e of inp.events) {
    if (e === 'pause') setPaused(true);
    else if (e === 'bell') sound.bell();
    else if (e === 'interact') doAction(action);
    else if (e === 'units') {
      metric = !metric;
      note(metric ? 'km/h' : 'mph');
    } else if (e === 'time') {
      clock += 1;
      hours = clock % 24;
      note(fmtClock(hours));
    } else if (e === 'mute') note(sound.toggleMute() ? 'Sound off' : 'Sound on');
    else if (e === 'storm') note(weather.toggle(clock) ? 'A storm is building' : 'The storm moves off');
    else if (e === 'help') $('help').classList.toggle('hidden');
    else if (e === 'fullscreen') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    } else if (mode === 'ride' && e === 'cruise') note(bike.cruise ? 'Cruise off' : `Cruise on · ${cruiseLabel()}`);
    else if (e === 'cruiseUp' || e === 'cruiseDown') {
      cruiseMph = Math.max(CRUISE_MIN, Math.min(CRUISE_MAX, cruiseMph + (e === 'cruiseUp' ? 2 : -2)));
      note(`Cruise ${cruiseLabel()}`);
      ccTimer = 0;
    }
  }
  if (paused) return;

  clock += (dt * TIME_SCALE) / 3600;
  hours = clock % 24;
  const env = {
    night: sky.night,
    rain: weather.rain,
    notify: note,
    thump: (a) => sound.thump(a),
    laneOffset: (s, lane) => npcs.laneOffset(s, lane),
    cruiseSpeed: cruiseMph * 0.44704,
    step: (surf, run) => sound.footstep(surf, run),
  };
  let surf;
  if (mode === 'ride') {
    // the bike ignores the interact key, so strip it before it sees events
    const r = bike.update(dt, { ...inp, events: inp.events.filter((e) => e !== 'interact') }, env);
    surf = r.surf;
    stillTime = bike.v < 0.6 ? stillTime + dt : 0;
  } else {
    if (zoomed && (Math.abs(inp.throttle - inp.brake) > 0.1 || Math.abs(inp.strafe) > 0.1 || inp.moveY)) zoomed = false;
    walker.update(dt, zoomed ? { ...inp, throttle: 0, brake: 0, strafe: 0, moveY: 0, lookX: inp.lookX * 0.3, lookY: inp.lookY * 0.3 } : inp, env);
    surf = 'walk';
    if (reading && Math.hypot(walker.x - reading.x, walker.z - reading.z) > 3) closePlaque();
  }
  const player = mode === 'ride' ? bike : walker;
  const traffic = npcs.update(dt, player, env);
  world.update(player.s, 1);
  weather.update(dt, clock, camera, sound);
  sky.update(dt, hours, camera, moonPhase(), skyWeather());
  animT += dt;
  world.updatePois(animT, sky.night);

  // binoculars narrow the view; ease in and out
  const wantFov = baseFov * (zoomed ? 0.22 : 1);
  if (Math.abs(camera.fov - wantFov) > 0.05) {
    camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 6);
    camera.updateProjectionMatrix();
  }

  action = findAction();
  setPrompt(action ? action.label : '');

  // reaching a place of interest: a title card, and it goes in your log
  const px = player.x, pz = player.z;
  const np = nearestPoi(px, pz);
  if (np && np.dist < np.d.R) {
    const key = np.d.poi.name + '@' + np.d.poi.i;
    if (!discovered.has(key)) {
      discovered.set(key, np.d.poi.name);
      toast(np.d.poi.name, np.d.poi.sub);
    }
  }

  // region changes → a quiet title card
  const p = path.pts[Math.floor(player.s)];
  if (p && p.r !== region) {
    const prev = region;
    region = p.r;
    const reg = path.regions.list[region];
    if (prev >= 0) toast(reg.name, reg.sub);
  }
  tint.lerp(new THREE.Color(GROUND_TINT[p?.type] ?? GROUND_TINT.street), Math.min(1, dt * 0.25));
  groundMat.color.copy(tint).multiplyScalar(1);
  ground.position.set(Math.round(px / 5) * 5, 0, Math.round(pz / 5) * 5);

  ccTimer -= dt;
  if (ccTimer <= 0) {
    ccTimer = 0.25;
    const sp = metric ? bike.v * 3.6 : bike.v * 2.23694;
    bike.drawComputer({
      speed: sp.toFixed(1),
      speedUnit: metric ? 'kmh' : 'mph',
      dist: fmtDist(bike.dist),
      clock: fmtClock(hours),
      ride: fmtRide(bike.rideTime),
      cruise: bike.cruise,
      cruiseSet: metric ? Math.round(cruiseMph * 1.609344) : cruiseMph,
      night: sky.night,
    });
  }

  sound.update(dt, {
    speed: mode === 'ride' ? bike.v : 0,
    surface: surf,
    coasting: mode === 'ride' && bike.pedal < 0.15,
    habitat: p?.type,
    night: sky.night,
    hour: hours,
    carDist: traffic.carDist,
    carSpeed: traffic.carSpeed,
    rain: weather.rain,
    wet: weather.wet,
  });
}

let promptText = '';
function setPrompt(t) {
  if (t === promptText) return;
  promptText = t;
  const el = $('prompt');
  el.textContent = t;
  el.classList.toggle('show', !!t && !touch.state.active);
}

// The first chunks are already built; let the title card go live.
requestAnimationFrame(() => {
  bike.drawComputer({ speed: '0.0', speedUnit: 'mph', dist: fmtDist(0), clock: fmtClock(hours), ride: fmtRide(0), night: 0 });
  $('title').classList.remove('loading');
  $('title').querySelector('.go').textContent = handheld ? 'Tap to ride' : 'Click to ride';
});
frame();

// handy for poking at things from the console
window.__ride = { bike, path, world, sky, npcs, input, renderer, get hours() { return hours; }, set hours(h) { clock = Math.floor(clock / 24) * 24 + h; hours = h; }, get clock() { return clock; }, set clock(c) { clock = c; hours = c % 24; }, moonPhase, weather, get cruiseMph() { return cruiseMph; }, walker, get mode() { return mode; }, get action() { return action; }, doAction, discovered };
