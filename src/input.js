const KEY_ACTIONS = {
  Space: 'shot', KeyF: 'finesse', KeyR: 'power', KeyC: 'chip', KeyE: 'pass', KeyQ: 'through', KeyX: 'cross',
  KeyV: 'clear', KeyK: 'tackle', KeyL: 'slide', Tab: 'switch', Enter: 'skip',
};
const MOVE_KEYS = {
  KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

export const CONTROLS = {
  attack: [
    ['W A S D / Arrows', 'Move'],
    ['Shift', 'Sprint'],
    ['Space (hold)', 'Shot'],
    ['Ctrl + Space  or  F', 'Finesse shot (curls to far corner)'],
    ['R (hold)', 'Power shot'],
    ['C (hold)', 'Chip / lob'],
    ['E (hold)', 'Ground pass'],
    ['Q (hold)', 'Through ball / lofted pass'],
    ['X (hold)', 'Cross (from wide areas)'],
    ['V (hold)', 'Clearance / long ball'],
    ['Hold ← / → while kicking', 'Add curve'],
  ],
  defend: [
    ['K', 'Standing tackle'],
    ['L', 'Slide tackle'],
    ['Tab', 'Switch player'],
    ['G', 'Toggle camera'],
    ['H', 'Show / hide controls'],
    ['Esc / P', 'Pause'],
    ['M', 'Mute'],
    ['Enter / Space', 'Skip celebration & replay'],
  ],
  pad: [
    ['Left stick', 'Move'],
    ['RT', 'Sprint'],
    ['B (hold)', 'Shot  ·  defending: slide tackle'],
    ['RB + B', 'Finesse shot'],
    ['LB + B', 'Power shot'],
    ['LT + B', 'Chip'],
    ['A (hold)', 'Pass  ·  defending: standing tackle'],
    ['X (hold)', 'Through ball'],
    ['Y (hold)', 'Cross'],
    ['D-pad ↓', 'Clearance'],
    ['LB (defending)', 'Switch player'],
    ['Start', 'Pause'],
  ],
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.ui = new Set();
    this.ctrl = false;
    this.padPrev = [];
    this.padActions = {};
    this.usingPad = false;
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      for (const a of this.down) this.released.add(a);
      this.down.clear();
      this.keys.clear();
    });
  }

  onKey(e, isDown) {
    const code = e.code;
    if (code === 'Tab' || code === 'Space' || code.startsWith('Arrow')) e.preventDefault();
    if (code === 'ControlLeft' || code === 'ControlRight') this.ctrl = isDown;
    if (isDown && e.repeat) return;
    if (isDown) this.keys.add(code);
    else this.keys.delete(code);
    this.usingPad = false;
    if (isDown && ['KeyH', 'Escape', 'KeyP', 'KeyG', 'KeyM'].includes(code)) this.ui.add(code);
    const a = KEY_ACTIONS[code];
    if (!a) return;
    if (isDown) {
      this.down.add(a);
      this.pressed.add(a);
    } else {
      this.down.delete(a);
      this.released.add(a);
    }
  }

  pollGamepad(hasBall) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p && p.connected);
    if (!gp) return null;
    const b = (i) => !!gp.buttons[i]?.pressed;
    const map = (i) => {
      switch (i) {
        case 0: return hasBall ? 'pass' : 'tackle';
        case 1:
          if (!hasBall) return 'slide';
          if (b(5)) return 'finesse';
          if (b(4)) return 'power';
          if (b(6)) return 'chip';
          return 'shot';
        case 2: return 'through';
        case 3: return 'cross';
        case 4: return hasBall ? null : 'switch';
        case 13: return 'clear';
        default: return null;
      }
    };
    for (const i of [0, 1, 2, 3, 4, 13]) {
      const now = b(i);
      const was = !!this.padPrev[i];
      if (now && !was) {
        const a = map(i);
        this.padActions[i] = a;
        if (a) {
          this.down.add(a);
          this.pressed.add(a);
          this.usingPad = true;
        }
      } else if (!now && was) {
        const a = this.padActions[i];
        if (a) {
          this.down.delete(a);
          this.released.add(a);
        }
        this.padActions[i] = null;
      }
      this.padPrev[i] = now;
    }
    if (b(9) && !this.padPrev[9]) this.ui.add('Escape');
    this.padPrev[9] = b(9);
    let x = gp.axes[0] ?? 0;
    let y = -(gp.axes[1] ?? 0);
    if (b(14)) x = -1;
    if (b(15)) x = 1;
    if (b(12)) y = 1;
    const mag = Math.hypot(x, y);
    if (mag < 0.18) {
      x = 0;
      y = 0;
    } else this.usingPad = true;
    return { x, y, sprint: (gp.buttons[7]?.value ?? 0) > 0.3 };
  }

  // Produces a frame of input with movement expressed in world space for the given camera basis.
  frame(forward, right, hasBall) {
    let ix = 0;
    let iy = 0;
    for (const k of this.keys) {
      const m = MOVE_KEYS[k];
      if (m) {
        ix += m[0];
        iy += m[1];
      }
    }
    let sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const pad = this.pollGamepad(hasBall);
    if (pad && (pad.x || pad.y)) {
      ix = pad.x;
      iy = pad.y;
    }
    if (pad?.sprint) sprint = true;
    const l = Math.hypot(ix, iy);
    if (l > 1) {
      ix /= l;
      iy /= l;
    }
    return {
      move: { x: right.x * ix + forward.x * iy, z: right.z * ix + forward.z * iy },
      sprint,
      ctrl: this.ctrl,
      down: this.down,
      pressed: this.pressed,
      released: this.released,
    };
  }

  endFrame() {
    this.pressed = new Set();
    this.released = new Set();
    this.ui.clear();
  }
}
