// Screen manager plus the overlays every screen shares: rewards, toasts and the
// "swap players?" question when a different player is sent from the game.
#pragma once

#include "../core/steps.h"
#include "../trainer.h"
#include "theme.h"

namespace ui {

struct Input {
  bool down = false;      // finger on the screen
  bool pressed = false;   // touch began this frame
  bool released = false;  // touch ended this frame
  int x = 0;
  int y = 0;
  bool pwr = false;       // power button clicked
  float ax = 0, ay = 0, az = 1;  // accelerometer, g
  uint32_t ms = 0;
  float dt = 0;           // seconds since last frame
};

enum class ScreenId : uint8_t { Home, Play, Log, Plan, More, Stats, Link, Game, COUNT };

class App;

class Screen {
 public:
  virtual ~Screen() {}
  virtual void enter(App&) {}
  virtual void leave(App&) {}
  virtual void update(App& app, const Input& in) = 0;
  virtual void draw(App& app, Canvas& c) = 0;
  virtual bool keepAwake() const { return false; }  // stop the screen sleeping (games, link)
};

// Screens live in screens.cpp / games_ui.cpp.
Screen* makeHome();
Screen* makePlay();
Screen* makeLog();
Screen* makePlan();
Screen* makeMore();
Screen* makeStats();
Screen* makeLink();
Screen* makeGame();

class App {
 public:
  App(tr::Trainer& t, tr::StepDetector& steps);
  void begin();
  void update(const Input& in);
  void draw(Canvas& c);

  void go(ScreenId id);
  ScreenId current() const { return _current; }
  void startGame(uint8_t game);
  void openLink(bool portal);

  void showReward(const char* title, const tr::Gain& g);
  void toast(const char* msg, uint32_t forMs = 2600);

  void click();
  void buzz();
  void fanfare();
  void note(uint16_t freq, uint32_t ms);

  void requestSave() { _saveRequested = true; }
  bool takeSaveRequest();
  bool keepAwake() const;
  void onWake();  // shows level-ups earned while the screen was off

  tr::Trainer& trainer;
  tr::StepDetector& steps;
  uint8_t gameId = 0;
  bool linkPortal = false;

 private:
  void drawReward(Canvas& c);
  void drawSwap(Canvas& c);
  void updateSwap(const Input& in);

  Screen* _screens[(int)ScreenId::COUNT] = {};
  ScreenId _current = ScreenId::Home;
  uint32_t _now = 0;

  bool _reward = false;
  char _rewardTitle[40] = {0};
  tr::Gain _gain;
  uint32_t _rewardAt = 0;

  char _toast[64] = {0};
  uint32_t _toastUntil = 0;

  bool _saveRequested = false;
};

// Shared formatting helpers.
void fmtThousands(char* out, size_t size, uint32_t v);
const char* shortActivity(uint8_t act);  // "Shoot", "Pass", ...
tr::Stat mainStat(uint8_t act);

}  // namespace ui
