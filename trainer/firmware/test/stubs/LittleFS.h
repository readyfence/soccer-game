#pragma once
#include "Arduino.h"

class File {
 public:
  explicit operator bool() const;
  size_t size() const;
  int available();
  size_t read(uint8_t* buf, size_t size);
  size_t write(const uint8_t* buf, size_t size);
  void close();
};

class LittleFSFS {
 public:
  bool begin(bool formatOnFail = false);
  bool exists(const char* path);
  File open(const char* path, const char* mode = "r");
  bool remove(const char* path);
  bool rename(const char* from, const char* to);
  bool mkdir(const char* path);
};
extern LittleFSFS LittleFS;
