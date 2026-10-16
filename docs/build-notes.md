# durabot: Build Notes

These notes cover choices made while building that the grill log did not fix. Each one has a reason.
Decision numbers (Dn) refer to [grill-log.md](grill-log.md).

## Scope that was built

All of slice 1 (D33) and most of slice 2: Builder, chat-first settings with `configure_self` and Undo
cards (D26 to D28), schedules (D31), Composio triggers (D4), memory documents (D10), run list (D14),
unread badges (D18), web push (D23), the Connections page (D24), and the shared "about me" document.

Not built: chat file uploads and uploaded avatars (D29). The R2 bucket only removes a bot's files when
the bot is deleted.

## Choices

- **The thread is derived from Pi.** `thread_log` rows are written from Pi transcript entries
  (`entriesToRows`), never from the WebSocket. A run that Pi resumes after an eviction therefore still
  lands in the thread. A cursor (`last_pi_entry`) makes the sync idempotent.
- **The system prompt must stay stable.** Pi adds a `pi.system` entry for every change of the prompt,
  and a change also breaks the prompt cache of the model provider. The first version had the time to the
  second in the prompt. That added entries between two model calls of one run (found as a flaky test).
  The prompt has the date only, and the bot calls `current_time` for the time.
- **Tools are installed by bot kind after the config is known.** On a new object Pi opens before
  `initConfig`, so Builder tools are installed in `initConfig` (`installKindTools`). Dynamic install on
  an open harness works (spike point 5).
- **`setModel` takes a model object**, not `{ provider, modelId }`.
- **Builder's persona is code.** `ensureBuilder` updates an existing Builder when the persona in code
  changes. Builder cannot delete a bot of kind `builder`.
- **No reset during a run.** `maybeReset` returns when `session.busy()` is true.
- **Webhook outside Access.** `/api/webhooks/composio` cannot carry an Access token, so it bypasses
  Access and checks the Composio HMAC signature. It refuses every call when no secret is set.
- **Secure by default.** With no Access settings, the Worker serves only local requests.
- **UI components.** The components in `app/app/components/ui.tsx` are written by hand in the style of
  shadcn/ui (Tailwind 4), because the shadcn CLI is interactive. The chat uses assistant-ui with an
  external store runtime. The message list uses the custom render function of `ThreadPrimitive.Messages`.
- **Tests use a scripted model.** `MODEL_BACKEND=faux` selects the Pi `faux` provider. A message
  `TOOL:name:{json}` makes it call a tool. Everything else echoes. 41 tests, no network.
- **Types.** `wrangler types --strict-vars false` is needed, or the vars become literal types and
  `Agent<Env>` fails. `AppEnv` lists the settings that can be missing as plain strings.
- **React Router 8.4.** The `create-cloudflare` template gave version 8. Loader context uses
  `createContext` and `RouterContextProvider`.
- **Vitest.** `@cloudflare/vitest-pool-workers` was renamed to `@cloudflare/vitest-plugin`. The CommonJS
  packages `cron-parser` and `luxon` need `deps.optimizer.ssr` in the test config.
- **Vite.** `resolve.dedupe` for React and `optimizeDeps.include` for `agents/react`, or the browser
  loads two copies of React.

## Checks that were run

- 41 automated tests (unit, bot object with the scripted model, webhook signature, web push encryption).
- A real run with OpenRouter (free model) through AI Gateway and Composio: Builder created a bot; the bot
  searched Composio tools and got a real Gmail connect link; `configure_self` added a schedule; Undo
  removed it; `current_time` worked.
- The UI in a browser at desktop and phone width.
- A hard kill of the dev server in the middle of a run: the answer still landed in the thread, once.
- `npm run build` and `wrangler deploy --dry-run` (1.6 MB gzip).

## Not checked

- A deployed Worker (nothing is deployed) and Cloudflare Access.
- A live Gmail trigger, and web push delivery to a real device.
- A wake from the lifecycle alarm alone, with no request.
- A full Gmail read or send (Gmail is not connected on the Composio account).
