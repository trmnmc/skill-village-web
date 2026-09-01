import { describe, it, expect } from 'vitest';
import { wavToPcm16, pcm16ToWav, trimSilence, resampleTo24k } from './audio.js';

// --- synthesis helpers: every fixture is built here, nothing is read from disk ---

function sine(n: number, amplitude: number, freq = 440, rate = 16000): Int16Array {
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.round(amplitude * Math.sin((2 * Math.PI * freq * i) / rate));
  return out;
}

function silence(n: number): Int16Array {
  return new Int16Array(n);
}

function concat(...parts: Int16Array[]): Int16Array {
  const out = new Int16Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** One RIFF sub-chunk: id + size + body, padded to an even byte count. */
function chunk(id: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.write(id, 0, 'ascii');
  head.writeUInt32LE(body.length, 4);
  const pad = body.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0);
  return Buffer.concat([head, body, pad]);
}

function fmtChunk(opts?: { format?: number; channels?: number; rate?: number; bits?: number }): Buffer {
  const channels = opts?.channels ?? 1;
  const rate = opts?.rate ?? 16000;
  const bits = opts?.bits ?? 16;
  const body = Buffer.alloc(16);
  body.writeUInt16LE(opts?.format ?? 1, 0);
  body.writeUInt16LE(channels, 2);
  body.writeUInt32LE(rate, 4);
  body.writeUInt32LE((rate * channels * bits) / 8, 8);
  body.writeUInt16LE((channels * bits) / 8, 12);
  body.writeUInt16LE(bits, 14);
  return body;
}

function dataChunk(pcm: Int16Array): Buffer {
  const body = Buffer.alloc(pcm.length * 2);
  for (let i = 0; i < pcm.length; i++) body.writeInt16LE(pcm[i]!, i * 2);
  return chunk('data', body);
}

function wavFile(...chunks: Buffer[]): Buffer {
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(4 + body.length, 4);
  head.write('WAVE', 8, 'ascii');
  return Buffer.concat([head, body]);
}

describe('wavToPcm16', () => {
  it('reads a canonical 44-byte-header mono 16-bit WAV', () => {
    const pcm = sine(1000, 8000);
    const wav = wavFile(chunk('fmt ', fmtChunk({ rate: 22050 })), dataChunk(pcm));
    const parsed = wavToPcm16(wav);
    expect(parsed.sampleRate).toBe(22050);
    expect(Array.from(parsed.pcm)).toEqual(Array.from(pcm));
  });

  it('walks chunks: extra LIST and odd-sized chunks around fmt/data are skipped', () => {
    const pcm = sine(500, 6000);
    const wav = wavFile(
      chunk('LIST', Buffer.alloc(20, 0x41)),
      chunk('fmt ', fmtChunk()),
      chunk('junk', Buffer.from([1, 2, 3])), // odd size: word-aligned pad byte follows
      dataChunk(pcm),
    );
    const parsed = wavToPcm16(wav);
    expect(parsed.sampleRate).toBe(16000);
    expect(Array.from(parsed.pcm)).toEqual(Array.from(pcm));
  });

  it('rejects a buffer that is not RIFF/WAVE', () => {
    expect(() => wavToPcm16(Buffer.from('this is not audio at all'))).toThrow(/RIFF/);
  });

  it('rejects non-PCM formats', () => {
    const wav = wavFile(chunk('fmt ', fmtChunk({ format: 3 })), dataChunk(sine(10, 100)));
    expect(() => wavToPcm16(wav)).toThrow(/PCM/);
  });

  it('rejects stereo', () => {
    const wav = wavFile(chunk('fmt ', fmtChunk({ channels: 2 })), dataChunk(sine(10, 100)));
    expect(() => wavToPcm16(wav)).toThrow(/mono/);
  });

  it('rejects non-16-bit samples', () => {
    const wav = wavFile(chunk('fmt ', fmtChunk({ bits: 8 })), dataChunk(sine(10, 100)));
    expect(() => wavToPcm16(wav)).toThrow(/16/);
  });

  it('rejects a WAV with no data chunk', () => {
    const wav = wavFile(chunk('fmt ', fmtChunk()));
    expect(() => wavToPcm16(wav)).toThrow(/data/);
  });
});

describe('pcm16ToWav', () => {
  it('writes the canonical 44-byte header', () => {
    const pcm = sine(1000, 8000);
    const wav = pcm16ToWav(pcm, 16000);
    expect(wav.length).toBe(44 + 2000);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wav.readUInt16LE(20)).toBe(1); // PCM
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.readUInt32LE(28)).toBe(32000); // byte rate
    expect(wav.readUInt16LE(34)).toBe(16); // bits
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    expect(wav.readUInt32LE(40)).toBe(2000);
  });

  it('round-trips through wavToPcm16', () => {
    const pcm = sine(777, 12000);
    const parsed = wavToPcm16(pcm16ToWav(pcm, 24000));
    expect(parsed.sampleRate).toBe(24000);
    expect(Array.from(parsed.pcm)).toEqual(Array.from(pcm));
  });
});

describe('trimSilence', () => {
  const rate = 16000;
  const pad = Math.round((120 / 1000) * rate); // default padMs in samples

  it('cuts leading and trailing silence, keeps padMs of margin each side', () => {
    const voice = sine(4800, 8000); // 300ms
    const pcm = concat(silence(8000), voice, silence(8000)); // 500ms hush each side
    const trimmed = trimSilence(pcm);
    expect(trimmed.length).toBe(4800 + 2 * pad);
    expect(Array.from(trimmed.subarray(pad, pad + 4800))).toEqual(Array.from(voice));
  });

  it('treats quiet noise below the RMS threshold as silence', () => {
    const hiss = sine(8000, 50); // well under 0.004 full scale (~131)
    const voice = sine(4800, 8000);
    const trimmed = trimSilence(concat(hiss, voice, hiss));
    expect(trimmed.length).toBe(4800 + 2 * pad);
  });

  it('clamps the margin at the buffer edges', () => {
    const voice = sine(4800, 8000);
    const trimmed = trimSilence(concat(voice, silence(8000)));
    expect(trimmed.length).toBe(4800 + pad); // no room for a leading pad
    expect(Array.from(trimmed.subarray(0, 4800))).toEqual(Array.from(voice));
  });

  it('honours padMs 0 exactly', () => {
    const voice = sine(4800, 8000);
    const trimmed = trimSilence(concat(silence(8000), voice, silence(8000)), { padMs: 0 });
    expect(trimmed.length).toBe(4800);
  });

  it('returns an empty buffer when everything is silence', () => {
    expect(trimSilence(silence(16000)).length).toBe(0);
    expect(trimSilence(new Int16Array(0)).length).toBe(0);
  });
});

describe('resampleTo24k', () => {
  it('maps 22050 Hz to Math.round(n * 24000 / 22050) samples', () => {
    const pcm = sine(2205, 8000, 440, 22050);
    const out = resampleTo24k(pcm, 22050);
    expect(out.length).toBe(Math.round((2205 * 24000) / 22050));
  });

  it('is identity at 24000 Hz', () => {
    const pcm = sine(1000, 8000, 440, 24000);
    const out = resampleTo24k(pcm, 24000);
    expect(out.length).toBe(1000);
    expect(Array.from(out)).toEqual(Array.from(pcm));
  });

  it('interpolates linearly and clamps at the tail', () => {
    const out = resampleTo24k(Int16Array.from([0, 10]), 12000);
    expect(Array.from(out)).toEqual([0, 5, 10, 10]);
  });
});
