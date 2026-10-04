/**
 * Static terrain painter: grass base, patch variation, world border, trees.
 * Drawn once into a Graphics object — cheap, no per-frame cost.
 */
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function drawTerrain(scene, world, obstacles) {
  const g = scene.add.graphics().setDepth(-10);

  g.fillStyle(0x2f6b3a, 1);
  g.fillRect(0, 0, world.w, world.h);

  const T = 80;
  for (let tx = 0; tx < world.w / T; tx++) {
    for (let ty = 0; ty < world.h / T; ty++) {
      const h = hash(tx, ty);
      if (h < 0.22) {
        g.fillStyle(h < 0.11 ? 0x2a6134 : 0x377d43, 1);
        g.fillRect(tx * T, ty * T, T, T);
      }
    }
  }

  g.lineStyle(10, 0x1d4a24, 1);
  g.strokeRect(0, 0, world.w, world.h);

  for (const o of obstacles) {
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(o.x, o.y + 22, 52, 18);
    g.fillStyle(0x5d4037, 1);
    g.fillRect(o.x - 6, o.y - 6, 12, 30);
    g.fillStyle(0x2e7d32, 1);
    g.fillCircle(o.x, o.y - 18, 26);
    g.fillStyle(0x388e3c, 1);
    g.fillCircle(o.x - 10, o.y - 28, 16);
  }
}
