// packages/web/src/sound/soundcheck.ts
import { sound } from './player.js';
import { voiceParamsFor } from './voice.js';

/**
 * Dev tuning harness, spec §8: `?soundcheck` adds trigger buttons over the
 * real engine so retuning a §10 constant doesn't require staging a hop.
 * Synthetic events fire at the camera's own x so nothing is attenuated away.
 */
export function mountSoundcheck(): void {
  if (!new URLSearchParams(location.search).has('soundcheck')) return;
  const voice = voiceParamsFor({ id: 'skill:soundcheck', kind: 'skill', appearance: { body: 'round' } });
  const agentVoice = voiceParamsFor({ id: 'agent:soundcheck', kind: 'agent', appearance: { body: 'lanky' } });
  const x = () => 2150; // Homes centre; setCamera keeps the director honest anyway.

  const panel = document.createElement('div');
  panel.id = 'soundcheck';
  const triggers: [string, () => void][] = [
    ['chirp', () => sound.event({ type: 'greeting', x: x(), voice })],
    ['agent chirp', () => sound.event({ type: 'greeting', x: x(), voice: agentVoice })],
    ['babble', () => sound.event({ type: 'speak', x: x(), voice, textLength: 90, canned: false })],
    ['thinking', () => sound.event({ type: 'thinking', x: x(), voice })],
    ['hop', () => sound.event({ type: 'hop-landed', x: x() })],
    ['sleep', () => sound.event({ type: 'sleep-start', x: x(), voice })],
    ['bubble', () => sound.event({ type: 'bubble-in', x: x() })],
    ['moved in', () => sound.event({ type: 'moved-in', x: x(), voice })],
    ['stage up', () => sound.event({ type: 'stage-up', x: x() })],
    ['offline', () => sound.event({ type: 'offline' })],
    ['reconnect', () => sound.event({ type: 'reconnected' })],
  ];
  for (const [label, fire] of triggers) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', fire);
    panel.appendChild(b);
  }
  document.body.appendChild(panel);
}
