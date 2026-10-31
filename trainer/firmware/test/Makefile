# Host-side unit tests for the training rules and step detector.
#   make -C trainer/firmware/test
CXX ?= g++
CXXFLAGS ?= -std=c++17 -O1 -Wall -Wextra -Werror -g
SRC = test_core.cpp ../src/core/rules.cpp ../src/core/steps.cpp

test: build/test_core
	./build/test_core

build/test_core: $(SRC) ../src/core/*.h
	mkdir -p build
	$(CXX) $(CXXFLAGS) -o $@ $(SRC) -lm

clean:
	rm -rf build

.PHONY: test clean
