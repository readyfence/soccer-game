// Mini-game rules and physics, separate from drawing so they can be unit-tested on a PC.
// All games use screen coordinates (320 x 240, y down) and step in seconds.
// Each finishes with score() in 0..100, which Trainer::miniGame turns into XP.
#pragma once

#include <stdint.h>

namespace tr {

struct GameInput {
  bool tap = false;   // a touch started this frame
  float x = 0;        // touch position
  float y = 0;
  float tilt = 0;     // -1 (left) .. +1 (right), already calibrated
};

class Rng {
 public:
  explicit Rng(uint32_t seed = 1) : _s(seed ? seed : 1) {}
  uint32_t next() {
    _s ^= _s << 13;
    _s ^= _s >> 17;
    _s ^= _s << 5;
    return _s;
  }
  float unit() { return (next() & 0xffffff) / 16777216.0f; }      // 0..1
  float range(float a, float b) { return a + (b - a) * unit(); }
  int pick(int n) { return (int)(next() % (uint32_t)n); }

 private:
  uint32_t _s;
};

// ------------------------------------------------------------ Penalties (SHO)

class PenaltyGame {
 public:
  enum Phase : uint8_t { AIM, POWER, FLIGHT, RESULT, DONE };
  enum Outcome : uint8_t { NONE, GOAL, SAVED, WIDE, OVER };

  static constexpr int SHOTS = 5;
  static constexpr float GOAL_L = 60, GOAL_R = 260, GOAL_TOP = 40, GOAL_LINE = 112;
  static constexpr float SPOT_X = 160, SPOT_Y = 206;
  static constexpr float SWEET_LO = 0.58f, SWEET_HI = 0.85f, OVER_POWER = 0.93f;

  explicit PenaltyGame(uint32_t seed = 7) : _rng(seed) {}
  void update(float dt, const GameInput& in);

  Phase phase() const { return _phase; }
  int shot() const { return _shot; }          // 0-based, current shot
  int goals() const { return _goals; }
  Outcome lastOutcome() const { return _outcome; }
  Outcome outcomeOf(int i) const { return _history[i]; }
  float aim() const { return _aim; }          // -1.15 .. 1.15 across the goal (posts at +-1)
  float power() const { return _power; }      // 0..1
  float lockedAim() const { return _lockedAim; }
  float flight() const { return _flight; }    // 0..1 of the ball's flight
  float keeperX() const;                      // keeper centre, -1..1 across the goal
  float keeperDive() const { return _keeperDir * _flight; }
  float ballX() const;                        // screen position during flight
  float ballY() const;
  bool over() const { return _phase == DONE; }
  int score() const { return _goals * 100 / SHOTS; }

  // The decision itself, exposed for tests. aim -1..1, power 0..1, keeper dive -1/0/1.
  static Outcome decide(float aim, float power, int keeperDir);

 private:
  void nextShot();
  Rng _rng;
  Phase _phase = AIM;
  int _shot = 0;
  int _goals = 0;
  float _t = 0;
  float _aim = 0;
  float _power = 0;
  float _lockedAim = 0;
  float _lockedPower = 0;
  float _flight = 0;
  int _keeperDir = 0;
  Outcome _outcome = NONE;
  Outcome _history[SHOTS] = {NONE, NONE, NONE, NONE, NONE};
};

// ------------------------------------------------------------ Tilt Dribble (PAC)

class DribbleGame {
 public:
  struct Obstacle {
    bool active = false;
    bool gate = false;     // two cones with a gap, otherwise a defender
    bool scored = false;
    bool hit = false;
    float x = 160;         // defender centre or gap centre
    float y = -20;
    float gap = 80;        // gate gap width
    float vx = 0;          // defenders shuffle sideways
  };
  static constexpr int MAX_OBS = 8;
  static constexpr float PLAYER_Y = 196, BALL_R = 9, DEF_R = 13, CONE_R = 7;
  static constexpr float TIME_LIMIT = 45, START_SPEED = 85, MAX_SPEED = 230;
  static constexpr int LIVES = 3;

