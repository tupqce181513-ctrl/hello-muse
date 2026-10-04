'use strict';
/**
 * Router — maps message types to (zod schema, handler) pairs.
 *
 * To add a new message type:
 *   1. Add a zod schema in schemas.js
 *   2. router.on('myType', schemas.MyType, (ctx, msg) => { ... })
 *
 * ctx = { ws, world, player }  (player is null until 'join')
 */
class Router {
  constructor() {
    this.handlers = new Map();
  }

  on(type, schema, handler) {
    this.handlers.set(type, { schema, handler });
  }

  handle(ctx, raw) {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return; // not JSON — ignore
    }
    const h = this.handlers.get(m && m.t);
    if (!h) return; // unknown type — ignore
    const r = h.schema.safeParse(m);
    if (!r.success) return; // invalid payload — ignore
    // handlers may be async (persistence); never let a rejection crash the loop
    Promise.resolve(h.handler(ctx, r.data)).catch((err) => {
      console.error('[router] handler error for', m.t, err.message);
    });
  }
}

module.exports = { Router };
