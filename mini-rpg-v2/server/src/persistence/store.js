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
  async tokenToId(_tokenHash) { throw new Error('not implemented'); }
  async bindToken(_tokenHash, _id) { throw new Error('not implemented'); }
  async unbindToken(_tokenHash) { throw new Error('not implemented'); }
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

  /** Queue an atomic write; concurrent saves never interleave. */
  _persist() {
    this.queue = this.queue
      .then(() => {
        const dir = path.dirname(this.file);
        fs.mkdirSync(dir, { recursive: true });
        const tmp = this.file + '.tmp-' + process.pid;
        fs.writeFileSync(tmp, JSON.stringify(this.data));
        fs.renameSync(tmp, this.file); // atomic on POSIX
      })
      .catch((err) => console.error('[store] write failed:', err.message));
    return this.queue;
  }

  async getById(id) {
    const d = await this._ensure();
    return d.players[id] || null;
  }

  async save(record) {
    const d = await this._ensure();
    d.players[record.id] = record;
    await this._persist();
  }

  async remove(id) {
    const d = await this._ensure();
    delete d.players[id];
    for (const [h, pid] of Object.entries(d.tokens)) {
      if (pid === id) delete d.tokens[h];
    }
    await this._persist();
  }

  async tokenToId(tokenHash) {
    const d = await this._ensure();
    return d.tokens[tokenHash] || null;
  }

  async bindToken(tokenHash, id) {
    const d = await this._ensure();
    d.tokens[tokenHash] = id;
    await this._persist();
  }

  async unbindToken(tokenHash) {
    const d = await this._ensure();
    delete d.tokens[tokenHash];
    await this._persist();
  }
}

module.exports = {
  PlayerRepository, JsonFileStore,
  hashToken, newToken, newId, SCHEMA_VERSION,
};
