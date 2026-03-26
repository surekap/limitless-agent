# Relationships Intelligence — Design Spec
**Date:** 2026-03-26
**Status:** Approved

## Overview

Four connected improvements to the Relationships module:

1. **Perspective fix** — relationship analysis always from the account owner's viewpoint, with a new `my_role` field
2. **Research agent** — new `packages/agents/research/` agent enriches contacts via Tavily, OpenAI, PeopleDataLabs, SerpAPI
3. **Per-contact Research tab** — UI tab showing dossier + provider data + on-demand refresh
4. **Cross-source Opportunity Engine** — connects dots across all communications (WhatsApp DMs, groups, email, Limitless) to generate actionable per-contact and cross-person opportunities

---

## 1. Schema Changes

### 1a. `relationships.contacts` — new columns

```sql
ALTER TABLE relationships.contacts ADD COLUMN IF NOT EXISTS my_role TEXT;
-- e.g. "patient", "client", "mentee", "employer"
-- Describes the account owner's role in relation to this contact
```

### 1b. New table: `relationships.contact_research`

```sql
CREATE TABLE relationships.contact_research (
  id              BIGSERIAL PRIMARY KEY,
  contact_id      BIGINT REFERENCES relationships.contacts(id) ON DELETE CASCADE,
  source          TEXT NOT NULL CHECK (source IN ('tavily','openai','peopledatalabs','serpapi')),
  query           TEXT,           -- search query used
  result_json     JSONB,          -- raw API response
  summary         TEXT,           -- Claude-synthesised paragraph for this provider
  researched_name TEXT,           -- display_name at time of research (staleness detection)
  researched_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (contact_id, source)     -- one row per provider, overwritten on refresh
);
```

### 1c. Extended `insight_type`

```sql
ALTER TABLE relationships.insights DROP CONSTRAINT IF EXISTS insights_insight_type_check;
ALTER TABLE relationships.insights ADD CONSTRAINT insights_insight_type_check
  CHECK (insight_type IN (
    'opportunity', 'cold_email', 'unread_group', 'awaiting_reply',
    'action_needed', 'topic',
    'cross_source_opportunity',   -- dots connected across people/groups/sources
    'project_match'               -- contact could help with an open project
  ));

ALTER TABLE relationships.insights ADD COLUMN IF NOT EXISTS contact_ids BIGINT[] DEFAULT '{}';
-- allows an insight to reference multiple contacts (e.g. "introduce X to Y")
```

### 1d. `relationships.contacts` — research summary column

```sql
ALTER TABLE relationships.contacts ADD COLUMN IF NOT EXISTS research_summary TEXT;
-- Synthesised dossier paragraph, updated after each research run
```

---

## 2. Perspective Fix

### Problem
`analyzer.js` `analyzeDirectChatContact` has no perspective anchor. Claude infers relationship direction from message patterns and can invert it (account owner classified as dentist, contact as patient).

### Fix — `packages/agents/relationships/services/analyzer.js`

Add a perspective anchor and `my_role` field to the prompt:

```
You are analyzing this contact from the perspective of the account owner.
Describe who THIS CONTACT IS to the account owner — their role, not the reverse.

Examples of correct perspective:
- Account owner's dentist → relationship_type: "service_provider", my_role: "patient"
- Account owner's investor → relationship_type: "professional_contact", my_role: "founder"
- Account owner's employee → relationship_type: "colleague", my_role: "manager"
- Account owner's friend → relationship_type: "friend", my_role: "friend"

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
```

The same fix applies to the `reanalyze` prompt in `packages/ui/server.js`.

`my_role` is stored in the new DB column and returned in the contact API response. The analyzer's `upsertContact` call in `index.js` is updated to write `my_role`.

---

## 3. Research Agent

### Structure

```
packages/agents/research/
├── index.js              — scheduler + orchestrator
├── package.json          — { "name": "@secondbrain/research", "main": "index.js" }
└── providers/
    ├── tavily.js         — Tavily web search
    ├── openai.js         — OpenAI GPT-4o public profile prompt
    ├── peopledatalabs.js — PDL Person/Company Enrich API
    └── serpapi.js        — SerpAPI Google search
```

### Scheduling (`index.js`)

- Cron: every 24 hours
- Per run: fetch up to 20 contacts where:
  - `relationship_strength IN ('strong', 'moderate')`
  - AND one of:
    - No research exists
    - `researched_at < NOW() - INTERVAL '7 days'`
    - `contact.display_name != contact_research.researched_name` (name changed)
- Run all 4 providers in parallel per contact (`Promise.allSettled`)
- After providers complete, call Claude to synthesise a unified dossier paragraph
- Write/upsert one row per provider to `contact_research`
- Update `contacts.research_summary` with the synthesised dossier

### Staleness Detection

`researched_name` is stored on each `contact_research` row. If `contact.display_name` differs from any existing research row's `researched_name`, all research for that contact is considered stale and re-runs. This handles the case where a phone contact was previously known only by number and is later named.

### Provider Logic

**Tavily (`providers/tavily.js`)**
- Two queries per contact:
  1. `"<name> <company>"` — general background
  2. `"<name> news 2025"` — recent news
- Returns top 5 results each
- Requires `TAVILY_API_KEY`

**OpenAI (`providers/openai.js`)**
- Single prompt to GPT-4o:
  > "What is publicly known about [name], [job_title] at [company]? Include: professional background, reputation, notable work, recent news. Be factual, flag uncertainty. Do not invent information."
- Requires `OPENAI_API_KEY`

