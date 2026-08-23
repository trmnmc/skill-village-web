import { describe, it, expect, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { readArchived } from './bridge/archive.js';
import { readEvents } from './state/events.js';
import { makeSandbox, skillFixture, agentFixture, type Sandbox } from './testing/sandbox.js';
import { createVillage, type Village } from './village.js';
import { MS_PER_HOUR } from './sim/tick.js';
import { defaultLlmState } from './llm/ledger.js';
import { createLlmService, type LlmService } from './llm/service.js';
import { fakeCliCommand } from './llm/testing/fake.js';

let sandbox: Sandbox | null = null;
let village: Village | null = null;

// No resetFakeCli() here on purpose: this file only drives the stateless
// 'card' behaviour, and the reset deletes a marker file that the llm tests —
// running in a parallel worker — depend on partway through a test of their own.
afterEach(async () => {
  await village?.close();
  village = null;
  await sandbox?.cleanup();
  sandbox = null;
});

/** A controllable clock, so tests never wait on real time. */
function clock(start = 1_000) {
  let current = start;
  return { now: () => current, advance(ms: number) { current += ms; } };
}

describe('createVillage', () => {
  it('imports existing skills and agents on first run', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('code-review', skillFixture('code-review'));
    await sandbox.writeAgent('web-research', agentFixture('web-research'));

    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    const ids = Object.keys(village.getState().creatures).sort();
    expect(ids).toEqual(['agent:web-research', 'skill:code-review']);
  });

  it('persists across restarts, keeping bond and xp', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('persistent', skillFixture('persistent'));

    const first = await createVillage({ paths: sandbox.paths, now: clock().now });
    await first.care('skill:persistent', 'play');
    const bondAfterCare = first.getState().creatures['skill:persistent']!.stats.bond;
    await first.close();

    village = await createVillage({ paths: sandbox.paths, now: clock(2_000).now });
    expect(village.getState().creatures['skill:persistent']!.stats.bond).toBe(bondAfterCare);
  });

  it('records a startup note when the save had to be recovered', async () => {
    sandbox = await makeSandbox();
    const { writeFile } = await import('node:fs/promises');
    await writeFile(sandbox.paths.statePath, 'not json', 'utf8');
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    expect(village.startupNote).toMatch(/fresh|backup/i);
  });

  it('has no startup note on a clean first run', async () => {
    sandbox = await makeSandbox();
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    expect(village.startupNote).toBeNull();
  });

  it('lists files it could not import without failing', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('fine', skillFixture('fine'));
    await sandbox.writeSkill('broken', 'no frontmatter here\n');
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    expect(Object.keys(village.getState().creatures)).toEqual(['skill:fine']);
    expect(village.getState().problems).toHaveLength(1);
  });
});

describe('refresh', () => {
  it('moves in a skill added after startup', async () => {
    sandbox = await makeSandbox();
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    expect(Object.keys(village.getState().creatures)).toEqual([]);

    await sandbox.writeSkill('latecomer', skillFixture('latecomer'));
    await village.refresh();
    expect(Object.keys(village.getState().creatures)).toEqual(['skill:latecomer']);
  });

  it('auto-releases a deleted skill and archives its last-known copy', async () => {
    sandbox = await makeSandbox();
    const body = skillFixture('doomed', 'These are its last words.');
    const file = await sandbox.writeSkill('doomed', body);
    village = await createVillage({ paths: sandbox.paths, now: clock().now });

    await rm(file, { recursive: true });
    await village.refresh();

    expect(village.getState().creatures['skill:doomed']).toBeUndefined();
    expect(await readArchived(sandbox.paths, 'skill', 'doomed')).toBe(body);
  });

  it('writes events to the log', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('logged', skillFixture('logged'));
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    const events = await readEvents(sandbox.paths);
    expect(events.map((e) => e.type)).toContain('moved-in');
  });

  it('notifies subscribers', async () => {
    sandbox = await makeSandbox();
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    let notified = 0;
    village.subscribe(() => { notified += 1; });

    await sandbox.writeSkill('noisy', skillFixture('noisy'));
    await village.refresh();
    expect(notified).toBeGreaterThan(0);
  });

  it('archives the file\'s final content, not the content it had when first imported', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('evolving', skillFixture('evolving', 'FIRST VERSION'));
    village = await createVillage({ paths: sandbox.paths, now: clock().now });

    const file = await sandbox.writeSkill('evolving', skillFixture('evolving', 'SECOND VERSION'));
    await village.refresh();

    await rm(file, { recursive: true });
    await village.refresh();

    const archived = await readArchived(sandbox.paths, 'skill', 'evolving');
    expect(archived).toContain('SECOND VERSION');
    expect(archived).not.toContain('FIRST VERSION');
  });
});

