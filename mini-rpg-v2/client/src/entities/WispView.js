/**
 * WispView — ranged monster: floating purple orb with glow, fires projectiles.
 */
export default class WispView {
  constructor(scene, s) {
    this.scene = scene;
    this.c = scene.add.container(s.x, s.y).setDepth(6);
    const g = scene.add.graphics();
    // glow
    g.fillStyle(0x9c27b0, 0.25).fillCircle(0, 0, 24);
    // core
    g.fillStyle(0x7b1fa2, 1).fillCircle(0, 0, 13);
    g.fillStyle(0xce93d8, 1).fillCircle(0, -3, 8);
    // eyes
    g.fillStyle(0xffffff, 1).fillCircle(-4, -2, 2.5).fillCircle(4, -2, 2.5);
    g.fillStyle(0x4a148c, 1).fillCircle(-4, -2, 1).fillCircle(4, -2, 1);
    this.body = g;
    this.c.add(g);
    this.hp = scene.add.graphics();
    this.c.add(this.hp);
    this.t = Math.random() * 10;
  }
  update(s, dt = 0.016) {
    this.t += dt;
    // float bob
    this.c.setPosition(s.x, s.y + Math.sin(this.t * 3) * 5);
    this.body.setAlpha(s.flash ? 0.6 : 1);
    this.hp.clear();
    if (s.hp < s.maxHp) {
      this.hp.fillStyle(0x000000, 0.6).fillRect(-14, -28, 28, 5);
      this.hp.fillStyle(0xab47bc, 1).fillRect(-14, -28, 28 * Math.max(0, s.hp / s.maxHp), 5);
    }
  }
  destroy() { this.c.destroy(true); }
}
