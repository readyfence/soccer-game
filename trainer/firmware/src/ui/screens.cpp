// Home, Play menu, Log, Plan, More, Stats and Link screens.
#include <math.h>
#include <stdio.h>
#include <string.h>

#include "../hal.h"
#include "app.h"
#include "avatar.h"

namespace ui {

using namespace tr;

static const char* const WEEKDAY_SHORT[7] = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"};
static const char* const WEEKDAY_LETTER[7] = {"M", "T", "W", "T", "F", "S", "S"};

// Bottom row of four buttons used on the home screen.
static const Rect NAV[4] = {{4, 196, 76, 42}, {82, 196, 76, 42}, {160, 196, 76, 42}, {238, 196, 78, 42}};

static void statusBar(App& app, Canvas& c) {
  char buf[24];
  if (hal::clockValid()) {
    int h, m;
    hal::localTime(h, m);
    int h12 = h % 12 == 0 ? 12 : h % 12;
    snprintf(buf, sizeof(buf), "%d:%02d %s", h12, m, h < 12 ? "am" : "pm");
    text(c, buf, 6, 11, D_ML, fTiny(), MUTED);
  }
  int streak = currentStreak(app.trainer.s);
  if (streak > 1) {
    snprintf(buf, sizeof(buf), "%d day streak", streak);
    text(c, buf, W / 2, 11, D_MC, fTiny(), ORANGE);
  }
  int pct = hal::batteryPct();
  batteryIcon(c, W - 32, 4, pct, hal::charging());
  if (pct >= 0) {
    snprintf(buf, sizeof(buf), "%d%%", pct);
    text(c, buf, W - 36, 11, D_MR, fTiny(), MUTED);
  }
}

// =================================================================== Home

class HomeScreen : public Screen {
 public:
  void update(App& app, const Input& in) override {
    if (!in.pressed) return;
    const PlayerCard& p = app.trainer.s.player;
    if (!p.present) {
      if (LINK_BTN.hit(in.x, in.y)) {
        app.click();
        app.openLink(false);
      } else if (NAV[3].hit(in.x, in.y)) {
        app.click();
        app.go(ScreenId::More);
      } else if (NAV[1].hit(in.x, in.y)) {
        app.click();
        app.go(ScreenId::Log);
      }
      return;
    }
    if (NAV[0].hit(in.x, in.y)) {
      app.click();
      app.go(ScreenId::Play);
    } else if (NAV[1].hit(in.x, in.y)) {
      app.click();
      app.go(ScreenId::Log);
    } else if (NAV[2].hit(in.x, in.y)) {
      app.click();
      app.go(ScreenId::Plan);
    } else if (NAV[3].hit(in.x, in.y)) {
      app.click();
      app.go(ScreenId::More);
    } else if (in.x < 116 && in.y > 24 && in.y < 190) {
      _cheer = 1.2f;  // tap the player: he celebrates
      app.note(1568, 60);
    }
  }

