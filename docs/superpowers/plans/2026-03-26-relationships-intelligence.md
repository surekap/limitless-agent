# Relationships Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the relationships module with correct perspective analysis, external research enrichment (Tavily/OpenAI/PDL/SerpAPI), and a cross-source opportunity engine that connects dots across all communications.

**Architecture:** A new `packages/agents/research/` agent enriches contacts via 4 external providers and synthesises a dossier with Claude. The existing relationships agent gains a cross-source opportunity engine (3 new swarm agents) that detects check-in opportunities, introduction opportunities, and project matches. The UI gains a tab bar on the contact detail pane (Communications / Research / Opportunities) and correct perspective display.

**Tech Stack:** Node.js (CommonJS), PostgreSQL, Anthropic SDK, `@tavily/core`, `openai`, `peopledatalabs`, `serpapi`, Next.js 14 (React)

**Spec:** `docs/superpowers/specs/2026-03-26-relationships-intelligence-design.md`

---

## File Map

**New files:**
- `packages/agents/research/index.js` — scheduler + orchestrator
- `packages/agents/research/package.json`
- `packages/agents/research/sql/schema.sql`
- `packages/agents/research/providers/tavily.js`
- `packages/agents/research/providers/openai.js`
- `packages/agents/research/providers/peopledatalabs.js`
- `packages/agents/research/providers/serpapi.js`

**Modified files:**
- `packages/agents/relationships/sql/schema.sql` — add my_role, contact_research table, insight_type extension, contact_ids
- `packages/agents/relationships/services/analyzer.js` — perspective fix + my_role field
- `packages/agents/relationships/index.js` — write my_role in upsertContact
- `packages/agents/relationships/services/extractor.js` — add buildCrossSourceDigest
- `packages/agents/relationships/services/opportunities.js` — agents 5, 6, 7
- `packages/ui/server.js` — research API endpoints, fix reanalyze prompt, register research agent
- `packages/ui/app/relationships/page.jsx` — tabs, my_role display, research + opportunities tabs
- `package.json` (root) — add research script + init-db entry

---

## Task 1: Schema Migrations

**Files:**
- Modify: `packages/agents/relationships/sql/schema.sql`

- [ ] **Step 1: Append new DDL to schema.sql**

Add the following at the end of `packages/agents/relationships/sql/schema.sql`:

```sql
-- ── my_role + research_summary on contacts ──────────────────────────────────
ALTER TABLE relationships.contacts ADD COLUMN IF NOT EXISTS my_role TEXT;
-- e.g. "patient", "client", "mentee", "employer"
-- Describes the account owner's role in relation to this contact

ALTER TABLE relationships.contacts ADD COLUMN IF NOT EXISTS research_summary TEXT;
-- Synthesised dossier paragraph from external research

-- ── Contact research ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS relationships.contact_research (
  id              BIGSERIAL PRIMARY KEY,
  contact_id      BIGINT REFERENCES relationships.contacts(id) ON DELETE CASCADE,
  source          TEXT NOT NULL CHECK (source IN ('tavily','openai','peopledatalabs','serpapi')),
  query           TEXT,
  result_json     JSONB,
  summary         TEXT,
  researched_name TEXT,
  researched_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (contact_id, source)
);

CREATE INDEX IF NOT EXISTS contact_research_contact_idx ON relationships.contact_research (contact_id);
CREATE INDEX IF NOT EXISTS contact_research_name_idx    ON relationships.contact_research (researched_name);
CREATE INDEX IF NOT EXISTS contact_research_at_idx      ON relationships.contact_research (researched_at DESC);

-- ── Extended insight_type ────────────────────────────────────────────────────
ALTER TABLE relationships.insights DROP CONSTRAINT IF EXISTS insights_insight_type_check;
ALTER TABLE relationships.insights ADD CONSTRAINT insights_insight_type_check
  CHECK (insight_type IN (
    'opportunity', 'cold_email', 'unread_group', 'awaiting_reply',
    'action_needed', 'topic',
    'cross_source_opportunity',
    'project_match'
  ));

-- ── contact_ids on insights (for multi-person opportunities) ─────────────────
ALTER TABLE relationships.insights ADD COLUMN IF NOT EXISTS contact_ids BIGINT[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS insights_contact_ids_idx ON relationships.insights USING GIN (contact_ids);
```

- [ ] **Step 2: Run migration**

```bash
psql $DATABASE_URL -f packages/agents/relationships/sql/schema.sql
```

Expected output: series of `ALTER TABLE`, `CREATE TABLE`, `CREATE INDEX` lines, no errors.

- [ ] **Step 3: Verify**

```bash
psql $DATABASE_URL -c "\d relationships.contacts" | grep -E "my_role|research_summary"
psql $DATABASE_URL -c "\d relationships.contact_research"
psql $DATABASE_URL -c "\d relationships.insights" | grep contact_ids
```

Expected: all three show the new columns.

- [ ] **Step 4: Commit**

```bash
git add packages/agents/relationships/sql/schema.sql
git commit -m "feat(schema): add my_role, research_summary, contact_research, extended insight types"
```

---

## Task 2: Perspective Fix in Analyzer

**Files:**
- Modify: `packages/agents/relationships/services/analyzer.js:96-123`

- [ ] **Step 1: Update `analyzeDirectChatContact` prompt in `analyzer.js`**

Replace the `const prompt = ...` block (lines 96–123) with:

```js
    const prompt = `You are analyzing a WhatsApp contact from the perspective of the account owner.
Describe who THIS CONTACT IS to the account owner — their role, not the reverse.

Examples of correct perspective:
- Account owner's dentist → relationship_type: "service_provider", my_role: "patient"
- Account owner's investor → relationship_type: "professional_contact", my_role: "founder"
- Account owner's employee → relationship_type: "colleague", my_role: "manager"
- Account owner's friend → relationship_type: "friend", my_role: "friend"

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
${sample || '(no text messages)'}${docContext}${imageNote}

Return ONLY valid JSON:
{
  "display_name": "best name for this person",
  "company": null or "company name",
  "job_title": null or "their job title",
  "relationship_type": "family|friend|colleague|client|vendor|service_provider|professional_contact|unknown",
  "my_role": null or "account owner's role relative to this contact (e.g. patient, client, mentee)",
  "relationship_strength": "strong|moderate|weak|noise",
  "summary": "2-3 sentences: who this person is TO the account owner and what the relationship is",
  "tags": ["tag1", "tag2"],
  "is_noise": false
}

Set is_noise=true for: bots, spam, automated alerts, OTP services, delivery notifications, bank alerts, unknown contacts with only automated messages.
relationship_strength=noise means this contact is not meaningful (same as is_noise).`
```

- [ ] **Step 2: Add `my_role` to the returned object**

In the `return { ... }` block at the end of `analyzeDirectChatContact` (after the `parseJSON` call), add `my_role`:

```js
    return {
      display_name: result.display_name || defaults.display_name,
      company: result.company || null,
      job_title: result.job_title || null,
      relationship_type: result.relationship_type || 'unknown',
      my_role: result.my_role || null,
      relationship_strength: result.relationship_strength || 'weak',
      summary: result.summary || '',
      tags: Array.isArray(result.tags) ? result.tags : [],
      is_noise: Boolean(result.is_noise),
    }
```

Also add `my_role: null` to the `defaults` object at the top of the function:

```js
  const defaults = {
    display_name: contactData.display_name || chatId.replace('@c.us', ''),
    company: null,
    job_title: null,
    my_role: null,
    relationship_type: 'unknown',
    relationship_strength: 'weak',
    summary: 'No analysis available.',
    tags: [],
    is_noise: false,
  }
```

- [ ] **Step 3: Commit**

```bash
git add packages/agents/relationships/services/analyzer.js
git commit -m "feat(relationships): add perspective anchor and my_role to contact analysis"
```

---

## Task 3: Write my_role in upsertContact + Fix reanalyze Prompt

**Files:**
- Modify: `packages/agents/relationships/index.js:62-92` (upsertContact UPDATE)
- Modify: `packages/agents/relationships/index.js:97-119` (upsertContact INSERT)
- Modify: `packages/ui/server.js:866-882` (reanalyze prompt)

- [ ] **Step 1: Add my_role to upsertContact UPDATE in `index.js`**

In the `UPDATE relationships.contacts SET` block, add `my_role` after `job_title`:

```js
          job_title             = CASE WHEN manual_overrides ? 'job_title'             THEN job_title             ELSE COALESCE($6, job_title) END,
          my_role               = CASE WHEN manual_overrides ? 'my_role'               THEN my_role               ELSE COALESCE($7, my_role) END,
          summary               = CASE WHEN manual_overrides ? 'summary'               THEN summary               ELSE $8  END,
```

