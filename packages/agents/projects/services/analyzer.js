'use strict'

const Anthropic = require('@anthropic-ai/sdk')
const db        = require('@secondbrain/db')

const MODEL = 'claude-sonnet-4-6'

let client = null

function getClient() {
  if (!client) {
    client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

function parseJSON(text) {
  const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(clean)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Analyze a single project and generate a status report with insights.
 * Updates project record and inserts insights into DB.
 */
async function analyzeProject(project, communications) {
  if (!project) return

  const commList = communications.slice(0, 30).map(c => {
    const date = c.occurred_at ? new Date(c.occurred_at).toLocaleDateString() : 'unknown'
    const source = c.source === 'email' ? '📧' : c.source === 'whatsapp' ? '💬' : '🎙'
    const subject = c.subject ? ` [${c.subject}]` : ''
    return `  [${date}] ${source}${subject}: ${(c.content_snippet || '').slice(0, 200)}`
  }).join('\n')

  // Include any manually-confirmed facts as ground truth for Claude
  const overrides = project.manual_overrides || {}
  const overrideKeys = Object.keys(overrides)
  const overrideContext = overrideKeys.length > 0
    ? `\nUser-confirmed facts (treat as ground truth, do not contradict):\n${overrideKeys.map(k => `- ${k}: ${JSON.stringify(overrides[k].value)}`).join('\n')}\n`
    : ''

  const prompt = `Analyze this project and provide a status report.

Project: ${project.name}${project.description ? ` — ${project.description}` : ''}
${overrideContext}Communications (newest first):
${commList || '(no communications found)'}

Return JSON:
{
  "status": "active|stalled|completed|on_hold|unknown",
  "health": "on_track|at_risk|blocked|unknown",
  "ai_summary": "2-3 sentence current status summary",
  "next_action": "Most important next step (one sentence)",
  "insights": [
    {"insight_type": "status|next_action|risk|opportunity|blocker|decision", "content": "...", "priority": "high|medium|low"}
  ]
}

Focus on what's actionable. Identify risks and blockers. Be direct. Max 5 insights.`

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0]?.text || ''
    const result = parseJSON(text)

    // Update project — skip any fields the user has manually overridden
    await db.query(`
      UPDATE projects.projects SET
        status      = CASE WHEN manual_overrides ? 'status'      THEN status      ELSE $1 END,
        health      = CASE WHEN manual_overrides ? 'health'      THEN health      ELSE $2 END,
        ai_summary  = $3,
        next_action = CASE WHEN manual_overrides ? 'next_action' THEN next_action ELSE $4 END,
        updated_at  = NOW()
      WHERE id = $5
    `, [
      result.status  || project.status  || 'unknown',
      result.health  || project.health  || 'unknown',
      result.ai_summary  || null,
      result.next_action || null,
      project.id,
    ])

    // Insert insights (only new ones — clear old unresolved ones first)
    if (Array.isArray(result.insights) && result.insights.length > 0) {
      // Delete old unresolved insights for this project to avoid stale accumulation
      await db.query(`
        DELETE FROM projects.project_insights
        WHERE project_id = $1 AND is_resolved = FALSE
      `, [project.id])

      for (const insight of result.insights.slice(0, 5)) {
        try {
          await db.query(`
            INSERT INTO projects.project_insights (project_id, insight_type, content, priority)
            VALUES ($1, $2, $3, $4)
          `, [
            project.id,
            insight.insight_type || 'status',
            insight.content      || '',
            insight.priority     || 'medium',
          ])
        } catch (err) {
          // ignore
        }
      }
    }

    return result
  } catch (err) {
    console.error(`[analyzer] analyzeProject error for "${project.name}":`, err.message)
    return null
  }
}

/**
 * Load recent communications for a project from DB.
 */
async function getProjectCommunications(projectId, limit) {
  limit = limit || 30
  try {
    const { rows } = await db.query(`
      SELECT source, source_id, content_snippet, subject, occurred_at, relevance_score
      FROM projects.project_communications
      WHERE project_id = $1
      ORDER BY occurred_at DESC NULLS LAST
      LIMIT $2
    `, [projectId, limit])
    return rows
  } catch (err) {
    console.error('[analyzer] getProjectCommunications error:', err.message)
    return []
  }
}

module.exports = { analyzeProject, getProjectCommunications, sleep }