describe('care', () => {
  it('raises bond and mood', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('petted', skillFixture('petted'));
    village = await createVillage({ paths: sandbox.paths, now: clock().now });

    const before = village.getState().creatures['skill:petted']!.stats;
    await village.care('skill:petted', 'pet');
    const after = village.getState().creatures['skill:petted']!.stats;
    expect(after.bond).toBeGreaterThan(before.bond);
    expect(after.mood).toBeGreaterThan(before.mood);
  });

  it('rejects an unknown creature', async () => {
    sandbox = await makeSandbox();
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    await expect(village.care('skill:ghost', 'pet')).rejects.toThrow(/not found|unknown/i);
  });

  it('refuses verbs that care does not handle itself', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('x', skillFixture('x'));
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    // 'chat' is a real CareVerb — the type system allows it and the runtime refuses
    // it, since chatting goes through chat() (its own endpoint), not care().
    await expect(village.care('skill:x', 'chat')).rejects.toThrow(/not available/i);
  });

  it('logs a cared-for event', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('y', skillFixture('y'));
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    await village.care('skill:y', 'play');
    const events = await readEvents(sandbox.paths);
    expect(events.map((e) => e.type)).toContain('cared-for');
  });
});

describe('tick', () => {
  it('decays creatures as the clock advances', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('waiting', skillFixture('waiting'));
    const time = clock();
    village = await createVillage({ paths: sandbox.paths, now: time.now });

    const before = village.getState().creatures['skill:waiting']!.stats.mood;
    time.advance(24 * MS_PER_HOUR);
    await village.tick();
    expect(village.getState().creatures['skill:waiting']!.stats.mood).toBeLessThan(before);
  });

  it('applies away-time on restart, so a village left alone comes back scruffy', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('abandoned', skillFixture('abandoned'));
    const first = await createVillage({ paths: sandbox.paths, now: clock(0).now });
    const fresh = first.getState().creatures['skill:abandoned']!.stats.mood;
    await first.close();

    village = await createVillage({ paths: sandbox.paths, now: clock(72 * MS_PER_HOUR).now });
    await village.tick();
    expect(village.getState().creatures['skill:abandoned']!.stats.mood).toBeLessThan(fresh);
  });
});

