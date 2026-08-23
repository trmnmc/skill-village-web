import { startVillage } from './scene/village.js';
import { connect } from './net/client.js';
import { createChatPanel } from './chat/panel.js';
import { displayName } from './render/label.js';

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
  onView: (view) => scene.setView(view),
  onStatus: (status) =>
    scene.setStatus(
      status === 'live' ? 'live' : status === 'connecting' ? 'connecting…' : 'server offline — retrying',
    ),
});

// Silent mode is a property of the server process, not of the village state,
// so it is asked for once rather than watched: no CLI answered at boot and
// none will start answering later in this session.
void fetch('/api/llm')
  .then((r) => r.json())
  .then((llm: { mode?: string }) => {
    if (llm.mode !== 'silent') return;
    const strip = document.createElement('div');
    strip.id = 'silent-banner';
    strip.innerHTML = `The village is in silent-movie mode — no Claude CLI answered. Creatures speak from memory.
      <small>(Started from inside a Claude Code session? Run npm run dev from a plain terminal.)</small>
      <button type="button" aria-label="Dismiss">×</button>`;
    strip.querySelector('button')!.addEventListener('click', () => strip.remove());
    document.body.appendChild(strip);
  })
  .catch(() => {
    // No answer from the server is already visible in the status line; a
    // missing banner is not worth a second complaint.
  });
