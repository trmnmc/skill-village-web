// packages/web/src/sound/player.ts
import type { BusName, GameSoundEvent, SoundCommand } from './types.js';
import { direct, initialDirectorState, type DirectorState } from './director.js';
import { mixAt } from './soundscape.js';
import { BAR_SECONDS, daySeedFor, musicBar, musicGate } from './music.js';
import { loadSettings, saveSettings, type SoundSettings } from './settings.js';

/**
 * The last inch, spec §2: the only file that touches the Web Audio API
 * (enforced by boundaries.test.ts). It executes SoundCommands, runs the
 * ambience loops against soundscape.ts's mix, and schedules music.ts's bars.
 * Nothing in here decides anything — patch shapes are §10 verbatim.
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let buses: Record<BusName, GainNode> | null = null;
let noiseBuffer: AudioBuffer | null = null;
let dirState: DirectorState = initialDirectorState();
let settings: SoundSettings = loadSettings();
let cam = { x: 2150, w: 1280 };
let inited = false;

function noise(c: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function applySettings(): void {
  if (!masterGain || !buses) return;
  masterGain.gain.value = settings.muted ? 0 : settings.master;
  for (const name of Object.keys(buses) as BusName[]) {
    buses[name].gain.value = settings.buses[name];
  }
}

/**
 * Every one-shot routes source → (filter) → envelope → panner → dest.
 * `dest` defaults to the named bus, but the bar scheduler (tick(), below)
 * passes musicLevelGain instead so it can reuse playBoxNote rather than
 * re-implementing its envelope inline.
 */
function route(c: AudioContext, bus: BusName, pan: number, dest: AudioNode = buses![bus]): GainNode {
  const entry = c.createGain();
  const panner = new StereoPannerNode(c, { pan });
  entry.connect(panner);
  panner.connect(dest);
  return entry;
}

function playSyllable(c: AudioContext, t0: number, cmd: Extract<SoundCommand, { patch: 'syllable' }>): void {
  const dest = route(c, cmd.bus, cmd.pan);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 2800;
  lp.connect(dest);
  const mk = (type: OscillatorType, g0: number) => {
    const o = c.createOscillator(); o.type = type;
    // §10: bends up ~20% over 50ms then settles to 92%; vibrato 6.2Hz.
    o.frequency.setValueAtTime(cmd.freq, t0);
    o.frequency.exponentialRampToValueAtTime(cmd.freq * 1.2, t0 + 0.05);
    o.frequency.exponentialRampToValueAtTime(cmd.freq * 0.92, t0 + 0.11);
    const v = c.createOscillator(); v.frequency.value = 6.2;
    const vg = c.createGain(); vg.gain.value = cmd.vibrato;
    v.connect(vg); vg.connect(o.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(g0, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
    o.connect(g); g.connect(lp);
    o.start(t0); o.stop(t0 + 0.16); v.start(t0); v.stop(t0 + 0.16);
  };
  mk('triangle', cmd.gain * (1 - cmd.sineMix * 0.5));
  if (cmd.sineMix > 0.15) mk('sine', cmd.gain * cmd.sineMix * 0.5);
  if (cmd.breathy) {
    const s = c.createBufferSource(); s.buffer = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = cmd.freq * 1.5; bp.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(cmd.gain * 0.25, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.13);
    s.connect(bp); bp.connect(g); g.connect(dest);
    s.start(t0); s.stop(t0 + 0.15);
  }
}

function playThump(c: AudioContext, t0: number, cmd: Extract<SoundCommand, { patch: 'thump' }>): void {
  const dest = route(c, cmd.bus, cmd.pan);
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(cmd.from, t0);
  o.frequency.exponentialRampToValueAtTime(cmd.to, t0 + cmd.dur);
  const g = c.createGain();
  g.gain.setValueAtTime(cmd.gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + cmd.dur);
  o.connect(g); g.connect(dest);
  o.start(t0); o.stop(t0 + cmd.dur + 0.02);
}

function playNoiseBurst(c: AudioContext, t0: number, cmd: Extract<SoundCommand, { patch: 'noiseBurst' }>): void {
  const dest = route(c, cmd.bus, cmd.pan);
  const s = c.createBufferSource(); s.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = cmd.filter; f.frequency.value = cmd.freq; f.Q.value = cmd.q;
  const g = c.createGain();
  g.gain.setValueAtTime(cmd.gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + cmd.dur);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t0); s.stop(t0 + cmd.dur + 0.01);
}

function playBreathSwell(c: AudioContext, t0: number, cmd: Extract<SoundCommand, { patch: 'breathSwell' }>): void {
  // §10: two swells 1.5s apart, 550ms rise, 750ms fall.
  const dest = route(c, cmd.bus, cmd.pan);
  for (let i = 0; i < 2; i++) {
    const t = t0 + i * 1.5;
    const s = c.createBufferSource(); s.buffer = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = cmd.freq; bp.Q.value = 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(cmd.gain, t + 0.55);
    g.gain.linearRampToValueAtTime(0, t + 1.3);
    s.connect(bp); bp.connect(g); g.connect(dest);
    s.start(t); s.stop(t + 1.4);
  }
}

function playBoxNote(
  c: AudioContext, t0: number, cmd: Extract<SoundCommand, { patch: 'boxNote' }>, dest?: AudioNode,
): void {
  // §10: sine at f plus sine at 4f (12%), sharp attack, 1.4s decay.
  const entry = route(c, cmd.bus, cmd.pan, dest);
  for (const [mult, gm] of [[1, 1], [4, 0.12]] as const) {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = cmd.freq * mult;
    const g = c.createGain();
    g.gain.setValueAtTime(cmd.gain * gm, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + 1.4);
    o.connect(g); g.connect(entry);
    o.start(t0); o.stop(t0 + 1.45);
  }
}

/**
 * The lo-fi pad bed: a detuned sawtooth pair with a slow rise/hold/fall.
 * Only the bar scheduler (tick(), below) plays these, but it is pulled out
 * to a helper for the same reason playBoxNote is reused there — one place
 * owns the envelope instead of tick() re-deriving it inline.
 */
function playPad(c: AudioContext, t0: number, freq: number, gain: number, dest: AudioNode): void {
  for (const cents of [-6, 6]) {
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.value = freq * Math.pow(2, cents / 1200);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 2.5);
    g.gain.setValueAtTime(gain, t0 + 5);
    g.gain.linearRampToValueAtTime(0, t0 + 8);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + 8.1);
  }
}

