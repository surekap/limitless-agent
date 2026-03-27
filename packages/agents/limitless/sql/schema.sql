-- Create limitless schema and set as default for postgres role
CREATE SCHEMA IF NOT EXISTS limitless;
ALTER ROLE postgres SET search_path TO limitless;
SET search_path TO limitless;

-- Table for storing lifelogs
CREATE TABLE IF NOT EXISTS lifelogs (
  id VARCHAR(255) PRIMARY KEY,
  title TEXT,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  contents TEXT,
  markdown TEXT,
  processed BOOLEAN DEFAULT FALSE,
  processing_error TEXT,
  processing_attempts INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add retry-tracking columns to existing installations
ALTER TABLE lifelogs ADD COLUMN IF NOT EXISTS processing_error TEXT;
ALTER TABLE lifelogs ADD COLUMN IF NOT EXISTS processing_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE lifelogs ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_lifelogs_processed ON lifelogs(processed);
CREATE INDEX IF NOT EXISTS idx_lifelogs_start_time ON lifelogs(start_time);
CREATE INDEX IF NOT EXISTS idx_lifelogs_created_at ON lifelogs(created_at);

-- Table for tracking lifelog processing results
CREATE TABLE IF NOT EXISTS lifelog_processing (
  id SERIAL PRIMARY KEY,
  lifelog_id VARCHAR(255) NOT NULL,
  intent_detected TEXT,
  handler_name VARCHAR(255),
  handler_data JSONB,
  execution_status TEXT DEFAULT 'pending' CHECK (execution_status IN ('pending', 'running', 'completed', 'failed')),
  execution_result TEXT,
  execution_error TEXT,
  execution_duration_ms INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lifelog_processing_lifelog FOREIGN KEY (lifelog_id) REFERENCES lifelogs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lifelog_processing_status ON lifelog_processing(execution_status);
CREATE INDEX IF NOT EXISTS idx_lifelog_processing_lifelog_id ON lifelog_processing(lifelog_id);
CREATE INDEX IF NOT EXISTS idx_lifelog_processing_created_at ON lifelog_processing(created_at);

-- Table for registered handlers
CREATE TABLE IF NOT EXISTS handlers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  function_schema JSONB NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for handler execution logs (detailed logging)
CREATE TABLE IF NOT EXISTS handler_logs (
  id SERIAL PRIMARY KEY,
  processing_id INTEGER NOT NULL,
  log_level TEXT DEFAULT 'info' CHECK (log_level IN ('info', 'warn', 'error', 'debug')),
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_handler_logs_processing FOREIGN KEY (processing_id) REFERENCES lifelog_processing(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_handler_logs_processing_id ON handler_logs(processing_id);
CREATE INDEX IF NOT EXISTS idx_handler_logs_level ON handler_logs(log_level);
CREATE INDEX IF NOT EXISTS idx_handler_logs_created_at ON handler_logs(created_at);

-- Table for archived Limitless chats
CREATE TABLE IF NOT EXISTS limitless_chats (
  id VARCHAR(255) PRIMARY KEY,
  summary TEXT,
  visibility VARCHAR(64),
  created_at TIMESTAMP NULL,
  started_at TIMESTAMP NULL,
  is_scheduled BOOLEAN NULL,
  raw_json JSONB,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_limitless_chats_started_at ON limitless_chats(started_at);
CREATE INDEX IF NOT EXISTS idx_limitless_chats_is_scheduled ON limitless_chats(is_scheduled);

-- Table for archived chat messages
CREATE TABLE IF NOT EXISTS limitless_chat_messages (
  id VARCHAR(255) PRIMARY KEY,
  chat_id VARCHAR(255) NOT NULL,
  message_index INTEGER NOT NULL,
  role VARCHAR(64),
  user_name VARCHAR(255),
  message_text TEXT,
  created_at TIMESTAMP NULL,
  raw_json JSONB,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (chat_id, message_index),
  CONSTRAINT fk_limitless_chat_messages_chat
    FOREIGN KEY (chat_id) REFERENCES limitless_chats(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_limitless_chat_messages_chat_id ON limitless_chat_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_limitless_chat_messages_created_at ON limitless_chat_messages(created_at);

-- Table for reminders derived from scheduled chats
CREATE TABLE IF NOT EXISTS limitless_reminders (
  chat_id VARCHAR(255) PRIMARY KEY,
  title TEXT,
  created_at TIMESTAMP NULL,
  started_at TIMESTAMP NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'scheduled_chat',
  raw_json JSONB,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_limitless_reminders_chat
    FOREIGN KEY (chat_id) REFERENCES limitless_chats(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_limitless_reminders_started_at ON limitless_reminders(started_at);

-- Table for archived raw audio bytes
CREATE TABLE IF NOT EXISTS limitless_audio_blobs (
  id BIGSERIAL PRIMARY KEY,
  lifelog_id VARCHAR(255) NOT NULL,
  audio_source VARCHAR(32) NOT NULL DEFAULT 'auto',
  start_ms BIGINT NOT NULL,
  end_ms BIGINT NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('downloaded', 'no_audio', 'error')),
  mime_type VARCHAR(128) NULL,
  byte_length INTEGER NULL,
  sha256 CHAR(64) NULL,
  audio_blob BYTEA NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (lifelog_id, start_ms, end_ms, audio_source),
  CONSTRAINT fk_limitless_audio_lifelog
    FOREIGN KEY (lifelog_id) REFERENCES lifelogs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_limitless_audio_lifelog_id ON limitless_audio_blobs(lifelog_id);
CREATE INDEX IF NOT EXISTS idx_limitless_audio_status ON limitless_audio_blobs(status);
CREATE INDEX IF NOT EXISTS idx_limitless_audio_start_time ON limitless_audio_blobs(start_time);
