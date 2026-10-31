const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, U: 12, D: 13, L: 14, R: 15 };
const DEAD = 0.15;
const MENU_DEAD = 0.48;
export const P1_COLOR = 0x3b9eff;
export const P2_COLOR = 0xff4d4d;
export const P1_HEX = '#3b9eff';
export const P2_HEX = '#ff4d4d';

const PREVENT = new Set(['Tab', 'Space', 'Slash', 'Enter', 'NumpadEnter', 'Numpad0', 'Numpad1', 'Numpad2', 'Numpad3', 'Quote', 'Semicolon']);

const FULL_ACTIONS = {
  Space: 'shot', KeyF: 'finesse', KeyR: 'power', KeyC: 'chip', KeyB: 'bicycle', KeyE: 'pass', KeyQ: 'through',
  KeyX: 'cross', KeyV: 'clear', KeyK: 'tackle', KeyL: 'slide', KeyJ: 'dive', Tab: 'switch', Enter: 'skip',
};
const FULL_MOVE = {
  KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};
const FULL_SPRINT = new Set(['ShiftLeft', 'ShiftRight']);
const FULL_FINESSE = new Set(['ControlLeft', 'ControlRight']);

const P1_MOVE = { KeyW: [0, 1], KeyS: [0, -1], KeyA: [-1, 0], KeyD: [1, 0] };
const P1_ACTIONS = { Space: 'shot', KeyF: 'pass', KeyG: 'through', KeyC: 'chip', KeyB: 'bicycle', KeyQ: 'util', KeyJ: 'dive' };
const P2_MOVE = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const P2_ACTIONS = {
  Enter: 'shot', NumpadEnter: 'shot', KeyK: 'pass', Numpad1: 'pass',
  KeyL: 'through', Numpad2: 'through', Semicolon: 'chip', Numpad3: 'chip',
  Period: 'bicycle', Numpad4: 'bicycle', Slash: 'util', Numpad0: 'util',
  Quote: 'dive',
};

export const CONTROLS = {
  attack: [
    ['W A S D / Arrows', 'Move (1 Player)'],
    ['Shift', 'Sprint (uses stamina)'],
    ['Space (hold)', 'Shot'],
    ['Ctrl + Space  or  F', 'Finesse shot'],
    ['R (hold)', 'Power shot'],
    ['C (hold)', 'Chip / lob'],
    ['B (hold)', 'Bicycle kick (ball in the air)'],
    ['E (hold)', 'Ground pass · throw-in'],
    ['Q (hold)', 'Through ball / lofted throw'],
    ['X (hold)', 'Cross'],
    ['V (hold)', 'Clearance'],
    ['Pens stress', 'High pressure wobbles the aim ring and shrinks the power sweet spot — don’t hesitate'],
  ],
  defend: [
    ['K', 'Standing tackle'],
    ['L', 'Slide tackle'],
    ['J', 'Dive (penalties — aim stick left / right / up)'],
    ['Tab', 'Switch player (GK in 1v1s)'],
    ['L3', 'Toggle camera'],
    ['H / View', 'Controls'],
    ['Esc', 'Quit (asks first)'],
    ['P / Menu', 'Pause'],
    ['U', 'Substitutions (every 7 outs, or half time)'],
    ['M', 'Mute'],
    ['From behind', 'Foul — yellow, second yellow is red'],
  ],
  pad: [
    ['Left stick', 'Move (analog)'],
    ['Right stick', 'Curve / aim'],
    ['RT', 'Sprint (uses stamina)'],
    ['B (hold)', 'Shot'],
    ['LT + B', 'Finesse'],
    ['RB + B', 'Power shot'],
    ['LB + B', 'Chip'],
    ['LT + Y', 'Bicycle kick (volley)'],
    ['A', 'Pass · throw-in · defend: standing tackle'],
    ['X', 'Through · defend: slide · pens: dive (aim with stick)'],
    ['Pens stress', 'Release in the white sweet spot; high stress wobbles the aim'],
    ['Y', 'Cross · defend: clearance'],
    ['R3 or LB tap', 'Switch player (GK in 1v1s)'],
    ['L3', 'Camera'],
    ['Menu', 'Pause'],
    ['View', 'Controls'],
    ['A on setup', 'Join as P1 / P2 (first A is P1)'],
    ['B on setup', 'Leave slot'],
  ],
  p1kb: [
    ['W A S D', 'Move'],
    ['Left Shift', 'Sprint'],
    ['Space', 'Shot'],
    ['F / G', 'Pass / Through'],
    ['R + Space', 'Finesse'],
    ['C', 'Chip'],
    ['B', 'Bicycle kick (air)'],
    ['Q', 'Tackle (defend) · Switch'],
    ['J', 'Dive (penalties — aim with WASD)'],
  ],
  p2kb: [
    ['Arrows', 'Move'],
    ['Right Shift', 'Sprint'],
    ['Enter', 'Shot'],
    ['K or Numpad 1', 'Pass'],
    ['L or Numpad 2', 'Through'],
    ['; or Numpad 3', 'Chip'],
    ['. or Numpad 4', 'Bicycle kick (air)'],
    ['/ or Numpad 0', 'Tackle (defend) · Switch'],
    ["' (quote)", 'Dive (penalties — aim with arrows)'],
  ],
};

