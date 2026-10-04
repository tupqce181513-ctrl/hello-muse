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

const Resume = z.object({
  t: z.literal('resume'),
  token: z.string().length(64), // hex token issued at join/resume
});

const QuestAccept = z.object({
  t: z.literal('quest_accept'),
  quest: z.string().max(32),
});

const QuestTurnIn = z.object({
  t: z.literal('quest_turnin'),
  quest: z.string().max(32),
});

const UseItem = z.object({
  t: z.literal('use_item'),
  uid: z.string().max(16),
});

const Equip = z.object({
  t: z.literal('equip'),
  uid: z.string().max(16),
});

const Unequip = z.object({
  t: z.literal('unequip'),
  slot: z.enum(['weapon', 'armor']),
});

const Chat = z.object({
  t: z.literal('chat'),
  text: z.string().trim().min(1).max(120),
});

module.exports = { Join, Input, Attack, Unlock, Allocate, Cast, Npc, Resume, QuestAccept, QuestTurnIn, UseItem, Equip, Unequip, Chat };
