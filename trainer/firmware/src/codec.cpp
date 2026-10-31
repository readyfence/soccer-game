#include "codec.h"

#include <ArduinoJson.h>
#include <string.h>

#include "core/rules.h"

namespace tr {

// ---------------------------------------------------------------- base64url

static const char B64[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

std::string base64UrlEncode(const std::string& in) {
  std::string out;
  out.reserve((in.size() + 2) / 3 * 4);
  size_t i = 0;
  while (i + 2 < in.size()) {
    uint32_t n = ((uint8_t)in[i] << 16) | ((uint8_t)in[i + 1] << 8) | (uint8_t)in[i + 2];
    out += B64[(n >> 18) & 63];
    out += B64[(n >> 12) & 63];
    out += B64[(n >> 6) & 63];
    out += B64[n & 63];
    i += 3;
  }
  size_t rest = in.size() - i;
  if (rest == 1) {
    uint32_t n = (uint8_t)in[i] << 16;
    out += B64[(n >> 18) & 63];
    out += B64[(n >> 12) & 63];
  } else if (rest == 2) {
    uint32_t n = ((uint8_t)in[i] << 16) | ((uint8_t)in[i + 1] << 8);
    out += B64[(n >> 18) & 63];
    out += B64[(n >> 12) & 63];
    out += B64[(n >> 6) & 63];
  }
  return out;
}

static int b64Value(char c) {
  if (c >= 'A' && c <= 'Z') return c - 'A';
  if (c >= 'a' && c <= 'z') return c - 'a' + 26;
  if (c >= '0' && c <= '9') return c - '0' + 52;
  if (c == '-' || c == '+') return 62;
  if (c == '_' || c == '/') return 63;
  return -1;
}

bool base64UrlDecode(const char* in, std::string& out) {
  out.clear();
  uint32_t acc = 0;
  int bits = 0;
  for (const char* p = in; *p; p++) {
    if (*p == '=') break;
    int v = b64Value(*p);
    if (v < 0) return false;
    acc = (acc << 6) | (uint32_t)v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += (char)((acc >> bits) & 0xff);
    }
  }
  return true;
}

// ---------------------------------------------------------------- helpers

static int clampi(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }

static void copyStr(char* dst, size_t size, const char* src) {
  if (!src) src = "";
  strncpy(dst, src, size - 1);
  dst[size - 1] = 0;
}

// Keeps printable ASCII only (the device fonts have nothing else).
static void copyAscii(char* dst, size_t size, const char* src) {
  size_t n = 0;
  for (const char* p = src ? src : ""; *p && n + 1 < size; p++) {
    unsigned char c = (unsigned char)*p;
    if (c >= 0x20 && c < 0x7f) dst[n++] = (char)c;
  }
  dst[n] = 0;
}

static const char* const HAIR_IDS[HAIR_COUNT] = {"crop", "slick", "buzz", "curly", "long", "bald", "dreads", "afro"};
static const char* const HC_IDS[HC_COUNT] = {"black", "dark", "brown", "light", "blond", "red", "grey"};

static uint8_t lookup(const char* id, const char* const* table, int count, uint8_t fallback) {
  if (!id) return fallback;
  for (int i = 0; i < count; i++) {
    if (strcmp(id, table[i]) == 0) return (uint8_t)i;
  }
  return fallback;
}

bool isHttpUrl(const std::string& url) {
  if (url.size() > 400) return false;
  if (url.rfind("http://", 0) != 0 && url.rfind("https://", 0) != 0) return false;
  for (char c : url) {
    if ((unsigned char)c < 0x21 || c == '"' || c == '<' || c == '>' || c == '\\' || c == '`') return false;
  }
  return true;
}

std::string jsString(const std::string& s) {
  std::string out = "\"";
  for (char c : s) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '<': out += "\\u003c"; break;
      case '>': out += "\\u003e"; break;
      case '&': out += "\\u0026"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      default:
        if ((unsigned char)c < 0x20) break;
        out += c;
    }
  }
  out += "\"";
  return out;
}