function dz(v, zone = DEAD) {
  const a = Math.abs(v);
  if (a < zone) return 0;
  return Math.sign(v) * ((a - zone) / (1 - zone));
}

function readGamepads() {
  const nav = navigator;
  const fn = nav.getGamepads || nav.webkitGetGamepads;
  if (!fn) return [];
  try {
    return fn.call(nav) || [];
  } catch {
    return [];
  }
}

function emptyMenu() {
  return { confirm: false, back: false, navX: 0, navY: 0, lb: false, rb: false, start: false };
}

function rumbleOn(gp, weak, duration, strong) {
  const act = gp?.vibrationActuator;
  if (!act?.playEffect) return;
  const p = act.playEffect('dual-rumble', {
    startDelay: 0,
    duration,
    weakMagnitude: Math.max(0, Math.min(1, weak)),
    strongMagnitude: Math.max(0, Math.min(1, strong ?? weak)),
  });
  if (p && p.catch) p.catch(() => {});
}

export function rumble(weak = 0.3, duration = 80, strong = weak, padIndex = null) {
  try {
    const pads = readGamepads();
    if (padIndex != null) {
      rumbleOn(pads[padIndex], weak, duration, strong);
      return;
    }
    for (const gp of pads) if (gp?.connected) rumbleOn(gp, weak, duration, strong);
  } catch { /* optional */ }
}

function padName(gp, all) {
  const raw = (gp.id || 'Xbox controller').replace(/\(.*\)/g, '').trim() || 'Xbox controller';
  const same = all.filter((p) => p.id === gp.id).length > 1;
  return same ? `${raw} · ${gp.index + 1}` : raw;
}

class PadEdges {
  constructor() {
    this.prev = [];
    this.rise = [];
    this.fall = [];
    this.navHeld = 0;
    this.navClock = 0;
    this.lbMod = false;
    this.action = {};
    this.held = new Set();
  }
}

class Slot {
  constructor(id) {
    this.id = id;
    this.padIndex = null;
    this.kb = null;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.ctrl = false;
    this.menuLatch = false;
  }

  clearActions() {
    this.down.clear();
    this.pressed.clear();
    this.released.clear();
  }

  hold(name) {
    this.down.add(name);
    this.pressed.add(name);
  }

  release(name) {
    this.down.delete(name);
    this.released.add(name);
  }
}

export class Input {
  constructor() {
    this.keys = new Set();
    this.ui = new Set();
    this.menu = emptyMenu();
    this.slotMenu = [emptyMenu(), emptyMenu()];
    this.slots = [new Slot(0), new Slot(1)];
    this.edges = new Map();
    this.playMode = '1p';
    this.onPadChange = null;
    this.onDrop = null;
    this.seen = new Map();
    this.missing = new Map();
    this.dropSlot = null;
    this.dropName = '';
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('gamepadconnected', (e) => this.notePad(e.gamepad, true));
    window.addEventListener('gamepaddisconnected', (e) => this.markMissing(e.gamepad?.index));
  }

  onKey(e, isDown) {
    const code = e.code;
    if (PREVENT.has(code) || code.startsWith('Arrow')) e.preventDefault();
    if (isDown && e.repeat) return;
    if (isDown) this.keys.add(code);
    else this.keys.delete(code);
    if (isDown && ['Escape', 'KeyP', 'KeyH', 'KeyM', 'KeyU', 'F8', 'F9'].includes(code)) this.ui.add(code);
    if (isDown && code === 'KeyG' && this.playMode === '1p') this.ui.add('KeyG');
  }

