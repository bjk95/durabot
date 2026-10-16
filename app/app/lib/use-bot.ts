import { useAgent } from "agents/react";
import { useCallback, useReducer, useRef } from "react";
import { EMPTY_LIVE, type BotConfig, type ClientMessage, type Live, type LogRow, type ServerMessage } from "./protocol";

export interface Pending {
  id: string;
  text: string;
  ts: number;
}

export interface BotState {
  loaded: boolean;
  rows: LogRow[];
  hasMore: boolean;
  config: BotConfig | null;
  live: Live;
  pending: Pending[];
}

type Action =
  | { type: "server"; msg: ServerMessage }
  | { type: "pending"; pending: Pending };

export const INIT: BotState = { loaded: false, rows: [], hasMore: false, config: null, live: EMPTY_LIVE, pending: [] };

function merge(rows: LogRow[], extra: LogRow[]): LogRow[] {
  const seen = new Set(rows.map((r) => r.id));
  return [...rows, ...extra.filter((r) => !seen.has(r.id))].sort((a, b) => a.id - b.id);
}

/** Remove one optimistic message for each owner row that arrives. */
function settle(pending: Pending[], rows: LogRow[]): Pending[] {
  let left = pending;
  for (const r of rows) {
    if (r.role !== "user" || r.label) continue;
    const i = left.findIndex((p) => p.text === r.text);
    if (i >= 0) left = [...left.slice(0, i), ...left.slice(i + 1)];
  }
  return left;
}

export function reducer(s: BotState, a: Action): BotState {
  if (a.type === "pending") return { ...s, pending: [...s.pending, a.pending] };
  const m = a.msg;
  switch (m.type) {
    case "history":
      return {
        loaded: true,
        rows: m.rows,
        hasMore: m.hasMore,
        config: m.config,
        live: m.live,
        pending: settle(s.pending, m.rows),
      };
    case "older":
      return { ...s, rows: merge(s.rows, m.rows), hasMore: m.hasMore };
    case "log_append":
      return { ...s, rows: merge(s.rows, m.rows), pending: settle(s.pending, m.rows) };
    case "row_update":
      return { ...s, rows: s.rows.map((r) => (r.id === m.row.id ? m.row : r)) };
    case "live":
      return { ...s, live: m.live };
    case "config":
      return { ...s, config: m.config };
    default:
      return s;
  }
}

/** Connect to one bot over a WebSocket (D22) and keep its thread in state. */
export function useBot(id: string) {
  const [state, dispatch] = useReducer(reducer, INIT);
  const socketRef = useRef<{ send: (d: string) => void } | null>(null);

  const socket = useAgent({
    agent: "bot-agent",
    name: id,
    onMessage: (event: MessageEvent) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object" || !("type" in msg)) return;
      dispatch({ type: "server", msg });
      if (msg.type === "history" || msg.type === "log_append") {
        socketRef.current?.send(JSON.stringify({ type: "mark_read" }));
      }
    },
  });
  socketRef.current = socket as any;

  const send = useCallback((m: ClientMessage) => socketRef.current?.send(JSON.stringify(m)), []);

  const sendText = useCallback(
    (text: string) => {
      const msgId = crypto.randomUUID();
      dispatch({ type: "pending", pending: { id: msgId, text, ts: Date.now() } });
      send({ type: "send", id: msgId, text });
    },
    [send],
  );

  const loadOlder = useCallback(() => {
    const first = state.rows[0];
    if (first) send({ type: "load_older", before: first.id });
  }, [send, state.rows]);

  return { ...state, sendText, loadOlder, send };
}
