// Tests for JSON codecs and the Trainer service (players arriving, swapping, sync, storage).
// Needs ArduinoJson's headers: make -C trainer/firmware/test service ARDUINOJSON=/path/to/ArduinoJson/src
#include <stdio.h>
#include <string.h>

#include <map>
#include <string>

#include "../src/trainer.h"

using namespace tr;

static int g_failed = 0;
static int g_checks = 0;

#define CHECK(cond)                                            \
  do {                                                         \
    g_checks++;                                                \
    if (!(cond)) {                                             \
      g_failed++;                                              \
      printf("  FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond); \
    }                                                          \
  } while (0)

struct MemStorage : Storage {
  std::map<std::string, std::string> files;
  bool read(const char* path, std::string& out) override {
    auto it = files.find(path);
    if (it == files.end()) return false;
    out = it->second;
    return true;
  }
  bool write(const char* path, const std::string& data) override {
    files[path] = data;
    return true;
  }
};

// Exactly what the game's sendPayload() produces (see tests/trainer.test.js).
static const char* LINDQVIST =
    "{\"v\":1,\"id\":\"p7k2\",\"name\":\"Jos\xc3\xa9 Lindqvist\",\"ascii\":\"Jose Lindqvist\",\"back\":\"LINDQVIST\",\"num\":10,"
    "\"pos\":\"ST\",\"role\":\"FWD\",\"club\":\"RMA\",\"base\":[97,92,81,36,91],\"train\":[0,0,0,0,0],"
    "\"kit\":[16185078,16185078,1712960],\"look\":{\"tone\":5,\"hair\":\"buzz\",\"hc\":\"black\",\"beard\":0},"
    "\"ret\":\"http://127.0.0.1:5173/\",\"now\":1793462400000,\"tz\":-300}";

static const char* HALVORSEN =
    "{\"v\":1,\"id\":\"p9x1\",\"name\":\"Theo Halvorsen\",\"ascii\":\"Theo Halvorsen\",\"back\":\"HALVORSEN\",\"num\":7,\"pos\":\"RW\","
    "\"club\":\"OSO\",\"base\":[90,85,84,60,88],\"train\":[1,0,0,0,0],\"kit\":[14680064,16777215,16777215],"
    "\"look\":{\"tone\":5,\"hair\":\"crop\",\"hc\":\"black\",\"beard\":0},\"ret\":\"javascript:alert(1)\"}";

static void testBase64() {
  puts("base64url");
  const char* samples[] = {"", "a", "ab", "abc", "abcd", "\xc3\xa9\xe2\x98\x85 ok?"};
  for (const char* s : samples) {
    std::string enc = base64UrlEncode(s), dec;
    CHECK(enc.find('=') == std::string::npos);
    CHECK(base64UrlDecode(enc.c_str(), dec));
    CHECK(dec == s);
  }
  std::string out;
  CHECK(!base64UrlDecode("bad!", out));
  // Same as the browser's btoa-based encoder for this input.
  CHECK(base64UrlEncode("{\"v\":1}") == "eyJ2IjoxfQ");
}

static void testParse() {
  puts("parse incoming");
  Incoming in;
  CHECK(parseIncoming(LINDQVIST, in));
  CHECK(strcmp(in.card.name, "Jos\xc3\xa9 Lindqvist") == 0);
  CHECK(strcmp(in.card.ascii, "Jose Lindqvist") == 0);
  CHECK(in.card.role == ROLE_FWD);
  CHECK(in.card.base[0] == 97 && in.card.base[4] == 91);
  CHECK(in.card.kitNumber == 0x1a2340);
  CHECK(in.card.look.hair == HAIR_BUZZ && in.card.look.hairColour == HC_BLACK && in.card.look.tone == 5);
  CHECK(in.hasTime && in.tzMinutes == -300);
  CHECK(in.ret == "http://127.0.0.1:5173/");

  Incoming b64;
  CHECK(parseIncoming(base64UrlEncode(LINDQVIST).c_str(), b64));
  CHECK(strcmp(b64.card.name, in.card.name) == 0);

  Incoming theo;
  CHECK(parseIncoming(HALVORSEN, theo));
  CHECK(theo.ret.empty());  // javascript: URLs are refused
  CHECK(!theo.hasTime);

  Incoming bad;
  CHECK(!parseIncoming("{\"v\":2,\"name\":\"x\",\"base\":[1,2,3,4,5]}", bad));
  CHECK(!parseIncoming("{\"v\":1,\"name\":\"\",\"base\":[1,2,3,4,5]}", bad));
  CHECK(!parseIncoming("{\"v\":1,\"name\":\"x\",\"base\":[1,2]}", bad));
  CHECK(!parseIncoming("not json", bad));
  CHECK(!parseIncoming(nullptr, bad));
}

static void testTrainerFlow() {
  puts("trainer flow");
  MemStorage disk;
  Trainer t;
  t.begin(&disk);
  CHECK(!t.s.player.present);

  Incoming in;
  CHECK(t.receive(LINDQVIST, in) == Receive::Accepted);
  CHECK(t.s.player.present);
  t.s.today.key = 20261102;
  t.session(ACT_SHOOT, 60);  // 180 SHO XP: not quite a point at 92
  t.miniGame(GAME_PENALTY, 100);
  CHECK(t.s.player.train[SHO] == 1);

  // Sending him again keeps progress and takes the higher training values.
  std::string again = LINDQVIST;
  size_t pos = again.find("\"train\":[0,0,0,0,0]");
  again.replace(pos, 19, "\"train\":[2,0,0,0,0]");
  CHECK(t.receive(again.c_str(), in) == Receive::Merged);
  CHECK(t.s.player.train[PAC] == 2 && t.s.player.train[SHO] == 1);

  // Sync payload carries the deltas and overall gain under the original UTF-8 name.
  std::string sync;
  CHECK(base64UrlDecode(t.syncCode().c_str(), sync));
  CHECK(sync.find("\"name\":\"Jos\xc3\xa9 Lindqvist\"") != std::string::npos);
  CHECK(sync.find("\"train\":[2,1,0,0,1]") != std::string::npos);
  CHECK(sync.find("\"id\":\"p7k2\"") != std::string::npos);

  // Renamed in the game: still the same player (matched by id).
  std::string renamed = again;
  renamed.replace(renamed.find("Jos\xc3\xa9 Lindqvist"), strlen("Jos\xc3\xa9 Lindqvist"), "Joey Lindqvist");
  CHECK(t.receive(renamed.c_str(), in) == Receive::Merged);
  CHECK(strcmp(t.s.player.name, "Joey Lindqvist") == 0);
  CHECK(t.s.player.train[SHO] == 1);
  CHECK(sync.find("\"coach\":\"Huxley\"") != std::string::npos);

  // A different player waits for confirmation on the device.
  CHECK(t.receive(HALVORSEN, in) == Receive::Pending);
  CHECK(t.hasPending());
  CHECK(strcmp(t.s.player.ascii, "Jose Lindqvist") == 0);
  t.declinePending();
  CHECK(!t.hasPending());
  CHECK(t.receive(HALVORSEN, in) == Receive::Pending);
  t.acceptPending();
  CHECK(strcmp(t.s.player.ascii, "Theo Halvorsen") == 0);
  CHECK(t.s.player.train[PAC] == 1);

  // José comes back later: his device progress is restored from the roster.
  CHECK(t.receive(LINDQVIST, in) == Receive::Pending);
  t.acceptPending();
  CHECK(t.s.player.train[PAC] == 2 && t.s.player.train[SHO] == 1);
  CHECK(t.s.player.games == 1 && t.s.player.sessions == 1);

  // Save and load round-trips everything.
  t.s.today.steps = 4321;
  t.s.streak = 3;
  t.s.lastActiveDay = 20261101;
  rollDay(t.s, 20261103);
  t.save(1000, true);
  Trainer u;
  u.begin(&disk);
  CHECK(u.s.player.present);
  CHECK(strcmp(u.s.player.name, t.s.player.name) == 0);
  CHECK(u.s.player.train[PAC] == 2);
  CHECK(u.s.player.xp[SHO] == t.s.player.xp[SHO]);
  CHECK(u.s.player.kitNumber == 0x1a2340);
  CHECK(u.s.player.look.hair == HAIR_BUZZ);
  CHECK(u.s.historyCount == 1 && u.s.history[0].steps == 4321);
  CHECK(u.s.today.key == 20261103);
  CHECK(u.s.energy == t.s.energy);
  CHECK(u.s.program.days[0][0].act == t.s.program.days[0][0].act);
  CHECK(strcmp(u.s.settings.coach, "Huxley") == 0);
  t.s.settings.flipTilt = true;
  t.markDirty();
  t.save(2000, true);
  Trainer v;
  v.begin(&disk);
  CHECK(v.s.settings.flipTilt);
}

static void testDashboardAndProgram() {
  puts("dashboard and program");
  MemStorage disk;
  Trainer t;
  t.begin(&disk);
  Incoming in;
  t.receive(HALVORSEN, in);
  std::string dash = dashboardJson(t.s, 0, true);
  CHECK(dash.find("\"name\":\"Theo Halvorsen\"") != std::string::npos);
  CHECK(dash.find("\"activities\"") != std::string::npos);

  CHECK(t.applyProgram("{\"days\":[[{\"t\":\"pass\",\"m\":25}],[],[],[],[],[],[{\"t\":\"match\",\"m\":90}]]}"));
  CHECK(t.s.programCustom);
  CHECK(t.s.program.days[0][0].act == ACT_PASS && t.s.program.days[0][0].minutes == 25);
  CHECK(t.s.program.days[1][0].minutes == 0);
  CHECK(t.s.program.days[6][0].act == ACT_MATCH);
  CHECK(!t.applyProgram("{\"days\":[[]]}"));
  CHECK(!t.applyProgram("garbage"));
  CHECK(t.applyProgram("{\"reset\":true}"));
  CHECK(!t.s.programCustom);
  CHECK(t.s.program.days[0][0].act == ACT_SHOOT);

  CHECK(t.applySettings("{\"coach\":\"Hux \xe2\x98\x85\",\"sound\":false}"));
  CHECK(strcmp(t.s.settings.coach, "Hux ") == 0);
  CHECK(!t.s.settings.sound);
}

static void testHelpers() {
  puts("helpers");
  CHECK(isHttpUrl("http://127.0.0.1:5173/"));
  CHECK(isHttpUrl("https://example.com/game/?x=1"));
  CHECK(!isHttpUrl("javascript:alert(1)"));
  CHECK(!isHttpUrl("http://x/\"><script>"));
  CHECK(jsString("a\"</script>") == "\"a\\\"\\u003c/script\\u003e\"");
}

int main() {
  testBase64();
  testParse();
  testTrainerFlow();
  testDashboardAndProgram();
  testHelpers();
  printf("\n%d checks, %d failed\n", g_checks, g_failed);
  return g_failed ? 1 : 0;
}
