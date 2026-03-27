'use strict';

const pool = require('./db');

/**
 * Fetch a single message row by primary key.
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function getById(id) {
  const res = await pool.query('SELECT * FROM messages WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

/**
 * Fetch recent messages with optional filters.
 * @param {{ chatId?: string, groupId?: string, limit?: number, before?: number }} opts
 * @returns {Promise<object[]>}
 */
async function list({ chatId, groupId, limit = 50, before } = {}) {
  const conditions = [];
  const params = [];

  if (chatId) {
    params.push(chatId);
    conditions.push(`chat_id = $${params.length}`);
  }
  if (groupId) {
    params.push(groupId);
    conditions.push(`group_id = $${params.length}`);
  }
  if (before) {
    params.push(before);
    conditions.push(`id < $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);
  const res = await pool.query(
    `SELECT * FROM messages ${where} ORDER BY ts DESC LIMIT $${params.length}`,
    params
  );
  return res.rows;
}

/**
 * Return distinct chats seen, for filter-setup UI.
 * @returns {Promise<{chat_id: string, group_id: string|null, last_seen: string}[]>}
 */
async function listChats() {
  const res = await pool.query(`
    SELECT DISTINCT ON (chat_id) chat_id, group_id, ts AS last_seen
    FROM messages
    WHERE chat_id IS NOT NULL
    ORDER BY chat_id, ts DESC
  `);
  return res.rows;
}

module.exports = { getById, list, listChats };
