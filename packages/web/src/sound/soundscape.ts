/**
 * What the world should sound like right now. Spec §5: the same daily
 * skeleton as the time-of-day palettes spec, and like the light it lerps —
 * never steps. When the palettes arc builds its theme store, this module
 * swaps its (Date) input for the store's resolved frame; nothing else moves.
 */
export interface AmbienceMix {
  /** Lowpass corner of the wind bed, Hz. */
  windFreq: number;
  /** Wind bed level, pre-master. */
  windGain: number;
  /** Bird songs per second (Poisson rate for the player's scheduler). */
  birdRate: number;
  /** Total cricket-field level; the player splits it across its two voices. */
  cricketGain: number;
  /** 0 = music forbidden this daypart; 1 = full. Scales the music bus. */
  musicLevel: number;
  /** 0 cool … 1 warm. The player pulls the pad's filter down as it rises. */
  musicWarmth: number;
}

export function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

const NIGHT: AmbienceMix = { windFreq: 260, windGain: 0.02, birdRate: 0, cricketGain: 0.036, musicLevel: 0, musicWarmth: 0 };
const DAWN_RISE: AmbienceMix = { windFreq: 400, windGain: 0.028, birdRate: 0.25, cricketGain: 0.02, musicLevel: 0, musicWarmth: 0 };
const DAWN_PEAK: AmbienceMix = { windFreq: 520, windGain: 0.032, birdRate: 0.5, cricketGain: 0.008, musicLevel: 0, musicWarmth: 0 };
const MORNING: AmbienceMix = { windFreq: 700, windGain: 0.04, birdRate: 0.3, cricketGain: 0, musicLevel: 0, musicWarmth: 0.2 };
const DAY: AmbienceMix = { windFreq: 900, windGain: 0.045, birdRate: 0.18, cricketGain: 0, musicLevel: 1, musicWarmth: 0 };
const DUSK: AmbienceMix = { windFreq: 650, windGain: 0.038, birdRate: 0.08, cricketGain: 0.012, musicLevel: 1, musicWarmth: 1 };
const DUSK_LATE: AmbienceMix = { windFreq: 420, windGain: 0.03, birdRate: 0.02, cricketGain: 0.024, musicLevel: 0.4, musicWarmth: 1 };

/**
 * Anchors in minutes of the local day, straight off the palette spec's
 * table: night holds to 05:30, dawn 06:10–07:20 with the chorus peak at
 * 06:45 (music stays 0, the chorus is the show), the plateau 08:30–16:45,
 * dusk 17:45–19:20, night from 21:00. The 0 and 1440 endpoints are both
 * NIGHT, which is what makes midnight continuous without a special case.
 */
const KEYS: { m: number; mix: AmbienceMix }[] = [
  { m: 0, mix: NIGHT },
  { m: 330, mix: NIGHT },
  { m: 370, mix: DAWN_RISE },
  { m: 405, mix: DAWN_PEAK },
  { m: 440, mix: MORNING },
  { m: 510, mix: DAY },
  { m: 1005, mix: DAY },
  { m: 1065, mix: DUSK },
  { m: 1160, mix: DUSK_LATE },
  { m: 1260, mix: NIGHT },
  { m: 1440, mix: NIGHT },
];

const lerp = (a: number, b: number, q: number) => a + (b - a) * q;

export function mixAt(date: Date): AmbienceMix {
  const m = minuteOfDay(date);
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]!.m <= m) i++;
  const a = KEYS[i]!;
  const b = KEYS[i + 1]!;
  const q = b.m === a.m ? 0 : (m - a.m) / (b.m - a.m);
  return {
    windFreq: lerp(a.mix.windFreq, b.mix.windFreq, q),
    windGain: lerp(a.mix.windGain, b.mix.windGain, q),
    birdRate: lerp(a.mix.birdRate, b.mix.birdRate, q),
    cricketGain: lerp(a.mix.cricketGain, b.mix.cricketGain, q),
    musicLevel: lerp(a.mix.musicLevel, b.mix.musicLevel, q),
    musicWarmth: lerp(a.mix.musicWarmth, b.mix.musicWarmth, q),
  };
}
