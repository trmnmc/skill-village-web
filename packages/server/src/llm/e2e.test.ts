import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { makeSandbox, skillFixture, type Sandbox } from '../testing/sandbox.js';
import { createVillage, type Village } from '../village.js';
import { createApp } from '../api/app.js';
import { createLlmService } from './service.js';
import { fakeCliCommand, resetFakeCli } from './testing/fake.js';

let sandbox: Sandbox | null = null;
let village: Village | null = null;

beforeEach(resetFakeCli);
afterEach(async () => {
  await village?.close();
  village = null;
  await sandbox?.cleanup();
  sandbox = null;
});

describe('the whole voice path', () => {
  it('chat names the creature, spends budget, survives the budget running out', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('code-review', skillFixture('code-review'));

    village = await createVillage({
      paths: sandbox.paths,
      now: () => Date.UTC(2026, 7, 22, 12, 0, 0),
      llmFactory: (hooks) => createLlmService({ command: fakeCliCommand('card'), ...hooks }),
    });
    await village.probeLlm();
    const app = await createApp(village);

    // 1. Chat: persona written, reply flows, ledger moves.
    const first = await app.inject({
      method: 'POST',
      url: '/api/creatures/skill:code-review/chat',
      payload: { message: 'hello!' },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().creature.nickname).toBe('Nit');

    const llm1 = (await app.inject({ method: 'GET', url: '/api/llm' })).json();
    expect(llm1.mode).toBe('full');
    // Date-independent stand-in for "the ledger moved": remaining() is a
    // function of Date.now() at the API edge, so on any UTC date after the
    // frozen village clock the day rolls over and remaining() reports a
    // fresh full budget, making a remaining-based assert flaky by wall
    // clock. The ledger fields the frozen clock actually wrote are not.
    expect(llm1.ledger.interactiveIn).toBeGreaterThan(0);

    // 2. Nickname reaches the state payload the browser renders from.
    const state = (await app.inject({ method: 'GET', url: '/api/state' })).json();
    expect(state.creatures['skill:code-review'].nickname).toBe('Nit');
    expect(state.llm.config.interactiveCap).toBe(500_000);

    // 3. Drain the budget through config, then chat again: canned, still 200.
    const drained = await app.inject({
      method: 'PATCH', url: '/api/llm/config', payload: { interactiveCap: 0 },
    });
    expect(drained.statusCode).toBe(200);
    const second = await app.inject({
      method: 'POST',
      url: '/api/creatures/skill:code-review/chat',
      payload: { message: 'still there?' },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().reply.source).toBe('canned');
    // The canned line comes from the pool the card wrote.
    expect(second.json().reply.text).toContain('canned line');
  });
});
