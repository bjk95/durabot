import { beforeAll, describe, expect, it, vi } from "vitest";
import { sendPush } from "../workers/lib/push";
import { savePushSub, listPushSubs, saveTrigger } from "../workers/lib/registry";
import { handleComposioWebhook } from "../workers/lib/webhook";
import { allRows, botStub, makeBot, setupDb, testEnv, until } from "./helpers";

beforeAll(setupDb);

const b64url = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf as ArrayBuffer).toString("base64url");

async function vapidKeys() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]);
  return { VAPID_PUBLIC_KEY: b64url(pub), VAPID_PRIVATE_KEY: jwk.d!, VAPID_SUBJECT: "mailto:test@example.com" };
}

async function subscription(endpoint: string) {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  return { endpoint, expirationTime: null, keys: { p256dh: b64url(raw), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) } };
}

describe("web push (D23)", () => {
  it("sends an encrypted message to every saved subscription and drops a gone one", async () => {
    const env = { ...testEnv, ...(await vapidKeys()) };
    await savePushSub(env, await subscription("https://push.example/ok"));
    await savePushSub(env, await subscription("https://push.example/gone"));
    const calls: { url: string; init: RequestInit }[] = [];
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: String(url).endsWith("/gone") ? 410 : 201 });
    });
    try {
      const sent = await sendPush(env, { title: "Bot", body: "Done", url: "/bots/x" });
      expect(sent).toBe(1);
    } finally {
      spy.mockRestore();
    }
    expect(calls).toHaveLength(2);
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get("content-encoding")).toBe("aes128gcm");
    expect(headers.get("authorization")).toMatch(/^vapid /);
    expect((await listPushSubs(env)).map((s) => s.endpoint)).toEqual(["https://push.example/ok"]);
  });

  it("sends nothing when VAPID keys are not set", async () => {
    expect(await sendPush({ ...testEnv, VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "" }, { title: "a", body: "b", url: "/" })).toBe(0);
  });
});

describe("Composio webhook (D4)", () => {
  const secret = "whsec_test_secret";

  async function signed(body: object, over: { secret?: string; id?: string } = {}) {
    const payload = JSON.stringify(body);
    const id = over.id ?? "msg_1";
    const ts = String(Math.floor(Date.now() / 1000));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(over.secret ?? secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${payload}`))).toString("base64");
    return new Request("https://durabot.example/api/webhooks/composio", {
      method: "POST",
      body: payload,
      headers: { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}`, "content-type": "application/json" },
    });
  }

  const event = (triggerId: string) => ({
    id: "evt_1",
    timestamp: new Date().toISOString(),
    type: "composio.trigger.message",
    metadata: { log_id: "l1", trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE", trigger_id: triggerId, connected_account_id: "ca_1", auth_config_id: "ac_1", user_id: "owner" },
    data: { subject: "Lunch?", from: "sam@example.com" },
  });

  it("refuses every call when no secret is set", async () => {
    const res = await handleComposioWebhook(await signed(event("t")), { ...testEnv, COMPOSIO_WEBHOOK_SECRET: "" });
    expect(res.status).toBe(503);
  });

  it("refuses a wrong signature", async () => {
    const res = await handleComposioWebhook(await signed(event("t"), { secret: "other" }), { ...testEnv, COMPOSIO_WEBHOOK_SECRET: secret });
    expect(res.status).toBe(401);
  });

  it("passes a signed event to the bot that owns the trigger", async () => {
    const { cfg, stub } = await makeBot({
      triggers: [{ id: "trg-web", slug: "GMAIL_NEW_GMAIL_MESSAGE", config: {}, prompt: "Tell me about the new email" }],
    });
    await saveTrigger(testEnv, { triggerId: "trg-web", botId: cfg.id, slug: "GMAIL_NEW_GMAIL_MESSAGE", prompt: "Tell me about the new email" });
    const res = await handleComposioWebhook(await signed(event("trg-web")), { ...testEnv, COMPOSIO_WEBHOOK_SECRET: secret });
    expect(res.status).toBe(200);
    const rows = await until(async () => {
      const r = await allRows(await botStub(cfg.id));
      return r.find((x) => x.role === "assistant") && r;
    });
    const input = rows.find((r) => r.role === "user")!;
    expect(input.label).toBe("trigger: GMAIL_NEW_GMAIL_MESSAGE");
    expect(input.text).toContain("Lunch?");
    void stub;
  });

  it("accepts but ignores an event for an unknown trigger", async () => {
    const res = await handleComposioWebhook(await signed(event("nope")), { ...testEnv, COMPOSIO_WEBHOOK_SECRET: secret });
    expect(res.status).toBe(202);
  });
});
