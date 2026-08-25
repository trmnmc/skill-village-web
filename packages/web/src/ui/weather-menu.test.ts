import { describe, it, expect } from 'vitest';
import { menuModel, TIME_CHIPS, skyOverrideKeys } from './weather-menu.js';

describe('menuModel', () => {
  it('always has the four mode rows, in order', () => {
    const { rows } = menuModel('off', 'clear', null);
    expect(rows.map((r) => r.id)).toEqual(['off', 'pick', 'journey', 'real']);
  });

  it('active flag follows the current mode', () => {
    expect(menuModel('off', 'clear', null).rows.find((r) => r.id === 'off')!.active).toBe(true);
    expect(menuModel('pick', 'clear', null).rows.find((r) => r.id === 'pick')!.active).toBe(true);
    expect(menuModel('journey', 'clear', null).rows.find((r) => r.id === 'journey')!.active).toBe(true);
    expect(menuModel('real', 'clear', null).rows.find((r) => r.id === 'real')!.active).toBe(true);
    // only one row is active at a time
    expect(menuModel('pick', 'clear', null).rows.filter((r) => r.active)).toHaveLength(1);
  });

  it('omits chips outside pick mode', () => {
    expect(menuModel('off', 'clear', null).chips).toEqual([]);
    expect(menuModel('journey', 'clear', null).chips).toEqual([]);
    expect(menuModel('real', 'clear', null).chips).toEqual([]);
  });

  it('shows all ten chips (clear + nine weathers) in pick mode, with the picked one active', () => {
    const { chips } = menuModel('pick', 'snow', null);
    expect(chips).toHaveLength(10);
    expect(chips[0]).toEqual({ id: 'clear', label: 'clear', active: false });
    const snow = chips.find((c) => c.id === 'snow')!;
    expect(snow.active).toBe(true);
    expect(chips.filter((c) => c.active)).toHaveLength(1);
  });
});

describe('menuModel — timeChips', () => {
  it('has auto + the seven presets, in order, in non-journey modes', () => {
    const { timeChips } = menuModel('off', 'clear', null);
    expect(timeChips).toBeDefined();
    expect(timeChips!.map((c) => c.id)).toEqual([
      'auto', 'dawn', 'morning', 'noon', 'golden', 'sunset', 'evening', 'night',
    ]);
  });

  it('auto chip is active when pinned is null', () => {
    const { timeChips } = menuModel('off', 'clear', null);
    expect(timeChips![0]).toEqual({ id: 'auto', label: 'auto', active: true });
    expect(timeChips!.filter((c) => c.active)).toHaveLength(1);
  });

  it('the matching preset is active when pinned matches its minute', () => {
    const { timeChips } = menuModel('off', 'clear', 750);
    expect(timeChips![0]).toEqual({ id: 'auto', label: 'auto', active: false });
    const noon = timeChips!.find((c) => c.id === 'noon')!;
    expect(noon.active).toBe(true);
    expect(timeChips!.filter((c) => c.active)).toHaveLength(1);
  });

  it('is present (though possibly all-inactive) in off/pick/real modes', () => {
    expect(menuModel('pick', 'clear', null).timeChips).toBeDefined();
    expect(menuModel('real', 'clear', null).timeChips).toBeDefined();
  });

  it('is absent in journey mode', () => {
    expect(menuModel('journey', 'clear', null).timeChips).toBeUndefined();
    expect(menuModel('journey', 'clear', 750).timeChips).toBeUndefined();
  });

  it('TIME_CHIPS table has the seven presets with the spec minutes', () => {
    expect(TIME_CHIPS).toEqual([
      { id: 'dawn', label: 'dawn', minute: 380 },
      { id: 'morning', label: 'morning', minute: 570 },
      { id: 'noon', label: 'noon', minute: 750 },
      { id: 'golden', label: 'golden hour', minute: 1070 },
      { id: 'sunset', label: 'sunset', minute: 1125 },
      { id: 'evening', label: 'evening', minute: 1180 },
      { id: 'night', label: 'night', minute: 1380 },
    ]);
  });
});

describe('menuModel — palette chips', () => {
  it('offers auto plus one chip per palette, labelled with the palette name', () => {
    const { paletteChips } = menuModel('off', 'clear', null, null);
    expect(paletteChips!.map((c) => c.id)).toEqual(['auto', '1a', '1b', '1c', '1d', '1e', '1f']);
    expect(paletteChips!.find((c) => c.id === '1a')!.label).toBe('Meadow Blue');
    expect(paletteChips!.find((c) => c.id === '1f')!.label).toBe('Marigold');
  });

  it('auto is active when no palette is pinned', () => {
    const { paletteChips } = menuModel('off', 'clear', null, null);
    expect(paletteChips!.find((c) => c.id === 'auto')!.active).toBe(true);
    expect(paletteChips!.filter((c) => c.active)).toHaveLength(1);
  });

  it('the pinned palette is the only active chip', () => {
    const { paletteChips } = menuModel('pick', 'clear', null, '1a');
    expect(paletteChips!.find((c) => c.id === '1a')!.active).toBe(true);
    expect(paletteChips!.find((c) => c.id === 'auto')!.active).toBe(false);
    expect(paletteChips!.filter((c) => c.active)).toHaveLength(1);
  });

  it('is present in off/pick/real and absent in journey (which owns its own palette)', () => {
    expect(menuModel('off', 'clear', null, null).paletteChips).toBeDefined();
    expect(menuModel('pick', 'clear', null, null).paletteChips).toBeDefined();
    expect(menuModel('real', 'clear', null, null).paletteChips).toBeDefined();
    expect(menuModel('journey', 'clear', null, '1a').paletteChips).toBeUndefined();
  });
});

describe('skyOverrideKeys', () => {
  it('names the sky dev-override params present in a search string', () => {
    expect(skyOverrideKeys('?weather=snow&day=wed&at=12:00')).toEqual(['at', 'day', 'weather']);
    expect(skyOverrideKeys('?palette=1e')).toEqual(['palette']);
  });

  it('is empty for a clean URL or unrelated params', () => {
    expect(skyOverrideKeys('')).toEqual([]);
    expect(skyOverrideKeys('?foo=bar')).toEqual([]);
  });

  it('ignores malformed values the store would reject anyway', () => {
    // The note must only appear when the store would actually be overridden.
    expect(skyOverrideKeys('?weather=tornado&at=99:99&day=someday&palette=9z')).toEqual([]);
  });
});
