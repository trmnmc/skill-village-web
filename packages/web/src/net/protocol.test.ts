import { describe, it, expect } from 'vitest';
import { parseServerMessage, toView } from './protocol.js';

const creature = {
  id: 'skill:code-review',
  kind: 'skill',
  name: 'code-review',
  nickname: 'Nit',
  appearance: {
    body: 'round', crown: 'ears',
    palette: { hue: '#E58C68', lite: '#F0B49A', dark: '#B96A4A' },
    winged: false, restPosture: null,
  },
  stats: { mood: 70, energy: 70, bond: 10, xp: 0 },
  stage: 'adult',
  personality: null,
  sourcePath: 'C:/Users/x/.claude/skills/code-review/SKILL.md',
  friendships: {},
  lastSeenAt: 1,
};

const state = { creatures: { 'skill:code-review': creature }, problems: [], startupNote: null };

describe('toView', () => {
  it('turns the creature map into a stable, sorted list', () => {
    const many = {
      creatures: { 'skill:b': { ...creature, id: 'skill:b' }, 'skill:a': { ...creature, id: 'skill:a' } },
      problems: [],
    };
    expect(toView(many)!.creatures.map((c) => c.id)).toEqual(['skill:a', 'skill:b']);
  });

  it('carries problems and the startup note through', () => {
    const view = toView({ ...state, problems: ['bad.md'], startupNote: 'hello' })!;
    expect(view.problems).toEqual(['bad.md']);
    expect(view.startupNote).toBe('hello');
  });

  it('defaults a missing startup note to null', () => {
    expect(toView({ creatures: {}, problems: [] })!.startupNote).toBeNull();
  });

  it('accepts an empty village', () => {
    expect(toView({ creatures: {}, problems: [] })!.creatures).toEqual([]);
  });

  it('carries a silent llm mode through instead of assuming full', () => {
    // The banner used to come from a one-shot fetch that raced the boot
    // probe; the live frames are the truth now, so the mode must survive.
    const withLlm = {
      ...state,
      llm: {
        mode: 'silent',
        ledger: { interactiveIn: 10, interactiveOut: 20, autonomousIn: 0, autonomousOut: 0 },
        config: { interactiveCap: 500_000 },
      },
    };
    expect(toView(withLlm)!.llm!.mode).toBe('silent');
  });

  it('treats a frame without a mode as full, not silent', () => {
    const withLlm = {
      ...state,
      llm: {
        ledger: { interactiveIn: 10, interactiveOut: 20, autonomousIn: 0, autonomousOut: 0 },
        config: { interactiveCap: 500_000 },
      },
    };
    expect(toView(withLlm)!.llm!.mode).toBe('full');
  });

  it('rejects a payload with no creature map', () => {
    expect(toView({ problems: [] })).toBeNull();
    expect(toView(null)).toBeNull();
    expect(toView('nope')).toBeNull();
  });

  it('skips a creature missing the fields the renderer needs', () => {
    const view = toView({ creatures: { a: { id: 'a' }, 'skill:ok': creature }, problems: [] })!;
    expect(view.creatures.map((c) => c.id)).toEqual(['skill:code-review']);
  });

  // Each of the following would have crashed a renderer that trusted `toView`'s
  // output as a real Creature: roles.ts reads palette.hue/lite, compose.ts
  // indexes BODIES[body]/CROWNS[crown] then reads body.w, behaviour.ts branches
  // on winged, and displayName calls nickname.trim(). A well-formed creature
  // alongside each bad one proves the guard drops selectively, not wholesale.

  it('skips a creature whose appearance is present but empty', () => {
    const bad = { ...creature, id: 'skill:bad', appearance: {} };
    const view = toView({ creatures: { bad, ok: creature }, problems: [] })!;
    expect(view.creatures.map((c) => c.id)).toEqual(['skill:code-review']);
  });

  it('skips a creature whose palette is missing hue', () => {
    const bad = {
      ...creature,
      id: 'skill:bad',
      appearance: { ...creature.appearance, palette: { lite: '#F0B49A', dark: '#B96A4A' } },
    };
    const view = toView({ creatures: { bad, ok: creature }, problems: [] })!;
    expect(view.creatures.map((c) => c.id)).toEqual(['skill:code-review']);
  });

  it('skips a creature whose body is a string but not a real body id', () => {
    const bad = { ...creature, id: 'skill:bad', appearance: { ...creature.appearance, body: 'dragon' } };
    const view = toView({ creatures: { bad, ok: creature }, problems: [] })!;
    expect(view.creatures.map((c) => c.id)).toEqual(['skill:code-review']);
  });

  it('skips a creature whose winged flag is not a boolean', () => {
    const bad = { ...creature, id: 'skill:bad', appearance: { ...creature.appearance, winged: 'yes' } };
    const view = toView({ creatures: { bad, ok: creature }, problems: [] })!;
    expect(view.creatures.map((c) => c.id)).toEqual(['skill:code-review']);
  });

  it('skips a creature with no nickname', () => {
    const bad = { ...creature, id: 'skill:bad', nickname: undefined };
    const view = toView({ creatures: { bad, ok: creature }, problems: [] })!;
    expect(view.creatures.map((c) => c.id)).toEqual(['skill:code-review']);
  });

  it('keeps a fully-formed creature whose restPosture is null', () => {
    // restPosture: null is the normal case, not the exception — most creatures
    // have it. The stricter appearance guard above must not reject this.
    const view = toView({ creatures: { ok: creature }, problems: [] })!;
    expect(view.creatures.map((c) => c.id)).toEqual(['skill:code-review']);
  });

  it('projects are renderable villagers', () => {
    const project = { ...creature, id: 'project:proj-a', kind: 'project', helperIds: ['skill:x'] };
    const view = toView({ creatures: { [project.id]: project }, problems: [] });
    expect(view!.creatures).toHaveLength(1);
    expect(view!.creatures[0]!.kind).toBe('project');
    expect(view!.creatures[0]!.helperIds).toEqual(['skill:x']); // fields ride through
  });
});

