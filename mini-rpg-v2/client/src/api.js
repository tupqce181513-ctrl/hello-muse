/**
 * Unified endpoint config. One source of truth for where the game server is:
 *
 *   VITE_WS_URL  - full WebSocket URL, e.g. ws://localhost:8080
 *                  (also used to derive the HTTP API base)
 *   VITE_API_URL - full HTTP API base, e.g. http://localhost:8080
 *                  (overrides the WS-derived one when set)
 *
 * When neither is set, the page's own origin is used (production: Express
 * serves the client build; dev: the Vite proxy forwards /api).
 */
export const WS_URL =
  import.meta.env.VITE_WS_URL ||
  (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;

/** Absolute URL for an API path like 'api/skins'. */
export function apiUrl(path) {
  const p = String(path).replace(/^\//, '');
  const apiBase = import.meta.env.VITE_API_URL;
  if (apiBase) return apiBase.replace(/\/$/, '') + '/' + p;
  if (WS_URL.startsWith('ws://') || WS_URL.startsWith('wss://')) {
    return WS_URL.replace(/^ws/, 'http') + '/' + p;
  }
  return '/' + p;
}
