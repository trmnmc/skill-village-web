import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { ShowroomEvent, VillagePayload } from './state.js';
import type { ShowroomRuntime } from './runtime.js';

/** One notification's worth of socket frames. Pure, so the shape is testable. */
export function wsFrames(payload: VillagePayload, fresh: ShowroomEvent[]): string[] {
  const frames = [JSON.stringify({ type: 'village', village: payload })];
  for (const e of fresh) {
    if (e.type === 'hatched') frames.push(JSON.stringify({ type: 'hatch', slug: e.slug, name: e.name }));
  }
  return frames;
}

/**
 * The whole spectator API: two GETs and a socket. Read-only and anonymous —
 * no cookies, no per-visitor state; nginx serves the static bundle in front.
 */
export async function createShowroomApp(runtime: ShowroomRuntime): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(websocket);

  app.get('/api/health', async () => ({ ok: true, villagers: runtime.getPayload().counts.villagers }));

  app.get('/api/village', async (_request, reply) => {
    reply.header('cache-control', 'public, max-age=30');
    return runtime.getPayload();
  });

  app.get('/ws', { websocket: true }, (socket) => {
    for (const frame of wsFrames(runtime.getPayload(), [])) socket.send(frame);
    const unsubscribe = runtime.subscribe((payload, fresh) => {
      if (socket.readyState !== socket.OPEN) return;
      for (const frame of wsFrames(payload, fresh)) socket.send(frame);
    });
    socket.on('close', unsubscribe);
  });

  return app;
}
