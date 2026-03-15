# secondbrain

A personal intelligence system that automatically synthesizes your email, voice recordings, and WhatsApp conversations into actionable insights about your projects and relationships.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Data Sources                        │
│   Gmail · Limitless.ai lifelogs · WhatsApp           │
└──────────┬───────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────┐
│                  Ingestion Agents                    │
│   Email Agent · Limitless Agent                      │
└──────────┬───────────────────────────────────────────┘
           │  writes to Postgres
           ▼
┌──────────────────────────────────────────────────────┐
│                  PostgreSQL                          │
│   email.*  ·  limitless.*  ·  public.messages        │
└──────────┬───────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────┐
│               Analysis Agents (Claude-powered)       │
│   Projects Agent · Relationships Agent               │
└──────────┬───────────────────────────────────────────┘
           │  writes to projects.*  relationships.*
           ▼
┌──────────────────────────────────────────────────────┐
│                  Control Panel UI                    │
│   Next.js (port 4000) + Express API (port 4001)      │
└──────────────────────────────────────────────────────┘
```

All agents share a single Postgres database via `packages/db`. Analysis agents use the Anthropic Claude API to extract structured intelligence from raw communications.

---

## Packages

```
packages/
├── db/                     Shared Postgres connection pool
├── agents/
│   ├── email/              Gmail IMAP sync → email.*
│   ├── limitless/          Limitless.ai lifelog fetch + Claude processing
│   ├── projects/           Project discovery & tracking (Claude)
│   └── relationships/      Contact profiling & relationship graph (Claude)
└── ui/
    ├── app/                Next.js 14 frontend (port 4000)
    ├── public/             Legacy static HTML pages
    └── server.js           Express API server (port 4001)
