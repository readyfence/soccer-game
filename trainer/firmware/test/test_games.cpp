// Tests for mini-game rules: each game can be won by good play, lost by none, and ends.
#include <math.h>
#include <stdio.h>

#include "../src/core/minigames.h"

using namespace tr;

static int g_failed = 0;
static int g_checks = 0;

#define CHECK(cond)                                            \
  do {                                                         \
    g_checks++;                                                \
    if (!(cond)) {                                             \
      g_failed++;                                              \
      printf("  FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond); \
    }                                                          \
  } while (0)

static const float DT = 1.0f / 30.0f;

static GameInput none() { return GameInput(); }
static GameInput tapAt(float x, float y) {
  GameInput in;
  in.tap = true;
  in.x = x;
  in.y = y;
  return in;
}

// ------------------------------------------------------------ penalties

static void testPenaltyDecision() {
  puts("penalty decisions");
  CHECK(PenaltyGame::decide(1.05f, 0.7f, 0) == PenaltyGame::WIDE);
  CHECK(PenaltyGame::decide(0.5f, 0.97f, 0) == PenaltyGame::OVER);
  CHECK(PenaltyGame::decide(0.0f, 0.7f, 0) == PenaltyGame::SAVED);   // straight at him
  CHECK(PenaltyGame::decide(0.9f, 0.7f, 1) == PenaltyGame::GOAL);    // corner + sweet spot
  CHECK(PenaltyGame::decide(0.6f, 0.4f, 1) == PenaltyGame::SAVED);   // right way, no sweet spot
  CHECK(PenaltyGame::decide(-0.8f, 0.4f, 1) == PenaltyGame::GOAL);   // wrong way
  CHECK(PenaltyGame::decide(-0.8f, 0.1f, 1) == PenaltyGame::SAVED);  // too weak
}

// Waits until the sweeping value is close to `want`, then taps.
static void tapWhen(PenaltyGame& g, PenaltyGame::Phase phase, float want, bool aim) {
  for (int i = 0; i < 2000 && g.phase() == phase; i++) {
    float v = aim ? g.aim() : g.power();
    g.update(DT, fabsf(v - want) < 0.06f ? tapAt(160, 120) : none());
  }
}

static void playPenalties(PenaltyGame& g, float aim, float power) {
  for (int guard = 0; guard < 20000 && !g.over(); guard++) {
    if (g.phase() == PenaltyGame::AIM) tapWhen(g, PenaltyGame::AIM, aim, true);
    else if (g.phase() == PenaltyGame::POWER) tapWhen(g, PenaltyGame::POWER, power, false);
    else g.update(DT, none());
  }
}

static void testPenaltyGame() {
  puts("penalty game");
  PenaltyGame good(21);
  playPenalties(good, 0.88f, 0.72f);
  printf("    corners in the sweet spot: %d/5\n", good.goals());
  CHECK(good.over());
  CHECK(good.goals() == 5);
  CHECK(good.score() == 100);

  PenaltyGame skied(4);
  playPenalties(skied, 0.5f, 0.99f);
  CHECK(skied.over());
  CHECK(skied.goals() == 0);
  CHECK(skied.outcomeOf(0) == PenaltyGame::OVER);

  // The ball travels from the spot towards the goal during flight.
  PenaltyGame f(9);
  tapWhen(f, PenaltyGame::AIM, 0.88f, true);
  tapWhen(f, PenaltyGame::POWER, 0.7f, false);
  CHECK(f.phase() == PenaltyGame::FLIGHT);
  for (int i = 0; i < 8; i++) f.update(DT, none());
  CHECK(f.ballY() < PenaltyGame::SPOT_Y);
  CHECK(f.ballX() > PenaltyGame::SPOT_X);
}

// ------------------------------------------------------------ dribble

// A simple "player": steer towards the safest x for the nearest obstacle ahead.
static float steer(const DribbleGame& g) {
  const DribbleGame::Obstacle* next = nullptr;
  for (int i = 0; i < DribbleGame::MAX_OBS; i++) {
    const DribbleGame::Obstacle& o = g.obstacle(i);
    if (!o.active || o.scored || o.y > DribbleGame::PLAYER_Y + 10) continue;
    if (!next || o.y > next->y) next = &o;
  }
  float target = 160;
  if (next) {
    if (next->gate) target = next->x;
    else target = next->x < 160 ? next->x + 70 : next->x - 70;
  }
  float d = target - g.x();
  return d > 8 ? 1.0f : (d < -8 ? -1.0f : d / 8.0f);
}

static void testDribble() {
  puts("tilt dribble");
  DribbleGame skilled(13);
  for (int i = 0; i < 3000 && !skilled.over(); i++) {
    GameInput in;
    in.tilt = steer(skilled);
    skilled.update(DT, in);
  }
  printf("    steering player: %d points, %d gates, %d lives, score %d\n", skilled.points(), skilled.gates(),
         skilled.lives(), skilled.score());
  CHECK(skilled.over());
  CHECK(skilled.timeLeft() == 0);  // survived to the whistle
  CHECK(skilled.score() >= 60);

  DribbleGame still(13);
  for (int i = 0; i < 3000 && !still.over(); i++) still.update(DT, none());
  printf("    no tilt: score %d, lives %d\n", still.score(), still.lives());
  CHECK(still.over());
  CHECK(still.score() < skilled.score());

  DribbleGame edge(2);
  GameInput hard;
  hard.tilt = 1;
  for (int i = 0; i < 100; i++) edge.update(DT, hard);
  CHECK(edge.x() <= 302);
}

// ------------------------------------------------------------ keepy-uppy

static void testKeepy() {
  puts("keepy-uppy");
  KeepyGame idle(1);
  int frames = 0;
  while (!idle.over() && frames < 1000) {
    idle.update(DT, none());
    frames++;
  }
  CHECK(idle.dropped());
  CHECK(idle.touches() == 0);
  CHECK(frames < 60);  // falls in under two seconds

  KeepyGame pro(1);
  for (int i = 0; i < 5000 && !pro.over(); i++) {
    bool low = pro.by() > 170;
    pro.update(DT, low ? tapAt(pro.bx() + 3, pro.by() + 6) : none());
  }
  printf("    tapping under the ball: %d touches, dropped %d\n", pro.touches(), pro.dropped());
  CHECK(!pro.dropped());
  CHECK(pro.score() == 100);

  // Tapping thin air does nothing; tapping the left of the ball sends it right.
  KeepyGame aim(1);
  for (int i = 0; i < 20; i++) aim.update(DT, none());
  aim.update(DT, tapAt(10, 230));
  CHECK(!aim.lastTapHit());
  KeepyGame side(1);
  while (side.by() < 150) side.update(DT, none());
  float x0 = side.bx();
  side.update(DT, tapAt(x0 - 20, side.by()));
  CHECK(side.lastTapHit());
  for (int i = 0; i < 10; i++) side.update(DT, none());
  CHECK(side.bx() > x0 + 10);
}

// ------------------------------------------------------------ tackles

static void testTackle() {
  puts("tackle time");
  TackleGame sleepy(8);
  for (int i = 0; i < 2000 && !sleepy.over(); i++) sleepy.update(DT, none());
  CHECK(sleepy.over());
  CHECK(sleepy.tackles() == 0);
  CHECK(sleepy.conceded() > 10);
  CHECK(sleepy.score() == 0);

  TackleGame keen(8);
  for (int i = 0; i < 2000 && !keen.over(); i++) {
    GameInput in;
    for (int a = 0; a < TackleGame::MAX_ATT; a++) {
      const TackleGame::Attacker& at = keen.attacker(a);
      if (at.active && at.y > 60) {
        in = tapAt(at.x + 5, at.y - 5);
        break;
      }
    }
    keen.update(DT, in);
  }
  printf("    quick tackler: %d tackles, %d conceded, score %d\n", keen.tackles(), keen.conceded(), keen.score());
  CHECK(keen.tackles() > 25);
  CHECK(keen.conceded() <= 2);
  CHECK(keen.score() == 100);

  // Missing a tap (empty space) costs nothing.
  TackleGame miss(8);
  miss.update(DT, tapAt(5, 230));
  CHECK(miss.tackles() == 0);
}

int main() {
  testPenaltyDecision();
  testPenaltyGame();
  testDribble();
  testKeepy();
  testTackle();
  printf("\n%d checks, %d failed\n", g_checks, g_failed);
  return g_failed ? 1 : 0;
}
