import { describe, it, expect } from 'vitest';
import { hasVoicedSpeech, looksLikeSpeech } from './speech-guard.js';

const RATE = 16_000;

/** `ms` of a loud-ish sine wave at 16 kHz. */
function tone(ms: number, amplitude = 12_000): Int16Array {
  const pcm = new Int16Array(Math.round((ms / 1000) * RATE));
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(Math.sin(i / 8) * amplitude);
  return pcm;
}

/** `ms` of nothing. */
function silence(ms: number): Int16Array {
  return new Int16Array(Math.round((ms / 1000) * RATE));
}

function concat(...parts: Int16Array[]): Int16Array {
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe('hasVoicedSpeech', () => {
  it('hears nothing in silence', () => {
    expect(hasVoicedSpeech(silence(1000), { sampleRate: RATE })).toBe(false);
  });

  it('ignores a short click inside silence', () => {
    const pcm = concat(silence(400), tone(100, 30_000), silence(500));
    expect(hasVoicedSpeech(pcm, { sampleRate: RATE })).toBe(false);
  });

  it('hears a second of sustained sound', () => {
    expect(hasVoicedSpeech(tone(1000), { sampleRate: RATE })).toBe(true);
  });

  it('needs 300 ms of voiced windows by default, wherever they fall', () => {
    expect(hasVoicedSpeech(concat(silence(200), tone(250), silence(200)), { sampleRate: RATE })).toBe(false);
    expect(hasVoicedSpeech(concat(silence(200), tone(350), silence(200)), { sampleRate: RATE })).toBe(true);
    // Split across two bursts still adds up.
    expect(hasVoicedSpeech(concat(tone(200), silence(300), tone(200)), { sampleRate: RATE })).toBe(true);
  });

  it('honors a custom minimum', () => {
    expect(hasVoicedSpeech(tone(150), { sampleRate: RATE, minVoicedMs: 100 })).toBe(true);
    expect(hasVoicedSpeech(tone(150), { sampleRate: RATE, minVoicedMs: 500 })).toBe(false);
  });

  it('treats a quiet hum under the floor as silence', () => {
    expect(hasVoicedSpeech(tone(1000, 60), { sampleRate: RATE })).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(hasVoicedSpeech(new Int16Array(0), { sampleRate: RATE })).toBe(false);
  });
});

describe('looksLikeSpeech', () => {
  it('rejects empty and whitespace transcripts', () => {
    expect(looksLikeSpeech('')).toBe(false);
    expect(looksLikeSpeech('   ')).toBe(false);
  });

  it('rejects whisper tags and stage directions', () => {
    expect(looksLikeSpeech('[BLANK_AUDIO]')).toBe(false);
    expect(looksLikeSpeech('(silence)')).toBe(false);
    expect(looksLikeSpeech('[inaudible]')).toBe(false);
    expect(looksLikeSpeech('*music playing*')).toBe(false);
    expect(looksLikeSpeech('♪')).toBe(false);
  });

  it('rejects the classic silence ghosts', () => {
    expect(looksLikeSpeech('Thank you.')).toBe(false);
    expect(looksLikeSpeech('thank you')).toBe(false);
    expect(looksLikeSpeech('Thanks for watching!')).toBe(false);
    expect(looksLikeSpeech('Thank you for watching.')).toBe(false);
    expect(looksLikeSpeech('you')).toBe(false);
    expect(looksLikeSpeech('You.')).toBe(false);
    expect(looksLikeSpeech('Bye.')).toBe(false);
    expect(looksLikeSpeech('Subtitles by the Amara.org community')).toBe(false);
    expect(looksLikeSpeech('.')).toBe(false);
  });

  it('rejects a lone letter', () => {
    expect(looksLikeSpeech('a')).toBe(false);
  });

  it('accepts real sentences and short real answers', () => {
    expect(looksLikeSpeech('Hello robot, what time is it?')).toBe(true);
    expect(looksLikeSpeech('Who are you?')).toBe(true);
    expect(looksLikeSpeech('Okay.')).toBe(true);
    expect(looksLikeSpeech('No.')).toBe(true);
    expect(looksLikeSpeech('Thank you for the recipe, what is next?')).toBe(true);
  });
});
