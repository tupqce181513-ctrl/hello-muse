'use strict';
// Lifecycle regression tests: R01 (graceful shutdown), R02 (join rollback),
// R03 (dead players can't quest/NPC), R04 (monster respawn resets).
// NOTE: PORT/DATA_DIR must be set before ANY require (config is module-cached).
process.env.PORT = process.env.PORT || '18213';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let n = 0;
const ok = (cond, name) => { n++; assert(cond, 'FAIL: ' + name); console.log('ok:', name); };
const waitHealth = async (port, ms = 10000) => {
  const t0 = Date.now();
  for (;;) {
    try {
      const r = await fetch(`http://localhost:${port}/api/health`);
      if (r.ok) return;
    } catch { /* retry */ }
    if (Date.now() - t0 > ms) throw new Error('server boot timeout :' + port);
    await new Promise((r) => setTimeout(r, 100));
  }
};

// --- R04: monster respawn resets ALL per-life state (pure unit test) ---
{
  const config = require('./src/config');
  const { World } = require('./src/world');
  const systems = require('./src/systems');
  const world = new World(config);
  const boss = world.monsters.find((m) => m.boss);
  boss.sumCd = 99; boss.touchCd = 0.7; boss.tele = { type: 'slam', t: 1, x: 0, y: 0, r: 1 };
  boss.dmgBy = { someone: 10 };
  boss.dead = true; boss.respawnAt = Date.now() - 1;
  systems.respawn(world);
  ok(!boss.dead && boss.hp === boss.maxHp, 'boss respawned with full HP');
  ok(boss.sumCd === 0 && boss.touchCd === 0, 'sumCd/touchCd reset (no leak across lives)');
  ok(boss.tele === null && boss.atkCd === 0, 'telegraph/atkCd reset');
  ok(Object.keys(boss.dmgBy).length === 0, 'co-op contributions reset');
}

// --- R03: dead players can't NPC/quest (route-level guards) ---
{
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-r03-'));
  const { world, router } = require('./src/index.js');
  const mkCtx = (p) => {
    const sent = [];
    return {
      ctx: { ws: { readyState: 1, send: (s) => sent.push(JSON.parse(s)) }, world, player: p },
      sent,
    };
  };
  const nearGuide = (p) => { p.x = 250; p.y = 950; }; // guide NPC location

  const p = world.addPlayer('R03');
  nearGuide(p);

  // live: NPC dialog works (positive control)
  let t = mkCtx(p); t.ctx.player = p;
  router.handle(t.ctx, JSON.stringify({ t: 'npc', npc: 'guide' }));
  ok(t.sent.some((m) => m.t === 'npc_dialog'), 'live player near NPC gets dialog');

  // dead: all three routes stay silent
  p.dead = true;
  for (const msg of [
    { t: 'npc', npc: 'guide' },
    { t: 'quest_accept', quest: 'slime_hunt' },
    { t: 'quest_turnin', quest: 'slime_hunt' },
  ]) {
    t = mkCtx(p); t.ctx.player = p;
    router.handle(t.ctx, JSON.stringify(msg));
    ok(t.sent.length === 0, `dead player gets no reply for '${msg.t}' (R03)`);
  }
  p.dead = false;
}

// --- R01: SIGTERM flushes saves and exits 0 (spawned server) ---
// --- R02: failed join leaves no ghost player (spawned server, bad disk) ---
(async () => {
{
  const port = 18211;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-r01-'));
  const srv = spawn('node', ['src/index.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(port), DATA_DIR: dir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const dead = new Promise((res) => srv.on('exit', (code, signal) => res({ code, signal })));
  try {
    await waitHealth(port);
    const WebSocket = require('ws');
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: 'R01' })));
      ws.on('message', (d) => {
        if (JSON.parse(d).t === 'welcome') setTimeout(resolve, 400);
      });
      ws.on('error', () => {});
      setTimeout(() => reject(new Error('join timeout')), 8000);
    });
    srv.kill('SIGTERM');
    const { code } = await dead;
    ok(code === 0, `graceful shutdown exits 0 (got ${code})`);
    const data = JSON.parse(fs.readFileSync(path.join(dir, 'players.json'), 'utf8'));
    const names = Object.values(data.players).map((r) => r.name);
    ok(names.includes('R01'), 'player flushed to disk on SIGTERM (R01)');
  } finally {
    srv.kill('SIGKILL');
  }
}

// --- R02: failed join leaves no ghost player (spawned server, bad disk) ---
{
  const port = 18212;
  const badParent = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-r02-')), 'notadir');
  fs.writeFileSync(badParent, 'x'); // a FILE, so mkdir(recursive) throws ENOTDIR
  const srv = spawn('node', ['src/index.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(port), DATA_DIR: path.join(badParent, 'sub') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const dead = new Promise((res) => srv.on('exit', (c, s) => res({ c, s })));
  try {
    await waitHealth(port);
    const WebSocket = require('ws');
    const closeCode = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: 'Ghost' })));
      ws.on('close', (code) => resolve(code));
      ws.on('error', () => {});
      setTimeout(() => reject(new Error('no close after failed join')), 8000);
    });
    ok(closeCode === 1011, `failed join closes the socket (code ${closeCode})`);
    const h = await (await fetch(`http://localhost:${port}/api/health`)).json();
    ok(h.players === 0, 'no ghost player left in the world (R02)');
  } finally {
    srv.kill('SIGKILL');
    await dead;
  }
}

console.log(`\nALL ${n} LIFECYCLE TESTS PASS`);
process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
