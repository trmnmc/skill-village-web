import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { CareVerb } from '@village/core';
import { remaining, type LlmConfig } from '../llm/ledger.js';
import { readEvents } from '../state/events.js';
import type { Village } from '../village.js';
import { parseChatRequest, lastUserMessage, chatCompletionJson, sseFrames } from '../robot/openai.js';

const ALL_CARE_VERBS: CareVerb[] = ['pet', 'play', 'chat', 'train'];

function isCareVerb(value: unknown): value is CareVerb {
  return typeof value === 'string' && (ALL_CARE_VERBS as string[]).includes(value);
}

/** Spec §5: the house is never mute, even with nobody home. */
const EMPTY_HOUSE_LINE =
  'Nobody lives in me yet. Open the village and drag a villager onto my little house, and I will be them.';
const MOVED_AWAY_LINE =
  'The villager who lived in me seems to have moved away. Drag someone new onto my house in the village.';

export interface AppOptions {
  /**
   * Requests per minute each client may spend on /v1 (the robot's voice).
   * 0 — the default — disables the guard entirely, so local play never
   * throttles; the public deploy arms it (6 r/min, the posture decided
   * 2026-08-25) because /v1 spends real API budget for anyone with the URL.
   */
  llmRatePerMinute?: number;
  /** Extra requests a client may burst beyond the steady rate (nginx burst=3). */
  llmBurst?: number;
  /** Clock for the refill maths; tests pin it. */
  now?: () => number;
}

/**
 * The whole API surface. Every route reads from the village runtime and every
 * mutation goes back through it, so the server has no state of its own.
 */
