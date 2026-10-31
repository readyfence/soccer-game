// Wi-Fi is only on while the LINK screen is open, to save battery.
//
//   Linked:  joins the home network as soccer-trainer.local and serves
//            /ping /send /sync /api/* and the parent dashboard.
//   Portal:  first-time setup. Opens hotspot "Soccer-Trainer" with a captive page
//            where a parent picks the home network.
#include "net.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <DNSServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>

#include <string>

#include "hal.h"
#include "web_pages.h"

static const char* HOSTNAME = "soccer-trainer";
static const char* HOST_LOCAL = "soccer-trainer.local";
static const char* PORTAL_SSID = "Soccer-Trainer";
static const uint32_t CONNECT_TIMEOUT_MS = 20000;
static const uint32_t IDLE_OFF_MS = 10UL * 60UL * 1000UL;

static tr::Trainer* g_trainer = nullptr;
static tr::StepDetector* g_steps = nullptr;
static NetEventFn g_onEvent = nullptr;
static NetClockFn g_onClock = nullptr;

static WebServer server(80);
static DNSServer dns;
static bool routesAdded = false;
static bool serverRunning = false;
static bool mdnsRunning = false;
static bool dnsRunning = false;

static hal::Net state = hal::Net::Off;
static uint32_t stateSince = 0;
static uint32_t lastRequest = 0;
static uint32_t linkAfterSaveAt = 0;  // portal saved new details: join them shortly after
static String savedSsid;
static String savedPass;
static String ipText;

// ------------------------------------------------------------------ credentials

static void loadCredentials() {
  Preferences prefs;
  prefs.begin("wifi", true);
  savedSsid = prefs.getString("ssid", "");
  savedPass = prefs.getString("pass", "");
  prefs.end();
}

static void saveCredentials(const String& ssid, const String& pass) {
  Preferences prefs;
  prefs.begin("wifi", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();
  savedSsid = ssid;
  savedPass = pass;
}

// ------------------------------------------------------------------ helpers

static void setState(hal::Net s) {
  state = s;
  stateSince = millis();
}

static void event(const char* msg) {
  if (g_onEvent) g_onEvent(msg);
}

static void sendJson(int code, JsonDocument& doc) {
  std::string out;
  serializeJson(doc, out);
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Cache-Control", "no-store");
  server.send(code, "application/json", out.c_str());
}

static void sendOk(bool ok, const char* error = nullptr) {
  JsonDocument doc;
  doc["ok"] = ok;
  if (error) doc["error"] = error;
  sendJson(ok ? 200 : 400, doc);
}

static String htmlEscape(const String& s) {
  String out;
  out.reserve(s.length() + 8);
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '&') out += "&amp;";
    else if (c == '<') out += "&lt;";
    else if (c == '>') out += "&gt;";
    else if (c == '"') out += "&quot;";
    else out += c;
  }
  return out;
}

static void sendMessagePage(const char* title, const String& body, const std::string& backUrl) {
  String page = "<!doctype html><html><head><meta charset=\"utf-8\">"
                "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                "<title>Trainer</title><link rel=\"stylesheet\" href=\"/style.css\"></head><body><main>"
                "<h1>Soccer Trainer</h1><div class=\"card\"><p><b>";
  page += title;
  page += "</b></p><p class=\"muted\">";
  page += body;
  page += "</p>";
  if (!backUrl.empty()) {
    // backUrl passed tr::isHttpUrl: no quotes, spaces or angle brackets.
    page += "<p><a class=\"btn\" href=\"";
    page += backUrl.c_str();
    page += "\">Back to the game</a></p>";
  }
  page += "</div></main></body></html>";
  server.send(200, "text/html", page);
}

static bool touch() {
  lastRequest = millis();
  return true;
}

// ------------------------------------------------------------------ routes

static void handleStyle() {
  server.sendHeader("Cache-Control", "max-age=3600");
  server.send(200, "text/css", web::STYLE);
}

static void handlePortalPage() {
  String options;
  int n = WiFi.scanComplete();
  if (n > 0) {
    for (int i = 0; i < n && i < 20; i++) {
      String ssid = WiFi.SSID(i);
      if (!ssid.length() || options.indexOf(">" + htmlEscape(ssid) + "<") >= 0) continue;
      options += "<option>" + htmlEscape(ssid) + "</option>";
    }
  } else {
    options = "<option value=\"\">Scanning... tap Rescan</option>";
    if (n == WIFI_SCAN_FAILED) WiFi.scanNetworks(true);
  }
  String head = web::PORTAL_HEAD;
  head.replace("%STYLE%", web::STYLE);
  server.send(200, "text/html", head + options + web::PORTAL_TAIL);
}

static void handleRoot() {
  touch();
  if (state == hal::Net::Portal) {
    handlePortalPage();
    return;
  }
  server.send(200, "text/html", web::DASHBOARD_PAGE);
}

