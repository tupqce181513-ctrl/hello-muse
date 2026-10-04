/* Mini RPG client — canvas renderer + keyboard/touch input.
   Connects to the game server on the same origin via WebSocket. */
(() => {
'use strict';

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const el = (id) => document.getElementById(id);
const hudHp = el('hp-fill'), hudHpText = el('hp-text'), hudXp = el('xp-fill');
const hudLevel = el('level'), hudOnline = el('online');
const chatLogEl = el('chat-log'), chatInput = el('chat-input');
const overlay = el('join-overlay'), nameInput = el('name-input'), joinBtn = el('join-btn');
const touchUI = el('touch-ui'), joyEl = el('joystick'), stickEl = el('stick'), atkBtn = el('atk-btn');

let W = 0, H = 0;
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const WORLD = { w: 1600, h: 1200 };
let myId = null, players = [], slimes = [], obstacles = [];
let cam = { x: WORLD.w / 2, y: WORLD.h / 2 };
const keys = {};
const joy = { active: false, dx: 0, dy: 0 };

const wsProto = location.protocol === 'https:' ? 'wss://' : 'ws://';
const ws = new WebSocket(wsProto + location.host);

function isTyping() {
  return document.activeElement === chatInput || document.activeElement === nameInput;
}
window.addEventListener('keydown', (e) => {
  if (isTyping()) {
    if (e.key === 'Enter' && document.activeElement === chatInput) sendChat();
    if (e.key === 'Enter' && document.activeElement === nameInput) joinBtn.click();
    return;
  }
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (k === 'enter') chatInput.focus();
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

function addChatLine(name, text) {
  const div = document.createElement('div');
  const b = document.createElement('b');
  b.textContent = name + ': ';
  div.appendChild(b);
  div.appendChild(document.createTextNode(text));
  chatLogEl.appendChild(div);
  while (chatLogEl.children.length > 30) chatLogEl.firstChild.remove();
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}
function sendChat() {
  const t = chatInput.value.trim();
  if (t && ws.readyState === 1) ws.send(JSON.stringify({ t: 'chat', text: t }));
  chatInput.value = '';
  chatInput.blur();
}

ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.t === 'welcome') {
    myId = m.id;
    obstacles = m.obstacles || [];
    (m.chat || []).forEach((c) => addChatLine(c.name, c.text));
  } else if (m.t === 'state') {
    players = m.players;
    slimes = m.slimes;
  } else if (m.t === 'chat') {
    addChatLine(m.name, m.text);
  }
};
ws.onclose = () => addChatLine('Server', 'Mất kết nối tới server...');

joinBtn.addEventListener('click', () => {
  const name = (nameInput.value.trim() || 'Hero').slice(0, 16);
  const send = () => ws.send(JSON.stringify({ t: 'join', name }));
  if (ws.readyState === 1) send();
  else ws.addEventListener('open', send, { once: true });
  overlay.hidden = true;
});
nameInput.focus();

/* ---------- touch controls ---------- */
if ('ontouchstart' in window) {
  touchUI.hidden = false;
  let joyId = null, sx = 0, sy = 0;
  joyEl.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    joyId = t.identifier; sx = t.clientX; sy = t.clientY;
    joy.active = true; e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        let dx = (t.clientX - sx) / 40, dy = (t.clientY - sy) / 40;
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        joy.dx = dx; joy.dy = dy;
        stickEl.style.left = (35 + dx * 30) + 'px';
        stickEl.style.top = (35 + dy * 30) + 'px';
      }
    }
  }, { passive: true });
  window.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        joyId = null; joy.active = false; joy.dx = 0; joy.dy = 0;
        stickEl.style.left = '35px'; stickEl.style.top = '35px';
      }
    }
  });
  atkBtn.addEventListener('touchstart', (e) => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'attack' }));
    e.preventDefault();
  }, { passive: false });
}

/* ---------- helpers ---------- */
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function hpBar(x, y, w, frac) {
  ctx.fillStyle = 'rgba(0,0,0,.6)';
  ctx.fillRect(x - w / 2, y, w, 6);
  ctx.fillStyle = frac > 0.5 ? '#4caf50' : frac > 0.25 ? '#ffb300' : '#e53935';
  ctx.fillRect(x - w / 2 + 1, y + 1, (w - 2) * Math.max(0, frac), 4);
}

