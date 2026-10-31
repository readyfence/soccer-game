// The trainer's brain: owns the state, applies the rules, handles players arriving from
// the game, and persists everything through a small Storage interface. No hardware here.
#pragma once

#include <stdint.h>

#include <string>

#include "codec.h"
#include "core/rules.h"
#include "core/steps.h"

namespace tr {

class Storage {
 public:
  virtual ~Storage() {}
  virtual bool read(const char* path, std::string& out) = 0;
  virtual bool write(const char* path, const std::string& data) = 0;
};

enum class Receive { Bad, Accepted, Merged, Pending };

class Trainer {
 public:
  TrainerState s;

  void begin(Storage* storage);
  void markDirty() { _dirty = true; }
  // Saves at most every `minGapMs` unless forced.
  void save(uint32_t nowMs, bool force = false);

  // ---- players from the game
  Receive receive(const char* payload, Incoming& parsed);
  bool hasPending() const { return _hasPending; }
  const PlayerCard& pending() const { return _pending; }
  void acceptPending();
  void declinePending() { _hasPending = false; }

  // ---- activity (each returns what was gained; level-ups are also queued for the UI)
  void newDay(uint32_t dayKey);
  void movement(const StepTotals& t);
  Gain session(uint8_t activity, int minutes);
  Gain drill(int idx);
  Gain miniGame(uint8_t game, int score);

  // Level-ups earned in the background (walking with the screen off), shown on wake.
  bool takeBackgroundLevelUps(Gain& out);

  std::string syncCode() const { return base64UrlEncode(syncJson(s)); }
  bool applyProgram(const char* json);
  bool applySettings(const char* json);

 private:
  void archiveCurrent();
  void restoreFromRoster(PlayerCard& card);
  void note(const Gain& g);
  void rosterPath(const char* name, char* out, size_t size) const;

  Storage* _storage = nullptr;
  bool _dirty = false;
  uint32_t _lastSave = 0;
  bool _hasPending = false;
  PlayerCard _pending;
  Gain _background;
  bool _hasBackground = false;
};

}  // namespace tr
