import type { Palette } from '../types.js';

/**
 * The only colours a creature body may take. Clashing palettes are
 * unrepresentable because arbitrary hex never enters the system — an agent's
 * `color` frontmatter is mapped onto this list rather than used directly.
 */
export const HUES = [
  '#e58c68', // coral
  '#b79fd6', // lilac
  '#9dba77', // sage
  '#7fbf8a', // mint
  '#e2b45e', // gold
  '#e0a3b2', // rose
  '#7fb6d9', // sky
  '#6fbcad', // teal
] as const;

/** Claude Code's agent frontmatter `color` values, mapped onto the curated hues. */
export const AGENT_COLOR_TO_HUE: Record<string, string> = {
  red: '#e58c68',
  orange: '#e2b45e',
  yellow: '#e2b45e',
  green: '#9dba77',
  cyan: '#6fbcad',
  blue: '#7fb6d9',
  purple: '#b79fd6',
  pink: '#e0a3b2',
};

export function hueForAgentColor(color: string | undefined): string | null {
  if (!color) return null;
  return AGENT_COLOR_TO_HUE[color.trim().toLowerCase()] ?? null;
}

const LITE_LIGHTNESS_STEP = 14;
const LITE_SATURATION_STEP = 6;
const DARK_LIGHTNESS_STEP = 14;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h / 6) * 360, s * 100, l * 100];
}

export function hslToHex(hDeg: number, sPct: number, lPct: number): string {
  const h = (((hDeg % 360) + 360) % 360) / 360;
  const s = clamp(sPct, 0, 100) / 100;
  const l = clamp(lPct, 0, 100) / 100;
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t0: number) => {
      let t = t0;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * `lite` is used for wings and `A` accent pixels. `dark` is currently drawn
 * nowhere — feet share the body hue and antennae were dropped — but is derived
 * anyway so shading or a night variant can use it without a data-model change.
 */
export function derivePalette(hue: string): Palette {
  const [h, s, l] = hexToHsl(hue);
  return {
    hue,
    lite: hslToHex(h, Math.max(0, s - LITE_SATURATION_STEP), clamp(l + LITE_LIGHTNESS_STEP, 0, 100)),
    dark: hslToHex(h, s, clamp(l - DARK_LIGHTNESS_STEP, 0, 100)),
  };
}
