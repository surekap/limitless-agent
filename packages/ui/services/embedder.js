'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL = process.env.EMBEDDING_MODEL || 'gemini-embedding-2-preview';
const DIMS  = 3072;

let _client = null;

function getClient() {
  if (_client) return _client;
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  _client = new GoogleGenerativeAI(key);
  return _client;
}

function getModel() {
  return getClient().getGenerativeModel({ model: MODEL });
}

/**
 * Generate a single embedding.
 * taskType: 'RETRIEVAL_DOCUMENT' (indexing) | 'RETRIEVAL_QUERY' (searching)
 */
async function embed(text, taskType = 'RETRIEVAL_DOCUMENT') {
  const result = await getModel().embedContent({
    content:  { parts: [{ text: text.slice(0, 8000) }], role: 'user' },
    taskType,
  });
  return result.embedding.values;
}

/**
 * Embed multiple texts in batches of 100 (Gemini API limit per request).
 * Much faster than calling embed() in a loop — one round trip per 100 texts.
 */
async function embedBatch(texts, taskType = 'RETRIEVAL_DOCUMENT') {
  const CHUNK   = 100;
  const results = [];
  for (let i = 0; i < texts.length; i += CHUNK) {
    const slice = texts.slice(i, i + CHUNK);
    const { embeddings } = await getModel().batchEmbedContents({
      requests: slice.map(text => ({
        content:  { parts: [{ text: text.slice(0, 8000) }], role: 'user' },
        taskType,
      })),
    });
    results.push(...embeddings.map(e => e.values));
  }
  return results;
}

/**
 * Format an embedding array as a pgvector literal: '[0.1,0.2,...]'
 */
function toSql(vec) {
  return '[' + vec.join(',') + ']';
}

module.exports = { embed, embedBatch, toSql, DIMS, MODEL };