/* ---------- drawing ---------- */
function drawBackground(ox, oy) {
  ctx.fillStyle = '#2f6b3a';
  ctx.fillRect(0, 0, W, H);
  const T = 80;
  const tx0 = Math.floor((cam.x - W / 2) / T), tx1 = Math.ceil((cam.x + W / 2) / T);
  const ty0 = Math.floor((cam.y - H / 2) / T), ty1 = Math.ceil((cam.y + H / 2) / T);
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      const h = hash(tx, ty);
      if (h < 0.22) {
        ctx.fillStyle = h < 0.11 ? '#2a6134' : '#377d43';
        ctx.fillRect(tx * T + ox, ty * T + oy, T, T);
      }
      if (h > 0.93) { // grass tuft
        const gx = tx * T + h * 997 % T, gy = ty * T + h * 613 % T;
        ctx.strokeStyle = '#46a04f'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(gx + ox, gy + oy); ctx.lineTo(gx + ox - 4, gy + oy - 9);
        ctx.moveTo(gx + ox + 4, gy + oy); ctx.lineTo(gx + ox + 4, gy + oy - 10);
        ctx.stroke();
      }
    }
  }
  ctx.strokeStyle = '#1d4a24'; ctx.lineWidth = 10;
  ctx.strokeRect(ox - 5, oy - 5, WORLD.w + 10, WORLD.h + 10);
}
function drawTree(o, ox, oy) {
  const x = o.x + ox, y = o.y + oy;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(x, y + 22, 26, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(x - 6, y - 6, 12, 30);
  ctx.fillStyle = '#2e7d32';
  ctx.beginPath(); ctx.arc(x, y - 18, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#388e3c';
  ctx.beginPath(); ctx.arc(x - 10, y - 28, 16, 0, Math.PI * 2); ctx.fill();
}
function drawSlime(s, ox, oy) {
  if (s.dead) return;
  const x = s.x + ox, y = s.y + oy;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(x, y + 10, 16, 6, 0, 0, Math.PI * 2); ctx.fill();
  const bounce = Math.sin(performance.now() / 300 + s.id) * 2;
  ctx.fillStyle = s.flash ? '#eaffea' : '#66bb6a';
  ctx.beginPath(); ctx.ellipse(x, y + bounce, 16, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1b5e20';
  ctx.beginPath(); ctx.arc(x - 5, y - 2 + bounce, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 5, y - 2 + bounce, 2.6, 0, Math.PI * 2); ctx.fill();
  if (s.hp < s.maxHp) hpBar(x, y - 24, 34, s.hp / s.maxHp);
}
function drawPlayer(p, ox, oy) {
  const x = p.x + ox, y = p.y + oy;
  if (p.dead) ctx.globalAlpha = 0.35;
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(x, y + 14, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.color;
  ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,.45)'; // facing nose
  ctx.beginPath(); ctx.arc(x + p.fx * 11, y + p.fy * 11, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; // eyes
  const ex = -p.fy, ey = p.fx;
  ctx.beginPath(); ctx.arc(x + p.fx * 6 + ex * 6, y + p.fy * 6 + ey * 6, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + p.fx * 6 - ex * 6, y + p.fy * 6 - ey * 6, 2.4, 0, Math.PI * 2); ctx.fill();
  if (p.atkAnim > 0) { // swing arc
    const a = Math.atan2(p.fy, p.fx);
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, 32, a - 1, a + 1); ctx.stroke();
  }
  ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText((p.id === myId ? '⭐ ' : '') + p.name + ' Lv' + p.level, x, y - 32);
  hpBar(x, y - 26, 42, p.hp / p.maxHp);
  ctx.globalAlpha = 1;
}

/* ---------- main loop ---------- */
let lastSent = { x: 9, y: 9 }, lastSendAt = 0, lastAtkAt = 0;
function loop() {
  const now = performance.now();

  // gather input
  let ix = ((keys['d'] || keys['arrowright']) ? 1 : 0) - ((keys['a'] || keys['arrowleft']) ? 1 : 0);
  let iy = ((keys['s'] || keys['arrowdown']) ? 1 : 0) - ((keys['w'] || keys['arrowup']) ? 1 : 0);
  if (joy.active) { ix += joy.dx; iy += joy.dy; }
  const il = Math.hypot(ix, iy);
  if (il > 1) { ix /= il; iy /= il; }

  if (ws.readyState === 1 && myId !== null) {
    if ((ix !== lastSent.x || iy !== lastSent.y || now - lastSendAt > 120)) {
      ws.send(JSON.stringify({ t: 'input', x: +ix.toFixed(2), y: +iy.toFixed(2) }));
      lastSent = { x: ix, y: iy }; lastSendAt = now;
    }
    if ((keys[' '] || keys['j']) && now - lastAtkAt > 220) {
      ws.send(JSON.stringify({ t: 'attack' }));
      lastAtkAt = now;
    }
  }

  // camera follows me
  const me = players.find((p) => p.id === myId);
  if (me) {
    cam.x += (me.x - cam.x) * 0.12;
    cam.y += (me.y - cam.y) * 0.12;
    const need = me.level * 100;
    hudHp.style.width = (100 * me.hp / me.maxHp) + '%';
    hudHpText.textContent = `${Math.ceil(me.hp)} / ${me.maxHp}`;
    hudXp.style.width = (100 * me.xp / need) + '%';
    hudLevel.textContent = 'Lv ' + me.level;
  }
  hudOnline.textContent = `🟢 ${players.length} online`;

  // render
  const ox = Math.round(W / 2 - cam.x), oy = Math.round(H / 2 - cam.y);
  drawBackground(ox, oy);
  const drawables = [];
  for (const o of obstacles) drawables.push({ y: o.y, f: () => drawTree(o, ox, oy) });
  for (const s of slimes) drawables.push({ y: s.y, f: () => drawSlime(s, ox, oy) });
  for (const p of players) drawables.push({ y: p.y + 1, f: () => drawPlayer(p, ox, oy) });
  drawables.sort((a, b) => a.y - b.y).forEach((d) => d.f());

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
})();
