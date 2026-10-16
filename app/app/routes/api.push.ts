import { cloudflareContext } from "../../workers/lib/context";
import { deletePushSub, savePushSub } from "../../workers/lib/registry";
import type { Route } from "./+types/api.push";

export function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  return Response.json({ publicKey: env.VAPID_PUBLIC_KEY ?? "" });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  if (request.method === "DELETE") {
    const { endpoint } = (await request.json()) as { endpoint?: string };
    if (endpoint) await deletePushSub(env, endpoint);
    return Response.json({ ok: true });
  }
  const sub = (await request.json()) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!sub.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) {
    return Response.json({ error: "Bad subscription" }, { status: 400 });
  }
  await savePushSub(env, sub as { endpoint: string });
  return Response.json({ ok: true });
}
