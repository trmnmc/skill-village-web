import { defineConfig } from 'vite';

/** The server owns 8262; Vite proxies to it so the browser sees one origin. */
export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8262', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:8262', ws: true },
    },
  },
});
