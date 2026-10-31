// Soccer Trainer for M5Stack CoreS3: wiring between the hardware and the trainer/UI code.
#include <LittleFS.h>
#include <M5Unified.h>
#include <time.h>

#include <string>

#include "hal.h"
#include "net.h"
#include "trainer.h"
#include "ui/app.h"

// ------------------------------------------------------------------ storage

class FlashStorage : public tr::Storage {
 public:
  bool read(const char* path, std::string& out) override {
    // A power cut between "remove" and "rename" in write() leaves only the .tmp file.
    std::string tmp = std::string(path) + ".tmp";
    const char* use = LittleFS.exists(path) ? path : (LittleFS.exists(tmp.c_str()) ? tmp.c_str() : nullptr);
    if (!use) return false;
    File f = LittleFS.open(use, "r");
    if (!f) return false;
    out.clear();
    out.reserve(f.size());
    uint8_t buf[256];
    while (f.available()) {
      size_t n = f.read(buf, sizeof(buf));
      if (!n) break;
      out.append((const char*)buf, n);
    }
    f.close();
    return true;
  }

  bool write(const char* path, const std::string& data) override {
    std::string tmp = std::string(path) + ".tmp";
    File f = LittleFS.open(tmp.c_str(), "w");
    if (!f) return false;
    size_t n = f.write((const uint8_t*)data.data(), data.size());
    f.close();
    if (n != data.size()) return false;
    if (LittleFS.exists(path)) LittleFS.remove(path);
    return LittleFS.rename(tmp.c_str(), path);
  }
};

// ------------------------------------------------------------------ globals

static FlashStorage storage;
static tr::Trainer trainer;
static tr::StepDetector steps;
static ui::App* app = nullptr;
static M5Canvas canvas(&M5.Display);

enum class Screen : uint8_t { On, Dim, Off };
static Screen screen = Screen::On;
static const uint32_t DIM_AFTER_MS = 30000;
static const uint32_t OFF_AFTER_MS = 60000;
static const uint32_t WAKE_HOLD_MS = 300;
static const uint32_t FRAME_MS = 33;
static const uint8_t DIM_LEVEL = 20;

static uint32_t lastActive = 0;
static uint32_t lastFrame = 0;
static uint32_t lastImu = 0;
static uint32_t lastSecond = 0;
static uint32_t touchStart = 0;
static bool swallowTouch = false;  // the touch that woke the screen is not a tap

// Touch edges are collected between frames so none are lost when a frame is skipped.
static bool pendPressed = false, pendReleased = false, pendPwr = false;
static int pendX = 0, pendY = 0;
static float lastAx = 0, lastAy = 0, lastAz = 1;

static bool clockOk = false;
static int clockHour = 0, clockMinute = 0;
static uint32_t clockKey = 0;

// ------------------------------------------------------------------ clock

static void readClock() {
  if (!M5.Rtc.isEnabled()) return;
  m5::rtc_datetime_t dt = M5.Rtc.getDateTime();
  clockOk = dt.date.year >= 2025 && dt.date.year <= 2199;
  clockHour = dt.time.hours;
  clockMinute = dt.time.minutes;
  clockKey = clockOk ? tr::dayKey(dt.date.year, dt.date.month, dt.date.date) : 0;
}

// The RTC keeps local time; the game's browser tells us the time and zone.
static void setClock(int64_t utcMs, int tzMinutes) {
  time_t local = (time_t)(utcMs / 1000) + (time_t)tzMinutes * 60;
  struct tm tmv;
  gmtime_r(&local, &tmv);
  M5.Rtc.setDateTime(&tmv);
  trainer.s.settings.tzMinutes = (int16_t)tzMinutes;
  trainer.markDirty();
  readClock();
  if (clockKey) trainer.newDay(clockKey);
}

static void onNetEvent(const char* msg) {
  if (app) app->toast(msg);
}

// ------------------------------------------------------------------ hal

namespace hal {
uint32_t ms() { return millis(); }
void tone(uint16_t freq, uint32_t durationMs) { M5.Speaker.tone(freq, durationMs); }
int batteryPct() {
  int32_t level = M5.Power.getBatteryLevel();
  return level >= 0 && level <= 100 ? (int)level : -1;
}
bool charging() { return M5.Power.isCharging() == m5::Power_Class::is_charging; }
bool clockValid() { return clockOk; }
void localTime(int& hour, int& minute) {
  hour = clockHour;
  minute = clockMinute;
}
void setBrightness(uint8_t level) { M5.Display.setBrightness(level); }
}  // namespace hal

// ------------------------------------------------------------------ screen power

static void wake(uint32_t now) {
  if (screen == Screen::Off) M5.Display.wakeup();
  M5.Display.setBrightness(trainer.s.settings.brightness);
  screen = Screen::On;
  lastActive = now;
  lastFrame = 0;
  if (app) app->onWake();
}

