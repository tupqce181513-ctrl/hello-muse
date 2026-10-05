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
    hpPerLevel: 20,   // +max HP per level and per tough rank (single source of truth)
    attackRange: 80,
    attackCd: 0.45,   // seconds between swings
    baseDmg: 20,
    dmgPerLevel: 8,
    potionCd: 5,      // seconds between potion uses
    potionHeal: 0.5,  // fraction of max HP restored
    invSize: 12,
  },

  // Monster types. `zone` refers to spawnZones below.
  monsters: {
    slime: {
      count: 8, hp: 60, radius: 14,
      speed: 110, wanderSpeed: 45, aggroRange: 280,
      touchRange: 34, touchDmg: 8, respawnMs: 5000, xp: 25,
      zone: 'meadow',
    },
    goblin: {
      count: 4, hp: 120, radius: 15,
      speed: 150, wanderSpeed: 50, aggroRange: 340,
      touchRange: 36, touchDmg: 12, respawnMs: 8000, xp: 45,
      zone: 'east',
      heavy: { range: 100, dmg: 30, teleMs: 800, cdMs: 5000 }, // telegraphed lunge
    },
    wisp: {
      count: 3, hp: 80, radius: 13,
      speed: 90, wanderSpeed: 40, aggroRange: 420, keepRange: 260,
      touchRange: 30, touchDmg: 6, respawnMs: 10000, xp: 50,
      zone: 'north',
      ranged: { range: 380, dmg: 14, cdMs: 2500, projSpeed: 320 },
    },
    slime_king: {
      count: 1, hp: 1500, radius: 40, boss: true,
      speed: 70, wanderSpeed: 0, aggroRange: 500,
      touchRange: 62, touchDmg: 25, respawnMs: 120000, xp: 400,
      zone: 'arena',
      slam: { range: 150, dmg: 40, teleMs: 1200, cdMs: 8000 },  // telegraphed AoE
      summon: { cdMs: 15000, count: 2, maxAlive: 10 },          // calls small slimes
    },
  },

  spawnZones: {
    meadow: { x0: 100, y0: 600, x1: 1500, y1: 1100 }, // slimes (south)
    east:   { x0: 1050, y0: 100, x1: 1550, y1: 560 }, // goblins
    north:  { x0: 100, y0: 100, x1: 1000, y1: 450 },  // wisps
    arena:  { x0: 1120, y0: 400, x1: 1440, y1: 620 }, // slime king
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

  // --- NPCs (static; rendered by the client from 'welcome') ---
  npcs: [
    { id: 'guide', name: 'Người dẫn đường', icon: '🧙', x: 250, y: 950,
      greeting: 'Chào mừng đến Đồng Cỏ! Slime đang phá hoại mùa màng — cậu giúp ta chứ?' },
  ],

  // --- Items (phase 3: full inventory, 12 slots) ---
  items: {
    slime_shard:  { name: 'Mảnh Slime',    icon: '🟢', color: '#69f0ae', stack: true },
    gold:         { name: 'Vàng',           icon: '🪙', color: '#ffd54f', stack: true },
    potion:       { name: 'Thuốc hồi máu',  icon: '🧪', color: '#ef5350', stack: true,
                    usable: true, desc: 'Hồi 50% HP (hồi chiêu 5s)' },
    sword_iron:   { name: 'Kiếm sắt',       icon: '🗡️', color: '#90a4ae',
                    equip: 'weapon', bonus: { dmg: 12 }, desc: '+12 sát thương' },
    armor_leather:{ name: 'Giáp da',        icon: '🦺', color: '#8d6e3f',
                    equip: 'armor', bonus: { maxHp: 30 }, desc: '+30 HP tối đa' },
    kings_blade:  { name: 'Kiếm Vương',     icon: '👑', color: '#ffd54f',
                    equip: 'weapon', bonus: { dmg: 30 }, desc: '+30 sát thương' },
  },
  // loot table per monster kind: [{ item, chance, amount }]
  drops: {
    slime:     [{ item: 'slime_shard', chance: 0.5 }, { item: 'gold', chance: 0.3, amount: [5, 15] },
                { item: 'potion', chance: 0.08 }],
    goblin:    [{ item: 'gold', chance: 0.6, amount: [10, 25] }, { item: 'potion', chance: 0.15 },
                { item: 'sword_iron', chance: 0.04 }],
    wisp:      [{ item: 'gold', chance: 0.5, amount: [8, 20] }, { item: 'potion', chance: 0.12 },
                { item: 'armor_leather', chance: 0.04 }],
    slime_king:[ { item: 'gold', chance: 1, amount: [100, 200] }, { item: 'potion', chance: 1, amount: [2, 3] }],
  },
  itemDespawnMs: 60000,

  // --- Quests ---
  // states per player: available -> active -> ready -> done (claimed).
  // Kill credit rule (announced in quest text): only the killing blow counts,
  // and only while the quest is active — EXCEPT the boss, whose quest credit
  // goes through the co-op damage threshold in bossDown() (see F10).
  quests: [
    {
      id: 'slime_hunt',
      name: 'Diệt Slime',
      giver: 'guide',
      desc: 'Hạ 5 slime trong đồng cỏ. Chỉ tính cho người kết liễu.',
      objectives: [{ type: 'kill', target: 'slime', count: 5, text: 'Hạ slime' }],
      rewards: { xp: 60, gold: 30 },
      next: 'gather_shards',
    },
    {
      id: 'gather_shards',
      name: 'Thu thập mảnh vỡ',
      giver: 'guide',
      desc: 'Nhặt 3 Mảnh Slime rơi ra từ slime đã hạ.',
      objectives: [{ type: 'collect', item: 'slime_shard', count: 3, text: 'Nhặt Mảnh Slime' }],
      rewards: { xp: 100, gold: 50 },
      requires: 'slime_hunt',
      next: 'boss_hunt',
    },
    {
      id: 'boss_hunt',
      name: 'Thách đấu Boss',
      giver: 'guide',
      desc: 'Hạ Slime King ở đấu trường phía đông bắc. Quy tắc co-op: gây ít nhất 5% sát thương và còn online khi Boss gục để nhận thưởng.',
      objectives: [{ type: 'kill', target: 'slime_king', count: 1, text: 'Hạ Slime King' }],
      rewards: { xp: 300, gold: 150 },
      requires: 'gather_shards',
      finalReward: true, // + Kiếm Vương khi trả quest
    },
  ],
};
