# LLM Providers and Importers

This guide covers the advanced setup items on the Agents page that affect how secondbrain thinks and what extra data it can store.

## Part 1: LLM Providers

The `LLM Providers` panel is the shared brain configuration area.

## Why this matters

Agents such as Limitless, Relationships, Projects, and Research need an AI provider to analyze and summarize data.

If no provider is configured, those agents may run but fail when they need reasoning.

## Supported provider types

- Anthropic
- Claude CLI
- OpenAI
- Gemini

## What you enter

For each provider, you can save:

- name
- provider type
- API key, if needed
- model name

## How per-agent priority works

After adding providers, open an agent's `LLM` tab and decide the order that agent should try them.

Example:

```text
 Projects Agent
 1. Anthropic
 2. OpenAI
 3. Gemini
```

This lets you:

- prefer your best model for the most important work
- fall back if a provider fails
- survive credit exhaustion more gracefully

## Credit exhaustion

The system can mark a provider as out of credits.

When that happens:

- the provider shows a warning
- fallback providers can still be used
- you can reset the credit flag after topping up or fixing the account

## Monthly usage

The page also shows month-to-date usage and cost.

This is useful for:

- budgeting
- spotting unexpectedly expensive agents
- deciding which provider should be first in priority

## Part 2: Embeddings

Embeddings are separate from the main LLM provider list.

They power Search.

You configure:

- Gemini API key
- embedding model

Think of it like this:

```text
 LLM Providers = reasoning
 Embeddings    = semantic memory lookup
```

## Part 3: OpenAI Importer

The OpenAI importer stores ChatGPT export files in the database.

## How to use it

On the OpenAI Importer card:

1. open the `Config` tab
2. set the export file path, or use the `Import JSON` button
3. optionally set an auto-reimport interval in minutes

The help text on the page points to the export flow:

`chatgpt.com -> Settings -> Data controls -> Export data`

After export:

- unzip the archive
- locate `conversations.json`
- point the importer at that file

## What you get

- imported conversation count
- imported message count
- stored history in the `ai` schema

## Important limitation

There is currently no dedicated front-end page for browsing those imported conversations. Today, this feature is mainly for storage and future use.

## Part 4: Gemini Importer

The Gemini importer does the same job for Google Gemini exports.

## How to use it

On the Gemini Importer card:

1. open the `Config` tab
2. set the export file path, or use the `Import JSON` button
3. optionally set an auto-reimport interval

The page points to the export source:

`takeout.google.com`, selecting `Gemini Apps`

After export:

- unzip the archive
- locate `Gemini Apps Activity.json`
- point the importer at that file

## When importers are worth the effort

Use them if you want:

- a fuller personal archive
- future analytics possibilities
- a record of your AI-assisted thinking

Skip them for now if your immediate goal is only:

- Gmail intelligence
- relationship tracking
- project tracking

## Recommended setup order

If you are not sure how to prioritize these advanced features:

```text
 1. Add one good LLM provider
 2. Set LLM priority for core agents
 3. Add embeddings for Search
 4. Only then consider AI conversation importers
```

This order gives the fastest visible value.
