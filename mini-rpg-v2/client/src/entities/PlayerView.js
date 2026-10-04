import Phaser from 'phaser';

const hex = (s) => Phaser.Display.Color.HexStringToColor(s).color;

/**
 * PlayerView — a Container holding body, eyes, name and HP bar.
 * Pure view: update(viewData) every server snapshot, no game logic here.
 */
export class PlayerView extends Phaser.GameObjects.Container {
  constructor(scene, p, isMe) {
    super(scene, p.x, p.y);
    scene.add.existing(this);
    this.isMe = isMe;

    this.add(scene.add.ellipse(0, 14, 28, 12, 0x000000, 0.3)); // shadow
    this.body = scene.add.circle(0, 0, 16, hex(p.color));
    this.body.setStrokeStyle(2, 0x000000, 0.4);
    this.nose = scene.add.circle(0, 0, 5, 0x000000, 0.45);
    this.eye1 = scene.add.circle(0, 0, 2.4, 0xffffff);
    this.eye2 = scene.add.circle(0, 0, 2.4, 0xffffff);
    this.nameText = scene.add
      .text(0, -36, '', { fontSize: '12px', color: '#ffffff' })
      .setOrigin(0.5);
    this.hpBar = scene.add.graphics();
    this.arc = scene.add.graphics();
    this.add([this.body, this.nose, this.eye1, this.eye2, this.nameText, this.hpBar, this.arc]);
    this.setDepth(10);
    this.update(p);
  }

  update(p) {
    this.setPosition(p.x, p.y);
    this.setAlpha(p.dead ? 0.35 : 1);

    const ex = -p.fy, ey = p.fx;
    this.nose.setPosition(p.fx * 11, p.fy * 11);
    this.eye1.setPosition(p.fx * 6 + ex * 6, p.fy * 6 + ey * 6);
    this.eye2.setPosition(p.fx * 6 - ex * 6, p.fy * 6 - ey * 6);
    this.nameText.setText((this.isMe ? '⭐ ' : '') + p.name + ' Lv' + p.level);

    const frac = Math.max(0, p.hp / p.maxHp);
    const col = frac > 0.5 ? 0x4caf50 : frac > 0.25 ? 0xffb300 : 0xe53935;
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.6);
    this.hpBar.fillRect(-21, -29, 42, 6);
    this.hpBar.fillStyle(col, 1);
    this.hpBar.fillRect(-20, -28, 40 * frac, 4);

    this.arc.clear();
    if (p.atkAnim > 0) {
      const a = Math.atan2(p.fy, p.fx);
      this.arc.lineStyle(7, 0xffffff, 0.95);
      this.arc.beginPath();
      this.arc.arc(0, 0, 32, a - 1, a + 1);
      this.arc.strokePath();
    }
  }
}
