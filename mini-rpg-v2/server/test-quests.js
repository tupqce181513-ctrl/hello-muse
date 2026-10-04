// Deterministic unit test for the quest + loot system.
// Run: node test-quests.js (no server needed)
const config = require('./src/config.js');
const { World } = require('./src/world.js');
const systems = require('./src/systems.js');

let pass = 0;
const ok = (cond, msg) => {
  if (!cond) { console.log('FAIL:', msg); process.exit(1); }
  pass++;
  console.log('ok:', msg);
};

const world = new World(config);
const p = world.addPlayer('Questy', 'ranger');
// put player next to the guide NPC for accept/turn-in proximity checks
const guide = config.npcs.find((n) => n.id === 'guide');
p.x = guide.x + 50; p.y = guide.y;

// --- quest states ---
ok(systems.questStatus(world, p, 'slime_hunt') === 'available', 'slime_hunt available at start');
ok(systems.questStatus(world, p, 'gather_shards') === 'unavailable', 'gather_shards locked behind slime_hunt');
ok(systems.questStatus(world, p, 'boss_hunt') === 'locked', 'boss quest locked until phase 3');
ok(systems.questStatus(world, p, 'nope') === 'unknown', 'unknown quest id');

// --- accept ---
ok(systems.acceptQuest(world, p, 'gather_shards') === false, 'cannot accept unavailable quest');
ok(systems.acceptQuest(world, p, 'boss_hunt') === false, 'cannot accept locked quest');
ok(systems.acceptQuest(world, p, 'slime_hunt') === true, 'accept slime_hunt');
ok(systems.questStatus(world, p, 'slime_hunt') === 'active', 'slime_hunt active');
ok(systems.acceptQuest(world, p, 'slime_hunt') === false, 'cannot accept twice');

// --- kill credit: only the killer, only while active ---
const other = world.addPlayer('Bystander', 'azure');
other.x = guide.x + 60; other.y = guide.y;
systems.acceptQuest(world, other, 'slime_hunt');
const s = world.slimes[0];
const killerProg = () => p.quests.slime_hunt.progress[0];
const otherProg = () => other.quests.slime_hunt.progress[0];
systems.damageSlime(world, s, p, 9999); // p lands the killing blow
ok(killerProg() === 1, 'killer gets credit');
ok(otherProg() === 0, 'bystander gets no credit');
const s2 = world.slimes[1];
systems.damageSlime(world, s2, other, 9999); // other kills one
ok(otherProg() === 1, 'other killer gets own credit');
ok(killerProg() === 1, 'first player unaffected by other kill');

// finish the quest
for (let i = 0; i < 4; i++) {
  const sl = world.slimes.find((x) => !x.dead);
  systems.damageSlime(world, sl, p, 9999);
}
ok(systems.questStatus(world, p, 'slime_hunt') === 'ready', 'quest ready at 5/5');
const over = world.slimes.find((x) => !x.dead);
systems.damageSlime(world, over, p, 9999);
ok(p.quests.slime_hunt.progress[0] === 5, 'progress capped at 5');

// --- turn in: rewards exactly once ---
const xp0 = p.xp, gold0 = p.gold;
const r1 = systems.turnInQuest(world, p, 'slime_hunt');
ok(r1 && r1.xp === 60 && r1.gold === 30, 'turn-in returns rewards');
ok(p.gold === gold0 + 30, 'gold granted');
ok(p.xp > xp0, 'xp granted');
ok(systems.questStatus(world, p, 'slime_hunt') === 'done', 'quest done after turn-in');
ok(systems.turnInQuest(world, p, 'slime_hunt') === null, 'double turn-in gives nothing');
ok(p.gold === gold0 + 30, 'no double gold');
ok(systems.questStatus(world, p, 'gather_shards') === 'available', 'chain unlocks next quest');

// --- collect quest + loot drops ---
ok(systems.acceptQuest(world, p, 'gather_shards') === true, 'accept gather_shards');
// force drops: kill slimes until 3 shards picked up (drop chance 0.5)
let guard = 0;
while ((p.quests.gather_shards?.state || 'done') !== 'ready' && guard++ < 40) {
  const sl = world.slimes.find((x) => !x.dead);
  systems.damageSlime(world, sl, p, 9999);
  // teleport drops to the player and run pickup
  for (const it of world.items) { it.x = p.x; it.y = p.y; }
  systems.pickupTick(world);
}
ok(systems.questStatus(world, p, 'gather_shards') === 'ready', 'collect quest ready after 3 pickups');
ok(world.items.length === 0, 'picked items removed from world (count once)');
const r2 = systems.turnInQuest(world, p, 'gather_shards');
ok(r2 && r2.gold === 50, 'gather rewards granted');
ok(systems.turnInQuest(world, p, 'gather_shards') === null, 'no double reward');
ok(systems.questStatus(world, p, 'boss_hunt') === 'locked', 'boss still locked after chain');

// --- proximity gate ---
const far = world.addPlayer('FarAway', 'scout');
far.x = 1400; far.y = 100; // far from guide
ok(systems.nearNpc(world, far, 'guide') === false, 'far player not near NPC');
ok(systems.nearNpc(world, p, 'guide') === true, 'player near NPC');

// --- dialog payload ---
const d = systems.dialogFor(world, p, 'guide');
ok(d && d.t === 'npc_dialog' && d.quests.length === 3, 'dialog lists 3 quests');
const states = Object.fromEntries(d.quests.map((q) => [q.id, q.state]));
ok(states.slime_hunt === 'done' && states.gather_shards === 'done' && states.boss_hunt === 'locked', 'dialog states correct');
ok(systems.dialogFor(world, p, 'nope') === null, 'unknown npc -> null');

console.log(`\nALL ${pass} QUEST TESTS PASS`);