uint32_t fnv1a(const char* s) {
  uint32_t h = 2166136261u;
  for (const char* p = s; p && *p; p++) {
    h ^= (uint8_t)*p;
    h *= 16777619u;
  }
  return h;
}

// ---------------------------------------------------------------- incoming player

bool parseIncoming(const char* text, Incoming& out) {
  if (!text) return false;
  while (*text == ' ' || *text == '\n' || *text == '\r' || *text == '#') text++;
  std::string decoded;
  const char* json = text;
  if (*text != '{') {
    if (!base64UrlDecode(text, decoded)) return false;
    json = decoded.c_str();
  }

  JsonDocument doc;
  if (deserializeJson(doc, json)) return false;
  if ((doc["v"] | 0) != 1) return false;
  const char* name = doc["name"] | "";
  if (!name[0]) return false;
  JsonArrayConst base = doc["base"];
  if (base.size() < 5) return false;

  PlayerCard c;
  c.present = true;
  copyStr(c.name, sizeof(c.name), name);
  copyAscii(c.id, sizeof(c.id), doc["id"] | name);
  if (!c.id[0]) copyStr(c.id, sizeof(c.id), "player");
  copyAscii(c.ascii, sizeof(c.ascii), doc["ascii"] | name);
  if (!c.ascii[0]) copyStr(c.ascii, sizeof(c.ascii), "Player");
  copyAscii(c.back, sizeof(c.back), doc["back"] | c.ascii);
  copyAscii(c.pos, sizeof(c.pos), doc["pos"] | "ST");
  copyAscii(c.club, sizeof(c.club), doc["club"] | "");
  c.num = (uint8_t)clampi(doc["num"] | 10, 0, 99);
  c.role = roleFromPos(c.pos);
  for (int i = 0; i < 5; i++) c.base[i] = (uint8_t)clampi(base[i] | 50, 1, 99);
  JsonArrayConst train = doc["train"];
  for (int i = 0; i < STAT_COUNT; i++) c.train[i] = (uint8_t)clampi(train[i] | 0, 0, 40);

  JsonArrayConst kit = doc["kit"];
  if (kit.size() >= 3) {
    c.kitShirt = (kit[0] | 0x111111u) & 0xffffffu;
    c.kitShorts = (kit[1] | 0x111111u) & 0xffffffu;
    c.kitNumber = (kit[2] | 0xffffffu) & 0xffffffu;
  }
  JsonObjectConst look = doc["look"];
  c.look.tone = (uint8_t)clampi(look["tone"] | 2, 0, 6);
  c.look.hair = lookup(look["hair"] | "crop", HAIR_IDS, HAIR_COUNT, HAIR_CROP);
  c.look.hairColour = lookup(look["hc"] | "dark", HC_IDS, HC_COUNT, HC_DARK);
  c.look.beard = (uint8_t)clampi(look["beard"] | 0, 0, 2);

  out.card = c;
  double now = doc["now"] | 0.0;
  out.hasTime = now > 1.6e12 && now < 7.3e12;  // 2020..2200
  out.nowMs = (int64_t)now;
  out.tzMinutes = clampi(doc["tz"] | 0, -14 * 60, 14 * 60);
  std::string ret = doc["ret"] | "";
  out.ret = isHttpUrl(ret) ? ret : "";
  return true;
}

// ---------------------------------------------------------------- sync back to the game

std::string syncJson(const TrainerState& s) {
  JsonDocument doc;
  const PlayerCard& p = s.player;
  doc["v"] = 1;
  doc["id"] = p.id;
  doc["name"] = p.name;
  JsonArray train = doc["train"].to<JsonArray>();
  for (int i = 0; i < STAT_COUNT; i++) train.add(p.train[i]);
  train.add(ovrBonus(p));
  doc["coach"] = s.settings.coach;
  JsonObject log = doc["log"].to<JsonObject>();
  log["steps"] = p.steps;
  log["runMin"] = p.runSec / 60;
  log["sessions"] = p.sessions;
  log["sessionMin"] = p.sessionMin;
  log["games"] = p.games;
  log["days"] = p.days;
  std::string out;
  serializeJson(doc, out);
  return out;
}