Update the parameter list accordingly — shift all params after `$6` up by one, and add `profile.my_role` at position 7. The final call becomes:

```js
      `, [
        profile.display_name,        // $1
        normalizeName(profile.display_name), // $2
        phone,                       // $3
        waJid,                       // $4
        profile.company,             // $5
        profile.job_title,           // $6
        profile.my_role,             // $7  ← new
        profile.summary,             // $8
        profile.relationship_type,   // $9
        profile.relationship_strength, // $10
        profile.tags,                // $11
        profile.is_noise,            // $12
        profile.last_msg_at || null, // $13
        profile.first_msg_at || null,// $14
        id,                          // $15
      ])
```

- [ ] **Step 2: Add my_role to upsertContact INSERT in `index.js`**

In the `INSERT INTO relationships.contacts` block, add `my_role` to the column list and values:

```js
    const { rows: inserted } = await db.query(`
      INSERT INTO relationships.contacts (
        display_name, normalized_name, phone_numbers, wa_jids,
        company, job_title, my_role, summary,
        relationship_type, relationship_strength, tags, is_noise,
        last_interaction_at, first_interaction_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `, [
      profile.display_name,
      normalizeName(profile.display_name),
      [phone],
      [waJid],
      profile.company,
      profile.job_title,
      profile.my_role,
      profile.summary,
      profile.relationship_type,
      profile.relationship_strength,
      profile.tags,
      profile.is_noise,
      profile.last_msg_at || null,
      profile.first_msg_at || null,
    ])
```

- [ ] **Step 3: Fix reanalyze prompt in `server.js`**

In the `POST /api/relationships/contacts/:id/reanalyze` handler, replace the `const prompt = ...` block with:

```js
    const prompt = `You are analyzing a contact from the perspective of the account owner.
Describe who THIS CONTACT IS to the account owner — their role, not the reverse.

Examples of correct perspective:
- Account owner's dentist → relationship_type: "service_provider", my_role: "patient"
- Account owner's investor → relationship_type: "professional_contact", my_role: "founder"
- Account owner's employee → relationship_type: "colleague", my_role: "manager"

Contact: ${displayName}${phone ? ` (+${phone})` : ''}
Existing company: ${contact.company || 'unknown'}
Existing role: ${contact.job_title || 'unknown'}
${overrideContext}
${msgSample ? `Recent WhatsApp messages (newest first):\n${msgSample}` : ''}
${emailSample ? `\nRecent emails:\n${emailSample}` : ''}

Return ONLY valid JSON:
{
  "company": null or "company name",
  "job_title": null or "their role",
  "my_role": null or "account owner's role relative to this contact (e.g. patient, client, mentee)",
  "relationship_type": "family|friend|colleague|client|vendor|service_provider|professional_contact|unknown",
  "relationship_strength": "strong|moderate|weak|noise",
  "summary": "2-3 sentence description of who this person is TO the account owner",
  "tags": ["tag1", "tag2"],
  "is_noise": false
}`
```

Also update the `res.json(result)` response in the reanalyze handler to pass through `my_role`, and add a DB update for `my_role`:

```js
    // After parsing result, also persist my_role
    if (result.my_role !== undefined) {
      await db.query(
        `UPDATE relationships.contacts SET my_role = $1, updated_at = NOW() WHERE id = $2`,
        [result.my_role || null, id]
      )
    }
