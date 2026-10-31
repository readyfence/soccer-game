#include "steps.h"

#include <math.h>

namespace tr {

// Running when the stride rate is high and each stride lands hard, when the rate alone is
// clearly a run, or when strides are very hard even at a lower rate (bounding, sprint
// starts). Intensities are g above gravity *after* smoothing, which roughly halves the raw
// impact peak: pocket walking reads ~0.2, jogging ~0.45. These were set from simulated
// strides; the Stats > Sensor screen shows live values for tuning on a real child.
static const int RUN_CADENCE = 150;
static const float RUN_INTENSITY = 0.35f;
static const int FAST_CADENCE = 170;
static const float HARD_INTENSITY = 0.6f;
static const int HARD_CADENCE = 120;

void StepDetector::reset() {
  *this = StepDetector();
}

StepTotals StepDetector::take() {
  StepTotals out;
  out.steps = _pending.steps;
  out.runSec = _pending.runSec / 1000;
  out.walkSec = _pending.walkSec / 1000;
  // Keep the sub-second remainder so short strides still add up.
  _pending.steps = 0;
  _pending.runSec %= 1000;
  _pending.walkSec %= 1000;
  return out;
}

void StepDetector::addSample(uint32_t ms, float ax, float ay, float az) {
  float mag = sqrtf(ax * ax + ay * ay + az * az);
  if (!_primed) {
    _primed = true;
    _lastMs = ms;
    _smooth = mag;
    _gravity = mag;
    return;
  }
  uint32_t dtRaw = ms - _lastMs;
  _lastMs = ms;
  float dt = (float)(dtRaw < 1 ? 1 : (dtRaw > 200 ? 200 : dtRaw));

  // Low-pass the magnitude (~4 Hz) and track gravity very slowly.
  const float tau = 40.0f;
  const float tauG = 1500.0f;
  _smooth += (dt / (dt + tau)) * (mag - _smooth);
  _gravity += (dt / (dt + tauG)) * (_smooth - _gravity);
  float v = _smooth - _gravity;

  float threshold = 0.45f * _avgPeak;
  if (threshold < MIN_PEAK_G) threshold = MIN_PEAK_G;

  if (_armed) {
    if (v > threshold) {
      if (!_rising || v > _peakVal) {
        _peakVal = v;
        _peakMs = ms;
      }
      _rising = true;
    } else if (_rising) {
      // Fell back below the threshold: the peak is over.
      onPeak(_peakMs, _peakVal);
      _rising = false;
      _armed = false;
      _peakVal = 0;
    }
  } else if (v < 0.0f) {
    _armed = true;
  }

  if (_counting && ms - _lastStepMs > (uint32_t)MAX_STEP_MS) {
    _counting = false;
    _candidates = 0;
    _cadence = 0;
    _running = false;
    _wcount = 0;
  }
}

void StepDetector::onPeak(uint32_t ms, float height) {
  _avgPeak = _avgPeak * 0.8f + height * 0.2f;
  if (_avgPeak < 0.12f) _avgPeak = 0.12f;

  uint32_t interval = _lastStepMs ? ms - _lastStepMs : 0xffffffffu;
  if (interval < (uint32_t)MIN_STEP_MS) return;  // a second bump inside the same stride

  if (interval > (uint32_t)MAX_STEP_MS) {
    // First stride after a pause: start looking for a rhythm.
    _lastStepMs = ms;
    _candidates = 1;
    _counting = false;
    _wcount = 0;
    _widx = 0;
    return;
  }

  // Strides must keep a steady rhythm while we are still deciding whether this is walking.
  if (!_counting && _wcount > 0) {
    uint16_t last = _intervals[(_widx + WINDOW - 1) % WINDOW];
    float ratio = (float)interval / (float)last;
    if (ratio < 0.6f || ratio > 1.67f) {
      _lastStepMs = ms;
      _candidates = 1;
      _wcount = 0;
      _widx = 0;
      return;
    }
  }

  _intervals[_widx] = (uint16_t)interval;
  _heights[_widx] = height;
  _widx = (_widx + 1) % WINDOW;
  if (_wcount < WINDOW) _wcount++;
  _lastStepMs = ms;

  uint32_t sumI = 0;
  float sumH = 0;
  for (int i = 0; i < _wcount; i++) {
    sumI += _intervals[i];
    sumH += _heights[i];
  }
  _cadence = (int)(60000u * (uint32_t)_wcount / (sumI ? sumI : 1));
  _intensity = sumH / (float)_wcount;
  _running = (_cadence >= RUN_CADENCE && _intensity >= RUN_INTENSITY) || _cadence >= FAST_CADENCE ||
             (_intensity >= HARD_INTENSITY && _cadence >= HARD_CADENCE);

  if (_counting) {
    _pending.steps++;
    if (_running) _pending.runSec += interval;
    else _pending.walkSec += interval;
    return;
  }

  _candidates++;
  if (_candidates >= CONFIRM_STEPS) {
    // Rhythm confirmed: count the strides we held back, and their time.
    _counting = true;
    _pending.steps += (uint32_t)_candidates;
    uint32_t held = 0;
    for (int i = 0; i < _wcount; i++) held += _intervals[i];
    if (_running) _pending.runSec += held;
    else _pending.walkSec += held;
  }
}

}  // namespace tr
