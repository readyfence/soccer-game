#pragma once
#include "Arduino.h"

typedef enum { WIFI_OFF = 0, WIFI_STA = 1, WIFI_AP = 2, WIFI_AP_STA = 3 } wifi_mode_t;
typedef enum { WL_IDLE_STATUS = 0, WL_CONNECTED = 3 } wl_status_t;
#define WIFI_SCAN_FAILED (-2)

class WiFiClass {
 public:
  static bool mode(wifi_mode_t);
  static wifi_mode_t getMode();
  static bool setHostname(const char*);
  bool setSleep(bool);
  void persistent(bool);
  wl_status_t begin(const char* ssid, const char* pass = nullptr);
  bool disconnect(bool wifioff = false, bool eraseap = false);
  wl_status_t status();
  IPAddress localIP();
  bool softAP(const char* ssid, const char* passphrase = nullptr, int channel = 1, int hidden = 0, int maxc = 4,
              bool ftm = false);
  bool softAPdisconnect(bool wifioff = false);
  IPAddress softAPIP();
  int16_t scanNetworks(bool async = false, bool show_hidden = false, bool passive = false, uint32_t ms = 300,
                       uint8_t ch = 0, const char* ssid = nullptr, const uint8_t* bssid = nullptr);
  int16_t scanComplete();
  void scanDelete();
  String SSID(uint8_t i);
};
extern WiFiClass WiFi;
