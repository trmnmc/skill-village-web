import { startVillage } from './scene/village.js';
import { connect } from './net/client.js';
import { createChatPanel } from './chat/panel.js';
import { displayName } from './render/label.js';
import { initTheme } from './theme/index.js';
import { mountWeatherMenu } from './ui/weather-menu.js';

// Boot the theme store first: it applies --sv-* CSS vars to the document root,
// and everything painted after this (chat panel, scene chrome) should see them.
const themeStore = initTheme();
mountWeatherMenu(themeStore, document.body);

// The panel is built before the scene and the scene is told about the panel:
// each one's reference to the other lives inside an arrow function, which only
// runs long after both exist. Declaring them the other way round would need
// the scene to know what a chat panel is.
const panel = createChatPanel({
  onBubble: (creatureId, text) => scene.sayFor(creatureId, text),
  onThinking: (creatureId) => scene.thinkFor(creatureId),
  onThinkingDone: (creatureId) => scene.clearThoughtFor(creatureId),
});

const scene = await startVillage({
  onCreatureClick: (creature) => panel.open({ id: creature.id, label: displayName(creature) }),
});

connect({
  onView: (view) => {
    scene.setView(view);
    if (view.llm) setSilentBanner(view.llm.mode);
  },
  onStatus: (status) =>
    scene.setStatus(
      status === 'live' ? 'live' : status === 'connecting' ? 'connecting…' : 'server offline — retrying',
    ),
});

// The silent-movie banner rides the live state frames (every frame carries
// the service mode), so it clears itself the moment the boot probe lands and
// can reappear if the CLI is lost mid-session. A page that loads while the
// probe is still in flight briefly sees 'silent', which is a pending answer,
// not a verdict — hence the grace delay before showing anything.
const BANNER_GRACE_MS = 4_000;
let latestMode: 'full' | 'silent' = 'full';
let bannerTimer: ReturnType<typeof setTimeout> | null = null;
let bannerDismissed = false;

function setSilentBanner(mode: 'full' | 'silent'): void {
  latestMode = mode;
  if (mode === 'full') {
    if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
    document.getElementById('silent-banner')?.remove();
    bannerDismissed = false; // a later, separate outage deserves a fresh banner
    return;
  }
  if (bannerDismissed || bannerTimer || document.getElementById('silent-banner')) return;
  bannerTimer = setTimeout(() => {
    bannerTimer = null;
    if (latestMode !== 'silent' || bannerDismissed) return;
    const strip = document.createElement('div');
    strip.id = 'silent-banner';
    strip.innerHTML = `The village is in silent-movie mode — no Claude CLI answered. Creatures speak from memory.
      <small>(Is the claude CLI installed and logged in? The server console says what the probe hit.)</small>
      <button type="button" aria-label="Dismiss">×</button>`;
    strip.querySelector('button')!.addEventListener('click', () => {
      bannerDismissed = true;
      strip.remove();
    });
    document.body.appendChild(strip);
  }, BANNER_GRACE_MS);
}
