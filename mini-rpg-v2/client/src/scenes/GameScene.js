import Phaser from 'phaser';
import { drawMap } from '../terrain.js';
import { createBackground } from '../background.js';
import { createFX } from '../fx.js';
import { sfx } from '../audio.js';
import { PlayerView } from '../entities/PlayerView.js';
import { SlimeView } from '../entities/SlimeView.js';
import GoblinView from '../entities/GoblinView.js';
import WispView from '../entities/WispView.js';
import SlimeKingView from '../entities/SlimeKingView.js';
import { NpcView } from '../entities/NpcView.js';
import { ItemView } from '../entities/ItemView.js';

const MONSTER_VIEWS = {
  slime: SlimeView, goblin: GoblinView, wisp: WispView, slime_king: SlimeKingView,
};

/** Client mirror of the server quest status (for the NPC "!" marker). */
function questMarker(npcId, me, defs) {
  let active = false;
  for (const q of defs) {
    if (q.giver !== npcId || q.locked) continue;
    if (me.questsDone && me.questsDone.includes(q.id)) continue;
    const qs = me.quests && me.quests[q.id];
    if (qs && qs.state === 'ready') return '!';
    if (qs && qs.state === 'active') { active = true; continue; }
    if (!q.requires || (me.questsDone && me.questsDone.includes(q.requires))) return '!';
  }
  return active ? '?' : null;
}

