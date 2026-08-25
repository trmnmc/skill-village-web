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
    // `main.ts` boots with a top-level `await startVillage(...)`, and
    // esbuild's default transpile target predates top-level await — it fails
    // the *build* rather than degrading at runtime. 'esnext' matches the
    // module-script baseline index.html already assumes, and is what
    // vite.spectator.config.ts settled on for the identical reason (the dev
    // server never applies this downleveling, which is why only `build:web`
    // ever hit it).
    target: 'esnext',
  },
  server: {
    port: 5173,
    // Vite 5.4.12+ rejects requests whose Host header isn't localhost or a
    // bare IP (DNS-rebinding protection). Tailscale MagicDNS names are how
    // you reach a dev village from another machine — `tailscale serve`
    // fronts this port at https://<host>.<tailnet>.ts.net — so admit that
    // one suffix. It is not a hole: those names only resolve, and only
    // route, inside your own tailnet.
    allowedHosts: ['.ts.net'],
    proxy: {
      '/api': { target: 'http://127.0.0.1:8262', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:8262', ws: true },
    },
  },
});
