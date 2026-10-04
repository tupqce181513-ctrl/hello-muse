/**
 * Parallax background + ambient life.
 *
 * Layers (all positioned around the world, camera overscrolls the edges):
 *   - dark base filling the overscroll margin
 *   - mountain ridge (scrollFactor 0.55) along the top
 *   - far tree silhouettes (scrollFactor 0.8) in the margins
 *   - drifting clouds (scrollFactor 0.65)
 *   - fireflies (ambient particles over the world)
 *
 * Call update(dt) every frame for the clouds.
 */
function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createBackground(scene, world) {
  const W = world.w, H = world.h, M = 180;
  const rnd = mulberry(1234);

  // dark base under everything (visible in the overscroll margin)
  const base = scene.add.graphics().setDepth(-30);
  base.fillStyle(0x14291c, 1);
  base.fillRect(-M, -M, W + 2 * M, H + 2 * M);

  // mountain ridge along the top (parallax)
  const mts = scene.add.container(0, 0).setDepth(-25).setScrollFactor(0.55);
  const g = scene.add.graphics();
  g.fillStyle(0x2c4a38, 1);
  g.beginPath();
  g.moveTo(-M, 60);
  let x = -M;
  while (x < W + M) {
    const peakX = x + 90 + rnd() * 130;
    const peakY = -50 - rnd() * 100;
    g.lineTo(peakX, peakY);
    x = peakX + 70 + rnd() * 110;
    g.lineTo(x, 20 + rnd() * 40);
  }
  g.lineTo(W + M, 80);
  g.lineTo(W + M, -M);
  g.lineTo(-M, -M);
  g.closePath();
  g.fillPath();
  // snow caps
  g.fillStyle(0xdfe8e4, 0.85);
  for (let i = 0; i < 8; i++) {
    const cx = -M + rnd() * (W + 2 * M);
    g.fillTriangle(cx - 26, -58, cx + 26, -58, cx, -108);
  }
  mts.add(g);

  // far tree silhouettes in the margins (parallax)
  const trees = scene.add.container(0, 0).setDepth(-22).setScrollFactor(0.8);
  const t2 = scene.add.graphics();
  t2.fillStyle(0x1e3a28, 1);
  for (let i = 0; i < 44; i++) {
    const top = rnd() < 0.5;
    const tx = -M + rnd() * (W + 2 * M);
    const ty = top ? -M + rnd() * 110 : H + 10 + rnd() * 90;
    const s = 22 + rnd() * 34;
    t2.fillTriangle(tx - s / 2, ty, tx + s / 2, ty, tx, ty - s);
  }
  for (let i = 0; i < 26; i++) {
    const left = rnd() < 0.5;
    const tx = left ? -M + rnd() * 130 : W + 50 + rnd() * 110;
    const ty = rnd() * H;
    const s = 22 + rnd() * 34;
    t2.fillTriangle(tx - s / 2, ty, tx + s / 2, ty, tx, ty - s);
  }
  trees.add(t2);

  // drifting clouds (parallax)
  const clouds = [];
  const ctn = scene.add.container(0, 0).setDepth(-24).setScrollFactor(0.65);
  for (let i = 0; i < 7; i++) {
    const cl = scene.add.ellipse(
      -200 + rnd() * (W + 400), -100 + rnd() * 220,
      180 + rnd() * 130, 40 + rnd() * 26, 0xffffff, 0.14
    );
    ctn.add(cl);
    clouds.push({ obj: cl, sp: 5 + rnd() * 9 });
  }

  // fireflies drifting over the world (ambient)
  const fg = scene.make.graphics({ x: 0, y: 0, add: false });
  fg.fillStyle(0xffffff, 1);
  fg.fillCircle(4, 4, 4);
  fg.generateTexture('bg-dot', 8, 8);
  fg.destroy();
  scene.add.particles(0, 0, 'bg-dot', {
    x: { min: 0, max: W },
    y: { min: 0, max: H },
    lifespan: 5000,
    speedY: { min: -12, max: -30 },
    speedX: { min: -15, max: 15 },
    scale: { min: 0.25, max: 0.6 },
    alpha: { start: 0.9, end: 0 },
    frequency: 350,
    tint: 0xfff59d,
  }).setDepth(25);

  return {
    update(dt) {
      for (const c of clouds) {
        c.obj.x += c.sp * dt;
        if (c.obj.x > W + 500) c.obj.x = -500;
      }
    },
  };
}
