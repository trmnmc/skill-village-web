import { describe, it, expect } from 'vitest';
import { GRAYS, OVERCAST, graySkies, weatherGround } from './kinds.js';
import { mix } from '../palettes.js';

const SKY: [string, string, string] = ['#C4E4F4', '#CFE9F5', '#DFF0EC'];

describe('graySkies', () => {
  it('applies the reference tone at full ramp', () => {
    const [s0] = graySkies(SKY, 'rain', 1, false);
    expect(s0).toBe(mix('#C4E4F4', '#93A2AC', 0.50));
  });
  it('scales with ramp', () => {
    const [s0] = graySkies(SKY, 'rain', 0.5, false);
    expect(s0).toBe(mix('#C4E4F4', '#93A2AC', 0.25));
  });
  it('darkens the tone at night', () => {
    const [day0] = graySkies(SKY, 'storm', 1, false);
    const [night0] = graySkies(SKY, 'storm', 1, true);
    expect(night0).not.toBe(day0);
  });
  it('leaves clear/wind/leaves/rainbow untouched', () => {
    expect(graySkies(SKY, 'wind', 1, false)).toEqual(SKY);
  });
});

describe('weatherGround', () => {
  it('snow whitens the ground fully at ramp 1', () => {
    expect(weatherGround('#A8C68D', '#8FB075', 'snow', 1).ground).toBe('#EBF1F2');
  });
  it('rain dampens by 0.15 toward #5F7A70', () => {
    expect(weatherGround('#A8C68D', '#8FB075', 'rain', 1).ground).toBe(mix('#A8C68D', '#5F7A70', 0.15));
  });
});

describe('OVERCAST', () => {
  it('matches the reference set', () => {
    expect([...OVERCAST].sort()).toEqual(['cloudy', 'fog', 'rain', 'snow', 'storm']);
    expect(OVERCAST.has('heat' as never)).toBe(false);
  });
});
