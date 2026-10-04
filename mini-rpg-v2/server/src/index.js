'use strict';
/**
 * Server entry point: Express (HTTP + static client) + WebSocket + game loop.
 *
 *  npm install && npm start        (serves ../client/dist — build the client first)
 */
const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const config = require('./config');
const { World } = require('./world');
const systems = require('./systems');
const { Router } = require('./net/router');
const schemas = require('./net/schemas');

const world = new World(config);

/* Game-event announcements live here — swap/edit without touching the loop. */
world.bus.on('player:join', (p) => world.addChat('Server', `${p.name} đã vào game`));
world.bus.on('player:leave', (p) => world.addChat('Server', `${p.name} đã rời game`));
world.bus.on('player:death', (p) => world.addChat('Server', `${p.name} đã gục ngã...`));
world.bus.on('player:respawn', (p) => world.addChat('Server', `${p.name} đã hồi sinh`));
world.bus.on('player:levelup', (p) => world.addChat('Server', `${p.name} đã lên cấp ${p.level}!`));
world.bus.on('chat', (m) => broadcast({ t: 'chat', name: m.name, text: m.text }));

/* --- HTTP: static client build + small JSON API --- */
const app = express();
const DIST = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(DIST));
app.get('/api/health', (req, res) => res.json({
  ok: true,
  players: world.players.size,
  slimesAlive: world.slimes.filter((s) => !s.dead).length,
  uptime: Math.round(process.uptime()),
}));
app.get('/api/players', (req, res) => res.json(
  [...world.players.values()].map((p) => ({
    name: p.name, level: p.level, hp: Math.ceil(p.hp), maxHp: p.maxHp,
  }))
));

/* --- WebSocket: validated message routing --- */
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function broadcast(msg) {
  const s = JSON.stringify(msg);
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN) c.send(s);
  }
}

const router = new Router();

router.on('join', schemas.Join, (ctx, m) => {
  if (ctx.player) return;
  ctx.player = ctx.world.addPlayer(m.name);
  ctx.ws.send(JSON.stringify({
    t: 'welcome',
    id: ctx.player.id,
    obstacles: ctx.world.obstacles,
    chat: ctx.world.chatLog,
  }));
});

router.on('input', schemas.Input, (ctx, m) => {
  const p = ctx.player;
  if (!p || p.dead) return;
  const l = Math.hypot(m.x, m.y) || 1;
  p.vx = m.x / l;
  p.vy = m.y / l;
  if (m.x || m.y) { p.fx = m.x / l; p.fy = m.y / l; }
});

router.on('attack', schemas.Attack, (ctx) => {
  if (ctx.player) systems.attack(ctx.world, ctx.player);
});

router.on('chat', schemas.Chat, (ctx, m) => {
  if (ctx.player && !ctx.player.dead) ctx.world.addChat(ctx.player.name, m.text);
});

wss.on('connection', (ws) => {
  const ctx = { ws, world, player: null };
  ws.on('message', (raw) => router.handle(ctx, raw));
  ws.on('close', () => {
    if (ctx.player) world.removePlayer(ctx.player.id);
  });
});

/* --- Main loop: fixed-timestep simulation, snapshot broadcast --- */
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  systems.movement(world, dt);
  systems.slimeAI(world, dt);
  systems.respawn(world);
  broadcast({ t: 'state', ...world.snapshot() });
}, config.tickMs);

server.listen(config.port, () => {
  console.log(`Mini RPG server → http://localhost:${config.port}`);
});
