'use strict';
/**
 * zod schemas for every client→server message.
 * Invalid payloads are rejected by the Router before reaching game logic.
 */
const { z } = require('zod');

const Join = z.object({
  t: z.literal('join'),
  name: z.string().trim().min(1).max(16),
});

const Input = z.object({
  t: z.literal('input'),
  x: z.number().min(-1).max(1),
  y: z.number().min(-1).max(1),
});

const Attack = z.object({
  t: z.literal('attack'),
});

const Chat = z.object({
  t: z.literal('chat'),
  text: z.string().trim().min(1).max(120),
});

module.exports = { Join, Input, Attack, Chat };
