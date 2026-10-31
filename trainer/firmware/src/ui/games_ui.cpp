// Drawing and input for the four mini games. Rules live in core/minigames.cpp.
#include <math.h>
#include <stdio.h>
#include <string.h>

#include "../core/minigames.h"
#include "../hal.h"
#include "app.h"
#include "avatar.h"

namespace ui {

using namespace tr;

static const Rect QUIT = {270, 0, 50, 34};
static const uint32_t KEEPER_KIT = 0xf2c200;
static const uint32_t RIVAL_KIT = 0xe8531f;

// Tilt: full steer at ~20 degrees, ignore the first ~3.5 degrees.
static const float TILT_DEAD = 0.06f;
static const float TILT_FULL = 0.35f;

static void hudText(Canvas& c, const char* s, int x, uint8_t datum, uint32_t col = TEXT) {
  text(c, s, x, 14, datum, fBody(), col);
}

static void stripes(Canvas& c, float offset) {
  c.fillScreen(PITCH);
  int o = ((int)offset) % 60;
  for (int y = -60 + o; y < H; y += 60) c.fillRect(0, y, W, 30, PITCH2);
}

class GameScreen : public Screen {
 public:
  enum Phase : uint8_t { INTRO, PLAY, DONE };

  void enter(App& app) override {
    _game = app.gameId;
    _phase = INTRO;
    _t = 0;
    uint32_t seed = hal::ms() * 2654435761u + 17;
    _pen = PenaltyGame(seed);
    _drib = DribbleGame(seed ^ 0x5bd1e995u);
    _keepy = KeepyGame(seed ^ 0x27d4eb2fu);
    _tackle = TackleGame(seed ^ 0x165667b1u);
    _neutral = 0;
    _neutralN = 0;
    _lastOutcome = PenaltyGame::NONE;
  }
  bool keepAwake() const override { return true; }

  void update(App& app, const Input& in) override {
    _t += in.dt;
    if (_phase == INTRO) {
      // Average the resting tilt so "level" is however Huxley holds it.
      if (_t < 1.0f) {
        _neutral += in.ax;
        _neutralN++;
      }
      if (in.pressed && QUIT.hit(in.x, in.y)) {
        app.click();
        app.go(ScreenId::Play);
      } else if (in.pressed && _t > 0.6f) {
        if (_neutralN) _neutral /= _neutralN;
        _neutralN = 0;
        _phase = PLAY;
        _t = 0;
        app.note(1200, 60);
      }
      return;
    }
    if (_phase == DONE) {
      if (in.pressed && _t > 0.8f) {
        Gain g = app.trainer.miniGame(_game, score());
        char title[40];
        snprintf(title, sizeof(title), "%s: %d pts", gameName(_game), score());
        app.go(ScreenId::Play);
        app.showReward(title, g);
      }
      return;
    }
    if (in.pressed && QUIT.hit(in.x, in.y)) {
      app.click();
      app.go(ScreenId::Play);
      return;
    }

    GameInput gi;
    gi.tap = in.pressed;
    gi.x = (float)in.x;
    gi.y = (float)in.y;
    float raw = in.ax - _neutral;
    float mag = fabsf(raw) < TILT_DEAD ? 0 : (fabsf(raw) - TILT_DEAD) / (TILT_FULL - TILT_DEAD);
    if (mag > 1) mag = 1;
    // Right edge down reads as negative x on the CoreS3; More > TILT flips it if not.
    float sign = raw < 0 ? 1.0f : -1.0f;
    if (app.trainer.s.settings.flipTilt) sign = -sign;
    gi.tilt = sign * mag;

    float dt = in.dt > 0.1f ? 0.1f : in.dt;
    bool over = false;
    switch (_game) {
      case GAME_PENALTY: {
        int goals = _pen.goals();
        _pen.update(dt, gi);
        if (_pen.phase() == PenaltyGame::RESULT && _lastOutcome != _pen.lastOutcome()) {
          if (_pen.goals() > goals) app.note(1568, 160);
          else app.note(220, 140);
        }
        _lastOutcome = _pen.phase() == PenaltyGame::RESULT ? _pen.lastOutcome() : PenaltyGame::NONE;
        if (gi.tap) app.click();
        over = _pen.over();
        break;
      }
      case GAME_DRIBBLE: {
        int lives = _drib.lives(), pts = _drib.points();
        _drib.update(dt, gi);
        if (_drib.lives() < lives) app.buzz();
        else if (_drib.points() > pts) app.note(1320, 30);
        over = _drib.over();
        break;
      }
      case GAME_KEEPY: {
        int touches = _keepy.touches();
        _keepy.update(dt, gi);
        if (_keepy.touches() > touches) app.note(900 + (_keepy.touches() % 8) * 90, 30);
        if (_keepy.dropped()) app.buzz();
        over = _keepy.over();
        break;
      }
      default: {
        int tk = _tackle.tackles(), gl = _tackle.conceded();
        _tackle.update(dt, gi);
        if (_tackle.tackles() > tk) app.note(1400, 40);
        if (_tackle.conceded() > gl) app.buzz();
        over = _tackle.over();
        break;
      }
    }
    if (over) {
      _phase = DONE;
      _t = 0;
      app.note(score() >= 60 ? 1760 : 880, 200);
    }
  }