static void handleSave() {
  touch();
  if (state != hal::Net::Portal) {
    server.send(404, "text/plain", "Not found");
    return;
  }
  String ssid = server.arg("ssid2");
  ssid.trim();
  if (!ssid.length()) ssid = server.arg("ssid");
  String pass = server.arg("pass");
  String coach = server.arg("coach");
  coach.trim();
  if (!ssid.length()) {
    sendMessagePage("Pick a network first", "Go back and choose your home Wi-Fi.", "");
    return;
  }
  saveCredentials(ssid, pass);
  if (coach.length() && g_trainer) {
    JsonDocument doc;
    doc["coach"] = coach.c_str();
    std::string json;
    serializeJson(doc, json);
    g_trainer->applySettings(json.c_str());
    g_trainer->save(millis(), true);
  }
  sendMessagePage("Saved!", "The trainer is joining " + htmlEscape(ssid) +
                                ". Reconnect this phone to your home Wi-Fi.", "");
  linkAfterSaveAt = millis() + 1500;
  event("Wi-Fi saved");
}

static void handleCaptive() {
  touch();
  if (state == hal::Net::Portal) {
    server.sendHeader("Location", "http://192.168.4.1/", true);
    server.send(302, "text/plain", "");
  } else {
    server.send(404, "text/plain", "Not found");
  }
}

static void handlePing() {
  touch();
  JsonDocument doc;
  doc["ok"] = true;
  doc["player"] = (g_trainer && g_trainer->s.player.present) ? g_trainer->s.player.ascii : "";
  sendJson(200, doc);
}

static void handleSendPage() {
  touch();
  server.send(200, "text/html", web::SEND_PAGE);
}

static void handleReceive() {
  touch();
  if (!g_trainer) {
    sendOk(false, "not ready");
    return;
  }
  String body = server.arg("plain");
  tr::Incoming in;
  tr::Receive r = g_trainer->receive(body.c_str(), in);
  if (r == tr::Receive::Bad) {
    sendOk(false, "That player could not be read. Update the game and try again.");
    return;
  }
  if (in.hasTime && g_onClock) g_onClock(in.nowMs, in.tzMinutes);
  g_trainer->save(millis(), true);

  char msg[64];
  const char* status = "accepted";
  if (r == tr::Receive::Merged) {
    status = "merged";
    snprintf(msg, sizeof(msg), "%s updated", in.card.ascii);
    event(msg);
  } else if (r == tr::Receive::Pending) {
    status = "pending";
  } else {
    snprintf(msg, sizeof(msg), "%s is here!", in.card.ascii);
    event(msg);
  }
  JsonDocument doc;
  doc["ok"] = true;
  doc["status"] = status;
  doc["name"] = in.card.ascii;
  sendJson(200, doc);
}

static void handleSync() {
  touch();
  std::string to = server.arg("to").c_str();
  size_t hash = to.find('#');
  if (hash != std::string::npos) to.erase(hash);
  bool okUrl = tr::isHttpUrl(to);
  if (!g_trainer || !g_trainer->s.player.present) {
    sendMessagePage("No player on the trainer yet", "Send a player from the game first.", okUrl ? to : "");
    return;
  }
  if (!okUrl) {
    sendMessagePage("Sync link was not valid", "Open Trainer in the game and press Sync again.", "");
    return;
  }
  std::string target = to + "#trainer=" + g_trainer->syncCode();
  String page = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Syncing</title>"
                "<link rel=\"stylesheet\" href=\"/style.css\"></head><body><main><h1>Syncing...</h1>"
                "<p><a class=\"btn\" href=\"";
  page += target.c_str();
  page += "\">Back to the game</a></p><script>location.replace(";
  page += tr::jsString(target).c_str();
  page += ");</script></main></body></html>";
  server.send(200, "text/html", page);
  char msg[64];
  snprintf(msg, sizeof(msg), "%s synced to the game", g_trainer->s.player.ascii);
  event(msg);
}

static void handleState() {
  touch();
  if (!g_trainer) return sendOk(false, "not ready");
  std::string json = tr::dashboardJson(g_trainer->s, g_steps ? g_steps->cadence() : 0, state == hal::Net::Linked);
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", json.c_str());
}

static void handleProgram() {
  touch();
  bool ok = g_trainer && g_trainer->applyProgram(server.arg("plain").c_str());
  if (ok) g_trainer->save(millis(), true);
  sendOk(ok, ok ? nullptr : "bad plan");
}

static void handleSettings() {
  touch();
  bool ok = g_trainer && g_trainer->applySettings(server.arg("plain").c_str());
  if (ok) g_trainer->save(millis(), true);
  sendOk(ok, ok ? nullptr : "bad settings");
}

