#include "app.h"

#include <stdio.h>
#include <string.h>

#include "../hal.h"

namespace ui {

using namespace tr;

// ------------------------------------------------------------------ helpers

void fmtThousands(char* out, size_t size, uint32_t v) {
  char raw[16];
  snprintf(raw, sizeof(raw), "%lu", (unsigned long)v);
  size_t len = strlen(raw), o = 0;
  for (size_t i = 0; i < len && o + 1 < size; i++) {
    out[o++] = raw[i];
    size_t left = len - i - 1;
    if (left && left % 3 == 0 && o + 1 < size) out[o++] = ',';
  }
  out[o] = 0;
}

const char* shortActivity(uint8_t act) {
  static const char* const NAMES[ACT_COUNT] = {"Shoot", "Pass", "Dribble", "Defend", "Fitness", "Keeper", "Team", "Match"};
  return act < ACT_COUNT ? NAMES[act] : "Train";
}

Stat mainStat(uint8_t act) {
  switch (act) {
    case ACT_SHOOT: return SHO;
    case ACT_PASS: return PAS;
    case ACT_DEFEND:
    case ACT_KEEPER: return DEF;
    default: return PAC;
  }
}

// ------------------------------------------------------------------ app

App::App(Trainer& t, StepDetector& s) : trainer(t), steps(s) {
  _screens[(int)ScreenId::Home] = makeHome();
  _screens[(int)ScreenId::Play] = makePlay();
  _screens[(int)ScreenId::Log] = makeLog();
  _screens[(int)ScreenId::Plan] = makePlan();
  _screens[(int)ScreenId::More] = makeMore();
  _screens[(int)ScreenId::Stats] = makeStats();
  _screens[(int)ScreenId::Link] = makeLink();
  _screens[(int)ScreenId::Game] = makeGame();
}

void App::begin() {
  _current = ScreenId::Home;
  _screens[(int)_current]->enter(*this);
}

void App::go(ScreenId id) {
  if (id == _current) return;
  _screens[(int)_current]->leave(*this);
  _current = id;
  _screens[(int)_current]->enter(*this);
}

void App::startGame(uint8_t game) {
  gameId = game;
  if (_current == ScreenId::Game) _screens[(int)_current]->enter(*this);
  else go(ScreenId::Game);
}

void App::openLink(bool portal) {
  linkPortal = portal;
  if (_current == ScreenId::Link) _screens[(int)_current]->enter(*this);
  else go(ScreenId::Link);
}

bool App::takeSaveRequest() {
  bool r = _saveRequested;
  _saveRequested = false;
  return r;
}

bool App::keepAwake() const {
  return _screens[(int)_current]->keepAwake() || trainer.hasPending();
}

void App::note(uint16_t freq, uint32_t ms) {
  if (trainer.s.settings.sound) hal::tone(freq, ms);
}

void App::click() { note(1800, 18); }
void App::buzz() { note(180, 120); }
void App::fanfare() {
  // Played as one rising chirp; the speaker queues nothing, so keep it short.
  note(1320, 160);
}

void App::toast(const char* msg, uint32_t forMs) {
  strncpy(_toast, msg, sizeof(_toast) - 1);
  _toast[sizeof(_toast) - 1] = 0;
  _toastUntil = _now + forMs;
}

void App::showReward(const char* title, const Gain& g) {
  strncpy(_rewardTitle, title, sizeof(_rewardTitle) - 1);
  _rewardTitle[sizeof(_rewardTitle) - 1] = 0;
  _gain = g;
  _reward = true;
  _rewardAt = _now;
  if (g.totalPoints() > 0) fanfare();
  else note(1046, 90);
  requestSave();
}

void App::onWake() {
  Gain g;
  if (trainer.takeBackgroundLevelUps(g)) showReward("While you were moving", g);
}

void App::update(const Input& in) {
  _now = in.ms;
  if (_reward) {
    if (in.pressed && _now - _rewardAt > 600) {
      _reward = false;
      click();
    }
    return;
  }
  if (trainer.hasPending()) {
    updateSwap(in);
    return;
  }
  _screens[(int)_current]->update(*this, in);
}

void App::draw(Canvas& c) {
  _screens[(int)_current]->draw(*this, c);
  if (trainer.hasPending()) drawSwap(c);
  if (_reward) drawReward(c);
  if (_toast[0] && _now < _toastUntil) {
    c.setFont(fBody());
    int w = c.textWidth(_toast) + 28;
    if (w > W - 16) w = W - 16;
    int x = (W - w) / 2;
    c.fillRoundRect(x, 168, w, 32, 10, darker(PANEL2, 0.1f));
    c.drawRoundRect(x, 168, w, 32, 10, ACCENT);
    textFit(c, _toast, W / 2, 184, w - 16, MC, fBody(), TEXT);
  }
}

// ------------------------------------------------------------------ swap question

static const Rect SWAP_YES = {34, 150, 116, 48};
static const Rect SWAP_NO = {170, 150, 116, 48};

void App::updateSwap(const Input& in) {
  if (!in.pressed) return;
  if (SWAP_YES.hit(in.x, in.y)) {
    char msg[64];
    snprintf(msg, sizeof(msg), "%s is here!", trainer.pending().ascii);
    trainer.acceptPending();  // also picks a plan for his position unless a parent set one
    fanfare();
    toast(msg);
    requestSave();
    go(ScreenId::Home);
  } else if (SWAP_NO.hit(in.x, in.y)) {
    trainer.declinePending();
    click();
  }
}

void App::drawSwap(Canvas& c) {
  c.fillRoundRect(14, 24, 292, 190, 14, PANEL);
  c.drawRoundRect(14, 24, 292, 190, 14, ACCENT);
  text(c, "New player!", W / 2, 46, MC, fTitle(), ACCENT);
  char line[64];
  snprintf(line, sizeof(line), "%s wants to train.", trainer.pending().ascii);
  textFit(c, line, W / 2, 84, 270, MC, fBody(), TEXT);
  if (trainer.s.player.present) {
    snprintf(line, sizeof(line), "%s stays saved here.", trainer.s.player.ascii);
    textFit(c, line, W / 2, 110, 270, MC, fSmall(), MUTED);
  }
  text(c, "Swap?", W / 2, 132, MC, fBody(), TEXT);
  button(c, SWAP_YES, "YES", GREEN);
  button(c, SWAP_NO, "NO", GREY);
}

// ------------------------------------------------------------------ rewards

void App::drawReward(Canvas& c) {
  const Gain& g = _gain;
  bool levelled = g.totalPoints() > 0;
  c.fillRoundRect(10, 14, 300, 212, 14, PANEL);
  c.drawRoundRect(10, 14, 300, 212, 14, levelled ? ACCENT : LINE);
  int y = 36;
  if (levelled) {
    text(c, "LEVEL UP!", W / 2, y, MC, fBig(), ACCENT);
    y += 30;
    textFit(c, _rewardTitle, W / 2, y, 280, MC, fBody(), MUTED);
  } else {
    textFit(c, _rewardTitle, W / 2, y + 4, 280, MC, fTitle(), TEXT);
    y += 22;
  }
  y += 24;

  const PlayerCard& p = trainer.s.player;
  int rows = 0;
  for (int i = 0; i < STAT_COUNT && p.present; i++) {
    if (g.xp[i] <= 0) continue;
    Stat st = (Stat)i;
    char buf[24];
    text(c, statName(st), 26, y, ML, fBody(), STAT_COL[i]);
    snprintf(buf, sizeof(buf), "+%d XP", g.xp[i]);
    text(c, buf, 74, y, ML, fBody(), TEXT);
    int now = statNow(p, st);
    float frac = now >= 99 ? 1.0f : (float)p.xp[i] / (float)pointCost(now);
    bar(c, 160, y - 5, 80, 10, frac, STAT_COL[i]);
    if (g.points[i] > 0) {
      snprintf(buf, sizeof(buf), "%d", now);
      text(c, buf, 290, y, MR, fTitle(), GREEN);
      c.fillTriangle(252, y + 5, 260, y - 6, 268, y + 5, GREEN);
    }
    y += 28;
    rows++;
  }
  if (!rows) {
    const char* msg = p.present ? "Nice work!" : "Logged! Send a player from the game to earn XP.";
    textFit(c, msg, W / 2, y + 16, 280, MC, fBody(), TEXT);
    y += 40;
  }
  if (p.present && g.ovrAfter > g.ovrBefore && g.ovrBefore > 0) {
    char buf[32];
    snprintf(buf, sizeof(buf), "OVR %d  >  %d", g.ovrBefore, g.ovrAfter);
    text(c, buf, W / 2, 190, MC, fTitle(), ACCENT);
  }
  if (_now - _rewardAt > 600) text(c, "Tap to continue", W / 2, 212, MC, fSmall(), MUTED);
}

}  // namespace ui