  void draw(App& app, Canvas& c) override {
    switch (_game) {
      case GAME_PENALTY: drawPenalty(c); break;
      case GAME_DRIBBLE: drawDribble(app, c); break;
      case GAME_KEEPY: drawKeepy(c); break;
      default: drawTackle(c); break;
    }
    if (_phase == INTRO) drawIntro(c);
    else if (_phase == DONE) drawDone(c);
    else drawQuit(c);
  }

 private:
  int score() const {
    switch (_game) {
      case GAME_PENALTY: return _pen.score();
      case GAME_DRIBBLE: return _drib.score();
      case GAME_KEEPY: return _keepy.score();
      default: return _tackle.score();
    }
  }

  static void drawQuit(Canvas& c) {
    c.fillRoundRect(282, 6, 32, 24, 6, darker(BG, 0.2f));
    c.drawLine(291, 11, 305, 25, WHITE);
    c.drawLine(305, 11, 291, 25, WHITE);
    c.drawLine(292, 11, 306, 25, WHITE);
    c.drawLine(306, 11, 292, 25, WHITE);
  }

  void drawIntro(Canvas& c) {
    static const char* const HOW[GAME_COUNT][2] = {
        {"Tap to aim, then tap", "for power. Beat the keeper!"},
        {"Tilt left and right to", "dribble past defenders."},
        {"Tap the ball as it drops.", "Tap its side to steer it."},
        {"Tap attackers before", "they reach your box!"},
    };
    c.fillRoundRect(16, 36, 288, 170, 14, PANEL);
    c.drawRoundRect(16, 36, 288, 170, 14, STAT_COL[gameStat(_game)]);
    text(c, gameName(_game), W / 2, 62, MC, fTitle(), ACCENT);
    text(c, HOW[_game][0], W / 2, 100, MC, fBody(), TEXT);
    text(c, HOW[_game][1], W / 2, 122, MC, fBody(), TEXT);
    if (_game == GAME_DRIBBLE && _t < 1.0f) {
      text(c, "Hold it how you like...", W / 2, 160, MC, fSmall(), MUTED);
    } else {
      bool blink = ((int)(_t * 2.5f)) % 2 == 0;
      text(c, "TAP TO START", W / 2, 166, MC, fTitle(), blink ? GREEN : darker(GREEN, 0.3f));
    }
    drawQuit(c);
  }

  void drawDone(Canvas& c) {
    c.fillRoundRect(30, 40, 260, 160, 14, PANEL);
    c.drawRoundRect(30, 40, 260, 160, 14, ACCENT);
    text(c, "Full time!", W / 2, 64, MC, fTitle(), ACCENT);
    char buf[40];
    switch (_game) {
      case GAME_PENALTY: snprintf(buf, sizeof(buf), "%d of 5 scored", _pen.goals()); break;
      case GAME_DRIBBLE: snprintf(buf, sizeof(buf), "%d gates, %d lives left", _drib.gates(), _drib.lives()); break;
      case GAME_KEEPY: snprintf(buf, sizeof(buf), "%d touches", _keepy.touches()); break;
      default: snprintf(buf, sizeof(buf), "%d tackles, %d let in", _tackle.tackles(), _tackle.conceded()); break;
    }
    text(c, buf, W / 2, 98, MC, fBody(), TEXT);
    snprintf(buf, sizeof(buf), "%d", score());
    text(c, buf, W / 2, 140, MC, fHuge(), GREEN);
    if (_t > 0.8f) text(c, "Tap to collect XP", W / 2, 182, MC, fSmall(), MUTED);
  }

