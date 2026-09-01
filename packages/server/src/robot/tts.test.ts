import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { splitSentences, createOpenAiSpeaker, createPiperSpeaker, withFallback, type Speaker } from './tts.js';
import { fakeSpeaker } from './testing/fake-tts.js';

async function collect(iter: AsyncIterable<Buffer>): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for await (const chunk of iter) out.push(chunk);
  return out;
}

describe('splitSentences', () => {
  it('splits on . ! ? and keeps each delimiter with its sentence', () => {
    expect(splitSentences('Hi! Two things. Ok?')).toEqual(['Hi!', 'Two things.', 'Ok?']);
  });

  it('keeps ellipsis and stacked enders whole', () => {
    expect(splitSentences('Wait... what?!')).toEqual(['Wait...', 'what?!']);
  });

  it('keeps a closing quote with its sentence', () => {
    expect(splitSentences('"Stop!" he said.')).toEqual(['"Stop!"', 'he said.']);
  });

  it('merges a trailing fragment shorter than 4 characters into the previous sentence', () => {
    expect(splitSentences('Go now. k')).toEqual(['Go now. k']);
  });

  it('returns a single element for input with no terminator', () => {
    expect(splitSentences('just a thought with no ending')).toEqual(['just a thought with no ending']);
  });

  it('trims whitespace and drops empties', () => {
    expect(splitSentences('  One.   Two more!  ')).toEqual(['One.', 'Two more!']);
    expect(splitSentences('   ')).toEqual([]);
  });
});