static void sleepScreen(uint32_t now) {
  trainer.save(now, true);
  M5.Display.sleep();
  screen = Screen::Off;
}

// ------------------------------------------------------------------ setup / loop

void setup() {
  auto cfg = M5.config();
#if defined(ARDUINO)
  cfg.serial_baudrate = 115200;
#endif
  cfg.internal_imu = true;
  cfg.internal_rtc = true;
  cfg.internal_spk = true;
  cfg.internal_mic = false;
  M5.begin(cfg);
  if (M5.Display.width() < M5.Display.height()) M5.Display.setRotation(1);

  if (!LittleFS.begin(true)) Serial.println("LittleFS mount failed");
  if (!LittleFS.exists("/roster")) LittleFS.mkdir("/roster");

  trainer.begin(&storage);
  M5.Display.setBrightness(trainer.s.settings.brightness);
  M5.Speaker.setVolume(110);

  canvas.setColorDepth(16);
  canvas.setPsram(true);
  if (!canvas.createSprite(ui::W, ui::H)) {
    // No PSRAM enabled in this build: the 150 KB frame still fits in internal RAM.
    canvas.setPsram(false);
    canvas.createSprite(ui::W, ui::H);
  }

  readClock();
  if (clockKey) trainer.newDay(clockKey);

  app = new ui::App(trainer, steps);
  app->begin();
  netBegin(&trainer, &steps, onNetEvent, setClock);

  uint32_t now = millis();
  lastActive = now;
  lastSecond = now;
}

void loop() {
  M5.update();
  uint32_t now = millis();

  // Accelerometer, about 50 Hz, whether or not the screen is on.
  if (now - lastImu >= 20) {
    lastImu = now;
    M5.Imu.update();
    float ax, ay, az;
    if (M5.Imu.getAccel(&ax, &ay, &az)) {
      steps.addSample(now, ax, ay, az);
      lastAx = ax;
      lastAy = ay;
      lastAz = az;
    }
  }

  // Once a second: bank steps, check the date.
  if (now - lastSecond >= 1000) {
    lastSecond = now;
    trainer.movement(steps.take());
    readClock();
    if (clockKey) trainer.newDay(clockKey);
  }

  hal::netLoop();

  // Touch and the power button.
  const auto& t = M5.Touch.getDetail();
  bool down = M5.Touch.getCount() > 0 && t.isPressed();
  bool pwr = M5.BtnPWR.wasClicked();

  if (screen == Screen::Off) {
    if (down) {
      if (!touchStart) touchStart = now;
    } else {
      touchStart = 0;
    }
    if (pwr || (touchStart && now - touchStart >= WAKE_HOLD_MS)) {
      swallowTouch = down;
      touchStart = 0;
      wake(now);
    }
    trainer.save(now);
    delay(10);
    return;
  }

  if (swallowTouch) {
    if (!down) swallowTouch = false;
  } else {
    if (t.wasPressed()) {
      pendPressed = true;
      pendX = t.x;
      pendY = t.y;
    }
    if (t.wasReleased()) pendReleased = true;
    if (down) {
      pendX = t.x;
      pendY = t.y;
    }
  }
  if (pwr) pendPwr = true;

  if (down || pwr || app->keepAwake()) {
    if (screen == Screen::Dim) {
      wake(now);
      if (down) swallowTouch = true;
      pendPressed = pendReleased = pendPwr = false;  // this touch/press only woke the screen
    }
    lastActive = now;
  }
  if (screen == Screen::On && now - lastActive > DIM_AFTER_MS) {
    M5.Display.setBrightness(DIM_LEVEL);
    screen = Screen::Dim;
  }
  if (screen == Screen::Dim && now - lastActive > OFF_AFTER_MS) {
    sleepScreen(now);
    return;
  }

  // Power button while awake: turn the screen off (step counting carries on).
  if (pendPwr && screen != Screen::Off && app->current() != ui::ScreenId::Game) {
    pendPwr = false;
    sleepScreen(now);
    return;
  }

  if (now - lastFrame >= FRAME_MS) {
    ui::Input in;
    in.down = down && !swallowTouch;
    in.pressed = pendPressed;
    in.released = pendReleased;
    in.x = pendX;
    in.y = pendY;
    in.pwr = pendPwr;
    in.ax = lastAx;
    in.ay = lastAy;
    in.az = lastAz;
    in.ms = now;
    in.dt = lastFrame ? (now - lastFrame) / 1000.0f : 0.033f;
    pendPressed = pendReleased = pendPwr = false;
    lastFrame = now;

    app->update(in);
    app->draw(canvas);
    canvas.pushSprite(0, 0);
  }

  if (app->takeSaveRequest()) trainer.save(now, true);
  else trainer.save(now);
  delay(2);
}
