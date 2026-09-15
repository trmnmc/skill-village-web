import { describe, it, expect, afterEach } from 'vitest';
import { makeSandbox, skillFixture, type Sandbox } from './testing/sandbox.js';
import { createVillage, type Village } from './village.js';
import { createLlmService } from './llm/service.js';
import { fakeCliCommand } from './llm/testing/fake.js';

const NOW = 1_700_000_000_000;

let sandbox: Sandbox | null = null;
let village: Village | null = null;

afterEach(async () => {
  await village?.close();
  village = null;
  await sandbox?.cleanup();
  sandbox = null;
});

async function boot(behaviour: string, serviceTimeoutMs?: number): Promise<Village> {
  sandbox = await makeSandbox();
  await sandbox.writeSkill('code-review', skillFixture('code-review'));
  village = await createVillage({
    paths: sandbox.paths,
    now: () => NOW,
    llmFactory: (hooks) =>
      createLlmService({
        command: fakeCliCommand(behaviour),
        ...hooks,
        ...(serviceTimeoutMs === undefined ? {} : { timeoutMs: serviceTimeoutMs }),
      }),
  });
  await village.probeLlm();
  return village;
}

describe('spoken memory (delta gap 5)', () => {
  it('folds earlier turns into the prompt ahead of the new line', async () => {
    const v = await boot('inspect');
    const reply = await v.chat('skill:code-review', 'and after that?', 'spoken', {
      history: [
        { player: 'how do I start?', you: 'Read the diff top to bottom first.' },
        { player: 'then?', you: 'Look for the change that has no test.' },
      ],
    });
    expect(reply.source).toBe('llm');
    const seen = JSON.parse(reply.text) as { prompt: string };
    expect(seen.prompt).toContain('Earlier in this conversation');
    expect(seen.prompt).toContain('how do I start?');
    expect(seen.prompt).toContain('Read the diff top to bottom first.');
    expect(seen.prompt).toContain('Look for the change that has no test.');
    // The new line comes after the history, so the model answers it, not the past.
    expect(seen.prompt.indexOf('Look for the change that has no test.')).toBeLessThan(seen.prompt.indexOf('and after that?'));
  });

  it('sends no history block when there is none', async () => {
    const v = await boot('inspect');
    const reply = await v.chat('skill:code-review', 'hello', 'spoken', { history: [] });
    const seen = JSON.parse(reply.text) as { prompt: string };
    expect(seen.prompt).not.toContain('Earlier in this conversation');
  });
});

describe('spoken brain timeout (delta gap 3)', () => {
  it('a per-request timeout beats the service default and lands on a canned line', async () => {
    // Card the creature first, so the only model call left in chat() is the
    // reply itself (the loop warms the persona at move-in for the same reason).
    const first = await boot('card');
    await first.ensurePersona('skill:code-review');
    await first.close();
    village = null;

    // Same save, a brain that answers the probe and then hangs every call.
    village = await createVillage({
      paths: sandbox!.paths,
      now: () => NOW,
      llmFactory: (hooks) =>
        createLlmService({ command: fakeCliCommand('probe-ok-else-hang'), ...hooks, timeoutMs: 30_000 }),
    });
    await village.probeLlm();

    const started = Date.now();
    const reply = await village.chat('skill:code-review', 'are you there?', 'spoken', { timeoutMs: 300 });
    expect(Date.now() - started).toBeLessThan(4_000);
    expect(reply.source).toBe('canned');
  });
});
