import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  useAuiState,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import clsx from "clsx";
import { ArrowUp, Clock, Square, TriangleAlert, Undo2, Wrench, Zap } from "lucide-react";
import { useMemo } from "react";
import { appName, dayLabel, originOf, toolName, toolVerb } from "../lib/format";
import type { BotConfig, LiveTool, LogRow } from "../lib/protocol";
import type { useBot } from "../lib/use-bot";
import { Avatar, LinkIcon } from "./ui";

type Bot = ReturnType<typeof useBot>;

interface UiMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: number;
  row?: LogRow;
  running?: boolean;
  pending?: boolean;
  tools?: LiveTool[];
  /** A date divider to show above this message. */
  divider?: string;
}

function toUiMessages(bot: Bot): UiMsg[] {
  const list: UiMsg[] = [];
  let lastDay = "";
  for (const row of bot.rows) {
    const day = dayLabel(row.ts);
    list.push({
      id: `row-${row.id}`,
      role: row.role === "user" && !row.label ? "user" : "assistant",
      text: row.text,
      ts: row.ts,
      row,
      divider: day !== lastDay ? day : undefined,
    });
    lastDay = day;
  }
  for (const p of bot.pending) list.push({ id: `pending-${p.id}`, role: "user", text: p.text, ts: p.ts, pending: true });
  if (bot.live.running || bot.live.text) {
    list.push({ id: "live", role: "assistant", text: bot.live.text, ts: Date.now(), running: true, tools: bot.live.tools });
  }
  return list;
}

function convert(m: UiMsg): ThreadMessageLike {
  return {
    id: m.id,
    role: m.role,
    content: [{ type: "text", text: m.text || " " }],
    createdAt: new Date(m.ts),
    ...(m.role === "assistant" ? { status: m.running ? { type: "running" } : { type: "complete", reason: "stop" } } : {}),
    metadata: { custom: { ui: m } },
  } as ThreadMessageLike;
}

export function Chat({
  bot,
  config,
  onScroll,
}: {
  bot: Bot;
  config: BotConfig;
  onScroll?: (top: number) => void;
}) {
  const messages = useMemo(() => toUiMessages(bot), [bot.rows, bot.pending, bot.live]);
  const runtime = useExternalStoreRuntime<UiMsg>({
    messages,
    isRunning: bot.live.running || bot.pending.length > 0,
    convertMessage: convert,
    onNew: async (m) => {
      const first = m.content[0];
      if (first?.type === "text" && first.text.trim()) bot.sendText(first.text);
    },
    onCancel: async () => bot.send({ type: "abort" }),
  });
  const empty = bot.loaded && bot.rows.length === 0 && bot.pending.length === 0 && !bot.live.running;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root style={{ display: "contents" }}>
        <ThreadPrimitive.Viewport className="scroller pin-bottom" onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)}>
          <div className="thread" style={{ ["--pt" as string]: "calc(var(--safe-top) + 150px)" }}>
            {bot.hasMore && (
              <button type="button" onClick={bot.loadOlder} className="earlier glass-clear dim">
                Load earlier messages
              </button>
            )}
            <ThreadPrimitive.Messages>
              {({ message }) => <MessageView ui={(message.metadata as any)?.custom?.ui as UiMsg} bot={bot} />}
            </ThreadPrimitive.Messages>
          </div>
        </ThreadPrimitive.Viewport>
        {empty && (
          <div className="center-pg" style={{ pointerEvents: "none" }}>
            <div className="empty">
              <Avatar emoji={config.emoji} kind={config.kind} size="l" />
              <h2>{config.name}</h2>
              <p>Say something to start the thread.</p>
            </div>
          </div>
        )}
        <div className="edge edge-b" />
        <Composer name={config.name} running={bot.live.running} onStop={() => bot.send({ type: "abort" })} />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

/** The glass composer. The send button becomes Stop while the bot works. */
function Composer({ name, running, onStop }: { name: string; running: boolean; onStop: () => void }) {
  const isEmpty = useAuiState((s) => s.composer.isEmpty);
  return (
    <ComposerPrimitive.Root className="composer glass">
      <ComposerPrimitive.Input rows={1} autoFocus placeholder={running ? `${name} is working…` : `Message ${name}`} className="field" />
      {running ? (
        <button type="button" className="send is-stop" aria-label="Stop" onClick={onStop}>
          <Square className="i" width={20} height={20} fill="currentColor" strokeWidth={0} />
        </button>
      ) : (
        <ComposerPrimitive.Send asChild>
          <button type="submit" className={clsx("send", isEmpty && "is-off")} aria-label="Send" disabled={isEmpty}>
            <ArrowUp className="i" width={22} height={22} strokeWidth={2.4} />
          </button>
        </ComposerPrimitive.Send>
      )}
    </ComposerPrimitive.Root>
  );
}

