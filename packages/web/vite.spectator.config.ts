import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/** The showroom server owns 8263; same one-origin proxy trick as the game. */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: {
    outDir: 'dist-spectator',
    // main.ts's boot sequence is a top-level `await startSpectatorVillage(...)`
    // (verbatim from the plan) — esbuild's default transpile target predates
    // top-level await, and drops it into a build error rather than a runtime
    // one. 'esnext' matches the module-script baseline index.html/spectator.html
    // already assume (Vite's dev server never applies this downleveling at all).
    target: 'esnext',
    rollupOptions: { input: fileURLToPath(new URL('./spectator.html', import.meta.url)) },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8263', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:8263', ws: true },
    },
  },
});
