'use strict';
/**
 * World — owns all game state and emits game events on `bus`.
 * The tile map is loaded from ../shared/maps/ and drives both
 * collision (server) and rendering (client receives it in 'welcome').
 */
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { Player, Slime, Monster } = require('./entities');
const { newId } = require('./persistence/store');
const systems = require('./systems');

/**
 * Validate + sanitize a saved player record. Save data comes from disk —
 * possibly hand-edited, corrupt, or from an older config — so it is never
 * trusted blindly. Unfixable fields fall back to safe defaults (F14).
 */
function sanitizeRecord(rec) {
  const r = rec && typeof rec === 'object' ? rec : {};
  const num = (v, dflt, min = 0) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : dflt;
    return n < min ? min : n;
  };
  const cleanSlot = (s) => (s && typeof s.uid === 'string' && typeof s.item === 'string'
    ? { uid: s.uid, item: s.item, qty: Math.max(1, Math.floor(num(s.qty, 1, 1))) }
    : null);
  const clampRank = (v) => Math.min(5, Math.max(0, Math.floor(num(v, 0))));
  return {
    id: typeof r.id === 'string' && r.id ? r.id : newId(),
    name: typeof r.name === 'string' && r.name ? r.name.slice(0, 16) : 'Hero',
    skinId: typeof r.skinId === 'string' ? r.skinId : 'ranger',
    level: Math.min(99, Math.max(1, Math.floor(num(r.level, 1, 1)))),
    xp: num(r.xp, 0), sp: num(r.sp, 0), gold: num(r.gold, 0),
    hp: num(r.hp, 0),
    skills: Array.isArray(r.skills) ? r.skills.filter((s) => typeof s === 'string') : [],
    passives: {
      power: clampRank(r.passives && r.passives.power),
      swift: clampRank(r.passives && r.passives.swift),
      tough: clampRank(r.passives && r.passives.tough),
      crit: clampRank(r.passives && r.passives.crit),
    },
    inv: Array.isArray(r.inv) && r.inv.length === 12
      ? r.inv.map(cleanSlot) : new Array(12).fill(null),
    equip: {
      weapon: cleanSlot(r.equip && r.equip.weapon),
      armor: cleanSlot(r.equip && r.equip.armor),
    },
    quests: r.quests && typeof r.quests === 'object' ? r.quests : {},
    questsDone: Array.isArray(r.questsDone)
      ? r.questsDone.filter((q) => typeof q === 'string') : [],
    cdsExpiresAt: r.cdsExpiresAt && typeof r.cdsExpiresAt === 'object' ? r.cdsExpiresAt : {},
    potionCdExpiresAt: num(r.potionCdExpiresAt, 0),
    dead: r.dead === true,
    respawnAt: num(r.respawnAt, 0),
    savedAt: num(r.savedAt, 0),
  };
}

const rand = (a, b) => a + Math.random() * (b - a);

class World {
  constructor(config) {
    this.cfg = config;
    this.bus = new EventEmitter();
    this.players = new Map(); // id -> Player
    this.monsters = [];
    this.projectiles = []; // { id, x, y, dx, dy, speed, dmg, life }
    this.nextProjId = 1;
    this.items = []; // ground loot: { id, item, x, y, amount?, expiresAt }
    this.nextItemId = 1;
    this.dmgEvents = []; // per-tick damage numbers: { x, y, amount, kind } (cleared after broadcast)
    this.chatLog = [];

    // Load the shared tile map (same file the client renders)
    const mapPath = path.join(__dirname, '..', '..', 'shared', 'maps', config.mapFile);
    this.map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    this.ts = this.map.tileSize;
    this.worldW = this.map.rows[0].length * this.ts;
    this.worldH = this.map.rows.length * this.ts;

    for (const [kind, c] of Object.entries(config.monsters)) {
      for (let i = 0; i < c.count; i++) {
        this.monsters.push(this.makeMonster(kind));
      }
    }
  }

  /** Tile solid? Out of bounds counts as solid (invisible walls). */
  isSolidTile(tx, ty) {
    const rows = this.map.rows;
    if (ty < 0 || ty >= rows.length || tx < 0 || tx >= rows[0].length) return true;
    const tile = this.map.tiles[rows[ty][tx]];
    return !!(tile && tile.solid);
  }

