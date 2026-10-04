'use strict';
/**
 * zod schemas for every client→server message.
 * Invalid payloads are rejected by the Router before reaching game logic.
 */
const { z } = require('zod');

const Join = z.object({
  t: z.literal('join'),
  name: z.string().trim().min(1).max(16),
  skin: z.string().max(24).optional(), // validated against config.skins in index.js
});

const Input = z.object({
  t: z.literal('input'),
  x: z.number().min(-1).max(1),
  y: z.number().min(-1).max(1),
});

const Attack = z.object({
  t: z.literal('attack'),
});

const Unlock = z.object({
  t: z.literal('unlock'),
  skill: z.string().max(24),
});

const Allocate = z.object({
  t: z.literal('allocate'),
  passive: z.string().max(24),
});

const Cast = z.object({
  t: z.literal('cast'),
  skill: z.string().max(24),
});

const Npc = z.object({
  t: z.literal('npc'),
  npc: z.string().max(24),
});

const QuestAccept = z.object({
  t: z.literal('quest_accept'),
  quest: z.string().max(32),
});

const QuestTurnIn = z.object({
  t: z.literal('quest_turnin'),
  quest: z.string().max(32),
});

const Chat = z.object({
  t: z.literal('chat'),
  text: z.string().trim().min(1).max(120),
});

module.exports = { Join, Input, Attack, Unlock, Allocate, Cast, Npc, QuestAccept, QuestTurnIn, Chat };
