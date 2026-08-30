import { describe, expect, it } from 'vitest';
import type { Creature } from '@village/core/visual';
import {
  GROUND_FRONT, HOMES_HI, HOMES_HOUSE_XS, HOMES_LO, HOMES_SIGN_X, HOUSE_BASE_Y, SIGN_BASE_Y,
  homesKeepOutAt, type KeepOut, type Spot,
} from './zones.js';
import {
  buildRenderList, CROWD_GAP, INSTANCE_LEASH, instanceKey, instanceSpots, keyCreatureId,
  presenceScale, seatResident, TETHER,
} from './instances.js';

/** Strictly inside a band — a band edge is standable ground (zones.ts). */
const onProp = (x: number, bands: readonly KeepOut[]) =>
  bands.some((b) => b.left < x && x < b.right);

/** Does an instance's whole excursion stay off the props? */
const leashReachesProp = (spot: Spot, bands: readonly KeepOut[]) =>
  bands.some((b) => spot.x + spot.wander > b.left && spot.x - spot.wander < b.right);

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
  it('reads the work signal: worked today is the big genie, this week upright, drooped villager-sized', () => {
    expect(presenceScale(85)).toBe(1.3); // thriving — Claude worked in it today
    expect(presenceScale(80)).toBe(1.3);
    expect(presenceScale(70)).toBe(1.15); // content — touched this week
    expect(presenceScale(55)).toBe(1.15);
    expect(presenceScale(40)).toBe(1); // drooped — its crowd alone says "project"
  });

  it('steps in bands: a mood sliding by the hour cannot respawn a body per tick', () => {
    expect(presenceScale(79)).toBe(presenceScale(56));
    expect(presenceScale(54)).toBe(presenceScale(5));
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
  // Open ground: a stretch of Homes with no prop near it. The old fixture sat
  // on the Homes sign — a spot placeCreatures can never hand out, so it told
  // us nothing about what a real aura does.
  const anchor = { x: 1000, y: HOUSE_BASE_Y - 16, wander: 30 };
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

  // A row whose feet land among the house pixels — the row a house blocks.
  const propRowY = HOUSE_BASE_Y - 16;
  const propRowBands = homesKeepOutAt(propRowY);
  const houseBand = propRowBands.find(
    (b) => b.left < HOMES_HOUSE_XS[1]! && HOMES_HOUSE_XS[1]! < b.right,
  )!;
  const helpers = ['skill:a', 'agent:b', 'skill:c', 'skill:d'];

  it('an aura beside a house keeps every instance off the house', () => {
    const anchorX = houseBand.left - 10; // standable ground, ten pixels short of the eaves
    expect(onProp(anchorX, propRowBands)).toBe(false);
    const spots = instanceSpots('project:p', { x: anchorX, y: propRowY, wander: 30 }, helpers);
    const fanned = [...spots.values()].map((s) => s.x);
    // Without a keep-out pass the fan steps 40-96px straight into a band that
    // is over 180px wide, and a villager stands in the wall of a house.
    expect(fanned.filter((x) => onProp(x, propRowBands))).toEqual([]);
    for (const spot of spots.values()) {
      expect(Math.abs(spot.x - anchorX)).toBeLessThanOrEqual(TETHER);
    }
  });

  it('the sign, which is never covered from any distance, is never stood on', () => {
    const y = SIGN_BASE_Y - 20;
    const bands = homesKeepOutAt(y);
    const sign = bands.find((b) => b.left < HOMES_SIGN_X && HOMES_SIGN_X < b.right)!;
    const spots = instanceSpots('project:p', { x: sign.left - 8, y, wander: 30 }, helpers);
    expect([...spots.values()].filter((s) => onProp(s.x, bands))).toEqual([]);
  });

  it('the leash never carries an instance onto a prop either', () => {
    const violations: Spot[] = [];
    let clipped = 0;
    for (let x = houseBand.left - 150; x <= houseBand.right + 150; x += 7) {
      // placeCreatures never seats a villager inside a band, so an aura is
      // never anchored on one; a leash is not a rescue from an impossible seat.
      if (onProp(x, propRowBands)) continue;
      const spots = instanceSpots('project:p', { x, y: propRowY, wander: 30 }, helpers);
      for (const spot of spots.values()) {
        if (spot.wander < INSTANCE_LEASH) clipped++;
        if (leashReachesProp(spot, propRowBands)) violations.push(spot);
      }
    }
    expect(violations).toEqual([]);
    expect(clipped).toBeGreaterThan(0); // the clipping is actually exercised
  });

  // The owner's verdict (2026-08-30): auras stacked into noise. Pressed close
  // is still the reading; two bodies on one spot never is.
  const minPairGap = (xs: readonly number[]) => {
    let min = Infinity;
    for (let i = 0; i < xs.length; i++)
      for (let j = i + 1; j < xs.length; j++) min = Math.min(min, Math.abs(xs[i]! - xs[j]!));
    return min;
  };

  it('a big aura never stands two instances on one spot', () => {
    const many = Array.from({ length: 10 }, (_, i) => `skill:h${i}`);
    const spots = instanceSpots('project:p', anchor, many);
    const xs = [...spots.values()].map((s) => s.x);
    // The ladder may relax to half the crowd gap and spill to a doubled
    // tether — never to coincidence.
    expect(minPairGap(xs)).toBeGreaterThanOrEqual(CROWD_GAP / 2);
    for (const spot of spots.values()) {
      expect(Math.abs(spot.x - anchor.x)).toBeLessThanOrEqual(TETHER * 2);
    }
  });

  it('a fan flows around bodies already standing on the row', () => {
    // Two outsiders parked exactly on the fan's designed first ring.
    const taken = [anchor.x + 40, anchor.x - 40].map((x) => ({ x, r: 0 }));
    const spots = instanceSpots('project:p', anchor, ['skill:a', 'skill:b'], taken);
    for (const spot of spots.values()) {
      for (const o of taken) expect(Math.abs(spot.x - o.x)).toBeGreaterThanOrEqual(CROWD_GAP / 2);
    }
    expect(minPairGap([...spots.values()].map((s) => s.x))).toBeGreaterThanOrEqual(CROWD_GAP / 2);
  });

  it("an occupant's own radius outranks the rung's gap — how adjacent-row ghosts hold their offset", () => {
    // One ghost with a fat radius sitting where the fan wants to start.
    const ghost = { x: anchor.x + 44, r: 38 };
    const spots = instanceSpots('project:p', anchor, ['skill:a', 'skill:b', 'skill:c'], [ghost]);
    for (const spot of spots.values()) {
      expect(Math.abs(spot.x - ghost.x)).toBeGreaterThanOrEqual(ghost.r);
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
    // The factory's mood is 70 — a content project, the middle band.
    expect(entries.find((e) => e.key === 'project:p')!.presence).toBe(1.15);
    expect(entries.find((e) => e.key === 'skill:loner')!.presence).toBe(1);
  });

  it('a helperId with no creature in view links nothing and crashes nothing', () => {
    const ghostly = creature('project:g', 'project', { helperIds: ['skill:gone'] });
    const entries = buildRenderList([ghostly]);
    expect(entries.map((e) => e.key)).toEqual(['project:g']);
    expect(entries[0]!.presence).toBe(1.15); // presence is the work signal, not the links it claims
  });

  it('a whole village of auras leaves every prop standing alone', () => {
    const helperIds = ['skill:h0', 'skill:h1', 'skill:h2', 'agent:h3'];
    const cast = [
      ...Array.from({ length: 12 }, (_, i) => creature(`project:p${i}`, 'project', { helperIds })),
      ...helperIds.map((id) => creature(id, id.startsWith('agent') ? 'agent' : 'skill')),
    ];
    const trespassers = buildRenderList(cast).filter((e) =>
      onProp(e.spot.x, homesKeepOutAt(e.spot.y)),
    );
    expect(trespassers.map((e) => e.key)).toEqual([]);
  });

  it('two auras side by side interleave without standing in each other', () => {
    const helpersA = ['skill:a1', 'skill:a2', 'skill:a3'];
    const helpersB = ['skill:b1', 'skill:b2', 'skill:b3'];
    const cast = [
      creature('project:west', 'project', { helperIds: helpersA }),
      creature('project:east', 'project', { helperIds: helpersB }),
      ...[...helpersA, ...helpersB].map((id) => creature(id, 'skill')),
    ];
    // Pinned onto one row with overlapping tethers — the collision the
    // automatic layout meets whenever two genies seat near each other.
    const pins = new Map([
      ['project:west', { x: 1500, y: GROUND_FRONT }],
      ['project:east', { x: 1620, y: GROUND_FRONT }],
    ]);
    const row = buildRenderList(cast, pins).filter((e) => e.spot.y === GROUND_FRONT);
    expect(row.length).toBe(8); // both genies and every instance share the row
    const xs = row.map((e) => e.spot.x);
    let min = Infinity;
    for (let i = 0; i < xs.length; i++)
      for (let j = i + 1; j < xs.length; j++) min = Math.min(min, Math.abs(xs[i]! - xs[j]!));
    expect(min).toBeGreaterThanOrEqual(CROWD_GAP / 2);
  });

  it('with no projects at all, today\'s village is exactly reproduced', () => {
    const entries = buildRenderList([linked, loner]);
    expect(entries.map((e) => e.key).sort()).toEqual(['skill:linked', 'skill:loner']);
    expect(entries.every((e) => e.presence === 1)).toBe(true);
  });
});

describe('seatResident', () => {
  const porch = Object.freeze({ x: 5000, y: 800, wander: 0 });
  const project = creature('project:p', 'project', { helperIds: ['skill:linked'] });
  const linked = creature('skill:linked', 'skill');
  const loner = creature('skill:loner', 'skill');

  it('no resident leaves the village exactly as it was', () => {
    const entries = buildRenderList([project, linked, loner]);
    expect(seatResident(entries, null, porch)).toEqual(entries);
  });

  it('a resident who is not in the view changes nothing', () => {
    const entries = buildRenderList([project, linked, loner]);
    expect(seatResident(entries, 'skill:ghost', porch)).toEqual(entries);
  });

  it('a project resident takes its aura with it: own entry to the porch, instances dropped', () => {
    const entries = seatResident(buildRenderList([project, linked, loner]), 'project:p', porch);
    // The instance would otherwise stay fanned around the Homes anchor the
    // project just vacated — an aura with no genie under it.
    expect(entries.map((e) => e.key)).toEqual(['project:p', 'skill:loner']);
    const seated = entries.find((e) => e.key === 'project:p')!;
    expect(seated.spot).toEqual(porch);
    expect(seated.spot).not.toBe(porch); // a copy: PORCH_SPOT is frozen and shared
    expect(seated.presence).toBe(1.15); // its genie size survives the move
  });

  it('a helper resident collapses to one body, however many auras it stood in', () => {
    const q = creature('project:q', 'project', { helperIds: ['skill:linked'] });
    const entries = seatResident(buildRenderList([project, q, linked]), 'skill:linked', porch);
    expect(entries.map((e) => e.key)).toEqual(['project:p', 'project:q', 'skill:linked']);
    const seated = entries.find((e) => e.key === 'skill:linked')!;
    expect(seated.spot).toEqual(porch);
    expect(seated.creature).toBe(linked);
    expect(seated.presence).toBe(1);
  });

  it('prefix matching stops at the separator: project:foo does not evict project:foobar\'s aura', () => {
    const foo = creature('project:foo', 'project', { helperIds: ['skill:a'] });
    const foobar = creature('project:foobar', 'project', { helperIds: ['skill:b'] });
    const a = creature('skill:a', 'skill');
    const b = creature('skill:b', 'skill');
    const entries = seatResident(buildRenderList([foo, foobar, a, b]), 'project:foo', porch);
    const keys = entries.map((e) => e.key);
    expect(keys).toContain(instanceKey('project:foobar', 'skill:b'));
    expect(keys).not.toContain(instanceKey('project:foo', 'skill:a'));
  });

  it('leaves the list sorted by key, as buildRenderList found it', () => {
    const entries = seatResident(buildRenderList([project, linked, loner]), 'project:p', porch);
    expect(entries.map((e) => e.key)).toEqual([...entries.map((e) => e.key)].sort((x, y) => x.localeCompare(y)));
  });
});
