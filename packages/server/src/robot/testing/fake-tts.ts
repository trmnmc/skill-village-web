/**
 * Fake Speaker for loop and wiring tests: no audio, no network, no piper.
 * Records what it was asked to say and yields silence-sized buffers with the
 * real per-sentence cadence.
 */

import { splitSentences, type Speaker } from '../tts.js';

export function fakeSpeaker(bytesPerSentence?: number): Speaker & { spoken: string[] } {
  const size = bytesPerSentence ?? 480;
  const spoken: string[] = [];
  return {
    spoken,
    async *synthesize(text: string) {
      spoken.push(text);
      for (const _sentence of splitSentences(text)) {
        yield Buffer.alloc(size);
      }
    },
  };
}
