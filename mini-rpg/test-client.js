// Test script: simulates a player joining, moving and attacking.
// Run: node test-client.js   (server must be running on :8080)
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');
let gotState = false;
const fail = (msg) => { console.log('FAIL:', msg); process.exit(1); };

ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: 'Tester' })));
ws.on('error', (e) => fail('connection error: ' + e.message));
ws.on('message', (data) => {
  const m = JSON.parse(data);
  if (m.t === 'welcome') {
    console.log('welcome, id =', m.id, '| obstacles =', (m.obstacles || []).length);
    if (!m.obstacles || m.obstacles.length === 0) fail('no obstacles in welcome');
    ws.send(JSON.stringify({ t: 'input', x: 1, y: 0 }));
    ws.send(JSON.stringify({ t: 'chat', text: 'hello' }));
    setTimeout(() => ws.send(JSON.stringify({ t: 'attack' })), 300);
  }
  if (m.t === 'chat' && m.text === 'hello') console.log('chat echo ok');
  if (m.t === 'state' && !gotState) {
    gotState = true;
    const me = m.players.find((p) => p.name === 'Tester');
    console.log(`state: players=${m.players.length} slimes=${m.slimes.length} me.hp=${me && me.hp}`);
    if (!me) fail('player missing from state');
    if (m.slimes.length === 0) fail('no slimes in state');
    if (me.x <= 0) fail('player did not move');
    console.log('TEST PASS');
    setTimeout(() => process.exit(0), 300);
  }
});
setTimeout(() => fail('timeout waiting for state'), 8000);
