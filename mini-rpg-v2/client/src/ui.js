/**
 * DOM wiring: join overlay, chat box, HUD bars, touch joystick.
 * Kept outside Phaser so UI stays simple HTML/CSS.
 */
export function initUI(net) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('join-overlay'), nameInput = $('name-input'), joinBtn = $('join-btn');
  const chatLogEl = $('chat-log'), chatInput = $('chat-input');
  const hudHp = $('hp-fill'), hudHpText = $('hp-text'), hudXp = $('xp-fill');
  const hudLevel = $('level'), hudOnline = $('online');

  window.__joy = { active: false, dx: 0, dy: 0 };
  window.__isTyping = () =>
    document.activeElement === chatInput || document.activeElement === nameInput;
  window.__focusChat = () => chatInput.focus();

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
    if (t) net.send({ t: 'chat', text: t });
    chatInput.value = '';
    chatInput.blur();
  }

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
    e.stopPropagation(); // don't let game keys fire while typing
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinBtn.click();
    e.stopPropagation();
  });

  joinBtn.addEventListener('click', () => {
    const name = (nameInput.value.trim() || 'Hero').slice(0, 16);
    net.join(name);
    overlay.hidden = true;
  });
  nameInput.focus();

  function updateHUD() {
    const me = net.me();
    if (me) {
      const need = me.level * 100;
      hudHp.style.width = (100 * me.hp / me.maxHp) + '%';
      hudHpText.textContent = `${Math.ceil(me.hp)} / ${me.maxHp}`;
      hudXp.style.width = (100 * me.xp / need) + '%';
      hudLevel.textContent = 'Lv ' + me.level;
    }
    hudOnline.textContent = `🟢 ${net.players.length} online`;
  }

  net.on('welcome', (m) => (m.chat || []).forEach((c) => addChatLine(c.name, c.text)));
  net.on('chat', (m) => addChatLine(m.name, m.text));
  net.on('state', updateHUD);

  /* Touch controls (only shown on touch devices) */
  if ('ontouchstart' in window) {
    $('touch-ui').hidden = false;
    const joyEl = $('joystick'), stickEl = $('stick'), atkBtn = $('atk-btn');
    const joy = window.__joy;
    let joyId = null, sx = 0, sy = 0;
    joyEl.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      joyId = t.identifier; sx = t.clientX; sy = t.clientY;
      joy.active = true;
      e.preventDefault();
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
          joyId = null;
          joy.active = false; joy.dx = 0; joy.dy = 0;
          stickEl.style.left = '35px'; stickEl.style.top = '35px';
        }
      }
    });
    atkBtn.addEventListener('touchstart', (e) => {
      net.send({ t: 'attack' });
      e.preventDefault();
    }, { passive: false });
  }
}
