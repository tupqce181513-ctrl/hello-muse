/**
 * syncProjectiles — reconcile wisp projectile views with the server snapshot.
 * Pure (no Phaser import): takes a scene-like { net, views, add } and the
 * shared `seen` set. Projectile keys MUST go into `seen` so the scene's
 * single cleanup pass keeps them alive across snapshots (F06).
 */
export function syncProjectiles(scene, seen) {
  for (const pr of scene.net.projectiles || []) {
    const key = 'pr' + pr.id;
    seen.add(key);
    let v = scene.views.get(key);
    if (!v) {
      const g = scene.add.graphics();
      g.fillStyle(0x9c27b0, 0.35).fillCircle(0, 0, 12);
      g.fillStyle(0xce93d8, 1).fillCircle(0, 0, 7);
      g.setDepth(7);
      v = { c: g, update: (p) => g.setPosition(p.x, p.y), destroy: () => g.destroy() };
      scene.views.set(key, v);
    }
    v.update(pr);
  }
}
