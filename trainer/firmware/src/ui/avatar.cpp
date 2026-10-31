#include "avatar.h"

#include <math.h>
#include <stdio.h>

namespace ui {

static const uint32_t SKIN[7] = {0xf7d9c8, 0xf0c8ae, 0xdcab88, 0xbd8662, 0x8e5b3c, 0x5c3822, 0x3b2214};
static const uint32_t HAIR[tr::HC_COUNT] = {0x0d0a08, 0x22160e, 0x462c1a, 0x7a5634, 0xc8a062, 0x8f4320, 0x9a948c};

uint32_t skinColour(uint8_t tone) { return SKIN[tone < 7 ? tone : 2]; }
uint32_t hairColour(uint8_t hc) { return HAIR[hc < tr::HC_COUNT ? hc : 1]; }

static void limb(Canvas& c, float x0, float y0, float x1, float y1, float r, uint32_t col) {
  c.drawWideLine((int)x0, (int)y0, (int)x1, (int)y1, r, col);
}

static void drawHairBack(Canvas& c, int cx, int hy, float s, const tr::PlayerCard& p, uint32_t hair) {
  int hr = (int)(16 * s);
  switch (p.look.hair) {
    case tr::HAIR_AFRO:
      c.fillCircle(cx, hy - (int)(4 * s), (int)(23 * s), hair);
      break;
    case tr::HAIR_LONG:
      c.fillRoundRect(cx - hr - (int)(2 * s), hy - (int)(4 * s), 2 * hr + (int)(4 * s), (int)(30 * s), (int)(6 * s), hair);
      break;
    case tr::HAIR_DREADS:
      for (int i = -3; i <= 3; i++) {
        int x = cx + (int)(i * 5.5f * s);
        c.fillRoundRect(x - (int)(2 * s), hy - (int)(6 * s), (int)(5 * s), (int)(30 * s) - (i < 0 ? -i : i) * (int)(2 * s),
                        (int)(2 * s), hair);
      }
      break;
    default:
      break;
  }
}

static void drawHairFront(Canvas& c, int cx, int hy, float s, const tr::PlayerCard& p, uint32_t hair, uint32_t skin) {
  int r = (int)(17 * s);
  switch (p.look.hair) {
    case tr::HAIR_BALD:
      c.fillCircle(cx - (int)(6 * s), hy - (int)(9 * s), (int)(3 * s), mix(skin, WHITE, 0.45f));
      break;
    case tr::HAIR_BUZZ:
      c.fillArc(cx, hy, 0, r, 200, 340, mix(hair, skin, 0.35f));
      break;
    case tr::HAIR_CURLY:
      for (int a = 0; a < 7; a++) {
        float ang = 3.3f + a * 0.47f;
        c.fillCircle(cx + (int)(cosf(ang) * 13 * s), hy + (int)(sinf(ang) * 13 * s), (int)(6 * s), hair);
      }
      break;
    case tr::HAIR_SLICK:
      c.fillArc(cx, hy, 0, r, 185, 355, hair);
      c.fillTriangle(cx - (int)(4 * s), hy - (int)(17 * s), cx + (int)(19 * s), hy - (int)(12 * s), cx + (int)(17 * s),
                     hy - (int)(3 * s), hair);
      break;
    case tr::HAIR_AFRO:
      c.fillArc(cx, hy, 0, r, 190, 350, hair);
      break;
    case tr::HAIR_DREADS:
    case tr::HAIR_LONG:
    case tr::HAIR_CROP:
    default:
      c.fillArc(cx, hy, 0, r, 190, 350, hair);
      break;
  }
}

void drawAvatar(Canvas& c, int cx, int top, float s, const tr::PlayerCard& p, float bob, bool armsUp) {
  uint32_t skin = skinColour(p.look.tone);
  uint32_t hair = hairColour(p.look.hairColour);
  uint32_t shirt = p.kitShirt;
  uint32_t shorts = p.kitShorts;
  uint32_t trim = darker(shirt, 0.3f);
  int t = top - (int)(bob * s);
  auto Y = [&](float v) { return t + (int)(v * s); };
  auto X = [&](float v) { return cx + (int)(v * s); };

  // Shadow
  c.fillEllipse(cx, top + (int)(133 * s), (int)(24 * s), (int)(4 * s), darker(PITCH, 0.4f));

  // Legs, socks, boots
  for (int side = -1; side <= 1; side += 2) {
    c.fillRect(X(side * 9 - 5), Y(100), (int)(10 * s), (int)(14 * s), skin);
    c.fillRect(X(side * 9 - 5.5f), Y(112), (int)(11 * s), (int)(15 * s), shirt);
    c.fillRect(X(side * 9 - 5.5f), Y(112), (int)(11 * s), (int)(3 * s), trim);
    c.fillRoundRect(X(side * 9 - 6 + side * 2), Y(126), (int)(14 * s), (int)(7 * s), (int)(3 * s), 0x111111u);
  }

  // Shorts
  c.fillRoundRect(X(-22), Y(80), (int)(44 * s), (int)(22 * s), (int)(4 * s), shorts);
  c.fillRect(X(-1), Y(90), (int)(2 * s) + 1, (int)(12 * s), darker(shorts, 0.35f));

  // Arms (sleeve then forearm), behind the torso edge
  for (int side = -1; side <= 1; side += 2) {
    float sx = side * 21, sy = 44;
    float ex = side * (armsUp ? 30 : 29), ey = armsUp ? 22 : 64;
    float hx = side * (armsUp ? 32 : 30), hy2 = armsUp ? 2 : 82;
    limb(c, X(sx), Y(sy), X(ex), Y(ey), 6 * s, shirt);
    limb(c, X(ex), Y(ey), X(hx), Y(hy2), 4.5f * s, skin);
    c.fillCircle(X(hx), Y(hy2), (int)(5 * s), skin);
  }

  // Torso
  c.fillRoundRect(X(-22), Y(38), (int)(44 * s), (int)(46 * s), (int)(9 * s), shirt);
  c.fillRect(X(-22), Y(79), (int)(44 * s), (int)(4 * s), trim);
  // Collar
  c.fillTriangle(X(-7), Y(38), X(7), Y(38), X(0), Y(46), trim);
  c.fillTriangle(X(-5), Y(38), X(5), Y(38), X(0), Y(43), skin);
  // Number
  char num[4];
  snprintf(num, sizeof(num), "%u", (unsigned)p.num);
  c.setTextSize(s);
  text(c, num, cx, Y(62), MC, fTitle(), p.kitNumber);
  c.setTextSize(1);

  // Neck and head
  int hy = Y(19);
  c.fillRect(X(-5), Y(31), (int)(10 * s), (int)(9 * s), darker(skin, 0.12f));
  drawHairBack(c, cx, hy, s, p, hair);
  c.fillCircle(cx, hy, (int)(16 * s), skin);
  // Ears
  c.fillCircle(X(-16), hy + (int)(2 * s), (int)(4 * s), skin);
  c.fillCircle(X(16), hy + (int)(2 * s), (int)(4 * s), skin);
  // Beard
  if (p.look.beard) {
    uint32_t b = p.look.beard == 1 ? mix(hair, skin, 0.55f) : hair;
    c.fillArc(cx, hy, (int)(9 * s), (int)(16 * s), 15, 165, b);
  }
  drawHairFront(c, cx, hy, s, p, hair, skin);
  // Face
  uint32_t eye = 0x1a1210;
  c.fillCircle(X(-6), hy + (int)(1 * s), (int)(2.2f * s) + 1, eye);
  c.fillCircle(X(6), hy + (int)(1 * s), (int)(2.2f * s) + 1, eye);
  c.fillCircle(X(-5), hy, 1, WHITE);
  c.fillCircle(X(7), hy, 1, WHITE);
  c.fillArc(cx, hy + (int)(5 * s), (int)(5 * s), (int)(6.5f * s), 25, 155, darker(skin, 0.55f));
}

}  // namespace ui
