import Phaser from 'phaser';

const hex = (s) => Phaser.Display.Color.HexStringToColor(s).color;

/**
 * NpcView — static guide NPC: robe, name label, quest marker.
 * setMarker('!') when the player has an available/ready quest here,
 * setMarker('?') when a quest is in progress, null otherwise.
 * Prompt "[E]" appears when the hero is in range.
 */
export class NpcView extends Phaser.GameObjects.Container {
  constructor(scene, npc) {
    super(scene, npc.x, npc.y);
    scene.add.existing(this);
    this.npcId = npc.id;

    this.add(scene.add.ellipse(0, 16, 30, 12, 0x000000, 0.3)); // shadow
    this.add(scene.add.circle(0, 2, 15, hex('#6d4c41')));       // robe
    this.add(scene.add.circle(0, -12, 9, hex('#ffcc99')));     // head
    this.add(scene.add.ellipse(0, -14, 20, 8, hex('#4e342e'))); // hood
    this.add(scene.add.text(0, -34, npc.icon || '🧙', { fontSize: '20px' }).setOrigin(0.5));
    this.add(scene.add.text(0, -50, npc.name, {
      fontSize: '12px', color: '#ffe082',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    this.marker = scene.add.text(0, -70, '', {
      fontSize: '22px', color: '#ffd54f',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);
    this.prompt = scene.add.text(0, -92, '[E]', {
      fontSize: '14px', color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,.6)', padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setVisible(false);
    this.add([this.marker, this.prompt]);
    this.setDepth(8);
  }

  setMarker(kind) {
    this.marker.setText(kind === '!' ? '❗' : kind === '?' ? '❔' : '');
  }

  setPrompt(visible) {
    this.prompt.setVisible(visible);
  }

  /** Gentle bob for the marker. */
  frame(time) {
    if (this.marker.text) {
      this.marker.y = -70 + Math.sin(time / 400) * 3;
    }
  }
}