  // ------------------------------------------------------------ penalties

  void drawPenalty(Canvas& c) {
    const PenaltyGame& g = _pen;
    // Stand and crowd
    c.fillRect(0, 0, W, 40, 0x10183a);
    for (int i = 0; i < 40; i++) {
      uint32_t col = (i * 37) % 3 == 0 ? 0x3a4a80u : ((i * 13) % 4 == 0 ? 0x80405au : 0x2a3566u);
      c.fillCircle(6 + i * 8, 26 + (i * 7) % 9, 3, col);
    }
    c.fillRect(0, 40, W, H - 40, PITCH);
    for (int y = 40; y < H; y += 40) c.fillRect(0, y, W, 20, PITCH2);
    // Box lines
    c.drawRect(30, (int)PenaltyGame::GOAL_LINE, 260, 70, WHITE);
    c.fillCircle((int)PenaltyGame::SPOT_X, (int)PenaltyGame::SPOT_Y + 4, 2, WHITE);
    // Net and frame
    int gl = (int)PenaltyGame::GOAL_L, gr = (int)PenaltyGame::GOAL_R;
    int gt = (int)PenaltyGame::GOAL_TOP, gb = (int)PenaltyGame::GOAL_LINE;
    c.fillRect(gl, gt, gr - gl, gb - gt, 0x2a6a3c);
    for (int x = gl; x <= gr; x += 10) c.drawFastVLine(x, gt, gb - gt, 0x5f9a70);
    for (int y = gt; y <= gb; y += 10) c.drawFastHLine(gl, y, gr - gl, 0x5f9a70);
    c.fillRect(gl - 4, gt - 4, 4, gb - gt + 4, WHITE);
    c.fillRect(gr, gt - 4, 4, gb - gt + 4, WHITE);
    c.fillRect(gl - 4, gt - 4, gr - gl + 8, 4, WHITE);

    // Keeper (leans and dives sideways)
    float kx = 160 + g.keeperX() * 100;
    float lean = g.keeperDive();
    int fx = (int)kx, fy = gb - 2;
    int hx = (int)(kx + lean * 42), hy = gb - 46 + (int)(fabsf(lean) * 22);
    c.drawWideLine(fx, fy, hx, hy + 10, 9, KEEPER_KIT);
    c.drawWideLine(hx - 16, hy + 12, hx + 16, hy + 12 - (int)(lean * 10), 4, KEEPER_KIT);
    c.fillCircle(hx, hy, 7, 0xbd8662);

    // Ball (smaller as it flies away)
    float flight = g.phase() == PenaltyGame::FLIGHT || g.phase() == PenaltyGame::RESULT ? g.flight() : 0;
    int br = (int)(9 - flight * 3.5f);
    drawBall(c, (int)g.ballX(), (int)g.ballY(), br, flight * 9);

    // Aim marker and power bar
    if (g.phase() == PenaltyGame::AIM) {
      int ax = 160 + (int)(g.aim() * 100);
      c.drawCircle(ax, gb - 34, 10, ACCENT);
      c.drawCircle(ax, gb - 34, 11, ACCENT);
      c.drawFastVLine(ax, gb - 48, 28, ACCENT);
      c.drawFastHLine(ax - 14, gb - 34, 28, ACCENT);
      text(c, "TAP to aim", W / 2, 150, MC, fTitle(), TEXT);
    } else {
      int ax = 160 + (int)(g.lockedAim() * 100);
      if (g.phase() == PenaltyGame::POWER) c.drawCircle(ax, gb - 34, 10, WHITE);
    }
    if (g.phase() == PenaltyGame::POWER) {
      const int bx = 292, by = 60, bh = 140;
      c.fillRoundRect(bx, by, 18, bh, 6, PANEL);
      int sweetTop = by + (int)((1 - PenaltyGame::SWEET_HI) * bh);
      int sweetBot = by + (int)((1 - PenaltyGame::SWEET_LO) * bh);
      int overY = by + (int)((1 - PenaltyGame::OVER_POWER) * bh);
      c.fillRect(bx + 2, sweetTop, 14, sweetBot - sweetTop, darker(GREEN, 0.2f));
      c.fillRect(bx + 2, by + 2, 14, overY - by - 2, darker(RED, 0.2f));
      int py = by + (int)((1 - g.power()) * bh);
      c.fillRect(bx - 4, py - 2, 26, 5, WHITE);
      text(c, "TAP for power", W / 2 - 14, 150, MC, fTitle(), TEXT);
    }
    if (g.phase() == PenaltyGame::RESULT) {
      static const char* const WORDS[] = {"", "GOAL!", "SAVED!", "WIDE!", "OVER!"};
      uint32_t col = g.lastOutcome() == PenaltyGame::GOAL ? ACCENT : WHITE;
      text(c, WORDS[g.lastOutcome()], W / 2, 158, MC, fHuge(), col);
    }

    // Shots so far
    c.fillRoundRect(4, 4, 92, 24, 8, darker(BG, 0.1f));
    for (int i = 0; i < PenaltyGame::SHOTS; i++) {
      PenaltyGame::Outcome o = g.outcomeOf(i);
      uint32_t col = o == PenaltyGame::GOAL ? GREEN : (o == PenaltyGame::NONE ? DIM : RED);
      c.fillCircle(16 + i * 17, 16, 6, col);
    }
  }

