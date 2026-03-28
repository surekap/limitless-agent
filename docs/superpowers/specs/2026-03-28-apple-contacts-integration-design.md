# Apple Contacts Integration — Design Spec

**Date:** 2026-03-28

---

## Goal

Import contacts from Apple Contacts (Address Book) into `relationships.contacts`, enriching existing contacts and creating new ones. Supports two sync paths: native macOS sync via `node-mac-contacts`, and cross-platform vCard (.vcf) file upload for hosted/Linux deployments.

## Scope

- One-way: Apple Contacts → secondbrain only.
- Create new contacts for Apple Contacts entries with no prior communication history.
- Pull photos as avatars shown in the Relationships page.
- Respect existing `manual_overrides` on enriched fields.
- No changes to the Relationships or Projects agents.

---

## Architecture

```
macOS (native)              Any platform (VCF upload)
       │                              │
node-mac-contacts           .vcf file via HTTP POST
       │                              │
  nativeReader.js             vcfParser.js
       │                              │
       └──────────────┬───────────────┘
                      │
                 syncer.js   ← shared matching + upsert
                      │
           relationships.contacts
           (+ apple_contact_id, avatar_data columns)
                      │
             Relationships UI
         (avatar photo with initials fallback)
```

---

## New Package: `packages/agents/apple-contacts/`

```
packages/agents/apple-contacts/
├── package.json
├── index.js               entry point — runs sync on schedule (macOS) or exits (Linux)
├── sql/
│   └── schema.sql         ALTER TABLE additions to relationships.contacts
└── services/
    ├── nativeReader.js    macOS only — reads via node-mac-contacts
    ├── vcfParser.js       cross-platform — parses .vcf file content
    └── syncer.js          shared — matching logic + DB upsert
```

### `package.json`

```json
{
  "name": "@secondbrain/apple-contacts",
  "dependencies": {
    "node-mac-contacts": "^1.x",
    "vcf": "^2.x",
    "dotenv": "^16.x",
    "pg": "^8.x"
  }
}
```

`node-mac-contacts` is a native addon (N-API). It requires Xcode CLT on macOS. On Linux it is not installed (listed as optional or guarded by platform check). The `vcf` package handles vCard parsing on all platforms.

---

## Schema Changes

File: `packages/agents/apple-contacts/sql/schema.sql`

```sql
ALTER TABLE relationships.contacts
  ADD COLUMN IF NOT EXISTS apple_contact_id TEXT;

ALTER TABLE relationships.contacts
  ADD COLUMN IF NOT EXISTS avatar_data TEXT; -- base64-encoded JPEG

CREATE INDEX IF NOT EXISTS contacts_apple_contact_id_idx
  ON relationships.contacts (apple_contact_id)
  WHERE apple_contact_id IS NOT NULL;
```

These are idempotent `ADD COLUMN IF NOT EXISTS` statements. No destructive changes to existing data.

Registered in `runSystemSchema()` in `packages/ui/server.js` after `relationships/sql/schema.sql`.

---

## Normalized Contact Format

Both `nativeReader.js` and `vcfParser.js` produce the same intermediate object consumed by `syncer.js`:

```js
{
  apple_contact_id: string,   // stable UID from Apple or vCard UID field
  display_name: string,       // firstName + ' ' + lastName, or org name
  first_name: string | null,
  last_name: string | null,
  emails: string[],           // lowercase
  phone_numbers: string[],    // normalized (digits only)
  company: string | null,
  job_title: string | null,
  avatar_data: string | null, // base64 JPEG
}
```

---

## `nativeReader.js` (macOS only)

```js
// Guard — will throw on non-macOS before requiring the native module
if (process.platform !== 'darwin') throw new Error('Native sync requires macOS');

const contacts = require('node-mac-contacts');
// contacts.getAllContacts() returns raw Apple Contact objects
// Each has: firstName, lastName, nickname, organization, jobTitle,
//           emailAddresses[{value}], phoneNumbers[{value}],
//           image (Buffer, JPEG)
```

Normalization:
- `apple_contact_id`: use the contact's `identifier` field (stable UUID assigned by macOS)
- `phone_numbers`: strip all non-digit characters, keep last 10 digits for matching
- `avatar_data`: `image.toString('base64')` if present, else null
- `display_name`: `${firstName} ${lastName}`.trim() || organization || nickname

Privacy: `node-mac-contacts` triggers the macOS Contacts privacy permission dialog on first access. The process must be granted access for sync to work. The agent logs a clear error if access is denied.

---

## `vcfParser.js` (cross-platform)

Parses one or more vCard records from a `.vcf` string using the `vcf` npm package.

Key field mappings:

| vCard field | Normalized field |
|---|---|
| `UID` | `apple_contact_id` (prefixed `vcf:` to avoid collisions with native IDs) |
| `FN` | `display_name` |
| `N` | `first_name`, `last_name` (split on `;`) |
| `EMAIL` (any type) | `emails[]` (lowercased) |
| `TEL` (any type) | `phone_numbers[]` (digits only, last 10) |
| `ORG` | `company` |
| `TITLE` | `job_title` |
| `PHOTO;ENCODING=b` | `avatar_data` (base64 JPEG or PNG→JPEG conversion) |

If `UID` is absent, a deterministic ID is derived from `FN + first EMAIL` to allow stable re-imports of the same file.

---

## `syncer.js` — Matching and Upsert

### Matching priority (in order, first match wins)

