'use strict';
// Deterministic tests for phase 4: persistence & session resume.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const config = require('./src/config');
const { World } = require('./src/world');
const systems = require('./src/systems');
const { JsonFileStore, hashToken, newToken, newId, SCHEMA_VERSION } = require('./src/persistence/store');

let n = 0;
const ok = (cond, name) => { n++; assert(cond, 'FAIL: ' + name); console.log('ok:', name); };
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-')), 'players.json');

(async () => {
// --- store: save / load / token binding ---
{
  const f = tmpFile();
  const store = new JsonFileStore(f);
  const id = newId();
  const rec = { schemaVersion: SCHEMA_VERSION, id, name: 'T4', level: 5 };
  await store.save(rec);
  const back = await store.getById(id);
  ok(back && back.level === 5, 'save/getById round-trip');
  const tok = newToken();
  const h = hashToken(tok);
  await store.bindToken(h, id);
  ok(await store.tokenToId(h) === id, 'token hash resolves to player');
  // raw token must never touch the disk
  const raw = fs.readFileSync(f, 'utf8');
  ok(!raw.includes(tok), 'raw token not stored on disk');
  ok(raw.includes(h), 'only the hash is stored');
  // supersede keeps the old token alive through the grace window
  const t2 = newToken();
  await store.supersedeToken(h, hashToken(t2), id);
  ok(await store.tokenToId(h) === id, 'superseded token still valid in grace');
  ok(await store.tokenToId(hashToken(t2)) === id, 'new token valid after supersede');
  await store.remove(id);
  ok(await store.getById(id) === null, 'remove deletes the record');
}

// --- store: rapid saves stay atomic (file always parses) ---
{
  const f = tmpFile();
  const store = new JsonFileStore(f);
  await Promise.all(Array.from({ length: 20 }, (_, i) =>
    store.save({ schemaVersion: SCHEMA_VERSION, id: 'p' + i, v: i })));
  await store.queue; // drain
  const parsed = JSON.parse(fs.readFileSync(f, 'utf8'));
  ok(Object.keys(parsed.players).length === 20, '20 rapid saves, file intact');
}

// --- store: corrupt file -> backup + fresh ---
{
  const f = tmpFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, 'not json {{{');
  const store = new JsonFileStore(f);
  const got = await store.getById('x');
  ok(got === null, 'corrupt file loads as fresh');
  const bak = fs.readdirSync(path.dirname(f)).find((x) => x.includes('.corrupt-'));
  ok(!!bak, 'corrupt file backed up');
}

// --- player record round-trip ---
{
  const f = tmpFile();
  const store = new JsonFileStore(f);
  const world = new World(config);
  const p = world.addPlayer('Hero4', 'ranger');
  p.level = 7; p.xp = 42; p.sp = 3;
  p.skills = ['dash']; p.passives = { power: 2, swift: 1, tough: 1, crit: 0 };
  p.gold = 123; p.maxHp = 160; p.hp = 99;
  systems.giveItem(world, p, 'potion', 4);
  systems.giveItem(world, p, 'sword_iron');
  const wuid = p.inv.find((s) => s && s.item === 'sword_iron').uid;
  systems.equipItem(world, p, wuid);
  p.quests = { slime_hunt: { state: 'active', progress: [3] } };
  p.questsDone = ['x'];
  p.cds = { dash: 4.2 };
  p.potionCd = 2.5;
  const rec = world.toRecord(p);
  await store.save(rec);

  // simulate a server restart: brand-new world + store on the same file
  const store2 = new JsonFileStore(f);
  const world2 = new World(config);
  const rec2 = await store2.getById(p.id);
  const q = world2.restorePlayer(rec2);
  ok(q.name === 'Hero4' && q.skinId === 'ranger', 'name/skin restored');
  ok(q.level === 7 && q.xp === 42 && q.sp === 3, 'level/xp/sp restored');
  ok(q.skills.includes('dash') && q.passives.power === 2, 'skills/passives restored');
  ok(q.gold === 123, 'gold restored');
  // F14: base max HP is RECOMPUTED (100 + 6*20 + 1*20 = 240), not trusted from the save
  ok(q.maxHp === 240, 'base maxHp recomputed from level/tough, not from record');
  ok(q.hp === 99, 'hp restored and clamped');
  ok(systems.invCount(q, 'potion') === 4, 'inventory restored');
  ok(q.equip.weapon && q.equip.weapon.item === 'sword_iron', 'equipment restored');
  ok(systems.weaponDmg(world2, q) === 12, 'derived weapon damage recomputed');
  ok(systems.effMaxHp(world2, q) === 240, 'derived max HP (no armor stacking)');
  ok(q.quests.slime_hunt.progress[0] === 3 && q.questsDone.includes('x'), 'quests restored');
  ok(Math.abs(q.cds.dash - 4.2) < 0.5, 'skill cooldown resumes (not reset)');
  ok(Math.abs(q.potionCd - 2.5) < 0.5, 'potion cooldown resumes');
}

// --- cooldown: expired entries are dropped on restore ---
{
  const world = new World(config);
  const p = world.addPlayer('Cd4', 'ranger');
  const rec = world.toRecord(p);
  rec.cdsExpiresAt = { dash: Date.now() - 1000 }; // already expired
  rec.potionCdExpiresAt = Date.now() - 1000;
  const q = world.restorePlayer(rec);
  ok(!q.cds.dash, 'expired skill cooldown dropped');
  ok(q.potionCd === 0, 'expired potion cooldown dropped');
}

// --- token rotation with grace (F03): a lost welcome is recoverable ---
{
  const f = tmpFile();
  const store = new JsonFileStore(f);
  const world = new World(config);
  const p = world.addPlayer('Rot4', 'ranger');
  const t1 = newToken();
  await store.bindToken(hashToken(t1), p.id);
  await store.save(world.toRecord(p));
  // resume #1: server rotates, client "loses" the welcome (keeps t1)
  const t2 = newToken();
  await store.supersedeToken(hashToken(t1), hashToken(t2), p.id);
  // retry with the OLD token inside the grace window: must still work
  const retry = await store.tokenEntry(hashToken(t1));
  ok(retry && retry.id === p.id, 'old token valid during grace (idempotent retry)');
  ok((await store.tokenEntry(hashToken(t2))).id === p.id, 'new token valid');
  // after the grace window the old token dies
  store.data.tokens[hashToken(t1)].exp = Date.now() - 1; // simulate expiry
  ok(await store.tokenEntry(hashToken(t1)) === null, 'old token rejected after grace');
  ok(await store.tokenToId(hashToken(t1)) === null, 'tokenToId null after grace');
}

// --- old token format migrates cleanly ---
{
  const f = tmpFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const id = newId();
  fs.writeFileSync(f, JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    players: {}, tokens: { deadbeef: id }, // pre-grace format
  }));
  const store = new JsonFileStore(f);
  ok(await store.tokenToId('deadbeef') === id, 'old token format migrates');
}

// --- F04: failed writes reject instead of claiming success ---
{
  const dir = tmpFile(); // a FILE, not a directory
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.writeFileSync(dir, 'x');
  const store = new JsonFileStore(path.join(dir, 'players.json'));
  const rec = { schemaVersion: SCHEMA_VERSION, id: newId(), name: 'Fail' };
  let rejected = false;
  try { await store.save(rec); } catch { rejected = true; }
  ok(rejected, 'save() rejects when the write fails');
  ok(!fs.existsSync(path.join(dir, 'players.json')), 'no save file created');
}

// --- item uids never reused after restore ---
{
  const world = new World(config);
  const p = world.addPlayer('Uid4', 'ranger');
  systems.giveItem(world, p, 'potion', 1);
  const rec = world.toRecord(p);
  const world2 = new World(config);
  const q = world2.restorePlayer(rec);
  systems.giveItem(world2, q, 'potion', 1);
  const uids = q.inv.filter(Boolean).map((s) => s.uid);
  ok(new Set(uids).size === uids.length, 'uids unique after restore');
}

console.log(`\nALL ${n} PERSISTENCE TESTS PASS`);
})().catch((e) => { console.error(e); process.exit(1); });
