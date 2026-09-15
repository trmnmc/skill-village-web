import { EventEmitter } from 'node:events';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOpenAiSpeaker, createPiperSpeaker, type PiperChild } from './tts.js';

async function collect(iter: AsyncIterable<Buffer>): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for await (const chunk of iter) out.push(chunk);
  return out;
}

describe('createOpenAiSpeaker: timeout (delta gap 3)', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeEach(async () => {
    app = Fastify();
    app.post('/audio/speech', async (_req, reply) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return reply.header('content-type', 'application/octet-stream').send(Buffer.alloc(8));
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  });
  afterEach(() => app.close());

  it('rejects a sentence that does not come back within timeoutMs', async () => {
    const speaker = createOpenAiSpeaker({ apiKey: 'sk-test', baseUrl, fetchImpl: fetch, timeoutMs: 50 });
    await expect(collect(speaker.synthesize('Hello there.'))).rejects.toThrow(/timed out/);
  });
});

describe('createPiperSpeaker: timeout (delta gap 3)', () => {
  it('kills a piper that never finishes and rejects, naming the timeout', async () => {
    const child = new EventEmitter() as EventEmitter & PiperChild;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { on() {}, end() {} };
    child.kill = vi.fn(() => {
      child.emit('close', null);
      return true;
    });
    const spawnImpl = vi.fn(() => child);

    const speaker = createPiperSpeaker({ exePath: 'piper', modelPath: 'voice.onnx', timeoutMs: 50, spawnImpl });
    await expect(collect(speaker.synthesize('Hello there.'))).rejects.toThrow(/timed out/);
    expect(child.kill).toHaveBeenCalled();
    expect(spawnImpl).toHaveBeenCalledWith('piper', ['--model', 'voice.onnx', '--output-raw']);
  });
});