  void draw(App& app, Canvas& c) override {
    const TrainerState& s = app.trainer.s;
    const PlayerCard& p = s.player;
    c.fillScreen(BG);
    statusBar(app, c);
    if (!p.present) {
      drawEmpty(app, c);
      return;
    }
    uint32_t t = hal::ms();
    if (_cheer > 0) _cheer -= 1.0f / 30.0f;

    // Pitch patch and player
    c.fillRoundRect(4, 26, 108, 166, 10, PITCH);
    for (int i = 0; i < 4; i++) c.fillRect(10 + i * 26, 30, 13, 158, PITCH2);
    float bob = _cheer > 0 ? fabsf(sinf(_cheer * 9)) * 8 : sinf(t / 600.0f) * 1.5f;
    drawAvatar(c, 58, 40, 1.0f, p, bob, _cheer > 0);

    // Name, position, overall
    textFit(c, p.ascii, 118, 38, 140, D_ML, fTitle(), TEXT);
    char buf[40];
    snprintf(buf, sizeof(buf), "%s  %s", p.pos, p.club);
    text(c, buf, 118, 60, D_ML, fSmall(), MUTED);
    c.fillRoundRect(264, 26, 52, 48, 8, ACCENT);
    snprintf(buf, sizeof(buf), "%d", ovrNow(p));
    text(c, buf, 290, 44, D_MC, fBig(), BLACK);
    text(c, "OVR", 290, 66, D_MC, fTiny(), BLACK);

    // Stats with progress to the next point
    for (int i = 0; i < STAT_COUNT; i++) {
      Stat st = (Stat)i;
      int y = 88 + i * 21;
      int now = statNow(p, st);
      text(c, statName(st), 118, y, D_ML, fBody(), STAT_COL[i]);
      snprintf(buf, sizeof(buf), "%d", now);
      text(c, buf, 172, y, D_MR, fBody(), TEXT);
      float frac = now >= 99 ? 1.0f : (float)p.xp[i] / (float)pointCost(now);
      bar(c, 180, y - 5, 104, 10, frac, STAT_COL[i]);
      if (p.train[i]) {
        snprintf(buf, sizeof(buf), "+%u", (unsigned)p.train[i]);
        text(c, buf, 314, y, D_MR, fTiny(), GREEN);
      }
    }

    // Steps and energy
    char steps[16];
    fmtThousands(steps, sizeof(steps), s.today.steps);
    snprintf(buf, sizeof(buf), "%s steps", steps);
    text(c, buf, 118, 176, D_ML, fBody(), TEXT);
    text(c, "Energy", 250, 168, D_MC, fTiny(), MUTED);
    pips(c, 214, 183, 10, s.energy, ACCENT, 3, 8);

    button(c, NAV[0], "PLAY", GREEN, s.energy > 0);
    button(c, NAV[1], "LOG", BLUE);
    button(c, NAV[2], "PLAN", ORANGE);
    button(c, NAV[3], "MORE", GREY);
  }

 private:
  void drawEmpty(App& app, Canvas& c) {
    const TrainerState& s = app.trainer.s;
    text(c, "No player yet", W / 2, 44, D_MC, fTitle(), ACCENT);
    text(c, "1. Tap LINK below", 24, 76, D_ML, fBody(), TEXT);
    text(c, "2. In the game, open Trainer", 24, 100, D_ML, fBody(), TEXT);
    text(c, "3. Press SEND on a player", 24, 124, D_ML, fBody(), TEXT);
    char steps[16], buf[40];
    fmtThousands(steps, sizeof(steps), s.today.steps);
    snprintf(buf, sizeof(buf), "Steps today: %s", steps);
    text(c, buf, W / 2, 150, D_MC, fSmall(), MUTED);
    button(c, LINK_BTN, "LINK", GREEN);
    button(c, NAV[1], "LOG", BLUE);
    button(c, NAV[3], "MORE", GREY);
  }

  static constexpr Rect LINK_BTN = {160, 196, 76, 42};
  float _cheer = 0;
};
constexpr Rect HomeScreen::LINK_BTN;

// =================================================================== Play menu

static const Rect GAME_TILES[GAME_COUNT] = {{6, 42, 151, 76}, {163, 42, 151, 76}, {6, 124, 151, 76}, {163, 124, 151, 76}};

class PlayScreen : public Screen {
 public:
  void update(App& app, const Input& in) override {
    if (!in.pressed) return;
    if (BACK.hit(in.x, in.y)) {
      app.click();
      app.go(ScreenId::Home);
      return;
    }
    for (int g = 0; g < GAME_COUNT; g++) {
      if (!GAME_TILES[g].hit(in.x, in.y)) continue;
      if (!canPlay(app.trainer.s)) {
        app.buzz();
        app.toast(app.trainer.s.player.present ? "No energy. Go for a walk!" : "Send a player first");
        return;
      }
      app.click();
      app.startGame((uint8_t)g);
      return;
    }
  }

