import { describe, it, expect } from 'vitest';
import { buildTimeline, sampleTimeline, type DayPlan } from './timeline.js';

const WEAVE: DayPlan = { kind: 'weave' };
const SAT: DayPlan = { kind: 'single', palette: '1f' };

describe('buildTimeline (weave, default anchors)', () => {
  const frames = buildTimeline(WEAVE, WEAVE);

  it('places the spec §2 anchors in order', () => {
    const named = frames.map((f) => `${f.palette}-${f.frame}@${f.atMin}`);
    expect(named).toEqual([
      '1a-night@-180',           // yesterday's deep night carries over midnight
      '1a-night@330',            // hold end 05:30
      '1a-dawn@370',             // 06:10
      '1b-dawn@405',             // 06:45 sunrise
      '1b-day@440',              // 07:20
      '1a-day@510',              // 08:30 — blue by 8:30 (the user's correction)
      '1a-day@1005',             // 16:45 plateau end
      '1a-dusk@1065',            // 17:45
      '1b-dusk@1125',            // 18:45 sunset
      '1b-night@1160',           // 19:20
      '1a-night@1260',           // 21:00
    ]);
  });

  it('shifts with solar anchors (Real mode)', () => {
    const winter = buildTimeline(WEAVE, WEAVE, { sunriseMin: 450, sunsetMin: 1020 });
    const sunrise = winter.find((f) => f.palette === '1b' && f.frame === 'dawn')!;
    expect(sunrise.atMin).toBe(450);
  });
});

describe('sampleTimeline', () => {
  const frames = buildTimeline(WEAVE, SAT); // yesterday was Marigold Saturday

  it('holds flat inside the plateau', () => {
    const noon = sampleTimeline(frames, 720);
    expect(noon.a.frame).toBe('day');
    expect(noon.a.palette).toBe('1a');
    expect(noon.b.palette).toBe('1a');
  });

  it('is mid-blend between 07:20 and 08:30', () => {
    const s = sampleTimeline(frames, 475); // 07:55
    expect(s.a.palette).toBe('1b');
    expect(s.b.palette).toBe('1a');
    expect(s.t).toBeCloseTo(0.5, 1);
  });

  it('blends FROM yesterday palette before dawn (midnight crossover)', () => {
    const s = sampleTimeline(frames, 60); // 01:00
    expect(s.a.palette).toBe('1f'); // Marigold night fading out
    expect(s.b.palette).toBe('1a');
  });
});
