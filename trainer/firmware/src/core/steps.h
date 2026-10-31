// Step and running detector for a device carried in a pocket.
//
// Feed it accelerometer samples (in g) with their timestamps, at roughly 25-100 Hz; the
// rate does not need to be steady. It finds the bounce of each stride as a peak in the
// smoothed acceleration magnitude, and only starts counting once several peaks arrive at a
// regular walking/running rhythm, so shaking the device or tapping the screen does not add
// steps. Each counted stride is classed as walking or running from cadence and intensity.
#pragma once

#include <stdint.h>

namespace tr {

struct StepTotals {
  uint32_t steps = 0;
  uint32_t runSec = 0;
  uint32_t walkSec = 0;
};

class StepDetector {
 public:
  void reset();
  void addSample(uint32_t ms, float ax, float ay, float az);

  // Everything counted since the last take(); clears it.
  StepTotals take();

  // Live readings for the UI / debugging.
  bool running() const { return _running; }
  int cadence() const { return _cadence; }  // steps per minute, 0 when idle
  float intensity() const { return _intensity; }  // mean stride peak, g above gravity
  bool moving() const { return _counting; }

  // Tuning (public so tests and the stats screen can show them).
  static constexpr int MIN_STEP_MS = 250;   // 240 steps/min max
  static constexpr int MAX_STEP_MS = 2000;  // slower than 30 steps/min = stopped
  static constexpr int CONFIRM_STEPS = 6;   // regular strides needed before counting starts
  static constexpr float MIN_PEAK_G = 0.10f;

 private:
  void onPeak(uint32_t ms, float height);

  bool _primed = false;
  uint32_t _lastMs = 0;
  float _smooth = 1.0f;
  float _gravity = 1.0f;
  bool _rising = false;
  float _peakVal = 0.0f;
  uint32_t _peakMs = 0;
  bool _armed = true;
  float _avgPeak = 0.25f;

  uint32_t _lastStepMs = 0;
  int _candidates = 0;
  bool _counting = false;

  // Rolling window of recent strides for cadence/intensity.
  static constexpr int WINDOW = 6;
  uint16_t _intervals[WINDOW] = {0};
  float _heights[WINDOW] = {0};
  int _wcount = 0;
  int _widx = 0;
  int _cadence = 0;
  bool _running = false;
  float _intensity = 0.0f;

  StepTotals _pending;  // runSec/walkSec hold milliseconds until take()
};

}  // namespace tr