  void draw(App& app, Canvas& c) override {
    const TrainerState& s = app.trainer.s;
    c.fillScreen(BG);
    char right[16];
    snprintf(right, sizeof(right), "Energy %u", (unsigned)s.energy);
    header(c, "Games", true, right);
    bool ok = canPlay(s);
    for (int g = 0; g < GAME_COUNT; g++) {
      const Rect& r = GAME_TILES[g];
      Stat st = gameStat((uint8_t)g);
      uint32_t col = ok ? darker(STAT_COL[st], 0.45f) : PANEL;
      c.fillRoundRect(r.x, r.y, r.w, r.h, 12, col);
      c.drawRoundRect(r.x, r.y, r.w, r.h, 12, ok ? STAT_COL[st] : LINE);
      drawIcon(c, (uint8_t)g, r.x + 30, r.y + r.h / 2, ok);
      textFit(c, gameName((uint8_t)g), r.x + 58, r.y + 28, r.w - 62, D_ML, fBody(), ok ? TEXT : DIM);
      char buf[12];
      snprintf(buf, sizeof(buf), "+%s", statName(st));
      text(c, buf, r.x + 58, r.y + 52, D_ML, fBody(), ok ? STAT_COL[st] : DIM);
    }
    const char* msg = !s.player.present ? "Send a player from the game first"
                      : ok              ? "Each game uses 1 energy"
                                        : "Walk or log training to earn energy";
    textFit(c, msg, W / 2, 220, 300, D_MC, fSmall(), ok ? MUTED : ACCENT);
  }

 private:
  static void drawIcon(Canvas& c, uint8_t g, int x, int y, bool ok) {
    uint32_t w = ok ? WHITE : DIM;
    switch (g) {
      case GAME_PENALTY:
        c.drawRect(x - 18, y - 14, 36, 22, w);
        c.drawRect(x - 17, y - 13, 34, 20, w);
        drawBall(c, x, y + 14, 6);
        break;
      case GAME_DRIBBLE:
        c.fillTriangle(x - 16, y + 12, x - 11, y - 2, x - 6, y + 12, ORANGE);
        c.fillTriangle(x + 6, y + 12, x + 11, y - 2, x + 16, y + 12, ORANGE);
        drawBall(c, x, y - 8, 6);
        break;
      case GAME_KEEPY:
        drawBall(c, x, y - 8, 8);
        c.fillRoundRect(x - 10, y + 10, 20, 7, 3, w);
        break;
      default:
        c.fillCircle(x - 6, y - 4, 9, RED);
        c.drawWideLine(x - 4, y + 12, x + 14, y + 2, 3, w);
        break;
    }
  }
};

// =================================================================== Log

static const uint8_t MINUTES[7] = {10, 15, 20, 30, 45, 60, 90};

static Rect actTile(int i) { return Rect{(int16_t)(6 + (i % 4) * 78), (int16_t)(44 + (i / 4) * 78), 74, 72}; }
static Rect minuteBtn(int i) {
  return i < 4 ? Rect{(int16_t)(8 + i * 77), 44, 72, 46} : Rect{(int16_t)(46 + (i - 4) * 77), 96, 72, 46};
}
static const Rect LOG_IT = {60, 190, 200, 46};

class LogScreen : public Screen {
 public:
  void enter(App&) override {
    _act = -1;
    _minutes = 2;
  }