function playBlip(c: AudioContext, t0: number, cmd: Extract<SoundCommand, { patch: 'blip' }>): void {
  const dest = route(c, cmd.bus, cmd.pan);
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(cmd.from, t0);
  o.frequency.exponentialRampToValueAtTime(cmd.to, t0 + cmd.dur);
  const g = c.createGain();
  g.gain.setValueAtTime(cmd.gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + cmd.dur + 0.02);
  o.connect(g); g.connect(dest);
  o.start(t0); o.stop(t0 + cmd.dur + 0.04);
}

function playTone(c: AudioContext, t0: number, cmd: Extract<SoundCommand, { patch: 'tone' }>): void {
  const dest = route(c, cmd.bus, cmd.pan);
  const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = cmd.freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(cmd.gain, t0 + cmd.attack);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + cmd.attack + cmd.decay);
  o.connect(g); g.connect(dest);
  o.start(t0); o.stop(t0 + cmd.attack + cmd.decay + 0.05);
}

function execute(commands: SoundCommand[]): void {
  if (!ctx) return;
  for (const cmd of commands) {
    const t0 = ctx.currentTime + 0.02 + cmd.at;
    switch (cmd.patch) {
      case 'syllable': playSyllable(ctx, t0, cmd); break;
      case 'thump': playThump(ctx, t0, cmd); break;
      case 'noiseBurst': playNoiseBurst(ctx, t0, cmd); break;
      case 'breathSwell': playBreathSwell(ctx, t0, cmd); break;
      case 'boxNote': playBoxNote(ctx, t0, cmd); break;
      case 'blip': playBlip(ctx, t0, cmd); break;
      case 'tone': playTone(ctx, t0, cmd); break;
    }
  }
}

// ---------------------------------------------------------------- ambience

/** The visibility ramp's handles: all continuous sound hangs off these two. */
let ambienceMaster: GainNode | null = null;
let musicMaster: GainNode | null = null;
/** The daypart's own fader — owned solely by tick(), never by unlock/visibility. */
let musicLevelGain: GainNode | null = null;

