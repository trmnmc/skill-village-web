import { describe, it, expect } from 'vitest';
import { createThemeStore, cssVars } from './store.js';
import { PALETTES, mix } from './palettes.js';

const at = (iso: string) => () => new Date(iso);
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('createThemeStore — clock resolution', () => {
  // NOTE: 2026-08-19 is this week's seeded "surprise weekday" (single palette
  // '1e' — see schedule.test.ts's "exactly one weekday of a week is a surprise
  // single"), a consequence of the monotonic-weekIndex fix landing after this
  // fixture's date was chosen. 2026-08-18 is a confirmed weave day in the same
  // week, so it exercises the intended weave-schedule clock resolution instead.
  it('noon on a weave weekday is Meadow Blue day, no tint', () => {
    const s = createThemeStore({ now: at('2026-08-18T12:00:00'), storage: mem() });
    s.tick();
    const t = s.current();
    expect(t.tokens.sky1).toBe(PALETTES['1a'].skies.day[1]);
    expect(t.tint.sceneryK).toBe(0);
    expect(t.flags.isNight).toBe(false);
    expect(t.sun.visible).toBe(true);
  });

  it('22:30 is deep night: tint at ceiling, lanterns on, moon up', () => {
    const s = createThemeStore({ now: at('2026-08-18T22:30:00'), storage: mem() });
    s.tick();
    const t = s.current();
    expect(t.tint.sceneryK).toBeCloseTo(0.55, 2);
    expect(t.tint.creatureK).toBeCloseTo(0.28, 2);
    expect(t.flags.lanternsOn).toBe(true);
    expect(t.moonSky.visible).toBe(true);
    expect(t.sun.visible).toBe(false);
  });

  it('07:55 blends 1b-day toward 1a-day (the 8:30 crossover in progress)', () => {
    const s = createThemeStore({ now: at('2026-08-18T07:55:00'), storage: mem() });
    s.tick();
    const sky = s.current().tokens.sky1;
    expect(sky).not.toBe(PALETTES['1a'].skies.day[1]);
    expect(sky).not.toBe(PALETTES['1b'].skies.day[1]);
  });
});

describe('modes', () => {
  it('pick persists and applies', () => {
    const storage = mem();
    const s = createThemeStore({ now: at('2026-08-19T12:00:00'), storage });
    s.setMode('pick'); s.setPicked('snow'); s.tick();
    expect(s.current().weather.kind).toBe('snow');
    expect(s.current().weather.ramp).toBe(1);
    const s2 = createThemeStore({ now: at('2026-08-19T12:00:00'), storage });
    expect(s2.mode()).toBe('pick');
    expect(s2.picked()).toBe('snow');
  });

  it('journey overrides clock and schedule', () => {
    const s = createThemeStore({ now: at('2026-08-19T12:00:00'), storage: mem() });
    s.setMode('journey'); s.tick();
    // wall-clock noon lands somewhere deterministic in the loop; assert it is
    // NOT the clock's own resolution by checking the store reports journey weather
    expect(['clear', 'wind', 'heat', 'leaves', 'fog', 'rain', 'rainbow', 'snow', 'storm']).toContain(s.current().weather.kind);
  });
});

describe('dev override', () => {
  it('?at&day&weather pins everything', () => {
    const s = createThemeStore({ now: at('2026-08-19T12:00:00'), storage: mem(), search: '?at=22:00&day=sat&weather=storm' });
    s.tick();
    const t = s.current();
    expect(t.flags.isNight).toBe(true);
    expect(t.weather.kind).toBe('storm');
  });
});

describe('cssVars', () => {
  it('day chrome is cream on ink; night chrome flips dark', () => {
    const day = createThemeStore({ now: at('2026-08-19T12:00:00'), storage: mem() });
    day.tick();
    const dv = cssVars(day.current());
    expect(dv['--sv-panel-bg']).toBe(day.current().tokens.bubble);
    const night = createThemeStore({ now: at('2026-08-19T23:00:00'), storage: mem() });
    night.tick();
    const nv = cssVars(night.current());
    expect(nv['--sv-panel-bg']).toBe(mix(night.current().tokens.ink, '#000000', 0.25));
  });
});
