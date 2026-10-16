import { getAgentByName } from "agents";
import clsx from "clsx";
import { Check, ChevronRight, Clock, MessageSquare, Plus, TriangleAlert, X, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { data, Form, redirect, useNavigation, useSearchParams, useSubmit } from "react-router";
import { cloudflareContext } from "../../workers/lib/context";
import { getBot, getSetting, listRuns } from "../../workers/lib/registry";
import { Chat } from "../components/chat";
import { Avatar, BackButton, ConfirmSheet, LogoTile, SaveBar, Section, Segmented, Toast } from "../components/ui";
import { clockTime, dayLabel, modelShort, originOf, statusWord } from "../lib/format";
import type { RunRow } from "../lib/protocol";
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
    if (intent === "save_all") {
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
      const memory = form.get("memory");
      if (memory !== null && String(memory) !== (await stub.readMemory("bot"))) await stub.writeMemory("bot", String(memory));
    } else if (intent === "remove_schedule") await stub.configure({ remove_schedule: String(form.get("id")) });
    else if (intent === "remove_trigger") await stub.configure({ remove_trigger: String(form.get("id")) });
    else if (intent === "delete_bot" && bot.kind !== "builder") {
      await stub.destroyBot();
      return redirect("/");
    }
  } catch (e) {
    return { error: (e as Error).message };
  }
  return { ok: true };
}

