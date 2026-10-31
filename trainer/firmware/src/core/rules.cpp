#include "rules.h"

#include <string.h>

namespace tr {

// ===================================================================== tuning
// XP needed for one stat point is 40 + 3 per point above 40:
//   a 60-rated stat needs 100 XP, an 80 needs 160, a 90 needs 190, a 98 needs 214.
static const int COST_BASE = 40;
static const int COST_PER_POINT = 3;
static const int MAX_STAT = 99;
static const int MAX_TRAIN = 40;  // the game accepts at most +40 per stat

// Walking and running in a pocket build pace.
static const int STEPS_PER_XP = 200;           // 10,000 steps = 50 PAC XP
static const uint32_t STEP_XP_CAP = 25000;     // steps beyond this in a day give no XP
static const int RUN_XP_PER_MIN = 3;           // 20 minutes running = 60 PAC XP
static const uint32_t RUN_XP_CAP_SEC = 90 * 60;

// Logged sessions: XP per 10 minutes to [PAC, SHO, PAS, DEF].
static const int SESSION_XP_PER_10MIN[ACT_COUNT][STAT_COUNT] = {
    {0, 30, 0, 0},     // shooting
    {0, 0, 30, 0},     // passing
    {15, 0, 15, 0},    // dribbling
    {0, 0, 0, 30},     // defending
    {30, 0, 0, 0},     // fitness
    {0, 0, 5, 25},     // goalkeeping
    {8, 8, 8, 8},      // team practice
    {10, 10, 10, 10},  // match
};
static const int SESSION_MIN_CAP = 180;  // logged minutes per day that earn XP
static const int PLAN_BONUS_PCT = 50;    // finishing a drill from the plan

// Mini games: 5..30 XP to their stat, 1 energy each.
static const int GAME_XP_MIN = 5;
static const int GAME_XP_RANGE = 25;

// Energy pays for mini games, and is earned by moving and training for real.
static const uint8_t ENERGY_MAX = 10;
static const uint8_t ENERGY_DAILY_MIN = 3;
static const uint32_t STEPS_PER_ENERGY = 1500;
static const uint8_t STEP_ENERGY_MAX_PER_DAY = 6;
static const uint8_t ENERGY_PER_SESSION = 2;

// A day counts towards the streak with this many steps, or any logged session.
static const uint32_t ACTIVE_DAY_STEPS = 5000;
static const int STREAK_PCT_PER_DAY = 5;
static const int STREAK_PCT_MAX = 25;

// Overall rating weights (percent) per role for [PAC, SHO, PAS, DEF].
static const int OVR_WEIGHTS[4][STAT_COUNT] = {
    {5, 0, 15, 80},    // GK
    {20, 5, 20, 55},   // DEF
    {20, 25, 40, 15},  // MID
    {30, 45, 20, 5},   // FWD
};

// ===================================================================== catalogue

static const char* const STAT_NAMES[STAT_COUNT] = {"PAC", "SHO", "PAS", "DEF"};
static const char* const ACT_NAMES[ACT_COUNT] = {"Shooting", "Passing", "Dribbling", "Defending",
                                                 "Fitness", "Goalkeeping", "Team practice", "Match"};
static const char* const ACT_IDS[ACT_COUNT] = {"shoot", "pass", "dribble", "defend",
                                               "fitness", "keeper", "team", "match"};
static const char* const GAME_NAMES[GAME_COUNT] = {"Penalties", "Tilt Dribble", "Keepy-Uppy", "Tackle Time"};
static const Stat GAME_STATS[GAME_COUNT] = {SHO, PAC, PAS, DEF};

static int clampi(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }

const char* statName(Stat s) { return s < STAT_COUNT ? STAT_NAMES[s] : "?"; }
const char* activityName(uint8_t a) { return a < ACT_COUNT ? ACT_NAMES[a] : "Training"; }
const char* activityId(uint8_t a) { return a < ACT_COUNT ? ACT_IDS[a] : "team"; }
const char* gameName(uint8_t g) { return g < GAME_COUNT ? GAME_NAMES[g] : "Game"; }
Stat gameStat(uint8_t g) { return g < GAME_COUNT ? GAME_STATS[g] : PAC; }

int activityFromId(const char* id) {
  if (!id) return -1;
  for (int i = 0; i < ACT_COUNT; i++) {
    if (strcmp(id, ACT_IDS[i]) == 0) return i;
  }
  return -1;
}

Role roleFromPos(const char* pos) {
  if (!pos) return ROLE_FWD;
  if (strcmp(pos, "GK") == 0) return ROLE_GK;
  if (strcmp(pos, "CB") == 0 || strcmp(pos, "RB") == 0 || strcmp(pos, "LB") == 0) return ROLE_DEF;
  if (strcmp(pos, "CM") == 0 || strcmp(pos, "CDM") == 0 || strcmp(pos, "CAM") == 0) return ROLE_MID;
  return ROLE_FWD;
}

const char* roleName(Role r) {
  switch (r) {
    case ROLE_GK: return "Goalkeeper";
    case ROLE_DEF: return "Defender";
    case ROLE_MID: return "Midfielder";
    default: return "Forward";
  }
}

// ===================================================================== progression

int statNow(const PlayerCard& p, Stat s) {
  return clampi(p.base[s] + p.train[s], 1, MAX_STAT);
}

int pointCost(int statValue) {
  int above = statValue > 40 ? statValue - 40 : 0;
  return COST_BASE + above * COST_PER_POINT;
}

int ovrBonus(const PlayerCard& p) {
  const int* w = OVR_WEIGHTS[p.role <= ROLE_FWD ? p.role : ROLE_FWD];
  int acc = 0;
  for (int i = 0; i < STAT_COUNT; i++) acc += w[i] * p.train[i];
  return (acc + 50) / 100;
}

int ovrNow(const PlayerCard& p) {
  return clampi(p.base[4] + ovrBonus(p), 1, MAX_STAT);
}

void Gain::add(const Gain& o) {
  for (int i = 0; i < STAT_COUNT; i++) {
    xp[i] += o.xp[i];
    points[i] += o.points[i];
  }
  if (ovrBefore == 0) ovrBefore = o.ovrBefore;
  if (o.ovrAfter) ovrAfter = o.ovrAfter;
}

Gain applyXp(TrainerState& s, const int xp[STAT_COUNT]) {
  Gain g;
  PlayerCard& p = s.player;
  if (!p.present) return g;
  g.ovrBefore = ovrNow(p);
  for (int i = 0; i < STAT_COUNT; i++) {
    int add = xp[i] > 0 ? xp[i] : 0;
    if (!add) continue;
    g.xp[i] = add;
    int pool = p.xp[i] + add;
    Stat st = (Stat)i;
    while (statNow(p, st) < MAX_STAT && p.train[i] < MAX_TRAIN && pool >= pointCost(statNow(p, st))) {
      pool -= pointCost(statNow(p, st));
      p.train[i]++;
      g.points[i]++;
    }
    int cap = pointCost(statNow(p, st)) - 1;
    if (statNow(p, st) >= MAX_STAT || p.train[i] >= MAX_TRAIN) pool = pool < cap ? pool : cap;
    p.xp[i] = (uint16_t)clampi(pool, 0, 60000);
  }
  g.ovrAfter = ovrNow(p);
  int total = s.today.xp + g.totalXp();
  s.today.xp = (uint16_t)clampi(total, 0, 65535);
  return g;
}

bool dayIsActive(const DayLog& d) {
  return d.steps >= ACTIVE_DAY_STEPS || d.sessions > 0;
}

int currentStreak(const TrainerState& s) {
  uint32_t yesterday = dayKeyValid(s.today.key) ? addDays(s.today.key, -1) : 0;
  int carried = (yesterday && s.lastActiveDay == yesterday) ? s.streak : 0;
  return carried + (dayIsActive(s.today) ? 1 : 0);
}

int streakBonusPct(const TrainerState& s) {
  int st = currentStreak(s);
  return clampi((st - 1) * STREAK_PCT_PER_DAY, 0, STREAK_PCT_MAX);
}

static void withBonus(int xp[STAT_COUNT], int pct) {
  for (int i = 0; i < STAT_COUNT; i++) xp[i] = xp[i] * (100 + pct) / 100;
}

static void addEnergy(TrainerState& s, int n) {
  s.energy = (uint8_t)clampi(s.energy + n, 0, ENERGY_MAX);
}

// ===================================================================== rewards

Gain addMovement(TrainerState& s, uint32_t newSteps, uint32_t newRunSec, uint32_t newWalkSec) {
  DayLog& d = s.today;
  uint32_t stepsBefore = d.steps;
  uint32_t runBefore = d.runSec;
  d.steps += newSteps;
  d.runSec += newRunSec;
  d.walkSec += newWalkSec;

  auto capped = [](uint32_t v, uint32_t cap) { return v < cap ? v : cap; };
  int xp[STAT_COUNT] = {0, 0, 0, 0};
  xp[PAC] += (int)(capped(d.steps, STEP_XP_CAP) / STEPS_PER_XP - capped(stepsBefore, STEP_XP_CAP) / STEPS_PER_XP);
  xp[PAC] += (int)(capped(d.runSec, RUN_XP_CAP_SEC) / 60 - capped(runBefore, RUN_XP_CAP_SEC) / 60) * RUN_XP_PER_MIN;

  uint32_t earned = d.steps / STEPS_PER_ENERGY;
  if (earned > STEP_ENERGY_MAX_PER_DAY) earned = STEP_ENERGY_MAX_PER_DAY;
  if (earned > d.energyFromSteps) {
    addEnergy(s, (int)(earned - d.energyFromSteps));
    d.energyFromSteps = (uint8_t)earned;
  }

  if (s.player.present) {
    s.player.steps += newSteps;
    s.player.runSec += newRunSec;
  }
  if (!xp[PAC]) return Gain();
  withBonus(xp, streakBonusPct(s));
  return applyXp(s, xp);
}

void sessionXp(uint8_t activity, int minutes, bool fromPlan, int out[STAT_COUNT]) {
  const int* row = SESSION_XP_PER_10MIN[activity < ACT_COUNT ? activity : (uint8_t)ACT_TEAM];
  for (int i = 0; i < STAT_COUNT; i++) {
    int v = row[i] * minutes / 10;
    if (fromPlan) v = v * (100 + PLAN_BONUS_PCT) / 100;
    out[i] = v;
  }
}

Gain logSession(TrainerState& s, uint8_t activity, int minutes, bool fromPlan) {
  minutes = clampi(minutes, 1, 240);
  DayLog& d = s.today;
  int room = SESSION_MIN_CAP - d.sessionMin;
  int counted = clampi(minutes, 0, room > 0 ? room : 0);
  d.sessions++;
  d.sessionMin = (uint16_t)clampi(d.sessionMin + minutes, 0, 65535);
  if (s.player.present) {
    s.player.sessions++;
    s.player.sessionMin += (uint32_t)minutes;
  }
  if (counted <= 0) return Gain();
  addEnergy(s, ENERGY_PER_SESSION);
  int xp[STAT_COUNT];
  sessionXp(activity, counted, fromPlan, xp);
  withBonus(xp, streakBonusPct(s));
  return applyXp(s, xp);
}

bool canPlay(const TrainerState& s) {
  return s.player.present && s.energy > 0;
}

Gain finishMiniGame(TrainerState& s, uint8_t game, int score) {
  if (!canPlay(s)) return Gain();
  s.energy--;
  s.today.games++;
  s.player.games++;
  int xp[STAT_COUNT] = {0, 0, 0, 0};
  xp[gameStat(game)] = GAME_XP_MIN + clampi(score, 0, 100) * GAME_XP_RANGE / 100;
  withBonus(xp, streakBonusPct(s));
  return applyXp(s, xp);
}

// ===================================================================== calendar

uint32_t dayKey(int year, int month, int day) {
  if (year < 2000 || year > 2199 || month < 1 || month > 12 || day < 1 || day > 31) return 0;
  return (uint32_t)(year * 10000 + month * 100 + day);
}

bool dayKeyValid(uint32_t key) { return key >= 20240101 && key <= 21991231; }

// Howard Hinnant's days_from_civil.
int32_t daysFromCivil(uint32_t key) {
  int y = (int)(key / 10000);
  int m = (int)(key / 100 % 100);
  int d = (int)(key % 100);
  y -= m <= 2;
  int era = (y >= 0 ? y : y - 399) / 400;
  int yoe = y - era * 400;
  int doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  int doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + doe - 719468;
}

uint32_t civilFromDays(int32_t z) {
  z += 719468;
  int era = (z >= 0 ? z : z - 146096) / 146097;
  int doe = z - era * 146097;
  int yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  int y = yoe + era * 400;
  int doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  int mp = (5 * doy + 2) / 153;
  int d = doy - (153 * mp + 2) / 5 + 1;
  int m = mp + (mp < 10 ? 3 : -9);
  y += m <= 2;
  return (uint32_t)(y * 10000 + m * 100 + d);
}

uint32_t addDays(uint32_t key, int delta) {
  return civilFromDays(daysFromCivil(key) + delta);
}

int weekdayMon0(uint32_t key) {
  // 1970-01-01 was a Thursday (Mon0 = 3).
  int32_t days = daysFromCivil(key);
  int w = (int)((days % 7 + 7) % 7);
  return (w + 3) % 7;
}

bool rollDay(TrainerState& s, uint32_t key) {
  if (!dayKeyValid(key) || key == s.today.key) return false;
  if (!dayKeyValid(s.today.key)) {
    // First time the clock is known: today's counts so far belong to this day.
    s.today.key = key;
    return false;
  }
  if (key < s.today.key) return false;  // clock went backwards; keep counting into today

  DayLog& d = s.today;
  if (dayIsActive(d)) {
    uint32_t yesterday = addDays(d.key, -1);
    s.streak = (s.lastActiveDay == yesterday) ? (uint16_t)(s.streak + 1) : 1;
    s.lastActiveDay = d.key;
    if (s.player.present) s.player.days++;
  }

  for (int i = HISTORY_DAYS - 1; i > 0; i--) s.history[i] = s.history[i - 1];
  s.history[0] = d;
  if (s.historyCount < HISTORY_DAYS) s.historyCount++;

  s.today = DayLog();
  s.today.key = key;
  if (s.energy < ENERGY_DAILY_MIN) s.energy = ENERGY_DAILY_MIN;
  return true;
}

// ===================================================================== program

static void setDay(Program& p, int day, Drill a, Drill b = Drill(), Drill c = Drill()) {
  p.days[day][0] = a;
  p.days[day][1] = b;
  p.days[day][2] = c;
}

static Drill dr(uint8_t act, uint8_t minutes) {
  Drill d;
  d.act = act;
  d.minutes = minutes;
  return d;
}

void defaultProgram(Role role, Program& p) {
  for (int d = 0; d < 7; d++) setDay(p, d, Drill());
  uint8_t main = ACT_SHOOT;
  uint8_t second = ACT_DRIBBLE;
  switch (role) {
    case ROLE_GK: main = ACT_KEEPER; second = ACT_PASS; break;
    case ROLE_DEF: main = ACT_DEFEND; second = ACT_PASS; break;
    case ROLE_MID: main = ACT_PASS; second = ACT_DRIBBLE; break;
    default: main = ACT_SHOOT; second = ACT_DRIBBLE; break;
  }
  setDay(p, 0, dr(main, 20), dr(ACT_FITNESS, 15));  // Mon
  setDay(p, 1, dr(second, 20));                     // Tue
  // Wed rest
  setDay(p, 3, dr(main, 15), dr(second, 15));       // Thu
  setDay(p, 4, dr(ACT_FITNESS, 20));                // Fri
  setDay(p, 5, dr(ACT_MATCH, 60));                  // Sat
  // Sun rest
}

int todaysDrills(const TrainerState& s, Drill out[DRILLS_PER_DAY]) {
  int day = dayKeyValid(s.today.key) ? weekdayMon0(s.today.key) : 0;
  int n = 0;
  for (int i = 0; i < DRILLS_PER_DAY; i++) {
    const Drill& d = s.program.days[day][i];
    if (d.minutes > 0 && d.act < ACT_COUNT) out[n++] = d;
  }
  return n;
}

Gain completeDrill(TrainerState& s, int idx) {
  Drill drills[DRILLS_PER_DAY];
  int n = todaysDrills(s, drills);
  if (idx < 0 || idx >= n) return Gain();
  uint8_t bit = (uint8_t)(1u << idx);
  if (s.today.planDone & bit) return Gain();
  s.today.planDone |= bit;
  return logSession(s, drills[idx].act, drills[idx].minutes, true);
}

// ===================================================================== players

void resetForNewPlayer(TrainerState& s, const PlayerCard& incoming) {
  s.player = incoming;
  s.player.present = true;
  for (int i = 0; i < STAT_COUNT; i++) {
    if (s.player.train[i] > MAX_TRAIN) s.player.train[i] = MAX_TRAIN;
  }
  if (!s.programCustom) defaultProgram(s.player.role, s.program);
}

}  // namespace tr
