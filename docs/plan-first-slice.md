# durabot: Plan for the First Slice

This plan builds the first slice from [grill-log.md](grill-log.md), decision D33.
Decision numbers (Dn) refer to that file.

## Goal

At the end of this slice, you can do these steps from a phone or a desktop browser:

1. Open durabot. Cloudflare Access asks you to sign in.
2. Open the Builder thread. Type "make a bot called Inbox that helps me with Gmail".
3. Builder creates the bot. The bot appears in the bot list.
4. Open the Inbox thread. Ask "what did Sam send me this week?".
5. The bot shows a "Connect Gmail" card. Connect Gmail with the Composio OAuth page.
6. Ask again. The bot reads Gmail and answers.
7. Come back the next day. The thread shows all earlier messages as one thread.
8. Ask "what did we say about Sam yesterday?". The bot searches its history and answers.
9. Ask Builder to delete the bot. The bot, its storage, and its files are gone.

## Out of scope for this slice

- Schedules, triggers, and web push (D4, D11, D23, D31).
- `configure_self` and change cards (D27, D28). The settings page is read-only.
- Memory documents (D10).
- Run list and unread badges (D14, D18).
- The Connections page (D24). The inline connect card is in scope.
- File uploads in chat (D29). Avatars are emoji at first.

## Architecture

```
Browser (React Router v7 + assistant-ui + shadcn/ui)
   |  HTTP: loaders and actions        |  WebSocket: live thread
   v                                   v
Worker (one deploy) ---- Cloudflare Access JWT check on every request
   |-- React Router request handler (SSR)
   |-- routeAgentRequest  ->  BotAgent Durable Object (one for each bot, D5)
   |                            |-- PiHarness: one Pi session (D15)
   |                            |-- durabot tables: thread log, FTS5 index, meta
   |                            |-- Pi tools: search_history, Composio meta tools
   |                            '-- Builder only: create_bot, delete_bot, list_toolkits
   |-- D1: bot registry (D32)
   '-- R2: bot files (D29, prefix only in this slice)

BotAgent -> AI Gateway -> OpenRouter (D7, D12)
BotAgent -> Composio Tool Router session (one owner user id, D20, D25)
```

### Where state lives

| Data | Store | Owner |
|---|---|---|
| Pi transcript, inbox, checkpoints | `pi_*` tables in the bot object | Pi |
| Full display thread (one long thread) | `thread_log` table in the bot object | durabot |
| Search index | `thread_fts` FTS5 table over `thread_log` | durabot |
| Last activity, context size, last reset | `bot_meta` table in the bot object | durabot |
| Bot list and settings | `bots` table in D1 | durabot |
| OAuth tokens | Composio | Composio |

The `thread_log` table is the source of truth for the UI. Pi resets do not change it.

### One long thread (D15, D16, D17, D19, D30)

- The bot object writes one `thread_log` row for each user message, each final bot reply, and each tool call. A tool call row holds a one-line summary, not the raw output.
- Before each new input, the bot object checks two conditions. The first condition is 4 hours idle. The second condition is a context size of more than 50% of the model window.
- If one condition is true, a small OpenRouter model writes a summary. Then the bot object calls `reset(handoff)`. The handoff holds the summary and the last 6 turns from `thread_log`.
- The system prompt tells the bot that it sees only recent turns. It also tells the bot to call `search_history` for older facts.
- `search_history(query, limit)` runs an FTS5 `MATCH` query, ranked by `bm25()`. It returns snippets with dates.

### WebSocket protocol (bot object to browser)

| Direction | Message | Purpose |
|---|---|---|
| server to client | `history` | The newest 50 `thread_log` rows, on connect. |
| client to server | `load_older {before}` | The next 50 older rows, when you scroll up. |
| client to server | `send {id, text}` | A new user message. `id` becomes the Pi `operationId`. |
| server to client | `pi_snapshot`, `pi_events` | Live Pi events for the current run. |
| server to client | `log_append {row}` | A new `thread_log` row after a run completes. |
| server to client | `connect_card {toolkit, url}` | The Tool Router needs an OAuth connection. |

The client merges `thread_log` rows and the live Pi run into one list. The assistant-ui `ExternalStoreRuntime` renders that list with a `convertMessage` function.

## Steps

Each step has a check. Do not start the next step until the check passes.

### Step 0: Spike the unknowns (half a day)

The Pi Durable and PiHarness APIs are beta. Prove these points in a throwaway Worker first:

1. A `PiHarness` in an `Agent` answers a prompt through OpenRouter and AI Gateway.
2. Pi events give the token count of the context. The reset rule (D30) needs this number. If Pi does not give it, estimate it from the `messages()` text length.
3. `reset(handoff)` works, and `messages()` then returns only the handoff.
4. A Composio JSON schema converts to a Pi tool with `Type.Unsafe(schema)` from TypeBox.
5. `@composio/core` runs in a Worker with `nodejs_compat`. Telemetry needs a manual flush in `ctx.waitUntil`.
6. Stop `wrangler dev` during a run, then start it again. The run continues.