function MessageView({ ui, bot }: { ui: UiMsg | undefined; bot: Bot }) {
  if (!ui) return null;
  const row = ui.row;
  const divider = ui.divider ? <div className="datediv">{ui.divider}</div> : null;

  if (ui.running) {
    return (
      <>
        {ui.tools?.map((t) => (
          <ToolLine key={t.id} name={t.name} running={!t.done} />
        ))}
        <div className="msg msg-bot">
          {ui.text && <Text text={ui.text} />}
          <span className="dots" aria-label="Working">
            <i />
            <i />
            <i />
          </span>
        </div>
      </>
    );
  }

  if (row?.role === "tool") {
    const connect = row.meta?.connect;
    return (
      <>
        {divider}
        <ToolLine name={toolName(row.text)} title={row.text} />
        {connect && (
          <div className="connect glass">
            <span className="logo" aria-hidden="true">
              <LinkIcon className="i" width={22} height={22} strokeWidth={1.8} />
            </span>
            <div className="connect-t">
              <b>Connect {appName(connect.toolkit)}</b>
              <small>Needed to finish this</small>
            </div>
            <a className="btn btn-primary" href={connect.url} target="_blank" rel="noreferrer">
              Connect
            </a>
          </div>
        )}
      </>
    );
  }

  if (row?.role === "system") {
    const change = row.meta?.change;
    if (change) {
      return (
        <>
          {divider}
          <div className={clsx("change glass", change.undone && "is-undone")}>
            <span className="change-t">{row.text}</span>
            {change.undone ? (
              <span className="undone-l">Undone</span>
            ) : (
              <button type="button" className="btn btn-text glass-clear" onClick={() => bot.send({ type: "undo", rowId: row.id })}>
                <Undo2 className="i" width={15} height={15} strokeWidth={2} /> Undo
              </button>
            )}
          </div>
        </>
      );
    }
    return (
      <>
        {divider}
        <div className="banner" role="alert">
          <TriangleAlert className="i" width={20} height={20} strokeWidth={1.8} />
          <span>{row.text}</span>
        </div>
      </>
    );
  }

  if (row?.label) {
    const origin = originOf(row.label)!;
    const Icon = origin.kind === "trigger" ? Zap : Clock;
    return (
      <>
        {divider}
        <div className="origin" title={row.text}>
          <Icon className="i" width={13} height={13} strokeWidth={2} />
          <span>
            {origin.kind === "trigger" ? "Trigger" : "Schedule"} · {origin.text}
          </span>
        </div>
      </>
    );
  }

  return (
    <>
      {divider}
      <div className={clsx("msg", ui.role === "user" ? "msg-user" : "msg-bot", ui.pending && "is-pending")}>
        <Text text={ui.text} />
      </div>
    </>
  );
}

function ToolLine({ name, running, title }: { name: string; running?: boolean; title?: string }) {
  return (
    <div className="tool" title={title}>
      {running ? <span className="spin" aria-label="Running" /> : <Wrench className="i" width={13} height={13} strokeWidth={2} />}
      <span>
        {toolVerb(name, running)} · <span className="mono">{name}</span>
      </span>
    </div>
  );
}

const INLINE = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>)]+|\*\*[^*]+\*\*|`[^`]+`)/g;

/** Links, bold, and inline code. Only http and https links become links. */
export function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(INLINE).map((part, i) => {
        const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
        if (link) return <a key={i} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
        if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noreferrer">{part}</a>;
        if (/^\*\*[^*]+\*\*$/.test(part)) return <b key={i}>{part.slice(2, -2)}</b>;
        if (/^`[^`]+`$/.test(part)) return <code key={i}>{part.slice(1, -1)}</code>;
        return part;
      })}
    </>
  );
}

function Text({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} style={{ whiteSpace: "pre-wrap" }}>
          <Inline text={p} />
        </p>
      ))}
    </>
  );
}
