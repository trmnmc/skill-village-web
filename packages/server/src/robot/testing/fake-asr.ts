/**
 * Deterministic Transcriber for tests: no whisper server, no audio decoding.
 * CI spends no tokens and needs no hardware.
 */

import type { Transcriber } from '../asr.js';

/**
 * String form: every WAV transcribes to that string. Record form: keyed by
 * the WAV's byte length (stringified), unknown lengths transcribe to ''.
 */
export function fakeTranscriber(replies: Record<string, string> | string): Transcriber {
  return {
    async transcribe(wav) {
      if (typeof replies === 'string') return replies;
      return replies[String(wav.length)] ?? '';
    },
    async healthy() {
      return true;
    },
  };
}