// ---------------------------------------------------------------- storage

static void writeCard(JsonObject o, const PlayerCard& p, bool full) {
  o["id"] = p.id;
  o["name"] = p.name;
  JsonArray train = o["train"].to<JsonArray>();
  JsonArray xp = o["xp"].to<JsonArray>();
  for (int i = 0; i < STAT_COUNT; i++) {
    train.add(p.train[i]);
    xp.add(p.xp[i]);
  }
  o["steps"] = p.steps;
  o["runSec"] = p.runSec;
  o["sessions"] = p.sessions;
  o["sessionMin"] = p.sessionMin;
  o["games"] = p.games;
  o["days"] = p.days;
  if (!full) return;
  o["ascii"] = p.ascii;
  o["back"] = p.back;
  o["pos"] = p.pos;
  o["club"] = p.club;
  o["num"] = p.num;
  JsonArray base = o["base"].to<JsonArray>();
  for (int i = 0; i < 5; i++) base.add(p.base[i]);
  JsonArray kit = o["kit"].to<JsonArray>();
  kit.add(p.kitShirt);
  kit.add(p.kitShorts);
  kit.add(p.kitNumber);
  JsonArray look = o["look"].to<JsonArray>();
  look.add(p.look.tone);
  look.add(p.look.hair);
  look.add(p.look.hairColour);
  look.add(p.look.beard);
}

static void readProgress(JsonObjectConst o, PlayerCard& p) {
  JsonArrayConst train = o["train"];
  JsonArrayConst xp = o["xp"];
  for (int i = 0; i < STAT_COUNT; i++) {
    p.train[i] = (uint8_t)clampi(train[i] | 0, 0, 40);
    p.xp[i] = (uint16_t)clampi(xp[i] | 0, 0, 60000);
  }
  p.steps = o["steps"] | 0u;
  p.runSec = o["runSec"] | 0u;
  p.sessions = o["sessions"] | 0u;
  p.sessionMin = o["sessionMin"] | 0u;
  p.games = o["games"] | 0u;
  p.days = (uint16_t)(o["days"] | 0u);
}

static bool readCard(JsonObjectConst o, PlayerCard& p) {
  const char* name = o["name"] | "";
  if (!name[0]) return false;
  p = PlayerCard();
  p.present = true;
  copyStr(p.name, sizeof(p.name), name);
  copyAscii(p.id, sizeof(p.id), o["id"] | name);
  copyAscii(p.ascii, sizeof(p.ascii), o["ascii"] | "Player");
  copyAscii(p.back, sizeof(p.back), o["back"] | "");
  copyAscii(p.pos, sizeof(p.pos), o["pos"] | "ST");
  copyAscii(p.club, sizeof(p.club), o["club"] | "");
  p.num = (uint8_t)clampi(o["num"] | 10, 0, 99);
  p.role = roleFromPos(p.pos);
  JsonArrayConst base = o["base"];
  for (int i = 0; i < 5; i++) p.base[i] = (uint8_t)clampi(base[i] | 50, 1, 99);
  JsonArrayConst kit = o["kit"];
  p.kitShirt = kit[0] | 0x111111u;
  p.kitShorts = kit[1] | 0x111111u;
  p.kitNumber = kit[2] | 0xffffffu;
  JsonArrayConst look = o["look"];
  p.look.tone = (uint8_t)clampi(look[0] | 2, 0, 6);
  p.look.hair = (uint8_t)clampi(look[1] | 0, 0, HAIR_COUNT - 1);
  p.look.hairColour = (uint8_t)clampi(look[2] | 1, 0, HC_COUNT - 1);
  p.look.beard = (uint8_t)clampi(look[3] | 0, 0, 2);
  readProgress(o, p);
  return true;
}

static void writeDay(JsonArray a, const DayLog& d) {
  a.add(d.key);
  a.add(d.steps);
  a.add(d.runSec);
  a.add(d.walkSec);
  a.add(d.sessions);
  a.add(d.sessionMin);
  a.add(d.games);
  a.add(d.xp);
  a.add(d.energyFromSteps);
  a.add(d.planDone);
}

