import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import clsx from "clsx";
import { ArrowUp, Link2, Loader2, Square, Undo2, Wrench } from "lucide-react";
import { useMemo } from "react";
import type { BotConfig, LiveTool, LogRow } from "../lib/protocol";
import type { useBot } from "../lib/use-bot";
import { Button } from "./ui";

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
}

function toUiMessages(bot: Bot): UiMsg[] {
  const list: UiMsg[] = bot.rows.map((row) => ({
    id: `row-${row.id}`,
    role: row.role === "user" && !row.label ? "user" : "assistant",
    text: row.text,
    ts: row.ts,
    row,
  }));
  for (const p of bot.pending) list.push({ id: `pending-${p.id}`, role: "user", text: p.text, ts: p.ts, pending: true });
  if (bot.live.running || bot.live.text) {
    list.push({
      id: "live",
      role: "assistant",
      text: bot.live.text,
      ts: Date.now(),
      running: true,
      tools: bot.live.tools,
    });
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

export function Chat({ bot, config }: { bot: Bot; config: BotConfig }) {
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

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col">
        <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            {bot.hasMore && (
              <button onClick={bot.loadOlder} className="mx-auto mb-2 rounded-full bg-surface-2 px-3 py-1 text-xs text-muted hover:opacity-80">
                Load earlier messages
              </button>
            )}
            {bot.loaded && bot.rows.length === 0 && bot.pending.length === 0 && (
              <div className="py-16 text-center text-muted">
                <div className="mb-2 text-4xl">{config.emoji}</div>
                <p className="font-medium text-ink">{config.name}</p>
                <p className="mt-1 text-sm">Say something to start the thread.</p>
              </div>
            )}
            <ThreadPrimitive.Messages>
              {({ message }) => <MessageView ui={(message.metadata as any)?.custom?.ui as UiMsg} bot={bot} />}
            </ThreadPrimitive.Messages>
          </div>
        </ThreadPrimitive.Viewport>
        <Composer running={bot.live.running} onStop={() => bot.send({ type: "abort" })} />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

function Composer({ running, onStop }: { running: boolean; onStop: () => void }) {
  return (
    <ComposerPrimitive.Root className="border-t border-line bg-bg px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
      <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border border-line bg-surface p-2 focus-within:border-accent">
        <ComposerPrimitive.Input
          rows={1}
          autoFocus
          placeholder="Message"
          className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-base outline-none sm:text-sm"
        />
        {running ? (
          <Button type="button" variant="outline" onClick={onStop} aria-label="Stop" className="h-9 w-9 rounded-full p-0">
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <ComposerPrimitive.Send asChild>
            <Button aria-label="Send" className="h-9 w-9 rounded-full p-0">
              <ArrowUp className="h-4 w-4" />
            </Button>
          </ComposerPrimitive.Send>
        )}
      </div>
    </ComposerPrimitive.Root>
  );
}

function MessageView({ ui, bot }: { ui: UiMsg | undefined; bot: Bot }) {
  if (!ui) return null;
  const row = ui.row;

  if (ui.running) {
    return (
      <div className="space-y-1">
        {ui.tools?.map((t) => (
          <ToolLine key={t.id} text={t.name} busy={!t.done} />
        ))}
        <Bubble role="assistant">
          {ui.text ? <Text text={ui.text} /> : <Loader2 className="h-4 w-4 animate-spin text-muted" />}
        </Bubble>
      </div>
    );
  }

  if (row?.role === "tool") {
    return (
      <div className="space-y-1.5">
        <ToolLine text={row.text} />
        {row.meta?.connect && (
          <a
            href={row.meta.connect.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl border border-accent bg-surface px-3 py-2 text-sm font-medium text-accent"
          >
            <Link2 className="h-4 w-4" />
            Connect {row.meta.connect.toolkit ?? "this app"}
          </a>
        )}
      </div>
    );
  }

  if (row?.role === "system") {
    const change = row.meta?.change;
    return (
      <div className="my-1 flex items-center justify-center gap-2 text-xs text-muted">
        <span className={clsx("rounded-full bg-surface-2 px-3 py-1", change?.undone && "line-through")}>{row.text}</span>
        {change && !change.undone && (
          <button
            onClick={() => bot.send({ type: "undo", rowId: row.id })}
            className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1 hover:bg-surface-2"
          >
            <Undo2 className="h-3 w-3" /> Undo
          </button>
        )}
      </div>
    );
  }

  if (row?.label) {
    return (
      <div className="space-y-1">
        <div className="text-center text-xs text-muted">{row.label}</div>
        <Bubble role="user" muted>
          <Text text={row.text} />
        </Bubble>
      </div>
    );
  }

  return (
    <Bubble role={ui.role} faded={ui.pending}>
      <Text text={ui.text} />
    </Bubble>
  );
}

function Bubble({
  role,
  children,
  faded,
  muted,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
  faded?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={clsx("flex", role === "user" ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed sm:text-sm",
          role === "user" ? (muted ? "bg-surface-2 text-ink" : "bg-accent text-accent-ink") : "border border-line bg-surface",
          faded && "opacity-60",
        )}
      >
        {children}
      </div>
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
        if (link) return <a key={i} href={link[2]} target="_blank" rel="noreferrer" className="underline">{link[1]}</a>;
        if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noreferrer" className="underline">{part}</a>;
        if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (/^`[^`]+`$/.test(part)) return <code key={i} className="rounded bg-surface-2 px-1">{part.slice(1, -1)}</code>;
        return part;
      })}
    </>
  );
}

function Text({ text }: { text: string }) {
  return (
    <div className="prose-chat whitespace-pre-wrap break-words">
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i}>
          <Inline text={p} />
        </p>
      ))}
    </div>
  );
}

function ToolLine({ text, busy }: { text: string; busy?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 px-1 text-xs text-muted">
      {busy ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <Wrench className="h-3 w-3 shrink-0" />}
      <span className="truncate">{text}</span>
    </div>
  );
}
