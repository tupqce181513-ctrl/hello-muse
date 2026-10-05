'use strict';
// Regression tests for P2 findings F08–F14.
const assert = require('assert');
const config = require('./src/config');
const { World } = require('./src/world');
const systems = require('./src/systems');

let n = 0;
const ok = (cond, name) => { n++; assert(cond, 'FAIL: ' + name); console.log('ok:', name); };

const w = () => {
  const world = new World(config);
  const p = world.addPlayer('F');
  const p2 = world.addPlayer('F2');
  return { world, p, p2 };
};

// --- F08: effective max HP in the public snapshot; restore clamps to effective ---
{
  const { world, p } = w();
  systems.giveItem(world, p, 'armor_leather');
  const auid = p.inv.find((s) => s && s.item === 'armor_leather').uid;
  systems.equipItem(world, p, auid);
  p.hp = systems.effMaxHp(world, p); // full: 100 + 30
  const pub = world.snapshot().players.find((x) => x.id === p.id);
  ok(pub.maxHp === 130, `public snapshot carries EFFECTIVE maxHp (got ${pub.maxHp})`);
  ok(pub.hp === 130, 'public hp matches');
  ok(!('inv' in pub) && !('quests' in pub) && !('gold' in pub), 'no private fields in public snapshot (F12)');
  const self = world.playerSelf(p);
  ok(self.maxHp === 130 && Array.isArray(self.inv) && self.gold === 0, 'self snapshot has effective maxHp + private data');

  // restore with armor equipped: hp must survive the clamp (was: 130 -> 100)
  const rec = world.toRecord(p);
  const world2 = new World(config);
  const q = world2.restorePlayer(rec);
  ok(q.hp === 130, `restore keeps 130 HP with armor (got ${q.hp})`);
  ok(systems.effMaxHp(world2, q) === 130, 'effective maxHp recomputed after restore');

  // respawn heals to EFFECTIVE max (was: base only)
  q.hp = 0; q.dead = true; q.respawnAt = Date.now() - 1;
  systems.respawn(world2);
  ok(!q.dead && q.hp === 130, 'respawn heals to effective maxHp');
}

// --- F09: death survives restart/resume via the absolute respawn timestamp ---
{
  const { world, p } = w();
  p.hp = 0; p.dead = true; p.respawnAt = Date.now() + 4000;
  const rec = world.toRecord(p);
  ok(rec.dead === true && rec.respawnAt > Date.now(), 'record persists death state');

  // restore while the countdown is still running: stays dead, timer continues
  const world2 = new World(config);
  const q = world2.restorePlayer(rec);
  ok(q.dead === true && q.hp === 0, 'still dead after restore');
  const self = world2.playerSelf(q);
  ok(self.dead === true && self.respawnIn > 0 && self.respawnIn <= 4, 'respawnIn countdown continues');

  // restore after the countdown elapsed: clean respawn, no 0-HP ghost
  const rec2 = { ...rec, respawnAt: Date.now() - 1000 };
  const world3 = new World(config);
  const r = world3.restorePlayer(rec2);
  ok(r.dead === false && r.hp === systems.effMaxHp(world3, r), 'elapsed countdown respawns with full HP');
  ok(!(r.dead === false && r.hp === 0), 'never a living 0-HP player');
}

// --- F10: boss last hit below the 5% threshold grants no quest credit ---
{
  const { world, p, p2 } = w();
  for (const pl of [p, p2]) {
    systems.acceptQuest(world, pl, 'slime_hunt');
    pl.quests.slime_hunt.progress = [5];
    systems.checkQuestComplete(world, pl, 'slime_hunt');
    systems.turnInQuest(world, pl, 'slime_hunt');
    systems.acceptQuest(world, pl, 'gather_shards');
    pl.quests.gather_shards.progress = [3];
    systems.checkQuestComplete(world, pl, 'gather_shards');
    systems.turnInQuest(world, pl, 'gather_shards');
    systems.acceptQuest(world, pl, 'boss_hunt');
  }
  const boss = world.monsters.find((m) => m.boss);
  // teammate deals 1490 (>= 5% of 1500); player lands the final 10 (< 75)
  systems.damageMonster(world, boss, p2, 1490);
  systems.damageMonster(world, boss, p, 10);
  ok(boss.dead, 'boss died');
  ok(systems.questStatus(world, p2, 'boss_hunt') === 'ready', 'contributor >= 5% gets quest credit');
  ok(systems.questStatus(world, p, 'boss_hunt') === 'active', 'last hit below threshold gets NO quest credit (F10)');
  ok(p.xp > 0, 'last-hit XP still goes to the killer (documented separate rule)');
}

