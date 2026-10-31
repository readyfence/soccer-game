// Wi-Fi, setup hotspot and the small web server the game and parents talk to.
// The hal::net* functions in hal.h are implemented in net.cpp.
#pragma once

#include <stdint.h>

#include "core/steps.h"
#include "trainer.h"

using NetEventFn = void (*)(const char* message);           // short toast for the screen
using NetClockFn = void (*)(int64_t utcMs, int tzMinutes);  // browser time, to set the RTC

void netBegin(tr::Trainer* trainer, tr::StepDetector* steps, NetEventFn onEvent, NetClockFn onClock);
