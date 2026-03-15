'use strict';

/**
 * Background indexer — runs periodically, finds unembedded content from all sources,
 * generates embeddings via all-MiniLM-L6-v2, and upserts into search.embeddings.
 *
 * Sources:
 *   email          → email.emails
 *   lifelog        → limitless.lifelogs
 *   whatsapp       → public.messages
 *   contact        → relationships.contacts
 *   insight        → relationships.insights
 *   project        → projects.projects
 *   project_insight→ projects.project_insights
 */

const { embed, toSql } = require('./embedder');

const BATCH = 30;   // rows per source per run
const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

let _db  = null;
let _tid = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function upsert(source, sourceId, content, embedding, metadata) {
  await _db.query(`
    INSERT INTO search.embeddings (source, source_id, content, embedding, metadata)
    VALUES ($1, $2, $3, $4::public.vector, $5)
    ON CONFLICT (source, source_id) DO UPDATE
      SET content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          metadata = EXCLUDED.metadata,
          indexed_at = NOW()
  `, [source, String(sourceId), content.slice(0, 2000), toSql(embedding), JSON.stringify(metadata)]);
}

function truncate(str, n = 800) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

// ── Source indexers ───────────────────────────────────────────────────────────

async function indexEmails() {
  let count = 0;
  try {
    const { rows } = await _db.query(`
      SELECT e.id, e.subject, e.from_address, e.date,
             LEFT(e.body_text, 800) AS body
      FROM email.emails e
      WHERE NOT EXISTS (
        SELECT 1 FROM search.embeddings s
        WHERE s.source = 'email' AND s.source_id = e.id::text
      )
      ORDER BY e.date DESC
      LIMIT $1
    `, [BATCH]);

    for (const row of rows) {
      const content = [row.subject, row.body].filter(Boolean).join('\n');
      if (!content.trim()) continue;
      const vec = await embed(content);
      await upsert('email', row.id, content, vec, {
        subject:      row.subject,
        from_address: row.from_address,
        date:         row.date,
      });
      count++;
    }
  } catch (e) {
    if (!e.message.includes('does not exist')) console.warn('[indexer] email:', e.message);
  }
  return count;
}

async function indexLifelogs() {
  let count = 0;
  try {
    const { rows } = await _db.query(`
      SELECT l.id, l.title, l.start_time,
             LEFT(COALESCE(l.markdown, l.contents, ''), 800) AS body
      FROM limitless.lifelogs l
      WHERE NOT EXISTS (
        SELECT 1 FROM search.embeddings s
        WHERE s.source = 'lifelog' AND s.source_id = l.id::text
      )
      ORDER BY l.start_time DESC NULLS LAST
      LIMIT $1
    `, [BATCH]);

    for (const row of rows) {
      const content = [row.title, row.body].filter(Boolean).join('\n');
      if (!content.trim()) continue;
      const vec = await embed(content);
      await upsert('lifelog', row.id, content, vec, {
        title:      row.title,
        start_time: row.start_time,
      });
      count++;
    }
  } catch (e) {
    if (!e.message.includes('does not exist')) console.warn('[indexer] lifelog:', e.message);
  }
  return count;
}

async function indexWhatsApp() {
  let count = 0;
  try {
    // Use chat_id + epoch-ms as a stable composite key
    const { rows } = await _db.query(`
      SELECT
        chat_id,
        ts,
        EXTRACT(EPOCH FROM ts)::bigint AS epoch,
        (data->'id'->>'fromMe')::boolean          AS from_me,
        data->>'body'                              AS body,
        data->'_data'->>'notifyName'               AS notify_name
      FROM public.messages
      WHERE event IN ('message', 'message_create', 'message_historical')
        AND msg_type = 'chat'
        AND data->>'body' IS NOT NULL
        AND LENGTH(data->>'body') > 8
        AND NOT EXISTS (
          SELECT 1 FROM search.embeddings s
          WHERE s.source = 'whatsapp'
            AND s.source_id = chat_id || '::' || EXTRACT(EPOCH FROM ts)::bigint::text
        )
      ORDER BY ts DESC
      LIMIT $1
    `, [BATCH]);

    for (const row of rows) {
      const sourceId = `${row.chat_id}::${row.epoch}`;
      const content  = row.body.trim();
      const vec = await embed(content);
      await upsert('whatsapp', sourceId, content, vec, {
        chat_id:     row.chat_id,
        from_me:     row.from_me,
        notify_name: row.notify_name,
        ts:          row.ts,
      });
      count++;
    }
  } catch (e) {
    if (!e.message.includes('does not exist')) console.warn('[indexer] whatsapp:', e.message);
  }
  return count;
}

async function indexContacts() {
  let count = 0;
  try {
    const { rows } = await _db.query(`
      SELECT c.id, c.display_name, c.company, c.job_title,
             c.relationship_type, c.summary
      FROM relationships.contacts c
      WHERE NOT c.is_noise
        AND NOT EXISTS (
          SELECT 1 FROM search.embeddings s
          WHERE s.source = 'contact' AND s.source_id = c.id::text
        )
      LIMIT $1
    `, [BATCH]);

    for (const row of rows) {
      const content = [
        row.display_name,
        row.company && row.job_title ? `${row.job_title} at ${row.company}` : (row.company || row.job_title),
        row.summary,
      ].filter(Boolean).join('\n');
      if (!content.trim()) continue;
      const vec = await embed(content);
      await upsert('contact', row.id, content, vec, {
        display_name:      row.display_name,
        company:           row.company,
        relationship_type: row.relationship_type,
      });
      count++;
    }
  } catch (e) {
    if (!e.message.includes('does not exist')) console.warn('[indexer] contacts:', e.message);
  }
  return count;
}

