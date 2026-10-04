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
const { JsonFileStore, hashToken, newToken } = require('./persistence/store');

const world = new World(config);

/* --- Persistence: JSON file store (MVP, single server) --- */
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const store = new JsonFileStore(path.join(DATA_DIR, 'players.json'));

async function savePlayer(p) {
  if (!p) return;
  const rec = world.toRecord(p);
  p.savedAt = rec.savedAt;
  await store.save(rec);
}

/* Autosave every 30s — never inside the tick loop.
 * Data-loss window: up to 30s of kills/XP/gold if the server crashes;
 * level-ups, quest turn-ins and boss kills save immediately. */
const AUTOSAVE_MS = 30000;
setInterval(() => {
  for (const p of world.players.values()) savePlayer(p);
}, AUTOSAVE_MS);

/** One active socket per character: a new connection replaces the old one. */
function attachSocket(p, ws) {
  if (p.ws && p.ws !== ws && p.ws.readyState === WebSocket.OPEN) {
    try { p.ws.close(4001, 'replaced by new connection'); } catch { /* gone */ }
  }
  p.ws = ws;
}

/* Game-event announcements live here — swap/edit without touching the loop. */
world.bus.on('player:join', (p) => world.addChat('Server', `${p.name} đã vào game`));
world.bus.on('player:leave', (p) => world.addChat('Server', `${p.name} đã rời game`));
world.bus.on('player:death', (p) => world.addChat('Server', `${p.name} đã gục ngã...`));
world.bus.on('player:respawn', (p) => world.addChat('Server', `${p.name} đã hồi sinh`));
world.bus.on('player:levelup', (p) => {
  world.addChat('Server', `${p.name} đã lên cấp ${p.level}! (+1 điểm kỹ năng)`);
  savePlayer(p); // important progress: never lost to a crash
});
world.bus.on('quest:accepted', (p, q) => world.addChat('Server', `📜 ${p.name} đã nhận nhiệm vụ: ${q.name}`));
world.bus.on('quest:ready', (p, q) => world.addChat('Server', `✅ ${p.name} đã hoàn thành "${q.name}" — về gặp ${questGiverName(q)} để trả!`));
world.bus.on('quest:turnin', (p, q, r) => {
  world.addChat('Server', `🎁 ${p.name} nhận thưởng "${q.name}" (+${r.xp || 0} XP, +${r.gold || 0} vàng)`);
  savePlayer(p); // important progress: never lost to a crash
});
world.bus.on('boss:down', (s, names) => {
  world.addChat('Server', `👑 Slime King đã gục ngã! Vinh danh: ${names.length ? names.join(', ') : 'không ai'}`);
  for (const p of world.players.values()) savePlayer(p);
});

function questGiverName(q) {
  const npc = config.npcs.find((n) => n.id === q.giver);
  return npc ? npc.name : 'NPC';
}
world.bus.on('chat', (m) => broadcast({ t: 'chat', name: m.name, text: m.text }));

