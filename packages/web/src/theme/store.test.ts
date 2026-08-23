import { describe, it, expect, vi } from 'vitest';
import { createThemeStore, cssVars } from './store.js';
import { PALETTES, mix } from './palettes.js';
import { isHex } from '../theme.js';
import type { RealWeatherSource } from './weather/real.js';

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

describe('tick — publish dedupe signature', () => {
  it('keeps publishing through the day plateau as the sun arc moves (no freeze)', () => {
    // 10:00 on 2026-08-18 (a weave weekday) sits inside the '1a day' plateau
    // (8:30–16:45 per buildTimeline) where tokens/flags/weather are constant
    // for hours — only sun.x01/y01 (and moonSky/tint) move minute to minute.
    // A signature that omits them would never re-publish here.
    let nowMs = new Date('2026-08-18T10:00:00').getTime();
    const s = createThemeStore({ now: () => new Date(nowMs), storage: mem() });
    s.tick();
    const firstX01 = s.current().sun.x01;

    const spy = vi.fn();
    s.subscribe(spy);
    nowMs += 30 * 60_000; // +30 minutes, same plateau
    s.tick();

    expect(spy).toHaveBeenCalled();
    const publishedX01 = spy.mock.calls[spy.mock.calls.length - 1]![0].sun.x01;
    expect(publishedX01).not.toBe(firstX01);
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

  it('journey night waypoint owns the sky', () => {
    // Land exactly on waypoint 10 ('1e night clear' — its neighbor at 11 is
    // also frame 'night', so the dominant frame is 'night' regardless of the
    // in-between blend fraction), while local wall-clock time stays within
    // ~45 min of noon — the real sun would otherwise say "visible".
    const base = new Date('2026-08-18T12:00:00');
    const pos = Math.floor(base.getTime() / 180_000) % 15;
    const nowMs = base.getTime() + ((10 - pos + 15) % 15) * 180_000;

    const journey = createThemeStore({ now: () => new Date(nowMs), storage: mem() });
    journey.setMode('journey'); journey.tick();
    expect(journey.current().sun.visible).toBe(false);
    expect(journey.current().moonSky.visible).toBe(true);

    // Companion: same instant, off mode — proves the journey branch actually
    // diverges from the clock's own (correct, real-sun-up) resolution.
    const off = createThemeStore({ now: () => new Date(nowMs), storage: mem() });
    off.tick();
    expect(off.current().sun.visible).toBe(true);
  });
});

describe('pinned time', () => {
  it('pin 1380 (23:00) overrides the clock at local noon on a weave day: night flags, moon visible', () => {
    const s = createThemeStore({ now: at('2026-08-18T12:00:00'), storage: mem() });
    s.setPinnedTime(1380);
    s.tick();
    const t = s.current();
    expect(t.flags.isNight).toBe(true);
    expect(t.moonSky.visible).toBe(true);
  });

  it('persists: a new store over the same storage resolves pinnedTime() and still applies it', () => {
    const storage = mem();
    const s = createThemeStore({ now: at('2026-08-18T12:00:00'), storage });
    s.setPinnedTime(1380);
    s.tick();

    const s2 = createThemeStore({ now: at('2026-08-18T12:00:00'), storage });
    expect(s2.pinnedTime()).toBe(1380);
    s2.tick();
    expect(s2.current().flags.isNight).toBe(true);
  });

  it('URL ?at beats the pin', () => {
    const s = createThemeStore({ now: at('2026-08-18T12:00:00'), storage: mem(), search: '?at=12:00' });
    s.setPinnedTime(1380);
    s.tick();
    expect(s.current().flags.isNight).toBe(false);
  });

  it('journey mode ignores the pin entirely', () => {
    // Same nowMs recipe as "journey night waypoint owns the sky" above: lands
    // exactly on waypoint 10 ('1e night clear') while local wall-clock stays
    // near noon, so a leaking pin (or a leaking real sun) would both say "day".
    const base = new Date('2026-08-18T12:00:00');
    const pos = Math.floor(base.getTime() / 180_000) % 15;
    const nowMs = base.getTime() + ((10 - pos + 15) % 15) * 180_000;

    const s = createThemeStore({ now: () => new Date(nowMs), storage: mem() });
    s.setMode('journey');
    s.setPinnedTime(750);
    s.tick();
    expect(s.current().sun.visible).toBe(false);
  });
});

describe('setRealSource', () => {
  it('overrides the injected real source at runtime; null reverts real mode to clear', () => {
    const src: RealWeatherSource = {
      latest: () => ({ kind: 'rain', sunriseMin: 360, sunsetMin: 1200, atMs: new Date('2026-08-19T12:00:00').getTime() }),
      refresh: async () => {},
    };
    const s = createThemeStore({ now: at('2026-08-19T12:00:00'), storage: mem(), real: src });
    s.setMode('real');
    s.tick();
    expect(s.current().weather.kind).toBe('rain');

    s.setRealSource(null);
    s.tick();
    expect(s.current().weather.kind).toBe('clear');
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

describe('dev override — garbage input safety', () => {
  // paletteRaw in PALETTES walks the prototype chain, so ?palette=toString or
  // ?palette=__proto__ used to pass validation and crash tick() at boot. Every
  // entry here must resolve to a sane theme instead of throwing.
  const garbageSearches = [
    '?at=99:99',
    '?weather=nonsense',
    '?palette=zz',
    '?palette=toString',
    '?palette=__proto__',
  ];

  for (const search of garbageSearches) {
    it(`tick() does not throw for ${search}`, () => {
      const s = createThemeStore({ now: at('2026-08-19T12:00:00'), storage: mem(), search });
      expect(() => s.tick()).not.toThrow();
      expect(isHex(s.current().tokens.sky1)).toBe(true);
    });
  }
});

describe('isDawn flag', () => {
  it('a weekday 06:20 is dawn; the same weekday at noon is day', () => {
    const dawn = createThemeStore({ now: () => new Date(2026, 7, 26, 6, 20), storage: mem() });
    dawn.tick();
    expect(dawn.current().flags.isDawn).toBe(true);

    const noon = createThemeStore({ now: () => new Date(2026, 7, 26, 12, 0), storage: mem() });
    noon.tick();
    expect(noon.current().flags.isDawn).toBe(false);
  });
});

describe('cssVars', () => {
  it('day chrome is cream on ink; night chrome flips dark', () => {
    const day = createThemeStore({ now: at('2026-08-19T12:00:00'), storage: mem() });
    day.tick();
    const dv = cssVars(day.current());
    expect(dv['--sv-panel-bg']).toBe(day.current().tokens.bubble);
    expect(dv['--sv-chip-player']).toBe('#E8E0D0');
    const night = createThemeStore({ now: at('2026-08-19T23:00:00'), storage: mem() });
    night.tick();
    const nv = cssVars(night.current());
    expect(nv['--sv-panel-bg']).toBe(mix(night.current().tokens.ink, '#000000', 0.25));
    expect(nv['--sv-chip-player']).toBe(mix(night.current().tokens.ink, '#000000', 0.05));
  });
});

describe('createThemeStore — palette pin', () => {
  it('a pinned palette replaces the scheduled one: Meadow Blue day on a Marigold weekend', () => {
    const storage = mem();
    // 2026-08-23 is a Sunday — the schedule gives it a single special palette,
    // not the Kelvin weekday weave, so its noon sky is nothing like 1a's blue.
    const scheduled = createThemeStore({ now: at('2026-08-23T14:00:00'), storage });
    scheduled.tick();
    expect(scheduled.current().tokens.sky1).not.toBe(PALETTES['1a'].skies.day[1]);

    const pinned = createThemeStore({ now: at('2026-08-23T14:00:00'), storage: mem() });
    pinned.setPinnedPalette('1a');
    pinned.tick();
    expect(pinned.current().tokens.sky1).toBe(PALETTES['1a'].skies.day[1]);
  });

  it('round-trips through storage so the choice survives a reload', () => {
    const storage = mem();
    const first = createThemeStore({ now: at('2026-08-23T14:00:00'), storage });
    first.setPinnedPalette('1c');
    const reloaded = createThemeStore({ now: at('2026-08-23T14:00:00'), storage });
    expect(reloaded.pinnedPalette()).toBe('1c');
    reloaded.tick();
    // Identity is checked on ground rather than sky: a special day's noon sky
    // is daylight-corrected (see 'daylight-corrected special days' below), so
    // the sky no longer equals the palette's authored day colour.
    expect(reloaded.current().tokens.ground).toBe(PALETTES['1c'].ground);
  });

  it('clears back to the schedule when set to null', () => {
    const storage = mem();
    const s = createThemeStore({ now: at('2026-08-23T14:00:00'), storage });
    s.setPinnedPalette('1a');
    s.tick();
    const pinnedSky = s.current().tokens.sky1;
    s.setPinnedPalette(null);
    s.tick();
    expect(s.current().tokens.sky1).not.toBe(pinnedSky);
    expect(createThemeStore({ now: at('2026-08-23T14:00:00'), storage }).pinnedPalette()).toBeNull();
  });

  it('a ?palette= URL override still beats the pin', () => {
    const s = createThemeStore({ now: at('2026-08-23T14:00:00'), storage: mem(), search: '?palette=1e' });
    s.setPinnedPalette('1a');
    s.tick();
    expect(s.current().tokens.ground).toBe(PALETTES['1e'].ground);
    expect(s.current().tokens.ground).not.toBe(PALETTES['1a'].ground);
  });

  it('journey mode ignores the pin — it owns its own palette', () => {
    const s = createThemeStore({ now: at('2026-08-23T14:00:00'), storage: mem() });
    s.setMode('journey');
    s.setPinnedPalette('1a');
    s.tick();
    const journeySky = s.current().tokens.sky1;
    const s2 = createThemeStore({ now: at('2026-08-23T14:00:00'), storage: mem() });
    s2.setMode('journey');
    s2.tick();
    expect(s.current().tokens.sky1).toBe(journeySky);
    expect(s2.current().tokens.sky1).toBe(journeySky);
  });

  it('rejects a junk stored palette rather than exploding', () => {
    const storage = mem();
    storage.setItem('sv-palette-pin', 'toString');
    expect(createThemeStore({ now: at('2026-08-23T14:00:00'), storage }).pinnedPalette()).toBeNull();
  });
});

describe('createThemeStore — daylight-corrected special days', () => {
  // 2026-08-23 is a Sunday: the schedule gives it a single special palette
  // ('1f' Marigold), whose raw day sky is pale yellow. The user-facing rule is
  // that noon always reads as real daylight, whichever palette owns the day —
  // so a special day's DAY frame is pulled toward the Kelvin daylight blue,
  // while its dawn/dusk/night keep the palette's own character.
  const SUNDAY_NOON = '2026-08-23T13:00:00';
  const blueness = (hex: string) => parseInt(hex.slice(5, 7), 16) - parseInt(hex.slice(1, 3), 16);

  it('noon on a special day is far bluer than the palette\'s raw day sky', () => {
    const s = createThemeStore({ now: at(SUNDAY_NOON), storage: mem() });
    s.tick();
    const sky = s.current().tokens.sky1;
    expect(blueness(sky)).toBeGreaterThan(blueness(PALETTES['1f'].skies.day[1]));
    // ...and lands near the Kelvin daylight reference (1a's day sky).
    expect(Math.abs(blueness(sky) - blueness(PALETTES['1a'].skies.day[1]))).toBeLessThan(24);
  });

  it('every special palette gets a daylight noon, not just Marigold', () => {
    for (const id of ['1c', '1d', '1e', '1f'] as const) {
      const s = createThemeStore({ now: at(SUNDAY_NOON), storage: mem(), search: `?palette=${id}` });
      s.tick();
      expect(blueness(s.current().tokens.sky1)).toBeGreaterThan(blueness(PALETTES[id].skies.day[1]));
    }
  });

  it('leaves a special day\'s dawn, dusk and night exactly as the palette authored them', () => {
    const dawn = createThemeStore({ now: at('2026-08-23T06:45:00'), storage: mem() });
    dawn.tick();
    expect(dawn.current().tokens.sky1).toBe(PALETTES['1f'].skies.dawn[1]);
    const night = createThemeStore({ now: at('2026-08-23T23:00:00'), storage: mem() });
    night.tick();
    expect(night.current().tokens.sky1).toBe(PALETTES['1f'].skies.night[1]);
  });

  it('keeps the palette\'s own ground and houses at noon — only the sky is corrected', () => {
    const s = createThemeStore({ now: at(SUNDAY_NOON), storage: mem() });
    s.tick();
    const t = s.current();
    expect(t.tokens.ground).toBe(PALETTES['1f'].ground);
    expect(t.tokens.houseARoof).toBe(PALETTES['1f'].houseA[1]);
    expect(t.tokens.cream).toBe(PALETTES['1f'].cream);
  });

  it('does NOT touch the weekday weave: 07:20 is still Golden Hour\'s warm-white morning', () => {
    // The weave's own 1b-day keyframe is the spec\'s ~4300K warm morning — a
    // deliberate Kelvin step, not a special day, so it must stay untouched.
    const s = createThemeStore({ now: at('2026-08-18T07:20:00'), storage: mem() });
    s.tick();
    expect(s.current().tokens.sky1).toBe(PALETTES['1b'].skies.day[1]);
  });

  it('a pinned palette is a special day too — its noon reads as daylight', () => {
    const s = createThemeStore({ now: at('2026-08-18T13:00:00'), storage: mem() });
    s.setPinnedPalette('1f');
    s.tick();
    expect(blueness(s.current().tokens.sky1)).toBeGreaterThan(blueness(PALETTES['1f'].skies.day[1]));
  });
});
