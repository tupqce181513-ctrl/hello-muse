/**
 * GoblinView — melee goblin: green humanoid with angry eyes, club, and a
 * red telegraph circle when winding up its heavy lunge.
 */
export default class GoblinView {
  constructor(scene, s) {
    this.scene = scene;
    this.c = scene.add.container(s.x, s.y).setDepth(6);
    const g = scene.add.graphics();
    // body
    g.fillStyle(0x2e7d32, 1).fillEllipse(0, 0, 26, 32);
    g.fillStyle(0x388e3c, 1).fillEllipse(0, -4, 20, 22);
    // ears
    g.fillStyle(0x2e7d32, 1).fillTriangle(-12, -10, -24, -16, -12, -4);
    g.fillTriangle(12, -10, 24, -16, 12, -4);
    // angry eyes
    g.fillStyle(0xffeb3b, 1).fillCircle(-6, -8, 3).fillCircle(6, -8, 3);
    g.fillStyle(0x000000, 1).fillCircle(-6, -8, 1.2).fillCircle(6, -8, 1.2);
    // club
    g.fillStyle(0x6d4c41, 1).fillRect(10, -6, 16, 5).fillCircle(26, -3, 5);
    this.body = g;
    this.c.add(g);
    this.hp = scene.add.graphics();
    this.c.add(this.hp);
    this.teleGfx = scene.add.graphics();
    this.c.add(this.teleGfx);
    this.flash = 0;
  }
  update(s) {
    this.c.setPosition(s.x, s.y);
    this.body.setAlpha(s.flash ? 0.6 : 1);
    this.hp.clear();
    if (s.hp < s.maxHp) {
      this.hp.fillStyle(0x000000, 0.6).fillRect(-16, -30, 32, 5);
      this.hp.fillStyle(0xe53935, 1).fillRect(-16, -30, 32 * Math.max(0, s.hp / s.maxHp), 5);
    }
    this.teleGfx.clear();
    if (s.tele) {
      const lx = s.tele.x - s.x, ly = s.tele.y - s.y;
      const pulse = 0.35 + 0.25 * Math.sin(Date.now() / 90);
      this.teleGfx.lineStyle(3, 0xff1744, 0.9).strokeCircle(lx, ly, s.tele.r);
      this.teleGfx.fillStyle(0xff1744, pulse).fillCircle(lx, ly, s.tele.r);
    }
  }
  destroy() { this.c.destroy(true); }
}