describe('parseServerMessage', () => {
  it('reads a state frame', () => {
    const raw = JSON.stringify({ type: 'state', state });
    expect(parseServerMessage(raw)!.creatures[0]!.id).toBe('skill:code-review');
  });

  it('ignores a frame of some other type', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'pong' }))).toBeNull();
  });

  it('survives malformed JSON rather than taking the village down', () => {
    expect(parseServerMessage('{not json')).toBeNull();
    expect(parseServerMessage('')).toBeNull();
  });
});

describe('toView — llm block', () => {
  it('passes a well-formed llm block through', () => {
    const view = toView({
      creatures: {}, problems: [],
      llm: {
        ledger: { day: '2026-08-22', interactiveIn: 10, interactiveOut: 5, autonomousIn: 0, autonomousOut: 0 },
        config: { interactiveCap: 500_000, autonomousCap: 100_000, autonomousEnabled: false },
      },
    })!;
    expect(view.llm).toEqual({ mode: 'full', interactiveRemaining: 500_000 - 15, interactiveCap: 500_000 });
  });

  it('is null for an M3 server payload, and the view still parses', () => {
    const view = toView({ creatures: {}, problems: [] })!;
    expect(view.llm).toBeNull();
  });

  it('is null rather than crashing on a mangled llm block', () => {
    const view = toView({ creatures: {}, problems: [], llm: { ledger: 'what' } })!;
    expect(view.llm).toBeNull();
  });
});

describe('robot fields', () => {
  it('reads the resident and activity stamp when present', () => {
    const view = toView({ ...state, robot: { residentId: 'skill:x' }, robotLastTurnAt: 123 });
    expect(view!.robotResidentId).toBe('skill:x');
    expect(view!.robotLastTurnAt).toBe(123);
  });

  it('defaults both to null on older or partial payloads', () => {
    const view = toView(state);
    expect(view!.robotResidentId).toBe(null);
    expect(view!.robotLastTurnAt).toBe(null);
  });

  it('a malformed robot block reads as empty, never crashes the frame', () => {
    const view = toView({ ...state, robot: 'garbage', robotLastTurnAt: 'soon' });
    expect(view!.robotResidentId).toBe(null);
    expect(view!.robotLastTurnAt).toBe(null);
  });
});
