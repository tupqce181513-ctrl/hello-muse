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
world.bus.on('player:levelup', (p) => world.addChat('Server', `${p.name} đã lên cấp ${p.level}! (+1 điểm kỹ năng)`));
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
app.get('/api/skins', (req, res) => res.json(config.skins));
app.get('/api/map', (req, res) => res.json(world.map));
app.get('/api/skills', (req, res) => {
  // skill definitions + XP table so the client can render bars/panels
  const xpTable = {};
  for (let lv = 1; lv <= 40; lv++) xpTable[lv] = config.xpNeed(lv);
  res.json({ ...config.skills, xpTable });
});

/* --- WebSocket: validated message routing --- */
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, maxPayload: 16 * 1024 });

/* Per-connection rate limits: { type: { n, per } } — sliding window. */
const RATE_LIMITS = {
  join:     { n: 3,  per: 10000 },
  input:    { n: 40, per: 1000 },
  attack:   { n: 6,  per: 1000 },
  cast:     { n: 6,  per: 1000 },
  chat:     { n: 3,  per: 1000 },
  unlock:   { n: 5,  per: 1000 },
  allocate: { n: 5,  per: 1000 },
};
function checkRate(ctx, type) {
  const lim = RATE_LIMITS[type];
  if (!lim) return true;
  const now = Date.now();
  ctx._rl = ctx._rl || {};
  let arr = (ctx._rl[type] || []).filter((t) => now - t < lim.per);
  if (arr.length >= lim.n) { ctx._rl[type] = arr; return false; }
  arr.push(now);
  ctx._rl[type] = arr;
  return true;
}

/* Heartbeat: drop connections that stopped responding. */
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

function broadcast(msg) {
  const s = JSON.stringify(msg);
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN) c.send(s);
  }
}

const router = new Router();

router.on('join', schemas.Join, (ctx, m) => {
  if (!checkRate(ctx, 'join') || ctx.player) return;
  const validSkins = new Set(config.skins.map((s) => s.id));
  const skinId = validSkins.has(m.skin) ? m.skin : config.skins[0].id;
  ctx.player = ctx.world.addPlayer(m.name, skinId);
  ctx.ws.send(JSON.stringify({
    t: 'welcome',
    id: ctx.player.id,
    map: ctx.world.map, // client renders + same tileSize for reference
    chat: ctx.world.chatLog,
  }));
});

router.on('input', schemas.Input, (ctx, m) => {
  if (!checkRate(ctx, 'input')) return;
  const p = ctx.player;
  if (!p || p.dead) return;
  // Preserve analog magnitude: 0.25 walks slower than 1. Cap at 1 so
  // diagonals are never faster than cardinal directions. Update facing
  // only on deliberate input (deadzone), never from drift.
  const l = Math.hypot(m.x, m.y);
  if (l > 1) { p.vx = m.x / l; p.vy = m.y / l; }
  else if (l < 0.05) { p.vx = 0; p.vy = 0; }
  else { p.vx = m.x; p.vy = m.y; }
  if (l > 0.15) { p.fx = m.x / l; p.fy = m.y / l; }
});

router.on('attack', schemas.Attack, (ctx) => {
  if (!checkRate(ctx, 'attack')) return;
  if (ctx.player) systems.attack(ctx.world, ctx.player);
});

router.on('unlock', schemas.Unlock, (ctx, m) => {
  if (!checkRate(ctx, 'unlock')) return;
  if (ctx.player) systems.unlockSkill(ctx.world, ctx.player, m.skill);
});

router.on('allocate', schemas.Allocate, (ctx, m) => {
  if (!checkRate(ctx, 'allocate')) return;
  if (ctx.player) systems.allocatePassive(ctx.world, ctx.player, m.passive);
});

router.on('cast', schemas.Cast, (ctx, m) => {
  if (!checkRate(ctx, 'cast')) return;
  if (ctx.player) systems.castSkill(ctx.world, ctx.player, m.skill);
});

router.on('chat', schemas.Chat, (ctx, m) => {
  if (!checkRate(ctx, 'chat')) return;
  if (ctx.player && !ctx.player.dead) ctx.world.addChat(ctx.player.name, m.text);
});

wss.on('connection', (ws) => {
  const ctx = { ws, world, player: null };
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
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
  systems.skillsTick(world, dt);
  systems.slimeAI(world, dt);
  systems.respawn(world);
  broadcast({ t: 'state', ...world.snapshot() });
}, config.tickMs);

server.listen(config.port, () => {
  console.log(`Mini RPG server → http://localhost:${config.port}`);
});
