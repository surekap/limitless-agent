'use strict';

const pool = require('./db');

async function create({ name, url, secret = null }) {
  const res = await pool.query(
    `INSERT INTO subscribers (name, url, secret)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name, url, secret]
  );
  const sub = res.rows[0];
  sub.filters = [];
  return sub;
}

async function listAll() {
  const subs = await pool.query(
    'SELECT * FROM subscribers ORDER BY created_at DESC'
  );
  if (subs.rows.length === 0) return [];

  const ids = subs.rows.map(s => s.id);
  const filters = await pool.query(
    'SELECT * FROM filters WHERE subscriber_id = ANY($1::uuid[]) ORDER BY created_at',
    [ids]
  );

  const filterMap = {};
  for (const f of filters.rows) {
    if (!filterMap[f.subscriber_id]) filterMap[f.subscriber_id] = [];
    filterMap[f.subscriber_id].push(f);
  }

  return subs.rows.map(s => ({ ...s, filters: filterMap[s.id] ?? [] }));
}

async function getById(id) {
  const res = await pool.query('SELECT * FROM subscribers WHERE id = $1', [id]);
  if (!res.rows[0]) return null;
  const sub = res.rows[0];
  const fRes = await pool.query(
    'SELECT * FROM filters WHERE subscriber_id = $1 ORDER BY created_at',
    [id]
  );
  sub.filters = fRes.rows;
  return sub;
}

async function update(id, patch) {
  const allowed = ['name', 'url', 'secret', 'active'];
  const keys = Object.keys(patch).filter(k => allowed.includes(k));
  if (keys.length === 0) throw new Error('No valid fields to update');

  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = keys.map(k => patch[k]);
  const res = await pool.query(
    `UPDATE subscribers SET ${sets}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, ...values]
  );
  return res.rows[0] ?? null;
}

async function remove(id) {
  await pool.query('DELETE FROM subscribers WHERE id = $1', [id]);
}

async function addFilter(subscriberId, { chat_id = null, group_id = null } = {}) {
  if (!chat_id && !group_id) {
    throw new Error('Filter must specify at least one of chat_id or group_id');
  }
  const res = await pool.query(
    `INSERT INTO filters (subscriber_id, chat_id, group_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [subscriberId, chat_id, group_id]
  );
  return res.rows[0];
}

async function removeFilter(filterId) {
  await pool.query('DELETE FROM filters WHERE id = $1', [filterId]);
}

/**
 * Return active subscribers whose filters match the given message.
 * A subscriber with no filters is a catch-all and always matches.
 * Matching: subscriber included if ANY filter row satisfies:
 *   (filter.chat_id IS NULL OR filter.chat_id = chatId)
 *   AND (filter.group_id IS NULL OR filter.group_id = groupId)
 */
async function findMatching({ chatId, groupId }) {
  const res = await pool.query(
    `SELECT DISTINCT s.*
     FROM subscribers s
     WHERE s.active = TRUE
       AND (
         NOT EXISTS (SELECT 1 FROM filters f2 WHERE f2.subscriber_id = s.id)
         OR EXISTS (
           SELECT 1 FROM filters f
           WHERE f.subscriber_id = s.id
             AND (f.chat_id  IS NULL OR f.chat_id  = $1)
             AND (f.group_id IS NULL OR f.group_id = $2)
         )
       )`,
    [chatId ?? null, groupId ?? null]
  );
  return res.rows;
}

module.exports = { create, listAll, getById, update, remove, addFilter, removeFilter, findMatching };
