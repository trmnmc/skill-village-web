// packages/web/src/theme/weather/real.test.ts
import { describe, it, expect } from 'vitest';
import { weatherFromWmo, parseOpenMeteo, readingFresh, createRealWeatherSource } from './real.js';

const FIXTURE = {
  current: { weather_code: 61, temperature_2m: 14.2, wind_speed_10m: 9.1 },
  daily: { sunrise: ['2026-08-23T06:31'], sunset: ['2026-08-23T19:52'] },
};

describe('weatherFromWmo', () => {
  it('maps the spec table', () => {
    expect(weatherFromWmo(0, 20, 5)).toBe('clear');
    expect(weatherFromWmo(0, 31, 5)).toBe('heat');
    expect(weatherFromWmo(3, 20, 5)).toBe('cloudy');
    expect(weatherFromWmo(45, 10, 5)).toBe('fog');
    expect(weatherFromWmo(61, 10, 5)).toBe('rain');
    expect(weatherFromWmo(75, -2, 5)).toBe('snow');
    expect(weatherFromWmo(96, 18, 5)).toBe('storm');
    expect(weatherFromWmo(1, 20, 35)).toBe('wind');
  });
});

describe('parseOpenMeteo', () => {
  it('extracts kind and solar anchors in local minutes', () => {
    const r = parseOpenMeteo(FIXTURE)!;
    expect(r.kind).toBe('rain');
    expect(r.sunriseMin).toBe(6 * 60 + 31);
    expect(r.sunsetMin).toBe(19 * 60 + 52);
  });
  it('returns null on garbage', () => {
    expect(parseOpenMeteo({})).toBeNull();
    expect(parseOpenMeteo(null)).toBeNull();
  });
});

describe('staleness ladder', () => {
  it('a reading is fresh for 2 hours', () => {
    const r = { ...parseOpenMeteo(FIXTURE)!, atMs: 1_000_000 };
    expect(readingFresh(r, 1_000_000 + 119 * 60_000)).toBe(true);
    expect(readingFresh(r, 1_000_000 + 121 * 60_000)).toBe(false);
  });
});

describe('createRealWeatherSource', () => {
  it('fetches through its deps and caches the reading', async () => {
    let calls = 0;
    const src = createRealWeatherSource({
      fetchJson: async () => { calls++; return FIXTURE; },
      getPosition: async () => ({ lat: 40, lon: -75 }),
      now: () => 5_000,
    });
    expect(src.latest()).toBeNull();
    await src.refresh();
    expect(calls).toBe(1);
    expect(src.latest()!.kind).toBe('rain');
    expect(src.latest()!.atMs).toBe(5_000);
  });
  it('a failed refresh keeps the previous reading', async () => {
    let fail = false;
    const src = createRealWeatherSource({
      fetchJson: async () => { if (fail) throw new Error('offline'); return FIXTURE; },
      getPosition: async () => ({ lat: 40, lon: -75 }),
      now: () => 5_000,
    });
    await src.refresh();
    fail = true;
    await src.refresh(); // must not throw
    expect(src.latest()!.kind).toBe('rain');
  });
});