  void update(App& app, const Input& in) override {
    if (!in.pressed) return;
    if (BACK.hit(in.x, in.y)) {
      app.click();
      if (_act >= 0) _act = -1;
      else app.go(ScreenId::Home);
      return;
    }
    if (_act < 0) {
      for (int i = 0; i < ACT_COUNT; i++) {
        if (actTile(i).hit(in.x, in.y)) {
          app.click();
          _act = i;
          _minutes = i == ACT_MATCH ? 5 : 2;
        }
      }
      return;
    }
    for (int i = 0; i < 7; i++) {
      if (minuteBtn(i).hit(in.x, in.y)) {
        app.click();
        _minutes = i;
      }
    }
    if (LOG_IT.hit(in.x, in.y)) {
      Gain g = app.trainer.session((uint8_t)_act, MINUTES[_minutes]);
      char title[40];
      snprintf(title, sizeof(title), "%d min %s", MINUTES[_minutes], activityName((uint8_t)_act));
      app.go(ScreenId::Home);
      app.showReward(title, g);
    }
  }

  void draw(App& app, Canvas& c) override {
    c.fillScreen(BG);
    if (_act < 0) {
      header(c, "What did you do?");
      for (int i = 0; i < ACT_COUNT; i++) {
        Rect r = actTile(i);
        uint32_t col = STAT_COL[mainStat((uint8_t)i)];
        c.fillRoundRect(r.x, r.y, r.w, r.h, 10, PANEL2);
        c.fillRoundRect(r.x, r.y, r.w, 8, 4, col);
        textFit(c, shortActivity((uint8_t)i), r.cx(), r.y + 42, r.w - 6, D_MC, fBody(), TEXT);
      }
      text(c, "Pick the training you just did", W / 2, 214, D_MC, fSmall(), MUTED);
      return;
    }
    header(c, activityName((uint8_t)_act));
    for (int i = 0; i < 7; i++) {
      char buf[8];
      snprintf(buf, sizeof(buf), "%u min", (unsigned)MINUTES[i]);
      button(c, minuteBtn(i), buf, i == _minutes ? ACCENT : PANEL2);
    }
    int xp[STAT_COUNT];
    sessionXp((uint8_t)_act, MINUTES[_minutes], false, xp);
    char line[48] = "";
    for (int i = 0; i < STAT_COUNT; i++) {
      if (!xp[i]) continue;
      char part[16];
      snprintf(part, sizeof(part), "%s+%d %s", line[0] ? "  " : "", xp[i], statName((Stat)i));
      strncat(line, part, sizeof(line) - strlen(line) - 1);
    }
    if (app.trainer.s.player.present) {
      text(c, line, W / 2, 164, D_MC, fBody(), GREEN);
    } else {
      text(c, "No player yet - it still counts!", W / 2, 164, D_MC, fSmall(), MUTED);
    }
    button(c, LOG_IT, "LOG IT", GREEN, true, fTitle());
  }

 private:
  int _act = -1;
  int _minutes = 2;
};

// =================================================================== Plan

class PlanScreen : public Screen {
 public:
  void enter(App&) override { _confirm = -1; }

  void update(App& app, const Input& in) override {
    if (!in.pressed) return;
    Drill drills[DRILLS_PER_DAY];
    int n = todaysDrills(app.trainer.s, drills);
    if (_confirm >= 0) {
      if (YES.hit(in.x, in.y)) {
        Drill d = drills[_confirm];
        Gain g = app.trainer.drill(_confirm);
        char title[40];
        snprintf(title, sizeof(title), "Plan: %u min %s", (unsigned)d.minutes, shortActivity(d.act));
        _confirm = -1;
        app.showReward(title, g);
      } else if (NO.hit(in.x, in.y)) {
        app.click();
        _confirm = -1;
      }
      return;
    }
    if (BACK.hit(in.x, in.y)) {
      app.click();
      app.go(ScreenId::Home);
      return;
    }
    for (int i = 0; i < n; i++) {
      if (doneBtn(i).hit(in.x, in.y) && !(app.trainer.s.today.planDone & (1 << i))) {
        app.click();
        _confirm = i;
      }
    }
  }

