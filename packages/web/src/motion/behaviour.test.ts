import { describe, it, expect } from 'vitest';
import type { Creature, CreatureKind } from '@village/core/visual';
import { behaviourFor, SLEEP_BELOW } from './behaviour.js';

function creature(over: { kind?: CreatureKind; mood?: number; energy?: number } = {}): Creature {
  const kind = over.kind ?? 'skill';
  return {
    id: `${kind}:test`,
    kind,
    name: 'test',
    nickname: '',
    appearance: {
      body: 'round', crown: 'none',
      palette: { hue: '#E58C68', lite: '#F0B49A', dark: '#B96A4A' },
      winged: kind === 'agent', restPosture: null,
    },
    stats: { mood: over.mood ?? 70, energy: over.energy ?? 70, bond: 10, xp: 0 },
    stage: 'adult',
    personality: null,
    sourcePath: '/tmp/test',
    friendships: {},
    lastSeenAt: 0,
  };
}

describe('behaviourFor — skills', () => {
  it('hops when it is happy and rested', () => {
    const b = behaviourFor(creature({ mood: 85, energy: 80 }));
    expect(b.hopper).toBe(true);
    expect(b.asleep).toBe(false);
    expect(b.fly).toBeNull();
  });

  it('dozes when energy has bottomed out', () => {
    const b = behaviourFor(creature({ mood: 60, energy: 15 }));
    expect(b.asleep).toBe(true);
    expect(b.hopper).toBe(false);
  });

  it('stands about when it is neither delighted nor exhausted', () => {
    const b = behaviourFor(creature({ mood: 55, energy: 60 }));
    expect(b.hopper).toBe(false);
    expect(b.asleep).toBe(false);
  });

  it('looks scruffy once mood is low, without ever sleeping on its feet', () => {
    const b = behaviourFor(creature({ mood: 20, energy: 70 }));
    expect(b.scruffy).toBe(true);
    expect(b.asleep).toBe(false);
  });

  it('is not scruffy while its mood is fine', () => {
    // Asserting only the `true` side leaves `scruffy: true` hardcoded in the
    // implementation passing the whole file, so pin the other polarity and the
    // threshold between them.
    expect(behaviourFor(creature({ mood: 80, energy: 80 })).scruffy).toBe(false);
    expect(behaviourFor(creature({ mood: 35, energy: 80 })).scruffy).toBe(false);
    expect(behaviourFor(creature({ mood: 34, energy: 80 })).scruffy).toBe(true);
  });

  it('carries its grooming into sleep, either way', () => {
    // The asleep branch returns early with its own object, so it needs its own
    // pair — a contented sleeper is not scruffy and a miserable one is.
    expect(behaviourFor(creature({ mood: 80, energy: 10 })).scruffy).toBe(false);
    expect(behaviourFor(creature({ mood: 20, energy: 10 })).scruffy).toBe(true);
  });

  it('never flies', () => {
    expect(behaviourFor(creature({ mood: 99, energy: 99 })).fly).toBeNull();
  });
});

describe('behaviourFor — agents', () => {
  it('roams when it has the energy for it', () => {
    expect(behaviourFor(creature({ kind: 'agent', mood: 80, energy: 75 })).fly).toBe('roam');
  });

  it('hovers when it is running low', () => {
    expect(behaviourFor(creature({ kind: 'agent', mood: 50, energy: 35 })).fly).toBe('hover');
  });

  it('sleeps rather than flying when truly spent', () => {
    const b = behaviourFor(creature({ kind: 'agent', mood: 40, energy: 10 }));
    expect(b.asleep).toBe(true);
    expect(b.fly).toBeNull();
  });

  it('never hops, because it has no feet to hop on', () => {
    expect(behaviourFor(creature({ kind: 'agent', mood: 95, energy: 95 })).hopper).toBe(false);
  });
});

describe('behaviourFor — determinism', () => {
  it('is a pure function of the creature', () => {
    const c = creature({ mood: 77, energy: 66 });
    expect(behaviourFor(c)).toEqual(behaviourFor(c));
  });
});

describe('behaviourFor — the village sleeps at night', () => {
  it('beds down a wide-awake creature once night falls', () => {
    const rested = creature({ mood: 85, energy: 90 });
    expect(behaviourFor(rested, false).asleep).toBe(false);
    const night = behaviourFor(rested, true);
    expect(night.asleep).toBe(true);
    // Sleeping outranks every other posture: nothing hops or flies in its sleep.
    expect(night.hopper).toBe(false);
    expect(night.fly).toBeNull();
  });

  it('grounds a winged agent at night too', () => {
    const flyer = creature({ kind: 'agent', mood: 80, energy: 90 });
    expect(behaviourFor(flyer, false).fly).toBe('roam');
    expect(behaviourFor(flyer, true).fly).toBeNull();
  });

  it('still naps in daylight when genuinely drained', () => {
    expect(behaviourFor(creature({ energy: 10 }), false).asleep).toBe(true);
  });

  it('defaults to daytime when no night flag is passed', () => {
    expect(behaviourFor(creature({ energy: 90 })).asleep).toBe(false);
  });

  it('keeps scruffiness independent of sleeping', () => {
    expect(behaviourFor(creature({ mood: 20, energy: 90 }), true).scruffy).toBe(true);
    expect(behaviourFor(creature({ mood: 90, energy: 90 }), true).scruffy).toBe(false);
  });
});

describe('the resting floor leaves creatures awake', () => {
  // core owns the decay floor (STAT_FLOOR, currently 30) and web owns the
  // sleep line, and the boundary rule forbids importing the core barrel
  // here — so the invariant is pinned from both sides: core asserts the
  // floor value, and this asserts the sleep line sits below it.
  const CORE_STAT_FLOOR = 30;

  it('sits below the decay floor, so an untended village dozes but never falls comatose', () => {
    // The bug this pins: with the sleep line ABOVE the floor, every creature
    // decays into permanent sleep and — until care verbs exist — can never wake.
    expect(SLEEP_BELOW).toBeLessThan(CORE_STAT_FLOOR);
    const resting = creature({ mood: CORE_STAT_FLOOR, energy: CORE_STAT_FLOOR });
    expect(behaviourFor(resting, false).asleep).toBe(false);
  });
});