1. **`apple_contact_id`** — if already synced, re-match by stable ID (fast re-sync path)
2. **Phone number** — normalize both sides to last 10 digits; match against `phone_numbers` array in DB
3. **Email** — lowercase exact match against `emails` array in DB
4. **Normalized name** — exact match against `normalized_name` in DB (only used as last resort, no fuzzy matching)

### On match — enrich existing contact

Fields updated only if **not** present in `manual_overrides`:
- `company` — fill if currently null
- `job_title` — fill if currently null

Fields always merged (array union, deduped):
- `emails`
- `phone_numbers`

Fields always updated:
- `apple_contact_id` — set to stable ID for future syncs
- `avatar_data` — Apple Contacts is source of truth for photos

Fields never touched by this agent:
- `display_name`, `relationship_type`, `relationship_strength`, `summary`, `tags`, `my_role`, `is_noise`

### On no match — create new contact

```js
{
  display_name,
  normalized_name: display_name.toLowerCase().trim(),
  emails,
  phone_numbers,
  company,
  job_title,
  apple_contact_id,
  avatar_data,
  relationship_type: 'unknown',
  relationship_strength: 'weak',
  is_noise: false,
}
```

`first_interaction_at` and `last_interaction_at` are left null — they will be set when the Relationships agent finds communications for this contact.

### Sync result counters

`syncer.js` returns: `{ total, matched, created, skipped }` for logging and stats display.

---

## `index.js` — Agent Entry Point

```
On start (macOS):
  1. Run full native sync immediately
  2. Set daily interval (every 24h)
  3. Stay alive

On start (Linux / non-macOS):
  1. Log: "Native Apple Contacts sync not available on this platform."
  2. Log: "Use 'Upload VCF' on the Agents page to import contacts."
  3. Exit cleanly (exit code 0)
```

The agent does not expose its own HTTP server. All API interaction goes through `packages/ui/server.js`.

---

## Server Changes (`packages/ui/server.js`)

### AGENTS entry

```js
'apple-contacts': {
  id:          'apple-contacts',
  name:        'Apple Contacts',
  description: 'Syncs Apple Contacts into the relationships database. VCF upload available on all platforms.',
  entrypoint:  path.resolve(__dirname, '../agents/apple-contacts/index.js'),
  nativeAvailable: process.platform === 'darwin',
}
```

`nativeAvailable` is returned in `GET /api/agents` so the UI knows whether to show the native sync button.

### `POST /api/agents/apple-contacts/import`

Accepts a raw `.vcf` file upload (multipart or raw body). Parses with `vcfParser.js`, runs `syncer.js`, returns `{ total, matched, created, skipped }`.

Uses `express.raw({ type: 'text/vcard', limit: '10mb' })` or `multer` for multipart.

### `appleContactsStats()` function

```sql
SELECT
  COUNT(*) FILTER (WHERE apple_contact_id IS NOT NULL) AS total_synced,
  COUNT(*) FILTER (WHERE apple_contact_id IS NOT NULL
                     AND first_interaction_at IS NULL)  AS no_comms,
  MAX(updated_at) FILTER (WHERE apple_contact_id IS NOT NULL) AS last_sync_at
FROM relationships.contacts
```

Returned as `stats` for the `apple-contacts` agent entry in `GET /api/agents`.

---

## UI Changes (`packages/ui/app/agents/page.jsx`)

### Agent card controls

```
┌─────────────────────────────────────────────────┐
│ Apple Contacts                           [stats] │
│  Syncs Address Book into relationships           │
│                                                  │
│  [⟳ Sync Now]  ← macOS only, hidden on Linux    │
│  [↑ Upload VCF] ← always visible                │
└─────────────────────────────────────────────────┘
```

- "Sync Now" triggers `POST /api/agents/apple-contacts/start` (starts the agent process, which runs sync and exits)
- "Upload VCF" opens a `<input type="file" accept=".vcf">` → posts to `/api/agents/apple-contacts/import`
- Both show a toast with result: `"Synced 312 contacts: 204 enriched, 108 new"`

`nativeAvailable` from the agent definition controls visibility of "Sync Now".

### AgentStats for apple-contacts

```
[312 synced]  [108 no comms]  [2h ago]
```

### Relationships page — avatar photos

In the contact avatar rendering:
- If `contact.avatar_data` is present: render `<img src={\`data:image/jpeg;base64,${contact.avatar_data}\`} />`
- Otherwise: existing initials + color circle (unchanged)

The contacts API endpoint (`GET /api/relationships/contacts`) already returns contact fields; `avatar_data` is added to the SELECT.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| macOS Contacts access denied | Agent logs clear error: "Access to Contacts denied. Grant access in System Settings → Privacy → Contacts." Exits with code 1. |
| `node-mac-contacts` not built | Caught at `require()` time; agent logs and exits. VCF upload unaffected. |
| Malformed vCard field | Skip that field, continue parsing remaining contacts. Log count of skipped fields. |
| DB unavailable during sync | Throw; agent exits with code 1 and logs the error. |
| Photo > 1 MB base64 | Store it — no size cap. The avatar is served as an inline data URI so no separate file storage needed. |

---

## What Is Not In Scope

- Pushing data back to Apple Contacts (bidirectional sync)
- Contact deduplication within `relationships.contacts` (separate concern)
- Syncing Apple Contacts groups/lists
- Contact deletion (if removed from Apple Contacts, record stays in secondbrain)
- Windows support
