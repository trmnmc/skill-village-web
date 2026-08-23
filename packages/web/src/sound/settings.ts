import type { BusName } from './types.js';

/**
 * The player's mixing desk, spec §6. Parsing and serializing are pure and
 * tested; the two localStorage calls at the bottom are the whole of the I/O,
 * and this file is the only one allowed to make them (boundaries test).
 */
export interface SoundSettings {
  muted: boolean;
  master: number;
  buses: Record<BusName, number>;
}

export const DEFAULT_SETTINGS: SoundSettings = {
  muted: false,
  master: 0.7,
  // Ambience ships at zero: the first playtest found the bed (wind, birds,
  // crickets) more irritant than atmosphere, so it is parked off-by-default
  // pending an ear-tuning overhaul — the HUD slider opts back in. Spec §6.
  buses: { voices: 1, sfx: 1, ambience: 0, music: 0.85 },
};

export const STORAGE_KEY = 'skill-village:sound';

const clamp01 = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;

const freshDefaults = (): SoundSettings => ({
  ...DEFAULT_SETTINGS,
  buses: { ...DEFAULT_SETTINGS.buses },
});

export function parseSettings(raw: string | null): SoundSettings {
  if (raw === null) return freshDefaults();
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const buses = (p.buses ?? {}) as Record<string, unknown>;
    const master = clamp01(p.master);
    const parsedBuses = {
      voices: clamp01(buses.voices),
      sfx: clamp01(buses.sfx),
      ambience: clamp01(buses.ambience),
      music: clamp01(buses.music),
    };
    if (master === null || typeof p.muted !== 'boolean') return freshDefaults();
    return {
      muted: p.muted,
      master,
      buses: {
        voices: parsedBuses.voices ?? DEFAULT_SETTINGS.buses.voices,
        sfx: parsedBuses.sfx ?? DEFAULT_SETTINGS.buses.sfx,
        ambience: parsedBuses.ambience ?? DEFAULT_SETTINGS.buses.ambience,
        music: parsedBuses.music ?? DEFAULT_SETTINGS.buses.music,
      },
    };
  } catch {
    return freshDefaults();
  }
}

export function serializeSettings(s: SoundSettings): string {
  return JSON.stringify(s);
}

export function loadSettings(): SoundSettings {
  try {
    return parseSettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage can throw outright (privacy modes); silence is not worth a crash.
    return freshDefaults();
  }
}

export function saveSettings(s: SoundSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeSettings(s));
  } catch {
    // Best-effort: a full or forbidden store loses persistence, not sound.
  }
}
