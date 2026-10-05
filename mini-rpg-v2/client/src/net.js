import Phaser from 'phaser';
import { WS_URL } from './api.js';

/**
 * NetworkManager — wraps the WebSocket and re-emits typed events:
 *   'welcome' ({ id, map, npcs, chat }), 'state' ({ players, monsters, projectiles, items }),
 *   'chat' ({ name, text }), 'npc_dialog' ({ npc, name, quests })
 *   'status'  ('connecting' | 'open' | 'closed' | 'error')
 *   'resume_failed' — stored token was rejected; the UI should show the join form.
 *
 * Session resume: the server issues a random token at join/resume, kept in
 * localStorage on THIS device. The display name is never used as the identity.
 * Reconnects use capped exponential backoff and never open a second socket.
 */
const TOKEN_KEY = 'miniRpg.resumeToken';
const MAX_RECONNECT = 10;

export class Net extends Phaser.Events.EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.myId = null;
    this.players = [];
    this.self = null; // F12: private state, sent only to the owning socket as `me`
    this.monsters = []; this.projectiles = [];
    this.items = [];
    this.dmg = [];
    this.map = null; // tile map from 'welcome'
    this.npcs = [];  // static NPCs from 'welcome'
    this.status = 'idle';
    this.connecting = false;
    this.manualClose = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
  }

  setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.emit('status', s);
  }

  connect() {
    // never open a second socket while one is connecting/open
    if (this.connecting || (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1))) return;
    this.connecting = true;
    this.setStatus('connecting');
    let ws;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      this.connecting = false;
      this.setStatus('error');
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.connecting = false;
      this.reconnectAttempts = 0;
      this.setStatus('open');
      // resume the saved session if this device has a token
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) this.send({ t: 'resume', token });
      else this.emit('need_join');
    };
    ws.onerror = () => this.setStatus('error');
    ws.onclose = () => {
      this.connecting = false;
      this.setStatus('closed');
      this.emit('chat', { name: 'Server', text: 'Mất kết nối tới server...' });
      this.scheduleReconnect();
    };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'welcome') {
        this.myId = m.id;
        this.map = m.map || null;
        this.npcs = m.npcs || [];
        if (m.token) {
          try { localStorage.setItem(TOKEN_KEY, m.token); } catch { /* private mode */ }
        }
        this.emit('welcome', m);
      } else if (m.t === 'resume_failed') {
        try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
        this.emit('resume_failed', m);
      } else if (m.t === 'state') {
        // R08: never let a malformed payload poison the scene sync
        if (!m || !Array.isArray(m.players)) return;
        this.players = m.players;
        this.self = m.me || null; // private state (inv/quests/gold) — never in players[]
        this.monsters = m.monsters; this.projectiles = m.projectiles || [];
        this.items = m.items || [];
        this.dmg = m.dmg || []; // per-tick server damage events
        this.emit('state', m);
      } else if (m.t === 'chat') {
        this.emit('chat', m);
      } else if (m.t === 'npc_dialog') {
        this.emit('npc_dialog', m);
      }
    };
  }

  /** Capped exponential backoff: 1s, 2s, 4s … max 30s, gives up after 10 tries. */
  scheduleReconnect() {
    if (this.manualClose || this.reconnectTimer) return;
    if (this.reconnectAttempts >= MAX_RECONNECT) {
      this.emit('chat', { name: 'Server', text: 'Không nối lại được. Hãy tải lại trang.' });
      return;
    }
    const delay = Math.min(30000, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  disconnect() {
    this.manualClose = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) this.ws.close();
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  join(name, skin) {
    const doJoin = () => this.send({ t: 'join', name, ...(skin ? { skin } : {}) });
    if (this.ws.readyState === 1) doJoin();
    else this.ws.addEventListener('open', doJoin, { once: true });
  }

  me() {
    // prefer the private `me` payload; fall back to the public list
    return this.self || this.players.find((p) => p.id === this.myId);
  }
}
