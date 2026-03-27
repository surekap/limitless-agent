'use strict';

const pool = require('./db');

/**
 * Insert a new delivery attempt record.
 * @returns {Promise<number>} inserted delivery id
 */
async function insert({ message_id, subscriber_id, attempt = 1, status = 'pending',
                        http_status = null, response_body = null, error = null }) {
  const res = await pool.query(
    `INSERT INTO webhook_deliveries
       (message_id, subscriber_id, attempt, status, http_status, response_body, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [message_id, subscriber_id, attempt, status, http_status, response_body, error]
  );
  return res.rows[0].id;
}

/**
 * Update an existing delivery record with final outcome.
 * @param {number} id
 * @param {{ status: string, http_status?: number, response_body?: string, error?: string }} outcome
 */
async function resolve(id, { status, http_status = null, response_body = null, error = null }) {
  await pool.query(
    `UPDATE webhook_deliveries
     SET status = $2, http_status = $3, response_body = $4, error = $5, resolved_at = NOW()
     WHERE id = $1`,
    [id, status, http_status, response_body, error]
  );
}

module.exports = { insert, resolve };