  void draw(App& app, Canvas& c) override {
    const TrainerState& s = app.trainer.s;
    c.fillScreen(BG);
    bool known = dayKeyValid(s.today.key);
    int today = known ? weekdayMon0(s.today.key) : 0;
    char title[24];
    snprintf(title, sizeof(title), "Plan - %s", known ? WEEKDAY_SHORT[today] : "Today");
    header(c, title);

    Drill drills[DRILLS_PER_DAY];
    int n = todaysDrills(s, drills);
    if (!n) {
      text(c, "Rest day!", W / 2, 84, D_MC, fBig(), GREEN);
      text(c, "Rest helps you grow.", W / 2, 120, D_MC, fBody(), TEXT);
      text(c, "Walking still earns energy.", W / 2, 144, D_MC, fSmall(), MUTED);
    }
    for (int i = 0; i < n; i++) {
      int y = 44 + i * 50;
      bool done = s.today.planDone & (1 << i);
      c.fillRoundRect(6, y, 308, 44, 10, PANEL);
      c.fillRoundRect(6, y, 8, 44, 4, STAT_COL[mainStat(drills[i].act)]);
      char buf[32];
      snprintf(buf, sizeof(buf), "%s  %u min", activityName(drills[i].act), (unsigned)drills[i].minutes);
      textFit(c, buf, 22, y + 22, 210, D_ML, fBody(), done ? MUTED : TEXT);
      button(c, doneBtn(i), done ? "DONE" : "I DID IT", done ? GREEN : BLUE, !done, fTiny());
    }
    if (!known) text(c, "Tap LINK once to set the day", W / 2, 186, D_MC, fSmall(), ACCENT);

    // Week strip
    for (int d = 0; d < 7; d++) {
      int x = 26 + d * 45, y = 216;
      bool any = s.program.days[d][0].minutes || s.program.days[d][1].minutes || s.program.days[d][2].minutes;
      c.fillCircle(x, y, 14, any ? PANEL2 : BG);
      if (known && d == today) c.drawCircle(x, y, 15, ACCENT);
      text(c, WEEKDAY_LETTER[d], x, y, D_MC, fBody(), any ? TEXT : DIM);
    }

    if (_confirm >= 0) {
      c.fillRoundRect(20, 50, 280, 150, 14, PANEL2);
      c.drawRoundRect(20, 50, 280, 150, 14, ACCENT);
      char q[48];
      snprintf(q, sizeof(q), "%u min of %s?", (unsigned)drills[_confirm].minutes, activityName(drills[_confirm].act));
      text(c, "Did you do", W / 2, 76, D_MC, fBody(), MUTED);
      textFit(c, q, W / 2, 102, 260, D_MC, fTitle(), TEXT);
      button(c, YES, "YES", GREEN);
      button(c, NO, "NOT YET", GREY);
    }
  }

 private:
  static Rect doneBtn(int i) { return Rect{226, (int16_t)(44 + i * 50), 84, 44}; }
  static constexpr Rect YES = {36, 138, 116, 48};
  static constexpr Rect NO = {168, 138, 116, 48};
  int _confirm = -1;
};
constexpr Rect PlanScreen::YES;
constexpr Rect PlanScreen::NO;

// =================================================================== More

static Rect moreBtn(int i) { return Rect{(int16_t)(8 + (i % 2) * 156), (int16_t)(42 + (i / 2) * 58), 148, 50}; }

class MoreScreen : public Screen {
 public:
  void update(App& app, const Input& in) override {
    if (!in.pressed) return;
    Settings& set = app.trainer.s.settings;
    if (BACK.hit(in.x, in.y)) {
      app.click();
      app.go(ScreenId::Home);
    } else if (moreBtn(0).hit(in.x, in.y)) {
      app.click();
      app.go(ScreenId::Stats);
    } else if (moreBtn(1).hit(in.x, in.y)) {
      app.click();
      app.openLink(false);
    } else if (moreBtn(2).hit(in.x, in.y)) {
      app.click();
      app.openLink(true);
    } else if (moreBtn(3).hit(in.x, in.y)) {
      set.sound = !set.sound;
      app.click();
      app.trainer.markDirty();
      app.requestSave();
    } else if (moreBtn(4).hit(in.x, in.y)) {
      static const uint8_t LEVELS[4] = {60, 110, 170, 240};
      int next = 0;
      for (int i = 0; i < 4; i++) {
        if (set.brightness >= LEVELS[i]) next = (i + 1) % 4;
      }
      set.brightness = LEVELS[next];
      hal::setBrightness(set.brightness);
      app.click();
      app.trainer.markDirty();
      app.requestSave();
    } else if (moreBtn(5).hit(in.x, in.y)) {
      set.flipTilt = !set.flipTilt;
      app.click();
      app.trainer.markDirty();
      app.requestSave();
    }
  }

