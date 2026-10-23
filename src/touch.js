// On-screen controls for phones and tablets. They only appear once the
// screen is actually touched, and fade back when you're just cruising.
//
//   bottom left   steering slider: drag sideways, springs back to centre
//   bottom right  pedal (hold) and brake (hold)
//   above those   cruise on/off with its speed, and − / + to change it
//   top right     bell and pause
//   bottom centre whatever you can do right here: walk, ride, read, look
//   anywhere else drag to look around
// On foot, the steering slider becomes a move stick and the bike buttons hide.
export class TouchControls {
  constructor(canvas, input) {
    this.input = input;
    this.state = { steer: 0, pedal: 0, brake: 0, moveX: 0, moveY: 0, active: false };
    this.mode = 'ride';
    input.touchUI = this.state;
    const root = (this.root = document.createElement('div'));
    root.id = 'touchui';
    root.innerHTML = `
      <div class="tc steer"><div class="track"></div><div class="knob"></div></div>
      <div class="tc cruiserow">
        <button class="tbtn small" data-ev="cruiseDown" aria-label="Slower cruise">−</button>
        <button class="tbtn cruise" data-ev="cruise" aria-label="Cruise"><span class="lbl">Cruise</span><span class="spd"></span></button>
        <button class="tbtn small" data-ev="cruiseUp" aria-label="Faster cruise">+</button>
      </div>
      <button class="tc tbtn brake" data-hold="brake" aria-label="Brake">Brake</button>
      <button class="tc tbtn pedal" data-hold="pedal" aria-label="Pedal">Pedal</button>
      <button class="tc tbtn act" data-ev="interact" aria-label="Action"></button>
      <div class="tc corner">
        <button class="tbtn small" data-ev="bell" aria-label="Bell">🔔</button>
        <button class="tbtn small" data-ev="pause" aria-label="Pause">❚❚</button>
      </div>`;
    document.body.appendChild(root);
    this.spd = root.querySelector('.spd');
    this.cruiseBtn = root.querySelector('.cruise');
    this.actBtn = root.querySelector('.act');

    // show the controls the first time a finger touches the screen
    addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch') this.enable();
      },
      { capture: true },
    );
    if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) this.enable();

    // tap buttons
    for (const b of root.querySelectorAll('[data-ev]')) {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        input.events.push(b.dataset.ev);
        b.classList.add('on');
        this.poke();
      });
      const off = () => b.classList.remove('on');
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
    }
    // hold buttons
    for (const b of root.querySelectorAll('[data-hold]')) {
      const k = b.dataset.hold;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        this.state[k] = 1;
        b.classList.add('on');
        this.poke();
      });
      const up = () => {
        this.state[k] = 0;
        b.classList.remove('on');
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    }
    // steering slider
    const pad = root.querySelector('.steer');
    const knob = root.querySelector('.knob');
    let sid = null, sx = 0, sy = 0;
    const range = () => pad.clientWidth / 2 - 30;
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pad.setPointerCapture(e.pointerId);
      sid = e.pointerId;
      const r = pad.getBoundingClientRect();
      sx = r.left + r.width / 2;
      sy = r.top + r.height / 2;
      this.moveSteer(e.clientX - sx, e.clientY - sy, range(), knob);
      this.poke();
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId === sid) this.moveSteer(e.clientX - sx, e.clientY - sy, range(), knob);
    });
    const release = (e) => {
      if (e.pointerId !== sid) return;
      sid = null;
      this.moveSteer(0, 0, range(), knob);
    };
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);

    // drag on the scene to look around
    const looks = new Map();
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      looks.set(e.pointerId, [e.clientX, e.clientY]);
    });
    canvas.addEventListener('pointermove', (e) => {
      const last = looks.get(e.pointerId);
      if (!last) return;
      input.lookX += (e.clientX - last[0]) * 1.4;
      input.lookY += (e.clientY - last[1]) * 1.4;
      input.lastLook = performance.now() / 1000;
      looks.set(e.pointerId, [e.clientX, e.clientY]);
    });
    const end = (e) => looks.delete(e.pointerId);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    this.lastPoke = 0;
  }

  moveSteer(dx, dy, range, knob) {
    if (this.mode === 'walk') {
      // a little joystick: up walks forward, sideways sidesteps, far out runs
      const r = 60;
      const d = Math.hypot(dx, dy);
      const k = d > r ? r / d : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      const run = d > r * 1.4 ? 1.5 : 1;
      this.state.moveX = ((dx * k) / r) * run;
      this.state.moveY = ((-dy * k) / r) * run;
      this.state.steer = 0;
      return;
    }
    const c = Math.max(-range, Math.min(range, dx));
    knob.style.transform = `translateX(${c}px)`;
    this.state.steer = range > 0 ? c / range : 0;
    this.state.moveX = this.state.moveY = 0;
  }

  enable() {
    if (this.state.active) return;
    this.state.active = true;
    document.body.classList.add('touch');
  }

  poke() {
    this.lastPoke = performance.now();
    this.root.classList.remove('idle');
  }

  // called every frame with what the cycle computer shows
  update(visible, cruise, speedLabel, mode = 'ride', action = '') {
    this.root.classList.toggle('show', visible && this.state.active);
    if (mode !== this.mode) {
      this.mode = mode;
      this.root.classList.toggle('walk', mode === 'walk');
      this.state.pedal = this.state.brake = this.state.steer = this.state.moveX = this.state.moveY = 0;
      this.root.querySelector('.knob').style.transform = '';
    }
    if (this.actBtn.textContent !== action) this.actBtn.textContent = action;
    this.actBtn.classList.toggle('hide', !action);
    if (action) this.lastPoke = performance.now();
    this.cruiseBtn.classList.toggle('lit', cruise);
    if (this.spd.textContent !== speedLabel) this.spd.textContent = speedLabel;
    // fade back once you've let go of everything for a while
    const holding = this.state.pedal || this.state.brake || Math.abs(this.state.steer) > 0.01;
    if (holding) this.lastPoke = performance.now();
    this.root.classList.toggle('idle', performance.now() - this.lastPoke > 4000);
  }
}
