import Phaser from 'phaser';
import { WS_URL } from './api.js';

/**
 * NetworkManager — wraps the WebSocket and re-emits typed events:
 *   'welcome' ({ id, map, npcs, chat }), 'state' ({ players, slimes, items }),
 *   'chat' ({ name, text }), 'npc_dialog' ({ npc, name, quests })
 *   'status'  ('connecting' | 'open' | 'closed' | 'error')
 *
 * Dev note: when running the Vite dev server, point it at the game server with
 *   echo 'VITE_WS_URL=ws://localhost:8080' > .env
 * (API calls then go through the /api proxy in vite.config.js.)
 */
export class Net extends Phaser.Events.EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.myId = null;
    this.players = [];
    this.slimes = [];
    this.items = [];
    this.map = null; // tile map from 'welcome'
    this.npcs = [];  // static NPCs from 'welcome'
    this.status = 'idle';
  }

  setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.emit('status', s);
  }

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    this.setStatus('connecting');
    let ws;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      this.setStatus('error');
      return;
    }
    this.ws = ws;
    ws.onopen = () => this.setStatus('open');
    ws.onerror = () => this.setStatus('error');
    ws.onclose = () => {
      this.setStatus('closed');
      this.emit('chat', { name: 'Server', text: 'Mất kết nối tới server...' });
    };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'welcome') {
        this.myId = m.id;
        this.map = m.map || null;
        this.npcs = m.npcs || [];
        this.emit('welcome', m);
      } else if (m.t === 'state') {
        this.players = m.players;
        this.slimes = m.slimes;
        this.items = m.items || [];
        this.emit('state', m);
      } else if (m.t === 'chat') {
        this.emit('chat', m);
      } else if (m.t === 'npc_dialog') {
        this.emit('npc_dialog', m);
      }
    };
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
    return this.players.find((p) => p.id === this.myId);
  }
}