  connectedPads() {
    return [...readGamepads()].filter((p) => p && p.connected);
  }

  activePad() {
    return this.connectedPads()[0] ?? null;
  }

  labelForIndex(index) {
    const all = this.connectedPads();
    const gp = all.find((p) => p.index === index);
    return gp ? padName(gp, all) : 'Xbox controller';
  }

  markMissing(index) {
    if (index == null || !this.seen.has(index) || this.missing.has(index)) return;
    this.missing.set(index, performance.now());
  }

  dropPad(index) {
    const slot = this.slots.find((s) => s.padIndex === index);
    if (this.onPadChange) this.onPadChange(false, this.labelForIndex(index));
    if (slot && this.playMode !== '1p') {
      this.dropSlot = slot.id;
      this.dropName = `P${slot.id + 1}`;
      slot.padIndex = null;
      if (this.onDrop) this.onDrop(slot.id, this.dropName);
    } else if (slot && this.playMode === '1p') {
      slot.padIndex = null;
    }
    this.seen.delete(index);
    this.edges.delete(index);
    this.missing.delete(index);
  }

  notePad(gp, connected) {
    if (connected) {
      this.missing.delete(gp.index);
      const fresh = !this.seen.has(gp.index);
      this.seen.set(gp.index, gp.id);
      if (fresh && this.onPadChange) this.onPadChange(true, padName(gp, this.connectedPads()));
      return;
    }
    this.markMissing(gp.index);
  }

  pollSeen() {
    const now = this.connectedPads();
    const live = new Set(now.map((p) => p.index));
    const t = performance.now();
    for (const p of now) {
      this.missing.delete(p.index);
      if (!this.seen.has(p.index)) this.notePad(p, true);
    }
    for (const idx of [...this.seen.keys()]) {
      if (live.has(idx)) {
        this.missing.delete(idx);
        continue;
      }
      this.markMissing(idx);
      if (t - this.missing.get(idx) > 900) this.dropPad(idx);
    }
  }

  edgesFor(index) {
    if (!this.edges.has(index)) this.edges.set(index, new PadEdges());
    return this.edges.get(index);
  }

  pressedNow(gp, i, thresh = 0.45) {
    const btn = gp.buttons[i];
    if (!btn) return false;
    return btn.pressed || (btn.value ?? 0) > thresh;
  }

  edge(gp, i, thresh = 0.45) {
    const st = this.edgesFor(gp.index);
    const now = this.pressedNow(gp, i, thresh);
    const was = !!st.prev[i];
    st.prev[i] = now;
    if (now && !was) return 1;
    if (!now && was) return -1;
    return 0;
  }

  sample(gp) {
    const st = this.edgesFor(gp.index);
    st.rise = [];
    st.fall = [];
    for (let i = 0; i < 16; i++) {
      const e = this.edge(gp, i);
      st.rise[i] = e === 1;
      st.fall[i] = e === -1;
    }
    return st;
  }

  claimed(index) {
    return this.slots.some((s) => s.padIndex === index);
  }

  slotByPad(index) {
    return this.slots.find((s) => s.padIndex === index) ?? null;
  }

  bothJoined() {
    if (this.playMode === '1p') return true;
    return this.slots.every((s) => s.padIndex != null || s.kb);
  }

  joinStatus() {
    return this.slots.map((s, i) => {
      if (s.padIndex != null) return { ready: true, text: `P${i + 1}: ${this.labelForIndex(s.padIndex)} ✓` };
      if (s.kb) return { ready: true, text: `P${i + 1}: Keyboard ✓` };
      return { ready: false, text: `P${i + 1}: press A to join` };
    });
  }

  resetJoin() {
    for (const s of this.slots) {
      s.padIndex = null;
      s.kb = null;
      s.clearActions();
    }
    this.dropSlot = null;
  }

  setPlayMode(mode) {
    const was = this.playMode;
    this.playMode = mode;
    if (mode === '1p' || was === '1p') this.resetJoin();
  }

  latchMenu() {
    for (const s of this.slots) {
      s.menuLatch = true;
      s.clearActions();
    }
  }

