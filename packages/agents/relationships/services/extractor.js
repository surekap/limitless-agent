'use strict'

const db = require('@secondbrain/db')

const MY_WA_JID = '919830049540@c.us'

/**
 * Get distinct direct chat contacts from WhatsApp messages.
 * Returns contacts with message stats and best display name.
 */
async function extractDirectChatContacts() {
  try {
    const { rows } = await db.query(`
      SELECT
        chat_id,
        COUNT(*) AS msg_count,
        COUNT(*) FILTER (WHERE (data->'id'->>'fromMe')::boolean = true)  AS my_msgs,
        COUNT(*) FILTER (WHERE (data->'id'->>'fromMe')::boolean = false) AS their_msgs,
        MAX(ts) AS last_msg_at,
        MIN(ts) AS first_msg_at,
        (
          SELECT m2.data->'_data'->>'notifyName'
          FROM public.messages m2
          WHERE m2.chat_id = m.chat_id
            AND m2.data->'_data'->>'notifyName' IS NOT NULL
            AND m2.data->'_data'->>'notifyName' != ''
          GROUP BY m2.data->'_data'->>'notifyName'
          ORDER BY COUNT(*) DESC
          LIMIT 1
        ) AS display_name
      FROM public.messages m
      WHERE chat_id LIKE '%@c.us'
        AND chat_id != $1
        AND chat_id != 'status@broadcast'
        AND event IN ('message', 'message_create', 'message_historical')
      GROUP BY chat_id
      HAVING COUNT(*) >= 2
      ORDER BY MAX(ts) DESC
    `, [MY_WA_JID])
    return rows
  } catch (err) {
    console.error('[extractor] extractDirectChatContacts error:', err.message)
    return []
  }
}

/**
 * Get recent messages for a specific direct chat.
 * Returns msg_type, caption, filename alongside body so callers can
 * distinguish text from media (image/video/document/location/ptt).
 */
async function getDirectMessages(chatId, limit = 30) {
  try {
    const { rows } = await db.query(`
      SELECT
        (data->'id'->>'fromMe')::boolean  AS from_me,
        data->>'body'                      AS body,
        msg_type,
        data->'_data'->>'caption'          AS caption,
        data->'_data'->>'filename'         AS filename,
        ts,
        data->'_data'->>'notifyName'       AS notify_name
      FROM public.messages
      WHERE chat_id = $1
        AND event IN ('message', 'message_create', 'message_historical')
        AND data->>'body' IS NOT NULL
        AND data->>'body' != ''
      ORDER BY ts DESC
      LIMIT $2
    `, [chatId, limit])
    return rows
  } catch (err) {
    console.error('[extractor] getDirectMessages error:', err.message)
    return []
  }
}

/**
 * Get distinct group chats with message stats.
 */
async function extractGroupChats() {
  try {
    const { rows } = await db.query(`
      SELECT
        chat_id,
        COUNT(*) AS msg_count,
        COUNT(*) FILTER (WHERE (data->'id'->>'fromMe')::boolean = true)  AS my_msgs,
        COUNT(*) FILTER (WHERE (data->'id'->>'fromMe')::boolean = false) AS their_msgs,
        MAX(ts) AS last_msg_at,
        MIN(ts) AS first_msg_at
      FROM public.messages
      WHERE chat_id LIKE '%@g.us'
        AND event IN ('message', 'message_create', 'message_historical')
      GROUP BY chat_id
      ORDER BY MAX(ts) DESC
    `)
    return rows
  } catch (err) {
    console.error('[extractor] extractGroupChats error:', err.message)
    return []
  }
}

/**
 * Get sample recent messages for a group chat.
 */
