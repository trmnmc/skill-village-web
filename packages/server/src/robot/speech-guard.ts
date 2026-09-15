/**
 * The no-speech guard in front of the brain (plan Task 10.5, delta R4,
 * option b). Two cheap questions: did the capture hold enough voiced audio
 * to be a person, and does whisper's transcript read like words a person
 * said? Whisper answers silence with confident ghosts — "Thank you.",
 * "you", "[BLANK_AUDIO]" — and a robot that repeats them speaks unprompted.
 * The sovereign-speech rule: he speaks only in answer to a deliberate act.
 */

export interface VoicedOpts {
  /** Default 16000 (the firmware's mic rate). */
  sampleRate?: number;
  /** RMS floor as a fraction of full scale; default 0.004, the same floor trimSilence uses. */
  threshold?: number;
  /** How much of the capture must sit above the floor, in total; default 300 ms. */
  minVoicedMs?: number;
}

/**
 * True when at least `minVoicedMs` worth of 10 ms windows carry energy
 * above the floor. The windows need not be contiguous: a pause between two
 * words still adds up, while a door slam (a loud 100 ms) does not.
 */
export function hasVoicedSpeech(pcm: Int16Array, opts?: VoicedOpts): boolean {
  const sampleRate = opts?.sampleRate ?? 16_000;
  const threshold = opts?.threshold ?? 0.004;
  const minVoicedMs = opts?.minVoicedMs ?? 300;
  const win = Math.max(1, Math.round(sampleRate / 100)); // 10 ms
  const floor = threshold * 32768;

  let voicedWindows = 0;
  for (let start = 0; start < pcm.length; start += win) {
    const end = Math.min(start + win, pcm.length);
    let sum = 0;
    for (let i = start; i < end; i++) sum += pcm[i]! * pcm[i]!;
    if (Math.sqrt(sum / (end - start)) >= floor) voicedWindows++;
  }
  return voicedWindows * 10 >= minVoicedMs;
}

/** Whole transcripts whisper produces for silence, after normalization. */
const GHOSTS = new Set([
  'you',
  'thank you',
  'thanks',
  'thank you very much',
  'thanks for watching',
  'thank you for watching',
  'thanks for listening',
  'thank you for listening',
  'bye',
  'goodbye',
  'the end',
]);

/** Credits whisper learned from subtitle corpora. */
const GHOST_PREFIXES = ['subtitles by', 'subtitle by', 'transcribed by', 'captions by', 'translated by'];

/**
 * True when the transcript reads like something a person said: not empty,
 * not a stage direction, not one of whisper's silence ghosts, and at least
 * two letters long. Real short answers ("Okay.", "No.") pass.
 */
export function looksLikeSpeech(transcript: string): boolean {
  const stripped = transcript
    .replace(/\[[^\]]*\]/g, ' ') // [BLANK_AUDIO], [inaudible]
    .replace(/\([^)]*\)/g, ' ') // (silence), (music)
    .replace(/\*[^*]*\*/g, ' ') // *music playing*
    .replace(/[♪♫]/g, ' ');
  const words = stripped
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w !== '');
  if (words.length === 0) return false;

  const text = words.join(' ');
  const letters = text.replace(/[^\p{L}\p{N}]/gu, '');
  if (letters.length < 2) return false;
  if (GHOSTS.has(text)) return false;
  if (GHOST_PREFIXES.some((prefix) => text.startsWith(prefix))) return false;
  return true;
}
