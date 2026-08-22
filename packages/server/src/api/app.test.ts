import { describe, it, expect, afterEach } from 'vitest';
import { makeSandbox, skillFixture, type Sandbox } from '../testing/sandbox.js';
import { createVillage, type Village } from '../village.js';
import { defaultLlmState } from '../llm/ledger.js';
import { createLlmService } from '../llm/service.js';
import { fakeCliCommand } from '../llm/testing/fake.js';
import { createApp } from './app.js';

let sandbox: Sandbox | null = null;
let village: Village | null = null;

afterEach(async () => {
  await village?.close();
  village = null;
  await sandbox?.cleanup();
  sandbox = null;
});

async function boot(skills: string[] = []) {
  sandbox = await makeSandbox();
  for (const name of skills) await sandbox.writeSkill(name, skillFixture(name));
  village = await createVillage({ paths: sandbox.paths, now: () => 1_000 });
  return createApp(village);
}

/** Boots a village with a real (fake-CLI-backed) llm service, already probed. */
async function bootWithLlm(skills: string[], behaviour: string) {
  sandbox = await makeSandbox();
  for (const name of skills) await sandbox.writeSkill(name, skillFixture(name));
  let llmState = defaultLlmState(1_000);
  const llm = createLlmService({
    command: fakeCliCommand(behaviour),
    now: () => 1_000,
    getLlm: () => llmState,
    setLlm: async (next) => { llmState = next; },
  });
  await llm.probe();
  village = await createVillage({ paths: sandbox.paths, now: () => 1_000, llm });
  return createApp(village);
}

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const app = await boot();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });
});

describe('GET /api/state', () => {
  it('returns creatures and problems', async () => {
    const app = await boot(['code-review']);
    const res = await app.inject({ method: 'GET', url: '/api/state' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body.creatures)).toEqual(['skill:code-review']);
    expect(body.problems).toEqual([]);
  });

  it('includes the startup note field even when there is nothing to report', async () => {
    const app = await boot();
    const res = await app.inject({ method: 'GET', url: '/api/state' });
    expect(res.json()).toHaveProperty('startupNote');
  });
});

describe('GET /api/creatures', () => {
  it('returns an array sorted by id', async () => {
    const app = await boot(['zebra', 'alpha']);
    const res = await app.inject({ method: 'GET', url: '/api/creatures' });
    expect(res.json().map((c: { id: string }) => c.id)).toEqual(['skill:alpha', 'skill:zebra']);
  });
});

describe('GET /api/creatures/:id', () => {
  it('returns one creature', async () => {
    const app = await boot(['solo']);
    const res = await app.inject({ method: 'GET', url: '/api/creatures/skill:solo' });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe('skill:solo');
  });

  it('404s for a creature that does not exist', async () => {
    const app = await boot();
    const res = await app.inject({ method: 'GET', url: '/api/creatures/skill:ghost' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/not found/i);
  });
});

describe('POST /api/creatures/:id/care', () => {
  it('applies the verb and returns the updated creature', async () => {
    const app = await boot(['petted']);
    const before = village!.getState().creatures['skill:petted']!.stats.bond;
    const res = await app.inject({
      method: 'POST', url: '/api/creatures/skill:petted/care', payload: { verb: 'pet' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().stats.bond).toBeGreaterThan(before);
  });

  it('400s on a missing verb', async () => {
    const app = await boot(['x']);
    const res = await app.inject({ method: 'POST', url: '/api/creatures/skill:x/care', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('400s on a verb that is not a care verb at all', async () => {
    const app = await boot(['x']);
    const res = await app.inject({
      method: 'POST', url: '/api/creatures/skill:x/care', payload: { verb: 'defenestrate' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('409s on a verb that exists but care does not handle itself', async () => {
    const app = await boot(['x']);
    const res = await app.inject({
      method: 'POST', url: '/api/creatures/skill:x/care', payload: { verb: 'chat' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/not available/i);
  });

  it('404s for an unknown creature', async () => {
    const app = await boot();
    const res = await app.inject({
      method: 'POST', url: '/api/creatures/skill:ghost/care', payload: { verb: 'pet' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/refresh', () => {
  it('picks up a skill added since startup', async () => {
    const app = await boot();
    await sandbox!.writeSkill('newcomer', skillFixture('newcomer'));
    const res = await app.inject({ method: 'POST', url: '/api/refresh' });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json().creatures)).toEqual(['skill:newcomer']);
  });
});

describe('GET /api/events', () => {
  it('returns the log, most recent last', async () => {
    const app = await boot(['logged']);
    const res = await app.inject({ method: 'GET', url: '/api/events?limit=10' });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((e: { type: string }) => e.type)).toContain('moved-in');
  });
});

describe('POST /api/creatures/:id/chat', () => {
  it('chats and returns the updated creature', async () => {
    const app = await bootWithLlm(['code-review'], 'card');
    const res = await app.inject({
      method: 'POST',
      url: '/api/creatures/skill:code-review/chat',
      payload: { message: 'hello!' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.reply.source).toBe('llm');
    expect(body.creature.nickname).toBe('Nit');
  });

  it('404s an unknown creature', async () => {
    const app = await boot([]);
    const res = await app.inject({ method: 'POST', url: '/api/creatures/skill:ghost/chat', payload: { message: 'x' } });
    expect(res.statusCode).toBe(404);
  });

  it('400s a missing, empty, or oversized message', async () => {
    const app = await boot(['tdd']);
    for (const payload of [{}, { message: '' }, { message: 'x'.repeat(4001) }]) {
      const res = await app.inject({ method: 'POST', url: '/api/creatures/skill:tdd/chat', payload });
      expect(res.statusCode).toBe(400);
    }
  });

  it('still answers 200 with a canned line when there is no model', async () => {
    const app = await boot(['tdd']); // no llm -> silent stub
    const res = await app.inject({ method: 'POST', url: '/api/creatures/skill:tdd/chat', payload: { message: 'hi' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().reply.source).toBe('canned');
  });
});

describe('GET /api/llm and PATCH /api/llm/config', () => {
  it('reports mode, ledger and remaining budget', async () => {
    const app = await boot([]);
    const res = await app.inject({ method: 'GET', url: '/api/llm' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBe('silent');
    expect(body.config.interactiveCap).toBe(500_000);
    expect(body.remaining.autonomous).toBe(0); // disabled by default
  });

  it('patches config and rejects junk', async () => {
    const app = await boot([]);
    const ok = await app.inject({ method: 'PATCH', url: '/api/llm/config', payload: { autonomousEnabled: true } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().config.autonomousEnabled).toBe(true);

    for (const payload of [{ interactiveCap: -5 }, { interactiveCap: 'lots' }, { surprise: 1 }]) {
      const bad = await app.inject({ method: 'PATCH', url: '/api/llm/config', payload });
      expect(bad.statusCode).toBe(400);
    }
  });
});
