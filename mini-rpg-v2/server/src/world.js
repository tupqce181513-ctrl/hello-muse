'use strict';
/**
 * World — owns all game state and emits game events on `bus`.
 * The tile map is loaded from ../shared/maps/ and drives both
 * collision (server) and rendering (client receives it in 'welcome').
 */
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { Player, Slime } = require('./entities');

const rand = (a, b) => a + Math.random() * (b - a);

class World {
  constructor(config) {
    this.cfg = config;
    this.bus = new EventEmitter();
    this.players = new Map(); // id -> Player
    this.slimes = [];
    this.chatLog = [];

    // Load the shared tile map (same file the client renders)
    const mapPath = path.join(__dirname, '..', '..', 'shared', 'maps', config.mapFile);
    this.map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    this.ts = this.map.tileSize;
    this.worldW = this.map.rows[0].length * this.ts;
    this.worldH = this.map.rows.length * this.ts;

    for (let i = 0; i < config.slime.count; i++) {
      this.slimes.push(this.makeSlime());
    }
  }

  /** Tile solid? Out of bounds counts as solid (invisible walls). */
  isSolidTile(tx, ty) {
    const rows = this.map.rows;
    if (ty < 0 || ty >= rows.length || tx < 0 || tx >= rows[0].length) return true;
    const tile = this.map.tiles[rows[ty][tx]];
    return !!(tile && tile.solid);
  }

  randomSpawn() {
    const pts = this.map.spawnPoints;
    const p = pts[Math.floor(Math.random() * pts.length)];
    return { x: p.x + rand(-30, 30), y: p.y + rand(-30, 30) };
  }

  randomPoint(margin = 120) {
    // random walkable point (used for slimes)
    for (let i = 0; i < 50; i++) {
      const x = rand(margin, this.worldW - margin);
      const y = rand(margin, this.worldH - margin);
      if (!this.isSolidTile(Math.floor(x / this.ts), Math.floor(y / this.ts))) {
        return { x, y };
      }
    }
    return { x: this.worldW / 2, y: this.worldH / 2 };
  }

  makeSlime() {
    const p = this.randomPoint();
    return new Slime(p.x, p.y, this.cfg);
  }

  addPlayer(name, skinId) {
    const s = this.randomSpawn();
    const p = new Player(name, skinId, s.x, s.y, this.cfg);
    this.players.set(p.id, p);
    this.bus.emit('player:join', p);
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (p) {
      this.players.delete(id);
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

  snapshot() {
    return {
      players: [...this.players.values()].map((p) => p.serialize()),
      slimes: this.slimes.map((s) => s.serialize()),
    };
  }
}

module.exports = { World };
