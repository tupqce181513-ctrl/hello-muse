import Phaser from 'phaser';

/** SlimeView — bouncing blob with eyes and a damage HP bar. Pure view. */
export class SlimeView extends Phaser.GameObjects.Container {
  constructor(scene, s) {
    super(scene, s.x, s.y);
    scene.add.existing(this);
    this.sid = s.id;
    this.add(scene.add.ellipse(0, 10, 32, 12, 0x000000, 0.25)); // shadow
    this.body = scene.add.ellipse(0, 0, 32, 24, 0x66bb6a);
    this.e1 = scene.add.circle(-5, -2, 2.6, 0x1b5e20);
    this.e2 = scene.add.circle(5, -2, 2.6, 0x1b5e20);
    this.hpBar = scene.add.graphics();
    this.add([this.body, this.e1, this.e2, this.hpBar]);
    this.setDepth(5);
  }

  update(s, time) {
    this.setPosition(s.x, s.y);
    const bounce = Math.sin(time / 300 + this.sid) * 2;
    this.body.setPosition(0, bounce);
    this.e1.setPosition(-5, -2 + bounce);
    this.e2.setPosition(5, -2 + bounce);
    this.body.setFillStyle(s.flash ? 0xeaffea : 0x66bb6a);

    this.hpBar.clear();
    if (s.hp < s.maxHp) {
      const f = Math.max(0, s.hp / s.maxHp);
      this.hpBar.fillStyle(0x000000, 0.6);
      this.hpBar.fillRect(-17, -26, 34, 6);
      this.hpBar.fillStyle(0x4caf50, 1);
      this.hpBar.fillRect(-16, -25, 32 * f, 4);
    }
  }
}
