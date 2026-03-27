# Projects

The Projects page helps you see work as projects instead of scattered activity.

Open it at `/projects`.

## What it is for

Use this page to:

- see which projects exist
- understand health and status
- review recent communications
- review open blockers, risks, and next actions
- manually correct a project's details

## Why it matters

Work often hides inside:

- email threads
- chat messages
- voice notes
- meeting transcripts

The Projects page tries to pull that scattered activity into one project-shaped view.

## What a project can contain

A project record can hold:

- name
- description
- status
- health
- priority
- next action
- tags
- related communications
- insights

## Layout

```text
 +------------------+---------------------------+----------------------+
 | Project list     | Selected project          | Global side panel    |
 | filter/search    | comms + insights          | recent activity      |
 |                  | editable fields           | or open insights     |
 +------------------+---------------------------+----------------------+
```

## The project list

On the left you can:

- search projects by name or description
- filter by status
- pick a project to inspect

This is your index of active work.

## Project detail

When you open a project, you usually see:

- health
- status
- priority
- next action
- communication history
- project insights

## Communications tab

This tab shows communications linked to the project across sources like:

- email
- WhatsApp
- lifelogs

It is useful when you want to answer:

- what happened recently?
- why does this project look at risk?
- who is creating movement around it?

## Insights tab

This is where secondbrain turns raw activity into interpretation.

Common insight types include:

- blockers
- risks
- next actions
- decisions
- opportunities
- status updates

These are the pieces that make the page valuable beyond simple message grouping.

## The right-side panel

This panel can switch between:

- recent project activity
- open project insights

It is useful when you want to browse across all projects without opening every single one.

## Editing a project

Use the edit action when the system needs guidance.

Common manual fixes:

- renaming the project
- improving the description
- correcting status
- correcting health
- setting the next action
- adding tags

## Archived projects

You can archive a project when it should leave the active working set.

That is helpful for:

- completed work
- irrelevant detections
- one-off matters you do not want in the main list

## Important rule: project edits are sticky

Just like contact edits, project edits become manual overrides.

That means:

```text
 Agent discovers project
      |
      v
 You fix status / next action / description
      |
      v
 Future agent runs respect those locked fields
```

This keeps the system from "forgetting" what you already cleaned up.

## Understanding status vs health

These are different ideas:

- `Status` tells you the lifecycle stage
- `Health` tells you how well it is going

Example:

- a project can be `active` but `at risk`
- a project can be `on hold` but still have low urgency

## Recommended project review rhythm

```text
 Daily:
   check open insights

 Weekly:
   review active projects
   update next actions
   archive dead projects

 Monthly:
   clean names, descriptions, and tags
```

## Important limitation

The "Run Analysis" action currently reports the schedule state. If you need the freshest possible analysis immediately, restarting the Projects Agent is the practical choice.

## What success looks like

The Projects page is working well when:

- most important work appears as a recognizable project
- next actions are believable
- risks feel grounded in real communications
- you need less mental effort to remember project state
