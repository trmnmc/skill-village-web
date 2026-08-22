import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { CareVerb } from '@village/core';
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
