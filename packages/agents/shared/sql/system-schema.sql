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

-- Per-agent config tables
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
