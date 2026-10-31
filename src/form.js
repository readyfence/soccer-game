const FORM_KEY = 'socker26.form';
const FORM_VERSION = 1;
const HISTORY = 6;
const NEUTRAL = 6.6;
const WEIGHTS = [0.10, 0.12, 0.15, 0.18, 0.21, 0.24];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round1 = (v) => Math.round(v * 10) / 10;

let memory = null;

function store() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* ignore */ }
  if (!memory) {
    const map = new Map();
    memory = {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => { map.set(k, String(v)); },
      removeItem: (k) => { map.delete(k); },
    };
  }
  return memory;
}

function loadRaw() {
  try {
    const raw = store()?.getItem(FORM_KEY);
    if (!raw) return { version: FORM_VERSION, players: {} };
    const s = JSON.parse(raw);
    if (!s || s.version !== FORM_VERSION || !s.players || typeof s.players !== 'object') {
      return { version: FORM_VERSION, players: {} };
    }
    return s;
  } catch {
    return { version: FORM_VERSION, players: {} };
  }
}

function saveRaw(state) {
  try { store()?.setItem(FORM_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function formKey(data, clubId) {
  const name = String(data?.name || '').trim();
  const club = String(clubId || data?.clubId || '').trim();
  return `${name}|${club}`;
}

function cleanRatings(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((r) => round1(clamp(Number(r), 3, 10)))
    .filter((r) => Number.isFinite(r))
    .slice(-HISTORY);
}

function streakBonus(ratings) {
  let hot = 0;
  let good = 0;
  let cold = 0;
  for (let i = ratings.length - 1; i >= 0; i--) {
    if (ratings[i] >= 8) hot++;
    else break;
  }
  for (let i = ratings.length - 1; i >= 0; i--) {
    if (ratings[i] >= 7) good++;
    else break;
  }
  for (let i = ratings.length - 1; i >= 0; i--) {
    if (ratings[i] < 6) cold++;
    else break;
  }
  return {
    hot,
    good,
    cold,
    bonus: clamp(hot * 0.08 + Math.max(0, good - hot) * 0.04 - cold * 0.08, -0.32, 0.4),
  };
}

function weightedAvg(ratings) {
  const n = ratings.length;
  const w = WEIGHTS.slice(WEIGHTS.length - n);
  let acc = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    acc += ratings[i] * w[i];
    sum += w[i];
  }
  return acc / sum;
}

export function summarizeForm(ratings) {
  const recent = cleanRatings(ratings);
  if (!recent.length) {
    return {
      score: NEUTRAL, games: 0, ratings: [], hot: 0, good: 0, cold: 0, delta: 0, attrMul: 1,
    };
  }
  const { hot, good, cold, bonus } = streakBonus(recent);
  const score = round1(clamp(weightedAvg(recent) + bonus, 4, 9.5));
  const conf = clamp(recent.length / 3, 0, 1);
  const delta = round1(clamp((score - NEUTRAL) * 0.38 * conf, -0.6, 0.7));
  const attrMul = clamp(1 + (score - NEUTRAL) * 0.018 * conf, 0.96, 1.045);
  return { score, games: recent.length, ratings: recent, hot, good, cold, delta, attrMul };
}

export function playerForm(data, clubId) {
  const key = formKey(data, clubId);
  if (!key || key.startsWith('|')) return summarizeForm([]);
  const rec = loadRaw().players[key];
  return summarizeForm(rec?.ratings);
}

export function applyFormRating(raw, form) {
  const delta = form?.games ? form.delta : 0;
  return round1(clamp((Number(raw) || 6) + delta, 3, 10));
}

export function applyFormToData(data, form) {
  const mul = form?.games ? form.attrMul : 1;
  if (!data || !Number.isFinite(mul) || Math.abs(mul - 1) < 0.002) return data;
  const scale = (v) => Math.max(1, Math.min(99, Math.round(Number(v) * mul)));
  return { ...data, pac: scale(data.pac), sho: scale(data.sho), pas: scale(data.pas), def: scale(data.def) };
}

function tierOf(r) {
  return r < 6 ? 'poor' : r < 7 ? 'avg' : r < 8 ? 'good' : r < 9 ? 'great' : 'elite';
}

export function formView(form) {
  if (!form || form.games < 1) {
    return { show: false, dir: 'flat', arrow: '', score: NEUTRAL, label: '', dots: [] };
  }
  const dir = form.score >= 7.3 ? 'up' : form.score <= 5.9 ? 'down' : 'flat';
  const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
  return {
    show: true,
    dir,
    arrow,
    score: form.score,
    label: `Form: ${arrow} ${form.score.toFixed(1)}`,
    dots: form.ratings.map(tierOf),
  };
}

export function formMarkup(form, kind = 'full') {
  const v = formView(form);
  if (!v.show) return '';
  const dots = v.dots.map((t) => `<i class="${t}"></i>`).join('');
  if (kind === 'mini') {
    return `<div class="form-line mini ${v.dir}"><span>${v.arrow} ${v.score.toFixed(1)}</span><span class="form-dots">${dots}</span></div>`;
  }
  return `<div class="form-line ${v.dir}"><span class="form-label">${v.label}</span><span class="form-dots">${dots}</span></div>`;
}

export function recordMatchForm(list) {
  if (!list?.length) return list;
  const state = loadRaw();
  for (const s of list) {
    const key = formKey(s.data, s.clubId);
    if (!key || key.startsWith('|')) continue;
    const rating = round1(clamp(Number(s.rating), 3, 10));
    if (!Number.isFinite(rating)) continue;
    const rec = state.players[key] || { ratings: [] };
    rec.ratings = cleanRatings([...(rec.ratings || []), rating]);
    state.players[key] = rec;
  }
  saveRaw(state);
  for (const s of list) s.form = playerForm(s.data, s.clubId);
  return list;
}
