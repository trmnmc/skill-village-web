import { mix } from '../palettes.js';

export type WeatherKind = 'clear' | 'rain' | 'storm' | 'snow' | 'fog' | 'cloudy' | 'heat' | 'wind' | 'leaves' | 'rainbow';
export const ALL_WEATHERS: WeatherKind[] = ['clear', 'rain', 'storm', 'snow', 'fog', 'cloudy', 'heat', 'wind', 'leaves', 'rainbow'];

/** Sky-graying tone + strength, verbatim from the reference weather engine. */
export const GRAYS: Partial<Record<WeatherKind, [string, number]>> = {
  rain: ['#93A2AC', 0.50], storm: ['#59636C', 0.68], snow: ['#BFC9D2', 0.50],
  fog: ['#C6C3B6', 0.55], cloudy: ['#A8AFB4', 0.35], heat: ['#FFD98A', 0.18],
};

export const OVERCAST: ReadonlySet<WeatherKind> = new Set(['rain', 'storm', 'snow', 'fog', 'cloudy']);

export function graySkies(skies: [string, string, string], kind: WeatherKind, ramp: number, isNight: boolean): [string, string, string] {
  const gr = GRAYS[kind];
  if (!gr || ramp <= 0) return skies;
  const tone = isNight ? mix(gr[0], '#10141A', 0.5) : gr[0];
  const k = gr[1] * ramp;
  return [mix(skies[0], tone, k), mix(skies[1], tone, k), mix(skies[2], tone, k)];
}

export function weatherGround(ground: string, groundDark: string, kind: WeatherKind, ramp: number): { ground: string; groundDark: string } {
  if (ramp <= 0) return { ground, groundDark };
  if (kind === 'snow') return { ground: mix(ground, '#EBF1F2', ramp), groundDark: mix(groundDark, '#D5E0E3', ramp) };
  if (kind === 'rain') return { ground: mix(ground, '#5F7A70', 0.15 * ramp), groundDark: mix(groundDark, '#5F7A70', 0.15 * ramp) };
  if (kind === 'storm') return { ground: mix(ground, '#4E6660', 0.25 * ramp), groundDark: mix(groundDark, '#4E6660', 0.25 * ramp) };
  if (kind === 'fog') return { ground: mix(ground, '#B8B8A8', 0.25 * ramp), groundDark: mix(groundDark, '#B8B8A8', 0.25 * ramp) };
  return { ground, groundDark };
}
