import { Bell, Check, ChevronRight, Share, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Form, useNavigation } from "react-router";
import { cloudflareContext } from "../../workers/lib/context";
import { getSetting, setSetting, timezone } from "../../workers/lib/registry";
import { LargeTitleScreen, SaveBar, Section, Toast } from "../components/ui";
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
    return { error: `“${tz}” is not a time zone. Try Europe/Madrid.` };
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

type PushState = "checking" | "off" | "on" | "blocked" | "ios-home" | "unsupported" | "server";

function usePush(ready: boolean) {
  const [state, setState] = useState<PushState>("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone = (navigator as any).standalone === true || matchMedia("(display-mode: standalone)").matches;
      if (ios && !standalone) return setState("ios-home");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") return setState("unsupported");
      if (!ready) return setState("server");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.ready;
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [ready]);

  async function enable() {
    setError("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState("blocked");
      const { publicKey } = (await (await fetch("/api/push")).json()) as { publicKey: string };
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) as BufferSource });
      const res = await fetch("/api/push", { method: "POST", body: JSON.stringify(sub), headers: { "content-type": "application/json" } });
      if (!res.ok) throw new Error("The server did not accept this device.");
      setState("on");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function disable() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }), headers: { "content-type": "application/json" } });
      await sub.unsubscribe();
    }
    setState("off");
  }

  return { state, error, enable, disable };
}

function NotificationsCard({ ready }: { ready: boolean }) {
  const { state, error, enable, disable } = usePush(ready);
  if (state === "checking") return <div className="notif" aria-busy="true"><span className="skel" style={{ width: "60%" }} /></div>;

  const card = {
    off: { tone: "", icon: Bell, title: "Notifications", text: "Get a message when a bot finishes something on its own." },
    on: { tone: "ok", icon: Check, title: "Notifications are on", text: "This device will get a push when a schedule or trigger runs." },
    blocked: { tone: "bad", icon: X, title: "Notifications are blocked", text: "Allow notifications for durabot in your browser or system settings, then come back." },
    "ios-home": { tone: "", icon: Share, title: "Add durabot to your Home Screen", text: "On iPhone, notifications work only from the Home Screen app. Tap Share, then Add to Home Screen." },
    unsupported: { tone: "", icon: Bell, title: "Notifications are not available here", text: "This browser cannot receive push messages." },
    server: { tone: "bad", icon: X, title: "Notifications are not set up", text: "The server has no push keys yet. See the README." },
    checking: { tone: "", icon: Bell, title: "", text: "" },
  }[state];
  const Icon = card.icon;
  return (
    <div className={`notif ${card.tone}`}>
      <div className="notif-h">
        <span className="k">
          <Icon className="i" width={20} height={20} strokeWidth={1.8} />
        </span>
        <div>
          <b>{card.title}</b>
          <p>{card.text}</p>
        </div>
      </div>
      {state === "off" && (
        <button type="button" className="btn btn-primary" onClick={enable}>
          Turn on for this device
        </button>
      )}
      {state === "on" && (
        <button type="button" className="btn btn-secondary glass" onClick={disable}>
          Turn off
        </button>
      )}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const err = (actionData as any)?.error as string | undefined;
  const ok = !!(actionData as any)?.ok;
  const initial = useMemo(() => ({ tz: loaderData.timezone, about: loaderData.aboutMe }), [loaderData.timezone, loaderData.aboutMe]);
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial]);
  const dirty = v.tz !== initial.tz || v.about !== initial.about;
  const [zones, setZones] = useState<string[]>([]);
  useEffect(() => {
    try {
      setZones((Intl as any).supportedValuesOf("timeZone"));
    } catch {
      setZones([]);
    }
  }, []);
  const [toast, setToast] = useState(0);
  const prev = useRef(nav.state);
  useEffect(() => {
    if (prev.current !== "idle" && nav.state === "idle" && ok) setToast((n) => n + 1);
    prev.current = nav.state;
  }, [nav.state, ok]);

  return (
    <LargeTitleScreen
      title="Settings"
      back
      footer={
        <>
          {dirty && <SaveBar form="settings-form" busy={nav.state !== "idle"} onDiscard={() => setV(initial)} />}
          <Toast trigger={toast}>Saved</Toast>
        </>
      }
    >
      <Form id="settings-form" method="post" />
      <Section title="Time zone" footer="Schedules like “weekdays 8:00” run in this time zone.">
        <div className="group">
          <div className="frow">
            <input className="field v" name="timezone" form="settings-form" list="zones" aria-label="Time zone" value={v.tz} onChange={(e) => setV({ ...v, tz: e.target.value })} />
            <span className="chev">
              <ChevronRight className="i" width={18} height={18} strokeWidth={1.8} />
            </span>
            <datalist id="zones">
              {zones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </div>
        </div>
        {err && (
          <div className="sec-f" style={{ color: "var(--danger)" }} role="alert">
            {err}
          </div>
        )}
      </Section>
      <Section title="About me" footer="Every bot can read this.">
        <div className="group">
          <textarea className="area" name="about_me" form="settings-form" aria-label="About me" value={v.about} onChange={(e) => setV({ ...v, about: e.target.value })} />
        </div>
      </Section>
      <Section title="Notifications">
        <NotificationsCard ready={loaderData.pushReady} />
      </Section>
    </LargeTitleScreen>
  );
}