function startAmbience(c: AudioContext): void {
  ambienceMaster = c.createGain();
  ambienceMaster.gain.value = 0;
  ambienceMaster.gain.setTargetAtTime(1, c.currentTime, 0.7);
  ambienceMaster.connect(buses!.ambience);
  musicMaster = c.createGain();
  musicMaster.gain.value = 0;
  musicMaster.gain.setTargetAtTime(1, c.currentTime, 0.7);
  musicMaster.connect(buses!.music);
  // [padLp, box notes, crackle] → musicLevelGain → musicMaster → buses.music.
  // musicLevelGain carries only mix.musicLevel (tick()); musicMaster carries
  // only the unlock fade and the visibility duck — the two concerns no
  // longer fight over one node.
  musicLevelGain = c.createGain();
  musicLevelGain.gain.value = mixAt(new Date()).musicLevel;
  musicLevelGain.connect(musicMaster);

  // Wind: looped noise → lowpass → gain, with a slow LFO breathing ±40%.
  // The engine tick below retargets freq and gain toward the current mix,
  // so the bed lerps with the clock instead of stepping.
  const windSrc = c.createBufferSource();
  windSrc.buffer = noise(c); windSrc.loop = true;
  const windLp = c.createBiquadFilter();
  windLp.type = 'lowpass'; windLp.Q.value = 0.5;
  const windGain = c.createGain(); windGain.gain.value = 0;
  const windLfo = c.createOscillator(); windLfo.frequency.value = 0.1;
  const windLfoGain = c.createGain();
  windLfo.connect(windLfoGain); windLfoGain.connect(windGain.gain);
  windSrc.connect(windLp); windLp.connect(windGain); windGain.connect(ambienceMaster);
  windSrc.start(); windLfo.start();

  // Crickets: two persistent §10 voices whose level follows the mix.
  const crickets = ([[4250, 38, 340, 240, 0.6], [3850, 31, 420, 380, 0.4]] as const).map(
    ([freq, amHz, onMs, offMs, share]) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      const g = c.createGain(); g.gain.value = 0;
      const am = c.createOscillator(); am.frequency.value = amHz;
      const amGain = c.createGain(); amGain.gain.value = 0;
      am.connect(amGain); amGain.connect(g.gain);
      o.connect(g); g.connect(ambienceMaster!);
      o.start(); am.start();
      let level = 0;
      const gate = () => {
        g.gain.setTargetAtTime(level, c.currentTime, 0.02);
        // Page-lifetime timers throughout this function: ambience never
        // stops, so nothing holds their handles.
        setTimeout(() => {
          g.gain.setTargetAtTime(0, c.currentTime, 0.03);
        }, onMs);
        setTimeout(gate, onMs + offMs + Math.random() * 120);
      };
      gate();
      return {
        setLevel(total: number) {
          level = total * share;
          amGain.gain.setTargetAtTime(level * 0.5, c.currentTime, 3);
        },
      };
    },
  );

  // Birds: a Poisson scheduler over §10's songbird — sine syllables,
  // 2.1–3.7kHz, sweeps up ×1.35–1.65 or down ×0.7, at a random pan.
  let birdRate = 0;
  const song = () => {
    const n = 2 + Math.floor(Math.random() * 4);
    let t0 = c.currentTime + 0.05;
    const panner = new StereoPannerNode(c, { pan: (Math.random() - 0.5) * 1.2 });
    panner.connect(ambienceMaster!);
    for (let i = 0; i < n; i++) {
      const up = Math.random() > 0.5;
      const f1 = 2100 + Math.random() * 1600;
      const f2 = f1 * (up ? 1.35 + Math.random() * 0.3 : 0.7);
      const dur = 0.06 + Math.random() * 0.1;
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f1, t0);
      o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.05, t0 + dur * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
      o.connect(g); g.connect(panner);
      o.start(t0); o.stop(t0 + dur + 0.01);
      t0 += dur + 0.02 + Math.random() * 0.06;
    }
  };
  const birdLoop = () => {
    if (birdRate > 0) song();
    // Exponential inter-song gap at the current rate; poll every 5s when silent.
    const wait = birdRate > 0 ? -Math.log(Math.max(Math.random(), 1e-9)) / birdRate : 5;
    setTimeout(birdLoop, Math.min(wait, 30) * 1000);
  };
  birdLoop();

  // Music: the pad from music.ts runs through one warmth-following lowpass
  // (the box notes stay off it — their brightness is the deliberate chip
  // crossover, spec §10); both, plus the crackle, feed musicLevelGain, the
  // daypart's own fader, kept separate from musicMaster's unlock/visibility fade.
  const padLp = c.createBiquadFilter();
  padLp.type = 'lowpass'; padLp.frequency.value = 700; padLp.Q.value = 0.4;
  padLp.connect(musicLevelGain);
  let nextBarAt = 0;
  let barIndex = 0;
  const crackle = () => {
    const wait = 60 + Math.random() * 320;
    // A hidden tab hears nothing (visibilitychange ducks both masters to 0),
    // so don't keep allocating oscillator/filter/gain nodes into that silent
    // graph — spec §2's "no sound from a tab you are not watching" extends
    // to not spending cycles pretending to make it, either.
    if (document.hidden) { setTimeout(crackle, wait); return; }
    const now = new Date();
    const secs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    if (musicGate(secs) && mixAt(now).musicLevel > 0) {
      const t = c.currentTime;
      const s = c.createBufferSource(); s.buffer = noise(c);
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
      const g = c.createGain();
      g.gain.setValueAtTime(0.012, t);
      g.gain.exponentialRampToValueAtTime(0.0006, t + 0.015);
      s.connect(hp); hp.connect(g); g.connect(musicLevelGain!);
      s.start(t); s.stop(t + 0.02);
    }
    setTimeout(crackle, wait);
  };
  crackle();

  // The engine tick: every 2s, retarget every continuous node toward the
  // clock's current mix. setTargetAtTime with a 3s constant makes the 2s
  // steps inaudible — the bed drifts, it never jumps.
  const tick = () => {
    const now = new Date();
    const mix = mixAt(now);
    windLp.frequency.setTargetAtTime(mix.windFreq, c.currentTime, 3);
    windGain.gain.setTargetAtTime(mix.windGain, c.currentTime, 3);
    windLfoGain.gain.setTargetAtTime(mix.windGain * 0.4, c.currentTime, 3);
    for (const cr of crickets) cr.setLevel(mix.cricketGain);
    birdRate = mix.birdRate;
    padLp.frequency.setTargetAtTime(700 - mix.musicWarmth * 150, c.currentTime, 3);
    musicLevelGain!.gain.setTargetAtTime(mix.musicLevel, c.currentTime, 3);

    // Bar scheduling rides the same tick: when a passage is on and the last
    // bar has elapsed, lay down the next one. Skipped while the tab is
    // hidden — nothing above this line (the retarget block) is skipped,
    // since that's what keeps the mix current for whenever the tab returns.
    const secs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    if (!document.hidden && musicGate(secs) && mix.musicLevel > 0 && c.currentTime >= nextBarAt) {
      const t0 = Math.max(nextBarAt, c.currentTime + 0.05);
      for (const note of musicBar(daySeedFor(now), barIndex)) {
        if (note.kind === 'pad') {
          playPad(c, t0 + note.at, note.freq, note.gain, padLp);
        } else {
          playBoxNote(
            c, t0 + note.at,
            { patch: 'boxNote', bus: 'music', at: 0, pan: 0, gain: note.gain, freq: note.freq },
            musicLevelGain!,
          );
        }
      }
      nextBarAt = t0 + BAR_SECONDS;
      barIndex++;
    }
    setTimeout(tick, 2000);
  };
  tick();
}

