/**
 * Map renderer: draws a tile map (from shared/maps/*.json) once into
 * a single Graphics object. To add a new map, drop a JSON file in
 * shared/maps/ and point the server config at it — no code changes.
 */
const GROUND_COLORS = {
  grass: 0x2f6b3a,
  grass2: 0x357d43,
  path: 0x8a6f4d,
  water: 0x3b6ea5,
};

export function drawMap(scene, map) {
  const g = scene.add.graphics().setDepth(-10);
  const ts = map.tileSize;
  const rows = map.rows;

  for (let ty = 0; ty < rows.length; ty++) {
    for (let tx = 0; tx < rows[ty].length; tx++) {
      const tile = map.tiles[rows[ty][tx]];
      if (!tile) continue;
      const x = tx * ts, y = ty * ts;
      const base = GROUND_COLORS[tile.ground] ?? 0x2f6b3a;
      g.fillStyle(base, 1);
      g.fillRect(x, y, ts, ts);

      if (tile.ground === 'water') {
        g.fillStyle(0x4a86c8, 1); // lighter inner water
        g.fillRect(x + 5, y + 5, ts - 10, ts - 10);
      }
      if (tile.ground === 'path') {
        g.fillStyle(0x7a5f40, 1); // path edge shading
        g.fillRect(x, y + ts - 6, ts, 6);
      }

      // decor on top of the ground
      if (tile.decor === 'tree') {
        g.fillStyle(0x000000, 0.25);
        g.fillEllipse(x + ts / 2, y + ts - 6, 44, 14);
        g.fillStyle(0x5d4037, 1);
        g.fillRect(x + ts / 2 - 5, y + 12, 10, 24);
        g.fillStyle(0x2e7d32, 1);
        g.fillCircle(x + ts / 2, y + 14, 20);
        g.fillStyle(0x388e3c, 1);
        g.fillCircle(x + ts / 2 - 8, y + 6, 12);
      } else if (tile.decor === 'flower') {
        g.fillStyle(0x2e7d32, 1);
        g.fillRect(x + ts / 2 - 1, y + ts / 2, 2, 10);
        g.fillStyle(0xf48fb1, 1);
        g.fillCircle(x + ts / 2, y + ts / 2, 4);
        g.fillStyle(0xfff176, 1);
        g.fillCircle(x + ts / 2, y + ts / 2, 1.6);
      } else if (tile.decor === 'rock') {
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(x + ts / 2, y + ts / 2 + 8, 26, 8);
        g.fillStyle(0x78909c, 1);
        g.fillCircle(x + ts / 2, y + ts / 2, 11);
        g.fillStyle(0x90a4ae, 1);
        g.fillCircle(x + ts / 2 - 3, y + ts / 2 - 3, 6);
      }
    }
  }

  // world border
  const W = rows[0].length * ts, H = rows.length * ts;
  g.lineStyle(8, 0x1d4a24, 1);
  g.strokeRect(0, 0, W, H);
  return { w: W, h: H };
}