static void handleTime() {
  touch();
  JsonDocument doc;
  if (deserializeJson(doc, server.arg("plain").c_str())) return sendOk(false, "bad time");
  double now = doc["now"] | 0.0;
  int tz = doc["tz"] | 0;
  if (now > 1.6e12 && now < 7.3e12 && tz >= -14 * 60 && tz <= 14 * 60 && g_onClock) g_onClock((int64_t)now, tz);
  sendOk(true);
}

static void addRoutes() {
  if (routesAdded) return;
  routesAdded = true;
  server.on("/", HTTP_GET, handleRoot);
  server.on("/style.css", HTTP_GET, handleStyle);
  server.on("/save", HTTP_POST, handleSave);
  server.on("/ping", HTTP_GET, handlePing);
  server.on("/send", HTTP_GET, handleSendPage);
  server.on("/sync", HTTP_GET, handleSync);
  server.on("/api/receive", HTTP_POST, handleReceive);
  server.on("/api/state", HTTP_GET, handleState);
  server.on("/api/program", HTTP_POST, handleProgram);
  server.on("/api/settings", HTTP_POST, handleSettings);
  server.on("/api/time", HTTP_POST, handleTime);
  // Phones probe these to detect a captive portal.
  server.on("/generate_204", HTTP_GET, handleCaptive);
  server.on("/gen_204", HTTP_GET, handleCaptive);
  server.on("/hotspot-detect.html", HTTP_GET, handleCaptive);
  server.on("/connecttest.txt", HTTP_GET, handleCaptive);
  server.on("/ncsi.txt", HTTP_GET, handleCaptive);
  server.onNotFound(handleCaptive);
}

static void startServer() {
  addRoutes();
  if (!serverRunning) {
    server.begin();
    serverRunning = true;
  }
  lastRequest = millis();
}

// ------------------------------------------------------------------ public API

void netBegin(tr::Trainer* trainer, tr::StepDetector* steps, NetEventFn onEvent, NetClockFn onClock) {
  g_trainer = trainer;
  g_steps = steps;
  g_onEvent = onEvent;
  g_onClock = onClock;
  loadCredentials();
  WiFi.persistent(false);
  WiFi.mode(WIFI_OFF);
}

namespace hal {

void netStop() {
  if (serverRunning) {
    server.stop();
    serverRunning = false;
  }
  if (mdnsRunning) {
    MDNS.end();
    mdnsRunning = false;
  }
  if (dnsRunning) {
    dns.stop();
    dnsRunning = false;
  }
  if (WiFi.getMode() != WIFI_OFF) {
    WiFi.scanDelete();
    if (WiFi.getMode() & WIFI_AP) WiFi.softAPdisconnect(true);
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
  }
  linkAfterSaveAt = 0;
  ipText = "";
  setState(Net::Off);
}

void netLink() {
  netStop();
  loadCredentials();
  if (!savedSsid.length()) {
    setState(Net::NoWifi);
    return;
  }
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(HOSTNAME);
  WiFi.setSleep(true);
  WiFi.begin(savedSsid.c_str(), savedPass.c_str());
  setState(Net::Connecting);
}

void netPortal() {
  netStop();
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(PORTAL_SSID);
  delay(100);
  dns.setErrorReplyCode(DNSReplyCode::NoError);
  dnsRunning = dns.start(53, "*", WiFi.softAPIP());
  WiFi.scanNetworks(true);
  startServer();
  ipText = WiFi.softAPIP().toString();
  setState(Net::Portal);
}

void netForget() {
  saveCredentials("", "");
}

void netLoop() {
  uint32_t now = millis();
  switch (state) {
    case Net::Connecting:
      if (WiFi.status() == WL_CONNECTED) {
        ipText = WiFi.localIP().toString();
        mdnsRunning = MDNS.begin(HOSTNAME);
        if (mdnsRunning) MDNS.addService("http", "tcp", 80);
        startServer();
        setState(Net::Linked);
      } else if (now - stateSince > CONNECT_TIMEOUT_MS) {
        netStop();
        setState(Net::Failed);
      }
      break;
    case Net::Linked:
      server.handleClient();
      if (WiFi.status() == WL_CONNECTED) {
        ipText = WiFi.localIP().toString();
      }
      if (now - lastRequest > IDLE_OFF_MS) {
        netStop();
        event("Link off to save battery");
      }
      break;
    case Net::Portal:
      if (dnsRunning) dns.processNextRequest();
      server.handleClient();
      if (linkAfterSaveAt && (int32_t)(now - linkAfterSaveAt) >= 0) {
        linkAfterSaveAt = 0;
        netLink();
      } else if (now - lastRequest > IDLE_OFF_MS && now - stateSince > IDLE_OFF_MS) {
        netStop();
      }
      break;
    default:
      break;
  }
}

Net netState() { return state; }
const char* netIp() { return ipText.c_str(); }
const char* netSsid() { return savedSsid.c_str(); }
const char* netHost() { return HOST_LOCAL; }
const char* netPortalName() { return PORTAL_SSID; }

}  // namespace hal
