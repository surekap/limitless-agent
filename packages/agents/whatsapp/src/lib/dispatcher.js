'use strict';

const crypto = require('crypto');
const axios = require('axios');
const subscriberRepo = require('./subscriberRepo');
const deliveryRepo = require('./deliveryRepo');

const MAX_CONCURRENCY  = parseInt(process.env.WEBHOOK_MAX_CONCURRENCY ?? '20', 10);
const REQUEST_TIMEOUT  = parseInt(process.env.WEBHOOK_TIMEOUT_MS ?? '10000', 10);
const MAX_ATTEMPTS     = 4;
// Delay before each retry (attempt 1 = instant, 2 = 5s, 3 = 30s, 4 = 5min)
const RETRY_DELAYS_MS  = [0, 5_000, 30_000, 300_000];

// ── In-process concurrency limiter ───────────────────────────────────────────
let _running = 0;
const _queue  = [];

function _enqueue(fn) {
  return new Promise((resolve, reject) => {
    _queue.push({ fn, resolve, reject });
    _drain();
  });
}

function _drain() {
  while (_running < MAX_CONCURRENCY && _queue.length > 0) {
    const { fn, resolve, reject } = _queue.shift();
    _running++;
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => { _running--; _drain(); });
  }
}

// ── HMAC signing ──────────────────────────────────────────────────────────────
function _sign(secret, payload) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// ── Core delivery with retry ──────────────────────────────────────────────────

/**
 * Deliver a payload to one subscriber, logging each attempt to webhook_deliveries.
 * Schedules retries with exponential backoff on failure.
 *
 * @param {object} subscriber
 * @param {object} payload
 * @param {number} messageId
 * @param {number} attempt  1-based
 */
async function deliverToSubscriber(subscriber, payload, messageId, attempt = 1) {
  const body    = JSON.stringify(payload);
  const headers = { 'Content-Type': 'application/json' };
  if (subscriber.secret) {
    headers['X-WA-Signature'] = _sign(subscriber.secret, body);
  }

  const deliveryId = await deliveryRepo.insert({
    message_id:    messageId,
    subscriber_id: subscriber.id,
    attempt,
    status:        'pending',
  });

  try {
    const res = await axios.post(subscriber.url, payload, {
      timeout: REQUEST_TIMEOUT,
      headers,
      validateStatus: s => s >= 200 && s < 300,
    });

    await deliveryRepo.resolve(deliveryId, {
      status:        'success',
      http_status:   res.status,
      response_body: String(res.data ?? '').slice(0, 500),
    });
  } catch (err) {
    const httpStatus = err.response?.status ?? null;

    if (attempt < MAX_ATTEMPTS) {
      await deliveryRepo.resolve(deliveryId, {
        status:      'failed',
        http_status: httpStatus,
        error:       err.message,
      });
      const delay = RETRY_DELAYS_MS[attempt] ?? 300_000;
      setTimeout(
        () => _enqueue(() => deliverToSubscriber(subscriber, payload, messageId, attempt + 1)),
        delay
      );
    } else {
      await deliveryRepo.resolve(deliveryId, {
        status:      'exhausted',
        http_status: httpStatus,
        error:       err.message,
      });
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fan-out a saved message to all matching active subscribers.
 * Fire-and-forget: never throws, never blocks the caller.
 *
 * @param {{ id: number, client_id: string, event: string,
 *           chat_id: string|null, group_id: string|null,
 *           data: object, ts: string }} message
 */
function dispatch(message) {
  setImmediate(async () => {
    try {
      const subscribers = await subscriberRepo.findMatching({
        chatId:  message.chat_id,
        groupId: message.group_id,
      });

      if (subscribers.length === 0) return;

      const payload = {
        messageId: message.id,
        clientId:  message.client_id,
        event:     message.event,
        chatId:    message.chat_id,
        groupId:   message.group_id,
        type:      message.data?.type  ?? null,
        body:      message.data?.body  ?? null,
        from:      message.data?.from  ?? null,
        timestamp: message.ts,
        raw:       message.data,
      };

      for (const sub of subscribers) {
        _enqueue(() => deliverToSubscriber(sub, payload, message.id, 1));
      }
    } catch (err) {
      console.error('[dispatcher] fan-out error:', err.message);
    }
  });
}

module.exports = { dispatch, deliverToSubscriber };
