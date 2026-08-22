import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { CareVerb } from '@village/core';
import { remaining, type LlmConfig } from '../llm/ledger.js';
import { readEvents } from '../state/events.js';
import type { Village } from '../village.js';

const ALL_CARE_VERBS: CareVerb[] = ['pet', 'play', 'chat', 'train'];

function isCareVerb(value: unknown): value is CareVerb {
  return typeof value === 'string' && (ALL_CARE_VERBS as string[]).includes(value);
}

/**
 * The whole API surface. Every route reads from the village runtime and every
 * mutation goes back through it, so the server has no state of its own.
 */
export async function createApp(village: Village): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // Awaited, not queued: a { websocket: true } route is only recognised once the
  // plugin has finished registering.
  await app.register(websocket);

  app.get('/api/health', async () => ({ ok: true, creatures: Object.keys(village.getState().creatures).length }));

  app.get('/api/state', async () => ({
    ...village.getState(),
    startupNote: village.startupNote,
  }));

  app.get('/api/creatures', async () => {
    return Object.values(village.getState().creatures).sort((a, b) => a.id.localeCompare(b.id));
  });

  app.get<{ Params: { id: string } }>('/api/creatures/:id', async (request, reply) => {
    const creature = village.getState().creatures[request.params.id];
    if (!creature) return reply.code(404).send({ error: `Creature not found: ${request.params.id}` });
    return creature;
  });

  app.post<{ Params: { id: string }; Body: { verb?: unknown } }>(
    '/api/creatures/:id/care',
    async (request, reply) => {
      const { verb } = request.body ?? {};
      if (!isCareVerb(verb)) {
        return reply.code(400).send({
          error: `Unknown care verb. Expected one of: ${ALL_CARE_VERBS.join(', ')}.`,
        });
      }
      if (!village.getState().creatures[request.params.id]) {
        return reply.code(404).send({ error: `Creature not found: ${request.params.id}` });
      }

      try {
        await village.care(request.params.id, verb);
      } catch (error) {
        // The creature exists, so this can only be a verb the runtime refuses.
        return reply.code(409).send({ error: (error as Error).message });
      }
      return village.getState().creatures[request.params.id];
    },
  );

  app.post<{ Params: { id: string }; Body: { message?: unknown } }>(
    '/api/creatures/:id/chat',
    async (request, reply) => {
      const { message } = request.body ?? {};
      if (typeof message !== 'string' || message.trim() === '' || message.length > 4_000) {
        return reply.code(400).send({ error: 'message must be a non-empty string of at most 4000 characters' });
      }
      if (!village.getState().creatures[request.params.id]) {
        return reply.code(404).send({ error: `Creature not found: ${request.params.id}` });
      }
      const answer = await village.chat(request.params.id, message);
      return { reply: answer, creature: village.getState().creatures[request.params.id] };
    },
  );

  const llmSnapshot = () => {
    const s = village.getState();
    const at = Date.now();
    return {
      mode: village.llmMode(),
      ledger: s.llm.ledger,
      config: s.llm.config,
      remaining: {
        interactive: remaining(s.llm, 'interactive', at),
        autonomous: remaining(s.llm, 'autonomous', at),
      },
    };
  };

  app.get('/api/llm', async () => llmSnapshot());

  app.patch<{ Body: Record<string, unknown> }>('/api/llm/config', async (request, reply) => {
    const body = request.body ?? {};
    const patch: Partial<LlmConfig> = {};
    for (const [key, value] of Object.entries(body)) {
      if (key === 'interactiveCap' || key === 'autonomousCap') {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
          return reply.code(400).send({ error: `${key} must be a non-negative integer` });
        }
        patch[key] = value;
      } else if (key === 'autonomousEnabled') {
        if (typeof value !== 'boolean') return reply.code(400).send({ error: 'autonomousEnabled must be a boolean' });
        patch.autonomousEnabled = value;
      } else {
        return reply.code(400).send({ error: `Unknown config key: ${key}` });
      }
    }
    await village.setLlmConfig(patch);
    return llmSnapshot();
  });

  app.post('/api/refresh', async () => {
    await village.refresh();
    return village.getState();
  });

  app.get<{ Querystring: { since?: string; limit?: string } }>('/api/events', async (request) => {
    const { since, limit } = request.query;
    return readEvents(village.getPaths(), {
      since: since === undefined ? undefined : Number(since),
      limit: limit === undefined ? undefined : Number(limit),
    });
  });

  app.get('/ws', { websocket: true }, (socket) => {
    socket.send(JSON.stringify({ type: 'state', state: village.getState() }));
    const unsubscribe = village.subscribe((state) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'state', state }));
      }
    });
    socket.on('close', unsubscribe);
  });

  return app;
}
