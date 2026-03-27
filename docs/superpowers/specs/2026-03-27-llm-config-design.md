# LLM Config & Agents Page Redesign — Design Spec
**Date:** 2026-03-27
**Status:** Approved

## Overview

Three connected improvements:

1. **Config migration** — all settings except `DATABASE_URL` move from `.env.local` to Postgres, seeded automatically on first startup
2. **LLM registry** — a central `system` schema holds named credential entries; each agent has its own priority-ordered list with automatic fallback and per-call usage logging
3. **Agents page redesign** — unified UI with Logs / Config / LLM tabs per agent, plus a global LLM Providers panel

---

## 1. Schema

### 1a. New `system` schema

```sql
CREATE SCHEMA IF NOT EXISTS system;
```

**`system.llm_providers`** — registry of named LLM credentials

```sql
CREATE TABLE system.llm_providers (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,          -- display name, e.g. "Anthropic Key 1"
  provider_type TEXT NOT NULL           -- 'anthropic' | 'claude_cli' | 'openai' | 'gemini'
    CHECK (provider_type IN ('anthropic','claude_cli','openai','gemini')),
  api_key       TEXT,                   -- NULL for claude_cli (uses OAuth session)
  model         TEXT,                   -- e.g. "claude-sonnet-4-6", "gpt-4o"
  is_enabled    BOOLEAN NOT NULL DEFAULT true,
  has_credits   BOOLEAN NOT NULL DEFAULT true,  -- set false on billing/quota errors
  last_error    TEXT,
  last_error_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**`system.agent_llm_priority`** — per-agent ordered list of providers

```sql
CREATE TABLE system.agent_llm_priority (
  agent_id    TEXT NOT NULL,            -- 'relationships' | 'limitless' | 'research' | 'projects' | 'email'
  provider_id INT NOT NULL REFERENCES system.llm_providers(id) ON DELETE CASCADE,
  priority    INT NOT NULL,             -- 1 = first to try
  PRIMARY KEY (agent_id, provider_id)
);
CREATE INDEX ON system.agent_llm_priority (agent_id, priority);
```

**`system.llm_usage`** — per-call log

```sql
CREATE TABLE system.llm_usage (
  id          BIGSERIAL PRIMARY KEY,
  provider_id INT REFERENCES system.llm_providers(id) ON DELETE SET NULL,
  agent_id    TEXT NOT NULL,
  tokens_in   INT,                      -- NULL for claude_cli (not reported)
  tokens_out  INT,
  cost_usd    NUMERIC(10,6),
  error       TEXT,                     -- NULL on success
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON system.llm_usage (provider_id, created_at DESC);
CREATE INDEX ON system.llm_usage (agent_id, created_at DESC);
```

**`system.config`** — shared key/value config for cross-agent settings

```sql
CREATE TABLE system.config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Stores: `LIMITLESS_API_KEY`, `TAVILY_API_KEY`, `PEOPLEDATALABS_API_KEY`, `SERPAPI_API_KEY`, `NOTION_TOKEN`, `TODOIST_API_KEY`, `PERPLEXITY_API_KEY`.

### 1b. Per-agent `config` tables

Same key/value/JSONB structure in each agent's own schema:

```sql
-- replicated in: email.config, limitless.config, projects.config, relationships.config, research.config
CREATE TABLE <schema>.config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

| Agent | Keys stored |
|-------|-------------|
| `email` | `gmail_accounts` (array), `batch_size`, `mailbox` |
| `limitless` | `fetch_cron`, `process_cron`, `fetch_days`, `processing_batch_size` |
| `projects` | _(currently no agent-specific config beyond LLM)_ |
| `relationships` | _(currently no agent-specific config beyond LLM)_ |
| `research` | _(currently no agent-specific config beyond LLM)_ |

---

## 2. Config Migration

On server startup, `packages/ui/server.js` calls `migrateEnvToDb()`:

- For each known key in `.env.local`, if the key does not yet exist in `system.config` or the relevant agent's `config` table, insert it.
- After seeding, all config reads go to the DB. `.env.local` is no longer consulted (except `DATABASE_URL`).
- Migration is idempotent — safe to run on every startup.

Agents that currently call `process.env.ANTHROPIC_API_KEY` etc. are updated to call a shared `getConfig(key)` helper (`packages/agents/shared/config.js`) that reads from `system.config` or the agent's own schema config table (with an in-memory cache, TTL 60s). The helper signature is:

```js
// key: dot-separated, e.g. 'system.LIMITLESS_API_KEY' or 'email.gmail_accounts'
await getConfig(key)          // returns parsed JSONB value
await setConfig(key, value)   // upserts, invalidates cache
```

---

## 3. LLM Client

### File: `packages/agents/shared/llm.js`

Replaces `packages/agents/shared/ai-client.js`.

**Interface:**

```js
// Primary call — uses agent's priority list with automatic fallback
await llm.create(agentId, { messages, max_tokens, system })
// Returns Anthropic-compatible response object

// Embedding call (Gemini only, used by ui/services/embedder.js)
await llm.embed(agentId, text)
```

**Fallback logic:**

```
1. Load priority list for agentId (memory cache, TTL 60s; invalidated on config save)
2. Filter: skip providers where is_enabled=false OR has_credits=false
3. For each provider in priority order:
   a. Attempt the call
   b. Success → log to system.llm_usage, return result
   c. Credit/quota error → UPDATE llm_providers SET has_credits=false, last_error=...; log usage row with error; try next
   d. Other error → log usage row with error; try next
4. All exhausted → throw AggregateError listing all failures
```

**Credit error detection** — checks HTTP status and error message/code:
- Anthropic: HTTP 402, or `error.type === 'credit_balance_too_low'`
- OpenAI: HTTP 429 with `code === 'insufficient_quota'`
- Gemini: `status === 'RESOURCE_EXHAUSTED'` with billing context in message

**Claude CLI path:** Spawns `claude` subprocess (existing mechanism). `tokens_in` and `tokens_out` logged as NULL.

**Cost calculation:** Static rate table in `llm.js`:

```js
const RATES = {
  anthropic: {
    'claude-sonnet-4-6': { in: 0.003, out: 0.015 },   // per 1k tokens
    'claude-opus-4-6':   { in: 0.015, out: 0.075 },
    'claude-haiku-4-5':  { in: 0.00025, out: 0.00125 },
  },
  openai: {
    'gpt-4o':      { in: 0.0025, out: 0.010 },
    'gpt-4o-mini': { in: 0.00015, out: 0.0006 },
  },
  gemini: {
    'gemini-2.0-flash': { in: 0.00035, out: 0.00105 },
  },
}
```

Rates are hardcoded constants — not user-configurable.

---

## 4. API Endpoints

All new endpoints added to `packages/ui/server.js`.

### LLM Providers

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/system/providers` | List all providers with aggregated stats (total cost MTD, last used, last error) |
| `POST` | `/api/system/providers` | Add a provider `{ name, provider_type, api_key, model }` |
| `PATCH` | `/api/system/providers/:id` | Update `{ name, api_key, model, is_enabled }` |
| `DELETE` | `/api/system/providers/:id` | Remove provider (cascades priority rows) |
| `POST` | `/api/system/providers/:id/reset-credits` | Set `has_credits=true` after manually topping up |

### Agent LLM Config

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/system/agents/:id/llm` | Get ordered provider list for agent |
| `PUT` | `/api/system/agents/:id/llm` | Replace priority list `[{ provider_id, priority }]` — also invalidates llm.js cache |

### Agent Config

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/system/agents/:id/config` | Get all config key/values for agent |
| `PUT` | `/api/system/agents/:id/config` | Save config keys `{ key: value, ... }` — also triggers `needsRestart` if agent is running |

### Usage Stats

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/system/usage` | Aggregated stats: `?group_by=provider\|agent\|day&since=ISO` |

The existing `/api/config` (GET + POST) endpoints are kept but deprecated — they write to both `.env.local` and the DB during the migration window, then are removed in a follow-up.

---

## 5. Agents Page UI

### Layout

```
┌─ Global LLM Providers ──────────────────────────────────────────┐
│  Name          Type        Model           Status    Cost MTD    │
│  Anthropic K1  anthropic   sonnet-4-6      ✓ OK      $4.23       │
│  Claude CLI    claude_cli  —               ✓ OK      —           │
│  ⚠ OpenAI K1  openai      gpt-4o          ⚠ Credits  $0.00      │
│  [ + Add provider ]                                              │
└──────────────────────────────────────────────────────────────────┘

┌─ Agents ──────────┐  ┌─ Agent Detail ───────────────────────────┐
│ ● Email           │  │  Relationships Agent        ● Running     │
│ ● Limitless       │  │  [ Stop ]  Last run: 2h ago              │
│ ● Relationships   │  │                                           │
│ ○ Research        │  │  [ Logs ] [ Config ] [ LLM ]             │
│ ○ Projects        │  │                                           │
└───────────────────┘  │  LLM Priority:                           │
                       │  1. Anthropic K1  sonnet-4-6  ✓  [ × ]  │
                       │  2. Claude CLI    —           ✓  [ × ]  │
                       │  [ + Add ]                               │
                       │                                           │
                       │  This agent (MTD):                       │
                       │  12,450 tokens · $0.18                   │
                       └──────────────────────────────────────────┘
```

### Global LLM Providers panel

- Table: name, type badge, model, status (✓ OK / ⚠ Credits exhausted / ✗ Disabled), cost this month, last used timestamp
- Credit exhaustion row is highlighted amber with a "Reset credits" button (for after manually topping up the account)
- Last error shown on hover / expand
- "Add provider" → inline form: name, type dropdown, API key field (hidden for `claude_cli`), model field
- Clicking a row expands to show last 7 days usage (tokens + cost) as a simple bar summary

### Agent list (left column)

- Status dot (green = running, grey = idle, red = error)
- Name only — no stats cluttering the list

### Agent detail pane (right)

**Logs tab** — existing log viewer, no changes.

**Config tab** — agent-specific settings rendered as a form. Each agent has its own fields (Gmail accounts for email, cron expressions for limitless, etc.). "Save" calls `PUT /api/system/agents/:id/config`. Shows `needsRestart` warning if agent is running.

**LLM tab**
- Ordered list of assigned providers (drag handle for reorder, or up/down arrows)
- Each row: provider name, type badge, model, status indicator, remove button
- If `has_credits=false` on a provider in this list: amber warning row "⚠ Credits exhausted — using next provider"
- If all providers exhausted: red banner "⚠ No working providers — agent will fail"
- "Add" dropdown: pick from global provider registry (only shows enabled providers not already in this list)
- MTD usage summary at the bottom: tokens in + out, estimated cost

---

## 6. What Stays in `.env.local`

Only `DATABASE_URL`. Everything else migrates to DB.

The server reads `DATABASE_URL` directly from the environment at process start. No other env vars are required after migration.

---

## Out of Scope

- LLM load balancing across multiple keys (priority = first working key, not round-robin)
- Fine-grained per-function LLM config within an agent (per-agent is the granularity)
- Editing the cost rate table from the UI
- Historical usage beyond what's in `system.llm_usage` (no retention policy, no archiving)
