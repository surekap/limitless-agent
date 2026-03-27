# Troubleshooting

This guide helps when secondbrain is installed but not behaving the way you expect.

## First principle

Most problems come from one of four places:

- missing configuration
- agent not running
- source has no data yet
- search-specific requirements are missing

Use that mental model first.

## Quick diagnosis map

```text
 Problem
   |
   +--> Page empty?
   |      |
   |      +--> Did the source agent run?
   |      +--> Did the analysis agent run?
   |
   +--> Agent failing?
   |      |
   |      +--> Check Config tab
   |      +--> Check Logs tab
   |
   +--> Search broken?
   |      |
   |      +--> Gemini key?
   |      +--> vector extension?
   |
   +--> Results look wrong?
          |
          +--> Edit record manually
          +--> Reanalyze if needed
```

## Problem: the app opens, but pages show errors

Most likely cause:

- `DATABASE_URL` is missing or incorrect

What to do:

1. check `.env.local`
2. confirm the database server is reachable
3. restart the UI

## Problem: the Agents page shows cards, but nothing fills in

Most likely causes:

- you saved config but never started the agent
- you started the analysis agent before any source data existed
- the logs contain an authentication error

What to do:

1. open the agent's `Logs` tab
2. look for authentication or startup errors
3. fix config
4. restart the agent

## Problem: Email is not syncing

Checklist:

- did you use a Gmail app password, not your normal password?
- did you save the correct Gmail address?
- did you restart the Email Agent after saving?
- is the mailbox usually `INBOX`?

If logs show repeated login failure, treat it as a credential problem first.

## Problem: Limitless is not importing

Checklist:

- is the Limitless API key present?
- did you choose a working AI provider?
- does that provider actually have access and credits?
- does the agent log show fetch errors or processing errors?

## Problem: WhatsApp data is missing

Checklist:

- is the WhatsApp Connector started?
- is `CLIENT_ID` set?
- did you complete the QR scan?
- did the connector ever reach a connected or ready state?

Also remember:

- the Groups page depends on WhatsApp data
- the Relationships page is much weaker without it

## Problem: Relationships look wrong

This is normal sometimes, especially early.

What to do:

1. edit the contact manually
2. save the correct company, title, tags, or summary
3. reanalyze only if you want the AI summary refreshed around your manual facts

Manual edits are the intended solution, not a failure.

## Problem: Projects look wrong

Common fixes:

- rename the project
- correct status or health
- set the next action
- archive obvious false positives

Again, manual correction is part of the product's design.

## Problem: the Run Analysis action did not seem to do much

For Projects and Relationships, the visible run action mainly reflects scheduled behavior.

If you want a fresh run immediately:

1. stop the agent
2. start it again

That is the practical manual rerun.

## Problem: Search is empty or broken

Search has extra requirements beyond the rest of the system.

Check all of these:

- Gemini API key saved in the Embeddings panel
- `vector` extension installed in Postgres
- data sources already imported some content
- indexer had time to run

If counts stay at zero, the indexer has nothing usable yet or cannot embed.

## Problem: imported OpenAI or Gemini conversations are not visible in the UI

This is expected today.

The importers store conversation history and show import statistics, but there is not yet a dedicated browsing screen for those imported chats.

## Problem: provider says "credits exhausted"

What it means:

- the provider has been marked as unusable for now

What to do:

1. fix the real billing or quota problem
2. use another provider in the meantime
3. reset the provider status from the Agents page when appropriate

## Daily care tips

- keep at least one working LLM provider configured
- review logs when something feels off
- use manual edits to improve quality
- archive dead projects
- dismiss or resolve stale insights

## A sensible recovery sequence

If the whole system feels off, do this:

```text
 1. Confirm database connection
 2. Confirm one LLM provider works
 3. Confirm Email or Limitless is importing data
 4. Restart Relationships and Projects
 5. Check Dashboard
 6. Check Search last
```

## When to wait instead of fixing

Sometimes the right move is patience.

Wait a little when:

- you just connected a new source
- an agent only recently started
- Search indexing has not had time to run
- the app is still on its first real ingestion cycle

secondbrain improves over time, so "not enough data yet" is a real state, not always an error.
