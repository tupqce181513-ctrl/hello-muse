'use strict';
/**
 * Mini RPG — authoritative game server (Node.js + WebSockets).
 *
 *  Run:  npm install
 *        node server.js        ->  open http://localhost:8080
 *
 *  Protocol (JSON over WebSocket):
 *    Client -> Server:
 *      { t:'join',   name }            register a new hero
 *      { t:'input',  x, y }            movement vector (-1..1), sent repeatedly
 *      { t:'attack' }                  swing weapon (server rate-limits)
 *      { t:'chat',   text }            chat message
 *    Server -> Client:
 *      { t:'welcome', id, obstacles, chat }   your id + world info
 *      { t:'state',   players, slimes }       full snapshot, 20x/sec
 *      { t:'chat',    name, text }            chat event
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const TICK_MS = 50; // 20 ticks per second
const WORLD = { w: 1600, h: 1200 };
const PLAYER_SPEED = 200;   // px per second
const ATTACK_RANGE = 80;
const ATTACK_CD = 0.45;     // seconds between swings
const SLIME_COUNT = 8;

// Trees / rocks the heroes must walk around: { x, y, r }
const OBSTACLES = [
  { x: 300, y: 300, r: 30 }, { x: 900, y: 250, r: 30 },
  { x: 1300, y: 500, r: 30 }, { x: 500, y: 800, r: 30 },
  { x: 1100, y: 900, r: 30 }, { x: 200, y: 1000, r: 30 },
  { x: 750, y: 600, r: 40 }, { x: 1400, y: 150, r: 26 },
];

/* ---------------- static file server (serves ./public) ---------------- */
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
};
const server = http.createServer((req, res) => {
  const p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.join(PUBLIC, path.normalize(p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
const wss = new WebSocket.Server({ server });

/* ---------------- game state ---------------- */
let nextId = 1;
const players = new Map(); // id -> player
const slimes = [];
const chatLog = [];        // last 30 messages, sent to newcomers
const COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#fd79a8'];

const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function makeSlime() {
  return {
    id: nextId++, x: rand(120, WORLD.w - 120), y: rand(120, WORLD.h - 120),
    hp: 60, maxHp: 60, dead: false, flash: 0,
    wx: 0, wy: 0, wt: 0, touchCd: 0, respawnAt: 0,
  };
}
function resetSlime(s) {
  const f = makeSlime();
  s.x = f.x; s.y = f.y; s.hp = s.maxHp; s.dead = false; s.flash = 0;
}
for (let i = 0; i < SLIME_COUNT; i++) slimes.push(makeSlime());

function broadcast(msg) {
  const s = JSON.stringify(msg);
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN) c.send(s);
  }
}
function addChat(name, text) {
  const m = { name, text };
  chatLog.push(m);
  if (chatLog.length > 30) chatLog.shift();
  broadcast({ t: 'chat', ...m });
}

/* ---------------- combat ---------------- */
function gainXp(p, amt) {
  p.xp += amt;
  let need = p.level * 100;
  while (p.xp >= need) {
    p.xp -= need;
    p.level++;
    p.maxHp += 20;
    p.hp = p.maxHp;
    need = p.level * 100;
    addChat('Server', `${p.name} đã lên cấp ${p.level}!`);
  }
}

function tryAttack(p) {
  if (p.atkCd > 0 || p.dead) return;
  p.atkCd = ATTACK_CD;
  p.atkAnim = 0.18;
  const dmg = 20 + (p.level - 1) * 8;
  for (const s of slimes) {
    if (s.dead) continue;
    const dx = s.x - p.x, dy = s.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < ATTACK_RANGE + 14) {
      const dot = (dx * p.fx + dy * p.fy) / (d || 1);
      if (dot > 0.1 || d < 40) { // must face the slime (or be right on top of it)
        s.hp -= dmg;
        s.flash = 0.15;
        if (s.hp <= 0) {
          s.dead = true;
          s.respawnAt = Date.now() + 5000;
          gainXp(p, 25);
        }
      }
    }
  }
}

function collideWorld(e, r) {
  e.x = Math.max(r, Math.min(WORLD.w - r, e.x));
  e.y = Math.max(r, Math.min(WORLD.h - r, e.y));
  for (const o of OBSTACLES) {
    const dx = e.x - o.x, dy = e.y - o.y;
    const d = Math.hypot(dx, dy), min = o.r + r;
    if (d < min && d > 0.001) {
      e.x = o.x + (dx / d) * min;
      e.y = o.y + (dy / d) * min;
    }
  }
}

/* ---------------- connections ---------------- */
wss.on('connection', (ws) => {
  const id = nextId++;
  let player = null;

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'join' && !player) {
      const name = String(m.name || 'Hero').slice(0, 16) || 'Hero';
      player = {
        id, name, x: rand(200, 400), y: rand(200, 400),
        hp: 100, maxHp: 100, xp: 0, level: 1,
        vx: 0, vy: 0, fx: 1, fy: 0,
        color: COLORS[id % COLORS.length],
        atkCd: 0, atkAnim: 0, hurtCd: 0,
        dead: false, respawnAt: 0,
      };
      players.set(id, player);
      ws.send(JSON.stringify({ t: 'welcome', id, obstacles: OBSTACLES, chat: chatLog }));
      addChat('Server', `${name} đã vào game`);
      return;
    }
    if (!player || player.dead) return;

    if (m.t === 'input') {
      const ix = Number(m.x) || 0, iy = Number(m.y) || 0;
      const l = Math.hypot(ix, iy) || 1;
      player.vx = ix / l; player.vy = iy / l;
      if (ix || iy) { player.fx = ix / l; player.fy = iy / l; }
    } else if (m.t === 'attack') {
      tryAttack(player);
    } else if (m.t === 'chat' && typeof m.text === 'string') {
      const text = m.text.trim().slice(0, 120);
      if (text) addChat(player.name, text);
    }
  });

  ws.on('close', () => {
    if (player) {
      players.delete(id);
      addChat('Server', `${player.name} đã rời game`);
    }
  });
});

