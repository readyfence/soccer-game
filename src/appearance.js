// Player looks. Every player is fictional: a look is either chosen in the squad editor
// (stored on the player as `look`) or generated from a hash of the player's id.
//
// Tone: 0 very fair, 1 fair, 2 olive/light tan, 3 light brown, 4 brown, 5 dark brown, 6 very dark.

export const HAIR_STYLES = ['buzz', 'crop', 'slick', 'curly', 'afro', 'dreads', 'long', 'bun', 'bald'];
export const HAIR_COLOUR_NAMES = ['black', 'dark', 'brown', 'light', 'blond', 'red', 'grey'];
export const SKIN_TONES = 7;
export const AVG_HEIGHT = 181;
export const MIN_HEIGHT = 160;
export const MAX_HEIGHT = 198;

const STYLE_FOR_TONE = [
  ['crop', 'crop', 'slick', 'buzz', 'curly', 'long', 'bun'],
  ['buzz', 'buzz', 'curly', 'crop', 'buzz', 'dreads', 'afro'],
];
const LIGHT_COLOURS = ['dark', 'brown', 'brown', 'light', 'blond', 'red', 'dark'];

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < (s ?? '').length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// A stable, varied look generated from any string (player id or name). Youth players
// never get beards.
export function appearanceFor(key) {
  const h = hash(String(key ?? ''));
  const tone = (h >>> 8) % SKIN_TONES;
  return {
    height: 168 + (h % 23),
    tone,
    hair: STYLE_FOR_TONE[tone >= 4 ? 1 : 0][(h >>> 12) % 7],
    hairColour: tone >= 3 ? 'black' : LIGHT_COLOURS[(h >>> 16) % 7],
    beard: 0,
  };
}

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

// The look to draw for a player: his saved look if he has one, else a generated one.
export function lookFor(data) {
  const base = appearanceFor(data?.id || data?.name);
  const saved = data?.look;
  if (!saved) return base;
  return {
    height: clampInt(saved.height, MIN_HEIGHT, MAX_HEIGHT, base.height),
    tone: clampInt(saved.tone, 0, SKIN_TONES - 1, base.tone),
    hair: HAIR_STYLES.includes(saved.hair) ? saved.hair : base.hair,
    hairColour: HAIR_COLOUR_NAMES.includes(saved.hairColour) ? saved.hairColour : base.hairColour,
    beard: clampInt(saved.beard, 0, 2, 0),
  };
}
