#include "minigames.h"

#include <math.h>

namespace tr {

static float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
static float dist(float ax, float ay, float bx, float by) {
  float dx = ax - bx, dy = ay - by;
  return sqrtf(dx * dx + dy * dy);
}

// ===================================================================== Penalties

static const float KEEPER_STEP = 0.62f;  // how far a dive reaches from the centre (goal = -1..1)
static const float KEEPER_REACH = 0.42f;
static const float CORNER = 0.72f;

PenaltyGame::Outcome PenaltyGame::decide(float aim, float power, int keeperDir) {
  if (fabsf(aim) > 1.0f) return WIDE;
  if (power > OVER_POWER) return OVER;
  bool reachable = fabsf(aim - keeperDir * KEEPER_STEP) <= KEEPER_REACH;
  bool sweet = power >= SWEET_LO && power <= SWEET_HI;
  if (reachable) return (sweet && fabsf(aim) >= CORNER) ? GOAL : SAVED;
  if (power < 0.2f) return SAVED;  // a weak roll: the keeper gets back to it
  return GOAL;
}

void PenaltyGame::update(float dt, const GameInput& in) {
  _t += dt;
  switch (_phase) {
    case AIM: {
      float w = 2.0f + 0.35f * _shot;
      _aim = 1.15f * sinf(_t * w);
      if (in.tap) {
        _lockedAim = _aim;
        _phase = POWER;
        _t = 0;
      }
      break;
    }
    case POWER: {
      float w = 2.6f + 0.3f * _shot;
      _power = (1.0f - cosf(_t * w)) * 0.5f;
      if (in.tap) {
        _lockedPower = _power;
        // The keeper reads the striker's body shape some of the time.
        int side = _lockedAim > 0.15f ? 1 : (_lockedAim < -0.15f ? -1 : 0);
        _keeperDir = _rng.unit() < 0.4f ? side : _rng.pick(3) - 1;
        _outcome = decide(_lockedAim, _lockedPower, _keeperDir);
        _phase = FLIGHT;
        _flight = 0;
        _t = 0;
      }
      break;
    }
    case FLIGHT:
      _flight += dt / 0.55f;
      if (_flight >= 1.0f) {
        _flight = 1.0f;
        if (_outcome == GOAL) _goals++;
        _history[_shot] = _outcome;
        _phase = RESULT;
        _t = 0;
      }
      break;
    case RESULT:
      if (_t > 1.4f || (in.tap && _t > 0.4f)) nextShot();
      break;
    case DONE:
      break;
  }
}

void PenaltyGame::nextShot() {
  _shot++;
  _t = 0;
  _flight = 0;
  _keeperDir = 0;
  _aim = 0;
  _power = 0;
  _phase = _shot >= SHOTS ? DONE : AIM;
  if (_shot >= SHOTS) _shot = SHOTS - 1;
}

float PenaltyGame::keeperX() const {
  if (_phase == FLIGHT || _phase == RESULT) return _keeperDir * KEEPER_STEP * _flight;
  return 0.08f * sinf(_t * 3.0f);
}

float PenaltyGame::ballX() const {
  if (_phase != FLIGHT && _phase != RESULT) return SPOT_X;
  float target = (GOAL_L + GOAL_R) * 0.5f + _lockedAim * (GOAL_R - GOAL_L) * 0.5f;
  return SPOT_X + (target - SPOT_X) * _flight;
}

float PenaltyGame::ballY() const {
  if (_phase != FLIGHT && _phase != RESULT) return SPOT_Y;
  float target = _outcome == OVER ? GOAL_TOP - 26 : GOAL_LINE - 10 - _lockedPower * 56;
  if (_outcome != OVER && target < GOAL_TOP + 8) target = GOAL_TOP + 8;
  return SPOT_Y + (target - SPOT_Y) * _flight;
}

// ===================================================================== Tilt Dribble

void DribbleGame::spawn() {
  for (int i = 0; i < MAX_OBS; i++) {
    Obstacle& o = _obs[i];
    if (o.active) continue;
    o = Obstacle();
    o.active = true;
    o.y = -24;
    // Start with a few easy defenders, then mix in gates.
    o.gate = _spawned >= 2 && _rng.unit() < 0.45f;
    if (o.gate) {
      o.gap = clampf(96.0f - _time * 0.8f, 62.0f, 96.0f);
      o.x = _rng.range(30 + o.gap * 0.5f, 290 - o.gap * 0.5f);
    } else {
      o.x = _rng.range(40, 280);
      float sway = 20 + _time * 1.2f;
      o.vx = _rng.unit() < 0.5f ? -sway : sway;
    }
    _spawned++;
    return;
  }
}

void DribbleGame::update(float dt, const GameInput& in) {
  if (_over) return;
  _time += dt;
  _speed = clampf(START_SPEED + _time * 4.2f, START_SPEED, MAX_SPEED);
  _x = clampf(_x + clampf(in.tilt, -1, 1) * 260.0f * dt, 18, 302);
  _scroll += _speed * dt;
  if (_hurt > 0) _hurt -= dt;

  if (_scroll >= _nextSpawn) {
    spawn();
    _nextSpawn = _scroll + 150 + _rng.range(0, 40);
  }

  for (int i = 0; i < MAX_OBS; i++) {
    Obstacle& o = _obs[i];
    if (!o.active) continue;
    o.y += _speed * dt;
    if (!o.gate) {
      o.x += o.vx * dt;
      if (o.x < 30 || o.x > 290) {
        o.x = clampf(o.x, 30, 290);
        o.vx = -o.vx;
      }
    }

    if (!o.hit && _hurt <= 0) {
      bool touch;
      if (o.gate) {
        touch = dist(_x, PLAYER_Y, o.x - o.gap * 0.5f, o.y) < BALL_R + CONE_R ||
                dist(_x, PLAYER_Y, o.x + o.gap * 0.5f, o.y) < BALL_R + CONE_R;
      } else {
        touch = dist(_x, PLAYER_Y, o.x, o.y) < BALL_R + DEF_R;
      }
      if (touch) {
        o.hit = true;
        _lives--;
        _hurt = 1.2f;
      }
    }

    if (!o.scored && o.y > PLAYER_Y + 20) {
      o.scored = true;
      if (!o.hit) {
        if (!o.gate) {
          _points += 2;
        } else if (fabsf(_x - o.x) < o.gap * 0.5f) {
          _points += 3;
          _gates++;
        }
      }
    }
    if (o.y > 270) o.active = false;
  }

  if (_lives <= 0 || _time >= TIME_LIMIT) _over = true;
}

int DribbleGame::score() const {
  int s = _points * 100 / 70;
  return s > 100 ? 100 : s;
}

// ===================================================================== Keepy-Uppy

void KeepyGame::update(float dt, const GameInput& in) {
  if (_over) return;
  _time += dt;
  _sinceTap += dt;

  if (in.tap) {
    _tapX = in.x;
    _tapY = in.y;
    _sinceTap = 0;
    _lastHit = dist(in.x, in.y, _x, _y) <= TAP_REACH && _y >= KICK_ZONE && _vy > -60;
    if (_lastHit) {
      _vy = -(340 + _rng.range(0, 60));
      _vx = clampf((_x - in.x) * 6.5f + _rng.range(-25, 25), -230, 230);
      _touches++;
      _gravity = clampf(_gravity + 10, 520, 900);
    }
  }

  _vy += _gravity * dt;
  _vx *= 1.0f - 0.15f * dt;
  _x += _vx * dt;
  _y += _vy * dt;
  _spin += _vx * dt * 0.05f;

  if (_x < R) {
    _x = R;
    _vx = -_vx * 0.8f;
  } else if (_x > 320 - R) {
    _x = 320 - R;
    _vx = -_vx * 0.8f;
  }
  if (_y < R + 26) {
    _y = R + 26;
    _vy = fabsf(_vy) * 0.5f;
  }
  if (_y >= GROUND - R) {
    _y = GROUND - R;
    _over = true;
    _dropped = true;
  }
  if (_time >= TIME_LIMIT) _over = true;
}

// ===================================================================== Tackle Time

void TackleGame::addPop(float x, float y, bool goal) {
  int slot = 0;
  for (int i = 0; i < MAX_POPS; i++) {
    if (_pops[i].t <= 0) {
      slot = i;
      break;
    }
    if (_pops[i].t < _pops[slot].t) slot = i;
  }
  _pops[slot].x = x;
  _pops[slot].y = y;
  _pops[slot].t = 0.7f;
  _pops[slot].goal = goal;
}

void TackleGame::spawn() {
  for (int i = 0; i < MAX_ATT; i++) {
    Attacker& a = _att[i];
    if (a.active) continue;
    int lane = _rng.pick(LANES);
    for (int tries = 0; tries < LANES; tries++) {
      bool busy = false;
      for (int j = 0; j < MAX_ATT; j++) {
        if (_att[j].active && fabsf(_att[j].x - laneX(lane)) < 1 && _att[j].y < 50) busy = true;
      }
      if (!busy) break;
      lane = (lane + 1) % LANES;
    }
    a.active = true;
    a.x = laneX(lane);
    a.y = -R;
    a.speed = 42 + _time * 2.2f + _rng.range(0, 15);
    a.wobble = _rng.range(0, 6.28f);
    return;
  }
}

void TackleGame::update(float dt, const GameInput& in) {
  for (int i = 0; i < MAX_POPS; i++) {
    if (_pops[i].t > 0) _pops[i].t -= dt;
  }
  if (_over) return;
  _time += dt;

  _nextSpawn -= dt;
  if (_nextSpawn <= 0) {
    spawn();
    _nextSpawn = clampf(1.25f - _time * 0.02f, 0.45f, 1.25f) + _rng.range(0, 0.3f);
  }

  if (in.tap) {
    int best = -1;
    float bestD = TAP_REACH;
    for (int i = 0; i < MAX_ATT; i++) {
      if (!_att[i].active) continue;
      float d = dist(in.x, in.y, _att[i].x, _att[i].y);
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      _att[best].active = false;
      _tackles++;
      addPop(_att[best].x, _att[best].y, false);
    }
  }

  for (int i = 0; i < MAX_ATT; i++) {
    Attacker& a = _att[i];
    if (!a.active) continue;
    a.y += a.speed * dt;
    a.wobble += dt * 3.0f;
    if (a.y >= BOX_Y) {
      a.active = false;
      _goals++;
      addPop(a.x, BOX_Y, true);
    }
  }

  if (_time >= TIME_LIMIT) _over = true;
}

int TackleGame::score() const {
  int s = _tackles * 5 - _goals * 8;
  return s < 0 ? 0 : (s > 100 ? 100 : s);
}

}  // namespace tr
