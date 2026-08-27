import { describe, it, expect, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { WebSocket } from 'ws';
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

  it('stamps the live llm mode onto the state payload', async () => {
    // The client's silent-movie banner rides the state frames now; a state
    // payload without the mode would read as full and hide a real outage.
    const silent = await boot(['tdd']); // no llm option: silent stub
    expect((await silent.inject({ method: 'GET', url: '/api/state' })).json().llm.mode).toBe('silent');
  });

  it('stamps full onto the state payload once the probe has succeeded', async () => {
    const app = await bootWithLlm(['tdd'], 'card');
    expect((await app.inject({ method: 'GET', url: '/api/state' })).json().llm.mode).toBe('full');
  });
});

describe('GET /ws', () => {
  it('stamps the live llm mode onto every websocket frame', async () => {
    const app = await boot(['tdd']); // no llm option: silent stub
    await app.listen({ port: 0, host: '127.0.0.1' });
    try {
      const port = (app.server.address() as { port: number }).port;
      const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const frame = await new Promise<{ type: string; state: { llm?: { mode?: string } } }>(
        (resolve, reject) => {
          socket.on('message', (raw) => resolve(JSON.parse(String(raw))));
          socket.on('error', reject);
        },
      );
      socket.close();
      expect(frame.type).toBe('state');
      expect(frame.state.llm?.mode).toBe('silent');
    } finally {
      await app.close();
    }
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

  it('409s on a snapshot village, whose disk must never decide who lives', async () => {
    // The public route stays reachable through the proxy, so on the deployed
    // snapshot it must refuse — a passer-by POSTing it would otherwise
    // reconcile the village against a disk with no creature files at all.
    sandbox = await makeSandbox();
    await sandbox.writeSkill('deployed', skillFixture('deployed'));
    const live = await createVillage({ paths: sandbox.paths, now: () => 1_000 });
    await live.close();
    await rm(join(sandbox.paths.userSkillsDir, 'deployed'), { recursive: true });

    village = await createVillage({ paths: sandbox.paths, now: () => 2_000, snapshot: true });
    const app = await createApp(village);
    const res = await app.inject({ method: 'POST', url: '/api/refresh' });
    expect(res.statusCode).toBe(409);
    expect(Object.keys(village.getState().creatures)).toEqual(['skill:deployed']);
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

describe('POST /api/creatures/:id/persona', () => {
  it('writes the card ahead of the first chat', async () => {
    const app = await bootWithLlm(['code-review'], 'card');
    const res = await app.inject({ method: 'POST', url: '/api/creatures/skill:code-review/persona' });
    expect(res.statusCode).toBe(200);
    expect(res.json().creature.personality.temperament).toBe('a fastidious detective');
  });

  it('answers 200 with no card when there is no model', async () => {
    const app = await boot(['tdd']);
    const res = await app.inject({ method: 'POST', url: '/api/creatures/skill:tdd/persona' });
    expect(res.statusCode).toBe(200);
    expect(res.json().creature.personality).toBeNull();
  });

  it('404s an unknown creature', async () => {
    const app = await boot([]);
    const res = await app.inject({ method: 'POST', url: '/api/creatures/skill:ghost/persona' });
    expect(res.statusCode).toBe(404);
  });
});

describe('the robot shim', () => {
  it('answers as the resident when one is set', async () => {
    const app = await bootWithLlm(['code-review'], 'ok');
    await village!.setRobotResident('skill:code-review');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { model: 'anything', messages: [{ role: 'user', content: 'who are you?' }] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.object).toBe('chat.completion');
    expect(body.choices[0].message.content).toContain('echo:');
  });

  it('an empty house still speaks', async () => {
    const app = await boot();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { messages: [{ role: 'user', content: 'hello?' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().choices[0].message.content).toContain('Nobody lives in me yet');
  });

  it('a resident whose creature has left the village gets the moved-away line', async () => {
    const app = await bootWithLlm(['code-review'], 'ok');
    await village!.setRobotResident('skill:code-review');
    // remove the skill file and refresh, the way the file's release tests do
    const file = join(sandbox!.paths.userSkillsDir, 'code-review', 'SKILL.md');
    await rm(file, { recursive: true });
    await village!.refresh();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { messages: [{ role: 'user', content: 'hello?' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().choices[0].message.content).toContain('moved away');
  });

  it('stream: true returns SSE frames ending in [DONE]', async () => {
    const app = await bootWithLlm(['code-review'], 'ok');
    await village!.setRobotResident('skill:code-review');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { stream: true, messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.body).toContain('chat.completion.chunk');
    expect(res.body.trimEnd().endsWith('data: [DONE]')).toBe(true);
  });

  it('malformed requests get an OpenAI-style 400', async () => {
    const app = await boot();
    const res = await app.inject({ method: 'POST', url: '/v1/chat/completions', payload: { nope: true } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.type).toBe('invalid_request_error');
  });

  it('/v1/models lists the one model the gateway can pick', async () => {
    const app = await boot();
    const res = await app.inject({ method: 'GET', url: '/v1/models' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].id).toBe('skill-village-resident');
  });
});

describe('the robot api', () => {
  it('round-trips the resident', async () => {
    const app = await boot(['code-review']);
    const empty = await app.inject({ method: 'GET', url: '/api/robot' });
    expect(empty.json()).toEqual({ residentId: null, resident: null, lastTurnAt: null });

    const set = await app.inject({
      method: 'PUT', url: '/api/robot/resident', payload: { creatureId: 'skill:code-review' },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json().residentId).toBe('skill:code-review');
    expect(set.json().resident.id).toBe('skill:code-review');

    const evict = await app.inject({ method: 'PUT', url: '/api/robot/resident', payload: { creatureId: null } });
    expect(evict.json().residentId).toBe(null);
  });

  it('404s an unknown creature and 400s a malformed body', async () => {
    const app = await boot();
    const unknown = await app.inject({
      method: 'PUT', url: '/api/robot/resident', payload: { creatureId: 'skill:nobody' },
    });
    expect(unknown.statusCode).toBe(404);
    const bad = await app.inject({ method: 'PUT', url: '/api/robot/resident', payload: {} });
    expect(bad.statusCode).toBe(400);
  });

  it('state frames carry the robot block and activity stamp', async () => {
    const app = await boot();
    const state = (await app.inject({ method: 'GET', url: '/api/state' })).json();
    expect(state.robot).toEqual({ residentId: null });
    expect(state.robotLastTurnAt).toBe(null);
  });
});

describe('the LLM rate limit', () => {
  // The public deploy is fully open, voice included (owner's call, 2026-08-25);
  // a 6 r/min + burst 3 throttle per client is the one guard that stays on.
  // The droplet's proxy cannot rate-limit, so the server carries the guard:
  // a burst of 4 passes, then one slot per 10 seconds.
  let clock = 0;

  async function bootLimited() {
    clock = 0;
    sandbox = await makeSandbox();
    village = await createVillage({ paths: sandbox.paths, now: () => 1_000 });
    return createApp(village, { llmRatePerMinute: 6, llmBurst: 3, now: () => clock });
  }

  const shout = (app: Awaited<ReturnType<typeof boot>>, ip = '203.0.113.7') =>
    app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      remoteAddress: ip,
      payload: { messages: [{ role: 'user', content: 'hello?' }] },
    });

  it('lets the burst through and refuses the next request with 429', async () => {
    const app = await bootLimited();
    for (let i = 0; i < 4; i++) expect((await shout(app)).statusCode).toBe(200);
    const refused = await shout(app);
    expect(refused.statusCode).toBe(429);
    expect(refused.json().error.type).toBe('rate_limit_error');
  });

  it('refills one slot every 10 seconds', async () => {
    const app = await bootLimited();
    for (let i = 0; i < 4; i++) await shout(app);
    expect((await shout(app)).statusCode).toBe(429);
    clock += 10_000;
    expect((await shout(app)).statusCode).toBe(200);
  });

  it('limits per client, not globally', async () => {
    const app = await bootLimited();
    for (let i = 0; i < 4; i++) await shout(app);
    expect((await shout(app)).statusCode).toBe(429);
    expect((await shout(app, '198.51.100.9')).statusCode).toBe(200);
  });

  it('keys a proxied client by X-Forwarded-For, not by the proxy', async () => {
    const app = await bootLimited();
    const proxied = (ip: string) =>
      app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        remoteAddress: '127.0.0.1',
        headers: { 'x-forwarded-for': ip },
        payload: { messages: [{ role: 'user', content: 'hello?' }] },
      });
    for (let i = 0; i < 4; i++) await proxied('203.0.113.7');
    expect((await proxied('203.0.113.7')).statusCode).toBe(429);
    expect((await proxied('198.51.100.9')).statusCode).toBe(200);
  });

  it('stays out of the way when no rate is configured', async () => {
    const app = await boot();
    for (let i = 0; i < 8; i++) {
      expect((await shout(app)).statusCode).toBe(200);
    }
  });
});

describe('PUT /api/creatures/:id/pin', () => {
  it('pins a creature and answers with the layout', async () => {
    const app = await boot(['pinned']);
    const res = await app.inject({
      method: 'PUT', url: '/api/creatures/skill:pinned/pin', payload: { x: 1500, y: 620 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().pins['skill:pinned']).toEqual({ x: 1500, y: 620 });
  });

  it('refuses coordinates that are not finite numbers', async () => {
    const app = await boot(['pinned']);
    for (const payload of [
      { x: 'left', y: 620 },
      { x: null, y: 620 },
      { x: 1, y: 1e9 },
      { x: 1 },
    ]) {
      const res = await app.inject({
        method: 'PUT', url: '/api/creatures/skill:pinned/pin', payload,
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('404s for a creature that does not exist', async () => {
    const app = await boot(['pinned']);
    const res = await app.inject({
      method: 'PUT', url: '/api/creatures/skill:ghost/pin', payload: { x: 1, y: 1 },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('the layout endpoints', () => {
  it('GET /api/layout reports the pins', async () => {
    const app = await boot(['pinned']);
    const res = await app.inject({ method: 'GET', url: '/api/layout' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ pins: {} });
  });

  it('POST /api/layout/reset clears them', async () => {
    const app = await boot(['pinned']);
    await app.inject({
      method: 'PUT', url: '/api/creatures/skill:pinned/pin', payload: { x: 1500, y: 620 },
    });
    const res = await app.inject({ method: 'POST', url: '/api/layout/reset' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ pins: {} });
  });

  it('carries pins on the state payload the client reads', async () => {
    const app = await boot(['pinned']);
    await app.inject({
      method: 'PUT', url: '/api/creatures/skill:pinned/pin', payload: { x: 1500, y: 620 },
    });
    const res = await app.inject({ method: 'GET', url: '/api/state' });
    expect(res.json().layout.pins['skill:pinned']).toEqual({ x: 1500, y: 620 });
  });
});
