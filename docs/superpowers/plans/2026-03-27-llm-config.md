# LLM Config & Agents Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all non-DATABASE_URL config from `.env.local` into Postgres, add a DB-driven LLM provider registry with per-agent priority and automatic fallback, and redesign the Agents page UI with Logs/Config/LLM tabs.

**Architecture:** A new `system` schema holds named LLM credentials (`system.llm_providers`), per-agent ordered priority lists (`system.agent_llm_priority`), per-call usage logs (`system.llm_usage`), and shared config (`system.config`). A new `packages/agents/shared/llm.js` replaces `ai-client.js` — it reads provider config from DB (60s memory cache), tries providers in priority order, logs every call, marks credits exhausted on billing errors. On server startup, `migrateEnvToDb()` seeds `.env.local` values into the DB (idempotent).

**Tech Stack:** Node.js CommonJS, PostgreSQL (pg Pool), Express, Next.js 14 React (no new npm packages needed — `@anthropic-ai/sdk`, `openai`, `@google/generative-ai` already installed)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/agents/shared/sql/system-schema.sql` | Create | DDL for system.* tables + per-agent config tables |
| `packages/agents/shared/config.js` | Create | getConfig/setConfig with 60s TTL cache |
| `packages/agents/shared/llm.js` | Create | DB-driven LLM client, replaces ai-client.js |
| `packages/ui/server.js` | Modify | migrateEnvToDb() on startup + 8 new /api/system/* endpoints |
| `packages/agents/relationships/services/opportunities.js` | Modify | Replace direct Anthropic calls with llm.create('relationships', ...) |
| `packages/agents/relationships/services/analyzer.js` | Modify | Replace aiClient.create with llm.create('relationships', ...) |
| `packages/agents/projects/services/analyzer.js` | Modify | Replace aiClient.create with llm.create('projects', ...) |
| `packages/agents/projects/services/classifier.js` | Modify | Replace aiClient.create with llm.create('projects', ...) |
| `packages/agents/projects/services/discoverer.js` | Modify | Replace aiClient.create with llm.create('projects', ...) |
| `packages/agents/limitless/agent.js` | Modify | Replace aiClient.create with llm.create('limitless', ...) |
| `packages/agents/research/index.js` | Modify | Replace direct Anthropic with llm.create('research', ...) |
| `packages/agents/research/providers/tavily.js` | Modify | Read TAVILY_API_KEY from getConfig |
| `packages/agents/research/providers/openai.js` | Modify | Read OPENAI_API_KEY from getConfig |
| `packages/agents/research/providers/peopledatalabs.js` | Modify | Read PEOPLEDATALABS_API_KEY from getConfig |
| `packages/agents/research/providers/serpapi.js` | Modify | Read SERPAPI_API_KEY from getConfig |
| `packages/ui/services/embedder.js` | Modify | Read GEMINI_API_KEY from getConfig (Gemini embedding provider) |
| `packages/ui/app/agents/page.jsx` | Modify | Redesign: Global LLM panel + Logs/Config/LLM tabs per agent |

---

### Task 1: System Schema SQL

**Files:**
- Create: `packages/agents/shared/sql/system-schema.sql`

- [ ] **Step 1: Create the SQL file**

```sql
-- packages/agents/shared/sql/system-schema.sql
-- Run once (or via runSystemSchema on server startup — idempotent)

CREATE SCHEMA IF NOT EXISTS system;

