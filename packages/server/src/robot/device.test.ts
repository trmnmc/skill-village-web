import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDeviceClient } from './device.js';
import { createFakeDevice } from './testing/fake-device.js';

describe('createDeviceClient', () => {
  let app: FastifyInstance; let base: string; let seen: string[];
  beforeEach(async () => {
    seen = [];
    app = Fastify();
    // The real firmware accepts raw PCM bodies; without this parser Fastify
    // answers 415 to the client's application/octet-stream posts.
    app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
    app.addHook('onRequest', async (req, reply) => {
      seen.push(`${req.method} ${req.url}`);
      if (req.headers['x-robot-token'] !== 'sekrit') return reply.code(401).send({});
    });
    app.get('/audio/status', async () => ({ mic_armed: false, recording_ready: true, playing: false }));
    app.get('/audio', async (_r, reply) => reply.type('audio/wav').send(Buffer.from('RIFFfake')));
    app.post('/audio/session', async () => ({ session: 's1', token: 1234 }));
    app.post('/play/pcm', async () => ({ ok: true }));
    app.post('/face', async () => ({ ok: true }));
    app.post('/mic/arm', async () => ({ armed: true }));
    await app.listen({ port: 0, host: '127.0.0.1' });
    base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  });
  afterEach(() => app.close());

  it('sends the token and pulls a recording', async () => {
    const dev = createDeviceClient({ baseUrl: base, token: 'sekrit' });
    const status = await dev.status();
    expect(status).toMatchObject({ reachable: true, recordingReady: true });
    const wav = await dev.pullRecording();
    expect(wav?.toString()).toBe('RIFFfake');
  });

  it('streams pcm chunks through a session with seq and final', async () => {
    const dev = createDeviceClient({ baseUrl: base, token: 'sekrit' });
    async function* chunks() { yield Buffer.alloc(4); yield Buffer.alloc(4); }
    await dev.playPcm(chunks());
    const pcmCalls = seen.filter((s) => s.startsWith('POST /play/pcm'));
    expect(pcmCalls[0]).toContain('seq=0'); expect(pcmCalls.at(-1)).toContain('final=1');
    // The session id is minted client-side: POST /audio/session starts the
    // firmware's UDP transport and would wedge the HTTP chunk path as busy.
    expect(seen.some((s) => s.startsWith('POST /audio/session'))).toBe(false);
    expect(pcmCalls[0]).toMatch(/session=pc-/);
  });

  it('rejects on 401', async () => {
    const dev = createDeviceClient({ baseUrl: base, token: 'wrong' });
    await expect(dev.status()).resolves.toMatchObject({ reachable: false });
    await expect(dev.pullRecording()).rejects.toThrow(/unauthorized|401/i);
  });
});

describe('createFakeDevice', () => {
  it('reflects pushed recordings in status and clears them on pull', async () => {
    const fake = createFakeDevice();
    expect((await fake.status()).recordingReady).toBe(false);
    fake.pushRecording(Buffer.from('RIFFfake'));
    expect(await fake.status()).toMatchObject({ reachable: true, recordingReady: true });
    expect((await fake.pullRecording())?.toString()).toBe('RIFFfake');
    expect(await fake.pullRecording()).toBe(null);
    expect((await fake.status()).recordingReady).toBe(false);
  });

  it('collects played pcm chunks and face changes for inspection', async () => {
    const fake = createFakeDevice();
    async function* chunks() { yield Buffer.from('ab'); yield Buffer.from('cd'); }
    await fake.playPcm(chunks());
    expect(fake.playedPcm.map((b) => b.toString())).toEqual(['ab', 'cd']);
    await fake.setFace('happy');
    await fake.setFace('neutral');
    expect(fake.faces).toEqual(['happy', 'neutral']);
  });

  it('logs arm and disarm calls and flips micArmed', async () => {
    const fake = createFakeDevice();
    expect((await fake.status()).micArmed).toBe(false);
    await fake.arm();
    expect((await fake.status()).micArmed).toBe(true);
    await fake.disarm();
    expect((await fake.status()).micArmed).toBe(false);
    expect(fake.armedLog).toEqual([true, false]);
  });
});