/**
 * GameScene — owns world rendering + input. No simulation here:
 * the server is authoritative; this scene only mirrors snapshots.
 *
 * Graphics triggers (all client-side, driven by snapshot diffs):
 *   slime flash  -> hit sfx + spark burst
 *   my level up  -> levelup sfx + golden sparkles
 *   my death     -> death sfx + gray poof
 *   my attack    -> swing sfx
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  create() {
    this.net = this.registry.get('net');
    this.views = new Map(); // 'p<id>' | 's<id>' -> view
    this.npcViews = new Map(); // npcId -> NpcView
    this.itemViews = new Map(); // itemId -> ItemView
    this.prevFlash = new Map();
    this.prevLevel = null;
    this.prevDead = false;
    this.prevQuestSig = '';
    this.prevInvSig = '';
    this.nearNpcId = null;

    // The map arrives with 'welcome'; draw everything once we have it.
    if (this.net.map) this.buildWorld();
    else this.net.once('welcome', () => this.buildWorld());

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D,J');
    this.spaceKey = this.input.keyboard.addKey('SPACE');
    this.enterKey = this.input.keyboard.addKey('ENTER');
    this.numKeys = this.input.keyboard.addKeys('ONE,TWO,THREE');
    this.kKey = this.input.keyboard.addKey('K');
    this.iKey = this.input.keyboard.addKey('I');
    this.f3Key = this.input.keyboard.addKey('F3');
    this.eKey = this.input.keyboard.addKey('E');
    this.prevCast = new Map();
    // floating damage-number pool (server-authoritative events, capped)
    this.dmgPool = [];
    this.dmgIdx = 0;

    this.net.on('state', () => this.sync());
    this.lastSent = { x: 9, y: 9 };
    this.lastSendAt = 0;

    // (f) never leave the hero running when the page loses focus
    this._zeroInput = () => this.sendInput(0, 0);
    window.addEventListener('blur', this._zeroInput);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._zeroInput();
    });
  }

  buildWorld() {
    const map = this.net.map;
    const ts = map.tileSize;
    this.worldSize = { w: map.rows[0].length * ts, h: map.rows.length * ts };

    this.fx = createFX(this);
    this.bg = createBackground(this, this.worldSize);
    drawMap(this, map);

    // static NPCs (from welcome)
    for (const npc of this.net.npcs || []) {
      this.npcViews.set(npc.id, new NpcView(this, npc));
    }

    // Slight overscroll so the parallax backdrop shows at the edges.
    const M = 160;
    this.cameras.main.setBounds(-M, -M, this.worldSize.w + 2 * M, this.worldSize.h + 2 * M);
    this.worldBuilt = true;

    // touch NPC button → talk to the nearby NPC
    window.__interactNpc = () => {
      if (this.nearNpcId) this.net.send({ t: 'npc', npc: this.nearNpcId });
    };
  }

  /** Reconcile views with the latest server snapshot (+ fx/sfx triggers). */
  sync() {
    if (!this.worldBuilt) return;
    const seen = new Set();

    for (const p of this.net.players) {
      const key = 'p' + p.id;
      seen.add(key);
      let v = this.views.get(key);
      if (!v) {
        const isMe = p.id === this.net.myId;
        v = new PlayerView(this, p, isMe);
        this.views.set(key, v);
        if (isMe) this.cameras.main.startFollow(v, true, 0.12, 0.12);
      }
      v.update(p);
    }

    for (const s of this.net.monsters) {
      const key = 'm' + s.id;
      if (s.dead) {
        const v = this.views.get(key);
        if (v) { v.destroy(); this.views.delete(key); }
        this.prevFlash.delete(s.id);
        continue;
      }
      seen.add(key);
      let v = this.views.get(key);
      if (!v) {
        const Cls = MONSTER_VIEWS[s.mtype] || SlimeView;
        v = new Cls(this, s);
        this.views.set(key, v);
      }
      v.update(s, this.time.now);

      const was = this.prevFlash.get(s.id) || false;
      if (s.flash && !was) {
        sfx.hit();
        this.fx.burst(s.x, s.y, 0xfff176);
      }
      this.prevFlash.set(s.id, s.flash);
    }

    // projectiles (wisp shots)
    const seenPr = new Set();
    for (const pr of this.net.projectiles || []) {
      const key = 'pr' + pr.id;
      seenPr.add(key);
      let v = this.views.get(key);
      if (!v) {
        const g = this.add.graphics();
        g.fillStyle(0x9c27b0, 0.35).fillCircle(0, 0, 12);
        g.fillStyle(0xce93d8, 1).fillCircle(0, 0, 7);
        g.setDepth(7);
        v = { c: g, update: (p) => g.setPosition(p.x, p.y), destroy: () => g.destroy() };
        this.views.set(key, v);
      }
      v.update(pr);
    }
    for (const [key, v] of this.views) {
      if (key.startsWith('pr') && !seenPr.has(key)) {
        v.destroy();
        this.views.delete(key);
      }
    }

    for (const [key, v] of this.views) {
      if (!seen.has(key)) {
        v.destroy();
        this.views.delete(key);
      }
    }

    // floating damage numbers (server results only)
    for (const d of this.net.dmg || []) {
      this.spawnDmgNum(d);
    }

    // hero event triggers
    const me = this.net.players.find((p) => p.id === this.net.myId);
    if (me) {
      if (this.prevLevel !== null && me.level > this.prevLevel) {
        sfx.levelup();
        this.fx.sparkle(me.x, me.y);
        // big level-up banner (server result)
        const b = document.getElementById('levelup-banner');
        if (b) {
          document.getElementById('levelup-num').textContent = me.level;
          b.style.animation = 'none';
          void b.offsetWidth; // restart the CSS animation
          b.style.animation = '';
          b.hidden = false;
          clearTimeout(this._bannerT);
          this._bannerT = setTimeout(() => { b.hidden = true; }, 2200);
        }
      }
      if (!this.prevDead && me.dead) {
        sfx.death();
        this.fx.poof(me.x, me.y);
      }
      this.prevLevel = me.level;
      this.prevDead = me.dead;
    }

    // boss HP bar: only visible when the hero is near the boss
    const boss = this.net.monsters.find((m) => m.mtype === 'slime_king' && !m.dead);
    const nearBoss = !!(boss && me && Math.hypot(boss.x - me.x, boss.y - me.y) < 700);
    const bossBar = document.getElementById('boss-bar');
    if (bossBar) {
      bossBar.hidden = !nearBoss;
      if (nearBoss) {
        bossBar.querySelector('.boss-fill').style.width =
          (100 * Math.max(0, boss.hp / boss.maxHp)) + '%';
      }
    }

    // skill cast FX for every player (driven by server castSeq)
    for (const p of this.net.players) {
      const prev = this.prevCast.get(p.id) || 0;
      if (p.castSeq > prev) {        this.prevCast.set(p.id, p.castSeq);
        if (p.castSkill === 'dash') { sfx.dash(); this.fx.dashFx(p.x, p.y); }
        else if (p.castSkill === 'whirlwind') { sfx.whirlwind(); this.fx.whirlwindFx(p.x, p.y); }
        else if (p.castSkill === 'heal') { sfx.heal(); this.fx.healFx(p.x, p.y); }
      }
    }

    // ground items
    const seenItems = new Set();
    for (const it of this.net.items || []) {
      seenItems.add(it.id);
      if (!this.itemViews.has(it.id)) {
        this.itemViews.set(it.id, new ItemView(this, it));
      }
    }
    for (const [id, v] of this.itemViews) {
      if (!seenItems.has(id)) { v.destroy(); this.itemViews.delete(id); }
    }

    // NPC quest markers + quest toasts + pickup FX (hero only)
    if (me) {
      const defs = window.__questDefs;
      if (defs) {
        for (const [id, nv] of this.npcViews) {
          nv.setMarker(questMarker(id, me, defs));
        }
      }
      const qsig = JSON.stringify([me.quests, me.questsDone]);
      if (this.prevQuestSig && qsig !== this.prevQuestSig) {
        const prev = JSON.parse(this.prevQuestSig);
        const prevQ = prev[0] || {}, cur = me.quests || {};
        for (const [qid, qs] of Object.entries(cur)) {
          if (qs.state === 'ready' && (!prevQ[qid] || prevQ[qid].state !== 'ready')) {
            const qn = this.questName(qid);
            if (window.__toast) window.__toast(`✅ Hoàn thành: ${qn} — về trả nhiệm vụ!`);
            sfx.quest_ready();
          }
        }
        for (const qid of (me.questsDone || [])) {
          if (!(prev[1] || []).includes(qid)) {
            if (window.__toast) window.__toast(`🎁 Đã nhận thưởng: ${this.questName(qid)}`);
          }
        }
      }
      this.prevQuestSig = qsig;

      const isig = JSON.stringify(me.inv || {});
      if (this.prevInvSig && isig !== this.prevInvSig) {
        sfx.pickup();
        this.fx.burst(me.x, me.y - 10, 0x69f0ae);
      }
      this.prevInvSig = isig;
    }
  }

  questName(qid) {
    const defs = window.__questDefs || [];
    const q = defs.find((d) => d.id === qid);
    return q ? q.name : qid;
  }

  update(time, delta) {
    if (window.__fpsTick) window.__fpsTick();
    if (this.bg) this.bg.update(delta / 1000);
    // (i) ease every view toward its latest server position
    for (const v of this.views.values()) {
      if (v.frame) v.frame(delta / 1000);
    }
    for (const v of this.npcViews.values()) v.frame(time);
    for (const v of this.itemViews.values()) v.frame(time);
    if (!this.net || this.net.myId == null) return;

    const typing = window.__isTyping && window.__isTyping(); // text field focused
    const panelOpen = window.__panelOpen && window.__panelOpen();
    // (c) K toggles the skill panel even while it is open — handle before
    // the input-blocking branch below (but not while typing in a text field)
    if (!typing && Phaser.Input.Keyboard.JustDown(this.kKey) && window.__toggleSkills) {
      window.__toggleSkills();
    }
    if (!typing && Phaser.Input.Keyboard.JustDown(this.iKey) && window.__toggleInventory) {
      window.__toggleInventory();
    }
    if (!typing && Phaser.Input.Keyboard.JustDown(this.f3Key) && window.__togglePerf) {
      window.__togglePerf();
    }
    if (typing || panelOpen) {
      this.sendInput(0, 0); // stop moving while chatting / panel open
      return;
    }

    const c = this.cursors, w = this.wasd;
    let ix = (c.right.isDown || w.D.isDown ? 1 : 0) - (c.left.isDown || w.A.isDown ? 1 : 0);
    let iy = (c.down.isDown || w.S.isDown ? 1 : 0) - (c.up.isDown || w.W.isDown ? 1 : 0);
    const joy = window.__joy;
    if (joy && joy.active) { ix += joy.dx; iy += joy.dy; }
    const l = Math.hypot(ix, iy);
    if (l > 1) { ix /= l; iy /= l; }
    this.sendInput(ix, iy);

    if (
      Phaser.Input.Keyboard.JustDown(this.spaceKey) ||
      Phaser.Input.Keyboard.JustDown(w.J)
    ) {
      this.net.send({ t: 'attack' });
      sfx.swing();
    }
    const SKILL_IDS = ['dash', 'whirlwind', 'heal'];
    const numKeys = [this.numKeys.ONE, this.numKeys.TWO, this.numKeys.THREE];
    numKeys.forEach((k, i) => {
      if (Phaser.Input.Keyboard.JustDown(k) && window.__tryCast) {
        window.__tryCast(SKILL_IDS[i]);
      }
    });
    if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
      window.__focusChat();
    }

    // NPC interaction: prompt + E when the hero is in range
    const hero = this.net.me();
    let nearId = null;
    if (hero && !hero.dead) {
      for (const [id, nv] of this.npcViews) {
        const near = Math.hypot(nv.x - hero.x, nv.y - hero.y) < 110;
        nv.setPrompt(near);
        if (near) nearId = id;
      }
    } else {
      for (const nv of this.npcViews.values()) nv.setPrompt(false);
    }
    if (nearId !== this.nearNpcId) {
      this.nearNpcId = nearId;
      if (window.__setNpcPrompt) window.__setNpcPrompt(!!nearId);
    }
    if (nearId && Phaser.Input.Keyboard.JustDown(this.eKey)) {
      this.net.send({ t: 'npc', npc: nearId });
    }
  }

  sendInput(ix, iy) {
    const now = performance.now();
    ix = +ix.toFixed(2); iy = +iy.toFixed(2);
    if (ix !== this.lastSent.x || iy !== this.lastSent.y || now - this.lastSendAt > 120) {
      this.net.send({ t: 'input', x: ix, y: iy });
      this.lastSent = { x: ix, y: iy };
      this.lastSendAt = now;
    }
  }

  /** Floating damage number from a server damage event (pooled, max 24). */
  spawnDmgNum(d) {
    const MAX = 24;
    let t = this.dmgPool[this.dmgIdx % MAX];
    if (!t) {
      t = this.add.text(0, 0, '', {
        fontSize: '15px', fontStyle: 'bold', color: '#ffffff',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(40);
      this.dmgPool[this.dmgIdx % MAX] = t;
    }
    this.dmgIdx++;
    this.tweens.killTweensOf(t);
    t.setText(String(d.amount))
      .setColor(d.kind === 'hurt' ? '#ff5252' : '#ffe082')
      .setPosition(d.x + (Math.random() * 16 - 8), d.y)
      .setAlpha(1).setScale(1).setVisible(true);
    this.tweens.add({
      targets: t, y: d.y - 42, alpha: 0, scale: 0.8,
      duration: 750, ease: 'Cubic.easeOut',
      onComplete: () => t.setVisible(false),
    });
  }
}