  pollJoin(gp, st) {
    if (!st?.rise) return null;
    const a = st.rise[BTN.A];
    const b = st.rise[BTN.B];
    const start = st.rise[BTN.MENU];
    const owner = this.slotByPad(gp.index);

    if (this.dropSlot != null && a && !owner) {
      this.slots[this.dropSlot].padIndex = gp.index;
      this.dropSlot = null;
      this.dropName = '';
      return { reclaimed: true };
    }

    if (this.playMode === '1p') return null;

    if (a && !owner) {
      const free = this.slots.find((s) => s.padIndex == null && !s.kb);
      if (free) {
        free.padIndex = gp.index;
        free.kb = null;
        rumble(0.25, 60, 0.3, gp.index);
        return { joined: free.id };
      }
    }
    if (b && owner) {
      owner.padIndex = null;
      owner.clearActions();
      return { left: owner.id };
    }
    if (start && this.bothJoined() && owner) return { start: true };
    return null;
  }

  pollKbJoin() {
    if (this.playMode === '1p' || this.bothJoined()) return;
    if ((this.keys.has('Digit1') || this.keys.has('Numpad1')) && this.slots[0].padIndex == null && !this.slots[0].kb) {
      this.slots[0].kb = 'p1';
    }
    if ((this.keys.has('Digit2') || this.keys.has('Numpad2')) && this.slots[1].padIndex == null && !this.slots[1].kb) {
      this.slots[1].kb = 'p2';
    }
  }

  pollKbMenu() {
    const dest = this.menu;
    const prev = this._kbPrev ?? new Set();
    const hit = (code) => this.keys.has(code) && !prev.has(code);
    if (hit('ArrowLeft')) dest.navX = dest.navX || -1;
    if (hit('ArrowRight')) dest.navX = dest.navX || 1;
    if (hit('ArrowUp')) dest.navY = dest.navY || -1;
    if (hit('ArrowDown')) dest.navY = dest.navY || 1;
    if (hit('Enter') || hit('NumpadEnter')) dest.confirm = true;
    this._kbPrev = new Set(this.keys);
  }

  fillMenu(st, gp, dt, dest) {
    dest.confirm = !!(st.rise && st.rise[BTN.A]);
    dest.back = !!(st.rise && st.rise[BTN.B]);
    dest.lb = !!(st.rise && st.rise[BTN.LB]);
    dest.rb = !!(st.rise && st.rise[BTN.RB]);
    dest.start = !!(st.rise && st.rise[BTN.MENU]);
    let x = 0;
    let y = 0;
    if (this.pressedNow(gp, BTN.L)) x = -1;
    else if (this.pressedNow(gp, BTN.R)) x = 1;
    else {
      const ax = dz(gp.axes[0] ?? 0, MENU_DEAD);
      if (ax < -0.35) x = -1;
      else if (ax > 0.35) x = 1;
    }
    if (this.pressedNow(gp, BTN.U)) y = -1;
    else if (this.pressedNow(gp, BTN.D)) y = 1;
    else {
      const ay = dz(gp.axes[1] ?? 0, MENU_DEAD);
      if (ay < -0.35) y = -1;
      else if (ay > 0.35) y = 1;
    }
    const dir = x || y ? (x + 2) * 3 + (y + 2) : 0;
    if (!dir) {
      st.navHeld = 0;
      st.navClock = 0;
      return;
    }
    if (st.navHeld !== dir) {
      st.navHeld = dir;
      st.navClock = 0.36;
      dest.navX = x;
      dest.navY = y;
      return;
    }
    st.navClock -= dt;
    if (st.navClock <= 0) {
      st.navClock = 0.14;
      dest.navX = x;
      dest.navY = y;
    }
  }