  void draw(App& app, Canvas& c) override {
    const Settings& set = app.trainer.s.settings;
    c.fillScreen(BG);
    header(c, "More");
    button(c, moreBtn(0), "STATS", BLUE);
    button(c, moreBtn(1), "LINK", GREEN);
    button(c, moreBtn(2), "WI-FI SETUP", PANEL2);
    button(c, moreBtn(3), set.sound ? "SOUND: ON" : "SOUND: OFF", PANEL2);
    int level = set.brightness >= 240 ? 4 : set.brightness >= 170 ? 3 : set.brightness >= 110 ? 2 : 1;
    char buf[20];
    snprintf(buf, sizeof(buf), "BRIGHT: %d/4", level);
    button(c, moreBtn(4), buf, PANEL2);
    button(c, moreBtn(5), set.flipTilt ? "TILT: FLIPPED" : "TILT: NORMAL", PANEL2);
    snprintf(buf, sizeof(buf), "Coach %s", set.coach);
    text(c, buf, W / 2, 222, D_MC, fSmall(), MUTED);
  }
};

// =================================================================== Stats

class StatsScreen : public Screen {
 public:
  void update(App& app, const Input& in) override {
    if (in.pressed && BACK.hit(in.x, in.y)) {
      app.click();
      app.go(ScreenId::More);
    }
  }
  bool keepAwake() const override { return true; }  // handy while tuning the sensor

