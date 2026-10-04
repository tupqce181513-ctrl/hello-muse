import Phaser from 'phaser';

const hex = (s) => Phaser.Display.Color.HexStringToColor(s).color;

const ITEM_COLORS = {
  slime_shard: '#69f0ae',
  gold: '#ffd54f',
  potion: '#ef5350',
  sword_iron: '#90a4ae',
  armor_leather: '#8d6e3f',
  kings_blade: '#ffd54f',
};

/**
 * ItemView — small bobbing loot diamond on the ground.
 * Color-coded per item type (matches server config).
 */
export class ItemView extends Phaser.GameObjects.Container {
  constructor(scene, it) {
    super(scene, it.x, it.y);
    scene.add.existing(this);
    this.itemId = it.id;
    this.baseY = it.y;
    const color = hex(ITEM_COLORS[it.item] || '#ffffff');
    const d = scene.add.graphics();
    d.fillStyle(0x000000, 0.25);
    d.fillEllipse(0, 10, 20, 8);
    d.fillStyle(color, 1);
    d.fillPoints([
      new Phaser.Geom.Point(0, -10), new Phaser.Geom.Point(8, 0),
      new Phaser.Geom.Point(0, 10), new Phaser.Geom.Point(-8, 0),
    ], true);
    d.lineStyle(2, 0xffffff, 0.8);
    d.strokePoints([
      new Phaser.Geom.Point(0, -10), new Phaser.Geom.Point(8, 0),
      new Phaser.Geom.Point(0, 10), new Phaser.Geom.Point(-8, 0),
    ], true);
    this.add(d);
    this.setDepth(6);
  }

  frame(time) {
    this.y = this.baseY + Math.sin(time / 350 + this.itemId) * 4;
  }
}
