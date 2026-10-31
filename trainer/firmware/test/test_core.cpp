// Unit tests for the hardware-free training rules and step detector.
// Run with `make -C trainer/firmware/test` (needs only a C++ compiler).
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../src/core/rules.h"
#include "../src/core/steps.h"

using namespace tr;

static int g_failed = 0;
static int g_checks = 0;

#define CHECK(cond)                                                       \
  do {                                                                    \
    g_checks++;                                                           \
    if (!(cond)) {                                                        \
      g_failed++;                                                         \
      printf("  FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond);            \
    }                                                                     \
  } while (0)

#define CHECK_EQ(a, b)                                                                        \
  do {                                                                                        \
    g_checks++;                                                                               \
    long long _a = (long long)(a), _b = (long long)(b);                                       \
    if (_a != _b) {                                                                           \
      g_failed++;                                                                             \
      printf("  FAIL %s:%d  %s == %s  (%lld vs %lld)\n", __FILE__, __LINE__, #a, #b, _a, _b); \
    }                                                                                         \
  } while (0)

static PlayerCard striker() {
  PlayerCard p;
  p.present = true;
  strcpy(p.id, "p7k2");
  strcpy(p.name, "Jos\xc3\xa9 Lindqvist");
  strcpy(p.ascii, "Jose Lindqvist");
  strcpy(p.pos, "ST");
  p.role = ROLE_FWD;
  uint8_t base[5] = {97, 92, 81, 36, 91};
  memcpy(p.base, base, 5);
  return p;
}

static TrainerState freshState(uint32_t day = 20261102) {  // a Monday
  TrainerState s;
  resetForNewPlayer(s, striker());
  s.today.key = day;
  s.energy = 3;
  return s;
}

// ------------------------------------------------------------------ calendar

static void testCalendar() {
  puts("calendar");
  CHECK_EQ(daysFromCivil(19700101), 0);
  CHECK_EQ(civilFromDays(0), 19700101);
  CHECK_EQ(addDays(20261231, 1), 20270101);
  CHECK_EQ(addDays(20280301, -1), 20280229);
  CHECK_EQ(addDays(20260301, -1), 20260228);
  CHECK_EQ(weekdayMon0(20261102), 0);  // Monday
  CHECK_EQ(weekdayMon0(20261031), 5);  // Saturday
  CHECK_EQ(weekdayMon0(20261101), 6);  // Sunday
  CHECK(dayKeyValid(dayKey(2026, 10, 31)));
  CHECK(!dayKeyValid(dayKey(2000, 1, 1)));
  CHECK_EQ(dayKey(2026, 13, 1), 0);
}

// ------------------------------------------------------------------ progression

static void testProgression() {
  puts("progression");
  CHECK_EQ(pointCost(60), 100);
  CHECK_EQ(pointCost(90), 190);
  CHECK_EQ(pointCost(30), 40);

  TrainerState s = freshState();
  int xp[4] = {0, 189, 0, 0};
  Gain g = applyXp(s, xp);
  CHECK_EQ(g.points[SHO], 0);
  CHECK_EQ(s.player.xp[SHO], 189);
  int one[4] = {0, 1, 0, 0};
  g = applyXp(s, one);  // 92 SHO costs 40 + 52*3 = 196
  CHECK_EQ(g.points[SHO], 0);
  int more[4] = {0, 10, 0, 0};
  g = applyXp(s, more);
  CHECK_EQ(g.points[SHO], 1);
  CHECK_EQ(statNow(s.player, SHO), 93);
  CHECK_EQ(s.player.xp[SHO], 200 - 196);

  // Several levels at once.
  int big[4] = {0, 0, 1000, 0};
  g = applyXp(s, big);
  CHECK(g.points[PAS] >= 4);
  CHECK_EQ(statNow(s.player, PAS), 81 + g.points[PAS]);

  // Capped at 99: XP stops piling up.
  int huge[4] = {5000, 0, 0, 0};
  g = applyXp(s, huge);
  CHECK_EQ(statNow(s.player, PAC), 99);
  CHECK_EQ(g.points[PAC], 2);
  CHECK(s.player.xp[PAC] < pointCost(99));

  // Overall follows the role weights: a forward gains overall from shooting.
  TrainerState f = freshState();
  f.player.train[SHO] = 4;  // 4 * 45% = 1.8 -> 2
  CHECK_EQ(ovrBonus(f.player), 2);
  f.player.role = ROLE_GK;
  CHECK_EQ(ovrBonus(f.player), 0);

  // No player, no XP.
  TrainerState empty;
  empty.today.key = 20261102;
  int some[4] = {10, 10, 10, 10};
  CHECK_EQ(applyXp(empty, some).totalXp(), 0);
}

// ------------------------------------------------------------------ rewards

static void testMovementRewards() {
  puts("movement rewards");
  TrainerState s = freshState();
  Gain g = addMovement(s, 199, 0, 100);
  CHECK_EQ(g.totalXp(), 0);
  g = addMovement(s, 1, 0, 0);
  CHECK_EQ(g.xp[PAC], 1);
  CHECK_EQ(s.today.steps, 200);
  CHECK_EQ(s.player.steps, 200);

  // 10,000 steps in small chunks = 50 XP total, energy +6 (capped per day), no streak yet.
  TrainerState t = freshState();
  int total = 0;
  for (int i = 0; i < 100; i++) total += addMovement(t, 100, 0, 60).xp[PAC];
  CHECK_EQ(t.today.steps, 10000);
  CHECK(total >= 50 && total <= 52);  // streak bonus can kick in once the day is active
  CHECK_EQ(t.energy, 3 + 6);

  // Running: 3 XP per minute.
  TrainerState r = freshState();
  int runXp = 0;
  for (int i = 0; i < 20; i++) runXp += addMovement(r, 0, 60, 0).xp[PAC];
  CHECK_EQ(runXp, 60);
  CHECK_EQ(r.today.runSec, 1200);

  // Daily step XP cap.
  TrainerState c = freshState();
  addMovement(c, 25000, 0, 0);
  CHECK_EQ(addMovement(c, 5000, 0, 0).totalXp(), 0);
}

static void testSessions() {
  puts("sessions");
  TrainerState s = freshState();
  int prev[4];
  sessionXp(ACT_SHOOT, 30, false, prev);
  CHECK_EQ(prev[SHO], 90);
  sessionXp(ACT_SHOOT, 30, true, prev);
  CHECK_EQ(prev[SHO], 135);

  Gain g = logSession(s, ACT_SHOOT, 30, false);
  CHECK_EQ(g.xp[SHO], 90);  // first active moment of the day: streak 1, no bonus
  CHECK_EQ(s.today.sessions, 1);
  CHECK_EQ(s.energy, 5);
  CHECK_EQ(s.player.sessionMin, 30);

  // Daily cap of 180 counted minutes.
  logSession(s, ACT_PASS, 120, false);
  g = logSession(s, ACT_PASS, 60, false);
  CHECK_EQ(g.xp[PAS], 30 * 30 / 10);  // only 30 of the 60 minutes count
  g = logSession(s, ACT_PASS, 60, false);
  CHECK_EQ(g.totalXp(), 0);
  CHECK_EQ(s.today.sessions, 4);
}

static void testMiniGames() {
  puts("mini games");
  TrainerState s = freshState();
  s.energy = 1;
  Gain g = finishMiniGame(s, GAME_PENALTY, 100);
  CHECK_EQ(g.xp[SHO], 30);
  CHECK_EQ(s.energy, 0);
  CHECK(!canPlay(s));
  g = finishMiniGame(s, GAME_PENALTY, 100);
  CHECK_EQ(g.totalXp(), 0);
  CHECK_EQ(s.today.games, 1);
  s.energy = 2;
  g = finishMiniGame(s, GAME_DRIBBLE, 0);
  CHECK_EQ(g.xp[PAC], 5);
  CHECK_EQ(gameStat(GAME_TACKLE), DEF);
  CHECK_EQ(gameStat(GAME_KEEPY), PAS);
}

// ------------------------------------------------------------------ days and streaks

static void testDaysAndStreaks() {
  puts("days and streaks");
  TrainerState s = freshState(20261102);
  s.energy = 0;
  CHECK_EQ(currentStreak(s), 0);
  logSession(s, ACT_FITNESS, 20, false);
  CHECK_EQ(currentStreak(s), 1);
  CHECK_EQ(streakBonusPct(s), 0);

  CHECK(rollDay(s, 20261103));
  CHECK_EQ(s.historyCount, 1);
  CHECK_EQ(s.history[0].key, 20261102);
  CHECK_EQ(s.history[0].sessions, 1);
  CHECK_EQ(s.today.sessions, 0);
  CHECK_EQ(s.streak, 1);
  CHECK_EQ(s.player.days, 1);
  CHECK(s.energy >= 3);
  CHECK_EQ(currentStreak(s), 1);  // yesterday counts, today not active yet

  addMovement(s, 6000, 0, 0);
  CHECK_EQ(currentStreak(s), 2);
  CHECK_EQ(streakBonusPct(s), 5);

  // Skip a day: streak resets.
  rollDay(s, 20261104);
  rollDay(s, 20261106);
  CHECK_EQ(currentStreak(s), 0);
  CHECK_EQ(s.historyCount, 3);

  // Same day / backwards / invalid keys do nothing.
  CHECK(!rollDay(s, 20261106));
  CHECK(!rollDay(s, 20261101));
  CHECK(!rollDay(s, 0));

  // Clock not set yet: counts stay, then belong to the first known day.
  TrainerState u;
  resetForNewPlayer(u, striker());
  addMovement(u, 1234, 0, 0);
  CHECK(!rollDay(u, 20261110));
  CHECK_EQ(u.today.key, 20261110);
  CHECK_EQ(u.today.steps, 1234);

  // History keeps the most recent 14 days.
  TrainerState h = freshState(20260101);
  for (int i = 1; i <= 20; i++) rollDay(h, addDays(20260101, i));
  CHECK_EQ(h.historyCount, HISTORY_DAYS);
  CHECK_EQ(h.history[0].key, addDays(20260101, 19));
}

// ------------------------------------------------------------------ program

static void testProgram() {
  puts("program");
  TrainerState s = freshState(20261102);  // Monday
  Drill d[DRILLS_PER_DAY];
  int n = todaysDrills(s, d);
  CHECK_EQ(n, 2);
  CHECK_EQ(d[0].act, ACT_SHOOT);
  CHECK_EQ(d[1].act, ACT_FITNESS);

  Gain g = completeDrill(s, 0);
  CHECK_EQ(g.xp[SHO], 20 * 30 / 10 * 150 / 100);
  CHECK_EQ(s.today.planDone, 1);
  CHECK_EQ(completeDrill(s, 0).totalXp(), 0);  // only once
  CHECK_EQ(completeDrill(s, 5).totalXp(), 0);

  TrainerState w = freshState(20261104);  // Wednesday: rest day
  CHECK_EQ(todaysDrills(w, d), 0);

  Program gk;
  defaultProgram(ROLE_GK, gk);
  CHECK_EQ(gk.days[0][0].act, ACT_KEEPER);
  CHECK_EQ(roleFromPos("CDM"), ROLE_MID);
  CHECK_EQ(roleFromPos("LB"), ROLE_DEF);
  CHECK_EQ(roleFromPos("LW"), ROLE_FWD);
  CHECK_EQ(activityFromId("dribble"), ACT_DRIBBLE);
  CHECK_EQ(activityFromId("nope"), -1);

  // A custom program survives a new player arriving.
  TrainerState c = freshState();
  c.program.days[0][0].act = ACT_PASS;
  c.programCustom = true;
  resetForNewPlayer(c, striker());
  CHECK_EQ(c.program.days[0][0].act, ACT_PASS);
}

// ------------------------------------------------------------------ step detector

struct Signal {
  float hz;         // stride frequency
  float amp;        // g above gravity at the peak
  float seconds;
  float sampleHz;
  float noise;      // uniform noise amplitude in g
  float jitterMs;   // timestamp jitter
};

static uint32_t g_rng = 12345;
static float frand() {
  g_rng = g_rng * 1664525u + 1013904223u;
  return (float)((g_rng >> 8) & 0xffff) / 65535.0f;
}

// Pocket-like signal: a sharp impact each stride plus a smaller secondary bump.
static StepTotals simulate(StepDetector& det, uint32_t& t0, const Signal& s, uint32_t* stepsOut = nullptr) {
  int n = (int)(s.seconds * s.sampleHz);
  StepTotals sum;
  for (int i = 0; i < n; i++) {
    float t = i / s.sampleHz;
    float phase = fmodf(t * s.hz, 1.0f);
    float pulse = expf(-powf((phase - 0.2f) / 0.08f, 2.0f)) + 0.35f * expf(-powf((phase - 0.6f) / 0.1f, 2.0f));
    float g = 1.0f + s.amp * pulse - 0.25f * s.amp * 0.5f + s.noise * (frand() * 2 - 1);
    uint32_t ms = t0 + (uint32_t)(t * 1000.0f + frand() * s.jitterMs);
    det.addSample(ms, 0.1f * g, 0.2f * g, 0.97f * g);
    if (i % 50 == 0) {
      StepTotals part = det.take();
      sum.steps += part.steps;
      sum.runSec += part.runSec;
      sum.walkSec += part.walkSec;
    }
  }
  StepTotals part = det.take();
  sum.steps += part.steps;
  sum.runSec += part.runSec;
  sum.walkSec += part.walkSec;
  t0 += (uint32_t)(s.seconds * 1000.0f) + 10;
  if (stepsOut) *stepsOut = (uint32_t)(s.seconds * s.hz);
  return sum;
}

static bool within(uint32_t got, uint32_t want, float pct) {
  float lo = want * (1.0f - pct), hi = want * (1.0f + pct);
  return got >= lo && got <= hi;
}

static void testSteps() {
  puts("step detector");
  uint32_t t0 = 1000;
  uint32_t want = 0;

  StepDetector walk;
  StepTotals w = simulate(walk, t0, {2.0f, 0.45f, 60, 50, 0.04f, 4}, &want);
  printf("    walking: %u steps (expected ~%u), run %us walk %us, cadence %d intensity %.2f\n", w.steps, want, w.runSec, w.walkSec, walk.cadence(), walk.intensity());
  CHECK(within(w.steps, want, 0.08f));
  CHECK(w.runSec <= 3);
  CHECK(w.walkSec >= 50);

  StepDetector run;
  StepTotals r = simulate(run, t0, {2.9f, 1.4f, 60, 50, 0.08f, 6}, &want);
  printf("    running: %u steps (expected ~%u), run %us walk %us, cadence %d intensity %.2f\n", r.steps, want, r.runSec, r.walkSec, run.cadence(), run.intensity());
  CHECK(within(r.steps, want, 0.08f));
  CHECK(r.runSec >= 50);

  // Brisk walk (fast cadence, soft landings) stays walking; a slow jog is running.
  StepDetector brisk;
  StepTotals bw = simulate(brisk, t0, {2.4f, 0.55f, 60, 50, 0.04f, 4}, &want);
  printf("    brisk walk: %u steps, run %us walk %us, cadence %d intensity %.2f\n", bw.steps, bw.runSec, bw.walkSec,
         brisk.cadence(), brisk.intensity());
  CHECK(within(bw.steps, want, 0.08f));
  CHECK(bw.runSec <= 5);
  StepDetector jog;
  StepTotals jg = simulate(jog, t0, {2.6f, 1.1f, 60, 50, 0.06f, 4}, &want);
  printf("    slow jog: %u steps, run %us walk %us, cadence %d intensity %.2f\n", jg.steps, jg.runSec, jg.walkSec,
         jog.cadence(), jog.intensity());
  CHECK(within(jg.steps, want, 0.08f));
  CHECK(jg.runSec >= 50);

  // Slower sample rate (busy screen) still works.
  StepDetector slow;
  StepTotals sl = simulate(slow, t0, {2.0f, 0.5f, 60, 25, 0.04f, 10}, &want);
  printf("    25 Hz walk: %u steps (expected ~%u)\n", sl.steps, want);
  CHECK(within(sl.steps, want, 0.12f));

  // Sitting still with sensor noise: nothing.
  StepDetector idle;
  StepTotals i = simulate(idle, t0, {0.0f, 0.0f, 120, 50, 0.03f, 4});
  printf("    idle: %u steps\n", i.steps);
  CHECK_EQ(i.steps, 0);

  // A few taps on the screen (irregular bumps) do not count.
  StepDetector taps;
  uint32_t t = 5000;
  for (int k = 0; k < 400; k++) {
    float g = 1.0f;
    if (k == 30 || k == 52 || k == 130 || k == 141 || k == 300) g = 1.8f;
    taps.addSample(t, 0, 0, g);
    t += 20;
  }
  CHECK_EQ(taps.take().steps, 0);

  // Walk, stop, walk: the pause does not invent steps and the restart is re-confirmed.
  StepDetector mix;
  uint32_t a = 0, b = 0;
  StepTotals m1 = simulate(mix, t0, {1.9f, 0.45f, 30, 50, 0.04f, 4}, &a);
  StepTotals m2 = simulate(mix, t0, {0.0f, 0.0f, 10, 50, 0.03f, 4});
  StepTotals m3 = simulate(mix, t0, {1.9f, 0.45f, 30, 50, 0.04f, 4}, &b);
  uint32_t total = m1.steps + m2.steps + m3.steps;
  printf("    walk/stop/walk: %u steps (expected ~%u)\n", total, a + b);
  CHECK(within(total, a + b, 0.1f));
  CHECK_EQ(m2.steps, 0);
}

int main() {
  testCalendar();
  testProgression();
  testMovementRewards();
  testSessions();
  testMiniGames();
  testDaysAndStreaks();
  testProgram();
  testSteps();
  printf("\n%d checks, %d failed\n", g_checks, g_failed);
  return g_failed ? 1 : 0;
}