describe('createOpenAiSpeaker', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  let requests: Array<{ auth: string | undefined; body: Record<string, unknown> }>;

  beforeAll(async () => {
    app = Fastify();
    app.post('/audio/speech', async (req, reply) => {
      const body = req.body as Record<string, unknown>;
      requests.push({ auth: req.headers.authorization, body });
      if (typeof body.input === 'string' && body.input.startsWith('FAIL')) {
        return reply.code(500).send('kaboom from tts');
      }
      return reply
        .header('content-type', 'application/octet-stream')
        .send(Buffer.alloc(8, requests.length));
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (addr === null || typeof addr === 'string') throw new Error('no port');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    requests = [];
  });

  it('POSTs each sentence with auth header and pcm body fields, yielding one Buffer per sentence', async () => {
    const speaker = createOpenAiSpeaker({ apiKey: 'sk-test-123', baseUrl, fetchImpl: fetch });
    const chunks = await collect(speaker.synthesize('Hi! Two things. Ok?'));

    expect(chunks).toHaveLength(3);
    for (const chunk of chunks) expect(Buffer.isBuffer(chunk)).toBe(true);

    expect(requests).toHaveLength(3);
    expect(requests.map((r) => r.body.input)).toEqual(['Hi!', 'Two things.', 'Ok?']);
    for (const r of requests) {
      expect(r.auth).toBe('Bearer sk-test-123');
      expect(r.body.model).toBe('gpt-4o-mini-tts');
      expect(r.body.voice).toBe('alloy');
      expect(r.body.response_format).toBe('pcm');
    }
  });

  it('honors voice and model overrides', async () => {
    const speaker = createOpenAiSpeaker({
      apiKey: 'sk-test-123',
      voice: 'echo',
      model: 'tts-1',
      baseUrl,
      fetchImpl: fetch,
    });
    await collect(speaker.synthesize('One line.'));
    expect(requests[0]!.body.voice).toBe('echo');
    expect(requests[0]!.body.model).toBe('tts-1');
  });

  it('is lazy: the second request only fires when the consumer pulls the second chunk', async () => {
    const speaker = createOpenAiSpeaker({ apiKey: 'sk-test-123', baseUrl, fetchImpl: fetch });
    const it2 = speaker.synthesize('Hi! Two things. Ok?')[Symbol.asyncIterator]();

    expect(requests).toHaveLength(0);
    const first = await it2.next();
    expect(first.done).toBe(false);
    expect(requests).toHaveLength(1);
    const second = await it2.next();
    expect(second.done).toBe(false);
    expect(requests).toHaveLength(2);
    await it2.next();
    await it2.next();
    expect(requests).toHaveLength(3);
  });

  it('throws on a non-2xx response with status and body snippet', async () => {
    const speaker = createOpenAiSpeaker({ apiKey: 'sk-test-123', baseUrl, fetchImpl: fetch });
    await expect(collect(speaker.synthesize('FAIL loudly.'))).rejects.toThrow(/500.*kaboom from tts/s);
  });
});

describe('createPiperSpeaker', () => {
  it('rejects when the executable cannot be spawned', async () => {
    const speaker = createPiperSpeaker({
      exePath: 'definitely-not-piper-xyz-9000',
      modelPath: 'voice.onnx',
    });
    await expect(collect(speaker.synthesize('Hello.'))).rejects.toThrow(/ENOENT|spawn/i);
  });

  it('rejects on a non-zero exit with a stderr snippet', async () => {
    // node rejects piper's flags: "bad option: --model", exit code 9.
    const speaker = createPiperSpeaker({
      exePath: process.execPath,
      modelPath: 'voice.onnx',
    });
    await expect(collect(speaker.synthesize('Hello.'))).rejects.toThrow(/exited.*9.*bad option/s);
  });
});

describe('withFallback', () => {
  function throwingSpeaker(chunksBeforeThrow: number): Speaker {
    return {
      synthesize(text: string) {
        return (async function* () {
          const sentences = splitSentences(text);
          for (let i = 0; i < chunksBeforeThrow && i < sentences.length; i++) {
            yield Buffer.alloc(4, 7);
          }
          throw new Error('primary down');
        })();
      },
    };
  }

  it('falls back for the whole text when the primary throws before the first chunk', async () => {
    const fallback = fakeSpeaker();
    const errors: unknown[] = [];
    const speaker = withFallback(throwingSpeaker(0), fallback, (err) => errors.push(err));

    const chunks = await collect(speaker.synthesize('Hi! Two things. Ok?'));

    expect(chunks).toHaveLength(3);
    expect(fallback.spoken).toEqual(['Hi! Two things. Ok?']);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('primary down');
  });

  it('falls back for the remaining sentences when the primary throws after the first chunk', async () => {
    const fallback = fakeSpeaker();
    const errors: unknown[] = [];
    const speaker = withFallback(throwingSpeaker(1), fallback, (err) => errors.push(err));

    const chunks = await collect(speaker.synthesize('Hi! Two things. Ok?'));

    expect(chunks).toHaveLength(3); // 1 from primary + 2 from fallback
    expect(fallback.spoken).toEqual(['Two things. Ok?']);
    expect(errors).toHaveLength(1);
  });

  it('propagates fallback errors', async () => {
    const brokenFallback: Speaker = {
      synthesize() {
        return (async function* () {
          throw new Error('fallback down too');
          yield Buffer.alloc(0); // eslint-disable-line no-unreachable
        })();
      },
    };
    const speaker = withFallback(throwingSpeaker(0), brokenFallback, () => {});
    await expect(collect(speaker.synthesize('Hi there!'))).rejects.toThrow('fallback down too');
  });
});

describe('fakeSpeaker', () => {
  it('records synthesize input and yields one sized buffer per sentence', async () => {
    const fake = fakeSpeaker(16);
    const chunks = await collect(fake.synthesize('Hi! Two things. Ok?'));
    expect(chunks).toHaveLength(3);
    for (const chunk of chunks) {
      expect(chunk.length).toBe(16);
      expect(chunk.every((b) => b === 0)).toBe(true);
    }
    expect(fake.spoken).toEqual(['Hi! Two things. Ok?']);
  });

  it('defaults to 480 bytes per sentence', async () => {
    const fake = fakeSpeaker();
    const chunks = await collect(fake.synthesize('One thing.'));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.length).toBe(480);
  });
});
