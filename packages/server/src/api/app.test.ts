import { describe, it, expect, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { CASE_SIZE } from '@village/core';
import { makeSandbox, skillFixture, type Sandbox } from '../testing/sandbox.js';
import { createVillage, type Village, type VillageOptions } from '../village.js';
import { defaultLlmState } from '../llm/ledger.js';
import { createLlmService } from '../llm/service.js';
import { fakeCliCommand } from '../llm/testing/fake.js';
import type { SketchArtist } from '../gallery/artist.js';
import { emptyState, type VillageState } from '../state/schema.js';
import { createApp, toClientState } from './app.js';

let sandbox: Sandbox | null = null;
let village: Village | null = null;

afterEach(async () => {
  await village?.close();
  village = null;
  await sandbox?.cleanup();
  sandbox = null;
});

async function boot(skills: string[] = [], opts: Partial<VillageOptions> = {}) {
  sandbox = await makeSandbox();
  for (const name of skills) await sandbox.writeSkill(name, skillFixture(name));
  village = await createVillage({ paths: sandbox.paths, now: () => 1_000, ...opts });
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

/** The peddler's case, drawn deterministically so a test can name its sketches. */
const PEDDLER_ROWS = ['.XXXXX.', 'XXXXXXX', 'XWWXWWX', 'XWWXWWX', 'XXXKXXX', 'XXXXXXX', '.DD.DD.'];

describe('the gallery is projected, not shipped', () => {
  it('sends the case and withholds every trace of the engine', () => {
    const veteran = {
      id: 'sketch-000001', rows: PEDDLER_ROWS, crown: 'none' as const, hue: '#e58c68',
      title: 'Small Hope', createdDay: '2026-08-22', survivals: 2,
    };
    const state: VillageState = {
      ...emptyState(0),
      gallery: {
        case: { day: '2026-08-22', sketches: [veteran], judged: false },
        stock: [], rejects: [], verdicts: [],
        styleGuide: 'wide low bodies keep losing',
        verdictsAtLastGuide: 0, nextSketchNumber: 4,
      },
    };
    const payload = JSON.stringify(toClientState(state, {
      startupNote: null, peddler: true, llmMode: 'silent', robotLastTurnAt: null,
    }));

    expect(payload).toContain('Small Hope');
    expect(payload).toContain('"peddler":true');
    for (const secret of [
      'styleGuide', 'stock', 'rejects', 'verdicts', 'nextSketchNumber',
      'survivals', 'createdDay', 'wide low bodies', 'judged',
    ]) {
      expect(payload).not.toContain(secret);
    }
  });

  it('still carries the creatures and the startup note', () => {
    const projected = toClientState(emptyState(0), {
      startupNote: 'a note', peddler: false, llmMode: 'silent', robotLastTurnAt: null,
    });
    expect(projected.startupNote).toBe('a note');
    expect(projected.creatures).toEqual({});
  });

  it('withholds the case when no peddler is visiting, even if one drew today', () => {
    const state: VillageState = {
      ...emptyState(0),
      gallery: {
        case: { day: '2026-08-22', sketches: [], judged: true },
        stock: [], rejects: [], verdicts: [], styleGuide: null,
        verdictsAtLastGuide: 0, nextSketchNumber: 1,
      },
    };
    const projected = toClientState(state, {
      startupNote: null, peddler: false, llmMode: 'silent', robotLastTurnAt: null,
    });
    expect(projected.peddlerCase).toBeNull();
  });
});

describe('POST /api/gallery/cull', () => {
  /** Always draws, so the case is deterministic and CASE_SIZE-long. */
  const artist: SketchArtist = {
    async draw({ count, gallery, day }) {
      return {
        sketches: Array.from({ length: count }, (_, i) => ({
          id: `sketch-${gallery.nextSketchNumber + i}`, rows: PEDDLER_ROWS, crown: 'none' as const,
          hue: '#e58c68', title: `t${i}`, createdDay: day, survivals: 0,
        })),
        nextNumber: gallery.nextSketchNumber + count,
      };
    },
    async distil() { return 'guide'; },
  };

  async function bootWithCase() {
    const app = await boot([], { artist });
    await village!.tick();
    await village!.settleGallery();
    return app;
  }

  it('accepts a cull the village accepts', async () => {
    const app = await bootWithCase();
    const sketchId = village!.getState().gallery.case!.sketches[0]!.id;
    const res = await app.inject({
      method: 'POST', url: '/api/gallery/cull', payload: { sketchId },
    });
    expect(res.statusCode).toBe(200);
  });

  it('answers a refused cull with 409 and the current case, never an error dialog', async () => {
    const app = await bootWithCase();
    // Culling an id not in today's case is refused without touching state -
    // the same shape a race with midnight or a double click produces.
    const res = await app.inject({
      method: 'POST', url: '/api/gallery/cull', payload: { sketchId: 'sketch-not-in-the-case' },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body).toHaveProperty('peddlerCase');
    expect(body.peddlerCase.sketches).toHaveLength(CASE_SIZE);
  });

  it('400s on a missing, empty, or non-string sketch id', async () => {
    const app = await boot();
    for (const payload of [{}, { sketchId: 42 }, { sketchId: '' }]) {
      const res = await app.inject({ method: 'POST', url: '/api/gallery/cull', payload });
      expect(res.statusCode).toBe(400);
    }
  });
});
