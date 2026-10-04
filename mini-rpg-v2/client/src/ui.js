/**
 * DOM wiring: join overlay (+ skin picker), chat box, HUD bars,
 * touch joystick, music toggle.
 * Kept outside Phaser so UI stays simple HTML/CSS.
 */
import { music, sfx } from './audio.js';
import { apiUrl } from './api.js';

export function initUI(net) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('join-overlay'), nameInput = $('name-input'), joinBtn = $('join-btn');
  const skinPicker = $('skin-picker');
  const chatLogEl = $('chat-log'), chatInput = $('chat-input');
  const hudHp = $('hp-fill'), hudHpText = $('hp-text'), hudXp = $('xp-fill');
  const hudLevel = $('level'), hudOnline = $('online');
  const musicBtn = $('music-btn');
  const skillBar = $('skill-bar');
  const skillPanel = $('skill-panel');
  const skillPointsEl = $('skill-points');
  const skillBtn = $('skill-btn');

  window.__joy = { active: false, dx: 0, dy: 0 };
  // (c) typing = a text field has focus. The skill panel being open is tracked
  // separately so K can still toggle it (GameScene checks __panelOpen itself).
  window.__isTyping = () =>
    document.activeElement === chatInput || document.activeElement === nameInput;
  window.__panelOpen = () => !skillPanel.hidden || !invPanel.hidden;
  window.__focusChat = () => chatInput.focus();
  window.__skins = {};
  window.__skillDefs = null;
  window.__questDefs = null;
  window.__toggleSkills = () => { skillPanel.hidden = !skillPanel.hidden; if (!skillPanel.hidden) renderSkillPanel(); };

  /* ---- Inventory: 12 slots + equipment, server-authoritative ---- */
  const ITEM_INFO = {
    slime_shard:  { icon: '🟢', name: 'Mảnh Slime' },
    gold:         { icon: '🪙', name: 'Vàng' },
    potion:       { icon: '🧪', name: 'Thuốc hồi máu', action: 'use' },
    sword_iron:   { icon: '🗡️', name: 'Kiếm sắt', action: 'equip' },
    armor_leather:{ icon: '🦺', name: 'Giáp da', action: 'equip' },
    kings_blade:  { icon: '👑', name: 'Kiếm Vương', action: 'equip' },
  };
  window.__itemInfo = ITEM_INFO;
  const invPanel = $('inventory'), invGrid = $('inv-grid'), equipRow = $('equip-row');
  const invBtn = $('inv-btn');
  let lastInvSig = '';
  window.__toggleInventory = () => {
    invPanel.hidden = !invPanel.hidden;
    if (!invPanel.hidden) renderInventory();
  };
  invBtn.addEventListener('click', () => window.__toggleInventory());
  $('inv-close').addEventListener('click', () => { invPanel.hidden = true; });

  function invSignature(me) {
    if (!me) return '';
    const inv = (me.inv || []).map((s) => (s ? `${s.uid}:${s.item}x${s.qty}` : '-')).join(',');
    const eq = me.equip ? `${me.equip.weapon ? me.equip.weapon.uid : '-'}/${me.equip.armor ? me.equip.armor.uid : '-'}` : '';
    return `${inv}|${eq}|${me.potionCd || 0}`;
  }

  function renderInventory() {
    const me = net.me();
    if (!me) return;
    equipRow.innerHTML = '';
    for (const slot of ['weapon', 'armor']) {
      const div = document.createElement('div');
      div.className = 'equip-slot';
      const it = me.equip && me.equip[slot];
      const info = it && ITEM_INFO[it.item];
      div.innerHTML = info
        ? `${info.icon}<span class="slot-label">${info.name}</span>`
        : `<span class="slot-label">${slot === 'weapon' ? 'Vũ khí' : 'Giáp'}</span>`;
      if (it) {
        div.title = `Tháo ${info.name}`;
        div.addEventListener('click', () => net.send({ t: 'unequip', slot }));
      }
      equipRow.appendChild(div);
    }
    invGrid.innerHTML = '';
    const inv = me.inv || [];
    for (let i = 0; i < 12; i++) {
      const s = inv[i];
      const div = document.createElement('div');
      div.className = 'inv-slot';
      if (s) {
        const info = ITEM_INFO[s.item] || { icon: '❓', name: s.item };
        div.innerHTML = `${info.icon}${s.qty > 1 ? `<span class="qty">${s.qty}</span>` : ''}`;
        div.title = info.name + (info.action === 'use' ? ' — nhấn để dùng' : info.action === 'equip' ? ' — nhấn để mặc' : '');
        div.addEventListener('click', () => {
          if (info.action === 'use') net.send({ t: 'use_item', uid: s.uid });
          else if (info.action === 'equip') net.send({ t: 'equip', uid: s.uid });
        });
        if (s.item === 'potion' && (me.potionCd || 0) > 0) {
          const cd = document.createElement('div');
          cd.className = 'cd';
          cd.textContent = Math.ceil(me.potionCd);
          div.appendChild(cd);
        }
      }
      invGrid.appendChild(div);
    }
    lastInvSig = invSignature(me);
  }

  let selectedSkin = null;

  /* Skin picker (loaded from the server so both sides share one list) */
  fetch(apiUrl('api/skins'))
    .then((r) => r.json())
    .then((skins) => {
      for (const s of skins) {
        window.__skins[s.id] = s;
        const b = document.createElement('button');
        b.className = 'skin-swatch' + (s.id === (skins[0] && skins[0].id) ? ' selected' : '');
        b.style.background = s.body;
        b.title = s.name;
        b.addEventListener('click', () => {
          selectedSkin = s.id;
          skinPicker.querySelectorAll('.skin-swatch').forEach((el) => el.classList.remove('selected'));
          b.classList.add('selected');
        });
        skinPicker.appendChild(b);
      }
      selectedSkin = skins[0] && skins[0].id;
    })
    .catch(() => { /* offline dev without server: picker stays empty */ });

  /* ---- Quests: tracker, NPC dialog, toasts ---- */
  fetch(apiUrl('api/quests'))
    .then((r) => r.json())
    .then((quests) => { window.__questDefs = quests; })
    .catch(() => {});

  const toastsEl = $('toasts');
  window.__toast = (text) => {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    toastsEl.appendChild(div);
    setTimeout(() => div.classList.add('show'));
    setTimeout(() => {
      div.classList.remove('show');
      setTimeout(() => div.remove(), 400);
    }, 3200);
  };

  const npcBtn = $('npc-btn');
  window.__setNpcPrompt = (visible) => { npcBtn.hidden = !visible; };
  npcBtn.addEventListener('click', () => {
    if (window.__interactNpc) window.__interactNpc();
  });

  const npcDialog = $('npc-dialog');
  net.on('npc_dialog', (d) => renderNpcDialog(d));

  function renderNpcDialog(d) {
    $('npc-name').textContent = `${d.icon || ''} ${d.name}`;
    $('npc-text').textContent = d.greeting;
    let html = '';
    for (const q of d.quests) {
      const objHtml = q.objectives.map((o) =>
        `<div class="obj">${o.text}: <b>${o.have}/${o.need}</b></div>`).join('');
      const rw = q.rewards || {};
      const rwHtml = (rw.xp || rw.gold)
        ? `<div class="reward">🎁 +${rw.xp || 0} XP, +${rw.gold || 0} vàng</div>` : '';
      let action = '';
      if (q.state === 'available') {
        action = `<button data-accept="${q.id}">Nhận nhiệm vụ</button>`;
      } else if (q.state === 'ready') {
        action = `<button data-turnin="${q.id}" class="turnin">Trả nhiệm vụ</button>`;
      } else if (q.state === 'done') {
        action = `<span class="q-done">✓ Đã xong${q.nextName ? ` → tiếp: ${q.nextName}` : ''}</span>`;
      } else if (q.state === 'locked') {
        action = `<span class="q-locked">🔒 Sẽ mở ở giai đoạn 3</span>`;
      } else if (q.state === 'active') {
        action = `<span class="q-active">Đang làm...</span>`;
      }
      html += `<div class="quest-row" data-state="${q.state}">
        <b>${q.name}</b><p>${q.desc}</p>${objHtml}${rwHtml}${action}
      </div>`;
    }
    $('npc-quests').innerHTML = html;
    $('npc-quests').querySelectorAll('[data-accept]').forEach((b) =>
      b.addEventListener('click', () => {
        net.send({ t: 'quest_accept', quest: b.dataset.accept });
        sfx.quest_accept();
      }));
    $('npc-quests').querySelectorAll('[data-turnin]').forEach((b) =>
      b.addEventListener('click', () => {
        net.send({ t: 'quest_turnin', quest: b.dataset.turnin });
        sfx.quest_turnin();
      }));
    npcDialog.hidden = false;
  }
  $('npc-close').addEventListener('click', () => { npcDialog.hidden = true; });

  function renderQuestTracker() {
    const defs = window.__questDefs;
    const me = net.me();
    const tracker = $('quest-tracker');
    if (!defs || !me) { tracker.innerHTML = ''; return; }
    const byId = Object.fromEntries(defs.map((q) => [q.id, q]));
    let html = '';
    for (const [qid, qs] of Object.entries(me.quests || {})) {
      const q = byId[qid];
      if (!q) continue;
      const objs = q.objectives.map((o, i) => {
        const have = Math.min(qs.progress[i] || 0, o.count);
        return `<div>${o.text}: ${have}/${o.count}</div>`;
      }).join('');
      const tag = qs.state === 'ready' ? '<span class="q-ready">TRẢ NHIỆM VỤ!</span>' : '';
      html += `<div class="tracker-quest"><b>📜 ${q.name}</b>${tag}${objs}</div>`;
    }
    tracker.innerHTML = html;
  }
  /* ---- Skills: definitions, bar, panel ---- */
  const ACTIVE_ORDER = ['dash', 'whirlwind', 'heal'];
  const slotEls = {};

  fetch(apiUrl('api/skills'))
    .then((r) => r.json())
    .then((defs) => {
      window.__skillDefs = defs;
      ACTIVE_ORDER.forEach((id, i) => {
        const d = defs.actives[id];
        if (!d) return;
        const slot = document.createElement('div');
        slot.className = 'skill-slot locked';
        slot.title = `${d.name}: ${d.desc}`;
        slot.innerHTML = `<span class="skill-icon">${d.icon}</span>` +
          `<span class="skill-key">${i + 1}</span>` +
          `<div class="skill-cd"></div>`;
        slot.addEventListener('click', () => tryCast(id));
        skillBar.appendChild(slot);
        slotEls[id] = slot;
      });
      renderSkillPanel();
    })
    .catch(() => {});

  function tryCast(id) {
    const me = net.me();
    if (!me || !me.skills.includes(id)) { sfx.error(); return; }
    if ((me.cds && me.cds[id] || 0) > 0) { sfx.error(); return; }
    net.send({ t: 'cast', skill: id });
  }
  window.__tryCast = tryCast;

  function renderSkillPanel() {
    const defs = window.__skillDefs;
    if (!defs) return;
    const me = net.me();
    const sp = me ? me.skills : [];
    const ps = me ? me.passives : {};
    const pts = me ? me.sp : 0;
    skillPointsEl.textContent = `Điểm kỹ năng: ${pts}`;

    let html = '<h3>Kỹ năng chủ động <small>(phím 1/2/3)</small></h3>';
    for (const id of ACTIVE_ORDER) {
      const d = defs.actives[id];
      const has = sp.includes(id);
      html += `<div class="skill-row">
        <span class="skill-icon">${d.icon}</span>
        <div class="skill-info"><b>${d.name}</b><span>${d.desc} — hồi ${d.cd}s</span></div>
        ${has ? '<span class="skill-owned">Đã mở</span>'
              : `<button data-unlock="${id}" ${pts < d.cost ? 'disabled' : ''}>Mở (${d.cost} điểm)</button>`}
      </div>`;
    }
    html += '<h3>Kỹ năng bị động</h3>';
    for (const [id, d] of Object.entries(defs.passives)) {
      const lv = ps[id] || 0;
      const pips = '●'.repeat(lv) + '○'.repeat(d.max - lv);
      html += `<div class="skill-row">
        <span class="skill-icon">${d.icon}</span>
        <div class="skill-info"><b>${d.name}</b><span>${d.desc}</span><span class="pips">${pips}</span></div>
        ${lv >= d.max ? '<span class="skill-owned">MAX</span>'
                      : `<button data-alloc="${id}" ${pts < 1 ? 'disabled' : ''}>+ 1 điểm</button>`}
      </div>`;
    }
    $('skill-list').innerHTML = html;
    $('skill-list').querySelectorAll('[data-unlock]').forEach((b) =>
      b.addEventListener('click', () => {
        net.send({ t: 'unlock', skill: b.dataset.unlock });
        sfx.unlock();
        setTimeout(renderSkillPanel, 150);
      }));
    $('skill-list').querySelectorAll('[data-alloc]').forEach((b) =>
      b.addEventListener('click', () => {
        net.send({ t: 'allocate', passive: b.dataset.alloc });
        sfx.unlock();
        setTimeout(renderSkillPanel, 150);
      }));
  }

  $('skill-close').addEventListener('click', () => { skillPanel.hidden = true; });
  skillBtn.addEventListener('click', () => window.__toggleSkills());

  function updateSkillBar() {
    const defs = window.__skillDefs;
    const me = net.me();
    if (!defs || !me) return;
    for (const id of ACTIVE_ORDER) {
      const slot = slotEls[id];
      if (!slot) continue;
      const has = me.skills.includes(id);
      slot.classList.toggle('locked', !has);
      const cdLeft = (me.cds && me.cds[id]) || 0;
      const total = defs.actives[id].cd;
      const cdEl = slot.querySelector('.skill-cd');
      if (cdLeft > 0) {
        cdEl.style.display = 'block';
        cdEl.style.height = (100 * cdLeft / total) + '%';
      } else {
        cdEl.style.display = 'none';
      }
    }
    const pts = me.sp || 0;
    skillBtn.textContent = pts > 0 ? `🎯 ${pts}` : '🎯';
    skillBtn.classList.toggle('has-points', pts > 0);
  }

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
    if (t) { net.send({ t: 'chat', text: t }); }
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
    // (b) only send join when the socket is open; the overlay closes on 'welcome'
    if (net.status !== 'open') {
      net.connect(); // retry
      joinBtn.textContent = 'Đang kết nối...';
      return;
    }
    const name = (nameInput.value.trim() || 'Hero').slice(0, 16);
    joinBtn.disabled = true;
    joinBtn.textContent = 'Đang vào game...';
    net.join(name, selectedSkin);
    music.start(); // user gesture: allowed to start audio
    sfx.join();
  });
  nameInput.focus();

  /* (b) connection status pill + join lifecycle */
  const connStatus = $('conn-status');
  let joined = false;
  const STATUS_TEXT = {
    idle: '⚪ Chưa kết nối',
    connecting: '🟡 Đang kết nối...',
    open: '🟢 Đã kết nối',
    closed: '🔴 Mất kết nối',
    error: '🔴 Lỗi kết nối',
  };
  net.on('status', (s) => {
    connStatus.textContent = STATUS_TEXT[s] || s;
    connStatus.dataset.status = s;
    if ((s === 'closed' || s === 'error') && !joined) {
      joinBtn.disabled = false;
      joinBtn.textContent = 'Thử lại';
    }
    if ((s === 'closed' || s === 'error') && joined) {
      // reconnect keeping the character is phase 4 — for now, back to join
      joined = false;
      $('join-title').textContent = 'Mất kết nối — hãy vào lại';
      overlay.hidden = false;
      joinBtn.disabled = false;
      joinBtn.textContent = 'Vào game';
    }
  });
  connStatus.textContent = STATUS_TEXT[net.status] || net.status;
  net.on('welcome', () => {
    joined = true;
    overlay.hidden = true;
    joinBtn.disabled = false;
    joinBtn.textContent = 'Vào game';
    $('join-title').textContent = 'Mini RPG';
  });

  musicBtn.addEventListener('click', () => {
    const on = music.toggle();
    musicBtn.textContent = on ? '🔊' : '🔇';
  });

  let lastSkillSig = '';
  function updateHUD() {
    const me = net.me();
    if (me) {
      // (h) xpNeed comes from the server snapshot — always matches the curve
      const defs = window.__skillDefs;
      const need = me.xpNeed || (defs && defs.xpTable && defs.xpTable[me.level]) || me.level * 100;
      hudHp.style.width = (100 * me.hp / me.maxHp) + '%';
      hudHpText.textContent = `${Math.ceil(me.hp)} / ${me.maxHp}`;
      hudXp.style.width = (100 * me.xp / need) + '%';
      hudLevel.textContent = 'Lv ' + me.level;
    }
    hudOnline.textContent = `🟢 ${net.players.length} online`;
    const goldEl = $('gold');
    if (goldEl && me) goldEl.textContent = `🪙 ${me.gold || 0}`;
    updateSkillBar();
    renderQuestTracker();
    // re-render the open panel only when skill state actually changed
    if (!skillPanel.hidden && me) {
      const sig = `${me.sp}|${me.skills.join(',')}|${JSON.stringify(me.passives)}`;
      if (sig !== lastSkillSig) {
        lastSkillSig = sig;
        renderSkillPanel();
      }
    }
    // same for the inventory panel (12 slots + equipment + potion cooldown)
    if (!invPanel.hidden && me) {
      const sig = invSignature(me);
      if (sig !== lastInvSig) renderInventory();
    }
  }

  net.on('welcome', (m) => (m.chat || []).forEach((c) => addChatLine(c.name, c.text)));
  net.on('chat', (m) => { addChatLine(m.name, m.text); sfx.chat(); });
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
    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          joyId = null;
          joy.active = false; joy.dx = 0; joy.dy = 0;
          stickEl.style.left = '35px'; stickEl.style.top = '35px';
          net.send({ t: 'input', x: 0, y: 0 }); // (f) stop immediately
        }
      }
    };
    window.addEventListener('touchend', endTouch);
    window.addEventListener('touchcancel', endTouch); // (f)
    atkBtn.addEventListener('touchstart', (e) => {
      net.send({ t: 'attack' });
      e.preventDefault();
    }, { passive: false });
  }
}
