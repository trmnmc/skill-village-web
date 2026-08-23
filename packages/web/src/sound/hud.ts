// packages/web/src/sound/hud.ts
import { sound } from './player.js';
import type { BusName } from './types.js';

/**
 * The mixing desk, spec §6: one speaker button, click toggles master mute,
 * hover reveals the four bus sliders. Plain DOM like the chat panel — the
 * canvas stays a place where creatures live.
 */
export function mountSoundHud(): void {
  const root = document.createElement('div');
  root.id = 'sound-hud';
  root.innerHTML = `
    <button id="sound-mute" type="button" aria-label="Toggle sound"></button>
    <div id="sound-popover" hidden>
      <label>master <input data-bus="master" type="range" min="0" max="100"></label>
      <label>voices <input data-bus="voices" type="range" min="0" max="100"></label>
      <label>sfx <input data-bus="sfx" type="range" min="0" max="100"></label>
      <label>ambience <input data-bus="ambience" type="range" min="0" max="100"></label>
      <label>music <input data-bus="music" type="range" min="0" max="100"></label>
    </div>
  `;
  document.body.appendChild(root);

  const btn = root.querySelector<HTMLButtonElement>('#sound-mute')!;
  const popover = root.querySelector<HTMLDivElement>('#sound-popover')!;
  const sliders = [...root.querySelectorAll<HTMLInputElement>('input[type=range]')];

  const render = () => {
    const s = sound.settings();
    // The dot is "audio not unlocked yet", spec §6 — not an error, a hint.
    btn.textContent = s.muted ? '🔇' : '🔊';
    btn.classList.toggle('locked', !sound.unlocked());
    for (const slider of sliders) {
      const bus = slider.dataset.bus!;
      slider.value = String(Math.round((bus === 'master' ? s.master : s.buses[bus as BusName]) * 100));
    }
  };

  btn.addEventListener('click', () => {
    const s = sound.settings();
    sound.updateSettings({ ...s, muted: !s.muted });
    render();
  });
  for (const slider of sliders) {
    slider.addEventListener('input', () => {
      const s = sound.settings();
      const v = Number(slider.value) / 100;
      const bus = slider.dataset.bus!;
      sound.updateSettings(
        bus === 'master'
          ? { ...s, master: v }
          : { ...s, buses: { ...s.buses, [bus]: v } },
      );
    });
  }
  root.addEventListener('mouseenter', () => { popover.hidden = false; });
  root.addEventListener('mouseleave', () => { popover.hidden = true; });
  // The unlock dot clears on the same first gesture that unlocks audio.
  // player.ts unlocks on pointerdown OR keydown, so the HUD has to listen
  // for both — a keyboard-only first gesture would otherwise leave the
  // dot stuck. Both may fire once each; the double render is harmless.
  const onFirstGesture = () => setTimeout(render, 0);
  window.addEventListener('pointerdown', onFirstGesture, { once: true });
  window.addEventListener('keydown', onFirstGesture, { once: true });
  render();
}
