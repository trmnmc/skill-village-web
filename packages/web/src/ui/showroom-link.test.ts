import { describe, it, expect } from 'vitest';
import { SHOWROOM_DEV_URL, SHOWROOM_URL, showroomHref } from './showroom-link.js';

describe('showroomHref', () => {
  it('sends a production build to the public showroom', () => {
    expect(showroomHref(false)).toBe(SHOWROOM_URL);
  });

  it('sends a dev session to the local spectator server', () => {
    // The public host only answers after the droplet deploy in
    // docs/showroom-deploy.md; while you are working on the showroom it
    // lives on the spectator vite server, and a link into a dead host is
    // worse than no link at all.
    expect(showroomHref(true)).toBe(SHOWROOM_DEV_URL);
  });

  it('points the dev link at the spectator entry, not the game', () => {
    expect(SHOWROOM_DEV_URL).toContain('spectator.html');
    expect(SHOWROOM_DEV_URL).not.toContain('5173');
  });

  it('points the public link at an https host', () => {
    expect(SHOWROOM_URL.startsWith('https://')).toBe(true);
  });
});
