import { describe, it, expect } from 'vitest';
import type { KAPLAYCtx } from 'kaplay';
import {
  groundPreset,
  groundTexColor,
  groundTexTag,
  pathCentres,
  buildGroundTexture,
  retintGroundTexture,
  GROUND_RECIPES,
} from './ground.js';
import { mix } from '../theme/palettes.js';
import { weatherGround } from '../theme/weather/kinds.js';
import type { Tokens, ResolvedTheme } from '../theme/store.js';
import { GROUND_Y } from '../layout/zones.js';

const tokens: Tokens = {
  sky0: '#C4E4F4', sky1: '#CFE9F5', sky2: '#DFF0EC',
  ground: '#A8C68D', groundDark: '#8FB075',
  cream: '#F2E5C4', bubble: '#FFFDF4', ink: '#3A2E22', wood: '#8A6B4A', accent: '#D97757',
  foliage: '#7FA85F', foliageLite: '#8FB86B',
  houseAWall: '#F2E5C4', houseARoof: '#D97757', houseBWall: '#E8D3EE', houseBRoof: '#B39DDB',
};

const day = { col: '#232A3C', sceneryK: 0, creatureK: 0 };
const theme = (t: Tokens, tint = day) => ({ tokens: t, tint }) as unknown as ResolvedTheme;

describe('groundPreset', () => {
  it('defaults to b — the playtest pick — on a bare URL', () => {
    expect(groundPreset('')).toBe('b');
  });

  it('honours each explicit override, including off', () => {
    expect(groundPreset('?ground=a')).toBe('a');
    expect(groundPreset('?ground=c')).toBe('c');
    expect(groundPreset('?ground=off')).toBe('off');
  });

  it('falls back to the default on garbage rather than to a bare field', () => {
    expect(groundPreset('?ground=banana')).toBe('b');
  });
});

describe('groundTexColor', () => {
  it('derives from the tokens it is handed, so a weather-tinted ground carries the texture', () => {
    const snowed = weatherGround(tokens.ground, tokens.groundDark, 'snow', 1);
    const snowTokens = { ...tokens, ground: snowed.ground, groundDark: snowed.groundDark };
    for (const recipe of GROUND_RECIPES) {
      const clear = groundTexColor(recipe, theme(tokens));
      const snow = groundTexColor(recipe, theme(snowTokens));
      if (recipe === 'flower' || recipe === 'flowerAlt') {
        // Accent/cream recipes are deliberately weather-blind — blooms poke
        // through the snow instead of vanishing into it.
        expect(snow).toBe(clear);
      } else {
        expect(snow).not.toBe(clear);
      }
    }
  });

  it('pulls toward the frame tint exactly as sceneryColor pulls a token', () => {
    const dusk = { col: '#232A3C', sceneryK: 0.55, creatureK: 0.28 };
    const raw = groundTexColor('path', theme(tokens));
    expect(groundTexColor('path', theme(tokens, dusk))).toBe(mix(raw, dusk.col, dusk.sceneryK));
  });
});

describe('pathCentres', () => {
  it('is deterministic — a reload must not redraw the trail', () => {
    expect(pathCentres()).toEqual(pathCentres());
  });

  it('stays inside its corridor around GROUND_Y, wandering as it goes', () => {
    const segs = pathCentres();
    for (const s of segs) {
      expect(s.c).toBeGreaterThanOrEqual(GROUND_Y - 24);
      expect(s.c).toBeLessThanOrEqual(GROUND_Y + 24);
    }
    // A trail that never leaves the baseline is a ruler line, not a wander.
    expect(new Set(segs.map((s) => s.c)).size).toBeGreaterThan(3);
  });
});

/** The slice of KAPLAY the texture touches: add/get plus component ctors. */
function fakeK() {
  interface Obj {
    color: string;
    tags: string[];
  }
  const objs: Obj[] = [];
  const k = {
    add(comps: unknown[]) {
      const obj: Obj = { color: '', tags: [] };
      for (const c of comps) {
        if (typeof c === 'string') obj.tags.push(c);
        else if (c && typeof c === 'object' && '__color' in c) obj.color = (c as { __color: string }).__color;
      }
      objs.push(obj);
      return obj;
    },
    rect: () => ({}),
    pos: () => ({}),
    z: () => ({}),
    color: (c: unknown) => ({ __color: c }),
    Color: { fromHex: (h: string) => h },
    get: (tag: string) => objs.filter((o) => o.tags.includes(tag)),
  };
  return { k: k as unknown as KAPLAYCtx, objs };
}

describe('buildGroundTexture', () => {
  it('adds nothing for off', () => {
    const { k, objs } = fakeK();
    expect(buildGroundTexture(k, 'off', theme(tokens))).toBe(0);
    expect(objs).toHaveLength(0);
  });

  it('builds preset b and tags every rect with a recipe the retint pass knows', () => {
    const { k, objs } = fakeK();
    const n = buildGroundTexture(k, 'b', theme(tokens));
    expect(n).toBe(objs.length);
    expect(n).toBeGreaterThan(0);
    const known = new Set(GROUND_RECIPES.map(groundTexTag));
    for (const o of objs) {
      expect(o.tags.some((t) => known.has(t))).toBe(true);
    }
  });
});

describe('retintGroundTexture', () => {
  it('repaints every texture rect from a freshly resolved theme', () => {
    const { k, objs } = fakeK();
    buildGroundTexture(k, 'b', theme(tokens));
    const snowed = weatherGround(tokens.ground, tokens.groundDark, 'snow', 1);
    const snowTheme = theme({ ...tokens, ground: snowed.ground, groundDark: snowed.groundDark });
    retintGroundTexture(k, snowTheme);
    for (const o of objs) {
      const recipe = GROUND_RECIPES.find((r) => o.tags.includes(groundTexTag(r)))!;
      expect(o.color).toBe(groundTexColor(recipe, snowTheme));
    }
  });
});
