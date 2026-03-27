'use strict'

/**
 * Shared AI client with Anthropic/OpenAI fallback.
 *
 * Tries providers in order: first the one named in AI_PROVIDER env var
 * (default: anthropic), then the other. On quota/credit/rate-limit errors,
 * logs a warning and falls back to the next provider.
 *
 * Normalized input message format:
 *   { role: 'system', content: string }
 *   { role: 'user', content: string }
 *   { role: 'assistant', content: string | null, tool_calls: [{id, name, input}] }
 *   { role: 'tool', tool_call_id: string, content: string }
 *
 * Normalized tool definition format (Anthropic-style):
 *   { name: string, description: string, input_schema: JSON Schema }
 *
 * Normalized response:
 *   { text, tool_calls: [{id, name, input}], stop_reason, provider }
 */

// ── Quota error detection ─────────────────────────────────────────────────────

const QUOTA_PHRASES = ['credit', 'quota', 'billing', 'insufficient_quota', 'rate_limit']

function isQuotaError(err) {
  const status = err.status || err.statusCode || (err.response && err.response.status)
  if (status === 429 || status === 402) return true
  const msg = (err.message || '').toLowerCase()
  if (QUOTA_PHRASES.some(p => msg.includes(p))) return true
  // claude-cli exits with code 1 on rate limits (empty stderr)
  if (msg.includes('[claude-cli] exited 1') || msg.includes('[claude-cli] exited')) return true
  return false
}

// ── Anthropic helpers ─────────────────────────────────────────────────────────

function toAnthropicMessages(messages) {
  const systemMsg = messages.find(m => m.role === 'system')
  const nonSystem = messages.filter(m => m.role !== 'system')

  const converted = nonSystem.map(m => {
    if (m.role === 'tool') {
      // Convert tool result to Anthropic user message with tool_result block
      return {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: m.tool_call_id,
          content: m.content,
        }],
      }
    }

    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      // Convert assistant message with tool calls to Anthropic content blocks
      const blocks = []
      if (m.content) {
        blocks.push({ type: 'text', text: m.content })
      }
      for (const tc of m.tool_calls) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
      }
      return { role: 'assistant', content: blocks }
    }

    return { role: m.role, content: Array.isArray(m.content) ? m.content : (m.content || '') }
  })

  return { systemMsg: systemMsg ? systemMsg.content : undefined, converted }
}

function toAnthropicTools(tools) {
  if (!tools || tools.length === 0) return undefined
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }))
}

function parseAnthropicResponse(response) {
  let text = null
  const tool_calls = []

  for (const block of (response.content || [])) {
    if (block.type === 'text') {
      text = block.text
    } else if (block.type === 'tool_use') {
      tool_calls.push({ id: block.id, name: block.name, input: block.input })
    }
  }

  let stop_reason = 'end_turn'
  if (response.stop_reason === 'tool_use') stop_reason = 'tool_use'
  else if (response.stop_reason === 'max_tokens') stop_reason = 'max_tokens'

  return { text, tool_calls, stop_reason }
}

async function callAnthropic({ system, messages, tools, max_tokens }) {
  const Anthropic = require('@anthropic-ai/sdk')
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw Object.assign(new Error('ANTHROPIC_API_KEY not set'), { status: 402 })

  const anthropic = new Anthropic.default({ apiKey })

  const { systemMsg, converted } = toAnthropicMessages(messages)
  const effectiveSystem = system || systemMsg

  const params = {
    model: process.env.AI_ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    max_tokens: max_tokens || 4096,
    messages: converted,
  }
  if (effectiveSystem) params.system = effectiveSystem
  const anthropicTools = toAnthropicTools(tools)
  if (anthropicTools) params.tools = anthropicTools

  const response = await anthropic.messages.create(params)
  return parseAnthropicResponse(response)
}

// ── OpenAI helpers ────────────────────────────────────────────────────────────

