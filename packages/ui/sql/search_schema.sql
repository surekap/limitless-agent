-- Semantic search schema
-- Run once: psql $DATABASE_URL -f packages/ui/sql/search_schema.sql

SET search_path TO public;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS search;

CREATE TABLE IF NOT EXISTS search.embeddings (
  id          BIGSERIAL PRIMARY KEY,
  source      TEXT NOT NULL,   -- 'email' | 'whatsapp' | 'lifelog' | 'contact' | 'insight' | 'project' | 'project_insight'
  source_id   TEXT NOT NULL,   -- primary key from the source table
  content     TEXT NOT NULL,   -- the text that was embedded
  embedding   vector(3072),    -- gemini-embedding-2-preview (3072 dims)
  metadata    JSONB DEFAULT '{}',
  indexed_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source, source_id)
);

-- HNSW index: handles incremental inserts well (unlike IVFFlat which needs data upfront)
CREATE INDEX IF NOT EXISTS search_embeddings_hnsw_idx
  ON search.embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS search_embeddings_source_idx
  ON search.embeddings (source);
