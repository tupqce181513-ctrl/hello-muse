'use strict';
/**
 * Systems — pure-ish functions that advance the world each tick.
 * To add new behavior (poison zones, buffs, new AI), add a function
 * here and call it from the main loop in index.js.
 */

const rand = (a, b) => a + Math.random() * (b - a);
const { Monster } = require('./entities');

/**
 * Circle-vs-tilemap collision. Entities slide along solid tiles
 * (water, trees, rocks) instead of passing through them.
 */
function collide(world, e) {
  const W = world.worldW, H = world.worldH;
  e.x = Math.max(e.radius, Math.min(W - e.radius, e.x));
  e.y = Math.max(e.radius, Math.min(H - e.radius, e.y));
  const ts = world.ts;
  const x0 = Math.floor((e.x - e.radius) / ts), x1 = Math.floor((e.x + e.radius) / ts);
  const y0 = Math.floor((e.y - e.radius) / ts), y1 = Math.floor((e.y + e.radius) / ts);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!world.isSolidTile(tx, ty)) continue;
      // closest point on the tile rect to the circle center
      const cx = Math.max(tx * ts, Math.min(e.x, tx * ts + ts));
      const cy = Math.max(ty * ts, Math.min(e.y, ty * ts + ts));
      let dx = e.x - cx, dy = e.y - cy;
      const d = Math.hypot(dx, dy);
      if (d < e.radius) {
        if (d < 0.001) {
          // center inside the tile: push out along least-penetration axis
          const left = e.x - tx * ts, right = tx * ts + ts - e.x;
          const top = e.y - ty * ts, bot = ty * ts + ts - e.y;
          const m = Math.min(left, right, top, bot);
          if (m === left) e.x = tx * ts - e.radius;
          else if (m === right) e.x = tx * ts + ts + e.radius;
          else if (m === top) e.y = ty * ts - e.radius;
          else e.y = ty * ts + ts + e.radius;
        } else {
          e.x = cx + (dx / d) * e.radius;
          e.y = cy + (dy / d) * e.radius;
        }
      }
    }
  }
}

/** Integrate player movement + tick down cooldowns. */
function movement(world, dt) {
  const baseSp = world.cfg.player.speed;
  for (const p of world.players.values()) {
    if (p.dead) continue;
    p.atkCd = Math.max(0, p.atkCd - dt);
    p.hurtCd = Math.max(0, p.hurtCd - dt);
    p.atkAnim = Math.max(0, p.atkAnim - dt);
    let sp = baseSp * p.speedMult();
    let dx = p.vx, dy = p.vy;
    if (p.dashT > 0) {
      p.dashT -= dt;
      sp = baseSp * 3.2;
      dx = p.dashDx; dy = p.dashDy;
    }
    p.x += dx * sp * dt;
    p.y += dy * sp * dt;
    collide(world, p);
  }
}

/** Tick down active-skill cooldowns (+ potion cooldown, HP clamp). */
function skillsTick(world, dt) {
  for (const p of world.players.values()) {
    for (const k of Object.keys(p.cds)) {
      p.cds[k] -= dt;
      if (p.cds[k] <= 0) delete p.cds[k];
    }
    p.potionCd = Math.max(0, (p.potionCd || 0) - dt);
    const mh = effMaxHp(world, p);
    if (p.hp > mh) p.hp = mh; // e.g. after unequipping armor
  }
}

function hurtPlayer(world, p, dmg) {
  if (p.dead || p.hurtCd > 0) return;
  p.hp -= dmg;
  p.hurtCd = 0.8;
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    p.respawnAt = Date.now() + 3000;
    world.bus.emit('player:death', p);
  }
}

function gainXp(world, p, amt) {
  p.xp += amt;
  let need = world.cfg.xpNeed(p.level);
  while (p.xp >= need) {
    p.xp -= need;
    p.level++;
    p.maxHp += 20;
    p.hp = effMaxHp(world, p);
    p.sp += 1; // one skill point per level
    need = world.cfg.xpNeed(p.level);
    world.bus.emit('player:levelup', p);
  }
}

/* ---------------- Inventory & equipment ---------------- */

/** Effective max HP = base + level/tough bonuses + equipped armor.
 *  Equipment is computed, never stacked into maxHp (no equip/unequip bug). */
