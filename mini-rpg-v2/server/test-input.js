// Test analog input: magnitude affects speed, diagonals capped at 1x.
// Run: node test-input.js (server must be running)
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');
const fail = (msg) => { console.log('FAIL:', msg); process.exit(1); };
let joined = false;
let myX = 0, myY = 0;

ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: 'InputTester' })));
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.t === 'welcome') joined = true;
  if (m.t === 'state' && joined) {
    const me = m.players.find((p) => p.name === 'InputTester');
    if (me) { myX = me.x; myY = me.y; }
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const input = (x, y) => ws.send(JSON.stringify({ t: 'input', x, y }));

(async () => {
  while (!joined) await sleep(100);
  await sleep(200);

  // full speed right
  const x0 = myX;
  input(1, 0); await sleep(700);
  const dFull = myX - x0;
  input(0, 0); await sleep(300);

  // quarter speed right
  const x1 = myX;
  input(0.25, 0); await sleep(700);
  const dQuarter = myX - x1;
  input(0, 0); await sleep(300);

  // diagonal at magnitude 1
  const dx0 = myX, dy0 = myY;
  input(0.7071, 0.7071); await sleep(700);
  const dDiag = Math.hypot(myX - dx0, myY - dy0);
  input(0, 0);

  console.log(`full=${dFull.toFixed(0)}px quarter=${dQuarter.toFixed(0)}px diag=${dDiag.toFixed(0)}px`);
  if (dFull < 50) fail('player did not move at full input');
  const ratio = dQuarter / dFull;
  if (!(ratio > 0.1 && ratio < 0.5)) fail(`quarter input should be ~0.25x, got ${ratio.toFixed(2)}x`);
  const diagRatio = dDiag / dFull;
  if (!(diagRatio > 0.8 && diagRatio < 1.2)) fail(`diagonal should be ~1x, got ${diagRatio.toFixed(2)}x`);
  console.log('INPUT TEST PASS');
  process.exit(0);
})();
setTimeout(() => fail('timeout'), 15000);
