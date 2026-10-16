// Types shared by the Worker and the browser.

export type BotKind = "bot" | "builder";

export interface ScheduleCfg {
  id: string;
  /** The plain words the owner used, for example "weekdays at 8am". */
  text: string;
  /** Five-field cron expression, in the owner time zone (D31). */
  cron: string;
  /** What the bot receives when the schedule fires. */
  prompt: string;
}

export interface TriggerCfg {
  id: string;
  /** Composio trigger slug, for example GMAIL_NEW_GMAIL_MESSAGE. */
  slug: string;
  config: Record<string, any>;
  /** What the bot receives with the event. */
  prompt: string;
}

export interface BotConfig {
  id: string;
  name: string;
  emoji: string;
  kind: BotKind;
  persona: string;
  model: string;
  toolkits: string[];
  schedules: ScheduleCfg[];
  triggers: TriggerCfg[];
}

export type RowRole = "user" | "assistant" | "tool" | "system";

export interface RowMeta {
  /** A "Connect" card (D24). */
  connect?: { toolkit?: string; url: string };
  /** A settings change card with an Undo button (D28). */
  change?: { summary: string; before: Partial<BotConfig>; undone?: boolean };
}

export interface LogRow {
  id: number;
  ts: number;
  role: RowRole;
  text: string;
  /** Origin label of a proactive input, for example "schedule: weekdays at 8am" (D18). */
  label?: string | null;
  meta?: RowMeta | null;
}

export interface LiveTool {
  id: string;
  name: string;
  done: boolean;
}

export interface Live {
  running: boolean;
  text: string;
  tools: LiveTool[];
}

export const EMPTY_LIVE: Live = { running: false, text: "", tools: [] };

export type ClientMessage =
  | { type: "send"; id: string; text: string }
  | { type: "load_older"; before: number }
  | { type: "mark_read" }
  | { type: "abort" }
  | { type: "undo"; rowId: number };

export type ServerMessage =
  | { type: "history"; rows: LogRow[]; hasMore: boolean; config: BotConfig; live: Live }
  | { type: "older"; rows: LogRow[]; hasMore: boolean }
  | { type: "log_append"; rows: LogRow[] }
  | { type: "row_update"; row: LogRow }
  | { type: "live"; live: Live }
  | { type: "config"; config: BotConfig };

export interface RunRow {
  id: string;
  bot_id: string;
  source: "chat" | "schedule" | "trigger" | "system";
  label: string | null;
  status: "running" | "done" | "error" | "aborted";
  tools: string;
  cost: number;
  started_at: number;
  finished_at: number | null;
}

export interface BotListItem {
  id: string;
  name: string;
  emoji: string;
  kind: BotKind;
  unread: number;
  last_text: string;
  last_at: number;
}
