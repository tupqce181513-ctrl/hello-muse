'use strict';
/**
 * World — owns all game state and emits game events on `bus`.
 * Listen on world.bus to extend behavior without touching the loop:
 *   world.bus.on('slime:killed', (slime, killer) => { ... })
 * Events: player:join | player:leave | player:death | player:respawn |
 *         player:levelup | slime:killed | chat
 */
const { EventEmitter } = require('events');
const { Player, Slime } = require('./entities');

const rand = (a, b) => a + Math.random() * (b - a);

class World {
  constructor(config) {
    this.cfg = config;
    this.bus = new EventEmitter();
    this.players = new Map(); // id -> Player
    this.slimes = [];
    this.obstacles = config.obstacles;
    this.chatLog = [];
    for (let i = 0; i < config.slime.count; i++) {
      this.slimes.push(this.makeSlime());
    }
  }

  makeSlime() {
    const c = this.cfg;
    return new Slime(rand(120, c.world.w - 120), rand(120, c.world.h - 120), c);
  }

  addPlayer(name) {
    const p = new Player(name, rand(200, 400), rand(200, 400), this.cfg);
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
