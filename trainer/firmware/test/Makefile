# Host-side unit tests for the training rules and step detector.
#   make -C trainer/firmware/test
CXX ?= g++
CXXFLAGS ?= -std=c++17 -O1 -Wall -Wextra -Werror -g
SRC = test_core.cpp ../src/core/rules.cpp ../src/core/steps.cpp
SERVICE_SRC = test_service.cpp ../src/codec.cpp ../src/trainer.cpp ../src/core/rules.cpp ../src/core/steps.cpp
# Path to ArduinoJson's src/ folder (PlatformIO puts it in .pio/libdeps/cores3/ArduinoJson/src).
ARDUINOJSON ?= ../.pio/libdeps/cores3/ArduinoJson/src

test: build/test_core
	./build/test_core

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

.PHONY: test service clean
