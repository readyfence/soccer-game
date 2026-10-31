#include "theme.h"

#include <math.h>
#include <string.h>

namespace ui {

uint32_t mix(uint32_t a, uint32_t b, float t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  int ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  int br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  uint32_t r = (uint32_t)(ar + (br - ar) * t);
  uint32_t g = (uint32_t)(ag + (bg - ag) * t);
  uint32_t bl = (uint32_t)(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

uint32_t darker(uint32_t c, float amount) { return mix(c, BLACK, amount); }

bool isLight(uint32_t c) {
  int r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

void text(Canvas& c, const char* s, int x, int y, uint8_t datum, const lgfx::IFont* font, uint32_t colour) {
  c.setFont(font);
  c.setTextSize(1);
  c.setTextDatum(datum);
  c.setTextColor(colour);
  c.drawString(s, x, y);
}

void textFit(Canvas& c, const char* s, int x, int y, int maxW, uint8_t datum, const lgfx::IFont* font,
             uint32_t colour) {
  c.setFont(font);
  c.setTextSize(1);
  if (c.textWidth(s) <= maxW) {
    text(c, s, x, y, datum, font, colour);
    return;
  }
  // Shrink to a smaller font first, then cut with "..".
  const lgfx::IFont* smaller = font == fTitle() || font == fBig() || font == fHuge() ? fBody() : fSmall();
  c.setFont(smaller);
  char buf[48];
  strncpy(buf, s, sizeof(buf) - 1);
  buf[sizeof(buf) - 1] = 0;
  size_t n = strlen(buf);
  while (n > 1 && c.textWidth(buf) > maxW) {
    buf[--n] = 0;
    if (n > 2) {
      buf[n - 1] = '.';
      buf[n - 2] = '.';
    }
  }
  text(c, buf, x, y, datum, smaller, colour);
}

void button(Canvas& c, const Rect& r, const char* label, uint32_t fill, bool enabled, const lgfx::IFont* font) {
  uint32_t f = enabled ? fill : mix(fill, BG, 0.65f);
  c.fillRoundRect(r.x, r.y + 3, r.w, r.h - 3, 10, darker(f, 0.45f));
  c.fillRoundRect(r.x, r.y, r.w, r.h - 3, 10, f);
  uint32_t tc = enabled ? (isLight(f) ? BLACK : TEXT) : DIM;
  textFit(c, label, r.cx(), r.y + (r.h - 3) / 2, r.w - 8, D_MC, font ? font : fBody(), tc);
}

void bar(Canvas& c, int x, int y, int w, int h, float frac, uint32_t fill, uint32_t back) {
  if (frac < 0) frac = 0;
  if (frac > 1) frac = 1;
  int rr = h / 2;
  c.fillRoundRect(x, y, w, h, rr, back);
  int fw = (int)(w * frac);
  if (fw > 0) c.fillRoundRect(x, y, fw < h ? h : fw, h, rr, fill);
}

void pips(Canvas& c, int x, int y, int count, int filled, uint32_t on, int r, int gap) {
  for (int i = 0; i < count; i++) {
    int px = x + i * gap;
    if (i < filled) {
      c.fillCircle(px, y, r, on);
    } else {
      c.drawCircle(px, y, r, DIM);
    }
  }
}

void header(Canvas& c, const char* title, bool back, const char* right) {
  c.fillRect(0, 0, W, 34, PANEL);
  c.drawFastHLine(0, 34, W, LINE);
  if (back) {
    c.fillTriangle(14, 17, 28, 7, 28, 27, ACCENT);
    c.fillRect(26, 13, 18, 8, ACCENT);
  }
  text(c, title, back ? 56 : 12, 17, D_ML, fTitle(), TEXT);
  if (right) text(c, right, W - 10, 17, D_MR, fBody(), ACCENT);
}

void drawBall(Canvas& c, int x, int y, int r, float spin) {
  c.fillCircle(x, y, r, WHITE);
  c.drawCircle(x, y, r, 0x222222u);
  // A pentagon patch and three spokes, rotated by spin.
  int pr = r * 4 / 10;
  for (int i = 0; i < 5; i++) {
    float a0 = spin + i * 1.2566f;
    float a1 = spin + (i + 1) * 1.2566f;
    c.fillTriangle(x, y, x + (int)(cosf(a0) * pr), y + (int)(sinf(a0) * pr), x + (int)(cosf(a1) * pr),
                   y + (int)(sinf(a1) * pr), 0x222222u);
  }
  if (r >= 8) {
    for (int i = 0; i < 5; i++) {
      float a = spin + i * 1.2566f + 0.6283f;
      c.drawLine(x + (int)(cosf(a) * pr), y + (int)(sinf(a) * pr), x + (int)(cosf(a) * (r - 1)),
                 y + (int)(sinf(a) * (r - 1)), 0x444444u);
    }
  }
}

void batteryIcon(Canvas& c, int x, int y, int pct, bool charging) {
  // x,y = top-left of a 26x13 battery
  c.drawRoundRect(x, y, 24, 13, 3, MUTED);
  c.fillRect(x + 24, y + 4, 2, 5, MUTED);
  if (pct >= 0) {
    uint32_t col = pct > 40 ? GREEN : (pct > 15 ? ACCENT : RED);
    int w = (pct * 20 + 50) / 100;
    if (w > 0) c.fillRect(x + 2, y + 2, w, 9, col);
  }
  if (charging) {
    c.fillTriangle(x + 13, y + 1, x + 8, y + 7, x + 12, y + 7, ACCENT);
    c.fillTriangle(x + 11, y + 12, x + 16, y + 6, x + 12, y + 6, ACCENT);
  }
}

}  // namespace ui