  /** Is the whole circle (x, y, radius) free of solid tiles? */
  isAreaClear(x, y, radius) {
    const ts = this.ts;
    const x0 = Math.floor((x - radius) / ts), x1 = Math.floor((x + radius) / ts);
    const y0 = Math.floor((y - radius) / ts), y1 = Math.floor((y + radius) / ts);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.isSolidTile(tx, ty)) return false;
      }
    }
    return true;
  }

  randomSpawn() {
    const pts = this.map.spawnPoints;
    for (let i = 0; i < 20; i++) {
      const p = pts[Math.floor(Math.random() * pts.length)];
      const x = p.x + rand(-30, 30), y = p.y + rand(-30, 30);
      if (this.isAreaClear(x, y, 16)) return { x, y };
    }
    // fallback: scan for any clear spot
    for (let i = 0; i < 100; i++) {
      const x = rand(60, this.worldW - 60), y = rand(60, this.worldH - 60);
      if (this.isAreaClear(x, y, 16)) return { x, y };
    }
    return { x: this.worldW / 2, y: this.worldH / 2 };
  }

  randomPoint(margin = 120, radius = 14) {
    // random walkable point with full-radius clearance (used for slimes)
    for (let i = 0; i < 50; i++) {
      const x = rand(margin, this.worldW - margin);
      const y = rand(margin, this.worldH - margin);
      if (this.isAreaClear(x, y, radius)) return { x, y };
    }
    return { x: this.worldW / 2, y: this.worldH / 2 };
  }

  /** Random clear point inside a named spawn zone. */
  spawnInZone(zoneName, radius) {
    const z = this.cfg.spawnZones[zoneName];
    if (!z) return this.randomPoint(120, radius);
    for (let i = 0; i < 60; i++) {
      const x = rand(z.x0, z.x1), y = rand(z.y0, z.y1);
      if (this.isAreaClear(x, y, radius)) return { x, y };
    }
    return this.randomPoint(120, radius);
  }

  makeMonster(mtype) {
    const c = this.cfg.monsters[mtype];
    const p = this.spawnInZone(c.zone, c.radius || 14);
    return new Monster(mtype, p.x, p.y, this.cfg);
  }

  makeSlime() {
    const p = this.randomPoint();
    return new Slime(p.x, p.y, this.cfg);
  }

  addPlayer(name, skinId) {
    const s = this.randomSpawn();
    const p = new Player(name, skinId, s.x, s.y, this.cfg, newId());
    this.players.set(p.id, p);
    this.bus.emit('player:join', p);
    return p;
  }

  /**
   * Rebuild a player from a saved record (after restart / resume).
   * The record is sanitized first (disk data is never trusted blindly);
   * derived stats are RECOMPUTED from base data (F14); equipment is applied
   * before the HP clamp so armor counts (F08); death state survives via the
   * absolute respawn timestamp (F09); item uids are scanned in inventory AND
   * equipment (F13). Cooldowns resume from absolute expiry timestamps so a
   * reconnect never resets them. Position is intentionally fresh (safe spawn).
   */
  restorePlayer(rec) {
    const r = sanitizeRecord(rec);
    const s = this.randomSpawn();
    const p = new Player(r.name, r.skinId, s.x, s.y, this.cfg, r.id);
    const now = Date.now();
    p.level = r.level;
    p.xp = r.xp; p.sp = r.sp;
    p.skills = r.skills;
    p.passives = r.passives;
    p.gold = r.gold;
    p.inv = r.inv;
    p.equip = r.equip; // equipment BEFORE the hp clamp (F08)
    p.maxHp = systems.baseMaxHp(this, p.level, p.passives.tough); // recomputed (F14)
    const eff = systems.effMaxHp(this, p);
    p.hp = Math.min(r.hp > 0 ? r.hp : eff, eff); // clamp to EFFECTIVE max (F08)
    p.quests = r.quests;
    p.questsDone = r.questsDone;
    // cooldowns: absolute expiry -> remaining seconds (expired ones are dropped)
    p.cds = {};
    for (const [k, exp] of Object.entries(r.cdsExpiresAt)) {
      if (typeof exp === 'number' && exp > now) p.cds[k] = (exp - now) / 1000;
    }
    p.potionCd = Math.max(0, (r.potionCdExpiresAt - now) / 1000);
    p.savedAt = r.savedAt;
    // F09: death survives restart/resume. The countdown is an absolute
    // timestamp, so it simply continues; an already-elapsed one respawns
    // cleanly at the safe spawn with full effective HP.
    p.dead = r.dead;
    p.respawnAt = r.respawnAt;
    if (p.dead) {
      if (p.respawnAt > now) p.hp = 0;
      else { p.dead = false; p.respawnAt = 0; p.hp = eff; }
    }
    // never reuse an item uid: scan inventory AND equipment (F13)
    for (const slot of [...p.inv, p.equip.weapon, p.equip.armor]) {
      const m = slot && /^i(\d+)$/.exec(slot.uid || '');
      if (m) this.nextItemId = Math.max(this.nextItemId, Number(m[1]) + 1);
    }
    this.players.set(p.id, p);
    this.bus.emit('player:join', p);
    return p;
  }

  /** Snapshot a player into a persistable record. */
  toRecord(p) {
    const now = Date.now();
    const cdsExpiresAt = {};
    for (const [k, v] of Object.entries(p.cds)) {
      if (v > 0) cdsExpiresAt[k] = now + v * 1000;
    }
    return {
      schemaVersion: 1,
      id: p.id,
      name: p.name, skinId: p.skinId,
      level: p.level, xp: p.xp, sp: p.sp,
      skills: [...p.skills], passives: { ...p.passives },
      gold: p.gold,
      maxHp: p.maxHp, hp: Math.ceil(p.hp),
      inv: p.inv.map((s) => (s ? { uid: s.uid, item: s.item, qty: s.qty } : null)),
      equip: {
        weapon: p.equip.weapon ? { ...p.equip.weapon } : null,
        armor: p.equip.armor ? { ...p.equip.armor } : null,
      },
      quests: JSON.parse(JSON.stringify(p.quests)),
      questsDone: [...p.questsDone],
      cdsExpiresAt,
      potionCdExpiresAt: now + Math.max(0, p.potionCd || 0) * 1000,
      dead: !!p.dead, // F09: death state persists; the countdown continues on resume
      respawnAt: p.respawnAt || 0,
      savedAt: now,
      lastSeen: now,
    };
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (p) {
      this.players.delete(id);
      // disconnect forfeits boss contribution for the current boss life
      for (const m of this.monsters) {
        if (m.dmgBy) delete m.dmgBy[id];
      }
      this.bus.emit('player:leave', p);
    }
  }

  addChat(name, text) {
    const m = { name, text };
    this.chatLog.push(m);
    if (this.chatLog.length > 30) this.chatLog.shift();
    this.bus.emit('chat', m);
    return m;
  }

  /** Drop a loot item on the ground (single pickup — removed once taken). */
  dropItem(item, x, y, amount) {
    const it = {
      id: this.nextItemId++,
      item,
      amount: amount || null, // F11: configured stack size rides with the item
      x: Math.round(x + (Math.random() * 40 - 20)),
      y: Math.round(y + (Math.random() * 40 - 20)),
      expiresAt: Date.now() + this.cfg.itemDespawnMs,
    };
    this.items.push(it);
    return it;
  }

  /**
   * Private per-player state, sent ONLY to the owning socket as `me`
   * in the state message (F12). Never broadcast.
   */
  playerSelf(p) {
    return p.serializeSelf(systems.effMaxHp(this, p), this.cfg.xpNeed(p.level));
  }

  snapshot() {
    return {
      // F12: public entity data only — inventory/quests/gold stay private.
      // maxHp here is EFFECTIVE (base + armor), which is what the HUD draws (F08).
      players: [...this.players.values()].map((p) =>
        p.serializePublic(systems.effMaxHp(this, p))),
      monsters: this.monsters.map((m) => m.serialize()),
      projectiles: this.projectiles.map((pr) => ({
        id: pr.id, x: Math.round(pr.x), y: Math.round(pr.y),
      })),
      items: this.items.map((i) => ({
        id: i.id, item: i.item, x: i.x, y: i.y,
        ...(i.amount != null ? { amount: i.amount } : {}),
      })),
      dmg: this.dmgEvents,
    };
  }
}

module.exports = { World };
