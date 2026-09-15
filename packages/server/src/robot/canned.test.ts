import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chirpPcm24k, createCannedAudio, CANNED_LINES, type CannedKind } from './canned.js';
import { fakeSpeaker } from './testing/fake-tts.js';
import { wavToPcm16 } from './audio.js';
import type { Speaker } from './tts.js';

async function collect(iter: AsyncIterable<Buffer>): Promise<Buffer> {
  const out: Buffer[] = [];
  for await (const chunk of iter) out.push(chunk);
  return Buffer.concat(out);
}

describe('chirpPcm24k', () => {
  it('is between 0.4 s and 1 s of 24 kHz mono PCM16', () => {
    const pcm = chirpPcm24k();
    expect(pcm.length % 2).toBe(0);
    const samples = pcm.length / 2;
    expect(samples).toBeGreaterThanOrEqual(0.4 * 24_000);
    expect(samples).toBeLessThanOrEqual(1.0 * 24_000);
  });

  it('is audible and does not click at either end', () => {
    const pcm = chirpPcm24k();
    let peak = 0;
    for (let i = 0; i < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
    expect(peak).toBeGreaterThan(3_000);
    expect(Math.abs(pcm.readInt16LE(0))).toBeLessThan(500);
    expect(Math.abs(pcm.readInt16LE(pcm.length - 2))).toBeLessThan(500);
  });

  it('is the same bytes every time', () => {
    expect(chirpPcm24k().equals(chirpPcm24k())).toBe(true);
  });
});

describe('createCannedAudio', () => {
  let dir: string;
  let logs: string[];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'village-canned-'));
    logs = [];
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('plays the chirp when there is no cache dir at all', async () => {
    const canned = createCannedAudio({ dir: null, log: (l) => logs.push(l) });
    expect(canned.has('stuck')).toBe(false);
    const heard = await collect(canned.play('stuck'));
    expect(heard.equals(chirpPcm24k())).toBe(true);
  });

  it('plays the chirp on a cache miss and the rendering after warm', async () => {
    const canned = createCannedAudio({ dir, log: (l) => logs.push(l) });
    expect(await collect(canned.play('stuck'))).toEqual(chirpPcm24k());

    const speaker = fakeSpeaker(480);
    const written = await canned.warm(speaker);
    expect(written).toBe(Object.keys(CANNED_LINES).length);
    expect(speaker.spoken).toEqual(Object.values(CANNED_LINES));
    expect(canned.has('stuck')).toBe(true);

    // The fake yields one 480-byte chunk per sentence; the cache holds them concatenated at 24 kHz.
    const heard = await collect(canned.play('stuck'));
    const sentences = CANNED_LINES.stuck.split(/[.!?]\s+|[.!?]$/).filter((s) => s.trim() !== '').length;
    expect(heard.length).toBe(480 * sentences);
    expect(heard.equals(chirpPcm24k())).toBe(false);

    const onDisk = wavToPcm16(await readFile(join(dir, 'stuck.wav')));
    expect(onDisk.sampleRate).toBe(24_000);
  });

  it('warm skips lines that are already cached', async () => {
    const canned = createCannedAudio({ dir, log: (l) => logs.push(l) });
    const first = fakeSpeaker();
    await canned.warm(first);
    const second = fakeSpeaker();
    expect(await canned.warm(second)).toBe(0);
    expect(second.spoken).toEqual([]);
  });

  it('warm is quiet when the voice fails: no throw, a log line, nothing cached', async () => {
    const canned = createCannedAudio({ dir, log: (l) => logs.push(l) });
    const broken: Speaker = {
      synthesize() {
        return (async function* () {
          throw new Error('no voice today');
          yield Buffer.alloc(0); // eslint-disable-line no-unreachable
        })();
      },
    };
    await expect(canned.warm(broken)).resolves.toBe(0);
    expect(canned.has('stuck')).toBe(false);
    expect(logs.some((l) => /no voice today/.test(l))).toBe(true);
  });

  it('falls back to the chirp when a cached file is unreadable', async () => {
    const canned = createCannedAudio({ dir, log: (l) => logs.push(l) });
    await writeFile(join(dir, 'didnt_catch.wav'), Buffer.from('this is not a wav'));
    expect(canned.has('didnt_catch')).toBe(true);
    const heard = await collect(canned.play('didnt_catch' as CannedKind));
    expect(heard.equals(chirpPcm24k())).toBe(true);
    expect(logs.some((l) => /didnt_catch/.test(l))).toBe(true);
  });
});