static DayLog readDay(JsonArrayConst a) {
  DayLog d;
  d.key = a[0] | 0u;
  d.steps = a[1] | 0u;
  d.runSec = a[2] | 0u;
  d.walkSec = a[3] | 0u;
  d.sessions = (uint16_t)(a[4] | 0u);
  d.sessionMin = (uint16_t)(a[5] | 0u);
  d.games = (uint16_t)(a[6] | 0u);
  d.xp = (uint16_t)(a[7] | 0u);
  d.energyFromSteps = (uint8_t)(a[8] | 0u);
  d.planDone = (uint8_t)(a[9] | 0u);
  return d;
}

static void writeProgram(JsonArray days, const Program& p) {
  for (int d = 0; d < 7; d++) {
    JsonArray day = days.add<JsonArray>();
    for (int i = 0; i < DRILLS_PER_DAY; i++) {
      const Drill& dr = p.days[d][i];
      if (!dr.minutes) continue;
      JsonObject o = day.add<JsonObject>();
      o["t"] = activityId(dr.act);
      o["m"] = dr.minutes;
    }
  }
}

static bool readProgram(JsonArrayConst days, Program& p) {
  if (days.size() != 7) return false;
  Program next;
  for (int d = 0; d < 7; d++) {
    JsonArrayConst day = days[d];
    int n = 0;
    for (JsonObjectConst o : day) {
      if (n >= DRILLS_PER_DAY) break;
      int act = activityFromId(o["t"] | "");
      int minutes = o["m"] | 0;
      if (act < 0 || minutes <= 0) continue;
      next.days[d][n].act = (uint8_t)act;
      next.days[d][n].minutes = (uint8_t)clampi(minutes, 5, 180);
      n++;
    }
  }
  p = next;
  return true;
}

std::string stateToJson(const TrainerState& s) {
  JsonDocument doc;
  doc["v"] = 1;
  if (s.player.present) writeCard(doc["player"].to<JsonObject>(), s.player, true);
  writeDay(doc["today"].to<JsonArray>(), s.today);
  JsonArray hist = doc["history"].to<JsonArray>();
  for (int i = 0; i < s.historyCount; i++) writeDay(hist.add<JsonArray>(), s.history[i]);
  writeProgram(doc["program"].to<JsonArray>(), s.program);
  doc["programCustom"] = s.programCustom;
  doc["energy"] = s.energy;
  doc["streak"] = s.streak;
  doc["lastActiveDay"] = s.lastActiveDay;
  JsonObject set = doc["settings"].to<JsonObject>();
  set["coach"] = s.settings.coach;
  set["sound"] = s.settings.sound;
  set["brightness"] = s.settings.brightness;
  set["tz"] = s.settings.tzMinutes;
  set["flipTilt"] = s.settings.flipTilt;
  std::string out;
  serializeJson(doc, out);
  return out;
}

bool stateFromJson(const char* json, TrainerState& s) {
  JsonDocument doc;
  if (!json || deserializeJson(doc, json)) return false;
  if ((doc["v"] | 0) != 1) return false;
  TrainerState next;
  JsonObjectConst player = doc["player"].as<JsonObjectConst>();
  if (!player.isNull()) readCard(player, next.player);
  next.today = readDay(doc["today"].as<JsonArrayConst>());
  JsonArrayConst hist = doc["history"];
  for (JsonArrayConst d : hist) {
    if (next.historyCount >= HISTORY_DAYS) break;
    next.history[next.historyCount++] = readDay(d);
  }
  next.programCustom = doc["programCustom"] | false;
  if (!readProgram(doc["program"].as<JsonArrayConst>(), next.program)) defaultProgram(next.player.role, next.program);
  next.energy = (uint8_t)clampi(doc["energy"] | 3, 0, 10);
  next.streak = (uint16_t)(doc["streak"] | 0u);
  next.lastActiveDay = doc["lastActiveDay"] | 0u;
  JsonObjectConst set = doc["settings"];
  copyAscii(next.settings.coach, sizeof(next.settings.coach), set["coach"] | "Huxley");
  next.settings.sound = set["sound"] | true;
  next.settings.brightness = (uint8_t)clampi(set["brightness"] | 140, 20, 255);
  next.settings.tzMinutes = (int16_t)clampi(set["tz"] | 0, -14 * 60, 14 * 60);
  next.settings.flipTilt = set["flipTilt"] | false;
  s = next;
  return true;
}

