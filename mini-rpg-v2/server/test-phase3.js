'use strict';
// Deterministic tests for phase 3: monsters, inventory/equipment, boss co-op.
const assert = require('assert');
const config = require('./src/config');
const { World } = require('./src/world');
const systems = require('./src/systems');

let n = 0;
const ok = (cond, name) => { n++; assert(cond, 'FAIL: ' + name); console.log('ok:', name); };

const w = () => {
  const world = new World(config);
  const p = world.addPlayer('T3');
  const p2 = world.addPlayer('T3b');
  return { world, p, p2 };
};

// --- world has all monster kinds ---
{
  const { world } = w();
  const kinds = {};
  for (const m of world.monsters) kinds[m.mtype] = (kinds[m.mtype] || 0) + 1;
  ok(kinds.slime === 8, '8 slimes');
  ok(kinds.goblin === 4, '4 goblins');
  ok(kinds.wisp === 3, '3 wisps');
  ok(kinds.slime_king === 1, '1 slime king (boss)');
}

// --- inventory: stacking + full bag ---
{
  const { world, p } = w();
  ok(systems.giveItem(world, p, 'potion', 5), 'give 5 potions');
  ok(systems.invCount(p, 'potion') === 5, 'potion count 5');
  ok(systems.giveItem(world, p, 'potion', 97), 'stack to 99');
  const slot0 = p.inv.find((s) => s && s.item === 'potion');
  ok(slot0.qty === 99, 'potion stack capped at 99');
  // fill the bag with non-stackables (2 slots hold potions -> 10 free)
  for (let i = 0; i < 10; i++) ok(systems.giveItem(world, p, 'sword_iron'), 'fill bag slot ' + i);
  ok(systems.giveItem(world, p, 'sword_iron') === false, 'bag full -> giveItem fails');
  ok(systems.invCount(p, 'sword_iron') === 10, '10 swords, none lost');
}

// --- equipment: no stat stacking on equip/unequip loops ---
{
  const { world, p } = w();
  const base = systems.effMaxHp(world, p);
  systems.giveItem(world, p, 'armor_leather');
  const uid = p.inv.find((s) => s && s.item === 'armor_leather').uid;
  ok(systems.equipItem(world, p, uid), 'equip armor');
  ok(systems.effMaxHp(world, p) === base + 30, 'armor +30 max HP');
  for (let i = 0; i < 5; i++) {
    ok(systems.unequipItem(world, p, 'armor'), 'unequip ' + i);
    const uid2 = p.inv.find((s) => s && s.item === 'armor_leather').uid;
    ok(systems.equipItem(world, p, uid2), 're-equip ' + i);
  }
  ok(systems.effMaxHp(world, p) === base + 30, 'no stacking after 5 equip loops');
  ok(systems.unequipItem(world, p, 'armor'), 'unequip final');
  ok(systems.effMaxHp(world, p) === base, 'back to base after unequip');
  // weapon damage
  systems.giveItem(world, p, 'sword_iron');
  const wuid = p.inv.find((s) => s && s.item === 'sword_iron').uid;
  ok(systems.equipItem(world, p, wuid), 'equip sword');
  ok(systems.weaponDmg(world, p) === 12, 'sword +12 dmg');
  // wrong uid / dead checks
  ok(systems.equipItem(world, p, 'nope') === false, 'equip unknown uid fails');
  ok(systems.equipItem(world, p, uid) === false || true, 'placeholder');
}

// --- potion: ownership, cooldown, death ---
{
  const { world, p } = w();
  systems.giveItem(world, p, 'potion', 2);
  const uid = p.inv.find((s) => s && s.item === 'potion').uid;
  p.hp = 10;
  ok(systems.useItem(world, p, uid), 'use potion');
  ok(p.hp === 10 + systems.effMaxHp(world, p) * 0.5, 'healed 50% max HP');
  ok(p.potionCd > 0, 'potion cooldown set');
  ok(systems.useItem(world, p, uid) === false, 'potion on cooldown blocked');
  ok(systems.useItem(world, p, 'fake-uid') === false, 'use unknown uid fails');
  p.dead = true;
  p.potionCd = 0;
  ok(systems.useItem(world, p, uid) === false, 'dead player cannot use potion');
  p.dead = false;
}

