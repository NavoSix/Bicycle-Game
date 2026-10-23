// Keyboard, mouse-look, touch and gamepad folded into one small state object.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.lastLook = -10;
    this.events = [];
    this.canvas = canvas;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const map = {
        KeyC: 'cruise', KeyB: 'bell', Space: 'bell', Escape: 'pause', KeyP: 'pause', KeyU: 'units', KeyH: 'help', KeyT: 'time', KeyM: 'mute', KeyF: 'fullscreen',
        Equal: 'cruiseUp', NumpadAdd: 'cruiseUp', BracketRight: 'cruiseUp', Minus: 'cruiseDown', NumpadSubtract: 'cruiseDown', BracketLeft: 'cruiseDown',
      };
      if (map[e.code]) this.events.push(map[e.code]);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    addEventListener('mousemove', (e) => {
      if ((document.pointerLockElement === canvas || this.dragging) && (e.movementX || e.movementY)) {
        // Chrome occasionally reports a huge jump right after locking
        if (Math.abs(e.movementX) > 200 || Math.abs(e.movementY) > 200) return;
        this.lookX += e.movementX;
        this.lookY += e.movementY;
        this.lastLook = performance.now() / 1000;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2 || !document.pointerLockElement) this.dragging = true;
    });
    addEventListener('mouseup', () => (this.dragging = false));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.padPrev = {};
  }

  poll() {
    const k = this.keys;
    let throttle = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0;
    let brake = k.has('KeyS') || k.has('ArrowDown') ? 1 : 0;
    let steer = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    let lx = this.lookX, ly = this.lookY;
    this.lookX = this.lookY = 0;
    let analog = false;

    // on-screen touch controls (see touch.js)
    const tu = this.touchUI;
    if (tu && tu.active) {
      throttle = Math.max(throttle, tu.pedal);
      brake = Math.max(brake, tu.brake);
      if (Math.abs(tu.steer) > 0.02) {
        steer = tu.steer;
        analog = true;
      }
    }

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
      const rt = gp.buttons[7]?.value || 0;
      const lt = gp.buttons[6]?.value || 0;
      if (rt > 0.05) throttle = Math.max(throttle, rt);
      if (lt > 0.05) brake = Math.max(brake, lt);
      const sx = dz(gp.axes[0] || 0);
      if (sx) {
        steer = sx;
        analog = true;
      }
      const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
      if (rx || ry) {
        lx += rx * 14;
        ly += ry * 10;
        this.lastLook = performance.now() / 1000;
      }
      const edge = (i, name) => {
        const p = !!gp.buttons[i]?.pressed;
        if (p && !this.padPrev[i]) this.events.push(name);
        this.padPrev[i] = p;
      };
      edge(0, 'bell');
      edge(2, 'cruise');
      edge(9, 'pause');
      edge(3, 'units');
      edge(12, 'cruiseUp');
      edge(13, 'cruiseDown');
      break;
    }
    const ev = this.events;
    this.events = [];
    return { throttle, brake, steer, sprint, lookX: lx, lookY: ly, lastLook: this.lastLook, events: ev, analog };
  }
}
