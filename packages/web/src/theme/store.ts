import { PALETTES, mix, type PaletteId, type Frame } from './palettes.js';
import { buildTimeline, sampleTimeline, DEFAULT_ANCHORS, type DayPlan, type SolarAnchors } from './timeline.js';
import { planForDate } from './schedule.js';
import { graySkies, weatherGround, OVERCAST, ALL_WEATHERS, type WeatherKind } from './weather/kinds.js';
import { journeyAt } from './weather/journey.js';
import { readingFresh, type RealWeatherSource } from './weather/real.js';
import { moonForDate, nightDarkness } from './moon/moon.js';

export type WeatherMode = 'off' | 'pick' | 'journey' | 'real';

export interface Tokens {
  sky0: string; sky1: string; sky2: string; ground: string; groundDark: string;
  cream: string; bubble: string; ink: string; wood: string; accent: string;
  foliage: string; foliageLite: string;
  houseAWall: string; houseARoof: string; houseBWall: string; houseBRoof: string;
}

export interface ResolvedTheme {
  tokens: Tokens;
  tint: { col: string; sceneryK: number; creatureK: number };
  flags: { isNight: boolean; isDusk: boolean; isDawn: boolean; lanternsOn: boolean; overcast: boolean; windowsGlow: boolean };
  weather: { kind: WeatherKind; ramp: number };
  sun: { visible: boolean; x01: number; y01: number };
  moonSky: { visible: boolean; x01: number; y01: number; phaseName: string; illumination: number; waxing: boolean; darkness: number };
}

export interface ThemeStore {
  current(): ResolvedTheme;
  subscribe(fn: (t: ResolvedTheme) => void): () => void;
  mode(): WeatherMode; setMode(m: WeatherMode): void;
  picked(): WeatherKind; setPicked(k: WeatherKind): void;
  pinnedTime(): number | null; setPinnedTime(min: number | null): void;
  pinnedPalette(): PaletteId | null; setPinnedPalette(p: PaletteId | null): void;
  setRealSource(src: RealWeatherSource | null): void;
  tick(): void; start(): void; stop(): void;
}

const MODE_KEY = 'sv-weather-mode';
const PICK_KEY = 'sv-weather-pick';
const TIME_PIN_KEY = 'sv-time-pin';
const PALETTE_PIN_KEY = 'sv-palette-pin';

const VALID_MODES: WeatherMode[] = ['off', 'pick', 'journey', 'real'];
const VALID_DAY_OVERRIDES = new Set(['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'weave']);
const DOW: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/**
 * The daylight plateau's own colour — 1a's day sky, the spec's 5500–6500K
 * anchor — and how hard a special day's noon is pulled onto it. Only the sky
 * moves: ground, foliage and houses stay the palette's own, so a Marigold
 * Sunday still reads as Marigold, under a sky that reads as daylight.
 */
const DAYLIGHT_SKY = PALETTES['1a'].skies.day;
const DAYLIGHT_PULL = 0.8;

/** Frame-token builder: the full Tokens set for one (palette, frame) pair. */
function tokensFor(paletteId: PaletteId, frame: Frame, daylight = false): Tokens {
  const p = PALETTES[paletteId];
  const raw = p.skies[frame];
  const [sky0, sky1, sky2] = daylight
    ? (raw.map((c, i) => mix(c, DAYLIGHT_SKY[i]!, DAYLIGHT_PULL)) as [string, string, string])
    : raw;
  return {
    sky0, sky1, sky2,
    ground: p.ground, groundDark: p.groundDark,
    cream: p.cream, bubble: p.bubble, ink: p.ink, wood: p.wood, accent: p.accent,
    foliage: p.foliage, foliageLite: p.foliageLite,
    houseAWall: p.houseA[0], houseARoof: p.houseA[1],
    houseBWall: p.houseB[0], houseBRoof: p.houseB[1],
  };
}

const TOKEN_KEYS: (keyof Tokens)[] = [
  'sky0', 'sky1', 'sky2', 'ground', 'groundDark',
  'cream', 'bubble', 'ink', 'wood', 'accent',
  'foliage', 'foliageLite', 'houseAWall', 'houseARoof', 'houseBWall', 'houseBRoof',
];

function lerpTokens(a: Tokens, b: Tokens, t: number): Tokens {
  const out = {} as Tokens;
  for (const k of TOKEN_KEYS) out[k] = mix(a[k], b[k], t);
  return out;
}

/** Tint ceiling per frame: [sceneryK, creatureK]. */
const TINT_K: Record<Frame, [number, number]> = {
  night: [0.55, 0.28], dusk: [0.18, 0.10], dawn: [0.10, 0.06], day: [0, 0],
};

function tintColorFor(paletteId: PaletteId, frame: Frame): string {
  const skies = PALETTES[paletteId].skies;
  if (frame === 'night') return skies.night[0];
  if (frame === 'dusk') return skies.dusk[0];
  if (frame === 'dawn') return skies.dawn[2];
  return skies.day[0];
}

function lerpTint(pa: PaletteId, fa: Frame, pb: PaletteId, fb: Frame, t: number): ResolvedTheme['tint'] {
  const ca = tintColorFor(pa, fa);
  const cb = tintColorFor(pb, fb);
  const [ka0, ka1] = TINT_K[fa];
  const [kb0, kb1] = TINT_K[fb];
  return { col: mix(ca, cb, t), sceneryK: ka0 + (kb0 - ka0) * t, creatureK: ka1 + (kb1 - ka1) * t };
}

function upcomingDow(now: Date, dow: number): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const delta = (dow - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  return d;
}

/** ?day=sat|sun|mon..fri|weave → a DayPlan, per the controller's "keep it simple" ruling. */
function planForOverrideDay(day: string, now: Date): DayPlan {
  if (day === 'sat' || day === 'sun') return planForDate(upcomingDow(now, DOW[day]!));
  return { kind: 'weave' };
}

function prevCalendarDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
}

/** Loads the 'sv-time-pin' minute-of-day. Missing/empty/non-integer/out-of-range → null. */
function parsePinnedTime(v: string | null): number | null {
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 1439) return null;
  return n;
}

