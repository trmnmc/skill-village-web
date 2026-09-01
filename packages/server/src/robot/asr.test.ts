import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AddressInfo } from 'node:net';
import { createWhisperTranscriber } from './asr.js';
import { fakeTranscriber } from './testing/fake-asr.js';
import { pcm16ToWav } from './audio.js';

/**
 * A throwaway stand-in for the whisper.cpp server: it swallows the raw
 * multipart body so the test can assert the exact wire contract whisper.cpp
 * expects — field name `file`, a WAV payload, temperature and json format.
 */
function whisperDouble() {
  const app = Fastify();
  const seen: { raw: Buffer | null } = { raw: null };
  app.addContentTypeParser('multipart/form-data', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });
  app.post('/inference', async (req) => {
    seen.raw = req.body as Buffer;
    return { text: ' hello there ' };
  });
  return { app, seen };
}

function baseUrl(app: FastifyInstance): string {
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

describe('createWhisperTranscriber', () => {
  const double = whisperDouble();
  const wav = pcm16ToWav(Int16Array.from({ length: 320 }, (_, i) => (i % 2 === 0 ? 5000 : -5000)), 16000);

  beforeAll(async () => {
    await double.app.listen({ port: 0, host: '127.0.0.1' });
  });
  afterAll(async () => {
    await double.app.close();
  });

  it('posts the WAV as multipart field "file" and returns the trimmed text', async () => {
    const t = createWhisperTranscriber({ serverUrl: baseUrl(double.app) });
    const text = await t.transcribe(wav);
    expect(text).toBe('hello there');

    const raw = double.seen.raw!;
    expect(raw).not.toBe(null);
    const parts = raw.toString('latin1');
    expect(parts).toMatch(/content-disposition:\s*form-data;\s*name="file";\s*filename="audio.wav"/i);
    expect(parts).toMatch(/content-type:\s*audio\/wav/i);
    expect(parts).toMatch(/name="temperature"[^]*?\r\n\r\n0\r\n/i);
    expect(parts).toMatch(/name="response_format"[^]*?\r\n\r\njson\r\n/i);
    expect(raw.includes(wav)).toBe(true); // the WAV bytes arrive intact
  });

  it('healthy() is true when the server answers at all', async () => {
    const t = createWhisperTranscriber({ serverUrl: baseUrl(double.app) });
    expect(await t.healthy()).toBe(true);
  });

  it('healthy() is false when the port is closed', async () => {
    const dead = Fastify();
    await dead.listen({ port: 0, host: '127.0.0.1' });
    const url = baseUrl(dead);
    await dead.close();
    const t = createWhisperTranscriber({ serverUrl: url });
    expect(await t.healthy()).toBe(false);
  });
});

describe('fakeTranscriber', () => {
  it('string form always returns that string', async () => {
    const t = fakeTranscriber('hello robot');
    expect(await t.transcribe(Buffer.from([1, 2, 3]))).toBe('hello robot');
    expect(await t.transcribe(Buffer.alloc(99))).toBe('hello robot');
  });

  it('record form keys by wav byte length, empty string when unknown', async () => {
    const t = fakeTranscriber({ '3': 'short one', '10': 'longer one' });
    expect(await t.transcribe(Buffer.from([1, 2, 3]))).toBe('short one');
    expect(await t.transcribe(Buffer.alloc(10))).toBe('longer one');
    expect(await t.transcribe(Buffer.alloc(7))).toBe('');
  });

  it('is always healthy', async () => {
    expect(await fakeTranscriber('x').healthy()).toBe(true);
  });
});
