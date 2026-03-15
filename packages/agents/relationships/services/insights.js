'use strict'

const db = require('@secondbrain/db')
const { MY_WA_JID } = require('./extractor')

/**
 * Find direct WhatsApp chats where the last message was inbound
 * and has not been replied to within 2 hours, up to 30 days ago.
 */
async function findAwaitingReplyContacts() {
  try {
    const { rows } = await db.query(`
      WITH last_msgs AS (
        SELECT DISTINCT ON (chat_id)
          chat_id,
          (data->'id'->>'fromMe')::boolean AS from_me,
          data->>'body'                     AS body,
          ts,
          data->'_data'->>'notifyName'      AS display_name
        FROM public.messages
        WHERE chat_id LIKE '%@c.us'
          AND chat_id != $1
          AND chat_id != 'status@broadcast'
          AND event IN ('message', 'message_create', 'message_historical')
          AND data->>'body' IS NOT NULL
          AND data->>'body' != ''
        ORDER BY chat_id, ts DESC
      )
      SELECT
        chat_id,
        body   AS last_msg_body,
        ts     AS last_msg_at,
        display_name
      FROM last_msgs
      WHERE from_me = false
        AND ts < NOW() - INTERVAL '2 hours'
        AND ts > NOW() - INTERVAL '30 days'
      ORDER BY ts DESC
    `, [MY_WA_JID])
    return rows
  } catch (err) {
    console.error('[insights] findAwaitingReplyContacts error:', err.message)
    return []
  }
}

/**
 * Find group chats with activity in the last 7 days
 * where I haven't sent any messages and there are > 3 messages from others.
 */
async function findActiveGroupsNotParticipating() {
  try {
    const { rows } = await db.query(`
      SELECT
        chat_id,
        COUNT(*) FILTER (WHERE (data->'id'->>'fromMe')::boolean = false) AS their_msgs,
        MAX(ts) AS last_msg_at
      FROM public.messages
      WHERE chat_id LIKE '%@g.us'
        AND event IN ('message', 'message_create', 'message_historical')
        AND ts > NOW() - INTERVAL '7 days'
      GROUP BY chat_id
      HAVING
        COUNT(*) FILTER (WHERE (data->'id'->>'fromMe')::boolean = true) = 0
        AND COUNT(*) FILTER (WHERE (data->'id'->>'fromMe')::boolean = false) > 3
      ORDER BY MAX(ts) DESC
    `)

    // For each group, fetch a sample of recent messages
    const results = []
    for (const row of rows) {
      try {
        const { rows: msgs } = await db.query(`
          SELECT
            data->>'body' AS body,
            ts,
            data->'_data'->>'notifyName' AS notify_name
          FROM public.messages
          WHERE chat_id = $1
            AND event IN ('message', 'message_create', 'message_historical')
            AND data->>'body' IS NOT NULL
            AND data->>'body' != ''
          ORDER BY ts DESC
          LIMIT 5
        `, [row.chat_id])
        results.push({ ...row, sample_msgs: msgs })
      } catch {
        results.push({ ...row, sample_msgs: [] })
      }
    }
    return results
  } catch (err) {
    console.error('[insights] findActiveGroupsNotParticipating error:', err.message)
    return []
  }
}

/**
 * Find unread inbound emails from likely-human senders (not automated services).
 * Since thread_id is NULL in this dataset, we use is_read=false as the primary signal,
 * and filter out noise senders (noreply, alerts, notifications, etc.)
 */
async function findColdEmailsNotReplied() {
  try {
    const { rows } = await db.query(`
      SELECT
        e.id,
        e.subject,
        e.from_address,
        e.date,
        e.is_read,
        e.body_text
      FROM email.emails e
      WHERE e.is_read = false
        AND e.from_address NOT ILIKE '%noreply%'
        AND e.from_address NOT ILIKE '%no-reply%'
        AND e.from_address NOT ILIKE '%donotreply%'
        AND e.from_address NOT ILIKE '%notifications%'
        AND e.from_address NOT ILIKE '%alert%'
        AND e.from_address NOT ILIKE '%support@%'
        AND e.from_address NOT ILIKE '%info@%'
        AND e.from_address NOT ILIKE '%newsletter%'
        AND e.from_address NOT ILIKE '%marketing%'
        AND e.from_address NOT ILIKE '%mailer%'
        AND e.from_address NOT ILIKE '%bounce%'
        AND e.date > NOW() - INTERVAL '60 days'
      ORDER BY e.date DESC
      LIMIT 30
    `)
    return rows
  } catch (err) {
    return []
  }
}

/**
 * Parse speaker names from recent lifelog markdowns.
 * Returns names that are not 'You' or 'Unknown'.
 */
async function findMentionedPeopleInLifelogs() {
  try {
    const { rows } = await db.query(`
      SELECT markdown
      FROM limitless.lifelogs
      WHERE markdown IS NOT NULL AND markdown != ''
      ORDER BY start_time DESC
      LIMIT 30
    `)

    const nameSet = new Set()
    const nameRegex = /^-\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+\(/gm

    for (const row of rows) {
      const markdown = row.markdown || ''
      let match
      while ((match = nameRegex.exec(markdown)) !== null) {
        const name = match[1].trim()
        if (name !== 'You' && name !== 'Unknown' && name.length > 1) {
          nameSet.add(name)
        }
        // reset lastIndex for re-exec across rows
      }
    }

    return Array.from(nameSet)
  } catch (err) {
    console.error('[insights] findMentionedPeopleInLifelogs error:', err.message)
    return []
  }
}

module.exports = {
  findAwaitingReplyContacts,
  findActiveGroupsNotParticipating,
  findColdEmailsNotReplied,
  findMentionedPeopleInLifelogs,
}