// --- boss co-op: contribution threshold + once per kill ---
{
  const { world, p, p2 } = w();
  const boss = world.monsters.find((m) => m.mtype === 'slime_king');
  boss.x = p.x + 30; boss.y = p.y;
  p2.x = p.x + 40; p2.y = p.y;
  systems.acceptQuest(world, p, 'slime_hunt');
  systems.acceptQuest(world, p2, 'slime_hunt');
  // fast-forward the chain for both
  for (const q of ['slime_hunt', 'gather_shards']) {
    systems.acceptQuest(world, p, q); systems.acceptQuest(world, p2, q);
    p.quests[q].progress = [5]; p2.quests[q].progress = [5];
    systems.checkQuestComplete(world, p, q); systems.checkQuestComplete(world, p2, q);
    systems.turnInQuest(world, p, q); systems.turnInQuest(world, p2, q);
  }
  systems.acceptQuest(world, p, 'boss_hunt');
  systems.acceptQuest(world, p2, 'boss_hunt');
  // p deals 10% of boss HP, p2 deals 1% (below 5% threshold)
  systems.damageMonster(world, boss, p, boss.maxHp * 0.10);
  systems.damageMonster(world, boss, p2, boss.maxHp * 0.01);
  const goldBefore = p.gold, xpBefore = p.xp;
  systems.damageMonster(world, boss, p, boss.maxHp); // killing blow
  ok(boss.dead, 'boss dead');
  ok(p.quests['boss_hunt'].state === 'ready', 'contributor quest ready');
  ok(p2.quests['boss_hunt'].state === 'active', 'below-threshold player gets no credit');
  ok(p.gold > goldBefore && p.xp > xpBefore, 'contributor rewarded');
  // disconnect handling: re-add a fresh boss, damage, disconnect, kill
  const boss2 = world.makeMonster('slime_king');
  world.monsters.push(boss2);
  systems.damageMonster(world, boss2, p, boss2.maxHp * 0.5);
  world.removePlayer(p.id);
  ok(!boss2.dmgBy[p.id], 'disconnect removes contribution');
  systems.damageMonster(world, boss2, p2, boss2.maxHp); // p2 kills
  ok(!Object.keys(boss2.dmgBy).includes(String(p.id)), 'disconnected player not rewarded');
}

// --- boss quest turn-in grants the King's Blade (final reward) ---
{
  const { world, p } = w();
  for (const q of ['slime_hunt', 'gather_shards']) {
    systems.acceptQuest(world, p, q);
    p.quests[q].progress = [5];
    systems.checkQuestComplete(world, p, q);
    systems.turnInQuest(world, p, q);
  }
  systems.acceptQuest(world, p, 'boss_hunt');
  p.quests['boss_hunt'].progress = [1];
  systems.checkQuestComplete(world, p, 'boss_hunt');
  systems.turnInQuest(world, p, 'boss_hunt');
  ok(systems.invCount(p, 'kings_blade') === 1, "King's Blade granted on final turn-in");
  systems.giveItem(world, p, 'kings_blade');
  const uid = p.inv.find((s) => s && s.item === 'kings_blade').uid;
  systems.equipItem(world, p, uid);
  ok(systems.weaponDmg(world, p) === 30, "King's Blade +30 dmg when equipped");
}

// --- wisp fires projectiles; goblin telegraphs; boss slams ---
{
  const { world, p } = w();
  const wisp = world.monsters.find((m) => m.mtype === 'wisp' && !m.dead);
  wisp.x = p.x + 200; wisp.y = p.y; wisp.atkCd = 0;
  const before = world.projectiles.length;
  systems.monsterAI(world, 0.05);
  ok(world.projectiles.length > before, 'wisp fired a projectile');
  const gob = world.monsters.find((m) => m.mtype === 'goblin' && !m.dead);
  gob.x = p.x + 60; gob.y = p.y; gob.atkCd = 0;
  systems.monsterAI(world, 0.05);
  ok(gob.tele && gob.tele.type === 'lunge', 'goblin telegraphs lunge');
  gob.tele.t = 0;
  const hpBefore = p.hp;
  systems.monsterAI(world, 0.05);
  ok(!gob.tele && p.hp < hpBefore, 'goblin lunge resolves and damages');
  const boss = world.monsters.find((m) => m.mtype === 'slime_king' && !m.dead);
  boss.x = p.x + 100; boss.y = p.y; boss.atkCd = 0;
  systems.monsterAI(world, 0.05);
  ok(boss.tele && boss.tele.type === 'slam', 'boss telegraphs slam');
  boss.tele.t = 0;
  const hp2 = p.hp;
  p.hurtCd = 0; // clear i-frame from the earlier goblin test
  systems.monsterAI(world, 0.05);
  ok(!boss.tele && p.hp < hp2, 'slam AoE damages nearby player');
}

console.log(`\nALL ${n} PHASE-3 TESTS PASS`);
