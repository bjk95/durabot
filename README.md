# durabot

A personal bot orchestrator. You make bots by chatting, each bot lives in one long thread with you,
and bots can use your Gmail, Calendar, Todoist and other apps. durabot is the product layer on top of
[Pi Durable](https://developers.cloudflare.com/agents/harnesses/pi/) running in Cloudflare Durable Objects.
Pi runs the agent loop. Composio handles app sign-in and tools. durabot is the glue.

The design decisions (D1 to D33) are in [docs/grill-log.md](docs/grill-log.md).
The spike that proved the platform is in [docs/spike-notes.md](docs/spike-notes.md).

## What you can do

- **Create a bot by chat.** Open Builder and describe the bot. Builder creates it.
- **Talk to a bot in one long thread.** The thread never splits. Pi keeps only a small recent context.
  The bot searches older turns (SQLite FTS5, BM25) when it needs them.
- **Change a bot by chat.** Tell the bot "check my inbox every weekday at 8am". It changes its own
  persona, model, apps, schedules, and triggers. Each change shows a card with an Undo button.
- **Use your apps.** Connect Gmail, Google Calendar, Todoist, and more on the Connections page
  (Composio). Bots use them through the Composio Tool Router.
- **Proactive runs.** Schedules (Durable Object alarms, in your time zone) and Composio triggers post
  into the bot thread. You get a web push message and an unread badge.
- **See the settings.** A read-friendly settings view, run list (source, status, tools, cost), and
  memory documents for each bot, plus a shared "about me" document.

## How it works

```
Browser (React Router 8, assistant-ui)       Composio  (OAuth, tools, triggers)
   | HTTP loaders/actions   | WebSocket            ^   |
   v                        v                      |   | webhook (HMAC)
Worker  --- Cloudflare Access JWT check ---------- |   v
   |-- React Router handler
   |-- /agents/bot-agent/<id>  -> BotAgent (one Durable Object per bot)
   |                                |- PiHarness: one Pi session   |- thread_log + FTS5 index
   |                                |- tools: search_history, memory, configure_self,
   |                                |         Composio meta tools (Builder: create_bot, delete_bot, ...)
   |-- D1: bot registry, run list, settings, push subscriptions, trigger map
   '-- R2: bot files (deleted with the bot)
BotAgent -> AI Gateway -> OpenRouter
```

Key files:

| File | Purpose |
|---|---|
| `app/workers/bot-agent.ts` | The bot: Pi session, thread log, reset with handoff, tools, schedules, WebSocket |
| `app/workers/lib/thread.ts` | Thread log, FTS5 search, Pi entries to display rows |
| `app/workers/lib/composio.ts` | Tool Router session, meta tools as Pi tools, connect links |
| `app/workers/lib/models.ts` | OpenRouter through AI Gateway (and a scripted model for tests) |
| `app/workers/lib/webhook.ts` | Composio trigger webhook with signature check |
| `app/workers/app.ts` | Worker entry: Access check, agent routing, React Router |
| `app/app/routes/*` | Home, bot page, Connections, Settings |
| `app/app/components/chat.tsx` | Chat UI on assistant-ui |

## Run it locally

```sh
cd app
npm install
cp .dev.vars.example .dev.vars      # fill in the keys
node scripts/gen-vapid.mjs          # add the three VAPID lines to .dev.vars
npm run db:migrate                  # local D1
npm run dev                         # http://localhost:5173
npm test                            # 40 tests, scripted model, no network
```

Local requests skip Cloudflare Access. Any other host is refused until Access is set up (see below).

## Deploy

durabot is built for one owner behind Cloudflare Access. It is not deployed by default.

1. **AI Gateway.** Create a gateway named `durabot` and a token for it. Put the account id in
   `GATEWAY_BASE` in `app/wrangler.jsonc` if it is not yours.
2. **D1 and R2.** `npx wrangler d1 create durabot`, add the id to `wrangler.jsonc`, then
   `npm run db:migrate:remote`. `npx wrangler r2 bucket create durabot-files`.
3. **Secrets.** `npx wrangler secret put` for `OPENROUTER_API_KEY`, `COMPOSIO_API_KEY`, `CF_AIG_TOKEN`,
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `COMPOSIO_WEBHOOK_SECRET`.
   Set a monthly credit limit on the OpenRouter key: it is the only cost limit (D13).
4. **Access.** Create an Access application for the Worker URL with a policy for your email.
   Add a *Bypass* policy for the path `/api/webhooks/composio` (Composio cannot send a token; the route
   checks an HMAC signature instead). Set the variables `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`.
   **Without them the deployed Worker answers 403 to every request.**
5. `npm run deploy`.
6. **Composio webhook.** In the Composio project settings, set the webhook URL to
   `https://<your-worker>/api/webhooks/composio` and copy the signing secret into step 3.
7. Open the app, set your time zone in Settings, and install it to the Home Screen to get push messages.

## Limits you should know

- Pi Durable is beta. Versions are pinned. Pi has no tool approval step (D8): a bot runs every tool it
  has. Text in a trigger event (for example an email) can try to steer the bot. The system prompt tells
  the bot to treat event data as data, but this is not a guarantee.
- Free OpenRouter models are slow and limited. Set a better model per bot (chat: "use model ...").
- Chat file uploads and uploaded avatars are not built (D29). Bots use an emoji. The R2 bucket is used
  only to clean up files when a bot is deleted.
- Trigger creation and the webhook are tested with signed test events, not with a live Gmail trigger.
- A run that was in flight when the object stopped resumes from Pi's checkpoint. This was tested with a
  hard kill of the local dev server. It was not tested on a deployed Worker with no requests in between.
