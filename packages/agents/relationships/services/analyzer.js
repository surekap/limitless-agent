'use strict'

const Anthropic = require('@anthropic-ai/sdk')

const MODEL = 'claude-sonnet-4-6'

let client = null

function getClient() {
  if (!client) {
    client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Parse JSON from Claude's response, handling markdown code fences.
 */
function parseJSON(text) {
  const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(clean)
}

/**
 * Analyze a WhatsApp direct chat contact using Claude.
 * Returns structured contact profile.
 */
async function analyzeDirectChatContact(chatId, contactData, messages, existingOverrides) {
  const defaults = {
    display_name: contactData.display_name || chatId.replace('@c.us', ''),
    company: null,
    job_title: null,
    relationship_type: 'unknown',
    relationship_strength: 'weak',
    summary: 'No analysis available.',
    tags: [],
    is_noise: false,
  }

  try {
    const phone = chatId.replace('@c.us', '')
    const displayName = contactData.display_name || `+${phone}`

    // Build message sample (up to 20 messages)
    const sample = messages.slice(0, 20).map(m => {
      const who = m.from_me ? 'Me' : (m.notify_name || displayName)
      const date = m.ts ? new Date(m.ts).toLocaleDateString() : ''
      return `[${who}] (${date}): ${(m.body || '').slice(0, 200)}`
    }).join('\n')

    // Include manually-confirmed facts as ground truth
    const overrides = existingOverrides || {}
    const overrideKeys = Object.keys(overrides)
    const overrideContext = overrideKeys.length > 0
      ? `\nUser-confirmed facts (treat as ground truth, do not contradict):\n${overrideKeys.map(k => `- ${k}: ${JSON.stringify(overrides[k].value)}`).join('\n')}\n`
      : ''

    const prompt = `Analyze this WhatsApp contact and return a JSON profile.

Contact info:
- Phone: ${phone}
- Display name: ${displayName}
- Total messages: ${contactData.msg_count}
- My messages: ${contactData.my_msgs}
- Their messages: ${contactData.their_msgs}
- First seen: ${contactData.first_msg_at ? new Date(contactData.first_msg_at).toLocaleDateString() : 'unknown'}
- Last seen: ${contactData.last_msg_at ? new Date(contactData.last_msg_at).toLocaleDateString() : 'unknown'}
${overrideContext}
Recent messages (newest first):
${sample || '(no text messages)'}

Return ONLY valid JSON with these fields:
{
  "display_name": "best name for this person",
  "company": null or "company name",
  "job_title": null or "their job title",
  "relationship_type": "family|friend|colleague|client|vendor|service_provider|professional_contact|unknown",
  "relationship_strength": "strong|moderate|weak|noise",
  "summary": "2-3 sentence description of who this person is and your relationship",
  "tags": ["tag1", "tag2"],
  "is_noise": false
}

Set is_noise=true for: bots, spam, automated alerts, OTP services, delivery notifications, bank alerts, unknown contacts with only automated messages.
relationship_strength=noise means this contact is not meaningful (same as is_noise).`

    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0]?.text || ''
    const result = parseJSON(text)

    return {
      display_name: result.display_name || defaults.display_name,
      company: result.company || null,
      job_title: result.job_title || null,
      relationship_type: result.relationship_type || 'unknown',
      relationship_strength: result.relationship_strength || 'weak',
      summary: result.summary || '',
      tags: Array.isArray(result.tags) ? result.tags : [],
      is_noise: Boolean(result.is_noise),
    }
  } catch (err) {
    console.error('[analyzer] analyzeDirectChatContact error:', err.message)
    return defaults
  }
}

/**
 * Deep analysis of a single WhatsApp group.
 * Classifies group type, infers user's role, extracts intelligence.
 *
 * @param {object} group   - Row from relationships.groups (wa_chat_id, name, msg_count, my_msg_count)
 * @param {Array}  messages - Recent messages [{from_me, body, notify_name, ts}]
 * @returns {object} analysis result
 */
async function analyzeGroup(group, messages) {
  const defaults = {
    group_type: 'unknown',
    my_role: 'unknown',
    ai_summary: null,
    key_topics: [],
    communication_advice: null,
    notable_contacts: [],
    opportunities: [],
    is_noise: false,
  }

  if (!messages || messages.length === 0) return defaults

  try {
    const totalMsgs = Number(group.msg_count) || 0
    const myMsgs    = Number(group.my_msg_count) || 0
    const myPct     = totalMsgs > 0 ? Math.round((myMsgs / totalMsgs) * 100) : 0

    // Sample: up to 50 most recent messages
    const sample = messages.slice(0, 50).map(m => {
      const who  = m.from_me ? 'Me' : (m.notify_name || 'Other')
      const date = m.ts ? new Date(m.ts).toLocaleDateString('en-GB') : ''
      return `[${who}] (${date}): ${(m.body || '').slice(0, 180)}`
    }).join('\n')

    // Extract unique participant names for context
    const participants = [...new Set(
      messages.filter(m => !m.from_me && m.notify_name).map(m => m.notify_name)
    )].slice(0, 20)

    const prompt = `You are analyzing a WhatsApp group for a senior business executive. Provide deep intelligence about this group.

Group name: "${group.name || group.wa_chat_id}"
Total messages: ${totalMsgs}
My messages: ${myMsgs} (${myPct}% of total)
Participants seen: ${participants.join(', ') || 'unknown'}
Last active: ${group.last_activity_at ? new Date(group.last_activity_at).toLocaleDateString('en-GB') : 'unknown'}

Recent messages (newest first):
${sample}

Analyze and return ONLY valid JSON:
{
  "group_type": "board_peers|management|employees|community|unknown",
  "my_role": "active_leader|active_participant|occasional_contributor|status_receiver|passive_observer",
  "ai_summary": "2-3 sentences: what this group is, who is in it, what it's used for",
  "key_topics": ["topic1", "topic2", "topic3"],
  "communication_advice": "1-2 sentences: how the executive should engage with this group given their role and the group's level/type. Be specific about tone, frequency, and angle.",
  "notable_contacts": [
    {"name": "...", "role_or_context": "...", "why_notable": "..."}
  ],
  "opportunities": [
    {"title": "...", "description": "...", "priority": "high|medium|low"}
  ],
  "is_noise": false
}

Definitions:
- group_type:
  * board_peers = board members, investors, senior industry peers, C-suite of other companies
  * management = colleagues, managers, direct reports, internal project teams
  * employees = subordinates, field staff, workers — groups where executive has authority
  * community = industry associations, alumni, large networking groups, trade bodies, social groups
  * unknown = can't determine

- my_role (based on ${myPct}% participation):
  * active_leader = >30% messages, sets agenda, takes decisions
  * active_participant = 15-30%, regular contributor
  * occasional_contributor = 5-15%, chimes in when needed
  * status_receiver = 1-5%, mostly reading updates, low direct responsibility
  * passive_observer = <1%, monitoring only

- notable_contacts: Only populate if group_type is "community" OR if there are 1-2 specific people worth connecting with directly. Empty array otherwise.

- opportunities: Missed business/relationship opportunities visible in the chat. Only real, specific opportunities — not generic advice. For community groups especially look hard for: business leads, introductions offered, market intelligence, events mentioned. Empty array if none.

- communication_advice:
  * For board_peers: strategic, concise, agenda-focused
  * For management: collaborative but directive when needed
  * For employees: clear directives, motivation, accountability
  * For community: selective engagement, add value not noise, mine for contacts
  * If my_role is status_receiver/passive_observer: note that direct engagement may not be expected but flag if there are moments where input would add value

- is_noise: true only for spam/broadcast/automated groups with no real human conversation`

    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text   = response.content[0]?.text || ''
    const result = parseJSON(text)

    return {
      group_type:           result.group_type           || 'unknown',
      my_role:              result.my_role              || 'unknown',
      ai_summary:           result.ai_summary           || null,
      key_topics:           Array.isArray(result.key_topics)        ? result.key_topics        : [],
      communication_advice: result.communication_advice || null,
      notable_contacts:     Array.isArray(result.notable_contacts)  ? result.notable_contacts  : [],
      opportunities:        Array.isArray(result.opportunities)     ? result.opportunities     : [],
      is_noise:             Boolean(result.is_noise),
    }
  } catch (err) {
    console.error('[analyzer] analyzeGroup error:', err.message)
    return defaults
  }
}

/**
 * Extract mentioned people from Limitless lifelog markdowns.
 * Returns array of {name, contexts, relationship_hint}.
 */
async function analyzeLimitlessParticipants(lifelogs) {
  if (!lifelogs || lifelogs.length === 0) return []

  try {
    const combined = lifelogs.slice(0, 20).map(l =>
      `=== ${l.title || l.id} (${l.start_time ? new Date(l.start_time).toLocaleDateString() : ''}) ===\n${l.markdown_preview || ''}`
    ).join('\n\n')

    const prompt = `Extract all named people mentioned in these conversation transcripts (excluding "You" and "Unknown").

Transcripts:
${combined.slice(0, 4000)}

Return ONLY a JSON array:
[
  {
    "name": "Person Name",
    "contexts": ["brief context 1", "brief context 2"],
    "relationship_hint": "colleague|friend|client|family|unknown"
  }
]

Only include real named people. Skip generic terms like "someone", "they", etc.`

    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0]?.text || ''
    const result = parseJSON(text)
    return Array.isArray(result) ? result : []
  } catch (err) {
    console.error('[analyzer] analyzeLimitlessParticipants error:', err.message)
    return []
  }
}

