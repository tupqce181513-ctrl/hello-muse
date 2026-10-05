/**
 * Unified endpoint config — same-origin everywhere:
 *
 *   HTTP API : relative '/api/...'
 *     dev  -> Vite proxies /api to the game server
 *     prod -> Express serves the built client itself
 *   WebSocket: '/ws' on the page's own host
 *     dev  -> Vite proxies /ws (with ws:true) to the game server
 *     prod -> same Express server (its ws endpoint accepts any path)
 *
 * Overrides (only when you really need them):
 *   VITE_API_URL - full HTTP API base, e.g. http://localhost:8080
 *   VITE_WS_URL  - full WebSocket URL, e.g. ws://localhost:8080
 */
const WS_PROTO = location.protocol === 'https:' ? 'wss://' : 'ws://';

export const WS_URL =
  import.meta.env.VITE_WS_URL || WS_PROTO + location.host + '/ws';

/** URL for an API path like 'api/skins' (relative by default, via proxy). */
export function apiUrl(path) {
  const p = String(path).replace(/^\//, '');
  const apiBase = import.meta.env.VITE_API_URL;
  if (apiBase) return apiBase.replace(/\/$/, '') + '/' + p;
  return '/' + p;
}
