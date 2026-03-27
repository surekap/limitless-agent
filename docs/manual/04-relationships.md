# Relationships

The Relationships page helps you understand people, not just messages.

Open it at `/relationships`.

## What it is for

Use this page to:

- review contact profiles
- remember who someone is
- see recent communications with that person
- add manual corrections
- request deeper research
- spot opportunities and pending follow-ups

## Why this page matters

Many systems store messages. Very few help you answer:

- Who is this person to me?
- How strong is this relationship?
- Have I dropped the ball?
- Is there an opportunity here?

That is what this page is trying to do.

## Layout

The page has three jobs happening at once:

```text
 +------------------+--------------------------+----------------------+
 | Contact list     | Contact detail           | Insights / context   |
 | search/filter    | comms, research, edits   | broader signals      |
 +------------------+--------------------------+----------------------+
```

## Contact list

On the left, you can:

- search by name
- filter by relationship type
- pick a contact to inspect

This is the fastest way to jump to a person you know you want to review.

## Contact detail

When you open a contact, you usually see:

- display name
- company
- job title
- relationship type
- relationship strength
- summary
- tags

You also get tabs for:

- `Communications`
- `Research`
- `Opportunities`

## Communications tab

This is your practical timeline with the person.

It can contain:

- WhatsApp messages
- emails
- Limitless-derived context
- media thumbnails for supported WhatsApp items

Use it before:

- replying to someone
- making an introduction
- restarting a stalled conversation
- preparing for a meeting

## Research tab

This tab is for outside context.

If the Research Agent is configured, it can gather extra information from outside providers and produce a short professional dossier.

Use the refresh action when:

- the person has changed roles
- you met someone important recently
- you want a quick brief before reaching out

## Opportunities tab

This tab highlights actionable items linked to that contact, especially:

- opportunities
- cross-source opportunities
- project matches

Think of it as the page's "why should I care right now?" section.

## Editing a contact

Use the `Edit` action when the system got something wrong or incomplete.

Typical corrections:

- proper name spelling
- correct company
- correct title
- correct relationship type
- better summary
- useful tags

## The most important rule: your edits stick

When you save a manual edit, secondbrain stores it as a manual override.

That means future agent runs try not to overwrite the fields you corrected.

```text
 Agent guesses
      |
      v
 You correct field
      |
      v
 Field becomes "sticky"
      |
      v
 Later analysis respects your correction
```

This is one of the safest and most important behaviors in the product.

## Reanalyze contact

Use reanalysis when:

- new messages changed the picture
- the summary feels stale
- the contact was badly classified the first time

Be aware:

- manual overrides still act as ground truth
- reanalysis is for improving the machine's understanding, not erasing your corrections

## Good ways to use tags

Tags work best when they help future action.

Examples:

- `investor`
- `customer`
- `warm`
- `follow-up`
- `family office`
- `recruiting`

Less helpful tags are vague labels you will never search for later.

## Recommended weekly routine

```text
 1. Open Relationships
 2. Review open insights
 3. Check strong and moderate contacts
 4. Refresh research on 2-3 important people
 5. Correct any wrong summaries or titles
 6. Act on one real opportunity
```

## Signs this page is working well

- people profiles feel recognizable
- you remember context faster
- follow-ups feel easier
- fewer important people fall through the cracks

## Signs you should intervene manually

- names are merged incorrectly
- company or role is obviously wrong
- noise contacts are cluttering the page
- summaries feel generic or misleading

When that happens, edit the contact. secondbrain is designed to learn from your corrections.
