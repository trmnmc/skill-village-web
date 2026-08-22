import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/** The server owns 8262; Vite proxies to it so the browser sees one origin. */
export default defineConfig({
  // Resolved against this file's own location, not the process cwd: `npm run
  // dev:web` invokes `vite --config packages/web/vite.config.ts` from the
  // repo root, and a bare '.' resolves against that cwd instead of this
  // directory — root ends up at the repo root and index.html 404s.
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8262', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:8262', ws: true },
    },
  },
});
