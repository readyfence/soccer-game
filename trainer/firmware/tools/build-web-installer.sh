#!/bin/bash
# Builds the trainer firmware with arduino-cli and the ESP32 Arduino core 2.0.17 (the same
# core PlatformIO's espressif32@6.9.0 uses), then copies the flash images into
# public/flasher/ so the game's website serves a one-click installer at /flasher/.
#
# Everything is fetched from GitHub, so it works where PlatformIO's registry is unreachable.
#
#   trainer/firmware/tools/build-web-installer.sh [work-dir]
#
# Needs: git, curl, python3. The work dir (default ~/.cache/soccer-trainer-build) keeps the
# toolchain between runs.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
FW="$(cd "$HERE/.." && pwd)"
REPO="$(cd "$FW/../.." && pwd)"
WORK="${1:-$HOME/.cache/soccer-trainer-build}"
CORE_VERSION=2.0.17
CLI_VERSION=v1.5.1
mkdir -p "$WORK"
cd "$WORK"

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) CLI_ASSET="Linux_64bit" ;;
  Linux-aarch64) CLI_ASSET="Linux_ARM64" ;;
  Darwin-arm64) CLI_ASSET="macOS_ARM64" ;;
  Darwin-x86_64) CLI_ASSET="macOS_64bit" ;;
  *) echo "Unsupported system: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

if [ ! -x arduino-cli ]; then
  echo "Downloading arduino-cli $CLI_VERSION"
  curl -sSfL -o acli.tgz \
    "https://github.com/arduino/arduino-cli/releases/download/$CLI_VERSION/arduino-cli_${CLI_VERSION#v}_${CLI_ASSET}.tar.gz"
  tar xzf acli.tgz arduino-cli
fi

CORE="$WORK/user/hardware/espressif/esp32"
if [ ! -d "$CORE" ]; then
  echo "Fetching ESP32 Arduino core $CORE_VERSION and its toolchains"
  mkdir -p "$(dirname "$CORE")"
  git clone -q --depth 1 --branch "$CORE_VERSION" https://github.com/espressif/arduino-esp32 "$CORE"
  (cd "$CORE/tools" && python3 get.py)
fi

LIBS="$WORK/libraries"
mkdir -p "$LIBS"
for repo in m5stack/M5GFX m5stack/M5Unified bblanchon/ArduinoJson; do
  name="${repo#*/}"
  [ -d "$LIBS/$name" ] || git clone -q --depth 1 "https://github.com/$repo" "$LIBS/$name"
done

# Arduino runs ctags on the .ino to generate prototypes. Ours holds only a comment, so a
# stand-in that prints nothing is equivalent (the real one comes from downloads.arduino.cc).
mkdir -p "$WORK/fakectags"
printf '#!/bin/sh\nexit 0\n' > "$WORK/fakectags/ctags"
chmod +x "$WORK/fakectags/ctags"

SKETCH="$WORK/sketch/SoccerTrainer"
rm -rf "$SKETCH" && mkdir -p "$SKETCH"
cp -r "$FW/src" "$SKETCH/src"
echo "// Arduino build entry: setup() and loop() live in src/main.cpp" > "$SKETCH/SoccerTrainer.ino"

export ARDUINO_DIRECTORIES_DATA="$WORK/data" ARDUINO_DIRECTORIES_DOWNLOADS="$WORK/staging" ARDUINO_DIRECTORIES_USER="$WORK/user"
OUT="$WORK/out"
rm -rf "$OUT"
# arduino-cli prints "Error initializing instance" lines about its own package index and
# board discovery (from downloads.arduino.cc); they don't affect compiling.
./arduino-cli compile \
  --fqbn espressif:esp32:m5stack-cores3:PartitionScheme=default_16MB,CDCOnBoot=cdc \
  --libraries "$LIBS" --build-path "$WORK/build" --output-dir "$OUT" \
  --build-property "compiler.cpp.extra_flags=-std=gnu++17 -DCORE_DEBUG_LEVEL=1" \
  --build-property "tools.ctags.path=$WORK/fakectags" \
  "$SKETCH"

DEST="$REPO/public/flasher"
mkdir -p "$DEST"
cp "$OUT/SoccerTrainer.ino.bootloader.bin" "$DEST/bootloader.bin"
cp "$OUT/SoccerTrainer.ino.partitions.bin" "$DEST/partitions.bin"
cp "$CORE/tools/partitions/boot_app0.bin" "$DEST/boot_app0.bin"
cp "$OUT/SoccerTrainer.ino.bin" "$DEST/firmware.bin"
python3 - "$DEST/manifest.json" <<'PY'
import json, sys, datetime
path = sys.argv[1]
m = json.load(open(path))
m["version"] = datetime.date.today().isoformat()
json.dump(m, open(path, "w"), indent=2)
open(path, "a").write("\n")
PY
echo "Installer images updated in $DEST. Commit them and deploy the game to publish /flasher/."
