import { describe, expect, it } from 'vitest';
import type { Creature } from '@village/core/visual';
import { HOMES_LO, HOMES_HI } from './zones.js';
import {
  buildRenderList, instanceKey, instanceSpots, keyCreatureId, presenceScale, TETHER,
} from './instances.js';

const creature = (id: string, kind: Creature['kind'], over: Partial<Creature> = {}): Creature => ({
  id, kind, name: id.split(':')[1]!, nickname: '',
  appearance: {
    body: 'pip', crown: 'none', winged: kind === 'agent',
    palette: { hue: '#888888', lite: '#aaaaaa', dark: '#666666' }, restPosture: null,
  },
  stats: { mood: 70, energy: 70, bond: 0, xp: 0 },
  stage: 'adult', personality: null, sourcePath: '', friendships: {}, lastSeenAt: 0,
  ...over,
});

describe('presenceScale', () => {
  it('grows mildly with helpers and caps', () => {
    expect(presenceScale(0)).toBe(1);
    expect(presenceScale(2)).toBeCloseTo(1.12, 10);
    expect(presenceScale(50)).toBe(1.3);
  });
});

describe('keys', () => {
  it('round-trip: an instance key names its helper; a villager key names itself', () => {
    expect(keyCreatureId(instanceKey('project:p', 'skill:s'))).toBe('skill:s');
    expect(keyCreatureId('skill:s')).toBe('skill:s');
    expect(keyCreatureId('project:p')).toBe('project:p');
  });
});

describe('instanceSpots', () => {
  const anchor = { x: 2000, y: 700, wander: 30 };
  it('tethers every instance to the anchor, same depth row, short leash', () => {
    const spots = instanceSpots('project:p', anchor, ['skill:a', 'agent:b', 'skill:c']);
    expect(spots.size).toBe(3);
    for (const spot of spots.values()) {
      expect(Math.abs(spot.x - anchor.x)).toBeLessThanOrEqual(TETHER);
      expect(spot.y).toBe(anchor.y);
      expect(spot.wander).toBeGreaterThan(0);
      expect(spot.wander).toBeLessThan(30);
    }
  });
  it('is deterministic and clamps to the seatable stretch of Homes', () => {
    const a = instanceSpots('project:p', anchor, ['skill:a']);
    const b = instanceSpots('project:p', anchor, ['skill:a']);
    expect(a).toEqual(b);
    const edge = instanceSpots('project:p', { x: HOMES_LO, y: 700, wander: 0 }, ['skill:a', 'skill:b']);
    for (const spot of edge.values()) {
      expect(spot.x).toBeGreaterThanOrEqual(HOMES_LO);
      expect(spot.x).toBeLessThanOrEqual(HOMES_HI);
    }
  });
});

describe('buildRenderList', () => {
  const project = creature('project:p', 'project', { helperIds: ['skill:linked'] });
  const linked = creature('skill:linked', 'skill');
  const loner = creature('skill:loner', 'skill');

  it('projects and unlinked helpers are villagers; linked helpers appear only beside their projects', () => {
    const entries = buildRenderList([project, linked, loner]);
    const keys = entries.map((e) => e.key);
    expect(keys).toContain('project:p');
    expect(keys).toContain('skill:loner');
    expect(keys).not.toContain('skill:linked'); // no commons entry — it left for the aura
    expect(keys).toContain(instanceKey('project:p', 'skill:linked'));
  });

  it('the instance rides within the tether of its project and carries the helper creature', () => {
    const entries = buildRenderList([project, linked, loner]);
    const anchor = entries.find((e) => e.key === 'project:p')!;
    const inst = entries.find((e) => e.key === instanceKey('project:p', 'skill:linked'))!;
    expect(Math.abs(inst.spot.x - anchor.spot.x)).toBeLessThanOrEqual(TETHER);
    expect(inst.creature).toBe(linked);
  });

  it('one helper, many projects: one creature, many render instances (spec §4)', () => {
    const p2 = creature('project:q', 'project', { helperIds: ['skill:linked'] });
    const entries = buildRenderList([project, p2, linked]);
    const keys = entries.map((e) => e.key);
    expect(keys).toContain(instanceKey('project:p', 'skill:linked'));
    expect(keys).toContain(instanceKey('project:q', 'skill:linked'));
  });

  it('a project wears its presence; everyone else wears 1', () => {
    const entries = buildRenderList([project, linked, loner]);
    expect(entries.find((e) => e.key === 'project:p')!.presence).toBeCloseTo(1.06, 10);
    expect(entries.find((e) => e.key === 'skill:loner')!.presence).toBe(1);
  });

  it('a helperId with no creature in view links nothing and crashes nothing', () => {
    const ghostly = creature('project:g', 'project', { helperIds: ['skill:gone'] });
    const entries = buildRenderList([ghostly]);
    expect(entries.map((e) => e.key)).toEqual(['project:g']);
    expect(entries[0]!.presence).toBeCloseTo(1.06, 10); // count is helperIds' length — links it *claims*
  });

  it('with no projects at all, today\'s village is exactly reproduced', () => {
    const entries = buildRenderList([linked, loner]);
    expect(entries.map((e) => e.key).sort()).toEqual(['skill:linked', 'skill:loner']);
    expect(entries.every((e) => e.presence === 1)).toBe(true);
  });
});
