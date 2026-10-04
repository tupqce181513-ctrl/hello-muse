// Deterministic unit test for the XP + skill system.
// Run: node test-skills.js (no server needed)
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
const p = world.addPlayer('SkillTester', 'ranger');

// --- XP curve & skill points ---
ok(config.xpNeed(1) === 100, 'xpNeed(1) = 100');
ok(config.xpNeed(2) > config.xpNeed(1), 'xp curve grows');
systems.gainXp(world, p, 50);
ok(p.level === 1 && p.xp === 50 && p.sp === 0, 'partial xp, no level');
systems.gainXp(world, p, 60); // 110 total -> level 2 (need 100), 10 xp left
ok(p.level === 2 && p.xp === 10 && p.sp === 1, 'level up grants 1 skill point');

// --- unlock active ---
ok(systems.unlockSkill(world, p, 'whirlwind') === false, 'cannot afford whirlwind (cost 2, have 1)');
ok(systems.unlockSkill(world, p, 'dash') === true, 'unlock dash for 1 point');
ok(p.sp === 0 && p.skills.includes('dash'), 'dash unlocked, point spent');
ok(systems.unlockSkill(world, p, 'dash') === false, 'cannot unlock twice');
ok(systems.unlockSkill(world, p, 'nope') === false, 'unknown skill rejected');

// --- allocate passive ---
systems.gainXp(world, p, 20000); // several level ups -> more points
const spBefore = p.sp;
ok(spBefore >= 8, `earned points (sp=${spBefore})`);
ok(systems.allocatePassive(world, p, 'power') === true, 'allocate power');
ok(systems.allocatePassive(world, p, 'power') === true, 'allocate power again');
ok(p.passives.power === 2 && p.dmgMult() === 1.3, 'dmgMult = 1 + 0.15*2');
const maxHpBefore = p.maxHp;
ok(systems.allocatePassive(world, p, 'tough') === true, 'allocate tough');
ok(p.maxHp === maxHpBefore + 20, 'tough adds maxHp');
for (let i = 0; i < 10; i++) systems.allocatePassive(world, p, 'crit');
ok(p.passives.crit === 5, 'crit capped at max 5');
ok(systems.allocatePassive(world, p, 'nope') === false, 'unknown passive rejected');

// --- cast: dash ---
const x0 = p.x;
p.fx = 1; p.fy = 0;
ok(systems.castSkill(world, p, 'dash') === true, 'cast dash');
ok(p.dashT > 0 && p.cds.dash === 6, 'dash state + cooldown set');
ok(p.castSeq === 1 && p.castSkill === 'dash', 'castSeq tracked for client FX');
ok(systems.castSkill(world, p, 'dash') === false, 'dash on cooldown rejected');
systems.movement(world, 0.1);
ok(p.x > x0 + 30, `dash moved player (dx=${Math.round(p.x - x0)})`);
ok(systems.castSkill(world, p, 'whirlwind') === false, 'locked skill cannot cast');

// --- cast: whirlwind damages nearby slimes ---
const s = world.slimes[0];
s.x = p.x + 50; s.y = p.y; s.hp = s.maxHp;
p.sp += 5;
systems.unlockSkill(world, p, 'whirlwind');
const hpBefore = s.hp;
ok(systems.castSkill(world, p, 'whirlwind') === true, 'cast whirlwind');
ok(s.hp < hpBefore, `whirlwind damaged slime (${Math.round(hpBefore)} -> ${Math.round(s.hp)})`);

// --- cast: heal ---
systems.unlockSkill(world, p, 'heal');
p.hp = p.maxHp * 0.3;
ok(systems.castSkill(world, p, 'heal') === true, 'cast heal');
ok(p.hp === p.maxHp * 0.7, 'heal restores 40% maxHp');

// --- cooldown ticks ---
systems.skillsTick(world, 3);
ok(Math.abs(p.cds.dash - 3) < 0.001, 'cooldown ticks down');
systems.skillsTick(world, 10);
ok(!('dash' in p.cds), 'cooldown expires');

// --- serialize carries skill state ---
const snap = p.serialize();
ok(snap.sp >= 0 && snap.skills.includes('dash') && snap.passives.power === 2, 'snapshot has skill state');
ok(typeof snap.cds === 'object' && snap.castSeq === 3, 'snapshot has cds + castSeq');

console.log(`\nALL ${pass} SKILL TESTS PASS`);