function effMaxHp(world, p) {
  const armor = p.equip.armor ? (world.cfg.items[p.equip.armor.item].bonus || {}).maxHp || 0 : 0;
  return p.maxHp + armor;
}

function weaponDmg(world, p) {
  return p.equip.weapon ? (world.cfg.items[p.equip.weapon.item].bonus || {}).dmg || 0 : 0;
}

/** Total count of an item across all 12 slots. */
function invCount(p, item) {
  return p.inv.reduce((n, s) => n + (s && s.item === item ? s.qty : 0), 0);
}

/**
 * Add an item instance to the bag (stacks first, then free slots).
 * Returns true if everything fit, false if the bag is full.
 */
function giveItem(world, p, item, qty = 1) {
  const def = world.cfg.items[item];
  if (!def) return false;
  if (def.stack) {
    for (const slot of p.inv) {
      if (slot && slot.item === item && slot.qty < 99) {
        const take = Math.min(qty, 99 - slot.qty);
        slot.qty += take; qty -= take;
        if (qty <= 0) return true;
      }
    }
  }
  while (qty > 0) {
    const free = p.inv.findIndex((s) => !s);
    if (free === -1) return false; // bag full
    const take = def.stack ? Math.min(qty, 99) : 1;
    p.inv[free] = { uid: 'i' + (world.nextItemId++), item, qty: take };
    qty -= take;
  }
  return true;
}

/** Equip a weapon/armor from the bag. Swaps with the currently equipped one. */
function equipItem(world, p, uid) {
  if (p.dead) return false;
  const idx = p.inv.findIndex((s) => s && s.uid === uid);
  if (idx === -1) return false; // not yours
  const def = world.cfg.items[p.inv[idx].item];
  if (!def.equip) return false;
  const slotName = def.equip; // 'weapon' | 'armor'
  const cur = p.equip[slotName];
  p.equip[slotName] = p.inv[idx];
  p.inv[idx] = cur; // old item (or null) takes the freed slot — swap is always safe
  return true;
}

function unequipItem(world, p, slotName) {
  if (p.dead) return false;
  const item = p.equip[slotName];
  if (!item) return false;
  const free = p.inv.findIndex((s) => !s);
  if (free === -1) return false; // bag full
  p.inv[free] = item;
  p.equip[slotName] = null;
  return true;
}

/** Use a consumable (potion). Validates ownership, cooldown, death. */
function useItem(world, p, uid) {
  if (p.dead) return false;
  const idx = p.inv.findIndex((s) => s && s.uid === uid);
  if (idx === -1) return false; // not yours
  const slot = p.inv[idx];
  const def = world.cfg.items[slot.item];
  if (!def.usable) return false;
  if (slot.item === 'potion') {
    if ((p.potionCd || 0) > 0) return false;
    const mh = effMaxHp(world, p);
    p.hp = Math.min(mh, p.hp + mh * world.cfg.player.potionHeal);
    p.potionCd = world.cfg.player.potionCd;
  }
  slot.qty--;
  if (slot.qty <= 0) p.inv[idx] = null;
  world.bus.emit('item:used', p, slot.item);
  return true;
}

/**
 * Shared monster-damage path: flash, death, respawn, XP, loot, quest credit.
 * Bosses additionally distribute co-op rewards (see bossDown).
 */
function damageMonster(world, s, p, dmg) {
  if (s.dead) return;
  s.hp -= dmg;
  s.flash = 0.15;
  if (s.boss) s.dmgBy[p.id] = (s.dmgBy[p.id] || 0) + dmg; // co-op contribution
  if (s.hp <= 0) {
    s.dead = true;
    s.respawnAt = Date.now() + world.cfg.monsters[s.mtype].respawnMs;
    world.bus.emit('monster:killed', s, p);
    gainXp(world, p, world.cfg.monsters[s.mtype].xp);
    dropLoot(world, s);
    addKillCredit(world, p, s.mtype); // only the killer's active quests count
    if (s.boss) bossDown(world, s);
  }
}

/**
 * Boss co-op rewards. Eligibility (announced in the quest text):
 *   - dealt >= 5% of boss max HP during this boss's life, AND
 *   - still connected (disconnect removes your dmgBy entry).
 * Each eligible contributor is rewarded once per boss kill.
 */
