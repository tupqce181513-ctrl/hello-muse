/**
 * SlimeKingView — the boss: giant slime with a golden crown.
 * Shows a red telegraph circle when winding up its AoE slam.
 */
export default class SlimeKingView {
  constructor(scene, s) {
    this.scene = scene;
    this.c = scene.add.container(s.x, s.y).setDepth(6);
    const g = scene.add.graphics();
    // big slime body
    g.fillStyle(0x29b6f6, 0.95).fillEllipse(0, 0, 76, 64);
    g.fillStyle(0x81d4fa, 0.9).fillEllipse(-14, -10, 30, 24);
    // eyes
    g.fillStyle(0xffffff, 1).fillCircle(-14, -12, 9).fillCircle(14, -12, 9);
    g.fillStyle(0x0d47a1, 1).fillCircle(-14, -10, 4).fillCircle(14, -10, 4);
    // mouth
    g.lineStyle(3, 0x0d47a1, 1).beginPath().arc(0, 8, 12, 0.15 * Math.PI, 0.85 * Math.PI).strokePath();
    // crown
    g.fillStyle(0xffd54f, 1).fillTriangle(-20, -30, -12, -52, -4, -30);
    g.fillTriangle(-4, -30, 4, -56, 12, -30);
    g.fillTriangle(12, -30, 20, -52, 20, -30);
    g.fillRect(-20, -32, 40, 6);
    g.fillStyle(0xe53935, 1).fillCircle(0, -29, 3);
    this.body = g;
    this.c.add(g);
    this.hp = scene.add.graphics();
    this.c.add(this.hp);
    this.teleGfx = scene.add.graphics();
    this.c.add(this.teleGfx);
  }
  update(s) {
    this.c.setPosition(s.x, s.y);
    this.body.setAlpha(s.flash ? 0.6 : 1);
    this.hp.clear();
    if (s.hp < s.maxHp) {
      this.hp.fillStyle(0x000000, 0.6).fillRect(-40, -62, 80, 7);
      this.hp.fillStyle(0xffb300, 1).fillRect(-40, -62, 80 * Math.max(0, s.hp / s.maxHp), 7);
    }
    this.teleGfx.clear();
    if (s.tele) {
      const lx = s.tele.x - s.x, ly = s.tele.y - s.y;
      const pulse = 0.3 + 0.25 * Math.sin(Date.now() / 80);
      this.teleGfx.lineStyle(4, 0xff1744, 0.95).strokeCircle(lx, ly, s.tele.r);
      this.teleGfx.fillStyle(0xff1744, pulse).fillCircle(lx, ly, s.tele.r);
    }
  }
  destroy() { this.c.destroy(true); }
}
