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

export const DIFFICULTY = {
  easy: { speed: 0.88, steal: 0.45, shotErr: 1.6, gkSave: 0.45, decision: 0.8 },
  normal: { speed: 0.97, steal: 0.8, shotErr: 1.0, gkSave: 0.62, decision: 0.5 },
  hard: { speed: 1.05, steal: 1.25, shotErr: 0.6, gkSave: 0.78, decision: 0.3 },
};
