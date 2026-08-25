import type { ThemeStore, WeatherMode } from '../theme/store.js';
import { PALETTES, type PaletteId } from '../theme/palettes.js';
import { ALL_WEATHERS, type WeatherKind } from '../theme/weather/kinds.js';
import { createRealWeatherSource } from '../theme/weather/real.js';
import { journeyAt } from '../theme/weather/journey.js';

export interface MenuRow { id: string; label: string; active: boolean }
export interface MenuModel { rows: MenuRow[]; chips: MenuRow[]; timeChips?: MenuRow[]; paletteChips?: MenuRow[] }

/** Palette-pin presets: 'auto' (follow the schedule) then every palette, by name. */
export const PALETTE_IDS = Object.keys(PALETTES) as PaletteId[];

/** Sky dev-override params — the ones theme/store.ts parseOverrides honours. */
const OVERRIDE_KEYS = ['at', 'day', 'weather', 'palette'] as const;

const VALID_DAYS = new Set(['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'weave']);

/**
 * Which sky dev-override params in a search string would actually override
 * the store — mirrors parseOverrides's own validation, so the menu's
 * "override active" note never shows for a malformed param the store
 * ignores anyway. Sorted for a stable render/test order.
 */
export function skyOverrideKeys(search: string): string[] {
  const params = new URLSearchParams(search);
  const present: string[] = [];
  const at = params.get('at');
  if (at && /^([01]?\d|2[0-3]):[0-5]\d$/.test(at)) present.push('at');
  const day = params.get('day');
  if (day && VALID_DAYS.has(day)) present.push('day');
  const weather = params.get('weather');
  if (weather && (ALL_WEATHERS as string[]).includes(weather)) present.push('weather');
  const palette = params.get('palette');
  if (palette && Object.hasOwn(PALETTES, palette)) present.push('palette');
  return present.sort();
}

/**
 * The player's click beats the dev URL: strip every sky override so the menu
 * takes effect immediately (the store re-reads location.search each tick).
 * Overrides exist to LOAD a deterministic scene, not to deadlock the controls
 * — leaving them armed after a click is how "the menu is broken" reports
 * happen. replaceState keeps history clean (no back-button spam).
 */
function takeOverFromUrl(): void {
  if (typeof window === 'undefined') return;
  if (skyOverrideKeys(window.location.search).length === 0) return;
  const url = new URL(window.location.href);
  for (const key of OVERRIDE_KEYS) url.searchParams.delete(key);
  window.history.replaceState(null, '', url);
}

const MODE_ROWS: { id: WeatherMode; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'pick', label: 'Pick' },
  { id: 'journey', label: 'Journey' },
  { id: 'real', label: 'Real' },
];

/** Time-pin presets: id/label/minute-of-day, in menu order. */
export const TIME_CHIPS: { id: string; label: string; minute: number }[] = [
  { id: 'dawn', label: 'dawn', minute: 380 },
  { id: 'morning', label: 'morning', minute: 570 },
  { id: 'noon', label: 'noon', minute: 750 },
  { id: 'golden', label: 'golden hour', minute: 1070 },
  { id: 'sunset', label: 'sunset', minute: 1125 },
  { id: 'evening', label: 'evening', minute: 1180 },
  { id: 'night', label: 'night', minute: 1380 },
];

/**
 * Pure popover state: four mode rows always, plus (in pick mode only) one
 * chip per weather kind — 'clear' first so the player has a way to clear a
 * pick, then the nine non-clear kinds from ALL_WEATHERS. `timeChips` is
 * included in every mode except journey (which owns time itself and ignores
 * any pin): an 'auto' chip first, active when nothing is pinned, then the
 * seven TIME_CHIPS presets, active when pinned matches their minute.
 * `paletteChips` follows the same auto-plus-presets shape and the same
 * journey exclusion — journey paints from its own waypoint palettes.
 */
export function menuModel(
  mode: WeatherMode,
  picked: WeatherKind,
  pinned: number | null,
  pinnedPalette: PaletteId | null = null,
): MenuModel {
  const rows: MenuRow[] = MODE_ROWS.map((r) => ({ id: r.id, label: r.label, active: mode === r.id }));
  const chips: MenuRow[] =
    mode === 'pick' ? ALL_WEATHERS.map((k) => ({ id: k, label: k, active: k === picked })) : [];
  const model: MenuModel = { rows, chips };
  if (mode !== 'journey') {
    model.timeChips = [
      { id: 'auto', label: 'auto', active: pinned === null },
      ...TIME_CHIPS.map((c) => ({ id: c.id, label: c.label, active: pinned === c.minute })),
    ];
    model.paletteChips = [
      { id: 'auto', label: 'auto', active: pinnedPalette === null },
      ...PALETTE_IDS.map((id) => ({ id, label: PALETTES[id].name, active: pinnedPalette === id })),
    ];
  }
  return model;
}

const REFRESH_MS = 20 * 60 * 1000;

// Generation counter for Real-mode activations. `store.mode() === 'real'`
// alone can't tell a fresh activation apart from a stale, still-in-flight one
// that happens to resolve after mode has cycled back to 'real' again — two
// startReal() calls racing would otherwise let whichever promise resolves
// last install its (possibly stale) source's interval/listener. Each
// startReal() call mints a new generation; a leave-real teardown bumps it too
// so any activation in flight at that moment is permanently stale.
let realGen = 0;

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

  function refreshReal(src: ReturnType<typeof createRealWeatherSource>, gen: number): void {
    void src.refresh().then(() => {
      if (gen !== realGen || store.mode() !== 'real') return; // this activation is stale
      store.tick();
    });
  }

  function startReal(): void {
    const gen = ++realGen;
    const src = createRealWeatherSource({
      fetchJson: (u) => fetch(u).then((r) => r.json()),
      getPosition,
      now: Date.now,
    });
    store.setRealSource(src);
    src
      .refresh()
      .then(() => {
        // A newer activation (or a mode change away from real) has since
        // superseded this one — do not resurrect its timer/listener/source.
        if (gen !== realGen || store.mode() !== 'real') return;
        store.tick();
        teardownReal();
        realTimer = setInterval(() => refreshReal(src, gen), REFRESH_MS);
        realFocusListener = () => refreshReal(src, gen);
        window.addEventListener('focus', realFocusListener);
      })
      .catch(() => {
        // Same staleness guard: if the player already picked Pick/Journey
        // (or re-triggered Real) while the geolocation prompt sat open, a
        // late denial must not stomp their later choice back to off.
        if (gen !== realGen || store.mode() !== 'real') return;
        note = 'location unavailable — staying clear';
        store.setRealSource(null);
        store.setMode('off');
        render();
      });
  }

  function render(): void {
    const { rows, chips, timeChips, paletteChips } = menuModel(
      store.mode(),
      store.picked(),
      store.pinnedTime(),
      store.pinnedPalette(),
    );

    const timeChipsHtml = timeChips
      ? `<div id="weather-menu-time-chips">${timeChips
          .map(
            (c) =>
              `<button type="button" class="weather-menu-chip${c.active ? ' active' : ''}" data-time="${c.id}">${c.label}</button>`,
          )
          .join('')}</div>`
      : '';

    const paletteChipsHtml = paletteChips
      ? `<div id="weather-menu-palette-chips">${paletteChips
          .map(
            (c) =>
              `<button type="button" class="weather-menu-chip${c.active ? ' active' : ''}" data-palette="${c.id}">${c.label}</button>`,
          )
          .join('')}</div>`
      : '';

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

    // A dev URL loads a fixed sky; until the player clicks something here,
    // the menu is overridden by it — say so instead of looking broken. Any
    // click strips the params (takeOverFromUrl) and this line disappears.
    const overridden = typeof window !== 'undefined' ? skyOverrideKeys(window.location.search) : [];
    const overrideHtml = overridden.length
      ? `<div id="weather-menu-override-note">dev URL is setting ${overridden.join(', ')} — click anything here to take over</div>`
      : '';
    const noteHtml = note ? `<div id="weather-menu-note">${note}</div>` : '';

    popover.innerHTML = `${overrideHtml}${paletteChipsHtml}${timeChipsHtml}${rowsHtml}${chipsHtml}${journeyHtml}${noteHtml}`;

    popover.querySelectorAll<HTMLButtonElement>('#weather-menu-palette-chips .weather-menu-chip').forEach((el) => {
      el.addEventListener('click', () => {
        takeOverFromUrl();
        const id = el.dataset.palette!;
        store.setPinnedPalette(id === 'auto' ? null : (id as PaletteId));
        store.tick();
        render();
      });
    });

    popover.querySelectorAll<HTMLButtonElement>('#weather-menu-time-chips .weather-menu-chip').forEach((el) => {
      el.addEventListener('click', () => {
        takeOverFromUrl();
        const id = el.dataset.time!;
        const minute = id === 'auto' ? null : TIME_CHIPS.find((c) => c.id === id)!.minute;
        store.setPinnedTime(minute);
        store.tick();
        render();
      });
    });

    popover.querySelectorAll<HTMLButtonElement>('.weather-menu-row').forEach((el) => {
      el.addEventListener('click', () => {
        takeOverFromUrl();
        const m = el.dataset.mode as WeatherMode;
        note = '';
        // Bump the generation here (not inside teardownReal, which the
        // success .then also calls to swap timers within the *same*
        // generation) so leaving real invalidates any activation still in
        // flight without the success path invalidating itself.
        if (m !== 'real') { realGen++; teardownReal(); }
        store.setMode(m);
        store.tick();
        if (m === 'real') startReal();
        render();
      });
    });

    popover.querySelectorAll<HTMLButtonElement>('#weather-menu-chips .weather-menu-chip').forEach((el) => {
      el.addEventListener('click', () => {
        takeOverFromUrl();
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
