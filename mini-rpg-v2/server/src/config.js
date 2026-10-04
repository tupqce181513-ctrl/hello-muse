'use strict';
/**
 * Central tuning for the whole game. Change numbers here —
 * no other file needs editing to rebalance.
 */
module.exports = {
  port: process.env.PORT || 8080,
  tickMs: 50, // 20 simulation ticks per second

  world: { w: 1600, h: 1200 },

  player: {
    speed: 200,       // px per second
    maxHp: 100,
    attackRange: 80,
    attackCd: 0.45,   // seconds between swings
    baseDmg: 20,
    dmgPerLevel: 8,
    xpPerKill: 25,
  },

  slime: {
    count: 8,
    hp: 60,
    speed: 110,       // chase speed
    wanderSpeed: 45,
    aggroRange: 280,
    touchRange: 34,
    touchDmg: 8,
    respawnMs: 5000,
  },

  // Static colliders (also drawn as trees on the client)
  obstacles: [
    { x: 300, y: 300, r: 30 }, { x: 900, y: 250, r: 30 },
    { x: 1300, y: 500, r: 30 }, { x: 500, y: 800, r: 30 },
    { x: 1100, y: 900, r: 30 }, { x: 200, y: 1000, r: 30 },
    { x: 750, y: 600, r: 40 }, { x: 1400, y: 150, r: 26 },
  ],
};