function toOpenAIMessages(messages) {
  return messages.map(m => {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content }
    }

    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.input) },
        })),
      }
    }

    if (Array.isArray(m.content)) {
      // Convert Anthropic content blocks to OpenAI format
      const oaiContent = m.content.map(block => {
        if (block.type === 'image' && block.source?.type === 'base64') {
          return {
            type: 'image_url',
            image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` }
          }
        }
        if (block.type === 'text') return { type: 'text', text: block.text }
        return { type: 'text', text: JSON.stringify(block) }
      })
      return { role: m.role, content: oaiContent }
    }
    return { role: m.role, content: m.content || '' }
  })
}

function toOpenAITools(tools) {
  if (!tools || tools.length === 0) return undefined
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }))
}

function parseOpenAIResponse(response) {
  const choice = response.choices[0]
  const message = choice.message

  const text = message.content || null
  const tool_calls = (message.tool_calls || []).map(tc => ({
    id: tc.id,
    name: tc.function.name,
    input: JSON.parse(tc.function.arguments),
  }))

  let stop_reason = 'end_turn'
  if (choice.finish_reason === 'tool_calls') stop_reason = 'tool_use'
  else if (choice.finish_reason === 'length') stop_reason = 'max_tokens'

  return { text, tool_calls, stop_reason }
}

async function callOpenAI({ system, messages, tools, max_tokens }) {
  const OpenAI = require('openai')
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw Object.assign(new Error('OPENAI_API_KEY not set'), { status: 402 })

  const openai = new OpenAI.default({ apiKey })

  // OpenAI uses system as a message in the array
  const openaiMessages = toOpenAIMessages(messages)
  // If system provided and not already in messages, prepend it
  const hasSystem = openaiMessages.some(m => m.role === 'system')
  if (system && !hasSystem) {
    openaiMessages.unshift({ role: 'system', content: system })
  }

  const params = {
    model: process.env.AI_OPENAI_MODEL || 'gpt-4o',
    max_tokens: max_tokens || 4096,
    messages: openaiMessages,
  }
  const openaiTools = toOpenAITools(tools)
  if (openaiTools) params.tools = openaiTools

  const response = await openai.chat.completions.create(params)
  return parseOpenAIResponse(response)
}

// ── Claude CLI (OAuth) provider ───────────────────────────────────────────────

/**
 * Call Claude via the `claude --print` CLI, which uses your OAuth session
 * (Claude.ai Pro/Max) rather than API credits.
 *
 * Limitations:
 *  - Tool/function calling is not supported (tools are ignored)
 *  - Multi-turn conversation is flattened into a single prompt
 *  - Model flag uses short aliases: sonnet, opus, haiku
 */
async function callClaudeCLI({ system, messages, max_tokens }) {
  const { spawn } = require('child_process')

  const claudePath = process.env.CLAUDE_CLI_PATH || 'claude'
  const model = process.env.AI_CLAUDE_CLI_MODEL || process.env.AI_ANTHROPIC_MODEL?.replace('claude-', '').split('-')[0] || 'sonnet'

  // Flatten conversation to a single text prompt
  const lines = []
  for (const m of messages) {
    if (m.role === 'system') continue // handled via --system-prompt
    const role = m.role === 'assistant' ? 'Assistant' : 'User'
    const content = Array.isArray(m.content)
      ? m.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
      : (m.content || '')
    if (content) lines.push(`${role}: ${content}`)
  }
  const prompt = lines.join('\n\n')
  if (!prompt.trim()) throw new Error('[claude-cli] empty prompt')

  const args = [
    '--print',
    '--output-format', 'json',
    '--model', model,
    '--no-session-persistence',
    '--max-turns', '1',
  ]
  if (system) args.push('--system-prompt', system)

  return new Promise((resolve, reject) => {
    // Strip API keys so the CLI falls back to OAuth session
    const { ANTHROPIC_API_KEY: _1, OPENAI_API_KEY: _2, ...cliEnv } = process.env
    const child = spawn(claudePath, args, { env: cliEnv })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })

    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`[claude-cli] exited ${code}: ${stderr.slice(0, 300)}`))
      }
      try {
        const json = JSON.parse(stdout.trim())
        if (json.is_error || json.subtype !== 'success') {
          return reject(new Error(`[claude-cli] error: ${json.result || JSON.stringify(json).slice(0, 200)}`))
        }
        resolve({ text: json.result || null, tool_calls: [], stop_reason: json.stop_reason || 'end_turn' })
      } catch (e) {
        reject(new Error(`[claude-cli] JSON parse failed: ${e.message} — stdout: ${stdout.slice(0, 200)}`))
      }
    })

    // Write prompt to stdin then close
    child.stdin.write(prompt)
    child.stdin.end()

    // Safety timeout (300s — large prompts like project discovery can take 2-3 min)
    setTimeout(() => { child.kill(); reject(new Error('[claude-cli] timeout after 300s')) }, 300000)
  })
}

// ── Provider registry ─────────────────────────────────────────────────────────

const PROVIDERS = {
  anthropic: callAnthropic,
  openai: callOpenAI,
  'claude-cli': callClaudeCLI,
}

function getProviderOrder() {
  const primary = (process.env.AI_PROVIDER || 'anthropic').toLowerCase()
  const all = ['anthropic', 'openai', 'claude-cli']
  const rest = all.filter(p => p !== primary)
  return [primary, ...rest]
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create an AI response with automatic provider fallback.
 *
 * @param {object} opts
 * @param {string}   [opts.system]      System prompt (optional)
 * @param {Array}    opts.messages      Normalized message array
 * @param {Array}    [opts.tools]       Normalized tool definitions (Anthropic-style)
 * @param {number}   [opts.max_tokens]  Max tokens (default 4096)
 * @returns {Promise<{text, tool_calls, stop_reason, provider}>}
 */
async function create({ system, messages, tools, max_tokens }) {
  const order = getProviderOrder()
  let lastError = null

  for (const provider of order) {
    const fn = PROVIDERS[provider]
    if (!fn) continue

    console.log(`[ai-client] Using provider: ${provider}`)
    try {
      const result = await fn({ system, messages, tools, max_tokens })
      return { ...result, provider }
    } catch (err) {
      if (isQuotaError(err)) {
        const next = order[order.indexOf(provider) + 1]
        if (next) {
          console.warn(`[ai-client] ${provider} quota error, falling back to ${next}`)
        } else {
          console.warn(`[ai-client] ${provider} quota error, no more providers to try`)
        }
        lastError = err
        continue
      }
      // Non-quota error — re-throw immediately
      throw err
    }
  }

  throw lastError
}

module.exports = { create }