  // ------------------------------------------------------------ dribble

  void drawDribble(App& app, Canvas& c) {
    const DribbleGame& g = _drib;
    stripes(c, g.scroll());
    c.drawFastVLine(8, 0, H, 0x9fd4ab);
    c.drawFastVLine(W - 9, 0, H, 0x9fd4ab);
    for (int i = 0; i < DribbleGame::MAX_OBS; i++) {
      const DribbleGame::Obstacle& o = g.obstacle(i);
      if (!o.active) continue;
      int y = (int)o.y;
      if (o.gate) {
        int l = (int)(o.x - o.gap / 2), r = (int)(o.x + o.gap / 2);
        for (int x = l + 8; x < r - 6; x += 10) c.fillRect(x, y, 5, 2, o.scored ? DIM : WHITE);
        for (int cx : {l, r}) {
          c.fillTriangle(cx - 8, y + 7, cx, y - 11, cx + 8, y + 7, o.hit ? DIM : ORANGE);
          c.fillRect(cx - 5, y - 2, 10, 3, WHITE);
        }
      } else {
        int x = (int)o.x;
        uint32_t kit = o.hit ? DIM : RIVAL_KIT;
        c.fillEllipse(x, y + 4, 15, 10, darker(kit, 0.3f));
        c.fillCircle(x, y, 12, kit);
        c.fillCircle(x, y - 3, 6, 0x8e5b3c);
      }
    }
    // Our player: the ball at his feet with him just behind.
    bool blink = g.invulnerable() && ((int)(g.timeLeft() * 10)) % 2 == 0;
    if (!blink) {
      const PlayerCard& p = app.trainer.s.player;
      int x = (int)g.x(), y = (int)DribbleGame::PLAYER_Y;
      c.fillEllipse(x, y + 18, 14, 9, darker(p.kitShirt, 0.3f));
      c.fillCircle(x, y + 14, 11, p.kitShirt);
      c.fillCircle(x, y + 16, 6, skinColour(p.look.tone));
      drawBall(c, x, y, (int)DribbleGame::BALL_R, g.scroll() / 14.0f);
    }
    // HUD
    c.fillRect(0, 0, W, 28, darker(BG, 0.1f));
    for (int i = 0; i < DribbleGame::LIVES; i++) c.fillCircle(14 + i * 18, 14, 6, i < g.lives() ? RED : DIM);
    char buf[16];
    snprintf(buf, sizeof(buf), "%d s", (int)ceilf(g.timeLeft()));
    hudText(c, buf, W / 2 - 20, MC);
    snprintf(buf, sizeof(buf), "%d", g.points());
    hudText(c, buf, 262, MR, ACCENT);
  }

  // ------------------------------------------------------------ keepy-uppy

