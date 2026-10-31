#include "trainer.h"

#include <stdio.h>
#include <string.h>

namespace tr {

static const char* STATE_PATH = "/state.json";
static const uint32_t SAVE_GAP_MS = 60000;

void Trainer::begin(Storage* storage) {
  _storage = storage;
  std::string json;
  if (_storage && _storage->read(STATE_PATH, json) && stateFromJson(json.c_str(), s)) return;
  s = TrainerState();
  defaultProgram(ROLE_FWD, s.program);
}

void Trainer::save(uint32_t nowMs, bool force) {
  if (!_storage || !_dirty) return;
  if (!force && nowMs - _lastSave < SAVE_GAP_MS) return;
  if (_storage->write(STATE_PATH, stateToJson(s))) {
    _dirty = false;
    _lastSave = nowMs;
  }
}

// ---------------------------------------------------------------- players

void Trainer::rosterPath(const char* id, char* out, size_t size) const {
  snprintf(out, size, "/roster/%08lx.json", (unsigned long)fnv1a(id));
}

void Trainer::archiveCurrent() {
  if (!s.player.present || !_storage) return;
  char path[32];
  rosterPath(s.player.id, path, sizeof(path));
  _storage->write(path, rosterToJson(s.player));
}

// A player who trained here before gets his XP and totals back. Training points take the
// higher of the two copies so neither the game's nor the device's progress is lost.
void Trainer::restoreFromRoster(PlayerCard& card) {
  if (!_storage) return;
  char path[32];
  rosterPath(card.id, path, sizeof(path));
  std::string json;
  if (!_storage->read(path, json)) return;
  PlayerCard saved = card;
  if (!rosterFromJson(json.c_str(), saved)) return;
  for (int i = 0; i < STAT_COUNT; i++) {
    if (saved.train[i] > card.train[i]) card.train[i] = saved.train[i];
    card.xp[i] = saved.xp[i];
  }
  card.steps = saved.steps;
  card.runSec = saved.runSec;
  card.sessions = saved.sessions;
  card.sessionMin = saved.sessionMin;
  card.games = saved.games;
  card.days = saved.days;
}

Receive Trainer::receive(const char* payload, Incoming& parsed) {
  if (!parseIncoming(payload, parsed)) return Receive::Bad;
  PlayerCard card = parsed.card;
  if (s.player.present && strcmp(s.player.id, card.id) == 0) {
    // Same player again: refresh his name, look and base stats, keep everything earned here.
    PlayerCard merged = s.player;
    memcpy(merged.name, card.name, sizeof(merged.name));
    memcpy(merged.base, card.base, sizeof(merged.base));
    for (int i = 0; i < STAT_COUNT; i++) {
      if (card.train[i] > merged.train[i]) merged.train[i] = card.train[i];
    }
    memcpy(merged.ascii, card.ascii, sizeof(merged.ascii));
    memcpy(merged.back, card.back, sizeof(merged.back));
    memcpy(merged.pos, card.pos, sizeof(merged.pos));
    memcpy(merged.club, card.club, sizeof(merged.club));
    merged.num = card.num;
    merged.role = card.role;
    merged.kitShirt = card.kitShirt;
    merged.kitShorts = card.kitShorts;
    merged.kitNumber = card.kitNumber;
    merged.look = card.look;
    s.player = merged;
    markDirty();
    return Receive::Merged;
  }
  restoreFromRoster(card);
  if (!s.player.present) {
    resetForNewPlayer(s, card);
    markDirty();
    return Receive::Accepted;
  }
  _pending = card;
  _hasPending = true;
  return Receive::Pending;
}

void Trainer::acceptPending() {
  if (!_hasPending) return;
  archiveCurrent();
  resetForNewPlayer(s, _pending);
  _hasPending = false;
  s.today.planDone = 0;
  markDirty();
}

// ---------------------------------------------------------------- activity

void Trainer::note(const Gain& g) {
  if (g.totalXp() > 0) markDirty();
}

void Trainer::newDay(uint32_t dayKey) {
  uint32_t before = s.today.key;
  rollDay(s, dayKey);
  if (s.today.key != before) markDirty();
}

void Trainer::movement(const StepTotals& t) {
  if (!t.steps && !t.runSec && !t.walkSec) return;
  Gain g = addMovement(s, t.steps, t.runSec, t.walkSec);
  markDirty();
  if (g.totalPoints() > 0) {
    if (!_hasBackground) {
      _background = Gain();
      _background.ovrBefore = g.ovrBefore;
    }
    _background.add(g);
    _background.ovrAfter = g.ovrAfter;
    _hasBackground = true;
  }
}

bool Trainer::takeBackgroundLevelUps(Gain& out) {
  if (!_hasBackground) return false;
  out = _background;
  _hasBackground = false;
  return true;
}

Gain Trainer::session(uint8_t activity, int minutes) {
  Gain g = logSession(s, activity, minutes, false);
  markDirty();
  return g;
}

Gain Trainer::drill(int idx) {
  Gain g = completeDrill(s, idx);
  markDirty();
  return g;
}

Gain Trainer::miniGame(uint8_t game, int score) {
  Gain g = finishMiniGame(s, game, score);
  note(g);
  return g;
}

bool Trainer::applyProgram(const char* json) {
  if (!applyProgramJson(json, s)) return false;
  markDirty();
  return true;
}

bool Trainer::applySettings(const char* json) {
  if (!applySettingsJson(json, s)) return false;
  markDirty();
  return true;
}

}  // namespace tr