describe('chat', () => {
  /** A card the persona parser accepts, for tests that stub the service by hand. */
  const CARD = JSON.stringify({
    nickname: 'Mo', temperament: 'placid', voice: 'soft',
    quirks: [], likes: [], dislikes: [], lines: ['mm.'],
  });
  /** Persona prompts and chat prompts arrive at the same door; this tells them apart. */
  const isChat = (prompt: string) => prompt.includes('The player says to you');

  it('answers in the creature voice and writes persona on first contact', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('code-review', skillFixture('code-review'));
    let llmState = defaultLlmState(1_000);
    const service = createLlmService({
      command: fakeCliCommand('card'),
      now: () => 1_000,
      getLlm: () => llmState,
      setLlm: async (n) => { llmState = n; },
    });
    await service.probe();
    village = await createVillage({ paths: sandbox.paths, now: () => 1_000, llm: service });

    const reply = await village.chat('skill:code-review', 'hello!');
    expect(reply.source).toBe('llm');

    const creature = village.getState().creatures['skill:code-review']!;
    expect(creature.nickname).toBe('Nit');
    expect(creature.personality?.temperament).toBe('a fastidious detective');
    expect(creature.cannedLines?.length).toBe(20);
    // chat is a care verb: mood +6, bond +6, xp +5 over the starting stats
    expect(creature.stats.bond).toBe(16);
  });

  it('falls back to a canned line when the model refuses, and still applies care', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('tdd', skillFixture('tdd'));
    village = await createVillage({ paths: sandbox.paths, now: () => 1_000 }); // no llm option: silent stub

    const before = village.getState().creatures['skill:tdd']!.stats.bond;
    const reply = await village.chat('skill:tdd', 'hello?');
    expect(reply.source).toBe('canned');
    expect(reply.text.length).toBeGreaterThan(0);
    expect(village.getState().creatures['skill:tdd']!.stats.bond).toBe(before + 6);
  });

  it('throws on an unknown creature', async () => {
    sandbox = await makeSandbox();
    village = await createVillage({ paths: sandbox.paths, now: () => 1_000 });
    await expect(village.chat('skill:ghost', 'hi')).rejects.toThrow('not found');
  });

  it('does not regenerate a persona that already exists', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('once', skillFixture('once'));
    let llmState = defaultLlmState(1_000);
    let calls = 0;
    const counting = createLlmService({
      command: fakeCliCommand('card'),
      now: () => 1_000,
      getLlm: () => llmState,
      setLlm: async (n) => { llmState = n; calls++; },
    });
    await counting.probe();
    village = await createVillage({ paths: sandbox.paths, now: () => 1_000, llm: counting });
    await village.chat('skill:once', 'first');
    const after = calls;
    await village.chat('skill:once', 'second');
    // Second chat spends exactly one more setLlm write (the chat call itself),
    // not two (persona + chat).
    expect(calls).toBe(after + 1);
  });

  it('keeps every token the service spent when it owns the ledger', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('ledger', skillFixture('ledger'));
    const built: LlmService[] = [];
    village = await createVillage({
      paths: sandbox.paths,
      now: () => 1_000,
      llmFactory: (hooks) => {
        const service = createLlmService({ command: fakeCliCommand('card'), ...hooks });
        built.push(service);
        return service;
      },
    });
    await built[0]!.probe();

    const reply = await village.chat('skill:ledger', 'hi there');
    expect(reply.source).toBe('llm');
    // Three model calls at the fake CLI's fixed 120/45 usage: the probe, the
    // persona card, and the chat itself. The chat commit spreads the state as
    // it stands *after* its own request, so the spend booked mid-request
    // survives instead of being rolled back by a stale snapshot.
    expect(village.getState().llm.ledger.interactiveIn).toBe(360);
    expect(village.getState().llm.ledger.interactiveOut).toBe(135);
  });

  it('does not undo a pet that lands while the model is thinking', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('busy', skillFixture('busy'));

    // A service that says when it has been asked and can be held open until the
    // test lets go, so the pet below lands in the exact window where the chat is
    // waiting on the model — which is where a stale copy would swallow it.
    let thinking = () => {};
    let letGo = () => {};
    let stall: Promise<void> = Promise.resolve();
    const stalling: LlmService = {
      probe: async () => 'full',
      mode: () => 'full',
      async request(req) {
        if (!isChat(req.prompt)) return { ok: true, text: CARD };
        thinking();
        await stall;
        return { ok: true, text: 'mm-hmm.' };
      },
    };
    village = await createVillage({ paths: sandbox.paths, now: () => 1_000, llm: stalling });

    await village.chat('skill:busy', 'first'); // persona written; bond 10 + 6 = 16

    const asked = new Promise<void>((resolve) => { thinking = resolve; });
    stall = new Promise<void>((resolve) => { letGo = resolve; });
    const talking = village.chat('skill:busy', 'second');
    await asked; // the creature has been read; the model is now thinking
    await village.care('skill:busy', 'pet'); // 16 + 2 = 18
    letGo();
    await talking; // 18 + 6 = 24, not 22 — the pet is not rolled back

    expect(village.getState().creatures['skill:busy']!.stats.bond).toBe(24);
  });

  it('answers from the pool when the service throws instead of refusing', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('unlucky', skillFixture('unlucky'));
    const throwing: LlmService = {
      probe: async () => 'full',
      mode: () => 'full',
      async request(req) {
        if (!isChat(req.prompt)) return { ok: true, text: CARD };
        // The service writes the ledger through the village's own commit, so a
        // disk failure surfaces as a throw from request() rather than an ok:false.
        throw new Error('the disk went away mid-request');
      },
    };
    village = await createVillage({ paths: sandbox.paths, now: () => 1_000, llm: throwing });

    const reply = await village.chat('skill:unlucky', 'hello?');
    expect(reply.source).toBe('canned');
    expect(reply.text).toBe('mm.'); // its own pool, not the stock line
    expect(village.getState().creatures['skill:unlucky']!.stats.bond).toBe(16);
  });

  it('survives a refresh that starts while the model is thinking', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('talker', skillFixture('talker'));

    let thinking = () => {};
    let letGo = () => {};
    let stall: Promise<void> = Promise.resolve();
    const stalling: LlmService = {
      probe: async () => 'full',
      mode: () => 'full',
      async request(req) {
        if (!isChat(req.prompt)) return { ok: true, text: CARD };
        thinking();
        await stall;
        return { ok: true, text: 'still here.' };
      },
    };
    village = await createVillage({ paths: sandbox.paths, now: () => 1_000, llm: stalling });
    await village.chat('skill:talker', 'first'); // persona written; bond 10 + 6 = 16

    // The watcher fires refresh() un-awaited, so it really does run alongside a
    // chat. updateShadow reads paths.shadowDir, so this getter says when the
    // refresh has finished scanning and is mirroring files — the window where a
    // reconcile built on a copy of the state read too early would revert things.
    const realShadowDir = sandbox.paths.shadowDir;
    let mirroring = () => {};
    const mirrored = new Promise<void>((resolve) => { mirroring = resolve; });
    Object.defineProperty(sandbox.paths, 'shadowDir', {
      configurable: true,
      get() { mirroring(); return realShadowDir; },
    });

    const asked = new Promise<void>((resolve) => { thinking = resolve; });
    stall = new Promise<void>((resolve) => { letGo = resolve; });
    const talking = village.chat('skill:talker', 'second');
    await asked; // the chat is waiting on the model
    const refreshing = village.refresh();
    await mirrored; // the refresh is past its scan
    letGo(); // so the chat commits from inside the refresh
    await Promise.all([talking, refreshing]);

    expect(village.getState().creatures['skill:talker']!.stats.bond).toBe(22);
  });

  it('writes one persona when two chats reach a stranger at once', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('twin', skillFixture('twin'));
    let cards = 0;
    const counting: LlmService = {
      probe: async () => 'full',
      mode: () => 'full',
      async request(req) {
        if (!isChat(req.prompt)) { cards += 1; return { ok: true, text: CARD }; }
        return { ok: true, text: 'hello yourself.' };
      },
    };
    village = await createVillage({ paths: sandbox.paths, now: () => 1_000, llm: counting });

    await Promise.all([village.chat('skill:twin', 'a'), village.chat('skill:twin', 'b')]);
    expect(cards).toBe(1);
    expect(village.getState().creatures['skill:twin']!.nickname).toBe('Mo');
  });

  it('rejects with "not found" when a creature departs mid-flight on its first, card-writing chat', async () => {
    sandbox = await makeSandbox();
    const file = await sandbox.writeSkill('vanishing', skillFixture('vanishing'));

    // Holds the *persona* call open (not the chat call) so the test can delete
    // the creature's file and refresh while ensurePersona is still in flight —
    // the exact window where `chat()` used to read state.creatures[id]! and
    // crash on undefined instead of surfacing the documented 'not found'.
    let thinking = () => {};
    let letGo = () => {};
    let stall: Promise<void> = Promise.resolve();
    const stalling: LlmService = {
      probe: async () => 'full',
      mode: () => 'full',
      async request(req) {
        if (isChat(req.prompt)) return { ok: true, text: 'should not be reached.' };
        thinking();
        await stall;
        return { ok: true, text: CARD };
      },
    };
    village = await createVillage({ paths: sandbox.paths, now: () => 1_000, llm: stalling });

    const asked = new Promise<void>((resolve) => { thinking = resolve; });
    stall = new Promise<void>((resolve) => { letGo = resolve; });
    const talking = village.chat('skill:vanishing', 'hello?');
    await asked; // the persona card request is in flight

    await rm(file, { recursive: true });
    await village.refresh(); // the creature is released while the persona flight is held open

    letGo(); // the card resolves; ensurePersona sees the creature is gone and skips its write

    await expect(talking).rejects.toThrow('not found');
  });
});

describe('ensurePersona (public prefetch surface)', () => {
  it('writes the card without applying any care', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('prefetch', skillFixture('prefetch'));
    let llmState = defaultLlmState(1_000);
    const service = createLlmService({
      command: fakeCliCommand('card'),
      now: () => 1_000,
      getLlm: () => llmState,
      setLlm: async (next) => { llmState = next; },
    });
    await service.probe();
    village = await createVillage({ paths: sandbox.paths, now: () => 1_000, llm: service });

    const before = village.getState().creatures['skill:prefetch']!.stats;
    await village.ensurePersona('skill:prefetch');

    const creature = village.getState().creatures['skill:prefetch']!;
    expect(creature.personality?.temperament).toBe('a fastidious detective');
    expect(creature.nickname).toBe('Nit');
    expect(creature.stats).toEqual(before);
  });

  it('quietly resolves for an unknown creature', async () => {
    sandbox = await makeSandbox();
    village = await createVillage({ paths: sandbox.paths, now: () => 1_000 });
    await expect(village.ensurePersona('skill:ghost')).resolves.toBeUndefined();
  });
});
