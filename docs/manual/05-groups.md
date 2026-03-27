# Groups

The Groups page turns WhatsApp groups into something you can actually understand.

Open it at `/groups`.

## What it is for

Use this page to answer questions like:

- What kind of group is this?
- What role do I play in it?
- What topics dominate it?
- Is there an opportunity hiding in this group?

## What powers this page

This page depends on WhatsApp data being available.

If the WhatsApp Connector is not running, or no WhatsApp messages have been saved, this page will stay sparse or empty.

## What kinds of groups it recognizes

The system tries to classify groups into categories such as:

- Board / Peers
- Management
- Employees
- Community
- Unknown

These are meant to help you think about the social function of the group, not just its name.

## What "my role" means

secondbrain also tries to infer your role in the group, for example:

- active leader
- active participant
- occasional contributor
- status receiver
- passive observer

That matters because the same unread group means different things depending on your role.

## Layout

```text
 +------------------+-----------------------------+------------------+
 | Group list       | Group detail                | Stats/context    |
 | search/filter    | summary, opportunities,     | message volume   |
 |                  | notable contacts, messages  | role, recency    |
 +------------------+-----------------------------+------------------+
```

## Summary tab

This is the main intelligence view for a group.

It may include:

- a plain-language summary of what the group is
- communication advice
- key topics

The communication advice is especially useful because it answers:

"How should I behave in this room?"

## Opportunities tab

This tab surfaces possible openings from the group.

Examples of what it tries to catch:

- a person worth following up with
- a topic worth engaging on
- a practical next step hidden in casual chat

Use it as a prompt for judgment, not as automatic truth.

## Contacts tab

This shows notable contacts associated with the group.

That is useful when:

- the group is noisy
- you care about only a few people in it
- you need to remember who matters inside the conversation

## Messages tab

This gives you a message-level view of recent group activity.

Use it when:

- the summary seems surprising
- you want to sanity-check what the AI inferred
- you need direct context before acting

## Reading the page well

A good way to use Groups is:

```text
 Open group
    |
    v
 Read summary
    |
    v
 Read communication advice
    |
    v
 Check opportunities
    |
    v
 Open messages if you need proof or nuance
```

## Why this page is useful in real life

WhatsApp groups are often where:

- social signals appear early
- decisions happen informally
- opportunities are hinted at, not announced
- your attention gets fragmented

The Groups page helps turn that noise into a readable structure.

## When the page says a group is "not yet analyzed"

That usually means:

- the Relationships Agent has not processed the group yet
- there is not enough WhatsApp data yet
- the connector is not active

Give it time after setup, or restart the relevant agents if needed.

## Good habits

- review your most important groups weekly
- use communication advice before replying in sensitive groups
- do not treat every opportunity as real without checking messages
- pay special attention to groups where you are an active leader

## What this page is not

This page is not a WhatsApp replacement.

It is a decision-support view:

```text
 WhatsApp app = conversation
 Groups page  = interpretation
```