/* --- HTTP: static client build + small JSON API --- */
const app = express();
const DIST = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(DIST));
app.get('/api/health', (req, res) => res.json({
  ok: true,
  players: world.players.size,
  monstersAlive: world.monsters.filter((m) => !m.dead).length,
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
app.get('/api/quests', (req, res) => res.json(config.quests));

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
  npc:      { n: 5,  per: 1000 },
  resume:   { n: 5,  per: 10000 },
  quest_accept: { n: 5, per: 1000 },
  quest_turnin: { n: 5, per: 1000 },
  use_item:  { n: 4,  per: 1000 },
  equip:     { n: 4,  per: 1000 },
  unequip:   { n: 4,  per: 1000 },
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

router.on('join', schemas.Join, async (ctx, m) => {
  if (!checkRate(ctx, 'join') || ctx.player) return;
  const validSkins = new Set(config.skins.map((s) => s.id));
  const skinId = validSkins.has(m.skin) ? m.skin : config.skins[0].id;
  ctx.player = ctx.world.addPlayer(m.name, skinId);
  attachSocket(ctx.player, ctx.ws);
  // stable identity + resume token (the display name is NOT the identity)
  const token = newToken();
  await store.bindToken(hashToken(token), ctx.player.id);
  await savePlayer(ctx.player);
  ctx.ws.send(JSON.stringify({
    t: 'welcome',
    id: ctx.player.id,
    name: ctx.player.name,
    token, // keep on this device; raw tokens are never stored server-side
    map: ctx.world.map, // client renders + same tileSize for reference
    npcs: config.npcs,  // static NPCs (client draws them)
    chat: ctx.world.chatLog,
  }));
});

router.on('resume', schemas.Resume, async (ctx, m) => {
  if (!checkRate(ctx, 'resume') || ctx.player) return;
  const oldHash = hashToken(m.token);
  const id = await store.tokenToId(oldHash);
  const rec = id ? await store.getById(id) : null;
  if (!rec) {
    ctx.ws.send(JSON.stringify({ t: 'resume_failed', reason: 'invalid_token' }));
    return;
  }
  await store.unbindToken(oldHash); // token rotation: old token dies here
  let p = ctx.world.players.get(id);
  if (!p) p = ctx.world.restorePlayer(rec); // e.g. after a server restart
  // else: player object is live — it is fresher than the save, keep it
  ctx.player = p;
  attachSocket(p, ctx.ws);
  const token = newToken();
  await store.bindToken(hashToken(token), p.id);
  await savePlayer(p);
  ctx.ws.send(JSON.stringify({
    t: 'welcome',
    id: p.id,
    name: p.name,
    token,
    resumed: true,
    map: ctx.world.map,
    npcs: config.npcs,
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

router.on('npc', schemas.Npc, (ctx, m) => {
  if (!checkRate(ctx, 'npc')) return;
  if (!ctx.player) return;
  const d = systems.dialogFor(ctx.world, ctx.player, m.npc);
  if (d) ctx.ws.send(JSON.stringify(d));
});

router.on('quest_accept', schemas.QuestAccept, (ctx, m) => {
  if (!checkRate(ctx, 'quest_accept')) return;
  const p = ctx.player;
  if (!p) return;
  const q = ctx.world.cfg.quests.find((qq) => qq.id === m.quest);
  if (!q || !systems.nearNpc(ctx.world, p, q.giver)) return; // must talk to the giver
  if (systems.acceptQuest(ctx.world, p, m.quest)) {
    ctx.ws.send(JSON.stringify(systems.dialogFor(ctx.world, p, q.giver)));
  }
});

router.on('quest_turnin', schemas.QuestTurnIn, (ctx, m) => {
  if (!checkRate(ctx, 'quest_turnin')) return;
  const p = ctx.player;
  if (!p) return;
  const q = ctx.world.cfg.quests.find((qq) => qq.id === m.quest);
  if (!q || !systems.nearNpc(ctx.world, p, q.giver)) return;
  if (systems.turnInQuest(ctx.world, p, m.quest)) {
    ctx.ws.send(JSON.stringify(systems.dialogFor(ctx.world, p, q.giver)));
  }
});

router.on('use_item', schemas.UseItem, (ctx, m) => {
  if (!checkRate(ctx, 'use_item')) return;
  if (ctx.player) systems.useItem(ctx.world, ctx.player, m.uid);
});

router.on('equip', schemas.Equip, (ctx, m) => {
  if (!checkRate(ctx, 'equip')) return;
  if (ctx.player) systems.equipItem(ctx.world, ctx.player, m.uid);
});

router.on('unequip', schemas.Unequip, (ctx, m) => {
  if (!checkRate(ctx, 'unequip')) return;
  if (ctx.player) systems.unequipItem(ctx.world, ctx.player, m.slot);
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
  ws.on('close', async () => {
    // only the active socket owns the player; a replaced ghost closing
    // must not delete the player the new connection is using
    if (ctx.player && ctx.player.ws === ws) {
      ctx.player.ws = null;
      await savePlayer(ctx.player); // save on disconnect
      world.removePlayer(ctx.player.id);
    }
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
  systems.monsterAI(world, dt);
  systems.projectileTick(world, dt);
  systems.pickupTick(world);
  systems.respawn(world);
  broadcast({ t: 'state', ...world.snapshot() });
  world.dmgEvents.length = 0; // damage numbers are per-tick events
}, config.tickMs);

server.listen(config.port, () => {
  console.log(`Mini RPG server → http://localhost:${config.port}`);
});