/**
 * Generate actionable insights for a specific contact.
 */
async function generateContactInsights(contact, recentComms) {
  if (!contact) return []

  try {
    const commSummary = (recentComms || []).slice(0, 10).map(c =>
      `- [${c.source}] ${c.direction} on ${c.occurred_at ? new Date(c.occurred_at).toLocaleDateString() : ''}: ${(c.content_snippet || '').slice(0, 150)}`
    ).join('\n')

    const prompt = `Generate actionable insights for this contact relationship.

Contact: ${contact.display_name}
Company: ${contact.company || 'unknown'}
Relationship: ${contact.relationship_type} (${contact.relationship_strength})
Summary: ${contact.summary || ''}
Last interaction: ${contact.last_interaction_at ? new Date(contact.last_interaction_at).toLocaleDateString() : 'unknown'}

Recent communications:
${commSummary || '(none)'}

Return ONLY a JSON array of insights (max 3):
[
  {
    "insight_type": "opportunity|action_needed|topic",
    "title": "Short title",
    "description": "Actionable description",
    "priority": "high|medium|low"
  }
]

Only return insights that are genuinely actionable. Empty array if nothing notable.`

    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0]?.text || ''
    const result = parseJSON(text)
    return Array.isArray(result) ? result : []
  } catch (err) {
    console.error('[analyzer] generateContactInsights error:', err.message)
    return []
  }
}

module.exports = {
  sleep,
  analyzeDirectChatContact,
  analyzeGroup,
  analyzeLimitlessParticipants,
  generateContactInsights,
}
