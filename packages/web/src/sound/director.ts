import type { GameSoundEvent, SoundCommand } from './types.js';
import { babble, signaturePhrase, type Syllable, type VoiceParams } from './voice.js';

/**
 * The deciding half of the engine, spec §2: game events in, plain commands
 * out. Pure — state is threaded explicitly so every rule here is testable
 * without Web Audio API dependencies.
 */
export interface DirectorCtx {
  /** The Web Audio clock (currentTime in seconds), never wall time—cooldown math depends on it. */
  now: number;
  camX: number;
  viewW: number;
  /** False until the first user gesture. Locked events are dropped, never queued. */
  unlocked: boolean;
  rand: () => number;
}

export interface DirectorState {
  /** Last emission time per cooldown group ('chime' is the only one so far). */
  lastAt: Record<string, number>;
  /** End times of in-flight voice one-shots, for the 8-voice cap. */
  voiceEnds: number[];
  /** Per-creature Poisson deadline for idle chirps. */
  idleNextAt: Record<string, number>;
  /** The village-wide idle-chirp gap: at most one per 8s. */
  lastIdleAt: number;
}

export function initialDirectorState(): DirectorState {
  return { lastAt: {}, voiceEnds: [], idleNextAt: {}, lastIdleAt: -Infinity };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Spec §4's two spatial rules in one place: pan leans with distance from the
 * camera centre, and gain fades to nothing beyond ~1.4 screen-widths — the
 * audio version of "no landing puff for a landing nobody saw".
 */
export function panFor(x: number, camX: number, viewW: number): { pan: number; attenuation: number } {
  const d = (x - camX) / viewW;
  return {
    pan: clamp(d * 1.6, -1, 1),
    attenuation: clamp(1 - Math.abs(d) / 1.4, 0, 1),
  };
}

const CHIME_SPACING = 0.6;
const VOICE_CAP = 8;
const IDLE_VILLAGE_GAP = 8;
const IDLE_MEAN_WAIT = 45;

function syllableCommands(
  syllables: Syllable[], vp: VoiceParams, pan: number, att: number, gainMul: number, at = 0,
): SoundCommand[] {
  return syllables.map((s) => ({
    patch: 'syllable' as const,
    bus: 'voices' as const,
    at: at + s.at,
    pan,
    gain: s.gain * att * gainMul,
    freq: s.freq,
    vibrato: vp.vibrato,
    sineMix: vp.sineMix,
    breathy: vp.breathy,
  }));
}

/** How long a syllable batch occupies a voice slot, for the concurrency cap. */
const phraseEnd = (syllables: Syllable[], now: number, at = 0): number =>
  now + at + (syllables.length === 0 ? 0 : syllables[syllables.length - 1]!.at + 0.16);

export function direct(
  state: DirectorState, ev: GameSoundEvent, ctx: DirectorCtx,
): { state: DirectorState; commands: SoundCommand[] } {
  // Locked = dropped, spec §2: a village that "caught up" on unlock would be
  // a burst of noise. State is untouched so the first unlocked event starts clean.
  if (!ctx.unlocked) return { state, commands: [] };

  const spatial = (x: number) => panFor(x, ctx.camX, ctx.viewW);
  /** Push a chime-group emission out past the last one, spec §4's cooldown. */
  const chimeDelay = (): { at: number; next: DirectorState } => {
    const last = state.lastAt['chime'] ?? -Infinity;
    const at = Math.max(0, last + CHIME_SPACING - ctx.now);
    return { at, next: { ...state, lastAt: { ...state.lastAt, chime: ctx.now + at } } };
  };
  const activeVoices = state.voiceEnds.filter((end) => end > ctx.now).length;
  const trackVoice = (s: DirectorState, end: number): DirectorState => ({
    ...s,
    voiceEnds: [...s.voiceEnds.filter((e) => e > ctx.now), end],
  });

  switch (ev.type) {
    case 'hop-landed': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      return {
        state,
        commands: [
          { patch: 'thump', bus: 'sfx', at: 0, pan, gain: 0.22 * attenuation, from: 120, to: 52, dur: 0.12 },
          { patch: 'noiseBurst', bus: 'sfx', at: 0.12, pan, gain: 0.06 * attenuation, filter: 'bandpass', freq: 420, q: 0.8, dur: 0.09 },
        ],
      };
    }
    case 'takeoff': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      return {
        state,
        commands: [
          { patch: 'noiseBurst', bus: 'sfx', at: 0, pan, gain: 0.04 * attenuation, filter: 'bandpass', freq: 600, q: 0.7, dur: 0.25 },
        ],
      };
    }
    case 'touch-down': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      return {
        state,
        commands: [
          { patch: 'thump', bus: 'sfx', at: 0, pan, gain: 0.12 * attenuation, from: 120, to: 52, dur: 0.12 },
        ],
      };
    }
    case 'sleep-start': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      // The breath sits near §10's 480Hz, nudged by the sleeper's register.
      const freq = clamp(480 * (ev.voice.basePitch / 640), 350, 650);
      return {
        state,
        commands: [{ patch: 'breathSwell', bus: 'sfx', at: 0, pan, gain: 0.05 * attenuation, freq }],
      };
    }
    case 'speak': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      const syllables = babble(ev.voice, ev.textLength, ctx.rand);
      // Chat babble is never dropped by the cap — spec §7 — but it still occupies a slot.
      return {
        state: trackVoice(state, phraseEnd(syllables, ctx.now)),
        commands: syllableCommands(syllables, ev.voice, pan, attenuation, ev.canned ? 0.75 : 1),
      };
    }
    case 'greeting': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0 || activeVoices >= VOICE_CAP) return { state, commands: [] };
      const syllables = signaturePhrase(ev.voice);
      return {
        state: trackVoice(state, phraseEnd(syllables, ctx.now)),
        commands: syllableCommands(syllables, ev.voice, pan, attenuation, 1),
      };
    }
    case 'thinking': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      // §10: two syllables of the creature's own voice, an octave down, quiet.
      // Untracked and uncapped — this is chat-bound UI feedback, at most one per open chat.
      const blip: Syllable[] = [
        { at: 0, freq: ev.voice.basePitch * 0.5, gain: 0.06 },
        { at: 0.07, freq: ev.voice.basePitch * 0.5, gain: 0.06 },
      ];
      return { state, commands: syllableCommands(blip, ev.voice, pan, attenuation, 1) };
    }
    case 'bubble-in': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      return {
        state,
        commands: [{ patch: 'blip', bus: 'sfx', at: 0, pan, gain: 0.05 * attenuation, from: 520, to: 880, dur: 0.05 }],
      };
    }
    case 'bubble-out': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      return {
        state,
        commands: [{ patch: 'blip', bus: 'sfx', at: 0, pan, gain: 0.035 * attenuation, from: 880, to: 520, dur: 0.05 }],
      };
    }
    case 'chat-open':
      return { state, commands: [{ patch: 'thump', bus: 'sfx', at: 0, pan: 0, gain: 0.1, from: 320, to: 180, dur: 0.06 }] };
    case 'chat-close':
      return { state, commands: [{ patch: 'thump', bus: 'sfx', at: 0, pan: 0, gain: 0.07, from: 240, to: 150, dur: 0.06 }] };
    case 'chat-send':
      return { state, commands: [{ patch: 'noiseBurst', bus: 'sfx', at: 0, pan: 0, gain: 0.05, filter: 'highpass', freq: 1800, q: 0.7, dur: 0.03 }] };
    case 'moved-in': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      const { at, next } = chimeDelay();
      // §10: E5 then B5 120ms apart, then the newcomer introduces itself.
      // The chime always plays; the greeting is droppable when the cap is reached.
      const chimeCommands = [
        { patch: 'boxNote' as const, bus: 'sfx' as const, at, pan, gain: 0.05 * attenuation, freq: 659.25 },
        { patch: 'boxNote' as const, bus: 'sfx' as const, at: at + 0.12, pan, gain: 0.045 * attenuation, freq: 987.77 },
      ];
      if (activeVoices >= VOICE_CAP) {
        return { state: next, commands: chimeCommands };
      }
      const phrase = signaturePhrase(ev.voice);
      return {
        state: trackVoice(next, phraseEnd(phrase, ctx.now, at + 0.45)),
        commands: [
          ...chimeCommands,
          ...syllableCommands(phrase, ev.voice, pan, attenuation, 1, at + 0.45),
        ],
      };
    }
    case 'stage-up': {
      const { pan, attenuation } = spatial(ev.x);
      if (attenuation === 0) return { state, commands: [] };
      const { at, next } = chimeDelay();
      // §10: C5–E5–G5, 140ms apart.
      return {
        state: next,
        commands: [523.25, 659.25, 783.99].map((freq, i) => ({
          patch: 'boxNote' as const, bus: 'sfx' as const,
          at: at + i * 0.14, pan, gain: 0.055 * attenuation, freq,
        })),
      };
    }
    case 'offline':
      return { state, commands: [{ patch: 'tone', bus: 'sfx', at: 0, pan: 0, gain: 0.07, freq: 160, attack: 0.15, decay: 0.9 }] };
    case 'reconnected':
      return {
        state,
        commands: [
          { patch: 'tone', bus: 'sfx', at: 0, pan: 0, gain: 0.05, freq: 392, attack: 0.02, decay: 0.3 },
          { patch: 'tone', bus: 'sfx', at: 0.11, pan: 0, gain: 0.05, freq: 587.33, attack: 0.02, decay: 0.3 },
        ],
      };
    case 'idle-tick': {
      // Spec §3: Poisson-spaced ~45s per creature, at most one chirp per 8s
      // village-wide, dropped first when the voice cap is reached.
      let next = state;
      for (const cand of ev.candidates) {
        const deadline = next.idleNextAt[cand.id];
        if (deadline === undefined) {
          // First sighting arms the timer; -ln(U) is the exponential draw.
          next = {
            ...next,
            idleNextAt: {
              ...next.idleNextAt,
              [cand.id]: ctx.now + IDLE_MEAN_WAIT * -Math.log(Math.max(ctx.rand(), 1e-9)),
            },
          };
          continue;
        }
        if (ctx.now < deadline) continue;
        if (ctx.now - next.lastIdleAt < IDLE_VILLAGE_GAP) continue;
        const { pan, attenuation } = spatial(cand.x);
        const rearm = {
          ...next.idleNextAt,
          [cand.id]: ctx.now + IDLE_MEAN_WAIT * -Math.log(Math.max(ctx.rand(), 1e-9)),
        };
        if (attenuation === 0 || activeVoices >= VOICE_CAP) {
          next = { ...next, idleNextAt: rearm };
          continue;
        }
        // A short remark, not the full name: the first two signature syllables.
        const syllables = signaturePhrase(cand.voice).slice(0, 2)
          .map((s) => ({ ...s, gain: 0.09 }));
        next = trackVoice({ ...next, idleNextAt: rearm, lastIdleAt: ctx.now }, phraseEnd(syllables, ctx.now));
        return { state: next, commands: syllableCommands(syllables, cand.voice, pan, attenuation, 1) };
      }
      return { state: next, commands: [] };
    }
  }
}
