// JSON and base64url encoding for everything the trainer stores or exchanges with the game.
// Hardware-free (ArduinoJson + std::string) so the same code runs on the device and a PC.
#pragma once

#include <stdint.h>

#include <string>

#include "core/model.h"

namespace tr {

std::string base64UrlEncode(const std::string& in);
bool base64UrlDecode(const char* in, std::string& out);

// A player sent by Socker 26 (see src/trainer.js sendPayload in the game).
struct Incoming {
  PlayerCard card;
  int64_t nowMs = 0;     // the browser's clock, used to set the device clock
  int tzMinutes = 0;     // local offset from UTC, east positive
  bool hasTime = false;
  std::string ret;       // game URL to go back to (http/https only)
};

// Accepts the raw JSON or its base64url form.
bool parseIncoming(const char* text, Incoming& out);

// What Sync hands back to the game: name, stat deltas (+ overall), coach, totals.
std::string syncJson(const TrainerState& s);

// Full device state, for flash storage.
std::string stateToJson(const TrainerState& s);
bool stateFromJson(const char* json, TrainerState& s);

// Per-player progress kept when another player takes his place.
std::string rosterToJson(const PlayerCard& p);
bool rosterFromJson(const char* json, PlayerCard& p);

// Parent dashboard (served when the trainer is linked).
std::string dashboardJson(const TrainerState& s, int liveCadence, bool linked);
bool applyProgramJson(const char* json, TrainerState& s);
bool applySettingsJson(const char* json, TrainerState& s);

// Small helpers shared with the web pages.
bool isHttpUrl(const std::string& url);
std::string jsString(const std::string& s);  // JSON string literal safe inside <script>
uint32_t fnv1a(const char* s);

}  // namespace tr