const TABS = [
  { id: "chat", label: "Chat" },
  { id: "runs", label: "Runs" },
  { id: "settings", label: "Settings" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function useIsClient() {
  const [c, setC] = useState(false);
  useEffect(() => setC(true), []);
  return c;
}

const MODEL_SUGGESTIONS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-31b-it:free",
  "anthropic/claude-sonnet-5.5",
  "anthropic/claude-haiku-5.5",
  "openai/gpt-5.4",
];

export default function BotPage({ loaderData, actionData }: Route.ComponentProps) {
  const { bot } = loaderData;
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = TABS.some((t) => t.id === raw) ? (raw as Tab) : "chat";
  const [collapsed, setCollapsed] = useState(false);
  const client = useIsClient();
  const setTab = (t: Tab) => {
    setCollapsed(false);
    setParams(t === "chat" ? {} : { tab: t }, { replace: true });
  };
  const onScroll = (top: number) => setCollapsed(top > 24);

  return (
    <div className="screen">
      {tab === "chat" &&
        (client ? (
          <ChatTab id={bot.id} fallback={bot} onScroll={onScroll} />
        ) : (
          <div className="center-pg">
            <span className="spin" aria-label="Loading" />
          </div>
        ))}
      {tab === "runs" && <RunsTab runs={loaderData.runs} onScroll={onScroll} />}
      {tab === "settings" && <SettingsTab data={loaderData} error={(actionData as any)?.error} ok={!!(actionData as any)?.ok} onScroll={onScroll} />}

      <div className="edge edge-t" style={{ ["--edge-t" as string]: "calc(var(--safe-top) + 124px)" }} />
      <header className={clsx("bar", collapsed && "is-collapsed")}>
        <div className="bar-row">
          <BackButton />
          <div className="ident glass">
            <Avatar emoji={bot.emoji} kind={bot.kind} size="s" />
            <span className="ident-t">
              <b>{bot.name}</b>
              <small>{modelShort(bot.model)}</small>
            </span>
          </div>
          <span className="bar-spacer" />
        </div>
        <Segmented tabs={TABS} value={tab} onChange={setTab} />
      </header>
    </div>
  );
}

function ChatTab({ id, fallback, onScroll }: { id: string; fallback: any; onScroll: (top: number) => void }) {
  const bot = useBot(id);
  return <Chat bot={bot} config={bot.config ?? fallback} onScroll={onScroll} />;
}

// ---------------------------------------------------------------- runs

function runTitle(r: RunRow): string {
  if (r.label) {
    const o = originOf(r.label);
    return o ? o.text : r.label;
  }
  return r.source === "chat" ? "Chat message" : r.source;
}

function RunsTab({ runs, onScroll }: { runs: RunRow[]; onScroll: (top: number) => void }) {
  const groups = useMemo(() => {
    const out: { day: string; items: RunRow[] }[] = [];
    for (const r of runs) {
      const day = dayLabel(r.started_at);
      const last = out.at(-1);
      if (last && last.day === day) last.items.push(r);
      else out.push({ day, items: [r] });
    }
    return out;
  }, [runs]);

  if (!runs.length) {
    return (
      <div className="center-pg">
        <div className="empty">
          <span className="logo" style={{ width: 64, height: 64, borderRadius: 20 }}>
            <Clock className="i" width={30} height={30} strokeWidth={1.8} />
          </span>
          <h2>No runs yet</h2>
          <p>Runs from chat, schedules and triggers show up here.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="scroller" onScroll={(e) => onScroll(e.currentTarget.scrollTop)}>
      <div className="scr" style={{ ["--pt" as string]: "calc(var(--safe-top) + 130px)" }}>
        {groups.map((g) => (
          <Section key={g.day} title={g.day}>
            <div className="group">
              {g.items.map((r) => {
                const tools = JSON.parse(r.tools || "[]") as string[];
                const Src = r.source === "schedule" ? Clock : r.source === "trigger" ? Zap : MessageSquare;
                return (
                  <div className="run" key={r.id}>
                    <div className="run-top">
                      <span className="src">
                        <Src className="i" width={12} height={12} strokeWidth={2.2} />
                        {r.source === "chat" ? "Chat" : r.source === "schedule" ? "Schedule" : r.source === "trigger" ? "Trigger" : "System"}
                      </span>
                      <b>{runTitle(r)}</b>
                      <span className={clsx("st", r.status === "done" && "st-done", r.status === "error" && "st-err", r.status === "running" && "st-run")}>
                        {r.status === "running" ? (
                          <span className="spin" aria-label="Running" />
                        ) : r.status === "done" ? (
                          <Check className="i" width={13} height={13} strokeWidth={2.4} />
                        ) : (
                          <TriangleAlert className="i" width={13} height={13} strokeWidth={2} />
                        )}
                        {statusWord(r.status)}
                      </span>
                    </div>
                    <div className="run-sub">{tools.length ? [...new Set(tools)].join(" · ") : "no tools"}</div>
                    <div className="run-meta">
                      <span>{clockTime(r.started_at)}</span>
                      <span>{r.status === "running" ? "—" : `$${r.cost.toFixed(3)}`}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- settings

function SettingsTab({
  data: d,
  error,
  ok,
  onScroll,
}: {
  data: Route.ComponentProps["loaderData"];
  error?: string;
  ok: boolean;
  onScroll: (top: number) => void;
}) {
  const { bot } = d;
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== "idle";

  const initial = useMemo(
    () => ({ emoji: bot.emoji, name: bot.name, persona: bot.persona, model: bot.model, toolkits: bot.toolkits, memory: d.memory }),
    [bot.emoji, bot.name, bot.persona, bot.model, bot.toolkits.join(","), d.memory],
  );
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial]);
  const dirty =
    v.emoji !== initial.emoji ||
    v.name !== initial.name ||
    v.persona !== initial.persona ||
    v.model !== initial.model ||
    v.memory !== initial.memory ||
    v.toolkits.join(",") !== initial.toolkits.join(",");

  const [adding, setAdding] = useState(false);
  const [newApp, setNewApp] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState(0);
  const prev = useRef(nav.state);
  useEffect(() => {
    if (prev.current !== "idle" && nav.state === "idle" && ok) setToast((n) => n + 1);
    prev.current = nav.state;
  }, [nav.state, ok]);

  const addApp = () => {
    const slug = newApp.trim().toLowerCase().replace(/\s+/g, "");
    if (slug && !v.toolkits.includes(slug)) setV({ ...v, toolkits: [...v.toolkits, slug] });
    setNewApp("");
    setAdding(false);
  };

  return (
    <>
      <Form id="bot-form" method="post" />
      <div className="scroller" onScroll={(e) => onScroll(e.currentTarget.scrollTop)}>
        <div className="scr" style={{ ["--pt" as string]: "calc(var(--safe-top) + 130px)", ["--pb" as string]: "calc(var(--safe-bottom) + 110px)" }}>
          <div className="note-card">
            <MessageSquare className="i" width={20} height={20} strokeWidth={1.8} />
            <span>Chat is the main way to change a bot.</span>
          </div>
          {error && (
            <div className="banner" role="alert">
              <TriangleAlert className="i" width={20} height={20} strokeWidth={1.8} />
              <span>{error}</span>
            </div>
          )}

          <input type="hidden" name="intent" value="save_all" form="bot-form" />
          <input type="hidden" name="toolkits" value={v.toolkits.join(",")} form="bot-form" />

          <Section title="Identity">
            <div className="group">
              <div className="frow">
                <label htmlFor="f-emoji">Emoji</label>
                <input id="f-emoji" className="field v" name="emoji" form="bot-form" value={v.emoji} onChange={(e) => setV({ ...v, emoji: e.target.value })} disabled={bot.kind === "builder"} />
              </div>
              <div className="frow">
                <label htmlFor="f-name">Name</label>
                <input id="f-name" className="field v" name="name" form="bot-form" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
              </div>
            </div>
          </Section>

          <Section title="Persona">
            <div className="group">
              <textarea className="area" name="persona" form="bot-form" aria-label="Persona" value={v.persona} onChange={(e) => setV({ ...v, persona: e.target.value })} />
            </div>
          </Section>

          <Section title="Model" footer="Tap for suggestions, or type any model name.">
            <div className="group">
              <div className="frow">
                <label htmlFor="f-model">Model</label>
                <input id="f-model" className="field v" name="model" form="bot-form" list="models" value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} />
                <span className="chev">
                  <ChevronRight className="i" width={18} height={18} strokeWidth={1.8} />
                </span>
                <datalist id="models">
                  {MODEL_SUGGESTIONS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            </div>
          </Section>

          {bot.kind !== "builder" && (
            <Section title="Apps">
              <div className="group">
                <div className="item">
                  <div className="chips">
                    {v.toolkits.map((t) => (
                      <span className="chip" key={t}>
                        <LogoTile name={t} small />
                        {t}
                        <button type="button" className="chip-x" aria-label={`Remove ${t}`} onClick={() => setV({ ...v, toolkits: v.toolkits.filter((x) => x !== t) })}>
                          <X className="i" width={14} height={14} strokeWidth={2.2} />
                        </button>
                      </span>
                    ))}
                    {!adding && (
                      <button type="button" className="chip is-add" onClick={() => setAdding(true)}>
                        <Plus className="i" width={16} height={16} strokeWidth={2.2} />
                        Add
                      </button>
                    )}
                  </div>
                </div>
                {adding && (
                  <div className="frow">
                    <input
                      className="field v"
                      autoFocus
                      placeholder="App name, for example gmail"
                      value={newApp}
                      onChange={(e) => setNewApp(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addApp();
                        }
                        if (e.key === "Escape") setAdding(false);
                      }}
                    />
                    <button type="button" className="btn btn-text" onClick={addApp}>
                      Add
                    </button>
                  </div>
                )}
              </div>
            </Section>
          )}

          <Section title="Schedules">
            <div className="group">
              {bot.schedules.length === 0 && <div className="empty-note">None. Ask the bot: “check my inbox every weekday at 8am”.</div>}
              {bot.schedules.map((s) => (
                <Form method="post" className="item" key={s.id}>
                  <input type="hidden" name="intent" value="remove_schedule" />
                  <input type="hidden" name="id" value={s.id} />
                  <b>{s.text}</b>
                  <span className="cron">{s.at ? `once at ${new Date(s.at).toLocaleString()}` : s.cron}</span>
                  <p>{s.prompt}</p>
                  <button className="btn btn-destructive btn-sm" disabled={busy}>
                    Remove
                  </button>
                </Form>
              ))}
            </div>
          </Section>

          <Section title="Triggers">
            <div className="group">
              {bot.triggers.length === 0 && <div className="empty-note">None. Ask the bot: “tell me when a new email arrives from Sam”.</div>}
              {bot.triggers.map((t) => (
                <Form method="post" className="item" key={t.id}>
                  <input type="hidden" name="intent" value="remove_trigger" />
                  <input type="hidden" name="id" value={t.id} />
                  <b>{t.slug.split("_").slice(1).join(" ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) || t.slug}</b>
                  <span className="cron">{t.slug}</span>
                  <p>{t.prompt}</p>
                  <button className="btn btn-destructive btn-sm" disabled={busy}>
                    Remove
                  </button>
                </Form>
              ))}
            </div>
          </Section>

          <Section title="Memory" footer="The bot reads this in every run and can update it itself.">
            <div className="group">
              <textarea className="area" name="memory" form="bot-form" aria-label="Memory" value={v.memory} onChange={(e) => setV({ ...v, memory: e.target.value })} />
            </div>
          </Section>

          {bot.kind !== "builder" && (
            <div className="group">
              <div className="frow" style={{ justifyContent: "center" }}>
                <button type="button" className="btn btn-destructive" style={{ width: "100%" }} onClick={() => setConfirmDelete(true)}>
                  Delete this bot
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {dirty && <SaveBar form="bot-form" busy={busy} onDiscard={() => setV(initial)} />}
      <ConfirmSheet
        open={confirmDelete}
        title={`Delete ${bot.name}?`}
        text="Its thread, memory and files are removed for good."
        confirm="Delete bot"
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => submit({ intent: "delete_bot" }, { method: "post" })}
      />
      <Toast trigger={toast}>Saved</Toast>
    </>
  );
}
