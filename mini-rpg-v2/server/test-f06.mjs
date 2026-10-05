// F06 regression: projectile views must be registered in the scene's shared
// `seen` set so the single cleanup pass keeps them alive across snapshots.
// Runs against the real syncProjectiles() used by GameScene (render adapter:
// a stub scene, no browser needed).
import assert from 'node:assert';
import { syncProjectiles } from '../client/src/entities/projectileSync.js';

let n = 0;
const ok = (cond, name) => { n++; assert(cond, 'FAIL: ' + name); console.log('ok:', name); };

// minimal render adapter: stub graphics with a destroy counter
function makeScene(projectiles) {
  const destroyed = [];
  const gfx = () => {
    const g = {
      x: 0, y: 0,
      fillStyle() { return g; }, fillCircle() { return g; }, setDepth() { return g; },
      setPosition(x, y) { g.x = x; g.y = y; },
      destroy() { destroyed.push(g); },
    };
    return g;
  };
  return {
    scene: { net: { projectiles }, views: new Map(), add: { graphics: gfx } },
    destroyed,
  };
}

// the exact repro from the finding: 1 server projectile -> sync -> view survives
{
  const { scene, destroyed } = makeScene([{ id: 7, x: 10, y: 20 }]);
  const seen = new Set();
  syncProjectiles(scene, seen);
  ok(scene.views.has('pr7'), 'projectile view created');
  ok(seen.has('pr7'), 'projectile key is in the shared seen set');
  ok(destroyed.length === 0, 'nothing destroyed on create');

  // simulate the scene's shared cleanup pass
  for (const [key, v] of scene.views) {
    if (!seen.has(key)) { v.destroy(); scene.views.delete(key); }
  }
  ok(scene.views.has('pr7'), 'projectile survives the cleanup pass');
  ok(destroyed.length === 0, 'destroy not called for a live projectile');
}

// second snapshot: same projectile -> view reused and moved, not recreated
{
  const { scene, destroyed } = makeScene([{ id: 7, x: 10, y: 20 }]);
  let seen = new Set();
  syncProjectiles(scene, seen);
  const v1 = scene.views.get('pr7');
  scene.net.projectiles = [{ id: 7, x: 60, y: 70 }];
  seen = new Set();
  syncProjectiles(scene, seen);
  ok(scene.views.get('pr7') === v1, 'view reused across snapshots');
  ok(v1.c.x === 60 && v1.c.y === 70, 'view moved to the new position');
  ok(destroyed.length === 0, 'no destroy on reuse');
}

// server removed the projectile -> the cleanup pass destroys it exactly once
{
  const { scene, destroyed } = makeScene([{ id: 7, x: 10, y: 20 }]);
  syncProjectiles(scene, new Set());
  scene.net.projectiles = [];
  const seen = new Set();
  syncProjectiles(scene, seen);
  for (const [key, v] of scene.views) {
    if (!seen.has(key)) { v.destroy(); scene.views.delete(key); }
  }
  ok(!scene.views.has('pr7'), 'gone projectile removed from views');
  ok(destroyed.length === 1, 'destroy called exactly once');
}

console.log(`\nALL ${n} F06 TESTS PASS`);
