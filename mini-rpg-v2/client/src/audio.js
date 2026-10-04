/**
 * Procedural audio: chiptune background music + synthesized SFX.
 * Zero assets — everything is generated with the Web Audio API.
 * Call music.start() from a user gesture (the join button) to satisfy
 * browser autoplay policies.
 */

const note = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// 16-step loop. 0 = rest.
const LEAD = [76, 79, 81, 79, 84, 81, 79, 76, 74, 76, 79, 76, 74, 0, 72, 0];
const BASS = [48, 0, 0, 0, 43, 0, 0, 0, 45, 0, 0, 0, 41, 0, 43, 0];
const STEP = 0.145; // seconds per 16th note

class MusicBox {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.step = 0;
    this.nextAt = 0;
    this.timer = null;
    this.noiseBuf = null;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** Start the loop (call from a click). Returns playing state. */
  start() {
    this.ensure();
    if (this.playing) return true;
    this.playing = true;
    this.step = 0;
    this.nextAt = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), 90);
    return true;
  }

  stop() {
    this.playing = false;
    clearInterval(this.timer);
  }

  toggle() {
    this.ensure();
    if (this.playing) { this.stop(); return false; }
    this.start(); return true;
  }

  schedule() {
    while (this.nextAt < this.ctx.currentTime + 0.3) {
      const s = this.step % 16;
      if (LEAD[s]) this.tone(note(LEAD[s]), this.nextAt, STEP * 0.9, 'square', 0.05);
      if (BASS[s]) this.tone(note(BASS[s]), this.nextAt, STEP * 1.8, 'triangle', 0.09);
      this.nextAt += STEP;
      this.step++;
    }
  }

  tone(freq, at, dur, type, vol) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  /** One-shot sound effects. */
  sfx(name) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const tone = (f0, f1, dur, type, vol, delay = 0) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + delay);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + delay + dur);
      g.gain.setValueAtTime(vol, t + delay);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t + delay);
      o.stop(t + delay + dur + 0.02);
    };
    const noise = (dur, vol, fFrom, fTo) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'bandpass';
      flt.frequency.setValueAtTime(fFrom, t);
      flt.frequency.exponentialRampToValueAtTime(fTo, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(flt).connect(g).connect(this.ctx.destination);
      src.start(t);
      src.stop(t + dur + 0.02);
    };
    switch (name) {
      case 'swing': noise(0.14, 0.25, 3200, 500); break;
      case 'hit': tone(220, 110, 0.12, 'square', 0.18); noise(0.08, 0.12, 1200, 300); break;
      case 'levelup': [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.16, i * 0.09)); break;
      case 'death': tone(300, 55, 0.5, 'sawtooth', 0.2); break;
      case 'join': tone(660, 660, 0.08, 'sine', 0.12); break;
      case 'chat': tone(880, 880, 0.05, 'sine', 0.06); break;
      case 'dash': noise(0.18, 0.22, 500, 4200); break;
      case 'whirlwind': noise(0.35, 0.25, 800, 200); tone(180, 90, 0.3, 'sawtooth', 0.1); break;
      case 'heal': [523, 659, 784].forEach((f, i) => tone(f, f * 1.01, 0.18, 'sine', 0.14, i * 0.1)); break;
      case 'unlock': [440, 554, 659, 880].forEach((f, i) => tone(f, f, 0.1, 'triangle', 0.14, i * 0.07)); break;
      case 'error': tone(140, 110, 0.16, 'square', 0.12); break;
      case 'quest_accept': [392, 523, 659].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.14, i * 0.08)); break;
      case 'quest_ready': [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.1, 'sine', 0.14, i * 0.07)); break;
      case 'quest_turnin': [659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.14, i * 0.08)); break;
      case 'pickup': tone(1200, 1800, 0.08, 'sine', 0.1); break;
    }
  }
}

export const music = new MusicBox();
export const sfx = {
  swing: () => music.sfx('swing'),
  hit: () => music.sfx('hit'),
  levelup: () => music.sfx('levelup'),
  death: () => music.sfx('death'),
  join: () => music.sfx('join'),
  chat: () => music.sfx('chat'),
  dash: () => music.sfx('dash'),
  whirlwind: () => music.sfx('whirlwind'),
  heal: () => music.sfx('heal'),
  unlock: () => music.sfx('unlock'),
  error: () => music.sfx('error'),
  quest_accept: () => music.sfx('quest_accept'),
  quest_ready: () => music.sfx('quest_ready'),
  quest_turnin: () => music.sfx('quest_turnin'),
  pickup: () => music.sfx('pickup'),
};