```

Add this block just before the existing `res.json(result)` line.

- [ ] **Step 4: Commit**

```bash
git add packages/agents/relationships/index.js packages/ui/server.js
git commit -m "feat(relationships): persist my_role in DB, fix reanalyze perspective"
```

---

## Task 4: Research Package Setup

**Files:**
- Create: `packages/agents/research/package.json`
- Create: `packages/agents/research/sql/schema.sql`

- [ ] **Step 1: Create `packages/agents/research/package.json`**

```json
{
  "name": "@secondbrain/research",
  "version": "1.0.0",
  "main": "index.js",
  "private": true,
  "description": "Contact research agent — enriches contacts via Tavily, OpenAI, PDL, SerpAPI",
  "scripts": {
    "start": "node index.js",
    "init-db": "psql $DATABASE_URL < sql/schema.sql"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.1",
    "@secondbrain/db": "*",
    "@tavily/core": "^0.0.6",
    "dotenv": "^16.5.0",
    "node-cron": "^4.1.0",
    "openai": "^4.0.0",
    "peopledatalabs": "^3.1.0",
    "serpapi": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `packages/agents/research/sql/schema.sql`**

```sql
-- Research agent schema — no-op if already applied via relationships schema
-- This file exists for standalone init: npm run init-db --workspace=packages/agents/research

ALTER TABLE relationships.contacts ADD COLUMN IF NOT EXISTS my_role TEXT;
ALTER TABLE relationships.contacts ADD COLUMN IF NOT EXISTS research_summary TEXT;

CREATE TABLE IF NOT EXISTS relationships.contact_research (
  id              BIGSERIAL PRIMARY KEY,
  contact_id      BIGINT REFERENCES relationships.contacts(id) ON DELETE CASCADE,
  source          TEXT NOT NULL CHECK (source IN ('tavily','openai','peopledatalabs','serpapi')),
  query           TEXT,
  result_json     JSONB,
  summary         TEXT,
  researched_name TEXT,
  researched_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (contact_id, source)
);

CREATE INDEX IF NOT EXISTS contact_research_contact_idx ON relationships.contact_research (contact_id);
CREATE INDEX IF NOT EXISTS contact_research_name_idx    ON relationships.contact_research (researched_name);
CREATE INDEX IF NOT EXISTS contact_research_at_idx      ON relationships.contact_research (researched_at DESC);
```

- [ ] **Step 3: Install dependencies**

```bash
npm install
```

Expected: npm resolves the new workspace and installs `@tavily/core`, `openai`, `peopledatalabs`, `serpapi` into `node_modules`.

- [ ] **Step 4: Create providers directory**

```bash
mkdir -p packages/agents/research/providers
```

- [ ] **Step 5: Commit**

```bash
git add packages/agents/research/
git commit -m "feat(research): scaffold research agent package"
```

---

## Task 5: Tavily Provider

**Files:**
- Create: `packages/agents/research/providers/tavily.js`

- [ ] **Step 1: Create `packages/agents/research/providers/tavily.js`**

```js
'use strict'

const { tavily } = require('@tavily/core')

let client = null
function getClient() {
  if (!client) client = tavily({ apiKey: process.env.TAVILY_API_KEY })
  return client
}

/**
 * Research a contact via Tavily web search.
 * Runs two queries: general background + recent news.
 *
 * @param {object} contact - { display_name, job_title, company }
 * @returns {{ query: string, result_json: object, summary: string }}
 */
async function researchContact(contact) {
  const name    = contact.display_name
  const company = contact.company || ''
  const title   = contact.job_title || ''

  const generalQuery = company
    ? `${name} ${title} ${company}`.trim()
    : `${name} ${title}`.trim()
  const newsQuery = `${name} news 2025`

  const c = getClient()

  const [generalResult, newsResult] = await Promise.allSettled([
    c.search(generalQuery, { maxResults: 5, searchDepth: 'basic' }),
    c.search(newsQuery, { maxResults: 5, searchDepth: 'basic' }),
  ])

  const general = generalResult.status === 'fulfilled' ? generalResult.value.results || [] : []
  const news    = newsResult.status   === 'fulfilled' ? newsResult.value.results    || [] : []

  const result_json = {
    general_query: generalQuery,
    news_query:    newsQuery,
    general:       general.map(r => ({ title: r.title, url: r.url, content: (r.content || '').slice(0, 400) })),
    news:          news.map(r    => ({ title: r.title, url: r.url, content: (r.content || '').slice(0, 400) })),
  }

  // Build readable summary for Claude synthesis
  const snippets = [
    ...general.slice(0, 3).map(r => `[Web] ${r.title}: ${(r.content || '').slice(0, 200)}`),
    ...news.slice(0, 2).map(r    => `[News] ${r.title}: ${(r.content || '').slice(0, 200)}`),
  ]
  const summary = snippets.length > 0
    ? snippets.join('\n')
    : `No web results found for ${name}.`

  return { query: generalQuery, result_json, summary }
}

module.exports = { researchContact }
```

- [ ] **Step 2: Commit**

```bash
git add packages/agents/research/providers/tavily.js
git commit -m "feat(research): add Tavily web search provider"
```

---

## Task 6: OpenAI Provider

**Files:**
- Create: `packages/agents/research/providers/openai.js`

- [ ] **Step 1: Create `packages/agents/research/providers/openai.js`**

```js
'use strict'

const OpenAI = require('openai')

let client = null
function getClient() {
  if (!client) client = new OpenAI.default({ apiKey: process.env.OPENAI_API_KEY })
  return client
}

/**
 * Research a contact using GPT-4o's public knowledge.
 *
 * @param {object} contact - { display_name, job_title, company }
 * @returns {{ query: string, result_json: object, summary: string }}
 */
async function researchContact(contact) {
  const name    = contact.display_name
  const context = [contact.job_title, contact.company].filter(Boolean).join(' at ')
  const query   = context ? `${name} (${context})` : name

  const prompt = `What is publicly known about ${query}?
Please include (only if known with confidence):
- Professional background and career history
- Current role and company details
- Notable work, achievements, or public reputation
- Recent news or developments (2024-2025)
- Social/professional presence (LinkedIn, publications, talks)
Be factual. If you are uncertain about something, say so. Do not invent information. Keep response under 300 words.`

  const c = getClient()
  const response = await c.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 500,
  })

  const text = response.choices?.[0]?.message?.content || ''

  return {
    query,
    result_json: { model: 'gpt-4o', response: text },
    summary: text || `No information found for ${name}.`,
  }
}

module.exports = { researchContact }
```

- [ ] **Step 2: Commit**

```bash
git add packages/agents/research/providers/openai.js
git commit -m "feat(research): add OpenAI GPT-4o public profile provider"
```

---

## Task 7: PeopleDataLabs Provider

**Files:**
- Create: `packages/agents/research/providers/peopledatalabs.js`

- [ ] **Step 1: Create `packages/agents/research/providers/peopledatalabs.js`**

```js
'use strict'

const PDLJS = require('peopledatalabs')

let client = null
function getClient() {
  if (!client) client = new PDLJS.default({ apiKey: process.env.PEOPLEDATALABS_API_KEY })
  return client
}

/**
 * Enrich a contact via PeopleDataLabs Person API.
 * Tries by email first, then name+company.
 *
 * @param {object} contact - { display_name, job_title, company, emails }
 * @returns {{ query: string, result_json: object, summary: string }}
 */
async function researchContact(contact) {
  const name    = contact.display_name
  const company = contact.company || ''
  const emails  = Array.isArray(contact.emails) ? contact.emails : []

  const c = getClient()
  let raw = null
  let query = ''

  // Try by email first (higher match confidence)
  if (emails.length > 0) {
    query = emails[0]
    try {
      const result = await c.person.enrichment({ email: emails[0], pretty: false })
      if (result?.status === 200) raw = result.data
    } catch { /* fall through to name search */ }
  }

  // Fall back to name + company
  if (!raw && name) {
    query = `${name}${company ? ' | ' + company : ''}`
    try {
      const params = { name, pretty: false }
      if (company) params.company = company
      const result = await c.person.enrichment(params)
      if (result?.status === 200) raw = result.data
    } catch { /* no result */ }
  }

  if (!raw) {
    return {
      query,
      result_json: { status: 'not_found' },
      summary: `No PeopleDataLabs profile found for ${name}.`,
    }
  }

  // Extract the most useful fields
  const result_json = {
    full_name:    raw.full_name,
    job_title:    raw.job_title,
    job_company:  raw.job_company_name,
    location:     raw.location_name,
    linkedin:     raw.linkedin_url,
    industry:     raw.industry,
    skills:       (raw.skills || []).slice(0, 10),
    experience:   (raw.experience || []).slice(0, 3).map(e => ({
      title:   e.title?.name,
      company: e.company?.name,
      start:   e.start_date,
      end:     e.end_date,
    })),
    education:    (raw.education || []).slice(0, 2).map(e => ({
      school: e.school?.name,
      degree: e.degrees?.[0],
    })),
  }

  const summary = [
    raw.full_name && `Name: ${raw.full_name}`,
    raw.job_title && raw.job_company_name && `Role: ${raw.job_title} at ${raw.job_company_name}`,
    raw.location_name && `Location: ${raw.location_name}`,
    raw.linkedin_url && `LinkedIn: ${raw.linkedin_url}`,
    raw.industry && `Industry: ${raw.industry}`,
    result_json.experience.length > 0 && `Experience: ${result_json.experience.map(e => `${e.title} @ ${e.company}`).join(', ')}`,
  ].filter(Boolean).join('\n')

  return { query, result_json, summary: summary || `Profile found for ${name}.` }
}

module.exports = { researchContact }
```

- [ ] **Step 2: Commit**

```bash
git add packages/agents/research/providers/peopledatalabs.js
git commit -m "feat(research): add PeopleDataLabs person enrichment provider"
```

---

## Task 8: SerpAPI Provider

**Files:**
- Create: `packages/agents/research/providers/serpapi.js`

- [ ] **Step 1: Create `packages/agents/research/providers/serpapi.js`**

```js
'use strict'

const serpapi = require('serpapi')

/**
 * Research a contact via SerpAPI Google search.
 * Extracts Knowledge Graph + top organic snippets.
 *
 * @param {object} contact - { display_name, job_title, company }
 * @returns {{ query: string, result_json: object, summary: string }}
 */
async function researchContact(contact) {
  const name    = contact.display_name
  const company = contact.company || ''

  const q = company
    ? `"${name}" "${company}"`
    : `"${name}"`

  const raw = await serpapi.getJson({
    api_key: process.env.SERPAPI_API_KEY,
    engine:  'google',
    q,
    num: 10,
  })

  const kg      = raw.knowledge_graph || null
  const organic = (raw.organic_results || []).slice(0, 5).map(r => ({
    title:   r.title,
    link:    r.link,
    snippet: (r.snippet || '').slice(0, 300),
  }))

  const result_json = { query: q, knowledge_graph: kg, organic }

  const lines = []
  if (kg) {
    if (kg.title)       lines.push(`${kg.title}`)
    if (kg.type)        lines.push(`Type: ${kg.type}`)
    if (kg.description) lines.push(kg.description.slice(0, 300))
  }
  for (const r of organic.slice(0, 3)) {
    lines.push(`[${r.title}] ${r.snippet}`)
  }

  const summary = lines.length > 0
    ? lines.join('\n')
    : `No Google results found for ${name}.`

  return { query: q, result_json, summary }
}

module.exports = { researchContact }
```

- [ ] **Step 2: Commit**

```bash
git add packages/agents/research/providers/serpapi.js
git commit -m "feat(research): add SerpAPI Google search provider"
```

---

## Task 9: Research Orchestrator

**Files:**
- Create: `packages/agents/research/index.js`

- [ ] **Step 1: Create `packages/agents/research/index.js`**

```js
#!/usr/bin/env node
'use strict'

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env.local') })

const cron      = require('node-cron')
const Anthropic = require('@anthropic-ai/sdk')
const db        = require('@secondbrain/db')

const tavily        = require('./providers/tavily')
const openaiProv    = require('./providers/openai')
const pdl           = require('./providers/peopledatalabs')
const serpapiProv   = require('./providers/serpapi')

const MODEL = 'claude-sonnet-4-6'

let anthropic = null
function getAnthropic() {
  if (!anthropic) anthropic = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY })
  return anthropic
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

console.log('🔬 Research Agent v1.0')
console.log('📡 Enriches contacts via Tavily, OpenAI, PDL, SerpAPI\n')

// ── Find stale contacts ────────────────────────────────────────────────────────

async function findStaleContacts(limit = 20) {
  const { rows } = await db.query(`
    SELECT c.id, c.display_name, c.job_title, c.company, c.emails, c.relationship_strength
    FROM relationships.contacts c
    WHERE c.is_noise = false
      AND c.relationship_strength IN ('strong', 'moderate')
      AND (
        -- No research at all
        NOT EXISTS (
          SELECT 1 FROM relationships.contact_research r WHERE r.contact_id = c.id
        )
        OR
        -- Research is stale (>7 days)
        EXISTS (
          SELECT 1 FROM relationships.contact_research r
          WHERE r.contact_id = c.id
          HAVING MAX(r.researched_at) < NOW() - INTERVAL '7 days'
        )
        OR
        -- Name changed since research
        EXISTS (
          SELECT 1 FROM relationships.contact_research r
          WHERE r.contact_id = c.id
            AND r.researched_name IS DISTINCT FROM c.display_name
        )
      )
    ORDER BY c.last_interaction_at DESC NULLS LAST
    LIMIT $1
  `, [limit])
  return rows
}

// ── Synthesise dossier with Claude ────────────────────────────────────────────

async function synthesiseDossier(contact, providerResults) {
  const parts = providerResults
    .filter(r => r.status === 'fulfilled' && r.value?.summary)
    .map(r => r.value.summary)

  if (parts.length === 0) return null

  const combined = parts.join('\n\n---\n\n').slice(0, 6000)

  const prompt = `Based on the following research from multiple sources, write a concise professional dossier paragraph (4-6 sentences) about ${contact.display_name}.

Focus on: who they are professionally, their current role, reputation, recent news, and anything particularly notable.
Be factual. Flag uncertainty with "reportedly" or "according to". Do not invent information.

Research sources:
${combined}

Write ONLY the dossier paragraph, no preamble.`

  try {
    const response = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })
    return response.content?.[0]?.text?.trim() || null
  } catch (err) {
    console.error('[research] synthesis error:', err.message)
    return null
  }
}

// ── Run research for one contact ───────────────────────────────────────────────

async function researchContact(contact) {
  console.log(`  🔍 Researching ${contact.display_name}…`)

  const providers = [
    { name: 'tavily',         fn: () => tavily.researchContact(contact) },
    { name: 'openai',         fn: () => openaiProv.researchContact(contact) },
    { name: 'peopledatalabs', fn: () => pdl.researchContact(contact) },
    { name: 'serpapi',        fn: () => serpapiProv.researchContact(contact) },
  ]

  // Skip providers with no API key configured
  const activeProviders = providers.filter(p => {
    const keyMap = {
      tavily:         'TAVILY_API_KEY',
      openai:         'OPENAI_API_KEY',
      peopledatalabs: 'PEOPLEDATALABS_API_KEY',
      serpapi:        'SERPAPI_API_KEY',
    }
    return !!process.env[keyMap[p.name]]
  })

  const results = await Promise.allSettled(activeProviders.map(p => p.fn()))

  // Persist each provider result
  for (let i = 0; i < activeProviders.length; i++) {
    const providerName = activeProviders[i].name
    const result       = results[i]
    if (result.status === 'rejected') {
      console.error(`    ✗ ${providerName}: ${result.reason?.message || 'failed'}`)
      continue
    }
    const { query, result_json, summary } = result.value
    await db.query(`
      INSERT INTO relationships.contact_research
        (contact_id, source, query, result_json, summary, researched_name, researched_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (contact_id, source) DO UPDATE SET
        query           = EXCLUDED.query,
        result_json     = EXCLUDED.result_json,
        summary         = EXCLUDED.summary,
        researched_name = EXCLUDED.researched_name,
        researched_at   = NOW()
    `, [contact.id, providerName, query, result_json, summary, contact.display_name])
  }

  // Synthesise unified dossier
  const dossier = await synthesiseDossier(contact, results)
  if (dossier) {
    await db.query(
      `UPDATE relationships.contacts SET research_summary = $1, updated_at = NOW() WHERE id = $2`,
      [dossier, contact.id]
    )
  }

  const succeeded = results.filter(r => r.status === 'fulfilled').length
  console.log(`    ✓ ${succeeded}/${activeProviders.length} providers succeeded`)
}

// ── Main run ──────────────────────────────────────────────────────────────────

async function runResearch() {
  console.log('\n🏁 Starting research run…')
  try {
    const contacts = await findStaleContacts(20)
    console.log(`   Found ${contacts.length} contacts to research`)

    for (const contact of contacts) {
      try {
        await researchContact(contact)
        await sleep(1000) // be gentle with APIs
      } catch (err) {
        console.error(`  ✗ Error researching ${contact.display_name}:`, err.message)
      }
    }

    console.log('\n✅ Research run complete\n')
  } catch (err) {
    console.error('❌ Research run failed:', err.message)
  }
}

// ── On-demand trigger via env flag ────────────────────────────────────────────
// Set RESEARCH_CONTACT_ID=<id> to research a single contact and exit.

async function main() {
  const singleId = process.env.RESEARCH_CONTACT_ID
  if (singleId) {
    const { rows } = await db.query(
      `SELECT id, display_name, job_title, company, emails FROM relationships.contacts WHERE id = $1`,
      [parseInt(singleId, 10)]
    )
    if (rows.length === 0) { console.error('Contact not found'); process.exit(1) }
    await researchContact(rows[0])
    await db.end()
    process.exit(0)
  }

  await runResearch()

  console.log('⏰ Scheduling research every 24 hours')
  cron.schedule('0 3 * * *', () => {
    console.log('⏰ Scheduled research triggered')
    runResearch().catch(err => console.error('❌ Scheduled run error:', err.message))
  })
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message)
  process.exit(1)
})

process.on('SIGINT', async () => {
  console.log('\n🛑 Research Agent stopped')
  try { await db.end() } catch { /* ignore */ }
  process.exit(0)
})
```

- [ ] **Step 2: Smoke test (requires at least one API key set in .env.local)**

```bash
# Research contact with id=1 as a quick test
RESEARCH_CONTACT_ID=1 node packages/agents/research/index.js
```

Expected: runs providers, prints `✓ N/M providers succeeded`, exits.

- [ ] **Step 3: Commit**

```bash
git add packages/agents/research/index.js
git commit -m "feat(research): add research orchestrator with staleness detection + Claude synthesis"
```

---

## Task 10: Register Research Agent in server.js + package.json

**Files:**
- Modify: `packages/ui/server.js:36-73` (AGENTS object)
- Modify: `package.json` (root scripts)

- [ ] **Step 1: Add research agent to AGENTS in `server.js`**

In the `AGENTS` object (after the `relationships` entry), add:

```js
  research: {
    id:          'research',
    name:        'Research Agent',
    description: 'Enriches contact profiles via Tavily, OpenAI, PeopleDataLabs, SerpAPI',
    entrypoint:  path.resolve(__dirname, '../agents/research/index.js'),
  },
```

- [ ] **Step 2: Add research stats to agent stats handler in `server.js`**

**2a.** Add a `researchStats` helper function just before the `// ── Express` comment (around line 435):

```js
async function researchStats() {
  if (!db) return null
  try {
    const { rows } = await db.query(`
      SELECT
        COUNT(DISTINCT contact_id) AS enriched_contacts,
        MAX(researched_at) AS last_research_at,
        COUNT(*) FILTER (WHERE researched_at > NOW() - INTERVAL '24 hours') AS researched_today
      FROM relationships.contact_research
    `)
    return rows[0]
  } catch { return null }
}
```

**2b.** Find the `GET /api/agents` handler (around line 461). Its first line is:
```js
const [eStats, lStats, rStats, pStats, oaiStats, gemStats] = await Promise.all([
  emailStats(), limitlessStats(), relationshipsStats(), projectsStats(),
  aiStats('openai'), aiStats('gemini'),
```

Change it to:
```js
const [eStats, lStats, rStats, pStats, oaiStats, gemStats, rsStats] = await Promise.all([
  emailStats(), limitlessStats(), relationshipsStats(), projectsStats(),
  aiStats('openai'), aiStats('gemini'), researchStats(),
```

**2c.** In the `stats:` ternary (around line 480), add a research case before the final `null`:
```js
      stats:       id === 'email'         ? eStats
                 : id === 'limitless'     ? lStats
                 : id === 'relationships' ? rStats
                 : id === 'projects'      ? pStats
                 : id === 'openai'        ? oaiStats
                 : id === 'gemini'        ? gemStats
                 : id === 'research'      ? rsStats
                 : null,
```

- [ ] **Step 3: Add research stats to `AgentStats` in `agents/page.jsx`**

In `packages/ui/app/agents/page.jsx`, find the `AgentStats` function. Add a research case:

```jsx
  if (id === 'research') {
    return (
      <div className="agent-stats">
        <div className="stat"><span className="stat-val">{formatNum(stats?.enriched_contacts)}</span><span className="stat-label">Enriched</span></div>
        <div className="stat"><span className="stat-val">{formatNum(stats?.researched_today)}</span><span className="stat-label">Today</span></div>
        <div className="stat"><span className="stat-val dim">{relativeTime(stats?.last_research_at)}</span><span className="stat-label">Last run</span></div>
      </div>
    )
  }
```

- [ ] **Step 4: Add scripts to root `package.json`**

```json
"research": "npm start --workspace=packages/agents/research",
```

Also extend `init-db`:
```json
"init-db": "npm run init-db --workspace=packages/agents/limitless && npm run init-db --workspace=packages/agents/email && npm run init-db --workspace=packages/agents/ai && npm run init-db --workspace=packages/agents/research"
```

- [ ] **Step 5: Add research API endpoints to `server.js`**

Add these two endpoints after the existing reanalyze endpoint:

```js
// POST /api/relationships/contacts/:id/research — trigger on-demand research
app.post('/api/relationships/contacts/:id/research', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB unavailable' })
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' })

  const { rows } = await db.query(
    `SELECT id FROM relationships.contacts WHERE id = $1`,
    [id]
  )
  if (!rows.length) return res.status(404).json({ error: 'Not found' })

  // Trigger research agent async — spawn as child process with RESEARCH_CONTACT_ID
  const researchEntry = procs['research']
  const { spawn } = require('child_process')
  const researchPath = path.resolve(__dirname, '../agents/research/index.js')

  const child = spawn(process.execPath, [researchPath], {
    env: { ...process.env, RESEARCH_CONTACT_ID: String(id) },
    detached: false,
    stdio: 'ignore',
  })
  child.unref()

  res.json({ status: 'queued', contact_id: id })
})

// GET /api/relationships/contacts/:id/research — fetch research results
app.get('/api/relationships/contacts/:id/research', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB unavailable' })
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' })

  try {
    const { rows: contact } = await db.query(
      `SELECT research_summary FROM relationships.contacts WHERE id = $1`,
      [id]
    )
    const { rows: research } = await db.query(`
      SELECT source, query, summary, result_json, researched_name, researched_at
      FROM relationships.contact_research
      WHERE contact_id = $1
      ORDER BY researched_at DESC
    `, [id])

    res.json({
      research_summary: contact[0]?.research_summary || null,
      providers: research,
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/relationships/contacts/:id/opportunities — per-contact opportunities
app.get('/api/relationships/contacts/:id/opportunities', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB unavailable' })
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' })

  try {
    const { rows } = await db.query(`
      SELECT i.id, i.insight_type, i.title, i.description,
             i.priority, i.contact_ids, i.is_actioned, i.is_dismissed, i.created_at
      FROM relationships.insights i
      WHERE NOT i.is_actioned AND NOT i.is_dismissed
        AND (
          i.contact_id = $1
          OR i.contact_ids @> ARRAY[$1]::bigint[]
        )
        AND i.insight_type IN ('opportunity', 'cross_source_opportunity', 'project_match')
      ORDER BY
        CASE i.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        i.created_at DESC
      LIMIT 50
    `, [id])
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/server.js packages/ui/app/agents/page.jsx package.json
git commit -m "feat(research): register research agent, add API endpoints"
```

---

## Task 11: Cross-Source Digest Function

**Files:**
- Modify: `packages/agents/relationships/services/extractor.js`

- [ ] **Step 1: Add `buildCrossSourceDigest` to `extractor.js`**

Add this function before the `module.exports` line:

```js
/**
 * Build a timestamped cross-source digest of recent communications.
 * Used by the cross-source opportunity swarm agents.
 *
 * @param {Date|null} since - only include messages after this date (default: 30 days ago)
 * @returns {string} formatted digest, truncated to ~8000 tokens (~32000 chars)
 */
async function buildCrossSourceDigest(since) {
  const cutoff = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const lines = []

  try {
    // WhatsApp DMs
    const { rows: waDMs } = await db.query(`
      SELECT
        m.ts,
        COALESCE(cm.name, m.data->'_data'->>'notifyName', m.chat_id) AS contact_name,
        (m.data->'id'->>'fromMe')::boolean AS from_me,
        m.data->>'body' AS body
      FROM public.messages m
      LEFT JOIN public.chat_metadata cm ON cm.chat_id = m.chat_id
      WHERE m.chat_id LIKE '%@c.us'
        AND m.chat_id != $1
        AND m.event IN ('message','message_create','message_historical')
        AND m.ts > $2
        AND m.data->>'body' IS NOT NULL
        AND length(m.data->>'body') > 5
        AND m.data->>'body' NOT LIKE '/9j/%'
      ORDER BY m.ts DESC
      LIMIT 200
    `, [MY_WA_JID, cutoff])

    for (const r of waDMs) {
      const who = r.from_me ? 'Me → ' + r.contact_name : r.contact_name + ' → Me'
      const date = r.ts ? new Date(r.ts).toLocaleDateString('en-GB') : ''
      lines.push({ ts: r.ts, text: `[WhatsApp DM/${r.contact_name}, ${date}] ${who}: ${(r.body || '').slice(0, 200)}` })
    }

    // WhatsApp groups
    const { rows: waGroups } = await db.query(`
      SELECT
        m.ts,
        COALESCE(cm.name, m.chat_id) AS group_name,
        m.data->'_data'->>'notifyName' AS sender_name,
        (m.data->'id'->>'fromMe')::boolean AS from_me,
        m.data->>'body' AS body
      FROM public.messages m
      LEFT JOIN public.chat_metadata cm ON cm.chat_id = m.chat_id
      WHERE m.chat_id LIKE '%@g.us'
        AND m.event IN ('message','message_create','message_historical')
        AND m.ts > $1
        AND m.data->>'body' IS NOT NULL
        AND length(m.data->>'body') > 5
        AND m.data->>'body' NOT LIKE '/9j/%'
      ORDER BY m.ts DESC
      LIMIT 300
    `, [cutoff])

    for (const r of waGroups) {
      const sender = r.from_me ? 'Me' : (r.sender_name || 'Unknown')
      const date = r.ts ? new Date(r.ts).toLocaleDateString('en-GB') : ''
      lines.push({ ts: r.ts, text: `[Group/${r.group_name}, ${date}] ${sender}: ${(r.body || '').slice(0, 200)}` })
    }

    // Emails
    const { rows: emails } = await db.query(`
      SELECT e.date AS ts, e.from_address, e.subject, e.body_text
      FROM email.emails e
      WHERE e.date > $1
        AND e.body_text IS NOT NULL
      ORDER BY e.date DESC
      LIMIT 100
    `, [cutoff])

    for (const r of emails) {
      const date = r.ts ? new Date(r.ts).toLocaleDateString('en-GB') : ''
      const snippet = (r.body_text || '').replace(/\s+/g, ' ').slice(0, 150)
      lines.push({ ts: r.ts, text: `[Email/${r.from_address}, ${date}] Subject: ${r.subject || '(none)'} — ${snippet}` })
    }

    // Limitless lifelogs
    const { rows: lifelogs } = await db.query(`
      SELECT id, title, start_time AS ts, markdown
      FROM limitless.lifelogs
      WHERE start_time > $1
        AND markdown IS NOT NULL
        AND length(markdown) > 100
      ORDER BY start_time DESC
      LIMIT 20
    `, [cutoff])

    for (const r of lifelogs) {
      const date = r.ts ? new Date(r.ts).toLocaleDateString('en-GB') : ''
      const snippet = (r.markdown || '').slice(0, 400).replace(/\n+/g, ' ')
      lines.push({ ts: r.ts, text: `[Limitless/${r.title || r.id}, ${date}] ${snippet}` })
    }

  } catch (err) {
    console.error('[extractor] buildCrossSourceDigest error:', err.message)
  }

  // Sort by timestamp descending, build string, truncate to ~32000 chars (~8000 tokens)
  lines.sort((a, b) => new Date(b.ts) - new Date(a.ts))
  const digest = lines.map(l => l.text).join('\n')
  return digest.slice(0, 32000)
}
```

- [ ] **Step 2: Add to module.exports**

```js
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
  buildCrossSourceDigest,   // ← add this
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/agents/relationships/services/extractor.js
git commit -m "feat(relationships): add buildCrossSourceDigest for cross-source opportunity engine"
```

---

## Task 12: Opportunity Agents 5, 6, 7

**Files:**
- Modify: `packages/agents/relationships/services/opportunities.js`

- [ ] **Step 1: Add `buildCrossSourceDigest` import at the top of `opportunities.js`**

After the existing `require` statements at the top of `opportunities.js`:

```js
const { buildCrossSourceDigest } = require('./extractor')
```

- [ ] **Step 2: Add Agent 5 — Cross-Person Intelligence**

Add this function before the `module.exports` at the end of `opportunities.js`:

```js
// ── Agent 5: Cross-Person Intelligence ────────────────────────────────────────
// Reads the cross-source digest and detects cross-person opportunities.

async function detectCrossPersonOpportunities(lastRunAt) {
  const insights = []
  try {
    const digest = await buildCrossSourceDigest(
      lastRunAt ? new Date(Math.min(new Date(lastRunAt), Date.now() - 30 * 24 * 60 * 60 * 1000)) : null
    )
    if (!digest || digest.length < 200) return insights

    const prompt = `You are a relationship intelligence assistant for a senior executive.
Analyze these recent communications and identify actionable relationship opportunities.

Look specifically for:
1. CHECK-IN: Someone mentioned as going through difficulty (surgery, illness, crisis, loss, stress) — the executive should check in
2. INTRODUCTION: Person A has a need (looking for consultant, seeking intro, needs help with X) AND Person B has the matching skill/service mentioned elsewhere — executive can make introduction
3. FOLLOW-UP: Someone mentioned the executive, their work, or something they said — worth acknowledging
4. PROJECT_MATCH: Someone whose skills/company could help with a business challenge mentioned in the communications

Communications digest (newest first):
${digest}

Return ONLY a JSON array (empty array if no strong opportunities):
[
  {
    "type": "check_in|introduction|follow_up|project_match",
    "title": "Short action title (max 60 chars)",
    "description": "Specific, actionable description referencing what was said and why this matters",
    "person_names": ["Name1", "Name2"],
    "priority": "high|medium|low"
  }
]

Rules:
- Only return genuine, specific opportunities — not generic advice
- INTRODUCTION opportunities must name both the person with the need AND the person who can help
- CHECK-IN opportunities must reference the specific situation
- Maximum 5 opportunities
- If no strong opportunities, return []`

    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content?.[0]?.text || ''
    const items = parseJSON(text)
    if (!Array.isArray(items)) return insights

    for (const item of items.slice(0, 5)) {
      // Resolve person names to contact_ids
      const contactIds = []
      for (const name of (item.person_names || [])) {
        if (!name) continue
        try {
          const { rows } = await db.query(`
            SELECT id FROM relationships.contacts
            WHERE normalized_name ILIKE $1
               OR display_name ILIKE $2
            LIMIT 1
          `, [name.toLowerCase().trim(), name.trim()])
          if (rows.length > 0) contactIds.push(rows[0].id)
        } catch { /* ignore */ }
      }

      // Deduplicate: skip if a similar insight already exists unactioned
      const titleHash = `cross:${item.title?.slice(0, 40)?.toLowerCase().replace(/\s+/g, '_')}`
      const { rows: exists } = await db.query(`
        SELECT id FROM relationships.insights
        WHERE source_ref = $1
          AND is_actioned = false AND is_dismissed = false
        LIMIT 1
      `, [titleHash])
      if (exists.length > 0) continue

      insights.push({
        contact_id:   contactIds[0] || null,
        contact_ids:  contactIds,
        insight_type: 'cross_source_opportunity',
        title:        item.title || 'Relationship opportunity',
        description:  item.description || '',
        priority:     item.priority || 'medium',
        source_ref:   titleHash,
      })
    }
  } catch (err) {
    console.error('[opportunities] detectCrossPersonOpportunities error:', err.message)
  }
  return insights
}
```

- [ ] **Step 3: Add Agent 6 — Project Match**

```js
// ── Agent 6: Project Match ─────────────────────────────────────────────────────
// Matches open projects to contacts who could help.

async function detectProjectMatches(lastRunAt) {
  const insights = []
  try {
    // Fetch open projects
    const { rows: projects } = await db.query(`
      SELECT id, name, description, status, tags
      FROM projects.projects
      WHERE status NOT IN ('completed', 'cancelled', 'noise')
      ORDER BY updated_at DESC
      LIMIT 10
    `)
    if (projects.length === 0) return insights

    // Fetch strong/moderate contacts with research summaries or job details
    const { rows: contacts } = await db.query(`
      SELECT id, display_name, job_title, company, research_summary, summary, tags
      FROM relationships.contacts
      WHERE is_noise = false
        AND relationship_strength IN ('strong', 'moderate')
      ORDER BY last_interaction_at DESC NULLS LAST
      LIMIT 50
    `)
    if (contacts.length === 0) return insights

    const projectList = projects.map(p =>
      `- [ID:${p.id}] ${p.name}: ${(p.description || '').slice(0, 150)}`
    ).join('\n')

    const contactList = contacts.map(c => {
      const bio = c.research_summary || c.summary || ''
      return `- [ID:${c.id}] ${c.display_name} (${c.job_title || 'unknown role'} @ ${c.company || 'unknown company'}): ${bio.slice(0, 150)}`
    }).join('\n')

    const prompt = `You are a relationship intelligence assistant.
Given these open projects and contacts, identify which contacts could concretely help with which projects.

Open projects:
${projectList}

Contacts:
${contactList}

Return ONLY a JSON array of the best 3 matches (empty array if none are strong matches):
[
  {
    "project_id": 123,
    "contact_id": 456,
    "project_name": "...",
    "contact_name": "...",
    "reason": "Why this contact can help and how (2-3 sentences)",
    "suggested_opener": "A specific, natural opening message to send this contact about the project (1-2 sentences)",
    "priority": "high|medium|low"
  }
]

Only include genuinely strong matches where the contact has relevant expertise or connections.`

    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content?.[0]?.text || ''
    const items = parseJSON(text)
    if (!Array.isArray(items)) return insights

    for (const item of items.slice(0, 3)) {
      const sourceRef = `project:${item.project_id}:${item.contact_id}`
      const { rows: exists } = await db.query(`
        SELECT id FROM relationships.insights
        WHERE source_ref = $1
          AND is_actioned = false AND is_dismissed = false
        LIMIT 1
      `, [sourceRef])
      if (exists.length > 0) continue

      insights.push({
        contact_id:   item.contact_id || null,
        contact_ids:  item.contact_id ? [item.contact_id] : [],
        insight_type: 'project_match',
        title:        `${item.contact_name} can help with: ${item.project_name}`,
        description:  `${item.reason}\n\nSuggested opener: "${item.suggested_opener}"`,
        priority:     item.priority || 'medium',
        source_ref:   sourceRef,
      })
    }
  } catch (err) {
    console.error('[opportunities] detectProjectMatches error:', err.message)
  }
  return insights
}
```

- [ ] **Step 4: Add Agent 7 — Research-Driven Opportunities**

```js
// ── Agent 7: Research-Driven Opportunities ───────────────────────────────────
// Scans new research results for contextual opportunities.

async function detectResearchOpportunities(lastRunAt) {
  const insights = []
  try {
    const since = lastRunAt || new Date(Date.now() - 24 * 60 * 60 * 1000)
    const { rows: newResearch } = await db.query(`
      SELECT cr.contact_id, cr.summary, cr.source, cr.researched_at,
             c.display_name, c.company
      FROM relationships.contact_research cr
      JOIN relationships.contacts c ON c.id = cr.contact_id
      WHERE cr.researched_at > $1
        AND cr.summary IS NOT NULL
        AND cr.summary NOT LIKE '%No %found%'
      ORDER BY cr.researched_at DESC
      LIMIT 30
    `, [since])

    if (newResearch.length === 0) return insights

    // Group by contact
    const byContact = {}
    for (const r of newResearch) {
      if (!byContact[r.contact_id]) {
        byContact[r.contact_id] = { display_name: r.display_name, company: r.company, summaries: [] }
      }
      byContact[r.contact_id].summaries.push(`[${r.source}] ${r.summary}`)
    }

    for (const [contactId, data] of Object.entries(byContact)) {
      const combined = data.summaries.join('\n\n').slice(0, 2000)
      const prompt = `Based on this recent research about ${data.display_name} (${data.company || 'unknown company'}), identify any specific relationship opportunities.

Research:
${combined}

Look for: company news (new product/funding/expansion), role changes, achievements, events, or anything that would be a natural reason to reach out.

Return ONLY a JSON object (or null if no strong opportunity):
{
  "title": "Short opportunity title (max 60 chars)",
  "description": "What happened and why it's a good reason to reach out (2-3 sentences)",
  "priority": "high|medium|low"
}`

      try {
        const response = await getClient().messages.create({
          model: MODEL,
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }],
        })
        const text = response.content?.[0]?.text || ''
        if (text.trim() === 'null' || !text.trim()) continue
        const item = parseJSON(text)
        if (!item?.title) continue

        const sourceRef = `research:${contactId}:${Math.floor(Date.now() / 86400000)}`
        const { rows: exists } = await db.query(`
          SELECT id FROM relationships.insights
          WHERE source_ref = $1 AND is_actioned = false AND is_dismissed = false LIMIT 1
        `, [sourceRef])
        if (exists.length > 0) continue

        insights.push({
          contact_id:   parseInt(contactId, 10),
          contact_ids:  [parseInt(contactId, 10)],
          insight_type: 'opportunity',
          title:        item.title,
          description:  item.description || '',
          priority:     item.priority || 'medium',
          source_ref:   sourceRef,
        })
        await sleep(300)
      } catch { /* non-fatal per contact */ }
    }
  } catch (err) {
    console.error('[opportunities] detectResearchOpportunities error:', err.message)
  }
  return insights
}
```

- [ ] **Step 5: Export the new agents**

In `module.exports` at the bottom of `opportunities.js`, add:

```js
module.exports = {
  runOpportunitySwarm,
  detectCrossPersonOpportunities,
  detectProjectMatches,
  detectResearchOpportunities,
}
```

- [ ] **Step 6: Update `runOpportunitySwarm` to include new agents**

Find the `runOpportunitySwarm` function in `opportunities.js`. At the end, before the `return` statement, add calls to the new agents:

```js
  // Agent 5: Cross-person opportunities
  const crossPersonInsights = await detectCrossPersonOpportunities(lastRunAt)
  allInsights.push(...crossPersonInsights)
  console.log(`   [Agent 5] ${crossPersonInsights.length} cross-person opportunities`)

  // Agent 6: Project matches
  const projectInsights = await detectProjectMatches(lastRunAt)
  allInsights.push(...projectInsights)
  console.log(`   [Agent 6] ${projectInsights.length} project matches`)

  // Agent 7: Research-driven opportunities
  const researchInsights = await detectResearchOpportunities(lastRunAt)
  allInsights.push(...researchInsights)
  console.log(`   [Agent 7] ${researchInsights.length} research-driven opportunities`)
```

(Add these before the final `return allInsights` or `return insights` line.)

- [ ] **Step 7: Commit**

```bash
git add packages/agents/relationships/services/opportunities.js
git commit -m "feat(relationships): add cross-source opportunity agents (cross-person, project match, research-driven)"
```

---

## Task 13: Wire contact_ids into index.js upsertInsight

**Files:**
- Modify: `packages/agents/relationships/index.js:221-239` (upsertInsight function)

- [ ] **Step 1: Update `upsertInsight` to persist `contact_ids`**

Replace the existing `upsertInsight` function body with:

```js
async function upsertInsight(contactId, insightData) {
  try {
    if (insightData.source_ref) {
      const { rows: exists } = await db.query(`
        SELECT id FROM relationships.insights
        WHERE source_ref = $1
          AND is_actioned  = false
          AND is_dismissed = false
        LIMIT 1
      `, [insightData.source_ref])
      if (exists.length > 0) return exists[0].id
    }

    const contactIds = Array.isArray(insightData.contact_ids) ? insightData.contact_ids : []

    const { rows } = await db.query(`
      INSERT INTO relationships.insights (
        contact_id, insight_type, title, description, priority, source_ref, contact_ids
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      contactId,
      insightData.insight_type,
      insightData.title,
      insightData.description,
      insightData.priority || 'medium',
      insightData.source_ref || null,
      contactIds,
    ])
    return rows[0]?.id || null
  } catch (err) {
    console.error('[index] upsertInsight error:', err.message)
    return null
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/agents/relationships/index.js
git commit -m "feat(relationships): persist contact_ids on insights for multi-person opportunities"
```

---

## Task 14: UI — Tab Bar + my_role Display

**Files:**
- Modify: `packages/ui/app/relationships/page.jsx`

- [ ] **Step 1: Add tab state to `RelationshipsPage`**

In the component state declarations (after `const [lightboxSrc, setLightboxSrc] = useState(null)`), add:

```js
  const [detailTab, setDetailTab] = useState('communications') // 'communications' | 'research' | 'opportunities'
  const [sourceFilter, setSourceFilter] = useState('')  // '' | 'whatsapp' | 'email' | 'limitless'
  const [contactResearch, setContactResearch] = useState(null)
  const [contactOpportunities, setContactOpportunities] = useState([])
  const [researchLoading, setResearchLoading] = useState(false)
  const [researchRefreshing, setResearchRefreshing] = useState(false)
```

- [ ] **Step 2: Reset tabs on contact change**

In the `selectContact` function, reset tab state when a new contact is selected:

```js
  async function selectContact(id) {
    setSelectedContactId(id)
    setSelectedContact(null)
    setDetailTab('communications')
    setSourceFilter('')
    setContactResearch(null)
    setContactOpportunities([])
    try {
      const c = await apiFetch('GET', `/api/relationships/contacts/${id}`)
      setSelectedContact(c)
    } catch { showToast('Failed to load contact') }
  }
```

- [ ] **Step 3: Add tab-switching data loaders**

Add these two functions after `selectContact`:

```js
  async function loadContactResearch(id) {
    try {
      const data = await apiFetch('GET', `/api/relationships/contacts/${id}/research`)
      setContactResearch(data)
    } catch { /* ignore */ }
  }

  async function loadContactOpportunities(id) {
    try {
      const data = await apiFetch('GET', `/api/relationships/contacts/${id}/opportunities`)
      setContactOpportunities(Array.isArray(data) ? data : [])
    } catch { /* ignore */ }
  }

  async function handleDetailTabChange(tab) {
    setDetailTab(tab)
    if (!selectedContactId) return
    if (tab === 'research' && !contactResearch) loadContactResearch(selectedContactId)
    if (tab === 'opportunities') loadContactOpportunities(selectedContactId)
  }

  async function triggerResearchRefresh() {
    if (!selectedContactId) return
    setResearchRefreshing(true)
    try {
      await apiFetch('POST', `/api/relationships/contacts/${selectedContactId}/research`)
      showToast('Research queued — refresh in a minute')
    } catch { showToast('Failed to queue research') }
    setResearchRefreshing(false)
  }
```

- [ ] **Step 4: Add tab styles to the `<style>` block**

Inside the existing `<style>{`...`}</style>` block, add:

```css
        .detail-tab-bar { display:flex;gap:0;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0;padding:0 1.5rem; }
        .detail-tab { font-family:'Plus Jakarta Sans',sans-serif;font-size:.78rem;font-weight:500;color:var(--text-3);padding:.6rem .875rem;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap;transition:color .15s,border-color .15s;background:none;border-top:none;border-left:none;border-right:none; }
        .detail-tab:hover { color:var(--text-2); }
        .detail-tab.active { color:var(--accent);border-bottom-color:var(--accent); }
        .source-filter-row { display:flex;gap:.375rem;padding:.75rem 1.5rem .25rem;flex-shrink:0; }
        .source-chip { font-size:.7rem;font-weight:500;padding:.2rem .6rem;border-radius:100px;border:1px solid var(--border);background:var(--surface);color:var(--text-3);cursor:pointer;transition:all .12s; }
        .source-chip:hover { border-color:var(--border-strong);color:var(--text-2); }
        .source-chip.active { background:var(--accent-subtle);border-color:var(--accent-border);color:var(--accent); }
        .my-role-label { font-size:.75rem;color:var(--text-3);margin-top:.15rem; }
        .my-role-label span { color:var(--text-2);font-weight:500; }
        .research-area { flex:1;overflow-y:auto;padding:1.25rem 1.5rem; }
        .research-area::-webkit-scrollbar { width:4px; }
        .research-dossier { font-size:.8125rem;color:var(--text-2);line-height:1.7;padding:1rem;background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:1.25rem; }
        .research-dossier-label { font-size:.68rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-3);margin-bottom:.5rem; }
        .research-provider { margin-bottom:.875rem; }
        .research-provider-header { font-size:.75rem;font-weight:600;color:var(--text-2);margin-bottom:.35rem;display:flex;align-items:center;gap:.4rem; }
        .research-provider-summary { font-size:.775rem;color:var(--text-3);line-height:1.55;white-space:pre-wrap;word-break:break-word; }
        .research-meta { font-size:.68rem;color:var(--text-3);margin-top:.25rem; }
        .research-empty { text-align:center;padding:2.5rem 1rem;color:var(--text-3); }
        .research-empty-icon { font-size:2rem;margin-bottom:.5rem;opacity:.4; }
        .opps-area { flex:1;overflow-y:auto;padding:.75rem 1rem; }
        .opps-area::-webkit-scrollbar { width:4px; }
        .opps-empty { text-align:center;padding:2rem 1rem;color:var(--text-3);font-size:.8rem; }
```

- [ ] **Step 5: Replace the contact detail view's `profile-view` section**

Find the `<div className="profile-view">` block (around line 593) and replace the content *inside* it with the following. The outer `<div className="profile-view">` wrapper stays.

The profile header stays the same. Add `my_role` display below the title line:

```jsx
              <div className="profile-header">
                <div className="profile-name-row">
                  <div className="profile-avatar" style={{ background: avatarColor(selectedContact.display_name) }}>
                    {avatarInitial(selectedContact.display_name)}
                  </div>
                  <div className="profile-name-meta">
                    <div className="profile-name">{selectedContact.display_name}</div>
                    {(selectedContact.job_title || selectedContact.company) && (
                      <div className="profile-title-company">
                        {[selectedContact.job_title, selectedContact.company].filter(Boolean).join(' @ ')}
                      </div>
                    )}
                    {selectedContact.my_role && (
                      <div className="my-role-label">Your role: <span>{selectedContact.my_role}</span></div>
                    )}
                  </div>
                  <div className="profile-header-actions">
                    <button className="btn btn-ghost btn-sm" onClick={openEditModal}>Edit</button>
                  </div>
                </div>
                <div className="profile-badges">
                  <span className={`rel-badge ${selectedContact.relationship_type || 'unknown'}`}>
                    {(selectedContact.relationship_type || 'unknown').replace(/_/g, ' ')}
                  </span>
                  <span className={`strength-badge ${selectedContact.relationship_strength || 'weak'}`}>
                    {selectedContact.relationship_strength || 'weak'}
                  </span>
                  {(selectedContact.tags || []).map((t, i) => <span key={i} className="tag-pill">{t}</span>)}
                </div>
                {selectedContact.summary && <p className="profile-summary">{selectedContact.summary}</p>}
              </div>

              {/* Tab bar */}
              <div className="detail-tab-bar">
                {['communications', 'research', 'opportunities'].map(tab => (
                  <button key={tab}
                    className={`detail-tab${detailTab === tab ? ' active' : ''}`}
                    onClick={() => handleDetailTabChange(tab)}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              {/* Communications tab */}
              {detailTab === 'communications' && (
                <>
                  <div className="source-filter-row">
                    {[['', 'All'], ['whatsapp', '💬 WhatsApp'], ['email', '📧 Email'], ['limitless', '🎙️ Limitless']].map(([val, label]) => (
                      <button key={val}
                        className={`source-chip${sourceFilter === val ? ' active' : ''}`}
                        onClick={() => setSourceFilter(val)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="comms-area">
                    {(() => {
                      const filtered = (selectedContact.communications || [])
                        .filter(c => !sourceFilter || c.source === sourceFilter)
                      if (!filtered.length) return <div className="comms-empty">No communications recorded yet</div>
                      return Object.entries(groupByDate(filtered)).map(([date, items]) => (
                        <div className="comms-date-group" key={date}>
                          <div className="comms-date-label">{date}</div>
                          {items.map((c, i) => {
                            const dir = c.direction || 'inbound'
                            const dirLabel = dir === 'outbound' ? '↗ Sent' : dir === 'group' ? '👥 Group' : '↙ Received'
                            return (
                              <div className="comm-item" key={i}>
                                <div className="comm-icon">{sourceIcon(c.source)}</div>
                                <div className="comm-body">
                                  <div className="comm-meta">
                                    <span className={`comm-direction ${dir}`}>{dirLabel}</span>
                                    <span className="comm-time">{fmtTime(c.occurred_at)}</span>
                                  </div>
                                  <CommContent comm={c} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ))
                    })()}
                  </div>
                </>
              )}

              {/* Research tab */}
              {detailTab === 'research' && (
                <div className="research-area">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '.75rem', color: 'var(--text-3)' }}>
                      {contactResearch?.providers?.[0]?.researched_at
                        ? `Last researched ${relTime(contactResearch.providers[0].researched_at)}`
                        : 'Not yet researched'}
                    </span>
                    <button className="btn btn-ghost btn-sm"
                      onClick={triggerResearchRefresh}
                      disabled={researchRefreshing}>
                      {researchRefreshing ? 'Queuing…' : 'Refresh'}
                    </button>
                  </div>

                  {!contactResearch ? (
                    <div className="research-empty">
                      <div className="research-empty-icon">🔍</div>
                      Loading…
                    </div>
                  ) : !contactResearch.research_summary && (!contactResearch.providers || contactResearch.providers.length === 0) ? (
                    <div className="research-empty">
                      <div className="research-empty-icon">🔍</div>
                      <div>No research yet</div>
                      <button className="btn btn-primary btn-sm" style={{ marginTop: '.75rem' }}
                        onClick={triggerResearchRefresh}>
                        Research this contact
                      </button>
                    </div>
                  ) : (
                    <>
                      {contactResearch.research_summary && (
                        <div className="research-dossier">
                          <div className="research-dossier-label">Dossier</div>
                          {contactResearch.research_summary}
                        </div>
                      )}
                      {(contactResearch.providers || []).map(p => (
                        <div className="research-provider" key={p.source}>
                          <div className="research-provider-header">
                            <span>{{ tavily: '🌐', openai: '🤖', peopledatalabs: '👤', serpapi: '🔎' }[p.source] || '📌'}</span>
                            <span>{p.source}</span>
                          </div>
                          <div className="research-provider-summary">{p.summary}</div>
                          <div className="research-meta">
                            Queried: {p.query} · {p.researched_at ? fmtDate(p.researched_at) : ''}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* Opportunities tab */}
              {detailTab === 'opportunities' && (
                <div className="opps-area">
                  {contactOpportunities.length === 0 ? (
                    <div className="opps-empty">
                      <div style={{ fontSize: '2rem', opacity: .4, marginBottom: '.5rem' }}>✨</div>
                      No opportunities yet
                    </div>
                  ) : (
                    contactOpportunities.map(ins => (
                      <div className="insight-card" key={ins.id}>
                        <div className="insight-card-header">
                          <div className="insight-type-icon">{insightIcon(ins.insight_type)}</div>
                          <div className="insight-card-meta">
                            <div className="insight-title">{ins.title}</div>
                          </div>
                          <span className="priority-badge" title={`${ins.priority} priority`}>{priorityIcon(ins.priority)}</span>
                        </div>
                        {ins.description && <div className="insight-description">{ins.description}</div>}
                        <div className="insight-actions">
                          <button className="insight-btn action" onClick={() => actionInsight(ins.id)}>Done</button>
                          <button className="insight-btn dismiss" onClick={() => dismissInsight(ins.id)}>Dismiss</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
```

- [ ] **Step 6: Add `insightIcon` entry for new types**

Find the `insightIcon` function at the top of the file and add the new types:

```js
function insightIcon(type) {
  return {
    awaiting_reply: '💬',
    unread_group: '👥',
    cold_email: '📧',
    opportunity: '✨',
    action_needed: '⚡',
    topic: '💡',
    cross_source_opportunity: '🔗',
    project_match: '🎯',
  }[type] || '📌'
}
```

- [ ] **Step 7: Add Opportunities tab to global right panel**

Find the `insight-tabs` div in the right panel. Add an opportunities filter:

```jsx
            <div className="insight-tabs">
              {[
                { filter: '', label: 'All' },
                { filter: 'awaiting_reply', label: 'Awaiting Reply' },
                { filter: 'unread_group', label: 'Active Groups' },
                { filter: 'cold_email', label: 'Cold Emails' },
                { filter: 'cross_source_opportunity', label: 'Opportunities' },
              ].map(({ filter, label }) => (
                <button key={filter} className={`insight-tab${insightFilter === filter ? ' active' : ''}`}
                  onClick={() => setInsightFilter(filter)}>
                  {label}
                </button>
              ))}
            </div>
```

- [ ] **Step 8: Commit**

```bash
git add packages/ui/app/relationships/page.jsx
git commit -m "feat(ui): add Communications/Research/Opportunities tabs, my_role display, source filter"
```

---

## Task 15: Final Wiring + Smoke Test

- [ ] **Step 1: Verify full agent chain**

```bash
# 1. Confirm schema is applied
psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_schema='relationships' AND table_name='contacts' AND column_name IN ('my_role','research_summary');"

# 2. Start research agent (will run once and schedule)
npm run research
# Expected: "🔬 Research Agent v1.0", finds stale contacts, runs providers, exits cron loop

# 3. Check a contact's research was written
psql $DATABASE_URL -c "SELECT contact_id, source, researched_name, LEFT(summary,100) FROM relationships.contact_research LIMIT 5;"
```

- [ ] **Step 2: Test on-demand research API**

```bash
# Start the UI server first
npm run ui:dev

# In another terminal, pick a contact id from your DB
psql $DATABASE_URL -c "SELECT id, display_name FROM relationships.contacts WHERE relationship_strength='strong' LIMIT 3;"

# Trigger on-demand research for contact id 1
curl -s -X POST http://localhost:4001/api/relationships/contacts/1/research
# Expected: {"status":"queued","contact_id":1}

# Fetch results (wait ~30 seconds for research to complete)
curl -s http://localhost:4001/api/relationships/contacts/1/research | head -c 500
```

- [ ] **Step 3: Verify perspective fix**

```bash
# Find a contact known to be a service provider (e.g. dentist)
# Trigger reanalysis
curl -s -X POST http://localhost:4001/api/relationships/contacts/<id>/reanalyze | python3 -m json.tool
# Expected: relationship_type != 'dental_patient', my_role is set (e.g. "patient")
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git status
# Verify only expected files are staged, then:
git commit -m "feat(relationships): relationships intelligence — perspective fix, research agent, opportunity engine, UI tabs"
```
