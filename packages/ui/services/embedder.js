'use strict';

const path = require('path');

// Lazily initialized pipeline — first call downloads ~25 MB model to .model-cache/
let _pipe = null;
let _loading = null;

async function getPipeline() {
  if (_pipe) return _pipe;
  if (_loading) return _loading;

  _loading = (async () => {
    const { pipeline, env } = await import('@xenova/transformers');
    env.cacheDir = path.resolve(__dirname, '../../../.model-cache');
    env.allowLocalModels = true;
    console.log('[embedder] Loading all-MiniLM-L6-v2 (downloads on first run)…');
    _pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
    console.log('[embedder] Model ready');
    return _pipe;
  })();

  return _loading;
}

/**
 * Generate a 384-dimensional embedding for `text`.
 * Returns a plain JS number array.
 */
async function embed(text) {
  const pipe = await getPipeline();
  const out  = await pipe(text.slice(0, 2000), { pooling: 'mean', normalize: true });
  return Array.from(out.data);
}

/**
 * Embed multiple texts in series (the model isn't thread-safe across concurrent calls).
 * Returns array of embedding arrays in the same order.
 */
async function embedBatch(texts) {
  const results = [];
  for (const t of texts) {
    results.push(await embed(t));
  }
  return results;
}

/**
 * Format an embedding array as a pgvector literal: '[0.1,0.2,...]'
 */
function toSql(vec) {
  return '[' + vec.join(',') + ']';
}

module.exports = { embed, embedBatch, toSql };
