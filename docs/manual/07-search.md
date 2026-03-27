# Search

The Search page helps you find meaning across your stored data.

Open it at `/search`.

## What it is for

Use Search when you want to find:

- a person
- a topic
- a phrase
- a project
- a relevant past communication

Unlike simple keyword search, this page is designed for semantic search when fully configured.

## What it can search

When the indexer is working, it can index content from:

- email
- WhatsApp
- lifelogs
- contacts
- relationship insights
- projects
- project insights

## What Search needs to work

Search depends on two things:

1. a Gemini API key for embeddings
2. the PostgreSQL `vector` extension

Without either one, Search may fail or remain empty.

## How search works

```text
 Your query
    |
    v
 Gemini embedding
    |
    v
 Compare against saved embeddings
    |
    v
 Return the most similar records
```

This means Search can often find relevant items even when the wording is not identical.

## The Search page layout

You will usually see:

- a search box
- source filters
- indexed totals
- indexer status
- result cards with similarity scores

## Filters

You can narrow results to a source such as:

- Email
- WhatsApp
- Lifelog
- Contact
- Insight
- Project
- Project Insight

Use filters when you already know the type of thing you want.

## Indexer status

The page also shows background indexing status.

Important facts:

- the indexer runs roughly every 10 minutes
- you can queue a manual run from the page
- indexed totals rise as new content gets embedded

## A practical way to search

```text
 Start broad
    |
    v
 Scan result types
    |
    v
 Add a source filter if needed
    |
    v
 Open the most promising result
```

## Good example searches

- someone's name
- a company name
- a product or initiative name
- a topic like `pricing`, `fundraise`, or `hiring`
- a remembered phrase from a conversation

## When Search is especially powerful

Search shines when:

- you remember the idea but not the exact wording
- the topic appeared in more than one channel
- you want to connect people, insights, and projects around the same theme

## When Search may disappoint

Search is weaker when:

- very little data has been indexed
- the embeddings key is missing
- the `vector` extension is unavailable
- the source agents have not imported enough data yet

## Interpreting similarity scores

The score is a clue, not a guarantee.

Think of it like this:

- higher score: more likely to be relevant
- lower score: still worth checking if the topic is fuzzy

Always read the actual result text before making a decision.

## Search is not your source of truth

Search is the fastest doorway, not the final answer.

Best pattern:

```text
 Search result
    |
    v
 Open related page
    |
    v
 Read the fuller context there
```

For example:

- use Search to find the right project
- then use the Projects page to understand it properly

## If Search is empty

Check:

- did you save a Gemini API key in the Embeddings panel on `/agents`?
- does your database support the `vector` extension?
- have the source agents imported content yet?
- has the indexer had time to run?

More help is in [09-troubleshooting.md](/Users/prateeksureka/Sites/secondbrain/docs/manual/09-troubleshooting.md).
