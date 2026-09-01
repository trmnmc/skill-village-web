/**
 * Pure PCM/WAV utilities for the robot voice path. No dependencies, no I/O:
 * audio lives in RAM only (spec §6). The firmware contract is PCM16 mono, so
 * everything here speaks Int16Array.
 */

interface FmtChunk {
  format: number;
  channels: number;
  sampleRate: number;
  bits: number;
}

/**
 * Parse a mono 16-bit PCM WAV. Walks the RIFF chunk list to find `fmt ` and
 * `data` — real recorders put LIST/INFO chunks in front, so a fixed 44-byte
 * layout cannot be assumed. Throws a descriptive error on anything that is
 * not PCM16 mono.
 */
export function wavToPcm16(wav: Buffer): { pcm: Int16Array; sampleRate: number } {
  if (wav.length < 12 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }

  let fmt: FmtChunk | null = null;
  let data: Buffer | null = null;
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      if (size < 16 || body + 16 > wav.length) throw new Error('wav fmt chunk is truncated');
      fmt = {
        format: wav.readUInt16LE(body),
        channels: wav.readUInt16LE(body + 2),
        sampleRate: wav.readUInt32LE(body + 4),
        bits: wav.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = wav.subarray(body, Math.min(body + size, wav.length));
    }
    offset = body + size + (size % 2); // RIFF chunks are word-aligned
  }

  if (fmt === null) throw new Error('wav has no fmt chunk');
  if (data === null) throw new Error('wav has no data chunk');
  if (fmt.format !== 1) throw new Error(`wav is not PCM (format ${fmt.format})`);
  if (fmt.channels !== 1) throw new Error(`wav is not mono (${fmt.channels} channels)`);
  if (fmt.bits !== 16) throw new Error(`wav is not 16-bit (${fmt.bits} bits per sample)`);

  const count = Math.floor(data.length / 2);
  const pcm = new Int16Array(count);
  for (let i = 0; i < count; i++) pcm[i] = data.readInt16LE(i * 2);
  return { pcm, sampleRate: fmt.sampleRate };
}

/** Serialize PCM16 mono samples as a canonical 44-byte-header WAV. */
export function pcm16ToWav(pcm: Int16Array, sampleRate: number): Buffer {
  const dataSize = pcm.length * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16); // fmt chunk size
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28); // byte rate
  wav.writeUInt16LE(2, 32); // block align
  wav.writeUInt16LE(16, 34); // bits per sample
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < pcm.length; i++) wav.writeInt16LE(pcm[i]!, 44 + i * 2);
  return wav;
}

/**
 * Cut leading and trailing silence. RMS is computed over 10ms windows; a
 * window below `threshold` (fraction of full scale) is silence. `padMs` of
 * margin stays on each side so the speech does not start clipped. All-silent
 * input returns an empty buffer — the loop treats that as "nothing said".
 */
export function trimSilence(
  pcm: Int16Array,
  opts?: { threshold?: number; padMs?: number; sampleRate?: number },
): Int16Array {
  const threshold = opts?.threshold ?? 0.004;
  const padMs = opts?.padMs ?? 120;
  const sampleRate = opts?.sampleRate ?? 16000;
  const win = Math.max(1, Math.round(sampleRate / 100)); // 10ms
  const floor = threshold * 32768;

  let firstLoud = -1;
  let lastLoud = -1;
  for (let start = 0; start < pcm.length; start += win) {
    const end = Math.min(start + win, pcm.length);
    let sum = 0;
    for (let i = start; i < end; i++) sum += pcm[i]! * pcm[i]!;
    if (Math.sqrt(sum / (end - start)) >= floor) {
      if (firstLoud < 0) firstLoud = start;
      lastLoud = end;
    }
  }
  if (firstLoud < 0) return new Int16Array(0);

  const pad = Math.round((padMs / 1000) * sampleRate);
  return pcm.slice(Math.max(0, firstLoud - pad), Math.min(pcm.length, lastLoud + pad));
}

/**
 * Resample to the firmware's 24000 Hz by linear interpolation. Good enough
 * for speech; identity (same buffer back) when the rate already matches.
 */
export function resampleTo24k(pcm: Int16Array, fromRate: number): Int16Array {
  if (fromRate === 24000) return pcm;
  const outLen = Math.round((pcm.length * 24000) / fromRate);
  const out = new Int16Array(outLen);
  if (pcm.length === 0) return out;

  const step = fromRate / 24000;
  const last = pcm.length - 1;
  for (let i = 0; i < outLen; i++) {
    const pos = i * step;
    const i0 = Math.min(Math.floor(pos), last);
    const i1 = Math.min(i0 + 1, last);
    const frac = pos - i0;
    out[i] = Math.round(pcm[i0]! * (1 - frac) + pcm[i1]! * frac);
  }
  return out;
}
