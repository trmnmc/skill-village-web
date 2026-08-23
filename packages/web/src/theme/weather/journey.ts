import type { Frame, PaletteId } from '../palettes.js';
import type { WeatherKind } from './kinds.js';

export interface Waypoint { palette: PaletteId; frame: Frame; weather: WeatherKind; label: string }

export const WAYPOINT_MS = 180_000; // ~3 minutes per stop, ~45 min loop

/** Spec §6: the cozy premade stroll. Adjacent stops share most of their axes. */
export const WAYPOINTS: Waypoint[] = [
  { palette: '1a', frame: 'day', weather: 'clear', label: 'summer blue' },
  { palette: '1a', frame: 'day', weather: 'wind', label: 'a breeze picks up' },
  { palette: '1f', frame: 'day', weather: 'heat', label: 'high-summer shimmer' },
  { palette: '1f', frame: 'dusk', weather: 'clear', label: 'golden evening' },
  { palette: '1e', frame: 'dusk', weather: 'leaves', label: 'autumn drifts in' },
  { palette: '1d', frame: 'day', weather: 'leaves', label: 'amber afternoon' },
  { palette: '1d', frame: 'dusk', weather: 'fog', label: 'misty evening' },
  { palette: '1c', frame: 'dawn', weather: 'fog', label: 'cool morning mist' },
  { palette: '1c', frame: 'day', weather: 'rain', label: 'spring rain' },
  { palette: '1e', frame: 'day', weather: 'rainbow', label: 'after the rain' },
  { palette: '1e', frame: 'night', weather: 'clear', label: 'starry night' },
  { palette: '1a', frame: 'night', weather: 'snow', label: 'quiet winter night' },
  { palette: '1b', frame: 'night', weather: 'rain', label: 'warm rainy night' },
  { palette: '1a', frame: 'night', weather: 'storm', label: 'the finale' },
  { palette: '1a', frame: 'dawn', weather: 'clear', label: 'the storm breaks' },
];

/** Loop position from the wall clock: stateless, reload-stable, shared by every tab. */
export function journeyAt(nowMs: number): { a: Waypoint; b: Waypoint; t: number } {
  const pos = (nowMs / WAYPOINT_MS) % WAYPOINTS.length;
  const i = Math.floor(((pos % WAYPOINTS.length) + WAYPOINTS.length) % WAYPOINTS.length);
  return { a: WAYPOINTS[i]!, b: WAYPOINTS[(i + 1) % WAYPOINTS.length]!, t: pos - Math.floor(pos) };
}
