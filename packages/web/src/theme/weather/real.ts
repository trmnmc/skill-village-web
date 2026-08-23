import type { WeatherKind } from './kinds.js';

export interface RealReading {
  kind: WeatherKind;
  sunriseMin: number;
  sunsetMin: number;
  atMs: number;
}

export interface RealWeatherSource {
  latest(): RealReading | null;
  refresh(): Promise<void>;
}

const FRESH_WINDOW_MS = 2 * 60 * 60 * 1000;

/** WMO weather-code table (spec §6), with heat and wind overrides. */
export function weatherFromWmo(code: number, tempC: number, windKmh: number): WeatherKind {
  let kind: WeatherKind;
  if (code === 0 || code === 1) {
    kind = tempC >= 30 ? 'heat' : 'clear';
  } else if (code === 2 || code === 3) {
    kind = 'cloudy';
  } else if (code === 45 || code === 48) {
    kind = 'fog';
  } else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    kind = 'rain';
  } else if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    kind = 'snow';
  } else if (code >= 95 && code <= 99) {
    kind = 'storm';
  } else {
    kind = 'clear';
  }

  if (windKmh >= 29 && (kind === 'clear' || kind === 'cloudy')) {
    return 'wind';
  }
  return kind;
}

export function openMeteoUrl(lat: number, lon: number): string {
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,temperature_2m,wind_speed_10m&daily=sunrise,sunset&timezone=auto`;
}

function minutesOfDay(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

export function parseOpenMeteo(json: unknown): RealReading | null {
  if (!json || typeof json !== 'object') return null;
  const obj = json as Record<string, unknown>;
  const current = obj.current;
  const daily = obj.daily;
  if (!current || typeof current !== 'object') return null;
  if (!daily || typeof daily !== 'object') return null;

  const c = current as Record<string, unknown>;
  const d = daily as Record<string, unknown>;

  const code = c.weather_code;
  const tempC = c.temperature_2m;
  const windKmh = c.wind_speed_10m;
  if (typeof code !== 'number' || typeof tempC !== 'number' || typeof windKmh !== 'number') {
    return null;
  }

  const sunrise = d.sunrise;
  const sunset = d.sunset;
  if (!Array.isArray(sunrise) || sunrise.length === 0) return null;
  if (!Array.isArray(sunset) || sunset.length === 0) return null;
  const sunriseIso = sunrise[0];
  const sunsetIso = sunset[0];
  if (typeof sunriseIso !== 'string' || typeof sunsetIso !== 'string') return null;

  const sunriseMin = minutesOfDay(sunriseIso);
  const sunsetMin = minutesOfDay(sunsetIso);
  if (sunriseMin === null || sunsetMin === null) return null;

  return {
    kind: weatherFromWmo(code, tempC, windKmh),
    sunriseMin,
    sunsetMin,
    atMs: 0,
  };
}

export function readingFresh(r: RealReading, nowMs: number): boolean {
  return nowMs - r.atMs < FRESH_WINDOW_MS;
}

export function createRealWeatherSource(deps: {
  fetchJson(url: string): Promise<unknown>;
  getPosition(): Promise<{ lat: number; lon: number }>;
  now(): number;
}): RealWeatherSource {
  let reading: RealReading | null = null;

  return {
    latest() {
      return reading;
    },
    async refresh() {
      try {
        const { lat, lon } = await deps.getPosition();
        const json = await deps.fetchJson(openMeteoUrl(lat, lon));
        const parsed = parseOpenMeteo(json);
        if (parsed) {
          reading = { ...parsed, atMs: deps.now() };
        }
      } catch {
        // Keep the previous reading; never throw.
      }
    },
  };
}