  void drawKeepy(Canvas& c) {
    const KeepyGame& g = _keepy;
    c.fillScreen(0x5aa9e6);
    c.fillRect(0, 150, W, 90, PITCH);
    c.fillRect(0, 150, W, 6, PITCH2);
    c.fillCircle(270, 50, 16, 0xfff1a8);
    c.fillRect(0, (int)KeepyGame::GROUND, W, H - (int)KeepyGame::GROUND, darker(PITCH, 0.25f));
    // Shadow grows as the ball comes down
    float near = (g.by() - 40) / (KeepyGame::GROUND - 40);
    c.fillEllipse((int)g.bx(), (int)KeepyGame::GROUND - 2, (int)(6 + near * 12), 3, darker(PITCH, 0.4f));
    drawBall(c, (int)g.bx(), (int)g.by(), (int)KeepyGame::R, g.spin());
    if (g.sinceTap() < 0.3f) {
      int r = (int)(8 + g.sinceTap() * 60);
      c.drawCircle((int)g.lastTapX(), (int)g.lastTapY(), r, g.lastTapHit() ? ACCENT : WHITE);
    }
    char buf[16];
    snprintf(buf, sizeof(buf), "%d", g.touches());
    text(c, buf, W / 2, 34, MC, fHuge(), WHITE);
    snprintf(buf, sizeof(buf), "%d s", (int)ceilf(g.timeLeft()));
    text(c, buf, 10, 14, ML, fBody(), WHITE);
    if (g.dropped()) text(c, "Dropped it!", W / 2, 120, MC, fBig(), WHITE);
  }

  // ------------------------------------------------------------ tackles

  void drawTackle(Canvas& c) {
    const TackleGame& g = _tackle;
    stripes(c, 0);
    for (int l = 1; l < TackleGame::LANES; l++) {
      int x = (int)((TackleGame::laneX(l - 1) + TackleGame::laneX(l)) / 2);
      for (int y = 30; y < (int)TackleGame::BOX_Y; y += 14) c.drawFastVLine(x, y, 6, 0x6fbf86);
    }
    int box = (int)TackleGame::BOX_Y;
    c.drawFastHLine(0, box, W, WHITE);
    c.drawFastHLine(0, box + 1, W, WHITE);
    c.fillRect(110, H - 8, 100, 8, WHITE);
    for (int i = 0; i < TackleGame::MAX_ATT; i++) {
      const TackleGame::Attacker& a = g.attacker(i);
      if (!a.active) continue;
      int x = (int)(a.x + sinf(a.wobble) * 5), y = (int)a.y;
      c.fillEllipse(x, y + 3, 15, 11, darker(RIVAL_KIT, 0.3f));
      c.fillCircle(x, y, 13, RIVAL_KIT);
      c.fillCircle(x, y - 3, 6, 0xdcab88);
      drawBall(c, x + 4, y + 17, 5, a.y / 8.0f);
    }
    for (int i = 0; i < TackleGame::MAX_POPS; i++) {
      const TackleGame::Pop& p = g.pop(i);
      if (p.t <= 0) continue;
      int rise = (int)((0.7f - p.t) * 40);
      text(c, p.goal ? "GOAL" : "TACKLE!", (int)p.x, (int)p.y - 20 - rise, MC, fBody(), p.goal ? RED : ACCENT);
    }
    c.fillRect(0, 0, W, 28, darker(BG, 0.1f));
    char buf[24];
    snprintf(buf, sizeof(buf), "Tackles %d", g.tackles());
    hudText(c, buf, 8, ML, GREEN);
    snprintf(buf, sizeof(buf), "%d s", (int)ceilf(g.timeLeft()));
    hudText(c, buf, 150, MC);
    snprintf(buf, sizeof(buf), "Goals %d", g.conceded());
    hudText(c, buf, 262, MR, g.conceded() ? RED : MUTED);
  }

  uint8_t _game = 0;
  Phase _phase = INTRO;
  float _t = 0;
  float _neutral = 0;
  int _neutralN = 0;
  PenaltyGame::Outcome _lastOutcome = PenaltyGame::NONE;
  PenaltyGame _pen;
  DribbleGame _drib;
  KeepyGame _keepy;
  TackleGame _tackle;
};

Screen* makeGame() { return new GameScreen(); }

}  // namespace ui
