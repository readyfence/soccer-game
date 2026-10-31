// Minimal stand-ins for arduino-esp32 2.0.x headers, used only by `make syntax`
// (compile-only checks of net.cpp / main.cpp on a PC). Signatures mirror the real ones;
// nothing here is ever linked or run.
#pragma once
#include <stddef.h>
#include <stdint.h>

#include <string>

class String {
 public:
  String(const char* s = "") : _s(s ? s : "") {}
  const char* c_str() const { return _s.c_str(); }
  unsigned int length() const { return (unsigned)_s.size(); }
  char operator[](unsigned int i) const { return _s[i]; }
  String& operator+=(const String& o) {
    _s += o._s;
    return *this;
  }
  String& operator+=(const char* o) {
    _s += o;
    return *this;
  }
  String& operator+=(char c) {
    _s += c;
    return *this;
  }
  void reserve(unsigned int n) { _s.reserve(n); }
  void trim() {}
  void replace(const char*, const char*) {}
  int indexOf(const String&) const { return -1; }
  std::string _s;
};

class StringSumHelper : public String {
 public:
  StringSumHelper(const String& s) : String(s) {}
  StringSumHelper(const char* p) : String(p) {}
};
StringSumHelper& operator+(const StringSumHelper& lhs, const String& rhs);
StringSumHelper& operator+(const StringSumHelper& lhs, const char* cstr);

class HardwareSerial {
 public:
  void println(const char*) {}
};
extern HardwareSerial Serial;
unsigned long millis();
void delay(uint32_t);

class IPAddress {
 public:
  String toString() const { return String(); }
};