```

---

## Agents

### Email Agent

Syncs one or more Gmail inboxes into Postgres using IMAP.

- Polls every 15 minutes
- Upserts messages with full metadata (subject, body, headers, attachments, labels)
- De-duplicates via `gmail_uid`

**Schema:** `email.accounts`, `email.emails`

---

### Limitless Agent

Fetches lifelogs from the Limitless.ai API and processes them with Claude.

- Fetches new lifelogs every 5 minutes
- Processes unprocessed lifelogs every 30 seconds
- Claude uses MCP-style tools to take actions: create Notion databases, add Todoist tasks, research stocks
- Archives chat history and reminders

**Schema:** `limitless.lifelogs`, `limitless.lifelog_processing`, `limitless.handlers`, `limitless.handler_logs`

---

### Projects Agent

Discovers and tracks projects from all communication sources using Claude.

**How it works:**
1. Gathers email thread subjects, lifelog titles, and WhatsApp chat names
2. Claude identifies distinct projects, initiatives, and matters
3. Upserts projects into the DB (case-insensitive name matching)
4. Classifies emails, lifelogs, and WhatsApp messages to projects
5. Re-analyzes projects that received new communications
6. Generates insights: blockers, risks, next actions, opportunities

Runs every 12 hours (incremental after first run — only processes new communications).

**Schema:** `projects.projects`, `projects.project_communications`, `projects.project_insights`, `projects.analysis_runs`

---

### Relationships Agent

Builds and maintains contact profiles from WhatsApp, email, and Limitless lifelogs.

**How it works:**
1. Extracts direct chat contacts and group chats from WhatsApp
2. Analyses each contact with Claude: identifies company, job title, relationship type/strength, tags
3. Deep-analyses group chats: classifies group type, your role, key topics, and communication advice
4. Processes email senders and links them to contact profiles
5. Extracts named participants from Limitless transcripts
6. Generates insights: awaiting reply, unread groups, opportunities, action needed

Runs every 12 hours (incremental).

**Schema:** `relationships.contacts`, `relationships.communications`, `relationships.groups`, `relationships.insights`, `relationships.analysis_runs`

---

### Manual Overrides

Any field you edit in the UI is recorded in a `manual_overrides JSONB` column on both `projects.projects` and `relationships.contacts`. Agents will never overwrite manually-set fields, and Claude is told about them as ground truth when generating new analysis.

To hand a field back to agents, send `_clearOverrides: ['field_name']` in a PATCH request.

---

## UI

The control panel is a **Next.js 14** app (port 4000) that proxies `/api/*` to an **Express** API server (port 4001).

### Pages

| URL | Description |
|-----|-------------|
| `/` | Agent dashboard — start/stop agents, view logs, edit config |
| `/relationships` | Contact list with search, filtering, manual editing, re-analysis |
| `/groups` | WhatsApp group intelligence — type, your role, topics, advice |
| `/projects` | Project tracker — status, health, insights, communications |
| `/search` | Full-text search across all communications |

### Log viewer

Logs are polled per-agent when the log panel is open. The periodic 5-second status poll surgically patches only the mutable DOM (status pill, button, stats) — it never touches the log viewer, so log output is never wiped.

---

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Anthropic API key
- (Optional) Limitless.ai API key, Notion token, Todoist token

### Install

```bash
git clone <repo>
cd secondbrain
npm install
```

### Configure

Create `.env.local` in the repo root:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/secondbrain

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Limitless (optional)
LIMITLESS_API_KEY=...
LIMITLESS_TIMEZONE=Asia/Kolkata
FETCH_DAYS=1

# Gmail (repeat _2, _3 etc. for multiple accounts)
GMAIL_EMAIL_1=you@gmail.com
GMAIL_APP_PASSWORD_1=xxxx xxxx xxxx xxxx

# Integrations (optional, used by Limitless agent tools)
NOTION_TOKEN=...
TODOIST_API_TOKEN=...

# UI
UI_PORT=4001
```

### Initialize the database

Each agent initialises its own schema automatically when it starts. You can also run the schemas directly:

```bash
psql $DATABASE_URL -f packages/agents/email/sql/schema.sql
psql $DATABASE_URL -f packages/agents/limitless/sql/schema.sql
psql $DATABASE_URL -f packages/agents/projects/sql/schema.sql
psql $DATABASE_URL -f packages/agents/relationships/sql/schema.sql
```

---

## Running

### Development (UI + API server together)

```bash
npm run ui:dev
```

This starts:
- `node server.js` — Express API on port 4001
- `next dev -p 4000` — Next.js on port 4000

### Start individual agents

```bash
npm run email           # Email sync agent
npm run limitless       # Limitless processing agent
npm run relationships   # Relationships analysis agent
npm run projects        # Projects analysis agent
```

### Or manage agents from the UI

Open `http://localhost:4000`, start/stop agents from the dashboard.

---

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm run ui:dev` | Start UI (Next.js + Express API) |
| `npm run ui` | Production UI |
| `npm run api` | Express API server only |
| `npm run email` | Email agent |
| `npm run limitless` | Limitless agent |
| `npm run relationships` | Relationships agent |
| `npm run projects` | Projects agent |

---

## Data Flow: Manual Overrides

When you edit a field in the UI (e.g. change a contact's relationship type to `friend`):

1. The PATCH endpoint updates the field **and** writes `{ "relationship_type": { "value": "friend", "set_at": "..." } }` into `manual_overrides`
2. On the next agent run, the SQL `UPDATE` uses `CASE WHEN manual_overrides ? 'relationship_type' THEN relationship_type ELSE $new_value END` — the agent's value is discarded
3. Claude receives the override as prompt context: *"User-confirmed facts (treat as ground truth): relationship_type: 'friend'"*
4. The reanalyze endpoint returns `locked_fields: ['relationship_type']` so the UI can show which suggestions would be ignored

To unlock a field and let agents manage it again, send `_clearOverrides: ['relationship_type']` in a PATCH request.

---

## WhatsApp Integration

The WhatsApp messages live in `public.messages` (populated by an external WhatsApp bridge — not included in this repo). The agents expect rows with:

```sql
chat_id   TEXT    -- e.g. "919876543210@c.us" or "120363...@g.us"
event     TEXT    -- 'message' | 'message_create' | 'message_historical' | 'group_update'
msg_type  TEXT    -- 'chat' | 'image' | 'video' | 'document' | 'ptt' | ...
data      JSONB   -- full WhatsApp message payload
ts        TIMESTAMPTZ
```

---

## License

MIT