-- Named LLM credential registry
CREATE TABLE IF NOT EXISTS system.llm_providers (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  provider_type TEXT NOT NULL
    CHECK (provider_type IN ('anthropic','claude_cli','openai','gemini')),
  api_key       TEXT,
  model         TEXT,
  is_enabled    BOOLEAN NOT NULL DEFAULT true,
  has_credits   BOOLEAN NOT NULL DEFAULT true,
  last_error    TEXT,
  last_error_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-agent ordered provider list
CREATE TABLE IF NOT EXISTS system.agent_llm_priority (
  agent_id    TEXT NOT NULL,
  provider_id INT NOT NULL REFERENCES system.llm_providers(id) ON DELETE CASCADE,
  priority    INT NOT NULL,
  PRIMARY KEY (agent_id, provider_id)
);
CREATE INDEX IF NOT EXISTS agent_llm_priority_order
  ON system.agent_llm_priority (agent_id, priority);

-- Per-call usage log
CREATE TABLE IF NOT EXISTS system.llm_usage (
  id          BIGSERIAL PRIMARY KEY,
  provider_id INT REFERENCES system.llm_providers(id) ON DELETE SET NULL,
  agent_id    TEXT NOT NULL,
  tokens_in   INT,
  tokens_out  INT,
  cost_usd    NUMERIC(10,6),
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS llm_usage_provider_time
  ON system.llm_usage (provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS llm_usage_agent_time
  ON system.llm_usage (agent_id, created_at DESC);

-- Shared cross-agent key-value config
CREATE TABLE IF NOT EXISTS system.config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-agent config tables (one per schema that exists)
CREATE TABLE IF NOT EXISTS email.config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS limitless.config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS projects.config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS relationships.config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Note: `research.config` is omitted — the research agent has no schema of its own (it reads from `relationships.*`). Research API keys go in `system.config`.

- [ ] **Step 2: Verify the file is syntactically valid**

```bash
psql $DATABASE_URL -f packages/agents/shared/sql/system-schema.sql
```

Expected: no errors. Tables visible via `\dt system.*` in psql.

- [ ] **Step 3: Commit**

```bash
git add packages/agents/shared/sql/system-schema.sql
git commit -m "feat: add system schema SQL for LLM config registry"
```

---

### Task 2: Config Helper

**Files:**
- Create: `packages/agents/shared/config.js`

- [ ] **Step 1: Write the config helper**

```js
// packages/agents/shared/config.js
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
```

- [ ] **Step 2: Smoke-test manually after server starts**

After the server has run the schema migration (Task 3), open a node REPL in the repo root:

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const { getConfig, setConfig } = require('./packages/agents/shared/config');
setConfig('system.TEST_KEY', 'hello').then(() => getConfig('system.TEST_KEY')).then(v => { console.log('value:', v); process.exit(0); });
"
```

Expected: `value: hello`

- [ ] **Step 3: Commit**

```bash
git add packages/agents/shared/config.js
git commit -m "feat: add shared config helper with 60s TTL cache"
```

---

### Task 3: Config Migration on Server Startup

**Files:**
- Modify: `packages/ui/server.js`

This task adds `runSystemSchema()` (runs the DDL) and `migrateEnvToDb()` (seeds `.env.local` → DB) called at the top of `server.js` before the Express app starts.

- [ ] **Step 1: Add the schema runner and migration to server.js**

Find the bootstrap section in `server.js` (around line 13, just after the `dotenv.config` call). Add the following two functions and their startup call:

```js
// ── Schema + Config Migration ──────────────────────────────────────────────────

async function runSystemSchema() {
  const sql = fs.readFileSync(
    path.resolve(__dirname, '../agents/shared/sql/system-schema.sql'),
    'utf8'
  )
  await db.query(sql)
  console.log('[server] system schema ensured')
}

// Map from env var name → { schema, key } destination in DB
const ENV_TO_DB = {
  LIMITLESS_API_KEY:      { schema: 'system', key: 'LIMITLESS_API_KEY' },
  TAVILY_API_KEY:         { schema: 'system', key: 'TAVILY_API_KEY' },
  PEOPLEDATALABS_API_KEY: { schema: 'system', key: 'PEOPLEDATALABS_API_KEY' },
  SERPAPI_API_KEY:        { schema: 'system', key: 'SERPAPI_API_KEY' },
  NOTION_TOKEN:           { schema: 'system', key: 'NOTION_TOKEN' },
  TODOIST_API_KEY:        { schema: 'system', key: 'TODOIST_API_KEY' },
  PERPLEXITY_API_KEY:     { schema: 'system', key: 'PERPLEXITY_API_KEY' },
  GEMINI_API_KEY:         { schema: 'system', key: 'GEMINI_API_KEY' },
  GMAIL_EMAIL_1:          { schema: 'email',  key: 'gmail_accounts' },  // see below
  LIMITLESS_TIMEZONE:     { schema: 'limitless', key: 'fetch_cron' },   // see note
}

async function migrateEnvToDb() {
  const { setConfig, getConfig } = require('../agents/shared/config')
  let migrated = 0

  // Simple string keys
  const simpleKeys = [
    'LIMITLESS_API_KEY','TAVILY_API_KEY','PEOPLEDATALABS_API_KEY',
    'SERPAPI_API_KEY','NOTION_TOKEN','TODOIST_API_KEY','PERPLEXITY_API_KEY',
    'GEMINI_API_KEY','ANTHROPIC_API_KEY','OPENAI_API_KEY',
  ]
  for (const envKey of simpleKeys) {
    if (!process.env[envKey]) continue
    const existing = await getConfig(`system.${envKey}`)
    if (existing == null) {
      await setConfig(`system.${envKey}`, process.env[envKey])
      migrated++
    }
  }

  // Gmail accounts: build array from GMAIL_EMAIL_N / GMAIL_APP_PASSWORD_N pairs
  const existing = await getConfig('email.gmail_accounts')
  if (existing == null) {
    const accounts = []
    for (let i = 1; ; i++) {
      const email = process.env[`GMAIL_EMAIL_${i}`]
      const pass  = process.env[`GMAIL_APP_PASSWORD_${i}`]
      if (!email) break
      accounts.push({ email, app_password: pass || '' })
    }
    if (accounts.length > 0) {
      await setConfig('email.gmail_accounts', accounts)
      migrated++
    }
  }

  // Limitless fetch config
  const ltExisting = await getConfig('limitless.fetch_days')
  if (ltExisting == null && process.env.FETCH_DAYS) {
    await setConfig('limitless.fetch_days', Number(process.env.FETCH_DAYS))
    migrated++
  }

  if (migrated > 0) console.log(`[server] migrated ${migrated} config keys from .env.local to DB`)
}
```

- [ ] **Step 2: Call both functions at server startup**

Find where the Express app starts listening (the `app.listen(...)` call, near the bottom of server.js). Add a startup sequence before it:

```js
// Replace the current app.listen call with this pattern:
async function startServer() {
  if (db) {
    try {
      await runSystemSchema()
      await migrateEnvToDb()
    } catch (err) {
      console.error('[server] startup migration failed:', err.message)
    }
  }

  const PORT = process.env.UI_PORT || 4001
  app.listen(PORT, () => console.log(`[ui] API server on :${PORT}`))
}

startServer()
```

(Remove the existing bare `app.listen(...)` call.)

- [ ] **Step 3: Verify migration runs on startup**

```bash
node packages/ui/server.js &
sleep 2
# Look for the migration log line:
# [server] system schema ensured
# [server] migrated N config keys from .env.local to DB
```

Also verify in psql:

```bash
psql $DATABASE_URL -c "SELECT key, value FROM system.config ORDER BY key;"
```

Expected: rows for ANTHROPIC_API_KEY, TAVILY_API_KEY, etc. with their values from .env.local.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/server.js
git commit -m "feat: run system schema + migrate .env.local config to DB on startup"
```

---

### Task 4: LLM Client (llm.js)

**Files:**
- Create: `packages/agents/shared/llm.js`

This is the core new module. It reads provider priority from DB (60s cache), tries providers in order, logs usage, marks `has_credits=false` on billing errors.

- [ ] **Step 1: Write llm.js**

```js
// packages/agents/shared/llm.js
'use strict'

const db = require('@secondbrain/db')

// ── Cost rate table (per 1k tokens, USD) ─────────────────────────────────────

const RATES = {
  anthropic: {
    'claude-sonnet-4-6': { in: 0.003,   out: 0.015   },
    'claude-opus-4-6':   { in: 0.015,   out: 0.075   },
    'claude-haiku-4-5':  { in: 0.00025, out: 0.00125 },
  },
  openai: {
    'gpt-4o':      { in: 0.0025,  out: 0.010  },
    'gpt-4o-mini': { in: 0.00015, out: 0.0006 },
  },
  gemini: {
    'gemini-2.0-flash': { in: 0.00035, out: 0.00105 },
  },
}

function calcCost(providerType, model, tokensIn, tokensOut) {
  const r = RATES[providerType]?.[model]
  if (!r || tokensIn == null || tokensOut == null) return null
  return (tokensIn / 1000) * r.in + (tokensOut / 1000) * r.out
}

// ── Priority list cache ───────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 1000
const _priorityCache = new Map()  // agentId → { providers, expiresAt }

async function getPriorityList(agentId) {
  const now = Date.now()
  const cached = _priorityCache.get(agentId)
  if (cached && cached.expiresAt > now) return cached.providers

  const { rows } = await db.query(`
    SELECT p.id, p.name, p.provider_type, p.api_key, p.model,
           p.is_enabled, p.has_credits
    FROM system.agent_llm_priority alp
    JOIN system.llm_providers p ON p.id = alp.provider_id
    WHERE alp.agent_id = $1
      AND p.is_enabled = true
      AND p.has_credits = true
    ORDER BY alp.priority ASC
  `, [agentId])

  _priorityCache.set(agentId, { providers: rows, expiresAt: now + CACHE_TTL_MS })
  return rows
}

function invalidatePriorityCache(agentId) {
  if (agentId) _priorityCache.delete(agentId)
  else _priorityCache.clear()
}

// ── Credit error detection ────────────────────────────────────────────────────

function isCreditError(err) {
  const status = err.status || err.statusCode || (err.response && err.response.status)
  if (status === 402) return true
  // Anthropic
  if (err.error?.type === 'credit_balance_too_low') return true
  // OpenAI: 429 with insufficient_quota code
  if (status === 429 && err.error?.code === 'insufficient_quota') return true
  // Gemini RESOURCE_EXHAUSTED with billing context
  if (err.status === 'RESOURCE_EXHAUSTED') return true
  const msg = (err.message || '').toLowerCase()
  if (msg.includes('credit') && msg.includes('balance')) return true
  if (msg.includes('insufficient_quota')) return true
  return false
}

// ── Usage logging ─────────────────────────────────────────────────────────────

async function logUsage({ providerId, agentId, tokensIn, tokensOut, costUsd, error }) {
  try {
    await db.query(
      `INSERT INTO system.llm_usage (provider_id, agent_id, tokens_in, tokens_out, cost_usd, error)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [providerId || null, agentId, tokensIn || null, tokensOut || null,
       costUsd != null ? costUsd.toFixed(6) : null, error || null]
    )
  } catch (e) {
    console.warn('[llm] usage log failed:', e.message)
  }
}