async function getGroupSampleMessages(groupChatId, limit = 15) {
  try {
    const { rows } = await db.query(`
      SELECT
        (data->'id'->>'fromMe')::boolean AS from_me,
        data->>'body'                     AS body,
        ts,
        data->'_data'->>'notifyName'      AS notify_name,
        data->>'author'                   AS author_raw,
        data->'id'->>'participant'        AS participant
      FROM public.messages
      WHERE chat_id = $1
        AND event IN ('message', 'message_create', 'message_historical')
        AND data->>'body' IS NOT NULL
        AND data->>'body' != ''
      ORDER BY ts DESC
      LIMIT $2
    `, [groupChatId, limit])
    return rows
  } catch (err) {
    console.error('[extractor] getGroupSampleMessages error:', err.message)
    return []
  }
}

/**
 * Try to get the group name from group_update events.
 */
async function getGroupName(groupChatId) {
  try {
    const { rows } = await db.query(`
      SELECT
        COALESCE(
          data->>'subject',
          data->'body'->>'subject'
        ) AS group_name
      FROM public.messages
      WHERE chat_id = $1
        AND event = 'group_update'
        AND (
          data->>'subject' IS NOT NULL
          OR data->'body'->>'subject' IS NOT NULL
        )
      ORDER BY ts DESC
      LIMIT 1
    `, [groupChatId])
    if (rows.length > 0 && rows[0].group_name) return rows[0].group_name

    // Fallback: try to get from any message notifyName or just return null
    return null
  } catch (err) {
    console.error('[extractor] getGroupName error:', err.message)
    return null
  }
}

/**
 * Get recent lifelogs from Limitless data.
 */
async function extractLimitlessConversations(limit = 100) {
  try {
    const { rows } = await db.query(`
      SELECT
        id,
        title,
        start_time,
        end_time,
        LEFT(markdown, 800) AS markdown_preview
      FROM limitless.lifelogs
      WHERE markdown IS NOT NULL AND markdown != ''
      ORDER BY start_time DESC
      LIMIT $1
    `, [limit])
    return rows
  } catch (err) {
    console.error('[extractor] extractLimitlessConversations error:', err.message)
    return []
  }
}

/**
 * Parse a raw email address like '"Name" <email>' into {name, email}.
 */
function parseEmailAddress(raw) {
  if (!raw) return { name: null, email: null }
  const match = raw.match(/^"?([^"<]+?)"?\s*<([^>]+)>$/)
  if (match) {
    return { name: match[1].trim(), email: match[2].trim().toLowerCase() }
  }
  const emailOnly = raw.match(/^[\w.+\-]+@[\w.\-]+$/)
  if (emailOnly) return { name: null, email: raw.trim().toLowerCase() }
  return { name: null, email: raw.trim().toLowerCase() }
}

/**
 * Get email contacts grouped by from_address with parsed name/email.
 * Also returns unread count per sender.
 * Handles empty table gracefully.
 */
async function getEmailContacts() {
  try {
    const { rows } = await db.query(`
      SELECT
        from_address,
        COUNT(*)                                       AS email_count,
        COUNT(*) FILTER (WHERE is_read = false)        AS unread_count,
        MAX(date)                                      AS last_email_at,
        MIN(date)                                      AS first_email_at,
        ARRAY_AGG(DISTINCT subject ORDER BY subject)
          FILTER (WHERE subject IS NOT NULL)           AS subjects
      FROM email.emails
      WHERE from_address IS NOT NULL
        AND from_address != ''
      GROUP BY from_address
      ORDER BY MAX(date) DESC
    `)
    return rows.map(r => ({ ...r, ...parseEmailAddress(r.from_address) }))
  } catch (err) {
    return []
  }
}

/**
 * Get individual emails for a specific sender address.
 */
async function getEmailsBySender(fromAddress, limit = 20) {
  try {
    const { rows } = await db.query(`
      SELECT id, subject, date, is_read, body_text, to_addresses
      FROM email.emails
      WHERE from_address = $1
      ORDER BY date DESC
      LIMIT $2
    `, [fromAddress, limit])
    return rows
  } catch (err) {
    return []
  }
}

module.exports = {
  MY_WA_JID,
  parseEmailAddress,
  extractDirectChatContacts,
  getDirectMessages,
  extractGroupChats,
  getGroupSampleMessages,
  getGroupName,
  extractLimitlessConversations,
  getEmailContacts,
  getEmailsBySender,
}
