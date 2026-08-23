import { describe, it, expect } from 'vitest';
import { menuModel } from './weather-menu.js';

describe('menuModel', () => {
  it('always has the four mode rows, in order', () => {
    const { rows } = menuModel('off', 'clear');
    expect(rows.map((r) => r.id)).toEqual(['off', 'pick', 'journey', 'real']);
  });

  it('active flag follows the current mode', () => {
    expect(menuModel('off', 'clear').rows.find((r) => r.id === 'off')!.active).toBe(true);
    expect(menuModel('pick', 'clear').rows.find((r) => r.id === 'pick')!.active).toBe(true);
    expect(menuModel('journey', 'clear').rows.find((r) => r.id === 'journey')!.active).toBe(true);
    expect(menuModel('real', 'clear').rows.find((r) => r.id === 'real')!.active).toBe(true);
    // only one row is active at a time
    expect(menuModel('pick', 'clear').rows.filter((r) => r.active)).toHaveLength(1);
  });

  it('omits chips outside pick mode', () => {
    expect(menuModel('off', 'clear').chips).toEqual([]);
    expect(menuModel('journey', 'clear').chips).toEqual([]);
    expect(menuModel('real', 'clear').chips).toEqual([]);
  });

  it('shows all ten chips (clear + nine weathers) in pick mode, with the picked one active', () => {
    const { chips } = menuModel('pick', 'snow');
    expect(chips).toHaveLength(10);
    expect(chips[0]).toEqual({ id: 'clear', label: 'clear', active: false });
    const snow = chips.find((c) => c.id === 'snow')!;
    expect(snow.active).toBe(true);
    expect(chips.filter((c) => c.active)).toHaveLength(1);
  });
});
