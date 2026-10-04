// Test script: simulates a player joining (with skin), moving, attacking, chatting.
// Run: node test-client.js   (server must be running)
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');
let gotState = false;
let joined = false; // only evaluate snapshots after our join is acknowledged
const fail = (msg) => { console.log('FAIL:', msg); process.exit(1); };

ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: 'Tester', skin: 'azure' })));
ws.on('error', (e) => fail('connection error: ' + e.message));
ws.on('message', (data) => {
  const m = JSON.parse(data);
  if (m.t === 'welcome') {
    joined = true;
    console.log('welcome, id =', m.id, '| map =', m.map && m.map.name,
      '| tiles =', m.map && (m.map.rows.length + 'x' + m.map.rows[0].length));
    if (!m.map || !m.map.rows) fail('no map in welcome');
    ws.send(JSON.stringify({ t: 'input', x: 1, y: 0 }));
    ws.send(JSON.stringify({ t: 'chat', text: 'hello' }));
    setTimeout(() => ws.send(JSON.stringify({ t: 'attack' })), 300);
    ws.send('not json{{{'); // invalid messages must be ignored
    ws.send(JSON.stringify({ t: 'join', name: 'x'.repeat(99) })); // invalid schema
  }
  if (m.t === 'chat' && m.text === 'hello') console.log('chat echo ok');
  if (m.t === 'state' && !gotState && joined) {
    gotState = true;
    const me = m.players.find((p) => p.name === 'Tester');
    console.log(`state: players=${m.players.length} slimes=${m.slimes.length} skin=${me && me.skin} x=${me && me.x}`);
    if (!me) fail('player missing from state');
    if (me.skin !== 'azure') fail('skin not applied, got: ' + me.skin);
    if (m.slimes.length === 0) fail('no slimes in state');
    console.log('TEST PASS');
    setTimeout(() => process.exit(0), 300);
  }
});
setTimeout(() => fail('timeout waiting for state'), 8000);
