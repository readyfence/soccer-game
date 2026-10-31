import { applyFormRating, playerForm } from './form.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function newStats(p, clock) {
  return {
    data: p.data, teamIdx: p.team.idx, role: p.role, isGK: p.isGK, on: clock, off: null,
    goals: 0, assists: 0, shots: 0, onTarget: 0, bigMiss: 0, passes: 0, passesDone: 0, keyPasses: 0,
    tackles: 0, interceptions: 0, blocks: 0, saves: 0, conceded: 0, fouls: 0, pensConceded: 0,
    yellow: 0, red: 0, ownGoals: 0, penMissed: 0, rating: 6,
  };
}

const minutesOf = (s, endClock) => Math.max(0, Math.round(((s.off ?? endClock) - s.on) / 60));

export function rateStats(s, { minutes, endClock, result }) {
  const mins = minutesOf(s, endClock);
  const share = clamp(mins / 90, 0, 1);
  // Action counts grow with real match length, so volume is normalised to a 5-minute match.
  const vol = clamp(5 / (minutes || 5), 0.5, 2);
  let r = 6 + 0.4 * share;

  let v = Math.min(0.7, s.passesDone * 0.035) - Math.max(0, s.passes - s.passesDone) * 0.015;
  v += s.keyPasses * 0.15 + s.onTarget * 0.12 - Math.max(0, s.shots - s.onTarget) * 0.03;
  v += s.tackles * 0.12 + s.interceptions * 0.08 + s.blocks * 0.12;
  if (s.isGK) v += s.saves * 0.3;
  r += clamp(v * vol, -0.6, 1.6);
  const involved = s.passes + s.shots + s.tackles + s.interceptions + s.blocks + s.saves + s.goals + s.assists;
  if (!s.isGK && !involved && mins >= 45) r -= 0.3;

  r += (s.goals ? 1 + (s.goals - 1) * 0.85 : 0) + s.assists * 0.65;
  r -= s.ownGoals * 0.9 + s.red * 1.5 + s.yellow * 0.2 + s.bigMiss * 0.25 + s.fouls * 0.05 + s.pensConceded * 0.4;
  r -= s.penMissed * 0.6;

  const concede = s.isGK ? 0.4 : s.role === 'DEF' ? 0.2 : s.role === 'MID' ? 0.05 : 0;
  r -= s.conceded * concede;
  if (s.conceded === 0 && mins >= 60 && !s.red) r += s.isGK ? 0.8 : s.role === 'DEF' ? 0.5 : s.role === 'MID' ? 0.15 : 0;

  r += (result > 0 ? 0.3 : result < 0 ? -0.2 : 0) * share;
  return { mins, rating: Math.round(clamp(r, 3, 10) * 10) / 10 };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function statLine(s) {
  const bits = [];
  if (s.goals) bits.push(s.goals === 3 ? 'Hat-trick' : plural(s.goals, 'goal'));
  if (s.assists) bits.push(plural(s.assists, 'assist'));
  if (s.ownGoals) bits.push(s.ownGoals === 1 ? 'Own goal' : plural(s.ownGoals, 'own goal'));
  if (s.penMissed) bits.push(s.penMissed === 1 ? 'Missed penalty' : plural(s.penMissed, 'missed penalty'));
  if (s.isGK && s.saves) bits.push(plural(s.saves, 'save'));
  if ((s.isGK || s.role === 'DEF') && s.conceded === 0 && s.mins >= 60) bits.push('Clean sheet');
  if (bits.length < 2 && s.tackles + s.interceptions + s.blocks >= 2) {
    bits.push(`${s.tackles + s.interceptions + s.blocks} tackles & interceptions`);
  }
  if (bits.length < 2 && s.keyPasses) bits.push(`${s.keyPasses} key pass${s.keyPasses === 1 ? '' : 'es'}`);
  if (bits.length < 2 && s.shots) bits.push(`${s.onTarget}/${s.shots} on target`);
  if (bits.length < 2 && s.passes) bits.push(`${s.passesDone}/${s.passes} passes`);
  if (s.red) bits.push('Sent off');
  if (!bits.length) bits.push(`${s.mins}' played`);
  return bits.slice(0, 3).join(' · ');
}

export function ratingTier(r) {
  return r < 6 ? 'poor' : r < 7 ? 'avg' : r < 8 ? 'good' : r < 9 ? 'great' : 'elite';
}

export function matchRatings(game) {
  const minutes = game.matchMinutes;
  const endClock = game.clock;
  const list = [];
  for (const s of game.stats?.values() ?? []) {
    const t = game.teams[s.teamIdx];
    const o = game.teams[1 - s.teamIdx];
    const result = Math.sign(t.score - o.score);
    const { mins, rating: raw } = rateStats(s, { minutes, endClock, result });
    if (mins < 1 && !s.goals && !s.assists && !s.red && !s.ownGoals) continue;
    const clubId = game.teams[s.teamIdx]?.club?.id ?? '';
    const form = playerForm(s.data, clubId);
    const rating = applyFormRating(raw, form);
    list.push(Object.assign(s, { mins, rating, rawRating: raw, result, clubId, form }));
  }
  list.sort((a, b) => b.rating - a.rating || b.goals - a.goals || b.assists - a.assists || b.result - a.result);
  return list;
}