function bossDown(world, s) {
  const threshold = s.maxHp * 0.05;
  const winners = [];
  for (const [pid, dmg] of Object.entries(s.dmgBy)) {
    const p = world.players.get(pid); // ids are UUID strings
    if (p && dmg >= threshold) winners.push(p);
  }
  for (const p of winners) {
    const qs = p.quests['boss_hunt'];
    if (qs && qs.state === 'active') {
      qs.progress[0] = 1;
      checkQuestComplete(world, p, 'boss_hunt');
    }
    gainXp(world, p, 150);
    p.gold += 50;
  }
  world.bus.emit('boss:down', s, winners.map((p) => p.name));
}

// Backwards-compatible alias (old tests / code paths).
const damageSlime = damageMonster;

/** Player melee swing: hits monsters in front within range. */
function attack(world, p) {
  const cfg = world.cfg.player;
  if (p.dead || p.atkCd > 0) return;
  p.atkCd = cfg.attackCd;
  p.atkAnim = 0.18;
  let dmg = (cfg.baseDmg + (p.level - 1) * cfg.dmgPerLevel + weaponDmg(world, p)) * p.dmgMult();
  if (Math.random() < p.critCh()) dmg *= 2;
  for (const s of world.monsters) {
    if (s.dead) continue;
    const dx = s.x - p.x, dy = s.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < cfg.attackRange + s.radius) {
      const dot = (dx * p.fx + dy * p.fy) / (d || 1);
      if (dot > 0.1 || d < 40) damageMonster(world, s, p, dmg);
    }
  }
}

/* ---------------- Quests & loot ---------------- */

function questDef(world, qid) {
  return world.cfg.quests.find((q) => q.id === qid);
}

/** Per-player quest status: available | active | ready | done | locked | unavailable */
function questStatus(world, p, qid) {
  const q = questDef(world, qid);
  if (!q) return 'unknown';
  if (p.questsDone.includes(qid)) return 'done';
  const cur = p.quests[qid];
  if (cur) return cur.state; // 'active' | 'ready'
  if (q.locked) return 'locked'; // phase 3 content — never offered
  if (q.requires && !p.questsDone.includes(q.requires)) return 'unavailable';
  return 'available';
}

function checkQuestComplete(world, p, qid) {
  const qs = p.quests[qid];
  const q = questDef(world, qid);
  if (qs && qs.state === 'active' &&
      q.objectives.every((o, i) => qs.progress[i] >= o.count)) {
    qs.state = 'ready';
    world.bus.emit('quest:ready', p, q);
  }
}

/** Accept an available quest. Idempotent: only 'available' → 'active'. */
function acceptQuest(world, p, qid) {
  if (questStatus(world, p, qid) !== 'available') return false;
  const q = questDef(world, qid);
  const progress = q.objectives.map((o) => {
    // items picked up before accepting still count (from current inventory)
    if (o.type === 'collect') return Math.min(invCount(p, o.item), o.count);
    return 0;
  });
  p.quests[qid] = {
    state: progress.every((n, i) => n >= q.objectives[i].count) ? 'ready' : 'active',
    progress,
  };
  world.bus.emit('quest:accepted', p, q);
  return true;
}

/**
 * Turn in a ready quest. Rewards are granted exactly once: the status flips
 * to 'done', so a repeated turn-in is ignored.
 */
function turnInQuest(world, p, qid) {
  if (questStatus(world, p, qid) !== 'ready') return null;
  const q = questDef(world, qid);
  delete p.quests[qid];
  p.questsDone.push(qid);
  const rewards = q.rewards || {};
  if (rewards.xp) gainXp(world, p, rewards.xp);
  if (rewards.gold) p.gold += rewards.gold;
  if (q.finalReward) {
    // the adventure's final reward: the King's Blade
    giveItem(world, p, 'kings_blade', 1);
    world.bus.emit('chat', {
      name: 'Server',
      text: `👑 ${p.name} đã hoàn thành chuyến phiêu lưu và nhận được Kiếm Vương!`,
    });
  }
  world.bus.emit('quest:turnin', p, q, rewards);
  return rewards;
}

