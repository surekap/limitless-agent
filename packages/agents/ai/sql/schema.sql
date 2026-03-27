-- AI Conversations schema
-- Stores conversation history downloaded from OpenAI (ChatGPT) and Google (Gemini)

CREATE SCHEMA IF NOT EXISTS ai;

CREATE TABLE IF NOT EXISTS ai.conversations (
  id              SERIAL PRIMARY KEY,
  provider        TEXT        NOT NULL,  -- 'openai' | 'gemini'
  external_id     TEXT        NOT NULL,  -- provider's conversation ID
  title           TEXT,
  model           TEXT,                  -- e.g. 'gpt-4o', 'gemini-1.5-pro'
  message_count   INTEGER     DEFAULT 0,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ,
  imported_at     TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (provider, external_id)
);

CREATE TABLE IF NOT EXISTS ai.messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER     NOT NULL REFERENCES ai.conversations(id) ON DELETE CASCADE,
  external_id     TEXT,
  role            TEXT        NOT NULL,  -- 'user' | 'assistant' | 'system'
  content         TEXT,
  model           TEXT,
  created_at      TIMESTAMPTZ,
  metadata        JSONB       DEFAULT '{}',

  UNIQUE (conversation_id, external_id)
);

CREATE INDEX IF NOT EXISTS ai_messages_conversation_idx ON ai.messages (conversation_id);
CREATE INDEX IF NOT EXISTS ai_conversations_provider_idx ON ai.conversations (provider);
CREATE INDEX IF NOT EXISTS ai_conversations_created_idx  ON ai.conversations (created_at DESC);

-- Tracks each import run for incremental syncing
CREATE TABLE IF NOT EXISTS ai.sync_log (
  id                     SERIAL PRIMARY KEY,
  provider               TEXT        NOT NULL,
  started_at             TIMESTAMPTZ DEFAULT NOW(),
  completed_at           TIMESTAMPTZ,
  status                 TEXT        DEFAULT 'running',  -- 'running' | 'completed' | 'failed'
  conversations_imported INTEGER     DEFAULT 0,
  messages_imported      INTEGER     DEFAULT 0,
  source_file            TEXT,
  error                  TEXT
);
