'use strict';
/**
 * Player persistence — MVP repository backed by a single JSON file.
 *
 * Design notes:
 * - `PlayerRepository` is the interface; swap `JsonFileStore` for Redis/SQL
 *   later without touching the game code.
 * - Writes are serialized through a promise queue and applied atomically
 *   (temp file + rename), so a crash never leaves a half-written file.
 * - Resume tokens are stored only as SHA-256 hashes. The raw token lives
 *   on the player's device (localStorage) and is never written to disk.
 * - File format: { schemaVersion, players: { id: record }, tokens: { hash: id } }
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = 1;

// How long a superseded token stays valid, so a client that never received
// the rotated token can retry with the old one (F03). Overridable for tests.
const TOKEN_GRACE_MS = Number(process.env.TOKEN_GRACE_MS) || 120000;
// Far-future expiry marker (JSON-safe; Infinity does not survive stringify).
const NO_EXPIRY = 9007199254740991;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
function newToken() {
  return crypto.randomBytes(32).toString('hex');
}
function newId() {
  return crypto.randomUUID();
}

class PlayerRepository {
  async getById(_id) { throw new Error('not implemented'); }
  async save(_record) { throw new Error('not implemented'); }
  async remove(_id) { throw new Error('not implemented'); }
  /** Valid (unexpired) token entry: { id } | null */
  async tokenEntry(_tokenHash) { throw new Error('not implemented'); }
  async tokenToId(_tokenHash) { throw new Error('not implemented'); }
  async bindToken(_tokenHash, _id) { throw new Error('not implemented'); }
  /**
   * Rotate: the new token becomes current, the old one stays valid for the
   * grace window so a lost welcome is recoverable via idempotent retry.
   */
  async supersedeToken(_oldHash, _newHash, _id) { throw new Error('not implemented'); }
  async pruneTokens() { throw new Error('not implemented'); }
}

class JsonFileStore extends PlayerRepository {
  constructor(filePath) {
    super();
    this.file = filePath;
    this.data = null;
    this.queue = Promise.resolve();
  }

  async _ensure() {
    if (!this.data) await this._load();
    return this.data;
  }

  async _load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' ||
          parsed.schemaVersion !== SCHEMA_VERSION ||
          typeof parsed.players !== 'object' ||
          typeof parsed.tokens !== 'object') {
        throw new Error('bad schema');
      }
      this.data = parsed;
      // migrate pre-grace token format { hash: playerId } -> { hash: { id, exp } }
      for (const [h, e] of Object.entries(this.data.tokens)) {
        if (typeof e === 'string') this.data.tokens[h] = { id: e, exp: NO_EXPIRY };
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // corrupt file: back it up and start fresh rather than crash
        try {
          const bak = this.file + '.corrupt-' + Date.now() + '.bak';
          fs.copyFileSync(this.file, bak);
          console.error('[store] corrupt save file, backed up to', bak);
        } catch { /* best effort */ }
      }
      this.data = { schemaVersion: SCHEMA_VERSION, players: {}, tokens: {} };
    }
  }

  /**
   * Queue an atomic write. F04: failures REJECT the returned promise — the
   * caller decides what to do. The internal queue swallows the error only to
   * stay alive for the next write; it never reports success falsely.
   */
  _persist() {
    const run = this.queue.then(() => {
      const dir = path.dirname(this.file);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = this.file + '.tmp-' + process.pid;
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file); // atomic on POSIX
    });
    this.queue = run.catch(() => {}); // keep the queue alive
    return run;
  }

  async getById(id) {
    const d = await this._ensure();
    return d.players[id] || null;
  }

  async save(record) {
    const d = await this._ensure();
    d.players[record.id] = record;
    await this._persist(); // throws on I/O failure — caller must handle
  }

  async remove(id) {
    const d = await this._ensure();
    delete d.players[id];
    for (const [h, e] of Object.entries(d.tokens)) {
      if (e.id === id) delete d.tokens[h];
    }
    await this._persist();
  }

  /** Unexpired token entry, or null. Lazily drops expired tokens. */
  async tokenEntry(tokenHash) {
    const d = await this._ensure();
    const e = d.tokens[tokenHash];
    if (!e) return null;
    if (e.exp <= Date.now()) { delete d.tokens[tokenHash]; return null; }
    return { id: e.id };
  }

  async tokenToId(tokenHash) {
    const e = await this.tokenEntry(tokenHash);
    return e ? e.id : null;
  }

  async bindToken(tokenHash, id) {
    const d = await this._ensure();
    d.tokens[tokenHash] = { id, exp: NO_EXPIRY };
    await this._persist();
  }

  async supersedeToken(oldHash, newHash, id) {
    const d = await this._ensure();
    const old = d.tokens[oldHash];
    if (old && old.id === id) old.exp = Date.now() + TOKEN_GRACE_MS;
    d.tokens[newHash] = { id, exp: NO_EXPIRY };
    await this._persist();
  }

  async pruneTokens() {
    const d = await this._ensure();
    const now = Date.now();
    let dropped = 0;
    for (const [h, e] of Object.entries(d.tokens)) {
      if (e.exp <= now) { delete d.tokens[h]; dropped++; }
    }
    if (dropped) await this._persist();
    return dropped;
  }

  /**
   * Highest numeric item-uid sequence across ALL saved players (inventory
   * AND equipment). Used at boot so a fresh world never reissues a uid that
   * exists in any record — including records not yet restored (F13).
   */
  async maxItemSeq() {
    const d = await this._ensure();
    let max = 0;
    for (const rec of Object.values(d.players)) {
      const slots = [...(rec.inv || []), rec.equip && rec.equip.weapon, rec.equip && rec.equip.armor];
      for (const s of slots) {
        const m = s && /^i(\d+)$/.exec(s.uid || '');
        if (m) max = Math.max(max, Number(m[1]));
      }
    }
    return max;
  }
}

module.exports = {
  PlayerRepository, JsonFileStore,
  hashToken, newToken, newId, SCHEMA_VERSION, TOKEN_GRACE_MS,
};
