'use strict';
/**
 * Systems — pure-ish functions that advance the world each tick.
 * To add new behavior (poison zones, buffs, new AI), add a function
 * here and call it from the main loop in index.js.
 */

const rand = (a, b) => a + Math.random() * (b - a);

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
  const sp = world.cfg.player.speed;
  for (const p of world.players.values()) {
    if (p.dead) continue;
    p.atkCd = Math.max(0, p.atkCd - dt);
    p.hurtCd = Math.max(0, p.hurtCd - dt);
    p.atkAnim = Math.max(0, p.atkAnim - dt);
    p.x += p.vx * sp * dt;
    p.y += p.vy * sp * dt;
    collide(world, p);
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
  let need = p.level * 100;
  while (p.xp >= need) {
    p.xp -= need;
    p.level++;
    p.maxHp += 20;
    p.hp = p.maxHp;
    need = p.level * 100;
    world.bus.emit('player:levelup', p);
  }
}

/** Player melee swing: hits slimes in front within range. */
function attack(world, p) {
  const cfg = world.cfg.player;
  if (p.dead || p.atkCd > 0) return;
  p.atkCd = cfg.attackCd;
  p.atkAnim = 0.18;
  const dmg = cfg.baseDmg + (p.level - 1) * cfg.dmgPerLevel;
  for (const s of world.slimes) {
    if (s.dead) continue;
    const dx = s.x - p.x, dy = s.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < cfg.attackRange + s.radius) {
      const dot = (dx * p.fx + dy * p.fy) / (d || 1);
      if (dot > 0.1 || d < 40) {
        s.hp -= dmg;
        s.flash = 0.15;
        if (s.hp <= 0) {
          s.dead = true;
          s.respawnAt = Date.now() + world.cfg.slime.respawnMs;
          world.bus.emit('slime:killed', s, p);
          gainXp(world, p, cfg.xpPerKill);
        }
      }
    }
  }
}

/** Slime AI: chase nearby players, wander otherwise, damage on touch. */
function slimeAI(world, dt) {
  const cfg = world.cfg.slime;
  for (const s of world.slimes) {
    if (s.dead) continue;
    s.flash = Math.max(0, s.flash - dt);
    s.touchCd = Math.max(0, s.touchCd - dt);

    let best = null, bd = Infinity;
    for (const p of world.players.values()) {
      if (p.dead) continue;
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bd) { bd = d; best = p; }
    }

    let mx = 0, my = 0, sp = cfg.wanderSpeed;
    if (best && bd < cfg.aggroRange) {
      const d = bd || 1;
      mx = (best.x - s.x) / d; my = (best.y - s.y) / d;
      sp = cfg.speed;
      if (bd < cfg.touchRange && s.touchCd <= 0) {
        s.touchCd = 1.0;
        hurtPlayer(world, best, cfg.touchDmg);
      }
    } else {
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

/** Respawn dead players and slimes when their timers elapse. */
function respawn(world) {
  const now = Date.now();
  for (const p of world.players.values()) {
    if (p.dead && now >= p.respawnAt) {
      p.dead = false;
      p.hp = p.maxHp;
      p.x = rand(200, 400); p.y = rand(200, 400);
      world.bus.emit('player:respawn', p);
    }
  }
  for (const s of world.slimes) {
    if (s.dead && now >= s.respawnAt) {
      const f = world.makeSlime();
      s.x = f.x; s.y = f.y;
      s.hp = s.maxHp; s.dead = false; s.flash = 0;
    }
  }
}

module.exports = { movement, slimeAI, respawn, attack, hurtPlayer, gainXp, collide };
