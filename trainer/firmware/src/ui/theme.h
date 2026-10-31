// Colours, fonts and small drawing helpers shared by every screen.
#pragma once

#include <M5GFX.h>
#include <stdint.h>

namespace ui {

using Canvas = M5Canvas;

constexpr int W = 320;
constexpr int H = 240;

// Colours are RGB888 uint32_t so LovyanGFX treats them as 24-bit.
constexpr uint32_t BG = 0x0b1530;
constexpr uint32_t PANEL = 0x16244a;
constexpr uint32_t PANEL2 = 0x22356a;
constexpr uint32_t LINE = 0x33467a;
constexpr uint32_t TEXT = 0xffffff;
constexpr uint32_t MUTED = 0x9fb0d8;
constexpr uint32_t DIM = 0x5a6a94;
constexpr uint32_t ACCENT = 0xffd400;
constexpr uint32_t GREEN = 0x2bb673;
constexpr uint32_t RED = 0xe23b3b;
constexpr uint32_t BLUE = 0x2f7de1;
constexpr uint32_t ORANGE = 0xff8a1f;
constexpr uint32_t PURPLE = 0x8a5cf6;
constexpr uint32_t GREY = 0x55607e;
constexpr uint32_t PITCH = 0x1f8a43;
constexpr uint32_t PITCH2 = 0x1a7a3b;
constexpr uint32_t WHITE = 0xffffff;
constexpr uint32_t BLACK = 0x000000;

// Stat colours: PAC, SHO, PAS, DEF.
constexpr uint32_t STAT_COL[4] = {0x3b9eff, 0xff6b3d, 0x2bd4a0, 0xb77dff};

// Text datum values (LovyanGFX textdatum_t).
constexpr uint8_t TL = 0, TC = 1, TR = 2, ML = 4, MC = 5, MR = 6, BL = 8, BC = 9, BR = 10;

// Fonts (ASCII only).
inline const lgfx::IFont* fSmall() { return &fonts::FreeSans9pt7b; }
inline const lgfx::IFont* fBody() { return &fonts::FreeSansBold9pt7b; }
inline const lgfx::IFont* fTitle() { return &fonts::FreeSansBold12pt7b; }
inline const lgfx::IFont* fBig() { return &fonts::FreeSansBold18pt7b; }
inline const lgfx::IFont* fHuge() { return &fonts::FreeSansBold24pt7b; }
inline const lgfx::IFont* fTiny() { return &fonts::Font2; }

struct Rect {
  int16_t x, y, w, h;
  bool hit(int px, int py) const { return px >= x && px < x + w && py >= y && py < y + h; }
  int cx() const { return x + w / 2; }
  int cy() const { return y + h / 2; }
};

uint32_t mix(uint32_t a, uint32_t b, float t);  // blend a -> b
uint32_t darker(uint32_t c, float amount = 0.35f);
bool isLight(uint32_t c);

void text(Canvas& c, const char* s, int x, int y, uint8_t datum, const lgfx::IFont* font, uint32_t colour);
void textFit(Canvas& c, const char* s, int x, int y, int maxW, uint8_t datum, const lgfx::IFont* font, uint32_t colour);
void button(Canvas& c, const Rect& r, const char* label, uint32_t fill, bool enabled = true,
            const lgfx::IFont* font = nullptr);
void bar(Canvas& c, int x, int y, int w, int h, float frac, uint32_t fill, uint32_t back = PANEL2);
void pips(Canvas& c, int x, int y, int count, int filled, uint32_t on, int r = 4, int gap = 11);

// Top bar with a title and (optionally) a back arrow in the left 56 px.
constexpr Rect BACK = {0, 0, 60, 34};
void header(Canvas& c, const char* title, bool back = true, const char* right = nullptr);

void drawBall(Canvas& c, int x, int y, int r, float spin = 0);
void batteryIcon(Canvas& c, int x, int y, int pct, bool charging);

}  // namespace ui
