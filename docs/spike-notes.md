# durabot: Spike Notes (Step 0)

This file gives the results of step 0 in [plan-first-slice.md](plan-first-slice.md).
The spike code is in `spike/`. It ran with `wrangler dev` (local mode) and a free OpenRouter model.
Versions: `agents` 0.28.1, `@earendil-works/pi-durable` 1.3.0, `@earendil-works/pi-ai` 1.3.0, `@composio/core` 0.25.0.

## Results

| # | Point | Result |
|---|---|---|
| 1 | `PiHarness` answers a prompt through OpenRouter | Pass, with a note on the gateway (see below). |
| 2 | Pi gives the context size | Pass. Each assistant entry has `usage`. |
| 3 | `reset(handoff)` works | Pass. |
| 4 | A JSON Schema converts to a Pi tool | Pass. |
| 5 | Composio runs in a Worker | Pass. |
| 6 | A run continues after a hard stop | Pass in local mode. One caveat. |

## Details

### 1. PiHarness with OpenRouter

- The model call works. Pi called the `echo` tool and answered.
- The free models are in the catalog of pi-ai. Use `openrouterProvider().getModels()` and pick one by id.
- The OpenRouter provider reads `OPENROUTER_API_KEY` from `process.env`. In a Worker this needs the flags `nodejs_compat` and `nodejs_compat_populate_process_env`.
- `defaults.model` must be a model object, not a string.
- The Cloudflare docs show a tool result with `content`. The 1.3.0 type uses `output`. Return `{ output: [{ type: "text", text }] }`.
- **AI Gateway (D12) is not tested.** The `createAI` helper of `agents` sends vendor models through AI Gateway. The gateway holds the key (BYOK). A Worker with the `AI` binding runs in remote mode, and remote mode needs a workers.dev subdomain on the account. The account has none yet.
- Two ways to reach D12 remain:
  1. Use `createAI` and store the OpenRouter key on the gateway.
  2. Set the `baseUrl` of the OpenRouter provider to `https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/openrouter`.
- Decision needed before step 2. Option 2 is smaller, and it keeps the Pi OpenRouter provider. Test it first.

### 2. Context size

- Each `pi.assistant` entry in `messages()` has `usage` with `input`, `output`, and `totalTokens`.
- Rule for D30: the context size is `usage.totalTokens` of the newest assistant entry.
- The window of the model is in the model object (`contextWindow`).

### 3. Reset

- `session.reset(note)` leaves one `pi.reset` entry. Its content is the note as a user message.
- The bot answered a question about the earlier chat from the note alone.
- `messages()` returns only the entries after the reset. The `thread_log` table in the plan stays the only full record.

### 4. JSON Schema tools

- `Type.Unsafe(jsonSchema)` from `@earendil-works/pi-ai` works as `parameters`.
- The model called `GMAIL_FETCH_EMAILS` with valid arguments. Pi passed them to `execute`.

### 5. Composio

- Use a project API key. It starts with `ak_`. Two keys that start with `ck_` gave HTTP 401.
- `composio.create("owner", { toolkits: ["gmail"] })` works in a Worker.
- `session.tools()` returns 6 meta tools in OpenAI function format:
  `COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_GET_TOOL_SCHEMAS`, `COMPOSIO_MANAGE_CONNECTIONS`, `COMPOSIO_MULTI_EXECUTE_TOOL`, `COMPOSIO_REMOTE_BASH_TOOL`, and `COMPOSIO_REMOTE_WORKBENCH`.
- The spike registered the first four as Pi tools. Each `execute` calls `session.executeMeta(name, args)`. The remote bash and workbench tools are left out.
- The bot called `COMPOSIO_SEARCH_TOOLS` and answered `GMAIL_SEND_EMAIL`.
- `session.toolkits()` gives the connection status. Gmail showed `isActive: false`.
- `session.authorize("gmail")` gives a connect link (`redirectUrl`). The Connect card in D24 can use it.
- Not tested: the telemetry flush in `ctx.waitUntil`, and a real Gmail connection and send.

### 6. Hard stop and recovery

- Test: submit a prompt that calls a 25-second tool. Stop the server with `SIGKILL` while the tool runs. Start the server again.
- Result: the run continued. The `replay: "safe"` tool ran again (`durationMs` 25002) and returned. The next prompt in the queue then started.
- **Caveat:** requests to the object (`/dump`) came in after the restart. A request also wakes the object. The test did not prove that the lifecycle alarm alone wakes it. Test this again after the first deploy, with no requests.
- The first test script reported success too early, because it matched a word in the prompt text. The result above comes from the transcript.

## AI Gateway attempt (D12, option 2)

- The subdomain `durabot.workers.dev` is registered through the API.
- The `wrangler login` token has no AI Gateway permission. `POST /ai-gateway/gateways` gives "Authentication error". A request to `gateway.ai.cloudflare.com/.../durabot/openrouter` gives HTTP 401, with the same result for a gateway name that does not exist. The gateway is not created on first use.
- Next: create the gateway `durabot` in the dashboard (AI, AI Gateway, Create Gateway). Then repeat the request. If the gateway has authentication on, an API token with "AI Gateway: Run" is also needed (header `cf-aig-authorization`).

## Other facts

- A free model takes 20 to 100 seconds for one call. Free models also have daily request limits. Use a paid model for UI work.
- `wrangler login` works. The account has no Workers and no D1 databases. R2 is enabled.
- `tsc` finds a deep-type error when a Durable Object RPC method returns a Pi type. Return `Promise<unknown>` and `JSON.parse(JSON.stringify(x))` at that edge.

## Changes to the plan

1. Step 2: Wait for the result of the AI Gateway test (D12) before step 2 starts.
2. Step 5: Register four Composio meta tools. Leave out the remote bash and workbench tools.
3. Step 5: Mark `COMPOSIO_SEARCH_TOOLS` and `COMPOSIO_GET_TOOL_SCHEMAS` as `replay: "safe"`. Mark the other two as `"unsafe"`.
4. Step 7: Test eviction recovery on the deployed Worker with no requests during the run.
5. Step 1: The workers.dev subdomain `durabot` is registered (done).