async function markCreditsFailed(providerId, errorMsg) {
  try {
    await db.query(
      `UPDATE system.llm_providers
       SET has_credits = false, last_error = $2, last_error_at = NOW()
       WHERE id = $1`,
      [providerId, errorMsg]
    )
    invalidatePriorityCache()
  } catch (e) {
    console.warn('[llm] markCreditsFailed error:', e.message)
  }
}

// ── Provider call implementations ─────────────────────────────────────────────

// Anthropic message format helpers (same as ai-client.js)
function toAnthropicMessages(messages) {
  const systemMsg = messages.find(m => m.role === 'system')
  const nonSystem = messages.filter(m => m.role !== 'system')
  const converted = nonSystem.map(m => {
    if (m.role === 'tool') {
      return { role: 'user', content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content }] }
    }
    if (m.role === 'assistant' && m.tool_calls?.length > 0) {
      const blocks = []
      if (m.content) blocks.push({ type: 'text', text: m.content })
      for (const tc of m.tool_calls) blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
      return { role: 'assistant', content: blocks }
    }
    return { role: m.role, content: Array.isArray(m.content) ? m.content : (m.content || '') }
  })
  return { systemMsg: systemMsg ? systemMsg.content : undefined, converted }
}

function parseAnthropicResponse(response) {
  let text = null
  const tool_calls = []
  for (const block of (response.content || [])) {
    if (block.type === 'text') text = block.text
    else if (block.type === 'tool_use') tool_calls.push({ id: block.id, name: block.name, input: block.input })
  }
  let stop_reason = 'end_turn'
  if (response.stop_reason === 'tool_use') stop_reason = 'tool_use'
  else if (response.stop_reason === 'max_tokens') stop_reason = 'max_tokens'
  return { text, tool_calls, stop_reason, tokensIn: response.usage?.input_tokens, tokensOut: response.usage?.output_tokens }
}

async function callAnthropic(provider, { system, messages, tools, max_tokens }) {
  const Anthropic = require('@anthropic-ai/sdk')
  if (!provider.api_key) throw Object.assign(new Error('Anthropic API key not configured'), { status: 402 })
  const anthropic = new Anthropic.default({ apiKey: provider.api_key })
  const { systemMsg, converted } = toAnthropicMessages(messages)
  const params = {
    model: provider.model || 'claude-sonnet-4-6',
    max_tokens: max_tokens || 4096,
    messages: converted,
  }
  const effectiveSystem = system || systemMsg
  if (effectiveSystem) params.system = effectiveSystem
  if (tools?.length) {
    params.tools = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }))
  }
  const response = await anthropic.messages.create(params)
  return parseAnthropicResponse(response)
}

async function callOpenAI(provider, { system, messages, tools, max_tokens }) {
  const OpenAI = require('openai')
  if (!provider.api_key) throw Object.assign(new Error('OpenAI API key not configured'), { status: 402 })
  const openai = new OpenAI.default({ apiKey: provider.api_key })
  const oaiMessages = messages.map(m => {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content }
    if (m.role === 'assistant' && m.tool_calls?.length > 0) {
      return {
        role: 'assistant', content: m.content || null,
        tool_calls: m.tool_calls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.input) } })),
      }
    }
    if (Array.isArray(m.content)) {
      return { role: m.role, content: m.content.map(b => b.type === 'text' ? { type: 'text', text: b.text } : { type: 'image_url', image_url: { url: `data:${b.source?.media_type};base64,${b.source?.data}` } }) }
    }
    return { role: m.role, content: m.content || '' }
  })
  const hasSystem = oaiMessages.some(m => m.role === 'system')
  if (system && !hasSystem) oaiMessages.unshift({ role: 'system', content: system })
  const params = { model: provider.model || 'gpt-4o', max_tokens: max_tokens || 4096, messages: oaiMessages }
  if (tools?.length) {
    params.tools = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }))
  }
  const response = await openai.chat.completions.create(params)
  const choice = response.choices[0]
  const msg = choice.message
  const tool_calls = (msg.tool_calls || []).map(tc => ({ id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments) }))
  let stop_reason = 'end_turn'
  if (choice.finish_reason === 'tool_calls') stop_reason = 'tool_use'
  else if (choice.finish_reason === 'length') stop_reason = 'max_tokens'
  return { text: msg.content || null, tool_calls, stop_reason, tokensIn: response.usage?.prompt_tokens, tokensOut: response.usage?.completion_tokens }
}

async function callClaudeCLI(provider, { system, messages, max_tokens }) {
  const { spawn } = require('child_process')
  const claudePath = 'claude'
  const modelAlias = (provider.model || 'claude-sonnet-4-6').replace('claude-', '').split('-')[0]
  const lines = []
  for (const m of messages) {
    if (m.role === 'system') continue
    const role = m.role === 'assistant' ? 'Assistant' : 'User'
    const content = Array.isArray(m.content)
      ? m.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
      : (m.content || '')
    if (content) lines.push(`${role}: ${content}`)
  }
  const prompt = lines.join('\n\n')
  if (!prompt.trim()) throw new Error('[claude-cli] empty prompt')
  const args = ['--print', '--output-format', 'json', '--model', modelAlias, '--no-session-persistence', '--max-turns', '1']
  if (system) args.push('--system-prompt', system)

  return new Promise((resolve, reject) => {
    const { ANTHROPIC_API_KEY: _1, OPENAI_API_KEY: _2, ...cliEnv } = process.env
    const child = spawn(claudePath, args, { env: cliEnv })
    let stdout = '', stderr = ''
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`[claude-cli] exited ${code}: ${stderr.slice(0, 300)}`))
      try {
        const json = JSON.parse(stdout.trim())
        if (json.is_error || json.subtype !== 'success') return reject(new Error(`[claude-cli] error: ${json.result || JSON.stringify(json).slice(0, 200)}`))
        resolve({ text: json.result || null, tool_calls: [], stop_reason: json.stop_reason || 'end_turn', tokensIn: null, tokensOut: null })
      } catch (e) {
        reject(new Error(`[claude-cli] JSON parse failed: ${e.message}`))
      }
    })
    child.stdin.write(prompt)
    child.stdin.end()
    setTimeout(() => { child.kill(); reject(new Error('[claude-cli] timeout after 300s')) }, 300000)
  })
}

async function callGemini(provider, { system, messages, max_tokens }) {
  const { GoogleGenerativeAI } = require('@google/generative-ai')
  if (!provider.api_key) throw Object.assign(new Error('Gemini API key not configured'), { status: 402 })
  const genAI = new GoogleGenerativeAI(provider.api_key)
  const model = genAI.getGenerativeModel({ model: provider.model || 'gemini-2.0-flash' })
  // Flatten to single user prompt for simplicity
  const textParts = messages.filter(m => m.role !== 'system').map(m => {
    const content = Array.isArray(m.content)
      ? m.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
      : (m.content || '')
    return content
  })
  const systemMsg = messages.find(m => m.role === 'system')
  const prompt = (systemMsg ? systemMsg.content + '\n\n' : (system ? system + '\n\n' : '')) + textParts.join('\n')
  const result = await model.generateContent(prompt)
  const text = result.response.text()
  const usage = result.response.usageMetadata
  return { text, tool_calls: [], stop_reason: 'end_turn', tokensIn: usage?.promptTokenCount, tokensOut: usage?.candidatesTokenCount }
}

// ── Public API ────────────────────────────────────────────────────────────────

const CALL_FNS = {
  anthropic:  callAnthropic,
  openai:     callOpenAI,
  claude_cli: callClaudeCLI,
  gemini:     callGemini,
}