  sticks(gp) {
    let x = dz(gp.axes[0] ?? 0);
    let y = dz(-(gp.axes[1] ?? 0));
    if (this.pressedNow(gp, BTN.L)) x = -1;
    if (this.pressedNow(gp, BTN.R)) x = 1;
    if (this.pressedNow(gp, BTN.U)) y = 1;
    if (this.pressedNow(gp, BTN.D)) y = -1;
    const mag = Math.hypot(x, y) || 1;
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }
    let cx = dz(gp.axes[2] ?? 0);
    let cy = dz(-(gp.axes[3] ?? 0));
    const cm = Math.hypot(cx, cy) || 1;
    if (cm > 1) {
      cx /= cm;
      cy /= cm;
    }
    const sprint = (gp.buttons[BTN.RT]?.value ?? 0) > 0.3;
    return { x, y, cx, cy, sprint };
  }

  pollPlayPad(gp, slot, hasBall) {
    const st = this.edgesFor(gp.index);
    if (slot.menuLatch) {
      const faces = [BTN.A, BTN.B, BTN.X, BTN.Y, BTN.LB, BTN.RB];
      if (faces.every((i) => !this.pressedNow(gp, i))) slot.menuLatch = false;
      else return this.sticks(gp);
    }
    slot._padHeld = slot._padHeld ?? new Set();
    const lt = this.pressedNow(gp, BTN.LT, 0.35);
    const rb = this.pressedNow(gp, BTN.RB);
    const lb = this.pressedNow(gp, BTN.LB);
    const bind = (i, name) => {
      if (st.rise[i] && name) {
        st.action[i] = name;
        slot.hold(name);
      } else if (st.fall[i]) {
        const a = st.action[i];
        st.action[i] = null;
        if (a) slot.release(a);
      }
      // Only mark pad-originated holds. Copying every slot.down action into
      // _padHeld (including Space/E) made keyboard shot/pass never release.
      if (st.action[i]) slot._padHeld.add(st.action[i]);
    };
    bind(BTN.A, hasBall ? 'pass' : 'tackle');
    bind(BTN.B, lt ? 'finesse' : rb ? 'power' : lb ? (st.lbMod = true, 'chip') : 'shot');
    bind(BTN.X, hasBall ? 'through' : 'slide');
    if (!hasBall) {
      if (st.rise[BTN.X]) {
        slot.hold('dive');
        slot._padHeld.add('dive');
      } else if (st.fall[BTN.X]) slot.release('dive');
    }
    bind(BTN.Y, lt ? 'bicycle' : hasBall ? 'cross' : 'clear');
    bind(BTN.R3, 'switch');
    if (st.rise[BTN.LB]) st.lbMod = false;
    if (st.fall[BTN.LB] && !st.lbMod) {
      slot.hold('switch');
      slot.release('switch');
    }
    return this.sticks(gp);
  }

  applyKb(slot, scheme, hasBall) {
    const moveMap = scheme === 'p2' ? P2_MOVE : scheme === 'p1' ? P1_MOVE : FULL_MOVE;
    const actMap = scheme === 'p2' ? P2_ACTIONS : scheme === 'p1' ? P1_ACTIONS : FULL_ACTIONS;
    let ix = 0;
    let iy = 0;
    for (const k of this.keys) {
      const m = moveMap[k];
      if (m) {
        ix += m[0];
        iy += m[1];
      }
    }
    let sprint = false;
    if (scheme === 'full') sprint = [...FULL_SPRINT].some((k) => this.keys.has(k));
    else if (scheme === 'p1') sprint = this.keys.has('ShiftLeft');
    else sprint = this.keys.has('ShiftRight');
    slot.ctrl = scheme === 'full' ? [...FULL_FINESSE].some((k) => this.keys.has(k))
      : scheme === 'p1' ? this.keys.has('KeyR') : this.keys.has('ControlRight');

    for (const [code, name] of Object.entries(actMap)) {
      const down = this.keys.has(code);
      let action = name;
      if (name === 'util') action = hasBall ? 'switch' : 'tackle';
      const was = slot.down.has(action) && slot._kbAct === code;
      if (down && !slot.down.has(action)) slot.hold(action);
      if (!down && slot.down.has(action) && !slot._fromPad) {
        // release handled below via snapshot of codes
      }
      if (down) slot._lastKb = { code, action };
    }
    // Release keyboard actions not held
    const wanted = new Set();
    for (const [code, name] of Object.entries(actMap)) {
      if (!this.keys.has(code)) continue;
      wanted.add(name === 'util' ? (hasBall ? 'switch' : 'tackle') : name);
    }
    if (scheme === 'full' && this.keys.has('Space') && slot.ctrl) {
      wanted.delete('shot');
      wanted.add('finesse');
      if (!slot.down.has('finesse')) slot.hold('finesse');
    }
    for (const a of [...slot.down]) {
      if (!wanted.has(a) && !slot._padHeld?.has(a)) slot.release(a);
    }
    const l = Math.hypot(ix, iy) || 1;
    if (l > 1) {
      ix /= l;
      iy /= l;
    }
    return { x: ix, y: iy, cx: 0, cy: 0, sprint };
  }

  world(ix, iy, cx, cy, forward, right) {
    return {
      move: { x: right.x * ix + forward.x * iy, z: right.z * ix + forward.z * iy },
      curve: { x: right.x * cx + forward.x * cy, z: right.z * cx + forward.z * cy },
    };
  }

  poll(forward, right, opts = {}) {
    const play = !!opts.play;
    const menu = !!opts.menu;
    const joinMode = !!opts.join;
    const dt = opts.dt ?? 1 / 60;
    const hasBallAt = opts.hasBallAt ?? (() => false);
    this.pollSeen();
    this.menu = emptyMenu();
    this.slotMenu = [emptyMenu(), emptyMenu()];
    for (const s of this.slots) {
      s.pressed = new Set();
      s.released = new Set();
    }

    const pads = this.connectedPads();
    let joinEvent = null;

    if (this.playMode === '1p' && this.slots[0].padIndex == null && pads[0]) {
      this.slots[0].padIndex = pads[0].index;
    }

    for (const gp of pads) {
      const st = this.sample(gp);
      const wasOwner = this.slotByPad(gp.index);
      if (joinMode || this.dropSlot != null) {
        const ev = this.pollJoin(gp, st);
        if (ev) joinEvent = ev;
      }
      if (st.rise[BTN.VIEW]) this.ui.add('KeyH');
      if (st.rise[BTN.MENU] && play) this.ui.add('KeyP');
      if (st.rise[BTN.L3] && play) this.ui.add('KeyG');

      const slot = this.playMode === '1p' ? this.slots[0] : this.slotByPad(gp.index);
      if (menu) {
        const dest = slot ? this.slotMenu[slot.id] : this.menu;
        this.fillMenu(st, gp, dt, dest);
        if (joinMode && (!wasOwner || joinEvent?.joined != null)) {
          dest.confirm = false;
          dest.start = false;
        }
        if (joinMode && slot && st.rise[BTN.B]) dest.back = false;
        this.menu.confirm = this.menu.confirm || dest.confirm;
        this.menu.back = this.menu.back || dest.back;
        this.menu.navX = this.menu.navX || dest.navX;
        this.menu.navY = this.menu.navY || dest.navY;
        this.menu.lb = this.menu.lb || dest.lb;
        this.menu.rb = this.menu.rb || dest.rb;
        this.menu.start = this.menu.start || dest.start;
      }
    }
    if (joinMode) this.pollKbJoin();
    if (menu) this.pollKbMenu();

    const frames = this.slots.map((slot, i) => {
      const gp = slot.padIndex != null ? pads.find((p) => p.index === slot.padIndex) : null;
      let stick = { x: 0, y: 0, cx: 0, cy: 0, sprint: false };
      slot._padHeld = new Set();
      if (play && gp) {
        stick = this.pollPlayPad(gp, slot, hasBallAt(i)) || stick;
      }
      const scheme = this.playMode === '1p' ? 'full' : slot.kb;
      if (play && (scheme === 'full' || scheme === 'p1' || scheme === 'p2')) {
        const kb = this.applyKb(slot, scheme, hasBallAt(i));
        if (!stick.x && !stick.y) {
          stick.x = kb.x;
          stick.y = kb.y;
        }
        stick.sprint = stick.sprint || kb.sprint;
        slot.ctrl = slot.ctrl || kb.ctrl;
      }
      const w = this.world(stick.x, stick.y, stick.cx, stick.cy, forward, right);
      const l = Math.hypot(stick.x, stick.y);
      if (l > 1) { /* already normalized in sticks */ }
      return {
        move: w.move,
        curve: w.curve,
        sprint: stick.sprint,
        ctrl: slot.ctrl,
        down: slot.down,
        pressed: slot.pressed,
        released: slot.released,
        padIndex: slot.padIndex,
      };
    });

    const f0 = frames[0];
    return {
      ...f0,
      slots: frames,
      menu: this.menu,
      slotMenu: this.slotMenu,
      joinEvent,
      bothJoined: this.bothJoined(),
      dropSlot: this.dropSlot,
    };
  }

  // Back-compat name used by the game loop.
  frame(forward, right, opts) {
    return this.poll(forward, right, opts);
  }

  endFrame() {
    this.ui.clear();
    for (const s of this.slots) {
      s.pressed = new Set();
      s.released = new Set();
    }
  }
}
