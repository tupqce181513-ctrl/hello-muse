'use strict';
/**
 * Central tuning for the whole game. Change numbers here —
 * no other file needs editing to rebalance.
 *
 * Maps live in ../shared/maps/*.json and are loaded by world.js.
 * Skins are validated on join and broadcast to all clients.
 */
module.exports = {
  port: process.env.PORT || 8080,
  tickMs: 50, // 20 simulation ticks per second

  mapFile: 'meadow.json', // in ../shared/maps/

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

  // Pickable character skins (id must be unique; shown in the join overlay)
  skins: [
    { id: 'ranger', name: 'Kiểm lâm', body: '#e74c3c', accent: '#7b2d26', hat: 'none' },
    { id: 'azure',  name: 'Thủy thủ', body: '#3498db', accent: '#1f5f8b', hat: 'cap' },
    { id: 'rogue',  name: 'Đạo tặc',  body: '#9b59b6', accent: '#5e3370', hat: 'hood' },
    { id: 'scout',  name: 'Trinh sát', body: '#1abc9c', accent: '#0f6e5e', hat: 'headband' },
    { id: 'ember',  name: 'Hỏa',      body: '#e67e22', accent: '#8a4b14', hat: 'none' },
    { id: 'shadow', name: 'Bóng đêm', body: '#2d3436', accent: '#636e72', hat: 'hood' },
  ],

  // --- Experience & skills ---
  // XP needed to go from `level` to `level + 1` (curved: higher levels cost more)
  xpNeed: (level) => Math.round(100 * Math.pow(level, 1.25)),

  skills: {
    // Active skills: unlock with skill points, trigger with keys 1/2/3
    actives: {
      dash:      { name: 'Lao tới',   icon: '💨', cost: 1, cd: 6,  desc: 'Lướt nhanh về phía đang nhìn' },
      whirlwind: { name: 'Xoáy kiếm',  icon: '🌀', cost: 2, cd: 8,  desc: 'Gây 150% sát thương lên quái xung quanh' },
      heal:      { name: 'Hồi máu',    icon: '💚', cost: 2, cd: 20, desc: 'Hồi 40% HP tối đa' },
    },
    // Passives: 1 point per level, up to `max`
    passives: {
      power: { name: 'Sức mạnh',  icon: '⚔️', max: 5, desc: '+15% sát thương mỗi cấp' },
      swift: { name: 'Nhanh nhẹn', icon: '🥾', max: 5, desc: '+8% tốc chạy mỗi cấp' },
      tough: { name: 'Cứng cáp',  icon: '🛡️', max: 5, desc: '+20 HP tối đa mỗi cấp' },
      crit:  { name: 'Chí mạng',  icon: '💥', max: 5, desc: '+8% tỉ lệ chí mạng (x2 sát thương) mỗi cấp' },
    },
  },
};
