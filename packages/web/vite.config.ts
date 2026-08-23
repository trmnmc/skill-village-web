import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/** The server owns 8262; Vite proxies to it so the browser sees one origin. */
export default defineConfig({
  // Resolved against this file's own location, not the process cwd: `npm run
  // dev:web` invokes `vite --config packages/web/vite.config.ts` from the
  // repo root, and a bare '.' resolves against that cwd instead of this
  // directory — root ends up at the repo root and index.html 404s.
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: {
    outDir: 'dist',
    // main.ts's boot sequence is a top-level `await startVillage(...)`, and
    // esbuild's default transpile target predates top-level await — it fails
    // the build rather than downleveling. 'esnext' matches the module-script
    // baseline index.html already assumes; the spectator build sets the same
    // target for the same reason.
    target: 'esnext',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8262', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:8262', ws: true },
    },
  },
  // `npm run preview` serves the built bundle the way the droplet's nginx
  // does — static files up front, /api and /ws proxied to the game server —
  // so a production build can be checked before it is deployed.
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8262', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:8262', ws: true },
    },
  },
});