export async function createApp(village: Village, opts: AppOptions = {}): Promise<FastifyInstance> {
  // trustProxy: deployed, the server binds loopback behind the droplet's
  // proxy, so X-Forwarded-For is the only truthful client identity — without
  // it every visitor shares one rate bucket. A direct client could forge the
  // header, but the guard is only armed where the proxy is the only way in.
  const app = Fastify({ logger: false, trustProxy: true });
  // Awaited, not queued: a { websocket: true } route is only recognised once the
  // plugin has finished registering.
  await app.register(websocket);

  const { llmRatePerMinute = 0, llmBurst = 0, now = Date.now } = opts;
  const capacity = llmBurst + 1;
  const buckets = new Map<string, { tokens: number; at: number }>();

  /** Token bucket per client: capacity burst+1, refilling at the steady rate. */
  function allowShout(ip: string): boolean {
    if (llmRatePerMinute <= 0) return true;
    const t = now();
    // A public endpoint sees unbounded distinct IPs; full buckets are
    // indistinguishable from absent ones, so drop them rather than grow.
    if (buckets.size > 10_000) {
      for (const [key, b] of buckets) {
        if (b.tokens + ((t - b.at) * llmRatePerMinute) / 60_000 >= capacity) buckets.delete(key);
      }
    }
    const bucket = buckets.get(ip) ?? { tokens: capacity, at: t };
    bucket.tokens = Math.min(capacity, bucket.tokens + ((t - bucket.at) * llmRatePerMinute) / 60_000);
    bucket.at = t;
    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    buckets.set(ip, bucket);
    return allowed;
  }

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/v1/')) return;
    if (allowShout(request.ip)) return;
    return reply.code(429).send({
      error: {
        message: `Rate limit: ${llmRatePerMinute} requests per minute per client. Try again in a few seconds.`,
        type: 'rate_limit_error',
      },
    });
  });

  app.get('/api/health', async () => ({ ok: true, creatures: Object.keys(village.getState().creatures).length }));

  // The service mode lives on the llm service, not in the persisted state,
  // but every consumer of a state payload wants them together: the client's
  // silent-movie banner rides these frames and must never have to guess.
  const withMode = (state: ReturnType<Village['getState']>) => ({
    ...state,
    llm: { ...state.llm, mode: village.llmMode() },
    // In-memory, not persisted: the presence glow wants "is he talking right
    // now", which a saved timestamp from last week must never answer.
    robotLastTurnAt: village.robotActivityAt(),
  });

  app.get('/api/state', async () => ({
    ...withMode(village.getState()),
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

  app.post<{ Params: { id: string } }>('/api/creatures/:id/persona', async (request, reply) => {
    if (!village.getState().creatures[request.params.id]) {
      return reply.code(404).send({ error: `Creature not found: ${request.params.id}` });
    }
    // Prefetch: the panel calls this the moment it opens, so the card is
    // (being) written while the player types their first message. Failures
    // stay quiet — the chat path retries the card itself.
    await village.ensurePersona(request.params.id);
    return { creature: village.getState().creatures[request.params.id] ?? null };
  });

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
      let answer;
      try {
        answer = await village.chat(request.params.id, message);
      } catch (error) {
        // The pre-check above found the creature, but the persona flight it
        // triggers can outlast a concurrent refresh that releases it — an
        // honest 404, not a 500, is still the truth in that case.
        if ((error as Error).message.includes('not found')) {
          return reply.code(404).send({ error: `Creature not found: ${request.params.id}` });
        }
        throw error;
      }
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

  app.post('/api/refresh', async (request, reply) => {
    // Publicly reachable through the proxy, so the snapshot deploy must
    // refuse here — reconciling against a disk with no creature files would
    // release every villager.
    if (village.snapshot) {
      return reply.code(409).send({
        error: 'This village is a snapshot; a refresh would reconcile it against a disk that has none of its files.',
      });
    }
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
    socket.send(JSON.stringify({ type: 'state', state: withMode(village.getState()) }));
    const unsubscribe = village.subscribe((state) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'state', state: withMode(state) }));
      }
    });
    socket.on('close', unsubscribe);
  });

  const robotSnapshot = () => {
    const s = village.getState();
    const residentId = s.robot.residentId;
    return {
      residentId,
      resident: residentId ? s.creatures[residentId] ?? null : null,
      lastTurnAt: village.robotActivityAt(),
    };
  };

  app.get('/api/robot', async () => robotSnapshot());

  app.put<{ Body: { creatureId?: unknown } }>('/api/robot/resident', async (request, reply) => {
    const creatureId = request.body?.creatureId;
    if (creatureId !== null && typeof creatureId !== 'string') {
      return reply.code(400).send({ error: 'creatureId must be a creature id string, or null to move the resident out' });
    }
    try {
      await village.setRobotResident(creatureId);
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
    return robotSnapshot();
  });

  // ---- The robot shim: an OpenAI-compatible brain for the voice gateway ----
  // The gateway is configured with this server as its one "LLM provider"; it
  // never knows claude exists. Which creature answers is looked up per turn,
  // so a drag-and-drop swap changes the speaker mid-conversation (spec §5).

  app.get('/v1/models', async () => ({
    object: 'list',
    data: [{ id: 'skill-village-resident', object: 'model', created: 0, owned_by: 'skill-village' }],
  }));

  app.post('/v1/chat/completions', async (request, reply) => {
    // R1 fixture capture (spec §11): with the env set, every request body the
    // real gateway sends is kept verbatim, to be committed as test fixtures.
    const fixtureDir = process.env.SKILL_VILLAGE_ROBOT_FIXTURES;
    if (fixtureDir) {
      await mkdir(fixtureDir, { recursive: true });
      await writeFile(
        join(fixtureDir, `chat-${Date.now()}.json`),
        JSON.stringify(request.body, null, 2),
        'utf8',
      );
    }

    const parsed = parseChatRequest(request.body);
    const message = parsed ? lastUserMessage(parsed) : null;
    if (!parsed || message === null) {
      return reply
        .code(400)
        .send({ error: { message: 'Expected an OpenAI chat request with at least one user message.', type: 'invalid_request_error' } });
    }

    const residentId = village.getState().robot.residentId;
    let text: string;
    if (residentId === null) {
      text = EMPTY_HOUSE_LINE;
    } else {
      try {
        // Never mute (spec §5): chat() itself falls back to canned lines on
        // model failure or budget exhaustion, so every path out of here talks.
        text = (await village.chat(residentId, message, 'spoken')).text;
      } catch {
        // The resident's creature left the village while it lived here.
        text = MOVED_AWAY_LINE;
      }
    }

    const meta = {
      id: `chatcmpl-${Date.now().toString(36)}`,
      created: Math.floor(Date.now() / 1000),
      model: parsed.model ?? 'skill-village-resident',
    };

    if (parsed.stream) {
      reply.hijack();
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      for (const frame of sseFrames(text, meta)) reply.raw.write(frame);
      reply.raw.end();
      return;
    }
    return chatCompletionJson(text, meta);
  });

  return app;
}
