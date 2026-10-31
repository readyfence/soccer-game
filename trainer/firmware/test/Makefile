# Host-side unit tests for the training rules and step detector.
#   make -C trainer/firmware/test
CXX ?= g++
CXXFLAGS ?= -std=c++17 -O1 -Wall -Wextra -Werror -g
SRC = test_core.cpp ../src/core/rules.cpp ../src/core/steps.cpp
SERVICE_SRC = test_service.cpp ../src/codec.cpp ../src/trainer.cpp ../src/core/rules.cpp ../src/core/steps.cpp
# Path to ArduinoJson's src/ folder (PlatformIO puts it in .pio/libdeps/cores3/ArduinoJson/src).
ARDUINOJSON ?= ../.pio/libdeps/cores3/ArduinoJson/src

GAMES_SRC = test_games.cpp ../src/core/minigames.cpp

test: build/test_core build/test_games
	./build/test_core
	./build/test_games

build/test_games: $(GAMES_SRC) ../src/core/minigames.h
	mkdir -p build
	$(CXX) $(CXXFLAGS) -o $@ $(GAMES_SRC) -lm

service: build/test_service
	./build/test_service

build/test_service: $(SERVICE_SRC) ../src/*.h ../src/core/*.h
	mkdir -p build
	$(CXX) $(CXXFLAGS) -I$(ARDUINOJSON) -o $@ $(SERVICE_SRC) -lm

build/test_core: $(SRC) ../src/core/*.h
	mkdir -p build
	$(CXX) $(CXXFLAGS) -o $@ $(SRC) -lm

clean:
	rm -rf build

# Compile-only check of the device code on a PC (nothing is linked or run).
# UI files use the real M5GFX headers; main.cpp/net.cpp use the real M5Unified headers
# plus stubs/ that mirror the arduino-esp32 2.0.x APIs they call.
LIBS ?= ../.pio/libdeps/cores3
M5GFX ?= $(LIBS)/M5GFX/src
M5UNIFIED ?= $(LIBS)/M5Unified/src
SYNTAX = $(CXX) -std=c++17 -fsyntax-only -Wall -Wextra -Werror -isystem $(M5GFX) -isystem $(ARDUINOJSON)

syntax:
	for f in ../src/ui/*.cpp ../src/codec.cpp ../src/trainer.cpp; do echo "  $$f"; $(SYNTAX) $$f || exit 1; done
	for f in ../src/net.cpp ../src/main.cpp; do echo "  $$f"; $(SYNTAX) -Istubs -isystem $(M5UNIFIED) $$f || exit 1; done

.PHONY: test service syntax clean
