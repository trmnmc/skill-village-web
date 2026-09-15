import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWhisperTranscriber } from './asr.js';

describe('createWhisperTranscriber: timeout (delta gap 3)', () => {
  let app: FastifyInstance;
  let base: string;

  beforeEach(async () => {
    app = Fastify();
    // The client posts multipart; without a parser Fastify answers 415 before the route runs.
    app.addContentTypeParser(/^multipart\/form-data/, { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
    app.post('/inference', async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { text: 'too late' };
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  });
  afterEach(() => app.close());

  it('rejects when whisper does not answer within timeoutMs', async () => {
    const asr = createWhisperTranscriber({ serverUrl: base, timeoutMs: 50 });
    await expect(asr.transcribe(Buffer.from('RIFFfake'))).rejects.toThrow(/timed out/);
  });
});
