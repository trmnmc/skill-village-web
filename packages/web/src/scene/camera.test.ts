import { describe, it, expect } from 'vitest';
import { WORLD_W } from '../layout/zones.js';
import { ZOOM, screenToWorld, clampCamX } from './camera.js';

describe('camera', () => {
  it('zooms in past 1:1 so the village fills the frame', () => {
    expect(ZOOM).toBeGreaterThan(1);
    expect(ZOOM).toBeLessThanOrEqual(1.5);
  });

  it('maps the viewport centre to the camera position at any zoom', () => {
    expect(screenToWorld(640, 2000, 1280)).toBe(2000);
  });

  it('maps screen offsets to world offsets shrunk by the zoom', () => {
    // A cursor 120 screen-px right of centre is 120 / ZOOM world-px right of
    // the camera. Without the division every hover and click lands wide of
    // the villager by exactly the zoom factor times its distance from centre.
    expect(screenToWorld(640 + 120, 2000, 1280)).toBeCloseTo(2000 + 120 / ZOOM, 6);
    expect(screenToWorld(640 - 120, 2000, 1280)).toBeCloseTo(2000 - 120 / ZOOM, 6);
  });

  it('clamps the camera so the visible slice never leaves the world', () => {
    // Zoomed in, the visible slice is viewport / ZOOM wide — clamping by the
    // unscaled half-viewport (the old rule) would stop the pan short of both
    // world edges by the difference.
    const half = 1280 / 2 / ZOOM;
    expect(clampCamX(0, 1280)).toBe(half);
    expect(clampCamX(WORLD_W, 1280)).toBe(WORLD_W - half);
    expect(clampCamX(2000, 1280)).toBe(2000);
  });
});