  explicit DribbleGame(uint32_t seed = 11) : _rng(seed) {}
  void update(float dt, const GameInput& in);

  float x() const { return _x; }
  float speed() const { return _speed; }
  float timeLeft() const { return TIME_LIMIT - _time > 0 ? TIME_LIMIT - _time : 0; }
  float scroll() const { return _scroll; }
  int lives() const { return _lives; }
  int points() const { return _points; }
  int gates() const { return _gates; }
  bool invulnerable() const { return _hurt > 0; }
  const Obstacle& obstacle(int i) const { return _obs[i]; }
  bool over() const { return _over; }
  int score() const;

 private:
  void spawn();
  Rng _rng;
  Obstacle _obs[MAX_OBS];
  float _x = 160;
  float _speed = START_SPEED;
  float _time = 0;
  float _scroll = 0;
  float _nextSpawn = 0;
  float _hurt = 0;
  int _lives = LIVES;
  int _points = 0;
  int _gates = 0;
  int _spawned = 0;
  bool _over = false;
};

// ------------------------------------------------------------ Keepy-Uppy (PAS)

class KeepyGame {
 public:
  static constexpr float R = 16, GROUND = 226, KICK_ZONE = 92, TAP_REACH = 46;
  static constexpr float TIME_LIMIT = 60;

  explicit KeepyGame(uint32_t seed = 3) : _rng(seed) {}
  void update(float dt, const GameInput& in);

  float bx() const { return _x; }
  float by() const { return _y; }
  float spin() const { return _spin; }
  int touches() const { return _touches; }
  float timeLeft() const { return TIME_LIMIT - _time > 0 ? TIME_LIMIT - _time : 0; }
  bool lastTapHit() const { return _lastHit; }
  float lastTapX() const { return _tapX; }
  float lastTapY() const { return _tapY; }
  float sinceTap() const { return _sinceTap; }
  bool over() const { return _over; }
  bool dropped() const { return _dropped; }
  int score() const { return _touches * 4 > 100 ? 100 : _touches * 4; }

 private:
  Rng _rng;
  float _x = 160, _y = 70, _vx = 0, _vy = 0, _spin = 0;
  float _gravity = 520;
  float _time = 0;
  int _touches = 0;
  bool _over = false;
  bool _dropped = false;
  bool _lastHit = false;
  float _tapX = 0, _tapY = 0, _sinceTap = 9;
};

// ------------------------------------------------------------ Tackle Time (DEF)

class TackleGame {
 public:
  struct Attacker {
    bool active = false;
    float x = 0, y = 0, speed = 0, wobble = 0;
  };
  struct Pop {
    float x = 0, y = 0, t = 0;  // t counts down
    bool goal = false;
  };
  static constexpr int MAX_ATT = 8, MAX_POPS = 6, LANES = 4;
  static constexpr float BOX_Y = 196, R = 15, TAP_REACH = 30, TIME_LIMIT = 40;
  static float laneX(int lane) { return 46.0f + lane * 76.0f; }

  explicit TackleGame(uint32_t seed = 5) : _rng(seed) {}
  void update(float dt, const GameInput& in);

  const Attacker& attacker(int i) const { return _att[i]; }
  const Pop& pop(int i) const { return _pops[i]; }
  int tackles() const { return _tackles; }
  int conceded() const { return _goals; }
  float timeLeft() const { return TIME_LIMIT - _time > 0 ? TIME_LIMIT - _time : 0; }
  bool over() const { return _over; }
  int score() const;

 private:
  void spawn();
  void addPop(float x, float y, bool goal);
  Rng _rng;
  Attacker _att[MAX_ATT];
  Pop _pops[MAX_POPS];
  float _time = 0;
  float _nextSpawn = 0.8f;
  int _tackles = 0;
  int _goals = 0;
  bool _over = false;
};

}  // namespace tr
