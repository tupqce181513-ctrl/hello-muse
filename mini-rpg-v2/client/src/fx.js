/**
 * Particle FX. Add new effects here and trigger them from GameScene
 * when game events happen (hits, level-ups, deaths...).
 */
import Phaser from 'phaser';
export function createFX(scene) {
  // 1x1 white dot texture, tinted per effect
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0xffffff, 1);
  g.fillCircle(8, 8, 8);
  g.generateTexture('fx-dot', 16, 16);
  g.destroy();

  const mk = (cfg) =>
    scene.add.particles(0, 0, 'fx-dot', { ...cfg, emitting: false }).setDepth(30);

  // Particle budgets are capped (maxParticles) so 20 players spamming
  // skills can't tank the frame rate. Numbers below were chosen, not measured —
  // no FPS claim is made here; measure on target devices before tuning.
  const hitE = mk({
    speed: { min: 60, max: 240 }, lifespan: 380,
    scale: { start: 1, end: 0 }, quantity: 10, maxParticles: 120,
  });
  const levelE = mk({
    speed: { min: 40, max: 130 }, lifespan: 900,
    scale: { start: 1.1, end: 0 }, quantity: 18, maxParticles: 160,
    emitZone: { source: new Phaser.Geom.Circle(0, 0, 24) },
  });
  const poofE = mk({
    speed: { min: 20, max: 90 }, lifespan: 700,
    scale: { start: 1.4, end: 0 }, quantity: 12, maxParticles: 80,
  });

  return {
    /** white spark burst, e.g. weapon connecting */
    burst(x, y, tint = 0xffffff) {
      hitE.setParticleTint(tint);
      hitE.explode(10, x, y);
    },
    /** golden rising sparkles, e.g. level up */
    sparkle(x, y) {
      levelE.setParticleTint(0xffd54f);
      levelE.explode(18, x, y - 10);
    },
    /** gray poof, e.g. death */
    poof(x, y) {
      poofE.setParticleTint(0x9e9e9e);
      poofE.explode(12, x, y);
    },
    /** white-blue streaks, e.g. dash */
    dashFx(x, y) {
      hitE.setParticleTint(0xbbdefb);
      hitE.explode(12, x, y);
    },
    /** expanding ring burst, e.g. whirlwind */
    whirlwindFx(x, y) {
      levelE.setParticleTint(0x80d8ff);
      levelE.explode(26, x, y);
    },
    /** green rising sparkles, e.g. heal */
    healFx(x, y) {
      levelE.setParticleTint(0x69f0ae);
      levelE.explode(16, x, y - 6);
    },
  };
}
