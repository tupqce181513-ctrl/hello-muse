'use strict';
// F02 regression: an oversized WebSocket payload must kill ONLY that
// connection — the server process and every other client must survive.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 18099;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-f02-'));

const ok = (cond, name) => { assert(cond, 'FAIL: ' + name); console.log('ok:', name); };
const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch { /* retry */ }
    if (Date.now() - t0 > ms) throw new Error('timeout: ' + what);
    await new Promise((r) => setTimeout(r, 100));
  }
};

(async () => {
  const srv = spawn('node', ['src/index.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT), DATA_DIR },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  srv.stdout.on('data', (d) => { serverLog += d; });
  srv.stderr.on('data', (d) => { serverLog += d; });
  const dead = new Promise((res) => srv.on('exit', (code, sig) => res({ code, sig })));
  try {
    // wait for the server to come up
    await waitFor(async () => {
      const r = await fetch(`http://localhost:${PORT}/api/health`);
      return r.ok;
    }, 10000, 'server boot');

    // client A: a normal player that must survive the whole test
    const a = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((res, rej) => {
      a.on('open', () => a.send(JSON.stringify({ t: 'join', name: 'Survivor' })));
      a.on('message', (d) => { if (JSON.parse(d).t === 'welcome') res(); });
      setTimeout(() => rej(new Error('A join timeout')), 5000);
    });
    let aStates = 0;
    a.on('message', (d) => { if (JSON.parse(d).t === 'state') aStates++; });

    // client B: sends a 17 KiB payload (limit is 16 KiB)
    const b = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((res) => b.on('open', res));
    const bClosed = new Promise((res) => {
      b.on('close', res);
      b.on('error', () => {}); // the client side also sees an error; swallow it
    });
    b.send('x'.repeat(17 * 1024));
    await Promise.race([
      bClosed,
      new Promise((_, rej) => setTimeout(() => rej(new Error('B was not dropped')), 5000)),
    ]);
    ok(true, 'oversized sender connection dropped');

    // the server process must still be alive...
    const stillAlive = await Promise.race([
      dead.then(() => false),
      new Promise((res) => setTimeout(() => res(true), 1500)),
    ]);
    ok(stillAlive, 'server process survives the oversized payload');

    // ...and client A must keep receiving snapshots
    const before = aStates;
    await new Promise((r) => setTimeout(r, 1200));
    ok(aStates > before, `surviving client keeps getting state (${before} -> ${aStates})`);

    // health endpoint still answers
    const r = await fetch(`http://localhost:${PORT}/api/health`);
    ok(r.ok, 'health endpoint alive after the attack');
    a.close();
    console.log('\nF02 TEST PASS');
  } finally {
    srv.kill('SIGKILL');
  }
})().catch((e) => { console.error(e); process.exit(1); });
