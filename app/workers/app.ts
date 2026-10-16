import { routeAgentRequest } from "agents";
import { createRequestHandler, RouterContextProvider } from "react-router";
import { cloudflareContext } from "./lib/context";
import { checkAccess } from "./lib/access";
import type { AppEnv } from "./lib/env";
import { handleComposioWebhook } from "./lib/webhook";

export { BotAgent } from "./bot-agent";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request: Request, env: AppEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);
    // Composio cannot send an Access token. This route checks an HMAC signature instead.
    if (url.pathname === "/api/webhooks/composio") return handleComposioWebhook(request, env);

    const denied = await checkAccess(request, env);
    if (denied) return denied;

    const agent = await routeAgentRequest(request, env as any);
    if (agent) return agent;

    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    return requestHandler(request, context);
  },
} satisfies ExportedHandler<AppEnv>;
