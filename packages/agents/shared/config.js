'use strict'

const db = require('@secondbrain/db')

// In-memory TTL cache: key → { value, expiresAt }
const CACHE_TTL_MS = 60 * 1000
const _cache = new Map()

/**
 * Read a config value.
 * key format: '<schema>.<key>'  e.g. 'system.TAVILY_API_KEY' or 'email.gmail_accounts'
 * Returns the parsed JSONB value, or null if not found.
 */
async function getConfig(key) {
  const now = Date.now()
  const cached = _cache.get(key)
  if (cached && cached.expiresAt > now) return cached.value

  const [schema, ...rest] = key.split('.')
  const dbKey = rest.join('.')

  const { rows } = await db.query(
    `SELECT value FROM ${schema}.config WHERE key = $1`,
    [dbKey]
  )
  const value = rows.length > 0 ? rows[0].value : null
  _cache.set(key, { value, expiresAt: now + CACHE_TTL_MS })
  return value
}

/**
 * Write a config value (upsert) and invalidate the cache entry.
 * value: any JSON-serialisable value
 */
async function setConfig(key, value) {
  const [schema, ...rest] = key.split('.')
  const dbKey = rest.join('.')

  await db.query(
    `INSERT INTO ${schema}.config (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [dbKey, JSON.stringify(value)]
  )
  _cache.delete(key)
}

/**
 * Invalidate all cache entries (called after bulk config save).
 */
function invalidateCache() {
  _cache.clear()
}

module.exports = { getConfig, setConfig, invalidateCache }