/** Kill credit: ONLY the killing blow counts, and only with the quest active. */
function addKillCredit(world, p, target) {
  for (const [qid, qs] of Object.entries(p.quests)) {
    if (qs.state !== 'active') continue;
    const q = questDef(world, qid);
    q.objectives.forEach((o, i) => {
      if (o.type === 'kill' && o.target === target && qs.progress[i] < o.count) {
        qs.progress[i]++;
        checkQuestComplete(world, p, qid);
      }
    });
  }
}

function addCollectCredit(world, p, item) {
  for (const [qid, qs] of Object.entries(p.quests)) {
    if (qs.state !== 'active') continue;
    const q = questDef(world, qid);
    q.objectives.forEach((o, i) => {
      if (o.type === 'collect' && o.item === item && qs.progress[i] < o.count) {
        qs.progress[i]++;
        checkQuestComplete(world, p, qid);
      }
    });
  }
}

/** Roll the monster's loot table on death. */
function dropLoot(world, s) {
  const table = world.cfg.drops[s.mtype] || [];
  for (const d of table) {
    if (Math.random() < d.chance) {
      const amount = d.amount ? Math.round(rand(d.amount[0], d.amount[1])) : null;
      world.dropItem(d.item, s.x, s.y, amount);
    }
  }
}

/**
 * Auto-pickup on touch + despawn old loot. One pickup counts exactly once.
 * Gold goes straight to the wallet; items need a free bag slot.
 */
function pickupTick(world) {
  const now = Date.now();
  world.items = world.items.filter((it) => now < it.expiresAt);
  for (const p of world.players.values()) {
    if (p.dead) continue;
    for (let i = world.items.length - 1; i >= 0; i--) {
      const it = world.items[i];
      if (Math.hypot(it.x - p.x, it.y - p.y) < 34) {
        if (it.item === 'gold') {
          world.items.splice(i, 1);
          p.gold += it.amount || 1;
          world.bus.emit('item:pickup', p, 'gold');
          continue;
        }
        if (!giveItem(world, p, it.item, 1)) continue; // bag full: leave it
        world.items.splice(i, 1); // removed from the world: cannot count twice
        addCollectCredit(world, p, it.item);
        world.bus.emit('item:pickup', p, it.item);
      }
    }
  }
}

/** Is the player close enough to talk to this NPC? */
function nearNpc(world, p, npcId, range = 140) {
  const npc = world.cfg.npcs.find((n) => n.id === npcId);
  return !!npc && Math.hypot(npc.x - p.x, npc.y - p.y) <= range;
}

/** Build the npc_dialog payload with per-player quest states. */
function dialogFor(world, p, npcId) {
  const npc = world.cfg.npcs.find((n) => n.id === npcId);
  if (!npc) return null;
  const byId = Object.fromEntries(world.cfg.quests.map((q) => [q.id, q]));
  const quests = world.cfg.quests
    .filter((q) => q.giver === npcId)
    .map((q) => {
      const st = questStatus(world, p, q.id);
      const qs = p.quests[q.id];
      return {
        id: q.id, name: q.name, desc: q.desc, state: st,
        objectives: q.objectives.map((o, i) => ({
          text: o.text,
          have: qs ? Math.min(qs.progress[i], o.count) : 0,
          need: o.count,
        })),
        rewards: q.rewards || {},
        nextName: q.next && byId[q.next] ? byId[q.next].name : null,
      };
    });
  return {
    t: 'npc_dialog', npc: npc.id, name: npc.name, icon: npc.icon,
    greeting: npc.greeting, quests,
  };
}

/** Spend skill points to unlock an active skill. Returns true on success. */
function unlockSkill(world, p, id) {
  const def = world.cfg.skills.actives[id];
  if (!def || p.skills.includes(id) || p.sp < def.cost) return false;
  p.sp -= def.cost;
  p.skills.push(id);
  world.bus.emit('player:skill', p, id);
  return true;
}

/** Spend 1 point to level a passive (up to its max). Returns true on success. */
function allocatePassive(world, p, id) {
  const def = world.cfg.skills.passives[id];
  if (!def || p.sp < 1 || (p.passives[id] || 0) >= def.max) return false;
  p.sp -= 1;
  p.passives[id] = (p.passives[id] || 0) + 1;
  if (id === 'tough') {
    p.maxHp += 20;
    p.hp = Math.min(effMaxHp(world, p), p.hp + 20);
  }
  return true;
}