// --- F11: configured loot amounts reach the bag; partial pickup is atomic ---
{
  const { world, p } = w();
  const realRandom = Math.random;
  Math.random = () => 0; // RNG=0: boss drops 100 gold + 2 potions
  const boss = world.monsters.find((m) => m.boss);
  systems.damageMonster(world, boss, p, 99999);
  Math.random = realRandom;
  const goldIt = world.items.find((i) => i.item === 'gold');
  const potIt = world.items.find((i) => i.item === 'potion');
  ok(goldIt && goldIt.amount === 100, `gold drop has configured amount (got ${goldIt && goldIt.amount})`);
  ok(potIt && potIt.amount === 2, `potion drop has configured amount (got ${potIt && potIt.amount})`);
  p.x = goldIt.x; p.y = goldIt.y;
  const goldBefore = p.gold; // includes the 50 co-op gold for the solo kill
  systems.pickupTick(world);
  ok(p.gold === goldBefore + 100, `picked up all 100 gold (${goldBefore} -> ${p.gold})`);
  p.x = potIt.x; p.y = potIt.y;
  systems.pickupTick(world);
  ok(systems.invCount(p, 'potion') === 2, 'picked up both potions');

  // partial pickup: bag room for 1 of 5 -> remainder stays on the ground
  const { world: w2, p: q, p2: q2 } = w();
  q2.x = q.x + 5000; q2.y = q.y + 5000; // keep the bystander out of pickup range
  for (let i = 0; i < 11; i++) systems.giveItem(w2, q, 'sword_iron'); // 11/12 used
  systems.giveItem(w2, q, 'potion', 98); // last slot: 98 potions, room for 1 more
  w2.dropItem('potion', q.x, q.y, 5);
  const it = w2.items[w2.items.length - 1];
  it.x = q.x; it.y = q.y;
  systems.pickupTick(w2);
  ok(systems.invCount(q, 'potion') === 99, 'took only what fit (98 -> 99)');
  const left = w2.items.find((i) => i.item === 'potion');
  ok(left && left.amount === 4, 'remainder (4) stays on the ground atomically');
}

// --- F13: item uids never collide after restart (inventory AND equipment) ---
{
  const { world, p } = w();
  systems.giveItem(world, p, 'sword_iron');
  const suid = p.inv.find((s) => s && s.item === 'sword_iron').uid;
  systems.equipItem(world, p, suid); // bag now EMPTY, sword equipped
  const rec = world.toRecord(p);
  // simulate a server restart: fresh world, boot-time scan of ALL records
  const { JsonFileStore } = require('./src/persistence/store');
  const fs = require('fs'), os = require('os'), path = require('path');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-f13-')), 's.json');
  const store = new JsonFileStore(f);
  const world2 = new World(config);
  // boot scan equivalent: max seq over the saved record (inv + equip)
  let max = 0;
  for (const s of [...rec.inv, rec.equip.weapon, rec.equip.armor]) {
    const m = s && /^i(\d+)$/.exec(s.uid || '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  world2.nextItemId = max + 1;
  const q = world2.restorePlayer(rec);
  systems.giveItem(world2, q, 'armor_leather');
  const newUid = q.inv.find((s) => s && s.item === 'armor_leather').uid;
  ok(newUid !== suid, `new uid ${newUid} != equipped uid ${suid} (F13)`);
  // and the store-level scanner agrees
  store.save(rec).then(async () => {
    ok((await store.maxItemSeq()) === Number(suid.slice(1)), 'store.maxItemSeq covers equipment');
    console.log(`\nALL ${n} F08-F14 TESTS PASS`);
  }).catch((e) => { console.error(e); process.exit(1); });
}

// --- F14: corrupt/hand-edited records are sanitized; base HP recomputed ---
{
  const { world } = w();
  const rec = {
    id: 'x', name: 'Hax', level: 7, xp: -50, gold: 'lots',
    maxHp: 999, hp: 9999, // lies: must be recomputed/clamped
    passives: { tough: 99, power: 'x' },
    inv: 'not-an-array', equip: null,
    skills: ['dash', 42], questsDone: 'nope',
    cdsExpiresAt: { dash: 'soon' },
  };
  const q = world.restorePlayer(rec);
  ok(q.level === 7 && q.xp === 0 && q.gold === 0, 'numbers sanitized');
  // tough 99 clamps to 5 -> 100 + 6*20 + 5*20 = 320; record's maxHp 999 ignored
  ok(q.maxHp === 320, `base HP recomputed from level/tough (got ${q.maxHp}), record's 999 ignored`);
  ok(q.hp === 320, 'hp clamped to recomputed max');
  ok(q.passives.tough === 5 && q.passives.power === 0, 'passive ranks clamped/sanitized');
  ok(q.inv.length === 12 && q.equip.weapon === null, 'inventory/equipment defaulted');
  ok(q.skills.length === 1 && q.cds.dash === undefined, 'skills/cds sanitized');
  ok(world.snapshot().players.find((x) => x.id === q.id).maxHp === 320, 'public snapshot uses recomputed HP');
}
// NOTE: the final summary is printed by the async F13 store check above,
// which resolves after all synchronous blocks have run.
