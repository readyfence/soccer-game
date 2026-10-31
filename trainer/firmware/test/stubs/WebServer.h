#pragma once
#include <functional>

#include "Arduino.h"

enum HTTPMethod { HTTP_ANY, HTTP_GET, HTTP_POST };

class Uri {
 public:
  Uri(const char*) {}
};

class WebServer {
 public:
  typedef std::function<void(void)> THandlerFunction;
  WebServer(int port = 80) { (void)port; }
  void begin();
  void handleClient();
  void stop();
  void on(const Uri& uri, HTTPMethod method, THandlerFunction fn);
  void onNotFound(THandlerFunction fn);
  String arg(String name);
  bool hasArg(String name);
  void send(int code, const char* content_type = NULL, const String& content = String(""));
  void send(int code, const String& content_type, const String& content);
  void send(int code, const char* content_type, const char* content);
  void sendHeader(const String& name, const String& value, bool first = false);
};
