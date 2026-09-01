/**
 * Sentence-streamed TTS for the robot voice loop (plan Task 8).
 *
 * The sample-rate contract is load-bearing: every Speaker yields 24 kHz mono
 * PCM16 — one Buffer per sentence — because the audited firmware wav parser
 * plays ONLY 24000 Hz mono 16-bit. OpenAI's `response_format: 'pcm'` is
 * already 24 kHz; Piper output gets resampled here.
 *
 * Audio stays in RAM (spec §6): nothing in this module touches disk.
 */

import { spawn } from 'node:child_process';
import { resampleTo24k } from './audio.js';

/** Yields one Buffer of 24 kHz mono PCM16 per sentence. */
export interface Speaker {
  synthesize(text: string): AsyncIterable<Buffer>;
}

/** A sentence: has an ender (. ! ? …, plus stacked runs) and real content. */
const SENTENCE_END_RE = /[.!?…]["')\]”’»]*$/;
const HAS_WORD_RE = /[\p{L}\p{N}]/u;
/** Body up to an ender run, keeping the run and any closing quotes/parens. */
const SEGMENT_RE = /[^.!?…]*[.!?…]+["')\]”’»]*/g;

/**
 * Split text at sentence enders, keeping each delimiter (and its closing
 * quote/paren) with its sentence. A fragment — a piece with no ender or no
 * word character — shorter than 4 characters merges into the previous
 * sentence rather than becoming its own utterance. Whitespace is trimmed,
 * empties dropped; a single sentence with no terminator is one element.
 */
export function splitSentences(text: string): string[] {
  const pieces: string[] = [];
  let lastEnd = 0;
  for (const match of text.matchAll(SEGMENT_RE)) {
    pieces.push(match[0]);
    lastEnd = match.index + match[0].length;
  }
  if (lastEnd < text.length) pieces.push(text.slice(lastEnd));

  const out: string[] = [];
  for (const raw of pieces) {
    const piece = raw.trim();
    if (piece === '') continue;
    const isSentence = SENTENCE_END_RE.test(piece) && HAS_WORD_RE.test(piece);
    if (!isSentence && piece.length < 4 && out.length > 0) {
      out[out.length - 1] += ' ' + piece;
    } else {
      out.push(piece);
    }
  }
  return out;
}

export interface OpenAiSpeakerOpts {
  apiKey: string;
  voice?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * OpenAI TTS, one request per sentence. The returned iterable is lazy: the
 * request for sentence N+1 only starts when the consumer pulls it, so
 * sentence 2 synthesizes while sentence 1 plays — and a mid-reply failure
 * leaves the remaining sentences for the fallback.
 */
export function createOpenAiSpeaker(opts: OpenAiSpeakerOpts): Speaker {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const baseUrl = opts.baseUrl ?? 'https://api.openai.com/v1';
  const model = opts.model ?? 'gpt-4o-mini-tts';
  const voice = opts.voice ?? 'alloy';
  return {
    async *synthesize(text: string) {
      for (const sentence of splitSentences(text)) {
        const res = await fetchImpl(`${baseUrl}/audio/speech`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${opts.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ model, voice, input: sentence, response_format: 'pcm' }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`openai tts failed: ${res.status} ${body.slice(0, 200)}`);
        }
        // response_format 'pcm' is raw 24 kHz mono PCM16 — pass it verbatim.
        yield Buffer.from(await res.arrayBuffer());
      }
    },
  };
}

export interface PiperSpeakerOpts {
  exePath: string;
  modelPath: string;
  /** Piper voices are 22050 Hz unless the model card says otherwise. */
  sampleRate?: number;
}

/** One piper run: sentence in on stdin, raw PCM16 out on stdout. */
function runPiper(opts: PiperSpeakerOpts, sentence: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(opts.exePath, ['--model', opts.modelPath, '--output-raw']);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (err) => reject(new Error(`piper spawn failed: ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
      } else {
        const snippet = Buffer.concat(stderr).toString('utf8').slice(0, 200).trim();
        reject(new Error(`piper exited with code ${code}: ${snippet}`));
      }
    });
    child.stdin.on('error', () => {}); // a dying child may close stdin first; close reports the real error
    child.stdin.end(sentence + '\n');
  });
}

/**
 * Local Piper fallback, one process per sentence, resampled to the firmware's
 * 24 kHz contract. Lazy the same way the OpenAI speaker is.
 */
export function createPiperSpeaker(opts: PiperSpeakerOpts): Speaker {
  const sampleRate = opts.sampleRate ?? 22050;
  return {
    async *synthesize(text: string) {
      for (const sentence of splitSentences(text)) {
        const pcm = await runPiper(opts, sentence);
        yield samplesToBuffer(resampleTo24k(bufferToSamples(pcm), sampleRate));
      }
    },
  };
}

/** Little-endian PCM16 bytes → samples; safe for odd byteOffsets and lengths. */
function bufferToSamples(pcm: Buffer): Int16Array {
  const count = Math.floor(pcm.length / 2);
  const samples = new Int16Array(count);
  for (let i = 0; i < count; i++) samples[i] = pcm.readInt16LE(i * 2);
  return samples;
}

function samplesToBuffer(samples: Int16Array): Buffer {
  const out = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) out.writeInt16LE(samples[i]!, i * 2);
  return out;
}

/**
 * Primary with fallback, decided per synthesize() call. If the primary
 * throws before its first chunk, the fallback re-speaks the whole text; if
 * it throws mid-reply, the fallback covers the sentences not yet fully
 * yielded. onFallback fires once per switch; fallback errors propagate (the
 * loop's never-mute rule handles those).
 */
export function withFallback(primary: Speaker, fallback: Speaker, onFallback: (err: unknown) => void): Speaker {
  return {
    async *synthesize(text: string) {
      let yielded = 0;
      try {
        for await (const chunk of primary.synthesize(text)) {
          yield chunk;
          yielded++;
        }
        return;
      } catch (err) {
        onFallback(err);
      }
      const rest = yielded === 0 ? text : splitSentences(text).slice(yielded).join(' ');
      if (rest.trim() === '') return;
      yield* fallback.synthesize(rest);
    },
  };
}
