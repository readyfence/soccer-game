export const HALF_L = 52.5;
export const HALF_W = 34;
export const GOAL_HW = 3.66;
export const GOAL_H = 2.44;
export const GOAL_D = 2.2;
export const POST_R = 0.06;
export const BALL_R = 0.11;
export const GROUND_W = 125;
export const GROUND_D = 88;
export const PEN_DEPTH = 16.5;
export const PEN_HW = 20.16;

export const KITS = {
  home: { name: 'Cursor FC', short: 'CUR', shirt: 0x1d4fd6, shorts: 0xf4f6fb, socks: 0x1d4fd6, trim: 0xffffff, number: '#ffffff', gk: 0x18c26b },
  away: { name: 'Red Lions', short: 'RDL', shirt: 0xc8102e, shorts: 0x151515, socks: 0xc8102e, trim: 0x111111, number: '#ffffff', gk: 0xf2c200 },
};

export const DIFF_ORDER = ['beginner', 'amateur', 'semipro', 'professional', 'worldclass', 'legendary', 'ultimate'];

const DIFF_ALIAS = { easy: 'amateur', normal: 'professional', hard: 'worldclass', 'semi-pro': 'semipro', 'world class': 'worldclass' };

// One object per level drives every AI term. Team/player ratings still scale on top of this.
export const DIFFICULTY = {
  beginner: {
    label: 'Beginner', short: 'BEG',
    blurb: 'Slow AI, lots of time on the ball, and a helping hand.',
    speed: 0.78, reaction: 1.40, decision: 1.35,
    press: 0.42, pressers: 1, steal: 0.24, tackleTiming: 0.35,
    shotErr: 2.15, shotPower: 0.82, passErr: 1.85, through: 0.22, technique: 0.15,
    gkSave: 0.34, gkPos: 0.40, line: 0.25, mark: 0.35,
    dribble: 0.40, sprint: 0.55, assist: 0.55, qBonus: -0.28,
  },
  amateur: {
    label: 'Amateur', short: 'AM',
    blurb: 'A real match, just kinder — light press and messy finishing.',
    speed: 0.82, reaction: 1.18, decision: 1.15,
    press: 0.52, pressers: 1, steal: 0.32, tackleTiming: 0.45,
    shotErr: 1.85, shotPower: 0.88, passErr: 1.55, through: 0.35, technique: 0.28,
    gkSave: 0.40, gkPos: 0.50, line: 0.35, mark: 0.45,
    dribble: 0.52, sprint: 0.65, assist: 0.38, qBonus: -0.18,
  },
  semipro: {
    label: 'Semi-Pro', short: 'SP',
    blurb: 'Sharper runs and tackles. Loose touches start to cost you.',
    speed: 0.90, reaction: 0.95, decision: 0.85,
    press: 0.68, pressers: 1, steal: 0.55, tackleTiming: 0.62,
    shotErr: 1.25, shotPower: 0.95, passErr: 1.15, through: 0.50, technique: 0.45,
    gkSave: 0.50, gkPos: 0.62, line: 0.50, mark: 0.60,
    dribble: 0.70, sprint: 0.80, assist: 0.22, qBonus: -0.06,
  },
  professional: {
    label: 'Professional', short: 'PRO',
    blurb: 'A fair match. The AI plays proper football without cheating.',
    speed: 0.96, reaction: 0.72, decision: 0.62,
    press: 0.82, pressers: 2, steal: 0.78, tackleTiming: 0.78,
    shotErr: 1.00, shotPower: 1.00, passErr: 0.95, through: 0.65, technique: 0.62,
    gkSave: 0.58, gkPos: 0.72, line: 0.62, mark: 0.72,
    dribble: 0.82, sprint: 0.88, assist: 0.12, qBonus: 0,
  },
  worldclass: {
    label: 'World Class', short: 'WC',
    blurb: 'Organised and clinical. Mistakes get punished.',
    speed: 1.02, reaction: 0.48, decision: 0.42,
    press: 1.00, pressers: 2, steal: 1.05, tackleTiming: 0.92,
    shotErr: 0.68, shotPower: 1.06, passErr: 0.70, through: 0.82, technique: 0.80,
    gkSave: 0.72, gkPos: 0.85, line: 0.78, mark: 0.88,
    dribble: 0.95, sprint: 0.96, assist: 0.05, qBonus: 0.08,
  },
  legendary: {
    label: 'Legendary', short: 'LEG',
    blurb: 'Near-perfect passing, clinical finishing, and pressing traps.',
    speed: 1.06, reaction: 0.32, decision: 0.28,
    press: 1.18, pressers: 3, steal: 1.22, tackleTiming: 1.05,
    shotErr: 0.42, shotPower: 1.10, passErr: 0.48, through: 0.95, technique: 0.94,
    gkSave: 0.84, gkPos: 0.95, line: 0.90, mark: 1.00,
    dribble: 1.08, sprint: 1.02, assist: 0.02, qBonus: 0.14,
  },
  ultimate: {
    label: 'Ultimate', short: 'ULT',
    blurb: 'Legendary AI, quicker still, and no help for you.',
    speed: 1.10, reaction: 0.20, decision: 0.18,
    press: 1.28, pressers: 3, steal: 1.35, tackleTiming: 1.15,
    shotErr: 0.32, shotPower: 1.14, passErr: 0.36, through: 1.00, technique: 1.00,
    gkSave: 0.90, gkPos: 1.00, line: 1.00, mark: 1.08,
    dribble: 1.15, sprint: 1.08, assist: 0, qBonus: 0.18,
  },
};

export function resolveDifficulty(id) {
  const key = DIFF_ALIAS[id] || id;
  return DIFFICULTY[key] ? key : 'professional';
}
