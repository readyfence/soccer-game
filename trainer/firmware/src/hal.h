// The few hardware services the UI needs. Implemented in main.cpp (device) and net.cpp
// (Wi-Fi), so screens never touch M5Unified or WiFi directly.
#pragma once

#include <stdint.h>

namespace hal {

uint32_t ms();
void tone(uint16_t freq, uint32_t durationMs);  // plays regardless of settings; the App checks those
int batteryPct();                                // -1 if unknown
bool charging();
bool clockValid();
void localTime(int& hour, int& minute);
void setBrightness(uint8_t level);

enum class Net : uint8_t {
  Off,         // radio off
  NoWifi,      // LINK pressed but no network saved yet
  Connecting,  // joining the home network
  Linked,      // on the network, web server running
  Failed,      // could not join (wrong password, out of range)
  Portal,      // setup hotspot "Soccer-Trainer" is up
};

void netLink();     // start Wi-Fi + web server (or report NoWifi)
void netPortal();   // start the setup hotspot
void netStop();     // everything off
void netForget();   // erase saved Wi-Fi
void netLoop();     // called every frame from main
Net netState();
const char* netIp();
const char* netSsid();          // saved network name, or ""
const char* netHost();          // "soccer-trainer.local"
const char* netPortalName();    // "Soccer-Trainer"

}  // namespace hal
