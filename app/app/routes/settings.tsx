import { useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { cloudflareContext } from "../../workers/lib/context";
import { getSetting, setSetting, timezone } from "../../workers/lib/registry";
import { Button, Card, Field, Input, Textarea } from "../components/ui";
import type { Route } from "./+types/settings";

export async function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  return {
    timezone: await timezone(env),
    aboutMe: (await getSetting(env, "about_me")) ?? "",
    pushReady: !!env.VAPID_PUBLIC_KEY,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const form = await request.formData();
  const tz = String(form.get("timezone") ?? "").trim();
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    return { error: `"${tz}" is not a valid time zone, for example Europe/Madrid.` };
  }
  await setSetting(env, "timezone", tz);
  await setSetting(env, "about_me", String(form.get("about_me") ?? "").slice(0, 8000));
  return { ok: true };
}

function b64ToBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function PushCard({ ready }: { ready: boolean }) {
  const [status, setStatus] = useState("");
  async function enable() {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("This browser has no push support. On iPhone, add durabot to the Home Screen first.");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Notifications are blocked.");
      const { publicKey } = await (await fetch("/api/push")).json<{ publicKey: string }>();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) as BufferSource });
      const res = await fetch("/api/push", { method: "POST", body: JSON.stringify(sub), headers: { "content-type": "application/json" } });
      if (!res.ok) throw new Error("The server did not accept the subscription.");
      setStatus("Notifications are on for this device.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }
  return (
    <Card className="space-y-2">
      <h3 className="font-medium">Notifications</h3>
      <p className="text-sm text-muted">Get a push message when a scheduled run or a trigger posts in a bot's thread.</p>
      {!ready && <p className="text-sm text-danger">VAPID keys are not set on the server.</p>}
      <Button type="button" variant="outline" onClick={enable} disabled={!ready}>
        Turn on for this device
      </Button>
      {status && <p className="text-sm">{status}</p>}
    </Card>
  );
}

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const err = (actionData as any)?.error as string | undefined;
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 pb-10 pt-6">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-lg text-muted">
          ‹
        </Link>
        <h1 className="text-xl font-semibold">Settings</h1>
      </header>
      <Card>
        <Form method="post" className="space-y-3">
          <Field label="Your time zone" hint="Schedules run in this time zone. Example: Europe/Madrid.">
            <Input name="timezone" defaultValue={loaderData.timezone} />
          </Field>
          <Field label="About me (shared memory)" hint="Every bot reads this. Bots can update it too.">
            <Textarea name="about_me" rows={8} defaultValue={loaderData.aboutMe} />
          </Field>
          {err && <p className="text-sm text-danger">{err}</p>}
          <Button disabled={nav.state !== "idle"}>Save</Button>
        </Form>
      </Card>
      <PushCard ready={loaderData.pushReady} />
    </main>
  );
}