/* ---------------- main loop ---------------- */
setInterval(() => {
  const dt = TICK_MS / 1000;
  const now = Date.now();

  for (const p of players.values()) {
    if (p.dead) {
      if (now >= p.respawnAt) {
        p.dead = false; p.hp = p.maxHp;
        p.x = rand(200, 400); p.y = rand(200, 400);
        addChat('Server', `${p.name} đã hồi sinh`);
      }
      continue;
    }
    p.atkCd = Math.max(0, p.atkCd - dt);
    p.hurtCd = Math.max(0, p.hurtCd - dt);
    p.atkAnim = Math.max(0, p.atkAnim - dt);
    p.x += p.vx * PLAYER_SPEED * dt;
    p.y += p.vy * PLAYER_SPEED * dt;
    collideWorld(p, 16);
  }

  for (const s of slimes) {
    if (s.dead) {
      if (now >= s.respawnAt) resetSlime(s);
      continue;
    }
    s.flash = Math.max(0, s.flash - dt);
    s.touchCd = Math.max(0, s.touchCd - dt);

    // AI: chase the nearest living player, otherwise wander
    let best = null, bd = Infinity;
    for (const p of players.values()) {
      if (p.dead) continue;
      const d = dist(s, p);
      if (d < bd) { bd = d; best = p; }
    }
    let mx = 0, my = 0, sp = 45;
    if (best && bd < 280) {
      const d = bd || 1;
      mx = (best.x - s.x) / d; my = (best.y - s.y) / d;
      sp = 110;
      if (bd < 34 && s.touchCd <= 0 && best.hurtCd <= 0) {
        best.hp -= 8;
        best.hurtCd = 0.8;
        s.touchCd = 1.0;
        if (best.hp <= 0) {
          best.hp = 0; best.dead = true; best.respawnAt = now + 3000;
          addChat('Server', `${best.name} đã gục ngã...`);
        }
      }
    } else {
      s.wt -= dt;
      if (s.wt <= 0) {
        const a = Math.random() * Math.PI * 2;
        s.wx = Math.cos(a); s.wy = Math.sin(a);
        s.wt = rand(1, 3);
      }
      mx = s.wx; my = s.wy;
    }
    s.x += mx * sp * dt;
    s.y += my * sp * dt;
    collideWorld(s, 14);
  }

  broadcast({
    t: 'state',
    players: [...players.values()].map((p) => ({
      id: p.id, name: p.name,
      x: Math.round(p.x), y: Math.round(p.y),
      hp: Math.ceil(p.hp), maxHp: p.maxHp,
      xp: p.xp, level: p.level,
      fx: +p.fx.toFixed(2), fy: +p.fy.toFixed(2),
      color: p.color, dead: p.dead, atkAnim: +p.atkAnim.toFixed(2),
    })),
    slimes: slimes.map((s) => ({
      id: s.id, x: Math.round(s.x), y: Math.round(s.y),
      hp: s.hp, maxHp: s.maxHp, dead: s.dead, flash: s.flash > 0,
    })),
  });
}, TICK_MS);

server.listen(PORT, () => console.log(`Mini RPG server running → http://localhost:${PORT}`));
