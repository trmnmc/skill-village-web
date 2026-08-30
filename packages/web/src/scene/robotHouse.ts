import type { KAPLAYCtx } from 'kaplay';
import { TEXT_SS } from '../theme.js';
import { themeStore } from '../theme/index.js';
import type { Tokens } from '../theme/store.js';
import { tokenTag, sceneryColor } from './retint.js';
import { ROBOT_HOUSE_X, ROBOT_HOUSE_Y } from '../layout/robot.js';
import type { CreatureFonts } from './creature.js';
import { impactDone, impactFlash, impactRock, impactSquash, type CeremonyPreset } from './ceremony.js';

/** 'dark': robot silent a long while. 'lit': a resident is home. 'talking': words are flowing. */
export type RobotPresence = 'dark' | 'lit' | 'talking';

export interface RobotHouse {
  setPresence(presence: RobotPresence): void;
  setResidentLabel(label: string | null): void;
  /** Play the landing reaction: rock (both presets), squash + flash hold (b). */
  impact(preset: CeremonyPreset): void;
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
  // Every block hangs off one root pivoted at the footing's bottom-centre, so
  // the ceremony can rock and squash the whole house as a single body. The
  // retint walker reads `k.get(tag, { recursive: true })`, so tagged children
  // keep taking their colours from the sky exactly as they did when each block
  // was a top-level object.
  const PIVOT_X = x + 49;
  const PIVOT_Y = y + 8;
  const root = k.add([k.pos(PIVOT_X, PIVOT_Y), k.rotate(0), k.scale(1), k.z(1)]);

  const block = (bx: number, by: number, w: number, h: number, token: keyof Tokens, z: number) => {
    const { tokens, tint } = themeStore.current();
    return root.add([
      k.rect(w, h),
      k.pos(bx - PIVOT_X, by - PIVOT_Y),
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

  // The impact flash: deliberately not token-tagged — a flash that dimmed
  // with the dusk retint would vanish exactly when it matters.
  const flashFill = root.add([
    k.rect(66, 36),
    k.pos(x + 16 - PIVOT_X, y - 62 - PIVOT_Y),
    k.color(k.Color.fromHex('#fff8e6')),
    k.opacity(0),
    k.z(5),
  ]);

  // The resident's name on a sign under the house, same build as zone signs.
  block(x + 20, y + 10, 58, 18, 'cream', 3);
  const { tokens, tint } = themeStore.current();
  const label = root.add([
    k.text('', { size: 12 * TEXT_SS, font: fonts.mono }),
    k.scale(1 / TEXT_SS),
    k.pos(0, 11),
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

  // One impact at a time; a new drop mid-settle simply restarts the clock.
  let impactAt: number | null = null;
  let impactPreset: CeremonyPreset = 'a';
  k.onUpdate(() => {
    if (impactAt === null) return;
    const s = k.time() - impactAt;
    if (impactDone(s)) {
      impactAt = null;
      root.angle = 0;
      root.scale = k.vec2(1, 1);
      flashFill.opacity = 0;
      return;
    }
    root.angle = impactRock(s, impactPreset);
    const sq = impactSquash(s, impactPreset);
    root.scale = k.vec2(sq.sx, sq.sy);
    flashFill.opacity = impactFlash(s, impactPreset);
  });

  return {
    setPresence: apply,
    setResidentLabel(text) {
      label.text = text ?? 'for rent';
    },
    impact(preset) {
      impactAt = k.time();
      impactPreset = preset;
    },
  };
}