**PeopleDataLabs (`providers/peopledatalabs.js`)**
- Person Enrich API: query by email (if available) or name + company
- Returns structured profile: work history, education, social profiles
- Requires `PEOPLEDATALABS_API_KEY`

**SerpAPI (`providers/serpapi.js`)**
- Google search: `"<name>" "<company>"`
- Extracts Knowledge Graph + top 5 organic snippets
- Requires `SERPAPI_API_KEY`

### New env vars (`.env.local`)

```
TAVILY_API_KEY=...
OPENAI_API_KEY=...
PEOPLEDATALABS_API_KEY=...
SERPAPI_API_KEY=...
```

### New npm script (`package.json` root)

```json
"research": "node packages/agents/research/index.js"
```

### On-demand API endpoint

`POST /api/relationships/contacts/:id/research`
- Triggers research pipeline for a single contact asynchronously
- Returns `{ status: 'queued', contact_id: <id> }` immediately
- The on-demand run always re-runs all providers regardless of staleness

---

## 4. Cross-Source Opportunity Engine

### Cross-Source Digest

New function `buildCrossSourceDigest(lastRunAt)` in `extractor.js`:
- WhatsApp DMs: last 30 days, all contacts, up to 200 messages
- WhatsApp groups: last 30 days, up to 300 messages
- Email: last 30 days, up to 100 snippets
- Limitless: last 30 days, up to 20 lifelogs
- Sorted by timestamp, each line labelled: `[Source/ContactOrGroup, Date] content`
- Truncated to ~8000 tokens

### New Opportunity Agents (added to `opportunities.js`)

**Agent 5 · Cross-Person Intelligence**

Receives the cross-source digest. Claude prompt:
> "You are a relationship intelligence assistant. Identify actionable opportunities from these communications. Look for:
> 1. Someone mentioned in distress/difficulty → suggest checking in
> 2. Person A has a need, Person B has matching skill/service → suggest introduction
> 3. Someone mentioned you or your work → suggest follow-up
>
> Return JSON array: [{ title, description, contact_names: [...], opportunity_type: 'checkin|introduction|followup', priority: 'high|medium|low' }]"

Contact names in the response are resolved to `contact_ids` by fuzzy-matching against `normalized_name` in the contacts table. Stored as `cross_source_opportunity` insights with `contact_ids` populated.

**Agent 6 · Project Match**

- Fetches open projects from `projects.projects` (status != 'completed')
- Fetches contact profiles + `research_summary` for strong/moderate contacts
- Claude prompt: "Given these open projects and these contacts' backgrounds, which contacts could help with which projects? Suggest a specific opening message for each match."
- Stored as `project_match` insights

**Agent 7 · Research-Driven Opportunities**

- Lives in `opportunities.js` (relationships agent), runs as part of the 6-hour relationships cycle
- Scans `contact_research` rows updated since last run for signals: company news, funding, job changes, launches
- Claude extracts opportunities from the research content
- Stored as `opportunity` insights linked to the relevant contact

### Opportunity deduplication

Existing `source_ref` mechanism is extended:
- Cross-source opportunities: `source_ref = 'cross:<hash_of_contact_ids_and_title>'`
- Project match: `source_ref = 'project:<project_id>:<contact_id>'`
- Research-driven: `source_ref = 'research:<contact_id>:<researched_at_epoch>'`

---

## 5. UI Changes

### 5a. Contact detail pane — tabs

Replace the flat communications feed with a tab bar:

```
[ Communications ]  [ Research ]  [ Opportunities ]
```

**Communications tab** — existing feed, unchanged except source filter chips: `All · WhatsApp · Email · Limitless`

**Research tab**
- Synthesised dossier paragraph at top (`contacts.research_summary`)
- Per-provider accordion sections showing raw results
- Header: "Last researched X ago" + "Refresh" button → `POST /api/relationships/contacts/:id/research`
- If no research yet: empty state with "Research this contact" CTA

**Opportunities tab**
- Shows insights where `contact_id = selected_contact_id OR contact_ids @> ARRAY[selected_contact_id]`
- Filtered to: `opportunity`, `cross_source_opportunity`, `project_match`
- Same card UI as global right panel
- "Generate" button → on-demand opportunity analysis for this contact

### 5b. Contact header — `my_role` display

```
[SG]  Shailee Gala
      Dentist @ Apollo Dental
      Your role: Patient          ← shown only if my_role is set
[service provider] [moderate] [dental]
```

### 5c. Global right panel — new tab

Add `opportunity` filter tab to the existing insight tabs:
```
All · Awaiting Reply · Active Groups · Cold Emails · Opportunities
```

### 5d. Agent dashboard

Add `research` agent to `packages/ui/app/agents/page.jsx` alongside existing agents.

### 5e. New API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/relationships/contacts/:id/research` | Trigger on-demand research |
| `GET`  | `/api/relationships/contacts/:id/research` | Fetch research results for contact |
| `GET`  | `/api/relationships/contacts/:id/opportunities` | Fetch per-contact opportunities |

---

## Environment Summary

All agents load `.env.local` from repo root via `dotenv`. New keys required:

```
TAVILY_API_KEY=...
OPENAI_API_KEY=...
PEOPLEDATALABS_API_KEY=...
SERPAPI_API_KEY=...
```

---

## Out of Scope

- LinkedIn direct API (requires partner access; Tavily/SerpAPI cover public LinkedIn pages)
- Automated outreach / message drafting (opportunities surface the suggestion; user acts manually)
- Real-time opportunity detection (runs on the existing 6-hour relationships agent cycle)
