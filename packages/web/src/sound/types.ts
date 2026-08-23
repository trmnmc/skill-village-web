import type { VoiceParams } from './voice.js';

export type BusName = 'voices' | 'sfx' | 'ambience' | 'music';

/**
 * One fully-decided sound. The director computes these; the player only
 * rings them — the same relationship a baked grid has to the canvas.
 * `at` is seconds after "now"; `pan` is -1 left … 1 right.
 */
export type SoundCommand =
  | { patch: 'syllable'; bus: 'voices'; at: number; pan: number; gain: number;
      freq: number; vibrato: number; sineMix: number; breathy: boolean }
  | { patch: 'thump'; bus: 'sfx'; at: number; pan: number; gain: number;
      from: number; to: number; dur: number }
  | { patch: 'noiseBurst'; bus: 'sfx'; at: number; pan: number; gain: number;
      filter: 'bandpass' | 'highpass'; freq: number; q: number; dur: number }
  | { patch: 'breathSwell'; bus: 'sfx'; at: number; pan: number; gain: number; freq: number }
  | { patch: 'boxNote'; bus: 'sfx' | 'music'; at: number; pan: number; gain: number; freq: number }
  | { patch: 'blip'; bus: 'sfx'; at: number; pan: number; gain: number;
      from: number; to: number; dur: number }
  | { patch: 'tone'; bus: 'sfx'; at: number; pan: number; gain: number;
      freq: number; attack: number; decay: number };

/**
 * What the game tells the sound system. Position-bearing events carry a
 * world x so the director can pan and attenuate; voice-bearing events carry
 * the speaker's VoiceParams so the director needs no creature registry.
 */
export type GameSoundEvent =
  | { type: 'hop-landed'; x: number }
  | { type: 'takeoff'; x: number }
  | { type: 'touch-down'; x: number }
  | { type: 'sleep-start'; x: number; voice: VoiceParams }
  | { type: 'speak'; x: number; voice: VoiceParams; textLength: number; canned: boolean }
  | { type: 'greeting'; x: number; voice: VoiceParams }
  | { type: 'thinking'; x: number; voice: VoiceParams }
  | { type: 'bubble-in'; x: number }
  | { type: 'bubble-out'; x: number }
  | { type: 'chat-open' }
  | { type: 'chat-close' }
  | { type: 'chat-send' }
  | { type: 'moved-in'; x: number; voice: VoiceParams }
  | { type: 'stage-up'; x: number }
  | { type: 'offline' }
  | { type: 'reconnected' }
  | { type: 'idle-tick'; candidates: { id: string; x: number; voice: VoiceParams }[] };