/** Trigger an unlocked active skill (checks cooldown). Returns true on success. */
function castSkill(world, p, id) {
  const def = world.cfg.skills.actives[id];
  if (!def || p.dead || !p.skills.includes(id) || (p.cds[id] || 0) > 0) return false;
  if (id === 'dash') {
    p.dashT = 0.18;
    p.dashDx = p.fx; p.dashDy = p.fy;
  } else if (id === 'whirlwind') {
    const cfg = world.cfg.player;
    const dmg = (cfg.baseDmg + (p.level - 1) * cfg.dmgPerLevel + weaponDmg(world, p)) * p.dmgMult() * 1.5;
    for (const s of world.monsters) {
      if (s.dead) continue;
      if (Math.hypot(s.x - p.x, s.y - p.y) < 110 + s.radius) {
        damageMonster(world, s, p, dmg);
      }
    }
  } else if (id === 'heal') {
    const mh = effMaxHp(world, p);
    p.hp = Math.min(mh, p.hp + mh * 0.4);
  }
  p.cds[id] = def.cd;
  p.castSeq++;
  p.castSkill = id;
  return true;
}

/** Find the nearest living player to (x, y). Returns { p, d } or {}. */
function nearestPlayer(world, x, y) {
  let best = null, bd = Infinity;
  for (const p of world.players.values()) {
    if (p.dead) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) { bd = d; best = p; }
  }
  return { p: best, d: bd };
}

function moveToward(s, tx, ty, sp, dt, world) {
  const d = Math.hypot(tx - s.x, ty - s.y) || 1;
  s.x += ((tx - s.x) / d) * sp * dt;
  s.y += ((ty - s.y) / d) * sp * dt;
  collide(world, s);
}

/** AoE damage to players within r of (x, y). */
function aoeHit(world, x, y, r, dmg) {
  for (const p of world.players.values()) {
    if (p.dead) continue;
    if (Math.hypot(p.x - x, p.y - y) < r + p.radius) hurtPlayer(world, p, dmg);
  }
}

/**
 * Generalized monster AI. Telegraphs (`s.tele`) warn heavy attacks;
 * when the timer expires the effect resolves.
 */
