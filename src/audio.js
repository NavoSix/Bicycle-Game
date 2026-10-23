// All sound is synthesized with WebAudio — no asset files.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    // noise buffers
    const len = ctx.sampleRate * 4;
    const white = ctx.createBuffer(1, len, ctx.sampleRate);
    const brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = white.getChannelData(0);
    const b = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * w[i]) / 1.02;
      b[i] = last * 3.5;
    }
    this.white = white;
    const loop = (buf, filterType, freq, q = 0.7) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = Math.random();
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start(0, Math.random() * 3);
      return { src, f, g };
    };
    this.wind = loop(brown, 'lowpass', 400);
    this.roll = loop(white, 'bandpass', 260, 0.8);
    this.traffic = loop(brown, 'lowpass', 300);
    this.hum = loop(brown, 'lowpass', 160);
    this.cicada = loop(white, 'bandpass', 5200, 6);
    // rain: a hiss on top, a softer roar on leaves and pavement underneath
    this.rainHi = loop(white, 'highpass', 2500, 0.5);
    this.rainLo = loop(brown, 'lowpass', 900, 0.6);
    this.brown = brown;
    // cicada buzz pulsing
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.18;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0;
    lfo.connect(lfoG).connect(this.cicada.g.gain);
    lfo.start();
    this.cicadaLfo = lfoG;
    // crickets
    const cr = ctx.createOscillator();
    cr.frequency.value = 4600;
    const crAm = ctx.createGain();
    crAm.gain.value = 0;
    const crPulse = ctx.createOscillator();
    crPulse.type = 'square';
    crPulse.frequency.value = 28;
    const crPG = ctx.createGain();
    crPG.gain.value = 0;
    crPulse.connect(crPG).connect(crAm.gain);
    cr.connect(crAm).connect(this.master);
    cr.start();
    crPulse.start();
    this.cricket = { g: crAm, pg: crPG };

    this.nextTick = 0;
    this.nextPlank = 0;
    this.nextBird = ctx.currentTime + 2;
    this.nextFrog = ctx.currentTime + 4;
  }

  set(param, v, k = 0.15) {
    param.setTargetAtTime(v, this.ctx.currentTime, k);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.set(this.master.gain, this.muted ? 0 : 0.8, 0.05);
    return this.muted;
  }

  click(t, freq, gain, dur = 0.012) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 3, dur + 0.02);
  }

  chirp(t, f0, f1, dur, gain, type = 'sine') {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) {
      pan.pan.value = this._pan ?? 0;
      o.connect(g).connect(pan).connect(this.master);
    } else o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  bird(t, habitat) {
    const r = Math.random();
    this._pan = Math.random() * 1.6 - 0.8;
    const v = 0.03 + Math.random() * 0.04;
    if (r < 0.3) {
      // cardinal: "cheer cheer cheer"
      const n = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) this.chirp(t + i * 0.32, 3900, 1900, 0.22, v);
    } else if (r < 0.55) {
      // mockingbird: a jumble of phrases, each repeated
      for (let p = 0; p < 3; p++) {
        const a = 1800 + Math.random() * 2600;
        const b = a * (0.6 + Math.random() * 0.9);
        for (let i = 0; i < 3; i++) this.chirp(t + p * 0.6 + i * 0.16, a, b, 0.11, v);
      }
    } else if (r < 0.75) {
      // wren-ish trill
      for (let i = 0; i < 10; i++) this.chirp(t + i * 0.07, 4200, 3000, 0.05, v * 0.8);
    } else if (r < 0.9 && habitat !== 'town') {
      // red-shouldered hawk "kee-ah"
      for (let i = 0; i < 3; i++) this.chirp(t + i * 0.7, 2600, 1500, 0.45, v * 0.6, 'triangle');
    } else {
      // mourning dove
      this.chirp(t, 520, 640, 0.35, v * 0.9, 'sine');
      this.chirp(t + 0.45, 640, 560, 0.6, v * 0.9, 'sine');
      this.chirp(t + 1.15, 560, 520, 0.5, v * 0.7, 'sine');
    }
  }

  frog(t) {
    this._pan = Math.random() * 1.6 - 0.8;
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 180 + Math.random() * 300;
    for (let i = 0; i < n; i++) this.chirp(t + i * 0.22, base * 1.3, base, 0.12, 0.035, 'square');
  }

  bell() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._pan = 0;
    for (const k of [0, 0.16]) {
      for (const [f, gn] of [[2350, 0.12], [3720, 0.05], [5300, 0.025]]) {
        const o = this.ctx.createOscillator();
        o.frequency.value = f;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(gn, t + k);
        g.gain.exponentialRampToValueAtTime(0.0001, t + k + 1.2);
        o.connect(g).connect(this.master);
        o.start(t + k);
        o.stop(t + k + 1.3);
      }
    }
  }

  // One footfall: hollow on boards, a tap on pavement, a soft scuff on sand or grass.
  footstep(surface, run) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = run ? 1.4 : 1;
    if (surface === 'board' || surface === 'bridge') {
      this.chirp(t, 160, 90, 0.09, 0.07 * g, 'sine');
      this.click(t, 420, 0.1 * g, 0.05);
    } else if (surface === 'grass' || surface === 'dirt') {
      this.click(t, 1400 + Math.random() * 600, 0.05 * g, 0.07);
    } else {
      this.click(t, 2200, 0.06 * g, 0.03);
      this.click(t + 0.012, 900, 0.04 * g, 0.04);
    }
  }

  // Thunder: a crack if it's close, then a long rolling rumble.
  thunder(power = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (power > 0.6) this.click(t, 1800, 0.5 * power, 0.25);
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(200 + power * 500, t);
    f.frequency.exponentialRampToValueAtTime(60, t + 4.5);
    const g = ctx.createGain();
    const len = 3 + Math.random() * 3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25 + power * 0.9, t + 0.15 + (1 - power) * 0.6);
    // a few rolls as it echoes off the cloud base
    for (let k = 1; k < 4; k++) g.gain.exponentialRampToValueAtTime((0.2 + power * 0.6) * Math.random() + 0.05, t + (k * len) / 4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 2, len + 0.2);
  }

  thump(a = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.chirp(t, 140, 50, 0.18, 0.25 * a, 'sine');
    this.click(t, 400, 0.3 * a, 0.08);
  }

  update(dt, st) {
    const ctx = this.ctx;
    if (!ctx) return;
    const v = st.speed;
    const t = ctx.currentTime;
    this.set(this.wind.g.gain, Math.min(0.5, (v / 10) ** 2 * 0.45));
    this.set(this.wind.f.frequency, 250 + v * 90);
    const rollG = { trail: 0.05, trailw: 0.06, concrete: 0.055, bridge: 0.055, road: 0.06, board: 0.09, dirt: 0.11, grass: 0.12 }[st.surface] || 0.05;
    this.set(this.roll.g.gain, Math.min(1, v / 6) * rollG);
    this.set(this.roll.f.frequency, st.surface === 'grass' || st.surface === 'dirt' ? 650 : 200 + v * 25);

    // freewheel ratchet while coasting
    if (st.coasting && v > 0.6) {
      const rate = (v / 2.1) * 18;
      if (this.nextTick < t) this.nextTick = t;
      while (this.nextTick < t + 0.08) {
        this.click(this.nextTick, 3200, 0.05);
        this.nextTick += 1 / rate;
      }
    } else this.nextTick = t;

    // planks on the boardwalk, expansion joints in concrete
    const joint = { board: [0.2, 180, 0.12], concrete: [4.5, 140, 0.07], bridge: [3, 140, 0.06] }[st.surface];
    if (joint && v > 0.5) {
      if (this.nextPlank < t) this.nextPlank = t;
      while (this.nextPlank < t + 0.08) {
        this.click(this.nextPlank, joint[1], joint[2], 0.04);
        this.nextPlank += joint[0] / v;
      }
    }

    // traffic
    const car = st.carDist ?? Infinity;
    const near = car < 120 ? Math.min(1, (1 - car / 120) ** 2) * Math.min(1, st.carSpeed / 12) : 0;
    this.set(this.traffic.g.gain, near * 0.5 + (st.habitat === 'town' ? 0.05 : 0), 0.08);
    this.set(this.traffic.f.frequency, 200 + near * 600, 0.08);
    this.set(this.hum.g.gain, st.habitat === 'town' || st.habitat === 'lakeloop' ? 0.12 : ['street', 'suburbTrail', 'corridor'].includes(st.habitat) ? 0.05 : 0.015, 1.5);

    // rain
    const rain = st.rain || 0;
    this.set(this.rainHi.g.gain, rain * 0.14, 0.6);
    this.set(this.rainLo.g.gain, rain * 0.35, 0.6);

    // ambience
    const day = (1 - st.night) * (1 - Math.min(1, rain * 1.5));
    const woods = ['hammock', 'flatwoods', 'wetland', 'lake', 'grove', 'suburbTrail', 'railtrail', 'foottrail', 'corridor'].includes(st.habitat);
    const hot = st.hour > 10.5 && st.hour < 19 ? 1 : 0.3;
    const cic = woods ? 0.02 * day * hot : 0.004 * day;
    this.set(this.cicada.g.gain, cic, 2);
    this.set(this.cicadaLfo.gain, cic * 0.9, 2);
    const crick = st.night * 0.006;
    this.set(this.cricket.g.gain, crick, 2);
    this.set(this.cricket.pg.gain, crick, 2);

    if (t > this.nextBird) {
      if (day > 0.3) this.bird(t + 0.05, st.habitat);
      this.nextBird = t + (st.habitat === 'town' ? 8 : 2.5) + Math.random() * 7;
    }
    if (t > this.nextFrog) {
      // the frogs go wild after a summer storm
      const chorus = (st.wet || 0) > 0.3;
      if (st.habitat === 'wetland' || st.habitat === 'lake' || (st.night > 0.5 && woods) || chorus) {
        this.frog(t + 0.05);
        if (chorus) this.frog(t + 0.3 + Math.random() * 0.5);
      }
      this.nextFrog = t + (chorus ? 0.6 + Math.random() * 1.5 : 1.5 + Math.random() * 5);
    }
  }
}
