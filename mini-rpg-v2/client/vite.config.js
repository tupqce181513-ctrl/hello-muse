import { defineConfig } from 'vite';

// Dev: the game server runs on :8080, Vite on :5173.
// Both /api (HTTP) and /ws (WebSocket) are proxied so the client can use
// same-origin relative URLs in dev, exactly like production
// (where Express serves the built client itself). No CORS needed.
const GAME_SERVER = process.env.VITE_PROXY_TARGET || 'http://localhost:8080';
const GAME_WS = GAME_SERVER.replace(/^http/, 'ws');

export default defineConfig({
  base: './', // relative paths so the build works when served from any folder
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    proxy: {
      '/api': { target: GAME_SERVER, changeOrigin: true },
      '/ws': { target: GAME_WS, ws: true, changeOrigin: true },
    },
  },
});