/** Loads the 'sv-palette-pin' id. Missing/empty/unknown → null (the schedule decides). */
function parsePinnedPalette(v: string | null): PaletteId | null {
  if (v === null || v === '') return null;
  return Object.hasOwn(PALETTES, v) ? (v as PaletteId) : null;
}

function parseAt(v: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return undefined;
  const hh = parseInt(m[1]!, 10), mm = parseInt(m[2]!, 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return undefined;
  return hh * 60 + mm;
}

interface Overrides { at?: number; day?: string; palette?: PaletteId; weather?: WeatherKind; any: boolean }

function parseOverrides(search: string): Overrides {
  const params = new URLSearchParams(search);
  const atRaw = params.get('at');
  const at = atRaw ? parseAt(atRaw) : undefined;
  const dayRaw = params.get('day');
  const day = dayRaw && VALID_DAY_OVERRIDES.has(dayRaw) ? dayRaw : undefined;
  const paletteRaw = params.get('palette');
  const palette = paletteRaw && Object.hasOwn(PALETTES, paletteRaw) ? (paletteRaw as PaletteId) : undefined;
  const weatherRaw = params.get('weather');
  const weather = weatherRaw && (ALL_WEATHERS as string[]).includes(weatherRaw) ? (weatherRaw as WeatherKind) : undefined;
  return { at, day, palette, weather, any: at !== undefined || day !== undefined || palette !== undefined || weather !== undefined };
}

export function createThemeStore(deps?: {
  now?: () => Date;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  search?: string;
  real?: RealWeatherSource | null;
}): ThemeStore {
  const now = deps?.now ?? (() => new Date());
  const storage = deps?.storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  const search = deps?.search ?? (typeof window !== 'undefined' ? window.location.search : '');
  // Mutable: setRealSource() overrides this at runtime (the gear menu's Real
  // mode wires up a live createRealWeatherSource here); deps.real is only the
  // initial value.
  let real: RealWeatherSource | null = deps?.real ?? null;

  const safeGet = (k: string): string | null => (storage ? storage.getItem(k) : null);
  const safeSet = (k: string, v: string): void => { storage?.setItem(k, v); };

  let modeState: WeatherMode = (() => {
    const v = safeGet(MODE_KEY);
    return v && (VALID_MODES as string[]).includes(v) ? (v as WeatherMode) : 'off';
  })();
  let pickedState: WeatherKind = (() => {
    const v = safeGet(PICK_KEY);
    return v && (ALL_WEATHERS as string[]).includes(v) ? (v as WeatherKind) : 'clear';
  })();
  let pinnedState: number | null = parsePinnedTime(safeGet(TIME_PIN_KEY));
  let pinnedPaletteState: PaletteId | null = parsePinnedPalette(safeGet(PALETTE_PIN_KEY));

  const subscribers = new Set<(t: ResolvedTheme) => void>();
  let currentTheme: ResolvedTheme | null = null;
  let lastSignature: string | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let visListener: (() => void) | null = null;

  function resolve(n: Date): ResolvedTheme {
    const nowMs = n.getTime();
    const ov = parseOverrides(search);

    // Real solar anchors, used for both the clock timeline and the sun/moon arc.
    const reading = real?.latest() ?? null;
    const fresh = reading !== null && readingFresh(reading, nowMs);
    const anchors: SolarAnchors = fresh ? { sunriseMin: reading!.sunriseMin, sunsetMin: reading!.sunsetMin } : DEFAULT_ANCHORS;

    // Priority: ?at override beats the pinned time; the pin beats the clock.
    // Journey mode ignores the pin entirely — journey owns time via its own
    // wall-clock waypoint math (journeyAt(nowMs) below), so a pin must never
    // reach it even when a URL override knocks journey out of its own branch.
    const clockMinute = n.getHours() * 60 + n.getMinutes();
    const pinApplies = modeState !== 'journey' && pinnedState !== null;
    const minuteOfDay = ov.at ?? (pinApplies ? pinnedState! : clockMinute);
    const useJourney = modeState === 'journey' && !ov.any;

    let tokens: Tokens;
    let tint: ResolvedTheme['tint'];
    let dominantFrame: Frame;
    let weatherKind: WeatherKind;
    let weatherRamp: number;

    if (useJourney) {
      const { a, b, t } = journeyAt(nowMs);
      tokens = lerpTokens(tokensFor(a.palette, a.frame), tokensFor(b.palette, b.frame), t);
      tint = lerpTint(a.palette, a.frame, b.palette, b.frame, t);
      dominantFrame = t < 0.5 ? a.frame : b.frame;
      if (ov.weather) {
        weatherKind = ov.weather; weatherRamp = 1;
      } else {
        weatherKind = t < 0.5 ? a.weather : b.weather;
        weatherRamp = a.weather === b.weather ? 1 : Math.abs(t - 0.5) * 2;
      }
    } else {
      // Palette priority: the ?palette= dev override, then the player's pinned
      // choice from the gear menu, then the day's own scheduled plan. A pinned
      // palette makes a single-palette day exactly like a weekend special — it
      // replaces the weekday weave rather than recolouring it, so the frames
      // still move dawn→day→dusk→night on the clock.
      const forcedPalette: PaletteId | null = ov.palette ?? pinnedPaletteState;
      const plan: DayPlan = forcedPalette
        ? { kind: 'single', palette: forcedPalette }
        : ov.day
          ? planForOverrideDay(ov.day, n)
          : planForDate(n);
      const prevPlan: DayPlan = (forcedPalette || ov.day) ? plan : planForDate(prevCalendarDay(n));
      const frames = buildTimeline(plan, prevPlan, anchors);
      const { a, b, t } = sampleTimeline(frames, minuteOfDay);
      tokens = lerpTokens(tokensFor(a.palette, a.frame, a.daylight), tokensFor(b.palette, b.frame, b.daylight), t);
      tint = lerpTint(a.palette, a.frame, b.palette, b.frame, t);
      dominantFrame = t < 0.5 ? a.frame : b.frame;

      if (ov.weather) {
        weatherKind = ov.weather; weatherRamp = 1;
      } else if (modeState === 'pick') {
        weatherKind = pickedState; weatherRamp = 1;
      } else if (modeState === 'real') {
        if (fresh) { weatherKind = reading!.kind; weatherRamp = 1; }
        else { weatherKind = 'clear'; weatherRamp = 0; }
      } else {
        weatherKind = 'clear'; weatherRamp = 0;
      }
    }

    const isNight = dominantFrame === 'night';
    const isDusk = dominantFrame === 'dusk';
    const isDawn = dominantFrame === 'dawn';
    const lanternsOn = isNight || isDusk;
    const overcast = OVERCAST.has(weatherKind) && weatherRamp > 0.5;
    const windowsGlow = lanternsOn || weatherKind === 'storm';

    const grayed = graySkies([tokens.sky0, tokens.sky1, tokens.sky2], weatherKind, weatherRamp, isNight);
    const groundTinted = weatherGround(tokens.ground, tokens.groundDark, weatherKind, weatherRamp);
    tokens = {
      ...tokens,
      sky0: grayed[0], sky1: grayed[1], sky2: grayed[2],
      ground: groundTinted.ground, groundDark: groundTinted.groundDark,
    };

    // Sun/moon arcs. In journey mode the sky is owned by the journey's own
    // dominant frame (a night waypoint must never show a real-noon sun); every
    // other mode derives the arc from the real minute-of-day and solar anchors.
    let sunVisible: boolean, sunX01: number, sunY01: number;
    let moonVisible: boolean, moonX01: number, moonY01: number;

    if (useJourney) {
      switch (dominantFrame) {
        case 'day':
          sunVisible = true; sunX01 = 0.5; sunY01 = 1;
          moonVisible = false; moonX01 = 0; moonY01 = 0;
          break;
        case 'dawn':
          sunVisible = true; sunX01 = 0.08; sunY01 = Math.sin(0.08 * Math.PI);
          moonVisible = false; moonX01 = 0; moonY01 = 0;
          break;
        case 'dusk':
          sunVisible = true; sunX01 = 0.92; sunY01 = Math.sin(0.92 * Math.PI);
          moonVisible = false; moonX01 = 0; moonY01 = 0;
          break;
        default: // 'night'
          sunVisible = false; sunX01 = 0; sunY01 = 0;
          moonVisible = !overcast; moonX01 = 0.5; moonY01 = 1;
          break;
      }
    } else {
      const r = anchors.sunriseMin, s = anchors.sunsetMin;
      const m = minuteOfDay;
      sunVisible = m > r && m < s;
      sunX01 = 0; sunY01 = 0;
      if (sunVisible) {
        sunX01 = (m - r) / (s - r);
        sunY01 = Math.sin(sunX01 * Math.PI);
      }

      moonVisible = !sunVisible && !overcast;
      moonX01 = 0; moonY01 = 0;
      if (moonVisible) {
        const nightSpan = (r + 1440) - s;
        const mAdj = m >= s ? m : m + 1440;
        moonX01 = nightSpan > 0 ? (mAdj - s) / nightSpan : 0;
        moonY01 = Math.sin(moonX01 * Math.PI);
      }
    }
    const moon = moonForDate(n);
    const darkness = nightDarkness(moon.illumination);

    return {
      tokens,
      tint,
      flags: { isNight, isDusk, isDawn, lanternsOn, overcast, windowsGlow },
      weather: { kind: weatherKind, ramp: weatherRamp },
      sun: { visible: sunVisible, x01: sunX01, y01: sunY01 },
      moonSky: {
        visible: moonVisible, x01: moonX01, y01: moonY01,
        phaseName: moon.phaseName, illumination: moon.illumination, waxing: moon.waxing, darkness,
      },
    };
  }

  function tick(): void {
    const resolved = resolve(now());
    currentTheme = resolved;
    const sig = JSON.stringify({
      tokens: resolved.tokens, flags: resolved.flags, weather: resolved.weather,
      sun: resolved.sun, moonSky: resolved.moonSky, tint: resolved.tint,
    });
    if (sig !== lastSignature) {
      lastSignature = sig;
      for (const fn of subscribers) fn(resolved);
    }
  }

  return {
    current(): ResolvedTheme {
      if (currentTheme === null) tick();
      return currentTheme!;
    },
    subscribe(fn: (t: ResolvedTheme) => void): () => void {
      subscribers.add(fn);
      return () => { subscribers.delete(fn); };
    },
    mode(): WeatherMode { return modeState; },
    setMode(m: WeatherMode): void { modeState = m; safeSet(MODE_KEY, m); },
    picked(): WeatherKind { return pickedState; },
    setPicked(k: WeatherKind): void { pickedState = k; safeSet(PICK_KEY, k); },
    pinnedTime(): number | null { return pinnedState; },
    setPinnedTime(min: number | null): void {
      pinnedState = min;
      safeSet(TIME_PIN_KEY, min === null ? '' : String(min));
    },
    pinnedPalette(): PaletteId | null { return pinnedPaletteState; },
    setPinnedPalette(p: PaletteId | null): void {
      pinnedPaletteState = p;
      safeSet(PALETTE_PIN_KEY, p ?? '');
    },
    setRealSource(src: RealWeatherSource | null): void { real = src; },
    tick,
    start(): void {
      tick();
      intervalId = setInterval(() => tick(), 60_000);
      if (typeof document !== 'undefined') {
        visListener = () => { if (document.visibilityState === 'visible') tick(); };
        document.addEventListener('visibilitychange', visListener);
      }
    },
    stop(): void {
      if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
      if (visListener !== null && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', visListener);
        visListener = null;
      }
    },
  };
}

export function cssVars(t: ResolvedTheme): Record<string, string> {
  return {
    '--sv-cream': t.tokens.cream,
    '--sv-bubble': t.tokens.bubble,
    '--sv-ink': t.tokens.ink,
    '--sv-accent': t.tokens.accent,
    '--sv-wood': t.tokens.wood,
    '--sv-panel-bg': t.flags.isNight ? mix(t.tokens.ink, '#000000', 0.25) : t.tokens.bubble,
    '--sv-panel-fg': t.flags.isNight ? t.tokens.cream : t.tokens.ink,
    '--sv-banner-bg': t.flags.isNight ? mix(t.tokens.ink, '#000000', 0.15) : t.tokens.cream,
    '--sv-chip-player': t.flags.isNight ? mix(t.tokens.ink, '#000000', 0.05) : '#E8E0D0',
  };
}
