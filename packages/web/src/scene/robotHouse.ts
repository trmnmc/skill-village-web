import type { KAPLAYCtx } from 'kaplay';
import { TEXT_SS } from '../theme.js';
import { themeStore } from '../theme/index.js';
import type { Tokens } from '../theme/store.js';
import { tokenTag, sceneryColor } from './retint.js';
import { ROBOT_HOUSE_X, ROBOT_HOUSE_Y } from '../layout/robot.js';
import type { CreatureFonts } from './creature.js';

/** 'dark': robot silent a long while. 'lit': a resident is home. 'talking': words are flowing. */
export type RobotPresence = 'dark' | 'lit' | 'talking';

export interface RobotHouse {
  setPresence(presence: RobotPresence): void;
  setResidentLabel(label: string | null): void;
}

/**
 * The robot-house (spec §4): visually the physical M5StackChan as a
 * building — a squat body with a screen for a face — distinct from the decor
 * houses. Flat rectangles only, like every prop (spec §4.1 of the village
 * design). Presence is three pre-built screen fills toggled by `hidden`,
 * because KAPLAY colour mutation is a documented trap in this repo.
 *
 * Every block carries its `tokenTag`, so the scene's per-token retint pass
 * owns its colour and the house darkens with the rest of the village at dusk.
 * `hidden` is untouched by that pass, so presence survives a retint.
 */
export function createRobotHouse(k: KAPLAYCtx, fonts: CreatureFonts): RobotHouse {
  const hex = (v: string) => k.Color.fromHex(v);
  const x = ROBOT_HOUSE_X;
  const y = ROBOT_HOUSE_Y;
  const block = (bx: number, by: number, w: number, h: number, token: keyof Tokens, z: number) => {
    const { tokens, tint } = themeStore.current();
    return k.add([
      k.rect(w, h),
      k.pos(bx, by),
      k.color(hex(sceneryColor(tokens, tint, token))),
      k.z(z),
      tokenTag(token),
    ]);
  };

  // Body: a squat white-cream shell, wider than tall, like the robot itself.
  block(x, y - 78, 98, 78, 'cream', 1);
  // Antenna nub.
  block(x + 42, y - 92, 14, 14, 'ink', 1);
  // Feet pads.
  block(x + 8, y, 26, 8, 'ink', 1);
  block(x + 64, y, 26, 8, 'ink', 1);
  // The face-screen bezel.
  block(x + 12, y - 66, 74, 44, 'ink', 2);

  // Three screen fills, one per presence, toggled by `hidden`.
  const screen = (token: keyof Tokens) => block(x + 16, y - 62, 66, 36, token, 3);
  const dark = screen('wood');
  const lit = screen('sky1');
  const talking = screen('accent');

  // Two eyes so the screen reads as a face whenever it is lit at all.
  const eye = (ex: number) => block(ex, y - 52, 8, 12, 'ink', 4);
  const eyes = [eye(x + 32), eye(x + 58)];

  // The resident's name on a sign under the house, same build as zone signs.
  block(x + 20, y + 10, 58, 18, 'cream', 3);
  const { tokens, tint } = themeStore.current();
  const label = k.add([
    k.text('', { size: 12 * TEXT_SS, font: fonts.mono }),
    k.scale(1 / TEXT_SS),
    k.pos(x + 49, y + 19),
    k.anchor('center'),
    k.color(hex(sceneryColor(tokens, tint, 'ink'))),
    k.z(4),
    tokenTag('ink'),
  ]);

  const apply = (presence: RobotPresence) => {
    dark.hidden = presence !== 'dark';
    lit.hidden = presence !== 'lit';
    talking.hidden = presence !== 'talking';
    for (const e of eyes) e.hidden = presence === 'dark';
  };
  apply('dark');

  return {
    setPresence: apply,
    setResidentLabel(text) {
      label.text = text ?? 'for rent';
    },
  };
}
