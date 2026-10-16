# durabot: Design Grill Log

This file records the questions, answers, and decisions from the design interview.
Each decision has a number. Later decisions can refer to earlier ones.

## Goal (from the user)

- durabot is a durable agent orchestrator. It is similar to Grok bots and Meta Muse.
- durabot runs on Pi Durable on Cloudflare Durable Objects.
- durabot sends as much work as possible to Pi. durabot is the product layer on top of Pi.
- The key features are:
  - A good UI.
  - Easy create, edit, and delete operations for bots.
  - Connections to other services, for example Gmail, Todoist, and calendars.
- durabot uses third-party solutions where possible. durabot is the glue.

## Facts about the platform

Source: [Cloudflare PiHarness docs](https://developers.cloudflare.com/agents/harnesses/pi/).

- `PiHarness` (Cloudflare Agents SDK, beta) runs Pi Durable in a Durable Object.
- Pi keeps its state in the SQLite database of the object, in `pi_*` tables.
- Pi runs the agent loop: transcript, inbox, model calls, tools, retries, and crash recovery.
- A Lifecycle alarm restarts an evicted object every 30 seconds while Pi has work.
- Input goes in with `submit` (idempotent by `operationId`), `prompt`, or `steer`.
- `session.events()` gives a snapshot and then live events. There is no resume cursor.
- Tools come from extensions on a registry. A tool with `replay: "safe"` runs again after a crash.
- The docs do not mention MCP.

Known gaps in Pi Durable today:

- No approval step for tool calls.
- Conversations cannot be deleted.
- A model stream longer than 15 minutes can stop.
- Background task completion can be up to 30 seconds late.

## Facts for D15 (one long thread)

- Pi `reset(handoff)` starts a new context with an optional handoff note. `messages()` gives only the entries after the newest reset.
- Pi has its own `compaction` setting in `Harness.open()`.
- Durable Object SQLite supports FTS5. FTS5 has a built-in `bm25()` rank function. BM25 search costs no extra service.
- For meaning-based search, Vectorize plus a Workers AI embedding model can be added later.

## Facts about Composio and the web stack

- The Composio Tool Router gives a session a small set of meta tools. The bot uses them to search for app tools and to run them. A session can be limited to a list of toolkits.
- A Tool Router session can return an OAuth link (`authorize()`) when a toolkit is not connected.
- React Router v7 framework mode is an official target of the Cloudflare Vite plugin. The Worker entry file can also export Durable Objects. The plugin does not support SPA mode or prerendering. Source: [Cloudflare blog](https://blog.cloudflare.com/introducing-the-cloudflare-vite-plugin).

## Decisions

- **D1. Users:** Only the owner uses durabot. Cloudflare Access protects the Worker. There is no sign-up, billing, or tenant isolation.
- **D2. Channels:** The durabot web UI is the only channel at first. Telegram, email, and Slack come later, if at all.
- **D3. Integrations:** Composio supplies OAuth and the tool definitions for Gmail, Todoist, calendars, and more. durabot does not store OAuth tokens.

- **D4. Proactive bots:** Bots run on cron schedules (Durable Object alarms) and on event triggers. Composio triggers (for example, a new Gmail message) call a durabot webhook. The webhook submits the event to the bot.
- **D5. Durable Object layout:** One `PiHarness` Durable Object holds one bot. The bot uses one Pi session (see D15). A D1 registry lists the bots. To delete a bot, durabot deletes all storage of its object.
- **D6. UI kit:** The chat UI uses assistant-ui with a custom runtime adapter that maps Pi events. The admin pages use shadcn/ui.
- **D7. Models:** Bots use OpenRouter. Each bot can select its model.

- **D8. Approvals:** Bots run all tools without approval, in all runs. The owner accepts the prompt-injection risk from triggers (D4).
- **D9. Bot settings:** Each bot has settings: name, avatar, persona, model, toolkits, schedules, and triggers. Chat is the primary interface for all settings (see D26). The form shows the settings and permits edits, but it is a secondary interface.
- **D10. Memory:** Each bot has a memory document in its own Durable Object. One shared "about me" document is available to all bots. The bot reads and updates memory with a tool. You can edit both documents in the UI.
- **D11. Delivery:** Each proactive run posts into the thread of its bot (see D18). Web push (PWA) sends a notice to your phone.

- **D12. Gateway:** OpenRouter traffic goes through Cloudflare AI Gateway for logs, caching, and rate limits.
- **D13. Cost limits:** The monthly credit limit on the OpenRouter key is the only cost limit. durabot has no cost code.
- **D14. Run history:** Each bot page lists its runs: start reason (chat, cron, or trigger), status, tools called, and cost.
- **D15. One long thread (user request):** Each bot looks like one long thread with you. The Pi context stays small. durabot keeps the full history in the SQLite database of the bot object. The system prompt tells the bot that it can search old history with a tool. This replaces the "thread per Pi session" part of D5.

- **D16. Context reset:** durabot calls `reset(handoff)` after a long idle gap (for example, 4 hours) or when the context is too large. The handoff has a short summary and the last few turns.
- **D17. Search:** The search tool uses SQLite FTS5 with `bm25()` ranking in the bot object. durabot adds Vectorize only if keyword search misses too much.
- **D18. Proactive runs in the thread:** A scheduled or triggered run posts into the thread of the bot with a small label, for example "from Gmail trigger". The home page is a chat list of bots with unread badges.
- **D19. Search index content:** The index holds your messages, bot replies, and one short line for each tool call. Raw tool output is not in the index. The bot can get it again from Composio.

- **D20. Tools:** Each bot gets only the Composio Tool Router meta tools as Pi tools. The router session is limited to the toolkits on the bot form.
- **D21. Builder bot:** A system bot named "Builder" runs in its own Durable Object with the same code as other bots. Its tools are `create_bot`, `delete_bot`, and `list_toolkits`. Each bot edits its own settings (see D27).
- **D22. Web stack:** React Router v7 framework mode runs in one Worker with the bot Durable Objects, D1, and the trigger webhook. Loaders and actions serve the bot list and forms. Live chat uses a WebSocket to the bot object. One `wrangler deploy` deploys all.
- **D23. Web push:** durabot is an installable PWA. The Worker sends Web Push with VAPID keys through a small library. There is no push vendor.
- **D24. Connections:** A Connections page lists the Composio toolkits and their status. "Connect" opens the hosted Composio OAuth link. If a bot needs an app that is not connected, the thread shows a "Connect" card with the link from the Tool Router.
- **D25. Account scope:** You have one Composio user id. You connect each app one time. Each bot form selects the toolkits that the bot can use.

- **D26. Chat first:** Every operation works from chat messages alone. Builder fills in the settings of a new bot from chat. The form is mainly a view.
- **D27. Self-edit:** Every bot has a `configure_self` tool. The tool changes the persona, model, toolkits, schedules, and triggers of the bot.
- **D28. Settings changes:** A settings change applies immediately, with no confirm step. The thread shows a change card, for example "Schedule added: weekdays 08:00", with an Undo button.
- **D29. Files:** One R2 bucket holds avatars and chat uploads, with the bot id as the key prefix. To delete a bot, durabot also deletes its prefix.
- **D30. Handoff summary:** One small, cheap OpenRouter model writes all handoff summaries. The reset occurs after 4 hours idle, or at 50% of the context window of the bot model. The handoff keeps the last 6 turns word for word.
- **D31. Schedules:** You write a schedule in plain words, for example "weekdays at 8am". The model converts it to cron. The form shows both. One owner time zone is in the settings. A cron library calculates the next alarm.
- **D32. Registry:** One D1 database holds the bot list, the run list (D14), and the unread counts (D18). Bot objects write rows to it.
- **D33. First slice:** The first build has these parts:
  - Builder creates a bot from chat.
  - The bot has one long thread over a WebSocket.
  - The bot uses Gmail through the Tool Router.
  - The bot can search its history.
  - The form is read-only.
  - The first build has no schedules, triggers, or web push.

## Open questions

(none: the grill is complete for the first slice)
