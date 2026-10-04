import Phaser from 'phaser';
import { drawTerrain } from '../terrain.js';
import { PlayerView } from '../entities/PlayerView.js';
import { SlimeView } from '../entities/SlimeView.js';

const WORLD = { w: 1600, h: 1200 };

/**
 * GameScene — owns world rendering + input. No simulation here:
 * the server is authoritative; this scene only mirrors snapshots.
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  create() {
    this.net = this.registry.get('net');
    this.views = new Map(); // 'p<id>' | 's<id>' -> view

    drawTerrain(this, WORLD, this.net.obstacles);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD.w, WORLD.h);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D,J');
    this.spaceKey = this.input.keyboard.addKey('SPACE');
    this.enterKey = this.input.keyboard.addKey('ENTER');

    this.net.on('state', () => this.sync());
    this.lastSent = { x: 9, y: 9 };
    this.lastSendAt = 0;
  }

  /** Reconcile views with the latest server snapshot. */
  sync() {
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
        continue;
      }
      seen.add(key);
      let v = this.views.get(key);
      if (!v) {
        v = new SlimeView(this, s);
        this.views.set(key, v);
      }
      v.update(s, this.time.now);
    }

    for (const [key, v] of this.views) {
      if (!seen.has(key)) {
        v.destroy();
        this.views.delete(key);
      }
    }
  }

  update() {
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
