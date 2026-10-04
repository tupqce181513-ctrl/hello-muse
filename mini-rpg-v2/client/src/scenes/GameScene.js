import Phaser from 'phaser';
import { drawMap } from '../terrain.js';
import { createBackground } from '../background.js';
import { createFX } from '../fx.js';
import { sfx } from '../audio.js';
import { PlayerView } from '../entities/PlayerView.js';
import { SlimeView } from '../entities/SlimeView.js';

/**
 * GameScene — owns world rendering + input. No simulation here:
 * the server is authoritative; this scene only mirrors snapshots.
 *
 * Graphics triggers (all client-side, driven by snapshot diffs):
 *   slime flash  -> hit sfx + spark burst
 *   my level up  -> levelup sfx + golden sparkles
 *   my death     -> death sfx + gray poof
 *   my attack    -> swing sfx
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  create() {
    this.net = this.registry.get('net');
    this.views = new Map(); // 'p<id>' | 's<id>' -> view
    this.prevFlash = new Map();
    this.prevLevel = null;
    this.prevDead = false;

    // The map arrives with 'welcome'; draw everything once we have it.
    if (this.net.map) this.buildWorld();
    else this.net.once('welcome', () => this.buildWorld());

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D,J');
    this.spaceKey = this.input.keyboard.addKey('SPACE');
    this.enterKey = this.input.keyboard.addKey('ENTER');

    this.net.on('state', () => this.sync());
    this.lastSent = { x: 9, y: 9 };
    this.lastSendAt = 0;
  }

  buildWorld() {
    const map = this.net.map;
    const ts = map.tileSize;
    this.worldSize = { w: map.rows[0].length * ts, h: map.rows.length * ts };

    this.fx = createFX(this);
    this.bg = createBackground(this, this.worldSize);
    drawMap(this, map);

    // Slight overscroll so the parallax backdrop shows at the edges.
    const M = 160;
    this.cameras.main.setBounds(-M, -M, this.worldSize.w + 2 * M, this.worldSize.h + 2 * M);
    this.worldBuilt = true;
  }

  /** Reconcile views with the latest server snapshot (+ fx/sfx triggers). */
  sync() {
    if (!this.worldBuilt) return;
    const seen = new Set();

    for (const p of this.net.players) {
      const key = 'p' + p.id;
      seen.add(key);
      let v = this.views.get(key);
      if (!v) {
        const isMe = p.id === this.net.myId;
        v = new PlayerView(this, p, isMe);
        this.views.set(key, v);
        if (isMe) this.cameras.main.startFollow(v, true, 0.12, 0.12);
      }
      v.update(p);
    }

    for (const s of this.net.slimes) {
      const key = 's' + s.id;
      if (s.dead) {
        const v = this.views.get(key);
        if (v) { v.destroy(); this.views.delete(key); }
        this.prevFlash.delete(s.id);
        continue;
      }
      seen.add(key);
      let v = this.views.get(key);
      if (!v) {
        v = new SlimeView(this, s);
        this.views.set(key, v);
      }
      v.update(s, this.time.now);

      const was = this.prevFlash.get(s.id) || false;
      if (s.flash && !was) {
        sfx.hit();
        this.fx.burst(s.x, s.y, 0xfff176);
      }
      this.prevFlash.set(s.id, s.flash);
    }

    for (const [key, v] of this.views) {
      if (!seen.has(key)) {
        v.destroy();
        this.views.delete(key);
      }
    }

    // hero event triggers
    const me = this.net.players.find((p) => p.id === this.net.myId);
    if (me) {
      if (this.prevLevel !== null && me.level > this.prevLevel) {
        sfx.levelup();
        this.fx.sparkle(me.x, me.y);
      }
      if (!this.prevDead && me.dead) {
        sfx.death();
        this.fx.poof(me.x, me.y);
      }
      this.prevLevel = me.level;
      this.prevDead = me.dead;
    }
  }

  update(time, delta) {
    if (this.bg) this.bg.update(delta / 1000);
    if (!this.net || this.net.myId == null) return;

    if (window.__isTyping && window.__isTyping()) {
      this.sendInput(0, 0); // stop moving while chatting
      return;
    }

    const c = this.cursors, w = this.wasd;
    let ix = (c.right.isDown || w.D.isDown ? 1 : 0) - (c.left.isDown || w.A.isDown ? 1 : 0);
    let iy = (c.down.isDown || w.S.isDown ? 1 : 0) - (c.up.isDown || w.W.isDown ? 1 : 0);
    const joy = window.__joy;
    if (joy && joy.active) { ix += joy.dx; iy += joy.dy; }
    const l = Math.hypot(ix, iy);
    if (l > 1) { ix /= l; iy /= l; }
    this.sendInput(ix, iy);

    if (
      Phaser.Input.Keyboard.JustDown(this.spaceKey) ||
      Phaser.Input.Keyboard.JustDown(w.J)
    ) {
      this.net.send({ t: 'attack' });
      sfx.swing();
    }
    if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
      window.__focusChat();
    }
  }

  sendInput(ix, iy) {
    const now = performance.now();
    ix = +ix.toFixed(2); iy = +iy.toFixed(2);
    if (ix !== this.lastSent.x || iy !== this.lastSent.y || now - this.lastSendAt > 120) {
      this.net.send({ t: 'input', x: ix, y: iy });
      this.lastSent = { x: ix, y: iy };
      this.lastSendAt = now;
    }
  }
}
