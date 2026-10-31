#pragma once
#include "Arduino.h"

class Preferences {
 public:
  bool begin(const char* name, bool readOnly = false, const char* partition_label = nullptr);
  void end();
  String getString(const char* key, String defaultValue = String());
  size_t putString(const char* key, String value);
};
