#pragma once
#include "Arduino.h"

class MDNSResponder {
 public:
  bool begin(const char* hostName);
  void end();
  bool addService(const char* service, const char* proto, uint16_t port);
};
extern MDNSResponder MDNS;
