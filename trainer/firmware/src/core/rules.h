// Training rules: how activity turns into XP, XP into stat points, and how days, energy
// and streaks work. Every number a parent might want to tune lives at the top of rules.cpp.
#pragma once

#include "model.h"

namespace tr {

// ---------- catalogue ----------

const char* statName(Stat s);          // "PAC"
const char* activityName(uint8_t a);   // "Shooting"
const char* activityId(uint8_t a);     // "shoot" (used in JSON)
int activityFromId(const char* id);    // -1 if unknown
const char* gameName(uint8_t g);       // "Penalty King"
Stat gameStat(uint8_t g);
Role roleFromPos(const char* pos);
const char* roleName(Role r);

// ---------- player progression ----------

int statNow(const PlayerCard& p, Stat s);  // base + training, capped at 99
int pointCost(int statValue);              // XP needed for the next point at this level
int ovrBonus(const PlayerCard& p);         // overall points gained from training
int ovrNow(const PlayerCard& p);

struct Gain {
  int xp[STAT_COUNT] = {0, 0, 0, 0};
  int points[STAT_COUNT] = {0, 0, 0, 0};
  int ovrBefore = 0;
  int ovrAfter = 0;
  int totalXp() const { return xp[0] + xp[1] + xp[2] + xp[3]; }
  int totalPoints() const { return points[0] + points[1] + points[2] + points[3]; }
  void add(const Gain& o);
};

// Adds XP to the player's stats, levelling up as needed. Returns what happened.
Gain applyXp(TrainerState& s, const int xp[STAT_COUNT]);

// Streak bonus in percent (0..25) for today.
int streakBonusPct(const TrainerState& s);
int currentStreak(const TrainerState& s);
bool dayIsActive(const DayLog& d);

// ---------- rewards ----------

// Steps / running seconds measured since the last call. Grants XP and energy.
Gain addMovement(TrainerState& s, uint32_t newSteps, uint32_t newRunSec, uint32_t newWalkSec);

// A real training session the player logged. `fromPlan` gives the plan bonus.
Gain logSession(TrainerState& s, uint8_t activity, int minutes, bool fromPlan);

// XP a session would give, before streak bonus (for previews).
void sessionXp(uint8_t activity, int minutes, bool fromPlan, int out[STAT_COUNT]);

// Mini games cost energy; score is 0..100.
bool canPlay(const TrainerState& s);
Gain finishMiniGame(TrainerState& s, uint8_t game, int score);

// ---------- calendar ----------

uint32_t dayKey(int year, int month, int day);
bool dayKeyValid(uint32_t key);
int32_t daysFromCivil(uint32_t key);   // days since 1970-01-01
uint32_t civilFromDays(int32_t days);  // inverse of daysFromCivil
uint32_t addDays(uint32_t key, int delta);
int weekdayMon0(uint32_t key);         // 0 = Monday

// Moves to a new calendar day if `key` differs from today. Returns true if a day ended.
bool rollDay(TrainerState& s, uint32_t key);

// ---------- weekly program ----------

void defaultProgram(Role role, Program& out);
int todaysDrills(const TrainerState& s, Drill out[DRILLS_PER_DAY]);  // count of non-empty drills
// Marks drill `idx` of today's plan done and logs it. Returns the gain (empty if already done).
Gain completeDrill(TrainerState& s, int idx);

// ---------- players arriving ----------

// Starts training a brand-new player (or a returning one) and resets per-player totals as needed.
void resetForNewPlayer(TrainerState& s, const PlayerCard& incoming);

}  // namespace tr
