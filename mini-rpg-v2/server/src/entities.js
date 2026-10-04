'use strict';
/**
 * Entity classes. To add a new monster type (e.g. Goblin):
 *   1. Create a class extending Entity (see Slime).
 *   2. Add a spawn + AI section in systems.js.
 *   3. Add serialize() output to the client views.
 */

let nextId = 1;
const COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#fd79a8'];

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
  constructor(name, x, y, cfg) {
    super(x, y, 16);
    this.kind = 'player';
    this.name = name;
    this.color = COLORS[this.id % COLORS.length];
    this.maxHp = cfg.player.maxHp;
    this.hp = this.maxHp;
    this.xp = 0;
    this.level = 1;
    this.vx = 0; this.vy = 0;   // movement input (normalized)
    this.fx = 1; this.fy = 0;   // facing direction
    this.atkCd = 0;
    this.atkAnim = 0;
    this.hurtCd = 0;
    this.respawnAt = 0;
  }
  serialize() {
    return {
      id: this.id, name: this.name,
      x: Math.round(this.x), y: Math.round(this.y),
      hp: Math.ceil(this.hp), maxHp: this.maxHp,
      xp: this.xp, level: this.level,
      fx: +this.fx.toFixed(2), fy: +this.fy.toFixed(2),
      color: this.color, dead: this.dead,
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
