/**
 * The six village palettes, verbatim from the user's palette explorations
 * (reference/palette-explorations/village-scene.js — the visual source of
 * truth). 1a is the game's original fixed THEME, now one voice among six.
 */
export type PaletteId = '1a' | '1b' | '1c' | '1d' | '1e' | '1f';
export type Frame = 'dawn' | 'day' | 'dusk' | 'night';

export interface Palette {
  name: string;
  ink: string; cream: string; bubble: string; wood: string; accent: string;
  foliage: string; foliageLite: string; ground: string; groundDark: string;
  houseA: [string, string]; houseB: [string, string];
  skies: Record<Frame, [string, string, string]>;
}

/** WCAG relative luminance of a #RRGGBB colour. */
export function relLuminance(hexColour: string): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const n = parseInt(hexColour.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** WCAG contrast ratio (1..21) between two #RRGGBB colours. */
export function contrast(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const PALETTES: Record<PaletteId, Palette> = {
  '1a': {
    name: 'Meadow Blue', ink: '#3A2E22', cream: '#F2E5C4', bubble: '#FFFDF4', wood: '#8A6B4A', accent: '#D97757',
    foliage: '#7FA85F', foliageLite: '#8FB86B', ground: '#A8C68D', groundDark: '#8FB075',
    houseA: ['#F2E5C4', '#D97757'], houseB: ['#E8D3EE', '#B39DDB'],
    skies: { dawn: ['#F4D9C0', '#F8E4CC', '#FBEEDD'], day: ['#C4E4F4', '#CFE9F5', '#DFF0EC'], dusk: ['#E9A87C', '#F0C08A', '#EDCFA2'], night: ['#1C2130', '#232A3C', '#2C3446'] },
  },
  '1b': {
    name: 'Golden Hour', ink: '#3A2E22', cream: '#F6E8C8', bubble: '#FFFDF4', wood: '#8A6B4A', accent: '#D97757',
    foliage: '#7FA85F', foliageLite: '#8FB86B', ground: '#A9C481', groundDark: '#92AF6C',
    houseA: ['#F6E8C8', '#D97757'], houseB: ['#F2D8A7', '#D96C57'],
    skies: { dawn: ['#F6CBA6', '#FADDBC', '#FCEAD2'], day: ['#F3DDB7', '#F7E6C6', '#FAEED6'], dusk: ['#DE8E63', '#EBAF7B', '#F0C896'], night: ['#241F2E', '#2C2739', '#352F45'] },
  },
  '1c': {
    name: 'Spring Tonic', ink: '#33382C', cream: '#F1F0DC', bubble: '#FDFDF2', wood: '#7E6A4E', accent: '#D97757',
    foliage: '#6FA868', foliageLite: '#85BC77', ground: '#9CC98F', groundDark: '#83B378',
    houseA: ['#F1F0DC', '#D97757'], houseB: ['#E4E9F2', '#8FA6C8'],
    skies: { dawn: ['#F2E3C2', '#EDEBCC', '#E4EED8'], day: ['#C9EDDD', '#D8F0E4', '#E7F4E7'], dusk: ['#E8B07E', '#E5C490', '#D8D2A2'], night: ['#17262A', '#1E3034', '#273B3E'] },
  },
  '1d': {
    name: 'Toasted Oat', ink: '#40342A', cream: '#F7EDD6', bubble: '#FFFCF0', wood: '#8A6B4A', accent: '#C96A4A',
    foliage: '#8A9A5B', foliageLite: '#9FAE6B', ground: '#B5B87E', groundDark: '#9CA067',
    houseA: ['#F7EDD6', '#C96A4A'], houseB: ['#E9DFC4', '#A6773F'],
    skies: { dawn: ['#F4D3AE', '#F6E0C0', '#F8EAD2'], day: ['#EDE3CB', '#F1E9D4', '#F5EFDE'], dusk: ['#D98F5E', '#E3AC74', '#E5C48C'], night: ['#221E19', '#2A2620', '#332E27'] },
  },
  '1e': {
    name: 'Berry Dusk', ink: '#3B3040', cream: '#F3E7E4', bubble: '#FFFBF8', wood: '#866A5E', accent: '#B5729F',
    foliage: '#74A876', foliageLite: '#8ABC84', ground: '#9FC494', groundDark: '#86AC7C',
    houseA: ['#F3E7E4', '#B5729F'], houseB: ['#E4D6F0', '#9C86C8'],
    skies: { dawn: ['#F0CFD8', '#F2DDE2', '#F1E8E4'], day: ['#DCD8F0', '#E4E0F4', '#EBE7EF'], dusk: ['#B87FA6', '#CC9DB4', '#DEBDBE'], night: ['#201C33', '#282341', '#322C4E'] },
  },
  '1f': {
    name: 'Marigold', ink: '#4A3A20', cream: '#FFF3CF', bubble: '#FFFDF2', wood: '#8F6E42', accent: '#E29435',
    foliage: '#7FAB53', foliageLite: '#93BE62', ground: '#AFC96F', groundDark: '#97B159',
    houseA: ['#FFF3CF', '#D97757'], houseB: ['#F2D8A7', '#C9803E'],
    skies: { dawn: ['#F9DCA4', '#FBE7B8', '#FCEFC9'], day: ['#F7EBB4', '#FAF0C4', '#FBF4D4'], dusk: ['#E9A155', '#F1BC6A', '#F3D285'], night: ['#1E2126', '#262A31', '#30343C'] },
  },
};

/** Channelwise hex lerp — the reference painter's mix(), typed. */
export function mix(a: string, b: string, k: number): string {
  const hx = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const h2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0').toUpperCase();
  const A = hx(a), B = hx(b);
  return `#${h2(A[0]! + (B[0]! - A[0]!) * k)}${h2(A[1]! + (B[1]! - A[1]!) * k)}${h2(A[2]! + (B[2]! - A[2]!) * k)}`;
}

export function lite(hue: string): string {
  return mix(hue, '#ffffff', 0.32);
}
