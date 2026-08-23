import { createThemeStore, cssVars, type ThemeStore } from './store.js';

export let themeStore: ThemeStore;

/** Boot the one store; main.ts calls this before the scene starts. */
export function initTheme(): ThemeStore {
  themeStore = createThemeStore();
  themeStore.subscribe((t) => {
    const vars = cssVars(t);
    for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  });
  themeStore.start();
  // start() ticks immediately, but the subscriber only fires on a change from
  // the (null) baseline — apply once explicitly so the first paint always
  // gets vars even if that first tick's publish raced the subscription.
  const vars = cssVars(themeStore.current());
  for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  return themeStore;
}
