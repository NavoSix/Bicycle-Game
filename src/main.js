import * as THREE from '../vendor/three.module.min.js';
import { Path } from './path.js';
import { World, GROUND_TINT } from './world.js';
import { Sky } from './sky.js';
import { Bike } from './bike.js';
import { NPCs } from './npc.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { TouchControls } from './touch.js';
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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
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
const bike = new Bike(scene, camera, path, world);
bike.reset(world.start);
const npcs = new NPCs(scene, path, seed);
const sound = new Sound();
const input = new Input(canvas);
const touch = new TouchControls(canvas, input);
if (handheld) sky.sun.shadow.mapSize.set(1024, 1024);

// ground: one big plane that follows you, texture locked to world space
const T = textures();
T.grass.repeat.set(320, 320);
const groundMat = new THREE.MeshLambertMaterial({ map: T.grass, color: GROUND_TINT.street });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), groundMat);
ground.receiveShadow = true;
scene.add(ground);

// Keep at least ~70 degrees of horizontal view, so a phone held upright still
// shows the trail ahead and not just a sliver of it.
function fitCamera() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  const minH = (70 * Math.PI) / 180;
  const vForH = (2 * Math.atan(Math.tan(minH / 2) / camera.aspect) * 180) / Math.PI;
  camera.fov = Math.min(100, Math.max(74, vForH));
  camera.updateProjectionMatrix();
}
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
    $('stats').innerHTML = `${fmtDist(bike.dist)} ridden in ${fmtRide(bike.rideTime)}<br>${path.regions.list[region]?.name || ''} · ${fmtClock(hours)} · ${MOON_NAMES[Math.round(moonPhase() * 8) % 8]}<br><span style="opacity:.7">Route #${seed}</span>`;
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
    sky.update(dt, hours, camera, moonPhase());
  }
  lightWalls(sky.pal, sky.night * (1 - 0.45 * sky.moonLight));
  // trail lights come on at dusk, a little before full dark
  lightLamps(THREE.MathUtils.smoothstep(-sky.sunDir.y, -0.07, 0.07));
  touch.update(started && !paused, bike.cruise, cruiseLabel());
  renderer.render(scene, camera);
}

function step(dt) {
  const inp = input.poll();
  for (const e of inp.events) {
    if (e === 'pause') setPaused(true);
    else if (e === 'bell') sound.bell();
    else if (e === 'units') {
      metric = !metric;
      note(metric ? 'km/h' : 'mph');
    } else if (e === 'time') {
      clock += 1;
      hours = clock % 24;
      note(fmtClock(hours));
    } else if (e === 'mute') note(sound.toggleMute() ? 'Sound off' : 'Sound on');
    else if (e === 'help') $('help').classList.toggle('hidden');
    else if (e === 'fullscreen') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    } else if (e === 'cruise') note(bike.cruise ? 'Cruise off' : `Cruise on · ${cruiseLabel()}`);
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
    notify: note,
    thump: (a) => sound.thump(a),
    laneOffset: (s, lane) => npcs.laneOffset(s, lane),
    cruiseSpeed: cruiseMph * 0.44704,
  };
  const r = bike.update(dt, inp, env);
  const traffic = npcs.update(dt, bike, env);
  world.update(bike.s, 1);
  sky.update(dt, hours, camera, moonPhase());

  // region changes → a quiet title card
  const p = path.pts[Math.floor(bike.s)];
  if (p && p.r !== region) {
    const prev = region;
    region = p.r;
    const reg = path.regions.list[region];
    if (prev >= 0) toast(reg.name, reg.sub);
  }
  tint.lerp(new THREE.Color(GROUND_TINT[p?.type] ?? GROUND_TINT.street), Math.min(1, dt * 0.25));
  groundMat.color.copy(tint).multiplyScalar(1);
  ground.position.set(Math.round(bike.x / 5) * 5, 0, Math.round(bike.z / 5) * 5);

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
    speed: bike.v,
    surface: r.surf,
    coasting: bike.pedal < 0.15,
    habitat: p?.type,
    night: sky.night,
    hour: hours,
    carDist: traffic.carDist,
    carSpeed: traffic.carSpeed,
  });
}

// The first chunks are already built; let the title card go live.
requestAnimationFrame(() => {
  bike.drawComputer({ speed: '0.0', speedUnit: 'mph', dist: fmtDist(0), clock: fmtClock(hours), ride: fmtRide(0), night: 0 });
  $('title').classList.remove('loading');
  $('title').querySelector('.go').textContent = handheld ? 'Tap to ride' : 'Click to ride';
});
frame();

// handy for poking at things from the console
window.__ride = { bike, path, world, sky, npcs, input, renderer, get hours() { return hours; }, set hours(h) { clock = Math.floor(clock / 24) * 24 + h; hours = h; }, get clock() { return clock; }, set clock(c) { clock = c; hours = c % 24; }, moonPhase, get cruiseMph() { return cruiseMph; } };