function unlock(): void {
  if (ctx) return;
  ctx = new AudioContext();
  masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  buses = {
    voices: ctx.createGain(), sfx: ctx.createGain(),
    ambience: ctx.createGain(), music: ctx.createGain(),
  };
  for (const name of Object.keys(buses) as BusName[]) buses[name].connect(masterGain);
  applySettings();
  startAmbience(ctx);
}

/**
 * "Unlocked" means the context is actually producing sound, not merely
 * constructed. A gesture that does not carry browser user-activation (a
 * bare Escape keydown, say) still creates the context — `unlock()` — but
 * leaves it `suspended` forever unless something calls `resume()`. Without
 * this stricter check, the HUD dot would clear and the director would treat
 * the village as unlocked while nothing can actually play.
 */
function isRunning(): boolean {
  return ctx !== null && ctx.state === 'running';
}

export const sound = {
  init(): void {
    if (inited) return;
    inited = true;
    // The browser requires a gesture anyway, spec §6 — the first click of
    // any kind is the switch. { once: false } + the ctx guard rather than
    // { once: true }: a keydown and a pointerdown can race. Every gesture,
    // not just the first, also nudges a still-suspended context toward
    // resume() — the first gesture may not have carried user-activation.
    const onGesture = () => {
      unlock();
      if (ctx && ctx.state === 'suspended') void ctx.resume();
    };
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    document.addEventListener('visibilitychange', () => {
      // No sound from a tab you are not watching, spec §2. One-shots are
      // short enough to die on their own; the ramp handles the beds.
      if (!ctx || !ambienceMaster || !musicMaster) return;
      const target = document.hidden ? 0 : 1;
      ambienceMaster.gain.setTargetAtTime(target, ctx.currentTime, 0.3);
      musicMaster.gain.setTargetAtTime(target, ctx.currentTime, 0.3);
    });
  },
  event(ev: GameSoundEvent): void {
    // Spec §7: a muted bus is the player multiplying by zero, but a locked
    // context is a director decision — direct() drops on unlocked: false,
    // keeping "never queued" in the tested layer. A context that exists but
    // is still suspended is exactly that "locked" case — scheduling into it
    // would just be commands queuing up behind a clock that never advances.
    const now = ctx ? ctx.currentTime : 0;
    const result = direct(dirState, ev, {
      now, camX: cam.x, viewW: cam.w, unlocked: isRunning(), rand: Math.random,
    });
    dirState = result.state;
    execute(result.commands);
  },
  setCamera(camX: number, viewW: number): void {
    cam = { x: camX, w: viewW };
  },
  settings(): SoundSettings {
    return settings;
  },
  updateSettings(next: SoundSettings): void {
    settings = next;
    saveSettings(next);
    applySettings();
  },
  unlocked(): boolean {
    return isRunning();
  },
};