  void draw(App& app, Canvas& c) override {
    const TrainerState& s = app.trainer.s;
    c.fillScreen(BG);
    header(c, "Stats");
    char buf[40], num[16];
    const DayLog& d = s.today;
    int y = 52;
    auto row = [&](const char* label, const char* value) {
      text(c, label, 10, y, D_ML, fSmall(), MUTED);
      text(c, value, 150, y, D_MR, fBody(), TEXT);
      y += 22;
    };
    fmtThousands(num, sizeof(num), d.steps);
    row("Steps", num);
    snprintf(buf, sizeof(buf), "%lu min", (unsigned long)(d.runSec / 60));
    row("Running", buf);
    snprintf(buf, sizeof(buf), "%lu min", (unsigned long)(d.walkSec / 60));
    row("Walking", buf);
    snprintf(buf, sizeof(buf), "%u / %u min", (unsigned)d.sessions, (unsigned)d.sessionMin);
    row("Training", buf);
    snprintf(buf, sizeof(buf), "%u", (unsigned)d.games);
    row("Games", buf);
    snprintf(buf, sizeof(buf), "%u", (unsigned)d.xp);
    row("XP today", buf);

    // Seven days of steps, oldest on the left.
    const int x0 = 166, base = 168, maxH = 104, bw = 18;
    uint32_t vals[7];
    uint32_t keys[7];
    for (int i = 0; i < 7; i++) {
      int age = 6 - i;  // 0 = today
      const DayLog* day = age == 0 ? &s.today : (age - 1 < s.historyCount ? &s.history[age - 1] : nullptr);
      vals[i] = day ? day->steps : 0;
      keys[i] = day ? day->key : 0;
    }
    uint32_t top = 10000;
    for (int i = 0; i < 7; i++) top = vals[i] > top ? vals[i] : top;
    int goalY = base - (int)(5000.0f / top * maxH);
    for (int x = x0 - 4; x < W - 6; x += 6) c.drawFastHLine(x, goalY, 3, DIM);
    for (int i = 0; i < 7; i++) {
      int x = x0 + i * 21;
      int h = (int)((float)vals[i] / top * maxH);
      uint32_t col = vals[i] >= 5000 ? GREEN : BLUE;
      if (h > 0) c.fillRoundRect(x, base - h, bw, h, 3, i == 6 ? ACCENT : col);
      const char* letter = dayKeyValid(keys[i]) ? WEEKDAY_LETTER[weekdayMon0(keys[i])] : "-";
      text(c, letter, x + bw / 2, base + 10, D_MC, fTiny(), MUTED);
    }
    text(c, "Steps, last 7 days", 240, 46, D_MC, fTiny(), MUTED);

    // Live sensor readout for tuning running detection.
    c.fillRoundRect(6, 190, 308, 46, 8, PANEL);
    snprintf(buf, sizeof(buf), "Cadence %d/min  Hit %.2fg", app.steps.cadence(), app.steps.intensity());
    text(c, buf, 14, 204, D_ML, fTiny(), TEXT);
    const char* mode = !app.steps.moving() ? "STILL" : (app.steps.running() ? "RUNNING" : "WALKING");
    text(c, mode, 306, 204, D_MR, fBody(), app.steps.running() ? ORANGE : (app.steps.moving() ? GREEN : DIM));
    text(c, "Sensor check: walk or jog with it in a pocket", 14, 224, D_ML, fTiny(), MUTED);
  }
};

// =================================================================== Link

class LinkScreen : public Screen {
 public:
  void enter(App& app) override {
    if (app.linkPortal) hal::netPortal();
    else hal::netLink();
    _start = hal::ms();
  }
  void leave(App&) override { hal::netStop(); }
  bool keepAwake() const override { return true; }

  void update(App& app, const Input& in) override {
    if (!in.pressed) return;
    if (BACK.hit(in.x, in.y)) {
      app.click();
      app.go(ScreenId::Home);
      return;
    }
    hal::Net st = hal::netState();
    if ((st == hal::Net::NoWifi || st == hal::Net::Failed) && SETUP.hit(in.x, in.y)) {
      app.click();
      app.openLink(true);
    } else if ((st == hal::Net::Failed || st == hal::Net::Off) && RETRY.hit(in.x, in.y)) {
      app.click();
      app.openLink(false);
    } else if (st == hal::Net::Portal && hal::netSsid()[0] && RETRY.hit(in.x, in.y)) {
      app.click();
      app.openLink(false);
    } else if (st == hal::Net::Failed && FORGET.hit(in.x, in.y)) {
      hal::netForget();
      app.toast("Wi-Fi forgotten");
      app.openLink(true);
    }
  }