/**
 * Create an LLM response using the agent's priority list.
 * Automatically falls back on credit/quota errors.
 *
 * @param {string} agentId   e.g. 'relationships', 'projects', 'limitless', 'research', 'email'
 * @param {object} opts      { messages, system?, tools?, max_tokens? }
 * @returns {{ text, tool_calls, stop_reason, provider }}
 */
async function create(agentId, { system, messages, tools, max_tokens }) {
  const providers = await getPriorityList(agentId)

  if (providers.length === 0) {
    // Fallback: check for env-var credentials (backward compat during transition)
    if (process.env.ANTHROPIC_API_KEY) {
      console.warn(`[llm] no DB providers for ${agentId}, falling back to env ANTHROPIC_API_KEY`)
      const result = await callAnthropic(
        { api_key: process.env.ANTHROPIC_API_KEY, model: 'claude-sonnet-4-6' },
        { system, messages, tools, max_tokens }
      )
      return { ...result, provider: 'anthropic-env' }
    }
    throw new Error(`[llm] no providers configured for agent: ${agentId}`)
  }

  const errors = []
  for (const prov of providers) {
    const fn = CALL_FNS[prov.provider_type]
    if (!fn) continue

    console.log(`[llm:${agentId}] trying ${prov.name} (${prov.provider_type})`)
    try {
      const result = await fn(prov, { system, messages, tools, max_tokens })
      const cost = calcCost(prov.provider_type, prov.model, result.tokensIn, result.tokensOut)
      await logUsage({ providerId: prov.id, agentId, tokensIn: result.tokensIn, tokensOut: result.tokensOut, costUsd: cost })
      return { text: result.text, tool_calls: result.tool_calls, stop_reason: result.stop_reason, provider: prov.name }
    } catch (err) {
      console.warn(`[llm:${agentId}] ${prov.name} failed: ${err.message}`)
      if (isCreditError(err)) {
        await markCreditsFailed(prov.id, err.message)
        console.warn(`[llm:${agentId}] marked ${prov.name} credits exhausted, trying next`)
      }
      await logUsage({ providerId: prov.id, agentId, error: err.message })
      errors.push(`${prov.name}: ${err.message}`)
    }
  }

  throw new AggregateError(errors.map(e => new Error(e)), `[llm:${agentId}] all providers failed: ${errors.join('; ')}`)
}

/**
 * Embedding call using a Gemini provider from the agent's priority list.
 * Falls back to GEMINI_API_KEY env var if no DB provider configured.
 */
async function embed(agentId, text) {
  // Find first gemini provider for this agent
  const providers = await getPriorityList(agentId)
  const geminiProv = providers.find(p => p.provider_type === 'gemini')

  const apiKey = geminiProv?.api_key || process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('[llm] no Gemini API key available for embedding')

  const { GoogleGenerativeAI } = require('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-2-preview' })
  const result = await model.embedContent({
    content: { parts: [{ text: text.slice(0, 8000) }], role: 'user' },
    taskType: 'RETRIEVAL_DOCUMENT',
  })
  return result.embedding.values
}

module.exports = { create, embed, invalidatePriorityCache }
```

- [ ] **Step 2: Add a Gemini provider for the `search` agent to the DB (so embedder works)**

This is done via the new API endpoints (Task 7) or directly in psql. For now, the env-var fallback in `embed()` keeps the embedder working without DB config.

- [ ] **Step 3: Verify llm.js is require-able without errors**

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const llm = require('./packages/agents/shared/llm');
console.log('llm loaded, exports:', Object.keys(llm));
"
```

Expected: `llm loaded, exports: [ 'create', 'embed', 'invalidatePriorityCache' ]`

- [ ] **Step 4: Commit**

```bash
git add packages/agents/shared/llm.js
git commit -m "feat: add DB-driven LLM client with fallback and usage logging"
```

---

### Task 5: Migrate All LLM Callers

**Files:**
- Modify: `packages/agents/relationships/services/opportunities.js`
- Modify: `packages/agents/relationships/services/analyzer.js`
- Modify: `packages/agents/projects/services/analyzer.js`
- Modify: `packages/agents/projects/services/classifier.js`
- Modify: `packages/agents/projects/services/discoverer.js`
- Modify: `packages/agents/limitless/agent.js`
- Modify: `packages/agents/research/index.js`

**Pattern to apply in each file:**

Remove:
```js
const Anthropic = require('@anthropic-ai/sdk')
const MODEL = 'claude-sonnet-4-6'
let client = null
function getClient() {
  if (!client) client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}
// or:
const aiClient = require('../../shared/ai-client')
```

Add at top of file:
```js
const llm = require('../../shared/llm')
// (adjust path: for limitless/agent.js: '../shared/llm', for research/index.js: '../shared/llm')
```

Change each call:
```js
// Before (direct Anthropic SDK):
const response = await getClient().messages.create({ model: MODEL, max_tokens: N, messages: [...] })
const text = response.content[0]?.text || ''

// After:
const response = await llm.create('relationships', { max_tokens: N, messages: [...] })
const text = response.text || ''

// Before (aiClient):
const response = await aiClient.create({ max_tokens: N, messages: [...] })

// After:
const response = await llm.create('relationships', { max_tokens: N, messages: [...] })
```

**The `agentId` to use per file:**

| File | agentId |
|------|---------|
| `relationships/services/opportunities.js` | `'relationships'` |
| `relationships/services/analyzer.js` | `'relationships'` |
| `projects/services/analyzer.js` | `'projects'` |
| `projects/services/classifier.js` | `'projects'` |
| `projects/services/discoverer.js` | `'projects'` |
| `limitless/agent.js` | `'limitless'` |
| `research/index.js` | `'research'` |

**Special case — `limitless/agent.js`:** The file uses `aiClient.create` with `tools` (MCP tool use). The `llm.create` signature is identical — just add `agentId` as first arg:

```js
// Before:
const response = await aiClient.create({
  system: systemPrompt,
  messages: conversationHistory,
  tools: this.tools,
  max_tokens: 8096,
})

// After:
const response = await llm.create('limitless', {
  system: systemPrompt,
  messages: conversationHistory,
  tools: this.tools,
  max_tokens: 8096,
})
```

**Special case — `research/index.js`:** Uses direct Anthropic SDK response format. The `llm.create` response has `text` at the top level (not `response.content[0].text`):

```js
// Before:
const response = await getAnthropic().messages.create({
  model: MODEL, max_tokens: 400, messages: [{ role: 'user', content: prompt }],
})
return response.content?.[0]?.text?.trim() || null

// After:
const response = await llm.create('research', {
  max_tokens: 400, messages: [{ role: 'user', content: prompt }],
})
return response.text?.trim() || null
```

**Also remove from research/index.js:**
```js
// Remove these lines:
const Anthropic = require('@anthropic-ai/sdk')
const MODEL = 'claude-sonnet-4-6'
let anthropic = null
function getAnthropic() { ... }
```

- [ ] **Step 1: Update opportunities.js**

Remove the `Anthropic` import, `MODEL` constant, `client` singleton, and `getClient()` function. Add `const llm = require('../../shared/llm')`. Change all 5 `getClient().messages.create(...)` calls to `llm.create('relationships', ...)` and change `response.content[0]?.text` to `response.text`.

- [ ] **Step 2: Update relationships/services/analyzer.js**

Remove `const aiClient = require('../../shared/ai-client')`. Add `const llm = require('../../shared/llm')`. Change all 4 `aiClient.create(...)` calls to `llm.create('relationships', ...)`.