function monsterAI(world, dt) {
  for (const s of world.monsters) {
    if (s.dead) continue;
    const cfg = world.cfg.monsters[s.mtype];
    s.flash = Math.max(0, s.flash - dt);
    s.touchCd = Math.max(0, s.touchCd - dt);
    s.atkCd = Math.max(0, s.atkCd - dt);

    // resolve finished telegraphs first
    if (s.tele) {
      s.tele.t -= dt;
      if (s.tele.t <= 0) {
        const t = s.tele;
        s.tele = null;
        if (t.type === 'lunge') {
          // goblin heavy: dash forward, damage in path
          const d = Math.hypot(t.dx, t.dy) || 1;
          s.x += (t.dx / d) * 110;
          s.y += (t.dy / d) * 110;
          collide(world, s);
          for (const p of world.players.values()) {
            if (p.dead) continue;
            if (Math.hypot(p.x - s.x, p.y - s.y) < cfg.heavy.range + p.radius) {
              hurtPlayer(world, p, cfg.heavy.dmg);
            }
          }
        } else if (t.type === 'slam') {
          aoeHit(world, t.x, t.y, t.r, cfg.slam.dmg);
        }
      }
      continue; // telegraphing monsters don't move
    }

    const { p: best, d: bd } = nearestPlayer(world, s.x, s.y);
    let mx = 0, my = 0, sp = cfg.wanderSpeed;

    if (best && bd < cfg.aggroRange) {
      const d = bd || 1;
      const nx = (best.x - s.x) / d, ny = (best.y - s.y) / d;

      if (s.mtype === 'wisp' && cfg.ranged) {
        // ranged: keep distance, shoot projectiles
        if (bd > cfg.keepRange + 40) { mx = nx; my = ny; sp = cfg.speed; }
        else if (bd < cfg.keepRange - 40) { mx = -nx; my = -ny; sp = cfg.speed; }
        else { const a = Math.atan2(ny, nx) + Math.PI / 2; mx = Math.cos(a) * 0.4; my = Math.sin(a) * 0.4; sp = cfg.speed; }
        if (bd < cfg.ranged.range && s.atkCd <= 0) {
          s.atkCd = cfg.ranged.cdMs / 1000;
          world.projectiles.push({
            id: world.nextProjId++, x: s.x, y: s.y,
            dx: nx, dy: ny, speed: cfg.ranged.projSpeed,
            dmg: cfg.ranged.dmg, life: 3,
          });
        }
      } else {
        mx = nx; my = ny; sp = cfg.speed;
      }

      // touch damage
      if (bd < cfg.touchRange && s.touchCd <= 0) {
        s.touchCd = 1.0;
        hurtPlayer(world, best, cfg.touchDmg);
      }

      // goblin heavy lunge (telegraphed)
      if (s.mtype === 'goblin' && cfg.heavy && bd < 130 && s.atkCd <= 0) {
        s.atkCd = cfg.heavy.cdMs / 1000;
        s.tele = { type: 'lunge', t: cfg.heavy.teleMs / 1000, dx: nx, dy: ny, x: s.x, y: s.y, r: cfg.heavy.range };
      }

      // boss behaviors
      if (s.mtype === 'slime_king') {
        if (cfg.slam && bd < 220 && s.atkCd <= 0) {
          s.atkCd = cfg.slam.cdMs / 1000;
          s.tele = { type: 'slam', t: cfg.slam.teleMs / 1000, x: s.x, y: s.y, r: cfg.slam.range };
        } else if (cfg.summon && (s.sumCd || 0) <= 0) {
          const alive = world.monsters.filter((m) => !m.dead && m.mtype === 'slime').length;
          if (alive < cfg.summon.maxAlive) {
            s.sumCd = cfg.summon.cdMs / 1000;
            for (let i = 0; i < cfg.summon.count; i++) {
              const m = new Monster('slime', s.x + rand(-60, 60), s.y + rand(-60, 60), world.cfg);
              collide(world, m);
              world.monsters.push(m);
            }
            world.bus.emit('chat', { name: 'Server', text: '👑 Slime King gọi slime nhỏ!' });
          } else {
            s.sumCd = 2; // retry soon
          }
        }
        s.sumCd = Math.max(0, (s.sumCd || 0) - dt);
      }
    } else {
      // wander
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
    collide(world, s);
  }
}

// Backwards-compatible alias.
const slimeAI = monsterAI;

/** Move projectiles, hit players, fizzle on walls. */
function projectileTick(world, dt) {
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const pr = world.projectiles[i];
    pr.life -= dt;
    pr.x += pr.dx * pr.speed * dt;
    pr.y += pr.dy * pr.speed * dt;
    let dead = pr.life <= 0;
    if (!dead) {
      for (const p of world.players.values()) {
        if (p.dead) continue;
        if (Math.hypot(pr.x - p.x, pr.y - p.y) < 10 + p.radius) {
          hurtPlayer(world, p, pr.dmg);
          dead = true;
          break;
        }
      }
    }
    if (!dead && world.isSolidTile(Math.floor(pr.x / world.ts), Math.floor(pr.y / world.ts))) {
      dead = true;
    }
    if (dead) world.projectiles.splice(i, 1);
  }
}

/** Respawn dead players and monsters when their timers elapse. */
function respawn(world) {
  const now = Date.now();
  for (const p of world.players.values()) {
    if (p.dead && now >= p.respawnAt) {
      p.dead = false;
      p.hp = p.maxHp;
      const s = world.randomSpawn(); // same clearance rules as initial spawn
      p.x = s.x; p.y = s.y;
      p.vx = 0; p.vy = 0;
      world.bus.emit('player:respawn', p);
    }
  }
  for (const s of world.monsters) {
    if (s.dead && now >= s.respawnAt) {
      const f = world.makeMonster(s.mtype);
      s.x = f.x; s.y = f.y;
      s.hp = s.maxHp; s.dead = false; s.flash = 0;
      s.tele = null; s.atkCd = 0; s.dmgBy = {};
    }
  }
}

module.exports = { movement, skillsTick, slimeAI, monsterAI, projectileTick, respawn, attack, hurtPlayer, gainXp, damageSlime, damageMonster, bossDown, unlockSkill, allocatePassive, castSkill, questStatus, checkQuestComplete, acceptQuest, turnInQuest, addKillCredit, addCollectCredit, dropLoot, giveItem, invCount, equipItem, unequipItem, useItem, effMaxHp, weaponDmg, pickupTick, nearNpc, dialogFor, collide };
