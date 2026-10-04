import Phaser from 'phaser';

/**
 * NetworkManager — wraps the WebSocket and re-emits typed events:
 *   'welcome' ({ id, map, chat }), 'state' ({ players, slimes }), 'chat' ({ name, text })
 *
 * Dev note: when running the Vite dev server, point it at the game server with
 *   echo 'VITE_WS_URL=ws://localhost:8080' > .env
 */
const WS_URL =
  import.meta.env.VITE_WS_URL ||
  (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;

export class Net extends Phaser.Events.EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.myId = null;
    this.players = [];
    this.slimes = [];
    this.map = null; // tile map from 'welcome'
  }

  connect() {
    this.ws = new WebSocket(WS_URL);
    this.ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'welcome') {
        this.myId = m.id;
        this.map = m.map || null;
        this.emit('welcome', m);
      } else if (m.t === 'state') {
        this.players = m.players;
        this.slimes = m.slimes;
        this.emit('state', m);
      } else if (m.t === 'chat') {
        this.emit('chat', m);
      }
    };
    this.ws.onclose = () =>
      this.emit('chat', { name: 'Server', text: 'Mất kết nối tới server...' });
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