- [ ] **Step 3: Update projects/services/analyzer.js**

Remove `const aiClient = require('../../shared/ai-client')`. Add `const llm = require('../../shared/llm')`. Change the `aiClient.create(...)` call to `llm.create('projects', ...)`.

- [ ] **Step 4: Update projects/services/classifier.js**

Same as analyzer.js but for `'projects'` agentId.

- [ ] **Step 5: Update projects/services/discoverer.js**

Same as analyzer.js but for `'projects'` agentId.

- [ ] **Step 6: Update limitless/agent.js**

Remove `const aiClient = require("../shared/ai-client")`. Add `const llm = require('../shared/llm')`. Change `aiClient.create(...)` to `llm.create('limitless', ...)`.

- [ ] **Step 7: Update research/index.js**

Remove the Anthropic import/singleton/MODEL constant. Add `const llm = require('../shared/llm')`. Update `synthesiseDossier` to use `llm.create`.

- [ ] **Step 8: Verify agents still start cleanly**

```bash
# Start the relationships agent and check it initialises without errors:
timeout 10 node packages/agents/relationships/index.js 2>&1 | head -20
```

Expected: no `Cannot find module` or `TypeError` errors. It's fine if it prints "waiting for DB" or similar.

- [ ] **Step 9: Commit**

```bash
git add packages/agents/relationships/services/opportunities.js \
        packages/agents/relationships/services/analyzer.js \
        packages/agents/projects/services/analyzer.js \
        packages/agents/projects/services/classifier.js \
        packages/agents/projects/services/discoverer.js \
        packages/agents/limitless/agent.js \
        packages/agents/research/index.js
git commit -m "feat: migrate all LLM callers from ai-client to llm.create(agentId, ...)"
```

---

### Task 6: Migrate Config Readers (Research Providers + Embedder)

**Files:**
- Modify: `packages/agents/research/providers/tavily.js`
- Modify: `packages/agents/research/providers/openai.js`
- Modify: `packages/agents/research/providers/peopledatalabs.js`
- Modify: `packages/agents/research/providers/serpapi.js`
- Modify: `packages/ui/services/embedder.js`

**Pattern for research providers:** Replace `process.env.TAVILY_API_KEY` with an async read from `getConfig`. Since provider constructors are now async, construct the client inside the export function rather than caching it globally:

- [ ] **Step 1: Update tavily.js**

```js
// packages/agents/research/providers/tavily.js
'use strict'

const { tavily } = require('@tavily/core')
const { getConfig } = require('../../shared/config')

async function researchContact(contact) {
  const apiKey = await getConfig('system.TAVILY_API_KEY')
  if (!apiKey) throw new Error('TAVILY_API_KEY not configured')
  const c = tavily({ apiKey })
  // ... rest of function unchanged
```

The rest of the function body stays identical; only the first two lines (removing `let client`, `function getClient()`, and `process.env.TAVILY_API_KEY`) and adding the two new lines above change.

- [ ] **Step 2: Update openai.js (research provider)**

Same pattern: replace `process.env.OPENAI_API_KEY` with `await getConfig('system.OPENAI_API_KEY')`.

- [ ] **Step 3: Update peopledatalabs.js**

Replace `process.env.PDL_API_KEY` or `process.env.PEOPLEDATALABS_API_KEY` with `await getConfig('system.PEOPLEDATALABS_API_KEY')`.

- [ ] **Step 4: Update serpapi.js**

Replace `process.env.SERPAPI_API_KEY` with `await getConfig('system.SERPAPI_API_KEY')`.

- [ ] **Step 5: Update embedder.js**

The embedder currently reads `GEMINI_API_KEY` from env. After migration it reads from `system.config`. Since `getConfig` is async and the current singleton pattern is synchronous, remove the singleton and read the key on each call (the 60s cache in config.js keeps this cheap):

```js
// packages/ui/services/embedder.js
'use strict'

const { GoogleGenerativeAI } = require('@google/generative-ai')
const { getConfig } = require('../agents/shared/config')

const MODEL = process.env.EMBEDDING_MODEL || 'gemini-embedding-2-preview'
const DIMS  = 3072

async function getClient() {
  const key = await getConfig('system.GEMINI_API_KEY') || process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not configured')
  return new GoogleGenerativeAI(key)
}

async function embed(text, taskType = 'RETRIEVAL_DOCUMENT') {
  const client = await getClient()
  const model = client.getGenerativeModel({ model: MODEL })
  const result = await model.embedContent({
    content: { parts: [{ text: text.slice(0, 8000) }], role: 'user' },
    taskType,
  })
  return result.embedding.values
}

async function embedBatch(texts, taskType = 'RETRIEVAL_DOCUMENT') {
  const client = await getClient()
  const model = client.getGenerativeModel({ model: MODEL })
  const CHUNK = 100
  const results = []
  for (let i = 0; i < texts.length; i += CHUNK) {
    const slice = texts.slice(i, i + CHUNK)
    const { embeddings } = await model.batchEmbedContents({
      requests: slice.map(text => ({
        content: { parts: [{ text: text.slice(0, 8000) }], role: 'user' },
        taskType,
      })),
    })
    results.push(...embeddings.map(e => e.values))
  }
  return results
}

function toSql(vec) {
  return '[' + vec.join(',') + ']'
}

module.exports = { embed, embedBatch, toSql, DIMS, MODEL }
```

- [ ] **Step 6: Verify embedder still works**

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const { embed } = require('./packages/ui/services/embedder');
embed('test text').then(v => console.log('embedding dims:', v.length)).catch(console.error);
"
```

Expected: `embedding dims: 3072`

- [ ] **Step 7: Commit**

```bash
git add packages/agents/research/providers/ packages/ui/services/embedder.js
git commit -m "feat: migrate research providers and embedder to read keys from system.config"
```

---

### Task 7: New API Endpoints in server.js

**Files:**
- Modify: `packages/ui/server.js`

Add 8 new route groups under `/api/system/`. These endpoints are the data layer for the new Agents page UI.

- [ ] **Step 1: Add the LLM Providers CRUD endpoints**

Add these 5 routes to server.js (after the existing `/api/config` routes):

```js
// ── /api/system/providers ─────────────────────────────────────────────────────

