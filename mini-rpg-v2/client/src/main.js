import Phaser from 'phaser';
import { Net } from './net.js';
import { GameScene } from './scenes/GameScene.js';
import { initUI } from './ui.js';

/**
 * Client entry: network manager + DOM UI + Phaser game.
 * The Net instance is shared via the Phaser registry so any
 * scene (or future menu/inventory scene) can reach it.
 */
const net = new Net();
initUI(net);

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#2f6b3a',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  render: { antialias: true },
  scene: [GameScene],
};

const game = new Phaser.Game(config);
game.registry.set('net', net);
net.connect();
