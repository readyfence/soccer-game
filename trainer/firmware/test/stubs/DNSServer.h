#pragma once
#include "Arduino.h"

enum class DNSReplyCode { NoError = 0 };

class DNSServer {
 public:
  void processNextRequest();
  void setErrorReplyCode(const DNSReplyCode& replyCode);
  bool start(const uint16_t& port, const String& domainName, const IPAddress& resolvedIP);
  void stop();
};
