import { getAgentByName } from "agents";
import { useEffect, useState } from "react";
import { data, Form, Link, redirect, useNavigation, useSearchParams } from "react-router";
import { cloudflareContext } from "../../workers/lib/context";
import { getBot, getSetting, listRuns } from "../../workers/lib/registry";
import { Chat } from "../components/chat";
import { Badge, Button, Card, Field, Input, Textarea, timeAgo } from "../components/ui";
import { useBot } from "../lib/use-bot";
import type { Route } from "./+types/bot";

export async function loader({ params, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const bot = await getBot(env, params.id);
  if (!bot) throw data("No such bot", { status: 404 });
  const stub = await getAgentByName(env.BotAgent, params.id);
  return {
    bot,
    runs: await listRuns(env, params.id),
    memory: await stub.readMemory("bot"),
    shared: (await getSetting(env, "about_me")) ?? "",
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const stub = await getAgentByName(env.BotAgent, params.id);
  const bot = await getBot(env, params.id);
  if (!bot) throw data("No such bot", { status: 404 });
  try {
    if (intent === "save_settings") {
      const patch: Record<string, unknown> = {};
      for (const k of ["name", "emoji", "persona", "model"] as const) {
        const v = String(form.get(k) ?? "").trim();
        if (v && v !== bot[k]) patch[k] = v;
      }
      const tk = String(form.get("toolkits") ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (tk.join(",") !== bot.toolkits.join(",")) patch.toolkits = tk;
      if (Object.keys(patch).length) {
        const r = await stub.configure(patch);
        if (!r.ok) return { error: r.message };
      }
    } else if (intent === "remove_schedule") await stub.configure({ remove_schedule: String(form.get("id")) });
    else if (intent === "remove_trigger") await stub.configure({ remove_trigger: String(form.get("id")) });
    else if (intent === "save_memory") await stub.writeMemory("bot", String(form.get("memory") ?? ""));
    else if (intent === "delete_bot" && bot.kind !== "builder") {
      await stub.destroyBot();
      return redirect("/");
    }
  } catch (e) {
    return { error: (e as Error).message };
  }
  return { ok: true };
}

function useIsClient() {
  const [c, setC] = useState(false);
  useEffect(() => setC(true), []);
  return c;
}

const TABS = ["chat", "runs", "settings"] as const;

export default function BotPage({ loaderData, actionData }: Route.ComponentProps) {
  const { bot } = loaderData;
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? params.get("tab")! : "chat";
  const client = useIsClient();

  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col">
      <header className="flex items-center gap-3 border-b border-line px-3 py-2.5">
        <Link to="/" aria-label="Back" className="rounded-lg px-2 py-1 text-lg text-muted hover:bg-surface-2">
          ‹
        </Link>
        <span className="text-2xl">{bot.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium leading-tight">{bot.name}</div>
          <div className="truncate text-xs text-muted">{bot.model}</div>
        </div>
        <nav className="flex gap-1 rounded-lg bg-surface-2 p-1 text-sm">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setParams(t === "chat" ? {} : { tab: t }, { replace: true })}
              className={`rounded-md px-3 py-1 capitalize ${tab === t ? "bg-surface font-medium shadow-sm" : "text-muted"}`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      <div className="min-h-0 flex-1">
        {tab === "chat" && (client ? <ChatTab id={bot.id} fallback={bot} /> : <div className="p-6 text-muted">Loading…</div>)}
        {tab === "runs" && <RunsTab runs={loaderData.runs} />}
        {tab === "settings" && <SettingsTab data={loaderData} error={(actionData as any)?.error} />}
      </div>
    </div>
  );
}

function ChatTab({ id, fallback }: { id: string; fallback: any }) {
  const bot = useBot(id);
  return <Chat bot={bot} config={bot.config ?? fallback} />;
}

function RunsTab({ runs }: { runs: Route.ComponentProps["loaderData"]["runs"] }) {
  if (!runs.length) return <p className="p-6 text-sm text-muted">No runs yet.</p>;
  return (
    <div className="h-full overflow-y-auto p-4">
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface text-sm">
        {runs.map((r) => {
          const tools = JSON.parse(r.tools || "[]") as string[];
          return (
            <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge tone={r.source === "chat" ? "muted" : "accent"}>{r.source}</Badge>
                  <span className="truncate text-muted">{r.label ?? ""}</span>
                </div>
                <div className="mt-1 truncate text-xs text-muted">{tools.length ? tools.join(", ") : "no tools"}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className={r.status === "error" ? "text-danger" : ""}>{r.status}</div>
                <div className="text-xs text-muted">
                  {timeAgo(r.started_at)} · ${r.cost.toFixed(4)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SettingsTab({ data, error }: { data: Route.ComponentProps["loaderData"]; error?: string }) {
  const { bot } = data;
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <p className="text-sm text-muted">
        Chat is the main way to change a bot: tell it what you want. This page shows the current settings.
      </p>
      {error && <p className="rounded-lg border border-danger p-3 text-sm text-danger">{error}</p>}

      <Card>
        <Form method="post" className="space-y-3">
          <input type="hidden" name="intent" value="save_settings" />
          <div className="grid grid-cols-[5rem_1fr] gap-3">
            <Field label="Emoji">
              <Input name="emoji" defaultValue={bot.emoji} />
            </Field>
            <Field label="Name">
              <Input name="name" defaultValue={bot.name} />
            </Field>
          </div>
          <Field label="Persona">
            <Textarea name="persona" rows={6} defaultValue={bot.persona} />
          </Field>
          <Field label="Model" hint="An OpenRouter model id.">
            <Input name="model" defaultValue={bot.model} />
          </Field>
          <Field label="Apps" hint="Composio toolkit slugs, separated by commas. Connect them on the Connections page.">
            <Input name="toolkits" defaultValue={bot.toolkits.join(", ")} />
          </Field>
          <Button disabled={busy}>Save</Button>
        </Form>
      </Card>

      <Card className="space-y-2">
        <h3 className="font-medium">Schedules</h3>
        {bot.schedules.length === 0 && <p className="text-sm text-muted">None. Ask the bot: "check my inbox every weekday at 8am".</p>}
        {bot.schedules.map((s) => (
          <Form method="post" key={s.id} className="flex items-center justify-between gap-3 text-sm">
            <input type="hidden" name="intent" value="remove_schedule" />
            <input type="hidden" name="id" value={s.id} />
            <span className="min-w-0">
              <span className="block truncate">{s.text}</span>
              <span className="block truncate text-xs text-muted">
                <code>{s.cron}</code> · {s.prompt}
              </span>
            </span>
            <Button variant="outline" disabled={busy}>
              Remove
            </Button>
          </Form>
        ))}
      </Card>

      <Card className="space-y-2">
        <h3 className="font-medium">Triggers</h3>
        {bot.triggers.length === 0 && <p className="text-sm text-muted">None. Ask the bot: "tell me when a new email arrives from Sam".</p>}
        {bot.triggers.map((t) => (
          <Form method="post" key={t.id} className="flex items-center justify-between gap-3 text-sm">
            <input type="hidden" name="intent" value="remove_trigger" />
            <input type="hidden" name="id" value={t.id} />
            <span className="min-w-0">
              <span className="block truncate">
                <code>{t.slug}</code>
              </span>
              <span className="block truncate text-xs text-muted">{t.prompt}</span>
            </span>
            <Button variant="outline" disabled={busy}>
              Remove
            </Button>
          </Form>
        ))}
      </Card>

      <Card>
        <Form method="post" className="space-y-3">
          <input type="hidden" name="intent" value="save_memory" />
          <Field label="Memory of this bot" hint="The bot reads this in every run and can update it itself.">
            <Textarea name="memory" rows={6} defaultValue={data.memory} />
          </Field>
          <Button variant="outline" disabled={busy}>
            Save memory
          </Button>
        </Form>
      </Card>

      {bot.kind !== "builder" && (
        <Card>
          <Form
            method="post"
            onSubmit={(e) => {
              if (!confirm(`Delete ${bot.name} and all of its history?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="intent" value="delete_bot" />
            <Button variant="danger" disabled={busy}>
              Delete this bot
            </Button>
          </Form>
        </Card>
      )}
    </div>
  );
}