app.get('/api/system/providers', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT p.*,
        COALESCE(SUM(u.cost_usd) FILTER (WHERE u.created_at >= date_trunc('month', NOW())), 0) AS cost_mtd,
        MAX(u.created_at) AS last_used_at,
        (SELECT u2.error FROM system.llm_usage u2 WHERE u2.provider_id = p.id AND u2.error IS NOT NULL ORDER BY u2.created_at DESC LIMIT 1) AS last_usage_error
      FROM system.llm_providers p
      LEFT JOIN system.llm_usage u ON u.provider_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at
    `)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/system/providers', async (req, res) => {
  const { name, provider_type, api_key, model } = req.body
  if (!name || !provider_type) return res.status(400).json({ error: 'name and provider_type required' })
  try {
    const { rows } = await db.query(
      `INSERT INTO system.llm_providers (name, provider_type, api_key, model)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, provider_type, api_key || null, model || null]
    )
    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/system/providers/:id', async (req, res) => {
  const { name, api_key, model, is_enabled } = req.body
  try {
    const { rows } = await db.query(
      `UPDATE system.llm_providers
       SET name = COALESCE($2, name),
           api_key = COALESCE($3, api_key),
           model = COALESCE($4, model),
           is_enabled = COALESCE($5, is_enabled)
       WHERE id = $1 RETURNING *`,
      [req.params.id, name, api_key, model, is_enabled != null ? is_enabled : null]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'not found' })
    const { invalidatePriorityCache } = require('../agents/shared/llm')
    invalidatePriorityCache()
    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/system/providers/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM system.llm_providers WHERE id = $1', [req.params.id])
    const { invalidatePriorityCache } = require('../agents/shared/llm')
    invalidatePriorityCache()
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/system/providers/:id/reset-credits', async (req, res) => {
  try {
    await db.query(
      `UPDATE system.llm_providers SET has_credits = true, last_error = NULL, last_error_at = NULL WHERE id = $1`,
      [req.params.id]
    )
    const { invalidatePriorityCache } = require('../agents/shared/llm')
    invalidatePriorityCache()
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 2: Add agent LLM priority endpoints**

```js
// ── /api/system/agents/:id/llm ────────────────────────────────────────────────

app.get('/api/system/agents/:id/llm', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT alp.priority, p.id, p.name, p.provider_type, p.model, p.is_enabled, p.has_credits, p.last_error
      FROM system.agent_llm_priority alp
      JOIN system.llm_providers p ON p.id = alp.provider_id
      WHERE alp.agent_id = $1
      ORDER BY alp.priority
    `, [req.params.id])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/system/agents/:id/llm', async (req, res) => {
  // body: [{ provider_id, priority }]
  const agentId = req.params.id
  const list = req.body
  if (!Array.isArray(list)) return res.status(400).json({ error: 'body must be array' })
  try {
    await db.query('BEGIN')
    await db.query('DELETE FROM system.agent_llm_priority WHERE agent_id = $1', [agentId])
    for (const { provider_id, priority } of list) {
      await db.query(
        'INSERT INTO system.agent_llm_priority (agent_id, provider_id, priority) VALUES ($1, $2, $3)',
        [agentId, provider_id, priority]
      )
    }
    await db.query('COMMIT')
    const { invalidatePriorityCache } = require('../agents/shared/llm')
    invalidatePriorityCache(agentId)
    res.json({ ok: true })
  } catch (err) {
    await db.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 3: Add agent config endpoints**

```js
// ── /api/system/agents/:id/config ─────────────────────────────────────────────

app.get('/api/system/agents/:id/config', async (req, res) => {
  const agentId = req.params.id
  // Map agentId to schema (research has no schema, uses system)
  const schema = ['email','limitless','projects','relationships'].includes(agentId) ? agentId : 'system'
  try {
    const { rows } = await db.query(`SELECT key, value FROM ${schema}.config ORDER BY key`)
    const config = {}
    for (const r of rows) config[r.key] = r.value
    res.json(config)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/system/agents/:id/config', async (req, res) => {
  const agentId = req.params.id
  const schema = ['email','limitless','projects','relationships'].includes(agentId) ? agentId : 'system'
  const updates = req.body  // { key: value, ... }
  if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'body must be object' })
  try {
    const { setConfig } = require('../agents/shared/config')
    for (const [key, value] of Object.entries(updates)) {
      await setConfig(`${schema}.${key}`, value)
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 4: Add usage stats endpoint**

```js
// ── /api/system/usage ─────────────────────────────────────────────────────────

app.get('/api/system/usage', async (req, res) => {
  const { group_by = 'provider', since } = req.query
  const sinceClause = since ? `AND u.created_at >= $1` : ''
  const params = since ? [since] : []

  try {
    let sql
    if (group_by === 'agent') {
      sql = `SELECT agent_id, COUNT(*) AS calls, SUM(tokens_in) AS tokens_in, SUM(tokens_out) AS tokens_out, SUM(cost_usd) AS cost_usd FROM system.llm_usage u WHERE 1=1 ${sinceClause} GROUP BY agent_id ORDER BY cost_usd DESC NULLS LAST`
    } else if (group_by === 'day') {
      sql = `SELECT date_trunc('day', created_at) AS day, COUNT(*) AS calls, SUM(tokens_in) AS tokens_in, SUM(tokens_out) AS tokens_out, SUM(cost_usd) AS cost_usd FROM system.llm_usage u WHERE 1=1 ${sinceClause} GROUP BY 1 ORDER BY 1 DESC`
    } else {
      // group by provider (default)
      sql = `SELECT p.id, p.name, p.provider_type, COUNT(u.id) AS calls, SUM(u.tokens_in) AS tokens_in, SUM(u.tokens_out) AS tokens_out, SUM(u.cost_usd) AS cost_usd FROM system.llm_providers p LEFT JOIN system.llm_usage u ON u.provider_id = p.id ${since ? 'AND u.created_at >= $1' : ''} GROUP BY p.id ORDER BY cost_usd DESC NULLS LAST`
    }
    const { rows } = await db.query(sql, params)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 5: Test the endpoints with curl**

Start the server (`node packages/ui/server.js`) then:

```bash
# Add a provider:
curl -s -X POST http://localhost:4001/api/system/providers \
  -H 'Content-Type: application/json' \
  -d '{"name":"Anthropic K1","provider_type":"anthropic","api_key":"sk-ant-test","model":"claude-sonnet-4-6"}' | jq .

# List providers:
curl -s http://localhost:4001/api/system/providers | jq .

# Set priority for relationships agent:
curl -s -X PUT http://localhost:4001/api/system/agents/relationships/llm \
  -H 'Content-Type: application/json' \
  -d '[{"provider_id":1,"priority":1}]' | jq .

# Get priority:
curl -s http://localhost:4001/api/system/agents/relationships/llm | jq .

# Get system config:
curl -s http://localhost:4001/api/system/agents/research/config | jq .

# Get usage:
curl -s "http://localhost:4001/api/system/usage?group_by=agent" | jq .
```

Expected: JSON responses, no 500 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/server.js
git commit -m "feat: add /api/system/* endpoints for LLM providers, config, and usage"
```

---

### Task 8: Agents Page UI Redesign

**Files:**
- Modify: `packages/ui/app/agents/page.jsx`

This task rewrites `page.jsx` to add:
1. Global LLM Providers panel at the top
2. Agent list (left sidebar)
3. Agent detail pane (right) with [Logs] [Config] [LLM] tabs

The existing Logs tab functionality is preserved — only the outer layout changes.

- [ ] **Step 1: Add state variables and API helpers**

At the top of the component (after existing state vars), add:

```js
const [providers, setProviders] = useState([])
const [agentLlm, setAgentLlm] = useState({})        // { agentId: [priority rows] }
const [agentConfig, setAgentConfig] = useState({})   // { agentId: { key: val } }
const [agentTab, setAgentTab] = useState('logs')     // 'logs' | 'config' | 'llm'
const [usageMtd, setUsageMtd] = useState([])         // per-agent MTD usage
const [providerForm, setProviderForm] = useState(null)  // null | { name, provider_type, api_key, model }
const [configDraft, setConfigDraft] = useState({})   // editable config form
```

Add these fetch helpers (alongside `apiFetch`):

```js
async function loadProviders() {
  const data = await apiFetch('GET', '/api/system/providers')
  if (Array.isArray(data)) setProviders(data)
}

async function loadAgentLlm(id) {
  const data = await apiFetch('GET', `/api/system/agents/${id}/llm`)
  if (Array.isArray(data)) setAgentLlm(prev => ({ ...prev, [id]: data }))
}

async function loadAgentConfig(id) {
  const data = await apiFetch('GET', `/api/system/agents/${id}/config`)
  if (data && !data.error) {
    setAgentConfig(prev => ({ ...prev, [id]: data }))
    setConfigDraft(data)
  }
}

async function loadUsageMtd() {
  const since = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const data = await apiFetch('GET', `/api/system/usage?group_by=agent&since=${since}`)
  if (Array.isArray(data)) setUsageMtd(data)
}

async function saveAgentLlm(agentId, list) {
  await apiFetch('PUT', `/api/system/agents/${agentId}/llm`, list)
  await loadAgentLlm(agentId)
}

async function saveAgentConfig(agentId) {
  await apiFetch('PUT', `/api/system/agents/${agentId}/config`, configDraft)
  showToast('Config saved')
}

async function addProvider(form) {
  await apiFetch('POST', '/api/system/providers', form)
  setProviderForm(null)
  await loadProviders()
}

async function resetProviderCredits(id) {
  await apiFetch('POST', `/api/system/providers/${id}/reset-credits`)
  await loadProviders()
}

async function deleteProvider(id) {
  if (!confirm('Delete this provider?')) return
  await apiFetch('DELETE', `/api/system/providers/${id}`)
  await loadProviders()
}
```

- [ ] **Step 2: Load providers and usage on mount, load LLM+config when agent selected**

In the existing `useEffect` that loads agents (or in a new one):

```js
useEffect(() => {
  loadProviders()
  loadUsageMtd()
}, [])

// When selected agent changes, load its LLM priority and config
useEffect(() => {
  if (!selectedAgent) return
  loadAgentLlm(selectedAgent)
  loadAgentConfig(selectedAgent)
  setAgentTab('logs')
}, [selectedAgent])
```

- [ ] **Step 3: Add the Global LLM Providers panel component**

Add this component (before the main page component or inline):

```jsx
function ProviderStatusBadge({ prov }) {
  if (!prov.is_enabled) return <span style={{ color: '#888', fontSize: '0.75rem' }}>Disabled</span>
  if (!prov.has_credits) return <span style={{ color: '#f59e0b', fontSize: '0.75rem' }}>⚠ Credits exhausted</span>
  return <span style={{ color: '#22c55e', fontSize: '0.75rem' }}>✓ OK</span>
}

function LLMProvidersPanel({ providers, onAdd, onResetCredits, onDelete }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', provider_type: 'anthropic', api_key: '', model: '' })

  return (
    <div style={{ marginBottom: '1.5rem', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ padding: '0.75rem 1rem', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: '0.875rem' }}>LLM Providers</strong>
        <button onClick={() => setShowForm(s => !s)} style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}>+ Add</button>
      </div>

      {showForm && (
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input placeholder="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ flex: 1, minWidth: '120px' }} />
          <select value={form.provider_type} onChange={e => setForm(f => ({ ...f, provider_type: e.target.value }))}>
            <option value="anthropic">Anthropic</option>
            <option value="claude_cli">Claude CLI</option>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
          </select>
          {form.provider_type !== 'claude_cli' && (
            <input placeholder="API Key" type="password" value={form.api_key} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))} style={{ flex: 2, minWidth: '200px' }} />
          )}
          <input placeholder="Model (e.g. claude-sonnet-4-6)" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} style={{ flex: 2, minWidth: '180px' }} />
          <button onClick={() => { onAdd(form); setShowForm(false); setForm({ name: '', provider_type: 'anthropic', api_key: '', model: '' }) }}>Save</button>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ textAlign: 'left', padding: '0.5rem 1rem', fontWeight: 500, color: 'var(--muted)' }}>Name</th>
            <th style={{ textAlign: 'left', padding: '0.5rem 1rem', fontWeight: 500, color: 'var(--muted)' }}>Type</th>
            <th style={{ textAlign: 'left', padding: '0.5rem 1rem', fontWeight: 500, color: 'var(--muted)' }}>Model</th>
            <th style={{ textAlign: 'left', padding: '0.5rem 1rem', fontWeight: 500, color: 'var(--muted)' }}>Status</th>
            <th style={{ textAlign: 'right', padding: '0.5rem 1rem', fontWeight: 500, color: 'var(--muted)' }}>Cost MTD</th>
            <th style={{ padding: '0.5rem 1rem' }}></th>
          </tr>
        </thead>
        <tbody>
          {providers.map(p => (
            <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: !p.has_credits ? 'rgba(245,158,11,0.05)' : 'transparent' }}>
              <td style={{ padding: '0.5rem 1rem' }}>{p.name}</td>
              <td style={{ padding: '0.5rem 1rem' }}><span style={{ fontSize: '0.7rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.1rem 0.4rem' }}>{p.provider_type}</span></td>
              <td style={{ padding: '0.5rem 1rem', color: 'var(--muted)' }}>{p.model || '—'}</td>
              <td style={{ padding: '0.5rem 1rem' }}>
                <ProviderStatusBadge prov={p} />
                {!p.has_credits && (
                  <button onClick={() => onResetCredits(p.id)} style={{ marginLeft: '0.5rem', fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}>Reset credits</button>
                )}
              </td>
              <td style={{ padding: '0.5rem 1rem', textAlign: 'right', color: 'var(--muted)' }}>
                {p.cost_mtd > 0 ? `$${Number(p.cost_mtd).toFixed(4)}` : '—'}
              </td>
              <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>
                <button onClick={() => onDelete(p.id)} style={{ fontSize: '0.7rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
              </td>
            </tr>
          ))}
          {providers.length === 0 && (
            <tr><td colSpan={6} style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted)' }}>No providers configured. Add one above.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Add the LLM tab content component**

```jsx
function AgentLlmTab({ agentId, llmList, allProviders, onSave }) {
  const [list, setList] = useState(llmList || [])
  useEffect(() => setList(llmList || []), [llmList])

  const available = allProviders.filter(p => p.is_enabled && !list.find(l => l.id === p.id))

  function moveUp(idx) {
    if (idx === 0) return
    const next = [...list]
    ;[next[idx-1], next[idx]] = [next[idx], next[idx-1]]
    setList(next.map((p, i) => ({ ...p, priority: i + 1 })))
  }

  function removeProvider(idx) {
    setList(list.filter((_, i) => i !== idx).map((p, i) => ({ ...p, priority: i + 1 })))
  }

  function addProvider(provId) {
    const prov = allProviders.find(p => p.id === Number(provId))
    if (!prov) return
    setList([...list, { ...prov, priority: list.length + 1 }])
  }

  return (
    <div>
      {list.length === 0 && (
        <div style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.8125rem' }}>
          No providers assigned. Add one below.
        </div>
      )}
      {list.some(p => !p.has_credits) && (
        <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(245,158,11,0.1)', borderRadius: '6px', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#f59e0b' }}>
          ⚠ One or more providers have exhausted credits — fallback will be used
        </div>
      )}
      {list.length > 0 && list.every(p => !p.has_credits) && (
        <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.1)', borderRadius: '6px', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#ef4444' }}>
          ⚠ No working providers — this agent will fail to run
        </div>
      )}
      <div style={{ marginBottom: '0.75rem' }}>
        {list.map((p, idx) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border)', background: !p.has_credits ? 'rgba(245,158,11,0.05)' : 'transparent' }}>
            <span style={{ color: 'var(--muted)', minWidth: '1.2rem', fontSize: '0.8rem' }}>{idx + 1}.</span>
            <span style={{ flex: 1, fontSize: '0.8125rem' }}>{p.name}</span>
            <span style={{ fontSize: '0.7rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.1rem 0.4rem' }}>{p.provider_type}</span>
            <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>{p.model || '—'}</span>
            {!p.has_credits && <span style={{ color: '#f59e0b', fontSize: '0.7rem' }}>⚠ credits</span>}
            <button onClick={() => moveUp(idx)} disabled={idx === 0} style={{ padding: '0 0.3rem', fontSize: '0.8rem', opacity: idx === 0 ? 0.3 : 1 }}>↑</button>
            <button onClick={() => removeProvider(idx)} style={{ padding: '0 0.3rem', fontSize: '0.8rem', color: 'var(--muted)' }}>×</button>
          </div>
        ))}
      </div>
      {available.length > 0 && (
        <select onChange={e => { if (e.target.value) addProvider(e.target.value); e.target.value = '' }} defaultValue="" style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          <option value="">+ Add provider…</option>
          {available.map(p => <option key={p.id} value={p.id}>{p.name} ({p.provider_type})</option>)}
        </select>
      )}
      <button onClick={() => onSave(agentId, list.map((p, i) => ({ provider_id: p.id, priority: i + 1 })))} style={{ fontSize: '0.8rem' }}>
        Save priority
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Add the Config tab content component**

```jsx
function AgentConfigTab({ agentId, config, draft, onChange, onSave }) {
  if (!config) return <div style={{ color: 'var(--muted)', fontSize: '0.8125rem', padding: '1rem 0' }}>No config available for this agent.</div>

  const entries = Object.entries(draft || {})
  if (entries.length === 0) return <div style={{ color: 'var(--muted)', fontSize: '0.8125rem', padding: '1rem 0' }}>No config keys stored for this agent.</div>

  return (
    <div>
      {entries.map(([key, value]) => (
        <div key={key} style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>{key}</label>
          <input
            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8rem' }}
            value={typeof value === 'string' ? value : JSON.stringify(value)}
            onChange={e => {
              let parsed = e.target.value
              try { parsed = JSON.parse(e.target.value) } catch {}
              onChange({ ...draft, [key]: parsed })
            }}
          />
        </div>
      ))}
      <button onClick={() => onSave(agentId)} style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Save config</button>
    </div>
  )
}
```

- [ ] **Step 6: Update the main render to use the new layout**

In the main component's `return` statement, wrap the existing layout with the new structure. The key changes:

1. Add `<LLMProvidersPanel>` before the existing agent grid
2. Add `[Logs] [Config] [LLM]` tab buttons in the agent detail header area
3. Conditionally render the active tab content (Logs = existing, Config = `<AgentConfigTab>`, LLM = `<AgentLlmTab>`)

Replace the section that renders the agent detail (the right panel where logs appear) with:

```jsx
{/* Tab buttons — shown in the agent detail header */}
<div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.75rem' }}>
  {['logs', 'config', 'llm'].map(tab => (
    <button
      key={tab}
      onClick={() => setAgentTab(tab)}
      style={{
        fontSize: '0.8rem',
        padding: '0.3rem 0.7rem',
        borderRadius: '5px',
        background: agentTab === tab ? 'var(--text)' : 'var(--surface)',
        color: agentTab === tab ? 'var(--bg)' : 'var(--text)',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        textTransform: 'capitalize',
      }}
    >
      {tab === 'llm' ? 'LLM' : tab.charAt(0).toUpperCase() + tab.slice(1)}
    </button>
  ))}
</div>

{agentTab === 'logs' && (
  /* existing log viewer JSX goes here — unchanged */
)}

{agentTab === 'config' && (
  <AgentConfigTab
    agentId={selectedAgent}
    config={agentConfig[selectedAgent]}
    draft={configDraft}
    onChange={setConfigDraft}
    onSave={saveAgentConfig}
  />
)}

{agentTab === 'llm' && (
  <AgentLlmTab
    agentId={selectedAgent}
    llmList={agentLlm[selectedAgent] || []}
    allProviders={providers}
    onSave={saveAgentLlm}
  />
)}
```

Add the Global Providers panel at the very top of the page return:

```jsx
<LLMProvidersPanel
  providers={providers}
  onAdd={addProvider}
  onResetCredits={resetProviderCredits}
  onDelete={deleteProvider}
/>
```

- [ ] **Step 7: Add MTD usage display to agent detail**

In the agent detail header (where the agent name and status appear), add a small usage summary that reads from `usageMtd`:

```jsx
{(() => {
  const usage = usageMtd.find(u => u.agent_id === selectedAgent)
  if (!usage || !usage.cost_usd) return null
  return (
    <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginLeft: '1rem' }}>
      MTD: {Number(usage.tokens_in || 0) + Number(usage.tokens_out || 0)} tokens · ${Number(usage.cost_usd).toFixed(4)}
    </span>
  )
})()}
```

- [ ] **Step 8: Smoke-test the UI in the browser**

```bash
npm run ui:dev
```

Open `http://localhost:4000/agents` and verify:
- Global LLM Providers panel renders at top (may be empty if no providers added yet)
- "Add" button opens inline form
- Add an Anthropic provider — it appears in the table
- Select an agent — LLM tab shows the add dropdown
- Add the provider to the agent — it appears in the priority list
- Config tab shows config keys editable
- Logs tab still shows logs as before

- [ ] **Step 9: Commit**

```bash
git add packages/ui/app/agents/page.jsx
git commit -m "feat: redesign agents page with Global LLM Providers panel and Logs/Config/LLM tabs"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered |
|-----------------|---------|
| system.llm_providers schema | Task 1 |
| system.agent_llm_priority schema | Task 1 |
| system.llm_usage schema | Task 1 |
| system.config + per-agent config tables | Task 1 |
| getConfig/setConfig helper with 60s TTL | Task 2 |
| migrateEnvToDb() on startup | Task 3 |
| llm.create(agentId, ...) with fallback | Task 4 |
| Credit error detection (all 3 providers) | Task 4 |
| Usage logging per call | Task 4 |
| Cost rate table in llm.js | Task 4 |
| Claude CLI path with stripped API keys | Task 4 |
| Migrate all aiClient callers | Task 5 |
| Config keys read from DB (not env) | Task 6 |
| GET/POST /api/system/providers | Task 7 |
| PATCH/DELETE/reset-credits | Task 7 |
| GET/PUT /api/system/agents/:id/llm | Task 7 |
| GET/PUT /api/system/agents/:id/config | Task 7 |
| GET /api/system/usage | Task 7 |
| invalidatePriorityCache on PUT priority | Task 7 |
| Global LLM Providers panel (table, add, reset, delete) | Task 8 |
| Agent detail Logs/Config/LLM tabs | Task 8 |
| Credit exhausted warnings in LLM tab | Task 8 |
| MTD usage per agent | Task 8 |

**Missing: `limitless/tools/notion-mcp.js`** uses direct Anthropic SDK (lines ~207, ~468). This file runs the multi-turn MCP tool loop for Notion. It is not in the spec's scope (spec mentions only the main agent entry points) but does use `ANTHROPIC_API_KEY`. It will continue working via env var after migration since env vars are still available. Can be migrated separately if needed.

**Placeholder scan:** None found.

**Type consistency:** `llm.create(agentId, opts)` is used identically in Tasks 4 and 5. `getConfig(key)` / `setConfig(key, value)` interface is consistent between Tasks 2, 3, 6, 7.
