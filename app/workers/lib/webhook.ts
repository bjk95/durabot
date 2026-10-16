import { getAgentByName } from "agents";
import { composioClient } from "./composio";
import type { AppEnv } from "./env";
import { findTrigger } from "./registry";

/**
 * Composio trigger webhook (D4). The route is outside Cloudflare Access, so the HMAC signature
 * is required: without COMPOSIO_WEBHOOK_SECRET every call is refused.
 */
export async function handleComposioWebhook(request: Request, env: AppEnv): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!env.COMPOSIO_WEBHOOK_SECRET) return new Response("Webhook secret is not set", { status: 503 });
  let result: Awaited<ReturnType<ReturnType<typeof composioClient>["triggers"]["parse"]>>;
  try {
    result = await composioClient(env).triggers.parse(request as any, { verifySecret: env.COMPOSIO_WEBHOOK_SECRET });
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const p = result.payload as any;
  const instanceId: string = p.metadata?.id ?? p.id;
  const row = await findTrigger(env, instanceId);
  if (!row) return new Response("Unknown trigger", { status: 202 });
  const bot = await getAgentByName(env.BotAgent, row.bot_id);
  await bot.handleTrigger({ triggerId: row.trigger_id, slug: p.triggerSlug ?? row.slug, data: p.payload ?? {} });
  return new Response("OK");
}
