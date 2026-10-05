'use strict';
// F03 regression: losing the welcome (with the rotated token) must not lock
// the player out — retrying the resume handshake with the OLD token works
// inside the grace window, and is rejected after it.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 18101;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-f03-'));
const ok = (cond, name) => { assert(cond, 'FAIL: ' + name); console.log('ok:', name); };

function resume(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'resume', token })));
    const timer = setTimeout(() => reject(new Error('resume timeout')), 5000);
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      if (m.t === 'welcome' || m.t === 'resume_failed') { clearTimeout(timer); resolve({ ws, m }); }
    });
    ws.on('error', () => {});
  });
}

(async () => {
  const srv = spawn('node', ['src/index.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT), DATA_DIR, TOKEN_GRACE_MS: '1500' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const dead = new Promise((res) => srv.on('exit', (c, s) => res({ c, s })));
  try {
    const t0 = Date.now();
    for (;;) {
      try {
        const r = await fetch(`http://localhost:${PORT}/api/health`);
        if (r.ok) break;
      } catch {}
      if (Date.now() - t0 > 10000) throw new Error('server boot timeout');
      await new Promise((r) => setTimeout(r, 100));
    }

    // join -> T1
    const t1 = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: 'Grace' })));
      ws.on('message', (d) => {
        const m = JSON.parse(d);
        if (m.t === 'welcome') { ws.close(); resolve(m.token); }
      });
      setTimeout(() => reject(new Error('join timeout')), 5000);
    });

    // resume #1 with T1 — server rotates, but we "lose" the welcome (keep T1)
    const r1 = await resume(t1);
    ok(r1.m.t === 'welcome', 'first resume succeeds');
    const id1 = r1.m.id;
    r1.ws.close(); // NOTE: we never store r1.m.token — simulating the lost welcome

    // retry the handshake with the OLD token: must be idempotent, not a lockout
    const r2 = await resume(t1);
    ok(r2.m.t === 'welcome', 'retry with old token succeeds (grace)');
    ok(r2.m.id === id1, 'same character recovered');
    r2.ws.close();

    // after the grace window the old token is dead
    await new Promise((r) => setTimeout(r, 2200));
    const r3 = await resume(t1);
    ok(r3.m.t === 'resume_failed', 'old token rejected after grace');
    r3.ws.close();

    console.log('\nF03 TEST PASS');
  } finally {
    srv.kill('SIGKILL');
    await dead;
  }
})().catch((e) => { console.error(e); process.exit(1); });
