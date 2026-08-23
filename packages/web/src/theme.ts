/**
 * Pixel unit: how many screen pixels one grid cell occupies. The trailer uses
 * 12 for a cinematic close-up; the village is wider, so creatures are smaller.
 */
export const U = 6;

/**
 * Text supersampling factor. KAPLAY rasterizes glyphs into its font atlas at
 * the *logical* font size (`w.font = `${size}px ...`` in the bundle, no
 * pixelDensity multiplier), so on a display scaled above 100% every glyph
 * bitmap gets a nearest-neighbour upscale and reads as broken — the scene's
 * pixelDensity option fixes sprites and rects but not text. The standard
 * workaround: create text nodes at TEXT_SS times the intended size and scale
 * them by 1/TEXT_SS, so glyphs downsample onto the screen instead of
 * upscaling.
 */
export const TEXT_SS = 2;

export function isHex(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}
