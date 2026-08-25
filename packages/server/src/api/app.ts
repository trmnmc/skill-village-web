import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { toCaseView, type CareVerb, type CaseView } from '@village/core';
import { remaining, type LlmConfig } from '../llm/ledger.js';
import type { LlmMode } from '../llm/service.js';
import { readEvents } from '../state/events.js';
import type { VillageState } from '../state/schema.js';
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

export interface ClientState {
  version: number;
  createdAt: number;
  updatedAt: number;
  creatures: VillageState['creatures'];
  problems: VillageState['problems'];
  llm: VillageState['llm'] & { mode: LlmMode };
  robot: VillageState['robot'];
  /** In-memory, not persisted: the presence glow wants "is he talking right
   * now", which a saved timestamp from last week must never answer. */
  robotLastTurnAt: number | null;
  startupNote: string | null;
  /** Today's case, or null. The rest of the gallery never leaves the server. */
  peddlerCase: CaseView | null;
  peddler: boolean;
}

/**
 * The only shape the browser ever sees. `gallery` holds the stock, the rejects,
 * the verdict history and the distilled style guide — the whole hidden engine —
 * so it is projected down to today's case here rather than spread wholesale.
 * Ship the raw state and anyone who opens devtools reads the entire trick.
 *
 * `toCaseView` narrows one step further, dropping each sketch's survival count:
 * a field named that would advertise the ladder all by itself.
 *
 * This absorbs what `withMode` used to do (stamping the live llm mode and the
 * in-memory robot activity timestamp onto the state) rather than coexisting
 * with a raw-state spread, since a spread now carries `gallery` along with it.
 */
export function toClientState(
  state: VillageState,
  extras: { startupNote: string | null; peddler: boolean; llmMode: LlmMode; robotLastTurnAt: number | null },
): ClientState {
  const open = state.gallery.case;
  return {
    version: state.version,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    creatures: state.creatures,
    problems: state.problems,
    llm: { ...state.llm, mode: extras.llmMode },
    robot: state.robot,
    robotLastTurnAt: extras.robotLastTurnAt,
    startupNote: extras.startupNote,
    peddlerCase: extras.peddler && open ? toCaseView(open) : null,
    peddler: extras.peddler,
  };
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

  // Every consumer of a state payload wants the same shape, so the extras a
  // route must supply live in one place.
  const clientState = () =>
    toClientState(village.getState(), {
      startupNote: village.startupNote,
      peddler: village.peddlerVisiting(),
      llmMode: village.llmMode(),
      robotLastTurnAt: village.robotActivityAt(),
    });

  app.get('/api/state', async () => clientState());

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

  app.post('/api/refresh', async () => {
    await village.refresh();
    return clientState();
  });

  app.post<{ Body: { sketchId?: unknown } }>('/api/gallery/cull', async (request, reply) => {
    const { sketchId } = request.body ?? {};
    if (typeof sketchId !== 'string' || !sketchId) {
      return reply.code(400).send({ error: 'Expected a sketchId.' });
    }

    const accepted = await village.cull(sketchId);
    const body = clientState();
    // A refused cull is a race with midnight or a double click, not a failure
    // the player should ever see. The client simply re-syncs from this body.
    return accepted ? body : reply.code(409).send(body);
  });

  app.get<{ Querystring: { since?: string; limit?: string } }>('/api/events', async (request) => {
    const { since, limit } = request.query;
    return readEvents(village.getPaths(), {
      since: since === undefined ? undefined : Number(since),
      limit: limit === undefined ? undefined : Number(limit),
    });
  });

  app.get('/ws', { websocket: true }, (socket) => {
    const frame = () => JSON.stringify({ type: 'state', state: clientState() });

    socket.send(frame());
    const unsubscribe = village.subscribe(() => {
      if (socket.readyState === socket.OPEN) socket.send(frame());
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
