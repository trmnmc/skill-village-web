import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDeviceClient, PlaybackInterruptedError } from './device.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('createDeviceClient: interrupts and timeouts (delta gaps 1 and 3)', () => {
  let app: FastifyInstance;
  let base: string;
  let posted: string[];

  beforeEach(async () => {
    posted = [];
    app = Fastify();
    app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
    // The hardened firmware refuses the rest of a session the owner tapped away.
    app.post<{ Querystring: { seq: string } }>('/play/pcm', async (req, reply) => {
      posted.push(req.url);
      if (Number(req.query.seq) >= 1) return reply.code(409).send({ success: false, error: 'interrupted' });
      return { success: true };
    });
    // A robot that fell off the Wi-Fi mid-request answers nobody in time.
    app.get('/audio/status', async () => {
      await sleep(300);
      return { mic_armed: false, recording_ready: false, playing: false };
    });
    app.get('/audio', async (_req, reply) => {
      await sleep(300);
      return reply.type('audio/wav').send(Buffer.from('RIFFlate'));
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  });
  afterEach(() => app.close());

  it('raises PlaybackInterruptedError when the robot refuses a session it interrupted', async () => {
    const dev = createDeviceClient({ baseUrl: base, token: 'sekrit' });
    async function* chunks() {
      yield Buffer.alloc(4);
      yield Buffer.alloc(4);
      yield Buffer.alloc(4);
    }
    await expect(dev.playPcm(chunks())).rejects.toBeInstanceOf(PlaybackInterruptedError);
    // seq 0 went through, seq 1 was refused, seq 2 never left the PC.
    expect(posted).toHaveLength(2);
  });

  it('reads a status call that never answers as offline', async () => {
    const dev = createDeviceClient({ baseUrl: base, token: 'sekrit', timeouts: { statusMs: 50 } });
    await expect(dev.status()).resolves.toMatchObject({ reachable: false });
  });

  it('rejects a pull that never answers, naming the timeout', async () => {
    const dev = createDeviceClient({ baseUrl: base, token: 'sekrit', timeouts: { pullMs: 50 } });
    await expect(dev.pullRecording()).rejects.toThrow(/timed out/);
  });
});
