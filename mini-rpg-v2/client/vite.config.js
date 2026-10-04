import { defineConfig } from 'vite';

// Dev: the game server runs on :8080, Vite on :5173.
// The proxy below lets the client use relative /api URLs in dev,
// exactly like production (where Express serves the built client).
const GAME_SERVER = process.env.VITE_PROXY_TARGET || 'http://localhost:8080';

export default defineConfig({
  base: './', // relative paths so the build works when served from any folder
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    proxy: {
      '/api': { target: GAME_SERVER, changeOrigin: true },
    },
  },
});