async function indexInsights() {
  let count = 0;
  try {
    const { rows } = await _db.query(`
      SELECT i.id, i.insight_type, i.title, i.description,
             i.priority, i.created_at,
             c.display_name AS contact_name
      FROM relationships.insights i
      LEFT JOIN relationships.contacts c ON c.id = i.contact_id
      WHERE NOT EXISTS (
        SELECT 1 FROM search.embeddings s
        WHERE s.source = 'insight' AND s.source_id = i.id::text
      )
      LIMIT $1
    `, [BATCH]);

    for (const row of rows) {
      const content = [row.title, row.description].filter(Boolean).join('\n');
      if (!content.trim()) continue;
      const vec = await embed(content);
      await upsert('insight', row.id, content, vec, {
        title:        row.title,
        insight_type: row.insight_type,
        priority:     row.priority,
        contact_name: row.contact_name,
        created_at:   row.created_at,
      });
      count++;
    }
  } catch (e) {
    if (!e.message.includes('does not exist')) console.warn('[indexer] insights:', e.message);
  }
  return count;
}

async function indexProjects() {
  let count = 0;
  try {
    const { rows } = await _db.query(`
      SELECT p.id, p.name, p.description, p.status, p.health,
             p.ai_summary, p.last_activity_at
      FROM projects.projects p
      WHERE NOT p.is_archived
        AND NOT EXISTS (
          SELECT 1 FROM search.embeddings s
          WHERE s.source = 'project' AND s.source_id = p.id::text
        )
      LIMIT $1
    `, [BATCH]);

    for (const row of rows) {
      const content = [row.name, row.description, truncate(row.ai_summary, 500)].filter(Boolean).join('\n');
      if (!content.trim()) continue;
      const vec = await embed(content);
      await upsert('project', row.id, content, vec, {
        name:             row.name,
        status:           row.status,
        health:           row.health,
        last_activity_at: row.last_activity_at,
      });
      count++;
    }
  } catch (e) {
    if (!e.message.includes('does not exist')) console.warn('[indexer] projects:', e.message);
  }
  return count;
}

async function indexProjectInsights() {
  let count = 0;
  try {
    const { rows } = await _db.query(`
      SELECT pi.id, pi.insight_type, pi.content, pi.priority, pi.created_at,
             p.name AS project_name
      FROM projects.project_insights pi
      JOIN projects.projects p ON p.id = pi.project_id
      WHERE NOT pi.is_resolved
        AND NOT EXISTS (
          SELECT 1 FROM search.embeddings s
          WHERE s.source = 'project_insight' AND s.source_id = pi.id::text
        )
      LIMIT $1
    `, [BATCH]);

    for (const row of rows) {
      if (!row.content?.trim()) continue;
      const vec = await embed(row.content);
      await upsert('project_insight', row.id, row.content, vec, {
        insight_type:  row.insight_type,
        priority:      row.priority,
        project_name:  row.project_name,
        created_at:    row.created_at,
      });
      count++;
    }
  } catch (e) {
    if (!e.message.includes('does not exist')) console.warn('[indexer] project_insights:', e.message);
  }
  return count;
}

// ── Status tracking ───────────────────────────────────────────────────────────

const _status = {
  running:      false,
  lastRunAt:    null,   // Date
  lastRunCount: null,   // number of items indexed in last run (null = never run)
  nextRunAt:    null,   // Date
  startedAt:    null,   // Date server started indexer
};

function getStatus() {
  return {
    running:      _status.running,
    lastRunAt:    _status.lastRunAt?.toISOString() ?? null,
    lastRunCount: _status.lastRunCount,
    nextRunAt:    _status.nextRunAt?.toISOString() ?? null,
    startedAt:    _status.startedAt?.toISOString() ?? null,
    intervalMs:   INTERVAL_MS,
  };
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function runOnce() {
  if (_status.running) return;   // prevent overlapping runs
  _status.running = true;
  const jobs = [
    indexEmails, indexLifelogs, indexWhatsApp,
    indexContacts, indexInsights, indexProjects, indexProjectInsights,
  ];
  let total = 0;
  for (const job of jobs) {
    total += await job();
  }
  _status.running      = false;
  _status.lastRunAt    = new Date();
  _status.lastRunCount = total;
  if (total > 0) console.log(`[indexer] Indexed ${total} new items`);
  else           console.log(`[indexer] Run complete — nothing new to index`);
}

function start(db) {
  if (_tid) return;
  _db = db;
  _status.startedAt = new Date();

  // Run after a short delay so the server finishes booting first
  setTimeout(async () => {
    await runOnce();
    _status.nextRunAt = new Date(Date.now() + INTERVAL_MS);
    _tid = setInterval(() => {
      _status.nextRunAt = new Date(Date.now() + INTERVAL_MS);
      runOnce();
    }, INTERVAL_MS);
  }, 15_000);

  _status.nextRunAt = new Date(Date.now() + 15_000);
  console.log('[indexer] Started (runs every 10 min; first pass in 15 s)');
}

function stop() {
  clearInterval(_tid);
  _tid = null;
  _status.nextRunAt = null;
}

module.exports = { start, stop, runOnce, getStatus };
