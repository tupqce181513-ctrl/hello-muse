'use strict';
/**
 * Entity classes. To add a new monster type (e.g. Goblin):
 *   1. Create a class extending Entity (see Slime).
 *   2. Add a spawn + AI section in systems.js.
 *   3. Add serialize() output to the client views.
 */

let nextId = 1;

class Entity {
  constructor(x, y, radius, id) {
    this.id = id != null ? id : nextId++;
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.dead = false;
  }
}

class Player extends Entity {
  constructor(name, skinId, x, y, cfg, id) {
    super(x, y, 16, id);
    this.kind = 'player';
    this.name = name;
    this.skinId = skinId;
    this.maxHp = cfg.player.maxHp;
    this.hp = this.maxHp;
    this.xp = 0;
    this.level = 1;
    this.sp = 0;                              // skill points (earned on level up)
    this.gold = 0;                            // currency (quest rewards; shops in phase 3)
    this.inv = new Array(12).fill(null);      // 12 slots: null | { uid, item, qty }
    this.equip = { weapon: null, armor: null };// equipped item refs (never stacked)
    this.potionCd = 0;
    this.quests = {};                         // active: { questId: { state, progress: [] } }
    this.questsDone = [];                     // claimed quest ids (rewards granted once)
    this.skills = [];                         // unlocked active skill ids
    this.passives = { power: 0, swift: 0, tough: 0, crit: 0 };
    this.cds = {};                            // skillId -> cooldown seconds remaining
    this.dashT = 0; this.dashDx = 1; this.dashDy = 0;
    this.castSeq = 0; this.castSkill = '';    // last cast, for client FX
    this.vx = 0; this.vy = 0;   // movement input (normalized)
    this.fx = 1; this.fy = 0;   // facing direction
    this.atkCd = 0;
    this.atkAnim = 0;
    this.hurtCd = 0;
    this.respawnAt = 0;
    this.savedAt = 0;   // last persistence timestamp (shown in the client HUD)
    this.ws = null;     // active socket (single-connection enforcement)
  }
  dmgMult() { return 1 + 0.15 * this.passives.power; }
  speedMult() { return 1 + 0.08 * this.passives.swift; }
  critCh() { return 0.08 * this.passives.crit; }
  serialize() {
    return {
      id: this.id, name: this.name, skin: this.skinId,
      x: Math.round(this.x), y: Math.round(this.y),
      hp: Math.ceil(this.hp), maxHp: this.maxHp,
      xp: this.xp, level: this.level,
      sp: this.sp, gold: this.gold,
      inv: this.inv, equip: this.equip,
      potionCd: +this.potionCd.toFixed(1),
      savedAt: this.savedAt,
      respawnIn: this.dead ? Math.max(0, (this.respawnAt - Date.now()) / 1000) : 0,
      quests: this.quests, questsDone: this.questsDone,
      skills: this.skills, passives: this.passives,
      cds: Object.fromEntries(
        Object.entries(this.cds).map(([k, v]) => [k, +v.toFixed(1)])
      ),
      castSeq: this.castSeq, castSkill: this.castSkill,
      fx: +this.fx.toFixed(2), fy: +this.fy.toFixed(2),
      dead: this.dead,
      atkAnim: +this.atkAnim.toFixed(2),
    };
  }
}

/**
 * Monster — generalized base for all monster kinds (slime, goblin, wisp,
 * slime_king...). Kind-specific tuning lives in config.monsters, behavior
 * in systems.monsterAI.
 */
class Monster extends Entity {
  constructor(mtype, x, y, cfg) {
    const c = cfg.monsters[mtype];
    super(x, y, c.radius || 14);
    this.kind = 'monster';
    this.mtype = mtype;
    this.boss = !!c.boss;
    this.maxHp = c.hp;
    this.hp = this.maxHp;
    this.flash = 0;      // hit flash timer (visual)
    this.touchCd = 0;    // touch-damage cooldown
    this.atkCd = 0;      // special-attack cooldown (heavy / ranged / slam / summon)
    this.tele = null;    // telegraph: { type, t, x, y, r } (visual warning)
    this.wx = 0; this.wy = 0; this.wt = 0; // wander state
    this.respawnAt = 0;
    this.dmgBy = {};     // boss co-op: playerId -> damage dealt this life
  }
  serialize() {
    return {
      id: this.id, mtype: this.mtype, boss: this.boss,
      x: Math.round(this.x), y: Math.round(this.y),
      hp: Math.ceil(this.hp), maxHp: this.maxHp,
      dead: this.dead, flash: this.flash > 0,
      tele: this.tele ? {
        type: this.tele.type, t: +this.tele.t.toFixed(2),
        x: Math.round(this.tele.x), y: Math.round(this.tele.y), r: this.tele.r,
      } : null,
    };
  }
}

// Backwards-compatible alias: existing code/tests referring to Slime keep working.
class Slime extends Monster {
  constructor(x, y, cfg) { super('slime', x, y, cfg); }
}

module.exports = { Player, Slime, Monster };
