import type { ThemeStore, WeatherMode } from '../theme/store.js';
import { ALL_WEATHERS, type WeatherKind } from '../theme/weather/kinds.js';
import { createRealWeatherSource } from '../theme/weather/real.js';
import { journeyAt } from '../theme/weather/journey.js';

export interface MenuRow { id: string; label: string; active: boolean }
export interface MenuModel { rows: MenuRow[]; chips: MenuRow[] }

const MODE_ROWS: { id: WeatherMode; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'pick', label: 'Pick' },
  { id: 'journey', label: 'Journey' },
  { id: 'real', label: 'Real' },
];

/**
 * Pure popover state: four mode rows always, plus (in pick mode only) one
 * chip per weather kind — 'clear' first so the player has a way to clear a
 * pick, then the nine non-clear kinds from ALL_WEATHERS.
 */
export function menuModel(mode: WeatherMode, picked: WeatherKind): MenuModel {
  const rows: MenuRow[] = MODE_ROWS.map((r) => ({ id: r.id, label: r.label, active: mode === r.id }));
  const chips: MenuRow[] =
    mode === 'pick' ? ALL_WEATHERS.map((k) => ({ id: k, label: k, active: k === picked })) : [];
  return { rows, chips };
}

const REFRESH_MS = 20 * 60 * 1000;

function getPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
    );
  });
}

/** Mounts the ⚙ button + popover into `container`. All DOM lives here; the store owns state. */
export function mountWeatherMenu(store: ThemeStore, container: HTMLElement): void {
  const root = document.createElement('div');
  root.id = 'weather-menu';

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'weather-menu-button';
  button.setAttribute('aria-label', 'Weather settings');
  button.textContent = '⚙';

  const popover = document.createElement('div');
  popover.id = 'weather-menu-popover';
  popover.hidden = true;

  root.appendChild(button);
  root.appendChild(popover);
  container.appendChild(root);

  let note = '';
  let realTimer: ReturnType<typeof setInterval> | null = null;
  let realFocusListener: (() => void) | null = null;

  function teardownReal(): void {
    if (realTimer !== null) { clearInterval(realTimer); realTimer = null; }
    if (realFocusListener !== null) {
      window.removeEventListener('focus', realFocusListener);
      realFocusListener = null;
    }
  }

  function refreshReal(src: ReturnType<typeof createRealWeatherSource>): void {
    void src.refresh().then(() => store.tick());
  }

  function startReal(): void {
    const src = createRealWeatherSource({
      fetchJson: (u) => fetch(u).then((r) => r.json()),
      getPosition,
      now: Date.now,
    });
    store.setRealSource(src);
    src
      .refresh()
      .then(() => {
        store.tick();
        if (store.mode() !== 'real') return; // mode changed while the fetch was in flight
        teardownReal();
        realTimer = setInterval(() => refreshReal(src), REFRESH_MS);
        realFocusListener = () => refreshReal(src);
        window.addEventListener('focus', realFocusListener);
      })
      .catch(() => {
        note = 'location unavailable — staying clear';
        store.setMode('off');
        render();
      });
  }

  function render(): void {
    const { rows, chips } = menuModel(store.mode(), store.picked());

    const rowsHtml = rows
      .map(
        (r) =>
          `<button type="button" class="weather-menu-row${r.active ? ' active' : ''}" data-mode="${r.id}">${r.label}</button>`,
      )
      .join('');

    const chipsHtml = chips.length
      ? `<div id="weather-menu-chips">${chips
          .map(
            (c) =>
              `<button type="button" class="weather-menu-chip${c.active ? ' active' : ''}" data-weather="${c.id}">${c.label}</button>`,
          )
          .join('')}</div>`
      : '';

    const journeyHtml =
      store.mode() === 'journey'
        ? `<div id="weather-menu-journey-label">${journeyAt(Date.now()).a.label}</div>`
        : '';

    const noteHtml = note ? `<div id="weather-menu-note">${note}</div>` : '';

    popover.innerHTML = `${rowsHtml}${chipsHtml}${journeyHtml}${noteHtml}`;

    popover.querySelectorAll<HTMLButtonElement>('.weather-menu-row').forEach((el) => {
      el.addEventListener('click', () => {
        const m = el.dataset.mode as WeatherMode;
        note = '';
        if (m !== 'real') teardownReal();
        store.setMode(m);
        store.tick();
        if (m === 'real') startReal();
        render();
      });
    });

    popover.querySelectorAll<HTMLButtonElement>('.weather-menu-chip').forEach((el) => {
      el.addEventListener('click', () => {
        store.setPicked(el.dataset.weather as WeatherKind);
        store.tick();
        render();
      });
    });
  }

  button.addEventListener('click', () => {
    popover.hidden = !popover.hidden;
    if (!popover.hidden) render();
  });

  render();
}
