import { buildPushPayload } from "@block65/webcrypto-web-push";
import type { AppEnv } from "./env";
import { deletePushSub, listPushSubs } from "./registry";

/** Send a Web Push message to every saved subscription (D23). Returns the number sent. */
export async function sendPush(
  env: AppEnv,
  msg: { title: string; body: string; url: string },
): Promise<number> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return 0;
  const vapid = {
    subject: env.VAPID_SUBJECT ?? "mailto:owner@durabot.invalid",
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  let sent = 0;
  for (const sub of await listPushSubs(env)) {
    try {
      const payload = await buildPushPayload({ data: JSON.stringify(msg), options: { ttl: 3600 } }, sub, vapid);
      const res = await fetch(sub.endpoint, payload);
      if (res.status === 404 || res.status === 410) await deletePushSub(env, sub.endpoint);
      else if (res.ok) sent++;
    } catch {
      // A bad subscription must not stop the others.
    }
  }
  return sent;
}
