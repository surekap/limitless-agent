# secondbrain User Manual

![Overview](../infographics/overview.png)

[secondbrain__Your_Intel_Layer.mp4](../infographics/secondbrain__Your_Intel_Layer.mp4)

This manual is for a person who has the software installed and wants to finish setup, connect data sources, and start using it with confidence.

Use the guides in this order:

1. [01-first-time-setup.md](./01-first-time-setup.md)
2. [02-agents-and-data-sources.md](./02-agents-and-data-sources.md)
3. [03-dashboard.md](./03-dashboard.md)
4. [04-relationships.md](./04-relationships.md)
5. [05-groups.md](./05-groups.md)
6. [06-projects.md](./06-projects.md)
7. [07-search.md](./07-search.md)
8. [08-llm-providers-and-importers.md](./08-llm-providers-and-importers.md)
9. [09-troubleshooting.md](./09-troubleshooting.md)

Advanced guides:

10. [10-daily-operating-playbook.md](./10-daily-operating-playbook.md)
11. [11-founder-workflow.md](./11-founder-workflow.md)
12. [12-investor-workflow.md](./12-investor-workflow.md)
13. [13-client-relationship-workflow.md](./13-client-relationship-workflow.md)
14. [14-meeting-prep.md](./14-meeting-prep.md)
15. [15-turning-insights-into-action.md](./15-turning-insights-into-action.md)
16. [16-privacy-trust-and-limits.md](./16-privacy-trust-and-limits.md)

## What secondbrain does

secondbrain gathers personal work signals from tools you already use, stores them in one database, and turns them into useful views:

- who matters
- which groups deserve attention
- what projects are active
- what follow-ups are overdue
- what should happen next

It is best thought of as a private intelligence layer over your communications.

## Main benefits

- You stop hunting across inboxes, transcripts, and chats.
- You get one place to review relationship health and project momentum.
- You can manually correct the system, and your corrections stay respected.
- Search can help you find meaning, not just exact words, when semantic search is enabled.

## How information flows

```text
 Gmail           Limitless           WhatsApp
   |                |                   |
   v                v                   v
 +--------------------------------------------------+
 |              Background Agents                   |
 |  Email   Limitless   Relationships   Projects    |
 +--------------------------------------------------+
                     |
                     v
 +--------------------------------------------------+
 |                  PostgreSQL                      |
 |      Raw data + profiles + insights + links      |
 +--------------------------------------------------+
                     |
                     v
 +--------------------------------------------------+
 |                    The UI                        |
 | Dashboard | Relationships | Groups | Projects   |
 | Agents    | Search                                 |
 +--------------------------------------------------+
```

## What to expect

- The app becomes useful gradually, not instantly.
- The more data sources you connect, the better the results.
- Some screens stay sparse until their agents have had time to run.
- Search needs extra setup to work well: a Gemini API key and the `vector` database extension.

## Important idea: agents do the work

secondbrain is powered by background agents. You do not usually "click run report" for every page. Instead:

```text
 You configure agent
        |
        v
 Agent gathers data on a schedule
        |
        v
 UI pages fill in over time
        |
        v
 You review, edit, and act
```

## Important idea: your edits are sticky

If you manually edit a project or contact in the UI, secondbrain stores that as a manual override. Future agent runs try not to overwrite the fields you confirmed.

That makes the system safer for real use: you can teach it instead of fighting it.