std::string rosterToJson(const PlayerCard& p) {
  JsonDocument doc;
  writeCard(doc.to<JsonObject>(), p, false);
  std::string out;
  serializeJson(doc, out);
  return out;
}

bool rosterFromJson(const char* json, PlayerCard& p) {
  JsonDocument doc;
  if (!json || deserializeJson(doc, json)) return false;
  const char* id = doc["id"] | "";
  if (strcmp(id, p.id) != 0) return false;
  readProgress(doc.as<JsonObjectConst>(), p);
  return true;
}

// ---------------------------------------------------------------- dashboard

std::string dashboardJson(const TrainerState& s, int liveCadence, bool linked) {
  JsonDocument doc;
  doc["coach"] = s.settings.coach;
  doc["sound"] = s.settings.sound;
  doc["linked"] = linked;
  doc["cadence"] = liveCadence;
  doc["energy"] = s.energy;
  doc["streak"] = currentStreak(s);
  if (s.player.present) {
    const PlayerCard& p = s.player;
    JsonObject o = doc["player"].to<JsonObject>();
    o["name"] = p.ascii;
    o["pos"] = p.pos;
    o["club"] = p.club;
    o["ovr"] = ovrNow(p);
    o["ovrBase"] = p.base[4];
    JsonArray stats = o["stats"].to<JsonArray>();
    for (int i = 0; i < STAT_COUNT; i++) {
      JsonObject st = stats.add<JsonObject>();
      st["name"] = statName((Stat)i);
      st["value"] = statNow(p, (Stat)i);
      st["base"] = p.base[i];
      st["xp"] = p.xp[i];
      st["next"] = pointCost(statNow(p, (Stat)i));
    }
    o["steps"] = p.steps;
    o["runMin"] = p.runSec / 60;
    o["sessions"] = p.sessions;
    o["games"] = p.games;
  }
  JsonArray days = doc["days"].to<JsonArray>();
  auto addDay = [&](const DayLog& d) {
    JsonObject o = days.add<JsonObject>();
    o["key"] = d.key;
    o["steps"] = d.steps;
    o["runMin"] = d.runSec / 60;
    o["sessions"] = d.sessions;
    o["sessionMin"] = d.sessionMin;
    o["games"] = d.games;
    o["xp"] = d.xp;
  };
  addDay(s.today);
  for (int i = 0; i < s.historyCount; i++) addDay(s.history[i]);
  writeProgram(doc["program"].to<JsonArray>(), s.program);
  JsonArray acts = doc["activities"].to<JsonArray>();
  for (int i = 0; i < ACT_COUNT; i++) {
    JsonObject a = acts.add<JsonObject>();
    a["id"] = activityId((uint8_t)i);
    a["name"] = activityName((uint8_t)i);
  }
  std::string out;
  serializeJson(doc, out);
  return out;
}

bool applyProgramJson(const char* json, TrainerState& s) {
  JsonDocument doc;
  if (!json || deserializeJson(doc, json)) return false;
  if (doc["reset"] | false) {
    s.programCustom = false;
    defaultProgram(s.player.role, s.program);
    return true;
  }
  if (!readProgram(doc["days"].as<JsonArrayConst>(), s.program)) return false;
  s.programCustom = true;
  s.today.planDone = 0;
  return true;
}

bool applySettingsJson(const char* json, TrainerState& s) {
  JsonDocument doc;
  if (!json || deserializeJson(doc, json)) return false;
  const char* coach = doc["coach"] | "";
  if (coach[0]) copyAscii(s.settings.coach, sizeof(s.settings.coach), coach);
  if (!doc["sound"].isNull()) s.settings.sound = doc["sound"] | true;
  if (!doc["flipTilt"].isNull()) s.settings.flipTilt = doc["flipTilt"] | false;
  return true;
}

}  // namespace tr
