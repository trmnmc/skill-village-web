import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, serializeSettings } from './settings.js';

describe('settings', () => {
  it('round-trips through serialization', () => {
    const s = { muted: true, master: 0.3, buses: { voices: 1, sfx: 0.5, ambience: 0.2, music: 0 } };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });

  it('defaults: sound on, master 70%, music slightly lower — spec §6', () => {
    expect(DEFAULT_SETTINGS.muted).toBe(false);
    expect(DEFAULT_SETTINGS.master).toBe(0.7);
    expect(DEFAULT_SETTINGS.buses.music).toBeLessThan(DEFAULT_SETTINGS.buses.voices);
  });

  it('garbage in, defaults out', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"master": "loud"}')).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps out-of-range volumes instead of trusting them', () => {
    const parsed = parseSettings('{"muted":false,"master":9,"buses":{"voices":-1,"sfx":0.5,"ambience":0.5,"music":0.5}}');
    expect(parsed.master).toBe(1);
    expect(parsed.buses.voices).toBe(0);
  });

  it('fallbacks hand out copies, not the default itself', () => {
    const parsed = parseSettings(null);
    expect(parsed).not.toBe(DEFAULT_SETTINGS);
    expect(parsed.buses).not.toBe(DEFAULT_SETTINGS.buses);
  });
});
