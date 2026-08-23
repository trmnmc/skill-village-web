/**
 * The way into the Swarm Showroom from inside the game.
 *
 * The showroom is a second app in this repo — its own entry point, its own
 * server, its own deploy — and nothing in the running game said so, which
 * is how someone can work in this repo for a week without learning it
 * exists. This is that signpost.
 */

/** Where the public showroom lives once the deploy in docs/showroom-deploy.md lands. */
export const SHOWROOM_URL = 'https://village.fenley.ai';

/**
 * Where the showroom actually is while you are building it: the spectator
 * vite server (`npm run dev:spectator`), which serves its own entry point on
 * its own port. A dev build must not link at the public host — that host
 * only answers after the droplet deploy, and a signpost to a dead address is
 * worse than no signpost.
 */
export const SHOWROOM_DEV_URL = 'http://localhost:5176/spectator.html';

/** Which showroom a build should point at. Pure so it can be tested without a DOM. */
export function showroomHref(isDev: boolean): string {
  return isDev ? SHOWROOM_DEV_URL : SHOWROOM_URL;
}

/**
 * Mount the signpost. Styling lives in index.html beside the other chrome,
 * so this only owns the element and its destination.
 */
export function mountShowroomLink(parent: HTMLElement, isDev: boolean): HTMLAnchorElement {
  const link = document.createElement('a');
  link.id = 'showroom-link';
  link.href = showroomHref(isDev);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Swarm Showroom \u2197';
  link.title = isDev
    ? 'The public village of what Swarm built \u2014 run `npm run dev:spectator` to serve it'
    : 'The public village of what Swarm built';
  parent.append(link);
  return link;
}
