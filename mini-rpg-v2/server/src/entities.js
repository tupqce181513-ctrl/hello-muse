'use strict';
/**
 * Entity classes. To add a new monster type (e.g. Goblin):
 *   1. Create a class extending Entity (see Slime).
 *   2. Add a spawn + AI section in systems.js.
 *   3. Add serialize() output to the client views.
 */

let nextId = 1;

class Entity {
  constructor(x, y, radius) {
    this.id = nextId++;
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.dead = false;
  }
}

class Player extends Entity {
  constructor(name, skinId, x, y, cfg) {
    super(x, y, 16);
    this.kind = 'player';
    this.name = name;
    this.skinId = skinId;
    this.maxHp = cfg.player.maxHp;
    this.hp = this.maxHp;
    this.xp = 0;
    this.level = 1;
    this.sp = 0;                              // skill points (earned on level up)
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
      sp: this.sp, skills: this.skills, passives: this.passives,
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

class Slime extends Entity {
  constructor(x, y, cfg) {
    super(x, y, 14);
    this.kind = 'slime';
    this.maxHp = cfg.slime.hp;
    this.hp = this.maxHp;
    this.flash = 0;      // hit flash timer (visual)
    this.touchCd = 0;    // damage cooldown
    this.wx = 0; this.wy = 0; this.wt = 0; // wander state
    this.respawnAt = 0;
  }
  serialize() {
    return {
      id: this.id, x: Math.round(this.x), y: Math.round(this.y),
      hp: this.hp, maxHp: this.maxHp,
      dead: this.dead, flash: this.flash > 0,
    };
  }
}

module.exports = { Player, Slime };
