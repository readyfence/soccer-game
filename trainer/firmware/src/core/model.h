// Plain data shared by the whole firmware. No Arduino or hardware includes here so the
// rules can be unit-tested on a PC (see trainer/firmware/test).
#pragma once

#include <stdint.h>

namespace tr {

enum Stat : uint8_t { PAC = 0, SHO = 1, PAS = 2, DEF = 3, STAT_COUNT = 4 };
enum Role : uint8_t { ROLE_GK = 0, ROLE_DEF = 1, ROLE_MID = 2, ROLE_FWD = 3 };

// Real-life training the player can log on the device.
enum Activity : uint8_t {
  ACT_SHOOT = 0,
  ACT_PASS,
  ACT_DRIBBLE,
  ACT_DEFEND,
  ACT_FITNESS,
  ACT_KEEPER,
  ACT_TEAM,
  ACT_MATCH,
  ACT_COUNT
};

// Penalties -> SHO, Tilt Dribble -> PAC, Keepy-Uppy (ball control) -> PAS, Tackle Time -> DEF.
enum MiniGame : uint8_t { GAME_PENALTY = 0, GAME_DRIBBLE, GAME_KEEPY, GAME_TACKLE, GAME_COUNT };

enum HairStyle : uint8_t { HAIR_CROP = 0, HAIR_SLICK, HAIR_BUZZ, HAIR_CURLY, HAIR_LONG, HAIR_BALD, HAIR_DREADS, HAIR_AFRO, HAIR_COUNT };
enum HairColour : uint8_t { HC_BLACK = 0, HC_DARK, HC_BROWN, HC_LIGHT, HC_BLOND, HC_RED, HC_GREY, HC_COUNT };

struct Look {
  uint8_t tone = 2;  // 0 very fair .. 6 very dark, same scale as the game
  uint8_t hair = HAIR_CROP;
  uint8_t hairColour = HC_DARK;
  uint8_t beard = 0;  // 0 none, 1 stubble, 2 full
};

// The player living on the device. `base` is what the game sent (untrained), `train` the
// points earned here; the game applies `train` on top of its own data when synced.
struct PlayerCard {
  bool present = false;
  char id[24] = {0};     // stable player id from the game (names can be edited there)
  char name[48] = {0};   // UTF-8 name as shown in the game
  char ascii[32] = {0};  // display name, ASCII only
  char back[16] = {0};
  char pos[4] = {0};
  char club[6] = {0};
  uint8_t num = 0;
  Role role = ROLE_FWD;
  uint8_t base[5] = {0};  // pac, sho, pas, def, ovr
  uint8_t train[STAT_COUNT] = {0};
  uint16_t xp[STAT_COUNT] = {0};  // progress towards the next point of each stat
  uint32_t kitShirt = 0x111111;
  uint32_t kitShorts = 0x111111;
  uint32_t kitNumber = 0xffffff;
  Look look;

  // Totals since this player arrived on the device (reported back to the game).
  uint32_t steps = 0;
  uint32_t runSec = 0;
  uint32_t sessions = 0;
  uint32_t sessionMin = 0;
  uint32_t games = 0;
  uint16_t days = 0;
};

// One calendar day of activity. `key` is yyyymmdd, 0 while the clock is not yet set.
struct DayLog {
  uint32_t key = 0;
  uint32_t steps = 0;
  uint32_t runSec = 0;
  uint32_t walkSec = 0;
  uint16_t sessions = 0;
  uint16_t sessionMin = 0;
  uint16_t games = 0;
  uint16_t xp = 0;
  uint8_t energyFromSteps = 0;  // energy already granted for today's steps
  uint8_t planDone = 0;         // bit i = drill i of today's plan done
};

constexpr int HISTORY_DAYS = 14;
constexpr int DRILLS_PER_DAY = 3;

struct Drill {
  uint8_t act = ACT_SHOOT;
  uint8_t minutes = 0;  // 0 = empty slot
};

// Weekly plan, index 0 = Monday.
struct Program {
  Drill days[7][DRILLS_PER_DAY];
};

struct Settings {
  char coach[24] = "Huxley";
  bool sound = true;
  uint8_t brightness = 140;
  bool flipTilt = false;  // for Tilt Dribble, if left/right feel reversed
  int16_t tzMinutes = 0;  // local offset from UTC, east positive
};

struct TrainerState {
  PlayerCard player;
  DayLog today;
  DayLog history[HISTORY_DAYS];  // [0] = yesterday
  uint8_t historyCount = 0;
  Program program;
  bool programCustom = false;
  uint8_t energy = 3;
  uint16_t streak = 0;          // active days in a row ending at lastActiveDay
  uint32_t lastActiveDay = 0;   // yyyymmdd
  Settings settings;
};

}  // namespace tr