**Check:** A short note in `docs/spike-notes.md` gives the result of each point. If a point fails, change this plan before step 1.

### Step 1: Scaffold the project

1. Run `npm create cloudflare@latest -- durabot --framework=react-router`.
2. Add `agents`, `@earendil-works/pi-durable`, `@earendil-works/pi-ai`, `@composio/core`, `@assistant-ui/react`, and shadcn/ui.
3. In `wrangler.jsonc`, add the `BotAgent` Durable Object (SQLite), D1, R2, the `nodejs_compat` flag, and the secrets (`OPENROUTER_API_KEY`, `COMPOSIO_API_KEY`, `AI_GATEWAY_ID`).
4. In the Worker entry, export `BotAgent`. Route `/agents/*` with `routeAgentRequest`. Send all other requests to React Router.
5. Add a Cloudflare Access JWT check for every request. Skip the check in local dev.
6. Add Vitest with `@cloudflare/vitest-pool-workers`.

**Check:** `npm run dev` shows the home page. A request without an Access JWT gets HTTP 403 in production mode.

### Step 2: BotAgent core

1. Create `BotAgent` with `PiHarness`, using the spike code. The model comes from the bot settings in D1.
2. Create the `thread_log`, `thread_fts`, and `bot_meta` tables in `onStart`.
3. Use the WebSocket protocol above. Use `submit` with the message id as `operationId`. Stream `session.events()` to all open sockets.
4. When a run completes, write the reply row and the tool summary rows to `thread_log`.

**Check:** Vitest tests send a message, get a reply, and read 2 rows in `thread_log`. A repeated `send` with the same id makes no second run.

### Step 3: Thread UI

1. Make the route `/bots/:id` with assistant-ui `Thread` and `useExternalStoreRuntime`.
2. Connect with `useAgent` from `agents/react`. Load `history` on connect. Load older rows on scroll.
3. Show tool calls as small one-line rows. Show `connect_card` as a button.
4. Make the layout work at phone width.

**Check:** In the browser pane, a message streams in. A page reload shows the same thread. A reload during a run shows the partial reply.

### Step 4: History search and reset

1. Add the `search_history` tool (FTS5 with `bm25()`).
2. Add the reset rule and the handoff summary (D16, D30).
3. Add the system prompt text about recent turns and search.

**Check:** A Vitest test writes 200 old rows, forces a reset, and asks about a fact in row 10. The bot calls `search_history` and gives the fact. The UI still shows all rows.

### Step 5: Composio Tool Router

1. Create a Tool Router session for the owner user id, limited to the toolkits of the bot.
2. Register the session meta tools as Pi tools. Set `replay: "safe"` only on search tools, not on execute tools.
3. If a tool result says that a toolkit is not connected, send `connect_card` with the `authorize()` URL.
4. Write a one-line summary row for each tool call.

**Check:** In the browser, the Inbox bot shows a connect card. After you connect Gmail, the bot lists recent emails.

### Step 6: Builder, registry, and bot list

1. Create the D1 `bots` table: `id`, `name`, `emoji`, `persona`, `model`, `toolkits`, `created_at`.
2. Builder is a `BotAgent` with the fixed id `builder` and an extra extension. Its tools are `create_bot`, `delete_bot`, and `list_toolkits`.
3. `create_bot` writes a D1 row. `delete_bot` calls `deleteAll()` on the bot object storage, deletes the R2 prefix, and deletes the D1 row.
4. Make the home route a bot list from D1. Builder is always at the top.
5. Make a read-only settings panel on `/bots/:id`.

**Check:** From chat only, Builder creates a bot and then deletes it. The bot list changes each time. After delete, the object has no `pi_*` or `thread_log` rows.

### Step 7: End-to-end check

1. Deploy with `wrangler deploy` behind Cloudflare Access.
2. Do the 9 steps in the Goal section on a phone.

**Check:** All 9 steps pass. Write each failure as an issue for slice 2.

## Risks

| Risk | Effect | Response |
|---|---|---|
| The Pi Durable API changes (beta). | Code breaks on upgrade. | Pin exact versions. Keep Pi calls in one file. |
| Pi does not give the context size. | The reset rule (D30) is not exact. | Estimate from the transcript text length. |
| The Tool Router search picks a wrong tool. | Bad answers. | Limit each session to the bot toolkits. Add pinned tools later. |
| No tool approval (D8). | An email can tell the bot to send mail. | Accepted risk. Triggers are not in this slice. |
| A `pi_events` gap after a restart (no resume cursor). | The UI misses part of a stream. | On reconnect, send `history` and a new `pi_snapshot`. |

## Slice 2 (for reference)

`configure_self` and change cards, schedules with plain-word input, Gmail triggers, web push, memory documents, the run list, unread badges, and the Connections page.