  void draw(App& app, Canvas& c) override {
    c.fillScreen(BG);
    hal::Net st = hal::netState();
    header(c, st == hal::Net::Portal ? "Wi-Fi setup" : "Link");
    char buf[64];
    switch (st) {
      case hal::Net::Connecting: {
        int dots = (int)((hal::ms() - _start) / 400) % 4;
        snprintf(buf, sizeof(buf), "Joining %s%.*s", hal::netSsid(), dots, "...");
        textFit(c, buf, W / 2, 100, 300, D_MC, fTitle(), TEXT);
        text(c, "Hold on...", W / 2, 134, D_MC, fSmall(), MUTED);
        break;
      }
      case hal::Net::Linked: {
        snprintf(buf, sizeof(buf), "http://%s/", hal::netIp());
        c.fillRect(6, 42, 116, 116, WHITE);
        c.qrcode(buf, 8, 44, 112);
        text(c, "Parents:", 64, 170, D_MC, fTiny(), MUTED);
        text(c, "scan for dashboard", 64, 184, D_MC, fTiny(), MUTED);
        text(c, "Linked!", 132, 52, D_ML, fBig(), GREEN);
        text(c, "In the game open", 132, 84, D_ML, fSmall(), TEXT);
        text(c, "Trainer, then press", 132, 104, D_ML, fSmall(), TEXT);
        text(c, "SEND or SYNC", 132, 126, D_ML, fBody(), ACCENT);
        text(c, hal::netHost(), 132, 154, D_ML, fSmall(), MUTED);
        snprintf(buf, sizeof(buf), "or %s", hal::netIp());
        text(c, buf, 132, 174, D_ML, fSmall(), MUTED);
        if (app.trainer.s.player.present) {
          snprintf(buf, sizeof(buf), "Training: %s", app.trainer.s.player.ascii);
          textFit(c, buf, W / 2, 218, 300, D_MC, fSmall(), TEXT);
        }
        break;
      }
      case hal::Net::Portal: {
        snprintf(buf, sizeof(buf), "WIFI:T:nopass;S:%s;;", hal::netPortalName());
        c.fillRect(6, 42, 116, 116, WHITE);
        c.qrcode(buf, 8, 44, 112);
        text(c, "1. On a phone, join", 132, 52, D_ML, fSmall(), TEXT);
        text(c, hal::netPortalName(), 132, 74, D_ML, fBody(), ACCENT);
        text(c, "2. A page opens", 132, 100, D_ML, fSmall(), TEXT);
        text(c, "(or go to 192.168.4.1)", 132, 120, D_ML, fTiny(), MUTED);
        text(c, "3. Pick your home", 132, 144, D_ML, fSmall(), TEXT);
        text(c, "Wi-Fi and save", 132, 164, D_ML, fSmall(), TEXT);
        if (hal::netSsid()[0]) button(c, RETRY, "USE SAVED", PANEL2);
        break;
      }
      case hal::Net::NoWifi:
        text(c, "No Wi-Fi saved yet", W / 2, 90, D_MC, fTitle(), TEXT);
        text(c, "Ask a grown-up to set it up", W / 2, 120, D_MC, fSmall(), MUTED);
        button(c, SETUP, "SET UP WI-FI", GREEN);
        break;
      case hal::Net::Failed:
        snprintf(buf, sizeof(buf), "Couldn't join %s", hal::netSsid());
        textFit(c, buf, W / 2, 76, 300, D_MC, fTitle(), TEXT);
        text(c, "Check the password or move closer", W / 2, 104, D_MC, fSmall(), MUTED);
        button(c, RETRY, "TRY AGAIN", GREEN);
        button(c, SETUP, "SET UP", PANEL2);
        button(c, FORGET, "FORGET WI-FI", GREY, true, fTiny());
        break;
      case hal::Net::Off:
      default:
        text(c, "Link is off", W / 2, 90, D_MC, fTitle(), TEXT);
        text(c, "It turns off by itself to save battery", W / 2, 120, D_MC, fSmall(), MUTED);
        button(c, RETRY, "LINK AGAIN", GREEN);
        break;
    }
  }

 private:
  static constexpr Rect RETRY = {20, 140, 136, 48};
  static constexpr Rect SETUP = {164, 140, 136, 48};
  static constexpr Rect FORGET = {90, 196, 140, 40};
  uint32_t _start = 0;
};
constexpr Rect LinkScreen::RETRY;
constexpr Rect LinkScreen::SETUP;
constexpr Rect LinkScreen::FORGET;

// =================================================================== factories

Screen* makeHome() { return new HomeScreen(); }
Screen* makePlay() { return new PlayScreen(); }
Screen* makeLog() { return new LogScreen(); }
Screen* makePlan() { return new PlanScreen(); }
Screen* makeMore() { return new MoreScreen(); }
Screen* makeStats() { return new StatsScreen(); }
Screen* makeLink() { return new LinkScreen(); }

}  // namespace ui
