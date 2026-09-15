/**
 * The never-mute bottom rung (spec §7, delta R1). When every voice is gone
 * — OpenAI down, Piper missing — the robot still makes a sound: a cached
 * rendering of a short line if one was warmed onto disk earlier, and
 * failing that a two-tone chirp made right here from arithmetic. The chirp
 * needs no file, no network and no process, so this rung cannot fall.
 *
 * The cache holds synthetic speech only: canned lines rendered by the TTS
 * chain, never a mic capture (spec §6 — mic audio never persists).
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pcm16ToWav, resampleTo24k, wavToPcm16 } from './audio.js';
import type { Speaker } from './tts.js';

export type CannedKind = 'stuck' | 'didnt_catch';

/** Short, in-character-ish, and true whenever they play. */
export const CANNED_LINES: Record<CannedKind, string> = {
  stuck: 'My voice is stuck. Give me a moment.',
  didnt_catch: "Sorry, I didn't catch that.",
};

const SAMPLE_RATE = 24_000;
const CHIRP_AMPLITUDE = 9_000;
const FADE_MS = 10;

let chirpCache: Buffer | null = null;

/**
 * About 0.6 s of a descending two-tone "uh-oh" at 24 kHz mono PCM16, faded
 * at every edge so it never clicks. Deterministic, so tests can compare
 * bytes; a fresh copy each call, so nobody can scribble on the cache.
 */
export function chirpPcm24k(): Buffer {
  if (chirpCache === null) {
    const notes: Array<{ hz: number; ms: number }> = [
      { hz: 660, ms: 220 },
      { hz: 0, ms: 60 },
      { hz: 494, ms: 300 },
    ];
    const total = notes.reduce((n, note) => n + Math.round((note.ms / 1000) * SAMPLE_RATE), 0);
    const pcm = new Int16Array(total);
    let at = 0;
    for (const note of notes) {
      const len = Math.round((note.ms / 1000) * SAMPLE_RATE);
      const fade = Math.min(Math.round((FADE_MS / 1000) * SAMPLE_RATE), Math.floor(len / 2));
      for (let i = 0; i < len; i++) {
        let envelope = 1;
        if (i < fade) envelope = i / fade;
        else if (i >= len - fade) envelope = (len - 1 - i) / fade;
        const wave = note.hz === 0 ? 0 : Math.sin((2 * Math.PI * note.hz * i) / SAMPLE_RATE);
        pcm[at + i] = Math.round(wave * envelope * CHIRP_AMPLITUDE);
      }
      at += len;
    }
    chirpCache = samplesToBuffer(pcm);
  }
  return Buffer.from(chirpCache);
}

export interface CannedAudio {
  /** 24 kHz mono PCM16 for the line: the cached rendering if there is one, else the chirp. Never throws. */
  play(kind: CannedKind): AsyncIterable<Buffer>;
  /** Render every line not yet cached through `speaker` onto disk. Best effort, quiet on failure; resolves to how many landed. */
  warm(speaker: Speaker): Promise<number>;
  /** Whether a rendering is on disk for the line (not whether it is readable). */
  has(kind: CannedKind): boolean;
}

/** `dir: null` means no disk at all — every play is the chirp. */
export function createCannedAudio(opts: { dir: string | null; log?: (line: string) => void }): CannedAudio {
  const log = opts.log ?? (() => {});
  const fileFor = (kind: CannedKind): string | null => (opts.dir === null ? null : join(opts.dir, `${kind}.wav`));

  return {
    has(kind) {
      const file = fileFor(kind);
      return file !== null && existsSync(file);
    },

    async *play(kind) {
      const file = fileFor(kind);
      if (file !== null && existsSync(file)) {
        try {
          const { pcm, sampleRate } = wavToPcm16(await readFile(file));
          yield samplesToBuffer(resampleTo24k(pcm, sampleRate));
          return;
        } catch (error) {
          log(`robot canned audio: ${kind} cache unreadable, chirping instead: ${String(error)}`);
        }
      }
      yield chirpPcm24k();
    },

    async warm(speaker) {
      if (opts.dir === null) return 0;
      let written = 0;
      for (const kind of Object.keys(CANNED_LINES) as CannedKind[]) {
        const file = fileFor(kind);
        if (file === null || existsSync(file)) continue;
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of speaker.synthesize(CANNED_LINES[kind])) chunks.push(chunk);
          await mkdir(opts.dir, { recursive: true });
          await writeFile(file, pcm16ToWav(bufferToSamples(Buffer.concat(chunks)), SAMPLE_RATE));
          written++;
        } catch (error) {
          log(`robot canned audio: could not render "${kind}": ${String(error)}`);
        }
      }
      return written;
    },
  };
}

function samplesToBuffer(samples: Int16Array): Buffer {
  const out = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) out.writeInt16LE(samples[i]!, i * 2);
  return out;
}

function bufferToSamples(pcm: Buffer): Int16Array {
  const count = Math.floor(pcm.length / 2);
  const samples = new Int16Array(count);
  for (let i = 0; i < count; i++) samples[i] = pcm.readInt16LE(i * 2);
  return samples;
}
