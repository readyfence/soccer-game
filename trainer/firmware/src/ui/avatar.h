// The player drawn from simple shapes: skin tone, hair style and colour, kit and number.
#pragma once

#include "../core/model.h"
#include "theme.h"

namespace ui {

// (cx, top) = centre of the head's top edge; s = scale (1.0 is about 64 x 132 px).
// `bob` lifts the body slightly for a little idle/celebration animation.
void drawAvatar(Canvas& c, int cx, int top, float s, const tr::PlayerCard& p, float bob = 0, bool armsUp = false);

uint32_t skinColour(uint8_t tone);
uint32_t hairColour(uint8_t hc);

}  // namespace ui
